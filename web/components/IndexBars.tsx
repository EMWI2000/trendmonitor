"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fmtIndex, fmtInt, fmtPct } from "@/lib/format";

/** One bar. `label` is pre-formatted on the server so server and client render the same text. */
export interface IndexBarRow {
  value: string;
  index: number;
  n: number;
  lowN: boolean;
  label: string;
  shareBase: number | null;
  shareOutcome: number | null;
}

interface Props {
  rows: IndexBarRow[];
  /** Danish name of the denominator share, e.g. "andel af live varianter". */
  baseLabel: string;
  /** Danish name of the numerator share, e.g. "andel af varianter uden lager". */
  outcomeLabel: string;
  /** Right margin in px reserved for the bar labels; widen it when labels carry more than index and n. */
  labelWidth?: number;
}

const INK = "#0b0b0b";
const INK2 = "#52514e";
const MUTED = "#898781";
const HAIR = "#e1e0d9";
const AXIS = "#c3c2b7";
const BLUE = "#2a78d6";
const BLUE_SOFT = "#9ec5f4";

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: IndexBarRow }>;
  baseLabel: string;
  outcomeLabel: string;
}

function IndexTip({ active, payload, baseLabel, outcomeLabel }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded border border-hair bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="text-sm font-semibold text-ink">
        {fmtIndex(r.index)} <span className="font-normal text-ink2">{r.value}</span>
      </div>
      <div className="mt-1 text-ink2">
        n = {fmtInt(r.n)}
        {r.lowN ? " (lavt n)" : ""}
      </div>
      <div className="text-ink2">
        {outcomeLabel}: {fmtPct(r.shareOutcome, 1)}
      </div>
      <div className="text-ink2">
        {baseLabel}: {fmtPct(r.shareBase, 1)}
      </div>
    </div>
  );
}

/**
 * Horizontal bars of an index per attribute value, sorted by the caller, with a reference line at 1.0.
 * Bars with low n get the lighter blue step and the "lavt n" text in their label; identity is in the
 * label, never in colour alone.
 */
export default function IndexBars({ rows, baseLabel, outcomeLabel, labelWidth = 190 }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink2">Ingen værdier har et indeks i dette udsnit.</p>;
  }
  const max = Math.max(1.2, ...rows.map((r) => r.index));
  const domainMax = Math.ceil(max * 10) / 10 + 0.1;
  const height = rows.length * 30 + 44;
  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 20, right: labelWidth, bottom: 4, left: 4 }}
          barCategoryGap={6}
        >
          <CartesianGrid horizontal={false} stroke={HAIR} />
          <XAxis
            type="number"
            domain={[0, domainMax]}
            tick={{ fontSize: 11, fill: MUTED }}
            axisLine={{ stroke: AXIS }}
            tickLine={false}
            tickFormatter={(v: number) => fmtIndex(v)}
          />
          <YAxis
            type="category"
            dataKey="value"
            width={112}
            interval={0}
            tick={{ fontSize: 12, fill: INK2 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<IndexTip baseLabel={baseLabel} outcomeLabel={outcomeLabel} />}
            cursor={{ fill: "rgba(11,11,11,0.04)" }}
          />
          <ReferenceLine
            x={1}
            stroke={INK2}
            strokeWidth={1}
            label={{ value: "1,0", position: "top", fontSize: 11, fill: INK2 }}
          />
          <Bar dataKey="index" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.value} fill={r.lowN ? BLUE_SOFT : BLUE} />
            ))}
            <LabelList dataKey="label" position="right" fontSize={12} fill={INK} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
