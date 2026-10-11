import type { Metadata } from "next";

import Card from "@/components/Card";
import NotSalesNote from "@/components/NotSalesNote";
import PageHeader from "@/components/PageHeader";
import SortableTable, { type SortableColumn, type SortableRow } from "@/components/SortableTable";
import { brandNames, isSelf, loadBrands, loadMeta } from "@/lib/data";
import { fmtDate, fmtInt, fmtNum, fmtPct, isNum } from "@/lib/format";
import { roleLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Brands" };

const COLUMNS: SortableColumn[] = [
  { key: "brand", label: "Brand" },
  { key: "role", label: "Rolle" },
  { key: "live_products", label: "Live styles", align: "right" },
  { key: "live_variants", label: "Live varianter", align: "right" },
  { key: "new_products", label: "Nye", align: "right", hint: "Styles lanceret i rapportugen" },
  {
    key: "sold_out_variants",
    label: "Udsolgte varianter (netto)",
    align: "right",
    hint: "Udsolgt-events i rapportugen minus genopfyldning inden 7 dage",
  },
  { key: "products_fully_sold_out", label: "Helt udsolgte", align: "right", hint: "Styles hvor alle varianter blev udsolgt i ugen" },
  { key: "restocks", label: "Genopfyldt", align: "right" },
  {
    key: "markdown_share",
    label: "Nedsat andel",
    align: "right",
    hint: "Andel af live varianter med rabat (førpris over pris) i seneste snapshot",
  },
  { key: "median_discount", label: "Medianrabat", align: "right" },
  {
    key: "sell_out_rate_4w",
    label: "Sell-out 4 uger (n)",
    align: "right",
    hint: "Andel af styles lanceret for 3–5 uger siden med mindst én udsolgt størrelse",
  },
  { key: "median_days", label: "Median dage til første udsolgt", align: "right" },
];

export default function BrandsPage() {
  const meta = loadMeta();
  const brands = loadBrands();
  const names = brandNames();
  const lowN = meta.thresholds.low_n;

  const rows: SortableRow[] = brands.map((b) => {
    const self = isSelf(b.brand);
    const name = names[b.brand] ?? b.brand;
    return {
      id: b.brand,
      highlight: self,
      cells: {
        brand: { display: self ? `${name} (reference)` : name, sort: name },
        role: { display: roleLabel(b.role), sort: roleLabel(b.role) },
        live_products: { display: fmtInt(b.live_products), sort: b.live_products },
        live_variants: { display: fmtInt(b.live_variants), sort: b.live_variants },
        new_products: { display: fmtInt(b.new_products), sort: b.new_products },
        sold_out_variants: { display: fmtInt(b.sold_out_variants), sort: b.sold_out_variants },
        products_fully_sold_out: { display: fmtInt(b.products_fully_sold_out), sort: b.products_fully_sold_out },
        restocks: { display: fmtInt(b.restocks), sort: b.restocks },
        markdown_share: { display: fmtPct(b.markdown_share), sort: b.markdown_share },
        median_discount: { display: fmtPct(b.median_discount), sort: b.median_discount },
        sell_out_rate_4w: {
          display: isNum(b.sell_out_rate_4w) ? `${fmtPct(b.sell_out_rate_4w)} (n=${fmtInt(b.cohort_4w_n)})` : `– (n=${fmtInt(b.cohort_4w_n)})`,
          sort: b.sell_out_rate_4w,
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
            for at sortere. Referencebrandet vises til sammenligning og indgår ikke i attributindeksene.
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

      <Card>
        <SortableTable columns={COLUMNS} rows={rows} initialSort="live_products" caption="Brandtabel" />
      </Card>

      <div className="mt-6 rounded border border-hair bg-surface p-4 text-sm text-ink2">
        <h2 className="mb-1 text-base font-semibold text-ink">Kolonner</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Live styles og varianter: produkter og varianter i seneste snapshot.</li>
          <li>Nye, udsolgte, helt udsolgte og genopfyldt: events i rapportugen. Fra dag 2, når der er to snapshots.</li>
          <li>Nedsat andel og medianrabat: fra seneste snapshot, målt på varianter (førpris over pris).</li>
          <li>
            Sell-out 4 uger: andel af styles lanceret for 3–5 uger siden med mindst én udsolgt
            størrelse. n er kohortens størrelse; under {lowN} markeres lavt n.
          </li>
          <li>Median dage til første udsolgt: fra lancering til første udsolgt-event, kun styles med et event.</li>
        </ul>
      </div>
    </>
  );
}
