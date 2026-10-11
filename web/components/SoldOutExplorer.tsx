"use client";

import { useState } from "react";

import IndexBars, { type IndexBarRow } from "./IndexBars";
import LowNBadge from "./LowNBadge";
import { fmtInt, fmtPct } from "@/lib/format";
import { scopeLabel } from "@/lib/labels";
import type { Scope } from "@/lib/types";

export interface TooFewRow {
  value: string;
  liveN: number;
  unavailableN: number;
}

export interface SoldOutPanel {
  bars: IndexBarRow[];
  tooFew: TooFewRow[];
  liveTotal: number;
  unavailableTotal: number;
}

export interface SoldOutAttribute {
  key: string;
  label: string;
  panels: Record<Scope, SoldOutPanel>;
}

interface Props {
  attributes: SoldOutAttribute[];
  lowN: number;
  minLaunched: number;
  launchWindowDays: number;
}

const SCOPES: readonly Scope[] = ["all", "new"];

/** Values at least 10 % away from 1.0 count as over- or under-represented in the per-tab headline. */
const HEADLINE_OVER = 1.1;
const HEADLINE_UNDER = 0.9;

/** Bar labels read "30 % af udsolgte · indeks 1,33 · n=3.478 · lavt n", so they need more room than the default. */
const BAR_LABEL_WIDTH = 290;

/**
 * Attribute tabs + scope toggle over sold_out_state.json. All numbers arrive pre-computed from the
 * server; this component only chooses which slice to show.
 */
export default function SoldOutExplorer({ attributes, lowN, minLaunched, launchWindowDays }: Props) {
  const [attr, setAttr] = useState<string>(attributes.length > 0 ? attributes[0].key : "");
  const [scope, setScope] = useState<Scope>("all");

  const current = attributes.find((a) => a.key === attr) ?? attributes[0];
  if (!current) return <p className="text-sm text-ink2">Ingen udsolgt-tilstand i eksporten.</p>;
  const panel = current.panels[scope];
  const share = panel.liveTotal > 0 ? panel.unavailableTotal / panel.liveTotal : null;

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

      {panel.tooFew.length > 0 ? (
        <div className="text-sm">
          <h3 className="font-medium text-ink">For få til et indeks</h3>
          <p className="mb-2 text-xs text-ink2">
            Værdier under 2&nbsp;% af de live varianter eller under {minLaunched} varianter i alt. Vist som
            rå tællinger.
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
