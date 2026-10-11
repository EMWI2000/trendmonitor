"""Daily snapshot: fetch every enabled brand, normalise, write parquet + runs rows."""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Callable
from pathlib import Path

import pandas as pd

from .config import DATA_DIR, Brand, Sources
from .shopify import FetchResult, ShopifyClient, normalise
from .storage import SNAPSHOT_COLUMNS, append_runs, write_snapshot

log = logging.getLogger(__name__)


def today_utc() -> str:
    return dt.datetime.now(dt.UTC).date().isoformat()


def run_snapshot(
    sources: Sources,
    date: str | None = None,
    data_dir: Path = DATA_DIR,
    fetcher: Callable[[Brand], FetchResult] | None = None,
    brands: list[Brand] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Fetch all enabled brands (or `brands`), write data/snapshots/{date}.parquet, return (rows, runs)."""
    date = date or today_utc()
    fetcher = fetcher or ShopifyClient(sources).fetch_brand
    brands = brands if brands is not None else sources.enabled()

    all_rows: list[dict] = []
    runs: list[dict] = []
    for brand in brands:
        log.info("fetching %s (%s)", brand.key, brand.url)
        result = fetcher(brand)
        rows = normalise(result.products, brand, date, result.currency) if result.status == "ok" else []
        all_rows.extend(rows)
        runs.append(
            {
                "run_date": date,
                "brand": brand.key,
                "status": result.status,
                "products": len(result.products),
                "variants": len(rows),
                "pages": result.pages,
                "seconds": round(result.seconds, 1),
                "error": result.error,
            }
        )
        log.info("%s: %s, %d products, %d variants", brand.key, result.status, len(result.products), len(rows))

    df = pd.DataFrame(all_rows, columns=SNAPSHOT_COLUMNS)
    runs_df = pd.DataFrame(runs)
    if len(df):
        write_snapshot(df, date, data_dir)
    append_runs(runs_df, data_dir)
    return df, runs_df


def probe(sources: Sources, fetcher: Callable[[Brand], FetchResult] | None = None) -> pd.DataFrame:
    """Cheap check of every brand (first page only). Does not write snapshots."""
    small = Sources(
        brands=sources.brands, user_agent=sources.user_agent,
        request_delay_seconds=sources.request_delay_seconds, page_size=5, max_pages=1,
    )
    fetcher = fetcher or ShopifyClient(small).fetch_brand
    rows = []
    for brand in sources.brands:
        r = fetcher(brand)
        rows.append({"brand": brand.key, "url": brand.url, "status": r.status, "sample_products": len(r.products),
                     "currency": r.currency, "error": r.error})
    return pd.DataFrame(rows)
