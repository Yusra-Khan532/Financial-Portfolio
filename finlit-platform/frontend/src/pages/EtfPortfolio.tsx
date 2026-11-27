// ETF portfolio (task #136; rebuilt for task #183 part 3; task #276, the 20 Nov pack): the member's ETFs on the shared portfolio parts (portfolio/kit). The compact
// top (title row with the add box; the money box that says what it covers; Your portfolios), "What your ETFs cost" and the three views drawn as tabs, the view
// bar (Bar B) that gives way to the table's filter row inside the long table, filters in one row, Edit | Sell under each ETF, Key figures under the main section
// of each view, What changed at the companies inside your ETFs (Discover, with Alert me), a Next view card, What this means in short, the questions and the
// sources line. Figures are the server's (/api/me/etf-portfolio, /inside, /risk); words come from lib/etfKeyFigs, lib/etfTop and etf/pack. Silver and Gold, up
// to the plan's number of ETFs. Describes; never advice. Information only, not investment advice.
// Task #390 PR A (developer file 34): "Add to [select]" in the add row; four calm crowned cards (What your ETFs cost, then the three views: "5 ETFs",
// "Lower · moves 0.58×"); Since your last visit; Data as of under the section bar; one section per step (All sections puts them back) with &step= and the
// member's last view and step remembered, Key figures inside step 1 of every view; things to know as a pop-up beside each heading; Record a sale; the
// table's pinned heading and cap; question-style Key figures; What changed in "updates" and "filings"; phone folds.
// Task #390 reopened (developer file 39 v4): "Where your gain or loss came from" left the page; Key figures closed until clicked; the shared bottom.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { ClearPortfolio } from "../components/ClearPortfolio";
import { Tip } from "../components/sectors/pack/Common";
import { WhatChanged, useWhatChanged } from "../components/changes/WhatChanged";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { limitsFor, useAuth } from "../lib/auth";
import { etfGet, useEtfSearch, type EtfList } from "../lib/etf";
import { avgBySymbol, etfRowsFromFile, toSend, useEtfInside, useEtfPortfolio, useEtfRisk, useEtfWrites, type EtfRow, type Preview, type RawRow } from "../lib/etfPortfolio";
import { ETF_LABEL, etfCards, etfStepFromParam, etfStepOf, etfStepParam, etfStepsOf, type EtfStep, type EtfTab } from "../lib/etfTop";
import { aboutN, costCard, dm, etfKeyFigures, insideCompanies, insideLine, underneath } from "../lib/etfKeyFigs";
import { jumpTo } from "../portfolio/pack/PageTop";
import { AddPortfolioDialog, BROKERS, type PfInfo } from "../portfolio/Portfolios";
import { SoldList, soldOf } from "../portfolio/MoneyRow";
import { VIEW_COLOR } from "../portfolio/ViewKit";
import { type LotsProps } from "../portfolio/HoldingCells";
import { EtfCards, EtfSince } from "../etf/pack/EtfTop";
import { MfAsOf } from "../mf/pack/MfTop";
import { Step, StepCtx } from "../portfolio/pack/EqSteps385";
import { KnowPop, closePops } from "../portfolio/pack/Round388";
import { Info, RECORD_SALE, VisitFolds, andList, countOf, shortCo } from "../portfolio/shared";
import { PageBottom } from "../portfolio/shared/PageBottom";
import { setEtfLimit } from "../content/etfPortfolioFaqs";
import { dayMonth } from "../lib/whatChanged";
import "../portfolio/pack/eq385.css";
import "../styles/what-changed.css";
import { aggOf, ledgerOf, moneyOf } from "../lib/ledger";
import { DEFAULT_PF } from "../lib/portfolio";
import { tradeRows } from "../lib/importAdd";
import type { Trade } from "../lib/tradeColumns";
import { fileIntoAccount, fileMessage, useEtfBook } from "../lib/etfBook";
import { AddBox, MenuButton, type Resolved, type Sugg } from "../portfolio/kit/AddBox";
import { TopMoney } from "../portfolio/kit/TopMoney";
import { NextView } from "../portfolio/kit/ViewCards";
import { AccountPicker, SectionsMenu, ViewBar, ViewSeg, useInside, type Pick, type ViewSteps } from "../portfolio/kit/ViewBar";
import { FilterRow, applyFilters, type Facet, type Picks } from "../portfolio/kit/FilterRow";
import { EditDialog, EditSell, SellDialog } from "../portfolio/kit/HoldingDialog";
import { KeyFigsBox } from "../portfolio/kit/KeyFigsBox";
import type { KfGo } from "../portfolio/kit/keyFigs";
import { EYE, useHidden } from "../portfolio/kit/KitSection";
import "../portfolio/holdings-kit.css";
import { EtfsTable, VIEWS, type EtfView, type Sort } from "../etf/pack/EtfList";
import { InsideTab } from "../etf/pack/EtfInside";
import { RiskTab } from "../etf/pack/EtfRisk";
import { InShort, SOURCES, shortLines } from "../etf/pack/EtfShort";
import "../portfolio/pack/pagetop.css";
import "../styles/mfportfolio.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../mf/pack/mf-pack.css";
import "../styles/etfportfolio.css";
import "../portfolio/kit/kit.css";
import "../etf/pack/spacing390.css";   // task #390 (file 39 v4, Part D): the page's spacing, after the pack CSS
import { PLAN_FOR_FUND_PORTFOLIO } from "../lib/planGates";
import { PageTabs } from "../components/PageTabs";
import { memberPlanName } from "../lib/planNames";
import { planKeyOf } from "../lib/auth";

const errText = (e: unknown) => ((e as { body?: { detail?: string } })?.body?.detail) || (e instanceof Error ? e.message : "Something went wrong. Please try again.");


/* --------------------------------------------------------------- import a broker file */
const STATUS: Record<string, string> = { matched: "Matched", duplicate: "Repeated", ignored: "Company shares", not_found: "Not an ETF we list", invalid: "Not readable" };
/** Developer file 35: `account` is the account the file goes into; `here` says whether an ETF already has buys there. onDone gets the ticked ETFs and the
 *  member's choice for those with buys there ("Use the file's quantities"); the page puts them in the book (lib/etfBook fileIntoAccount). */
function ImportFile({ onDone, account, here }: { onDone: (items: { symbol: string; qty: number | null; avg?: number; trades?: Trade[] }[], useFile: boolean) => void;
  account: string; here: (symbol: string) => boolean }) {
  const w = useEtfWrites(), ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [pv, setPv] = useState<Preview | null>(null), [skip, setSkip] = useState<Set<number>>(new Set()), [existing, setExisting] = useState<"skip" | "replace">("skip");
  const [raws, setRaws] = useState<RawRow[]>([]);
  const read = async (f: File) => {
    setBusy(true); setErr(""); setPv(null);
    try {
      const rows = await etfRowsFromFile(f);
      if (!rows.length) throw new Error("No ISIN or symbol column was found in that file. Export your holdings with ISIN or symbol and quantity, then try again.");
      setRaws(rows); setPv(await w.preview.mutateAsync(toSend(rows))); setSkip(new Set());
    } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  // 22 Nov 2026: each ETF comes with the file's average buy price ("Avg. price", or Invested ÷ quantity), so Invested and Gain or loss can be worked out
  const avgs = useMemo(() => (pv ? avgBySymbol(pv, raws) : new Map<string, number>()), [pv, raws]);
  // developer file 31: an ETF sold in full in a tradebook is shown, not offered (raws[i].soldOut)
  const sold = (r: { i: number }) => !!raws[r.i]?.soldOut;
  const items = (pv?.rows ?? []).filter((r) => r.status === "matched" && r.etf && !skip.has(r.i) && !sold(r)).map((r) => ({ symbol: r.etf!.symbol, qty: r.qty, ...(avgs.has(r.etf!.symbol) ? { avg: avgs.get(r.etf!.symbol)! } : {}),
    ...(raws[r.i]?.trades?.length ? { trades: raws[r.i].trades } : {}) }));
  const nTrades = raws.reduce((a, r) => a + (r.trades?.length ?? 0), 0);
  // a holdings report lists shares and ETFs together: the company-share lines go under a fold, so the ETFs are not lost among them (22 Nov 2026)
  const shares = (pv?.rows ?? []).filter((r) => r.status === "ignored"), shown = (pv?.rows ?? []).filter((r) => r.status !== "ignored" || (pv?.rows ?? []).length === shares.length);
  // developer file 35: the choice is about the ETFs that already have buys in the account the file goes into (a tradebook's ETFs follow their own rule)
  const fresh = (pv?.rows ?? []).filter((r) => r.status === "matched" && !r.existing && !skip.has(r.i) && !sold(r)).length, nOld = items.filter((x) => !x.trades?.length && here(x.symbol)).length;
  const go = async () => {
    setErr("");
    // the list only takes the new ETFs ("skip"); the units of each ETF come from its buys, which the page sets in the book next
    try { await w.commit.mutateAsync({ items: items.map(({ symbol, qty }) => ({ symbol, qty })), existing: "skip" }); onDone(items, existing === "replace"); setPv(null); }
    catch (x) { setErr(errText(x)); }
  };
  return (<>
    <div className="row mp-file"><button className="btn primary" onClick={() => ref.current?.click()} disabled={busy}>{busy ? "Reading…" : "Choose a broker file…"}</button>
      <input ref={ref} type="file" hidden accept=".xlsx,.xls,.csv,.tsv,.txt,.html,.htm,.ods" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />
      <span className="faint">A holdings export from your broker (.xlsx, .xls or .csv), as it comes. Each line is matched on its ISIN, then on its NSE symbol; company shares and mutual funds are left out. Read in your browser: the ISIN, symbol, name and quantity of each line are sent, and the average buy price becomes each ETF's buy.</span></div>
    {err && <p className="mp-err" role="alert">{err}</p>}
    {pv && <section className="mp-review" aria-label="Import review">
      <ul className="mp-counts">{Object.entries(pv.counts).filter(([, n]) => n).map(([k, n]) => <li key={k} className={"st-" + k}><b>{n}</b> {STATUS[k].toLowerCase()}</li>)}</ul>
      <div className="mp-tablewrap"><table className="mp-rt">
        <thead><tr><th>Line</th><th>In your file</th><th>Status</th><th>ETF in FinLit</th><th>Quantity</th><th>Avg. buy price</th><th>Import</th></tr></thead>
        <tbody>{shown.map((r) => <tr key={r.i} className={"st-" + r.status}>
          <td data-label="Line">{r.row || r.i + 1}</td>
          <td data-label="In your file"><b>{r.name || r.symbol || r.isin || "(blank)"}</b><small>{[r.isin, r.symbol, raws[r.i]?.trades?.length ? `${raws[r.i].trades!.length} ${raws[r.i].trades!.length === 1 ? "trade" : "trades"}` : ""].filter(Boolean).join(" · ")}</small></td>
          <td data-label="Status"><span className={"mp-chip st-" + r.status}>{STATUS[r.status]}</span><small>{r.reason}</small></td>
          <td data-label="ETF in FinLit">{r.etf ? <><b>{r.etf.name}</b><small>{r.etf.symbol}{r.existing ? " · already in your list" : ""}</small></> : <span className="faint">—</span>}</td>
          <td data-label="Quantity">{sold(r) ? 0 : r.qty ?? "—"}</td>
          <td data-label="Avg. buy price">{r.status === "matched" && r.etf && avgs.has(r.etf.symbol) ? "₹" + avgs.get(r.etf.symbol)!.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
          <td data-label="Import">{r.status === "matched" && sold(r) ? <small>Sold in full in this file</small> : r.status === "matched" ? <input type="checkbox" aria-label={`Import line ${r.row || r.i + 1}`} checked={!skip.has(r.i)} onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(r.i); else n.add(r.i); return n; })} /> : null}</td>
        </tr>)}</tbody></table></div>
      {nTrades > 0 && <p className="faint">This file lists trades: each ETF comes with what is left of its units, worked out first in, first out, and its buys and sales, dated, go to your book. An ETF sold in full in the file is not added.</p>}
      {shares.length > 0 && <details className="mp-shares"><summary>{shares.length} {shares.length === 1 ? "line is a company's shares" : "lines are company shares"}, left for the Equity portfolio</summary>
        <p className="faint">{shares.map((r) => `${r.symbol || r.isin || r.name} (line ${r.row || r.i + 1})`).join(", ")}</p></details>}
      {nOld > 0 && <fieldset className="mp-ex"><legend>{nOld} of these ETFs already {nOld === 1 ? "has" : "have"} buys in {account}</legend>
        <label><input type="radio" checked={existing === "skip"} onChange={() => setExisting("skip")} /> Keep what I have</label>
        <label><input type="radio" checked={existing === "replace"} onChange={() => setExisting("replace")} /> Use the file's quantities</label></fieldset>}
      {fresh > pv.capacity.room && <p className="mp-warn" role="status">Your plan holds {pv.capacity.limit} ETFs ({pv.capacity.used} in your list); untick {fresh - pv.capacity.room} {fresh - pv.capacity.room === 1 ? "line" : "lines"}.</p>}
      <div className="row"><button className="btn primary" onClick={go} disabled={!items.length || fresh > pv.capacity.room || w.commit.isPending}>{w.commit.isPending ? "Importing…" : `Import ${items.length} ${items.length === 1 ? "ETF" : "ETFs"}`}</button><button className="btn" onClick={() => setPv(null)}>Cancel</button></div>
    </section>}
  </>);
}

/* --------------------------------------------------------------- the add box's search (change 1): GET /api/etf matches symbol, name, fund house, the index in the name, and ISIN */
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const house = (h: string | null | undefined) => (h || "").replace(/\s+mutual\s+fund$/i, "");
/** One search hit as a suggestion, saying what it matched when that is not the symbol. Exported for tests. */
export function suggOf(e: EtfList["items"][number], q: string): Sugg {
  const t = q.trim().toLowerCase(), isin = ISIN_RE.test(q.trim().toUpperCase()) && e.isin === q.trim().toUpperCase();
  const why = isin ? "ISIN match" : e.symbol.toLowerCase().startsWith(t) ? undefined : (e.name || "").toLowerCase().includes(t) ? undefined : house(e.fundHouse).toLowerCase().includes(t) ? `Fund house: ${house(e.fundHouse)}` : e.categoryLabel?.toLowerCase().includes(t) ? `Kind: ${e.categoryLabel}` : undefined;
  return { id: e.symbol, title: e.symbol, sub: [e.name, e.categoryLabel].filter(Boolean).join(" · "), line: [house(e.fundHouse), e.isin].filter(Boolean).join(" · "), why };
}
function useEtfResults(q: string) {
  const s = useEtfSearch(q);
  return { items: (s.data?.items ?? []).map((e) => suggOf(e, q)), loading: s.isFetching, error: s.isError, total: s.data ? s.data.total : null, universe: s.data?.universe ?? null };
}
/** The best ETF for a typed row of Add several: the exact symbol or ISIN first, else the top match. */
async function resolveEtf(text: string): Promise<Sugg | null> {
  const r = await etfGet<EtfList>(`/api/etf?q=${encodeURIComponent(text)}&limit=5&sort=turnover&order=desc`);
  const up = text.trim().toUpperCase(), hit = r.items.find((e) => e.symbol === up || e.isin === up) ?? r.items[0];
  return hit ? suggOf(hit, text) : null;
}

/* --------------------------------------------------------------- views */
const COLORS: Record<EtfTab, string> = { etfs: VIEW_COLOR.first, inside: VIEW_COLOR.second, risk: VIEW_COLOR.risk };
const LABEL: Record<EtfTab, string> = { etfs: "Your ETFs", inside: "What's inside", risk: "Risk analytics" };
const WHAT: Record<EtfTab, string> = { etfs: "Inside: cost, returns, trading and risk of each", inside: "Inside: asset mix, sectors, sizes, overlap", risk: "Inside: beta, swings, falls, each ETF" };
const NEXT: Record<EtfTab, EtfTab> = { etfs: "inside", inside: "risk", risk: "etfs" };
const VIEWS3: EtfTab[] = ["etfs", "inside", "risk"];
const ALL_SEEN = new Set<string>(VIEWS3);   // task #390 (T3b): the "not opened" badges and ticks go; every view reads as seen in the bar
const isView = (v: string | null | undefined): v is EtfTab => v === "etfs" || v === "inside" || v === "risk";
/** Each view's numbered steps in Bar B (one section per step; Key figures inside step 1). Exported for tests. */
export const etfSteps = (newN: number): ViewSteps<EtfTab> =>
  Object.fromEntries(VIEWS3.map((v) => [v, { label: ETF_LABEL[v], steps: etfStepsOf(v, { wcNew: newN }).map(({ id, label, badge }) => ({ id, label, ...(badge ? { badge } : {}) })) }])) as ViewSteps<EtfTab>;

// Task #390 (developer file 34, Rules to build RB8): the member's last view and step on this page, kept in this browser per member, as the MF page keeps
// its place. An address that names a view or a step wins; a remembered "Key figures" opens step 1 (lib/etfTop etfStepFromParam).
const PLACE_KEY = (who: string | number | null | undefined) => `finlit-etf-portfolio-place:${who || "guest"}`;
export function readPlace(who: string | number | null | undefined): { view: EtfTab; step: string } | null {
  try { const v = JSON.parse(localStorage.getItem(PLACE_KEY(who)) || "null"); return v && isView(v.view) && typeof v.step === "string" ? { view: v.view, step: v.step } : null; } catch { return null; }
}
const savePlace = (who: string | number | null | undefined, view: EtfTab, step: string) => { try { localStorage.setItem(PLACE_KEY(who), JSON.stringify({ view, step })); } catch { /* private window: the address still holds it */ } };

/* --------------------------------------------------------------- page */
export function EtfPortfolioPage() {
  useDocTitle("ETF portfolio", "What your ETFs track, what they cost, how close they trade to their value, what sits inside them and how risky they are together.");
  const { plan, has, toast } = useUI();
  const { user } = useAuth();
  const silver = has(PLAN_FOR_FUND_PORTFOLIO);
  const [params, setParams] = useSearchParams();
  const qAll = useEtfPortfolio(silver), w = useEtfWrites();
  const book = useEtfBook(silver, (qAll.data?.items ?? []).filter((e) => !e.gone && e.qty == null).map((e) => e.symbol));
  const pfList: PfInfo[] = book.pfs.length ? book.pfs : [{ id: DEFAULT_PF, name: "My ETFs" }];
  const pfParam = params.get("pf") || "all", cur = pfParam === "all" || pfList.some((x) => x.id === pfParam) ? pfParam : "all";
  const setCur = (id: string) => { const p = new URLSearchParams(params); if (id === "all") p.delete("pf"); else p.set("pf", id); setParams(p, { replace: true }); };
  const qPf = useEtfPortfolio(silver && cur !== "all", cur);
  const q = cur === "all" ? qAll : qPf;
  const d = q.data, n = d ? d.items.map((e) => `${e.symbol}:${e.qty ?? ""}`).join(",") : "";
  const rk = useEtfRisk(silver && !!d && d.count > 0, n, cur), ins = useEtfInside(silver && !!d && d.count > 0, n, cur);
  const [goToSel, setGoTo] = useState(pfList[0].id), [adding, setAdding] = useState(false);
  const goTo = cur !== "all" ? cur : pfList.some((x) => x.id === goToSel) ? goToSel : pfList[0].id;
  const pfName = (id: string) => pfList.find((x) => x.id === id)?.name ?? "My ETFs";
  const px = useMemo(() => new Map((qAll.data?.items ?? []).map((e) => [e.symbol, e])), [qAll.data]);
  const priceOf = (sym: string) => px.get(sym)?.price ?? null, changeOf = (sym: string) => px.get(sym)?.changePct ?? null;
  // Edit | Sell (change 3): the dialogs read and write the saved book
  const [dlg, setDlg] = useState<{ kind: "edit" | "sell"; symbol: string; fresh?: boolean } | null>(null);
  const lots: LotsProps = {
    holdings: book.rows, cur, pfName, nPortfolios: pfList.length, priceOf, changeOf, goTo, open: new Set(), focus: null,
    onOpen: (sym) => setDlg({ kind: "edit", symbol: sym, fresh: true }), add: (sym) => setDlg({ kind: "edit", symbol: sym, fresh: true }),
    edit: (id, patch) => book.store.update(id, patch), remove: (id) => book.store.remove(id),
  };
  const money = moneyOf(book.rows, cur, priceOf, changeOf), sold = soldOf(book.rows, cur);
  const pfFigs = (id: string | "all") => { const m = moneyOf(book.rows, id, priceOf, changeOf); return { n: m.n, now: m.now, withQty: m.withQty, gainPct: m.full && m.invested ? (m.gain / m.invested) * 100 : null }; };
  const pick: Pick = { list: pfList, cur, onPick: setCur, figs: pfFigs, noun: ["ETF", "ETFs"] };
  const view: EtfTab = isView(params.get("view")) ? (params.get("view") as EtfTab) : "etfs";
  // task #390: a change of view opens its first step (no `step` in the address) and closes any pop-up
  const setView = (v: EtfTab, scroll = false) => { const p = new URLSearchParams(params); if (v === "etfs") p.delete("view"); else p.set("view", v); p.delete("step"); setParams(p, { replace: true }); if (v !== view) closePops();
    if (scroll) setTimeout(() => document.getElementById("etp-tabsbox")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50); };
  const seen = ALL_SEEN;
  // task #390 (RB8): the place kept for this member; a bare address opens there
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !user) return; restored.current = true;
    if (params.get("view") || params.get("step")) return;
    const s = readPlace(user.id); if (!s) return;
    const n = new URLSearchParams(params); if (s.view === "etfs") n.delete("view"); else n.set("view", s.view); n.set("step", etfStepParam(s.step)); setParams(n, { replace: true });
  }, [user]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [panel, setPanel] = useState<"" | "import">(params.get("tab") === "import" ? "import" : "");
  const limit = d?.limit ?? limitsFor(plan).etf_holdings;
  setEtfLimit(d ? d.limit : null);   // task #390 (file 39 C1): the Questions answer says "Your plan holds up to N ETFs." with the number from /api/me/etf-portfolio
  const items = useMemo(() => d?.items ?? [], [d]);
  const live = items.filter((e) => !e.gone);
  // the table: its view, sort, Find and filters (changes 18 and 8)
  const [tview, setTview] = useState<EtfView>("returns"), [sort, setSort] = useState<Sort>({ k: "name", dir: 1 }), [fq, setFq] = useState(""), [picks, setPicks] = useState<Picks>({});
  const facets: Facet<EtfRow>[] = useMemo(() => [{ key: "type", label: "Type", get: (e) => e.type?.word ?? "Indian shares", order: ["Indian shares", "Gold", "Silver", "Shares abroad", "Debt", "Liquid"] }, { key: "house", label: "Fund house", get: (e) => house(e.fundHouse) || null }], []);
  const ftext = (e: EtfRow) => [e.symbol, e.name, e.isin, e.tracks.label, e.fundHouse, e.type?.word].filter(Boolean).join(" ");
  const shown = applyFilters(live, facets, picks, fq, ftext);
  const inTable = useInside("etp-zone", view === "etfs" && live.length > 0);
  // What changed (change 19): the companies that are 0.3% or more of the list through its ETFs
  const cos = useMemo(() => (d ? insideCompanies(d, ins.data) : []), [d, ins.data]);
  const coBy = useMemo(() => new Map(cos.map((c) => [c.symbol, c])), [cos]);
  const wc = useWhatChanged(cos.map((c) => c.symbol), "etf-portfolio");
  // task #390 (developer file 34, Section bar, Update 25 Nov row 1): one section per step, Key figures inside step 1 of every view; the step in the address
  // (&step=, "all" for All sections, none for the first step)
  const hasShort = shortLines(d, ins.data, rk.data).length > 0;
  const stepsOf = (v: EtfTab): EtfStep[] => etfStepsOf(v, { wcNew: wc.newN, largest: !ins.data || ins.data.top.length > 0, short: hasShort });
  const steps = stepsOf(view), step = etfStepFromParam(steps, params.get("step"));
  const barSteps = Object.fromEntries(VIEWS3.map((v) => [v, { label: ETF_LABEL[v], steps: stepsOf(v).map(({ id, label, badge }) => ({ id, label, ...(badge ? { badge } : {}) })) }])) as ViewSteps<EtfTab>;
  useEffect(() => { if (user) savePlace(user.id, view, step); }, [user, view, step]);
  /** Opens the step that holds a section, in its view; then goes to the section (or to the top of the view when the page is below it). */
  const openSec = (id: string, v0?: EtfTab) => {
    const v = v0 ?? (VIEWS3.find((x) => etfStepOf(stepsOf(x), id)) ?? view), to = etfStepOf(stepsOf(v), id) ?? id;
    const n = new URLSearchParams(params); if (v === "etfs") n.delete("view"); else n.set("view", v); n.set("step", etfStepParam(to)); setParams(n, { replace: true });
    if (v !== view) closePops();
    setTimeout(() => { if (id !== to && document.getElementById(id)) { jumpTo(id); return; }
      const p = document.getElementById("etp-panel"); if (p && p.getBoundingClientRect().top < 0) p.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, 90);
  };
  const setStep = (id: string) => { if (id === "all") { const n = new URLSearchParams(params); n.set("step", "all"); setParams(n, { replace: true }); return; } openSec(id, view); };
  useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (typeof id === "string" && id) openSec(id); }; addEventListener("eq-step", f); return () => removeEventListener("eq-step", f); });
  const onSec = (v: EtfTab, id: string) => openSec(id, v);
  const goTab = (t: EtfTab) => { setView(t); setTimeout(() => document.getElementById("etp-tabsbox")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50); };
  // a Key figures link opens the step that holds its section (in its view); a sort or a set of columns opens step 1 of Your ETFs
  const onGo = (g: KfGo) => {
    if (g.kind === "jump") { openSec(g.arg); return; }
    setTview(g.kind === "cols" ? (g.arg as EtfView) : "returns"); if (g.kind === "sort") setSort({ k: g.arg, dir: -1 }); openSec("etp-zone", "etfs");
  };
  const remove = async (sym: string, pf: string | "all" = cur) => {
    if (pf !== "all" && pfList.length > 1) { book.own.filter((h) => h.symbol === sym && (h.pf ?? DEFAULT_PF) === pf).forEach((h) => book.store.remove(h.id)); toast(`${sym} removed from ${pfName(pf)}.`); return; }
    try { await w.remove.mutateAsync(sym); book.own.filter((h) => h.symbol === sym).forEach((h) => book.store.remove(h.id)); toast(`${sym} removed.`); } catch (x) { toast(errText(x)); } };
  const heldIn = (sym: string) => (cur === "all" ? pfList.reduce((a, p) => a + (ledgerOf(book.rows, sym, p.id).qty ?? 0), 0) : ledgerOf(book.rows, sym, cur).qty ?? 0);
  const firstPf = (sym: string) => (cur !== "all" ? cur : aggOf(book.rows, sym, "all")?.pfs.find((p) => book.own.some((h) => h.symbol === sym && (h.pf ?? DEFAULT_PF) === p)) ?? goTo);
  const addQty = () => { const e = live.find((x) => !(aggOf(book.rows, x.symbol, cur)?.qty)) ?? live[0]; if (e) setDlg({ kind: "edit", symbol: e.symbol, fresh: true }); };
  const searchUniverse = useRef<number | null>(null);
  const useResults = (qq: string) => { const r = useEtfResults(qq); if (r.universe) searchUniverse.current = r.universe; return r; };
  const full = !!d && d.count >= limit;
  const lead: ReactNode = <><AccountPicker p={pick} compact /><ViewSeg defs={VIEWS3.map((k) => ({ id: k, label: k === "risk" ? "Risk" : LABEL[k], color: COLORS[k] }))} view={view} onView={(v) => goTab(v)} seen={seen} />
    <SectionsMenu all={barSteps} view={view} onSec={onSec} here={step === "all" ? undefined : step} label="Sections ▾" btnClass="ptk-btn ptk-secb" mode="view" /></>;
  const [wcHidden, setWcHidden] = useHidden("etp-wc");
  const lastDay = d?.asOf ? dm(d.asOf) : null;
  const und = d ? underneath(ins.data, d) : null;
  const cost = useMemo(() => (d ? costCard(d) : null), [d]);
  const cards = etfCards(d, und, rk.data, { insidePending: ins.isPending, insideError: ins.isError, riskPending: rk.isPending, riskError: rk.isError ? errText(rk.error) : null, about: aboutN });
  const kf = (v: EtfTab, sub: string) => d ? <KeyFigsBox id={`etp-kf-${v}`} sub={sub} cards={etfKeyFigures(v, { d, ins: ins.data, rk: rk.data })} onGo={onGo} visit /> : null;   // task #390 (file 39 A2): closed on every visit, as on equity and MF
  const next = <NextView k={LABEL[NEXT[view]]} what={WHAT[NEXT[view]]} color={COLORS[NEXT[view]]} onGo={() => goTab(NEXT[view])} />;
  const dlgPfs = pfList.map((p) => ({ id: p.id, name: p.name }));
  // task #390 (T7): which date each kind of figure runs to
  const asOf: [string, ReactNode][] = [
    ["Prices", lastDay ? `close of ${lastDay}` : "the last close"],
    ...(view === "etfs" ? [["Filings", `the last ${wc.q.data?.days ?? 90} days`] as [string, ReactNode]] : []),
    ...(view !== "risk" && ins.data?.asOf ? [["Holdings", `each fund house’s ${dm(ins.data.asOf)} ${ins.data.asOf.slice(0, 4)} file`] as [string, ReactNode]] : []),
    ...(view === "risk" ? [["Risk figures", "weekly prices, past year · swings and falls over 3 years"] as [string, ReactNode]] : []),
  ];
  // task #390 (P2d): What changed folds to "N companies filed in the last 90 days · N new since D"
  const wcFiled = new Set(wc.rows.map((r) => r.s)).size;
  const wcLine = !wc.q.data ? "Reading what the companies inside your ETFs filed…" : `${countOf(wcFiled, "company", "companies")} filed in the last ${wc.q.data.days ?? 90} days${wc.lastVisit ? ` · ${wc.newN} new since ${dayMonth(wc.lastVisit)}` : ""}`;
  return (
    // task #390 (developer file 39 v4, A2 / E1): VisitFolds keeps Key figures and the bottom's two folds open for the rest of the visit once opened,
    // closed on every new visit; the shared bottom (Questions fold, Disclaimer fold, sources line) as on the Equity and MF pages
    <KnowPop.Provider value={true}><VisitFolds><div className="wrap ipo mp sp mfp efp pfx">
      <Gate tier={PLAN_FOR_FUND_PORTFOLIO} title="Track your ETFs" points={["What each ETF tracks and costs, and how close it trades to its NAV", "What sits inside them: asset mix, overlap and the largest stocks", "Each ETF against the Nifty 500, and the list together", "Import a broker file, read by ISIN, then symbol"]}>
        <header className="ptk-head card" id="etp-top">
          <div className="ptk-t1">
            <div className="ptk-ht"><h1 className="ui-title">ETF portfolio</h1><p className="ptk-plan mfp-plan"><span>{memberPlanName(planKeyOf(), plan)}</span></p>
              <Tip text="What your ETFs track, what they cost, how close they trade to their value, what sits inside them and how risky they are together." how="Start with names; add quantities when you want the figures to follow your money. Each ETF is read by its ISIN; a row without one is matched on the NSE symbol." label="About “ETF portfolio”" />
              {lastDay && <span className="ptk-asof">Prices at close · {lastDay}</span>}</div>
            <AddBox placeholder="Add an ETF by name, symbol or ISIN" noun={["ETF", "ETFs"]} useResults={useResults} full={full} fullWhy={`Your plan holds ${limit} ETFs. Remove one to add another.`}
              resolve={resolveEtf}
              onAdd={async (s) => { const r = await w.add.mutateAsync({ symbol: s.id }).catch((x) => { throw new Error(errText(x)); }); toast(r.merged ? `${s.id} is already in your list.` : `${s.id} added.`); }}
              onSeveral={async (rows: Resolved[]) => {
                let added = 0;
                for (const r of rows) { if (!r.hit) continue; try { await w.add.mutateAsync({ symbol: r.hit.id }); added++; } catch (x) { throw new Error(`${r.hit.id}: ${errText(x)}`); }
                  const qn = Number(r.row.qty), pn = Number(r.row.price);
                  if (qn > 0) book.store.add({ symbol: r.hit.id, qty: qn, price: pn > 0 ? pn : 0, owned: true, pf: goTo }); }
                toast(`${added} ${added === 1 ? "ETF" : "ETFs"} added.`); }}
              menus={<>
                <MenuButton label="Import ▾" aria="Import">{(close) => <>
                  <button type="button" role="menuitem" onClick={() => { close(); setPanel("import"); }}>A broker file (.xlsx, .xls or .csv)</button>
                  <p>Read in your browser: only the ISIN, symbol, name and quantity of each line are sent.</p></>}</MenuButton>
                <MenuButton label="⋯" aria="More: other pages, quantities and Clear portfolio" className="ptk-btn" keep>{(close) => <>
                  <button type="button" role="menuitem" disabled={!d?.count} onClick={() => { close(); addQty(); }}>Add quantities and buy prices</button>
                  <hr /><Link role="menuitem" to="/my-investments" onClick={close}>All my investments →</Link><Link role="menuitem" to="/mf-portfolio" onClick={close}>MF portfolio →</Link>
                  <Link role="menuitem" to="/holdings" onClick={close}>Equity portfolio →</Link><Link role="menuitem" to="/etfs/compare" onClick={close}>Compare ETFs →</Link><hr />
                  <ClearPortfolio count={d?.count ?? 0} noun="ETF" kind="ETF" className="btn" goes={["each ETF and its quantity", "the figures worked out from them: cost, what's inside and risk"]}
                    onClear={async () => { await w.clear.mutateAsync(); }}
                    onUndo={async () => { try { await w.undoClear.mutateAsync(); } catch (x) { if ((x as { status?: number }).status === 410) throw new Error("The clear is final: Undo is only possible for 10 seconds."); throw x; } }} />
                  <p>{d ? `${d.count} ${d.count === 1 ? "ETF" : "ETFs"} · ${limit} on your plan` : `${limit} on your plan`}{searchUniverse.current ? ` · ${searchUniverse.current} ETFs to choose from` : ""}</p></>}</MenuButton>
                {/* task #390 (developer file 34, T1): "Add to [select]" in the add row, after Import and ⋯ (the full-width "ETFs you add or upload go to" bar goes) */}
                {pfList.length > 1 && <label className="px-addto"><span>Add to</span><select aria-label="ETFs you add go to" value={goTo} onChange={(e) => (cur === "all" ? setGoTo(e.target.value) : setCur(e.target.value))}>
                  {pfList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}</>} />
          </div>
          <PageTabs set="portfolios" className="pf-sibs" />{/* task #310 part D: the three portfolios as page tabs under the title */}
          {d && d.count > 0 && <TopMoney t={money} all={live.map((e) => e.symbol)} noun={["ETF", "ETFs"]} pick={pick} onAddQty={addQty} onAddPf={() => setAdding(true)}
            onRename={(id, name) => { const m = name.trim(); if (!m) return "Give the account a name."; if (pfList.some((x) => x.id !== id && x.name.trim().toLowerCase() === m.toLowerCase())) return `You already have an account called ${m}. Try another name, such as "${m} (joint)".`;
              book.accounts.rename(id, m, pfList); toast("Account renamed."); return null; }}
            onRemove={(id) => { const nm = pfName(id); book.accounts.remove(id, pfList); setCur("all"); toast(`${nm} removed.`); }} />}
        </header>
        {panel === "import" && <section className="sp-sec mfp-import" aria-label="Import a broker file"><div className="sp-sec-h"><div><h2>Import a broker file</h2></div><button type="button" className="ptk-link" onClick={() => setPanel("")}>Close</button></div><ImportFile account={pfName(goTo)} here={(s) => book.own.some((h) => h.symbol === s && (h.pf ?? DEFAULT_PF) === goTo)} onDone={(its, useFile) => { setPanel("");
          let traded = 0;
          for (const it of its) {
            // developer file 31: an ETF from a tradebook brings its dated buys and sales (never a second history beside one already in the book)
            if (it.trades?.length) { const r = tradeRows(it.symbol, it.trades, book.rows, goTo, { pf: goTo }); if (r.first) book.store.update(r.first.id, { ...r.first.patch, pf: goTo }); r.adds.forEach((a) => book.store.add({ ...a, pf: goTo })); if (r.first || r.adds.length) traded++; }
          }
          // developer file 35: a holdings line into the account: added, or with "Use the file's quantities" its one buy takes the file's units
          const plain = its.filter((it) => !it.trades?.length), r = fileIntoAccount(book.own, plain, goTo, useFile);
          r.adds.forEach((a) => book.store.add(a)); r.updates.forEach((u) => book.store.update(u.id, u.patch));
          book.touch();
          const got = [...r.added, ...r.set], priced = plain.filter((x) => x.avg != null && got.includes(x.symbol)).map((x) => x.symbol);
          toast(fileMessage(pfName(goTo), r, { traded, priced, unpricedSet: r.updates.filter((u) => !u.patch.price).map((u) => u.symbol) })); }} /></section>}
        {adding && <AddPortfolioDialog taken={pfList.map((x) => x.name)} kinds={BROKERS} start={[["empty", "An empty account", "Add ETFs to it by name, then their buys."], ["file", "The broker's holdings file", "Brings each ETF with its quantity and average buy price."]]}
          onClose={() => setAdding(false)} onSave={({ name, broker, start }) => { const id = book.accounts.add({ name, broker }, pfList); setAdding(false); setCur(id); setGoTo(id); toast(`${name} added.`); if (start === "file") setPanel("import"); }} />}
        {book.err && <p className="pfx-warn" role="alert">{book.err}</p>}

        {q.isPending && silver && <div className="sp-sec" aria-busy="true"><b>Loading your ETFs…</b></div>}
        {q.isError && <div className="sp-sec" role="alert"><b>Your ETFs could not be loaded</b><p>{errText(q.error)}</p><button className="btn" onClick={() => q.refetch()}>Try again</button></div>}
        {d && !d.count && <section className="sp-sec mfp-empty" aria-labelledby="etp-empty-h"><h2 id="etp-empty-h">Your ETF portfolio is empty</h2>
          <p className="sp-note">Add an ETF by its name, NSE symbol, ISIN, fund house or the index it follows, or import a broker file. {limit} ETFs fit in your plan.</p>
          <div className="mfp-empty-b"><button type="button" className="btn primary" onClick={() => (document.querySelector(".ptk-input input") as HTMLInputElement | null)?.focus()}>Add an ETF</button>
            <button type="button" className="btn" onClick={() => setPanel("import")}>Import a broker file</button></div></section>}
        {d && d.count > 0 && <>
          {/* task #390 (developer file 34, Top 2–6): four calm crowned cards (What your ETFs cost, then the three views) and Since your last visit */}
          <div id="etp-tabsbox">
          {cost && <EtfCards cost={cost} asOf={cost.asOf ? dm(cost.asOf) : ""} cards={cards} colors={COLORS} view={view} onView={(v) => setView(v)} weighted={d.basis === "value"} />}
          {ins.data && wc.q.data && <EtfSince visit={wc.lastVisit ? dayMonth(wc.lastVisit) : null} fresh={wc.newN} onSee={() => openSec("etp-wc", "etfs")} />}
          </div>
          <ViewBar pick={pick} defs={VIEWS3.map((k) => ({ id: k, label: LABEL[k], color: COLORS[k] }))} view={view} onView={(v) => setView(v)} seen={seen} all={barSteps} onSec={onSec} away={inTable} step={step} onStep={setStep} />
          <StepCtx.Provider value={{ step, firstStep: steps[0]?.id ?? "" }}>
          <div id="etp-panel" role="region" aria-label={`${LABEL[view]} view`}>
            <MfAsOf parts={asOf} />
            {view === "etfs" && <>
              {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
              <Step id="etp-etfs" title="Your ETFs" line="">
              <EtfsTable d={d} rk={rk.data} rows={shown} lots={book.ready ? lots : undefined} view={tview} sort={sort} setSort={setSort}
                tools={<FilterRow rows={live} facets={facets} picks={picks} setPicks={setPicks} q={fq} setQ={setFq} text={ftext} find="Find an ETF" noun={["ETF", "ETFs"]} cols={VIEWS} col={tview}
                  setCol={(c) => { setTview(c as EtfView); setSort({ k: "name", dir: 1 }); }} stuck={inTable} lead={lead} shown={shown.length} />}
                actions={(e) => <EditSell name={e.symbol} sell={RECORD_SALE} held={heldIn(e.symbol)} onEdit={() => setDlg({ kind: "edit", symbol: e.symbol })} onSell={() => setDlg({ kind: "sell", symbol: e.symbol })} />}
                gone={(e) => <button type="button" className="mff-rm" aria-label={`Remove ${e.symbol}`} onClick={() => remove(e.symbol)}>Remove</button>} />
              <SoldList items={sold} all={cur === "all" && pfList.length > 1} pfName={pfName} onRemoveSale={(id) => book.store.remove(id)} noun={["ETF", "ETFs"]} />
              {kf("etfs", `What your ${live.length} ${live.length === 1 ? "ETF adds" : "ETFs add"} up to, from the table above and the sections below.`)}
              </Step>
              <Step id="etp-wc" title="What changed at the companies inside your ETFs" line={wcLine}>
              {wcHidden ? <section className="ptk-hz" aria-labelledby="wc-h-etf"><div className="ptk-hz-t"><h2 id="wc-h-etf">What changed at the companies inside your ETFs</h2><p>Hidden · From Discover: what the companies inside your ETFs filed in the last 90 days</p></div>
                <button type="button" className="ptk-hz-b" aria-expanded="false" aria-label="Show: What changed at the companies inside your ETFs" onClick={() => setWcHidden(false)}>Show ▾</button></section>
                : <div className="hz">
                  {ins.isPending ? <section className="sp-sec wc" aria-labelledby="wc-h-etf"><h2 id="wc-h-etf">What changed at the companies inside your ETFs</h2><p className="sp-note" aria-busy="true">Reading the companies inside your ETFs…</p></section>
                    : ins.isError ? <section className="sp-sec wc" aria-labelledby="wc-h-etf"><h2 id="wc-h-etf">What changed at the companies inside your ETFs</h2><p className="sp-note" role="status">The companies inside your ETFs could not be read right now, so what they filed is not shown. {errText(ins.error)}</p></section>
                    : <WhatChanged symbols={cos.map((c) => c.symbol)} listName="the companies inside your ETFs" countLabel="Inside your ETFs" listRef="etf" page="etf-portfolio" className="sp-sec wc ptk-wc" hId="wc-h-etf" id="what-changed"
                      title="What changed at the companies inside your ETFs" nameOf={(s) => coBy.get(s)?.name}
                      plain shortName={(s, n) => shortCo(n, s)}
                      help={<Info about="What changed at the companies inside your ETFs" text="Exchange filings from the last 90 days for the companies that make up 0.3% or more of your ETFs, grouped by kind. From Discover." how="An update is one kind of news from one company; a row may bundle several filings." />}
                      sub={(s) => { const c = coBy.get(s); return c ? insideLine(c) : undefined; }}
                      lede={(() => { const none = live.filter((e) => e.type?.key !== "indian" && e.type?.key !== "abroad").map((e) => e.symbol); return `From Discover: companies that make up 0.3% or more of your ETFs and filed one of these in the last 90 days.${none.length ? ` ${andList(none)} hold${none.length === 1 ? "s" : ""} no companies.` : ""}${!cos.length ? " None of your ETFs holds a company at 0.3% or more of the list." : ""}`; })()}
                      foot={(() => { const sh = und?.shareEtfs ?? []; return sh.length ? `${andList(sh)} hold ${und && und.companies ? aboutN(und.companies).toLowerCase() : "their"} companies between them; smaller holdings than 0.3% of your ETFs are left out here and open in Discover with Only my names. Holdings from each fund house's file${ins.data?.asOf ? ` of ${dm(ins.data.asOf)} ${ins.data.asOf.slice(0, 4)}` : ""}.` : ""; })()} />}
                  <button type="button" className="hz-btn hz-on" aria-expanded="true" aria-label="Hide: What changed at the companies inside your ETFs" onClick={() => setWcHidden(true)}>{EYE}Hide</button></div>}
              </Step>
            </>}
            {view === "inside" && <>
              {ins.isPending && <p className="sp-note" aria-busy="true">Reading what sits inside your ETFs…</p>}
              {ins.isError && <p className="sp-note" role="status">What sits inside your ETFs could not be read right now. {errText(ins.error)}</p>}
              {ins.data && ins.data.count > 0 && <InsideTab d={d} ins={ins.data} rk={rk.data} kf={kf("inside", "What sits inside, from the sections above and below.")} />}
            </>}
            {view === "risk" && <>
              {rk.isPending && <p className="sp-note" aria-busy="true">Working out the risk figures…</p>}
              {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
              {rk.data && rk.data.count > 0 && <RiskTab rk={rk.data} d={d} ins={ins.data} kf={kf("risk", "What the risk adds up to, from the figures above and the sections below.")}
                value={money.n && money.withQty === money.n ? { now: money.now, name: cur === "all" ? "All accounts" : pfName(cur) } : null} />}
            </>}
            {hasShort && <Step id="etp-short" title="What this means, in short" line=""><InShort d={d} ins={ins.data} rk={rk.data} /></Step>}
            {next}
          </div>
          </StepCtx.Provider>
        </>}
        {dlg?.kind === "edit" && book.ready && <EditDialog key={dlg.symbol} noun="ETF" symbol={dlg.symbol} holdings={book.rows} pfs={dlgPfs} pf0={firstPf(dlg.symbol)} ops={book.store} newRow={dlg.fresh}
          onRemove={(pf) => remove(dlg.symbol, pfList.length > 1 ? pf : "all")} onClose={() => setDlg(null)} />}
        {dlg?.kind === "sell" && book.ready && <SellDialog key={dlg.symbol} record symbol={dlg.symbol} holdings={book.rows} pfs={dlgPfs} pf0={firstPf(dlg.symbol)} ops={book.store} price={priceOf(dlg.symbol)} onClose={() => setDlg(null)} />}
      </Gate>
      <PageBottom kind="etf" sources={SOURCES} />
    </div></VisitFolds></KnowPop.Provider>
  );
}
