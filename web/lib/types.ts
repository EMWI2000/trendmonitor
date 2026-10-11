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

export interface SoldOutStateRow {
  attribute: string;
  scope: Scope;
  value: string;
  live_n: number;
  unavailable_n: number;
  share_live: number | null;
  share_unavailable: number | null;
  state_index: number | null;
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
}
