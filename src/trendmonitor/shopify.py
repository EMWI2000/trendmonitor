"""Fetch and normalise public Shopify catalogues (/products.json, /meta.json)."""

from __future__ import annotations

import html
import re
import time
import urllib.robotparser
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import requests

from .config import Brand, Sources

SIZE_VOCAB = {
    "xxxs", "xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "xs/s", "s/m", "m/l", "l/xl",
    "one size", "onesize", "os", "o/s",
    "32", "34", "36", "38", "40", "42", "44", "46", "48",
    "24", "25", "26", "27", "28", "29", "30", "31", "33",
    "35", "37", "39", "41",
}
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_SIZE_PREFIX_RE = re.compile(r"^(?:UK|EU|US|FR|IT|DE)\s?\d{1,2}(?:[.,]5)?$", re.IGNORECASE)
_SEASON_RE = re.compile(
    r"^(?:(?:SS|AW|FW|PS|PF|HS|RS)\s?\d{2}(?:\s?drop\s?\d)?|\d{2}\s?(?:Pre\s?Spring|Pre\s?Fall|Spring/Summer|Autumn/Winter|Resort)"
    r"|SEASON\s?-\s?\d{3})$", re.IGNORECASE)


@dataclass
class FetchResult:
    brand: str
    status: str  # ok | not_shopify_or_disabled | robots_disallow | http_error
    products: list[dict[str, Any]]
    currency: str | None
    pages: int
    seconds: float
    error: str | None = None


def strip_html(text: str | None, limit: int = 600) -> str:
    if not text:
        return ""
    cleaned = html.unescape(_TAG_RE.sub(" ", text))
    return _WS_RE.sub(" ", cleaned).strip()[:limit]


def detect_size(options: Iterable[str | None]) -> str | None:
    """Size from any option: alpha, numeric, or UK/EU/US-prefixed. Colour-in-option1 stores work."""
    for value in options:
        if not value:
            continue
        v = str(value).strip()
        if v.lower() in SIZE_VOCAB or _SIZE_PREFIX_RE.match(v):
            return v.upper().replace(" ", "")
    return None


def detect_season(tags: Iterable[str]) -> str | None:
    for t in tags:
        if t and _SEASON_RE.match(str(t).strip()):
            return str(t).strip().upper().replace(" ", "")
    return None


def excluded(product: dict[str, Any], brand: Brand) -> bool:
    """Per-brand product_type / tag exclusions from sources.yaml."""
    if brand.exclude_types and re.search(brand.exclude_types, product.get("product_type") or "", re.IGNORECASE):
        return True
    if brand.exclude_tags:
        tags = product.get("tags") or []
        tags = tags if isinstance(tags, list) else [t.strip() for t in str(tags).split(",")]
        if any(re.search(brand.exclude_tags, t, re.IGNORECASE) for t in tags):
            return True
    return False


def is_live(product: dict[str, Any], snapshot_date: str, live_days: int) -> bool:
    """Keep products with any available variant, or published within live_days."""
    if any(v.get("available") for v in product.get("variants") or []):
        return True
    pub = product.get("published_at")
    if not pub:
        return False
    try:
        import datetime as _dt

        published = _dt.datetime.fromisoformat(str(pub).replace("Z", "+00:00")).date()  # noqa: FURB162 - py<3.11 "Z"
        return (_dt.date.fromisoformat(snapshot_date) - published).days <= live_days
    except ValueError:
        return False


def normalise(products: list[dict[str, Any]], brand: Brand, snapshot_date: str, currency: str | None,
              fx_to_dkk: float | None = None, live_days: int | None = None) -> list[dict]:
    """Flatten Shopify products into one row per variant (see SPEC.md).

    `currency` is the brand's explicit currency when configured, else meta.json's. `fx_to_dkk`
    converts prices; `live_days` (with the availability rule) drops dead outlet products.
    """
    currency = brand.currency or currency
    rows: list[dict] = []
    for p in products:
        if excluded(p, brand):
            continue
        if live_days is not None and not is_live(p, snapshot_date, live_days):
            continue
        images = p.get("images") or []
        image_url = images[0].get("src") if images else None
        base = {
            "snapshot_date": snapshot_date,
            "brand": brand.key,
            "role": brand.role,
            "product_id": int(p["id"]),
            "handle": p.get("handle"),
            "title": p.get("title"),
            "product_type": p.get("product_type") or "",
            "vendor": p.get("vendor") or "",
            "tags": ",".join(p.get("tags") or []) if isinstance(p.get("tags"), list) else (p.get("tags") or ""),
            "body_text": strip_html(p.get("body_html")),
            "published_at": p.get("published_at"),
            "created_at": p.get("created_at"),
            "updated_at": p.get("updated_at"),
            "image_url": image_url,
            "currency": currency,
            "season_tag": detect_season(p.get("tags") or []) if isinstance(p.get("tags"), list) else None,
        }
        for v in p.get("variants") or []:
            opts = (v.get("option1"), v.get("option2"), v.get("option3"))
            compare = v.get("compare_at_price")
            price = _to_float(v.get("price"))
            compare_f = _to_float(compare) if compare not in (None, "", "0", "0.0", "0.00") else None
            rows.append(
                {
                    **base,
                    "variant_id": int(v["id"]),
                    "sku": v.get("sku") or "",
                    "option1": opts[0],
                    "option2": opts[1],
                    "option3": opts[2],
                    "size": detect_size(opts),
                    "price": price,
                    "compare_at_price": compare_f,
                    "available": bool(v.get("available", False)),
                    "price_dkk": round(price * fx_to_dkk, 2) if price is not None and fx_to_dkk else None,
                    "compare_at_dkk": round(compare_f * fx_to_dkk, 2) if compare_f is not None and fx_to_dkk else None,
                }
            )
    return rows


def _to_float(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


class ShopifyClient:
    """Polite client: robots.txt, fixed delay, identified UA, bounded retries."""

    def __init__(self, sources: Sources, session: requests.Session | None = None, sleep: Callable = time.sleep):
        self.sources = sources
        self.session = session or requests.Session()
        self.session.headers.update({"User-Agent": sources.user_agent, "Accept": "application/json"})
        self.sleep = sleep

    def robots_allows(self, brand: Brand) -> bool:
        parsed = urlparse(brand.url)
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = self.session.get(f"{parsed.scheme}://{parsed.netloc}/robots.txt", timeout=15)
            if r.status_code >= 400:
                return True
            rp.parse(r.text.splitlines())
        except requests.RequestException:
            return True
        return rp.can_fetch(self.sources.user_agent, f"{brand.url}/products.json")

    def _get_json(self, url: str, params: dict | None = None) -> tuple[int, Any]:
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                r = self.session.get(url, params=params, timeout=30)
                if r.status_code in (429, 500, 502, 503, 504):
                    self.sleep(2 ** attempt * self.sources.request_delay_seconds)
                    continue
                if r.status_code != 200:
                    return r.status_code, None
                ctype = r.headers.get("Content-Type", "")
                if "json" not in ctype and not r.text.lstrip().startswith("{"):
                    return r.status_code, None
                return r.status_code, r.json()
            except (requests.RequestException, ValueError) as exc:
                last_exc = exc
                self.sleep(2 ** attempt * self.sources.request_delay_seconds)
        raise RuntimeError(f"giving up on {url}: {last_exc}")

    def fetch_brand(self, brand: Brand) -> FetchResult:
        t0 = time.monotonic()
        if not self.robots_allows(brand):
            return FetchResult(brand.key, "robots_disallow", [], None, 0, time.monotonic() - t0)
        currency = None
        try:
            status, meta = self._get_json(f"{brand.url}/meta.json")
            if status == 200 and isinstance(meta, dict):
                currency = meta.get("currency")
        except RuntimeError:
            pass
        self.sleep(self.sources.request_delay_seconds)

        products: list[dict] = []
        pages = 0
        try:
            for page in range(1, self.sources.max_pages + 1):
                status, data = self._get_json(
                    f"{brand.url}/products.json", params={"limit": self.sources.page_size, "page": page}
                )
                if status != 200 or not isinstance(data, dict) or "products" not in data:
                    if page == 1:
                        return FetchResult(brand.key, "not_shopify_or_disabled", [], currency, 0,
                                           time.monotonic() - t0, error=f"http {status}")
                    break
                batch = data["products"]
                pages += 1
                if not batch:
                    break
                products.extend(batch)
                if len(batch) < self.sources.page_size:
                    break
                self.sleep(self.sources.request_delay_seconds)
        except RuntimeError as exc:
            return FetchResult(brand.key, "http_error", products, currency, pages, time.monotonic() - t0, str(exc))
        return FetchResult(brand.key, "ok", products, currency, pages, time.monotonic() - t0)
