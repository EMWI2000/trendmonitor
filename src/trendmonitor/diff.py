"""Compare two daily snapshots and emit events (see SPEC.md, "events")."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .config import DATA_DIR
from .storage import EVENT_COLUMNS, previous_snapshot_date, read_snapshot, replace_events_for_date

MARKDOWN_DROP = 0.05


def diff_snapshots(prev: pd.DataFrame, curr: pd.DataFrame, date: str) -> pd.DataFrame:
    """Pure function: events observed on `date` given yesterday's and today's rows."""
    if prev.empty or curr.empty:
        return pd.DataFrame(columns=EVENT_COLUMNS)
    events: list[dict] = []

    def ev(brand, product_id, variant_id, event_type, prev_value, new_value):
        events.append(
            {
                "event_date": date, "brand": brand, "product_id": int(product_id),
                "variant_id": None if variant_id is None else int(variant_id),
                "event_type": event_type, "prev_value": _s(prev_value), "new_value": _s(new_value),
            }
        )

    # Product-level: new / delisted, per brand so brand failures don't create spurious delistings
    for brand in sorted(set(prev["brand"]) | set(curr["brand"])):
        p = prev[prev["brand"] == brand]
        c = curr[curr["brand"] == brand]
        if p.empty or c.empty:
            continue  # brand missing on one side: no baseline, no events
        prev_products = set(p["product_id"])
        curr_products = set(c["product_id"])
        for pid in sorted(curr_products - prev_products):
            ev(brand, pid, None, "new_product", None, _s(c.loc[c["product_id"] == pid, "title"].iloc[0]))
        for pid in sorted(prev_products - curr_products):
            ev(brand, pid, None, "delisted", _s(p.loc[p["product_id"] == pid, "title"].iloc[0]), None)

        # Variant-level
        merged = p.merge(c, on="variant_id", suffixes=("_prev", "_curr"))
        for r in merged.itertuples(index=False):
            if r.available_prev and not r.available_curr:
                ev(brand, r.product_id_curr, r.variant_id, "sold_out", True, False)
            elif not r.available_prev and r.available_curr:
                ev(brand, r.product_id_curr, r.variant_id, "restock", False, True)
            prev_cmp, curr_cmp = _nan_to_none(r.compare_at_price_prev), _nan_to_none(r.compare_at_price_curr)
            prev_price, curr_price = _nan_to_none(r.price_prev), _nan_to_none(r.price_curr)
            if prev_price is None or curr_price is None:
                continue
            gained_compare = prev_cmp is None and curr_cmp is not None and curr_cmp > curr_price
            dropped = curr_price < prev_price * (1 - MARKDOWN_DROP) and prev_cmp == curr_cmp
            if gained_compare or dropped:
                ev(brand, r.product_id_curr, r.variant_id, "markdown",
                   f"{prev_price}|{prev_cmp}", f"{curr_price}|{curr_cmp}")
            elif curr_price != prev_price:
                ev(brand, r.product_id_curr, r.variant_id, "price_change", prev_price, curr_price)

        # Product fully sold out today, had availability yesterday
        avail_prev = p.groupby("product_id")["available"].any()
        avail_curr = c.groupby("product_id")["available"].any()
        both = avail_prev.index.intersection(avail_curr.index)
        for pid in both:
            if avail_prev[pid] and not avail_curr[pid]:
                ev(brand, pid, None, "product_sold_out", True, False)

    return pd.DataFrame(events, columns=EVENT_COLUMNS)


def run_diff(date: str, data_dir: Path = DATA_DIR) -> pd.DataFrame:
    prev_date = previous_snapshot_date(date, data_dir)
    curr = read_snapshot(date, data_dir)
    prev = read_snapshot(prev_date, data_dir) if prev_date else pd.DataFrame(columns=curr.columns)
    events = diff_snapshots(prev, curr, date)
    replace_events_for_date(events, date, data_dir)
    return events


def _s(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return str(value)


def _nan_to_none(value):
    try:
        return None if value is None or pd.isna(value) else float(value)
    except (TypeError, ValueError):
        return None
