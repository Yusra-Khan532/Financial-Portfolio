import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Gate } from "../components/Gate";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { TIER, useUI } from "../lib/ui";
import { limitsFor, useAuth } from "../lib/auth";
import { DEMO } from "../lib/demo";
import { rowsWithBseIds, useSearchIndex } from "../lib/api";
import { isinMap } from "../lib/searchFilters";
import { useUniverse } from "../lib/screener";
import { portfolio, usePortfolio, type Holding, type PState } from "../lib/portfolio";
import { aggOf, lotActions, moneyOf, pfOf } from "../lib/ledger";
import { DEFAULT_PF } from "../lib/portfolio";
import type { LotsProps } from "../portfolio/HoldingCells";
import { AddPortfolioDialog, AnalysingBar, MAX_PF, type PfInfo } from "../portfolio/Portfolios";
import { MoneyRow, SoldList, soldOf } from "../portfolio/MoneyRow";
import { ClearPortfolio } from "../components/ClearPortfolio";
import { EditWindow, SellWindow } from "../portfolio/EditSell";
import { AddSharesDialog, CompanyCombo, rowsToChanges, suggest, type AddRow, type AddTab } from "../portfolio/AddShares";
import type { CompanyHit } from "../lib/companySearch";
import { clearPortfolioServer, undoClearPortfolioServer } from "../lib/account";
import { PdfImport } from "../components/PdfImport";
import { ACCEPT, entriesAndAmountsFromFile, type Entry, type GridAmounts } from "../lib/holdingsFile";
import { addedMessage, attachAmounts, fileNotes, newHolding, tradeRows, tradesMessage, updateHeld, type Amounts, type ImportOpts } from "../lib/importAdd";
import { fundsFromMissing, fundsFromSkipped, stillSkipped } from "../lib/importFunds";
import { sendAllFunds, type ImportAccount } from "../lib/importEtf";
import { isPdf } from "../lib/holdingsPdf";
import { entryOf, makeMatcher, matchEntries, type Skipped, type ToCheck } from "../lib/holdingsMatch";
import { resolveIsins, sourcesLine } from "../lib/isin";
import { modelFor, parsePeriod, parseTab, pricesFrom, useOverview, withTab, type Line, type OverviewHolding, type Period, type Tab } from "../lib/portfolioOverview";
import { usePortfolioPage } from "../portfolio/usePortfolioPage";
import { loadChoices, saveChoices, usePortfolioScore, type Choices } from "../portfolio/useScore";
import { usePortfolioTrend } from "../portfolio/usePortfolioTrend";
import "../styles/mfspread.css";
import { SharesTable } from "../portfolio/SharesTable";
import { sectorColors, sectorOrder, plural } from "../portfolio/derive";
import { ADD_NOTE } from "../portfolio/words";
import type { Mode } from "../portfolio/types";
import "../portfolio/pf.css";
import { buttonClass } from "../components/ui";
import { capBucket } from "../lib/capBuckets";
import { useIndices } from "../lib/indices";
import { dayWord } from "../lib/dashPack";
import { useLeadershipList } from "../lib/leadership";
import { peerSentence, sharesCards, type Share, type Size } from "../lib/equityPack";
import { shareOf as buildShare } from "../lib/equityShares";
import type { TabKey } from "../lib/equityTop";
import { SectionsBar, SectionsMenu, jumpTo, type Sec } from "../portfolio/pack/PageTop";
import { HideButtons, HideSlim } from "../components/Hideable";
import { KeyAnswers } from "../portfolio/pack/KeyAnswers";
import { divAnswers, riskAnswers } from "../lib/keyAnswers";
import { OrderWinNotice, WhatChanged, FilingChip, useWhatChanged } from "../components/changes/WhatChanged";
import { useWatchlist } from "../lib/watchlist";
import { ThemePill, YourThemes, themeView } from "../portfolio/pack/EqThemes";
import { useBoard } from "../discovery/model";
import { EqTitle, MoneyBox, NextView, PfPicker, YourPortfolios, type DayMove } from "../portfolio/pack/EqTop";
import { DataAsOf, PageEnd, ScoreCards, SinceVisit, SixParts, dayOf, sinceText, type CardsInput } from "../portfolio/pack/EqTop385";
import { GainLossSection, Step, StepCtx, stepOf, type StepDef } from "../portfolio/pack/EqSteps385";
import { KeyFigures, Info, coName, countOf, namesInText, portfolioKeyFigs, shortCo, type GLRow } from "../portfolio/shared";
import { prismWord5 } from "../lib/equityTop";
import { holdingFigs } from "../portfolio/HoldingCells";
import { dayMonth } from "../lib/whatChanged";
import { GoldLock, InShort, Insights, LeadersSection, StyleTiltPack, PeersSection, TrendSection, SizeFold, eqViews, type View } from "../portfolio/pack/EquityPack";
import { StickySwitch } from "../portfolio/ViewKit";
import { BetaBuild, EachShareRisk, Fall10, RiskGlancePack, RiskShareSection, SizeBench, riskSplit, usePortfolioRisk } from "../portfolio/pack/RiskPack";
import { DivSubTabs, ShareGrid, SpreadPack, WhereSitsGrid, divFacts, type DivInput } from "../portfolio/pack/DivPack";
import { nseLevels } from "../lib/nseTaxonomy";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../styles/dashboard.css";
import "../portfolio/pack/equity-pack.css";
import { coTitle, subLine, titleOf } from "../lib/companyLabel";
import { PLAN_FOR_PORTFOLIO } from "../lib/planGates";

/** Equity portfolio: give it the names of the shares you own (typed, pasted or from a broker file) and it describes the list: how strong each share is, where the list sits by
 *  sector and size, what moves together, where the risk comes from and how the list has moved against the NIFTY 50. Names are enough; task #217 adds each share's buy history
 *  (date, quantity and price of every buy, the total quantity and the average price), entered by the member under the share.
 *  Every figure and every sentence comes from POST /api/portfolio/page (the handover pack's engine) and POST /api/portfolio/overview (live price and the plan's scores). */

/** The sections of each tab, in reading order (task #183): the sections bar numbers them; All sections lists the three tabs. */
/** The Upload tab's notes (task #274: the file notes moved from the page into Upload): what files work, and the CAS. */
const UPLOAD_NOTE = <>
  <p className="pfx-note eq-addnote">{ADD_NOTE}</p>
          <details className="pfx-note eq-cas"><summary>Shares at more than one broker, Groww included? Upload your CAS</summary>
            <p>A CAS (Consolidated Account Statement) from NSDL or CDSL lists the shares in every demat account you have, at every broker, with the number of shares. NSDL or CDSL emails it to you every month in which your holdings changed (look for "Consolidated Account Statement"), and both let you ask for one on their websites. Its password is usually your PAN in capitals.</p>
            <p>Upload the PDF here. It is read on your device; only the ISINs are sent, to be looked up, and the quantities are added up across your accounts. Nothing is sent to a broker.</p></details>
</>;

/** Task #385: the steps are built in the page (stepsOf), so the section bar and the steps cannot drift apart. Kept for reference: the live bar's names. */
export const SECS_274: Record<TabKey, { label: string; secs: Sec[] }> = {
  portfolio: { label: "Portfolio", secs: [["pf-shares", "Your shares"], ["eq-keys", "Key figures"], ["eq-wc", "What changed"], ["eq-trend", "Trends"], ["eq-peers", "Peers"], ["eq-leaders", "Group leaders"], ["eq-themes", "Themes"]] },
  // task #274 (change 17): the pack's steps for both views, each ending with What this means, in short
  diversification: { label: "Diversification analytics", secs: [["eq-where", "Where it sits"], ["eq-keysd", "Key figures"], ["eq-spread", "Spread"], ["eq-moves", "Moving together"], ["eq-grid", "Share by share"], ["eq-style", "Style tilt"], ["eq-short", "What this means"]] },
  risk: { label: "Risk analytics", secs: [["eq-rg", "At a glance"], ["eq-keysr", "Key figures"], ["eq-build", "Beta build"], ["eq-sizeb", "Size benchmarks"], ["eq-mr", "Risk share"], ["eq-fall", "If the market fell"], ["eq-each", "Each share"], ["eq-short", "What this means"]] },
};

export function HoldingsPage() {
  useDocTitle("Equity portfolio", "Add the shares you own, by name or from a broker file, and see how strong each one is, how spread out the list is, what moves together and where the risk comes from.");
  const { plan, toast, has } = useUI();
  const { seesAll, limits, plan: myPlan } = useAuth();
  const qc = useQueryClient();
  const model = modelFor(plan, seesAll);          // Gold: FinLit Prism. Silver: no company score (task #283). Basic: the page is gated.
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab")), period = parsePeriod(params.get("period"));
  const go = (t: Tab, pd: Period = period) => setParams(withTab(params.toString(), t, pd), { replace: true });
  const st = usePortfolio();
  // Task #235 (pack B1): the member's portfolios (one per broker account) and the one picked (?pf=, All accounts by default). Everything below follows it.
  const pfList: PfInfo[] = useMemo(() => (st.portfolios?.length ? st.portfolios : [{ id: DEFAULT_PF, name: "My portfolio" }]), [st.portfolios]);
  const cur: string | "all" = params.get("pf") && pfList.some((x) => x.id === params.get("pf")) ? (params.get("pf") as string) : "all";
  const setCur = (id: string | "all") => { const n = new URLSearchParams(params); if (id === "all") n.delete("pf"); else n.set("pf", id); setParams(n, { replace: true }); };
  const [goToSel, setGoTo] = useState(pfList[0].id);
  const goTo = cur !== "all" ? cur : pfList.some((x) => x.id === goToSel) ? goToSel : pfList[0].id;
  const pfName = (id: string) => pfList.find((x) => x.id === id)?.name ?? "My portfolio";
  const pfField = (id: string) => (id !== DEFAULT_PF ? { pf: id } : {});
  // developer file 32: the portfolio an import goes into, for the ETF portfolio's matching account (its ETFs go there, never over another account's units)
  const importAcct = (id: string): ImportAccount => { const p = pfList.find((x) => x.id === id); return { id, name: pfName(id), ...(p?.broker ? { broker: p.broker } : {}), mainName: pfName(DEFAULT_PF) }; };
  const [adding, setAdding] = useState(false);
  const uni = useUniverse(), idx = useSearchIndex(true);
  const by = useMemo(() => new Map((uni.data?.rows || []).map((r) => [r.symbol, r])), [uni.data]);
  const index = useMemo(() => rowsWithBseIds(idx.data), [idx.data]);   // with each BSE scrip ID, so "SPICY" in a broker's file finds BSE 540084
  // task #385 (developer file 33, live bug 2): the share limit is the plan limit the server sends with the member (/api/auth/me), never written in the page;
  // an admin previewing another plan reads that plan's limits
  const cap = (!seesAll && plan === myPlan && limits?.holdings) || limitsFor(plan).holdings;
  const [one, setOne] = useState(""), [missing, setMissing] = useState<string[]>([]);
  // task #274 (pack change 1): the Add shares window (Add: with the picked company; Add several: empty; Import ▾: Paste a list or Upload) and the Import menu
  const [addWin, setAddWin] = useState<{ tab: AddTab; pre: CompanyHit | null } | null>(null);
  // task #274 (pack change 3): Edit | Sell under each share open these windows
  const [esWin, setEsWin] = useState<{ what: "edit" | "sell"; symbol: string } | null>(null);
  const [checks, setChecks] = useState<(ToCheck & Amounts)[]>([]), [skipped, setSkipped] = useState<Skipped[]>([]), [readBy, setReadBy] = useState<string | null>(null);
  // task #323: what an import read and what it could not (the file's notes), and where its ETFs went
  const [impNotes, setImpNotes] = useState<string[]>([]), [etfNote, setEtfNote] = useState(""), [etfPf, setEtfPf] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [pdf, setPdf] = useState<File | null>(null);
  const matcher = useMemo(() => makeMatcher(index), [index]);
  const localBefore = useRef<PState | null>(null), addBox = useRef<HTMLInputElement>(null);   // Clear portfolio: the list as it was, if the server cannot be reached for Undo
  const mode: Mode = "eq";   // the final pages pack reads the list as equal amounts throughout

  // the selected portfolio's shares, less those sold in full (they are in the Sold list); the plan's limit counts every share across the portfolios
  const allSymbols = useMemo(() => [...new Set(st.holdings.map((h) => h.symbol))].filter((s) => aggOf(st.holdings, s, "all")?.qty !== 0), [st.holdings]);
  // a holding sold in full stays while its buy and sale rows are being edited (kept), and moves to the Sold list once focus leaves them (pack B14)
  const [kept, setKept] = useState<Set<string>>(new Set());
  const symbols = useMemo(() => [...new Set(st.holdings.filter((h) => cur === "all" || pfOf(h) === cur).map((h) => h.symbol))].filter((s) => aggOf(st.holdings, s, cur)?.qty !== 0 || kept.has(s)), [st.holdings, cur, kept]);
  const inTarget = useMemo(() => new Set(st.holdings.filter((h) => pfOf(h) === goTo).map((h) => h.symbol)), [st.holdings, goTo]);
  // task #274 (change 1): what each suggestion shows beside the name (size and the latest close), and the shares already held ("In your list")
  const heldSet = useMemo(() => new Set(allSymbols), [allSymbols]);
  const coInfo = (sym: string) => { const u = by.get(sym); return { size: capBucket(u?.market_cap ?? null)?.short ?? null, close: u?.price ?? null }; };
  const ov = useOverview(symbols, !!model && !DEMO);
  // developer file 27: Your portfolios, the picker and the sticky switch show every portfolio, so they need every account's prices (as the MF and ETF pages
  // do). In All accounts `ov` already holds them (the same symbols, the same request), so this asks only while one portfolio is open.
  const ovAll = useOverview(allSymbols, !!model && !DEMO && cur !== "all");
  const pg = usePortfolioPage(symbols, !!model && !DEMO);
  const tr = usePortfolioTrend(symbols, model === "prism" && !DEMO);
  const rk = usePortfolioRisk(symbols, !!model && !DEMO);   // Risk analytics by company size (task #183 W8)   // Gold only (FinLit Prism); Silver sees the lock card
  const [choices, setChoices] = useState<Choices>(() => loadChoices());
  const pick = (c: Choices) => { setChoices(c); saveChoices(c); };
  // what is left of each share in the selected portfolio, first in, first out (task #235): the score weighs by it
  const qtyBySymbol = useMemo(() => { const m = new Map<string, number>(); symbols.forEach((s) => { const q = aggOf(st.holdings, s, cur)?.qty; if (q) m.set(s, q); }); return m; }, [st.holdings, symbols, cur]);
  // task #235 (pack B9, B11): each holding's buys and sales, first in, first out within its portfolio. A bare quantity (a statement import) is set only on a
  // share with no buys yet in that portfolio; it never replaces a history.
  const acts = useMemo(() => lotActions(() => portfolio.get().holdings, portfolio), []);
  const onQty = (sym: string, qty: number | null) => {
    const mine = st.holdings.filter((h) => h.symbol === sym && pfOf(h) === goTo);
    if (!mine.length || mine.some((h) => h.owned)) return;
    portfolio.update(mine[0].id, qty ? { qty, owned: true } : { qty: 1, owned: false });
  };
  const [openLots, setOpenLots] = useState<Set<string>>(new Set()), [focus, setFocus] = useState<LotsProps["focus"]>(null);
  useEffect(() => { setKept((k) => { const n = new Set([...openLots].filter((s) => aggOf(st.holdings, s, cur)?.qty === 0)); return n.size === k.size && [...n].every((x) => k.has(x)) ? k : new Set([...k, ...n]); }); }, [openLots, st.holdings, cur]);
  useEffect(() => {
    const out = () => setTimeout(() => {
      const leave = [...kept].filter((s) => !document.activeElement?.closest(`[data-lsym="${CSS.escape(s)}"]`) && aggOf(portfolio.get().holdings, s, cur)?.qty === 0);
      if (!leave.length) return;
      setKept((k) => new Set([...k].filter((x) => !leave.includes(x)))); setOpenLots((o) => new Set([...o].filter((x) => !leave.includes(x))));
      setTimeout(() => { const box = document.getElementById("pf-sold"), t = box?.querySelector<HTMLButtonElement>(".x-sold-t"); if (t?.getAttribute("aria-expanded") === "false") t.click();
        box?.scrollIntoView?.({ behavior: "smooth", block: "center" }); box?.classList.add("x-flash"); setTimeout(() => box?.classList.remove("x-flash"), 2300); }, 60);
    }, 0);
    document.addEventListener("focusout", out); return () => document.removeEventListener("focusout", out);
  }, [kept, cur]);
  const scoreOn = model === "prism" && !DEMO;
  const sc = usePortfolioScore(symbols.map((s) => ({ symbol: s, qty: qtyBySymbol.get(s) ?? null })), choices, scoreOn);
  const byOv = useMemo(() => new Map((ov.data?.holdings || []).map((h) => [h.symbol, h])), [ov.data]);
  const lines: Line[] = useMemo(() => symbols.map((s) => ({ symbol: s, ov: byOv.get(s), name: by.get(s)?.name || index.find((r) => r[0] === s)?.[1] || "" })), [symbols, by, byOv, index]);
  useEffect(() => { if (!DEMO && symbols.length && uni.data && lines.some((l) => !l.ov)) { const t = setInterval(() => qc.invalidateQueries({ queryKey: ["universe"] }), 20_000); return () => clearInterval(t); } }, [symbols.length, uni.data, lines, qc]);

  const data = pg.data, page = data?.page ?? null, meta = data?.meta ?? {};
  const colors = useMemo(() => (page ? sectorColors(sectorOrder(page, "eq")) : {}), [page]);
  const ovMap = byOv as Map<string, OverviewHolding>;
  const priceOf = (sym: string) => { const o = byOv.get(sym); return o && o.status === "ready" ? o.price : null; };
  const changeOf = (sym: string) => { const o = byOv.get(sym); return o && o.status === "ready" ? o.changePct : null; };
  const lots: LotsProps = {
    holdings: st.holdings, cur, pfName, nPortfolios: pfList.length, priceOf, changeOf, goTo, open: openLots, focus,
    // task #274 (pack change 3): the buys open in the Edit window, not as rows inside the table ("add a buy", "add a buy price", the score box's Add buys)
    onOpen: (sym, on) => { if (on) setEsWin({ what: "edit", symbol: sym }); setOpenLots((c) => { const n = new Set(c); if (on) n.add(sym); else n.delete(sym); return n; }); },
    add: (sym, pf, side) => { acts.add(sym, pf, side); setOpenLots((c) => new Set([...c, sym])); setFocus(null); },
    edit: (id, patch) => acts.edit(id, patch),
    remove: (id) => { acts.remove(id); toast("Removed."); },
  };
  const money = moneyOf(st.holdings.filter((h) => symbols.includes(h.symbol) || cur === "all" || pfOf(h) === cur), cur, priceOf, changeOf);
  const openFor = (sym: string, what: "qty" | "price") => { void what; setView("portfolio"); setEsWin({ what: "edit", symbol: sym }); };   // task #274: Edit holds the buys (a share with none opens with one empty row)
  const byAll = useMemo(() => new Map((ovAll.data?.holdings || []).map((h) => [h.symbol, h])), [ovAll.data]);
  const every = useMemo(() => pricesFrom(byOv, byAll), [byOv, byAll]);
  const pfFigs = (id: string | "all") => { const m = moneyOf(st.holdings, id, every.priceOf, every.changeOf); return { n: m.n, now: m.now, withQty: m.withQty, gainPct: m.full && m.invested ? (m.gain / m.invested) * 100 : null, noPrice: m.noPrice.length }; };
  const sold = soldOf(st.holdings, cur);
  const ids = data?.symbols ?? symbols;
  const state: "loading" | "ready" | "error" | "none" = DEMO ? "none" : pg.isError ? "error" : pg.isPending && symbols.length ? "loading" : "ready";

  // Task #128: every line is matched by its ISIN when it has one (the company list's ISINs, then POST /api/isin/resolve); its name is used only when it has none.
  const isinOf = useMemo(() => isinMap(idx.data), [idx.data]);
  // Task #183 (ISIN is the key): every saved share carries its ISIN; a share whose symbol changed (ZOMATO → ETERNAL) follows its ISIN to the new one.
  useEffect(() => {
    if (!isinOf?.size) return;
    const bySymbol = new Set(index.map((r) => r[0])), symbolOf = new Map([...isinOf].map(([sym, i]) => [i, sym]));
    for (const h of st.holdings) {
      if (!h.isin && isinOf.get(h.symbol)) portfolio.update(h.id, { isin: isinOf.get(h.symbol) });
      else if (h.isin && !bySymbol.has(h.symbol) && symbolOf.get(h.isin)) portfolio.update(h.id, { symbol: symbolOf.get(h.isin)! });
    }
  }, [isinOf, st.holdings, index]);
  /** Task #323: a share already in the target portfolio takes the statement's quantity, and its buy price when it has none; a share with buys of its own
   *  keeps them (task #235: a bare quantity never replaces a history). True when something changed. */
  const applyHeld = (sym: string, a: Amounts, o: ImportOpts = {}) => {
    const mine = st.holdings.filter((h) => h.symbol === sym && pfOf(h) === goTo);
    if (!mine.length || mine.some((h) => h.owned)) return false;
    const patch = updateHeld(mine[0], a, o);
    if (patch) portfolio.update(mine[0].id, patch);
    return !!patch;
  };
  const add = async (entries: Entry[], from?: string, confirmNames = !!from, amounts?: GridAmounts) => {
    if (!entries.length) { toast(from ? `No shares found in ${from}. It should have a column with the ISINs or the share names (ISIN, Symbol, Stock, Instrument or Company).` : "No share names found. Put one ISIN, name or ticker per line, or paste the ISIN or Name column from your broker."); return; }
    if (!index.length) { toast("The company list is still loading. Try again in a moment."); return; }
    const isins = entries.flatMap((e) => (e.isin ? [e.isin] : []));
    if (isins.length) setBusy(true);
    const res = isins.length ? await resolveIsins(isins, idx.data) : null;
    setBusy(false);
    const m = matchEntries(entries, index, res?.answers ?? null, confirmNames), { skipped: skip, byIsin } = m;
    // task #323: each line's quantity and average buy price come along (spreadsheets: lib/holdingsFile entriesWithAmounts)
    const found = attachAmounts(m.found, entries), check = attachAmounts(m.check, entries);
    const fresh = [...new Map(found.filter((f) => !inTarget.has(f.symbol)).map((f) => [f.symbol, f])).values()];
    const room = Math.max(0, cap - allSymbols.length) + fresh.filter((f) => allSymbols.includes(f.symbol)).length, take = fresh.slice(0, room);
    // developer file 31: a share with trades (a tradebook, or a holdings file with a buy date) comes in as its dated buys and sales (lib/importAdd tradeRows);
    // the others as before, with one line's quantity and average buy price
    const plainTake = take.filter((f) => !f.trades?.length);
    if (plainTake.length) portfolio.addMany(plainTake.map((f) => ({ ...newHolding(f, f.isin || isinOf?.get(f.symbol)), ...pfField(goTo) })));
    const updated = found.filter((f) => !f.trades?.length && inTarget.has(f.symbol) && f.qty != null && applyHeld(f.symbol, f)).length;
    const tradeSet = new Map<string, { isin?: string; trades: NonNullable<Amounts["trades"]> }>();
    for (const f of found) if (f.trades?.length && (inTarget.has(f.symbol) || take.some((t) => t.symbol === f.symbol))) {
      const x = tradeSet.get(f.symbol); tradeSet.set(f.symbol, { isin: x?.isin ?? f.isin ?? isinOf?.get(f.symbol), trades: [...(x?.trades ?? []), ...f.trades.filter((t) => !x?.trades.includes(t))] });
    }
    const tr = { shares: 0, buys: 0, sells: 0, already: 0, kept: [] as string[] }, tradeAdds: Omit<Holding, "id">[] = [];
    const before = portfolio.get().holdings;
    tradeSet.forEach((x, sym) => {
      const r = tradeRows(sym, x.trades, before, goTo, x.isin ? { isin: x.isin } : {}, amounts?.book?.kind === "dated");
      if (r.kept) { tr.kept.push(sym); return; }
      if (r.first) portfolio.update(r.first.id, r.first.patch);
      tradeAdds.push(...r.adds); tr.buys += r.buys; tr.sells += r.sells; tr.already += r.already;
      if (r.buys + r.sells && !inTarget.has(sym)) tr.shares++;
    });
    if (tradeAdds.length) portfolio.addMany(tradeAdds);
    const taken = new Set([...symbols, ...take.map((f) => f.symbol)]);
    // task #323 (file 21, part 13): a broker's report names ETFs by symbol; lines that named no listed company are tried as ETFs, for the ETF portfolio.
    // Developer file 34: and lines left out by an ISIN of a fund unit (INF…), as a report with an ISIN column names its ETFs
    const byIsinFunds = amounts && has(PLAN_FOR_PORTFOLIO) && !DEMO ? fundsFromSkipped(skip, entries) : [];
    const funds = amounts && has(PLAN_FOR_PORTFOLIO) && !DEMO ? [...fundsFromMissing(m.missing, entries), ...byIsinFunds] : [];
    let miss = m.missing, skipLeft = skip, etfByIsin = 0;
    setEtfNote(""); setEtfPf(null);
    if (funds.length) {
      try {
        const sent = await sendAllFunds(funds, importAcct(goTo));
        const notEtf = new Set(sent.notAdded.map((x) => x.toUpperCase()));
        miss = miss.filter((x) => !funds.some((f) => f.input === x) || notEtf.has(x.toUpperCase()));
        skipLeft = stillSkipped(skip, byIsinFunds, sent.notAdded);
        etfByIsin = byIsinFunds.filter((f) => !notEtf.has(f.input.toUpperCase())).length;
        setEtfNote(sent.msg); setEtfPf(sent.pf);
      } catch { setEtfNote("The ETF lines could not be sent to your ETF portfolio just now; add them on the ETF portfolio page."); }
    }
    setMissing(miss); setChecks(check.filter((c) => !taken.has(c.symbol))); setSkipped(skipLeft);
    setImpNotes(amounts ? fileNotes(amounts, take) : []);
    // 22 Nov 2026: how the lines without an ISIN were matched: by an exact NSE or BSE symbol or code (added), or by name (to check)
    const byCode = m.found.filter((f) => f.code).length, rest = entries.length - isins.length;
    const tail = rest ? ` ${rest} without an ISIN: ${[byCode ? `${byCode} matched by their NSE or BSE symbol or code` : "", rest > byCode ? `${rest - byCode} by name (to check) or not recognised` : ""].filter(Boolean).join(", ")}.` : "";
    setReadBy(isins.length ? `${byIsin} of ${entries.length} ${entries.length === 1 ? "line" : "lines"} matched by ISIN${etfByIsin ? ` to a company, and ${etfByIsin} to ${etfByIsin === 1 ? "an ETF" : "ETFs"} (for your ETF portfolio)` : ""}, against ${sourcesLine(res?.sources ?? null)}.${tail}`
      : from && byCode ? `${byCode} of ${entries.length} ${entries.length === 1 ? "line" : "lines"} matched by their NSE or BSE symbol or code${check.length ? `; ${check.length} by name, to check` : ""}.` : null);
    const plainHead = amounts ? addedMessage("file", plainTake, updated, amounts.price).replace(/\.$/, "") : take.length ? `Added ${take.length} ${take.length === 1 ? "share" : "shares"}` : "Nothing new to add";
    const head = amounts?.book ? [tradesMessage({ ...tr, dated: !!amounts.book.day, kind: amounts.book.kind }).replace(/\.$/, ""), plainTake.length || updated ? plainHead : ""].filter(Boolean).join("; ") : plainHead;
    toast([head, check.length ? `${check.length} to check (listed below)` : "", skipLeft.length ? `${skipLeft.length} not added (reasons below)` : "",
      miss.length ? `${miss.length} not recognised (listed below)` : "", fresh.length > room ? `your plan holds up to ${cap}` : ""].filter(Boolean).join(" · ") + ".");
  };
  /** The Add shares window's rows: a row with a quantity is a buy, one without follows the share by name (rowsToChanges); the plan's limit holds. */
  const saveRows = (rows: AddRow[]) => {
    const ch = rowsToChanges(rows, st.holdings, isinOf);
    const newSyms = new Set(ch.adds.map((a) => a.symbol).filter((x) => !allSymbols.includes(x)));
    if (allSymbols.length + newSyms.size > cap) { toast(`Your plan holds up to ${cap} shares. Remove a row or two and save again.`); return; }
    if (ch.adds.length) portfolio.addMany(ch.adds);
    ch.updates.forEach((u) => portfolio.update(u.id, u.patch));
    toast([ch.shares ? `${ch.shares} ${ch.shares === 1 ? "share" : "shares"} added` : "", ch.buys ? `${ch.buys} ${ch.buys === 1 ? "buy" : "buys"} saved` : ""].filter(Boolean).join(", ") + ".");
  };
  const addChecked = (c: ToCheck) => {
    if (inTarget.has(c.symbol)) { setChecks((xs) => xs.filter((x) => x !== c)); return; }
    if (!allSymbols.includes(c.symbol) && allSymbols.length >= cap) { toast(`Your plan holds up to ${cap} shares.`); return; }
    portfolio.addMany([{ ...newHolding(c, c.isin || isinOf?.get(c.symbol)), ...pfField(goTo) }]); setChecks((xs) => xs.filter((x) => x.symbol !== c.symbol)); toast(`${c.symbol} added.`);
  };
  const empty = !lines.length;
  const common = page && model ? { page, meta, symbols: ids, mode, colors, model, ov: ovMap } : null;

  // ---------------------------------------------------------------- the final pages pack (boards 12-14)
  const view: View = params.get("view") === "diversification" ? "diversification" : params.get("view") === "risk" ? "risk" : "portfolio";
  const setView = (v: View, scroll = false) => { const n = new URLSearchParams(params); if (v === "portfolio") n.delete("view"); else n.set("view", v); setParams(n, { replace: true }); if (scroll) setTimeout(() => document.getElementById("eq-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  // task #235 (the 18 Nov pack, live bug E4): one read of every share's peer label, not one call per share (which failed under load with 503s)
  const leadList = useLeadershipList(symbols, !!model && !DEMO);
  const idxQ = useIndices(), day = dayWord(new Date(), idxQ.data?.asOf ?? null);
  // task #323: the same builder as the Watchlists page's equity sections (lib/equityShares)
  const shares: Share[] = useMemo(() => lines.map((l) => buildShare(l.symbol, l.name, l.ov, by.get(l.symbol), leadList.data, meta[l.symbol]))
  , [lines, by, leadList.data, meta]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shareOf = useMemo(() => new Map(shares.map((x) => [x.symbol, x])), [shares]);
  const sizeCount = useMemo(() => { const c = { Large: 0, Mid: 0, Small: 0, Micro: 0 } as Record<Size, number>; shares.forEach((x) => { if (x.size) c[x.size]++; }); return c; }, [shares]);
  // Diversification analytics (task #183 W7): each share's NSE levels (stored classification, else its industry's place in NSE's tree), size and score band
  const div: DivInput | null = useMemo(() => {
    if (!page) return null;
    const levelOf = (sym: string, l: "macro" | "sector" | "industry") => {
      const n = meta[sym]?.nse, o = byOv.get(sym), ind = o && o.status === "ready" ? o.industry : null, t = nseLevels(n?.industry ?? ind);
      const v = l === "macro" ? n?.macro_sector ?? t?.macro : l === "sector" ? n?.sector ?? t?.sector : n?.industry ?? t?.industry;
      return v || (l === "macro" ? meta[sym]?.sector : null) || "Not classified";
    };
    // task #283: the dot follows FinLit Prism on a plan with Prism; no dot otherwise
    const band = (sym: string) => { const x = shareOf.get(sym), w = model === "prism" ? x?.prismWord?.toUpperCase() : null;
      return !w ? null : w === "STRONG" || w === "HEALTHY" ? "g" : w === "AVERAGE" ? "m" : w === "WEAK" || w === "POOR" ? "b" : null; };
    return { page, symbols: ids, levelOf, sizeOf: (sym) => shareOf.get(sym)?.size ?? null, band, gold: model === "prism", nameOf: (sym) => meta[sym]?.name ?? sym };
  }, [page, ids, meta, byOv, shareOf, model]);
  // developer file 28: once every share has a quantity, the cards read the score's figures by value (the average Prism, the spread score, the NIFTY 50 measures)
  const scA = sc.data && !sc.data.locked ? sc.data : null, byValue = scA?.basis === "value" && scA.byValue ? scA.byValue : null;
  // task #274 (changes 2 and 16): the money box's day line and what the money covers, the three view cards, and the views opened once
  const dayCount = useMemo(() => {
    const xs = shares.filter((x) => x.chg != null).map((x): DayMove => ({ symbol: x.symbol, label: coName(x), chg: x.chg! }));   // task #385: short names
    const best = xs.length ? xs.reduce((a, b) => (b.chg > a.chg ? b : a)) : null, worst = xs.length ? xs.reduce((a, b) => (b.chg < a.chg ? b : a)) : null;
    return { up: xs.filter((x) => x.chg > 0).length, down: xs.filter((x) => x.chg < 0).length, best: best && best.chg > 0 ? best : null, worst: worst && worst.chg < 0 ? worst : null };
  }, [shares]);
  // task #323 (file 21, part 6): the shares really in the money (a share with no price today was never in `missing`, so "not missing" listed it as covered)
  const haveBuys = useMemo(() => { const cov = new Set(money.covered); return shares.filter((x) => cov.has(x.symbol)).map((x) => ({ symbol: x.symbol, label: coName(x) })); }, [shares, money.covered]);
  // task #274 (change 19): What changed at your companies, from Discover: the section (Your shares or Watchlist), the chip under each share for a filing
  // since the last visit, the notice over the table for a new order win, and "N new" on the step
  const wl = useWatchlist();
  const watchSyms = useMemo(() => [...new Set(wl.lists.flatMap((x) => x.symbols))].filter((x) => !symbols.includes(x)), [wl, symbols]);
  const onWatch = useMemo(() => new Set(wl.lists.flatMap((x) => x.symbols)), [wl]);
  const [wcList, setWcList] = useState<"equity" | "watch">("equity");
  const wcQ = useWhatChanged(DEMO ? [] : symbols, "equity-portfolio");
  // task #274 (change 20): Themes, from Discover: the pill beside the size, Your themes (Your shares or Watchlists) and the Theme filter on Your shares
  const boardQ = useBoard();
  const [thList, setThList] = useState<"shares" | "watch">("shares"), [themeF, setThemeF] = useState<string | null>(null);
  const thShares = useMemo(() => (boardQ.data ? themeView(boardQ.data, uni.data?.rows, symbols) : null), [boardQ.data, uni.data, symbols]);
  const thWatch = useMemo(() => (boardQ.data ? themeView(boardQ.data, uni.data?.rows, watchSyms) : null), [boardQ.data, uni.data, watchSyms]);
  const mainTheme = useMemo(() => { const m = new Map<string, { short: string; slug: string; name: string }>(); thShares?.themes.forEach((t) => t.mine.forEach((x) => m.set(x.s, { short: t.short, slug: t.slug, name: t.name }))); return m; }, [thShares]);
  const labelOf = (x: string) => { const y = shareOf.get(x); return y ? coName(y) : shortCo(meta[x]?.name, x); };
  const renamePf = (id: string, name: string) => { const n = name.trim(); if (!n) return "Give the portfolio a name."; if (pfList.some((x) => x.id !== id && x.name.trim().toLowerCase() === n.toLowerCase())) return `You already have a portfolio called ${n}. Try another name, such as "${n} (joint)".`;
    if (!st.portfolios?.length) portfolio.replace({ ...portfolio.get(), portfolios: pfList.map((x) => ({ ...x })) }); portfolio.renamePortfolio(id, n); toast("Portfolio renamed."); return null; };
  const riskSp = useMemo(() => (page && rk.data && div ? riskSplit(page, rk.data, (x) => div.levelOf(x, "macro")) : null), [page, rk.data, div]);

  // ---------------------------------------------------------------- task #385 (developer file 33)
  const nameOfSym = (sym: string) => { const y = shareOf.get(sym); return y ? coName(y) : shortCo(meta[sym]?.name ?? by.get(sym)?.name, sym); };
  // open item 10: one price date for the page, the latest close behind the shares' own prices (the title row and Data as of)
  const priceDay = useMemo(() => { const ds = (ov.data?.holdings ?? []).map((h) => (h.status === "ready" ? h.priceAsOf : null)).filter((d): d is string => !!d).sort(); return ds.length ? ds[ds.length - 1] : null; }, [ov.data]);
  // the four calm cards
  const cardsIn: CardsInput = useMemo(() => {
    const sc5 = shares.filter((x) => x.prism != null), mean = sc5.length ? sc5.reduce((a, x) => a + (x.prism as number), 0) / sc5.length : null;
    const avg = byValue?.prism ?? mean, words = ["Strong", "Healthy", "Average", "Weak", "Poor"];
    const sp = ids.length < 2 ? null : byValue?.spread ?? page?.score ?? null,   // a one-share list has no spread to read
    m = byValue?.market ?? page?.market.eq ?? null;
    return { locked: !scoreOn, score: scA ? { total: scA.total ?? null, band: scA.band ?? null } : null,
      strength: model === "prism" ? { avg, word: avg == null ? null : prismWord5(avg), byValue: byValue?.prism != null, counts: words.map((w): [string, number] => [w, sc5.filter((x) => prismWord5(x.prism as number) === w).length]) } : null,
      spread: sp ? { score: Math.round(sp.score), word: sp.band, byCount: byValue?.spread && page ? page.score.score : null } : null,
      risk: m ? { beta: m.beta, swing: m.vol, swingIndex: m.vol_nifty, bench: "NIFTY 50", byValue: !!byValue?.market, to: page?.to ?? null } : null };
  }, [shares, byValue, page, scA, scoreOn, model, ids]);
  const [sixOpen, setSixOpen] = useState(false);
  // since your last visit: the visit before this one (POST /api/visits/equity-portfolio) and the filings of the last 90 days
  const wcFiled = (wcQ.q.data?.companies ?? []).filter((c) => Object.keys(c.ev).length > 0).length;
  const since = sinceText(wcQ.lastVisit ? dayMonth(wcQ.lastVisit) : null, wcQ.newN, wcFiled, symbols.length, wcQ.rows.length, wcQ.q.data?.days ?? 90);
  // where the gain or loss came from: value now minus what was paid, for each share held now
  const glRows = useMemo(() => { const rows: GLRow[] = []; let noPrice = 0;
    symbols.forEach((sym) => { const f = holdingFigs(lots, sym); if (f.a?.qty === 0) return; if (f.gain == null) { if (f.a?.qty && f.a.invested == null) noPrice++; return; }
      rows.push({ symbol: sym, name: nameOfSym(sym), gain: f.gain, pct: f.gainPct }); });
    return { rows, noPrice }; }, [symbols, st.holdings, cur, byOv]);   // eslint-disable-line react-hooks/exhaustive-deps
  const hasLaggard = shares.some((x) => x.peer?.label === "laggard");
  const [leaderLine, setLeaderLine] = useState("");
  const inShortItems = useMemo(() => { const m = new Map<string, string>(); ids.forEach((x) => m.set(x, nameOfSym(x)));
    return (page?.summary.eq ?? []).map((r) => ({ ...r, text: namesInText(r.text, m) })); }, [page, ids, shareOf, meta]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the summary line of each folded section on a phone (All sections)
  const kf = portfolioKeyFigs(shares, model === "prism"), kfTrend = kf.find((c) => c.q === "Are their prices rising?");
  const lines385 = {
    wc: !wcQ.q.data ? "Reading what your companies filed…" : `${countOf(wcQ.rows.length, "update")} from ${wcFiled} of your ${countOf(symbols.length, "company")} in the last ${wcQ.q.data.days ?? 90} days`,
    trend: kfTrend ? `${kfTrend.big} ${kfTrend.ans}${kfTrend.sub ? ` · ${kfTrend.sub}` : ""}` : "Where each share's short-term trend sits against its long-term one",
    peers: peerSentence(shares).split(/(?<=\.)\s/)[0],
    leaders: "Your laggards against the #1 share of their peer group",
    themes: thShares ? `${thShares.placed} of ${countOf(thShares.total, "share")} ${thShares.placed === 1 ? "is" : "are"} placed in a theme; ${countOf(thShares.themes.length, "main theme")} between them.` : "Reading Discover's themes…",
  };
  // one section at a time: the steps of each view (Portfolio's first step holds Your shares, the gain or loss and Key figures)
  const stepsOf = (v: View): StepDef[] => v === "portfolio" ? [
      { id: "pf-shares", label: "Your shares", secs: ["pf-shares", "eq-gl", "eq-keys", "pf-sold"] },
      ...(DEMO ? [] : [{ id: "eq-wc", label: "What changed", secs: ["eq-wc"], badge: wcQ.newN ? `${wcQ.newN} new` : undefined }]),
      { id: "eq-trend", label: "Trends", secs: ["eq-trend"] }, { id: "eq-peers", label: "Peers", secs: ["eq-peers"] },
      ...(model !== "prism" || hasLaggard ? [{ id: "eq-leaders", label: "Group leaders", secs: ["eq-leaders"] }] : []),
      ...(DEMO ? [] : [{ id: "eq-themes", label: "Themes", secs: ["eq-themes"] }]),
      ...(inShortItems.length ? [{ id: "eq-short", label: "In short", secs: ["eq-short"] }] : [])]
    : v === "diversification" ? [{ id: "eq-spread", label: "Spread", secs: ["eq-spread"] }, { id: "eq-where", label: "Where it sits", secs: ["eq-where"] }, { id: "eq-keysd", label: "Key figures", secs: ["eq-keysd"] },
      { id: "eq-moves", label: "Moving together", secs: ["eq-moves", "eq-sectors", "eq-groups", "eq-sizes"] }, { id: "eq-grid", label: "Share by share", secs: ["eq-grid"] }, { id: "eq-style", label: "Style tilt", secs: ["eq-style"] },
      ...(inShortItems.length ? [{ id: "eq-short", label: "In short", secs: ["eq-short"] }] : [])]
    : [{ id: "eq-rg", label: "At a glance", secs: ["eq-rg"] }, { id: "eq-keysr", label: "Key figures", secs: ["eq-keysr"] }, { id: "eq-build", label: "Beta build", secs: ["eq-build", "eq-read"] }, { id: "eq-sizeb", label: "Size benchmarks", secs: ["eq-sizeb"] },
      { id: "eq-mr", label: "Risk share", secs: ["eq-mr"] }, { id: "eq-fall", label: "If the market fell", secs: ["eq-fall"] }, { id: "eq-each", label: "Each share", secs: ["eq-each"] },
      ...(inShortItems.length ? [{ id: "eq-short", label: "In short", secs: ["eq-short"] }] : [])];
  const steps = stepsOf(view);
  const secsLive: Record<View, { label: string; secs: Sec[] }> = { portfolio: { label: "Portfolio", secs: stepsOf("portfolio").map((x): Sec => [x.id, x.label, x.badge]) },
    diversification: { label: "Diversification analytics", secs: stepsOf("diversification").map((x): Sec => [x.id, x.label]) }, risk: { label: "Risk analytics", secs: stepsOf("risk").map((x): Sec => [x.id, x.label]) } };
  const [stepBy, setStepBy] = useState<Partial<Record<View, string>>>({});
  const step = stepBy[view] && (stepBy[view] === "all" || steps.some((x) => x.id === stepBy[view])) ? stepBy[view]! : steps[0]?.id ?? "all";
  /** Show the step that holds a section (or "all"); `jump` then scrolls to the section, otherwise to the top of the view when the page is below it. */
  const goStep = (id: string, jump = true) => {
    const to = id === "all" ? "all" : stepOf(stepsOf(view), id) ?? stepOf(steps, id) ?? id;
    setStepBy((x) => ({ ...x, [view]: to }));
    setTimeout(() => { const el = jump && id !== to ? document.getElementById(id) : null; if (el) { jumpTo(id); return; }
      const bar = document.getElementById("eq-panel"); if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, 80);
  };
  const showAllSecs = () => goStep("all", false);
  useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (typeof id === "string") goStep(id); }; addEventListener("eq-step", f); return () => removeEventListener("eq-step", f); });
  const asOfParts = [priceDay ? `Prices: close of ${dayOf(priceDay)}` : "",
    ...(view === "portfolio" ? [`Filings: the last ${wcQ.q.data?.days ?? 90} days`, thShares?.updated ? `Themes: to ${dayOf(thShares.updated, true)}` : ""] : []),
    ...(view === "diversification" ? ["Moving together: the past year of weekly closes"] : []),
    ...(view === "risk" && rk.data?.to ? [`Risk figures: weekly closes to ${dayOf(rk.data.to)}`] : [])].filter(Boolean);

  return (
    <HideSlim.Provider value={true}><HideButtons.Provider value={false}><div className="wrap ipo pfx sp eq">
      <Gate tier={PLAN_FOR_PORTFOLIO} title="Score your portfolio" points={["FinLit Prism for every share you own (Gold)", "How spread out the list is, and what moves together", "Share of risk and the NIFTY 50 comparison", "Import Excel, CSV or PDF statements"]}>
        <div className="pfx-flow">
        <section className="card eqx-top" aria-label="Equity portfolio">
          <EqTitle plan={TIER[plan].n} asOf={priceDay ?? idxQ.data?.asOf} add={<>
          <form className="pfx-add" onSubmit={(e) => { e.preventDefault(); const t = one.trim(); if (!t) { setAddWin({ tab: "search", pre: null }); return; }
            const hit = suggest(index, t, isinOf)[0]; if (hit) { setOne(""); setAddWin({ tab: "search", pre: hit }); } else { void add([entryOf(t)]); setOne(""); } }}>
            <label className="pfx-input"><Icon name="search" />
              <CompanyCombo index={index} isin={isinOf} held={heldSet} info={coInfo} label="Add a share by name, symbol or ISIN" inputRef={addBox} value={one} onChange={setOne}
                onPick={(h) => { setOne(""); setAddWin({ tab: "search", pre: h }); }} /></label>
            <button className={buttonClass("primary", "md", "pfx-solid")}>{busy ? "Reading…" : "Add shares"}</button>
            <input ref={file} type="file" accept={ACCEPT + ",.pdf,application/pdf"} hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setAddWin(null); if (isPdf(f)) { setPdf(f); return; } setBusy(true);
              try { const r = await entriesAndAmountsFromFile(f, matcher); await add(r.entries, f.name, true, r.amounts); } catch (err) { toast(err instanceof Error && err.message.startsWith("That file") ? err.message : "That file could not be read. Save it as .xlsx or .csv, or paste the share names instead."); } finally { setBusy(false); } }} />
          </form>
          </>} more={<>
            <button type="button" role="menuitem" onClick={() => setAddWin({ tab: "search", pre: null })}><b>Add several</b><small>Several shares in one window</small></button>
            <button type="button" role="menuitem" onClick={() => setAddWin({ tab: "paste", pre: null })}><b>Import: paste a list</b><small>Names, symbols or ISINs, one a line</small></button>
            <button type="button" role="menuitem" onClick={() => setAddWin({ tab: "upload", pre: null })}><b>Import: upload a broker file or CAS</b><small>Excel, CSV or PDF; read by ISIN</small></button>
            <span className="eqx-menu-sep" role="separator" /></>} clear={<>
            <ClearPortfolio count={symbols.length} noun="share" kind="equity" className="eqx-clear" goes={["the quantities you added", "the figures worked out from them: score, diversification and risk"]}
              onClear={async () => { const before = portfolio.get(); await clearPortfolioServer(); localBefore.current = before; portfolio.reset(); }}
              onUndo={async () => {
                try { const r = await undoClearPortfolioServer(); portfolio.replace({ holdings: r.holdings as PState["holdings"] }); }
                catch (x) { if ((x as { status?: number }).status === 410) throw new Error("The clear is final: Undo is only possible for 10 seconds."); if (localBefore.current) portfolio.restore(localBefore.current); }
              }} />
          </>} />


          {esWin && (() => { const nm = meta[esWin.symbol]?.name ?? by.get(esWin.symbol)?.name ?? esWin.symbol, tt = titleOf({ symbol: esWin.symbol, name: nm });
            return esWin.what === "edit" ? <EditWindow p={lots} symbol={esWin.symbol} title={tt} name={nm} onClose={() => setEsWin(null)}
              onRemove={(pf) => { st.holdings.filter((h) => h.symbol === esWin.symbol && (pf === "all" || pfOf(h) === pf)).forEach((h) => portfolio.remove(h.id)); toast(`${tt} removed.`); }} />
              : <SellWindow p={lots} symbol={esWin.symbol} title={tt} name={nm} onClose={() => setEsWin(null)} onSave={(sale) => { portfolio.addMany([sale]); toast(`Sale of ${tt} recorded.`); }} />; })()}
          {addWin && <AddSharesDialog tab={addWin.tab} pre={addWin.pre} index={index} isin={isinOf} held={heldSet} info={coInfo} pfs={pfList} defaultPf={goTo} onClose={() => setAddWin(null)}
            onUpload={() => file.current?.click()} uploadNote={UPLOAD_NOTE} onSave={(rows) => { saveRows(rows); setAddWin(null); }} />}
          {pdf && <PdfImport file={pdf} index={index} search={idx.data} held={symbols} heldQty={qtyBySymbol} room={Math.max(0, cap - allSymbols.length)} etf={has(PLAN_FOR_PORTFOLIO) && !DEMO} onClose={() => setPdf(null)}
            account={importAcct(goTo)}
            onAdd={(picks, info) => {   // task #191: a statement brings each share's quantity; task #323: and its average buy price, or the Rate when chosen
              const o: ImportOpts = { rateAsBuy: info.rateAsBuy };
              const fresh = picks.filter((p) => !inTarget.has(p.symbol)), set = picks.filter((p) => inTarget.has(p.symbol) && p.qty);
              if (fresh.length) portfolio.addMany(fresh.map((p) => ({ ...newHolding(p, p.isin || isinOf?.get(p.symbol), o), ...pfField(goTo) })));
              const updated = set.filter((p) => applyHeld(p.symbol, p, o)).length;
              setImpNotes([]); setEtfNote(info.etf); setEtfPf(info.etfPf ?? null);
              toast(addedMessage("PDF", fresh, updated, info.price, { ...o, rateCol: info.rateCol, rateOn: info.rateOn }) + (info.etf ? ` ${info.etf}` : "")); }} />}
          {impNotes.length > 0 && <p className="pfx-note eq-imp-notes" role="note">{impNotes.join(" ")}</p>}
          {etfNote && <p className="pfx-note eq-imp-etf" role="status">{etfNote} <Link to={etfPf ? `/etf-portfolio?pf=${encodeURIComponent(etfPf)}` : "/etf-portfolio"}>Open ETF portfolio ↗</Link></p>}
          {readBy && <p className="pfx-note eq-isin-src" role="status">{readBy}</p>}
          {checks.length > 0 && <div className="pf-miss eq-isin" role="status"><b>Please check {checks.length === 1 ? "this line" : `these ${checks.length} lines`} (not added yet):</b>{checks.length > 1 && <button type="button" className="pfx-btn eq-addall" onClick={() => { const room = Math.max(0, cap - allSymbols.length), take = checks.filter((c) => !inTarget.has(c.symbol)).slice(0, room); portfolio.addMany(take.map((c) => ({ ...newHolding(c, c.isin || isinOf?.get(c.symbol)), ...pfField(goTo) }))); setChecks([]); toast(`Added ${take.length} ${take.length === 1 ? "share" : "shares"}.`); }}>Add all {checks.length}</button>}
            <ul>{checks.slice(0, 20).map((c) => <li key={c.symbol + (c.isin || c.input)}><span>{c.input}{c.isin && c.input !== c.isin ? ` (${c.isin})` : ""} → <b title={coTitle(c)}>{titleOf(c)}</b> {subLine(c, c.name)}. <small>{c.note}.</small></span>
              <button type="button" className="pfx-btn" onClick={() => addChecked(c)}>Add {c.symbol}</button></li>)}</ul>
            {checks.length > 20 && <small>and {checks.length - 20} more, not shown: Add all {checks.length} adds them too.</small>}</div>}
          {skipped.length > 0 && <div className="pf-miss eq-isin" role="status"><b>Not added ({skipped.length}):</b>
            <ul>{skipped.slice(0, 20).map((x) => <li key={x.isin}><span>{x.input}{x.input !== x.isin ? ` (${x.isin})` : ""}: {x.note}</span></li>)}</ul>{skipped.length > 20 && <small>and {skipped.length - 20} more.</small>}</div>}
          {missing.length > 0 && <p className="pf-miss" role="status"><b>Not recognised:</b> {missing.slice(0, 20).join(", ")}{missing.length > 20 ? ` and ${missing.length - 20} more` : ""}. Check the spelling, or use the NSE ticker or the ISIN.</p>}
          {!empty && <div className="eqx-t2">
            <MoneyBox t={money} up={dayCount.up} down={dayCount.down} best={dayCount.best} worst={dayCount.worst} have={haveBuys} onAdd={() => { const m = money.missing[0]; if (m) openFor(m.symbol, m.what); }}
              picker={<PfPicker list={pfList} cur={cur} figs={pfFigs} onPick={(id) => { setCur(id); setOpenLots(new Set()); }} />} />
            <YourPortfolios list={pfList} cur={cur} figs={pfFigs} max={MAX_PF} onPick={(id) => { setCur(id); setOpenLots(new Set()); }} onAdd={() => setAdding(true)}
              onRename={renamePf} onRemove={(id) => { const name = pfName(id); portfolio.removePortfolio(id); setCur("all"); toast(`${name} removed.`); }} />
          </div>}
        </section>
        {adding && <AddPortfolioDialog taken={pfList.map((x) => x.name)} onClose={() => setAdding(false)}
          onSave={({ name, broker, start }) => { if (!st.portfolios?.length) portfolio.replace({ ...portfolio.get(), portfolios: pfList.map((x) => ({ ...x })) });
            const id = portfolio.addPortfolio({ name, broker }); setAdding(false); setCur(id); setGoTo(id); toast(`${name} added.`);
            if (start !== "empty") setTimeout(() => file.current?.click(), 80); }} />}

        {empty ? <div className="card dw-empty"><span className="dw-ei"><Icon name="wallet" /></span><b>No shares yet</b><p>Add a share by its name, symbol or ISIN, or upload the holdings file from your broker. {DEMO ? "" : <>You can also <Link to="/watchlist">start from your watchlist</Link>.</>}</p><span className="eq-empty-go"><button type="button" className={buttonClass("secondary", "md", "pfx-solid")} onClick={() => addBox.current?.focus()}>Add a share</button><button type="button" className="pfx-btn" onClick={() => file.current?.click()}>Upload broker file</button></span>
          {money.nSales > 0 && <MoneyRow t={money} onAdd={openFor} />}
          {sold.length > 0 && <SoldList items={sold} all={cur === "all" && pfList.length > 1} pfName={pfName} nameOf={(sym) => meta[sym]?.name ?? sym} onRemoveSale={(id) => portfolio.remove(id)} />}</div> : model && <>
          <div className="eqx-row2" id="eq-tabs">
            <ScoreCards c={cardsIn} view={view} onView={(v) => setView(v)} sixOpen={sixOpen} onSix={() => setSixOpen((o) => !o)} />
            {scA && scA.readings && <SixParts s={scA} choices={choices} onChoices={pick} nameOf={nameOfSym} open={sixOpen} />}
            {!DEMO && <SinceVisit lead={since.lead} rest={since.rest} onSee={() => { setView("portfolio"); goStep("eq-wc"); }} />}
          </div>
          {data && data.unknown.length > 0 && <p className="pfx-warn" role="status">Not in FinLit's company list, so left out of the figures: {data.unknown.join(", ")}.</p>}
          {DEMO && <p className="pfx-note" role="status">The diversification figures are not available in the demo preview.</p>}
          {state === "error" && <p className="pfx-warn" role="alert">{pg.error?.body?.detail || "The figures for this list could not be loaded. Try again in a moment."}</p>}
          <SectionsBar tab={view} all={secsLive} steps onAll={showAllSecs} step={step} onStep={(id) => goStep(id, false)} onTab={(t, then) => { setView(t); if (then) setTimeout(() => goStep(then), 120); }}
            lead={<StickySwitch list={pfList} cur={cur} onPick={(id) => { setCur(id); setOpenLots(new Set()); }} figs={pfFigs} defs={eqViews(lines.length)} view={view} onView={(v) => setView(v)} tabsId="eq-tabs" fresh={[]} />} />
          <StepCtx.Provider value={{ step, firstStep: steps[0]?.id ?? "" }}>
          <div id="eq-panel" role="region" aria-label={`${view === "portfolio" ? "Portfolio" : view === "diversification" ? "Diversification" : "Risk"} view`}>
          <DataAsOf parts={asOfParts} />
          {view !== "portfolio" && <AnalysingBar list={pfList} cur={cur} onPick={(id) => { setCur(id); setOpenLots(new Set()); }} n={symbols.length} />}
          {view === "portfolio" && <>
            <Step id="pf-shares" title="Your shares" line="">
            <OrderWinNotice row={wcQ.notice} page="equity-portfolio" />
            <SharesTable chip={(sym) => <FilingChip row={wcQ.chip(sym)} />} themePill={(sym) => <ThemePill t={mainTheme.get(sym) ?? null} name={meta[sym]?.name ?? by.get(sym)?.name ?? sym} />}
              theme={themeF ? { label: thShares?.themes.find((t) => t.name === themeF)?.short ?? themeF, has: (sym) => mainTheme.get(sym)?.name === themeF, onClear: () => setThemeF(null) } : null} stuckLead={<>
              <StickySwitch list={pfList} cur={cur} onPick={(id) => { setCur(id); setOpenLots(new Set()); }} figs={pfFigs} defs={eqViews(lines.length)} view={view} onView={(v) => setView(v)} tabsId="eq-tabs" fresh={[]} />
              <SectionsMenu secs={secsLive.portfolio.secs} here="pf-shares" isHidden={() => false} show={(id) => goStep(id)} onAll={() => goStep("all", false)} /></>}
              lots={lots} editSell={{ onEdit: (sym) => setEsWin({ what: "edit", symbol: sym }), onSell: (sym) => setEsWin({ what: "sell", symbol: sym }) }} qtyOf={(sym) => qtyBySymbol.get(sym) ?? null} onQty={onQty} lines={lines} meta={meta} page={page} mode={mode} colors={colors} model={model} tab={tab} period={period} limit={cap} state={ov.isError ? "error" : ov.isPending && !DEMO ? "loading" : "ready"}
              errorText={DEMO ? "Scores are not available in the demo preview." : ov.error?.body?.detail} onTab={(t) => go(t)} onPeriod={(pd) => go("financials", pd)}
              peerOf={(sym) => shareOf.get(sym)} day={day} cards={tab === "overview" ? <div className="eq-cards"><Insights items={sharesCards(shares, day).map((c) => { const m = new Map(shares.map((x) => [x.symbol, coName(x)])); return { ...c, title: namesInText(c.title, m), text: namesInText(c.text, m) }; })} scope="eq.shares" /></div> : null}
              actions={(sym) => <button className="pfx-x" aria-label={`Remove ${sym}`} title={`Remove ${sym}${cur === "all" ? "" : ` from ${pfName(cur)}`}`} onClick={() => { st.holdings.filter((h) => h.symbol === sym && (cur === "all" || pfOf(h) === cur)).forEach((h) => portfolio.remove(h.id)); toast(`${sym} removed.`); }}>×</button>} />
            <SoldList items={sold} all={cur === "all" && pfList.length > 1} pfName={pfName} nameOf={(sym) => meta[sym]?.name ?? sym} onRemoveSale={(id, sym) => { portfolio.remove(id); setOpenLots((c) => new Set([...c, sym]));
              setTimeout(() => { const r = document.getElementById(`lots-${sym}`)?.previousElementSibling as HTMLElement | null; r?.classList.add("x-flash"); r?.scrollIntoView?.({ behavior: "smooth", block: "center" }); setTimeout(() => r?.classList.remove("x-flash"), 2300); }, 150); }} />
            {cur !== "all" || pfList.length >= 1 ? <GainLossSection rows={glRows.rows} noPrice={glRows.noPrice} /> : null}
            <KeyFigures id="eq-keys" sub={`What your ${countOf(lines.length, "share")} add up to, from the table above and the sections below.`} cards={portfolioKeyFigs(shares, model === "prism", (x) => holdingFigs(lots, x).now)} about="Key figures, Portfolio" />
            <SizeFold counts={sizeCount} />
            </Step>
            {!DEMO && <Step id="eq-wc" title="What changed at your companies" line={lines385.wc}><WhatChanged title="What changed at your companies" symbols={wcList === "equity" ? symbols : watchSyms} listName={wcList === "equity" ? "your shares" : "your watchlists"}
              listRef={wcList === "equity" ? "equity" : "watch"} page="equity-portfolio" lists={[{ id: "equity", label: "Your shares", count: symbols.length }, { id: "watch", label: "Watchlist", count: watchSyms.length }]}
              activeList={wcList} onPickList={(id) => setWcList(id === "watch" ? "watch" : "equity")} nameOf={(x) => meta[x]?.name ?? by.get(x)?.name}
              sub={wcList === "equity" ? (x) => (onWatch.has(x) ? "★ also on a watchlist" : null) : undefined} className="sp-sec wc eq-wc" hId="wc-h-eq" id="eq-wc"
              plain shortName={(s, n) => shortCo(meta[s]?.name ?? n, n || s)} help={<Info about="What changed at your companies" text="Exchange filings from the last 90 days for the companies you own, grouped by kind. From Discover." how="An update is one kind of news from one company; a row may bundle several filings." />} /></Step>}
            {/* Trends, Peers and Group leaders: Gold only (FinLit Prism); Silver sees a dashed lock card for each (the pack) */}
            {model === "prism" ? <>
              <Step id="eq-trend" title="Short- and long-term trend" line={lines385.trend}>{tr.data?.trend ? <TrendSection t={tr.data.trend} shares={shares} /> : <section className="sp-sec" aria-labelledby="eq-trend"><h2 id="eq-trend">Short- and long-term trend</h2><p className="sp-note">{tr.isError ? "The trend readings could not be loaded. Try again in a moment." : "Loading the trend readings…"}</p></section>}</Step>
              <Step id="eq-peers" title="Against their peers" line={lines385.peers}><PeersSection shares={shares} /></Step>
              {hasLaggard && <Step id="eq-leaders" title="What if you had owned the group leader instead?" line={leaderLine || lines385.leaders}><LeadersSection shares={shares} onLine={setLeaderLine} /></Step>}
            </> : <>
              <Step id="eq-trend" title="Short- and long-term trend" line="Gold and up"><GoldLock id="eq-trend" title="Short- and long-term trend" text="Where each share's short-term trend sits against its long-term one, from FinLit Prism's technical view." /></Step>
              <Step id="eq-peers" title="Against their peers" line="Gold and up"><GoldLock id="eq-peers" title="Against their peers" text="Whether each share leads or lags similar companies over 12 months." /></Step>
              <Step id="eq-leaders" title="What if you had owned the group leader instead?" line="Gold and up"><GoldLock id="eq-leaders" title="What if you had owned the group leader instead?" text="Your laggards against the #1 share of their peer group over 12 months." /></Step>
            </>}
            {/* task #323 (developer file 21, part 12): Your themes moves below Group leaders, so the readings about each share come first */}
            {!DEMO && <Step id="eq-themes" title="Your themes, from Discover" line={lines385.themes}><YourThemes v={thList === "shares" ? thShares : thWatch} list={thList} onList={setThList} theme={themeF} label={labelOf}
              counts={{ shares: { placed: thShares?.placed ?? 0, total: symbols.length }, watch: { placed: thWatch?.placed ?? 0, total: watchSyms.length } }}
              onShow={thList === "shares" ? (name) => { setThemeF(name); goStep("pf-shares"); } : undefined} /></Step>}
          </>}
          {view === "diversification" && data && data.noPrices.length > 0 && <p className="pfx-note" role="status">No stored prices yet for {data.noPrices.map((x) => nameOfSym(x)).join(", ")}: {plural(data.noPrices.length, "share")} left out of the co-movement figures.</p>}
          {view === "diversification" && (page && common && div ? <>
            <Step id="eq-spread" title="How spread out is the list?" line="The spread score and how independently your shares move"><SpreadPack d={div} /></Step>
            <Step id="eq-where" title="Where your list sits" line="Your shares by macro sector and size"><WhereSitsGrid d={div} /></Step>
            <Step id="eq-keysd" title="Key figures" line="How spread out your list really is, in three answers"><KeyAnswers id="eq-keysd" sub="How spread out your list really is, in three answers." items={divAnswers(divFacts(div), (x) => { const y = shareOf.get(x); return y ? coName(y) : x; })} shares={shares} /></Step>
            <Step id="eq-moves" title="How the list moves together" line="Sectors, groups and sizes that move together"><DivSubTabs d={div} /></Step>
            <Step id="eq-grid" title="Share by share" line="How closely each pair of your shares moves"><ShareGrid d={div} /></Step>
            <Step id="eq-style" title="Style tilt" line="Where your average share ranks, part by part">{model === "prism" ? <StyleTiltPack tilt={data?.styleTilt} /> : <GoldLock id="eq-style" title="Style tilt" text="Where your list's average share ranks among all the companies FinLit Prism rates, part by part." />}</Step>
          </> : <p className="sp-note">{state === "loading" ? "Working out the figures…" : "The diversification figures need at least two shares with a year of weekly prices."}</p>)}
          {view === "risk" && (page && rk.data && riskSp ? <>
            <Step id="eq-rg" title="Risk at a glance" line="How much the list swings and how far it has fallen"><RiskGlancePack r={rk.data} split={riskSp} compare={scoreOn ? { value: choices.benchmark, onChange: (v) => pick({ ...choices, benchmark: v }) } : undefined} /></Step>
            <Step id="eq-keysr" title="Key figures" line="Where the list's risk sits, in three answers"><KeyAnswers id="eq-keysr" sub="Where the list's risk sits, in three answers." items={riskAnswers(rk.data, riskSp.bySize, (x) => { const y = shareOf.get(x); return y ? coName(y) : x; })} shares={shares} /></Step>
            <Step id="eq-build" title="How your list's beta is built" line="What each size adds to how much the list moves"><BetaBuild r={rk.data} /></Step>
            <Step id="eq-sizeb" title="Each size against its own benchmark" line="Each size against the index of companies its size"><SizeBench r={rk.data} /></Step>
            <Step id="eq-mr" title="Share of the list vs share of the risk" line="Which parts carry more than their share of the ups and downs"><RiskShareSection r={rk.data} split={riskSp} /></Step>
            <Step id="eq-fall" title="If the market fell 10%" line="What a 10% fall in the market has meant for the list"><Fall10 r={rk.data} value={money.n && money.withQty === money.n ? { now: money.now, name: cur === "all" ? "All accounts" : pfName(cur) } : null} /></Step>
            <Step id="eq-each" title="Each share's risk" line="Every share against its own size index"><EachShareRisk r={rk.data} split={riskSp} shares={shares} gold={model === "prism"} /></Step>
          </> : <p className="sp-note">{state === "loading" || rk.isPending ? "Working out the figures…" : rk.isError ? (rk.error?.body?.detail || "The risk figures could not be loaded. Try again in a moment.") : "The risk figures need shares with a year of weekly prices."}</p>)}
          {page && <Step id="eq-short" title="What this means, in short" line={inShortItems[0]?.text ?? ""}><InShort items={inShortItems} /></Step>}
          <NextView view={view} onView={(v) => setView(v, true)} />
          </div>
          </StepCtx.Provider>
        </>}
        </div>
      </Gate>
      <PageEnd />
    </div></HideButtons.Provider></HideSlim.Provider>
  );
}
