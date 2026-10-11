// Tag coverage per attribute, derived in the dashboard from sold_out_state.json and brands.json. Every share
// and index in sold_out_state is computed over variants whose product has a value in that attribute
// (metrics.py _state_counts joins tags and filters t.{attr} IS NOT NULL), so this says how large a part of the
// live assortment those numbers describe. Pure module: safe to import from client components.

import type { BrandRow, SoldOutStateRow } from "./types";

export interface AttributeCoverage {
  attribute: string;
  /** Peers' live variants in the latest snapshot whose product carries a value in the attribute (Σ live_n, scope all). */
  peerTagged: number;
  /** All peers' live variants in the latest snapshot (Σ brands.live_variants over role ≠ self). */
  peerLive: number;
  peerShare: number | null;
  /** The same two numbers for the reference brand (Σ self_live_n, brands.live_variants of role self). */
  selfTagged: number;
  selfLive: number;
  selfShare: number | null;
}

/** Below this share of live variants an attribute's shares are flagged as resting on a thin base. */
export const LOW_COVERAGE = 0.8;

export function computeAttributeCoverage(state: SoldOutStateRow[], brands: BrandRow[]): Record<string, AttributeCoverage> {
  let peerLive = 0;
  let selfLive = 0;
  for (const b of brands) {
    if (b.role === "self") selfLive += b.live_variants;
    else peerLive += b.live_variants;
  }
  const out: Record<string, AttributeCoverage> = {};
  for (const r of state) {
    if (r.scope !== "all") continue;
    const c: AttributeCoverage = out[r.attribute] ?? {
      attribute: r.attribute,
      peerTagged: 0,
      peerLive,
      peerShare: null,
      selfTagged: 0,
      selfLive,
      selfShare: null,
    };
    c.peerTagged += r.live_n;
    c.selfTagged += r.self_live_n;
    out[r.attribute] = c;
  }
  for (const key of Object.keys(out)) {
    const c = out[key];
    c.peerShare = peerLive > 0 ? c.peerTagged / peerLive : null;
    c.selfShare = selfLive > 0 ? c.selfTagged / selfLive : null;
  }
  return out;
}

/** True when peers' or the reference brand's coverage of the attribute is below LOW_COVERAGE. */
export function isLowCoverage(c: AttributeCoverage | undefined): boolean {
  if (!c) return false;
  return (c.peerShare !== null && c.peerShare < LOW_COVERAGE) || (c.selfShare !== null && c.selfShare < LOW_COVERAGE);
}
