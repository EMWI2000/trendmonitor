"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import IndexBars, { type IndexBarRow } from "./IndexBars";
import LowNBadge from "./LowNBadge";
import { fmtIndex, fmtInt, fmtPct, isNum } from "@/lib/format";
import { scopeLabel } from "@/lib/labels";
import { MIN_SHARE_FOR_INDEX } from "@/lib/method";
import type { Scope } from "@/lib/types";

export interface TooFewRow {
  value: string;
  liveN: number;
  unavailableN: number;
}

/**
 * The reference brand's position next to one peer value. Peer numbers repeat the bar; the self_* numbers come
 * from the same sold_out_state row and never enter the peer index.
 */
export interface SelfCompareRow {
  value: string;
  peerIndex: number | null;
  peerShareLive: number | null;
  peerUnavailableN: number;
  peerLowN: boolean;
  selfShareLive: number | null;
  selfLiveN: number;
  selfUnavailableN: number;
  selfIndex: number | null;
}

export interface SoldOutPanel {
  bars: IndexBarRow[];
  tooFew: TooFewRow[];
  liveTotal: number;
  unavailableTotal: number;
  selfRows: SelfCompareRow[];
}

export interface SoldOutAttribute {
  key: string;
  label: string;
  /** Share of all peers' live variants whose product has a value in this attribute (lib/coverage.ts); null when unknown. */
  peerCoverage: number | null;
  /** The same for the reference brand. */
  selfCoverage: number | null;
  panels: Record<Scope, SoldOutPanel>;
}

interface Props {
  attributes: SoldOutAttribute[];
  lowN: number;
  minLaunched: number;
  launchWindowDays: number;
  /** Display name of the reference brand; null hides the comparison table. */
  selfName: string | null;
  /** insights.rules: the four thresholds the attribute rules use, so the self-comparison text matches the cards. */
  overIndex: number;
  underIndex: number;
  whiteSpaceRatio: number;
  heavyRatio: number;
  /** Server-rendered insight cards per attribute key, shown under the chart for the selected attribute. */
  insightPanels: Record<string, ReactNode>;
}

const SCOPES: readonly Scope[] = ["all", "new"];

function isScope(s: string | null): s is Scope {
  return s === "all" || s === "new";
}

/** Values at least 10 % away from 1.0 count as over- or under-represented in the per-tab headline. */
const HEADLINE_OVER = 1.1;
const HEADLINE_UNDER = 0.9;

/** Bar labels read "30 % af udsolgte · indeks 1,33 · n=3.478 · lavt n", so they need more room than the default. */
const BAR_LABEL_WIDTH = 290;

function SelfCompareTable({ rows, selfName, lowN }: { rows: SelfCompareRow[]; selfName: string; lowN: number }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink2">{selfName} har ingen taggede varianter i dette udsnit.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-axis text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="px-2 py-2 font-medium">
              Værdi
            </th>
            <th
              scope="col"
              className="px-2 py-2 text-right font-medium"
              title="Peers' udsolgt-indeks og n (varianter uden lager), samme tal som søjlen"
            >
              Peers: indeks (n)
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium" title="Værdiens andel af peers' taggede live varianter (share_live)">
              Peers: andel af live
            </th>
            <th
              scope="col"
              className="px-2 py-2 text-right font-medium"
              title={`Værdiens andel af ${selfName}s egne taggede live varianter (self_share_live)`}
            >
              {selfName}: andel af live
            </th>
            <th
              scope="col"
              className="px-2 py-2 text-right font-medium"
              title="Egen andel delt med peers' andel: under 1 = tyndere end peers, over 1 = tungere"
            >
              Egen andel ÷ peers
            </th>
            <th
              scope="col"
              className="px-2 py-2 text-right font-medium"
              title={`Indeks beregnet alene på ${selfName}s egne varianter (self_state_index); indgår ikke i peer-indekset`}
            >
              {selfName}: eget indeks
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium" title="Egne live varianter, heraf uden lager">
              {selfName}: varianter (uden lager)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ratio =
              isNum(r.selfShareLive) && isNum(r.peerShareLive) && r.peerShareLive > 0
                ? r.selfShareLive / r.peerShareLive
                : null;
            const selfLow = isNum(r.selfIndex) && r.selfUnavailableN < lowN;
            return (
              <tr key={r.value} className="border-b border-hair">
                <td className="px-2 py-1.5 text-ink">{r.value}</td>
                <td className="tabular px-2 py-1.5 text-right">
                  {fmtIndex(r.peerIndex)}
                  {isNum(r.peerIndex) ? <span className="text-muted"> (n={fmtInt(r.peerUnavailableN)})</span> : null}
                  {isNum(r.peerIndex) && r.peerLowN ? <LowNBadge title={`n under ${lowN}`} /> : null}
                </td>
                <td className="tabular px-2 py-1.5 text-right">{fmtPct(r.peerShareLive, 1)}</td>
                <td className="tabular px-2 py-1.5 text-right font-medium text-ink">{fmtPct(r.selfShareLive, 1)}</td>
                <td className="tabular px-2 py-1.5 text-right">{fmtIndex(ratio)}</td>
                <td className="tabular px-2 py-1.5 text-right">
                  {fmtIndex(r.selfIndex)}
                  {selfLow ? <LowNBadge title={`n under ${lowN}`} /> : null}
                </td>
                <td className="tabular px-2 py-1.5 text-right text-ink2">
                  {fmtInt(r.selfLiveN)} ({fmtInt(r.selfUnavailableN)})
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Attribute tabs + scope toggle over sold_out_state.json. All numbers arrive pre-computed from the
 * server; this component only chooses which slice to show. An insight card's "Se detaljer" link carries
 * ?attr=…&scope=… (lib/labels.ts insightDetailHref), read once on mount so the page opens on that value.
 */
export default function SoldOutExplorer({
  attributes,
  lowN,
  minLaunched,
  launchWindowDays,
  selfName,
  overIndex,
  underIndex,
  whiteSpaceRatio,
  heavyRatio,
  insightPanels,
}: Props) {
  const [attr, setAttr] = useState<string>(attributes.length > 0 ? attributes[0].key : "");
  const [scope, setScope] = useState<Scope>("all");
  const appliedUrl = useRef(false);

  useEffect(() => {
    if (appliedUrl.current) return;
    appliedUrl.current = true;
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const wantedAttr = params.get("attr");
    const wantedScope = params.get("scope");
    if (wantedAttr !== null && attributes.some((a) => a.key === wantedAttr)) setAttr(wantedAttr);
    if (isScope(wantedScope)) setScope(wantedScope);
  }, [attributes]);

  const current = attributes.find((a) => a.key === attr) ?? attributes[0];
  if (!current) return <p className="text-sm text-ink2">Ingen udsolgt-tilstand i eksporten.</p>;
  const panel = current.panels[scope];
  const share = panel.liveTotal > 0 ? panel.unavailableTotal / panel.liveTotal : null;
  const attrWord = current.label.toLocaleLowerCase("da-DK");

  // Headline per tab: robust-n values only; bars arrive sorted by index, descending.
  const robust = panel.bars.filter((b) => !b.lowN);
  const over = robust.filter((b) => b.index >= HEADLINE_OVER).map((b) => b.value);
  const under = robust
    .filter((b) => b.index <= HEADLINE_UNDER)
    .map((b) => b.value)
    .reverse();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="tablist" aria-label="Attribut" className="flex flex-wrap gap-1 border-b border-hair">
          {attributes.map((a) => {
            const on = a.key === current.key;
            return (
              <button
                key={a.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setAttr(a.key)}
                className={
                  on
                    ? "-mb-px border-b-2 border-ink px-3 py-2 text-sm font-medium text-ink"
                    : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-ink2 hover:text-ink"
                }
              >
                {a.label}
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Udsnit" className="inline-flex rounded border border-axis text-sm">
          {SCOPES.map((s) => {
            const on = s === scope;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setScope(s)}
                className={
                  on
                    ? "bg-ink px-3 py-1.5 font-medium text-white first:rounded-l last:rounded-r"
                    : "bg-surface px-3 py-1.5 text-ink2 hover:text-ink first:rounded-l last:rounded-r"
                }
              >
                {scopeLabel(s, launchWindowDays)}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-sm text-ink2">
        {current.label}, {scopeLabel(scope, launchWindowDays).toLocaleLowerCase("da-DK")}:{" "}
        {fmtInt(panel.liveTotal)} taggede varianter hos peers, heraf {fmtInt(panel.unavailableTotal)} uden lager (
        {fmtPct(share)}).
        {isNum(current.peerCoverage)
          ? ` ${fmtPct(current.peerCoverage)} af alle peers' live varianter har et ${attrWord}-tag` +
            (isNum(current.selfCoverage) && selfName ? ` (${selfName}: ${fmtPct(current.selfCoverage)})` : "") +
            "; andele og indeks regnes kun på de taggede varianter."
          : ""}
        {scope === "new" ? ` Nyheder = lanceret inden for ${launchWindowDays} dage.` : ""} Indeks = andel af
        varianter uden lager delt med andel af live varianter; 1,0 betyder, at værdien er udsolgt i samme
        grad, som den fylder i sortimentet.
      </p>

      {panel.bars.length > 0 ? (
        <p className="text-sm text-ink">
          <span className="font-medium">Over 1,0:</span> {over.length > 0 ? over.join(", ") : "ingen"}.{" "}
          <span className="font-medium">Under 1,0:</span> {under.length > 0 ? under.join(", ") : "ingen"}.
          <span className="text-ink2"> Kun værdier med robust n og mindst 10&nbsp;% afvigelse fra 1,0.</span>
        </p>
      ) : null}

      <IndexBars
        rows={panel.bars}
        baseLabel="andel af live varianter"
        outcomeLabel="andel af varianter uden lager"
        labelWidth={BAR_LABEL_WIDTH}
      />

      {panel.bars.some((b) => b.lowN) ? (
        <p className="text-xs text-ink2">
          <LowNBadge /> markerer værdier med under {lowN} varianter uden lager; læs dem som
          retning, ikke som tal.
        </p>
      ) : null}

      {insightPanels[current.key] ?? null}

      {selfName ? (
        <div className="space-y-2 border-t border-hair pt-4">
          <h3 className="text-sm font-semibold text-ink">
            {selfName} (eget sortiment) mod peers, {scopeLabel(scope, launchWindowDays).toLocaleLowerCase("da-DK")}
          </h3>
          <p className="text-xs text-ink2">
            Søjlerne ovenfor er peers alene. Her står {selfName}s egen andel af taggede live varianter i hver værdi og,
            hvor der er nok varianter, et indeks regnet kun på {selfName}s eget sortiment. De to indeks blandes aldrig.
            Egen andel ÷ peers under {fmtIndex(whiteSpaceRatio)} er den tynde side af et hvidt felt (når peers&apos; indeks
            er mindst {fmtIndex(overIndex)}), over {fmtIndex(heavyRatio)} den tunge side af en risiko (når indekset er
            højst {fmtIndex(underIndex)}).
          </p>
          <SelfCompareTable rows={panel.selfRows} selfName={selfName} lowN={lowN} />
        </div>
      ) : null}

      {panel.tooFew.length > 0 ? (
        <div className="text-sm">
          <h3 className="font-medium text-ink">For få til et indeks</h3>
          <p className="mb-2 text-xs text-ink2">
            Værdier under {fmtPct(MIN_SHARE_FOR_INDEX)} af de live varianter eller under {minLaunched} varianter i alt.
            Vist som rå tællinger.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ink2">
            {panel.tooFew.map((t) => (
              <li key={t.value}>
                <span className="text-ink">{t.value}</span>: {fmtInt(t.unavailableN)} af {fmtInt(t.liveN)} uden lager
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
