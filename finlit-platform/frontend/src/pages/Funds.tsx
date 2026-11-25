// Mutual funds: the scheme list, one scheme's page and the side-by-side comparison. Data is AMFI's own NAV files (see backend/finlit/mf.py); the section is free.
// Information only: no ranking, no "best", no advice. Every page shows the source, the data date and the disclaimer.
import { useEffect, useMemo, useState } from "react";
import { PhoneFold } from "../components/PhoneFold";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Icon } from "../lib/icons";
import { buttonClass } from "../components/ui";
import { useUI } from "../lib/ui";
import { visits } from "../lib/recentVisits";
import { useDocTitle } from "../lib/title";
import { dateIN, nf } from "../lib/format";
import {
  AUM_BUCKETS, CHECKS, EMPTY_QUERY, GROWTH_RETURNS_LABEL, RETURN_LABELS, TRAY_MAX, catNames, growthFigure, categoryShort, compareUrl, effectiveQuery, navFull, navText, parseIds, parseQuery, pctText, queryToParams, readCols, rememberName, rowSortValue, subCats, tone, trayName,
  useFundCompare, useFundDetail, useFundFacts, useFundFilters, useFundList, useFundPortfolio, useHotList, useTray, writeCols,
  tabDefaults, type ColId, type CompareFund, type FundDetail, type FundRow, type ListQuery, type RangeKey, type SortKey,
} from "../lib/mf";
import { keyLabel, selectionTitle, tabLabel } from "../lib/mfCategories";
import { ColumnPicker, Controls, Pager } from "../mf/Controls";
import { CategoryPicker, cardOn } from "../mf/Dashboard";
import { FundChart, SERIES_STYLE } from "../mf/FundChart";
import { FundTable } from "../mf/FundTable";
import { LoadingNotice, SortPills, SummaryCards } from "../mf/Summary";
import { summarise } from "../lib/mfSummary";
import { Fig, Foot, GTerm, PlanChip, planLabel } from "../mf/Bits";
import { FactsCard } from "../mf/Facts";
import { FundGlance, FundSectionNav } from "../mf/FundGlance";
import { ReturnsBlock } from "../mf/Returns";
import { PageHeader, type PageHeaderProps } from "../components/PageHeader";
import { HoldingsSection } from "../holdings";
import { FundScoreCard } from "../mf/ScoreCard";
import { MF_METHOD_URL, MF_SCORE_COMPLIANCE } from "../lib/mfScore";
import { ScoreCompare } from "../mf/ScoreCompare";
import { FundHeadToHead } from "./FundHeadToHead";
import "../styles/mf.css";
import "../styles/task354.css";   // task #354: the Hide filters outline
import "../styles/prism-card.css";   // the (i) beside Volatility (task #311)
import { InfoTip } from "../stock/PrismCardView";
import "../styles/etfvs.css";
import "../styles/mf341.css";   // task #341: the page refinement (after mf.css and etfvs.css)
import "../styles/task355.css";   // task #355: the folded Show filters handle
import "../styles/task363.css";   // task #363: the folded Show filters fits its words
import "../styles/task374.css";   // task #374: the Ready list caption in line with Columns
import { ChartZoom } from "../components/ChartZoom";
/** Task #311 (developer file 21, fund page row 1): the formula is off the page; one plain sentence behind the (i). */
const VOL_TIP = "How much the NAV moves from day to day, shown as a yearly figure.";

/** Task #345 (23 Nov 2026, the team): on the list page "Fund industry trends" (it was a card under the categories) and "Import my funds" are the first two
 *  buttons, each with a gold edge and a crown; the Fund score screener card went too (the header's "Fund Screener" opens the same page). */
const GOLD_LEAD = (
  <>
    <Link className={buttonClass("secondary", "sm", "ph-lk ph-gold")} to="/funds/insights" title="Where the industry's money sits and moves, month by month: assets, net flows and folios by fund category."><Icon name="crown" className="ph-crown" />Fund industry trends <span aria-hidden="true">→</span></Link>
    <Link className={buttonClass("secondary", "sm", "ph-lk ph-gold")} to="/mf-portfolio?tab=import"><Icon name="crown" className="ph-crown" />Import my funds <span aria-hidden="true">→</span></Link>
  </>
);
const HEAD = (title: string, lead: string, stats?: PageHeaderProps["stats"], gold = false) => (
  <PageHeader wrap plan="free" title={title} description={lead} stats={stats} art="funds" links={[{ to: "/fund-score-screener", primary: true }, "/funds/compare", "/etfs"]}
    lead={gold ? GOLD_LEAD : undefined}
    actions={gold ? undefined : <Link className="btn" to="/mf-portfolio?tab=import">Import my funds <span aria-hidden="true">→</span></Link>} />
);
const Problem = ({ title, text, retry }: { title: string; text: string; retry?: () => void }) => (
  <div className="wrap state" role="alert"><h2>{title}</h2><p>{text}</p>{retry && <button className="btn" onClick={retry}>Try again</button>} <Link className="btn" to="/funds">Back to all schemes</Link></div>
);
/** Periods that live in the Risk area of a scheme's page only (never as list or compare columns). */
const OTHER_PERIODS: { k: "1m" | "6m" | "3y"; label: string }[] = [{ k: "1m", label: "1 month" }, { k: "6m", label: "6 months" }, { k: "3y", label: "3 years, per year" }];
const axisFmt = (v: number) => nf(v, Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 1 : 2);
const shortAmc = (a: string) => a.replace(/\s*mutual fund\s*$/i, "");

// ================================================================================================ list

/** How to read the category table: what each figure is, where it comes from, and the checklist's rules. */
/** Every active Growth fund on the page has NAV rows but no return at all: the long history has not been loaded yet (not "the funds are young"). */
function historyLoading(items: FundRow[]): boolean {
  const growth = items.filter((r) => r.active && r.optionClass === "Growth");
  return growth.length >= 5 && growth.every((r) => r.r1y == null && r.r3y == null && r.r5y == null && r.noReturns === "short");
}

/** Task #130 C-12: "How to read this table": the nine notes as nine short cards, each opening its full text with "Read more". */
function NoteCard({ title, short, children }: { title: string; short: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="mf-note-card">
      <h4>{title}</h4>
      <p>{short}</p>
      <details><summary>Read more</summary><div className="mf-note-full">{children}</div></details>
    </li>
  );
}

function Legend({ stopped, facts }: { stopped: number | null; facts?: { source?: string | null; excludedAmcs?: string[] | null } | null }) {
  return (
    <section className="mf-legend" aria-labelledby="mf-legend-h">
      <h2 id="mf-legend-h">How to read this table</h2>
      {/* task #341 (prompt section 15): the same nine cards and their full text, in three groups */}
      <div className="mf-note-groups">
        <section className="mf-note-group" aria-labelledby="mf-ng-1"><h3 className="mf-ng-h" id="mf-ng-1"><i aria-hidden="true">1</i>Understanding returns</h3>
        <ul className="mf-note-cards">
          <NoteCard title="Returns" short={<>1 year is the total change in NAV; 3 and 5 years are yearly rates. SIP returns assume the same amount invested at each month-end.</>}>
          <p><b>1 year</b> is the total change in NAV over the year; <b>3 years</b> and <b>5 years</b> are yearly rates (<GTerm id="cagr-compound-annual-growth-rate">CAGR</GTerm>), not totals.
            <b> SIP returns</b> are the yearly rate (XIRR) of putting the same amount in every month for the last 3 or 5 years: one instalment at the last NAV of each month, everything valued at the latest NAV. A scheme without a month-end NAV for every one of those months shows a dash.
            Returns are worked out for <GTerm id="growth-option">Growth</GTerm> options only (<GTerm id="idcw-income-distribution-cum-capital-withdrawal">IDCW</GTerm> payouts change the NAV). Compare <GTerm id="direct-plan">Direct</GTerm> with Direct and <GTerm id="regular-plan">Regular</GTerm> with Regular.</p>
        </NoteCard>
          <NoteCard title="Return and cost bands" short="The small word under a return or an expense ratio places it in a band. Compare a fund with its own category.">
          <p><b>Return and cost bands.</b> The small word under a return places it in a band: for 1 year, Negative, 0–8%, 8–15% or Above 15%; for 3 and 5 years (yearly rates), Below 8%, 8–12%, 12–15% or Above 15%. Under an expense ratio it says Low, Moderate or High against the median of the same category and plan (20% or more under or over it).
            These are screening bands, not performance standards: equity, debt and hybrid funds need different yardsticks, so compare a fund with its own category. Funds younger than the period show <b>Insufficient history</b> rather than being left out. A fund's benchmark return is not shown yet because AMFI does not put it in the NAV files.</p>
        </NoteCard>
          <NoteCard title="ELSS" short="ELSS units are locked in for three years. The 80C tax deduction applies under the old tax regime only.">
          <p>ELSS: up to ₹1.5 lakh a year put into ELSS can be deducted under Section 80C in the old tax regime; at the 30% slab plus 4% cess that saves up to ₹46,800 of tax. The new tax regime has no 80C deduction. ELSS units are locked in for three years.</p>
        </NoteCard>
        </ul></section>
        <section className="mf-note-group" aria-labelledby="mf-ng-2"><h3 className="mf-ng-h" id="mf-ng-2"><i aria-hidden="true">2</i>Understanding Mutual Fund Scores</h3>
        <ul className="mf-note-cards">
          <NoteCard title="Mutual Fund Score" short="The fund's score, 0 to 100, from its NAV history, costs and holdings. It describes the past; it is not a forecast.">
          <p><b>Mutual Fund Score</b> (Gold) rates each fund from 0 to 100, with its label. {MF_SCORE_COMPLIANCE} <Link to={MF_METHOD_URL}>What the score means</Link>.</p>
        </NoteCard>
          <NoteCard title="The 5-check checklist" short="Five plain checks against funds of the same category and plan. Each filled mark is one check passed.">
          <p>Five plain checks, each against the active Growth options of the same category and plan:</p>
          <ol>{CHECKS.map((c) => <li key={c.key}><b>{c.label}</b>: {c.rule}.</li>)}</ol>
          <p>“3/5” means three checks passed out of five that could be worked out. A check counts only when the scheme has the figure and at least 3 schemes of its category have it too. It sums up past figures; it is not a rating, a ranking or a recommendation, and no star ratings are shown. A dash (—) anywhere means no figure; hover or tap it for the reason.</p>
        </NoteCard>
          <NoteCard title="Fund size bands" short="Very large, Large, Medium, Small and Very small, by assets under management. Size is not a measure of quality.">
          <div className="mf-bands">
            <p>The word under the fund size is only a way to read scale: a very small fund can be young or niche, a very large one is harder to move quickly. Size is not a measure of quality.</p>
            <table><caption className="sr-only">Fund size bands in rupees crore</caption>
              <thead><tr><th scope="col">Fund size</th><th scope="col">Label</th></tr></thead>
              <tbody>{AUM_BUCKETS.map((b, i) => <tr key={b.label}><td>{b.range}</td><td><span className={"mf-size s" + (i + 1)}><i aria-hidden="true" />{b.label}</span></td></tr>)}</tbody></table>
          </div>
        </NoteCard>
        </ul></section>
        <section className="mf-note-group" aria-labelledby="mf-ng-3"><h3 className="mf-ng-h" id="mf-ng-3"><i aria-hidden="true">3</i>Fund data and methodology</h3>
        <ul className="mf-note-cards">
          <NoteCard title="Fund size and expense ratio" short="Fund size is assets under management from AMFI. Expense ratio is the plan's yearly cost from AMFI's TER file.">
          <p><b>Fund size</b> is AMFI's average assets under management for the latest quarter, all plans of the scheme together (where AMFI lists none, the fund house's month-end net assets; the tooltip says which). <b>Expense ratio</b> is the plan's own total expense ratio from AMFI's latest file, percent a year.</p>
        </NoteCard>
          <NoteCard title="Older schemes" short={stopped ? <>{stopped.toLocaleString("en-IN")} schemes on record have stopped publishing NAVs. They are listed too; choose Status “Still publishing” to leave them out.</> : <>Schemes that stopped publishing NAVs are listed too; choose Status “Still publishing” to leave them out.</>}>
          <p>A scheme that has stopped publishing NAVs (merged, wound up or closed) stays on record, and the list shows it with every other scheme, as no filter is chosen when the page opens. It carries a “Stopped publishing” tag and no returns, and with the list in fund size order it comes after the schemes still running. Choose Status “Still publishing” above the table to list only schemes still running, or “Stopped” to list only the others.</p>
        </NoteCard>
          <NoteCard title="Source" short="AMFI NAV and TER files. Some fund houses are not listed yet.">
          <p>Source: {facts?.source || "AMFI (Association of Mutual Funds in India), official NAV files"}; expense ratios from AMFI's TER file; fund size from AMFI's quarterly AUM report or the fund house's month-end portfolio file.</p>
          {facts?.excludedAmcs && facts.excludedAmcs.length > 0 && <p>Some fund houses are not listed here: {facts.excludedAmcs.join(", ")}.</p>}
        </NoteCard>
        </ul></section>
      </div>
    </section>
  );
}

/** Task #130 C-9: the dark bar under the table once a fund is ticked: the chosen names and "Compare N funds →" (2 to 4), which opens Fund compare. */
export function CompareBar({ tray, onClear, onOpen }: { tray: number[]; onClear: () => void; onOpen: () => void }) {
  if (!tray.length) return null;
  return (
    <div className="mf-cmpbar" role="region" aria-label="Funds chosen for comparison">
      <span className="mf-cmpbar-l">Compare</span>
      <ul className="mf-cmpbar-n">{tray.map((c) => <li key={c}>{trayName(c) ?? `Scheme ${c}`}</li>)}</ul>
      <span className="mf-cmpbar-sp" />
      {tray.length < 2 && <span className="mf-cmpbar-hint">Tick one more fund to compare.</span>}
      <button type="button" className="mf-cmpbar-clear" onClick={onClear}>Clear</button>
      <button type="button" className="btn primary mf-cmpbar-go" disabled={tray.length < 2} onClick={onOpen}>Compare {tray.length} fund{tray.length === 1 ? "" : "s"} →</button>
    </div>
  );
}

export function FundListPage() {
  const { toast, has } = useUI();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const q = useMemo(() => parseQuery(sp), [sp]);
  const canScore = has("gold");
  // with no chosen order: largest funds first. The server refuses the score order below Gold (an order would give the ranking away), so a shared link to it falls back to the same
  const eq = useMemo(() => { const e = effectiveQuery(q); return e.sort === "score" && !canScore ? { ...e, sort: "aum" as const, dir: "desc" as const } : e; }, [q, canScore]);
  const [text, setText] = useState(q.q);
  const [cols, setCols] = useState<ColId[]>(readCols);
  const [tray, toggle, clear] = useTray(true);
  const filt = useFundFilters();
  const subs = useMemo(() => (q.tab === "all" ? [] : subCats(filt.data?.categories, q.tab, q)), [filt.data, q]);
  const names = useMemo(() => (q.tab === "all" || q.cats === null ? null : filt.data ? catNames(filt.data.categories, q.tab, q.cats) : undefined), [filt.data, q.tab, q.cats]);
  const ready = q.view === "ready";
  const list = useFundList(eq, names, !ready);
  const year = (filt.data?.dataDate || list.data?.dataDate || new Date().toISOString()).slice(0, 4);
  const chosen = q.tab === "all" ? [] : (q.cats ?? []).map(keyLabel).sort((a, b) => a.localeCompare(b));
  const title = `${selectionTitle(q.tab, chosen, q.cats === null)} mutual funds ${year}`;
  // task #352 (team, 23 Nov 2026): the heading is just "Mutual Funds"; the browser tab title keeps the chosen categories and the year for search results
  useDocTitle(title, "Compare all mutual funds in the chosen categories based on latest returns, historic returns, SIP returns, latest NAV, checklist and more. Information only.");

  const set = (patch: Partial<ListQuery>) => setSp(queryToParams({ ...q, page: 1, ...patch }), { replace: !("page" in patch) });
  useEffect(() => { if (text.trim() === q.q) return; const t = window.setTimeout(() => set({ q: text.trim() }), 350); return () => window.clearTimeout(t); }, [text]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setText(q.q); }, [q.q]);
  const onSort = (s: SortKey) => set(eq.sort === s ? { sort: s, dir: eq.dir === "asc" ? "desc" : "asc" } : { sort: s, dir: s === "name" || s === "amc" || s === "category" ? "asc" : "desc" });
  // Task #130 C-9: up to 4 funds; a fifth replaces the oldest. The names on the compare bar come from the rows they were ticked on.
  const pick = (code: number, name?: string) => { if (name) rememberName(code, name); const replacing = tray.length >= TRAY_MAX && !tray.includes(code); toggle(code); if (replacing) toast(`Up to ${TRAY_MAX} funds at a time: the first one chosen was replaced.`); };
  // Task #130 C-4: "See these funds by Mutual Fund Score" switches the tab and sub-category below to that category, orders it by Mutual Fund Score and scrolls to the list.
  const showByScore = (c: { tab: ListQuery["tab"]; key: string }) => {
    set({ tab: c.tab, cats: [c.key], view: "", ...(canScore ? { sort: "score" as SortKey, dir: "desc" as const } : {}) });
    requestAnimationFrame(() => document.getElementById("mf-list")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const hot = useHotList(ready);
  // task #347: the filter panel's open or folded state, remembered in this browser; with nothing saved it starts open on a desktop and folded on a phone
  // (where it would sit above the list and push it down)
  const [fOpen, setFOpen] = useState(() => { let v: string | null = null; try { v = localStorage.getItem("finlit-mf-filters"); } catch { /* */ }
    return v ? v !== "closed" : !(typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches); });
  const setF = (v: boolean) => { setFOpen(v); try { localStorage.setItem("finlit-mf-filters", v ? "open" : "closed"); } catch { /* private window: not remembered */ } };
  const none = q.tab !== "all" && q.cats !== null && q.cats.length === 0;
  const d = ready || none ? undefined : list.data;
  const hotRows = useMemo(() => {
    const rows = hot.data?.items || [];
    if (!q.sort) return rows;
    const key = q.sort, sgn = q.dir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => { const x = rowSortValue(a, key), y = rowSortValue(b, key); return x == null ? 1 : y == null ? -1 : (x < y ? -1 : x > y ? 1 : 0) * sgn; });
  }, [hot.data, q.sort, q.dir]);
  const facts = (ready ? hot.data : d) || filt.data;
  const t = filt.data?.totals;

  return (
    <>
      {HEAD("Mutual Funds", "Funds in your chosen categories by returns, SIP returns, latest NAV, checklist and more.", [{ icon: "layers", value: t ? t.active.toLocaleString("en-IN") : null, label: "Active schemes" }, { icon: "line", value: t ? t.withHistory.toLocaleString("en-IN") : null, label: "With return history" }], true)}
      <div className="wrap mf mf-list">
        {/* Task #347 (23 Nov 2026, the team): the categories and the filters are one filter panel on the left of the table, "Hide filters" folds it to a
            narrow "Show filters" handle in the same place (never on the table), and it has the search box at the top. The choice is remembered here. */}
        <div className={"mf-layout" + (fOpen ? "" : " closed")}>
          <aside className="mf-side" aria-label="Filters">
            {fOpen ? (<>
              <div className="mf-side-h"><h2>Filters</h2><button type="button" className="btn mf-hidef" aria-expanded="true" aria-controls="mf-side-b" onClick={() => setF(false)}>Hide filters</button></div>
              <div id="mf-side-b" className="mf-side-b">
                <Controls part="search" q={q} text={text} onText={setText} set={set} filters={filt.data} loading={list.isFetching} />
        <CategoryPicker side q={q} subs={subs} loading={filt.isLoading} onTab={(tab) => set({ tab, cats: null, ...tabDefaults(tab) })} onCats={(cats) => set({ cats })}
          frequent={{ onPick: (c) => set(cardOn(q, c) ? { cats: null, view: "" } : { tab: c.tab, cats: [c.key], view: "" }), onScore: showByScore }} />{/* task #344: the six frequently visited categories in the box (was "Six categories most people start with"); task #340: pressed again clears */}
                <Controls part="rest" q={q} text={text} onText={setText} set={set} filters={filt.data} loading={list.isFetching} />
              </div></>)
              : <button type="button" className="mf-showf" aria-expanded="false" aria-controls="mf-side-b" onClick={() => setF(true)}><Icon name="panel" /><span>Show filters</span></button>}
          </aside>
          <div className="mf-main">
        <div className="mf-bar" id="mf-list">
          <div className="seg" role="group" aria-label="Which schemes to show">
            <button aria-pressed={!ready} onClick={() => set({ view: "" })}>Chosen categories</button>
            <button aria-pressed={ready} onClick={() => set({ view: "ready" })}>Ready list ({hot.data?.items.length ?? 100})</button>
          </div>
          <p className="mf-count" role="status" aria-live="polite">
            {ready ? (hot.data ? <>The <b>{hot.data.items.length}</b> schemes kept ready for instant opening, from every category.</> : "Loading…")
              : none ? "No category ticked."
                : d ? <>Showing <b>{d.total.toLocaleString("en-IN")}</b> scheme{d.total === 1 ? "" : "s"}{q.tab === "all" ? (q.plan === "" && q.option === "All" ? " · every plan and option" : "") : " in the chosen categories"}{d.total === 0 ? " (none match)" : ""}</> : "Loading schemes…"}
            {/* task #369: every scheme is listed on arrival; on "All funds" with no plan, option or status chosen the two parts add up to the total shown */}
            {!ready && d && t && q.tab === "all" && !q.status && d.total === t.schemes &&
              <span className="faint"> ({t.active.toLocaleString("en-IN")} still publishing a NAV, {(t.schemes - t.active).toLocaleString("en-IN")} stopped)</span>}
            {!ready && t && q.tab === "all" && q.status === "active" && <span className="faint"> · {(t.schemes - t.active).toLocaleString("en-IN")} schemes that stopped publishing are left out by the Status filter</span>}
            {facts?.dataDate && <span className="faint"> · NAVs up to {dateIN(facts.dataDate)}</span>}
          </p>
        </div>

        {ready ? (
          !hot.data ? <div className="card" aria-busy="true"><div className="skeleton" style={{ height: 420 }} /></div> : (
            <div className="card mf-tablecard">
              <div className="mf-tbar">{/* task #346: the Columns button inside the table, beside its enlarge button */}<ColumnPicker cols={cols} onChange={(c) => { setCols(c); writeCols(c); }} /></div>
              <p className="faint mf-fine mf-tbar-cap">{hot.data.basis}</p>{/* task #374: on the same line as Columns and the enlarge button */}
              <FundTable rows={hotRows} cols={cols} q={q} onSort={onSort} picked={tray} onPick={pick} />
              <CompareBar tray={tray} onClear={clear} onOpen={() => nav(compareUrl(tray))} />
            </div>)
        ) : none ? (
          <div className="pm-empty mf-empty"><b>Tick at least one category.</b><p>Use the tick boxes above, “Select All”, or one of the cards.</p>
            <button className="btn" onClick={() => set({ cats: null })}>Tick every {tabLabel(q.tab).toLowerCase()} category</button></div>
        ) : list.isError && !d ? <Problem title="The scheme list is unavailable right now" text="Please try again in a moment." retry={() => list.refetch()} /> : !d ? (
          <div className="card" aria-busy="true"><div className="skeleton" style={{ height: 420 }} /></div>
        ) : d.total === 0 ? (
          <div className="pm-empty mf-empty"><b>No schemes match.</b><p>Try fewer filters or a shorter search. Spaces and small typos do not matter.{q.tab !== "all" && " The search covers the chosen categories only."}</p>
            {q.tab !== "all" && q.q && <button className="btn primary" onClick={() => set({ tab: "all", cats: null, ...tabDefaults("all") })}>Search every category</button>}{" "}
            <button className="btn" onClick={() => { setText(""); setSp(new URLSearchParams(), { replace: true }); }}>Clear search and filters</button></div>
        ) : (
          <>
          <SummaryCards items={d.items} total={d.total} plan={q.plan} scope={q.tab === "all" ? "across all categories" : "in the chosen categories"} />
          {summarise(d.items).extrasLoading && <LoadingNotice />}
          {historyLoading(d.items) && <p className="mf-note" role="status"><Icon name="info" /><span><b>Return history is still loading.</b> None of the funds on this page has its 1, 3 or 5 year return yet because the NAV history from AMFI is loaded one fund house at a time. The figures appear as each house finishes; nothing here is missing for good.</span></p>}
          <SortPills q={eq} onSort={(sort, dir) => set({ sort: sort as SortKey, dir })} />
          <div className="card mf-tablecard">
            <div className="mf-tbar">{/* task #346: the Columns button inside the table, beside its enlarge button */}<ColumnPicker cols={cols} onChange={(c) => { setCols(c); writeCols(c); }} /></div>
            <FundTable rows={d.items} cols={cols} q={eq} onSort={onSort} picked={tray} onPick={pick} peers={d.peers} />
            <CompareBar tray={tray} onClear={clear} onOpen={() => nav(compareUrl(tray))} />
            <Pager q={q} pages={d.pages} total={d.total} onPage={(p) => { set({ page: p }); window.scrollTo({ top: 0 }); }} onSize={(n) => set({ size: n })} />
          </div>
          </>
        )}
          </div>
        </div>
        <PhoneFold page="funds" id="legend" title="How to read this table" line="What each column means and where the figures come from"><Legend stopped={t ? t.schemes - t.active : null} facts={facts} /></PhoneFold>
        <Foot facts={facts} />
      </div>


    </>
  );
}

// ================================================================================================ one scheme

function Risk({ d }: { d: FundDetail }) {
  const { vol1y, vol3y, maxDrawdown: m } = d.risk;
  return (
    <div className="card mf-card">
      <div className="card-h"><h3><span className="ci"><Icon name="gauge" /></span>Risk, from the NAV history</h3></div>
      <div className="mf-risk">
        <div><span className="label"><GTerm id="volatility">Volatility</GTerm> · 1 year<InfoTip text={VOL_TIP} /></span><b>{vol1y.value == null ? <Fig v={null} why={vol1y.why} /> : pctText(vol1y.value, 2, false)}</b>
          <p className="muted">{vol1y.value == null ? vol1y.why : "How much the NAV swings, as a yearly figure. A fund at 14% typically moves about 14% either side of its average yearly path; one at 1% barely moves. It says how bumpy the ride was, not which way the NAV went."}</p></div>
        <div><span className="label"><GTerm id="volatility">Volatility</GTerm> · 3 years<InfoTip text={VOL_TIP} /></span><b>{vol3y.value == null ? <Fig v={null} why={vol3y.why} /> : pctText(vol3y.value, 2, false)}</b>
          <p className="muted">{vol3y.value == null ? vol3y.why : "The same measure over three years, so one calm or wild year counts for less."}</p></div>
        <div><span className="label"><GTerm id="drawdown">Largest fall</GTerm> (maximum drawdown)</span><b>{m.value == null ? <Fig v={null} why={m.why} /> : <span className={tone(m.value)}>{pctText(m.value, 2, false)}</span>}</b>
          <p className="muted">{m.value == null ? m.why : m.peak && m.trough && m.value < 0 ? `The deepest fall from a NAV high (${dateIN(m.peak)}) to a later low (${dateIN(m.trough)}) since ${dateIN(m.since || m.peak)}. It shows how deep the worst stretch was, not what comes next.` : "The NAV never fell below an earlier high in the history on file."}</p></div>
      </div>
      <h4 className="mf-h4">Other periods</h4>
      <ul className="mf-other">{OTHER_PERIODS.map(({ k, label }) => { const r = d.returns[k]; return (
        <li key={k}><span>{label}</span><b><Fig v={r.value} why={r.why} /></b><small className="muted">{r.value == null ? r.why : r.kind === "cagr" ? "per year" : "total change"}</small></li>); })}</ul>
    </div>
  );
}

// AMFI's NAV history starts on 1 April 2006 (task #162 keeps all of it): a series that starts later began with the fund's launch; one that starts then
// only reaches back as far as AMFI's file, so "since launch" would not be true.
export const maxLabel = (first?: string) => (first && first > "2006-04-15" ? "Since launch" : "Since 2006");

function NavChart({ d }: { d: FundDetail }) {
  const keys = (["1M", "6M", "1Y", "3Y", "5Y", "10Y", "MAX"] as RangeKey[]).filter((k) => d.series[k]);
  const [range, setRange] = useState<RangeKey>(keys.includes("1Y") ? "1Y" : keys[keys.length - 1]);
  if (!keys.length) return <div className="card mf-card"><div className="card-h"><h3><span className="ci"><Icon name="line" /></span>NAV chart</h3></div><p className="muted mf-pad">{d.returnsNote || d.history.note || "No NAV history is loaded for this scheme yet."}</p></div>;
  const p = d.series[keys.includes(range) ? range : keys[0]]!;
  const change = (p.v[p.v.length - 1] / p.v[0] - 1) * 100;
  return (
    <div className="card mf-card">
      <ChartZoom label="NAV chart" className="cz-r">
      <div className="card-h"><h3><span className="ci"><Icon name="line" /></span>NAV chart</h3>
        <div className="seg" role="group" aria-label="Chart range">{keys.map((k) => <button key={k} aria-pressed={k === range} onClick={() => setRange(k)}>{k === "MAX" ? maxLabel(d.series.MAX?.t[0]) : k}</button>)}</div></div>
      <FundChart series={[{ key: String(d.code), label: d.name, t: p.t, v: p.v }]} format={axisFmt} label={`NAV of ${d.name}, ${range === "MAX" ? "since the first NAV on file" : "last " + range}`} />
      <p className="faint mf-fine">Total change over this range: <b className={tone(change)}>{pctText(change)}</b> (NAV of {dateIN(p.t[0])} to NAV of {dateIN(p.t[p.t.length - 1])}).
        The chart shows NAV in rupees; the line is thinned to at most a few hundred points for long periods.</p>
      </ChartZoom>
    </div>
  );
}

export function FundDetailPage() {
  const { id = "" } = useParams();
  const code = /^\d{1,7}$/.test(id) ? Number(id) : 0;
  const { data: d, isLoading, error, refetch } = useFundDetail(code);
  const nav = useNavigate();
  const { toast } = useUI();
  const [tray, toggle] = useTray();
  const facts = useFundFacts(code), portfolio = useFundPortfolio(code);
  useDocTitle(d ? d.name : "Mutual fund", d ? `${d.name}: NAV, returns and risk from AMFI data. Information only.` : undefined);
  useEffect(() => { if (d?.code) visits.add({ k: "mf", id: String(d.code), name: d.name.replace(/\s*[-–(]\s*(direct|regular)\b.*$/i, ""), sub: d.amc }); }, [d?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!code || (error && (error as { status?: number }).status === 404)) return <><div className="wrap state" role="alert"><h2>We could not find this scheme</h2><p>No mutual fund scheme has the code “{id}”.</p><Link className="btn primary" to="/funds">Search all schemes</Link></div></>;
  if (error && !d) return <Problem title="This scheme is unavailable right now" text="Please try again in a moment." retry={() => refetch()} />;
  if (isLoading || !d) return <div className="wrap mf" aria-busy="true"><div className="skeleton" style={{ height: 140, marginTop: 28 }} /><div className="skeleton" style={{ height: 320, marginTop: 16 }} /></div>;

  const inTray = tray.includes(d.code);
  const ch = d.change;
  return (
    <div className="wrap mf mf-detail">
      <p className="mf-back"><Link to="/funds">← All mutual fund schemes</Link></p>
      <header className="mf-head">
        <div>
          <span className="eyebrow">{d.categoryGroup}</span>
          <h1 className="ui-title">{d.name}</h1>
          <ul className="mf-chips" aria-label="About this scheme">
            <li><Link className="chip gold" to={`/funds?amc=${encodeURIComponent(d.amc)}`}>{d.amc}</Link></li>
            <li><Link className="chip ghost" to={`/funds?category=${encodeURIComponent(d.category)}`}>{categoryShort(d.category)}</Link></li>
            <li><GTerm box="chip ghost" id={d.plan === "Regular" ? "regular-plan" : "direct-plan"}>{d.plan === "Unspecified" ? planLabel(d.plan, d.category) : d.plan + " plan"}</GTerm></li>
            <li><GTerm box="chip ghost" id={d.optionClass === "IDCW" ? "idcw-income-distribution-cum-capital-withdrawal" : "growth-option"}>{d.option}</GTerm></li>
            <li><GTerm box="chip ghost" id="open-ended-and-closed-ended-funds">{d.schemeType}</GTerm></li>
          </ul>
          <p className="faint mf-ids">{d.isin ? <><GTerm id="isin">ISIN</GTerm> {d.isin} · </> : null}AMFI scheme code {d.code}{d.isinReinvest ? <> · reinvestment ISIN {d.isinReinvest}</> : null}</p>
        </div>
        <div className="mf-navbox card">
          <span className="label"><GTerm id="net-asset-value-nav">NAV</GTerm> · {d.navDate ? dateIN(d.navDate) : "no date"}</span>
          <b className="mf-nav" title={navFull(d.nav)}>{navText(d.nav)}</b>
          {ch ? <span className={"mf-chg " + tone(ch.pct)}>{ch.abs > 0 ? "+" : ch.abs < 0 ? "−" : ""}₹{nf(Math.abs(ch.abs), 4)} ({pctText(ch.pct)}) <small className="muted">vs NAV of {ch.since ? dateIN(ch.since) : "the previous day"}</small></span>
            : <span className="muted">Previous NAV not on file yet, so no day change is shown.</span>}
          <div className="mf-acts">
            <button className={"btn" + (inTray ? " on" : "")} aria-pressed={inTray} onClick={() => { if (!toggle(d.code)) toast(`You can compare up to ${TRAY_MAX} schemes at a time.`); }}><Icon name="compare" />{inTray ? "Chosen to compare" : "Add to compare"}</button>
            {tray.length >= 2 && <button className="btn primary" onClick={() => nav(compareUrl(tray))}>Compare {tray.length}</button>}
          </div>
        </div>
      </header>
      <FundGlance d={d} facts={facts.data} factsLoading={facts.isLoading} />
      <FundSectionNav present={["fd-returns", "fd-score", "fd-chart", "fd-facts", "fd-risk", "fd-holdings", ...(d.family.length ? ["fd-plans"] : []), "fd-about"]} />

      {!d.active && <p className="mf-note warn" role="note"><Icon name="alert" /><span>This scheme has stopped publishing NAVs{d.navDate ? `; its last NAV is dated ${dateIN(d.navDate)}` : ""}. Matured, merged and closed schemes stay in AMFI's file.</span></p>}
      {d.history.source === "mirror" && <p className="mf-note" role="note"><Icon name="info" /><span>{d.history.note}. AMFI's own history for this scheme is not loaded yet; the mirror's newest NAV was checked against AMFI's.</span></p>}

      {d.optionClass !== "Growth" && (() => {
        const g = d.family.find((f) => f.optionClass === "Growth" && f.plan === d.plan && f.active) || d.family.find((f) => f.optionClass === "Growth" && f.active);
        return g ? <p className="mf-note" role="note"><Icon name="info" /><span>Returns are shown for the Growth option of this fund: <Link to={`/funds/${g.code}`}>{g.name}</Link>.</span></p> : null;
      })()}
      <div id="fd-returns" className="fd-anchor"><ReturnsBlock d={d} /></div>
      <div id="fd-score" className="fd-anchor"><FundScoreCard code={d.code} /></div>
      <div id="fd-chart" className="fd-anchor"><NavChart key={d.code} d={d} /></div>
      <div className="mf-grid">
        <div id="fd-facts" className="fd-anchor"><FactsCard facts={facts.data} loading={facts.isLoading} failed={facts.isError} /></div>
        <div id="fd-risk" className="fd-anchor"><Risk d={d} /></div>
      </div>
      <div id="fd-holdings" className="fd-anchor"><HoldingsSection portfolio={portfolio.data} title="What it invests in" unit="fund" layout="bars" fundPage /></div>

      {d.family.length > 0 && (
        <div className="card mf-card fd-anchor" id="fd-plans">
          <div className="card-h"><h3><span className="ci"><Icon name="layers" /></span>Other plans and options of this fund</h3></div>
          <div className="tw"><table className="mf-fam">
            <thead><tr><th scope="col">Plan and option</th><th scope="col">NAV</th><th scope="col">NAV date</th><th scope="col"><span className="sr-only">Compare</span></th></tr></thead>
            <tbody>{d.family.map((f) => (
              <tr key={f.code}>
                <th scope="row"><Link to={`/funds/${f.code}`}>{f.name}</Link><small><PlanChip plan={f.plan} option={f.option} category={d.category} />{!f.active && <span className="chip ghost">Stopped publishing</span>}</small></th>
                <td className="num">{navText(f.nav)}</td><td className="num">{f.navDate ? dateIN(f.navDate) : "—"}</td>
                <td className="num"><Link className="mf-linkbtn" to={compareUrl([d.code, f.code])}>Compare with this</Link></td>
              </tr>))}</tbody>
          </table></div>
          <p className="faint mf-fine">Plans of one fund hold the same investments but charge different costs, so their NAVs and returns differ. Compare Direct with Direct and Regular with Regular.</p>
        </div>)}

      <div className="mf-grid">
        <div className="card mf-card fd-anchor" id="fd-about">
          <div className="card-h"><h3><span className="ci"><Icon name="notes" /></span>About the data</h3></div>
          <ul className="mf-facts">
            <li><span>NAV history on file</span><b>{d.history.points ? `${d.history.points.toLocaleString("en-IN")} daily NAVs, ${dateIN(d.history.from!)} to ${dateIN(d.history.to!)}` : "None yet"}</b></li>
            <li><span>History source</span><b>{d.history.source === "amfi" ? "AMFI's official NAV history" : d.history.source === "mirror" ? "Third-party mirror of AMFI data (api.mfapi.in)" : "—"}</b></li>
            <li><span>Latest NAV source</span><b>AMFI NAVAll file</b></li>
          </ul>
        </div>
      </div>
      <Foot facts={d} history={d.history} />
    </div>
  );
}

// ================================================================================================ compare

const RANGE_BUTTONS: RangeKey[] = ["1M", "6M", "1Y", "3Y", "5Y", "10Y", "MAX"];

function Picker({ ids, onAdd }: { ids: number[]; onAdd: (code: number) => void }) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setDebounced(text.trim()), 300); return () => window.clearTimeout(t); }, [text]);
  const res = useFundList({ ...EMPTY_QUERY, q: debounced.length >= 2 ? debounced : "", size: 25, option: "Growth", status: "active" });   // the compare picker: Growth options still publishing, as before
  const show = debounced.length >= 2 ? (res.data?.items || []) : [];
  return (
    <div className="mf-picker">
      <label className="mf-search"><Icon name="search" /><span className="sr-only">Find a scheme to add</span>
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a scheme: type its name, e.g. axis large cap direct" autoComplete="off" disabled={ids.length >= TRAY_MAX} /></label>
      {ids.length >= TRAY_MAX && <p className="faint">You are comparing the most schemes this page can show ({TRAY_MAX}). Remove one to add another.</p>}
      {show.length > 0 && (
        <ul className="mf-results" aria-label="Matching schemes">{show.map((r) => (
          <li key={r.code}><span><b>{r.name}</b><small>{shortAmc(r.amc)} · <PlanChip plan={r.plan} option={r.option} category={r.category} /></small></span>
            <button className="btn" disabled={ids.includes(r.code)} onClick={() => { onAdd(r.code); setText(""); }}>{ids.includes(r.code) ? "Added" : "Add"}</button></li>))}</ul>)}
      {debounced.length >= 2 && !res.isFetching && !show.length && <p className="muted">No Growth-option scheme matches “{debounced}”. Returns are compared for Growth options.</p>}
    </div>
  );
}

/** Task #281: an IDCW option compared shows its same-plan Growth option's return, labelled as that option's (before payouts), never as its own. */
function GrowthFig({ f, k }: { f: CompareFund; k: "r1y" | "r5y" }) {
  const g = f.growthReturns;
  if (!g || g[k] == null) return null;
  return <span className="mf-grf" title={`${GROWTH_RETURNS_LABEL}: ${g.name} (${f.plan}, Growth). This option's own NAV change is not shown because payouts would make it wrong.`}>
    <Fig v={g[k]} d={2} /><small className="mf-gr">{GROWTH_RETURNS_LABEL}</small></span>;
}

function CompareTable({ funds }: { funds: CompareFund[] }) {
  const notes: string[] = [];
  const mark = (why: string | null | undefined, who: string) => { if (!why) return null; const text = `${who}: ${why}`; let i = notes.indexOf(text); if (i < 0) { notes.push(text); i = notes.length - 1; } return String.fromCharCode(97 + (i % 26)); };
  const val = (v: number | null, why: string | null, who: string, o: { d?: number; plain?: boolean; plus?: boolean } = {}) => {
    if (v != null) return <Fig v={v} d={o.d ?? 2} plain={o.plain} plus={o.plus} />;
    const m = mark(why, who);
    return <span className="mf-na" aria-label={`No figure. ${why || ""}`}>—{m && <sup>{m}</sup>}</span>;
  };
  const rows: { label: React.ReactNode; cell: (f: CompareFund) => React.ReactNode; head?: boolean }[] = [
    { label: "Fund house", cell: (f) => shortAmc(f.amc) }, { label: "Category", cell: (f) => categoryShort(f.category) },
    { label: "Plan and option", cell: (f) => <PlanChip plan={f.plan} option={f.option} category={f.category} /> },
    { label: <GTerm id="net-asset-value-nav">Latest NAV</GTerm>, cell: (f) => <>{navText(f.nav)}<small className="muted"> {f.navDate ? dateIN(f.navDate, { day: "numeric", month: "short" }) : ""}</small></> },
    { label: "Returns", head: true, cell: () => null },
    { label: RETURN_LABELS.d1, cell: (f) => val(f.change?.pct ?? null, f.active ? "The previous NAV is not on file yet." : "Stopped publishing NAVs.", shortName(f) + ", 1 day") },
    { label: RETURN_LABELS.y1, cell: (f) => f.returns["1y"].value == null && growthFigure(f, "r1y") != null ? <GrowthFig f={f} k="r1y" /> : val(f.returns["1y"].value, f.returns["1y"].why, shortName(f) + ", 1 year") },
    { label: RETURN_LABELS.y5, cell: (f) => f.returns["5y"].value == null && growthFigure(f, "r5y") != null ? <GrowthFig f={f} k="r5y" /> : val(f.returns["5y"].value, f.returns["5y"].why, shortName(f) + ", 5 year") },
    { label: "Risk", head: true, cell: () => null },
    { label: <><GTerm id="volatility">Volatility</GTerm> 1 year</>, cell: (f) => val(f.risk.vol1y.value, f.risk.vol1y.why, shortName(f) + ", volatility 1 year", { plain: true, plus: false }) },
    { label: <><GTerm id="volatility">Volatility</GTerm> 3 years</>, cell: (f) => val(f.risk.vol3y.value, f.risk.vol3y.why, shortName(f) + ", volatility 3 years", { plain: true, plus: false }) },
    { label: <><GTerm id="drawdown">Largest fall</GTerm></>, cell: (f) => val(f.risk.maxDrawdown.value, f.risk.maxDrawdown.why, shortName(f) + ", largest fall", { plus: false }) },
    { label: "NAV history", cell: (f) => (f.history.source === "amfi" ? "AMFI" : f.history.source === "mirror" ? "Mirror of AMFI data" : "Not loaded") },
  ];
  const body = rows.map((r, i) => r.head ? <tr key={i} className="mf-grp"><th scope="colgroup" colSpan={funds.length + 1}>{r.label}</th></tr>
    : <tr key={i}><th scope="row">{r.label}</th>{funds.map((f) => <td key={f.code}>{r.cell(f)}</td>)}</tr>);
  return (
    <>
      <div className="tw"><table className="mf-cmp">
        <caption className="sr-only">Side-by-side comparison of the chosen schemes</caption>
        <thead><tr><th scope="col"><span className="sr-only">Measure</span></th>{funds.map((f, i) => (
          <th scope="col" key={f.code}><i className="mf-sw" style={{ borderColor: SERIES_STYLE[i].color, borderTopStyle: i === 0 ? "solid" : i === 1 ? "dashed" : "dotted" }} aria-hidden="true" /><Link to={`/funds/${f.code}`}>{f.name}</Link></th>))}</tr></thead>
        <tbody>{body}</tbody>
      </table></div>
      <ScoreCompare codes={funds.map((f) => f.code)} names={funds.map(shortName)} />
      {notes.length > 0 && <ol className="mf-notes faint" aria-label="Why some figures are blank">{notes.map((n, i) => <li key={i} value={i + 1}><sup>{String.fromCharCode(97 + (i % 26))}</sup> {n}</li>)}</ol>}
    </>
  );
}
const shortName = (f: CompareFund) => (f.name.length > 40 ? f.name.slice(0, 38) + "…" : f.name);

/** /funds/compare: the head-to-head Fund Compare by default; the 2 to 4 scheme compare when the address has ?ids= (also empty, from its link). */
export function FundComparePage() {
  const [sp] = useSearchParams();
  return sp.has("ids") ? <FundMultiCompare /> : <FundHeadToHead />;
}

function FundMultiCompare() {
  useDocTitle("Compare mutual funds", "Put 2 to 4 mutual fund schemes side by side: NAV, returns, risk and a rebased NAV chart. Information only.");
  const { toast } = useUI();
  const [sp, setSp] = useSearchParams();
  const ids = useMemo(() => parseIds(sp.get("ids")), [sp]);
  const rangeParam = sp.get("range");
  const range: RangeKey = RANGE_BUTTONS.includes(rangeParam as RangeKey) ? (rangeParam as RangeKey) : "1Y";
  const [tray] = useTray();
  const { data, error, isFetching, refetch } = useFundCompare(ids, range);
  const put = (next: number[], r: RangeKey = range) => setSp((() => { const p = new URLSearchParams(); p.set("ids", next.join(",")); if (r !== "1Y") p.set("range", r); return p; })(), { replace: true });

  return (
    <>
      {HEAD("Mutual funds, side by side.", "Put two to four schemes next to each other: NAV, returns, risk and a chart that starts every fund at 100. Information only.")}
      <div className="wrap mf">
        <div className="card mf-card mf-setup">
          <div className="card-h"><h3><span className="ci"><Icon name="layers" /></span>Schemes to compare</h3>
            {ids.length >= 2 && <button className="btn" onClick={() => { navigator.clipboard?.writeText(location.href).then(() => toast("Link to this comparison copied."), () => toast(location.href)); }}><Icon name="spark" />Copy link</button>}</div>
          {ids.length > 0 && (
            <ul className="mf-chosen" aria-label="Chosen schemes">{ids.map((c, i) => { const f = data?.funds.find((x) => x.code === c); return (
              <li key={c}><i className="mf-sw" style={{ borderColor: SERIES_STYLE[i].color, borderTopStyle: i === 0 ? "solid" : i === 1 ? "dashed" : "dotted" }} aria-hidden="true" /><span>{f ? f.name : `Scheme ${c}`}</span>
                <button className="mf-x" aria-label={`Remove ${f ? f.name : c}`} onClick={() => put(ids.filter((x) => x !== c))}>×</button></li>); })}</ul>)}
          <Picker ids={ids} onAdd={(c) => put([...ids, c])} />
          {ids.length < 2 && (
            <div className="pm-empty mf-empty"><b>Choose at least two schemes.</b>
              <p>Search above, or tick “compare” boxes on the <Link to="/funds">scheme list</Link> and press Compare.</p>
              {tray.length >= 2 && <button className="btn primary" onClick={() => put(tray)}>Compare the {tray.length} you chose in the list</button>}
              <p><Link to="/funds/compare">Or compare two funds of one category head to head</Link>: returns, risk, consistency and costs, against the category average.</p></div>)}
        </div>

        {ids.length >= 2 && error && !data && <Problem title="This comparison is unavailable right now" text={(error as { status?: number }).status === 404 ? "One of these schemes could not be found." : "Please try again in a moment."} retry={() => refetch()} />}
        {ids.length >= 2 && !data && !error && <div className="card" aria-busy="true"><div className="skeleton" style={{ height: 360 }} /></div>}
        {ids.length >= 2 && data && (
          <>
            <div className="card mf-card" aria-busy={isFetching}>
              <ChartZoom label="NAV, every scheme starting at 100" className="cz-r">
              <div className="card-h"><h3><span className="ci"><Icon name="line" /></span>NAV, every scheme starting at 100</h3>
                <div className="seg" role="group" aria-label="Chart range">{RANGE_BUTTONS.map((k) => <button key={k} aria-pressed={k === range} onClick={() => put(ids, k)}>{k === "MAX" ? "Max" : k}</button>)}</div></div>
              {data.chart ? (
                <>
                  <FundChart base={100} format={(v) => nf(v, 1)} label={`NAV of the chosen schemes, rebased to 100 on ${dateIN(data.chart.from)}`}
                    series={data.chart.series.map((s) => ({ key: String(s.code), label: shortName(data.funds.find((f) => f.code === s.code)!), t: s.t, v: s.v }))} />
                  <p className="faint mf-fine">Each line starts at 100 on {dateIN(data.chart.from)} (the latest start date among the schemes for this range) and follows that scheme's NAV. It is a picture of past NAVs, not a forecast.</p>
                </>) : <p className="muted mf-pad">{data.chartNote}</p>}
              </ChartZoom>
            </div>
            <div className="card mf-card"><div className="card-h"><h3><span className="ci"><Icon name="table" /></span>The numbers</h3></div><CompareTable funds={data.funds} />
              <p className="faint mf-fine">1 year is the total change in NAV over the year; 5 year is a yearly rate (CAGR), not the five-year total. Only Growth options have returns, because payouts change the NAV of IDCW options. Different plans of one fund differ only by cost. Fund size, costs and holdings are on each scheme's own page.</p></div>
            {data.funds.some((f) => f.history.source === "mirror") && <p className="mf-note" role="note"><Icon name="info" /><span>Some NAV history here comes from a third-party mirror of AMFI data (api.mfapi.in), after its newest NAV was checked against AMFI's.</span></p>}
            <Foot facts={data} history={data.funds.find((f) => f.history.source === "mirror")?.history} />
          </>)}
        {ids.length < 2 && <Foot facts={null} />}
      </div>
    </>
  );
}
