// /funds/screener: the Mutual Fund Screener. A left panel of filters (a bottom sheet on narrow screens), preset screens, the active filters as removable chips,
// a sort menu, two small graphics and a table. Every count comes from the server in one call (/api/mf/filters?screen=1); the list is /api/mf?extra=true.
// Information only: figures describe past data, nothing here says what to do. Plan: free.
// Task #131 (the team's 14 Nov design): presets in one row (the one on is dark), a Sort button with a short menu, the default view as removable chips,
// Result at a glance open on arrival with a Hide button, a FundPulse column (Gold, no Gold tag on the sort), tick boxes to compare up to 4 with the
// compare bar under the table, and on a phone the filter panel in place with its groups behind one button.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { SortMenu, Toolbar } from "../components/screener/PageParts";
import { Icon } from "../lib/icons";
import { nf, dateIN } from "../lib/format";
import { loadUi, saveUi, isBool } from "../lib/persist";
import { DISCLAIMER, compareUrl, useTray } from "../lib/mf";
import { useScores } from "../lib/mfScore";
import { DEMO } from "../lib/demo";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import {
  DEFAULTS, PAGE_SIZE, PRESETS, chipsFor, isDefault, loadSaved, parseQuery, presetOn, queryToParams, storeSaved, useScreenFacets, useScreenList, type Saved, type SQ,
} from "../lib/mfScreen";
import { SORTS } from "../lib/mfScreenDefs";
import { FlowBars, RiskReturn } from "../mf/screen/Graphics";
import { Panel } from "../mf/screen/Panel";
import { ResultTable } from "../mf/screen/Results";
import "../styles/fgx.css";
import "../styles/mf.css";
import "../styles/mfscreen.css";
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
/** The default view as chips (task #131): each one still in force, and what removing it turns on. */
export function defaultChips(q: SQ): { id: string; label: string; aria: string; drop: (s: SQ) => SQ }[] {
  const out: { id: string; label: string; aria: string; drop: (s: SQ) => SQ }[] = [];
  if (q.plans.length === 1 && q.plans[0] === "Direct") out.push({ id: "plan", label: "Direct plan", aria: "Remove Direct plan: show every plan", drop: (s) => ({ ...s, plans: [], page: 1 }) });
  if (q.options.length === 1 && q.options[0] === "Growth") out.push({ id: "option", label: "Growth option", aria: "Remove Growth option: show every option", drop: (s) => ({ ...s, options: [], page: 1 }) });
  if (q.status === "active") out.push({ id: "status", label: "Still publishing", aria: "Remove Still publishing: include funds that stopped", drop: (s) => ({ ...s, status: "both", page: 1 }) });
  if (q.inst.length === 0) out.push({ id: "inst", label: "Mutual funds and ETFs", aria: "Remove Mutual funds and ETFs: show mutual funds only", drop: (s) => ({ ...s, inst: ["fund"], page: 1 }) });
  return out;
}

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
  const pick = (code: number) => { const r = rows.find((x) => x.code === code); if (r) setNames((m) => ({ ...m, [code]: r.name })); if (!toggleTray(code)) toast("You can compare up to 4 funds at a time."); };
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
  const defaults = defaultChips(q);
  const onSort = (key: string) => go({ sort: key, dir: q.sort === key ? (q.dir === "asc" ? "desc" : "asc") : (key === "name" || key === "ter" || key === "fall" || key === "rank3y" || key === "gap" || key === "worst" || key === "negshare" || key === "downdev" ? "asc" : "desc"), page: 1 });
  const showPanel = () => { setPanelOpen(true); saveUi("mfscreen.panel", 1, true); };
  // Task #140 (team note): the advanced screeners' sliding bar between the filters and the results: drag to resize, drag far left or double-click to hide.
  const [sideW, setSideW] = useSideWidth("mfscreen");
  const resizePanel = (w: number, snap = false) => { if (w < (snap ? SIDE.min / 2 : 1)) { setPanelOpen(false); saveUi("mfscreen.panel", 1, false); return; } setSideW(w); };
  const togglePanel = () => { setPanelOpen(!panelOpen); saveUi("mfscreen.panel", 1, !panelOpen); };
  const reset = () => setSp(new URLSearchParams(), { replace: true });
  const saveScreen = () => {
    const name = window.prompt("Name this screen (kept in this browser only)", "")?.trim().slice(0, 40);
    if (!name) return;
    const next = [{ name, query: queryToParams(q).toString() }, ...saved.filter((s) => s.name !== name)].slice(0, 8);
    setSaved(next); storeSaved(next);
  };
  const dropSaved = (name: string) => { const next = saved.filter((s) => s.name !== name); setSaved(next); storeSaved(next); };
  const sorts = SORTS.filter((s) => !s.gold || gold);   // FundPulse sort: Gold (the founder kept the plan), with no Gold tag (task #131)
  const noMatch = !list.isLoading && !list.isError && total === 0;
  const loadingNow = list.isFetching || facets.isFetching;
  const where = fac && fac.built.rows > 0 ? fac.built : null;

  return (
    <div className="wrap mf mfs-page">
      <PageHeader plan="free" title={title} art="funds" links={["/funds", "/fund-score-screener", "/funds/compare", "/funds/insights"]} learn={false}
        description="Filter every mutual fund and ETF by type, category, fund house, plan, size, returns, cost, risk, portfolio and what its category is doing. Counts beside every choice, a histogram under every slider. Information only, not investment advice."
        stats={[{ icon: "layers", value: list.data ? nf(total, 0) : null, label: "Funds match" }, { icon: "calendar", value: list.data?.dataDate ? dateIN(list.data.dataDate, { day: "numeric", month: "short", year: "numeric" }) : null, label: "NAV data date" }]} />

      {DEMO && <p className="mfs-demo" role="note"><Icon name="info" /> Preview build: the real AMFI NAVs and returns of 67 schemes are shown, but expense ratio, fund size, SIP, risk, portfolio and category figures here are sample values for layout only.</p>}
      <section className="mfs-presets" aria-label="Preset screens">
        <span className="mfs-pl">Preset screens</span>
        <div className="mfs-prow">
          {PRESETS.map((p) => { const on = presetOn(q, p); return (
            <button key={p.id} type="button" className={"fgx-chip mfs-preset" + (on ? " is-on" : "")} aria-pressed={on} disabled={!!p.off} title={p.off ?? p.say}
              onClick={() => (on ? reset() : setSp(queryToParams(p.set(DEFAULTS)), { replace: false }))}>{on && <i aria-hidden="true">&#10003;</i>}{p.label}{p.off && <Icon name="lock" />}</button>); })}
          {saved.map((s) => (
            <span key={s.name} className="mfs-saved"><button type="button" className="fgx-chip" onClick={() => setSp(new URLSearchParams(s.query))} title="A screen you saved in this browser">{s.name}</button>
              <button type="button" className="mfs-x" aria-label={`Delete the saved screen ${s.name}`} onClick={() => dropSaved(s.name)}>×</button></span>))}
        </div>
        <p className="fgx-note">Presets are plain starting points: they set filters you can change. They describe past figures and do not recommend any fund.</p>
      </section>

      <Toolbar q={text} setQ={setText} searchLabel="Search by fund or fund house, e.g. hdfc mid cap" buttons={panelOpen || small ? [] : [{ id: "filters", label: "Filters", active: shown, onClick: showPanel }]}
        sort={<SortMenu value={sortVal} options={sorts.map((s) => ({ v: `${s.v}:${s.dir}`, label: s.label }))}
          onPick={(v) => { const [k, d] = v.split(":"); go({ sort: k, dir: d as "asc" | "desc", page: 1 }); }} />} />

      <div className={"mfs-layout" + (panelOpen || small ? "" : " is-collapsed")} style={{ "--side-w": `${sideW || SIDE.def}px` } as React.CSSProperties}>
        <aside className="card mfs-side" aria-label="Filters" hidden={!panelOpen && !small}>
          <div className="mfs-sh-top">
            <span className="mfs-sh-t">Filters{shown > 0 ? ` · ${shown} on` : ""}</span>
            <span className="fgx-tl">{!isDefault(q) && <button type="button" className="btn sm" onClick={reset}>Clear</button>}
              {!small && <button type="button" className="btn sm" onClick={togglePanel}>Hide filters</button>}</span>
          </div>
          <Panel q={q} set={set} fac={fac} waiting={facets.isFetching && !fac} canScore={gold} fold={small} />
          {small && <div className="mfs-foot"><button type="button" className="btn primary" onClick={() => document.getElementById("mfs-results")?.scrollIntoView({ block: "start" })}>Show {list.data ? nf(total, 0) : ""} fund{total === 1 ? "" : "s"}</button></div>}
        </aside>
        {panelOpen && !small && <SplitDivider width={sideW || SIDE.def} set={resizePanel} />}

        <section className="card mfs-main" id="mfs-results" aria-label="Results">
          <div className="mfs-rbar">
            <p className="mf-count" role="status" aria-live="polite">{list.isLoading ? "Loading funds…" : list.isError ? "Could not load the funds." : <><b>{nf(total, 0)}</b> fund{total === 1 ? "" : "s"}{list.data?.dataDate ? <> · NAV data of {dateIN(list.data.dataDate)}</> : null}{loadingNow && !list.isLoading ? <span className="mfs-busy"> · updating…</span> : null}</>}</p>
          </div>

          <div className="mfs-active" aria-label="Active filters">
            {defaults.length > 0 && <span className="mfs-dv">Default view</span>}
            {defaults.map((c) => <button key={"d:" + c.id} type="button" className="fchip mfs-dchip" onClick={() => set((s) => c.drop(s))} aria-label={c.aria}>{c.label} <span aria-hidden="true">×</span></button>)}
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
                <button type="button" aria-label={`Remove ${names[c] ?? rows.find((r) => r.code === c)?.name ?? `scheme ${c}`} from compare`} onClick={() => toggleTray(c)}>×</button></span>)}</span>
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

          <footer className="mfs-fine faint" aria-label="How to read this page">
            <p><b>Mutual fund investments are subject to market risks; read all scheme-related documents carefully.</b> <b>{DISCLAIMER}</b> The figures describe past data; they are not a recommendation.</p>
            <p>Risk figures use month-end NAVs up to the last full month; ranks and “against category” compare funds of the same category and plan and need at least three funds with a figure. A dash means the fund has no figure: the reason is in its tooltip, and the “N of M funds have this figure” line under each slider counts them.
              {where && <> Screener figures worked out {where.run ? dateIN(where.run) : ""}{where.portfolioDate ? `; portfolios as of ${dateIN(where.portfolioDate)}` : ""}.</>}
              {fac && fac.built.rows === 0 && <> The nightly job that works out risk, ranks, portfolio and category figures has not run yet, so those filters show “no data”.</>}
              {" "}Source: AMFI and each fund house's own disclosures. <Link to="/funds">All schemes</Link> · <Link to="/funds/insights">Fund industry trends</Link></p>
          </footer>
        </section>
      </div>
    </div>
  );
}
