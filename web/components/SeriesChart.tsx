"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fmtInt } from "@/lib/format";

export interface SeriesPoint {
  /** Axis label, e.g. "-11" .. "0" (weeks ago, oldest first). */
  week: string;
  n: number;
}

export interface SeriesPanel {
  key: string;
  title: string;
  points: SeriesPoint[];
}

interface Props {
  panels: SeriesPanel[];
  /** Shared y-axis maximum so the small multiples are comparable. */
  maxN: number;
}

const MUTED = "#898781";
const HAIR = "#e1e0d9";
const AXIS = "#c3c2b7";
const BLUE = "#2a78d6";
const SURFACE = "#fcfcfb";

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: SeriesPoint }>;
}

function SeriesTip({ active, payload }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const when = p.week === "0" ? "denne uge" : `${p.week.replace("-", "")} uger siden`;
  return (
    <div className="rounded border border-hair bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="text-sm font-semibold text-ink">{fmtInt(p.n)}</div>
      <div className="text-ink2">netto udsolgte varianter, {when}</div>
    </div>
  );
}

/** Small multiples: one single-series line per attribute value. One colour, no legend needed. */
export default function SeriesChart({ panels, maxN }: Props) {
  if (panels.length === 0) return null;
  const domainMax = Math.max(1, maxN);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {panels.map((p) => {
        const last = p.points.length > 0 ? p.points[p.points.length - 1].n : 0;
        return (
          <div key={p.key} className="rounded border border-hair bg-surface p-3">
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-ink">{p.title}</span>
              <span className="text-ink2">
                {fmtInt(last)} <span className="text-muted">denne uge</span>
              </span>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={p.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={HAIR} />
                <XAxis
                  dataKey="week"
                  interval="preserveStartEnd"
                  tick={{ fontSize: 10, fill: MUTED }}
                  tickLine={false}
                  axisLine={{ stroke: AXIS }}
                />
                <YAxis
                  domain={[0, domainMax]}
                  width={30}
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: MUTED }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<SeriesTip />} cursor={{ stroke: AXIS }} />
                <Line
                  type="monotone"
                  dataKey="n"
                  stroke={BLUE}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2, fill: BLUE }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
