import type { Metadata } from "next";
import Link from "next/link";

import Card from "@/components/Card";
import InsightCard from "@/components/InsightCard";
import MethodNote from "@/components/MethodNote";
import NotSalesNote from "@/components/NotSalesNote";
import PageHeader from "@/components/PageHeader";
import StatTile from "@/components/StatTile";
import {
  brandNames,
  isSelf,
  loadBrands,
  loadInsights,
  loadLaunchCalendar,
  loadMeta,
  loadMovements,
  loadRuns,
  loadSizeDepletion,
  loadSoldOutState,
  selfName,
} from "@/lib/data";
import { computeAttributeCoverage } from "@/lib/coverage";
import { addDays, fmtDate, fmtIndex, fmtInt, fmtPct, isNum } from "@/lib/format";
import { attributeLabel, attributeWord, isAttributeInsight } from "@/lib/labels";
import {
  LIVE_DAYS,
  MIN_SHARE_FOR_INDEX,
  MOVEMENT_MARKDOWN_SHARE,
  MOVEMENT_MIN_COHORT,
  MOVEMENT_MIN_LAUNCHED,
  MOVEMENT_MIN_N_CALIBRATION,
  MOVEMENT_OVER_INDEX,
  MOVEMENT_UNDER_INDEX,
  RESTOCK_WINDOW_DAYS,
} from "@/lib/method";
import { movementSentence } from "@/lib/text";
import type { AttributeInsightKind, MarkdownInsight, NearestInsight, SizesInsight } from "@/lib/types";

export const metadata: Metadata = { title: "Oversigt" };

export default function OverviewPage() {
  const meta = loadMeta();
  const brands = loadBrands();
  const runs = loadRuns();
  const depletion = loadSizeDepletion();
  const calendar = loadLaunchCalendar();
  const movements = loadMovements();
  const state = loadSoldOutState();
  const insights = loadInsights();
  const names = brandNames();
  const self = selfName();
  const t = meta.thresholds;
  const weeks = Math.round(t.launch_window_days / 7);

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

  const items = [...insights.items].sort((a, b) => a.rank - b.rank);
  const coverage = computeAttributeCoverage(state, brands);

  // The insights always read the state of the latest snapshot (insights.compute_insights); calibration only
  // says whether the movement-based numbers elsewhere on the site are ready.
  const basisSentence =
    `Indsigterne bygger altid på tilstanden i snapshottet ${fmtDate(insights.latest_snapshot_date)}, ikke på ` +
    "bevægelser.";
  const calibrationSentence = insights.calibration
    ? `Kalibrering: ${fmtInt(insights.weeks_of_history)} af ${fmtInt(t.baseline_weeks)} ugers eventhistorik, så ` +
      "afvigelser rapporteres endnu ikke, og indekset over tid under Attributindeks skal læses som retning."
    : `${fmtInt(insights.weeks_of_history)} ugers eventhistorik; baseline er etableret.`;

  // "Kort fortalt": one line per kind in a fixed order, built from the same items as the cards.
  const attributeItems = items.filter(isAttributeInsight);
  const allScopeCount = attributeItems.filter((i) => i.scope === "all").length;
  const scopeSentence =
    attributeItems.length > 0
      ? `${fmtInt(allScopeCount)} af ${fmtInt(attributeItems.length)} attributindsigter bygger på hele det live ` +
        `sortiment inkl. ældre styles og outlet; ${fmtInt(attributeItems.length - allScopeCount)} på nyheder.`
      : "";
  const valuesOfKind = (kind: AttributeInsightKind): string[] =>
    attributeItems.filter((i) => i.kind === kind).map((i) => `${attributeWord(i.attribute)} ${i.value}`);
  const whiteSpaces = valuesOfKind("white_space");
  const strengths = valuesOfKind("strength");
  const risks = valuesOfKind("risk");
  const sizesInsight = items.find((i): i is SizesInsight => i.kind === "sizes");
  const markdownInsight = items.find((i): i is MarkdownInsight => i.kind === "markdown");
  const nearestInsight = items.find((i): i is NearestInsight => i.kind === "nearest");
  const hotSizes = sizesInsight ? sizesInsight.sizes.map((s) => s.size).join(", ") : "";

  const summary: Array<{ label: string; text: string }> = [];
  if (whiteSpaces.length > 0) summary.push({ label: "Test i begrænset dybde (hvidt felt)", text: whiteSpaces.join(", ") });
  if (strengths.length > 0) summary.push({ label: "Hold dybden (styrke)", text: strengths.join(", ") });
  if (risks.length > 0) summary.push({ label: "Pas på dybden (risiko)", text: risks.join(", ") });
  if (sizesInsight) summary.push({ label: "Størrelser oftest uden lager hos peers", text: hotSizes });
  if (markdownInsight) {
    const own = isNum(markdownInsight.self_share) ? ` (${self} selv ${fmtPct(markdownInsight.self_share)})` : "";
    summary.push({
      label: "Prispres",
      text:
        `${fmtInt(markdownInsight.peer_count)} af ${fmtInt(markdownInsight.peer_total)} peers har mindst ` +
        `${fmtPct(insights.rules.markdown_heavy)} nedsat${own}`,
    });
  }
  if (nearestInsight) {
    summary.push({ label: "Læs tallene mod", text: nearestInsight.brands.map((b) => names[b.brand] ?? b.brand).join(", ") });
  }

  // Three or four concrete steps for the next drop or buying meeting, each tied to an item above.
  const actions: string[] = [];
  if (whiteSpaces.length > 0) {
    actions.push(
      `Vælg 1–2 hvide felter (${whiteSpaces.join(", ")}) til en test i begrænset dybde i næste drop, og notér indeks og n i dag.`,
    );
  }
  if (risks.length > 0) {
    actions.push(
      `Hold ${risks.join(" og ")} op mod ${self}s egne udsolgt-tal på kortene, før dybden skæres eller nedsættelser planlægges.`,
    );
  }
  if (sizesInsight) {
    actions.push(`Tjek ${self}s egen størrelseskurve på ${hotSizes} mod peers' tal under Størrelser, før næste ordre fordeles.`);
  }
  actions.push(
    `Tjek igen om en uge: Attributindeks får events fra dag 2 og en baseline efter ${fmtInt(t.baseline_weeks)} uger, så I kan ` +
      "se, om bevægelsen følger øjebliksbilledet.",
  );

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

      <section aria-labelledby="insights-heading" className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="insights-heading" className="text-xl font-semibold tracking-tight text-ink">
            Hvad betyder det for {self}
          </h2>
          <span className="text-xs text-muted">
            {fmtInt(items.length)} indsigter: attributindsigter rangeret efter rangvægt, derefter størrelser, prispres og
            nærmeste konkurrenter · snapshot {fmtDate(insights.latest_snapshot_date)}
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink2">
          {insights.note} {basisSentence} {calibrationSentence} {scopeSentence}
        </p>

        {items.length === 0 ? (
          <div className="mt-4 rounded border border-dashed border-axis bg-surface p-4 text-sm text-ink2">
            <p className="font-medium text-ink">Ingen indsigter i dag.</p>
            <p className="mt-1">
              Ingen af de seks regler blev udløst af seneste snapshot: ingen værdi med robust n ligger over{" "}
              {fmtIndex(insights.rules.over_index)} eller under {fmtIndex(insights.rules.under_index)} med en tydelig
              forskel til {self}s egen andel, ingen størrelse ligger mindst {fmtInt(100 * insights.rules.size_gap)}{" "}
              procentpoint over peers&apos; gennemsnit, og ingen peer har mindst {fmtPct(insights.rules.markdown_heavy)}{" "}
              nedsat. Tallene står stadig under{" "}
              <Link href="/udsolgt" className="underline">
                Hvad er udsolgt nu
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded border border-ink bg-surface p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Kort fortalt</h3>
                <dl className="mt-2 space-y-1.5 text-sm">
                  {summary.map((s) => (
                    <div key={s.label} className="flex flex-wrap gap-x-2">
                      <dt className="font-medium text-ink">{s.label}:</dt>
                      <dd className="text-ink2">{s.text}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-ink2">Detaljer, tal og n på kortene nedenfor.</p>
              </div>
              <div className="rounded border border-hair bg-plane p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Til næste drop- og indkøbsmøde</h3>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink">
                  {actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-ink2">
                  Hypoteser til test, ikke konklusioner: udsolgt er indkøbsdybde gange efterspørgsel, ikke salg.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {items.map((item) => (
                <InsightCard
                  key={`${item.kind}-${item.rank}`}
                  item={item}
                  selfName={self}
                  names={names}
                  lowN={t.low_n}
                  launchWindowDays={t.launch_window_days}
                  markdownHeavy={insights.rules.markdown_heavy}
                  coverage={coverage}
                />
              ))}
            </div>
          </>
        )}

        <div className="mt-3">
          <NotSalesNote text={meta.notes.not_sales} extra={meta.notes.self_excluded} />
        </div>
        <MethodNote
          anchor="indsigter"
          fields={[
            "insights.json: items (kind, peer_index, peer_n, peer_share, self_share, sizes, peer_count, brands), rules",
            "sold_out_state.json, size_depletion.json, brands.json, positioning.json",
          ]}
        >
          <p>
            Seks faste regler læser tilstanden i seneste snapshot op mod {self}s eget sortiment. Hvidt felt: peers&apos;
            udsolgt-indeks er mindst {fmtIndex(insights.rules.over_index)}, og {self}s andel af taggede live varianter i
            værdien er under {fmtIndex(insights.rules.white_space_ratio)} gange peers&apos; andel. Styrke: samme indeks,
            men {self}s andel er mindst lige så stor som peers&apos;. Risiko: indeks højst{" "}
            {fmtIndex(insights.rules.under_index)}, og {self}s andel er mindst {fmtIndex(insights.rules.heavy_ratio)}{" "}
            gange peers&apos; og mindst {fmtPct(insights.rules.min_self_share)}. Andelene er af de varianter, der har et
            tag i attributten; kortene viser dækningen, når den er lav.
          </p>
          <p>
            Attributindsigter rangeres efter rangvægt = |ln(indeks)| × √n; den stærkeste af hver slags vises altid, højst{" "}
            {fmtInt(insights.rules.per_kind_cap)} pr. slags og {fmtInt(insights.rules.max_attribute_insights)} i alt, kun
            værdier med n på mindst {fmtInt(insights.rules.low_n)}. Derefter størrelser, prispres og nærmeste
            konkurrenter med faste rangvægte. Alt er hypoteser til test, ikke konklusioner.
          </p>
        </MethodNote>
      </section>

      <p className="mb-6 text-sm text-ink2">
        Seneste kørsel {fmtDate(latestDate)}: {fmtInt(ok.length)} af {fmtInt(latest.length)} brands ok,{" "}
        {fmtInt(okProducts)} produkter, {fmtInt(okVariants)} varianter. Rapportdato {fmtDate(meta.report_date)},{" "}
        {fmtInt(meta.snapshot_dates.length)} snapshots, {fmtInt(meta.weeks_of_history)} ugers eventhistorik.
      </p>

      <div className="mb-2 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Live styles hos peers" value={fmtInt(liveStyles)} sub={`${fmtInt(peers.length)} brands i seneste snapshot`} />
        <StatTile
          label="Varianter uden lager hos peers"
          value={fmtPct(unavailableShare)}
          sub={`af ${fmtInt(depLive)} varianter med størrelse. Tilstand i dag, ikke salg.`}
        />
        <StatTile
          label={`Lanceringer seneste ${weeks} uger`}
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
      <div className="mb-8">
        <MethodNote
          anchor="snapshot"
          fields={[
            "brands.json: live_products, live_variants, markdown_share (peers)",
            "size_depletion.json: live_variants, unavailable_variants (peers)",
            "launch_calendar.json: products pr. uge",
            "meta.json: weeks_of_history, thresholds.baseline_weeks",
          ]}
        >
          <p>
            Live styles er antal produkter pr. peer i seneste snapshot efter live-filteret (mindst én tilgængelig variant,
            eller publiceret inden for {fmtInt(LIVE_DAYS)} dage). Varianter uden lager er summen af peers&apos; utilgængelige
            varianter med en genkendt størrelse delt med alle deres live varianter med størrelse.
          </p>
          <p>
            Lanceringer tæller produkter med lanceringsdato (published_at, ellers første snapshot) i de seneste{" "}
            {weeks} uger hos peers. Nedsat andel er peers&apos; andel af live varianter med førpris over pris, vægtet med
            antal varianter. Historik er antal uger siden første event.
          </p>
        </MethodNote>
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
          <MethodNote
            anchor="indeks"
            fields={["movements.json", "attributes.json: demand_index, sold_out_n, launched_n", "brands.json: sell_out_rate_4w, markdown_share", "alerts.json"]}
          >
            <p>
              Bevægelser er udvalgt af ugerapportens regler: attributværdier med indeks mindst{" "}
              {fmtIndex(MOVEMENT_OVER_INDEX)} og n på mindst {fmtInt(t.low_n)} ({fmtInt(MOVEMENT_MIN_N_CALIBRATION)} under
              kalibrering), eller indeks højst {fmtIndex(MOVEMENT_UNDER_INDEX)} med mindst {fmtInt(MOVEMENT_MIN_LAUNCHED)}{" "}
              lanceringer; brandet med højeste 4-ugers sell-out blandt kohorter på mindst {fmtInt(MOVEMENT_MIN_COHORT)};
              brandet med højeste nedsatte andel, hvis den er mindst {fmtPct(MOVEMENT_MARKDOWN_SHARE)}; op til to
              afvigelser; højst fem i alt.
            </p>
            <p>
              Indekset bag attributsætningerne er andel af netto udsolgt-events (udsolgt minus genopfyldning inden{" "}
              {fmtInt(RESTOCK_WINDOW_DAYS)} dage) delt med andel af lanceringer de seneste {weeks} uger hos peers. Under
              kalibrering vises ingen afvigelser.
            </p>
          </MethodNote>
        </Card>

        <Card
          title="Højeste udsolgt-indeks lige nu"
          description={
            <>
              På tværs af attributter, alle live varianter hos peers.
              Detaljer under{" "}
              <Link href="/udsolgt#indeks" className="underline">
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
          <MethodNote
            anchor="tilstand"
            fields={["sold_out_state.json (scope all): live_n, unavailable_n, share_live, share_unavailable, state_index, low_n"]}
          >
            <p>
              For hver attributværdi tælles peers&apos; taggede live varianter (live_n) og hvor mange af dem der er uden lager
              (unavailable_n) i seneste snapshot. Indeks = værdiens andel af alle varianter uden lager delt med dens andel
              af alle live varianter inden for attributten.
            </p>
            <p>
              Kun værdier med mindst {fmtPct(MIN_SHARE_FOR_INDEX)} af de live varianter og mindst {fmtInt(t.min_launched)}{" "}
              varianter får et indeks; n er antal varianter uden lager, og under {fmtInt(t.low_n)} er det lavt n og
              udeladt her. {self} indgår ikke.
            </p>
          </MethodNote>
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
          <li>
            Hele metoden med formler, et regneeksempel og alle forbehold står under{" "}
            <Link href="/metode" className="underline">
              Metode og forbehold
            </Link>
            .
          </li>
        </ul>
      </div>
    </>
  );
}
