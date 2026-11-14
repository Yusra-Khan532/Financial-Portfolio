import { ScreenerFrame, SortTh, GroupRow } from "../components/screener/ScreenerFrame";
import { HowDialog } from "../components/screener/controls";
import { FilterGroup, QuickRow } from "../components/screener/FilterGroup";
import { HighFilter, highActive } from "../components/screener/HighFilter";
import { PRISM_SUB, PRISM_TITLE, PrismScoreRows, prismActive } from "../components/screener/PrismScoreFilter";
import { Donut } from "../components/screener/PageParts";
import { PrismPart, PrismScore, PrismTrend } from "../components/screener/cells";
import { AdvancedUpgrade } from "../components/screener/AdvancedUpgrade";
import { useScreener } from "../components/screener/useScreener";
import { ColumnsMenu, PRICE_COL_COUNT, PriceCells, PriceHeads, usePriceColumns } from "../components/screener/PriceColumns";
import { PresetPanel } from "../components/screener/presets/PresetPanel";
import { ScreensStrip } from "../components/screener/presets/ScreensStrip";
import { PresetPage } from "../components/screener/presets/PresetPage";
import { usePresetRoute } from "../components/screener/presets/usePresetRoute";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { dateIN, MINUS, nf } from "../lib/format";
import { LABEL_WORD as LEAD_WORD } from "../lib/leadership";
import { PRISM_PRESETS, TECH_BANDS, activePrismPreset, withPrismPreset, withoutPrismPreset } from "../lib/scoreScreen";
import { EXPLAIN, PRISM_PARTS, coverageLine } from "../lib/scorePrism";
import "../styles/scorescreen.css";

/** Advanced stock screener (Gold only): the whole company universe with the FinLit Prism rating, its four parts and its two technical views.
 *  Informational; not a recommendation. Plans below Gold get the upgrade page and never request the universe. */
export function AdvancedScoreScreener() {
  const { has } = useUI();
  useDocTitle("Advanced stock screener", "Every listed company with its FinLit Prism rating: the four financial-health parts and the short-term and long-term technical views. Gold plan.");
  return has("gold") ? <Advanced /> : <AdvancedUpgrade />;
}

function Advanced() {
  const s = useScreener("advanced");
  const [priceCols, setPriceCols] = usePriceColumns();
  const { draft, applied, isLoading, sum, cover, prismAsOf, techAsOf } = s;
  const prismPreset = activePrismPreset(applied);
  const route = usePresetRoute();   // the prebuilt screen in the address (?preset=...)
  const pickPreset = (id: string) => s.apply(prismPreset === id ? withoutPrismPreset(draft) : withPrismPreset(draft, PRISM_PRESETS.find((p) => p.id === id)!));

  const dateLine = [prismAsOf && `Prism: ${dateIN(prismAsOf)}`, techAsOf && `technical views: prices to ${dateIN(techAsOf)}`].filter(Boolean).join(" · ") || null;

  const basics = <div className="sx-presets" role="group" aria-label="Quick views built from the Prism parts">
    {PRISM_PRESETS.map((p) => <QuickRow key={p.id} label={p.label} on={prismPreset === p.id} title={p.say} onClick={() => pickPreset(p.id)} />)}
  </div>;
  if (route.id) return <PresetPage route={route} basics={basics} />;

  return (
    <ScreenerFrame s={s} splitKey="score-adv" eyebrow="Advanced stock screener" title="Advanced stock screener" sideLabel="Advanced stock screener filters" errorTitle="The advanced stock screener is unavailable right now"
      intro={<>The advanced model for the whole market: the <b>Prism score</b>, its four financial-health parts (Growth & Profitability, Valuation, Quality, Risk) and two technical views, short term and long term. Filter, sort and compare.</>}
      dateLine={dateLine} howTitle="How FinLit Prism works" columnsMenu={<ColumnsMenu on={priceCols} set={setPriceCols} />}
      leadTag={(r) => r.lead ? <span className={"sxl-tag " + r.lead} title={`${LEAD_WORD[r.lead]} among its peers on 52-week price performance${r.lead_line ? ` (${r.lead_line})` : ""}. Describes past price performance only.`}>{LEAD_WORD[r.lead]}</span> : null}
      tier="gold" sortChoices={[{ key: "prism_final", label: "Prism score" }, ...PRISM_PARTS.map((x) => ({ key: x.col, label: x.label })), { key: "prism_st_score", label: "Short term" }, { key: "prism_lt_score", label: "Long term" }]}
      donut={!isLoading && sum.found > 0 ? <Donut part={sum.nZ} total={sum.found} partLabel="Rated" restLabel="Not rated yet" title={`${nf(sum.found - sum.nZ, 0)} of ${nf(sum.found, 0)} companies in this result are not rated yet.`} note="More are added every night, largest first." /> : undefined}
      presets={<PresetPanel route={route} hideGroups basics={basics} basicsActive={!!prismPreset} />} screens={<ScreensStrip route={route} />}
      filters={<>
        <FilterGroup id="score" icon="bars" title={PRISM_TITLE} defaultOpen active={prismActive(s)} hint={PRISM_SUB}>
          <PrismScoreRows s={s} />
        </FilterGroup>
        <FilterGroup id="high" icon="line" title="Down from 52-week high" active={highActive(s)}><HighFilter s={s} /></FilterGroup>
      </>}
      tiles={[]}
      groupHead={<GroupRow groups={[{ g: "prism", n: 5, label: "FinLit Prism", sub: "0–100, higher is better" }, { g: "tech", n: 2, label: "Technical views", sub: `${MINUS}100 to +100` },
        ...(priceCols ? [{ g: "range", n: PRICE_COL_COUNT, label: "52 weeks & returns" }] : [])]} />}
      columnHeads={<>
        <SortTh s={s} k="prism_final" label="Prism score" cls="pzs-h" title={EXPLAIN.prism} />
        {PRISM_PARTS.map((x) => <SortTh key={x.col} s={s} k={x.col} label={x.label} of="Prism" cls="ss-ph" title={"Prism " + x.label + ": " + x.say} />)}
        <SortTh s={s} k="prism_st_score" label="Short term" of="Technical" cls="ss-ph" title="Prism's short-term (5 to 20 sessions) price-trend reading" />
        <SortTh s={s} k="prism_lt_score" label="Long term" of="Technical" cls="ss-ph" title="Prism's long-term (6 to 18 months) price-trend reading" />
        {priceCols && <PriceHeads s={s} />}
      </>}
      colSpan={13 + (priceCols ? PRICE_COL_COUNT : 0)}
      cells={(r) => <>
        <td className="pzs-c"><PrismScore r={r} gold /></td>
        {PRISM_PARTS.map((x) => <td key={x.col} className="ss-pc"><PrismPart r={r} v={r[x.col]} gold /></td>)}
        <td><PrismTrend r={r} score={r.prism_st_score} gold col="st" /></td><td><PrismTrend r={r} score={r.prism_lt_score} gold col="lt" /></td>
        {priceCols && <PriceCells r={r} />}
      </>}
      plain="A screen narrows a long list. The Prism rating describes financial health and price trend from filings and prices; it is not a recommendation. Open a company's Prism page to see why a rating looks the way it does."
      how={<HowDialog title="How FinLit Prism works" onClose={() => s.setHow(false)}>
        <p><b>What the Prism rating means.</b> {EXPLAIN.prism} <b>Technical views.</b> {EXPLAIN.technical}</p>
        {cover && cover.total > 0 && <p>{coverageLine(cover)}</p>}
        <p>Every Prism figure runs from 0 to 100 (the technical views from {MINUS}100 to +100) and is worked out from a company's filed statements and its prices.</p>
        <dl>
          <dt>FinLit Prism</dt><dd>{EXPLAIN.prism} {prismAsOf ? <>Newest ratings were calculated on {dateIN(prismAsOf)}.</> : null}{techAsOf ? <> Technical columns use prices up to {dateIN(techAsOf)}.</> : null}</dd>
          <dt>Prism parts</dt><dd>{PRISM_PARTS.map((x) => `${x.label}: ${x.say}`).join(" ")} Each part is 0 to 100 and higher is better; a high Risk score means lower risk.</dd>
          <dt>Technical views</dt><dd>{EXPLAIN.technical} The filter bands are the ones on the Prism card: Positive {TECH_BANDS.pos.label.replace("Positive ", "")}, Neutral {TECH_BANDS.neutral.label.replace("Neutral ", "")}, Negative {TECH_BANDS.neg.label.replace("Negative ", "")}. Strongly positive counts as Positive and strongly negative as Negative.</dd>
          <dt>Not rated yet</dt><dd>Prism ratings are calculated about 30 seconds each from the provider's data, so they are added in steps: first for companies with a full report, then a few hundred more companies every night, largest first. A company without one shows "Not rated yet" and a Rate now link to its Prism page, which starts the calculation when opened. "Not rated" means Prism looked and the filed data was not enough.</dd>
          <dt>Size</dt><dd>By market value, one scale for the whole site: Large cap above ₹50,000 Cr, Mid cap ₹10,000 to 50,000 Cr, Small cap below ₹10,000 Cr. A company with no market value has no size.</dd>
          <dt>Leader, In line, Laggard</dt><dd>After a company's name: where its 52-week price performance ranks among its peers, from the weekly peer ranking. It describes past price performance only.</dd>
          <dt>Missing data</dt><dd>A dash means the figure is not available (not rated yet, or not enough data). It never counts as a pass and is never treated as zero.</dd>
        </dl>
      </HowDialog>} />
  );
}
