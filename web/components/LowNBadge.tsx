/** "lavt n" marker, used wherever n is below meta.thresholds.low_n. Pure; usable from client components. */
export default function LowNBadge({ title }: { title?: string }) {
  return (
    <span
      title={title ?? "n er under tærsklen for et robust tal"}
      className="ml-1 inline-block rounded border border-amber-300 bg-amber-50 px-1 py-px align-middle text-[10px] font-medium uppercase tracking-wide text-amber-900"
    >
      lavt n
    </span>
  );
}
