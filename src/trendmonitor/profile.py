"""Assortment (style) profile per brand and positioning relative to the `self` brand.

Two layers, kept apart in the output because they rest on different evidence:

1. Style profile (hard data): attribute mix from tags, price architecture, size system, newness,
   markdown share. Distance to the self brand = Jensen–Shannon distance per attribute, plus a
   cell-overlap score on (category × print × colour_family).
2. Implied-customer read (soft): what the offer and its language suggest about the customer the
   brand addresses. Rules-based proxies always; a Claude read of sampled descriptions when an API
   key is set. This is the product's point of view, not survey data; the report says so.
"""

from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .config import ATTRIBUTES, DATA_DIR, load_taxonomy
from .storage import list_snapshot_dates, read_snapshot, read_tags

log = logging.getLogger(__name__)

PRICE_BANDS = [(0, 1000, "<1.000"), (1000, 2000, "1.000–1.999"), (2000, 3000, "2.000–2.999"), (3000, float("inf"), "3.000+")]
NEUTRALS = {"black", "white", "grey", "brown", "navy"}
ALPHA_SIZES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"]
NUMERIC_SIZES = [str(n) for n in range(32, 50, 2)]
NEWNESS_DAYS = 56
STYLE_WEIGHTS = {"category": 2.0, "print": 2.0, "colour_family": 1.5, "silhouette": 1.0, "material": 1.0,
                 "sleeve": 0.5, "length": 0.5, "occasion": 0.5}
OCCASION_WORDS = {
    "fest": ["fest", "party", "evening", "aften", "wedding", "bryllup", "cocktail", "gala", "occasion"],
    "arbejde": ["office", "kontor", "work", "tailor", "suit", "blazer", "meeting"],
    "hverdag": ["everyday", "hverdag", "casual", "daily", "weekend", "relaxed", "comfortable", "komfort"],
    "ferie": ["holiday", "ferie", "beach", "strand", "resort", "summer", "sommer", "vacation"],
}
VOICE_WORDS = {
    "legende": ["playful", "legesyg", "fun", "sjov", "bold", "statement", "pop", "colourful", "farverig"],
    "feminin": ["feminine", "feminin", "romantic", "romantisk", "soft", "blød", "flattering", "ruffle", "flæse"],
    "minimal": ["minimal", "clean", "timeless", "tidløs", "classic", "klassisk", "essential", "understated", "sleek"],
    "bæredygtig": ["organic", "økologisk", "recycled", "genanvendt", "responsible", "ansvarlig", "certified", "gots"],
    "craft": ["handmade", "håndlavet", "artisan", "embroidered", "broderet", "hand-painted", "håndmalet", "jacquard"],
}


@dataclass
class BrandProfile:
    brand: str
    role: str
    products: int
    variants: int
    tagged_share: float
    mix: dict[str, pd.Series] = field(default_factory=dict)  # attribute -> share per value
    price_p25: float | None = None
    price_p50: float | None = None
    price_p75: float | None = None
    price_bands: pd.Series | None = None
    dress_p50: float | None = None
    currency: str | None = None
    size_system: str = "ukendt"
    size_range: str = ""
    newness_share: float | None = None
    markdown_share: float | None = None
    print_share: float | None = None  # non-solid
    colour_share: float | None = None  # non-neutral
    occasion_words: dict[str, float] = field(default_factory=dict)
    voice_words: dict[str, float] = field(default_factory=dict)
    season_tags: dict[str, int] = field(default_factory=dict)
    implied: dict[str, Any] | None = None  # Claude read, optional


@dataclass
class Positioning:
    report_date: str
    self_brand: str | None
    profiles: dict[str, BrandProfile]
    distances: pd.DataFrame  # brand × attribute JS distance + weighted mean + overlap + price index


# ----------------------------------------------------------------------------- profiles

def _js_distance(p: pd.Series, q: pd.Series) -> float:
    """Jensen–Shannon distance (base 2, in [0, 1]) between two share vectors."""
    idx = sorted(set(p.index) | set(q.index))
    a = np.array([float(p.get(i, 0.0)) for i in idx])
    b = np.array([float(q.get(i, 0.0)) for i in idx])
    if a.sum() == 0 or b.sum() == 0:
        return float("nan")
    a, b = a / a.sum(), b / b.sum()
    m = 0.5 * (a + b)

    def kl(x, y):
        mask = x > 0
        return float(np.sum(x[mask] * np.log2(x[mask] / y[mask])))

    return math.sqrt(0.5 * kl(a, m) + 0.5 * kl(b, m))


def _size_profile(variants: pd.DataFrame) -> tuple[str, str]:
    sizes = variants["size"].dropna().astype(str).str.upper()
    if sizes.empty:
        return "ukendt", ""
    alpha = sizes[sizes.isin(ALPHA_SIZES)]
    numeric = sizes[sizes.isin(NUMERIC_SIZES)]
    if len(alpha) >= len(numeric) and len(alpha):
        present = [s for s in ALPHA_SIZES if s in set(alpha)]
        return "alfa", f"{present[0]}–{present[-1]}" if present else ""
    if len(numeric):
        present = sorted({int(s) for s in numeric})
        return "numerisk", f"{present[0]}–{present[-1]}"
    return "ukendt", ""


def _word_shares(texts: pd.Series, lexicon: dict[str, list[str]]) -> dict[str, float]:
    t = texts.fillna("").astype(str).str.lower()
    n = max(len(t), 1)
    return {k: round(float(t.str.contains("|".join(words), regex=True).sum()) / n, 3) for k, words in lexicon.items()}


def build_profiles(snapshot: pd.DataFrame, tags: pd.DataFrame, report_date: str) -> dict[str, BrandProfile]:
    profiles: dict[str, BrandProfile] = {}
    rd = pd.Timestamp(report_date, tz="UTC")
    for brand, v in snapshot.groupby("brand"):
        products = v.drop_duplicates("product_id")
        t = tags[tags["brand"] == brand]
        tagged = products.merge(t, on=["brand", "product_id"], how="left")
        prof = BrandProfile(brand=brand, role=str(v["role"].iloc[0]), products=len(products), variants=len(v),
                            tagged_share=float(tagged["tagger"].notna().mean()) if len(tagged) else 0.0)
        for attr in ATTRIBUTES:
            col = tagged[attr].dropna()
            prof.mix[attr] = (col.value_counts(normalize=True) if len(col) else pd.Series(dtype=float))
        prices = pd.to_numeric(products["price_dkk"], errors="coerce").dropna()
        if len(prices):
            prof.price_p25, prof.price_p50, prof.price_p75 = (float(prices.quantile(q)) for q in (0.25, 0.5, 0.75))
            bands = pd.cut(prices, bins=[b[0] for b in PRICE_BANDS] + [float("inf")], labels=[b[2] for b in PRICE_BANDS],
                           right=False)
            prof.price_bands = bands.value_counts(normalize=True).reindex([b[2] for b in PRICE_BANDS]).fillna(0.0)
        dresses = pd.to_numeric(tagged.loc[tagged["category"] == "dress", "price_dkk"], errors="coerce").dropna()
        prof.dress_p50 = float(dresses.median()) if len(dresses) else None
        cur = v["currency"].dropna()
        prof.currency = f"DKK (fra {cur.iloc[0]})" if len(cur) and str(cur.iloc[0]).upper() != "DKK" else "DKK"
        prof.size_system, prof.size_range = _size_profile(v)
        pub = pd.to_datetime(products["published_at"], errors="coerce", utc=True)
        prof.newness_share = float((pub >= rd - pd.Timedelta(days=NEWNESS_DAYS)).mean()) if pub.notna().any() else None
        cmp_ = pd.to_numeric(v["compare_at_price"], errors="coerce")
        prof.markdown_share = float((cmp_ > pd.to_numeric(v["price"], errors="coerce")).mean())
        prof.season_tags = v.drop_duplicates("product_id")["season_tag"].dropna().value_counts().head(4).to_dict()
        pr = prof.mix["print"]
        prof.print_share = float(1 - pr.get("solid", 0.0)) if len(pr) else None
        cf = prof.mix["colour_family"]
        prof.colour_share = float(sum(s for k, s in cf.items() if k not in NEUTRALS)) if len(cf) else None
        texts = products["title"].fillna("") + " " + products["body_text"].fillna("")
        prof.occasion_words = _word_shares(texts, OCCASION_WORDS)
        prof.voice_words = _word_shares(texts, VOICE_WORDS)
        profiles[brand] = prof
    return profiles


def _cells(snapshot: pd.DataFrame, tags: pd.DataFrame, brand: str) -> set[tuple]:
    t = tags[tags["brand"] == brand].dropna(subset=["category"])
    return {(r.category, r.print or "?", r.colour_family or "?") for r in t.itertuples()}


def positioning(snapshot: pd.DataFrame, tags: pd.DataFrame, report_date: str) -> Positioning:
    profiles = build_profiles(snapshot, tags, report_date)
    self_keys = [k for k, p in profiles.items() if p.role == "self"]
    self_brand = self_keys[0] if self_keys else None
    rows = []
    base = profiles.get(self_brand) if self_brand else None
    base_cells = _cells(snapshot, tags, self_brand) if self_brand else set()
    for key, p in profiles.items():
        row: dict[str, Any] = {"brand": key, "role": p.role}
        total_w = 0.0
        acc = 0.0
        for attr in ATTRIBUTES:
            d = _js_distance(p.mix[attr], base.mix[attr]) if base is not None else float("nan")
            row[f"d_{attr}"] = d
            if not math.isnan(d):
                acc += STYLE_WEIGHTS[attr] * d
                total_w += STYLE_WEIGHTS[attr]
        row["style_distance"] = acc / total_w if total_w else float("nan")
        cells = _cells(snapshot, tags, key)
        row["overlap_with_self"] = (len(cells & base_cells) / len(cells)) if cells and base_cells else float("nan")
        row["price_index"] = (p.price_p50 / base.price_p50) if base and base.price_p50 and p.price_p50 else float("nan")
        row["dress_price_index"] = (p.dress_p50 / base.dress_p50) if base and base.dress_p50 and p.dress_p50 else float("nan")
        rows.append(row)
    distances = pd.DataFrame(rows).sort_values("style_distance", na_position="last").reset_index(drop=True)
    return Positioning(report_date, self_brand, profiles, distances)


# ----------------------------------------------------------------------------- implied customer (Claude)

IMPLIED_TOOL = {
    "name": "record_profile",
    "description": "Record the customer the brand's product texts address, using only the allowed values.",
    "input_schema": {
        "type": "object",
        "properties": {
            "age_band": {"type": "string", "enum": ["18-29", "25-39", "30-49", "40-59", "unknown"],
                         "description": "Age band the offer and language most plausibly address."},
            "life_stage": {"type": "string", "enum": ["student/early career", "established professional",
                                                       "family stage", "mixed", "unknown"]},
            "style_identity": {"type": "array", "maxItems": 4,
                               "items": {"type": "string", "enum": ["playful", "feminine", "minimal", "tailored",
                                                                     "bohemian", "sporty", "glamorous", "vintage",
                                                                     "avant-garde", "preppy"]}},
            "occasion_mix": {"type": "object", "properties": {
                "everyday": {"type": "number"}, "work": {"type": "number"}, "party": {"type": "number"},
                "holiday": {"type": "number"}}, "description": "Shares summing to about 1."},
            "price_tier": {"type": "string", "enum": ["high street", "contemporary", "premium", "luxury"]},
            "tone_of_voice": {"type": "string", "enum": ["warm/personal", "editorial/fashion", "functional/product",
                                                          "sustainability-led", "mixed"]},
            "distinct_from_self": {"type": "string", "maxLength": 300,
                                   "description": "One or two sentences: how this brand's offer differs from the reference brand's."},
            "summary": {"type": "string", "maxLength": 400},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["age_band", "style_identity", "price_tier", "tone_of_voice", "summary", "confidence"],
    },
}

IMPLIED_SYSTEM = (
    "You are a merchandising analyst. From a sample of a womenswear brand's product titles, descriptions "
    "and prices, infer the customer the OFFER addresses. This is an inference from product language, not "
    "survey data: be conservative, use 'unknown' when the texts do not support a call, and never invent "
    "demographics beyond what price, fit, occasion and tone imply. Texts may be Danish or English."
)


def implied_customer_claude(profiles: dict[str, BrandProfile], snapshot: pd.DataFrame, self_brand: str | None,
                            model: str, sample: int = 40, client=None) -> None:
    """Fill profile.implied for every brand with a Claude read of sampled descriptions."""
    if client is None:
        import anthropic

        client = anthropic.Anthropic()
    products = snapshot.drop_duplicates("product_id")
    products = products.astype(object).where(products.notna(), None)  # plain None instead of pandas NA

    def sample_text(brand: str) -> str:
        p = products[products["brand"] == brand]
        p = p.sample(min(sample, len(p)), random_state=0) if len(p) > sample else p
        lines = [
            f"- {r.title} | {'' if r.price_dkk is None else f'{float(r.price_dkk):.0f}'} DKK | {(r.body_text or '')[:240]}"
            for r in p.itertuples()
        ]
        return "\n".join(lines)

    self_text = sample_text(self_brand) if self_brand else ""
    for key, prof in profiles.items():
        text = (f"Reference brand ({self_brand}) sample:\n{self_text}\n\n" if self_brand and key != self_brand else "")
        text += f"Brand to profile ({key}) sample of {min(sample, prof.products)} products:\n{sample_text(key)}"
        try:
            msg = client.messages.create(
                model=model, max_tokens=600, system=IMPLIED_SYSTEM, tools=[IMPLIED_TOOL],
                tool_choice={"type": "tool", "name": "record_profile"},
                messages=[{"role": "user", "content": text}],
            )
            for block in msg.content:
                if getattr(block, "type", None) == "tool_use":
                    prof.implied = dict(block.input)
        except Exception as exc:  # noqa: BLE001 - optional layer, never fail the profile
            log.warning("implied-customer read failed for %s: %s", key, exc)


# ----------------------------------------------------------------------------- report

def _pct(x) -> str:
    return "–" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{100 * x:.0f} %"


def _num(x, d=0) -> str:
    return "–" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:,.{d}f}".replace(",", ".")


def _top(series: pd.Series, k=3) -> str:
    if series is None or len(series) == 0:
        return "–"
    return ", ".join(f"{v} {100 * s:.0f} %" for v, s in series.head(k).items())


def render_profile(pos: Positioning, names: dict[str, str], taxonomy_version: str) -> str:
    P = pos.profiles
    sb = pos.self_brand
    base = P.get(sb) if sb else None
    L: list[str] = []
    L.append(f"# Stil- og positioneringsanalyse pr. {pos.report_date}")
    L.append("")
    L.append(f"Referencebrand: {names.get(sb, sb) if sb else 'intet self-brand i sources.yaml'}. "
             f"{len(P)} brands, taksonomi v{taxonomy_version}. Tal bygger på det seneste snapshot og tags; "
             "andele er af taggede produkter, så brands med lav tagget andel skal læses med forbehold.")
    L.append("")
    L.append("Afsnit 1 er hårde data (udbuddet). Afsnit 2 er en udledning af, hvilken kunde udbuddet og sproget "
             "henvender sig til; det er produktets perspektiv, ikke demografi. Demografi kræver B&P's egne kundedata "
             "(Shopify-kunderapporter, Meta Audience Insights, nyhedsbrevsdata) og kan kobles på senere.")
    L.append("")

    L.append("## 1. Udbud og positionering")
    L.append("")
    L.append("| Brand | Live styles | Tagget | Median pris (DKK) | Kjole median | Prisindeks | Prisbånd <1.000 / 1–2k / 2–3k / 3k+ | Størrelser | Nyt ≤ 8 uger | Nedsat | Print-andel | Farve-andel |")
    L.append("|---|---:|---:|---:|---:|---:|---|---|---:|---:|---:|---:|")
    for key, p in sorted(P.items(), key=lambda kv: (kv[1].role != "self", kv[0])):
        d = pos.distances.set_index("brand").loc[key]
        bands = " / ".join(_pct(v) for v in (p.price_bands.tolist() if p.price_bands is not None else [None] * 4))
        L.append(f"| {names.get(key, key)}{' (self)' if p.role == 'self' else ''} | {p.products} | {_pct(p.tagged_share)} | "
                 f"{_num(p.price_p50)} | {_num(p.dress_p50)} | {_num(d['price_index'], 2)} | {bands} | "
                 f"{p.size_system} {p.size_range} | {_pct(p.newness_share)} | {_pct(p.markdown_share)} | "
                 f"{_pct(p.print_share)} | {_pct(p.colour_share)} |")
    L.append("")
    L.append("Alle priser er omregnet til DKK med faste kurser fra sources.yaml. Prisindeks = brandets medianpris / referencebrandets medianpris. "
             "Print-andel = andel af taggede produkter, der ikke er ensfarvede. Farve-andel = andel uden for "
             "neutralerne sort, hvid, grå, brun, navy.")
    L.append("")

    L.append("## 1b. Stilafstand til referencebrandet")
    L.append("")
    if base is None:
        L.append("Intet self-brand: afstande kan ikke beregnes.")
    else:
        L.append("| Brand | Stilafstand (vægtet JS) | Overlap i (kategori × print × farve) | Kategori | Print | Farve | Silhuet | Materiale |")
        L.append("|---|---:|---:|---:|---:|---:|---:|---:|")
        for r in pos.distances.itertuples():
            if r.brand == sb:
                continue
            L.append(f"| {names.get(r.brand, r.brand)} | {_num(r.style_distance, 2)} | {_pct(r.overlap_with_self)} | "
                     f"{_num(r.d_category, 2)} | {_num(r.d_print, 2)} | {_num(r.d_colour_family, 2)} | "
                     f"{_num(r.d_silhouette, 2)} | {_num(r.d_material, 2)} |")
        L.append("")
        L.append("Jensen–Shannon-afstand mellem 0 (identisk mix) og 1 (intet fælles), vægtet med kategori og print "
                 "dobbelt, farve 1,5, silhuet og materiale 1, resten 0,5. Overlap = andel af brandets "
                 "(kategori, print, farve)-celler, som også findes hos referencebrandet. Lav afstand og højt overlap "
                 "er de brands, kunden reelt vælger imellem på hylden; det er dem, udsolgt-indekset skal vægtes mod.")
    L.append("")

    L.append("## 1c. Mix pr. attribut (top 3)")
    L.append("")
    attrs_show = ("category", "print", "colour_family", "silhouette", "material", "length")
    L.append("| Brand | " + " | ".join(a for a in attrs_show) + " |")
    L.append("|---|" + "---|" * len(attrs_show))
    for key, p in sorted(P.items(), key=lambda kv: (kv[1].role != "self", kv[0])):
        L.append(f"| {names.get(key, key)} | " + " | ".join(_top(p.mix.get(a)) for a in attrs_show) + " |")
    L.append("")

    L.append("## 2. Udledt kunde (produktets perspektiv)")
    L.append("")
    L.append("| Brand | Anledning i tekster: fest / arbejde / hverdag / ferie | Stemme i tekster: legende / feminin / minimal / bæredygtig / craft | Prisbånd | Størrelsesspænd | Sæsonkoder i tags |")
    L.append("|---|---|---|---|---|---|")
    for key, p in sorted(P.items(), key=lambda kv: (kv[1].role != "self", kv[0])):
        occ = " / ".join(_pct(p.occasion_words.get(k)) for k in ("fest", "arbejde", "hverdag", "ferie"))
        voice = " / ".join(_pct(p.voice_words.get(k)) for k in ("legende", "feminin", "minimal", "bæredygtig", "craft"))
        tier = "–"
        seasons = ", ".join(f"{k} ({n})" for k, n in p.season_tags.items()) or "–"
        if p.price_p50:
            tier = "high street" if p.price_p50 < 800 else "contemporary" if p.price_p50 < 2500 else \
                "premium" if p.price_p50 < 6000 else "luxury"
        L.append(f"| {names.get(key, key)} | {occ} | {voice} | {tier} | {p.size_system} {p.size_range} | {seasons} |")
    L.append("")
    L.append("Ordandele = andel af produkttekster, der nævner mindst ét ord fra lexikonet (se profile.py). "
             "Prisbånd efter medianpris i DKK: high street < 800, contemporary < 2.500, premium < 6.000, ellers luxury; "
             "tjek valuta.")
    L.append("")
    has_claude = any(p.implied for p in P.values())
    if has_claude:
        L.append("### 2b. Claude-læsning af udbuddets sprog (stikprøve af produkttekster)")
        L.append("")
        L.append("| Brand | Aldersbånd | Livsfase | Stilidentitet | Prisniveau | Stemme | Forskel fra referencen | Tillid |")
        L.append("|---|---|---|---|---|---|---|---:|")
        for key, p in sorted(P.items(), key=lambda kv: (kv[1].role != "self", kv[0])):
            if not p.implied:
                continue
            i = p.implied
            L.append(f"| {names.get(key, key)} | {i.get('age_band', '–')} | {i.get('life_stage', '–')} | "
                     f"{', '.join(i.get('style_identity', []))} | {i.get('price_tier', '–')} | {i.get('tone_of_voice', '–')} | "
                     f"{(i.get('distinct_from_self') or i.get('summary') or '').replace('|', '/')} | {i.get('confidence', 0):.2f} |")
        L.append("")
        L.append("Læsningen bygger på op til 40 tilfældige produkttekster pr. brand og er en udledning, ikke en måling. "
                 "Aldersbånd og livsfase skal valideres mod rigtige kundedata, før de bruges i beslutninger.")
    else:
        L.append("Sæt ANTHROPIC_API_KEY for at tilføje en Claude-læsning af udbuddets sprog (aldersbånd, livsfase, "
                 "stilidentitet, forskel fra referencen) pr. brand.")
    L.append("")
    return "\n".join(L)


def write_profile(report_date: str | None = None, data_dir: Path = DATA_DIR, reports_dir: Path | None = None,
                  use_claude: bool | None = None, model: str | None = None, client=None) -> Path:
    from .config import REPORTS_DIR, load_sources

    reports_dir = reports_dir or REPORTS_DIR
    dates = list_snapshot_dates(data_dir)
    if not dates:
        raise RuntimeError("no snapshots found")
    report_date = report_date or dates[-1]
    latest = max(d for d in dates if d <= report_date)
    snapshot = read_snapshot(latest, data_dir)
    tags = read_tags(data_dir)
    pos = positioning(snapshot, tags, report_date)
    if use_claude is None:
        use_claude = bool(os.environ.get("ANTHROPIC_API_KEY"))
    if use_claude:
        implied_customer_claude(pos.profiles, snapshot, pos.self_brand,
                                model or os.environ.get("TM_MODEL", "claude-haiku-5-5"), client=client)
    names = {b.key: b.name for b in load_sources().brands}
    text = render_profile(pos, names, load_taxonomy().version)
    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / f"profile-{report_date}.md"
    path.write_text(text, encoding="utf-8")
    return path
