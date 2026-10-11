import type { Metadata } from "next";
import type { ReactNode } from "react";

import Card from "@/components/Card";
import type { IndexBarRow } from "@/components/IndexBars";
import InsightCard from "@/components/InsightCard";
import MethodNote from "@/components/MethodNote";
import NotSalesNote from "@/components/NotSalesNote";
import PageHeader from "@/components/PageHeader";
import SizeHeatmap from "@/components/SizeHeatmap";
import SoldOutExplorer, {
  type SelfCompareRow,
  type SoldOutAttribute,
  type SoldOutPanel,
  type TooFewRow,
} from "@/components/SoldOutExplorer";
import { type AttributeCoverage, LOW_COVERAGE, computeAttributeCoverage } from "@/lib/coverage";
import {
  brandNames,
  loadBrands,
  loadInsights,
  loadMeta,
  loadSizeDepletion,
  loadSoldOutState,
  selfName,
  taxonomyAttributes,
} from "@/lib/data";
import { fmtDate, fmtIndex, fmtInt, fmtPct, isNum } from "@/lib/format";
import { ATTRIBUTE_ORDER, attributeLabel, attributeWord, isAttributeInsight, scopeLabel } from "@/lib/labels";
import { MIN_SHARE_FOR_INDEX } from "@/lib/method";
import type { AttributeInsight, Insights, Scope, SoldOutStateRow } from "@/lib/types";

export const metadata: Metadata = { title: "Hvad er udsolgt nu" };

/** How many values the cross-attribute headline names per scope: strongest over- and under-representation. */
const HEADLINE_TOP = 5;
const HEADLINE_BOTTOM = 3;

function buildPanel(rows: SoldOutStateRow[], attribute: string, scope: Scope): SoldOutPanel {
  const slice = rows.filter((r) => r.attribute === attribute && r.scope === scope);
  const bars: IndexBarRow[] = [];
  const tooFew: TooFewRow[] = [];
  const selfRows: SelfCompareRow[] = [];
  let liveTotal = 0;
  let unavailableTotal = 0;
  for (const r of slice) {
    liveTotal += r.live_n;
    unavailableTotal += r.unavailable_n;
    if (isNum(r.state_index)) {
      bars.push({
        value: r.value,
        index: r.state_index,
        n: r.unavailable_n,
        lowN: r.low_n,
        // Absolute share next to the index, so a reader sees how much of the sold-out stock the value is.
        label:
          `${fmtPct(r.share_unavailable)} af udsolgte · indeks ${fmtIndex(r.state_index)} · ` +
          `n=${fmtInt(r.unavailable_n)}${r.low_n ? " · lavt n" : ""}`,
        shareBase: r.share_live,
        shareOutcome: r.share_unavailable,
      });
    } else {
      tooFew.push({ value: r.value, liveN: r.live_n, unavailableN: r.unavailable_n });
    }
    // The reference brand's own position: every value with a peer index or any own variants.
    if (isNum(r.state_index) || r.self_live_n > 0) {
      selfRows.push({
        value: r.value,
        peerIndex: r.state_index,
        peerShareLive: r.share_live,
        peerUnavailableN: r.unavailable_n,
        peerLowN: r.low_n,
        selfShareLive: r.self_share_live,
        selfLiveN: r.self_live_n,
        selfUnavailableN: r.self_unavailable_n,
        selfIndex: r.self_state_index,
      });
    }
  }
  bars.sort((a, b) => b.index - a.index);
  tooFew.sort((a, b) => b.liveN - a.liveN);
  selfRows.sort((a, b) => {
    const ai = isNum(a.peerIndex) ? a.peerIndex : -1;
    const bi = isNum(b.peerIndex) ? b.peerIndex : -1;
    if (bi !== ai) return bi - ai;
    return b.selfLiveN - a.selfLiveN;
  });
  return { bars, tooFew, liveTotal, unavailableTotal, selfRows };
}

interface HeadlinePick {
  attribute: string;
  value: string;
  index: number;
  share: number | null;
  n: number;
}

interface Headline {
  top: HeadlinePick[];
  bottom: HeadlinePick[];
}

/** Cross-attribute synthesis for one scope: robust-n values only, strongest over-representation first. */
function buildHeadline(rows: SoldOutStateRow[], scope: Scope): Headline {
  const robust: HeadlinePick[] = [];
  for (const r of rows) {
    const index = r.state_index;
    if (r.scope !== scope || r.low_n || !isNum(index)) continue;
    robust.push({ attribute: r.attribute, value: r.value, index, share: r.share_unavailable, n: r.unavailable_n });
  }
  robust.sort((a, b) => b.index - a.index);
  const top = robust.filter((p) => p.index > 1).slice(0, HEADLINE_TOP);
  const bottom = robust
    .filter((p) => p.index < 1)
    .slice(-HEADLINE_BOTTOM)
    .reverse();
  return { top, bottom };
}

function headlineItem(p: HeadlinePick): string {
  return (
    `${attributeWord(p.attribute)} ${p.value} (indeks ${fmtIndex(p.index)}, ${fmtPct(p.share)} af det udsolgte, ` +
    `n=${fmtInt(p.n)})`
  );
}

function HeadlineBlock({ label, intro, headline }: { label: string; intro: string; headline: Headline }) {
  return (
    <div>
      <dt className="font-medium text-ink">{label}</dt>
      <dd className="mt-1 text-ink2">
        {headline.top.length > 0
          ? `${intro}: ${headline.top.map(headlineItem).join("; ")}.`
          : "Ingen værdier ligger over 1,0 med robust n."}
        {headline.bottom.length > 0 ? ` Mindst: ${headline.bottom.map(headlineItem).join("; ")}.` : ""}
      </dd>
    </div>
  );
}

/** The attribute-kind insights for one attribute, or an honest sentence on why there are none. */
function AttributeInsightPanel({
  attribute,
  items,
  insights,
  self,
  names,
  lowN,
  launchWindowDays,
  coverage,
}: {
  attribute: string;
  items: AttributeInsight[];
  insights: Insights;
  self: string;
  names: Record<string, string>;
  lowN: number;
  launchWindowDays: number;
  coverage: Record<string, AttributeCoverage>;
}) {
  const rules = insights.rules;
  return (
    <div className="space-y-3 border-t border-hair pt-4">
      <h3 className="text-sm font-semibold text-ink">
        Hvad betyder det for {self}: {attributeLabel(attribute).toLocaleLowerCase("da-DK")}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-ink2">
          Ingen indsigt for {attributeWord(attribute)} i dag. Reglerne udløses, når en værdi med robust n (mindst{" "}
          {fmtInt(rules.low_n)} varianter uden lager) har indeks mindst {fmtIndex(rules.over_index)} hos peers og{" "}
          {self}s egen andel enten er under {fmtIndex(rules.white_space_ratio)} gange peers&apos; (hvidt felt) eller
          mindst lige så stor (styrke), eller indeks højst {fmtIndex(rules.under_index)} og {self}s andel mindst{" "}
          {fmtIndex(rules.heavy_ratio)} gange peers&apos; og mindst {fmtPct(rules.min_self_share)} (risiko). Højst{" "}
          {fmtInt(rules.max_attribute_insights)} attributindsigter vises i alt, så en attribut kan også mangle, fordi
          andre vejer tungere.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <InsightCard
              key={`${item.kind}-${item.rank}`}
              item={item}
              selfName={self}
              names={names}
              lowN={lowN}
              launchWindowDays={launchWindowDays}
              markdownHeavy={rules.markdown_heavy}
              coverage={coverage}
              showLink={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SoldOutPage() {
  const meta = loadMeta();
  const state = loadSoldOutState();
  const depletion = loadSizeDepletion();
  const insights = loadInsights();
  const names = brandNames();
  const self = selfName();
  const t = meta.thresholds;
  const weeks = Math.round(t.launch_window_days / 7);

  // Shares and indices rest on variants with a tag in the attribute; the coverage says how large that base is.
  const coverage = computeAttributeCoverage(state, loadBrands());

  const attrKeys = taxonomyAttributes(ATTRIBUTE_ORDER).filter((a) => state.some((r) => r.attribute === a));
  const attributes: SoldOutAttribute[] = attrKeys.map((a) => ({
    key: a,
    label: attributeLabel(a),
    peerCoverage: coverage[a] ? coverage[a].peerShare : null,
    selfCoverage: coverage[a] ? coverage[a].selfShare : null,
    panels: {
      all: buildPanel(state, a, "all"),
      new: buildPanel(state, a, "new"),
    },
  }));

  const attributeInsights = insights.items.filter(isAttributeInsight).sort((a, b) => a.rank - b.rank);
  const insightPanels: Record<string, ReactNode> = {};
  for (const a of attrKeys) {
    insightPanels[a] = (
      <AttributeInsightPanel
        attribute={a}
        items={attributeInsights.filter((i) => i.attribute === a)}
        insights={insights}
        self={self}
        names={names}
        lowN={t.low_n}
        launchWindowDays={t.launch_window_days}
        coverage={coverage}
      />
    );
  }
  const sizesInsight = insights.items.find((i) => i.kind === "sizes");

  const headlineAll = buildHeadline(state, "all");
  const headlineNew = buildHeadline(state, "new");

  return (
    <>
      <PageHeader
        title="Hvad er udsolgt nu"
        lead={
          <>
            Øjebliksbillede af {fmtDate(meta.latest_snapshot_date)}: hvilke attributværdier er
            over- eller underrepræsenterede blandt varianter uden lager hos peers, målt mod hvor
            meget de fylder i det live sortiment. {self} indgår ikke i indekset, men vises til
            sammenligning under søjlerne og i størrelsestabellen.
          </>
        }
      />

      <div className="mb-4 space-y-1">
        <NotSalesNote text={meta.notes.not_sales} extra={meta.notes.state} />
        <NotSalesNote text={meta.notes.self_excluded} extra={meta.notes.low_n} />
      </div>

      <div className="space-y-6">
        <Card
          title="Sådan bruger I det"
          description="Tre trin til design- og indkøbsmødet. Udsolgt er indkøbsdybde gange efterspørgsel, så hvert fund er en hypotese, der testes i et drop, ikke et facit."
        >
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
            <li>
              <span className="font-medium">Læs top og bund for nyheder.</span>{" "}
              <span className="text-ink2">
                Vælg attribut nedenfor og udsnittet &quot;{scopeLabel("new", t.launch_window_days)}&quot; (udsnittet
                starter på alle live varianter). Værdierne øverst (indeks over 1,0, robust n) er dem, peers oftere er uden
                lager i denne sæson; værdierne nederst er dem, der bliver stående. Spring værdier med lavt n over.
              </span>
            </li>
            <li>
              <span className="font-medium">Sammenlign med {self}s egen andel.</span>{" "}
              <span className="text-ink2">
                Tabellen under søjlerne viser, hvor stor en del af {self}s eget live sortiment der ligger i hver værdi.
                Høj udsolgt-andel hos peers og lille egen andel er et hvidt felt; lav udsolgt-andel hos peers og stor egen
                andel er en lagerrisiko. Begge dele er indkøbsdybde gange efterspørgsel, så det er en hypotese, ikke et
                mål for, hvad kunderne vil have. Kortene &quot;Hvad betyder det for {self}&quot; siger det med tal.
              </span>
            </li>
            <li>
              <span className="font-medium">Gør det til en test i næste drop, og tjek igen ugentligt.</span>{" "}
              <span className="text-ink2">
                Vælg én eller to værdier, sæt dem ind i begrænset dybde eller træk dybden ned, og notér indeks og n i dag.
                Når Attributindeks får events (fra dag 2) og baseline efter {fmtInt(t.baseline_weeks)} uger, kan I se, om
                bevægelsen følger øjebliksbilledet.
              </span>
            </li>
          </ol>
        </Card>

        <Card
          title="Kort fortalt"
          description={
            <>
              Hvad kendetegner varianterne uden lager hos peers {fmtDate(meta.latest_snapshot_date)}. Kun værdier
              med robust n (mindst {t.low_n} varianter uden lager); indeks 1,0 = værdien fylder lige så meget
              blandt det udsolgte som i sortimentet. Tilstand i dag, ikke salg.
            </>
          }
        >
          <dl className="space-y-3 text-sm">
            <HeadlineBlock
              label={scopeLabel("all", t.launch_window_days)}
              intro="Blandt varianter uden lager hos peers fylder disse værdier mest i forhold til det live sortiment"
              headline={headlineAll}
            />
            <HeadlineBlock
              label={scopeLabel("new", t.launch_window_days)}
              intro={`Blandt nyheder lanceret inden for ${weeks} uger fylder disse værdier mest blandt det udsolgte`}
              headline={headlineNew}
            />
          </dl>
          <MethodNote anchor="tilstand" fields={["sold_out_state.json: state_index, share_unavailable, unavailable_n, low_n, scope"]}>
            <p>
              Alle værdier med et indeks og n på mindst {fmtInt(t.low_n)} sorteres efter indeks på tværs af attributter;
              de {HEADLINE_TOP} højeste over 1,0 og de {HEADLINE_BOTTOM} laveste under 1,0 nævnes. Indeks = værdiens andel
              af peers&apos; varianter uden lager delt med dens andel af peers&apos; live varianter inden for attributten.
            </p>
            <p>
              &quot;Nyheder&quot; begrænser begge tællinger til produkter med lanceringsdato inden for{" "}
              {fmtInt(t.launch_window_days)} dage (published_at, ellers første snapshot).
            </p>
          </MethodNote>
        </Card>

        <Card
          id="indeks"
          title="Udsolgt-indeks pr. attribut"
          description={`Vælg attribut og udsnit. Hver søjle viser værdiens andel af det udsolgte, indekset og n. Under søjlerne: indsigterne for attributten og ${self}s egen position.`}
        >
          <SoldOutExplorer
            attributes={attributes}
            lowN={t.low_n}
            minLaunched={t.min_launched}
            launchWindowDays={t.launch_window_days}
            selfName={self}
            overIndex={insights.rules.over_index}
            underIndex={insights.rules.under_index}
            whiteSpaceRatio={insights.rules.white_space_ratio}
            heavyRatio={insights.rules.heavy_ratio}
            insightPanels={insightPanels}
          />
          <MethodNote
            anchor="tilstand"
            fields={[
              "sold_out_state.json: live_n, unavailable_n, share_live, share_unavailable, state_index, low_n",
              "sold_out_state.json: self_live_n, self_unavailable_n, self_share_live, self_state_index",
              "brands.json: live_variants (dækning pr. attribut)",
            ]}
          >
            <p>
              Pr. attributværdi og udsnit tælles peers&apos; taggede live varianter (live_n) og dem uden lager
              (unavailable_n) i seneste snapshot. share_live = live_n / alle live varianter med et tag i attributten;
              share_unavailable = unavailable_n / alle varianter uden lager med et tag i attributten; indeks =
              share_unavailable / share_live.
            </p>
            <p>
              Indeks kræver share_live på mindst {fmtPct(MIN_SHARE_FOR_INDEX)} og live_n på mindst{" "}
              {fmtInt(t.min_launched)}; n er unavailable_n, og under {fmtInt(t.low_n)} er det lavt n. {self}s egne tal
              beregnes på samme måde, men kun over {self}s varianter, og indgår aldrig i peer-indekset.
            </p>
            <p>
              Dækning = taggede live varianter i attributten delt med alle live varianter (brands.json). Under{" "}
              {fmtPct(LOW_COVERAGE)} hviler andelene på en tynd del af sortimentet og markeres på kortene; tabellen pr.
              attribut står under Datakvalitet.
            </p>
          </MethodNote>
        </Card>

        <Card
          id="storrelser"
          title="Størrelser uden lager pr. brand"
          description={
            <>
              Andel af live varianter i hver størrelse, der er uden lager i dag. En høj andel i
              yderstørrelserne kan være lav indkøbsdybde lige så vel som
              efterspørgsel; læs rækkerne mod hinanden, ikke som salg. {self} vises til sammenligning.
            </>
          }
        >
          {sizesInsight ? (
            <div className="mb-4">
              <InsightCard
                item={sizesInsight}
                selfName={self}
                names={names}
                lowN={t.low_n}
                launchWindowDays={t.launch_window_days}
                markdownHeavy={insights.rules.markdown_heavy}
                showLink={false}
              />
            </div>
          ) : (
            <p className="mb-4 text-sm text-ink2">
              Ingen størrelsesindsigt i dag: ingen størrelse med mindst {fmtInt(insights.rules.min_size_n)} live varianter
              hos peers ligger mindst {fmtInt(100 * insights.rules.size_gap)} procentpoint over peers&apos; gennemsnitlige
              andel uden lager.
            </p>
          )}
          <SizeHeatmap rows={depletion} selfBrand={meta.self_brand} brandNames={names} lowN={t.low_n} />
          <MethodNote
            anchor="storrelser"
            fields={["size_depletion.json: brand, size, live_variants, unavailable_variants, unavailable_share", "insights.json: sizes, rules.min_size_n, rules.size_gap"]}
          >
            <p>
              Pr. brand og størrelse i seneste snapshot: live_variants er alle varianter med en genkendt størrelse,
              unavailable_variants dem uden lager, unavailable_share = unavailable_variants / live_variants. Celler med
              under {fmtInt(t.low_n)} live varianter er markeret.
            </p>
            <p>
              Størrelsesindsigten lægger peers sammen pr. størrelse (kun alfa XXXS–XXXL og numerisk 32–48, de samme
              kanoniske størrelser som tabellens første del), kræver mindst {fmtInt(insights.rules.min_size_n)} live
              varianter og nævner de op til tre størrelser, hvis andel uden lager ligger mindst{" "}
              {fmtInt(100 * insights.rules.size_gap)} procentpoint over peers&apos; gennemsnit.
            </p>
          </MethodNote>
        </Card>

        <div className="rounded border border-hair bg-surface p-4 text-sm text-ink2">
          <h2 className="mb-1 text-base font-semibold text-ink">Hvad tallene kan og ikke kan</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Tilstand, ikke bevægelse: en variant uden lager kan have været det i måneder.
              Ugeserien under Attributindeks viser bevægelsen, når der er historik.
            </li>
            <li>
              Indkøbsdybde gange efterspørgsel: et brand der køber tyndt ind, ser udsolgt ud
              uden at sælge meget. Sammenlign derfor attributter inden for samme udsnit, ikke brands mod
              hinanden.
            </li>
            <li>
              Indekset beregnes kun for værdier med mindst {fmtPct(MIN_SHARE_FOR_INDEX)} af de live varianter og mindst{" "}
              {t.min_launched} varianter; n under {t.low_n} markeres som lavt n.
            </li>
            <li>Shopify viser kun tilgængelig / ikke tilgængelig, aldrig lagertal.</li>
            <li>
              {self}s egne tal er fra den offentlige webshop og siger noget om, hvad der er at få der, ikke om{" "}
              {self}s salg.
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
