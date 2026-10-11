from trendmonitor.demo import run_demo
from trendmonitor.metrics import compute
from trendmonitor.report import write_report


def test_demo_pipeline_produces_report(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    dates = run_demo(data_dir, days=21, seed=3)
    assert len(dates) == 21
    m = compute(dates[-1], data_dir)
    assert len(m.brands) == 6 and (m.brands["live_products"] > 0).all()
    assert m.calibration  # 3 weeks < 8-week baseline
    assert not m.attributes.empty and m.attributes["demand_index"].notna().any()
    # share_new and share_sold_out each sum to ~1 per attribute
    for _, g in m.attributes.groupby("attribute"):
        assert abs(g["share_new"].fillna(0).sum() - 1) < 1e-6
        assert abs(g["share_sold_out"].fillna(0).sum() - 1) < 1e-6
    path = write_report(dates[-1], data_dir, tmp_path / "reports")
    text = path.read_text(encoding="utf-8")
    assert text.startswith("# Trendmonitor uge") and "Kalibrering" in text and "## Brands" in text
