import type { Metadata } from "next";
import Link from "next/link";

import Card from "@/components/Card";
import NotSalesNote from "@/components/NotSalesNote";
import PageHeader from "@/components/PageHeader";
import StatTile from "@/components/StatTile";
import {
  brandNames,
  isSelf,
  loadBrands,
  loadLaunchCalendar,
  loadMeta,
  loadMovements,
  loadRuns,
  loadSizeDepletion,
  loadSoldOutState,
} from "@/lib/data";
import { addDays, fmtDate, fmtIndex, fmtInt, fmtPct, isNum } from "@/lib/format";
import { attributeLabel } from "@/lib/labels";
import { movementSentence } from "@/lib/text";

export const metadata: Metadata = { title: "Oversigt" };

export default function OverviewPage() {
  const meta = loadMeta();
  const brands = loadBrands();
  const runs = loadRuns();
  const depletion = loadSizeDepletion();
  const calendar = loadLaunchCalendar();
  const movements = loadMovements();
  const state = loadSoldOutState();
  const names = brandNames();
  const t = meta.thresholds;

  // Coverage: the latest run date in runs.json.
  const latestDate = runs.reduce((acc, r) => (r.run_date > acc ? r.run_date : acc), "");
  const latest = runs.filter((r) => r.run_date === latestDate);
  const ok = latest.filter((r) => r.status === "ok");
  const okProducts = ok.reduce((a, r) => a + r.products, 0);
  const okVariants = ok.reduce((a, r) => a + r.variants, 0);

  // Stat tiles: peers only (the reference brand is never in an index).
  const peers = brands.filter((b) => !isSelf(b.brand));
  const liveStyles = peers.reduce((a, b) => a + b.live_products, 0);

  const peerDepletion = depletion.filter((r) => !isSelf(r.brand));
  const depLive = peerDepletion.reduce((a, r) => a + r.live_variants, 0);
  const depUnavailable = peerDepletion.reduce((a, r) => a + r.unavailable_variants, 0);
  const unavailableShare = depLive > 0 ? depUnavailable / depLive : null;

  const cutoff = addDays(meta.report_date, -t.launch_window_days);
  const launches8w = calendar
    .filter((r) => !isSelf(r.brand) && r.week_start >= cutoff)
    .reduce((a, r) => a + r.products, 0);

  // markdown_share is a per-variant share (metrics.py: marked_down_variants / live_variants), so the
  // peer average is weighted by variants, not styles.
  let mdWeight = 0;
  let mdSum = 0;
  for (const b of peers) {
    if (isNum(b.markdown_share)) {
      mdWeight += b.live_variants;
      mdSum += b.markdown_share * b.live_variants;
    }
  }
  const markdownShare = mdWeight > 0 ? mdSum / mdWeight : null;

  // During calibration nothing may be called an alert, so alert movements are filtered out defensively.
  // A "highest 4-week sell-out" of 0 % (day one, no events yet) says nothing and is dropped too.
  const sentences = movements
    .filter((m) => !(meta.calibration && m.kind === "alert") && !(m.kind === "brand_sell_out_4w" && m.rate <= 0))
    .map((m) => movementSentence(m, names));

  // Headline preview of /udsolgt: strongest state indices today, all live styles, robust n only.
  const top = state
    .filter((r) => r.scope === "all" && isNum(r.state_index) && !r.low_n)
    .sort((a, b) => (b.state_index ?? 0) - (a.state_index ?? 0))
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Oversigt"
        lead={
          <>
            Daglige snapshots af peers&apos; offentlige Shopify-kataloger, sammenlignet dag for dag til udsolgt-events
            og tagget mod en lukket taksonomi. Reference: {meta.self_brand ? names[meta.self_brand] ?? meta.self_brand : "–"}.
          </>
        }
      />

      <p className="mb-6 text-sm text-ink2">
        Seneste kørsel {fmtDate(latestDate)}: {fmtInt(ok.length)} af {fmtInt(latest.length)} brands ok,{" "}
        {fmtInt(okProducts)} produkter, {fmtInt(okVariants)} varianter. Rapportdato {fmtDate(meta.report_date)},{" "}
        {fmtInt(meta.snapshot_dates.length)} snapshots, {fmtInt(meta.weeks_of_history)} ugers eventhistorik.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Live styles hos peers" value={fmtInt(liveStyles)} sub={`${fmtInt(peers.length)} brands i seneste snapshot`} />
        <StatTile
          label="Varianter uden lager hos peers"
          value={fmtPct(unavailableShare)}
          sub={`af ${fmtInt(depLive)} varianter med størrelse. Tilstand i dag, ikke salg.`}
        />
        <StatTile
          label={`Lanceringer seneste ${Math.round(t.launch_window_days / 7)} uger`}
          value={fmtInt(launches8w)}
          sub="nye styles hos peers i lanceringskalenderen"
        />
        <StatTile
          label="Nedsat andel hos peers"
          value={fmtPct(markdownShare)}
          sub="andel af live varianter med rabat hos peers, vægtet med antal varianter"
        />
        <StatTile
          label="Historik"
          value={`${fmtInt(meta.weeks_of_history)} uger`}
          sub={meta.calibration ? `kalibrering indtil ${t.baseline_weeks} uger` : "baseline etableret"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Ugens bevægelser" description="Samme sætninger som i ugerapporten, stærkeste først.">
          {sentences.length === 0 ? (
            <p className="text-sm text-ink2">
              Ingen bevægelser endnu: events starter fra dag 2, når der er to snapshots at
              sammenligne. Brug i stedet{" "}
              <Link href="/udsolgt" className="underline">
                Hvad er udsolgt nu
              </Link>
              , som læser direkte på dagens lager.
            </p>
          ) : (
            <ul className="space-y-2 text-sm text-ink">
              {sentences.map((s, i) => (
                <li key={i} className="border-l-2 border-axis pl-3">
                  {s}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <NotSalesNote text={meta.notes.not_sales} />
          </div>
        </Card>

        <Card
          title="Højeste udsolgt-indeks lige nu"
          description={
            <>
              På tværs af attributter, alle live varianter hos peers.
              Detaljer under{" "}
              <Link href="/udsolgt" className="underline">
                Hvad er udsolgt nu
              </Link>
              .
            </>
          }
        >
          {top.length === 0 ? (
            <p className="text-sm text-ink2">Ingen værdier med robust n endnu.</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {top.map((r) => (
                <li key={`${r.attribute}-${r.value}`} className="flex items-baseline justify-between gap-3">
                  <span>
                    <span className="text-ink2">{attributeLabel(r.attribute)}</span>{" "}
                    <span className="font-medium text-ink">{r.value}</span>
                  </span>
                  <span className="tabular text-ink">
                    {fmtIndex(r.state_index)} <span className="text-muted">n={fmtInt(r.unavailable_n)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4">
            <NotSalesNote text={meta.notes.not_sales} extra={`${meta.notes.state} ${meta.notes.self_excluded}`} />
          </div>
        </Card>
      </div>

      <div className="mt-6 rounded border border-hair bg-surface p-4 text-sm text-ink2">
        <h2 className="mb-1 text-base font-semibold text-ink">Sådan læses tallene</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>{meta.notes.not_sales}</li>
          <li>{meta.notes.index}</li>
          <li>{meta.notes.low_n}</li>
          <li>{meta.notes.calibration}</li>
          <li>Delistede produkter tælles ikke som udsolgte.</li>
        </ul>
      </div>
    </>
  );
}
