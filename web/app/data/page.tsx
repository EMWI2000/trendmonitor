import type { Metadata } from "next";

import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";
import { brandNames, loadMeta, loadPositioning, loadRuns } from "@/lib/data";
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { roleLabel } from "@/lib/labels";

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

  const enabled = meta.brands.filter((b) => b.enabled);
  const disabled = meta.brands.filter((b) => !b.enabled);

  return (
    <>
      <PageHeader
        title="Datakvalitet"
        lead={
          <>
            Kørsler, dækning og metode. Eksporten er genereret {fmtDateTime(meta.generated_at)} fra
            snapshots til og med {fmtDate(meta.latest_snapshot_date)}.
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
                  <th scope="col" className="px-2 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Produkter
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Varianter
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
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
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Tagget andel pr. brand" description="Andel af live styles med mindst én attribut fra taksonomien.">
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
                Slået fra (ikke Shopify eller ikke verificeret): {disabled.map((b) => b.name).join(", ")}.
              </p>
            ) : null}
          </Card>
        </div>

        <div className="rounded border border-hair bg-surface p-4 text-sm text-ink2">
          <h2 className="mb-2 text-base font-semibold text-ink">Metode og begrænsninger</h2>
          <div className="space-y-2">
            <p>
              Kilde: de offentlige produktkataloger i peers&apos; egne Shopify-butikker, hentet én gang
              dagligt med respekt for robots.txt, forsinkelse mellem kald og en identificerbar User-Agent. Der gemmes
              kun normaliserede produkt- og variantrækker, aldrig billeder eller rå svar, og dette
              dashboard viser kun aggregater.
            </p>
            <p>
              Udsolgt: i øjebliksbilledet en variant uden lager i dagens snapshot; i ugeserien et skifte fra
              tilgængelig til ikke tilgængelig mellem to snapshots, netto for genopfyldning inden 7
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
              slås til.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
