import { PortfolioDisclaimer } from "../components/PortfolioDisclaimer";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Gate } from "../components/Gate";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { TIER, useUI } from "../lib/ui";
import { limitsFor, useAuth } from "../lib/auth";
import { DEMO } from "../lib/demo";
import { useSearchIndex } from "../lib/api";
import { isinMap } from "../lib/searchFilters";
import { useUniverse } from "../lib/screener";
import { portfolio, usePortfolio, type PState } from "../lib/portfolio";
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
import { ACCEPT, entriesFromFile, type Entry } from "../lib/holdingsFile";
import { isPdf } from "../lib/holdingsPdf";
import { entryOf, makeMatcher, matchEntries, type Skipped, type ToCheck } from "../lib/holdingsMatch";
import { resolveIsins, sourcesLine } from "../lib/isin";
import { modelFor, parsePeriod, parseTab, useOverview, withTab, type Line, type OverviewHolding, type Period, type Tab } from "../lib/portfolioOverview";
import { usePortfolioPage } from "../portfolio/usePortfolioPage";
import { loadChoices, saveChoices, usePortfolioScore, type Choices } from "../portfolio/useScore";
import { usePortfolioTrend } from "../portfolio/usePortfolioTrend";
import "../styles/mfspread.css";
import { SharesTable } from "../portfolio/SharesTable";
import { sectorColors, sectorOrder, plural } from "../portfolio/derive";
import { ADD_NOTE } from "../portfolio/words";
import type { Mode } from "../portfolio/types";
import "../portfolio/pf.css";
import { capBucket } from "../lib/capBuckets";
import { useIndices } from "../lib/indices";
import { dayWord } from "../lib/dashPack";
import { useLeadershipList } from "../lib/leadership";
import { sharesCards, type Share, type Size } from "../lib/equityPack";
import { topTiles, type TabKey } from "../lib/equityTop";
import { SectionsBar, SectionsMenu, jumpTo, type Sec } from "../portfolio/pack/PageTop";
import { HideSlim, isHidden, setHidden } from "../components/Hideable";
import { KeyAnswers } from "../portfolio/pack/KeyAnswers";
import { divAnswers, portfolioAnswers, riskAnswers } from "../lib/keyAnswers";
import { EqTitle, MoneyBox, NextView, PfPicker, ScorePanel, ViewCards, YourPortfolios, useEqViewsSeen, type DayMove, type ViewCard } from "../portfolio/pack/EqTop";
import { GoldLock, InShort, Insights, LeadersSection, StyleTiltPack, PeersSection, TrendSection, SizeFold, eqViews, type View } from "../portfolio/pack/EquityPack";
import { StickySwitch } from "../portfolio/ViewKit";
import { BetaBuild, EachShareRisk, Fall10, RiskGlancePack, RiskShareSection, SizeBench, riskSplit, usePortfolioRisk } from "../portfolio/pack/RiskPack";
import { DivSubTabs, ShareGrid, SpreadPack, WhereSitsGrid, divFacts, type DivInput } from "../portfolio/pack/DivPack";
import { nseLevels } from "../lib/nseTaxonomy";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../styles/dashboard.css";
import "../portfolio/pack/equity-pack.css";
import { coTitle, shortLabel, subLine, titleOf } from "../lib/companyLabel";
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

const SECS: Record<TabKey, { label: string; secs: Sec[] }> = {
  portfolio: { label: "Portfolio", secs: [["pf-shares", "Your shares"], ["eq-keys", "Key figures"], ["eq-trend", "Trends"], ["eq-peers", "Peers"], ["eq-leaders", "Group leaders"]] },
  diversification: { label: "Diversification analytics", secs: [["eq-where", "Where it sits"], ["eq-keysd", "Key figures"], ["eq-spread", "Spread"], ["eq-sectors", "Sectors"], ["eq-groups", "Stock groups"], ["eq-sizes", "Company sizes"], ["eq-grid", "Share by share"], ["eq-style", "Style tilt"]] },
  risk: { label: "Risk analytics", secs: [["eq-rg", "At a glance"], ["eq-keysr", "Key figures"], ["eq-build", "Beta build"], ["eq-sizeb", "Size benchmarks"], ["eq-mr", "Risk share"], ["eq-fall", "If the market fell 10%"], ["eq-each", "Each share"]] },
};

export function HoldingsPage() {
  useDocTitle("Equity portfolio", "Add the shares you own, by name or from a broker file, and see how strong each one is, how spread out the list is, what moves together and where the risk comes from.");
  const { plan, toast } = useUI();
  const { seesAll } = useAuth();
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
  const [adding, setAdding] = useState(false);
  const uni = useUniverse(), idx = useSearchIndex(true);
  const by = useMemo(() => new Map((uni.data?.rows || []).map((r) => [r.symbol, r])), [uni.data]);
  const index = idx.data?.rows || [];
  const cap = limitsFor(plan).holdings;
  const [one, setOne] = useState(""), [missing, setMissing] = useState<string[]>([]);
  // task #274 (pack change 1): the Add shares window (Add: with the picked company; Add several: empty; Import ▾: Paste a list or Upload) and the Import menu
  const [addWin, setAddWin] = useState<{ tab: AddTab; pre: CompanyHit | null } | null>(null), [impOpen, setImpOpen] = useState(false);
  // task #274 (pack change 3): Edit | Sell under each share open these windows
  const [esWin, setEsWin] = useState<{ what: "edit" | "sell"; symbol: string } | null>(null);
  const [checks, setChecks] = useState<ToCheck[]>([]), [skipped, setSkipped] = useState<Skipped[]>([]), [readBy, setReadBy] = useState<string | null>(null);
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
  const pfFigs = (id: string | "all") => { const m = moneyOf(st.holdings, id, priceOf, changeOf); return { n: m.n, now: m.now, withQty: m.withQty, gainPct: m.full && m.invested ? (m.gain / m.invested) * 100 : null }; };
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
  const add = async (entries: Entry[], from?: string, confirmNames = !!from) => {
    if (!entries.length) { toast(from ? `No shares found in ${from}. It should have a column with the ISINs or the share names (ISIN, Symbol, Stock, Instrument or Company).` : "No share names found. Put one ISIN, name or ticker per line, or paste the ISIN or Name column from your broker."); return; }
    if (!index.length) { toast("The company list is still loading. Try again in a moment."); return; }
    const isins = entries.flatMap((e) => (e.isin ? [e.isin] : []));
    if (isins.length) setBusy(true);
    const res = isins.length ? await resolveIsins(isins, idx.data) : null;
    setBusy(false);
    const { found, check, skipped: skip, missing: miss, byIsin } = matchEntries(entries, index, res?.answers ?? null, confirmNames);
    const fresh = [...new Map(found.filter((f) => !inTarget.has(f.symbol)).map((f) => [f.symbol, f])).values()];
    const room = Math.max(0, cap - allSymbols.length) + fresh.filter((f) => allSymbols.includes(f.symbol)).length, take = fresh.slice(0, room);
    if (take.length) portfolio.addMany(take.map((f) => ({ symbol: f.symbol, qty: 1, price: 0, isin: f.isin || isinOf?.get(f.symbol), ...pfField(goTo) })));
    const taken = new Set([...symbols, ...take.map((f) => f.symbol)]);
    setMissing(miss); setChecks(check.filter((c) => !taken.has(c.symbol))); setSkipped(skip);
    setReadBy(isins.length ? `${byIsin} of ${entries.length} ${entries.length === 1 ? "line" : "lines"} matched by ISIN, against ${sourcesLine(res?.sources ?? null)}.${entries.length > isins.length ? ` ${entries.length - isins.length} without an ISIN matched by name.` : ""}` : null);
    toast([take.length ? `Added ${take.length} ${take.length === 1 ? "share" : "shares"}` : "Nothing new to add", check.length ? `${check.length} to check (listed below)` : "", skip.length ? `${skip.length} not added (reasons below)` : "",
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
    portfolio.addMany([{ symbol: c.symbol, qty: 1, price: 0, isin: c.isin || isinOf?.get(c.symbol), ...pfField(goTo) }]); setChecks((xs) => xs.filter((x) => x.symbol !== c.symbol)); toast(`${c.symbol} added.`);
  };
  const empty = !lines.length;
  const common = page && model ? { page, meta, symbols: ids, mode, colors, model, ov: ovMap } : null;

  // ---------------------------------------------------------------- the final pages pack (boards 12-14)
  const view: View = params.get("view") === "diversification" ? "diversification" : params.get("view") === "risk" ? "risk" : "portfolio";
  const setView = (v: View, scroll = false) => { const n = new URLSearchParams(params); if (v === "portfolio") n.delete("view"); else n.set("view", v); setParams(n, { replace: true }); if (scroll) setTimeout(() => document.getElementById("eq-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  // task #235 (the 18 Nov pack, live bug E4): one read of every share's peer label, not one call per share (which failed under load with 503s)
  const leadList = useLeadershipList(symbols, !!model && !DEMO);
  const idxQ = useIndices(), day = dayWord(new Date(), idxQ.data?.asOf ?? null);
  const NOT_RANKED: Record<string, string> = { history: "has under a year of prices", liquidity: "trades too thinly to rank fairly", stale: "has no recent prices", group: "has no peer group", hidden: "is not ranked", pending: "is waiting for its first weekly reading" };
  // below52: the screener table carries pct_from_high; the shared Row type does not name it
  const shares: Share[] = useMemo(() => lines.map((l) => {
    const h = l.ov && l.ov.status === "ready" ? l.ov : null, u = by.get(l.symbol), feed = leadList.data, ld = feed && feed.available ? feed.rows[l.symbol] : undefined, pr = h?.prism;
    const size: Size | null = capBucket(h?.marketCapCr ?? u?.market_cap ?? null)?.short ?? null;
    const peer = ld && ld.available ? { label: ld.label, raw: ld.rawLabel ?? null, rank: ld.rank, of: ld.ranked, group: ld.group, vs: ld.rel52 == null ? null : ld.rel52 * 100, bench: ld.sectorKind === "index" ? ld.sector ?? "its sector index" : "peer average", direction: ld.direction ?? null } : null;
    return { symbol: l.symbol, name: l.name || h?.name || meta[l.symbol]?.name || u?.name || null, industry: h?.sector ?? meta[l.symbol]?.sector ?? null, size, chg: h?.changePct ?? null, prism: pr?.final ?? null, prismWord: pr?.label ?? null, valuation: pr?.parts?.valuation ?? null, risk: pr?.parts?.risk ?? null,
      st: pr?.shortTerm?.score ?? null, lt: pr?.longTerm?.score ?? null, stWord: pr?.shortTerm?.word ?? null, ltWord: pr?.longTerm?.word ?? null, below52: (u as { pct_from_high?: number | null } | undefined)?.pct_from_high ?? null, m1: u?.return_1m ?? null, peer, notCompared: ld && !ld.available ? NOT_RANKED[ld.reason] ?? "is not ranked" : leadList.data && !leadList.data.available ? NOT_RANKED[leadList.data.reason] ?? "is not ranked" : null };
  }), [lines, by, leadList.data, meta]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shareOf = useMemo(() => new Map(shares.map((x) => [x.symbol, x])), [shares]);
  const counts = useMemo(() => { const c: Record<string, string[]> = {}; ids.forEach((sym) => { const k = meta[sym]?.sector || `${sym} (not classified)`; (c[k] ??= []).push(sym); }); return c; }, [ids, meta]);
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
  // the Diversification analytics tile counts each NSE level (task #183 A4/A5): "9 macro sectors · 13 sectors · 22 industries · all four sizes"
  const lvN = (l: "macro" | "sector" | "industry") => (div ? new Set(ids.map((x) => div.levelOf(x, l))).size : undefined);
  const top = topTiles(shares, page as never, model === "prism" ? "prism" : "finlit", { macro: lvN("macro"), sectors: lvN("sector"), industries: lvN("industry") ?? Object.keys(counts).length, sizes: (["Large", "Mid", "Small", "Micro"] as Size[]).filter((k) => sizeCount[k]).length });
  // task #274 (changes 2 and 16): the money box's day line and what the money covers, the three view cards, and the views opened once
  const dayCount = useMemo(() => {
    const xs = shares.filter((x) => x.chg != null).map((x): DayMove => ({ symbol: x.symbol, label: shortLabel(x), chg: x.chg! }));
    const best = xs.length ? xs.reduce((a, b) => (b.chg > a.chg ? b : a)) : null, worst = xs.length ? xs.reduce((a, b) => (b.chg < a.chg ? b : a)) : null;
    return { up: xs.filter((x) => x.chg > 0).length, down: xs.filter((x) => x.chg < 0).length, best: best && best.chg > 0 ? best : null, worst: worst && worst.chg < 0 ? worst : null };
  }, [shares]);
  const haveBuys = useMemo(() => { const miss = new Set(money.missing.map((m) => m.symbol)); return shares.filter((x) => !miss.has(x.symbol)).map((x) => ({ symbol: x.symbol, label: shortLabel(x) })); }, [shares, money.missing]);
  const seen = useEqViewsSeen(view);
  const BAND_TONE: Record<string, string> = { STRONG: "var(--eqx-hi)", HEALTHY: "var(--eqx-hi)", AVERAGE: "var(--eqx-mid)", WEAK: "var(--eqx-lo)", POOR: "var(--eqx-lo)" };
  const MACRO_C = ["#4b4fc4", "#b5541c", "#a23b72", "#0e6471", "#7a8c2e", "#9a6b12", "#2f5a9e", "#5b6170", "#13606b", "#c08a1e"];
  const viewCards: ViewCard[] = top.map((t) => {
    let bar: ViewCard["bar"];
    if (t.id === "portfolio" && model === "prism") { const c = new Map<string, number>(); shares.forEach((x) => { const k = BAND_TONE[x.prismWord?.toUpperCase() ?? ""] ?? "var(--eqx-none)"; c.set(k, (c.get(k) ?? 0) + 1); });
      bar = ["var(--eqx-hi)", "var(--eqx-mid)", "var(--eqx-lo)", "var(--eqx-none)"].filter((k) => c.get(k)).map((k) => ({ n: c.get(k)!, c: k, label: `${c.get(k)} ${k.includes("hi") ? "strong or healthy" : k.includes("mid") ? "average" : k.includes("lo") ? "weak" : "not scored"}` })); }
    if (t.id === "diversification" && div) { const c = new Map<string, number>(); ids.forEach((x) => { const k = div.levelOf(x, "macro"); c.set(k, (c.get(k) ?? 0) + 1); });
      bar = [...c].sort((a, b) => b[1] - a[1]).map(([k, n], i) => ({ n, c: MACRO_C[i % MACRO_C.length], label: `${k} ${n}` })); }
    return { id: t.id as View, v: t.v, x: t.sub, help: t.help, how: t.how, bar };
  });
  /** All sections (task #274, change 11): every hidden section of the open view comes back, and the page goes to the top of the view */
  const showAllSecs = () => { SECS[view].secs.forEach(([id]) => setHidden("pack." + id, false)); setTimeout(() => document.getElementById("eq-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };
  const renamePf = (id: string, name: string) => { const n = name.trim(); if (!n) return "Give the portfolio a name."; if (pfList.some((x) => x.id !== id && x.name.trim().toLowerCase() === n.toLowerCase())) return `You already have a portfolio called ${n}. Try another name, such as "${n} (joint)".`;
    if (!st.portfolios?.length) portfolio.replace({ ...portfolio.get(), portfolios: pfList.map((x) => ({ ...x })) }); portfolio.renamePortfolio(id, n); toast("Portfolio renamed."); return null; };
  const riskSp = useMemo(() => (page && rk.data && div ? riskSplit(page, rk.data, (x) => div.levelOf(x, "macro")) : null), [page, rk.data, div]);

  return (
    <HideSlim.Provider value={true}><div className="wrap ipo pfx sp eq">
      <Gate tier={PLAN_FOR_PORTFOLIO} title="Score your portfolio" points={["FinLit Prism for every share you own (Gold)", "How spread out the list is, and what moves together", "Share of risk and the NIFTY 50 comparison", "Import Excel, CSV or PDF statements"]}>
        <div className="pfx-flow">
        <section className="card eqx-top" aria-label="Equity portfolio">
          <EqTitle plan={TIER[plan].n} asOf={idxQ.data?.asOf} add={<>
          <form className="pfx-add" onSubmit={(e) => { e.preventDefault(); const t = one.trim(); if (!t) { setAddWin({ tab: "search", pre: null }); return; }
            const hit = suggest(index, t, isinOf)[0]; if (hit) { setOne(""); setAddWin({ tab: "search", pre: hit }); } else { void add([entryOf(t)]); setOne(""); } }}>
            <label className="pfx-input"><Icon name="search" />
              <CompanyCombo index={index} isin={isinOf} held={heldSet} info={coInfo} label="Add a share by name, symbol or ISIN" inputRef={addBox} value={one} onChange={setOne}
                onPick={(h) => { setOne(""); setAddWin({ tab: "search", pre: h }); }} /></label>
            <button className="pfx-solid">Add</button>
            <span className="eq-add2"><button type="button" className="pfx-btn" onClick={() => setAddWin({ tab: "search", pre: null })}>Add several</button>
            <span className="pfa-impw"><button type="button" className="pfx-btn" aria-haspopup="menu" aria-expanded={impOpen} onClick={() => setImpOpen((v) => !v)} disabled={busy}>{busy ? "Reading…" : "Import ▾"}</button>
              {impOpen && <div className="x-swm pfa-imp" role="menu" aria-label="Import" onKeyDown={(e) => { if (e.key === "Escape") { setImpOpen(false); (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); } }}>
                <button type="button" role="menuitem" autoFocus onClick={() => { setImpOpen(false); setAddWin({ tab: "paste", pre: null }); }}><span className="x-swm-t"><b>Paste a list</b><small>Names, symbols or ISINs, one a line</small></span></button>
                <button type="button" role="menuitem" onClick={() => { setImpOpen(false); setAddWin({ tab: "upload", pre: null }); }}><span className="x-swm-t"><b>Upload a broker file or CAS</b><small>Excel, CSV or PDF; read by ISIN</small></span></button></div>}</span>
            <input ref={file} type="file" accept={ACCEPT + ",.pdf,application/pdf"} hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setAddWin(null); if (isPdf(f)) { setPdf(f); return; } setBusy(true);
              try { await add(await entriesFromFile(f, matcher), f.name); } catch (err) { toast(err instanceof Error && err.message.startsWith("That file") ? err.message : "That file could not be read. Save it as .xlsx or .csv, or paste the share names instead."); } finally { setBusy(false); } }} />
            </span>
          </form>
          </>} clear={<>
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
          {pdf && <PdfImport file={pdf} index={index} search={idx.data} held={symbols} heldQty={qtyBySymbol} room={Math.max(0, cap - allSymbols.length)} onClose={() => setPdf(null)}
            onAdd={(picks) => {   // task #191: a depository statement brings each share's quantity; a share already in the list takes it as if typed
              const fresh = picks.filter((p) => !inTarget.has(p.symbol)), set = picks.filter((p) => inTarget.has(p.symbol) && p.qty);
              if (fresh.length) portfolio.addMany(fresh.map((p) => ({ ...(p.qty ? { symbol: p.symbol, qty: p.qty, price: 0, owned: true } : { symbol: p.symbol, qty: 1, price: 0 }), isin: isinOf?.get(p.symbol), ...pfField(goTo) })));
              set.forEach((p) => onQty(p.symbol, p.qty!));
              const withQty = fresh.filter((p) => p.qty).length;
              toast([fresh.length ? `Added ${fresh.length} ${fresh.length === 1 ? "share" : "shares"} from the PDF${withQty ? `, ${withQty === fresh.length ? "each" : withQty} with its quantity` : ""}` : "", set.length ? `quantity set for ${set.length}` : ""].filter(Boolean).join("; ") + "."); }} />}
          {readBy && <p className="pfx-note eq-isin-src" role="status">{readBy}</p>}
          {checks.length > 0 && <div className="pf-miss eq-isin" role="status"><b>Please check {checks.length === 1 ? "this line" : `these ${checks.length} lines`} (not added yet):</b>{checks.length > 1 && <button type="button" className="pfx-btn eq-addall" onClick={() => { const room = Math.max(0, cap - allSymbols.length), take = checks.filter((c) => !inTarget.has(c.symbol)).slice(0, room); portfolio.addMany(take.map((c) => ({ symbol: c.symbol, qty: 1, price: 0, isin: c.isin || isinOf?.get(c.symbol), ...pfField(goTo) }))); setChecks([]); toast(`Added ${take.length} ${take.length === 1 ? "share" : "shares"}.`); }}>Add all {checks.length}</button>}
            <ul>{checks.slice(0, 20).map((c) => <li key={c.symbol + (c.isin || c.input)}><span>{c.input}{c.isin && c.input !== c.isin ? ` (${c.isin})` : ""} → <b title={coTitle(c)}>{titleOf(c)}</b> {subLine(c, c.name)}. <small>{c.note}.</small></span>
              <button type="button" className="pfx-btn" onClick={() => addChecked(c)}>Add {c.symbol}</button></li>)}</ul></div>}
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

        {empty ? <div className="card dw-empty"><span className="dw-ei"><Icon name="wallet" /></span><b>No shares yet</b><p>Add a share by its name, symbol or ISIN, or upload the holdings file from your broker. {DEMO ? "" : <>You can also <Link to="/watchlist">start from your watchlist</Link>.</>}</p><span className="eq-empty-go"><button type="button" className="pfx-solid" onClick={() => addBox.current?.focus()}>Add a share</button><button type="button" className="pfx-btn" onClick={() => file.current?.click()}>Upload broker file</button></span>
          {money.nSales > 0 && <MoneyRow t={money} onAdd={openFor} />}
          {sold.length > 0 && <SoldList items={sold} all={cur === "all" && pfList.length > 1} pfName={pfName} nameOf={(sym) => meta[sym]?.name ?? sym} onRemoveSale={(id) => portfolio.remove(id)} />}</div> : model && <>
          <div className="eqx-row2" id="eq-tabs">
            <ScorePanel locked={!scoreOn} total={sc.data && !sc.data.locked ? sc.data.total ?? null : null} band={sc.data && !sc.data.locked ? sc.data.band : null} shares={symbols.length}
              missing={symbols.filter((x) => !qtyBySymbol.get(x)).length} onAdd={() => { const sym = symbols.find((x) => !qtyBySymbol.get(x)); if (sym) openFor(sym, "qty"); }} />
            <ViewCards cards={viewCards} view={view} onView={(v) => setView(v)} seen={seen} />
          </div>
          {data && data.unknown.length > 0 && <p className="pfx-warn" role="status">Not in FinLit's company list, so left out of the figures: {data.unknown.join(", ")}.</p>}
          {data && data.noPrices.length > 0 && <p className="pfx-note" role="status">No stored prices yet for {data.noPrices.join(", ")}: {plural(data.noPrices.length, "share")} left out of the co-movement figures.</p>}
          {DEMO && <p className="pfx-note" role="status">The diversification figures are not available in the demo preview.</p>}
          {state === "error" && <p className="pfx-warn" role="alert">{pg.error?.body?.detail || "The figures for this list could not be loaded. Try again in a moment."}</p>}
          <SectionsBar tab={view} all={SECS} steps onAll={showAllSecs} onTab={(t, then) => { setView(t); if (then) setTimeout(() => jumpTo(then), 120); }}
            lead={<StickySwitch list={pfList} cur={cur} onPick={(id) => { setCur(id); setOpenLots(new Set()); }} figs={pfFigs} defs={eqViews(lines.length)} view={view} onView={(v) => setView(v)} tabsId="eq-tabs" fresh={(["portfolio", "diversification", "risk"] as View[]).filter((v) => !seen.has(v))} />} />
          <div id="eq-panel" role="tabpanel" aria-labelledby={`eq-tab-${view}`}>
          {view !== "portfolio" && <AnalysingBar list={pfList} cur={cur} onPick={(id) => { setCur(id); setOpenLots(new Set()); }} n={symbols.length} />}
          {view === "portfolio" && <>
            <SharesTable stuckLead={<>
              <StickySwitch list={pfList} cur={cur} onPick={(id) => { setCur(id); setOpenLots(new Set()); }} figs={pfFigs} defs={eqViews(lines.length)} view={view} onView={(v) => setView(v)} tabsId="eq-tabs" fresh={(["portfolio", "diversification", "risk"] as View[]).filter((v) => !seen.has(v))} />
              <SectionsMenu secs={SECS.portfolio.secs} here="pf-shares" isHidden={(id) => isHidden("pack." + id)} show={(id) => setHidden("pack." + id, false)} onAll={showAllSecs} /></>}
              lots={lots} editSell={{ onEdit: (sym) => setEsWin({ what: "edit", symbol: sym }), onSell: (sym) => setEsWin({ what: "sell", symbol: sym }) }} qtyOf={(sym) => qtyBySymbol.get(sym) ?? null} onQty={onQty} lines={lines} meta={meta} page={page} mode={mode} colors={colors} model={model} tab={tab} period={period} limit={cap} state={ov.isError ? "error" : ov.isPending && !DEMO ? "loading" : "ready"}
              errorText={DEMO ? "Scores are not available in the demo preview." : ov.error?.body?.detail} onTab={(t) => go(t)} onPeriod={(pd) => go("financials", pd)}
              peerOf={(sym) => shareOf.get(sym)} day={day} cards={tab === "overview" ? <div className="eq-cards"><Insights items={sharesCards(shares, day)} scope="eq.shares" /></div> : null}
              actions={(sym) => <button className="pfx-x" aria-label={`Remove ${sym}`} title={`Remove ${sym}${cur === "all" ? "" : ` from ${pfName(cur)}`}`} onClick={() => { st.holdings.filter((h) => h.symbol === sym && (cur === "all" || pfOf(h) === cur)).forEach((h) => portfolio.remove(h.id)); toast(`${sym} removed.`); }}>×</button>} />
            <SoldList items={sold} all={cur === "all" && pfList.length > 1} pfName={pfName} nameOf={(sym) => meta[sym]?.name ?? sym} onRemoveSale={(id, sym) => { portfolio.remove(id); setOpenLots((c) => new Set([...c, sym]));
              setTimeout(() => { const r = document.getElementById(`lots-${sym}`)?.previousElementSibling as HTMLElement | null; r?.classList.add("x-flash"); r?.scrollIntoView?.({ behavior: "smooth", block: "center" }); setTimeout(() => r?.classList.remove("x-flash"), 2300); }, 150); }} />
            <KeyAnswers id="eq-keys" sub={`What your ${plural(lines.length, "share")} add up to, from the table above and the sections below.`} items={portfolioAnswers(shares, model === "prism", (x) => shortLabel(x))} shares={shares} />
            <SizeFold counts={sizeCount} />
            {/* Trends, Peers and Group leaders: Gold only (FinLit Prism); Silver sees a dashed lock card for each (the pack) */}
            {model === "prism" ? <>
              {tr.data?.trend ? <TrendSection t={tr.data.trend} shares={shares} /> : <section className="sp-sec" aria-labelledby="eq-trend"><h2 id="eq-trend">Short- and long-term trend</h2><p className="sp-note">{tr.isError ? "The trend readings could not be loaded. Try again in a moment." : "Loading the trend readings…"}</p></section>}
              <PeersSection shares={shares} />
              <LeadersSection shares={shares} />
            </> : <>
              <GoldLock id="eq-trend" title="Short- and long-term trend" text="Where each share's short-term trend sits against its long-term one, from FinLit Prism's technical view." />
              <GoldLock id="eq-peers" title="Against their peers" text="Whether each share leads or lags similar companies over 12 months." />
              <GoldLock id="eq-leaders" title="What if you had owned the group leader instead?" text="Your laggards against the #1 share of their peer group over 12 months." />
            </>}
          </>}
          {view === "diversification" && (page && common && div ? <>
            <WhereSitsGrid d={div} />
            <KeyAnswers id="eq-keysd" sub="How spread out your list really is, in three answers." items={divAnswers(divFacts(div), (x) => { const y = shareOf.get(x); return y ? shortLabel(y) : x; })} shares={shares} />
            <SpreadPack d={div} />
            <DivSubTabs d={div} />
            <ShareGrid d={div} />
            {model === "prism" ? <StyleTiltPack tilt={data?.styleTilt} /> : <GoldLock id="eq-style" title="Style tilt" text="Where your list's average share ranks among all the companies FinLit Prism rates, part by part." />}
          </> : <p className="sp-note">{state === "loading" ? "Working out the figures…" : "The diversification figures need at least two shares with a year of weekly prices."}</p>)}
          {view === "risk" && (page && rk.data && riskSp ? <>
            <RiskGlancePack r={rk.data} split={riskSp} compare={scoreOn ? { value: choices.benchmark, onChange: (v) => pick({ ...choices, benchmark: v }) } : undefined} />
            <KeyAnswers id="eq-keysr" sub="Where the list's risk sits, in three answers." items={riskAnswers(rk.data, riskSp.bySize, (x) => { const y = shareOf.get(x); return y ? shortLabel(y) : x; })} shares={shares} />
            <BetaBuild r={rk.data} />
            <SizeBench r={rk.data} />
            <RiskShareSection r={rk.data} split={riskSp} />
            <Fall10 r={rk.data} value={money.n && money.withQty === money.n ? { now: money.now, name: cur === "all" ? "All accounts" : pfName(cur) } : null} />
            <EachShareRisk r={rk.data} split={riskSp} shares={shares} gold={model === "prism"} />
          </> : <p className="sp-note">{state === "loading" || rk.isPending ? "Working out the figures…" : rk.isError ? (rk.error?.body?.detail || "The risk figures could not be loaded. Try again in a moment.") : "The risk figures need shares with a year of weekly prices."}</p>)}
          <NextView view={view} onView={(v) => setView(v, true)} />
          </div>
          {page && <InShort items={page.summary.eq} />}
        </>}
        </div>
      </Gate>
      <details className="sp-sec sp-fold eq-disc"><summary><span><b className="sp-ft">Disclaimer</b><small>What this page is, and is not</small></span><span className="sp-show">Show ▾</span></summary><PortfolioDisclaimer kind="equity" /></details>
      <p className="eq-end">Information only, not investment advice.</p>
    </div></HideSlim.Provider>
  );
}
