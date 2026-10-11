"""Parquet persistence for snapshots, events, tags and runs."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import DATA_DIR

SNAPSHOT_COLUMNS = [
    "snapshot_date", "brand", "role", "product_id", "handle", "title", "product_type", "vendor", "tags",
    "body_text", "published_at", "created_at", "updated_at", "image_url", "variant_id", "sku",
    "option1", "option2", "option3", "size", "price", "compare_at_price", "available", "currency",
    "price_dkk", "compare_at_dkk", "season_tag",
]
EVENT_COLUMNS = ["event_date", "brand", "product_id", "variant_id", "event_type", "prev_value", "new_value"]
TAG_COLUMNS = [
    "brand", "product_id", "tagged_at", "tagger", "category", "silhouette", "print", "colour_family",
    "material", "sleeve", "length", "occasion", "confidence", "notes",
]
RUN_COLUMNS = ["run_date", "brand", "status", "products", "variants", "pages", "seconds", "error"]
# Columns metrics.py joins and filters on. Coerced on every read so that an empty table (no file yet, or
# the zero-row events.parquet the first diff writes) registers in DuckDB as VARCHAR/BIGINT instead of the
# INTEGER DuckDB infers for empty object columns, which made the join against snapshots fail.
EVENT_KEY_DTYPES = {"event_date": "string", "brand": "string", "product_id": "int64", "event_type": "string"}
TAG_KEY_DTYPES = {"brand": "string", "product_id": "int64"}


def snapshots_dir(data_dir: Path = DATA_DIR) -> Path:
    d = data_dir / "snapshots"
    d.mkdir(parents=True, exist_ok=True)
    return d


def snapshot_path(date: str, data_dir: Path = DATA_DIR) -> Path:
    return snapshots_dir(data_dir) / f"{date}.parquet"


def list_snapshot_dates(data_dir: Path = DATA_DIR) -> list[str]:
    return sorted(p.stem for p in snapshots_dir(data_dir).glob("????-??-??.parquet"))


def write_snapshot(df: pd.DataFrame, date: str, data_dir: Path = DATA_DIR) -> Path:
    df = _coerce_snapshot(df)
    path = snapshot_path(date, data_dir)
    df.to_parquet(path, index=False)
    return path


def read_snapshot(date: str, data_dir: Path = DATA_DIR) -> pd.DataFrame:
    path = snapshot_path(date, data_dir)
    if not path.exists():
        return pd.DataFrame(columns=SNAPSHOT_COLUMNS)
    return _coerce_snapshot(pd.read_parquet(path))


def merge_snapshot_rows(existing: pd.DataFrame, new: pd.DataFrame, brand_keys: set[str]) -> pd.DataFrame:
    """Replace the rows of `brand_keys` (and of any brand present in `new`) in `existing` with `new`.

    Every other brand's rows are kept untouched, so a partial snapshot (`snapshot --brand`) never wipes
    the stores it did not fetch. Pure: reads nothing, writes nothing.
    """
    existing, new = _coerce_snapshot(existing), _coerce_snapshot(new)
    replaced = set(brand_keys) | set(new["brand"].dropna())
    kept = existing[~existing["brand"].isin(replaced)]
    parts = [p for p in (kept, new) if len(p)]
    return pd.concat(parts, ignore_index=True) if parts else kept


def previous_snapshot_date(date: str, data_dir: Path = DATA_DIR) -> str | None:
    earlier = [d for d in list_snapshot_dates(data_dir) if d < date]
    return earlier[-1] if earlier else None


def _coerce_snapshot(df: pd.DataFrame) -> pd.DataFrame:
    for col in SNAPSHOT_COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[SNAPSHOT_COLUMNS].copy()
    df["product_id"] = df["product_id"].astype("int64")
    df["variant_id"] = df["variant_id"].astype("int64")
    df["price"] = pd.to_numeric(df["price"], errors="coerce").astype("float64")
    df["compare_at_price"] = pd.to_numeric(df["compare_at_price"], errors="coerce").astype("float64")
    df["price_dkk"] = pd.to_numeric(df["price_dkk"], errors="coerce").astype("float64")
    df["compare_at_dkk"] = pd.to_numeric(df["compare_at_dkk"], errors="coerce").astype("float64")
    df["available"] = df["available"].fillna(False).astype(bool)
    for col in SNAPSHOT_COLUMNS:
        if col not in ("product_id", "variant_id", "price", "compare_at_price", "available", "price_dkk", "compare_at_dkk"):
            df[col] = df[col].astype("string")
    return df


def _append_table(df: pd.DataFrame, name: str, columns: list[str], data_dir: Path) -> Path:
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / f"{name}.parquet"
    df = df.reindex(columns=columns)
    if path.exists():
        existing = pd.read_parquet(path)
        df = pd.concat([existing.reindex(columns=columns), df], ignore_index=True)
    df.to_parquet(path, index=False)
    return path


def _coerce_keys(df: pd.DataFrame, dtypes: dict[str, str]) -> pd.DataFrame:
    for col, dtype in dtypes.items():
        df[col] = df[col].astype(dtype)
    return df


def read_table(name: str, columns: list[str], data_dir: Path = DATA_DIR) -> pd.DataFrame:
    path = data_dir / f"{name}.parquet"
    if not path.exists():
        return pd.DataFrame(columns=columns)
    return pd.read_parquet(path).reindex(columns=columns)


def replace_events_for_date(events: pd.DataFrame, date: str, data_dir: Path = DATA_DIR) -> Path:
    """Idempotent: drop any existing events for `date`, then append the new ones."""
    existing = read_table("events", EVENT_COLUMNS, data_dir)
    existing = existing[existing["event_date"] != date]
    merged = pd.concat([existing, events.reindex(columns=EVENT_COLUMNS)], ignore_index=True)
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / "events.parquet"
    merged.to_parquet(path, index=False)
    return path


def read_events(data_dir: Path = DATA_DIR) -> pd.DataFrame:
    return _coerce_keys(read_table("events", EVENT_COLUMNS, data_dir), EVENT_KEY_DTYPES)


def append_tags(tags: pd.DataFrame, data_dir: Path = DATA_DIR) -> Path:
    existing = read_tags(data_dir)
    new = tags[~tags["product_id"].isin(existing["product_id"])]
    return _append_table(new, "tags", TAG_COLUMNS, data_dir)


def read_tags(data_dir: Path = DATA_DIR) -> pd.DataFrame:
    return _coerce_keys(read_table("tags", TAG_COLUMNS, data_dir), TAG_KEY_DTYPES)


def append_runs(runs: pd.DataFrame, data_dir: Path = DATA_DIR) -> Path:
    return _append_table(runs, "runs", RUN_COLUMNS, data_dir)


def read_runs(data_dir: Path = DATA_DIR) -> pd.DataFrame:
    return read_table("runs", RUN_COLUMNS, data_dir)


def latest_runs(runs: pd.DataFrame) -> pd.DataFrame:
    """Reduce the append-only runs table to the last row per (run_date, brand).

    Re-running `snapshot` or `run-daily` on a date appends a second row per brand, so the table can
    hold a failed attempt followed by a successful one for the same brand and date. There is no
    timestamp column; row order is append order, so the last row is that brand's current state.
    """
    if runs.empty:
        return runs
    return runs.drop_duplicates(subset=["run_date", "brand"], keep="last").reset_index(drop=True)
