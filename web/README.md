# trendmonitor-web

Next.js 15 dashboard over the JSON tables in `../data/export/`, written by `uv run trendmonitor export`.
It answers "what characterises what is sold out at the peers right now" and shows the supporting metrics
(attribute index over time, brand table, positioning, data quality). Everything is rendered on the server
at build time from the JSON files; the browser receives static HTML plus small client components for the
Recharts charts, sortable tables and tabs. No images, no product-level data, no external requests, no
analytics, no web fonts.

The hard rules from `CLAUDE.md` and `meta.json` are carried in the UI: sold-out counts are never presented
as sales, indices are read against share of assortment, n is always shown and n below `thresholds.low_n`
is marked "lavt n", and while `meta.calibration` is true every page shows the "Kalibrering" banner and
nothing is called an alert.

## Pages

| Route            | Content                                                                                   | Files read                                              |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `/`              | Coverage line, stat tiles, "Ugens bevægelser", top state indices                          | meta, runs, brands, size_depletion, launch_calendar, movements, sold_out_state |
| `/udsolgt`       | "Kort fortalt" cross-attribute headline, sold-out state index per attribute (scope all / new), brand × size depletion table | meta, taxonomy, sold_out_state, size_depletion |
| `/attributter`   | 8-week sold-out index per attribute (net events vs. launches), 12-week series as small multiples, alerts or calibration note | meta, taxonomy, attributes, series, alerts |
| `/brands`        | Sortable brand table for the report week                                                  | meta, brands                                            |
| `/positionering` | Price index vs. style distance scatter, profile table, attribute-mix comparison           | meta, taxonomy, positioning                             |
| `/data`          | Runs table, tagged share per brand, sources, method and limits                            | meta, runs, positioning                                 |

## Run locally

Requires Node 20 or newer.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run build      # type-checks and renders every page; fails loudly if data/export is missing
npm run start
```

The export directory defaults to `../data/export` relative to `web/`. Override it with
`TM_EXPORT_DIR=/path/to/export` (absolute, or relative to the current working directory). If
`meta.json` is missing, the build stops with a message telling you to run `uv run trendmonitor export`
in the repository root. In `next dev` the JSON is memoised per process: restart the dev server after
re-running the export.

## Deploy on Vercel

1. Import the GitHub repository in Vercel (New Project → Import).
2. Set **Root Directory** to `web`. Keep **Include source files outside of the Root Directory** enabled:
   the build reads `../data/export/*.json`, which lives in the repository root.
3. Framework preset: Next.js. Node.js version: 20 or newer. Build command and output directory stay at the
   defaults (`next build`).
4. Protect the deployment before sharing the URL: enable **Vercel Authentication** (Settings → Deployment
   Protection) so only team members can open it, or add a password gate as Next.js middleware later. The
   project deliberately does not use `output: "export"` so middleware can be added without changing the
   data flow.
5. A push to `main` that changes `web/` or `data/export/` triggers a redeploy. Because the pages are
   rendered at build time, a redeploy is what refreshes the numbers. `web/vercel.json` pins this with an
   `ignoreCommand` (`git diff --quiet HEAD^ HEAD -- . ../data/export`): the daily commit touches only
   `data/`, nothing under the Root Directory, and Vercel's default "Automatic" Ignored Build Step may skip
   such commits, which would silently stop the dashboard from refreshing. The command exits 0 (skip) only
   when neither path changed; any git error also builds. If you remove the file, set Settings → Git →
   Ignored Build Step to a script that exits 1 for commits that change `data/export/`.

## How the data flows

```
GitHub Actions daily.yml (04:17 UTC)  ──►  uv run trendmonitor run-daily
                                       ──►  uv run trendmonitor export     (writes data/export/*.json)
                                       ──►  git commit + push to main      (data: snapshot YYYY-MM-DD)
                                                        │
Vercel (Root Directory = web)  ◄── push to main ────────┘
  next build reads ../data/export/*.json  ──►  static pages
```

`weekly.yml` does the same on Mondays after writing the report and the profile, so the dashboard always
matches the latest committed export. If a day's snapshot fails, the previous export stays in place and
`/data` shows the failed run.

## Layout

```
app/                 App Router pages (server components) and layout
components/          UI pieces; files starting with "use client" are the only browser-side code
lib/types.ts         TypeScript shapes of every exported JSON file
lib/data.ts          server-only loaders (node:fs), brandName / isSelf helpers
lib/format.ts        Danish number and date formatting (Intl da-DK), pure
lib/labels.ts        Danish labels for attributes, roles, scopes; size ordering, pure
lib/text.ts          Danish sentences for movements.json, same wording as the weekly report
vercel.json          Ignored Build Step: build when web/ or ../data/export changed
```

Conventions: Danish in the UI, English in code and comments; Tailwind classes only (literal class names in
app/, components/ and lib/, all three scanned by `tailwind.config.ts`); Recharts v2 only (BarChart,
LineChart, ScatterChart); numbers that can be NaN in pandas are typed `number | null` and rendered as "–".

Number formatting follows Intl da-DK as the weekly report does: decimal comma, period as thousands
separator ("3.478"), and a no-break space before "%" so "33 %" never wraps with the sign alone
(`fmtPct` in `lib/format.ts`; literal percentages in JSX use `&nbsp;%`). Exporter source tokens in
movement sentences are translated by `sourceLabel` in `lib/text.ts`.

## Current deployment

The Vercel project `eb-10/trendmonitor` (Hobby) builds from the mirror repository `EB10/trendmonitor`, pushed
from the canonical `EMWI2000/trendmonitor` main. Hobby teams block deployments from commits whose GitHub author
is not the team owner, so deployments must come from commits authored by EB10 (or from a Deploy Hook) until the
project moves to a Pro team connected to the canonical repository.
