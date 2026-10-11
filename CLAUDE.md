# trendmonitor

Daily snapshots of peer brands' public Shopify catalogues, diffed into sell-out events, tagged
against a closed taxonomy, summarised in a weekly Danish report. Client: Baum und Pferdgarten.
Read SPEC.md before changing the data model. `config/taxonomy.yaml` is the source of truth for
attributes; `config/sources.yaml` is the only list of allowed domains.

## Stack and conventions

Python ≥ 3.12, uv, ruff (line length 110), pytest. Parquet files under `data/`, DuckDB for queries,
pandas only for row-level transforms. CLI is argparse in `src/trendmonitor/cli.py`. Secrets only via
environment variables (`ANTHROPIC_API_KEY`, `TM_MODEL`, `TM_CONTACT`); never in the repo.

Commands: `uv sync` · `uv run pytest` · `uv run ruff check src tests` ·
`uv run trendmonitor probe|snapshot|diff|tag|report|run-daily|demo`.

Run `uv run pytest` before every commit. Keep functions small and pure where possible; I/O at the
edges (`storage.py`, `shopify.py`), logic in the middle (`diff.py`, `tagger.py`, `metrics.py`).

## Rules that must not be broken

- Fetch only domains listed in `config/sources.yaml`. Never add Instagram, TikTok, Vinted, Zalando
  or any marketplace. Never download or store images.
- Honour robots.txt, keep `request_delay_seconds` ≥ 1, always send the configured User-Agent.
- Store only the normalised rows in SPEC.md; never retain raw JSON responses.
- Tags must use values from `config/taxonomy.yaml` or null. Adding a value is a PR against that
  file plus a note in the report footer (taxonomy version bump).
- Products are tagged once. Re-tagging is an explicit command, never a side effect.
- The weekly report never presents sold-out counts as sales. Index against share of new
  assortment, mark n < 10 as "low n", print "calibration" instead of alerts before 8 weeks of data.
- Danish in reports, English in code and docs.

## Status

MVP built on fixtures (no live run yet). Next: first live probe + snapshot from a machine with
internet access, then validate the rule tagger against 50 designer-tagged products
(`data/gold/`), then enable the Claude tagger.
