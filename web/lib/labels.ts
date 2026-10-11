// Danish labels for taxonomy attributes, brand roles and scopes, plus the size ordering used by the
// size-depletion table. Pure module: safe to import from client components.

import type { BrandRole, Scope } from "./types";

/** Same order as ATTRIBUTES in src/trendmonitor/config.py. */
export const ATTRIBUTE_ORDER: readonly string[] = [
  "category",
  "silhouette",
  "print",
  "colour_family",
  "material",
  "sleeve",
  "length",
  "occasion",
];

/** Same words as ATTR_DA in src/trendmonitor/report.py, capitalised for headings. */
const ATTRIBUTE_LABELS: Record<string, string> = {
  category: "Kategori",
  silhouette: "Silhuet",
  print: "Print",
  colour_family: "Farvefamilie",
  material: "Materiale",
  sleeve: "Ærme",
  length: "Længde",
  occasion: "Anledning",
};

export function attributeLabel(attribute: string): string {
  return ATTRIBUTE_LABELS[attribute] ?? attribute;
}

/** Lower-case variant for mid-sentence use ("kategori dress"). */
export function attributeWord(attribute: string): string {
  const label = attributeLabel(attribute);
  return label.charAt(0).toLocaleLowerCase("da-DK") + label.slice(1);
}

const ROLE_LABELS: Record<string, string> = {
  self: "Reference",
  peer: "Peer",
  benchmark: "Benchmark",
  international: "International",
};

export function roleLabel(role: BrandRole | string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Tailwind classes for the role swatch. Written out literally so the JIT scanner keeps them. */
const ROLE_SWATCH: Record<string, string> = {
  self: "bg-role-self",
  peer: "bg-role-peer",
  benchmark: "bg-role-benchmark",
  international: "bg-role-international",
};

export function roleSwatchClass(role: BrandRole | string): string {
  return ROLE_SWATCH[role] ?? "bg-muted";
}

/**
 * Scope label for sold_out_state.json. Every number in that table is a variant count, and the new-scope
 * window comes from meta.thresholds.launch_window_days rather than being hard-coded.
 */
export function scopeLabel(scope: Scope, launchWindowDays: number): string {
  if (scope === "new") return `Nyheder, lanceret ≤ ${Math.round(launchWindowDays / 7)} uger`;
  return "Alle live varianter";
}

// ---------------------------------------------------------------------------- sizes

const ALPHA_SIZES: readonly string[] = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export type SizeClass = "alpha" | "numeric" | "other";

/** alpha = XXS..XXXL, numeric = 32..48 (EU women's), other = combos, shoes, UK, one-size. */
export function sizeClass(size: string): SizeClass {
  if (ALPHA_SIZES.includes(size)) return "alpha";
  if (/^\d{2}$/.test(size)) {
    const n = Number(size);
    if (n >= 32 && n <= 48) return "numeric";
  }
  return "other";
}

/** Sort key: alpha first in garment order, then numeric ascending, then the rest alphabetically. */
export function sizeSortKey(size: string): number {
  const cls = sizeClass(size);
  if (cls === "alpha") return ALPHA_SIZES.indexOf(size);
  if (cls === "numeric") return 100 + Number(size);
  if (/^\d+(\.\d+)?$/.test(size)) return 200 + Number(size);
  return 1000;
}

export function compareSizes(a: string, b: string): number {
  const ka = sizeSortKey(a);
  const kb = sizeSortKey(b);
  if (ka !== kb) return ka - kb;
  return a.localeCompare(b, "da-DK", { numeric: true });
}
