import { Link, Navigate, useSearchParams } from "react-router";
import { ScreenerFrame, SortTh, GroupRow } from "../components/screener/ScreenerFrame";
import { HowDialog } from "../components/screener/controls";
import { FilterGroup } from "../components/screener/FilterGroup";
import { HighFilter, highActive } from "../components/screener/HighFilter";
import { IQ_SUB, IQ_TITLE, IqScoreRows, iqActive } from "../components/screener/IqScoreFilter";
import { Donut } from "../components/screener/PageParts";
import { Score } from "../components/screener/cells";
import { useScreener } from "../components/screener/useScreener";
import { ColumnsMenu, PRICE_COL_COUNT, PriceCells, PriceHeads, usePriceColumns } from "../components/screener/PriceColumns";
import { ScreensStrip } from "../components/screener/presets/ScreensStrip";
import { PresetPage } from "../components/screener/presets/PresetPage";
import { usePresetRoute } from "../components/screener/presets/usePresetRoute";
import { TierChip } from "../components/Gate";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { nf, dateIN } from "../lib/format";
import { PILLARS, hasPrismParams } from "../lib/scoreScreen";
import { useIsGold } from "../lib/planGate";
import "../styles/scorescreen.css";

/** Basic stock screener (Silver): the whole company universe with the FinLit IQ, the basic model. Informational; not a recommendation.
 *  The FinLit Prism rating has its own page, the Advanced stock screener (Gold). Old shared links that carry Prism filters go there, and so does a Gold member:
 *  Gold screens with FinLit Prism only (founder, 13 Nov 2026, task #100). */
export function ScoreScreener() {
  const [params] = useSearchParams();
  const gold = useIsGold();
  if (gold) return <Navigate to="/advanced-score-screener" replace />;
  if (hasPrismParams(params)) return <Navigate to={"/advanced-score-screener" + (params.toString() ? "?" + params.toString() : "")} replace />;
  return <Basic />;
}

function Basic() {
  useDocTitle("Basic stock screener", "Every listed company with its FinLit IQ, the basic model: filter, sort and compare by size, sector and score.");
  const s = useScreener("basic");
  const [priceCols, setPriceCols] = usePriceColumns();
  const { draft, setDraft, locked, upgrade, isLoading, asOf } = s;
  const route = usePresetRoute("basic");   // the prebuilt screen in the address (?preset=...)
  const notScored = s.rows.filter((r) => r.scored === false).length;
  const allStrong = PILLARS.every((x) => draft.bands[x.k].length === 1 && draft.bands[x.k][0] === "high");
  const setAllStrong = () => setDraft((d) => ({ ...d, bands: { ...d.bands, ...Object.fromEntries(PILLARS.map((x) => [x.k, allStrong ? [] : ["high"]])) } }));

  if (route.id) return <PresetPage route={route} />;


  return (
    <ScreenerFrame s={s} splitKey="score" eyebrow="Score screener" title="Basic stock screener" sideLabel="Score screener filters" errorTitle="The score screener is unavailable right now"
      intro={<>Every listed company with its <b>FinLit IQ</b> and the five scores it is made of. Filter, sort and compare by size, sector and score.</>}
      dateLine={asOf ? `Scores: ${dateIN(asOf)}` : null} howTitle="How FinLit IQ works"
      headLink={<Link to="/advanced-score-screener" className="sx-hlink" aria-label="Advanced stock screener (Gold)">Advanced stock screener <TierChip tier="gold" /></Link>}
      columnsMenu={<ColumnsMenu on={priceCols} set={setPriceCols} />}
      tier="silver" sortChoices={[{ key: "overall", label: "FinLit IQ" }, { key: "t", label: "Technical" }, ...PILLARS.map((x) => ({ key: x.col, label: x.label }))]}
      donut={!isLoading && s.rows.length > 0 ? <Donut part={s.rows.length - notScored} total={s.rows.length} partLabel="Scored" restLabel="Not scored" title={notScored > 0 ? `${nf(notScored, 0)} of ${nf(s.rows.length, 0)} companies in this result are not scored yet.` : `All ${nf(s.rows.length, 0)} companies in this result are scored.`} note="Scoring fills in every night, or open a company's report to score it now." /> : undefined}
      presets={null} screens={<ScreensStrip route={route} />}
      filters={locked ? (<>
        <FilterGroup id="score" icon="bars" title={IQ_TITLE} defaultOpen hint={IQ_SUB}>
          <div className="scr-lock"><b><Icon name="lock" /> Score filters are part of Silver</b><span>See and filter by the Quality, Growth, Profitability and Balance sheet scores.</span>
            <button type="button" className="btn primary" onClick={() => upgrade("silver", "Score filters come with the Silver plan.")}>Unlock with Silver</button></div>
        </FilterGroup>
        <FilterGroup id="high" icon="line" title="Down from 52-week high" active={highActive(s)}><HighFilter s={s} /></FilterGroup>
      </>) : (<>
        <FilterGroup id="score" icon="bars" title={IQ_TITLE} defaultOpen active={iqActive(s)} hint={IQ_SUB}>
          <IqScoreRows s={s} allStrong={allStrong} setAllStrong={setAllStrong} />
        </FilterGroup>
        <FilterGroup id="high" icon="line" title="Down from 52-week high" active={highActive(s)}><HighFilter s={s} /></FilterGroup>
      </>)}
      tiles={[]}
      groupHead={<GroupRow groups={[{ g: "iq", n: 6, label: "FinLit IQ", sub: "0–100, higher is better" },
        ...(priceCols ? [{ g: "range", n: PRICE_COL_COUNT, label: "52 weeks & returns" }] : [])]} />}
      columnHeads={<>
        <SortTh s={s} k="overall" label="FinLit IQ" of="FinLit IQ" />
        {PILLARS.map((x) => <SortTh key={x.k} s={s} k={x.col} label={x.label} of="FinLit IQ" cls="ss-ph" title={x.say} />)}
        <SortTh s={s} k="t" label="Technical" of="FinLit IQ" />
        {priceCols && <PriceHeads s={s} />}
      </>}
      colSpan={12 + (priceCols ? PRICE_COL_COUNT : 0)}
      cells={(r) => <>
        <td><Score r={r} k="overall" locked={locked} /></td>
        {PILLARS.map((x) => <td key={x.k} className="ss-pc"><Score r={r} k={x.col} locked={locked} /></td>)}
        <td><Score r={r} k="t" locked={locked} /></td>
        {priceCols && <PriceCells r={r} />}
      </>}
      plain="A score screen narrows a long list. It describes financial health and price trend from filings and prices; it is not a recommendation. Open a company's report to see why a score looks the way it does."
      how={<HowDialog title="How FinLit IQ works" onClose={() => s.setHow(false)}>
        <p><Link to="/glossary/finlit-iq">What the FinLit IQ means</Link>: the glossary entry, with its five parts in words.</p>
        <p>Every score runs from 0 to 100 and is worked out from a company's filed statements and its prices. Nothing on this page is computed differently from the company's own report page.</p>
        <dl>
          <dt>Technical</dt><dd>The fifth part of the FinLit IQ, 0 to 100: the price trend.</dd>
          <dt>Overall</dt><dd>The FinLit IQ shown on every company page, 0 to 100, from its filed statements and prices.</dd>
          <dt>Bands</dt><dd>Four rating words, from the highest: Strong, Healthy, Mixed and Watch. The model's cut-offs stay with the model; the filter sends the words and the server applies them.</dd>
          <dt>Size</dt><dd>By market value, one scale for the whole site: Large cap above ₹50,000 Cr, Mid cap ₹10,000 to 50,000 Cr, Small cap below ₹10,000 Cr. A company with no market value has no size.</dd>
          <dt>Missing data</dt><dd>A dash or a lock means the figure is not available (not scored yet, not enough data, or not in your plan). It never counts as a pass and is never treated as zero.</dd>
          <dt>Data date</dt><dd>{asOf ? <>Newest scores were computed on {dateIN(asOf)}. </> : <>The score date is not available right now. </>}Scores refresh every night; prices come from the latest market refresh.</dd>
          <dt>FinLit Prism</dt><dd>The advanced model has its own page, the <Link to="/advanced-score-screener">Advanced stock screener</Link> (Gold).</dd>
        </dl>
      </HowDialog>} />
  );
}
