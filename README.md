# trendmonitor

MVP: daily snapshots of peer brands' public Shopify catalogues → sell-out events → attribute tags
(closed taxonomy, rules + Claude) → weekly Danish report. Built for Baum und Pferdgarten's trend
foresight work. Design rationale is in SPEC.md; working rules for Claude Code in CLAUDE.md.

## Try it offline (2 minutes)

```bash
uv sync
uv run pytest -q                 # 17 tests
uv run trendmonitor demo         # 70 synthetic days → data/ and reports/2026-Www.md
```

The demo uses invented catalogues with built-in hazards (floral and lace sell faster), so the
report should show those attributes over-indexed. Delete `data/` and `reports/` before going live.

## Go live (30 minutes)

1. Push this folder to a private GitHub repo. Actions is the runtime: `daily.yml` snapshots at
   04:17 UTC and commits parquet files under `data/`; `weekly.yml` writes `reports/YYYY-Www.md`
   on Mondays. Both are also runnable from the Actions tab (`workflow_dispatch`).
2. Repository → Settings → Secrets and variables → Actions:
   secret `ANTHROPIC_API_KEY` (optional; without it tagging is rules-only),
   variables `TM_MODEL` (default `claude-haiku-5-5`) and `TM_CONTACT` (an email or URL put in
   the User-Agent, so store owners can reach you).
3. The peer set was verified by a browser probe on 2026-10-11 (docs/probe-2026-10-11.md): 14 Shopify
   stores enabled, 6 non-Shopify brands kept disabled. Re-verify any time with `uv run trendmonitor probe`.
4. Run the daily workflow once by hand, check `data/runs.parquet`, then let the schedule run.
   Events start on day 2; the attribute index becomes meaningful after ~4 weeks; alerts switch
   on after 8 weeks of history (the report says "Kalibrering" until then).

Rough running cost: GitHub Actions free tier covers ~10 min/day; Claude tagging only touches new
products (tens per day across the peer set), well under USD 10/month on Haiku.

## Commands

```
uv run trendmonitor probe                  # first page of every brand, writes data/probe.json
uv run trendmonitor snapshot [--date D] [--brand key]
uv run trendmonitor diff [--date D]
uv run trendmonitor tag [--date D] [--no-claude] [--limit N]
uv run trendmonitor report [--date D]
uv run trendmonitor profile [--date D] [--no-claude]   # style + positioning profile vs. the self brand
uv run trendmonitor export [--date D] [--out DIR]       # dashboard tables as JSON (default data/export/)
uv run trendmonitor run-daily [--no-claude]
uv run trendmonitor demo [--days 70] [--seed 7]
```

`--data-dir` and `--reports-dir` override the default `data/` and `reports/`. `snapshot --brand key`
re-fetches only that store and merges it into the day's existing snapshot: the other brands' rows are
kept and a failed fetch keeps the brand's old rows, so it is safe for retrying one store after a 429/430.

## Layout

```
config/sources.yaml     peer set (the only allowed domains) and politeness settings
config/taxonomy.yaml    closed attribute taxonomy with Danish/English keywords
src/trendmonitor/
  shopify.py            polite client (robots.txt, delay, UA, retries) + normalisation
  snapshot.py           daily run, writes data/snapshots/YYYY-MM-DD.parquet + data/runs.parquet
  diff.py               events: new_product, delisted, sold_out, restock, markdown, price_change, product_sold_out
  tagger.py             RuleTagger (free) and ClaudeTagger (forced tool use, enum = taxonomy)
  metrics.py            DuckDB: brand table, attribute demand index, 12-week series, robust alerts
  report.py             Danish markdown weekly report
  profile.py            assortment profile per brand, JS distance and overlap vs. self brand, implied-customer read
  demo.py               synthetic catalogues for offline runs
tests/                  fixtures with two consecutive days + unit and end-to-end tests
.github/workflows/      ci.yml, daily.yml, weekly.yml
```

## Style and positioning profile

`trendmonitor profile` writes `reports/profile-YYYY-MM-DD.md` (also run by the weekly workflow): per brand
the attribute mix, price architecture (quartiles, bands, dress median, price index vs. the self brand),
size system and range, newness, markdown share, print share and non-neutral colour share; then a
weighted Jensen–Shannon style distance and a (category × print × colour) overlap score against the self
brand, so the sell-out index can be read against the brands the customer actually chooses between.
Section 2 is an implied-customer read: occasion and tone-of-voice word shares from product texts,
price tier, size span, and (with `ANTHROPIC_API_KEY`) a Claude read of sampled descriptions giving age
band, life stage, style identity and how the offer differs from Baum's. That section describes the
offer, not the buyer: demographics need Baum's own customer data (Shopify customer reports, Meta
Audience Insights, newsletter data), which is the natural next input.

## Export for the dashboard

`trendmonitor export` writes the tables the weekly report and the profile are built from as JSON under
`data/export/` (`meta.json`, `brands.json`, `attributes.json`, `series.json`, `alerts.json`, `sizes.json`,
`movements.json`, `sold_out_state.json`, `size_depletion.json`, `launch_calendar.json`, `positioning.json`,
`runs.json`, `taxonomy.json`). Both workflows run it, so the files always match the latest snapshot. They hold
aggregates only (counts, shares, quantiles): no product rows, texts or image URLs. `sold_out_state.json` is
the day-one view of "what is sold out at the peers right now": for every attribute value, the share of
unavailable variants against the share of live variants, overall and for launches in the last 8 weeks, with
the same low-n flag as the report. `web/` is the Next.js dashboard that reads these files at build time.

## Dashboard (web/)

`web/` is a Next.js 15 site that renders the exported JSON into seven Danish pages (overview with a "Kort
fortalt" summary, next-meeting steps and the "Hvad betyder det for Baum" insight cards from `insights.json`,
what is sold out now incl. Baum's own position per attribute value, attribute index over time, brands,
positioning, data quality incl. tag coverage per attribute, and a method page `/metode` with formulas, a
worked example and every caveat), server-side at build time and with the same guard rails as the report: no
sales claims, n always shown, "lavt n" below 10, a "Kalibrering" banner until 8 weeks of history. Every chart
and table carries a collapsed "Sådan er det regnet" note linking to the method page; thresholds the export
carries are read from it, the rest is mirrored from the Python constants in `web/lib/method.ts`. It deploys on Vercel with Root Directory = `web` and redeploys when a push
to `main` changes `web/` or `data/export/`, so the daily GitHub Actions commit is what refreshes it. Setup and
details: [web/README.md](web/README.md).

## What the numbers mean

Sold-out is buy depth × demand, never sales. Every attribute number is a share of net sold-out
events (sold_out minus a restock of the same variant within 7 days) divided by the attribute's
share of products launched in the last 8 weeks, across peer and benchmark brands (never the
`self` brand). An index of 1.5 means the attribute is over-represented among sell-outs by 50 %
relative to how much of it the peers put out. n < 10 is flagged. Delisted products are reported
but never counted as sold out.

## Next steps (in order)

1. Live probe + first snapshot; fix `size_option` quirks per brand if sizes land in option2.
2. 50 products hand-tagged by the design team into `data/gold/` and an eval command
   (rules vs. Claude vs. gold), before enabling Claude tagging in the schedule.
3. Taxonomy v0.2 with the design team's own print families.
4. Power BI over `data/*.parquet` (DuckDB ODBC or a daily CSV export).
5. Additional sources with the same `events`/`tags` shape: own sell-through, Instagram Hashtag
   API (after App Review), Google Trends proxy, runway counts.
