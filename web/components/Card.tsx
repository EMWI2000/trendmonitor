import type { ReactNode } from "react";

interface Props {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
}

/** A bordered section on the chart surface. */
export default function Card({ title, description, children }: Props) {
  return (
    <section className="rounded border border-hair bg-surface p-4">
      {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : null}
      {description ? <div className="mt-1 text-sm text-ink2">{description}</div> : null}
      <div className={title || description ? "mt-4" : ""}>{children}</div>
    </section>
  );
}
