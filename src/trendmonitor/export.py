"""Export the computed tables as JSON for the dashboard (`web/`).

Aggregates only, never product rows: no titles, handles, texts, image URLs or variant ids leave the
parquet files. Every number here is produced by metrics.py and profile.py, so the dashboard cannot
drift from the weekly report on what "sold out" means (buy depth × demand, never sales), on the
low-n threshold or on the calibration period.
"""

from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path
from typing import Any

import pandas as pd

from .config import ATTRIBUTES, DATA_DIR, load_sources, load_taxonomy
from .insights import RULES, compute_insights
from .metrics import (
    BASELINE_WEEKS,
    LAUNCH_WINDOW_DAYS,
    LOW_N,
    MIN_LAUNCHED,
    SERIES_WEEKS,
    WeeklyMetrics,
    compute,
    compute_state,
)
from .profile import BrandProfile, Positioning, positioning
from .storage import latest_runs, read_runs, read_snapshot, read_tags

EXPORT_FILES = (
    "meta.json", "brands.json", "attributes.json", "series.json", "alerts.json", "sizes.json",
    "movements.json", "sold_out_state.json", "size_depletion.json", "launch_calendar.json",
    "positioning.json", "runs.json", "taxonomy.json", "insights.json",
)
RUNS_DAYS = 14

# Phrases the dashboard must show next to the numbers (Danish, same wording as the weekly report).
NOTES = {
    "not_sales": "Udsolgt er indkøbsdybde gange efterspørgsel, ikke salg.",
    "index": "Alle attributtal er indekseret mod attributtens andel af nyt sortiment i de seneste 8 uger.",
    "low_n": f"n under {LOW_N} er markeret som lavt n.",
    "calibration": f"Afvigelser rapporteres først efter {BASELINE_WEEKS} ugers historik (kalibrering).",
    "state": "Udsolgt-tilstand er et øjebliksbillede af varianter uden lager i dag, ikke en bevægelse.",
    "self_excluded": "Referencebrandet indgår aldrig i udsolgt-indekset.",
}


def _clean(obj: Any) -> Any:
    """Make an object JSON-safe: NaN/inf → null, numpy scalars → Python, pandas objects → lists/dicts."""
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_clean(v) for v in obj]
    if isinstance(obj, pd.DataFrame):
        return _records(obj)
    if isinstance(obj, pd.Series):
        return _clean(obj.to_dict())
    if isinstance(obj, float):
        return None if math.isnan(obj) or math.isinf(obj) else obj
    if hasattr(obj, "item") and not isinstance(obj, (str, bytes)):  # numpy scalar
        return _clean(obj.item())
    if isinstance(obj, (dt.date, dt.datetime, pd.Timestamp)):
        return obj.isoformat()
    if obj is pd.NaT or obj is pd.NA:
        return None
    return obj


def _records(df: pd.DataFrame | None) -> list[dict]:
    if df is None or df.empty:
        return []
    return [_clean(r) for r in df.to_dict(orient="records")]


def _profile_json(p: BrandProfile, distance_row: dict[str, Any]) -> dict[str, Any]:
    return {
        "brand": p.brand,
        "role": p.role,
        "products": p.products,
        "variants": p.variants,
        "tagged_share": p.tagged_share,
        "price_p25": p.price_p25,
        "price_p50": p.price_p50,
        "price_p75": p.price_p75,
        "price_bands": p.price_bands.to_dict() if p.price_bands is not None else {},
        "dress_p50": p.dress_p50,
        "currency": p.currency,
        "size_system": p.size_system,
        "size_range": p.size_range,
        "newness_share": p.newness_share,
        "markdown_share": p.markdown_share,
        "print_share": p.print_share,
        "colour_share": p.colour_share,
        "occasion_words": p.occasion_words,
        "voice_words": p.voice_words,
        "season_tags": p.season_tags,
        "mix": {attr: s.to_dict() for attr, s in p.mix.items()},
        "style_distance": distance_row.get("style_distance"),
        "overlap_with_self": distance_row.get("overlap_with_self"),
        "price_index": distance_row.get("price_index"),
        "dress_price_index": distance_row.get("dress_price_index"),
        "distances": {attr: distance_row.get(f"d_{attr}") for attr in ATTRIBUTES},
    }


def _positioning_json(pos: Positioning) -> dict[str, Any]:
    rows = {r["brand"]: r for r in pos.distances.to_dict(orient="records")}
    return {
        "report_date": pos.report_date,
        "self_brand": pos.self_brand,
        "brands": [_profile_json(p, rows.get(key, {})) for key, p in pos.profiles.items()],
    }


def _meta(m: WeeklyMetrics, latest_date: str, self_brand: str | None, generated_at: str) -> dict[str, Any]:
    sources = load_sources()
    taxonomy = load_taxonomy()
    return {
        "report_date": m.report_date,
        "week_start": m.week_start,
        "latest_snapshot_date": latest_date,
        "snapshot_dates": m.snapshot_dates,
        "weeks_of_history": m.weeks_of_history,
        "calibration": m.calibration,
        "taxonomy_version": taxonomy.version,
        "self_brand": self_brand,
        "thresholds": {
            "low_n": LOW_N,
            "min_launched": MIN_LAUNCHED,
            "baseline_weeks": BASELINE_WEEKS,
            "series_weeks": SERIES_WEEKS,
            "launch_window_days": LAUNCH_WINDOW_DAYS,
        },
        "brands": [
            {"key": b.key, "name": b.name, "role": b.role, "enabled": b.enabled, "currency": b.currency, "url": b.url}
            for b in sources.brands
        ],
        "notes": NOTES,
        "generated_at": generated_at,
    }


def _taxonomy_json() -> dict[str, Any]:
    t = load_taxonomy()
    return {
        "version": t.version,
        "attributes": {
            attr: {"description": t.descriptions.get(attr, ""), "values": list(values.keys())}
            for attr, values in t.attributes.items()
        },
    }


def _recent_runs(data_dir: Path, report_date: str) -> pd.DataFrame:
    runs = latest_runs(read_runs(data_dir))
    if runs.empty:
        return runs
    cutoff = (dt.date.fromisoformat(report_date) - dt.timedelta(days=RUNS_DAYS)).isoformat()
    runs = runs[(runs["run_date"] >= cutoff) & (runs["run_date"] <= report_date)]
    return runs.sort_values(["run_date", "brand"]).reset_index(drop=True)


def export_all(report_date: str | None = None, data_dir: Path = DATA_DIR, out_dir: Path | None = None,
               now: dt.datetime | None = None) -> Path:
    """Write every dashboard table under `out_dir` (default `<data_dir>/export`) and return that directory."""
    out_dir = out_dir or data_dir / "export"
    m = compute(report_date, data_dir)
    state = compute_state(m.report_date, data_dir)
    snapshot = read_snapshot(state.latest_date, data_dir)
    tags = read_tags(data_dir)
    pos = positioning(snapshot, tags, m.report_date)
    names = {b.key: b.name for b in load_sources().brands}
    insights = compute_insights(state.sold_out_state, state.size_depletion, m.brands, pos.distances,
                                pos.self_brand, names)
    generated_at = (now or dt.datetime.now(dt.UTC)).replace(microsecond=0).isoformat()

    files: dict[str, Any] = {
        "meta.json": _meta(m, state.latest_date, pos.self_brand, generated_at),
        "brands.json": _records(m.brands),
        "attributes.json": _records(m.attributes),
        "series.json": _records(m.series),
        "alerts.json": _records(m.alerts),
        "sizes.json": _records(m.sizes),
        "movements.json": m.movements,
        "sold_out_state.json": _records(state.sold_out_state),
        "size_depletion.json": _records(state.size_depletion),
        "launch_calendar.json": _records(state.launch_calendar),
        "positioning.json": _positioning_json(pos),
        "runs.json": _records(_recent_runs(data_dir, m.report_date)),
        "taxonomy.json": _taxonomy_json(),
        "insights.json": {
            "report_date": m.report_date,
            "latest_snapshot_date": state.latest_date,
            "self_brand": pos.self_brand,
            "self_name": names.get(pos.self_brand, pos.self_brand) if pos.self_brand else None,
            "calibration": m.calibration,
            "weeks_of_history": m.weeks_of_history,
            "note": ("Hypoteser til test, ikke konklusioner: faste regler over tilstanden i seneste snapshot holdt "
                     "op mod referencebrandets eget sortiment. Ingen salgstal."),
            "rules": RULES,
            "items": insights,
        },
    }
    assert set(files) == set(EXPORT_FILES)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, payload in files.items():
        (out_dir / name).write_text(
            json.dumps(_clean(payload), ensure_ascii=False, indent=1, allow_nan=False) + "\n", encoding="utf-8"
        )
    return out_dir
