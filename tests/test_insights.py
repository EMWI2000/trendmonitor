"""Rules behind "Hvad betyder det for Baum": classification, ordering and wording."""

import pandas as pd

from trendmonitor.demo import run_demo
from trendmonitor.export import export_all
from trendmonitor.insights import compute_insights
from trendmonitor.metrics import compute, compute_state
from trendmonitor.profile import positioning
from trendmonitor.report import write_report
from trendmonitor.storage import read_snapshot, read_tags

NAMES = {"baum": "Baum und Pferdgarten", "a": "Brand A", "b": "Brand B", "c": "Brand C"}


def _state_row(attr, value, scope, live, unavail, share_live, share_unavail, self_live, self_unavail,
               self_share_live):
    idx = share_unavail / share_live
    return {"attribute": attr, "scope": scope, "value": value, "live_n": live, "unavailable_n": unavail,
            "self_live_n": self_live, "self_unavailable_n": self_unavail, "share_live": share_live,
            "share_unavailable": share_unavail, "state_index": idx, "self_share_live": self_share_live,
            "self_share_unavailable": None, "self_state_index": None, "low_n": unavail < 10}


def test_attribute_rules_classify_white_space_strength_and_risk():
    state = pd.DataFrame([
        # peers sell out of lace (index 1.6), Baum carries almost none -> white space
        _state_row("material", "lace", "new", 200, 80, 0.10, 0.16, 5, 1, 0.01),
        # peers sell out of floral (index 1.4), Baum is heavy in it -> strength
        _state_row("print", "floral", "new", 300, 120, 0.25, 0.35, 120, 40, 0.30),
        # peers do not sell out of stripe (index 0.5), Baum is heavy -> risk
        _state_row("print", "stripe", "all", 400, 60, 0.20, 0.10, 100, 10, 0.35),
        # in-between index -> nothing
        _state_row("category", "dress", "all", 500, 150, 0.30, 0.31, 80, 20, 0.25),
        # strong but low n -> excluded
        _state_row("colour_family", "metallic", "new", 20, 8, 0.03, 0.06, 0, 0, 0.0),
    ])
    items = compute_insights(state, pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), "baum", NAMES)
    kinds = {(i["attribute"], i["value"]): i["kind"] for i in items}
    assert kinds[("material", "lace")] == "white_space"
    assert kinds[("print", "floral")] == "strength"
    assert kinds[("print", "stripe")] == "risk"
    assert ("category", "dress") not in kinds and ("colour_family", "metallic") not in kinds
    lace = next(i for i in items if i["value"] == "lace")
    assert lace["title"] == "Hvidt felt: materiale lace" and "n=80" in lace["text"]
    assert "Baum und Pferdgarten har 1 %" in lace["text"] and lace["action"].startswith("Test lace")
    assert lace["peer_index"] == 1.6 and lace["self_share"] == 0.01
    assert [i["rank"] for i in items] == [1, 2, 3] and items[0]["value"] == "stripe"  # strongest first
    for i in items:
        assert "sælger" not in i["text"].lower() and "sælger" not in i["action"].lower()
        assert i["evidence"] and i["attribute_label"]


def test_new_scope_wins_over_all_and_kinds_are_capped():
    rows = [_state_row("material", "lace", "new", 200, 80, 0.10, 0.16, 5, 1, 0.01),
            _state_row("material", "lace", "all", 900, 300, 0.10, 0.20, 5, 1, 0.01)]
    for k, v in enumerate(("silk", "satin", "wool", "linen")):
        rows.append(_state_row("material", v, "all", 300, 100 + k, 0.10, 0.15, 0, 0, 0.0))
    items = compute_insights(pd.DataFrame(rows), pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), "baum", NAMES)
    lace = [i for i in items if i["value"] == "lace"]
    assert len(lace) == 1 and lace[0]["scope"] == "new"
    assert sum(i["kind"] == "white_space" for i in items) == 2  # per-kind cap


def test_every_kind_gets_its_strongest_finding():
    rows = [_state_row("material", v, "all", 400, 150 + k, 0.10, 0.16, 0, 0, 0.0) for k, v in enumerate(("silk", "satin", "wool"))]
    rows.append(_state_row("print", "floral", "all", 100, 30, 0.10, 0.13, 40, 10, 0.12))  # weak strength
    rows.append(_state_row("print", "stripe", "all", 100, 10, 0.10, 0.06, 40, 4, 0.30))   # weak risk, n=10 ok
    items = compute_insights(pd.DataFrame(rows), pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), "baum", NAMES)
    kinds = [i["kind"] for i in items]
    assert kinds.count("white_space") == 2 and "strength" in kinds and "risk" in kinds
    assert items == sorted(items, key=lambda i: i["strength"], reverse=True)


def test_size_markdown_and_nearest_insights():
    sizes = pd.DataFrame([
        {"brand": "a", "role": "peer", "size": "XS", "live_variants": 200, "unavailable_variants": 120, "unavailable_share": 0.6},
        {"brand": "a", "role": "peer", "size": "M", "live_variants": 200, "unavailable_variants": 40, "unavailable_share": 0.2},
        {"brand": "a", "role": "peer", "size": "EU38", "live_variants": 500, "unavailable_variants": 500, "unavailable_share": 1.0},
        {"brand": "baum", "role": "self", "size": "XS", "live_variants": 50, "unavailable_variants": 25, "unavailable_share": 0.5},
    ])
    brands = pd.DataFrame([
        {"brand": "a", "role": "peer", "markdown_share": 0.7, "median_discount": 0.4},
        {"brand": "b", "role": "peer", "markdown_share": 0.1, "median_discount": 0.2},
        {"brand": "baum", "role": "self", "markdown_share": 0.3, "median_discount": 0.5},
    ])
    distances = pd.DataFrame([
        {"brand": "baum", "role": "self", "style_distance": 0.0, "price_index": 1.0, "overlap_with_self": 1.0},
        {"brand": "a", "role": "peer", "style_distance": 0.3, "price_index": 1.2, "overlap_with_self": 0.5},
        {"brand": "b", "role": "peer", "style_distance": 0.5, "price_index": 0.8, "overlap_with_self": 0.4},
    ])
    items = compute_insights(pd.DataFrame(), sizes, brands, distances, "baum", NAMES)
    by_kind = {i["kind"]: i for i in items}
    assert set(by_kind) == {"sizes", "markdown", "nearest"}
    assert by_kind["sizes"]["sizes"][0]["size"] == "XS" and by_kind["sizes"]["sizes"][0]["self_share"] == 0.5
    assert "EU38" not in by_kind["sizes"]["title"]  # shoe sizes are not canonical
    assert by_kind["markdown"]["peer_count"] == 1 and by_kind["markdown"]["peer_total"] == 2
    assert "Brand A (70 %)" in by_kind["markdown"]["text"] and "30 % nedsat" in by_kind["markdown"]["text"]
    assert by_kind["nearest"]["brands"][0]["brand"] == "a" and by_kind["nearest"]["title"].endswith("Brand A, Brand B")
    assert [i["rank"] for i in items] == [1, 2, 3]


def test_insights_flow_through_export_and_report(tmp_path):
    data_dir = tmp_path / "data"
    dates = run_demo(data_dir, days=14, seed=11)
    m = compute(dates[-1], data_dir)
    state = compute_state(dates[-1], data_dir)
    st = state.sold_out_state
    assert {"self_live_n", "self_share_live", "self_state_index"} <= set(st.columns)
    assert (st["self_unavailable_n"] <= st["self_live_n"]).all()
    pos = positioning(read_snapshot(dates[-1], data_dir), read_tags(data_dir), dates[-1])
    items = compute_insights(st, state.size_depletion, m.brands, pos.distances, pos.self_brand,
                             {"baum": "Baum und Pferdgarten"})
    assert any(i["kind"] == "nearest" for i in items)
    assert all(i["kind"] in {"white_space", "strength", "risk", "sizes", "markdown", "nearest"} for i in items)

    out = export_all(dates[-1], data_dir)
    payload = __import__("json").loads((out / "insights.json").read_text(encoding="utf-8"))
    assert payload["self_brand"] == "baum" and payload["calibration"] is True
    assert payload["rules"]["over_index"] == 1.25 and payload["rules"]["low_n"] == 10
    assert [i["rank"] for i in payload["items"]] == list(range(1, len(payload["items"]) + 1))

    text = write_report(dates[-1], data_dir, tmp_path / "reports").read_text(encoding="utf-8")
    assert "## Hvad betyder det for Baum und Pferdgarten" in text and "Hypoteser til test" in text
    assert "Handling:" in text
