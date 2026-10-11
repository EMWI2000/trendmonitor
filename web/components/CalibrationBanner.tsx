import type { Meta } from "@/lib/types";

/**
 * Shown on every page while meta.calibration is true. During calibration nothing on the site may be
 * called an alert ("afvigelse"); the numbers describe the assortment, not deviations from a baseline.
 */
export default function CalibrationBanner({ meta }: { meta: Meta }) {
  if (!meta.calibration) return null;
  const weeks = meta.weeks_of_history;
  const target = meta.thresholds.baseline_weeks;
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
          Kalibrering
        </span>
        <span>
          {weeks} af {target} ugers eventhistorik. {meta.notes.calibration} Indtil da viser siden
          tilstand og indeks, ikke afvigelser.
        </span>
      </div>
    </div>
  );
}
