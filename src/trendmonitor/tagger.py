"""Attribute tagging against the closed taxonomy: rule-based first, Claude for the rest."""

from __future__ import annotations

import datetime as dt
import logging
import os
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pandas as pd

from .config import ATTRIBUTES, DATA_DIR, Taxonomy, load_taxonomy
from .storage import TAG_COLUMNS, append_tags, read_snapshot, read_tags

log = logging.getLogger(__name__)

DEFAULT_MODEL = os.environ.get("TM_MODEL", "claude-haiku-5-5")
MIN_RULE_ATTRIBUTES = 4
MIN_RULE_CONFIDENCE = 0.5

# Attributes whose values should be read from the title before the description, because
# descriptions mention many colours/materials (care instructions, styling tips).
TITLE_FIRST = ("colour_family", "print", "category")


# ----------------------------------------------------------------------------- rules

def _compile(keywords: list[str]) -> re.Pattern:
    # Word-boundary match; allow Danish compound suffixes (e.g. "kjolen", "blomstret") via \w*
    parts = [re.escape(k) + r"\w*" for k in sorted(keywords, key=len, reverse=True)]
    return re.compile(r"(?<!\w)(?:" + "|".join(parts) + r")", re.IGNORECASE)


class RuleTagger:
    def __init__(self, taxonomy: Taxonomy):
        self.taxonomy = taxonomy
        self.patterns: dict[str, dict[str, re.Pattern]] = {
            attr: {value: _compile(kws) for value, kws in values.items() if kws}
            for attr, values in taxonomy.attributes.items()
        }

    def tag(self, title: str, product_type: str, tags: str, body_text: str) -> dict[str, Any]:
        title_zone = " ".join(filter(None, [title, product_type, tags]))
        full_zone = " ".join(filter(None, [title_zone, body_text]))
        out: dict[str, Any] = {}
        for attr, patterns in self.patterns.items():
            zones = [title_zone, full_zone] if attr in TITLE_FIRST else [full_zone]
            out[attr] = self._first_match(patterns, zones)
        matched = sum(1 for a in ATTRIBUTES if out.get(a))
        out["confidence"] = round(matched / len(ATTRIBUTES), 2)
        out["notes"] = ""
        return out

    @staticmethod
    def _first_match(patterns: dict[str, re.Pattern], zones: list[str]) -> str | None:
        for zone in zones:
            best: tuple[int, str] | None = None
            for value, pattern in patterns.items():
                m = pattern.search(zone)
                if m and (best is None or m.start() < best[0]):
                    best = (m.start(), value)
            if best:
                return best[1]
        return None


# ----------------------------------------------------------------------------- claude

def taxonomy_tool(taxonomy: Taxonomy) -> dict[str, Any]:
    """Tool definition whose input schema is the taxonomy, so values outside it cannot occur."""
    props: dict[str, Any] = {}
    for attr in ATTRIBUTES:
        props[attr] = {
            "type": "string",
            "enum": taxonomy.values(attr) + ["unknown"],
            "description": taxonomy.descriptions.get(attr, attr) + ". Use 'unknown' if not determinable.",
        }
    props["confidence"] = {"type": "number", "minimum": 0, "maximum": 1,
                           "description": "Overall confidence that the tags are correct."}
    props["notes"] = {"type": "string", "maxLength": 200,
                      "description": "At most one short sentence on anything notable (e.g. secondary print)."}
    return {
        "name": "record_tags",
        "description": "Record the garment's attributes using only the allowed values.",
        "input_schema": {"type": "object", "properties": props, "required": list(ATTRIBUTES) + ["confidence"]},
    }


SYSTEM_PROMPT = (
    "You tag womenswear products for a Danish fashion brand's trend monitor. Use ONLY the allowed "
    "values in the tool schema; answer 'unknown' rather than guessing. Judge the product itself, not "
    "styling suggestions in the text. For colour, tag the dominant colour of the garment as sold; "
    "for print, 'solid' means no pattern. Descriptions may be in Danish or English."
)


class ClaudeTagger:
    def __init__(self, taxonomy: Taxonomy, model: str = DEFAULT_MODEL, use_images: bool = True, client=None):
        self.taxonomy = taxonomy
        self.model = model
        self.use_images = use_images
        self.tool = taxonomy_tool(taxonomy)
        if client is None:
            import anthropic  # imported lazily so the rules tagger works without the SDK configured

            client = anthropic.Anthropic()
        self.client = client
        self.input_tokens = 0
        self.output_tokens = 0

    def tag(self, title: str, product_type: str, tags: str, body_text: str, image_url: str | None) -> dict[str, Any]:
        text = (
            f"Title: {title}\nProduct type: {product_type or '-'}\nTags: {tags or '-'}\n"
            f"Description: {body_text or '-'}"
        )
        content: list[dict[str, Any]] = []
        if self.use_images and image_url:
            content.append({"type": "image", "source": {"type": "url", "url": image_url}})
        content.append({"type": "text", "text": text})
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=300,
            system=SYSTEM_PROMPT,
            tools=[self.tool],
            tool_choice={"type": "tool", "name": "record_tags"},
            messages=[{"role": "user", "content": content}],
        )
        usage = getattr(msg, "usage", None)
        if usage is not None:
            self.input_tokens += getattr(usage, "input_tokens", 0) or 0
            self.output_tokens += getattr(usage, "output_tokens", 0) or 0
        for block in msg.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "record_tags":
                raw = dict(block.input)
                out = {a: (None if raw.get(a) in (None, "unknown") else raw.get(a)) for a in ATTRIBUTES}
                out["confidence"] = float(raw.get("confidence", 0.0))
                out["notes"] = str(raw.get("notes", ""))[:200]
                return out
        raise RuntimeError("no record_tags tool call in response")


# ----------------------------------------------------------------------------- orchestration

def validate_tag(tag: dict[str, Any], taxonomy: Taxonomy) -> None:
    for attr in ATTRIBUTES:
        if not taxonomy.is_valid(attr, tag.get(attr)):
            raise ValueError(f"invalid {attr}={tag.get(attr)!r}")


def products_to_tag(snapshot: pd.DataFrame, existing_tags: pd.DataFrame) -> pd.DataFrame:
    products = snapshot.drop_duplicates("product_id")[
        ["brand", "product_id", "title", "product_type", "tags", "body_text", "image_url"]
    ]
    products = products[~products["product_id"].isin(existing_tags["product_id"])].reset_index(drop=True)
    # plain Python objects: pandas NA is ambiguous in boolean context
    return products.astype(object).where(products.notna(), None)


def run_tagging(
    date: str,
    data_dir: Path = DATA_DIR,
    taxonomy: Taxonomy | None = None,
    use_claude: bool | None = None,
    claude_factory: Callable[[Taxonomy], ClaudeTagger] | None = None,
    limit: int | None = None,
) -> pd.DataFrame:
    """Tag products in `date`'s snapshot that have no tag row yet. Returns the new tag rows."""
    taxonomy = taxonomy or load_taxonomy()
    snapshot = read_snapshot(date, data_dir)
    todo = products_to_tag(snapshot, read_tags(data_dir))
    if limit:
        todo = todo.head(limit)
    if todo.empty:
        log.info("nothing to tag for %s", date)
        return pd.DataFrame(columns=TAG_COLUMNS)

    if use_claude is None:
        use_claude = bool(os.environ.get("ANTHROPIC_API_KEY"))
    rules = RuleTagger(taxonomy)
    claude = None
    if use_claude:
        claude = claude_factory(taxonomy) if claude_factory else ClaudeTagger(taxonomy)

    now = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
    rows: list[dict] = []
    n_claude = 0
    for r in todo.itertuples(index=False):
        tag = rules.tag(r.title or "", r.product_type or "", r.tags or "", r.body_text or "")
        tagger_name = "rules"
        matched = sum(1 for a in ATTRIBUTES if tag.get(a))
        if claude is not None and (matched < MIN_RULE_ATTRIBUTES or tag["confidence"] < MIN_RULE_CONFIDENCE):
            try:
                tag = claude.tag(r.title or "", r.product_type or "", r.tags or "", r.body_text or "", r.image_url)
                tagger_name = f"claude:{claude.model}"
                n_claude += 1
            except Exception as exc:  # noqa: BLE001 - keep the rules tag, record the failure
                log.warning("claude tagging failed for %s/%s: %s", r.brand, r.product_id, exc)
                tag["notes"] = f"claude failed: {str(exc)[:120]}"
        validate_tag(tag, taxonomy)
        rows.append({"brand": r.brand, "product_id": int(r.product_id), "tagged_at": now, "tagger": tagger_name,
                     **{a: tag.get(a) for a in ATTRIBUTES}, "confidence": tag["confidence"],
                     "notes": tag.get("notes", "")})

    tags = pd.DataFrame(rows, columns=TAG_COLUMNS)
    append_tags(tags, data_dir)
    if claude is not None:
        log.info("tagged %d products, %d via Claude (%d input / %d output tokens)",
                 len(tags), n_claude, claude.input_tokens, claude.output_tokens)
    else:
        log.info("tagged %d products with rules only", len(tags))
    return tags
