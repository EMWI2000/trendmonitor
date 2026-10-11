"""Synthetic Shopify catalogues for an offline end-to-end run (`trendmonitor demo`).

Generates N days of catalogues for a few fictional brands with attribute-dependent sell-out
hazards (e.g. floral midi dresses sell out faster), so the whole pipeline (snapshot → diff → tag →
report) can be exercised without network access. Product names are invented.
"""

from __future__ import annotations

import datetime as dt
import random
from pathlib import Path

from .config import Brand, Sources, load_sources
from .shopify import FetchResult
from .snapshot import run_snapshot

CATS = [
    ("Dress", "kjole", ["midi", "maxi", "mini"], 1799),
    ("Blouse", "bluse", ["long sleeve", "puff sleeve", "sleeveless"], 1099),
    ("Blazer", "blazer", ["oversized", "fitted"], 2499),
    ("Trousers", "bukser", ["wide leg", "straight", "cropped"], 1299),
    ("Skirt", "nederdel", ["midi", "mini", "pleated"], 1199),
    ("Knit", "strik", ["oversized", "fitted"], 1499),
]
PRINTS = ["Floral", "Leopard", "Stripe", "Check", "Polka dot", "Solid", "Solid", "Solid", "Abstract"]
COLOURS = ["Red", "Butter yellow", "Navy", "Black", "Cream", "Green", "Pink", "Cobalt blue", "Brown", "Lilac"]
MATERIALS = ["cotton poplin", "viscose", "silk", "wool blend", "recycled polyester", "linen", "satin", "lace"]
SIZES = ["XS", "S", "M", "L", "XL"]

# Weekly hazard multipliers for a size selling out, by attribute value (synthetic ground truth)
HAZARD = {"Floral": 1.8, "Polka dot": 1.6, "Butter yellow": 1.7, "Cobalt blue": 1.4, "Leopard": 0.8,
          "Check": 0.9, "Solid": 1.0, "satin": 1.3, "lace": 1.5, "Blazer": 1.2, "Knit": 0.7}
BASE_WEEKLY_HAZARD = 0.08


def _product(pid: int, rng: random.Random, created: dt.date, brand: str) -> dict:
    cat, _cat_da, variants_desc, price = rng.choice(CATS)
    print_ = rng.choice(PRINTS)
    colour = rng.choice(COLOURS)
    material = rng.choice(MATERIALS)
    detail = rng.choice(variants_desc)
    name = rng.choice(["Ava", "Nora", "Elin", "Maja", "Liv", "Ida", "Freja", "Saga", "Vilde", "Siri"])
    title = f"{name} {detail} {cat.lower()}, {colour.lower()} {print_.lower() if print_ != 'Solid' else ''}".strip(" ,")
    body = (f"<p>{cat} i {material}. {detail.capitalize()} silhuet med {print_.lower() if print_ != 'Solid' else 'ensfarvet'} "
            f"look. Hverdag og fest. Pris vejledende.</p>")
    return {
        "id": pid, "title": title.replace("  ", " "), "handle": f"{name.lower()}-{pid}",
        "product_type": cat, "vendor": brand, "tags": [cat, print_, colour, material, detail],
        "body_html": body, "published_at": f"{created.isoformat()}T08:00:00+02:00",
        "created_at": f"{created.isoformat()}T08:00:00+02:00", "updated_at": f"{created.isoformat()}T08:00:00+02:00",
        "images": [{"src": f"https://example.invalid/{brand}/{pid}.jpg"}],
        "variants": [
            {"id": pid * 10 + i, "sku": f"{brand[:3].upper()}-{pid}-{s}", "option1": s, "option2": None, "option3": None,
             "price": f"{price:.2f}", "compare_at_price": None, "available": True}
            for i, s in enumerate(SIZES)
        ],
        "_hazard": BASE_WEEKLY_HAZARD * HAZARD.get(print_, 1.0) * HAZARD.get(colour, 1.0)
                   * HAZARD.get(material, 1.0) * HAZARD.get(cat, 1.0),
    }


def generate(days: int = 70, brands: list[str] | None = None, seed: int = 7) -> dict[str, dict[str, list[dict]]]:
    """Return {date: {brand: products}} for `days` consecutive days ending today (UTC)."""
    rng = random.Random(seed)
    brands = brands or ["baum", "stinegoya", "rotate", "gestuz", "munthe", "ganni"]
    end = dt.datetime.now(dt.UTC).date()
    start = end - dt.timedelta(days=days - 1)
    catalogues: dict[str, list[dict]] = {}
    next_id = 1_000_000
    for b in brands:
        catalogues[b] = []
        for _ in range(rng.randint(60, 120)):
            created = start - dt.timedelta(days=rng.randint(0, 120))
            catalogues[b].append(_product(next_id, rng, created, b))
            next_id += 1

    out: dict[str, dict[str, list[dict]]] = {}
    day = start
    while day <= end:
        for b in brands:
            # launches: ~2 per week per brand
            if rng.random() < 2 / 7:
                catalogues[b].append(_product(next_id, rng, day, b))
                next_id += 1
            for p in catalogues[b]:
                daily = p["_hazard"] / 7
                for v in p["variants"]:
                    if v["available"] and rng.random() < daily * (1.6 if v["option1"] in ("S", "M") else 0.8):
                        v["available"] = False
                    elif not v["available"] and rng.random() < 0.01:
                        v["available"] = True  # occasional restock
                # markdowns after ~8 weeks for slow sellers
                age = (day - dt.date.fromisoformat(p["created_at"][:10])).days
                if age > 56 and p["_hazard"] < BASE_WEEKLY_HAZARD and p["variants"][0]["compare_at_price"] is None \
                        and rng.random() < 0.03:
                    for v in p["variants"]:
                        v["compare_at_price"] = v["price"]
                        v["price"] = f"{float(v['price']) * 0.7:.2f}"
            # delist fully sold-out old products occasionally
            catalogues[b] = [p for p in catalogues[b]
                             if any(v["available"] for v in p["variants"]) or rng.random() > 0.05]
        out[day.isoformat()] = {
            b: [{k: v for k, v in p.items() if k != "_hazard"} | {"variants": [dict(v) for v in p["variants"]]}
                for p in catalogues[b]]
            for b in brands
        }
        day += dt.timedelta(days=1)
    return out


def run_demo(data_dir: Path, days: int = 70, seed: int = 7) -> list[str]:
    """Write `days` synthetic snapshots into data_dir using the real snapshot code path."""
    from .diff import run_diff
    from .tagger import run_tagging

    sources = load_sources()
    data = generate(days=days, seed=seed)
    brand_keys = list(next(iter(data.values())).keys())
    brands = [b for b in sources.brands if b.key in brand_keys] or [
        Brand(key=k, name=k.title(), url=f"https://{k}.example.invalid", role="self" if k == "baum" else "peer")
        for k in brand_keys
    ]
    dates = []
    for date, per_brand in data.items():
        def fetcher(brand: Brand, _d=per_brand) -> FetchResult:
            return FetchResult(brand.key, "ok", _d.get(brand.key, []), "DKK", 1, 0.0)

        run_snapshot(Sources(brands=brands, user_agent="demo"), date=date, data_dir=data_dir, fetcher=fetcher, brands=brands)
        run_diff(date, data_dir)
        run_tagging(date, data_dir, use_claude=False)
        dates.append(date)
    return dates
