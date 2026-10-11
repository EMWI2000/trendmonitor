"""Load sources.yaml and taxonomy.yaml."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(os.environ.get("TM_ROOT", Path(__file__).resolve().parents[2]))
CONFIG_DIR = ROOT / "config"
DATA_DIR = Path(os.environ.get("TM_DATA_DIR", ROOT / "data"))
REPORTS_DIR = Path(os.environ.get("TM_REPORTS_DIR", ROOT / "reports"))

ATTRIBUTES = ("category", "silhouette", "print", "colour_family", "material", "sleeve", "length", "occasion")


@dataclass(frozen=True)
class Brand:
    key: str
    name: str
    url: str
    role: str = "peer"
    enabled: bool = True


@dataclass(frozen=True)
class Sources:
    brands: list[Brand]
    user_agent: str
    request_delay_seconds: float = 1.0
    page_size: int = 250
    max_pages: int = 40

    def enabled(self) -> list[Brand]:
        return [b for b in self.brands if b.enabled]

    def by_key(self, key: str) -> Brand:
        for b in self.brands:
            if b.key == key:
                return b
        raise KeyError(key)


@dataclass(frozen=True)
class Taxonomy:
    version: str
    attributes: dict[str, dict[str, list[str]]] = field(default_factory=dict)
    descriptions: dict[str, str] = field(default_factory=dict)

    def values(self, attribute: str) -> list[str]:
        return list(self.attributes[attribute].keys())

    def is_valid(self, attribute: str, value: str | None) -> bool:
        if value is None:
            return True
        if not isinstance(value, str):
            try:
                return bool(value != value)  # noqa: PLR0124 - float NaN counts as missing
            except TypeError:  # pandas NA: comparison result is ambiguous → treat as missing
                return True
        return value in self.attributes.get(attribute, {})


def load_sources(path: Path | None = None) -> Sources:
    path = path or CONFIG_DIR / "sources.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    ua = raw.get("user_agent", "trendmonitor/0.1")
    contact = os.environ.get("TM_CONTACT")
    if contact:
        ua = f"{ua.split(' (+')[0]} (+{contact})"
    brands = [
        Brand(
            key=b["key"],
            name=b["name"],
            url=b["url"].rstrip("/"),
            role=b.get("role", "peer"),
            enabled=bool(b.get("enabled", True)),
        )
        for b in raw["brands"]
    ]
    return Sources(
        brands=brands,
        user_agent=ua,
        request_delay_seconds=float(raw.get("request_delay_seconds", 1.0)),
        page_size=int(raw.get("page_size", 250)),
        max_pages=int(raw.get("max_pages", 40)),
    )


def load_taxonomy(path: Path | None = None) -> Taxonomy:
    path = path or CONFIG_DIR / "taxonomy.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    attributes: dict[str, dict[str, list[str]]] = {}
    descriptions: dict[str, str] = {}
    for name, spec in raw["attributes"].items():
        if name not in ATTRIBUTES:
            raise ValueError(f"taxonomy attribute {name!r} is not one of {ATTRIBUTES}")
        descriptions[name] = spec.get("description", name)
        attributes[name] = {
            str(value): [str(k).lower() for k in (keywords or [])] for value, keywords in spec["values"].items()
        }
    missing = set(ATTRIBUTES) - set(attributes)
    if missing:
        raise ValueError(f"taxonomy is missing attributes: {sorted(missing)}")
    return Taxonomy(version=str(raw.get("version", "0")), attributes=attributes, descriptions=descriptions)
