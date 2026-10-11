"use client";

import {
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { fmtIndex } from "@/lib/format";
import { roleLabel, roleSwatchClass } from "@/lib/labels";

export interface ScatterPoint {
  key: string;
  name: string;
  role: string;
  /** price_index: median price vs. the reference brand (1.0). */
  x: number;
  /** style_distance: weighted Jensen-Shannon distance to the reference brand (0 = identical mix). */
  y: number;
  isSelf: boolean;
  /** Pre-formatted details for the tooltip. */
  priceLabel: string;
  overlapLabel: string;
}

interface Props {
  points: ScatterPoint[];
}

const INK2 = "#52514e";
const MUTED = "#898781";
const HAIR = "#e1e0d9";
const AXIS = "#c3c2b7";

/** Categorical slots 1-3 for the three peer roles; the reference brand is ink and a diamond. */
const ROLE_COLORS: Record<string, string> = {
  self: "#0b0b0b",
  peer: "#2a78d6",
  benchmark: "#eb6834",
  international: "#1baf7a",
};
const ROLE_ORDER: readonly string[] = ["self", "peer", "benchmark", "international"];

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: ScatterPoint }>;
}

function ScatterTip({ active, payload }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-hair bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="text-sm font-semibold text-ink">
        {p.name} <span className="font-normal text-ink2">({roleLabel(p.role)})</span>
      </div>
      <div className="mt-1 text-ink2">Prisindeks {fmtIndex(p.x)}</div>
      <div className="text-ink2">Stilafstand {fmtIndex(p.y)}</div>
      <div className="text-ink2">Medianpris {p.priceLabel}</div>
      <div className="text-ink2">Overlap med reference {p.overlapLabel}</div>
    </div>
  );
}

export default function ScatterPositioning({ points }: Props) {
  const groups = ROLE_ORDER.map((role) => ({
    role,
    label: roleLabel(role),
    pts: points.filter((p) => p.role === role),
  })).filter((g) => g.pts.length > 0);
  if (points.length === 0) return <p className="text-sm text-ink2">Ingen profiler at vise.</p>;

  const maxX = Math.max(1.5, ...points.map((p) => p.x));
  const maxY = Math.max(0.5, ...points.map((p) => p.y));
  const domainX = Math.ceil(maxX * 10) / 10 + 0.1;
  const domainY = Math.ceil(maxY * 10) / 10;

  return (
    <div className="w-full">
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink2">
        {groups.map((g) => (
          <li key={g.role} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 ${g.role === "self" ? "rotate-45 rounded-sm" : "rounded-full"} ${roleSwatchClass(g.role)}`}
            />
            {g.label}
            {g.role === "self" ? " (1,0 / 0,0)" : ""}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={440}>
        <ScatterChart margin={{ top: 24, right: 40, bottom: 28, left: 12 }}>
          <CartesianGrid stroke={HAIR} />
          <XAxis
            type="number"
            dataKey="x"
            name="Prisindeks"
            domain={[0, domainX]}
            tick={{ fontSize: 11, fill: MUTED }}
            axisLine={{ stroke: AXIS }}
            tickLine={false}
            tickFormatter={(v: number) => fmtIndex(v)}
            label={{
              value: "Prisindeks: median pris mod reference (1,0)",
              position: "insideBottom",
              offset: -16,
              fontSize: 11,
              fill: INK2,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Stilafstand"
            domain={[0, domainY]}
            tick={{ fontSize: 11, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => fmtIndex(v)}
            label={{
              value: "Stilafstand: 0 = samme mix som reference",
              angle: -90,
              position: "insideLeft",
              offset: 8,
              fontSize: 11,
              fill: INK2,
            }}
          />
          <ZAxis type="number" range={[90, 90]} />
          <Tooltip content={<ScatterTip />} cursor={false} />
          <ReferenceLine x={1} stroke={AXIS} />
          {groups.map((g) => (
            <Scatter
              key={g.role}
              name={g.label}
              data={g.pts}
              fill={ROLE_COLORS[g.role] ?? "#898781"}
              shape={g.role === "self" ? "diamond" : "circle"}
              isAnimationActive={false}
            >
              <LabelList dataKey="name" position="top" offset={8} fontSize={11} fill={INK2} />
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
