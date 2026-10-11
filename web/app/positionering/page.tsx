import type { Metadata } from "next";
import Link from "next/link";

import Card from "@/components/Card";
import InsightCard from "@/components/InsightCard";
import MethodNote from "@/components/MethodNote";
import PageHeader from "@/components/PageHeader";
import ScatterPositioning, { type ScatterPoint } from "@/components/ScatterPositioning";
import SortableTable, { type SortableColumn, type SortableRow } from "@/components/SortableTable";
import { brandNames, loadInsights, loadMeta, loadPositioning, selfName, taxonomyAttributes } from "@/lib/data";
import { fmtDate, fmtDkk, fmtIndex, fmtInt, fmtNum, fmtPct, isNum } from "@/lib/format";
import { ATTRIBUTE_ORDER, attributeLabel, roleLabel } from "@/lib/labels";
import { FX_TO_DKK, NEUTRALS, NEWNESS_DAYS, STYLE_WEIGHTS } from "@/lib/method";
import type { BrandProfile } from "@/lib/types";

export const metadata: Metadata = { title: "Positionering" };

/**
 * Column definitions carry the newness window in the label, so they are built per render. profile.py uses its own
 * NEWNESS_DAYS for newness_share (mirrored in lib/method.ts), not metrics.LAUNCH_WINDOW_DAYS; the two are equal today.
 */
function buildColumns(weeks: number): SortableColumn[] {
  return [
    { key: "brand", label: "Brand" },
    { key: "price_p50", label: "Medianpris", align: "right", hint: "DKK, omregnet fra butikkens valuta hvor nødvendigt" },
    { key: "dress_p50", label: "Medianpris, kjoler", align: "right", hint: "Median af price_dkk for produkter tagget kategori dress" },
    { key: "price_index", label: "Prisindeks", align: "right", hint: "Medianpris mod referencebrandet = 1,0" },
    {
      key: "bands",
      label: "Prisbånd <1k / 1–2k / 2–3k / 3k+",
      align: "right",
      hint: "Andel af live styles i hvert prisbånd (DKK). Sorteres på andelen over 2.000",
    },
    { key: "sizes", label: "Størrelser", hint: "Størrelsessystem (alfa eller numerisk) og spænd i seneste snapshot" },
    { key: "newness_share", label: `Nyt ≤ ${weeks} uger`, align: "right", hint: `Andel af live styles publiceret inden for ${weeks} uger` },
    { key: "markdown_share", label: "Nedsat", align: "right", hint: "Andel af live varianter med førpris over pris" },
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
  const insights = loadInsights();
  const names = brandNames();
  const self = selfName();
  const selfKey = pos.self_brand;
  const attrKeys = taxonomyAttributes(ATTRIBUTE_ORDER);
  const newnessWeeks = Math.round(NEWNESS_DAYS / 7);
  const columns = buildColumns(newnessWeeks);
  const nearestInsight = insights.items.find((i) => i.kind === "nearest");

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
    const selfRow = b.brand === selfKey;
    const name = names[b.brand] ?? b.brand;
    const bands = bandsDisplay(b.price_bands);
    const sizes = [b.size_system, b.size_range].filter((s): s is string => typeof s === "string" && s.length > 0).join(" ");
    return {
      id: b.brand,
      highlight: selfRow,
      cells: {
        brand: { display: selfRow ? `${name} (reference)` : name, sort: name, sub: `${roleLabel(b.role)}${b.currency ? ` · ${b.currency}` : ""}` },
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

  const weightsText = STYLE_WEIGHTS.map((w) => `${attributeLabel(w.attribute).toLocaleLowerCase("da-DK")} ${fmtNum(w.weight, 1)}`).join(", ");
  const fxText = FX_TO_DKK.filter((f) => f.currency !== "DKK")
    .map((f) => `${f.currency} ${fmtNum(f.rate, 2)}`)
    .join(", ");

  return (
    <>
      <PageHeader
        title="Positionering"
        lead={
          <>
            Hvor peers ligger i forhold til {self} på pris og stil, baseret på det live
            sortiment {fmtDate(pos.report_date)}. Beskriver udbuddet, ikke kunden: hvem der køber,
            kræver brandets egne kundedata.
          </>
        }
      />

      <div className="space-y-6">
        <section aria-label={`Hvad betyder det for ${self}: nærmeste konkurrenter`}>
          {nearestInsight ? (
            <InsightCard
              item={nearestInsight}
              selfName={self}
              names={names}
              lowN={meta.thresholds.low_n}
              launchWindowDays={meta.thresholds.launch_window_days}
              markdownHeavy={insights.rules.markdown_heavy}
              showLink={false}
            />
          ) : (
            <div className="rounded border border-dashed border-axis bg-surface p-4 text-sm text-ink2">
              <p className="font-medium text-ink">Ingen nærmeste konkurrenter beregnet.</p>
              <p className="mt-1">Stilafstand kræver et referencebrand med taggede styles i seneste snapshot.</p>
            </div>
          )}
        </section>

        <Card title="Sådan læses stilafstand og overlap">
          <div className="space-y-2 text-sm text-ink2">
            <p>
              <span className="font-medium text-ink">Stilafstand</span> siger, hvor forskelligt et brands sortiment er
              sammensat i forhold til {self}s: 0 betyder samme fordeling på kategorier, print, farver, silhuetter,
              materialer, ærme, længde og anledning, 1 betyder intet fælles. Kategori og print vejer dobbelt, farve
              halvanden gang, ærme, længde og anledning en halv, fordi det er kategori, print og farve, der ses først på
              hylden. Afstanden handler om mixet, ikke om prisen og ikke om kvaliteten.
            </p>
            <p>
              <span className="font-medium text-ink">Overlap</span> siger, hvor stor en del af brandets kombinationer af
              kategori, print og farve der også findes hos {self}. Højt overlap betyder, at kunden kan finde &quot;det
              samme stykke&quot; begge steder; lavt overlap betyder, at brandet dækker andre felter, selv om afstanden kan
              være lille.
            </p>
            <p>
              <span className="font-medium text-ink">Sådan bruges det:</span> læs udsolgt-indekset under{" "}
              <Link href="/udsolgt#indeks" className="underline">
                Hvad er udsolgt nu
              </Link>{" "}
              mod brands med lav afstand og højt overlap først; det er dem, der ligger tættest på {self} i sortiment og
              pris. Brands med lille afstand men prisindeks langt fra 1,0 ligner på stil, ikke på pris. Brands langt væk
              på begge akser er inspiration, ikke sammenligning. Hvem der køber hvor, siger tallene ikke noget om.
            </p>
          </div>
        </Card>

        <Card
          title="Pris mod stil"
          description={`Vandret: medianpris mod ${self} (1,0). Lodret: hvor forskelligt attributmixet er fra ${self}s (0 = identisk). ${self} ligger pr. definition i (1,0; 0,0).`}
        >
          <ScatterPositioning points={points} />
          {missing.length > 0 ? (
            <p className="mt-2 text-xs text-ink2">
              Uden afstand eller prisindeks: {missing.map((b) => names[b.brand] ?? b.brand).join(", ")}.
            </p>
          ) : null}
          <MethodNote
            anchor="positionering"
            fields={["positioning.json: brands[].price_index, style_distance, overlap_with_self, price_p50, mix, distances"]}
          >
            <p>
              Prisindeks = brandets medianpris pr. live style i DKK delt med {self}s medianpris; priser omregnes med faste
              kurser ({fxText}). Stilafstand er Jensen–Shannon-afstanden (0–1) mellem brandets og {self}s andelsfordeling
              pr. attribut, kun taggede styles, vægtet med {weightsText} og delt med summen af vægtene.
            </p>
            <p>Et brand mangler i figuren, når det ikke har medianpris eller taggede styles i seneste snapshot.</p>
          </MethodNote>
        </Card>

        <Card title="Profil pr. brand" description="Priser i DKK. Klik på en kolonne for at sortere; hold musen over en overskrift for forklaringen.">
          <SortableTable columns={columns} rows={rows} initialSort="price_index" caption="Positioneringstabel" />
          <MethodNote
            anchor="positionering"
            fields={[
              "positioning.json: brands[].price_p50, dress_p50, price_index, price_bands, size_system, size_range, newness_share, markdown_share, print_share, colour_share, style_distance, overlap_with_self",
            ]}
          >
            <p>
              Medianpris og prisbånd er over live styles (én pris pr. produkt, DKK). Nyt ≤ {newnessWeeks} uger er andelen
              af styles med published_at inden for {fmtInt(NEWNESS_DAYS)} dage (profile.py NEWNESS_DAYS). Nedsat er
              andelen af varianter med førpris over pris. Print-andel = 1 − andelen tagget solid; farve-andel = andelen
              uden for {NEUTRALS.join(", ")}.
            </p>
            <p>
              Overlap = antal af brandets (kategori, print, farve)-celler, der også findes hos {self}, delt med brandets
              egne celler; en celle uden print eller farve tæller som &quot;?&quot;.
            </p>
          </MethodNote>
        </Card>

        <Card
          title={`Attributmix: top 3 pr. brand mod ${self}`}
          description={
            <>
              De tre største værdier i hver attribut med deres andel af brandets taggede styles.{" "}
              <span className="font-medium text-ink">Fed</span> = værdien er ikke i {self}s top 3.
              Under hver celle står afstanden til {self} for den attribut.
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
                  const selfRow = b.brand === selfKey;
                  return (
                    <tr key={b.brand} className={`border-b border-hair align-top ${selfRow ? "border-l-4 border-l-ink bg-plane" : ""}`}>
                      <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-medium text-ink">
                        {names[b.brand] ?? b.brand}
                        <div className="font-normal text-muted">{selfRow ? "reference" : roleLabel(b.role)}</div>
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
                                  const shared = selfRow || selfTop[a]?.has(value);
                                  return (
                                    <li key={value} className={shared ? "text-ink2" : "font-medium text-ink"}>
                                      {value} <span className="tabular text-muted">{fmtPct(share)}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            {!selfRow && isNum(d) ? <div className="mt-1 text-muted">afstand {fmtIndex(d)}</div> : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <MethodNote anchor="tags" fields={["positioning.json: brands[].mix, distances, tagged_share", `taxonomy.json v${meta.taxonomy_version}`]}>
            <p>
              Mix er andelen af brandets taggede styles pr. værdi i hver attribut (styles uden værdi i attributten tæller
              ikke med). Afstanden under cellen er Jensen–Shannon-afstanden for den ene attribut, før vægtning.
            </p>
            <p>
              Tags kommer fra regel-taggeren over titel, produkttype, tags og beskrivelse mod taksonomi v
              {meta.taxonomy_version}; tagget andel pr. brand står under Datakvalitet.
            </p>
          </MethodNote>
        </Card>
      </div>
    </>
  );
}
