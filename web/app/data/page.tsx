import type { Metadata } from "next";
import Link from "next/link";

import Card from "@/components/Card";
import MethodNote from "@/components/MethodNote";
import PageHeader from "@/components/PageHeader";
import { LOW_COVERAGE, computeAttributeCoverage } from "@/lib/coverage";
import {
  brandNames,
  loadBrands,
  loadMeta,
  loadPositioning,
  loadRuns,
  loadSoldOutState,
  selfName,
  taxonomyAttributes,
  weakestTaggedBrand,
} from "@/lib/data";
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtPct, isNum } from "@/lib/format";
import { ATTRIBUTE_ORDER, attributeLabel, roleLabel } from "@/lib/labels";
import { LIVE_DAYS, MIN_RULE_ATTRIBUTES, MIN_RULE_CONFIDENCE, RESTOCK_WINDOW_DAYS } from "@/lib/method";

export const metadata: Metadata = { title: "Datakvalitet" };

export default function DataPage() {
  const meta = loadMeta();
  const runs = loadRuns();
  const pos = loadPositioning();
  const names = brandNames();

  const sortedRuns = [...runs].sort((a, b) => {
    if (a.run_date !== b.run_date) return a.run_date < b.run_date ? 1 : -1;
    return (names[a.brand] ?? a.brand).localeCompare(names[b.brand] ?? b.brand, "da-DK");
  });
  const failed = runs.filter((r) => r.status !== "ok").length;

  const profiles = [...pos.brands].sort((a, b) => {
    if (a.brand === pos.self_brand) return -1;
    if (b.brand === pos.self_brand) return 1;
    return (names[a.brand] ?? a.brand).localeCompare(names[b.brand] ?? b.brand, "da-DK");
  });
  const weakest = weakestTaggedBrand();
  const allFullyTagged = profiles.every((p) => isNum(p.tagged_share) && p.tagged_share >= 0.995);

  // Per-attribute coverage: a tag row does not mean every attribute got a value, and every share in
  // sold_out_state is taken over the variants that did.
  const self = selfName();
  const coverage = computeAttributeCoverage(loadSoldOutState(), loadBrands());
  const coverageRows = taxonomyAttributes(ATTRIBUTE_ORDER)
    .filter((a) => coverage[a] !== undefined)
    .map((a) => coverage[a]);

  const enabled = meta.brands.filter((b) => b.enabled);
  const disabled = meta.brands.filter((b) => !b.enabled);

  return (
    <>
      <PageHeader
        title="Datakvalitet"
        lead={
          <>
            Kørsler, dækning og metode. Eksporten er genereret {fmtDateTime(meta.generated_at)} fra
            snapshots til og med {fmtDate(meta.latest_snapshot_date)}. Hele metoden står under{" "}
            <Link href="/metode" className="underline">
              Metode og forbehold
            </Link>
            .
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="rounded border border-hair bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted">Rapportdato</div>
          <div className="mt-1 font-medium text-ink">{fmtDate(meta.report_date)}</div>
          <div className="text-xs text-ink2">uge fra {fmtDate(meta.week_start)}</div>
        </div>
        <div className="rounded border border-hair bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted">Snapshots</div>
          <div className="mt-1 font-medium text-ink">{fmtInt(meta.snapshot_dates.length)}</div>
          <div className="text-xs text-ink2">{fmtInt(meta.weeks_of_history)} ugers eventhistorik</div>
        </div>
        <div className="rounded border border-hair bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted">Taksonomi</div>
          <div className="mt-1 font-medium text-ink">v{meta.taxonomy_version}</div>
          <div className="text-xs text-ink2">config/taxonomy.yaml</div>
        </div>
        <div className="rounded border border-hair bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted">Status</div>
          <div className="mt-1 font-medium text-ink">{meta.calibration ? "Kalibrering" : "Baseline etableret"}</div>
          <div className="text-xs text-ink2">
            {failed === 0 ? "alle kørsler ok" : `${fmtInt(failed)} fejlede kørsler i perioden`}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <Card title="Kørsler, seneste 14 dage" description="En række pr. brand pr. dag. Kun den seneste kørsel pr. dag tæller.">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-axis text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">
                    Dato
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Brand
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium" title="ok, not_shopify_or_disabled, robots_disallow eller http_error">
                    Status
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium" title="Produkter hentet fra products.json før live-filter og eksklusioner">
                    Produkter
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium" title="Varianter gemt i snapshottet efter live-filter og eksklusioner">
                    Varianter
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium" title="Sider á 250 produkter hentet">
                    Sider
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Sekunder
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Fejl
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRuns.map((r) => (
                  <tr key={`${r.run_date}-${r.brand}`} className="border-b border-hair">
                    <td className="tabular px-2 py-1.5 text-ink2">{r.run_date}</td>
                    <td className="px-2 py-1.5 text-ink">{names[r.brand] ?? r.brand}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          r.status === "ok"
                            ? "rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800"
                            : "rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-800"
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="tabular px-2 py-1.5 text-right">{fmtInt(r.products)}</td>
                    <td className="tabular px-2 py-1.5 text-right">{fmtInt(r.variants)}</td>
                    <td className="tabular px-2 py-1.5 text-right">{fmtInt(r.pages)}</td>
                    <td className="tabular px-2 py-1.5 text-right">{fmtNum(r.seconds, 1)}</td>
                    <td className="px-2 py-1.5 text-xs text-ink2">{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MethodNote anchor="data" fields={["runs.json: run_date, brand, status, products, variants, pages, seconds, error", "meta.json: snapshot_dates, brands[].enabled"]}>
            <p>
              Én kørsel pr. brand pr. dag henter /products.json side for side (250 pr. side) med pause mellem kald, efter
              robots.txt er tjekket. Produkter er antallet i feedet; varianter er det, der blev gemt efter
              eksklusioner af ikke-tøj og live-filteret (mindst én tilgængelig variant eller publiceret inden for{" "}
              {fmtInt(LIVE_DAYS)} dage).
            </p>
            <p>
              Et brand, der fejler en dag, mangler i den dags snapshot: det giver ingen events den dag (så en fejl aldrig
              bliver til falske delistninger) og indgår ikke i dagens tilstandstal, før næste vellykkede kørsel. Dækningen
              er derfor antal brands med status ok.
            </p>
          </MethodNote>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title="Tagget andel pr. brand"
            description="Andel af live styles, der har en tag-række fra regel-taggeren eller Claude. Siger ikke, hvor mange af de otte attributter der blev fundet."
          >
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-axis text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">
                    Brand
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Live styles
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Tagget
                  </th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.brand} className="border-b border-hair">
                    <td className="px-2 py-1.5 text-ink">
                      {names[p.brand] ?? p.brand}
                      <span className="ml-1 text-xs text-muted">{p.brand === pos.self_brand ? "reference" : roleLabel(p.role)}</span>
                    </td>
                    <td className="tabular px-2 py-1.5 text-right">{fmtInt(p.products)}</td>
                    <td className="tabular px-2 py-1.5 text-right">{fmtPct(p.tagged_share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-ink2">
              Et brand med lav tagget andel skal læses med forbehold: dets attributmix, stilafstand og bidrag til
              udsolgt-indekset bygger kun på de taggede styles, så andelene kan være skæve mod de produkter, reglerne
              genkender (tydelige titler, produkttyper og strukturerede tags).{" "}
              {weakest && !allFullyTagged
                ? `Lavest i dag: ${names[weakest.brand] ?? weakest.brand} med ${fmtPct(weakest.tagged_share)}.`
                : "I dag har alle brands en tag-række på hver live style."}
            </p>
            <h3 className="mt-5 text-sm font-semibold text-ink">Dækning pr. attribut</h3>
            <p className="mb-2 mt-1 text-sm text-ink2">
              Andel af live varianter, hvis produkt har en værdi i attributten. Andele og indeks pr. attribut regnes kun på
              de taggede varianter; lav dækning (under {fmtPct(LOW_COVERAGE)}) betyder, at værdiernes andele er usikre.
            </p>
            {coverageRows.length === 0 ? (
              <p className="text-sm text-ink2">Ingen udsolgt-tilstand i eksporten.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-axis text-left text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-2 py-2 font-medium">
                      Attribut
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium" title="Taggede live varianter hos peers delt med alle peers' live varianter">
                      Peers
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium" title={`Taggede live varianter hos ${self} delt med alle ${self}s live varianter`}>
                      {self}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {coverageRows.map((c) => (
                    <tr key={c.attribute} className="border-b border-hair">
                      <td className="px-2 py-1.5 text-ink">{attributeLabel(c.attribute)}</td>
                      <td className={`tabular px-2 py-1.5 text-right ${isNum(c.peerShare) && c.peerShare < LOW_COVERAGE ? "font-medium text-amber-900" : ""}`}>
                        {fmtPct(c.peerShare)} <span className="text-xs text-muted">({fmtInt(c.peerTagged)} af {fmtInt(c.peerLive)})</span>
                      </td>
                      <td className={`tabular px-2 py-1.5 text-right ${isNum(c.selfShare) && c.selfShare < LOW_COVERAGE ? "font-medium text-amber-900" : ""}`}>
                        {fmtPct(c.selfShare)} <span className="text-xs text-muted">({fmtInt(c.selfTagged)} af {fmtInt(c.selfLive)})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <MethodNote
              anchor="tags"
              fields={[
                "positioning.json: brands[].products, tagged_share",
                "sold_out_state.json (scope all): live_n, self_live_n · brands.json: live_variants",
                `taxonomy.json v${meta.taxonomy_version}`,
              ]}
            >
              <p>
                tagged_share = andel af brandets live styles i seneste snapshot, der har en række i tags med en tagger
                angivet. Regel-taggeren skriver altid en række, så andelen falder kun, når nye produkter endnu ikke er
                tagget, eller en kørsel sprang tagging over.
              </p>
              <p>
                Dækning pr. attribut = summen af live_n (peers) eller self_live_n ({self}) over attributtens værdier i
                sold_out_state, delt med brandenes live_variants i brands.json. En style uden værdi i en attribut tæller
                ikke med i den attributs andele og indeks.
              </p>
              <p>
                Hvor godt værdierne rammer, måles ikke her; det valideres mod designer-taggede produkter, før Claude-tagging
                (produkter med under {fmtInt(MIN_RULE_ATTRIBUTES)} af 8 attributter eller tillid under{" "}
                {fmtNum(MIN_RULE_CONFIDENCE, 1)}) slås til.
              </p>
            </MethodNote>
          </Card>

          <Card title="Kilder" description="config/sources.yaml er den eneste liste over tilladte domæner.">
            <ul className="space-y-1 text-sm">
              {enabled.map((b) => (
                <li key={b.key} className="flex items-baseline justify-between gap-2">
                  <span className="text-ink">
                    {b.name} <span className="text-xs text-muted">{roleLabel(b.role)}</span>
                  </span>
                  <span className="text-xs text-ink2">{b.currency ?? "–"}</span>
                </li>
              ))}
            </ul>
            {disabled.length > 0 ? (
              <p className="mt-3 text-xs text-ink2">
                Slået fra (ikke Shopify, ikke verificeret eller arkiv-feed): {disabled.map((b) => b.name).join(", ")}.
              </p>
            ) : null}
          </Card>
        </div>

        <div className="rounded border border-hair bg-surface p-4 text-sm text-ink2">
          <h2 className="mb-2 text-base font-semibold text-ink">Metode og begrænsninger, kort</h2>
          <div className="space-y-2">
            <p>
              Kilde: de offentlige produktkataloger i peers&apos; egne Shopify-butikker, hentet én gang
              dagligt med respekt for robots.txt, forsinkelse mellem kald og en identificerbar User-Agent. Der gemmes
              kun normaliserede produkt- og variantrækker, aldrig billeder eller rå svar, og dette
              dashboard viser kun aggregater.
            </p>
            <p>
              Udsolgt: i øjebliksbilledet en variant uden lager i dagens snapshot; i ugeserien et skifte fra
              tilgængelig til ikke tilgængelig mellem to snapshots, netto for genopfyldning inden {RESTOCK_WINDOW_DAYS}{" "}
              dage. {meta.notes.not_sales} {meta.notes.state} {meta.notes.self_excluded}
            </p>
            <p>
              Indeks: {meta.notes.index} {meta.notes.low_n} Delistede produkter tælles ikke som udsolgte.
            </p>
            <p>
              Tags: lukket taksonomi (v{meta.taxonomy_version}) med regler først og Claude kun på nye
              produkter, når nøglen er sat. Et produkt tagges én gang; ny tagging er en
              eksplicit kommando.
            </p>
            <p>Afvigelser: {meta.notes.calibration}</p>
            <p>
              Begrænsninger: tilgængelighed kan flimre mellem snapshots; Shopify viser ikke lagertal;
              priser i andre valutaer er omregnet til DKK, så prisindekset er indikativt; størrelsessystemer
              er forskellige (alfa, numerisk, UK, sko) og sammenlignes kun inden for samme system; tags fra regler er
              grovere end designernes egne og valideres mod håndtaggede produkter, før Claude-tagging
              slås til. Alle forbehold med baggrund:{" "}
              <Link href="/metode#forbehold" className="underline">
                Metode og forbehold
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
