"""Render the weekly Danish markdown report from WeeklyMetrics."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pandas as pd

from .config import REPORTS_DIR, load_sources, load_taxonomy
from .metrics import LOW_N, WeeklyMetrics, compute
from .storage import latest_runs, read_runs

ATTR_DA = {
    "category": "kategori", "silhouette": "silhuet", "print": "print", "colour_family": "farvefamilie",
    "material": "materiale", "sleeve": "ærme", "length": "længde", "occasion": "anledning",
}


def pct(x, digits=0) -> str:
    if x is None or pd.isna(x):
        return "–"
    return f"{100 * float(x):.{digits}f} %"


def num(x) -> str:
    if x is None or pd.isna(x):
        return "–"
    return f"{float(x):.0f}" if float(x).is_integer() else f"{float(x):.1f}"


def render(m: WeeklyMetrics, brand_names: dict[str, str], taxonomy_version: str, runs: pd.DataFrame) -> str:
    runs = latest_runs(runs)  # append-only table: a re-run on the same date must not count twice
    rd = dt.date.fromisoformat(m.report_date)
    iso_year, iso_week, _ = rd.isocalendar()
    lines: list[str] = []
    lines.append(f"# Trendmonitor uge {iso_week}, {iso_year}")
    lines.append("")
    lines.append(f"Periode {m.week_start} til {m.report_date}. {len(m.snapshot_dates)} daglige snapshots i alt, "
                 f"{m.weeks_of_history} ugers eventhistorik. Taksonomi v{taxonomy_version}.")
    covered = m.brands["brand"].map(lambda k: brand_names.get(k, k)).tolist()
    lines.append(f"Brands i data: {', '.join(covered)}.")
    failed = runs[(runs["run_date"] == m.report_date) & (runs["status"] != "ok")] if len(runs) else runs
    if len(failed):
        lines.append("Fejlede i dag: " + ", ".join(f"{brand_names.get(r.brand, r.brand)} ({r.status})" for r in failed.itertuples()) + ".")
    lines.append("")
    lines.append("Udsolgt er indkøbsdybde gange efterspørgsel, ikke salg. Alle attributtal er indekseret mod "
                 "attributtens andel af nyt sortiment i de seneste 8 uger; n under "
                 f"{LOW_N} er markeret som lavt n.")
    lines.append("")

    lines.append("## Ugens bevægelser")
    lines.append("")
    if not m.movements:
        lines.append("Ingen bevægelser over tærsklerne endnu. Det er forventeligt i de første uger, hvor der er få "
                     "udsolgt-events at indeksere på.")
    for mv in m.movements:
        lines.append(_movement_sentence(mv, brand_names))
    lines.append("")

    lines.append("## Brands")
    lines.append("")
    lines.append("| Brand | Live styles | Nye | Udsolgte varianter (netto) | Helt udsolgte | Genopfyldt | Nedsat andel | Median rabat | Sell-out 4 uger (n) | Median dage til første udsolgt |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in m.brands.itertuples():
        name = brand_names.get(r.brand, r.brand) + (" (self)" if r.role == "self" else "")
        so4 = f"{pct(r.sell_out_rate_4w)} ({int(r.cohort_4w_n) if pd.notna(r.cohort_4w_n) else 0})"
        lines.append(f"| {name} | {num(r.live_products)} | {num(r.new_products)} | {num(r.sold_out_variants)} | "
                     f"{num(r.products_fully_sold_out)} | {num(r.restocks)} | {pct(r.markdown_share)} | "
                     f"{pct(r.median_discount)} | {so4} | {num(r.median_days_to_first_sold_out)} |")
    lines.append("")

    lines.append("## Attributter: udsolgt-andel mod andel af nyt sortiment (peers og benchmark, 8 uger)")
    lines.append("")
    attrs = m.attributes.dropna(subset=["demand_index"])
    attrs = attrs[attrs["sold_out_n"] > 0].sort_values("demand_index", ascending=False)
    if attrs.empty:
        lines.append("Ingen taggede udsolgt-events endnu.")
    else:
        lines.append("| Attribut | Værdi | Andel af nyt | Andel af udsolgt | Indeks | n udsolgt | |")
        lines.append("|---|---|---:|---:|---:|---:|---|")
        for r in attrs.head(15).itertuples():
            flag = "lavt n" if r.low_n else ""
            lines.append(f"| {ATTR_DA.get(r.attribute, r.attribute)} | {r.value} | {pct(r.share_new)} | "
                         f"{pct(r.share_sold_out)} | {r.demand_index:.2f} | {int(r.sold_out_n)} | {flag} |")
        low = attrs.tail(5).sort_values("demand_index")
        if len(attrs) > 15:
            lines.append("")
            lines.append("Laveste indeks: " + ", ".join(
                f"{ATTR_DA.get(r.attribute, r.attribute)}={r.value} ({r.demand_index:.2f}, n={int(r.sold_out_n)})"
                for r in low.itertuples()) + ".")
    lines.append("")

    lines.append("## Størrelser først udsolgt (denne uge)")
    lines.append("")
    if m.sizes.empty:
        lines.append("Ingen udsolgt-events med genkendt størrelse i ugen.")
    else:
        for brand, g in m.sizes.groupby("brand"):
            top = ", ".join(f"{r.size} ({int(r.n)})" for r in g.head(4).itertuples())
            lines.append(f"{brand_names.get(brand, brand)}: {top}")
    lines.append("")

    lines.append("## Afvigelser")
    lines.append("")
    if m.calibration:
        lines.append(f"Kalibrering: {m.weeks_of_history} af 8 ugers historik. Afvigelser rapporteres først, når "
                     "en 8-ugers baseline (median og MAD) kan beregnes pr. attributværdi.")
    elif m.alerts.empty:
        lines.append("Ingen attributværdi over baseline-tærsklen (8-ugers median + 2·MAD, mindst 5 events).")
    else:
        for r in m.alerts.sort_values("this_week", ascending=False).itertuples():
            lines.append(f"{ATTR_DA.get(r.attribute, r.attribute)}={r.value}: {int(r.this_week)} netto udsolgte i ugen "
                         f"mod median {r.baseline_median:.0f} (MAD {r.baseline_mad:.1f}).")
    lines.append("")

    lines.append("## Dækning og datakvalitet")
    lines.append("")
    if len(runs):
        last = runs[runs["run_date"] == runs["run_date"].max()]
        ok = last[last["status"] == "ok"]
        lines.append(f"Seneste kørsel {runs['run_date'].max()}: {len(ok)} af {len(last)} brands ok, "
                     f"{int(ok['products'].sum())} produkter, {int(ok['variants'].sum())} varianter.")
    lines.append("Delistede produkter tælles ikke som udsolgte (tvetydige). Tilgængelighed kan flimre mellem "
                 "snapshots; udsolgt-events med genopfyldning inden 7 dage er trukket ud (netto).")
    lines.append("")
    return "\n".join(lines)


def _movement_sentence(mv: dict, names: dict[str, str]) -> str:
    kind = mv["kind"]
    if kind == "attribute_over_index":
        low = " (lavt n)" if mv["low_n"] else ""
        return (f"{ATTR_DA.get(mv['attribute'], mv['attribute']).capitalize()} {mv['value']} udgør {pct(mv['share_new'])} af "
                f"nyt sortiment, men {pct(mv['share_sold_out'])} af netto udsolgte varianter, indeks {mv['index']}, "
                f"n={mv['n']}{low}. Kilde: {mv['source']}.")
    if kind == "attribute_under_index":
        return (f"{ATTR_DA.get(mv['attribute'], mv['attribute']).capitalize()} {mv['value']} ligger lavt: "
                f"{pct(mv['share_new'])} af nyt sortiment, {pct(mv['share_sold_out'])} af udsolgte, indeks {mv['index']}, "
                f"n={mv['n']}. Kilde: {mv['source']}.")
    if kind == "brand_sell_out_4w":
        return (f"{names.get(mv['brand'], mv['brand'])} har højeste 4-ugers sell-out: {pct(mv['rate'])} af styles lanceret "
                f"for 3–5 uger siden har mindst én udsolgt størrelse (n={mv['n']}). Kilde: {mv['source']}.")
    if kind == "brand_markdown":
        disc = f", median rabat {pct(mv['discount'])}" if mv.get("discount") is not None and not pd.isna(mv["discount"]) else ""
        return (f"{names.get(mv['brand'], mv['brand'])} har {pct(mv['share'])} af varianterne nedsat{disc}. "
                f"Kilde: {mv['source']}.")
    if kind == "alert":
        return (f"Afvigelse: {ATTR_DA.get(mv['attribute'], mv['attribute'])} {mv['value']} med {mv['this_week']} netto "
                f"udsolgte i ugen mod median {mv['median']:.0f}. Kilde: {mv['source']}.")
    return str(mv)


def write_report(report_date: str | None = None, data_dir: Path | None = None,
                 reports_dir: Path = REPORTS_DIR) -> Path:
    from .config import DATA_DIR

    data_dir = data_dir or DATA_DIR
    m = compute(report_date, data_dir)
    sources = load_sources()
    names = {b.key: b.name for b in sources.brands}
    text = render(m, names, load_taxonomy().version, read_runs(data_dir))
    rd = dt.date.fromisoformat(m.report_date)
    y, w, _ = rd.isocalendar()
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / f"{y}-W{w:02d}.md"
    path.write_text(text, encoding="utf-8")
    return path
