import type { Metadata } from "next";

import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";
import ScatterPositioning, { type ScatterPoint } from "@/components/ScatterPositioning";
import SortableTable, { type SortableColumn, type SortableRow } from "@/components/SortableTable";
import { brandNames, loadMeta, loadPositioning, taxonomyAttributes } from "@/lib/data";
import { fmtDate, fmtDkk, fmtIndex, fmtPct, isNum } from "@/lib/format";
import { ATTRIBUTE_ORDER, attributeLabel, roleLabel } from "@/lib/labels";
import type { BrandProfile } from "@/lib/types";

export const metadata: Metadata = { title: "Positionering" };

/**
 * Column definitions need the launch window for the newness label, so they are built per render.
 * profile.py uses NEWNESS_DAYS = 56 for newness_share, the same window as thresholds.launch_window_days.
 */
function buildColumns(weeks: number): SortableColumn[] {
  return [
    { key: "brand", label: "Brand" },
    { key: "price_p50", label: "Medianpris", align: "right", hint: "DKK, omregnet fra butikkens valuta hvor nødvendigt" },
    { key: "dress_p50", label: "Medianpris, kjoler", align: "right" },
    { key: "price_index", label: "Prisindeks", align: "right", hint: "Medianpris mod referencebrandet = 1,0" },
    {
      key: "bands",
      label: "Prisbånd <1k / 1–2k / 2–3k / 3k+",
      align: "right",
      hint: "Andel af live styles i hvert prisbånd (DKK). Sorteres på andelen over 2.000",
    },
    { key: "sizes", label: "Størrelser" },
    { key: "newness_share", label: `Nyt ≤ ${weeks} uger`, align: "right" },
    { key: "markdown_share", label: "Nedsat", align: "right" },
    { key: "print_share", label: "Print-andel", align: "right", hint: "Andel af taggede styles der ikke er ensfarvede" },
    {
      key: "colour_share",
      label: "Farve-andel",
      align: "right",
      hint: "Andel af taggede styles uden for neutralerne sort, hvid, grå, brun og navy",
    },
    {
      key: "style_distance",
      label: "Stilafstand",
      align: "right",
      hint: "Vægtet Jensen–Shannon-afstand til referencen: 0 = samme mix",
    },
    {
      key: "overlap_with_self",
      label: "Overlap",
      align: "right",
      hint: "Andel af brandets (kategori, print, farve)-celler som også findes hos referencen",
    },
  ];
}

function topValues(mix: Record<string, number> | undefined, n: number): Array<[string, number]> {
  if (!mix) return [];
  return Object.entries(mix)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function bandsDisplay(bands: Record<string, number>): { display: string; sort: number | null } {
  const values = Object.values(bands);
  if (values.length === 0) return { display: "–", sort: null };
  const over2k = values.slice(2).reduce((a, v) => a + v, 0);
  return { display: values.map((v) => fmtPct(v)).join(" / "), sort: over2k };
}

export default function PositioningPage() {
  const meta = loadMeta();
  const pos = loadPositioning();
  const names = brandNames();
  const selfKey = pos.self_brand;
  const attrKeys = taxonomyAttributes(ATTRIBUTE_ORDER);
  const columns = buildColumns(Math.round(meta.thresholds.launch_window_days / 7));

  const ordered: BrandProfile[] = [...pos.brands].sort((a, b) => {
    if (a.brand === selfKey) return -1;
    if (b.brand === selfKey) return 1;
    return (names[a.brand] ?? a.brand).localeCompare(names[b.brand] ?? b.brand, "da-DK");
  });
  const selfProfile = ordered.find((b) => b.brand === selfKey);

  const points: ScatterPoint[] = [];
  for (const b of ordered) {
    if (isNum(b.price_index) && isNum(b.style_distance)) {
      points.push({
        key: b.brand,
        name: names[b.brand] ?? b.brand,
        role: b.role,
        x: b.price_index,
        y: b.style_distance,
        isSelf: b.brand === selfKey,
        priceLabel: fmtDkk(b.price_p50),
        overlapLabel: fmtPct(b.overlap_with_self),
      });
    }
  }
  const missing = ordered.filter((b) => !(isNum(b.price_index) && isNum(b.style_distance)));

  const rows: SortableRow[] = ordered.map((b) => {
    const self = b.brand === selfKey;
    const name = names[b.brand] ?? b.brand;
    const bands = bandsDisplay(b.price_bands);
    const sizes = [b.size_system, b.size_range].filter((s): s is string => typeof s === "string" && s.length > 0).join(" ");
    return {
      id: b.brand,
      highlight: self,
      cells: {
        brand: { display: self ? `${name} (reference)` : name, sort: name, sub: `${roleLabel(b.role)}${b.currency ? ` · ${b.currency}` : ""}` },
        price_p50: { display: fmtDkk(b.price_p50), sort: b.price_p50 },
        dress_p50: { display: fmtDkk(b.dress_p50), sort: b.dress_p50 },
        price_index: { display: fmtIndex(b.price_index), sort: b.price_index },
        bands: { display: bands.display, sort: bands.sort },
        sizes: { display: sizes.length > 0 ? sizes : "–", sort: sizes.length > 0 ? sizes : null },
        newness_share: { display: fmtPct(b.newness_share), sort: b.newness_share },
        markdown_share: { display: fmtPct(b.markdown_share), sort: b.markdown_share },
        print_share: { display: fmtPct(b.print_share), sort: b.print_share },
        colour_share: { display: fmtPct(b.colour_share), sort: b.colour_share },
        style_distance: { display: fmtIndex(b.style_distance), sort: b.style_distance },
        overlap_with_self: { display: fmtPct(b.overlap_with_self), sort: b.overlap_with_self },
      },
    };
  });

  const selfTop: Record<string, Set<string>> = {};
  for (const a of attrKeys) {
    selfTop[a] = new Set(topValues(selfProfile?.mix[a], 3).map(([v]) => v));
  }

  return (
    <>
      <PageHeader
        title="Positionering"
        lead={
          <>
            Hvor peers ligger i forhold til referencebrandet på pris og stil, baseret på det live
            sortiment {fmtDate(pos.report_date)}. Beskriver udbuddet, ikke kunden: hvem der køber,
            kræver brandets egne kundedata.
          </>
        }
      />

      <div className="space-y-6">
        <Card
          title="Pris mod stil"
          description="Vandret: medianpris mod referencen (1,0). Lodret: hvor forskelligt attributmixet er fra referencens (0 = identisk). Referencen ligger pr. definition i (1,0; 0,0)."
        >
          <ScatterPositioning points={points} />
          {missing.length > 0 ? (
            <p className="mt-2 text-xs text-ink2">
              Uden afstand eller prisindeks: {missing.map((b) => names[b.brand] ?? b.brand).join(", ")}.
            </p>
          ) : null}
        </Card>

        <Card title="Profil pr. brand" description="Priser i DKK. Klik på en kolonne for at sortere.">
          <SortableTable columns={columns} rows={rows} initialSort="price_index" caption="Positioneringstabel" />
        </Card>

        <Card
          title="Attributmix: top 3 pr. brand mod referencen"
          description={
            <>
              De tre største værdier i hver attribut med deres andel af brandets taggede styles.{" "}
              <span className="font-medium text-ink">Fed</span> = værdien er ikke i referencens top 3.
              Under hver celle står afstanden til referencen for den attribut.
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-axis text-left uppercase tracking-wide text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">
                    Brand
                  </th>
                  {attrKeys.map((a) => (
                    <th key={a} scope="col" className="px-2 py-2 font-medium">
                      {attributeLabel(a)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((b) => {
                  const self = b.brand === selfKey;
                  return (
                    <tr key={b.brand} className={`border-b border-hair align-top ${self ? "border-l-4 border-l-ink bg-plane" : ""}`}>
                      <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-medium text-ink">
                        {names[b.brand] ?? b.brand}
                        <div className="font-normal text-muted">{self ? "reference" : roleLabel(b.role)}</div>
                      </th>
                      {attrKeys.map((a) => {
                        const top = topValues(b.mix[a], 3);
                        const d = b.distances[a];
                        return (
                          <td key={a} className="px-2 py-2">
                            {top.length === 0 ? (
                              <span className="text-muted">–</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {top.map(([value, share]) => {
                                  const shared = self || selfTop[a]?.has(value);
                                  return (
                                    <li key={value} className={shared ? "text-ink2" : "font-medium text-ink"}>
                                      {value} <span className="tabular text-muted">{fmtPct(share)}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            {!self && isNum(d) ? <div className="mt-1 text-muted">afstand {fmtIndex(d)}</div> : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="rounded border border-hair bg-surface p-4 text-sm text-ink2">
          <h2 className="mb-1 text-base font-semibold text-ink">Metode</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Stilafstand: Jensen–Shannon-afstand mellem brandets og referencens attributmix, vægtet
              med kategori og print dobbelt, farve 1,5, silhuet og materiale 1, resten 0,5.
            </li>
            <li>Overlap: andel af brandets (kategori, print, farve)-celler, der også findes hos referencen.</li>
            <li>Prisindeks: brandets medianpris delt med referencens, begge i DKK.</li>
            <li>
              Taggede styles ligger til grund for mix og andele; tagget andel pr. brand står under Datakvalitet.
              Taksonomi v{meta.taxonomy_version}.
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
