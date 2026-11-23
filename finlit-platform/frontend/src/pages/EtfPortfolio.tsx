// ETF portfolio (task #136; rebuilt for task #183 part 3; task #276, the 20 Nov pack): the member's ETFs on the shared portfolio parts (portfolio/kit). The compact
// top (title row with the add box; the money box that says what it covers; Your portfolios), "What your ETFs cost" and the three views drawn as tabs, the view
// bar (Bar B) that gives way to the table's filter row inside the long table, filters in one row, Edit | Sell under each ETF, Key figures under the main section
// of each view, What changed at the companies inside your ETFs (Discover, with Alert me), a Next view card, What this means in short, the questions and the
// sources line. Figures are the server's (/api/me/etf-portfolio, /inside, /risk); words come from lib/etfKeyFigs, lib/etfTop and etf/pack. Silver and Gold, up
// to the plan's number of ETFs. Describes; never advice. Information only, not investment advice.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { PageFaqs } from "../components/PageFaqs";
import { PortfolioDisclaimer } from "../components/PortfolioDisclaimer";
import { ClearPortfolio } from "../components/ClearPortfolio";
import { Tip } from "../components/sectors/pack/Common";
import { WhatChanged, useWhatChanged } from "../components/changes/WhatChanged";
import { useDocTitle } from "../lib/title";
import { TIER, useUI } from "../lib/ui";
import { limitsFor, useAuth } from "../lib/auth";
import { etfGet, useEtfSearch, type EtfList } from "../lib/etf";
import { avgBySymbol, etfRowsFromFile, toSend, useEtfInside, useEtfPortfolio, useEtfRisk, useEtfWrites, type EtfRow, type Preview, type RawRow } from "../lib/etfPortfolio";
import { furthest, type EtfTab } from "../lib/etfTop";
import { aboutN, costCard, dm, etfKeyFigures, insideCompanies, insideLine, typeStack, underneath } from "../lib/etfKeyFigs";
import { jumpTo } from "../portfolio/pack/PageTop";
import { AddPortfolioDialog, BROKERS, GoTo, type PfInfo } from "../portfolio/Portfolios";
import { SoldList, soldOf } from "../portfolio/MoneyRow";
import { VIEW_COLOR } from "../portfolio/ViewKit";
import type { LotsProps } from "../portfolio/HoldingCells";
import { aggOf, ledgerOf, moneyOf } from "../lib/ledger";
import { DEFAULT_PF } from "../lib/portfolio";
import { tradeRows } from "../lib/importAdd";
import type { Trade } from "../lib/tradeColumns";
import { fileIntoAccount, fileMessage, useEtfBook } from "../lib/etfBook";
import { AddBox, MenuButton, type Resolved, type Sugg } from "../portfolio/kit/AddBox";
import { TopMoney } from "../portfolio/kit/TopMoney";
import { NextView, ViewCards, useSeenViews, type ViewCard } from "../portfolio/kit/ViewCards";
import { AccountPicker, SectionsMenu, ViewBar, ViewSeg, useInside, useStepInView, type Pick, type ViewSteps } from "../portfolio/kit/ViewBar";
import { FilterRow, applyFilters, type Facet, type Picks } from "../portfolio/kit/FilterRow";
import { EditDialog, EditSell, SellDialog } from "../portfolio/kit/HoldingDialog";
import { KeyFigsBox } from "../portfolio/kit/KeyFigsBox";
import type { KfGo } from "../portfolio/kit/keyFigs";
import { EYE, useHidden } from "../portfolio/kit/KitSection";
import "../portfolio/holdings-kit.css";
import { EtfsTable, VIEWS, type EtfView, type Sort } from "../etf/pack/EtfList";
import { InsideTab } from "../etf/pack/EtfInside";
import { RiskTab } from "../etf/pack/EtfRisk";
import { InShort, SOURCES } from "../etf/pack/EtfShort";
import "../portfolio/pack/pagetop.css";
import "../styles/mfportfolio.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../mf/pack/mf-pack.css";
import "../styles/etfportfolio.css";
import "../portfolio/kit/kit.css";
import { PLAN_FOR_PORTFOLIO } from "../lib/planGates";
import { PageTabs } from "../components/PageTabs";

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
/** Each view's numbered steps in Bar B (the sections in the page's order). Exported for tests. */
export const etfSteps = (newN: number): ViewSteps<EtfTab> => ({
  etfs: { label: "Your ETFs", steps: [{ id: "etp-etfs", label: "Your ETFs" }, { id: "etp-kf-etfs", label: "Key figures" }, { id: "wc-h-etf", label: "What changed", ...(newN ? { badge: `${newN} new` } : {}) }, { id: "etp-short-h", label: "In short" }] },
  inside: { label: "What's inside", steps: [{ id: "etp-own", label: "What they own" }, { id: "etp-kf-inside", label: "Key figures" }, { id: "etp-money", label: "Money in" }, { id: "etp-secin", label: "Sectors in each" },
    { id: "etp-move", label: "Move together" }, { id: "etp-shared", label: "Shared stocks" }, { id: "etp-sizes", label: "Company sizes" }, { id: "etp-largest", label: "Largest stocks" }, { id: "etp-short-h", label: "In short" }] },
  risk: { label: "Risk analytics", steps: [{ id: "etp-glance", label: "At a glance" }, { id: "etp-kf-risk", label: "Key figures" }, { id: "etp-build", label: "Beta build" }, { id: "etp-n500", label: "Against the Nifty 500" },
    { id: "etp-fall", label: "If the market fell" }, { id: "etp-share", label: "Risk share" }, { id: "etp-each", label: "Each ETF" }, { id: "etp-short-h", label: "In short" }] },
});

/** "What your ETFs cost": the score card of this page (each ETF's expense ratio). */
function CostCard({ d }: { d: NonNullable<ReturnType<typeof useEtfPortfolio>["data"]> }) {
  const c = costCard(d), max = Math.max(1, ...c.rows.map((r) => r.ter));
  return (
    <div className="ptk-score">
      <p className="ptk-sk">What your ETFs cost<Tip text="Each ETF's expense ratio: what it charges a year, as a share of the money in it, from AMFI's TER file. The average weighs each ETF like the list." how="Until quantities are added every ETF counts the same. A lower cost keeps more of the index's return." label="About “What your ETFs cost”" /></p>
      <p className="ptk-sline">{c.ter == null ? "No expense ratio is published for these ETFs yet" : <>Your ETFs cost <b>{c.ter.toFixed(2)}% a year</b></>}</p>
      {c.rows.length > 0 && <ul className="ptk-sbars" aria-label={`Expense ratio a year: ${c.rows.map((r) => `${r.symbol} ${r.ter.toFixed(2)}%`).join(", ")}`}>
        {c.rows.map((r) => <li key={r.symbol}><span>{r.symbol}</span><i aria-hidden="true"><b style={{ width: `${(r.ter / max) * 100}%` }} /></i><b>{r.ter.toFixed(2)}%</b></li>)}</ul>}
      {c.missing.map((m) => <p key={m.symbol} className="ptk-sx">{m.symbol}: {m.why}</p>)}
      {c.perLakh != null && <p className="ptk-sx">About ₹{c.perLakh.toLocaleString("en-IN")} a year on ₹1 lakh.{c.asOf ? ` AMFI, ${dm(c.asOf)}.` : ""}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- page */
export function EtfPortfolioPage() {
  useDocTitle("ETF portfolio", "What your ETFs track, what they cost, how close they trade to their value, what sits inside them and how risky they are together.");
  const { plan, has, toast } = useUI();
  const { user } = useAuth();
  const silver = has(PLAN_FOR_PORTFOLIO);
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
  const view = (["inside", "risk"].includes(params.get("view") || "") ? params.get("view") : "etfs") as EtfTab;
  const setView = (v: EtfTab, scroll = false) => { const p = new URLSearchParams(params); if (v === "etfs") p.delete("view"); else p.set("view", v); setParams(p, { replace: true }); if (scroll) setTimeout(() => document.getElementById("etp-tabsbox")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50); };
  const seen = useSeenViews("etf-portfolio", user?.id, view);
  const [panel, setPanel] = useState<"" | "import">(params.get("tab") === "import" ? "import" : "");
  const limit = d?.limit ?? limitsFor(plan).etf_holdings;
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
  const steps = etfSteps(wc.newN);
  const onSec = (v: EtfTab, id: string) => { if (v !== view) { setView(v); setTimeout(() => jumpTo(id), 80); } else jumpTo(id); };
  const goTab = (t: EtfTab) => { setView(t); setTimeout(() => document.getElementById("etp-tabsbox")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50); };
  const onGo = useCallback((g: KfGo) => {
    if (g.kind === "jump") jumpTo(g.arg);
    else { setTview(g.kind === "cols" ? (g.arg as EtfView) : "returns"); if (g.kind === "sort") setSort({ k: g.arg, dir: -1 }); setTimeout(() => jumpTo("etp-etfs"), 40); }
  }, []);
  // a jump to a section of another view opens that view first (Key figures' links, All sections)
  const viewRef = useRef(view); viewRef.current = view;
  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent).detail as string, all = etfSteps(0);
      const t = (Object.keys(all) as EtfTab[]).find((k) => all[k].steps.some((s) => s.id === id) && !all[viewRef.current].steps.some((s) => s.id === id));
      if (t && t !== viewRef.current) { setView(t); setTimeout(() => jumpTo(id, false), 80); } };
    addEventListener("eq-jump", on); return () => removeEventListener("eq-jump", on);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (sym: string, pf: string | "all" = cur) => {
    if (pf !== "all" && pfList.length > 1) { book.own.filter((h) => h.symbol === sym && (h.pf ?? DEFAULT_PF) === pf).forEach((h) => book.store.remove(h.id)); toast(`${sym} removed from ${pfName(pf)}.`); return; }
    try { await w.remove.mutateAsync(sym); book.own.filter((h) => h.symbol === sym).forEach((h) => book.store.remove(h.id)); toast(`${sym} removed.`); } catch (x) { toast(errText(x)); } };
  const heldIn = (sym: string) => (cur === "all" ? pfList.reduce((a, p) => a + (ledgerOf(book.rows, sym, p.id).qty ?? 0), 0) : ledgerOf(book.rows, sym, cur).qty ?? 0);
  const firstPf = (sym: string) => (cur !== "all" ? cur : aggOf(book.rows, sym, "all")?.pfs.find((p) => book.own.some((h) => h.symbol === sym && (h.pf ?? DEFAULT_PF) === p)) ?? goTo);
  const addQty = () => { const e = live.find((x) => !(aggOf(book.rows, x.symbol, cur)?.qty)) ?? live[0]; if (e) setDlg({ kind: "edit", symbol: e.symbol, fresh: true }); };
  const searchUniverse = useRef<number | null>(null);
  const useResults = (qq: string) => { const r = useEtfResults(qq); if (r.universe) searchUniverse.current = r.universe; return r; };
  const full = !!d && d.count >= limit;
  const ownSteps = steps[view].steps.map((s) => s.id), here = useStepInView(ownSteps);
  const lead: ReactNode = <><AccountPicker p={pick} compact /><ViewSeg defs={(Object.keys(LABEL) as EtfTab[]).map((k) => ({ id: k, label: k === "risk" ? "Risk" : LABEL[k], color: COLORS[k] }))} view={view} onView={(v) => goTab(v)} seen={seen} />
    <SectionsMenu all={steps} view={view} onSec={onSec} here={here} label="Sections ▾" btnClass="ptk-btn ptk-secb" mode="view" /></>;
  const [wcHidden, setWcHidden] = useHidden("etp-wc");
  const lastDay = d?.asOf ? dm(d.asOf) : null;
  const und = d ? underneath(ins.data, d) : null;
  const far = furthest(d);
  const cards: ViewCard<EtfTab>[] = d ? [
    { id: "etfs", k: "Your ETFs", tone: "good", color: COLORS.etfs, what: WHAT.etfs, v: (() => { const c = costCard(d); return c.ter == null ? "Cost not published" : `${c.ter.toFixed(2)}% a year`; })(),
      x: `Average cost of your ${live.length} ${live.length === 1 ? "ETF" : "ETFs"}${far.far && Math.abs(far.far.premium as number) >= 0.1 ? `; ${far.far.symbol} trades ${Math.abs(far.far.premium as number).toFixed(2)}% ${(far.far.premium as number) > 0 ? "above" : "below"} its value` : ""}`,
      viz: <span className="ptk-stk">{typeStack(d).map((t) => <i key={t.key} style={{ flex: t.v, background: t.color }} />)}</span> },
    { id: "inside", k: "What's inside", tone: "info", color: COLORS.inside, what: WHAT.inside,
      v: und && und.companies ? `${aboutN(und.companies)} companies` : ins.isPending ? "Reading the files…" : `${new Set(live.map((e) => e.tracks.key ?? e.symbol)).size} indexes`,
      x: und && und.companies ? `Through ${und.shareEtfs.length} share ${und.shareEtfs.length === 1 ? "ETF" : "ETFs"} · ${und.sizes} sizes · ${und.macros} macro sectors` : ins.isError ? "What sits inside could not be read right now" : "What your ETFs hold, and how alike they are",
      viz: ins.data ? <span className="ptk-stk">{([["indian", "#0e6471"], ["gold", "#b8892f"], ["silver", "#8fa8a6"], ["abroad", "#4b4fc4"], ["debt", "#9aa3ad"]] as const).filter(([k]) => (ins.data!.mix[k] ?? 0) > 0.05).map(([k, c]) => <i key={k} style={{ flex: ins.data!.mix[k], background: c }} />)}</span> : undefined },
    { id: "risk", k: "Risk analytics", tone: "watch", color: COLORS.risk, what: WHAT.risk,
      v: (() => { const b = rk.data?.own?.list.beta500 ?? rk.data?.own?.list.betaOwn; return b == null ? (rk.isPending ? "Working it out…" : "–") : `${b < 0.9 ? "Lower" : b > 1.1 ? "Higher" : "In line"} · β ${b.toFixed(2)}`; })(),
      x: rk.data?.list.swing != null && rk.data.bench.swing != null ? `Swings ${rk.data.list.swing.toFixed(1)}% a year; the Nifty 500 ${rk.data.bench.swing.toFixed(1)}%` : rk.data?.list.why ?? (rk.isError ? errText(rk.error) : "Against the Nifty 500"),
      viz: rk.data?.list.swing != null && rk.data.bench.swing != null ? (() => { const l = rk.data!.list.swing!, b = rk.data!.bench.swing!, m = Math.max(l, b); return <span className="ptk-viz2"><span>List</span><i style={{ width: `${(l / m) * 100}%` }} /><b>{l.toFixed(1)}%</b><span>Index</span><i className="ix" style={{ width: `${(b / m) * 100}%` }} /><b>{b.toFixed(1)}%</b></span>; })() : undefined },
  ] : [];
  const kf = (v: EtfTab, sub: string) => d ? <KeyFigsBox id={`etp-kf-${v}`} sub={sub} cards={etfKeyFigures(v, { d, ins: ins.data, rk: rk.data })} onGo={onGo} /> : null;
  const next = <NextView k={LABEL[NEXT[view]]} what={WHAT[NEXT[view]]} color={COLORS[NEXT[view]]} onGo={() => goTab(NEXT[view])} />;
  const dlgPfs = pfList.map((p) => ({ id: p.id, name: p.name }));
  return (
    <div className="wrap ipo mp sp mfp efp pfx">
      <Gate tier={PLAN_FOR_PORTFOLIO} title="Track your ETFs" points={["What each ETF tracks and costs, and how close it trades to its NAV", "What sits inside them: asset mix, overlap and the largest stocks", "Each ETF against the Nifty 500, and the list together", "Import a broker file, read by ISIN, then symbol"]}>
        <header className="ptk-head card" id="etp-top">
          <div className="ptk-t1">
            <div className="ptk-ht"><h1 className="ui-title">ETF portfolio</h1><p className="ptk-plan mfp-plan"><span>{TIER[plan].n}</span></p>
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
                  <p>{d ? `${d.count} ${d.count === 1 ? "ETF" : "ETFs"} · ${limit} on your plan` : `${limit} on your plan`}{searchUniverse.current ? ` · ${searchUniverse.current} ETFs to choose from` : ""}</p></>}</MenuButton></>} />
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
        <GoTo list={pfList} value={goTo} onChange={(id) => (cur === "all" ? setGoTo(id) : setCur(id))} noun="ETFs" />
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
          <ViewCards score={<CostCard d={d} />} cards={cards} view={view} onView={(v) => setView(v)} seen={seen} tabsId="etp-tabsbox" panel="etp-panel" label="What your ETFs cost and the views" />
          <ViewBar pick={pick} defs={(Object.keys(LABEL) as EtfTab[]).map((k) => ({ id: k, label: LABEL[k], color: COLORS[k] }))} view={view} onView={(v) => setView(v)} seen={seen} all={steps} onSec={onSec} away={inTable} />
          <div id="etp-panel" role="tabpanel" aria-labelledby={`ptk-tab-${view}`}>
            {view === "etfs" && <>
              {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
              <EtfsTable d={d} rk={rk.data} rows={shown} lots={book.ready ? lots : undefined} view={tview} sort={sort} setSort={setSort}
                tools={<FilterRow rows={live} facets={facets} picks={picks} setPicks={setPicks} q={fq} setQ={setFq} text={ftext} find="Find an ETF" noun={["ETF", "ETFs"]} cols={VIEWS} col={tview}
                  setCol={(c) => { setTview(c as EtfView); setSort({ k: "name", dir: 1 }); }} stuck={inTable} lead={lead} shown={shown.length} />}
                actions={(e) => <EditSell name={e.symbol} held={heldIn(e.symbol)} onEdit={() => setDlg({ kind: "edit", symbol: e.symbol })} onSell={() => setDlg({ kind: "sell", symbol: e.symbol })} />}
                gone={(e) => <button type="button" className="mff-rm" aria-label={`Remove ${e.symbol}`} onClick={() => remove(e.symbol)}>Remove</button>} />
              <SoldList items={sold} all={cur === "all" && pfList.length > 1} pfName={pfName} onRemoveSale={(id) => book.store.remove(id)} noun={["ETF", "ETFs"]} />
              {kf("etfs", `What your ${live.length} ${live.length === 1 ? "ETF adds" : "ETFs add"} up to, from the table above and the sections below.`)}
              {wcHidden ? <section className="ptk-hz" aria-labelledby="wc-h-etf"><div className="ptk-hz-t"><h2 id="wc-h-etf">What changed at the companies inside your ETFs</h2><p>Hidden · From Discover: what the companies inside your ETFs filed in the last 90 days</p></div>
                <button type="button" className="ptk-hz-b" aria-expanded="false" aria-label="Show: What changed at the companies inside your ETFs" onClick={() => setWcHidden(false)}>Show ▾</button></section>
                : <div className="hz">
                  {ins.isPending ? <section className="sp-sec wc" aria-labelledby="wc-h-etf"><h2 id="wc-h-etf">What changed at the companies inside your ETFs</h2><p className="sp-note" aria-busy="true">Reading the companies inside your ETFs…</p></section>
                    : ins.isError ? <section className="sp-sec wc" aria-labelledby="wc-h-etf"><h2 id="wc-h-etf">What changed at the companies inside your ETFs</h2><p className="sp-note" role="status">The companies inside your ETFs could not be read right now, so what they filed is not shown. {errText(ins.error)}</p></section>
                    : <WhatChanged symbols={cos.map((c) => c.symbol)} listName="the companies inside your ETFs" countLabel="Inside your ETFs" listRef="etf" page="etf-portfolio" className="sp-sec wc ptk-wc" hId="wc-h-etf" id="what-changed"
                      title="What changed at the companies inside your ETFs" nameOf={(s) => coBy.get(s)?.name}
                      sub={(s) => { const c = coBy.get(s); return c ? insideLine(c) : undefined; }}
                      lede={(() => { const none = live.filter((e) => e.type?.key !== "indian" && e.type?.key !== "abroad").map((e) => e.symbol); return `From Discover: companies that make up 0.3% or more of your ETFs and filed one of these in the last 90 days.${none.length ? ` ${none.join(" and ")} hold${none.length === 1 ? "s" : ""} no companies.` : ""}${!cos.length ? " None of your ETFs holds a company at 0.3% or more of the list." : ""}`; })()}
                      foot={(() => { const sh = und?.shareEtfs ?? []; return sh.length ? `${sh.join(" and ")} hold ${und && und.companies ? aboutN(und.companies).toLowerCase() : "their"} companies between them; smaller holdings than 0.3% of your ETFs are left out here and open in Discover with Only my names. Holdings from each fund house's file${ins.data?.asOf ? ` of ${dm(ins.data.asOf)} ${ins.data.asOf.slice(0, 4)}` : ""}.` : ""; })()} />}
                  <button type="button" className="hz-btn hz-on" aria-expanded="true" aria-label="Hide: What changed at the companies inside your ETFs" onClick={() => setWcHidden(true)}>{EYE}Hide</button></div>}
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
            {next}
          </div>
          <InShort d={d} ins={ins.data} rk={rk.data} />
        </>}
        {dlg?.kind === "edit" && book.ready && <EditDialog key={dlg.symbol} noun="ETF" symbol={dlg.symbol} holdings={book.rows} pfs={dlgPfs} pf0={firstPf(dlg.symbol)} ops={book.store} newRow={dlg.fresh}
          onRemove={(pf) => remove(dlg.symbol, pfList.length > 1 ? pf : "all")} onClose={() => setDlg(null)} />}
        {dlg?.kind === "sell" && book.ready && <SellDialog key={dlg.symbol} symbol={dlg.symbol} holdings={book.rows} pfs={dlgPfs} pf0={firstPf(dlg.symbol)} ops={book.store} price={priceOf(dlg.symbol)} onClose={() => setDlg(null)} />}
      </Gate>
      <PageFaqs inline />
      <details className="sp-sec sp-fold mfp-disc"><summary><span><b className="sp-ft">Disclaimer</b><small>What this page is, and is not</small></span><span className="sp-show">Show ▾</span></summary><PortfolioDisclaimer kind="etf" /></details>
      <p className="mfp-foot">{SOURCES}</p>
    </div>
  );
}
