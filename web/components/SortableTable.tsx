"use client";

import { useMemo, useState } from "react";

import LowNBadge from "./LowNBadge";

/** Columns and cells are plain data, formatted on the server, so no functions cross the boundary. */
export interface SortableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Optional longer explanation shown as a title attribute on the header. */
  hint?: string;
}

export interface SortableCell {
  display: string;
  /** Value used for sorting; null sorts last in both directions. */
  sort: number | string | null;
  lowN?: boolean;
  /** Second, muted line under the display value. */
  sub?: string;
}

export interface SortableRow {
  id: string;
  cells: Record<string, SortableCell>;
  /** Marks the reference brand. */
  highlight?: boolean;
}

interface Props {
  columns: SortableColumn[];
  rows: SortableRow[];
  initialSort?: string;
  initialDesc?: boolean;
  caption?: string;
}

function compareCells(a: SortableCell | undefined, b: SortableCell | undefined, desc: boolean): number {
  const av = a ? a.sort : null;
  const bv = b ? b.sort : null;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  let c: number;
  if (typeof av === "number" && typeof bv === "number") c = av - bv;
  else c = String(av).localeCompare(String(bv), "da-DK", { numeric: true });
  return desc ? -c : c;
}

export default function SortableTable({ columns, rows, initialSort, initialDesc = true, caption }: Props) {
  const [sortKey, setSortKey] = useState<string | null>(initialSort ?? null);
  const [desc, setDesc] = useState<boolean>(initialDesc);

  const sorted = useMemo(() => {
    if (sortKey === null) return rows;
    const key = sortKey;
    const copy = [...rows];
    copy.sort((a, b) => compareCells(a.cells[key], b.cells[key], desc));
    return copy;
  }, [rows, sortKey, desc]);

  function onSort(key: string) {
    if (key === sortKey) {
      setDesc(!desc);
    } else {
      setSortKey(key);
      setDesc(true);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-axis text-left text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => {
              const active = c.key === sortKey;
              const ariaSort = active ? (desc ? "descending" : "ascending") : "none";
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  title={c.hint}
                  className={`px-2 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}
                  >
                    {c.label}
                    <span aria-hidden="true" className="text-[10px]">
                      {active ? (desc ? "▼" : "▲") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.id}
              className={`border-b border-hair ${r.highlight ? "bg-plane font-medium" : ""}`}
            >
              {columns.map((c) => {
                const cell = r.cells[c.key];
                return (
                  <td
                    key={c.key}
                    className={`px-2 py-1.5 align-top ${c.align === "right" ? "tabular text-right" : "text-left"}`}
                  >
                    {cell ? (
                      <>
                        <span>{cell.display}</span>
                        {cell.lowN ? <LowNBadge /> : null}
                        {cell.sub ? <div className="text-xs font-normal text-muted">{cell.sub}</div> : null}
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
