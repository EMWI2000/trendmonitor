from types import SimpleNamespace

import pandas as pd
from conftest import make_fetcher

from trendmonitor.demo import run_demo
from trendmonitor.profile import (
    _js_distance,
    implied_customer_claude,
    positioning,
    render_profile,
    write_profile,
)
from trendmonitor.snapshot import run_snapshot
from trendmonitor.storage import read_snapshot, read_tags
from trendmonitor.tagger import run_tagging


def test_js_distance_bounds():
    a = pd.Series({"floral": 0.5, "solid": 0.5})
    assert _js_distance(a, a) == 0.0
    assert abs(_js_distance(a, pd.Series({"animal": 1.0})) - 1.0) < 1e-9
    assert 0 < _js_distance(a, pd.Series({"floral": 0.9, "solid": 0.1})) < 1


def test_positioning_on_demo(tmp_path):
    data_dir = tmp_path / "data"
    dates = run_demo(data_dir, days=10, seed=5)
    snapshot = read_snapshot(dates[-1], data_dir)
    pos = positioning(snapshot, read_tags(data_dir), dates[-1])
    assert pos.self_brand == "baum"
    d = pos.distances.set_index("brand")
    assert d.loc["baum", "style_distance"] == 0.0 and d.loc["baum", "overlap_with_self"] == 1.0
    others = d.drop(index="baum")
    assert (others["style_distance"] > 0).all() and (others["style_distance"] < 1).all()
    assert others["price_index"].between(0.5, 2.0).all()
    prof = pos.profiles["baum"]
    assert prof.size_system == "alfa" and prof.size_range == "XS–XL"
    assert prof.price_bands is not None and abs(prof.price_bands.sum() - 1) < 1e-9
    text = render_profile(pos, {"baum": "Baum und Pferdgarten"}, "0.1")
    assert "## 1b. Stilafstand" in text and "Baum und Pferdgarten (self)" in text
    path = write_profile(dates[-1], data_dir, tmp_path / "reports", use_claude=False)
    assert path.name == f"profile-{dates[-1]}.md"


def test_implied_customer_with_fake_client(tmp_path, sources, day1):
    data_dir = tmp_path / "data"
    run_snapshot(sources, date="2026-09-20", data_dir=data_dir, fetcher=make_fetcher(day1))
    run_tagging("2026-09-20", data_dir, use_claude=False)
    snapshot = read_snapshot("2026-09-20", data_dir)
    pos = positioning(snapshot, read_tags(data_dir), "2026-09-20")

    calls = []

    def create(**kw):
        calls.append(kw)
        return SimpleNamespace(content=[SimpleNamespace(type="tool_use", name="record_profile", input={
            "age_band": "30-49", "style_identity": ["feminine", "playful"], "price_tier": "contemporary",
            "tone_of_voice": "warm/personal", "summary": "Feminine occasion dressing.", "confidence": 0.6})])

    fake = SimpleNamespace(messages=SimpleNamespace(create=create))
    implied_customer_claude(pos.profiles, snapshot, pos.self_brand, "test-model", client=fake)
    assert pos.profiles["testbrand"].implied["age_band"] == "30-49"
    assert len(calls) == 1 and calls[0]["tool_choice"]["name"] == "record_profile"
    assert "Nora puff sleeve" in calls[0]["messages"][0]["content"]
