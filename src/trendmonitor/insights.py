"""What the numbers mean for the self brand ("Hvad betyder det for Baum").

Fixed rules over the state, size, brand and positioning tables turn the indices into hypotheses the design
and buying team can act on: white space (peers sell out of a value the self brand hardly carries), strengths
to protect, risks (the self brand is heavy in a value peers do not sell out of), sizes that run out first,
markdown pressure and the nearest competitors. Every insight carries the n, the peer and self shares it rests
on and an evidence string, and the wording says "test" and "overvej", never "sælger": unavailable stock is
buy depth × demand, never sales. The same list feeds the weekly report and the dashboard.
"""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from .config import ATTRIBUTES
from .metrics import LAUNCH_WINDOW_DAYS, LOW_N
from .profile import ALPHA_SIZES, NUMERIC_SIZES

ATTR_DA = {
    "category": "kategori", "silhouette": "silhuet", "print": "print", "colour_family": "farvefamilie",
    "material": "materiale", "sleeve": "ærme", "length": "længde", "occasion": "anledning",
}

OVER_INDEX = 1.25  # peers sell out of the value clearly more than its share of assortment
UNDER_INDEX = 0.75  # clearly less
WHITE_SPACE_RATIO = 0.5  # self share below half of the peer share
HEAVY_RATIO = 1.5  # self share above one and a half times the peer share
MIN_SELF_SHARE = 0.05  # a risk needs the self brand to actually carry the value
SIZE_GAP = 0.10  # size unavailable share at least 10 points above the peer average
MIN_SIZE_N = 100  # live variants per size across peers before a size is called out
MARKDOWN_HEAVY = 0.5
PER_KIND_CAP = 2
MAX_ATTRIBUTE_INSIGHTS = 5
NEAREST_N = 3

SCOPE_DA = {"new": f"nyheder lanceret inden for {LAUNCH_WINDOW_DAYS // 7} uger", "all": "alle live varianter"}


def _pct(x: float | None, digits: int = 0) -> str:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return "–"
    return f"{100 * float(x):.{digits}f} %"


def _isnum(x) -> bool:
    return x is not None and not (isinstance(x, float) and math.isnan(x))


def _attribute_insights(state: pd.DataFrame, self_name: str) -> list[dict[str, Any]]:
    if state.empty or "state_index" not in state.columns:
        return []
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for scope in ("new", "all"):  # a value that qualifies among new launches is not repeated from "all"
        part = state[(state["scope"] == scope) & state["state_index"].notna() & ~state["low_n"]]
        for (attr, _), g in part.groupby(["attribute", "scope"]):
            live_total = int(g["live_n"].sum())
            avg_unavailable = float(g["unavailable_n"].sum() / live_total) if live_total else float("nan")
            for r in g.itertuples():
                key = (attr, str(r.value))
                if key in seen:
                    continue
                idx = float(r.state_index)
                peer_share = float(r.share_live)
                self_share = float(r.self_share_live) if _isnum(r.self_share_live) else 0.0
                self_unavailable = (float(r.self_unavailable_n) / float(r.self_live_n)) if r.self_live_n else None
                if idx >= OVER_INDEX and self_share < WHITE_SPACE_RATIO * peer_share:
                    kind = "white_space"
                elif idx >= OVER_INDEX and self_share >= peer_share:
                    kind = "strength"
                elif idx <= UNDER_INDEX and self_share >= max(HEAVY_RATIO * peer_share, MIN_SELF_SHARE):
                    kind = "risk"
                else:
                    continue
                seen.add(key)
                candidates.append(_attribute_sentence(
                    kind, attr, str(r.value), scope, idx, int(r.unavailable_n), int(r.live_n), peer_share,
                    float(r.unavailable_n) / float(r.live_n), avg_unavailable, self_share, self_unavailable,
                    int(r.self_live_n), self_name))
    candidates.sort(key=lambda c: c["strength"], reverse=True)
    # The strongest finding of every kind is always shown, so a white space never crowds out a strength or a
    # risk; the rest is filled by strength with a per-kind cap.
    chosen: list[dict[str, Any]] = []
    for kind in ("white_space", "strength", "risk"):
        first = next((c for c in candidates if c["kind"] == kind), None)
        if first:
            chosen.append(first)
    per_kind = {c["kind"]: 1 for c in chosen}
    for c in candidates:
        if c in chosen or per_kind.get(c["kind"], 0) >= PER_KIND_CAP or len(chosen) >= MAX_ATTRIBUTE_INSIGHTS:
            continue
        per_kind[c["kind"]] = per_kind.get(c["kind"], 0) + 1
        chosen.append(c)
    chosen.sort(key=lambda c: c["strength"], reverse=True)
    return chosen


def _attribute_sentence(kind, attr, value, scope, idx, n, live_n, peer_share, peer_unavailable, avg_unavailable,
                        self_share, self_unavailable, self_n, self_name) -> dict[str, Any]:
    label = ATTR_DA.get(attr, attr)
    where = SCOPE_DA[scope]
    peers = (f"Hos peers er {_pct(peer_unavailable)} af {where} med {value} uden lager mod {_pct(avg_unavailable)} "
             f"i gennemsnit (indeks {idx:.2f}, n={n}).")
    own = f"{self_name} har {_pct(self_share)} af sine live varianter i {value} mod peers' {_pct(peer_share)}."
    if kind == "white_space":
        title = f"Hvidt felt: {label} {value}"
        text = f"{peers} {own}"
        action = (f"Test {value} i næste drop i begrænset dybde, og følg indekset ugentligt, før dybden øges.")
    elif kind == "strength":
        title = f"Styrke at holde: {label} {value}"
        extra = (f" {_pct(self_unavailable)} af {self_name}s egne {value}-varianter er uden lager."
                 if self_unavailable is not None else "")
        text = f"{peers} {own}{extra}"
        action = (f"Sikr dybde og genopfyldning på {value}, og tjek størrelseskurven, så de små størrelser ikke "
                  f"løber tør først.")
    else:
        title = f"Risiko: {label} {value}"
        peers = (f"Hos peers er kun {_pct(peer_unavailable)} af {where} med {value} uden lager mod "
                 f"{_pct(avg_unavailable)} i gennemsnit (indeks {idx:.2f}, n={n}).")
        text = f"{peers} {own}"
        action = (f"Overvej dybden på {value} i kommende drops, og planlæg nedsættelserne, frem for at blive "
                  f"fanget med lager.")
    return {
        "kind": kind, "title": title, "text": text, "action": action,
        "attribute": attr, "value": value, "scope": scope,
        "peer_index": round(idx, 3), "peer_n": n, "peer_live_n": live_n, "peer_share": peer_share,
        "peer_unavailable_share": peer_unavailable, "avg_unavailable_share": avg_unavailable,
        "self_share": self_share, "self_unavailable_share": self_unavailable, "self_n": self_n,
        "strength": abs(math.log(idx)) * math.sqrt(n), "low_n": n < LOW_N,
        "evidence": f"sold_out_state[{scope}] × positioning.mix; variants in the latest snapshot",
    }


def _size_insight(size_depletion: pd.DataFrame, self_brand: str | None, self_name: str) -> dict[str, Any] | None:
    if size_depletion.empty:
        return None
    canonical = set(ALPHA_SIZES) | set(NUMERIC_SIZES)
    sd = size_depletion[size_depletion["size"].isin(canonical)]
    peers = sd[sd["role"] != "self"].groupby("size")[["live_variants", "unavailable_variants"]].sum()
    peers = peers[peers["live_variants"] >= MIN_SIZE_N]
    if peers.empty:
        return None
    avg = float(peers["unavailable_variants"].sum() / peers["live_variants"].sum())
    peers["share"] = peers["unavailable_variants"] / peers["live_variants"]
    hot = peers[peers["share"] >= avg + SIZE_GAP].sort_values("share", ascending=False).head(3)
    if hot.empty:
        return None
    own = sd[sd["brand"] == self_brand].set_index("size") if self_brand else pd.DataFrame()
    parts = []
    rows = []
    for size, r in hot.iterrows():
        own_share = float(own.loc[size, "unavailable_share"]) if size in own.index else None
        parts.append(f"{size} er uden lager i {_pct(r['share'])} af peers' varianter"
                     + (f" ({self_name}: {_pct(own_share)})" if own_share is not None else ""))
        rows.append({"size": size, "peer_share": float(r["share"]), "peer_n": int(r["live_variants"]),
                     "self_share": own_share})
    sizes = ", ".join(hot.index.astype(str))
    return {
        "kind": "sizes", "title": f"Størrelser, der løber tør først hos peers: {sizes}",
        "text": "; ".join(parts) + f". Gennemsnit på tværs af størrelser hos peers: {_pct(avg)}.",
        "action": (f"Tjek størrelseskurven i indkøbet: læg flere af de størrelser, hvis {self_name}s egne tal viser "
                   f"samme mønster, og hold øje med dem i ugens udsolgt-events."),
        "sizes": rows, "avg_unavailable_share": avg,
        "strength": float(hot["share"].iloc[0] - avg) * 10, "low_n": False,
        "evidence": "size_depletion, peers aggregated per size; canonical alpha and numeric sizes only",
    }


def _markdown_insight(brands: pd.DataFrame, self_brand: str | None, names: dict[str, str], self_name: str):
    if brands.empty or "markdown_share" not in brands.columns:
        return None
    peers = brands[(brands["role"] != "self") & brands["markdown_share"].notna()]
    heavy = peers[peers["markdown_share"] >= MARKDOWN_HEAVY].sort_values("markdown_share", ascending=False)
    if heavy.empty:
        return None
    own = brands[brands["brand"] == self_brand] if self_brand else pd.DataFrame()
    own_share = float(own["markdown_share"].iloc[0]) if len(own) and _isnum(own["markdown_share"].iloc[0]) else None
    disc = heavy["median_discount"].dropna()
    listed = ", ".join(f"{names.get(r.brand, r.brand)} ({_pct(r.markdown_share)})" for r in heavy.head(4).itertuples())
    return {
        "kind": "markdown",
        "title": f"Prispres: {len(heavy)} af {len(peers)} peers har over halvdelen af varianterne nedsat",
        "text": (f"{listed}. Median rabat hos dem: {_pct(float(disc.median())) if len(disc) else '–'}."
                 + (f" {self_name}: {_pct(own_share)} nedsat." if own_share is not None else "")),
        "action": ("Forvent prisfølsomme kunder i de kategorier, peers nedsætter. Hold fuldprisandelen på nyheder, "
                   "og planlæg markdown-takten frem for at følge med ned."),
        "peer_count": len(heavy), "peer_total": len(peers), "self_share": own_share,
        "strength": float(len(heavy)) / max(len(peers), 1) * 5, "low_n": False,
        "evidence": "brands.markdown_share (compare_at_price > price) in the latest snapshot",
    }


def _nearest_insight(distances: pd.DataFrame, names: dict[str, str], self_name: str) -> dict[str, Any] | None:
    if distances.empty or "style_distance" not in distances.columns:
        return None
    peers = distances[(distances["role"] != "self") & distances["style_distance"].notna()]
    nearest = peers.sort_values("style_distance").head(NEAREST_N)
    if nearest.empty:
        return None
    parts = [f"{names.get(r.brand, r.brand)} (stilafstand {r.style_distance:.2f}, prisindeks "
             f"{r.price_index:.2f}, overlap {_pct(r.overlap_with_self)})" if _isnum(r.price_index)
             else f"{names.get(r.brand, r.brand)} (stilafstand {r.style_distance:.2f})"
             for r in nearest.itertuples()]
    labels = [names.get(b, b) for b in nearest["brand"]]
    return {
        "kind": "nearest",
        "title": "Nærmeste konkurrenter om samme kunde: " + ", ".join(labels),
        "text": f"Mindste stilafstand til {self_name}: " + "; ".join(parts) + ".",
        "action": "Læs udsolgt-indekset mod disse brands først; det er dem, kunden vælger imellem på hylden.",
        "brands": [{"brand": r.brand, "style_distance": float(r.style_distance),
                    "price_index": float(r.price_index) if _isnum(r.price_index) else None,
                    "overlap_with_self": float(r.overlap_with_self) if _isnum(r.overlap_with_self) else None}
                   for r in nearest.itertuples()],
        "strength": 1.0, "low_n": False,
        "evidence": "positioning.distances: weighted Jensen–Shannon distance on the attribute mix",
    }


RULES = {
    "over_index": OVER_INDEX, "under_index": UNDER_INDEX, "white_space_ratio": WHITE_SPACE_RATIO,
    "heavy_ratio": HEAVY_RATIO, "min_self_share": MIN_SELF_SHARE, "size_gap": SIZE_GAP, "min_size_n": MIN_SIZE_N,
    "markdown_heavy": MARKDOWN_HEAVY, "per_kind_cap": PER_KIND_CAP, "max_attribute_insights": MAX_ATTRIBUTE_INSIGHTS,
    "nearest_n": NEAREST_N, "low_n": LOW_N, "launch_window_days": LAUNCH_WINDOW_DAYS,
}


def compute_insights(state: pd.DataFrame, size_depletion: pd.DataFrame, brands: pd.DataFrame,
                     distances: pd.DataFrame, self_brand: str | None, names: dict[str, str]) -> list[dict[str, Any]]:
    """Ordered list of insight dicts (strongest attribute findings first, then sizes, markdown, nearest)."""
    self_name = names.get(self_brand, self_brand) if self_brand else "referencebrandet"
    out = _attribute_insights(state, self_name)
    for item in (_size_insight(size_depletion, self_brand, self_name),
                 _markdown_insight(brands, self_brand, names, self_name),
                 _nearest_insight(distances, names, self_name)):
        if item:
            out.append(item)
    for i, item in enumerate(out):
        item["rank"] = i + 1
        item["attribute_label"] = ATTR_DA.get(item.get("attribute", ""), item.get("attribute"))
    return out


__all__ = ["ATTRIBUTES", "ATTR_DA", "RULES", "compute_insights"]
