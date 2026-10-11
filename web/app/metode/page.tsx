import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import NotSalesNote from "@/components/NotSalesNote";
import PageHeader from "@/components/PageHeader";
import {
  brandNames,
  loadInsights,
  loadMeta,
  loadPositioning,
  loadSoldOutState,
  loadTaxonomy,
  selfName,
  taxonomyAttributes,
  weakestTaggedBrand,
} from "@/lib/data";
import { fmtDate, fmtIndex, fmtInt, fmtNum, fmtPct, isNum } from "@/lib/format";
import { ATTRIBUTE_ORDER, attributeLabel, attributeWord, insightKindLabel, roleLabel, scopeLabel } from "@/lib/labels";
import {
  COHORT_4W_DAYS,
  FX_TO_DKK,
  LIVE_DAYS,
  MAD_SCALE_LABEL,
  MARKDOWN_DROP,
  MEDIAN_DAYS_MAX_AGE,
  MIN_ALERT_COUNT,
  MIN_RULE_ATTRIBUTES,
  MIN_RULE_CONFIDENCE,
  MIN_SHARE_FOR_INDEX,
  NEUTRALS,
  NEWNESS_DAYS,
  PRICE_BAND_LABELS,
  RESTOCK_WINDOW_DAYS,
  STYLE_WEIGHTS,
} from "@/lib/method";
import type { BrandRole, SoldOutStateRow } from "@/lib/types";

export const metadata: Metadata = { title: "Metode og forbehold" };

/** Section ids are Danish without special characters; MethodNote links and insight cards point at them. */
const SECTIONS: ReadonlyArray<{ id: string; title: string }> = [
  { id: "data", title: "Data og kilder" },
  { id: "snapshot", title: "Snapshot og live-filter" },
  { id: "events", title: "Events (fra dag 2)" },
  { id: "tags", title: "Tags og taksonomi" },
  { id: "tilstand", title: "Udsolgt-tilstand: indekset i dag" },
  { id: "indeks", title: "Udsolgt-indeks over tid" },
  { id: "lavt-n", title: "Lavt n" },
  { id: "kalibrering", title: "Kalibrering og afvigelser" },
  { id: "positionering", title: "Positionering" },
  { id: "storrelser", title: "Størrelser" },
  { id: "lanceringer", title: "Lanceringer" },
  { id: "nedsat", title: "Nedsat" },
  { id: "indsigter", title: "Indsigter: hvad betyder det for referencebrandet" },
  { id: "forbehold", title: "Forbehold" },
];

const ROLE_ORDER: readonly BrandRole[] = ["self", "peer", "benchmark", "international"];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded border border-hair bg-surface p-4">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm text-ink2">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <p className="overflow-x-auto rounded bg-plane px-3 py-2 font-mono text-sm text-ink">{children}</p>;
}

function Term({ children }: { children: ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>;
}

interface WorkedExample {
  row: SoldOutStateRow;
  liveTotal: number;
  unavailableTotal: number;
  /** True when the row met WORKED_EXAMPLE_MIN_SHARE in scope "all"; false when the fallback (any robust row) was used. */
  recognisable: boolean;
}

/** A worked example should be a value people recognise: at least this share of peers' live variants, scope "all". */
const WORKED_EXAMPLE_MIN_SHARE = 0.05;

function bestRobust(rows: SoldOutStateRow[]): SoldOutStateRow | null {
  let best: SoldOutStateRow | null = null;
  for (const r of rows) {
    if (!isNum(r.state_index) || r.low_n) continue;
    if (best === null || !isNum(best.state_index) || r.state_index > best.state_index) best = r;
  }
  return best;
}

/**
 * The value with the highest robust state index among scope "all" rows holding at least WORKED_EXAMPLE_MIN_SHARE of
 * peers' live variants (fallback: any robust row), plus the totals its shares are taken against.
 */
function pickWorkedExample(state: SoldOutStateRow[]): WorkedExample | null {
  const preferred = bestRobust(
    state.filter((r) => r.scope === "all" && isNum(r.share_live) && r.share_live >= WORKED_EXAMPLE_MIN_SHARE),
  );
  const best = preferred ?? bestRobust(state);
  if (best === null) return null;
  let liveTotal = 0;
  let unavailableTotal = 0;
  for (const r of state) {
    if (r.attribute === best.attribute && r.scope === best.scope) {
      liveTotal += r.live_n;
      unavailableTotal += r.unavailable_n;
    }
  }
  return { row: best, liveTotal, unavailableTotal, recognisable: preferred !== null };
}

export default function MethodPage() {
  const meta = loadMeta();
  const taxonomy = loadTaxonomy();
  const insights = loadInsights();
  const state = loadSoldOutState();
  const pos = loadPositioning();
  const names = brandNames();
  const self = selfName();
  const t = meta.thresholds;
  const rules = insights.rules;
  const weeks = Math.round(t.launch_window_days / 7);
  const attrKeys = taxonomyAttributes(ATTRIBUTE_ORDER);
  const example = pickWorkedExample(state);
  const weakest = weakestTaggedBrand();
  const firstSnapshot = meta.snapshot_dates.length > 0 ? meta.snapshot_dates[0] : meta.latest_snapshot_date;

  const enabledByRole = ROLE_ORDER.map((role) => ({
    role,
    brands: meta.brands.filter((b) => b.enabled && b.role === role),
  })).filter((g) => g.brands.length > 0);
  const disabled = meta.brands.filter((b) => !b.enabled);
  const taggedShares = pos.brands.map((b) => b.tagged_share).filter(isNum);
  const minTagged = taggedShares.length > 0 ? Math.min(...taggedShares) : null;
  const maxTagged = taggedShares.length > 0 ? Math.max(...taggedShares) : null;

  const exShareLive = example && example.liveTotal > 0 ? example.row.live_n / example.liveTotal : null;
  const exShareUnavailable =
    example && example.unavailableTotal > 0 ? example.row.unavailable_n / example.unavailableTotal : null;
  const exIndex = isNum(exShareLive) && isNum(exShareUnavailable) && exShareLive > 0 ? exShareUnavailable / exShareLive : null;

  const rankedItems = [...insights.items].sort((a, b) => a.rank - b.rank);

  return (
    <>
      <PageHeader
        title="Metode og forbehold"
        lead={
          <>
            Hvordan hvert tal på sitet er regnet, hvad det bygger på, og hvad det ikke kan sige. Tærskler, der findes i
            eksporten (lavt n, mindste antal lanceringer, baseline- og serieuger, lanceringsvindue, indsigtsreglerne,
            taksonomiversion), læses fra meta.json og insights.json og er dermed de samme som i ugerapporten. Vinduer og
            vægte, som eksporten ikke bærer ({fmtInt(RESTOCK_WINDOW_DAYS)} dages genopfyldning, {fmtInt(LIVE_DAYS)} dages
            live-filter, {fmtPct(MIN_SHARE_FOR_INDEX)}-reglen, mindst {fmtInt(MIN_ALERT_COUNT)} events, faktoren{" "}
            {MAD_SCALE_LABEL}, {fmtPct(MARKDOWN_DROP)} prisfald, kohortedage, stilvægte og valutakurser), er spejlet fra
            pipeline-koden i web/lib/method.ts med kildehenvisning pr. konstant og kan afvige, hvis koden ændres uden at
            dashboardet følger med. Rapportdato {fmtDate(meta.report_date)}, seneste snapshot{" "}
            {fmtDate(meta.latest_snapshot_date)}, taksonomi v{meta.taxonomy_version}.
          </>
        }
      />

      <div className="mb-4 space-y-1">
        <NotSalesNote text={meta.notes.not_sales} extra={meta.notes.self_excluded} />
      </div>

      <nav aria-label="Afsnit" className="mb-6 rounded border border-hair bg-surface p-4 text-sm">
        <ol className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-ink2 underline hover:text-ink">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-6">
        <Section id="data" title="1. Data og kilder">
          <p>
            Kilden er hvert brands eget, offentlige Shopify-katalog: <Term>/products.json</Term> (alle produkter med
            varianter, pris, førpris og tilgængelig/ikke tilgængelig) og <Term>/meta.json</Term> (butikkens valuta). Der
            hentes kun fra de domæner, der står i config/sources.yaml; markedspladser og sociale medier er aldrig kilder.
          </p>
          <p>
            Peer-sættet og rollerne er dem i sources.yaml. <Term>Reference</Term> er brandet, alt holdes op mod, og det
            indgår aldrig i et indeks. Peer, benchmark og international tæller alle som &quot;peers&quot; i indeksene;
            rollen bruges kun til farver og sortering.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {enabledByRole.map((g) => (
              <li key={g.role}>
                <Term>{roleLabel(g.role)}</Term>: {g.brands.map((b) => `${b.name} (${b.currency ?? "–"})`).join(", ")}
              </li>
            ))}
            {disabled.length > 0 ? (
              <li>
                <Term>Slået fra</Term> (ikke Shopify, endpoint lukket eller arkiv-feed): {disabled.map((b) => b.name).join(", ")}.
              </li>
            ) : null}
          </ul>
          <p>
            Ét snapshot pr. dag (GitHub Actions, tidlig morgen UTC). Hentningen er høflig: robots.txt læses først og
            respekteres, der holdes en fast pause mellem kald, en identificerbar User-Agent med kontaktadresse sendes, og
            429/430/5xx prøves igen op til fem gange med stigende pause (højst 90 sekunder, Retry-After respekteres);
            lykkes det ikke, får brandet status http_error for den dag og indgår ikke i snapshottet.
          </p>
          <p>
            <Term>Hvad gemmes:</Term> én normaliseret række pr. variant pr. dag (brand, produkt-id, handle, titel,
            produkttype, vendor, tags, et tekstuddrag, published_at, created_at, updated_at, variant-id, sku, options,
            størrelse, pris, førpris, tilgængelig, valuta, pris og førpris i DKK, sæsonkode og URL&apos;en til første
            produktbillede). Rå JSON-svar gemmes ikke; billeder hentes, gemmes og vises ikke af pipelinen eller
            dashboardet (Claude-taggeren kan få billed-URL&apos;en, når den slås til). Dashboardet læser kun aggregater:
            tællinger, andele, kvantiler. Ingen produktrækker, ingen billeder, ingen salgstal, ingen lagertal (Shopify
            viser kun tilgængelig/ikke tilgængelig).
          </p>
        </Section>

        <Section id="snapshot" title="2. Snapshot og live-filter">
          <p>
            En <Term>variant</Term> er én Shopify-variant, i praksis én størrelse i én farve af én style. Et{" "}
            <Term>produkt</Term> (style) har typisk 4–8 varianter. Alle tællinger på sitet siger, om de er i varianter eller
            styles.
          </p>
          <p>
            <Term>Live-filter:</Term> et produkt beholdes i snapshottet, hvis mindst én variant er tilgængelig, eller hvis
            det er publiceret inden for {fmtInt(LIVE_DAYS)} dage. Alt andet er gamle, helt udsolgte produkter, som
            flere butikker lader stå i deres offentlige feed som outlet-arkiv (tusindvis hos nogle). Uden filteret ville
            arkiverne dominere hver eneste andel og gøre &quot;uden lager&quot; meningsløst.
          </p>
          <Formula>
            live(produkt) = mindst én variant tilgængelig, eller publiceret inden for {fmtInt(LIVE_DAYS)} dage før snapshottet
          </Formula>
          <p>
            <Term>Eksklusioner:</Term> pr. brand fjernes ikke-tøj via produkttype og tags (accessories, sko, beauty,
            interiør, strikkeopskrifter, herre- og børnetøj), så kategorier og andele handler om damebeklædning.{" "}
            <Term>Størrelse</Term> findes i enhver option (alfa XXXS–XXXL, numerisk 32–48, UK/EU/US-præfiks), så butikker
            med farve i option1 virker. <Term>Priser</Term> omregnes til DKK med faste kurser (se Positionering).
          </p>
        </Section>

        <Section id="events" title="3. Events (fra dag 2)">
          <p>
            Hver dag sammenlignes dagens snapshot med det foregående, variant for variant og produkt for produkt, pr.
            brand. Et brand, der mangler på én af dagene (fejlet kørsel), giver ingen events den dag, så en fejl aldrig
            bliver til falske delistninger.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <Term>sold_out</Term>: varianten var tilgængelig i går og er det ikke i dag.
            </li>
            <li>
              <Term>restock</Term>: varianten var ikke tilgængelig i går og er det i dag.
            </li>
            <li>
              <Term>product_sold_out</Term>: alle produktets varianter er uden lager i dag, mindst én var tilgængelig i går.
            </li>
            <li>
              <Term>new_product</Term> / <Term>delisted</Term>: produkt-id findes i dag men ikke i går, eller omvendt.
            </li>
            <li>
              <Term>markdown</Term>: en førpris dukker op over prisen, eller prisen falder mere end {fmtPct(MARKDOWN_DROP)}{" "}
              med uændret førpris; andre prisændringer er price_change.
            </li>
          </ul>
          <p>
            <Term>Netto udsolgt</Term> er det mål, alle event-baserede tal bygger på: et sold_out-event, som ikke følges af
            et restock-event for samme variant inden for {fmtInt(RESTOCK_WINDOW_DAYS)} dage. Det fjerner flimren i
            lagerstatus og hurtige genopfyldninger, som ikke er sell-out.
          </p>
          <Formula>
            netto_udsolgt = sold_out for variant v på dag d, uden restock af v på en dag d′ med d &lt; d′ ≤ d +{" "}
            {fmtInt(RESTOCK_WINDOW_DAYS)} dage
          </Formula>
          <p>
            <Term>Delistede</Term> produkter tælles aldrig som udsolgte: vi kan ikke se, om de blev solgt eller fjernet.
            Events findes fra dag 2; første snapshot er {fmtDate(firstSnapshot)}, og lige nu er der{" "}
            {fmtInt(meta.snapshot_dates.length)} snapshots og {fmtInt(meta.weeks_of_history)} ugers eventhistorik.
          </p>
        </Section>

        <Section id="tags" title="4. Tags og taksonomi">
          <p>
            Hvert produkt tagges én gang mod en <Term>lukket taksonomi v{meta.taxonomy_version}</Term> (config/taxonomy.yaml)
            med {fmtInt(attrKeys.length)} attributter. Kun værdier fra taksonomien eller tom (ukendt) kan forekomme; en ny
            værdi kræver en ændring af taksonomien og en versionsbump i rapportens fodnote.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {attrKeys.map((a) => {
              const def = taxonomy.attributes[a];
              return (
                <li key={a}>
                  <Term>{attributeLabel(a)}</Term> ({a}): {def ? `${fmtInt(def.values.length)} værdier: ${def.values.join(", ")}` : "–"}
                </li>
              );
            })}
          </ul>
          <p>
            <Term>Regel-taggeren</Term> matcher danske og engelske søgeord pr. værdi i titel, produkttype, tags og
            beskrivelse; for kategori, print og farvefamilie læses titel, type og tags før beskrivelsen, fordi
            beskrivelser nævner mange farver og materialer (vaskeråd, stylingtips). Første match i teksten vinder.
            Strukturerede brand-tags (fx print:Florals) rammes af de samme søgeord.
          </p>
          <p>
            <Term>Claude-taggeren</Term> er forberedt til produkter, hvor reglerne finder under {fmtInt(MIN_RULE_ATTRIBUTES)}{" "}
            af {fmtInt(attrKeys.length)} attributter eller har tillid under {fmtNum(MIN_RULE_CONFIDENCE, 1)}: den får titel,
            type, tags og beskrivelse og skal svare med værdier fra taksonomien (værktøjsskema). Den slås først til, når
            regel-taggeren er valideret mod designer-taggede produkter.
          </p>
          <p>
            <Term>Dækning</Term> (tagged_share i positioning.json) er andelen af et brands live styles med en tag-række.
            {isNum(minTagged) && isNum(maxTagged) && minTagged === maxTagged
              ? ` I dag er den ${fmtPct(minTagged)} for alle brands`
              : ` I dag ligger den mellem ${fmtPct(minTagged)} og ${fmtPct(maxTagged)}`}
            {weakest && isNum(weakest.tagged_share) && weakest.tagged_share < 0.995
              ? `; lavest er ${names[weakest.brand] ?? weakest.brand} med ${fmtPct(weakest.tagged_share)}`
              : ""}
            . En tag-række betyder ikke, at alle attributter blev fundet; styles uden værdi i en attribut tæller ikke
            med i den attributs andele. Hvor stor en del af de live varianter der har en værdi i hver attribut (dækning
            pr. attribut), står under{" "}
            <Link href="/data" className="underline">
              Datakvalitet
            </Link>
            ; andele og indeks i Hvad er udsolgt nu regnes kun på dem.
          </p>
        </Section>

        <Section id="tilstand" title="5. Udsolgt-tilstand: indekset i dag">
          <p>
            Siden <Link href="/udsolgt#indeks" className="underline">Hvad er udsolgt nu</Link> læser direkte på seneste
            snapshot, uden events. For hver attribut og hver værdi tælles peers&apos; taggede live varianter og hvor
            mange af dem der er uden lager i dag:
          </p>
          <Formula>share_live = live_n / alle live varianter med et tag i attributten</Formula>
          <Formula>share_unavailable = unavailable_n / alle varianter uden lager med et tag i attributten</Formula>
          <Formula>indeks = share_unavailable / share_live</Formula>
          <p>
            Begge nævnere løber over attributtens værdier i samme udsnit. Indeks 1,0 betyder, at værdien fylder lige så meget
            blandt det udsolgte som i sortimentet; 1,30 betyder 30&nbsp;% overrepræsenteret. Indeks beregnes kun, når
            share_live er mindst {fmtPct(MIN_SHARE_FOR_INDEX)} og live_n mindst {fmtInt(t.min_launched)}; n er
            unavailable_n, og under {fmtInt(t.low_n)} er det lavt n.
          </p>
          {example && isNum(exShareLive) && isNum(exShareUnavailable) && isNum(exIndex) ? (
            <div className="rounded border border-hair bg-plane p-3">
              <p className="font-medium text-ink">
                Regneeksempel fra dagens eksport: {attributeWord(example.row.attribute)} {example.row.value},{" "}
                {scopeLabel(example.row.scope, t.launch_window_days).toLocaleLowerCase("da-DK")}
                {example.recognisable
                  ? ` (højeste robuste indeks blandt værdier med mindst ${fmtPct(WORKED_EXAMPLE_MIN_SHARE)} af de live varianter)`
                  : " (højeste robuste indeks i eksporten)"}
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  Peers har {fmtInt(example.liveTotal)} taggede live varianter med en {attributeWord(example.row.attribute)}
                  -værdi i dette udsnit, heraf {fmtInt(example.unavailableTotal)} uden lager.
                </li>
                <li>
                  {example.row.value} står for {fmtInt(example.row.live_n)} af de live varianter: share_live ={" "}
                  {fmtInt(example.row.live_n)} / {fmtInt(example.liveTotal)} = {fmtPct(exShareLive, 1)}.
                </li>
                <li>
                  {fmtInt(example.row.unavailable_n)} af dem er uden lager: share_unavailable ={" "}
                  {fmtInt(example.row.unavailable_n)} / {fmtInt(example.unavailableTotal)} = {fmtPct(exShareUnavailable, 1)}.
                </li>
                <li>
                  Indeks = {fmtPct(exShareUnavailable, 1)} / {fmtPct(exShareLive, 1)} = <Term>{fmtIndex(exIndex)}</Term>{" "}
                  (eksporten: {fmtIndex(example.row.state_index)}), n = {fmtInt(example.row.unavailable_n)}
                  {example.row.unavailable_n < t.low_n ? " (lavt n)" : ""}.
                </li>
                <li>
                  {self} til sammenligning, uden for indekset: {fmtInt(example.row.self_live_n)} egne live varianter i{" "}
                  {example.row.value} ({fmtPct(example.row.self_share_live, 1)} af {self}s varianter i attributten mod
                  peers&apos; {fmtPct(exShareLive, 1)}), {fmtInt(example.row.self_unavailable_n)} uden lager, eget indeks{" "}
                  {fmtIndex(example.row.self_state_index)}
                  {isNum(example.row.self_state_index) && example.row.self_unavailable_n < t.low_n ? " (lavt n)" : ""}.
                </li>
              </ol>
            </div>
          ) : (
            <p>Intet regneeksempel: ingen værdi har et indeks med robust n i dagens eksport.</p>
          )}
          <p>
            <Term>Udsnit:</Term> &quot;{scopeLabel("all", t.launch_window_days)}&quot; tæller alle live varianter og siger
            noget om lageret generelt, også outlet-rester fra de seneste måneder. &quot;{scopeLabel("new", t.launch_window_days)}&quot;
            tæller kun produkter med lanceringsdato inden for {fmtInt(t.launch_window_days)} dage og siger noget om denne
            sæson; det er det udsnit, indkøbet skal læse først, når det har robust n.
          </p>
          <p>
            <Term>{self}</Term> indgår aldrig i indekset. Til sammenligning beregnes de samme tal over {self}s egne
            varianter alene (self_live_n, self_share_live, self_state_index) og vises ved siden af, aldrig blandet i
            søjlerne. {meta.notes.state}
          </p>
        </Section>

        <Section id="indeks" title="6. Udsolgt-indeks over tid (bevægelsen)">
          <p>
            Siden <Link href="/attributter" className="underline">Attributindeks</Link> bygger på events og måler
            bevægelsen. For hver attributværdi hos peers:
          </p>
          <Formula>share_new = lanceringer med værdien / alle lanceringer med et tag i attributten</Formula>
          <Formula>share_sold_out = netto udsolgte med værdien / alle netto udsolgte med et tag i attributten</Formula>
          <Formula>indeks = share_sold_out / share_new</Formula>
          <p>
            Lanceringer er produkter med lanceringsdato (published_at, ellers første snapshot) inden for{" "}
            {fmtInt(t.launch_window_days)} dage ({weeks} uger); netto udsolgte er events i samme vindue på produkter med
            værdien. Intet indeks når share_new er under {fmtPct(MIN_SHARE_FOR_INDEX)} eller der er under{" "}
            {fmtInt(t.min_launched)} lanceringer; n er antal netto udsolgte, lavt n under {fmtInt(t.low_n)}.
          </p>
          <p>
            <Term>Hvorfor det tager uger:</Term> events findes fra dag 2 og lægges til én dag ad gangen. De fleste
            værdier passerer først {fmtInt(t.low_n)} netto udsolgte efter nogle uger, så indekset er retning før uge 4 og
            tal derefter. Indtil da er tilstandsindekset ovenfor det rigtige sted at læse.
          </p>
        </Section>

        <Section id="lavt-n" title="7. Lavt n">
          <p>
            <Term>n</Term> er altid antallet bag et tal: varianter uden lager (tilstand), netto udsolgt-events (indeks
            over tid) eller kohortens størrelse (sell-out-rate). n står ved hvert indeks, og under{" "}
            <Term>{fmtInt(t.low_n)}</Term> (meta.thresholds.low_n) markeres det &quot;lavt n&quot; og læses som retning,
            ikke som tal. Indsigterne på forsiden bruger kun værdier med robust n.
          </p>
          <p>
            <Term>min_launched = {fmtInt(t.min_launched)}</Term>: under {fmtInt(t.min_launched)} varianter (tilstand) eller
            lanceringer (indeks over tid) beregnes slet intet indeks, fordi nævneren er for lille til at betyde noget. En
            andel under {fmtPct(MIN_SHARE_FOR_INDEX)} af sortimentet udelukker også et indeks: få varianter kan give et
            højt indeks uden at være en tendens. Værdierne vises i stedet som rå tællinger.
          </p>
        </Section>

        <Section id="kalibrering" title="8. Kalibrering og afvigelser">
          <p>
            <Term>Historik</Term> tælles i uger siden første event (weeks_of_history). Så længe den er under{" "}
            <Term>{fmtInt(t.baseline_weeks)} uger</Term> (meta.thresholds.baseline_weeks) viser alle sider &quot;Kalibrering&quot;,
            og intet kaldes en afvigelse. Lige nu: {fmtInt(meta.weeks_of_history)} af {fmtInt(t.baseline_weeks)} uger
            {meta.calibration ? ", kalibrering" : ", baseline etableret"}.
          </p>
          <p>
            <Term>Afvigelse:</Term> for hver attributværdi sammenlignes ugens antal netto udsolgte med medianen af de
            foregående {fmtInt(t.baseline_weeks)} uger. MAD er medianen af de absolutte afvigelser fra den median, skaleret med{" "}
            {MAD_SCALE_LABEL}, så den svarer til en standardafvigelse.
          </p>
          <Formula>
            afvigelse = denne_uge ≥ {fmtInt(MIN_ALERT_COUNT)}, og denne_uge &gt; median({fmtInt(t.baseline_weeks)} uger) + 2 ×{" "}
            {MAD_SCALE_LABEL} × MAD, og historik ≥ {fmtInt(t.baseline_weeks + 1)} uger
          </Formula>
          <p>
            <Term>Hvad kommer hvornår:</Term> dag 1 tilstand (Hvad er udsolgt nu, positionering, størrelser); dag 2 de
            første events og ugeserien; omkring uge 4 et meningsfuldt indeks over tid; uge {fmtInt(t.baseline_weeks)}{" "}
            slutter kalibreringen, fra uge {fmtInt(t.baseline_weeks + 1)} afvigelser ({fmtInt(t.baseline_weeks)} hele
            baseline-uger plus den aktuelle). Ugeserien viser de seneste {fmtInt(t.series_weeks)} uger.
          </p>
        </Section>

        <Section id="positionering" title="9. Positionering">
          <p>
            <Term>Mix</Term> pr. brand og attribut er andelen af taggede styles pr. værdi. <Term>Stilafstand</Term> til{" "}
            {self} er Jensen–Shannon-afstanden mellem brandets og {self}s mix pr. attribut (base 2, mellem 0 = identisk
            og 1 = intet fælles), vægtet og delt med summen af vægtene for de attributter, begge har et mix i:
          </p>
          <Formula>JS(p, q) = √(½ · KL(p‖m) + ½ · KL(q‖m)), hvor m = ½ (p + q)</Formula>
          <Formula>stilafstand = sum over attributter af (vægt × JS) / sum af vægtene</Formula>
          <p>
            Vægte: {STYLE_WEIGHTS.map((w) => `${attributeWord(w.attribute)} ${fmtNum(w.weight, 1)}`).join(", ")}. Kategori og print
            vejer dobbelt, fordi det er dem, kunden ser først; ærme, længde og anledning er sjældnere tagget og vejer
            mindst.
          </p>
          <p>
            <Term>Overlap</Term> er andelen af brandets (kategori × print × farvefamilie)-celler blandt taggede styles, som
            også findes hos {self}; mangler print eller farve, bruges &quot;?&quot; som værdi.
          </p>
          <Formula>overlap = |celler(brand) ∩ celler({self})| / |celler(brand)|</Formula>
          <p>
            <Term>Prisindeks</Term> = brandets medianpris pr. live style i DKK delt med {self}s medianpris; kjoleindeks det
            samme på styles tagget kategori dress. Prisbånd ({PRICE_BAND_LABELS.join(" / ")} DKK) er andele af live styles.
            Valutaer omregnes med faste kurser fra sources.yaml:{" "}
            {FX_TO_DKK.map((f) => `${f.currency} ${fmtNum(f.rate, 2)}`).join(", ")}; præcision ud over nogle procent
            betyder ikke noget for positionering, men indekset er indikativt.
          </p>
          <p>
            Nyhedsandel = styles publiceret inden for {fmtInt(NEWNESS_DAYS)} dage (profile.py NEWNESS_DAYS
            {NEWNESS_DAYS === t.launch_window_days ? ", i dag samme vindue som lanceringerne" : ", et andet vindue end lanceringerne"}
            ); print-andel = 1 − andelen tagget solid; farve-andel = andelen uden for {NEUTRALS.join(", ")}. Hvem der
            køber, siger ingen af tallene noget om: de beskriver udbuddet.
          </p>
        </Section>

        <Section id="storrelser" title="10. Størrelser">
          <p>
            Pr. brand og størrelse i seneste snapshot, kun varianter med en genkendt størrelse:
          </p>
          <Formula>unavailable_share = unavailable_variants / live_variants</Formula>
          <p>
            Tabellen viser kanoniske størrelser (alfa XXXS–XXXL og numerisk 32–48, samme liste som profile.py) først og
            øvrige koder (taljemål, sko, UK, kombinationer, one size) under en fold; størrelsessystemer sammenlignes kun
            inden for samme system. Celler med under {fmtInt(t.low_n)} live varianter er markeret.
          </p>
          <p>
            <Term>Størrelsesindsigten</Term> lægger peers sammen pr. kanonisk størrelse, kræver mindst{" "}
            {fmtInt(rules.min_size_n)} live varianter i størrelsen og nævner de op til tre størrelser, hvis andel uden
            lager ligger mindst {fmtInt(100 * rules.size_gap)} procentpoint over peers&apos; gennemsnit på tværs af
            størrelser, med {self}s egen andel ved siden af.
          </p>
          <p>
            <Term>Hvorfor det betyder noget, når yderstørrelserne oftere er uden lager:</Term> indkøbsdybden pr. størrelse
            følger normalt en kurve med mest i midten. Når yderstørrelserne alligevel er uden lager oftere end midten hos
            mange peers, er kurven købt for flad i den ende, eller efterspørgslen rykker. Begge dele er indkøbsbeslutninger:
            flere af den størrelse i næste ordre, eller samme fordeling men tidligere genopfyldning. Sammenlign altid med{" "}
            {self}s egen kurve, før I flytter noget.
          </p>
        </Section>

        <Section id="lanceringer" title="11. Lanceringer">
          <p>
            Lanceringsdato pr. produkt er datoen i <Term>published_at</Term>; mangler den, første snapshot produktet
            optræder i. Lanceringskalenderen tæller produkter pr. brand pr. uge (uger afrundet til mandag) i de seneste{" "}
            {fmtInt(t.series_weeks)} uger; forsidens tal &quot;Lanceringer seneste {weeks} uger&quot; er summen for peers i
            vinduet på {fmtInt(t.launch_window_days)} dage.
          </p>
          <Formula>launch_date = datoen i published_at, ellers første snapshot_date produktet optræder i</Formula>
          <Formula>week_start = mandag i ugen for launch_date</Formula>
          <p>
            Forbehold: published_at er butikkens publiceringsdato i Shopify, som kan afvige fra den kommercielle lancering
            og rykkes, når et produkt genpubliceres. Derfor er &quot;nye&quot; i brandtabellen (new_product-events) og
            lanceringer efter published_at to forskellige tal.
          </p>
        </Section>

        <Section id="nedsat" title="12. Nedsat">
          <Formula>markdown_share = varianter med compare_at_price &gt; price / live_variants</Formula>
          <Formula>median_discount = median(1 − price / compare_at_price) over de nedsatte varianter</Formula>
          <p>
            Begge tal er fra seneste snapshot, målt på varianter, pr. brand. Forsidens &quot;Nedsat andel hos peers&quot;
            er peers&apos; andele vægtet med antal varianter. Markdown-events i brandtabellen er noget andet: skift i
            prisen mellem to snapshots.
          </p>
          <p>
            <Term>Prispres-indsigten</Term> nævner de peers, der har mindst {fmtPct(rules.markdown_heavy)} af varianterne
            nedsat, deres medianrabat og {self}s egen nedsatte andel. Butikker med stort outlet-feed ligger strukturelt
            højt her, også efter live-filteret, så læs andelen sammen med brandets nyhedsandel.
          </p>
        </Section>

        <Section id="indsigter" title={`13. Indsigter: hvad betyder det for ${self}`}>
          <p>
            Forsidens kort er faste regler over tilstanden i seneste snapshot holdt op mod {self}s eget sortiment. De er{" "}
            <Term>hypoteser til test</Term>, ikke konklusioner: udsolgt er indkøbsdybde gange efterspørgsel, og{" "}
            {self}s offentlige shop er ikke {self}s salgstal. Teksten på kortene er den samme som i ugerapporten.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <Term>{insightKindLabel("white_space")}</Term>: peers&apos; indeks ≥ {fmtIndex(rules.over_index)} og {self}s
              andel af egne taggede live varianter i værdien &lt; {fmtIndex(rules.white_space_ratio)} × peers&apos; andel.
              Peers er oftere uden lager i noget, {self} næsten ikke har.
            </li>
            <li>
              <Term>{insightKindLabel("strength")}</Term>: indeks ≥ {fmtIndex(rules.over_index)} og {self}s andel ≥ peers&apos;
              andel. Peers er oftere uden lager i noget, {self} allerede står stærkt i; hold dybden.
            </li>
            <li>
              <Term>{insightKindLabel("risk")}</Term>: indeks ≤ {fmtIndex(rules.under_index)} og {self}s andel ≥ max(
              {fmtIndex(rules.heavy_ratio)} × peers&apos; andel, {fmtPct(rules.min_self_share)}). Peers bliver stående med
              noget, {self} er tung i.
            </li>
            <li>
              <Term>{insightKindLabel("sizes")}</Term>: peers lagt sammen pr. kanonisk størrelse med mindst{" "}
              {fmtInt(rules.min_size_n)} live varianter; størrelser med andel uden lager ≥ gennemsnit +{" "}
              {fmtInt(100 * rules.size_gap)} procentpoint, op til tre.
            </li>
            <li>
              <Term>{insightKindLabel("markdown")}</Term>: peers med nedsat andel ≥ {fmtPct(rules.markdown_heavy)}; vises, når
              mindst én peer rammer det.
            </li>
            <li>
              <Term>{insightKindLabel("nearest")}</Term>: de {fmtInt(rules.nearest_n)} peers med mindst stilafstand til {self},
              med prisindeks og overlap.
            </li>
          </ul>
          <p>
            <Term>Rangering:</Term> attributreglerne kører først over udsnittet &quot;nyheder&quot; og så &quot;alle&quot;
            (en værdi, der kvalificerer blandt nyheder, gentages ikke), kun på rækker med indeks og n ≥{" "}
            {fmtInt(rules.low_n)}. Rangvægten er
          </p>
          <Formula>rangvægt = |ln(indeks)| × √n</Formula>
          <p>
            Den højest vægtede af hver slags (hvidt felt, styrke at holde, risiko) vises altid, så et hvidt felt aldrig
            skubber en risiko ud; resten fyldes efter rangvægt med højst {fmtInt(rules.per_kind_cap)} pr. slags og{" "}
            {fmtInt(rules.max_attribute_insights)} attributindsigter i alt. Derefter følger størrelser, prispres og nærmeste
            konkurrenter med faste rangvægte. Hvert kort bærer n, peers&apos; og {self}s andele, {self}s egen andel uden
            lager i værdien og en evidenslinje, så påstanden kan tjekkes i tabellerne.
          </p>
          {rankedItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <caption className="sr-only">Dagens indsigter med evidens</caption>
                <thead>
                  <tr className="border-b border-axis text-left uppercase tracking-wide text-muted">
                    <th scope="col" className="px-2 py-2 font-medium">
                      Nr.
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Slags
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Titel
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium" title="|ln(indeks)| × √n for attributindsigter; faste værdier for størrelser, prispres og nærmeste">
                      Rangvægt
                    </th>
                    <th scope="col" className="px-2 py-2 font-medium">
                      Evidens
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rankedItems.map((item) => (
                    <tr key={`${item.kind}-${item.rank}`} className="border-b border-hair">
                      <td className="tabular px-2 py-1.5 text-ink2">{fmtInt(item.rank)}</td>
                      <td className="px-2 py-1.5 text-ink2">{insightKindLabel(item.kind)}</td>
                      <td className="px-2 py-1.5 text-ink">
                        {item.title}
                        {item.low_n ? " (lavt n)" : ""}
                      </td>
                      <td className="tabular px-2 py-1.5 text-right text-ink2">{fmtNum(item.strength, 2)}</td>
                      <td className="px-2 py-1.5 font-mono text-ink2">{item.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Ingen indsigter i dagens eksport.</p>
          )}
        </Section>

        <Section id="forbehold" title="14. Forbehold">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <Term>Indkøbsdybde gange efterspørgsel, aldrig salg.</Term> En variant uden lager kan være købt i tre styk.
              Sammenlign attributter inden for samme udsnit, ikke brands mod hinanden, og læs andele, ikke antal.
            </li>
            <li>
              <Term>Tilgængelighed kan flimre.</Term> Lagerstatus skifter frem og tilbage ved returvarer, reservationer og
              fejl i feedet. Netto udsolgt med {fmtInt(RESTOCK_WINDOW_DAYS)} dages genopfyldningsvindue fjerner det meste,
              men ikke alt; tilstandsindekset har ikke det værn og skal læses som dagens billede.
            </li>
            <li>
              <Term>Outlet-tunge butikker.</Term> Nogle feeds indeholder tusindvis af gamle, helt udsolgte produkter.
              Live-filteret ({fmtInt(LIVE_DAYS)} dage) fjerner det meste, men &quot;alle live varianter&quot; indeholder
              stadig outlet-rester fra de seneste måneder; &quot;nyheder&quot; gør ikke.
            </li>
            <li>
              <Term>Kitri er slået fra.</Term> Butikkens offentlige products.json viste sig at være en arkiv-udsalgsrest:
              1 af 1.182 varianter tilgængelig, alle med førpris, nyeste publicering måneder gammel. Den kan ikke bære
              sell-out-sporing og gjorde Kitri til den øverste markdown-alarm i første ugerapport. Genåbnes først efter
              en ny probe med tilgængeligt lager.
            </li>
            <li>
              <Term>Rabens Saloner, tag-fix.</Term> Tagget &quot;preloved&quot; sidder på fire ud af fem Rabens-produkter,
              også nye kjoler og strik, og markerer adgang til brandets resale-program, ikke en brugt vare. Det var i en
              periode en eksklusion og fjernede næsten hele sortimentet; nu ekskluderes kun ikke-tøj via produkttype og
              strukturerede tags. Tal for Rabens før rettelsen er ikke sammenlignelige.
            </li>
            <li>
              <Term>Tagger-dækning varierer.</Term> Reglerne afhænger af titler, produkttyper og tags, som brands skriver
              meget forskelligt (Designers Remix har hverken tags eller produkttype; DAY bruger danske typer; Stine Goya og
              Munthe har strukturerede tags). Et brand med lav tagged_share{weakest && isNum(weakest.tagged_share) && weakest.tagged_share < 0.995 ? ` (lavest i dag: ${names[weakest.brand] ?? weakest.brand}, ${fmtPct(weakest.tagged_share)})` : " (i dag har alle brands fuld dækning)"}{" "}
              bidrager mindre til andelene, og dets mix kan være skævt mod de styles, reglerne genkender. Regel-tags er
              grovere end designernes egne og valideres mod håndtaggede produkter, før Claude-tagging slås til.
            </li>
            <li>
              <Term>Faste valutakurser.</Term> {FX_TO_DKK.filter((f) => f.currency !== "DKK").map((f) => `${f.currency} ${fmtNum(f.rate, 2)}`).join(", ")}{" "}
              fra sources.yaml, opdateret lejlighedsvis. Prisindekset er indikativt inden for nogle procent.
            </li>
            <li>
              <Term>{self}s offentlige shop er ikke {self}s salgstal.</Term> self_*-tallene beskriver, hvad der er at få i
              den offentlige (internationale) webshop i dag, ikke sell-through, ikke lager i butikker eller hos
              forhandlere. De skal holdes op mod {self}s egne salgsdata, før en indsigt bliver en beslutning.
            </li>
            <li>
              <Term>Shopify viser ingen lagertal</Term>, kun tilgængelig/ikke tilgængelig. Dybde kan derfor ikke måles, kun
              udledes af, hvor mange størrelser der er uden lager.
            </li>
            <li>
              <Term>Sæson og kampagner er ikke modelleret.</Term> Udsalgsperioder og modeuger påvirker både nedsat andel og
              udsolgt; afvigelser i de uger skal læses med det i baghovedet.
            </li>
            <li>
              <Term>Kohorter er små i starten.</Term> Sell-out 4 uger bygger på produkter lanceret for {COHORT_4W_DAYS[0]}–
              {COHORT_4W_DAYS[1]} dage siden, median dage til første udsolgt på produkter lanceret inden for{" "}
              {MEDIAN_DAYS_MAX_AGE} dage med mindst ét event; begge kræver uger af events og vises med deres n.
            </li>
          </ul>
        </Section>
      </div>
    </>
  );
}
