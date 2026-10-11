"""`trendmonitor export`: dashboard JSON built from the same metrics as the weekly report."""

import datetime as dt
import json
import re

from trendmonitor.config import ATTRIBUTES, load_taxonomy
from trendmonitor.demo import run_demo
from trendmonitor.export import EXPORT_FILES, export_all
from trendmonitor.metrics import LOW_N, compute_state
from trendmonitor.storage import read_snapshot

PRODUCT_LEVEL_FIELDS = ("image_url", "body_text", "handle", "variant_id", "sku", "product_id")


def test_compute_state_on_demo(tmp_path):
    data_dir = tmp_path / "data"
    dates = run_demo(data_dir, days=10, seed=5)
    s = compute_state(dates[-1], data_dir)
    assert s.latest_date == dates[-1]

    st = s.sold_out_state
    assert set(st["scope"]) == {"all", "new"} and set(st["attribute"]) <= set(ATTRIBUTES)
    assert (st["unavailable_n"] <= st["live_n"]).all()
    for _, g in st.groupby(["scope", "attribute"]):
        assert abs(g["share_live"].sum() - 1) < 1e-6
    # the state index exists where the denominator is meaningful, and low_n follows the shared threshold
    indexed = st.dropna(subset=["state_index"])
    assert len(indexed) and (indexed["state_index"] >= 0).all()
    assert (st["low_n"] == (st["unavailable_n"] < LOW_N)).all()
    # the self brand never enters the index: its tagged variants are not counted
    snapshot = read_snapshot(dates[-1], data_dir)
    peers = snapshot[snapshot["role"] != "self"]
    assert st[(st.scope == "all") & (st.attribute == "category")]["live_n"].sum() <= len(peers)

    sd = s.size_depletion
    assert set(sd["brand"]) == set(snapshot["brand"]) and sd["unavailable_share"].between(0, 1).all()
    assert (sd["unavailable_variants"] <= sd["live_variants"]).all()

    lc = s.launch_calendar
    assert len(lc) and (lc["products"] > 0).all()
    assert lc["week_start"].map(lambda w: bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", w))).all()
    assert (lc["week_start"] <= dates[-1]).all()


def test_export_writes_valid_json_without_product_rows(tmp_path):
    data_dir = tmp_path / "data"
    dates = run_demo(data_dir, days=21, seed=3)
    out = export_all(dates[-1], data_dir, now=dt.datetime(2026, 10, 11, 6, 0, tzinfo=dt.UTC))
    assert out == data_dir / "export"

    payloads = {}
    for name in EXPORT_FILES:
        text = (out / name).read_text(encoding="utf-8")
        assert "NaN" not in text and "Infinity" not in text, name
        payloads[name] = json.loads(text)
        for field in PRODUCT_LEVEL_FIELDS:
            assert f'"{field}"' not in text, (name, field)

    meta = payloads["meta.json"]
    assert meta["report_date"] == dates[-1] and meta["latest_snapshot_date"] == dates[-1]
    assert meta["calibration"] is True and meta["weeks_of_history"] >= 1
    assert meta["self_brand"] == "baum" and meta["taxonomy_version"] == load_taxonomy().version
    assert meta["thresholds"]["low_n"] == LOW_N and "ikke salg" in meta["notes"]["not_sales"]
    method = meta["method"]
    assert method["restock_window_days"] == 7 and method["min_share_for_index"] == 0.02 and method["live_days"] == 120
    assert method["mad_scale"] == 1.4826 and method["markdown_drop"] == 0.05 and method["cohort_4w_days"] == [22, 35]
    assert method["style_weights"]["category"] == 2.0 and "navy" in method["neutrals"] and method["fx_to_dkk"]["EUR"] > 1
    assert meta["generated_at"] == "2026-10-11T06:00:00+00:00"
    assert {b["key"] for b in meta["brands"]} >= {"baum", "stinegoya"}

    taxonomy = load_taxonomy()
    for row in payloads["attributes.json"]:
        assert taxonomy.is_valid(row["attribute"], row["value"])
        assert isinstance(row["low_n"], bool)
    assert len(payloads["brands.json"]) == 6 and all("live_products" in r for r in payloads["brands.json"])
    assert len(payloads["series.json"]) and {"attribute", "value", "weeks_ago", "n"} <= set(payloads["series.json"][0])

    state = payloads["sold_out_state.json"]
    assert {r["scope"] for r in state} == {"all", "new"}
    assert all("state_index" in r and isinstance(r["low_n"], bool) for r in state)
    assert all(taxonomy.is_valid(r["attribute"], r["value"]) for r in state)

    pos = payloads["positioning.json"]
    assert pos["self_brand"] == "baum"
    by_brand = {b["brand"]: b for b in pos["brands"]}
    assert by_brand["baum"]["style_distance"] == 0.0 and by_brand["baum"]["price_index"] == 1.0
    assert set(by_brand["baum"]["mix"]) == set(ATTRIBUTES) and set(by_brand["baum"]["distances"]) == set(ATTRIBUTES)

    assert payloads["taxonomy.json"]["version"] == taxonomy.version
    assert "dress" in payloads["taxonomy.json"]["attributes"]["category"]["values"]
    runs = payloads["runs.json"]
    assert runs and all(r["status"] == "ok" for r in runs)
    assert len({(r["run_date"], r["brand"]) for r in runs}) == len(runs)  # one row per brand and date
