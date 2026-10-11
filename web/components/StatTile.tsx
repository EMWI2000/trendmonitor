interface Props {
  label: string;
  value: string;
  sub?: string;
}

/** Stat tile: label, one proportional-figure value, optional one-line context. No colour on the number. */
export default function StatTile({ label, value, sub }: Props) {
  return (
    <div className="rounded border border-hair bg-surface px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink">{value}</div>
      {sub ? <div className="mt-1 text-xs text-ink2">{sub}</div> : null}
    </div>
  );
}
