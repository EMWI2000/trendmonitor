import Link from "next/link";
import type { ReactNode } from "react";

import LowNBadge from "./LowNBadge";
import { type AttributeCoverage, isLowCoverage } from "@/lib/coverage";
import { fmtIndex, fmtInt, fmtPct, isNum } from "@/lib/format";
import {
  attributeWord,
  insightDetailHref,
  insightKindBadgeClass,
  insightKindLabel,
  insightMethodAnchor,
  scopeLabel,
} from "@/lib/labels";
import type { InsightItem } from "@/lib/types";

interface Props {
  item: InsightItem;
  /** Display name of the reference brand (insights.self_name). */
  selfName: string;
  /** key -> display name, for the nearest-competitor chips. */
  names: Record<string, string>;
  /** meta.thresholds.low_n: n below this gets the "lavt n" badge. */
  lowN: number;
  /** meta.thresholds.launch_window_days, for the scope chip. */
  launchWindowDays: number;
  /** insights.rules.markdown_heavy, for the markdown chip. */
  markdownHeavy: number;
  /** Tag coverage per attribute (lib/coverage.ts); when given, attribute cards flag a thin base with a chip. */
  coverage?: Record<string, AttributeCoverage>;
  /** Hide "Se detaljer" when the card already sits on its detail page. */
  showLink?: boolean;
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex items-center rounded border border-hair bg-plane px-2 py-0.5 text-xs text-ink2">
      {children}
    </li>
  );
}

/**
 * The evidence row: small chips with the exact numbers the rule fired on, so a reader never has to trust the
 * sentence alone. Every value is taken from insights.json as emitted by insights.py; the shares are shares of
 * the variants that carry a value in the attribute, so the coverage chip says how thin that base is.
 */
function EvidenceChips({ item, selfName, names, lowN, launchWindowDays, markdownHeavy, coverage }: Omit<Props, "showLink">) {
  switch (item.kind) {
    case "white_space":
    case "strength":
    case "risk": {
      const cov = coverage ? coverage[item.attribute] : undefined;
      // self_unavailable_share × self_n recovers the self brand's own unavailable count (insights.py: self_unavailable_n / self_live_n).
      const selfUnavailableN = isNum(item.self_unavailable_share) ? Math.round(item.self_unavailable_share * item.self_n) : null;
      return (
        <ul className="flex flex-wrap gap-1.5">
          <Chip>indeks {fmtIndex(item.peer_index)}</Chip>
          <Chip>
            n={fmtInt(item.peer_n)}
            {item.low_n || item.peer_n < lowN ? <LowNBadge title={`n under ${lowN}`} /> : null}
          </Chip>
          <Chip>
            Andel af taggede live varianter: {selfName} {fmtPct(item.self_share)} · peers {fmtPct(item.peer_share)}
          </Chip>
          <Chip>
            Uden lager hos peers: {fmtPct(item.peer_unavailable_share)} mod {fmtPct(item.avg_unavailable_share)} i snit
          </Chip>
          <Chip>
            {item.self_n > 0
              ? `Uden lager hos ${selfName}: ${fmtPct(item.self_unavailable_share)} af ${fmtInt(item.self_n)} egne varianter`
              : `${selfName}: ingen egne varianter i ${item.value}`}
            {isNum(selfUnavailableN) && selfUnavailableN < lowN && item.self_n > 0 ? (
              <LowNBadge title={`${fmtInt(selfUnavailableN)} egne varianter uden lager, under ${lowN}`} />
            ) : null}
          </Chip>
          {cov && isLowCoverage(cov) ? (
            <Chip>
              Tag-dækning {attributeWord(item.attribute)}: peers {fmtPct(cov.peerShare)} · {selfName} {fmtPct(cov.selfShare)} af
              live varianter
            </Chip>
          ) : null}
          <Chip>{scopeLabel(item.scope, launchWindowDays)}</Chip>
        </ul>
      );
    }
    case "sizes":
      return (
        <ul className="flex flex-wrap gap-1.5">
          {item.sizes.map((s) => (
            <Chip key={s.size}>
              {s.size}: peers {fmtPct(s.peer_share)} (n={fmtInt(s.peer_n)}) ·{" "}
              {isNum(s.self_share) ? `${selfName} ${fmtPct(s.self_share)}` : `${selfName} fører ikke størrelsen`}
            </Chip>
          ))}
          <Chip>Gennemsnit hos peers {fmtPct(item.avg_unavailable_share)}</Chip>
        </ul>
      );
    case "markdown":
      return (
        <ul className="flex flex-wrap gap-1.5">
          <Chip>
            {fmtInt(item.peer_count)} af {fmtInt(item.peer_total)} peers med mindst {fmtPct(markdownHeavy)} nedsat
          </Chip>
          {isNum(item.self_share) && item.self_share >= markdownHeavy ? (
            <Chip>
              {selfName} {fmtPct(item.self_share)} nedsat: over tærsklen på {fmtPct(markdownHeavy)}, ville selv tælle som
              prispres
            </Chip>
          ) : (
            <Chip>
              {selfName} {fmtPct(item.self_share)} nedsat
            </Chip>
          )}
        </ul>
      );
    case "nearest":
      return (
        <ul className="flex flex-wrap gap-1.5">
          {item.brands.map((b) => (
            <Chip key={b.brand}>
              {names[b.brand] ?? b.brand}: stilafstand {fmtIndex(b.style_distance)} · prisindeks {fmtIndex(b.price_index)} ·
              overlap {fmtPct(b.overlap_with_self)}
            </Chip>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

/**
 * The dashboard's own caveat under the action, where the exported sentence can be read against the self brand's
 * own shop or claims more than assortment data can carry. null when nothing needs saying.
 */
function caveat(item: InsightItem, selfName: string): string | null {
  switch (item.kind) {
    case "risk":
      return isNum(item.self_unavailable_share) && item.self_unavailable_share >= item.peer_unavailable_share
        ? `Bemærk: ${selfName}s egen udsolgt-andel i ${item.value} (${fmtPct(item.self_unavailable_share)}) ligger over ` +
            `peers' (${fmtPct(item.peer_unavailable_share)}); test før dybden skæres.`
        : null;
    case "markdown":
      return "Nedsat andel beskriver udbuddet i butikkerne, ikke hvem der køber eller hvad de betaler.";
    case "nearest":
      return "Stilafstand og overlap beskriver udbuddet i butikkerne, ikke hvem der køber.";
    default:
      return null;
  }
}

/**
 * One "Hvad betyder det for Baum" card. Title, text and action are rendered verbatim from insights.json
 * (the wording is the weekly report's); the badge, the evidence chips, the caveat and the links are the
 * dashboard's own.
 */
export default function InsightCard(props: Props) {
  const { item, showLink = true, ...rest } = props;
  const note = caveat(item, rest.selfName);
  return (
    <article className="flex flex-col rounded border border-hair bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${insightKindBadgeClass(item.kind)}`}
        >
          {insightKindLabel(item.kind)}
        </span>
        <span className="text-xs text-muted">nr. {fmtInt(item.rank)}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-ink">{item.title}</h3>
      <p className="mt-1 text-sm text-ink2">{item.text}</p>
      <p className="mt-3 rounded border-l-4 border-ink bg-plane px-3 py-2 text-sm text-ink">
        <span className="font-semibold">Handling:</span> {item.action}
      </p>
      {note ? <p className="mt-2 text-xs text-ink2">{note}</p> : null}
      <div className="mt-3">
        <EvidenceChips item={item} {...rest} />
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 text-xs">
        {showLink ? (
          <Link href={insightDetailHref(item)} className="underline">
            Se detaljer
          </Link>
        ) : null}
        <Link href={`/metode#${insightMethodAnchor(item.kind)}`} className="text-ink2 underline">
          Sådan virker reglen
        </Link>
      </p>
    </article>
  );
}
