# SPEC — trendmonitor MVP

Daily snapshots of peer brands' public Shopify catalogues, diffed into sell-out events, tagged
against a closed attribute taxonomy, summarised weekly. Builder: Claude Code. Runtime: GitHub
Actions (cron) calling the Claude API for tagging. No scraping beyond `config/sources.yaml`.

## Pipeline

```
sources.yaml ─► snapshot ─► data/snapshots/YYYY-MM-DD.parquet
                              │
                              ├─► diff (vs previous snapshot) ─► data/events.parquet (append)
                              │
                              └─► tag (new product_ids only) ─► data/tags.parquet (append)
                                                                        │
weekly: snapshots + events + tags ─► metrics ─► reports/YYYY-Www.md ◄───┘
```

Daily job: `trendmonitor run-daily` (snapshot → diff → tag). Weekly job: `trendmonitor report`.
Both are idempotent for a given date: re-running the same day overwrites that day's snapshot and
replaces that day's events; tags are only ever added for product_ids not yet tagged.

## Sources

`config/sources.yaml` lists brands with `url`, `role` (self | peer | benchmark) and `enabled`.
Fetch `{url}/products.json?limit=250&page=N` until an empty page or `max_pages`. Also fetch
`{url}/meta.json` once per run for currency. Honour `robots.txt` (skip brand if `/products.json`
is disallowed for `*`), sleep `request_delay_seconds` between requests, send the configured
User-Agent, retry 429/5xx three times with backoff, give up on the brand after that and record
`status` in `data/runs.parquet`. A brand that returns non-JSON or 404 is recorded as
`not_shopify_or_disabled` and skipped, never retried within the run.

## Data model

All tables are parquet. Dates are ISO strings (`YYYY-MM-DD`) in UTC; timestamps are ISO-8601.

### snapshots — one row per variant per day

| column | type | note |
|---|---|---|
| snapshot_date | str | run date (UTC) |
| brand | str | sources.yaml key |
| role | str | self / peer / benchmark |
| product_id | int64 | Shopify product id |
| handle | str | |
| title | str | |
| product_type | str | may be empty |
| vendor | str | |
| tags | str | comma-joined |
| body_text | str | HTML stripped, first 600 chars |
| published_at | str | ISO-8601 or null |
| created_at | str | |
| updated_at | str | |
| image_url | str | first image, may be null |
| variant_id | int64 | |
| sku | str | |
| option1 / option2 / option3 | str | raw Shopify option values |
| size | str | option value matched against a size vocabulary; else null |
| price | float | parsed from string |
| compare_at_price | float | null when not on sale |
| available | bool | the only public stock signal |
| currency | str | explicit from sources.yaml, else meta.json |
| price_dkk / compare_at_dkk | float | converted with `fx_to_dkk` from sources.yaml |
| season_tag | str | season code found in tags (SS27, FW26, PS25, "SEASON-264"), else null |

Products are dropped before normalisation when they match the brand's `exclude_types` /
`exclude_tags`, or when they have no available variant and were published more than `live_days`
(120) ago; otherwise outlet archives of thousands of dead products dominate every metric.

### events — one row per change, appended daily

| column | type | note |
|---|---|---|
| event_date | str | snapshot date on which the change was observed |
| brand | str | |
| product_id | int64 | |
| variant_id | int64 | null for product-level events |
| event_type | str | see below |
| prev_value | str | stringified previous value |
| new_value | str | stringified new value |

Event types, derived by joining today's snapshot to the previous snapshot on `variant_id`:

- `new_product`: product_id present today, absent yesterday (product-level, one row).
- `delisted`: product_id present yesterday, absent today (product-level). Ambiguous: sold out and
  hidden, or withdrawn. Reported separately, never counted as sold out.
- `sold_out`: variant `available` true → false.
- `restock`: variant `available` false → true.
- `markdown`: variant gains a `compare_at_price` > price, or price drops ≥ 5 % with unchanged
  compare_at_price.
- `price_change`: any other price change.
- `product_sold_out`: all variants of a product are unavailable today and at least one was
  available yesterday (product-level).

The first snapshot for a brand produces no events (no baseline), only a `runs` row.

Availability can flicker between true and false within seconds on some stores. The diff is
computed on daily snapshots only; the weekly metrics use counts of sold_out events net of
restocks within 7 days for the same variant (`net_sold_out`).

### tags — one row per product_id, written once

| column | type | note |
|---|---|---|
| brand | str | |
| product_id | int64 | |
| tagged_at | str | ISO-8601 |
| tagger | str | `rules` or `claude:<model>` |
| category, silhouette, print, colour_family, material, sleeve, length, occasion | str | values from taxonomy.yaml or null |
| confidence | float | 0–1; rules tagger reports share of attributes matched |
| notes | str | free text from the Claude tagger, max 200 chars |

Validation: a tag row with a value outside `config/taxonomy.yaml` is rejected and the product is
re-queued. The Claude tagger uses forced tool use with an enum per attribute generated from the
taxonomy, so invalid values cannot occur; the rule tagger can only emit taxonomy values by
construction.

### runs — one row per brand per run

| column | type |
|---|---|
| run_date, brand, status (ok / not_shopify_or_disabled / robots_disallow / http_error), products, variants, pages, seconds, error |

## Tagging

Order: rules first (free, deterministic, always), then Claude for products the rules tagger left
with fewer than 4 of 8 attributes or confidence < 0.5, when `ANTHROPIC_API_KEY` is set. The Claude
tagger sends title, product_type, tags, body_text and the first image (by URL) and receives one
tool call whose input schema is the taxonomy. Products are tagged once; re-tagging requires
deleting the row. Model is `TM_MODEL` (default `claude-haiku-5-5`; any current Claude model id works). Keep cost visible: the run
log prints products tagged and estimated input tokens.

## Metrics (weekly, computed in DuckDB from the three tables)

Per brand, for the ISO week ending on the report date:

- `live_products`, `new_products` (new_product events in week), `sold_out_variants`
  (net_sold_out in week), `products_fully_sold_out`, `restocks`.
- `sell_out_rate_4w`: among products with `new_product` 22–35 days before report date, share with
  ≥ 1 net sold_out event since launch. Also 2w and 8w.
- `median_days_to_first_sold_out`: among products launched in the last 12 weeks that have at least
  one sold_out event.
- `markdown_share`: share of live variants with compare_at_price > price on the report date;
  `median_discount` = median (1 − price / compare_at_price).
- `sizes_first_out`: distribution of `size` among sold_out events in the week.

Per attribute value (across all peer/benchmark brands, excluding `self`):

- `share_new`: share of products launched in the last 8 weeks carrying the value.
- `share_sold_out`: share of net sold_out events in the last 8 weeks whose product carries the
  value.
- `demand_index = share_sold_out / share_new` (null when share_new < 2 % or fewer than 8 launches). Reported with counts;
  an index on fewer than 10 sold-out events is marked "low n".
- `weekly_sold_out_count` time series per attribute value, 12 weeks, with a robust baseline:
  rolling 8-week median and MAD. `alert` when this week > median + 2 × 1.4826 × MAD and ≥ 8
  weeks of history exist. Before that the report prints "calibration" instead of alerts.

Seasonal confounds (CPHFW weeks, sales periods) are not modelled in the MVP; they are listed in
the report header when the week overlaps a date range in `config/calendar.yaml` (optional file).

## Report

`reports/YYYY-Www.md`, Danish, one page: header (period, brands covered, data-quality notes),
three to five movements each with direction, size and source table, then the brand table, the
attribute index table (top 10 by demand_index with n ≥ 10), the alert list or calibration note,
and a "what changed in coverage" footer (brands that failed, taxonomy version).

## Profile (style and positioning)

`profile.py` reads the latest snapshot and tags. Per brand: attribute mix (share per value, tagged
products only), price p25/p50/p75 and bands (<1.000, 1.000–1.999, 2.000–2.999, 3.000+), dress median,
size system (alfa/numerisk) and range, newness (published_at within 56 days), markdown share, print
share (1 − solid), non-neutral colour share, occasion and voice word shares from title + body_text.
Positioning vs. the `self` brand: Jensen–Shannon distance per attribute, weighted mean
(category 2, print 2, colour 1.5, silhouette 1, material 1, others 0.5), overlap = share of the brand's
(category, print, colour_family) cells present in the self brand, price index = p50 / self p50.
Optional Claude read (`record_profile` tool, closed enums) on ≤ 40 sampled product texts per brand with
the self brand's sample as reference. Output `reports/profile-YYYY-MM-DD.md`. The implied-customer
section is labelled as an inference from the offer; it is not demographic data.

## Non-goals for the MVP

No image embeddings, no Instagram/TikTok/Pinterest, no Google Trends, no Power BI model, no
Azure. These attach later as additional sources feeding the same `events`/`tags` shape.

## Legal and courtesy rules (enforced in code)

Only `sources.yaml` domains; robots.txt honoured; 1 request/second per domain; identified
User-Agent; no images downloaded or stored (the Claude tagger passes the image URL, which the
API fetches); product data only, no personal data; raw JSON is not retained, only the normalised
rows above.
