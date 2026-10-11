// Danish sentences for movements.json, mirroring _movement_sentence in src/trendmonitor/report.py.
// Pure module.

import { fmtIndex, fmtInt, fmtNum, fmtPct } from "./format";
import { attributeLabel, attributeWord } from "./labels";
import type { Movement } from "./types";

/**
 * The exporter's technical source tokens (metrics.py _movements) in Danish. Tokens that are already Danish
 * ("seneste snapshot", "ugeserie, 8-ugers median + 2·MAD") and unknown tokens pass through unchanged.
 */
const SOURCE_LABELS: Record<string, string> = {
  "launches × net_sold_out": "lanceringer × netto udsolgt",
  "tags × net_sold_out, 8 uger": "tags × netto udsolgt, 8 uger",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function movementSentence(mv: Movement, names: Record<string, string>): string {
  switch (mv.kind) {
    case "attribute_over_index": {
      const low = mv.low_n ? " (lavt n)" : "";
      return (
        `${attributeLabel(mv.attribute)} ${mv.value} udgør ${fmtPct(mv.share_new)} af nyt sortiment, ` +
        `men ${fmtPct(mv.share_sold_out)} af netto udsolgte varianter, indeks ${fmtIndex(mv.index)}, ` +
        `n=${fmtInt(mv.n)}${low}. Kilde: ${sourceLabel(mv.source)}.`
      );
    }
    case "attribute_under_index":
      return (
        `${attributeLabel(mv.attribute)} ${mv.value} ligger lavt: ${fmtPct(mv.share_new)} af nyt sortiment, ` +
        `${fmtPct(mv.share_sold_out)} af udsolgte, indeks ${fmtIndex(mv.index)}, n=${fmtInt(mv.n)}. ` +
        `Kilde: ${sourceLabel(mv.source)}.`
      );
    case "brand_sell_out_4w":
      return (
        `${names[mv.brand] ?? mv.brand} har højeste 4-ugers sell-out: ${fmtPct(mv.rate)} af styles lanceret ` +
        `for 3–5 uger siden har mindst én udsolgt størrelse (n=${fmtInt(mv.n)}). Kilde: ${sourceLabel(mv.source)}.`
      );
    case "brand_markdown": {
      const disc = mv.discount !== null ? `, median rabat ${fmtPct(mv.discount)}` : "";
      return (
        `${names[mv.brand] ?? mv.brand} har ${fmtPct(mv.share)} af varianterne nedsat${disc}. ` +
        `Kilde: ${sourceLabel(mv.source)}.`
      );
    }
    case "alert":
      return (
        `Afvigelse: ${attributeWord(mv.attribute)} ${mv.value} med ${fmtInt(mv.this_week)} netto udsolgte i ugen ` +
        `mod median ${fmtNum(mv.median, 0)}. Kilde: ${sourceLabel(mv.source)}.`
      );
    default:
      return JSON.stringify(mv);
  }
}
