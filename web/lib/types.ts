// TypeScript shapes of the files written by `trendmonitor export` (src/trendmonitor/export.py).
// Field names match the JSON exactly. Numbers that can be NaN in pandas arrive as null.

export type BrandRole = "self" | "peer" | "benchmark" | "international";

export type Scope = "all" | "new";

// ---------------------------------------------------------------------------- meta.json

export interface MetaBrand {
  key: string;
  name: string;
  role: BrandRole;
  enabled: boolean;
  currency: string | null;
  url: string;
}

export interface Thresholds {
  low_n: number;
  min_launched: number;
  baseline_weeks: number;
  series_weeks: number;
  launch_window_days: number;
}

export interface MetaNotes {
  not_sales: string;
  index: string;
  low_n: string;
  calibration: string;
  state: string;
  self_excluded: string;
}

/** Pipeline constants the method texts name (export.py `_meta`, key "method"). */
export interface MetaMethod {
  restock_window_days: number;
  min_share_for_index: number;
  live_days: number;
  min_alert_count: number;
  mad_scale: number;
  markdown_drop: number;
  min_rule_attributes: number;
  min_rule_confidence: number;
  cohort_4w_days: [number, number];
  median_days_max_age: number;
  movement_over_index: number;
  movement_under_index: number;
  movement_min_n_calibration: number;
  movement_min_launched: number;
  movement_min_cohort: number;
  movement_markdown_share: number;
  newness_days: number;
  style_weights: Record<string, number>;
  neutrals: string[];
  fx_to_dkk: Record<string, number>;
  price_band_labels: string[];
  alpha_sizes: string[];
  numeric_sizes: string[];
  request_delay_seconds: number;
}

export interface Meta {
  report_date: string;
  week_start: string;
  latest_snapshot_date: string;
  snapshot_dates: string[];
  weeks_of_history: number;
  calibration: boolean;
  taxonomy_version: string;
  self_brand: string | null;
  thresholds: Thresholds;
  brands: MetaBrand[];
  method: MetaMethod;
  notes: MetaNotes;
  generated_at: string;
}

// ---------------------------------------------------------------------------- brands.json

export interface BrandRow {
  brand: string;
  role: BrandRole;
  live_products: number;
  live_variants: number;
  new_products: number;
  sold_out_variants: number;
  products_fully_sold_out: number;
  restocks: number;
  delisted: number;
  markdowns: number;
  markdown_share: number | null;
  median_discount: number | null;
  sell_out_rate_2w: number | null;
  sell_out_rate_4w: number | null;
  sell_out_rate_8w: number | null;
  cohort_4w_n: number;
  median_days_to_first_sold_out: number | null;
}

// ---------------------------------------------------------------------------- attributes.json

export interface AttributeRow {
  attribute: string;
  value: string;
  launched_n: number;
  sold_out_n: number;
  share_new: number | null;
  share_sold_out: number | null;
  demand_index: number | null;
  low_n: boolean;
}

// ---------------------------------------------------------------------------- series.json

export interface SeriesRow {
  attribute: string;
  value: string;
  weeks_ago: number;
  n: number;
}

// ---------------------------------------------------------------------------- alerts.json

export interface AlertRow {
  attribute: string;
  value: string;
  this_week: number;
  baseline_median: number;
  baseline_mad: number;
}

// ---------------------------------------------------------------------------- sizes.json

export interface SizeRow {
  brand: string;
  size: string;
  n: number;
}

// ---------------------------------------------------------------------------- movements.json

export interface AttributeMovement {
  kind: "attribute_over_index" | "attribute_under_index";
  attribute: string;
  value: string;
  index: number;
  share_new: number | null;
  share_sold_out: number | null;
  n: number;
  low_n: boolean;
  source: string;
}

export interface BrandSellOutMovement {
  kind: "brand_sell_out_4w";
  brand: string;
  rate: number;
  n: number;
  source: string;
}

export interface BrandMarkdownMovement {
  kind: "brand_markdown";
  brand: string;
  share: number;
  discount: number | null;
  source: string;
}

export interface AlertMovement {
  kind: "alert";
  attribute: string;
  value: string;
  this_week: number;
  median: number | null;
  source: string;
}

export type Movement = AttributeMovement | BrandSellOutMovement | BrandMarkdownMovement | AlertMovement;

// ---------------------------------------------------------------------------- sold_out_state.json

/**
 * One row per attribute value and scope. The peer columns (live_n, unavailable_n, share_*, state_index) carry
 * the index; the self_* columns describe the reference brand's own assortment and never enter the index
 * (metrics.py _sold_out_state). self_state_index is computed over the self brand's variants alone.
 */
export interface SoldOutStateRow {
  attribute: string;
  scope: Scope;
  value: string;
  live_n: number;
  unavailable_n: number;
  self_live_n: number;
  self_unavailable_n: number;
  share_live: number | null;
  share_unavailable: number | null;
  state_index: number | null;
  self_share_live: number | null;
  self_share_unavailable: number | null;
  self_state_index: number | null;
  low_n: boolean;
}

// ---------------------------------------------------------------------------- size_depletion.json

export interface SizeDepletionRow {
  brand: string;
  role: BrandRole;
  size: string;
  live_variants: number;
  unavailable_variants: number;
  unavailable_share: number | null;
}

// ---------------------------------------------------------------------------- launch_calendar.json

export interface LaunchCalendarRow {
  brand: string;
  role: BrandRole;
  week_start: string;
  products: number;
}

// ---------------------------------------------------------------------------- positioning.json

export interface BrandProfile {
  brand: string;
  role: BrandRole;
  products: number;
  variants: number;
  tagged_share: number | null;
  price_p25: number | null;
  price_p50: number | null;
  price_p75: number | null;
  price_bands: Record<string, number>;
  dress_p50: number | null;
  currency: string | null;
  size_system: string | null;
  size_range: string | null;
  newness_share: number | null;
  markdown_share: number | null;
  print_share: number | null;
  colour_share: number | null;
  occasion_words: Record<string, number>;
  voice_words: Record<string, number>;
  season_tags: Record<string, number>;
  mix: Record<string, Record<string, number>>;
  style_distance: number | null;
  overlap_with_self: number | null;
  price_index: number | null;
  dress_price_index: number | null;
  distances: Record<string, number | null>;
}

export interface Positioning {
  report_date: string;
  self_brand: string;
  brands: BrandProfile[];
}

// ---------------------------------------------------------------------------- runs.json

export interface RunRow {
  run_date: string;
  brand: string;
  status: string;
  products: number;
  variants: number;
  pages: number;
  seconds: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------- taxonomy.json

export interface TaxonomyAttribute {
  description: string;
  values: string[];
}

export interface Taxonomy {
  version: string;
  attributes: Record<string, TaxonomyAttribute>;
}

// ---------------------------------------------------------------------------- insights.json

/** The six rule kinds in src/trendmonitor/insights.py. */
export type InsightKind = "white_space" | "strength" | "risk" | "sizes" | "markdown" | "nearest";

export type AttributeInsightKind = "white_space" | "strength" | "risk";

/** Fields every insight carries (compute_insights adds rank and attribute_label to all kinds). */
export interface InsightBase {
  title: string;
  text: string;
  action: string;
  strength: number;
  low_n: boolean;
  evidence: string;
  rank: number;
  attribute_label: string | null;
}

/** white_space / strength / risk: one attribute value in sold_out_state held against the self brand's share. */
export interface AttributeInsight extends InsightBase {
  kind: AttributeInsightKind;
  attribute: string;
  value: string;
  scope: Scope;
  peer_index: number;
  peer_n: number;
  peer_live_n: number;
  peer_share: number;
  peer_unavailable_share: number;
  avg_unavailable_share: number | null;
  self_share: number;
  self_unavailable_share: number | null;
  self_n: number;
}

export interface InsightSizeRow {
  size: string;
  peer_share: number;
  peer_n: number;
  self_share: number | null;
}

export interface SizesInsight extends InsightBase {
  kind: "sizes";
  sizes: InsightSizeRow[];
  avg_unavailable_share: number;
}

export interface MarkdownInsight extends InsightBase {
  kind: "markdown";
  peer_count: number;
  peer_total: number;
  self_share: number | null;
}

export interface InsightBrandRow {
  brand: string;
  style_distance: number;
  price_index: number | null;
  overlap_with_self: number | null;
}

export interface NearestInsight extends InsightBase {
  kind: "nearest";
  brands: InsightBrandRow[];
}

export type InsightItem = AttributeInsight | SizesInsight | MarkdownInsight | NearestInsight;

/** RULES in insights.py: every threshold the six rules use. */
export interface InsightRules {
  over_index: number;
  under_index: number;
  white_space_ratio: number;
  heavy_ratio: number;
  min_self_share: number;
  size_gap: number;
  min_size_n: number;
  markdown_heavy: number;
  per_kind_cap: number;
  max_attribute_insights: number;
  nearest_n: number;
  low_n: number;
  launch_window_days: number;
}

export interface Insights {
  report_date: string;
  latest_snapshot_date: string;
  self_brand: string | null;
  self_name: string | null;
  calibration: boolean;
  weeks_of_history: number;
  note: string;
  rules: InsightRules;
  items: InsightItem[];
}

// ---------------------------------------------------------------------------- everything at once

export interface Dashboard {
  meta: Meta;
  brands: BrandRow[];
  attributes: AttributeRow[];
  series: SeriesRow[];
  alerts: AlertRow[];
  sizes: SizeRow[];
  movements: Movement[];
  soldOutState: SoldOutStateRow[];
  sizeDepletion: SizeDepletionRow[];
  launchCalendar: LaunchCalendarRow[];
  positioning: Positioning;
  runs: RunRow[];
  taxonomy: Taxonomy;
  insights: Insights;
}
