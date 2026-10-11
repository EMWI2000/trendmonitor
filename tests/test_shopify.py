import requests

from trendmonitor.shopify import ShopifyClient, detect_size, normalise, strip_html


def test_strip_html_and_limit():
    assert strip_html("<p>Hej &amp; <b>farvel</b></p>", limit=9) == "Hej & far"
    assert strip_html(None) == ""


def test_detect_size_from_any_option():
    assert detect_size(("Navy", "38", None)) == "38"
    assert detect_size(("xs", None, None)) == "XS"
    assert detect_size(("Navy", "Regular", None)) is None


def test_normalise_rows(day1, brand):
    rows = normalise(day1, brand, "2026-09-20", "DKK")
    assert len(rows) == 6  # 3 + 2 + 1 variants
    nora = [r for r in rows if r["product_id"] == 101]
    assert {r["size"] for r in nora} == {"XS", "S", "M"}
    assert nora[0]["price"] == 1799.0 and nora[0]["compare_at_price"] is None
    assert nora[0]["body_text"].startswith("Midikjole i viskose")
    assert nora[0]["image_url"].endswith("nora.jpg")
    blazer = next(r for r in rows if r["product_id"] == 102)
    assert blazer["image_url"] is None and blazer["size"] == "36"


class _Resp:
    def __init__(self, status, payload=None, text="", ctype="application/json"):
        self.status_code = status
        self._payload = payload
        self.text = text or ("{" if payload is not None else "<html>")
        self.headers = {"Content-Type": ctype}

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload


class _Session(requests.Session):
    """Scripted responses keyed by URL path."""

    def __init__(self, script):
        super().__init__()
        self.script = script
        self.calls = []

    def get(self, url, params=None, timeout=None, **kw):
        self.calls.append((url, params))
        for key, resp in self.script.items():
            if key in url:
                return resp
        return _Resp(404, ctype="text/html")


def test_client_paginates_and_stops_on_short_page(sources, brand, day1):
    page1 = {"products": day1[:2]}
    page2 = {"products": day1[2:]}
    session = _Session({
        "robots.txt": _Resp(200, text="User-agent: *\nDisallow: /checkout\n", ctype="text/plain"),
        "meta.json": _Resp(200, {"currency": "DKK"}),
        "products.json": None,  # replaced below
    })

    def get(url, params=None, timeout=None, **kw):
        session.calls.append((url, params))
        if "robots" in url:
            return session.script["robots.txt"]
        if "meta.json" in url:
            return session.script["meta.json"]
        return _Resp(200, page1 if params["page"] == 1 else page2)

    session.get = get
    small = sources.__class__(brands=sources.brands, user_agent=sources.user_agent, request_delay_seconds=0,
                              page_size=2, max_pages=5)
    client = ShopifyClient(small, session=session, sleep=lambda s: None)
    result = client.fetch_brand(brand)
    assert result.status == "ok"
    assert len(result.products) == 3 and result.pages == 2 and result.currency == "DKK"


def test_client_respects_robots_disallow(sources, brand):
    session = _Session({"robots.txt": _Resp(200, text="User-agent: *\nDisallow: /products.json\n", ctype="text/plain")})
    client = ShopifyClient(sources, session=session, sleep=lambda s: None)
    assert client.fetch_brand(brand).status == "robots_disallow"
    assert all("products.json" not in url for url, _ in session.calls)


def test_client_marks_non_shopify(sources, brand):
    session = _Session({"robots.txt": _Resp(404, ctype="text/html")})
    client = ShopifyClient(sources, session=session, sleep=lambda s: None)
    assert client.fetch_brand(brand).status == "not_shopify_or_disabled"


def test_detect_size_prefixed_and_second_option():
    assert detect_size(("Black", "UK10", None)) == "UK10"
    assert detect_size(("EU 38", None, None)) == "EU38"
    assert detect_size(("Dark brown combo", "XS/S", None)) == "XS/S"
    assert detect_size(("One size", None, None)) == "ONESIZE"


def test_detect_season_codes():
    from trendmonitor.shopify import detect_season

    assert detect_season(["60%", "party", "PS25", "SALE"]) == "PS25"
    assert detect_season(["FW26", "FW26 drop 2"]) == "FW26"
    assert detect_season(["27 Pre Spring", "colour:Multi"]) == "27PRESPRING"
    assert detect_season(["SEASON - 264", "LIVE"]) == "SEASON-264"
    assert detect_season(["Dress", "Floral"]) is None


def test_exclusions_live_filter_and_dkk(day1):
    from trendmonitor.config import Brand
    from trendmonitor.shopify import excluded, is_live

    b = Brand(key="x", name="X", url="https://x.example.invalid", currency="EUR",
              exclude_types="beauty|bed linen", exclude_tags="preloved")
    assert excluded({"product_type": "BED LINEN & TOWELS", "tags": []}, b)
    assert excluded({"product_type": "Dress", "tags": ["Rabens", "preloved"]}, b)
    assert not excluded({"product_type": "Dress", "tags": ["new"]}, b)

    dead = {"published_at": "2025-01-01T08:00:00+02:00", "variants": [{"available": False}]}
    fresh = {"published_at": "2026-09-20T08:00:00+02:00", "variants": [{"available": False}]}
    live = {"published_at": "2024-01-01T08:00:00+02:00", "variants": [{"available": True}]}
    assert not is_live(dead, "2026-10-11", 120)
    assert is_live(fresh, "2026-10-11", 120)
    assert is_live(live, "2026-10-11", 120)

    rows = normalise(day1, b, "2026-09-20", "DKK", fx_to_dkk=7.46, live_days=120)
    nora = next(r for r in rows if r["product_id"] == 101)
    assert nora["currency"] == "EUR"  # explicit brand currency beats meta.json
    assert nora["price_dkk"] == round(1799.0 * 7.46, 2) and nora["compare_at_dkk"] is None
    # product 103 (published 2026-07-01, available) stays; make it dead and old to see it dropped
    day1[2]["variants"][0]["available"] = False
    day1[2]["published_at"] = "2025-01-01T08:00:00+02:00"
    rows2 = normalise(day1, b, "2026-09-20", "DKK", fx_to_dkk=7.46, live_days=120)
    assert {r["product_id"] for r in rows2} == {101, 102}
