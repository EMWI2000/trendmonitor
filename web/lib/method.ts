// Pipeline constants that the export does not carry, mirrored here in one place so the method texts can
// name them. Everything that IS exported (low_n, min_launched, baseline_weeks, series_weeks,
// launch_window_days, taxonomy version, the insight rules) must be read from meta.json / insights.json,
// never from this file. Keep each line in sync with the Python source named in its comment.
// Pure module: safe to import from client components.
//
// Since the export carries the same values in meta.json "method", `assertMethodMirror` (called by
// lib/data.ts loadMeta at build time) fails the build if any line here drifts from the Python.

import type { MetaMethod } from "./types";

/** metrics.py, view net_sold_out: a sold_out is cancelled by a restock of the same variant within this many days. */
export const RESTOCK_WINDOW_DAYS = 7;

/** metrics.py: no state_index / demand_index when the value's share of live (or launched) variants is below this. */
export const MIN_SHARE_FOR_INDEX = 0.02;

/** config/sources.yaml live_days: a product is kept when any variant is available or it was published within this window. */
export const LIVE_DAYS = 120;

/** metrics.py MIN_ALERT_COUNT: a week needs at least this many net sold-out events before it can be an alert. */
export const MIN_ALERT_COUNT = 5;

/** metrics.py: threshold = median + 2 × 1.4826 × MAD (1.4826 scales MAD to a standard deviation). */
export const MAD_SCALE = 1.4826;
/** The same factor with a Danish decimal comma, for prose (fmtNum caps at two decimals). */
export const MAD_SCALE_LABEL = "1,4826";

/** diff.py MARKDOWN_DROP: a price fall of more than this share (with unchanged compare_at_price) is a markdown event. */
export const MARKDOWN_DROP = 0.05;

/** tagger.py: Claude only tags products where the rules found fewer than this many of the 8 attributes ... */
export const MIN_RULE_ATTRIBUTES = 4;
/** ... or the rule confidence (matched / 8) is below this. */
export const MIN_RULE_CONFIDENCE = 0.5;

/** metrics.py _brand_table: cohort windows in days since launch for the sell-out rates. */
export const COHORT_4W_DAYS: readonly [number, number] = [22, 35];
/** metrics.py _brand_table: median days to first sold-out counts products launched at most this many days ago. */
export const MEDIAN_DAYS_MAX_AGE = 84;

/** metrics.py _movements: an over-index movement needs demand_index at least this ... */
export const MOVEMENT_OVER_INDEX = 1.4;
/** ... and sold_out_n at least LOW_N, or this many while calibration is on. */
export const MOVEMENT_MIN_N_CALIBRATION = 5;
/** metrics.py _movements: an under-index movement needs demand_index at most this ... */
export const MOVEMENT_UNDER_INDEX = 0.5;
/** ... and at least this many launches. */
export const MOVEMENT_MIN_LAUNCHED = 15;
/** metrics.py _movements: the highest 4-week sell-out is only named for cohorts of at least this many products. */
export const MOVEMENT_MIN_COHORT = 5;
/** metrics.py _movements: the highest markdown share is only named when it is at least this. */
export const MOVEMENT_MARKDOWN_SHARE = 0.25;

/** profile.py NEWNESS_DAYS: newness_share counts styles published within this window (its own constant, not metrics.LAUNCH_WINDOW_DAYS). */
export const NEWNESS_DAYS = 56;

/** profile.py STYLE_WEIGHTS, in the ATTRIBUTES order. */
export const STYLE_WEIGHTS: ReadonlyArray<{ attribute: string; weight: number }> = [
  { attribute: "category", weight: 2 },
  { attribute: "print", weight: 2 },
  { attribute: "colour_family", weight: 1.5 },
  { attribute: "silhouette", weight: 1 },
  { attribute: "material", weight: 1 },
  { attribute: "sleeve", weight: 0.5 },
  { attribute: "length", weight: 0.5 },
  { attribute: "occasion", weight: 0.5 },
];

/** profile.py NEUTRALS: colour families counted as neutral in "farve-andel". */
export const NEUTRALS: readonly string[] = ["black", "white", "grey", "brown", "navy"];

/** config/sources.yaml fx_to_dkk: fixed rates used for every cross-brand price comparison. */
export const FX_TO_DKK: ReadonlyArray<{ currency: string; rate: number }> = [
  { currency: "DKK", rate: 1.0 },
  { currency: "EUR", rate: 7.46 },
  { currency: "SEK", rate: 0.68 },
  { currency: "GBP", rate: 8.6 },
  { currency: "USD", rate: 6.6 },
];

/** profile.py PRICE_BANDS labels, DKK. */
export const PRICE_BAND_LABELS: readonly string[] = ["<1.000", "1.000–1.999", "2.000–2.999", "3.000+"];

/** Fails the build when a mirrored constant no longer matches what `trendmonitor export` wrote to meta.json. */
export function assertMethodMirror(method: MetaMethod | undefined): void {
  if (!method) {
    throw new Error("meta.json has no \"method\" block: re-run `trendmonitor export` with the current code.");
  }
  const checks: Array<[string, unknown, unknown]> = [
    ["restock_window_days", RESTOCK_WINDOW_DAYS, method.restock_window_days],
    ["min_share_for_index", MIN_SHARE_FOR_INDEX, method.min_share_for_index],
    ["live_days", LIVE_DAYS, method.live_days],
    ["min_alert_count", MIN_ALERT_COUNT, method.min_alert_count],
    ["mad_scale", MAD_SCALE, method.mad_scale],
    ["markdown_drop", MARKDOWN_DROP, method.markdown_drop],
    ["min_rule_attributes", MIN_RULE_ATTRIBUTES, method.min_rule_attributes],
    ["min_rule_confidence", MIN_RULE_CONFIDENCE, method.min_rule_confidence],
    ["cohort_4w_days", COHORT_4W_DAYS.join(","), method.cohort_4w_days.join(",")],
    ["median_days_max_age", MEDIAN_DAYS_MAX_AGE, method.median_days_max_age],
    ["movement_over_index", MOVEMENT_OVER_INDEX, method.movement_over_index],
    ["movement_under_index", MOVEMENT_UNDER_INDEX, method.movement_under_index],
    ["movement_min_n_calibration", MOVEMENT_MIN_N_CALIBRATION, method.movement_min_n_calibration],
    ["movement_min_launched", MOVEMENT_MIN_LAUNCHED, method.movement_min_launched],
    ["movement_min_cohort", MOVEMENT_MIN_COHORT, method.movement_min_cohort],
    ["movement_markdown_share", MOVEMENT_MARKDOWN_SHARE, method.movement_markdown_share],
    ["newness_days", NEWNESS_DAYS, method.newness_days],
    [
      "style_weights",
      STYLE_WEIGHTS.map((w) => `${w.attribute}=${w.weight}`).join(","),
      Object.entries(method.style_weights).map(([k, v]) => `${k}=${v}`).join(","),
    ],
    ["neutrals", [...NEUTRALS].sort().join(","), [...method.neutrals].sort().join(",")],
    [
      "fx_to_dkk",
      FX_TO_DKK.map((f) => `${f.currency}=${f.rate}`).sort().join(","),
      Object.entries(method.fx_to_dkk).map(([k, v]) => `${k}=${v}`).sort().join(","),
    ],
    ["price_band_labels", PRICE_BAND_LABELS.join("|"), method.price_band_labels.join("|")],
  ];
  const drift = checks.filter(([, mirror, exported]) => mirror !== exported);
  if (drift.length) {
    const lines = drift.map(([name, mirror, exported]) => `${name}: web/lib/method.ts has ${String(mirror)}, meta.json has ${String(exported)}`);
    throw new Error("web/lib/method.ts is out of sync with the export:\n" + lines.join("\n"));
  }
}
