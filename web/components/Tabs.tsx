"use client";

import { useState, type ReactNode } from "react";

export interface TabSpec {
  key: string;
  label: string;
}

interface Props {
  tabs: TabSpec[];
  /** Server-rendered panel per tab key. Passing ReactNode from a server component is fine. */
  panels: Record<string, ReactNode>;
  ariaLabel: string;
}

/** Small client-side tab strip; the panels themselves are rendered on the server. */
export default function Tabs({ tabs, panels, ariaLabel }: Props) {
  const [active, setActive] = useState<string>(tabs.length > 0 ? tabs[0].key : "");
  if (tabs.length === 0) return null;
  return (
    <div>
      <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1 border-b border-hair">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className={
                on
                  ? "-mb-px border-b-2 border-ink px-3 py-2 text-sm font-medium text-ink"
                  : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-ink2 hover:text-ink"
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-4">
        {panels[active] ?? null}
      </div>
    </div>
  );
}
