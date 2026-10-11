import type { Metadata } from "next";

import Card from "@/components/Card";
import InsightCard from "@/components/InsightCard";
import MethodNote from "@/components/MethodNote";
import NotSalesNote from "@/components/NotSalesNote";
import PageHeader from "@/components/PageHeader";
import SortableTable, { type SortableColumn, type SortableRow } from "@/components/SortableTable";
import { brandNames, isSelf, loadBrands, loadInsights, loadMeta, selfName } from "@/lib/data";
import { fmtDate, fmtInt, fmtNum, fmtPct, isNum } from "@/lib/format";
import { roleLabel } from "@/lib/labels";
import { COHORT_4W_DAYS, MEDIAN_DAYS_MAX_AGE, RESTOCK_WINDOW_DAYS } from "@/lib/method";
import type { MarkdownInsight } from "@/lib/types";

export const metadata: Metadata = { title: "Brands" };

/** One entry per column: header, tooltip, and the legend sentence (what it counts, which field, what it is not). */
interface ColumnDoc {
  key: string;
  label: string;
  align?: "left" | "right";
  hint: string;
  legend: string;
}

function columnDocs(lowN: number): ColumnDoc[] {
  const [c0, c1] = COHORT_4W_DAYS;
  return [
    {
      key: "brand",
      label: "Brand",
      hint: "Navn fra config/sources.yaml",
      legend: "Brandets navn fra sources.yaml (brands.json: brand); referencebrandet er markeret og indgår ikke i attributindeksene.",
    },
    {
      key: "role",
      label: "Rolle",
      hint: "Reference, peer, benchmark eller international fra sources.yaml",
      legend: "Rollen fra sources.yaml (role): reference er det brand, alt holdes op mod; peer, benchmark og international tæller alle som peers i indeksene.",
    },
    {
      key: "live_products",
      label: "Live styles",
      align: "right",
      hint: "Produkter i seneste snapshot efter live-filteret",
      legend: "Antal forskellige produkter i seneste snapshot efter live-filteret (live_products); ikke butikkens samlede katalog og ikke antal solgte styles.",
    },
    {
      key: "live_variants",
      label: "Live varianter",
      align: "right",
      hint: "Rækker (størrelse × farve) i seneste snapshot",
      legend: "Antal varianter, dvs. størrelse × farve, i seneste snapshot (live_variants); ikke antal styk på lager, som Shopify ikke viser.",
    },
    {
      key: "new_products",
      label: "Nye",
      align: "right",
      hint: "new_product-events i rapportugen: produkt-id set i dag, ikke i går",
      legend: "Produkter, der dukkede op i kataloget i rapportugen (new_products, fra new_product-events); ikke det samme som lanceringer efter published_at, som lanceringskalenderen bruger.",
    },
    {
      key: "sold_out_variants",
      label: "Udsolgte varianter (netto)",
      align: "right",
      hint: `Udsolgt-events i rapportugen minus genopfyldning af samme variant inden ${RESTOCK_WINDOW_DAYS} dage`,
      legend: `Varianter, der gik fra tilgængelig til ikke tilgængelig i rapportugen og ikke kom tilbage inden ${RESTOCK_WINDOW_DAYS} dage (sold_out_variants); indkøbsdybde gange efterspørgsel, ikke salg.`,
    },
    {
      key: "products_fully_sold_out",
      label: "Helt udsolgte",
      align: "right",
      hint: "product_sold_out-events: alle varianter uden lager i dag, mindst én tilgængelig i går",
      legend: "Produkter, hvor alle varianter blev utilgængelige i ugen (products_fully_sold_out); ikke produkter, der blev taget af sitet (det er delistet).",
    },
    {
      key: "restocks",
      label: "Genopfyldt",
      align: "right",
      hint: "restock-events: variant fra ikke tilgængelig til tilgængelig",
      legend: "Varianter, der gik fra ikke tilgængelig til tilgængelig i ugen (restocks); kan være ny levering eller en returvare, aldrig et salg.",
    },
    {
      key: "delisted",
      label: "Delistet",
      align: "right",
      hint: "delisted-events: produkt-id i går, ikke i dag. Tælles aldrig som udsolgt",
      legend: "Produkter, der forsvandt fra kataloget i ugen (delisted); tælles aldrig som udsolgte, fordi vi ikke kan se, om de blev solgt eller fjernet.",
    },
    {
      key: "markdown_share",
      label: "Nedsat andel",
      align: "right",
      hint: "Andel af live varianter med førpris over pris i seneste snapshot",
      legend: "Andel af live varianter, hvor compare_at_price er over price i seneste snapshot (markdown_share); et øjebliksbillede af hvad der står nedsat, ikke ugens nye nedsættelser.",
    },
    {
      key: "median_discount",
      label: "Medianrabat",
      align: "right",
      hint: "Median af 1 − pris / førpris over de nedsatte varianter",
      legend: "Median af 1 − price / compare_at_price over de nedsatte varianter (median_discount); tom når intet er nedsat. Siger ikke, hvor meget der sælges til den pris.",
    },
    {
      key: "sell_out_rate_4w",
      label: "Sell-out 4 uger (n)",
      align: "right",
      hint: `Andel af produkter lanceret for ${c0}–${c1} dage siden med mindst én netto udsolgt variant siden lancering; n = kohorten`,
      legend: `Andel af produkter lanceret for ${c0}–${c1} dage siden, der har mindst én netto udsolgt variant siden lanceringen (sell_out_rate_4w); n er kohortens størrelse (cohort_4w_n), under ${lowN} er lavt n. Første udsolgte størrelse, ikke udsolgt style.`,
    },
    {
      key: "median_days",
      label: "Median dage til første udsolgt",
      align: "right",
      hint: `Dage fra lancering til første netto udsolgt-event, produkter lanceret inden for ${MEDIAN_DAYS_MAX_AGE} dage`,
      legend: `Median antal dage fra lanceringsdato til første netto udsolgt-event blandt produkter lanceret inden for ${MEDIAN_DAYS_MAX_AGE} dage, der har et event (median_days_to_first_sold_out); produkter uden event tæller ikke med, så tallet undervurderer ventetiden.`,
    },
  ];
}

export default function BrandsPage() {
  const meta = loadMeta();
  const brands = loadBrands();
  const insights = loadInsights();
  const names = brandNames();
  const self = selfName();
  const lowN = meta.thresholds.low_n;
  const docs = columnDocs(lowN);
  const columns: SortableColumn[] = docs.map((d) => ({ key: d.key, label: d.label, align: d.align, hint: d.hint }));
  const markdownInsight = insights.items.find((i): i is MarkdownInsight => i.kind === "markdown");
  const markdownHeavy = insights.rules.markdown_heavy;
  const selfAboveMarkdown =
    markdownInsight !== undefined && isNum(markdownInsight.self_share) && markdownInsight.self_share >= markdownHeavy;
  // Before the first event every cohort has a sell-out rate of exactly 0, which reads as a measurement but is not one.
  const noEvents = meta.weeks_of_history === 0;

  const rows: SortableRow[] = brands.map((b) => {
    const selfRow = isSelf(b.brand);
    const name = names[b.brand] ?? b.brand;
    return {
      id: b.brand,
      highlight: selfRow,
      cells: {
        brand: { display: selfRow ? `${name} (reference)` : name, sort: name },
        role: { display: roleLabel(b.role), sort: roleLabel(b.role) },
        live_products: { display: fmtInt(b.live_products), sort: b.live_products },
        live_variants: { display: fmtInt(b.live_variants), sort: b.live_variants },
        new_products: { display: fmtInt(b.new_products), sort: b.new_products },
        sold_out_variants: { display: fmtInt(b.sold_out_variants), sort: b.sold_out_variants },
        products_fully_sold_out: { display: fmtInt(b.products_fully_sold_out), sort: b.products_fully_sold_out },
        restocks: { display: fmtInt(b.restocks), sort: b.restocks },
        delisted: { display: fmtInt(b.delisted), sort: b.delisted },
        markdown_share: { display: fmtPct(b.markdown_share), sort: b.markdown_share },
        median_discount: { display: fmtPct(b.median_discount), sort: b.median_discount },
        sell_out_rate_4w: {
          display:
            !noEvents && isNum(b.sell_out_rate_4w)
              ? `${fmtPct(b.sell_out_rate_4w)} (n=${fmtInt(b.cohort_4w_n)})`
              : `– (n=${fmtInt(b.cohort_4w_n)})`,
          sort: noEvents ? null : b.sell_out_rate_4w,
          lowN: b.cohort_4w_n < lowN,
        },
        median_days: { display: fmtNum(b.median_days_to_first_sold_out, 0), sort: b.median_days_to_first_sold_out },
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Brands"
        lead={
          <>
            Ugen {fmtDate(meta.week_start)} til {fmtDate(meta.report_date)} pr. brand. Klik på en kolonne
            for at sortere; hold musen over en overskrift for forklaringen. {self} vises til sammenligning og indgår
            ikke i attributindeksene.
          </>
        }
      />

      <div className="mb-4 space-y-1">
        <NotSalesNote
          text={meta.notes.not_sales}
          extra="Udsolgte varianter afhænger af indkøbsdybde og antal størrelser; sammenlign andele, ikke antal."
        />
        <NotSalesNote text={meta.notes.low_n} extra="Sell-out-raten vises med sin kohorte-n." />
      </div>

      <div className="space-y-6">
        <section aria-label={`Hvad betyder det for ${self}: prispres`}>
          {markdownInsight ? (
            <>
              <InsightCard
                item={markdownInsight}
                selfName={self}
                names={names}
                lowN={lowN}
                launchWindowDays={meta.thresholds.launch_window_days}
                markdownHeavy={markdownHeavy}
                showLink={false}
              />
              {selfAboveMarkdown ? (
                <p className="mt-2 text-sm text-ink2">
                  {self} ligger i dag selv over tærsklen på {fmtPct(markdownHeavy)} ({fmtPct(markdownInsight.self_share)}{" "}
                  nedsat); læs handlingen som: få markdown-andelen på nyheder ned, før peers&apos; takt kopieres.
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded border border-dashed border-axis bg-surface p-4 text-sm text-ink2">
              <p className="font-medium text-ink">Ingen prispres-indsigt i dag.</p>
              <p className="mt-1">
                Reglen udløses, når mindst én peer har {fmtPct(insights.rules.markdown_heavy)} eller mere af sine live
                varianter nedsat i seneste snapshot. Kolonnen &quot;Nedsat andel&quot; viser tallet pr. brand.
              </p>
            </div>
          )}
        </section>

        <Card>
          <SortableTable columns={columns} rows={rows} initialSort="live_products" caption="Brandtabel" />
          <MethodNote
            anchor="events"
            fields={[
              "brands.json: live_products, live_variants, new_products, sold_out_variants, products_fully_sold_out, restocks, delisted",
              "brands.json: markdown_share, median_discount, sell_out_rate_4w, cohort_4w_n, median_days_to_first_sold_out",
            ]}
          >
            <p>
              Live styles tæller forskellige produkter, live varianter rækker (størrelse × farve) i seneste snapshot.
              Event-kolonnerne tæller events i rapportugen, dvs. skift mellem to daglige snapshots: tilgængelig → ikke
              tilgængelig er udsolgt, det omvendte er genopfyldt, et produkt-id der forsvinder er delistet. Netto udsolgt
              trækker genopfyldning af samme variant inden {fmtInt(RESTOCK_WINDOW_DAYS)} dage fra.
            </p>
            <p>
              Nedsat andel og medianrabat er fra seneste snapshot (førpris over pris). Sell-out 4 uger følger kohorten
              lanceret for {COHORT_4W_DAYS[0]}–{COHORT_4W_DAYS[1]} dage siden og spørger, om mindst én variant er netto
              udsolgt siden lanceringen. Alt er indkøbsdybde gange efterspørgsel, aldrig salg.
            </p>
          </MethodNote>
        </Card>

        <div className="rounded border border-hair bg-surface p-4 text-sm text-ink2">
          <h2 className="mb-2 text-base font-semibold text-ink">Sådan læses kolonnerne</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
            {docs.map((d) => (
              <div key={d.key}>
                <dt className="font-medium text-ink">{d.label}</dt>
                <dd>{d.legend}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs">
            Events findes fra dag 2, når der er to snapshots at sammenligne; indtil da står event-kolonnerne på 0.
            Sell-out 4 uger og median dage vises først, når der er events; indtil da står der – med kohortens n.
          </p>
        </div>
      </div>
    </>
  );
}
