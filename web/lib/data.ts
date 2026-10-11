// Server-only loaders for the JSON written by `trendmonitor export`. Never import this module from a
// client component ("use client"): it reads the file system. Pages are rendered at build time, so the
// files are read once per build (and memoised per process in `next dev`; restart after a re-export).

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import type {
  AlertRow,
  AttributeRow,
  BrandRow,
  Dashboard,
  LaunchCalendarRow,
  Meta,
  MetaBrand,
  Movement,
  Positioning,
  RunRow,
  SeriesRow,
  SizeDepletionRow,
  SizeRow,
  SoldOutStateRow,
  Taxonomy,
} from "./types";

function resolveExportDir(): string {
  const env = process.env.TM_EXPORT_DIR;
  if (env && env.length > 0) return isAbsolute(env) ? env : resolve(process.cwd(), env);
  // `web/` is the Vercel root directory; the repo's data/export sits one level up.
  return join(process.cwd(), "..", "data", "export");
}

export const EXPORT_DIR: string = resolveExportDir();

const cache = new Map<string, unknown>();

function readJson<T>(name: string): T {
  const hit = cache.get(name);
  if (hit !== undefined) return hit as T;
  const metaPath = join(EXPORT_DIR, "meta.json");
  if (!existsSync(metaPath)) {
    throw new Error(
      `trendmonitor export not found: ${metaPath} is missing. ` +
        "Run `uv run trendmonitor export` in the repository root (writes data/export/), " +
        "or point TM_EXPORT_DIR at a directory containing the exported JSON files.",
    );
  }
  const file = join(EXPORT_DIR, name);
  if (!existsSync(file)) {
    throw new Error(`${name} is missing in ${EXPORT_DIR}; re-run \`uv run trendmonitor export\`.`);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as T;
  cache.set(name, parsed);
  return parsed;
}

export function loadMeta(): Meta {
  return readJson<Meta>("meta.json");
}

export function loadBrands(): BrandRow[] {
  return readJson<BrandRow[]>("brands.json");
}

export function loadAttributes(): AttributeRow[] {
  return readJson<AttributeRow[]>("attributes.json");
}

export function loadSeries(): SeriesRow[] {
  return readJson<SeriesRow[]>("series.json");
}

export function loadAlerts(): AlertRow[] {
  return readJson<AlertRow[]>("alerts.json");
}

export function loadSizes(): SizeRow[] {
  return readJson<SizeRow[]>("sizes.json");
}

export function loadMovements(): Movement[] {
  return readJson<Movement[]>("movements.json");
}

export function loadSoldOutState(): SoldOutStateRow[] {
  return readJson<SoldOutStateRow[]>("sold_out_state.json");
}

export function loadSizeDepletion(): SizeDepletionRow[] {
  return readJson<SizeDepletionRow[]>("size_depletion.json");
}

export function loadLaunchCalendar(): LaunchCalendarRow[] {
  return readJson<LaunchCalendarRow[]>("launch_calendar.json");
}

export function loadPositioning(): Positioning {
  return readJson<Positioning>("positioning.json");
}

export function loadRuns(): RunRow[] {
  return readJson<RunRow[]>("runs.json");
}

export function loadTaxonomy(): Taxonomy {
  return readJson<Taxonomy>("taxonomy.json");
}

export function loadAll(): Dashboard {
  return {
    meta: loadMeta(),
    brands: loadBrands(),
    attributes: loadAttributes(),
    series: loadSeries(),
    alerts: loadAlerts(),
    sizes: loadSizes(),
    movements: loadMovements(),
    soldOutState: loadSoldOutState(),
    sizeDepletion: loadSizeDepletion(),
    launchCalendar: loadLaunchCalendar(),
    positioning: loadPositioning(),
    runs: loadRuns(),
    taxonomy: loadTaxonomy(),
  };
}

// ---------------------------------------------------------------------------- brand helpers

export function metaBrand(key: string): MetaBrand | undefined {
  return loadMeta().brands.find((b) => b.key === key);
}

/** Display name from meta.json; falls back to the key for brands missing from sources.yaml. */
export function brandName(key: string): string {
  return metaBrand(key)?.name ?? key;
}

/** The reference brand (meta.self_brand) is never part of any sold-out index. */
export function isSelf(key: string): boolean {
  return loadMeta().self_brand === key;
}

/** key -> display name for every brand in meta.json. */
export function brandNames(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of loadMeta().brands) out[b.key] = b.name;
  return out;
}

/** Attribute keys present in the taxonomy, in the canonical order, followed by any unknown extras. */
export function taxonomyAttributes(order: readonly string[]): string[] {
  const keys = Object.keys(loadTaxonomy().attributes);
  const known = order.filter((a) => keys.includes(a));
  const extra = keys.filter((a) => !order.includes(a)).sort();
  return [...known, ...extra];
}
