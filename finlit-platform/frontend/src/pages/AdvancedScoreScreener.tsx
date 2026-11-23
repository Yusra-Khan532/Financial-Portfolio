import { ScreenerFrame, SortTh, GroupRow } from "../components/screener/ScreenerFrame";
import { ADVANCED_DESC } from "../components/screener/ScreenerHead";
import { HowDialog } from "../components/screener/controls";
import { AdvFilterBar } from "../components/screener/AdvFilterBar";
import { PrismPart, PrismScore, PrismTrend } from "../components/screener/cells";
import { AdvancedUpgrade } from "../components/screener/AdvancedUpgrade";
import { useScreener } from "../components/screener/useScreener";
import { ColumnsMenu, PRICE_COL_COUNT, PriceCells, PriceHeads, usePriceColumns } from "../components/screener/PriceColumns";
import { ScreensStrip, closeDay } from "../components/screener/presets/ScreensStrip";
import { PresetPage } from "../components/screener/presets/PresetPage";
import { usePresetRoute } from "../components/screener/presets/usePresetRoute";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { dateIN, MINUS } from "../lib/format";
import { LABEL_WORD as LEAD_WORD } from "../lib/leadership";
import { CAPS, CAP_RANGE, TECH_BANDS, industryOf, nsePath, type Item } from "../lib/scoreScreen";

/** SPEC §4: the line under the company name is its NSE industry (one of 59) and its size, with macro sector › sector › industry on hover. A company NSE does not
 *  classify (listed only on the BSE, say) keeps its own sector label, as before. */
function coLine(r: Item) {
  const ind = industryOf(r), size = r.cap ? `${r.cap} cap` : null;
  if (!ind) return <small className="sx-secn">{[r.sector || "Sector not listed", size].filter(Boolean).join(" · ")}</small>;
  return <small className="sx-secn sx-nse" title={nsePath(r) ?? undefined}>{[ind, size].filter(Boolean).join(" · ")}<span className="sr"> ({nsePath(r)})</span></small>;
}
import { EXPLAIN, PRISM_PARTS, coverageLine } from "../lib/scorePrism";
import "../styles/scorescreen.css";

/** Advanced stock screener (Gold only): the whole company universe with the FinLit Prism rating, its four parts and its two technical views.
 *  Informational; not a recommendation. Plans below Gold get the upgrade page and never request the universe. */
/** The header's dates, each with its source. The ready-made screens are built each night after a close, so during the day their lists can be one close
 *  behind the scores and prices (QA 23 Nov: "Updated after the 20 Nov close" beside "prices to 23 Nov"); the line names that close so the two do not read as a fault. */
export function headerDateLine(prismAsOf: string | null | undefined, techAsOf: string | null | undefined, screensAsOf: string | null | undefined): string | null {
  const day = closeDay(screensAsOf);
  return [prismAsOf && `Prism: ${dateIN(prismAsOf)}`, techAsOf && `technical views: prices to ${dateIN(techAsOf)}`,
    day && `ready-made screens: lists from the ${day} close (built each night after the close)`].filter(Boolean).join(" · ") || null;
}

export function AdvancedScoreScreener() {
  const { has } = useUI();
  useDocTitle("Advanced stock screener", "Every listed company with its FinLit Prism rating: the four financial-health parts and the short-term and long-term technical views. Gold plan.");
  return has("gold") ? <Advanced /> : <AdvancedUpgrade />;
}

function Advanced() {
  const s = useScreener("advanced");
  const [priceCols, setPriceCols] = usePriceColumns();
  const { cover, prismAsOf, techAsOf } = s;
  const route = usePresetRoute();   // the prebuilt screen in the address (?preset=...)

  const dateLine = headerDateLine(prismAsOf, techAsOf, route.list.data?.asOf);

  if (route.id) return <PresetPage route={route} />;      // the four Prism views are server screens in the strip now (14 Nov N-35)

  return (
    <ScreenerFrame s={s} splitKey="score-adv" eyebrow="Advanced stock screener" title="Advanced stock screener" sideLabel="Advanced stock screener filters" errorTitle="The advanced stock screener is unavailable right now"
      intro={ADVANCED_DESC}
      dateLine={dateLine} howTitle="How FinLit Prism works" columnsMenu={<ColumnsMenu on={priceCols} set={setPriceCols} />}
      leadTag={(r) => r.lead ? <span className={"sxl-tag " + r.lead} title={`${LEAD_WORD[r.lead]} among its peers on 52-week price performance${r.lead_line ? ` (${r.lead_line})` : ""}. Describes past price performance only.`}>{LEAD_WORD[r.lead]}</span> : null}
      tier="gold" sortChoices={[{ key: "prism_final", label: "Prism score" }, ...PRISM_PARTS.map((x) => ({ key: x.col, label: x.label })), { key: "prism_st_score", label: "Short term" }, { key: "prism_lt_score", label: "Long term" }]}
      presets={null} screens={<ScreensStrip route={route} />}
      filters={null} topFilters={<AdvFilterBar s={s} />} coLine={coLine}
      tiles={[]}
      groupHead={<GroupRow groups={[{ g: "prism", n: 5, label: "FinLit Prism", sub: "0–100, higher is better" }, { g: "tech", n: 2, label: "Technical views", sub: `${MINUS}100 to +100` },
        ...(priceCols ? [{ g: "range", n: PRICE_COL_COUNT, label: "52 weeks & returns" }] : [])]} />}
      columnHeads={<>
        <SortTh s={s} k="prism_final" label="Prism score" cls="pzs-h" title={EXPLAIN.prism} />
        {PRISM_PARTS.map((x) => <SortTh key={x.col} s={s} k={x.col} label={x.label} of="Prism" cls="ss-ph" title={"Prism " + x.label + ": " + x.say} />)}
        <SortTh s={s} k="prism_st_score" label="Short term" of="Technical" cls="ss-ph" title="Prism's short-term price-trend reading" />
        <SortTh s={s} k="prism_lt_score" label="Long term" of="Technical" cls="ss-ph" title="Prism's long-term price-trend reading" />
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
          <dt>Technical views</dt><dd>{EXPLAIN.technical} The filter bands are the ones on the Prism card: {TECH_BANDS.pos.label}, {TECH_BANDS.neutral.label} and {TECH_BANDS.neg.label}. A strong uptrend counts as {TECH_BANDS.pos.label} and a strong downtrend as {TECH_BANDS.neg.label}.</dd>
          <dt>Not rated yet</dt><dd>Prism ratings are calculated about 30 seconds each from the provider's data, so they are added in steps: first for companies with a full report, then a few hundred more companies every night, largest first. A company without one shows "Not rated yet" and a Rate now link to its Prism page, which starts the calculation when opened. "Not rated" means Prism looked and the filed data was not enough.</dd>
          <dt>Size</dt><dd>By market value, one scale for the whole site: {CAPS.map((c) => `${c} cap ${CAP_RANGE[c].charAt(0).toLowerCase()}${CAP_RANGE[c].slice(1)}`).join(", ")}. A company with no market value has no size.</dd>
          <dt>Macro sector, sector and industry</dt><dd>NSE's own classification: 12 macro sectors, 22 sectors and 59 industries. The three lists are linked: picking a macro sector narrows the sectors and industries offered. Inside one list, ticking more than one shows any of them; across lists, a company must match each. A company NSE does not classify (listed only on the BSE, for example) is left out while any of the three is set.</dd>
          <dt>Prism score filter</dt><dd>Rating words follow the Prism score, from Strong down to Poor, and Not rated without a score. Score ranges run 0 to 100 (an empty box means no limit). The technical views use five words: Strong uptrend, Uptrend, Sideways, Downtrend and Strong downtrend.</dd>
          <dt>Leader, In line, Laggard</dt><dd>After a company's name: where its 52-week price performance ranks among its peers, from the weekly peer ranking. It describes past price performance only.</dd>
          <dt>Missing data</dt><dd>A dash means the figure is not available (not rated yet, or not enough data). It never counts as a pass and is never treated as zero.</dd>
        </dl>
      </HowDialog>} />
  );
}
