// Danish number and date formatting. Pure module: safe to import from client components.
//
// Conventions: Intl da-DK, so decimals use a comma and thousands a period ("3.478"), the same grouping as
// the weekly report. The space before "%" is a no-break space so "33 %" never wraps with the sign alone.

export const DASH = "–"; // en dash, same placeholder as the weekly report
const NBSP = " ";

const intFmt = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoFmt = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dateTimeFmt = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Whole number with Danish thousands separator: 3478 -> "3.478". */
export function fmtInt(x: number | null | undefined): string {
  return isNum(x) ? intFmt.format(x) : DASH;
}

/** Decimal number with 0, 1 or 2 digits. */
export function fmtNum(x: number | null | undefined, digits: 0 | 1 | 2 = 1): string {
  if (!isNum(x)) return DASH;
  if (digits === 0) return intFmt.format(x);
  return digits === 1 ? oneFmt.format(x) : twoFmt.format(x);
}

/** Share 0..1 as a percentage with a no-break space before the sign: 0.3017 -> "30 %". */
export function fmtPct(x: number | null | undefined, digits: 0 | 1 = 0): string {
  if (!isNum(x)) return DASH;
  return `${digits === 0 ? intFmt.format(100 * x) : oneFmt.format(100 * x)}${NBSP}%`;
}

/** Index with two decimals, Danish comma: 1.3266 -> "1,33". */
export function fmtIndex(x: number | null | undefined): string {
  return isNum(x) ? twoFmt.format(x) : DASH;
}

/** Price in DKK, whole kroner. */
export function fmtDkk(x: number | null | undefined): string {
  return isNum(x) ? `${intFmt.format(x)} kr.` : DASH;
}

function parseIso(iso: string): Date | null {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-10-11" -> "11. oktober 2026". Unparseable input is returned as-is. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = parseIso(iso);
  return d ? dateFmt.format(d) : iso;
}

/** "2026-10-11T14:52:28+00:00" -> "11. okt. 2026 14.52 UTC". */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = parseIso(iso);
  return d ? `${dateTimeFmt.format(d)} UTC` : iso;
}

/** ISO date arithmetic without time-zone surprises. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO week label for a date: "2026-10-11" -> "uge 41, 2026". */
export function isoWeekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  // Thursday of the same ISO week decides the year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `uge ${week}, ${d.getUTCFullYear()}`;
}

/** Short week label for chart axes: "2026-10-05" -> "5/10". */
export function fmtWeekShort(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
