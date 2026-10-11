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
