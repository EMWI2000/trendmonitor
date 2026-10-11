from types import SimpleNamespace

from conftest import make_fetcher

from trendmonitor.config import ATTRIBUTES
from trendmonitor.snapshot import run_snapshot
from trendmonitor.storage import read_tags
from trendmonitor.tagger import ClaudeTagger, RuleTagger, run_tagging, taxonomy_tool


def test_rule_tagger_danish_and_english(taxonomy):
    t = RuleTagger(taxonomy)
    tag = t.tag("Ava slå-om kjole", "Dress", "Leopard,Brun", "Langærmet maxikjole i silke med leoprint. Til fest.")
    assert tag["category"] == "dress"
    assert tag["silhouette"] == "wrap"
    assert tag["print"] == "animal"
    assert tag["colour_family"] == "brown"
    assert tag["material"] == "silk"
    assert tag["sleeve"] == "long"
    assert tag["length"] == "maxi"
    assert tag["occasion"] == "occasion"
    assert tag["confidence"] == 1.0


def test_rule_tagger_prefers_title_for_colour(taxonomy):
    t = RuleTagger(taxonomy)
    tag = t.tag("Striped shirt, navy", "Shirt", "", "Style it with white trousers and a red bag.")
    assert tag["colour_family"] == "navy" and tag["print"] == "stripe" and tag["category"] == "shirt"


def test_rule_tagger_unknowns_are_none(taxonomy):
    tag = RuleTagger(taxonomy).tag("Mystery item", "", "", "")
    assert all(tag[a] is None for a in ATTRIBUTES) and tag["confidence"] == 0.0


def test_tool_schema_is_closed(taxonomy):
    tool = taxonomy_tool(taxonomy)
    props = tool["input_schema"]["properties"]
    assert set(ATTRIBUTES) <= set(props)
    assert props["print"]["enum"] == taxonomy.values("print") + ["unknown"]
    assert tool["input_schema"]["required"][-1] == "confidence"


class _FakeMessages:
    def __init__(self, inputs):
        self.inputs = inputs
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        block = SimpleNamespace(type="tool_use", name="record_tags", input=self.inputs)
        return SimpleNamespace(content=[block], usage=SimpleNamespace(input_tokens=500, output_tokens=40))


def test_claude_tagger_maps_unknown_to_none_and_counts_tokens(taxonomy):
    fake = SimpleNamespace(messages=_FakeMessages({
        "category": "dress", "silhouette": "unknown", "print": "floral", "colour_family": "yellow",
        "material": "viscose", "sleeve": "puff", "length": "midi", "occasion": "occasion",
        "confidence": 0.9, "notes": "secondary green leaves",
    }))
    tagger = ClaudeTagger(taxonomy, model="test-model", client=fake)
    tag = tagger.tag("Nora dress", "Dress", "", "...", "https://cdn.example.invalid/nora.jpg")
    assert tag["silhouette"] is None and tag["print"] == "floral" and tag["confidence"] == 0.9
    assert tagger.input_tokens == 500
    call = fake.messages.calls[0]
    assert call["tool_choice"] == {"type": "tool", "name": "record_tags"}
    assert call["messages"][0]["content"][0]["type"] == "image"


def test_run_tagging_escalates_weak_rule_tags_to_claude(tmp_path, sources, day1, taxonomy):
    data_dir = tmp_path / "data"
    # Make the blazer description uninformative so rules match < 4 attributes
    day1[1]["title"], day1[1]["tags"], day1[1]["body_html"], day1[1]["product_type"] = "Elin", [], "", ""
    run_snapshot(sources, date="2026-09-20", data_dir=data_dir, fetcher=make_fetcher(day1))
    fake = SimpleNamespace(messages=_FakeMessages({
        "category": "blazer", "silhouette": "oversized", "print": "stripe", "colour_family": "navy",
        "material": "wool", "sleeve": "long", "length": "unknown", "occasion": "work", "confidence": 0.8, "notes": "",
    }))
    tags = run_tagging("2026-09-20", data_dir, use_claude=True,
                       claude_factory=lambda tx: ClaudeTagger(tx, model="test-model", client=fake))
    by_id = tags.set_index("product_id")
    assert by_id.loc[102, "tagger"] == "claude:test-model" and by_id.loc[102, "category"] == "blazer"
    assert by_id.loc[101, "tagger"] == "rules"  # rich description: rules were enough
    assert len(fake.messages.calls) == 1
    assert len(read_tags(data_dir)) == 3
