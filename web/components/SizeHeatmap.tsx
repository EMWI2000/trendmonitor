import { compareSizes, roleLabel, sizeClass } from "@/lib/labels";
import { fmtInt, fmtPct, isNum } from "@/lib/format";
import type { SizeDepletionRow } from "@/lib/types";

interface Props {
  rows: SizeDepletionRow[];
  selfBrand: string | null;
  brandNames: Record<string, string>;
  lowN: number;
}

/** Sequential blue ramp, light -> dark, with ink chosen by the step's luminance. Literal classes for JIT. */
const SHADES: readonly string[] = [
  "bg-seq-100 text-ink",
  "bg-seq-200 text-ink",
  "bg-seq-300 text-ink",
  "bg-seq-400 text-white",
  "bg-seq-500 text-white",
  "bg-seq-600 text-white",
  "bg-seq-700 text-white",
];

function shadeClass(share: number): string {
  // 0..1 -> 7 equal bins; 0 exactly stays on the surface so "nothing missing" reads as nothing.
  if (share <= 0) return "bg-surface text-ink2";
  const i = Math.min(SHADES.length - 1, Math.floor(share * SHADES.length));
  return SHADES[i];
}

interface Cell {
  share: number | null;
  live: number;
  unavailable: number;
}

function buildMatrix(rows: SizeDepletionRow[]): Map<string, Map<string, Cell>> {
  const m = new Map<string, Map<string, Cell>>();
  for (const r of rows) {
    let row = m.get(r.brand);
    if (!row) {
      row = new Map<string, Cell>();
      m.set(r.brand, row);
    }
    row.set(r.size, { share: r.unavailable_share, live: r.live_variants, unavailable: r.unavailable_variants });
  }
  return m;
}

function Grid({
  brands,
  sizes,
  matrix,
  selfBrand,
  brandNames,
  roles,
  lowN,
}: {
  brands: string[];
  sizes: string[];
  matrix: Map<string, Map<string, Cell>>;
  selfBrand: string | null;
  brandNames: Record<string, string>;
  roles: Record<string, string>;
  lowN: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-axis text-left uppercase tracking-wide text-muted">
            <th scope="col" className="px-2 py-2 font-medium">
              Brand
            </th>
            {sizes.map((s) => (
              <th key={s} scope="col" className="px-1 py-2 text-center font-medium">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => {
            const self = b === selfBrand;
            const row = matrix.get(b);
            return (
              <tr
                key={b}
                className={`border-b border-hair ${self ? "border-l-4 border-l-ink bg-plane" : ""}`}
              >
                <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-medium text-ink">
                  {brandNames[b] ?? b}
                  <span className="ml-1 font-normal text-muted">
                    {self ? "(reference, ikke i indeks)" : `(${roleLabel(roles[b] ?? "")})`}
                  </span>
                </th>
                {sizes.map((s) => {
                  const cell = row ? row.get(s) : undefined;
                  if (!cell || !isNum(cell.share)) {
                    return (
                      <td key={s} className="px-1 py-1 text-center text-muted">
                        –
                      </td>
                    );
                  }
                  const low = cell.live < lowN;
                  return (
                    <td
                      key={s}
                      title={`${brandNames[b] ?? b} ${s}: ${fmtInt(cell.unavailable)} af ${fmtInt(cell.live)} varianter uden lager${low ? " (lavt n)" : ""}`}
                      className={`tabular border-l-2 border-surface px-1 py-1 text-center ${shadeClass(cell.share)} ${low ? "italic" : ""}`}
                    >
                      {fmtPct(cell.share)}
                      {low ? "†" : ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Brand x size table of the share of live variants that are unavailable today. A stock measure of the
 * latest snapshot, never a flow; the reference brand is shown for comparison but is not in any index.
 */
export default function SizeHeatmap({ rows, selfBrand, brandNames, lowN }: Props) {
  if (rows.length === 0) return <p className="text-sm text-ink2">Ingen størrelsesdata i seneste snapshot.</p>;

  const matrix = buildMatrix(rows);
  const roles: Record<string, string> = {};
  for (const r of rows) roles[r.brand] = r.role;

  const brands = Array.from(matrix.keys()).sort((a, b) => {
    if (a === selfBrand) return -1;
    if (b === selfBrand) return 1;
    return (brandNames[a] ?? a).localeCompare(brandNames[b] ?? b, "da-DK");
  });

  const allSizes = Array.from(new Set(rows.map((r) => r.size))).sort(compareSizes);
  const coreSizes = allSizes.filter((s) => sizeClass(s) !== "other");
  const otherSizes = allSizes.filter((s) => sizeClass(s) === "other");
  const otherVariants = rows
    .filter((r) => sizeClass(r.size) === "other")
    .reduce((acc, r) => acc + r.live_variants, 0);

  return (
    <div className="space-y-3">
      <Grid
        brands={brands}
        sizes={coreSizes}
        matrix={matrix}
        selfBrand={selfBrand}
        brandNames={brandNames}
        roles={roles}
        lowN={lowN}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
        <span>Andel af live varianter uden lager, mørkere = større andel.</span>
        <span className="flex items-center gap-1">
          {SHADES.map((cls) => (
            <span key={cls} aria-hidden="true" className={`inline-block h-3 w-5 ${cls.split(" ")[0]}`} />
          ))}
          <span className="ml-1">0 → 100&nbsp;%</span>
        </span>
        <span>† lavt n: under {lowN} live varianter i cellen.</span>
      </div>
      {otherSizes.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink2">
            Øvrige størrelser ({otherSizes.length} koder, {fmtInt(otherVariants)} varianter: taljemål 24–31,
            sko (EU), UK, kombinationer og one size)
          </summary>
          <div className="mt-2">
            <Grid
              brands={brands}
              sizes={otherSizes}
              matrix={matrix}
              selfBrand={selfBrand}
              brandNames={brandNames}
              roles={roles}
              lowN={lowN}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
