import json
from pathlib import Path

import pytest

from trendmonitor.config import Brand, Sources, load_taxonomy
from trendmonitor.shopify import FetchResult

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def taxonomy():
    return load_taxonomy()


@pytest.fixture
def brand():
    return Brand(key="testbrand", name="Testbrand", url="https://testbrand.example.invalid", role="peer")


@pytest.fixture
def sources(brand):
    return Sources(brands=[brand], user_agent="trendmonitor-tests/0.1", request_delay_seconds=0)


@pytest.fixture
def day1():
    return json.loads((FIXTURES / "day1.json").read_text(encoding="utf-8"))["products"]


@pytest.fixture
def day2():
    return json.loads((FIXTURES / "day2.json").read_text(encoding="utf-8"))["products"]


def make_fetcher(products: list[dict]):
    def fetcher(brand: Brand) -> FetchResult:
        return FetchResult(brand.key, "ok", products, "DKK", 1, 0.0)

    return fetcher
