import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  /** Section id on /metode (Danish, no special characters), e.g. "tilstand". */
  anchor: string;
  /** Two to four sentences on how the number above is computed; wording must match metrics.py / profile.py. */
  children: ReactNode;
  /** The exported files and fields the number rests on, e.g. "sold_out_state.json: live_n, unavailable_n". */
  fields: string[];
  /** Summary text; the default is the same on every page so readers learn to look for it. */
  title?: string;
}

/**
 * Collapsed "Sådan er det regnet" box, placed under every chart and table. Server component: a plain
 * <details> element needs no JavaScript, and the link lands on the matching section of the method page.
 */
export default function MethodNote({ anchor, children, fields, title = "Sådan er det regnet" }: Props) {
  return (
    <details className="mt-3 rounded border border-dashed border-axis bg-plane px-3 py-2 text-sm text-ink2">
      <summary className="cursor-pointer select-none font-medium text-ink">{title}</summary>
      <div className="mt-2 space-y-2">
        <div className="space-y-1">{children}</div>
        {fields.length > 0 ? (
          <p className="text-xs">
            <span className="font-medium">Bygger på:</span> {fields.join(" · ")}
          </p>
        ) : null}
        <p className="text-xs">
          <Link href={`/metode#${anchor}`} className="underline">
            Læs mere under Metode og forbehold
          </Link>
        </p>
      </div>
    </details>
  );
}
