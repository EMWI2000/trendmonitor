import type { Metadata } from "next";
import type { ReactNode } from "react";

import Card from "@/components/Card";
import IndexBars, { type IndexBarRow } from "@/components/IndexBars";
import LowNBadge from "@/components/LowNBadge";
import MethodNote from "@/components/MethodNote";
import NotSalesNote from "@/components/NotSalesNote";
import PageHeader from "@/components/PageHeader";
import SeriesChart, { type SeriesPanel, type SeriesPoint } from "@/components/SeriesChart";
import Tabs, { type TabSpec } from "@/components/Tabs";
import { loadAlerts, loadAttributes, loadMeta, loadSeries, taxonomyAttributes } from "@/lib/data";
import { fmtDate, fmtIndex, fmtInt, fmtNum, fmtPct, isNum } from "@/lib/format";
import { ATTRIBUTE_ORDER, attributeLabel } from "@/lib/labels";
import { MAD_SCALE_LABEL, MIN_ALERT_COUNT, MIN_SHARE_FOR_INDEX, RESTOCK_WINDOW_DAYS } from "@/lib/method";
import type { AttributeRow, SeriesRow } from "@/lib/types";

export const metadata: Metadata = { title: "Attributindeks" };

const SERIES_PANELS_PER_ATTRIBUTE = 8;

function sortAttributeRows(rows: AttributeRow[]): AttributeRow[] {
  return [...rows].sort((a, b) => {
    const ai = isNum(a.demand_index) ? a.demand_index : -1;
    const bi = isNum(b.demand_index) ? b.demand_index : -1;
    if (bi !== ai) return bi - ai;
    return b.launched_n - a.launched_n;
  });
}

function AttributeTable({ rows, lowN, weeks }: { rows: AttributeRow[]; lowN: number; weeks: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-axis text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="px-2 py-2 font-medium">
              Værdi
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium" title={`Produkter hos peers med lanceringsdato inden for ${weeks} uger og værdien (launched_n)`}>
              Lanceret, {weeks} uger
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium" title={`Netto udsolgt-events inden for ${weeks} uger på produkter med værdien (sold_out_n)`}>
              Netto udsolgt, {weeks} uger
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium" title="launched_n delt med alle lanceringer med en værdi i attributten (share_new)">
              Andel af nyt
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium" title="sold_out_n delt med alle netto udsolgt-events med en værdi i attributten (share_sold_out)">
              Andel af udsolgt
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium" title="share_sold_out / share_new (demand_index)">
              Indeks
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.value} className="border-b border-hair">
              <td className="px-2 py-1.5 text-ink">{r.value}</td>
              <td className="tabular px-2 py-1.5 text-right">{fmtInt(r.launched_n)}</td>
              <td className="tabular px-2 py-1.5 text-right">
                {fmtInt(r.sold_out_n)}
                {/* The badge qualifies an index; with no index (day one: every row has n=0) there is nothing to qualify. */}
                {r.low_n && isNum(r.demand_index) ? <LowNBadge title={`n under ${lowN}`} /> : null}
              </td>
              <td className="tabular px-2 py-1.5 text-right">{fmtPct(r.share_new, 1)}</td>
              <td className="tabular px-2 py-1.5 text-right">{fmtPct(r.share_sold_out, 1)}</td>
              <td className="tabular px-2 py-1.5 text-right font-medium text-ink">{fmtIndex(r.demand_index)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildSeriesPanels(series: SeriesRow[], attribute: string, weeks: number): SeriesPanel[] {
  const byValue = new Map<string, Map<number, number>>();
  for (const r of series) {
    if (r.attribute !== attribute) continue;
    let m = byValue.get(r.value);
    if (!m) {
      m = new Map<number, number>();
      byValue.set(r.value, m);
    }
    m.set(r.weeks_ago, (m.get(r.weeks_ago) ?? 0) + r.n);
  }
  const totals = Array.from(byValue.entries()).map(([value, m]) => ({
    value,
    total: Array.from(m.values()).reduce((a, n) => a + n, 0),
  }));
  totals.sort((a, b) => b.total - a.total);
  return totals.slice(0, SERIES_PANELS_PER_ATTRIBUTE).map(({ value }) => {
    const m = byValue.get(value) ?? new Map<number, number>();
    const points: SeriesPoint[] = [];
    for (let w = weeks - 1; w >= 0; w -= 1) {
      points.push({ week: w === 0 ? "0" : `-${w}`, n: m.get(w) ?? 0 });
    }
    return { key: `${attribute}-${value}`, title: value, points };
  });
}

export default function AttributesPage() {
  const meta = loadMeta();
  const attributes = loadAttributes();
  const series = loadSeries();
  const alerts = loadAlerts();
  const t = meta.thresholds;
  const weeks = Math.round(t.launch_window_days / 7);

  const attrKeys = taxonomyAttributes(ATTRIBUTE_ORDER).filter(
    (a) => attributes.some((r) => r.attribute === a) || series.some((r) => r.attribute === a),
  );
  const tabs: TabSpec[] = attrKeys.map((a) => ({ key: a, label: attributeLabel(a) }));
  const anyIndex = attributes.some((r) => isNum(r.demand_index));

  const indexPanels: Record<string, ReactNode> = {};
  for (const a of attrKeys) {
    const rows = sortAttributeRows(attributes.filter((r) => r.attribute === a));
    const bars: IndexBarRow[] = [];
    for (const r of rows) {
      if (isNum(r.demand_index)) {
        bars.push({
          value: r.value,
          index: r.demand_index,
          n: r.sold_out_n,
          lowN: r.low_n,
          label: `${fmtIndex(r.demand_index)} · n=${fmtInt(r.sold_out_n)}${r.low_n ? " · lavt n" : ""}`,
          shareBase: r.share_new,
          shareOutcome: r.share_sold_out,
        });
      }
    }
    indexPanels[a] = (
      <div className="space-y-4">
        {bars.length > 0 ? (
          <IndexBars rows={bars} baseLabel="andel af nyt sortiment" outcomeLabel="andel af netto udsolgte" />
        ) : (
          <p className="text-sm text-ink2">
            Intet indeks endnu for {attributeLabel(a).toLocaleLowerCase("da-DK")}: der er ingen netto udsolgt-events
            at sætte op mod lanceringerne. Tabellen viser, hvad peers har lanceret de seneste {weeks} uger.
          </p>
        )}
        <AttributeTable rows={rows} lowN={t.low_n} weeks={weeks} />
      </div>
    );
  }

  const seriesPanels: Record<string, ReactNode> = {};
  let maxN = 0;
  for (const r of series) maxN = Math.max(maxN, r.n);
  for (const a of attrKeys) {
    const panels = buildSeriesPanels(series, a, t.series_weeks);
    seriesPanels[a] =
      panels.length > 0 ? (
        <SeriesChart panels={panels} maxN={maxN} />
      ) : (
        <p className="text-sm text-ink2">Ingen events for {attributeLabel(a).toLocaleLowerCase("da-DK")} endnu.</p>
      );
  }

  const firstSnapshot = meta.snapshot_dates.length > 0 ? meta.snapshot_dates[0] : meta.latest_snapshot_date;

  return (
    <>
      <PageHeader
        title="Attributindeks over tid"
        lead={
          <>
            Bevægelsen: netto udsolgt-events (udsolgt minus genopfyldning inden {RESTOCK_WINDOW_DAYS} dage) pr. attributværdi,
            indekseret mod værdiens andel af det, peers har lanceret de seneste {weeks} uger. Supplement til øjebliksbilledet under Hvad er
            udsolgt nu.
          </>
        }
      />

      <div className="mb-4 space-y-1">
        <NotSalesNote text={meta.notes.not_sales} extra={meta.notes.index} />
        <NotSalesNote text={meta.notes.self_excluded} extra={meta.notes.low_n} />
      </div>

      <div className="space-y-6">
        <Card
          title="Hvad kommer hvornår"
          description={`Første snapshot ${fmtDate(firstSnapshot)}; lige nu ${fmtInt(meta.weeks_of_history)} af ${fmtInt(t.baseline_weeks)} ugers eventhistorik.`}
        >
          <ol className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            <li className="rounded border border-hair bg-plane p-3">
              <div className="text-xs uppercase tracking-wide text-muted">Dag 2</div>
              <div className="mt-1 font-medium text-ink">Events</div>
              <p className="mt-1 text-ink2">
                Når der er to snapshots, sammenlignes de variant for variant: udsolgt, genopfyldt, nyt, delistet, nedsat.
                Ugeserien får sine første punkter, brandtabellen sine første event-tal.
              </p>
            </li>
            <li className="rounded border border-hair bg-plane p-3">
              <div className="text-xs uppercase tracking-wide text-muted">Omkring uge 4</div>
              <div className="mt-1 font-medium text-ink">Indeks bliver meningsfuldt</div>
              <p className="mt-1 text-ink2">
                Indekset kræver mindst {fmtInt(t.min_launched)} lanceringer og {fmtPct(MIN_SHARE_FOR_INDEX)} af det nye
                sortiment pr. værdi, og n under {fmtInt(t.low_n)} netto udsolgte er lavt n. Det tager nogle uger, før de
                fleste værdier passerer det.
              </p>
            </li>
            <li className="rounded border border-hair bg-plane p-3">
              <div className="text-xs uppercase tracking-wide text-muted">
                Uge {fmtInt(t.baseline_weeks)}–{fmtInt(t.baseline_weeks + 1)}
              </div>
              <div className="mt-1 font-medium text-ink">Afvigelser</div>
              <p className="mt-1 text-ink2">
                Efter {fmtInt(t.baseline_weeks)} ugers eventhistorik slutter kalibreringen; fra uge{" "}
                {fmtInt(t.baseline_weeks + 1)} ({fmtInt(t.baseline_weeks)} hele baseline-uger plus den aktuelle) kan en uge
                kaldes en afvigelse: mindst {fmtInt(MIN_ALERT_COUNT)} netto udsolgte og flere end medianen plus 2 ×{" "}
                {MAD_SCALE_LABEL} × MAD. Indtil da står der Kalibrering, og intet kaldes en afvigelse.
              </p>
            </li>
          </ol>
        </Card>

        <Card
          title={`Udsolgt-indeks pr. attribut, ${weeks} uger`}
          description={
            anyIndex
              ? "Netto udsolgte varianter mod lanceringer: indeks over 1,0 betyder, at værdien udgør en større andel af det udsolgte end af det lancerede."
              : "Ingen events endnu, så ingen indeks. Lanceringstallene er på plads fra dag 1."
          }
        >
          <Tabs tabs={tabs} panels={indexPanels} ariaLabel="Attribut" />
          <MethodNote
            anchor="indeks"
            fields={["attributes.json: launched_n, sold_out_n, share_new, share_sold_out, demand_index, low_n", "meta.json: thresholds.launch_window_days, min_launched, low_n"]}
          >
            <p>
              Pr. attributværdi hos peers: share_new = andel af produkter med lanceringsdato inden for{" "}
              {fmtInt(t.launch_window_days)} dage, der har værdien; share_sold_out = andel af netto udsolgt-events i samme
              vindue på produkter med værdien. Indeks = share_sold_out / share_new.
            </p>
            <p>
              Netto udsolgt er et udsolgt-event uden genopfyldning af samme variant inden {fmtInt(RESTOCK_WINDOW_DAYS)}{" "}
              dage. Intet indeks når share_new er under {fmtPct(MIN_SHARE_FOR_INDEX)} eller launched_n under{" "}
              {fmtInt(t.min_launched)}; n er sold_out_n, lavt n under {fmtInt(t.low_n)}. Delistede produkter tæller
              aldrig som udsolgte.
            </p>
          </MethodNote>
        </Card>

        <Card
          title={`Ugeserie, seneste ${t.series_weeks} uger`}
          description="Netto udsolgte varianter pr. uge for de største værdier i hver attribut. Fælles y-akse, så panelerne kan sammenlignes."
        >
          {series.length === 0 ? (
            <div className="rounded border border-dashed border-axis p-4 text-sm text-ink2">
              <p className="font-medium text-ink">Events starter fra dag 2.</p>
              <p className="mt-1">
                Ugeserien bygges af forskelle mellem to daglige snapshots. Første snapshot er fra{" "}
                {fmtDate(firstSnapshot)}; de første punkter kommer efter næste kørsel,
                og serien bliver læsbar efter omkring 4 uger. Indtil da er Hvad er udsolgt
                nu det rigtige sted at kigge.
              </p>
            </div>
          ) : (
            <Tabs tabs={tabs} panels={seriesPanels} ariaLabel="Attribut, ugeserie" />
          )}
          <MethodNote anchor="kalibrering" fields={["series.json: attribute, value, weeks_ago, n", "meta.json: thresholds.series_weeks"]}>
            <p>
              Hvert punkt er antal netto udsolgt-events hos peers i én uge (7 dage bagud fra rapportdatoen, weeks_ago 0 er
              rapportugen) på produkter med værdien, over de seneste {fmtInt(t.series_weeks)} uger. De{" "}
              {SERIES_PANELS_PER_ATTRIBUTE} værdier med flest events i attributten vises.
            </p>
          </MethodNote>
        </Card>

        <Card title={meta.calibration ? "Kalibrering" : "Afvigelser denne uge"}>
          {meta.calibration ? (
            <div className="text-sm text-ink2">
              <p>
                {meta.notes.calibration} Lige nu er der {fmtInt(meta.weeks_of_history)} af {t.baseline_weeks} uger.
              </p>
              <p className="mt-2">
                Når baseline findes, markeres en uge som afvigelse, hvis antallet af netto udsolgte for en
                værdi overstiger medianen af de foregående {t.baseline_weeks} uger plus 2 gange den
                robuste spredning (MAD). Indtil da viser siden kun tilstand og indeks.
              </p>
            </div>
          ) : meta.weeks_of_history < t.baseline_weeks + 1 ? (
            <p className="text-sm text-ink2">
              Baseline etableret; de første afvigelser kan beregnes fra næste uge ({fmtInt(t.baseline_weeks)} hele
              baseline-uger plus den aktuelle).
            </p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-ink2">Ingen afvigelser denne uge.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-axis text-left text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-2 py-2 font-medium">
                      Attribut
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Værdi
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Denne uge
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Median, {t.baseline_weeks} uger
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      MAD
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={`${a.attribute}-${a.value}`} className="border-b border-hair">
                      <td className="px-2 py-1.5 text-ink2">{attributeLabel(a.attribute)}</td>
                      <td className="px-2 py-1.5 text-ink">{a.value}</td>
                      <td className="tabular px-2 py-1.5 text-right font-medium text-ink">{fmtInt(a.this_week)}</td>
                      <td className="tabular px-2 py-1.5 text-right">{fmtNum(a.baseline_median, 1)}</td>
                      <td className="tabular px-2 py-1.5 text-right">{fmtNum(a.baseline_mad, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <MethodNote anchor="kalibrering" fields={["alerts.json: this_week, baseline_median, baseline_mad", "meta.json: weeks_of_history, calibration, thresholds.baseline_weeks"]}>
            <p>
              For hver værdi sammenlignes ugens antal netto udsolgte med medianen af de foregående{" "}
              {fmtInt(t.baseline_weeks)} uger. Tærskel = median + 2 × {MAD_SCALE_LABEL} × MAD, hvor MAD er medianen af
              de absolutte afvigelser fra medianen. En afvigelse kræver mindst {fmtInt(MIN_ALERT_COUNT)} events i ugen og
              mindst {fmtInt(t.baseline_weeks + 1)} ugers historik.
            </p>
            <p>Historik tælles i uger siden første event; under {fmtInt(t.baseline_weeks)} uger er alt kalibrering.</p>
          </MethodNote>
        </Card>
      </div>
    </>
  );
}
