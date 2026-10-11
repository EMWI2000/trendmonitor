import type { Metadata } from "next";

import Card from "@/components/Card";
import type { IndexBarRow } from "@/components/IndexBars";
import NotSalesNote from "@/components/NotSalesNote";
import PageHeader from "@/components/PageHeader";
import SizeHeatmap from "@/components/SizeHeatmap";
import SoldOutExplorer, { type SoldOutAttribute, type SoldOutPanel, type TooFewRow } from "@/components/SoldOutExplorer";
import { brandNames, loadMeta, loadSizeDepletion, loadSoldOutState, taxonomyAttributes } from "@/lib/data";
import { fmtDate, fmtIndex, fmtInt, fmtPct, isNum } from "@/lib/format";
import { ATTRIBUTE_ORDER, attributeLabel, attributeWord, scopeLabel } from "@/lib/labels";
import type { Scope, SoldOutStateRow } from "@/lib/types";

export const metadata: Metadata = { title: "Hvad er udsolgt nu" };

/** How many values the cross-attribute headline names per scope: strongest over- and under-representation. */
const HEADLINE_TOP = 5;
const HEADLINE_BOTTOM = 3;

function buildPanel(rows: SoldOutStateRow[], attribute: string, scope: Scope): SoldOutPanel {
  const slice = rows.filter((r) => r.attribute === attribute && r.scope === scope);
  const bars: IndexBarRow[] = [];
  const tooFew: TooFewRow[] = [];
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
  }
  bars.sort((a, b) => b.index - a.index);
  tooFew.sort((a, b) => b.liveN - a.liveN);
  return { bars, tooFew, liveTotal, unavailableTotal };
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

export default function SoldOutPage() {
  const meta = loadMeta();
  const state = loadSoldOutState();
  const depletion = loadSizeDepletion();
  const names = brandNames();
  const t = meta.thresholds;
  const weeks = Math.round(t.launch_window_days / 7);

  const attributes: SoldOutAttribute[] = taxonomyAttributes(ATTRIBUTE_ORDER)
    .filter((a) => state.some((r) => r.attribute === a))
    .map((a) => ({
      key: a,
      label: attributeLabel(a),
      panels: {
        all: buildPanel(state, a, "all"),
        new: buildPanel(state, a, "new"),
      },
    }));

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
            meget de fylder i det live sortiment. Referencebrandet indgår ikke i indekset, men vises til
            sammenligning i størrelsestabellen.
          </>
        }
      />

      <div className="mb-4 space-y-1">
        <NotSalesNote text={meta.notes.not_sales} extra={meta.notes.state} />
        <NotSalesNote text={meta.notes.self_excluded} extra={meta.notes.low_n} />
      </div>

      <div className="space-y-6">
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
        </Card>

        <Card
          title="Udsolgt-indeks pr. attribut"
          description="Vælg attribut og udsnit. Hver søjle viser værdiens andel af det udsolgte, indekset og n."
        >
          <SoldOutExplorer
            attributes={attributes}
            lowN={t.low_n}
            minLaunched={t.min_launched}
            launchWindowDays={t.launch_window_days}
          />
        </Card>

        <Card
          title="Størrelser uden lager pr. brand"
          description={
            <>
              Andel af live varianter i hver størrelse, der er uden lager i dag. En høj andel i
              yderstørrelserne kan være lav indkøbsdybde lige så vel som
              efterspørgsel; læs rækkerne mod hinanden, ikke som salg. Referencebrandet
              vises til sammenligning.
            </>
          }
        >
          <SizeHeatmap rows={depletion} selfBrand={meta.self_brand} brandNames={names} lowN={t.low_n} />
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
              Indekset beregnes kun for værdier med mindst 2&nbsp;% af de live varianter og mindst{" "}
              {t.min_launched} varianter; n under {t.low_n} markeres som lavt n.
            </li>
            <li>Shopify viser kun tilgængelig / ikke tilgængelig, aldrig lagertal.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
