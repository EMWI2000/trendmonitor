"""Snapshot → diff → tag → metrics → report on the two fixture days, in a temp data dir."""

import pandas as pd
from conftest import make_fetcher

from trendmonitor.config import ATTRIBUTES
from trendmonitor.diff import diff_snapshots, run_diff
from trendmonitor.metrics import compute
from trendmonitor.report import render
from trendmonitor.shopify import FetchResult, normalise
from trendmonitor.snapshot import run_snapshot
from trendmonitor.storage import RUN_COLUMNS, latest_runs, read_events, read_runs, read_snapshot, read_tags
from trendmonitor.tagger import run_tagging


def _snap(products, brand, date):
    return pd.DataFrame(normalise(products, brand, date, "DKK"))


def test_diff_events(day1, day2, brand):
    prev = _snap(day1, brand, "2026-09-20")
    curr = _snap(day2, brand, "2026-09-21")
    events = diff_snapshots(prev, curr, "2026-09-21")
    by_type = events.groupby("event_type")["variant_id"].apply(list).to_dict()
    assert pd.isna(by_type["new_product"]).all() and set(events[events.event_type == "new_product"].product_id) == {104}
    assert set(events[events.event_type == "delisted"].product_id) == {103}
    assert sorted(by_type["sold_out"]) == [1012, 1013]
    assert by_type["restock"] == [1022]
    assert sorted(by_type["markdown"]) == [1021, 1022]
    assert "product_sold_out" not in by_type  # Nora still has XS available
    assert "price_change" not in by_type


def test_first_snapshot_has_no_events(day1, brand):
    curr = _snap(day1, brand, "2026-09-20")
    assert diff_snapshots(pd.DataFrame(columns=curr.columns), curr, "2026-09-20").empty


def test_end_to_end_on_fixtures(tmp_path, sources, brand, day1, day2, taxonomy):
    data_dir = tmp_path / "data"
    run_snapshot(sources, date="2026-09-20", data_dir=data_dir, fetcher=make_fetcher(day1))
    run_diff("2026-09-20", data_dir)
    tags1 = run_tagging("2026-09-20", data_dir, use_claude=False)
    run_snapshot(sources, date="2026-09-21", data_dir=data_dir, fetcher=make_fetcher(day2))
    events = run_diff("2026-09-21", data_dir)
    tags2 = run_tagging("2026-09-21", data_dir, use_claude=False)

    assert len(read_snapshot("2026-09-20", data_dir)) == 6
    assert len(read_snapshot("2026-09-21", data_dir)) == 6
    assert len(read_runs(data_dir)) == 2 and (read_runs(data_dir)["status"] == "ok").all()
    assert len(tags1) == 3 and len(tags2) == 1  # only the new product is tagged on day 2
    all_tags = read_tags(data_dir)
    assert set(all_tags["product_id"]) == {101, 102, 103, 104}
    for attr in ATTRIBUTES:
        assert all(taxonomy.is_valid(attr, v) for v in all_tags[attr].tolist())
    nora = all_tags[all_tags.product_id == 101].iloc[0]
    assert (nora.category, nora.print, nora.colour_family, nora.material, nora.sleeve, nora.length) == (
        "dress", "floral", "yellow", "viscose", "puff", "midi")
    saga = all_tags[all_tags.product_id == 104].iloc[0]
    assert (saga.category, saga.print, saga.colour_family, saga.silhouette, saga.length) == (
        "skirt", "dot", "red", "pleated", "mini")

    assert set(events["event_type"]) == {"new_product", "delisted", "sold_out", "restock", "markdown"}
    assert len(read_events(data_dir)) == len(events)

    # Re-running the diff for the same date is idempotent
    run_diff("2026-09-21", data_dir)
    assert len(read_events(data_dir)) == len(events)

    m = compute("2026-09-21", data_dir)
    row = m.brands.iloc[0]
    assert row.brand == "testbrand" and row.live_products == 3
    assert row.new_products == 1 and row.sold_out_variants == 2 and row.restocks == 1 and row.delisted == 1
    assert abs(row.markdown_share - 2 / 6) < 1e-9
    assert m.calibration and m.weeks_of_history == 1
    text = render(m, {"testbrand": "Testbrand"}, taxonomy.version, read_runs(data_dir))
    assert "Kalibrering" in text and "| Testbrand |" in text


def test_tagging_is_idempotent(tmp_path, sources, day1):
    data_dir = tmp_path / "data"
    run_snapshot(sources, date="2026-09-20", data_dir=data_dir, fetcher=make_fetcher(day1))
    assert len(run_tagging("2026-09-20", data_dir, use_claude=False)) == 3
    assert len(run_tagging("2026-09-20", data_dir, use_claude=False)) == 0
    assert len(read_tags(data_dir)) == 3


def test_report_uses_latest_run_per_brand_and_date(tmp_path, sources, brand, day1, day2, taxonomy):
    """runs.parquet is append-only: re-running a date appends a second row per brand. The report must
    read the last row, so a brand that failed and then succeeded is neither "failed" nor counted twice."""
    data_dir = tmp_path / "data"

    def failing(b):
        return FetchResult(b.key, "http_error", [], None, 0, 0.0, "HTTP 430")

    run_snapshot(sources, date="2026-09-20", data_dir=data_dir, fetcher=make_fetcher(day1))
    run_diff("2026-09-20", data_dir)
    run_tagging("2026-09-20", data_dir, use_claude=False)
    # Day 2: a failed attempt (e.g. CI blocked by the shop), then a successful re-run of the same date.
    run_snapshot(sources, date="2026-09-21", data_dir=data_dir, fetcher=failing)
    run_snapshot(sources, date="2026-09-21", data_dir=data_dir, fetcher=make_fetcher(day2))
    run_diff("2026-09-21", data_dir)
    run_tagging("2026-09-21", data_dir, use_claude=False)
    runs = read_runs(data_dir)
    assert runs["status"].tolist() == ["ok", "http_error", "ok"]

    latest = latest_runs(runs)
    assert len(latest) == 2 and latest["status"].tolist() == ["ok", "ok"]

    m = compute("2026-09-21", data_dir)
    text = render(m, {"testbrand": "Testbrand"}, taxonomy.version, runs)
    assert "Fejlede i dag" not in text
    assert "Seneste kørsel 2026-09-21: 1 af 1 brands ok, 3 produkter, 6 varianter." in text


def test_latest_runs_keeps_last_row_per_brand_and_date():
    runs = pd.DataFrame(
        [
            ("2026-10-11", "a", "http_error", 0, 0, 0, 0.0, "HTTP 430"),
            ("2026-10-11", "b", "ok", 5, 10, 1, 1.0, None),
            ("2026-10-11", "a", "ok", 7, 14, 1, 1.0, None),
            ("2026-10-11", "b", "http_error", 0, 0, 0, 0.0, "HTTP 500"),
            ("2026-10-10", "a", "ok", 6, 12, 1, 1.0, None),
        ],
        columns=RUN_COLUMNS,
    )
    latest = latest_runs(runs)
    assert len(latest) == 3
    today = latest[latest.run_date == "2026-10-11"].set_index("brand")
    assert today.loc["a"].status == "ok" and today.loc["a"].products == 7
    assert today.loc["b"].status == "http_error"  # ok, then a later failure: the later row wins
    assert latest_runs(pd.DataFrame(columns=RUN_COLUMNS)).empty
