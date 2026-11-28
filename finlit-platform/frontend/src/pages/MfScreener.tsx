// /funds/screener: the Mutual Fund Screener. A left panel of filters (a bottom sheet on narrow screens), preset screens, the active filters as removable chips,
// a sort menu, two small graphics and a table. Every count comes from the server in one call (/api/mf/filters?screen=1); the list is /api/mf?extra=true.
// Information only: figures describe past data, nothing here says what to do. Plan: free.
// Task #131 (the team's 14 Nov design): presets in one row (the one on is dark), a Sort button with a short menu, (the default view chips were removed by task #369: the page opens with no filter),
// Result at a glance open on arrival with a Hide button, a Mutual Fund Score column (Gold, no Gold tag on the sort), tick boxes to compare up to 4 with the
// compare bar under the table, and on a phone the filter panel in place with its groups behind one button.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { buttonClass } from "../components/ui/Button";
import { SortMenu, Toolbar } from "../components/screener/PageParts";
import { Icon } from "../lib/icons";
import { nf, dateIN } from "../lib/format";
import { loadUi, saveUi, isBool } from "../lib/persist";
import { DISCLAIMER, compareToast, compareUrl, useTray } from "../lib/mf";
import { useScores } from "../lib/mfScore";
import { DEMO } from "../lib/demo";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import {
  DEFAULTS, PAGE_SIZE, PRESETS, PRESET_GROUPS, chipsFor, isDefault, loadSaved, parseQuery, presetOn, queryToParams, statusSplit, storeSaved, useScreenFacets, useScreenList, type Saved, type SQ,
} from "../lib/mfScreen";
import { SORTS } from "../lib/mfScreenDefs";
import "../styles/task356.css";   // task #356: the preset rows
import { FlowBars, RiskReturn } from "../mf/screen/Graphics";
import { Panel } from "../mf/screen/Panel";
import "../styles/task357.css";   // task #357: hidden filters, the vertical Show filters (its rules start at .mfs-page, so load order does not matter)
import "../styles/task363.css";   // task #363: the folded Show filters fits its words
import { ResultTable } from "../mf/screen/Results";
import "../styles/fgx.css";
import "../styles/mf.css";
import "../styles/mfscreen.css";
import "../styles/task354.css";   // task #354: the Hide filters outline
import "../styles/task373.css";   // task #373: the disclaimer drop-down under the table
import "../styles/tools.css";
import { SIDE, SplitDivider, useSideWidth } from "../components/SplitDivider";

const NARROW = "(max-width: 900px)";
const narrow = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(NARROW).matches;
/** Whether the page is at phone or small-tablet width, kept up to date (the filter panel then sits in place with its groups folded). */
function useNarrow(): boolean {
  const [n, setN] = useState(narrow);
  useEffect(() => { const m = window.matchMedia?.(NARROW); if (!m) return; const f = () => setN(m.matches); f(); m.addEventListener?.("change", f); return () => m.removeEventListener?.("change", f); }, []);
  return n;
}
/** Task #350: Fund Compare as the screener's premium action: FinLit Gold treatment with a crown, first in the header row; same destination as before. */
const COMPARE_GOLD = <Link className={buttonClass("secondary", "sm", "ph-lk ph-gold")} to="/funds/compare" title="Compare up to four funds side by side"><Icon name="crown" className="ph-crown" />Fund Compare <span aria-hidden="true">→</span></Link>;

export function MfScreenerPage() {
  const { has, toast } = useUI();
  const nav = useNavigate();
  const small = useNarrow();
  const gold = has("gold");
  const [sp, setSp] = useSearchParams();
  const q = useMemo(() => parseQuery(sp), [sp]);
  const list = useScreenList(q), facets = useScreenFacets(q);
  const fac = facets.data?.screen;
  const [text, setText] = useState(q.q);
  const [panelOpen, setPanelOpen] = useState(() => loadUi("mfscreen.panel", 1, isBool, true)), [glance, setGlance] = useState(true);   // Result at a glance is open on arrival (task #131)
  const [saved, setSaved] = useState<Saved[]>(loadSaved);
  const [tray, toggleTray, clearTray] = useTray();
  const rows = list.data?.items ?? [];
  const scores = useScores(rows.map((r) => r.code), gold);
  const scoreMap = useMemo(() => new Map((scores.data?.items ?? []).filter((s) => s.code != null).map((s) => [s.code as number, s])), [scores.data]);
  const [names, setNames] = useState<Record<number, string>>({});
  // task #452: ticking or unticking a fund (or × on its chip) says so in a small message that goes by itself (the app's toast, read out politely)
  const pick = (code: number) => {
    // task #452: the plan and option name a fund apart from its siblings (a fund's Direct, Regular, Growth and IDCW rows share one name), in the
    // message and on its chip in the compare bar
    const r = rows.find((x) => x.code === code);
    const kind = r ? [r.plan !== "Unspecified" && r.plan, r.option].filter(Boolean).join(", ") : "";
    const label = r ? (kind ? `${r.name} (${kind})` : r.name) : names[code];
    if (r) setNames((m) => ({ ...m, [code]: label ?? r.name }));
    const had = tray.includes(code);
    if (!toggleTray(code)) { toast("You can compare up to 4 funds at a time."); return; }
    toast(compareToast(!had, label, had ? tray.length - 1 : tray.length + 1));
  };
  const total = list.data?.total ?? 0, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const title = "Mutual Fund Screener";
  useDocTitle(title, "Screen every Indian mutual fund and ETF by type, category, fund house, plan, size, returns, cost, risk, portfolio and what its category is doing. Free. Information only.");

  const set = (fn: (s: SQ) => SQ) => setSp(queryToParams(fn(q)), { replace: true });
  const go = (patch: Partial<SQ>) => setSp(queryToParams({ ...q, ...patch }), { replace: !("page" in patch) });
  useEffect(() => { if (text.trim() === q.q) return; const t = window.setTimeout(() => set((s) => ({ ...s, q: text.trim(), page: 1 })), 350); return () => window.clearTimeout(t); }, [text]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setText(q.q); }, [q.q]);

  const subLabel = (k: string) => fac?.subs.find((s) => s.key === k)?.label ?? k.replace(/-/g, " ");
  const tagLabel = (k: string) => fac?.tags.find((t) => t.tag === k)?.label ?? k;
  const chips = chipsFor(q, subLabel, tagLabel);
  const shown = chips.length;
  const sortVal = `${q.sort}:${q.dir}`;
  const split = statusSplit(q, fac?.status, total);
  const onSort = (key: string) => go({ sort: key, dir: q.sort === key ? (q.dir === "asc" ? "desc" : "asc") : (key === "name" || key === "ter" || key === "fall" || key === "rank3y" || key === "gap" || key === "worst" || key === "negshare" || key === "downdev" ? "asc" : "desc"), page: 1 });
  const showPanel = () => { setPanelOpen(true); saveUi("mfscreen.panel", 1, true); };
  // Task #140 (team note): the advanced screeners' sliding bar between the filters and the results: drag to resize, drag far left or double-click to hide.
  const [sideW, setSideW] = useSideWidth("mfscreen");
  const resizePanel = (w: number, snap = false) => { if (w < (snap ? SIDE.min / 2 : 1)) { setPanelOpen(false); saveUi("mfscreen.panel", 1, false); return; } setSideW(w); };
  const shut = !panelOpen && !small;
  const togglePanel = () => { setPanelOpen(!panelOpen); saveUi("mfscreen.panel", 1, !panelOpen); };
  const reset = () => setSp(new URLSearchParams(), { replace: true });
  const saveScreen = () => {
    const name = window.prompt("Name this screen (kept in this browser only)", "")?.trim().slice(0, 40);
    if (!name) return;
    const next = [{ name, query: queryToParams(q).toString() }, ...saved.filter((s) => s.name !== name)].slice(0, 8);
    setSaved(next); storeSaved(next);
  };
  const dropSaved = (name: string) => { const next = saved.filter((s) => s.name !== name); setSaved(next); storeSaved(next); };
  const sorts = SORTS.filter((s) => !s.gold || gold);   // Mutual Fund Score sort: Gold (the founder kept the plan), with no Gold tag (task #131)
  const noMatch = !list.isLoading && !list.isError && total === 0;
  const loadingNow = list.isFetching || facets.isFetching;
  const where = fac && fac.built.rows > 0 ? fac.built : null;

  return (
    <div className="wrap mf mfs-page">
      <PageHeader plan="free" title={title} art="funds" links={["/funds", "/fund-score-screener", "/funds/insights"]} learn={false} lead={COMPARE_GOLD}
        description="Filter every mutual fund and ETF by category, fund house, size, returns, cost, risk and portfolio."
        stats={[{ icon: "layers", value: list.data ? nf(total, 0) : null, label: "Funds match" }, { icon: "calendar", value: list.data?.dataDate ? dateIN(list.data.dataDate, { day: "numeric", month: "short", year: "numeric" }) : null, label: "NAV data date" }]} />

      {DEMO && <p className="mfs-demo" role="note"><Icon name="info" /> Preview build: the real AMFI NAVs and returns of 67 schemes are shown, but expense ratio, fund size, SIP, risk, portfolio and category figures here are sample values for layout only.</p>}
      {/* Task #356 (team, 23 Nov 2026): the presets in labelled rows (Equity, Debt, Index and themes, Hybrid, Mutual Fund Score), the note on the heading's line. */}
      <section className="mfs-presets" aria-labelledby="mfs-pl">
        <div className="mfs-phead"><span className="mfs-pl" id="mfs-pl">Preset screens</span>
          <p className="mfs-pnote">Presets are plain starting points: they set filters you can change. They describe past figures and do not recommend any fund.</p></div>
        <div className="mfs-pgroups">
          {PRESET_GROUPS.map((g) => (
            <div key={g.id} className="mfs-pgrp" role="group" aria-labelledby={`mfs-pg-${g.id}`}>
              <span className="mfs-pg" id={`mfs-pg-${g.id}`}>{g.label}</span>
              <div className="mfs-prow">
                {g.ids.map((id) => PRESETS.find((x) => x.id === id)).filter((p): p is (typeof PRESETS)[number] => !!p).map((p) => { const on = presetOn(q, p); return (
                  <button key={p.id} type="button" className={"fgx-chip mfs-preset" + (on ? " is-on" : "")} aria-pressed={on} disabled={!!p.off || (!!p.gold && !gold)} title={p.off ?? (p.gold && !gold ? "The Mutual Fund Score filter is part of the Gold plan." : p.say)}
                    onClick={() => (on ? reset() : setSp(queryToParams(p.set(DEFAULTS)), { replace: false }))}>{on && <i aria-hidden="true">&#10003;</i>}{p.label}{(p.off || (p.gold && !gold)) && <Icon name="lock" />}</button>); })}
              </div>
            </div>))}
          {saved.length > 0 && (
            <div className="mfs-pgrp" role="group" aria-labelledby="mfs-pg-saved"><span className="mfs-pg" id="mfs-pg-saved">Saved</span>
              <div className="mfs-prow">{saved.map((s) => (
                <span key={s.name} className="mfs-saved"><button type="button" className="fgx-chip" onClick={() => setSp(new URLSearchParams(s.query))} title="A screen you saved in this browser">{s.name}</button>
                  <button type="button" className="mfs-x" aria-label={`Delete the saved screen ${s.name}`} onClick={() => dropSaved(s.name)}>×</button></span>))}</div></div>)}
        </div>
      </section>

      <Toolbar q={text} setQ={setText} searchLabel="Search by fund or fund house, e.g. hdfc mid cap" buttons={[]}
        sort={<SortMenu value={sortVal} options={sorts.map((s) => ({ v: `${s.v}:${s.dir}`, label: s.label }))}
          onPick={(v) => { const [k, d] = v.split(":"); go({ sort: k, dir: d as "asc" | "desc", page: 1 }); }} />} />

      {/* Task #357 (team, 23 Nov 2026, replacing #350's kept column): hiding the filters lets the table take the width, and a slim vertical "Show filters"
          button stays at the left in view while the page scrolls (the column is sticky), as on the Mutual funds page. */}
      <div className={"mfs-layout" + (shut ? " is-shut" : "")} style={{ "--side-w": `${sideW || SIDE.def}px` } as React.CSSProperties}>
        <aside className={"card mfs-side" + (shut ? " is-shut" : "")} aria-label="Filters">
          {shut ? <button type="button" className="mfs-showf" onClick={showPanel} aria-expanded="false" aria-controls="mfs-side-body"><Icon name="panel" /><span>Show filters</span>{shown > 0 && <b aria-label={`${shown} on`}>{shown}</b>}</button> : <div id="mfs-side-body" className="mfs-side-body">
          <div className="mfs-sh-top">
            <span className="mfs-sh-t">Filters{shown > 0 ? ` · ${shown} on` : ""}</span>
            <span className="fgx-tl">{!isDefault(q) && <button type="button" className="btn sm" onClick={reset}>Clear</button>}
              {!small && <button type="button" className="btn sm mfs-hidef" aria-expanded="true" aria-controls="mfs-side-body" onClick={togglePanel}>Hide filters</button>}</span>
          </div>
          <Panel q={q} set={set} fac={fac} waiting={facets.isFetching && !fac} canScore={gold} fold={small} />
          {small && <div className="mfs-foot"><button type="button" className="btn primary" onClick={() => document.getElementById("mfs-results")?.scrollIntoView({ block: "start" })}>Show {list.data ? nf(total, 0) : ""} fund{total === 1 ? "" : "s"}</button></div>}
          </div>}
        </aside>
        {!small && !shut && <SplitDivider width={sideW || SIDE.def} set={resizePanel} />}   {/* task #357: hidden filters give the table the width; no reserved column */}

        <section className="card mfs-main" id="mfs-results" aria-label="Results">
          <div className="mfs-rbar">
            <p className="mf-count" role="status" aria-live="polite">{list.isLoading ? "Loading funds…" : list.isError ? "Could not load the funds." : <><b>{nf(total, 0)}</b> fund{total === 1 ? "" : "s"}{split ? <span className="mfs-split"> ({split})</span> : null}{list.data?.dataDate ? <> · NAV data of {dateIN(list.data.dataDate)}</> : null}{loadingNow && !list.isLoading ? <span className="mfs-busy"> · updating…</span> : null}</>}</p>
          </div>

          <div className="mfs-active" aria-label="Active filters">
            {chips.map((c) => <button key={c.id} type="button" className="fchip" onClick={() => set((s) => c.clear(s))} aria-label={`Remove filter: ${c.label}`}>{c.label} <span aria-hidden="true">×</span></button>)}
            {chips.length > 0 && <><button type="button" className="fgx-link" onClick={reset}>Reset</button>
              <button type="button" className="fgx-link" onClick={saveScreen}>Save screen</button></>}
          </div>

          <section className="mfs-glance-wrap" aria-labelledby="mfs-gl-h">
            <div className="mfs-glance-h">
              <h2 id="mfs-gl-h">Result at a glance</h2>
              <button type="button" className="btn sm" aria-expanded={glance} aria-controls="mfs-glance" onClick={() => setGlance(!glance)}>{glance ? "Hide" : "Show"}</button>
            </div>
            {glance && (
              <div className="mfs-glance" id="mfs-glance">
                <div><h3>Return against risk</h3><RiskReturn data={fac?.scatter} /></div>
                <div><h3>Where the money is moving</h3><p className="faint">Net flow of the categories in the result, last six months (AMFI). Industry figures, not just these funds.</p><FlowBars flows={fac?.flows} /></div>
              </div>)}
          </section>

          {list.isError ? <div className="state" role="alert"><h2>Could not load the funds</h2><p>The fund data did not answer. <button className="btn" onClick={() => list.refetch()}>Try again</button></p></div>
            : noMatch ? <div className="mfs-empty" role="status"><h2>No fund passes all these filters</h2>
              <p>{chips.length ? "Remove a filter to widen the result:" : "There are no funds to show."}</p>
              <div>{chips.slice(0, 8).map((c) => <button key={c.id} type="button" className="fchip" onClick={() => set((s) => c.clear(s))}>{c.label} <span aria-hidden="true">×</span></button>)}</div>
              <button type="button" className="btn" onClick={reset}>Reset all filters</button></div>
              : <ResultTable rows={rows} q={q} onSort={onSort} loading={list.isFetching} score={{ gold, items: scoreMap, loading: scores.isFetching }} pick={{ picked: tray, onPick: pick }} />}

          {tray.length > 0 && (
            <div className="mfs-tray" role="region" aria-label="Funds chosen to compare">
              <b>Compare</b>
              <span className="mfs-tray-l">{tray.map((c) => <span key={c} className="mfs-tray-c">{names[c] ?? rows.find((r) => r.code === c)?.name ?? `Scheme ${c}`}
                <button type="button" aria-label={`Remove ${names[c] ?? rows.find((r) => r.code === c)?.name ?? `scheme ${c}`} from compare`} onClick={() => pick(c)}>×</button></span>)}</span>
              <span className="mfs-tray-b">{tray.length < 2 && <small>Tick one more fund to compare.</small>}
                <button type="button" className="btn" onClick={clearTray}>Clear</button>
                <button type="button" className="btn primary" disabled={tray.length < 2} onClick={() => nav(compareUrl(tray))}>Compare {tray.length} fund{tray.length === 1 ? "" : "s"} <Icon name="arrow" /></button></span>
            </div>)}

          {pages > 1 && (
            <nav className="mfs-pages" aria-label="Pages">
              <button className="btn sm" disabled={q.page <= 1} onClick={() => go({ page: q.page - 1 })}>Previous</button>
              <span>Page {q.page} of {nf(pages, 0)}</span>
              <button className="btn sm" disabled={q.page >= pages} onClick={() => go({ page: q.page + 1 })}>Next</button>
            </nav>)}

        </section>
      </div>
      {/* Task #373 (team, 24 Nov 2026): the disclaimer as a neat drop-down. Task #379: under both columns, the full width of the page (the team's red box). The statutory mutual fund line stays in view in the closed row; the rest opens below. */}
      <footer className="mfs-fine faint" aria-label="How to read this page">
        <details className="mfs-disc">
          <summary><span className="mfs-disc-k">Disclaimer</span><b className="mfs-disc-l">Mutual fund investments are subject to market risks; read all scheme-related documents carefully.</b>
            <span className="mfs-disc-more" aria-hidden="true">Details<i className="mfs-disc-chev" /></span></summary>
        <p><b>{DISCLAIMER}</b> The figures describe past data; they are not a recommendation.</p>
        <p>Risk figures are to the end of last month. Ranks compare funds of the same category and plan. A dash means the fund has no figure: the reason is in its tooltip, and the “N of M funds have this figure” line under each slider counts them.
          {where && <> Screener figures worked out {where.run ? dateIN(where.run) : ""}{where.portfolioDate ? `; portfolios as of ${dateIN(where.portfolioDate)}` : ""}.</>}
          {fac && fac.built.rows === 0 && <> The nightly job that works out risk, ranks, portfolio and category figures has not run yet, so those filters show “no data”.</>}
          {" "}Source: AMFI and each fund house's own disclosures. <Link to="/funds">All schemes</Link> · <Link to="/funds/insights">Fund industry trends</Link></p>
        </details>
      </footer>
    </div>
  );
}
