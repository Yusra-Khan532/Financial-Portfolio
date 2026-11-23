// Block 1, Your investments today: the shares held, the mutual funds, the ETFs and the watchlist under All / Watchlist / Shares / Mutual funds / ETFs; task #195 (dashboard pack
// of 15 Nov 2026): four rows, the biggest moves of the last trading day first, then "Show all N" / "Show fewer". "What your stocks say" (Signals, below) is its own block.
// Each row: size, price, the day's move, FinLit Prism (a locked pill on a plan without it), vs its peers, latest quarter against a year earlier, and any alert. Descriptive only.
import { scoreView, usePlanModel, usePlanPrism, type ScoreView } from "../../lib/planScore";
import { useMemo, useState } from "react";
import { CoLogo } from "../CoLogo";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { capBucket, SIZE_RULE_TEXT } from "../../lib/capBuckets";
import type { Leadership } from "../../lib/leadership";
import { dayWord, myStockSignals, type MyStock, type Signal } from "../../lib/dashPack";
import { useIndices } from "../../lib/indices";
import { Tip } from "../sectors/pack/Common";
import { SignalCards } from "./Signals";
import { apiGet, useQuotesFor, type Financials } from "../../lib/api";
import { useAlerts } from "../../lib/alerts";
import { quoteMap } from "../../lib/globalSearch";
import { PLAN_FOR_PORTFOLIO } from "../../lib/planGates";
import { MINUS, nf } from "../../lib/format";
import { dayMonth, quarterEndLabel, yoyLabel } from "../../lib/dashboard";
import { Card, Rows, ShowMoreButton, tone, useShowMore } from "./parts";
import { Dd, SegDd, useDashUi } from "./dx";
import { DASH_INV_SORTS } from "../../lib/prefs";
import { useUI } from "../../lib/ui";
import { useMfPortfolio, type Holding as MfHolding } from "../../lib/mfPortfolio";
import type { FundDetail } from "../../lib/mf";
import { INV_SORT_LABEL, KIND_TAG, etfRows, sortInv, type InvSort, healthText, investLine, investRows, navText, type InvRow } from "../../lib/dashInvest";
import { useEtfPortfolio, type EtfRow } from "../../lib/etfPortfolio";

export type Followed = { symbol: string; name: string | null };
export type StockTab = "all" | "watchlist" | "portfolio" | "mf" | "etf";   // task #135: Mutual funds and ETFs added; task #248: Portfolio is shown as "Equity" (was "Shares")
const LIMIT = 4;       // task #195: four rows, the biggest moves first; "Show all N" opens the rest
const INV_LIMIT = 4;
const LIST_ID = "dsh-mystocks-list";
const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(v, d) + "%");

/** Plans with Prism: the Prism score and its word (task #283: FinLit's only company score). Its colour uses the same pill classes: green 70+, orange 50-69, red under 50. */
function PrismPill({ v }: { v: ScoreView }) {
  if (v.pending) return <i className="skeleton sk-p" />;
  if (v.score == null) return <span className="dsh-pill none" title={v.why ?? "Not rated yet"}>{v.word === "Not rated" ? "Not rated" : "Not rated yet"}</span>;
  return <span className={"dsh-pill " + (v.band === "hi" ? "strong" : v.band === "mid" ? "mixed" : "watch")} title={`FinLit Prism ${v.score} out of 100`}>{v.score} · {v.word}</span>;
}
/** Plans without Prism: a locked pill that says where the score is. */
function LockPill() {
  return <Link className="dsh-pill none" to="/plans" title="FinLit Prism, FinLit's only company score, comes with a plan that has it. See plans.">See plans</Link>;
}

/** The three lists: everything followed, the watchlist part and the portfolio part (a share can be in both). */
export function stockLists(followed: Followed[], watch: ReadonlySet<string>, held: ReadonlySet<string>): Record<"all" | "watchlist" | "portfolio", Followed[]> {
  const all = [...followed.filter((f) => held.has(f.symbol)), ...followed.filter((f) => !held.has(f.symbol))];   // the pack lists the shares held first
  return { all, watchlist: followed.filter((f) => watch.has(f.symbol)), portfolio: followed.filter((f) => held.has(f.symbol)) };
}

/** Task #135: the rows of All, Mutual funds and ETFs. Shares and the watchlist from the quotes and the stock list (1-year move), funds from the MF portfolio
 *  (NAV, 1-year return, Mutual Fund Score) and each fund's page answer (the last NAV move and its date). ETFs from the ETF portfolio (task #223, D1): price, the day's
 *  move, 1 year and the price against NAV, as the ETF portfolio page shows them. */
export function buildInv(lists: ReturnType<typeof stockLists>, followed: Followed[], funds: MfHolding[], details: (FundDetail | undefined)[], qm: ReturnType<typeof quoteMap>,
  oneYear: ReadonlyMap<string, number | null>, qty: ReadonlyMap<string, number>, etfItems: EtfRow[] = [], heldIn?: Record<"equity" | "mf" | "etf", ReadonlyMap<string, string[]>>): { all: InvRow[]; funds: InvRow[]; etfs: InvRow[] } {
  const nameOf = new Map(followed.map((f) => [f.symbol, f.name]));
  const stock = (sym: string, kind: "share" | "watch"): InvRow => {
    const q = qm.get(sym), n = qty.get(sym);
    return { key: kind + ":" + sym, kind, symbol: sym, name: nameOf.get(sym) || sym, sub: [nameOf.get(sym) || "", kind === "share" ? (n != null ? "held" : "in portfolio") : "watchlist"].filter(Boolean).join(" · "),   // QA 23 Nov: "held" only with a quantity; a name with no buys is "in portfolio"
      href: `/stocks/${sym}`, alertHref: "/alerts", price: q?.price ?? null, priceWhy: q?.price == null ? "No traded price held yet" : undefined,
      day: q?.chg ?? null, y1: oneYear.get(sym) ?? null, y1Why: oneYear.get(sym) == null ? "Listed less than a year, or no price a year ago" : undefined,
      value: n != null && q?.price != null ? n * q.price : null };
  };
  const detailOf = new Map(details.filter((d): d is FundDetail => !!d).map((d) => [d.code, d]));
  const fundRows: InvRow[] = funds.map((h) => {
    const d = detailOf.get(h.code);
    return { key: "mf:" + h.id, kind: "mf", code: h.code, name: h.name ?? `Scheme ${h.code}`, sub: [h.plan, h.option, "NAV"].filter(Boolean).join(" · "), href: `/funds/${h.code}`, alertHref: `/funds/${h.code}`,
      price: h.nav, priceWhy: h.nav == null ? h.navNote ?? "No NAV in AMFI's latest file" : `NAV of ${h.navDate ?? "the latest day"} (AMFI)`,
      day: d?.change?.pct ?? null, dayWhy: d && !d.change ? "No earlier NAV to compare with" : d?.change?.since ? `Against the NAV of ${d.change.since}` : undefined,
      y1: h.returns.r1y, y1Why: h.returns.r1y == null ? h.returns.why ?? "Less than a year of NAVs" : undefined, value: h.current,
      health: { score: h.score.final, label: h.score.label, locked: h.score.locked, why: h.score.reason } };
  });
  const shares = lists.portfolio.map((f) => stock(f.symbol, "share")), watch = lists.watchlist.map((f) => stock(f.symbol, "watch"));
  // task #248: "held in Dhan" on each held row, when its kind has two or more portfolios
  const acct = (r: InvRow): InvRow => { const a = r.kind === "share" ? heldIn?.equity.get(r.symbol!) : r.kind === "mf" ? heldIn?.mf.get(String(r.code)) : r.kind === "etf" ? heldIn?.etf.get(r.symbol!) : undefined;
    return a?.length ? { ...r, acct: a } : r; };
  const all = investRows({ shares: shares.map(acct), funds: fundRows.map(acct), etfs: etfRows(etfItems).map(acct), watch });
  return { all, funds: all.filter((r) => r.kind === "mf"), etfs: all.filter((r) => r.kind === "etf") };
}

/** Task #248: "· held in [Dhan] [Upstox]" on a held row, when its kind has two or more portfolios. */
function HeldIn({ acct, lead }: { acct?: string[]; lead: string }) {
  if (!acct?.length) return null;
  return <>{lead}{acct.map((a) => <span key={a} className="ds-acct">{a}</span>)}</>;
}

const PEER_WORD = { leader: "Leader", in_line: "In line", laggard: "Laggard" } as const;
export function MyStocks({ followed, loading, watch = new Set(), held = new Set(), caps = new Map(), oneYear = new Map(), qty = new Map(), mfPf = "all", etfPf = "all", heldIn, showing = null, eqPicked = null }: {
  followed: Followed[]; loading: boolean; watch?: ReadonlySet<string>; held?: ReadonlySet<string>; caps?: ReadonlyMap<string, number | null>;
  oneYear?: ReadonlyMap<string, number | null>; qty?: ReadonlyMap<string, number>;
  /** task #248: the MF platforms and ETF accounts the Showing bar picked, which portfolios hold each row, the subtitle's "showing …" and the Equity choice */
  mfPf?: string; etfPf?: string; heldIn?: Record<"equity" | "mf" | "etf", ReadonlyMap<string, string[]>>; showing?: string | null; eqPicked?: string | null }) {
  const [tab, setTab] = useState<StockTab>("all");
  const { has } = useUI();
  const lists = useMemo(() => stockLists(followed, watch, held), [followed, watch, held]);
  // task #135: the member's mutual funds (MF portfolio, Silver and up) with each fund's last NAV move from its own page's answer (cached, shared)
  const mfq = useMfPortfolio(has(PLAN_FOR_PORTFOLIO), mfPf);
  const funds = mfq.data?.holdings ?? [];
  const fundDetail = useQueries({ queries: funds.map((h) => ({ queryKey: ["mf", "detail", h.code], queryFn: () => apiGet<FundDetail>(`/api/mf/${h.code}`), staleTime: 300_000, retry: false })) });
  // task #223 (D1): the member's ETFs from the ETF portfolio (Silver and up), the same answer the ETF page and "Your ETFs at a glance" read
  const etfq = useEtfPortfolio(has(PLAN_FOR_PORTFOLIO), etfPf);
  const etfItems = etfq.data?.items ?? [];
  const allSyms = followed.map((f) => f.symbol);
  // the cards count every followed stock, so prices, results and peer labels are read for all of them (each call is cached and shared with the rows)
  const quotes = useQuotesFor(allSyms), qm = quoteMap(quotes.data);
  const fundData = fundDetail.map((d) => d.data);
  const inv = useMemo(() => buildInv(lists, followed, funds, fundData, qm, oneYear, qty, etfItems, heldIn), [lists, followed, funds, fundData.map((d) => d?.code ?? 0).join(","), quotes.data, oneYear, qty, etfq.data, heldIn]);   // eslint-disable-line react-hooks/exhaustive-deps
  const isStockTab = tab === "watchlist" || tab === "portfolio";
  // task #195: every list by the size of the last day's move, largest first (a fall as big as a rise)
  // task #316: the Sort dropdown (biggest move first, as before, by default); the choice is kept on the account
  const [ui, setUi] = useDashUi(), sort: InvSort = ui.invSort;
  const model = usePlanModel();
  const pmAll = usePlanPrism(sort === "reading" ? allSyms : [], model);
  const readOf = (r: { symbol?: string | null; kind?: string; health?: InvRow["health"] }) => r.kind === "mf" ? r.health?.score ?? null : r.kind === "etf" ? null : r.symbol ? scoreView(pmAll[r.symbol]).score : null;
  const list = isStockTab ? sortInv(lists[tab as "watchlist" | "portfolio"].map((f) => ({ ...f, day: qm.get(f.symbol)?.chg ?? null })), sort, readOf) : [];
  const invList = sortInv(tab === "mf" ? inv.funds : tab === "etf" ? inv.etfs : inv.all, sort, readOf);
  const more = useShowMore(list, LIMIT, tab), invMore = useShowMore(invList, INV_LIMIT, tab);
  const shown = more.visible, invShown = tab === "etf" ? invList : invMore.visible;   // task #223: the ETFs chip lists every ETF (it has no Show all)
  const syms = isStockTab ? shown.map((f) => f.symbol) : invShown.filter((r) => r.symbol).map((r) => r.symbol as string);
  const pm = usePlanPrism(syms, model);   // task #283: FinLit Prism for plans that have it, a locked pill otherwise
  const finsAll = useQueries({ queries: allSyms.map((s) => ({ queryKey: ["stock", s, "/financials"], queryFn: () => apiGet<Financials>(`/api/stocks/${s}/financials`), staleTime: 60_000, retry: false })) });
  const leads = useQueries({ queries: allSyms.map((s) => ({ queryKey: ["leadership", s], queryFn: () => apiGet<Leadership>(`/api/stocks/${encodeURIComponent(s)}/leadership`), staleTime: 15 * 60_000, retry: false })) });
  const finOf = new Map(allSyms.map((s, i) => [s, finsAll[i]])), leadOf = new Map(allSyms.map((s, i) => [s, leads[i]]));
  const fins = syms.map((s) => finOf.get(s)!);
  const idx = useIndices(), day = dayWord(new Date(), idx.data?.asOf ?? null);
  const sizeOf = (s: string): MyStock["size"] => capBucket(caps.get(s) ?? null)?.short ?? null;
  const { alerts } = useAlerts();
  const latestEnd = finsAll.map((f) => f.data?.quarterly?.pl?.periodEnds?.slice(-1)[0]).filter(Boolean).sort().pop();
  const priced = [...qm.values()].map((q) => q.date).filter(Boolean).sort().pop();
  const when = priced ? dayMonth(priced) : null;
  const counts = { watch: lists.watchlist.length, shares: lists.portfolio.length, funds: funds.length, etfs: inv.etfs.length };
  const navWhen = funds.map((h) => h.navDate).filter(Boolean).sort().pop();
  const subWhen = when ?? (navWhen ? dayMonth(navWhen) : null);
  const shownCount = isStockTab ? list.length : invList.length, noun: [string, string] = isStockTab ? ["stock", "stocks"] : tab === "mf" ? ["fund", "funds"] : tab === "etf" ? ["ETF", "ETFs"] : ["investment", "investments"];
  const any = followed.length > 0 || funds.length > 0 || inv.etfs.length > 0;
  const sub = any ? [investLine(shownCount, noun, day, subWhen, !isStockTab && counts.funds > 0), isStockTab && latestEnd ? `latest quarter ${quarterEndLabel(latestEnd)}` : null,
    showing ? `showing ${showing}` : null].filter(Boolean).join(" · ").replace(/biggest moves (today|on [^·]+?) first/, (m) => sort === "move" ? m : `${INV_SORT_LABEL[sort].replace("A–Z", "A to Z").toLowerCase()}`) : undefined;
  const open = tab === "portfolio" ? { to: "/holdings", long: "Open Equity portfolio", short: "Equity" } : tab === "mf" ? { to: "/mf-portfolio", long: "Open MF portfolio", short: "Funds" }
    : tab === "etf" ? { to: "/etf-portfolio", long: "Open ETF portfolio", short: "ETFs" } : { to: "/watchlist", long: "Open watchlist", short: "Watchlist" };
  const tabs: [StockTab, string, number][] = [["all", "All", inv.all.length], ["watchlist", "Watchlist", counts.watch], ["portfolio", "Equity", counts.shares], ["mf", "Mutual funds", counts.funds], ["etf", "ETFs", counts.etfs]];
  const right = (
    <div className="dsh-ys-tools">
      {any && <SegDd k="Show" segClass="dsh-ys-tabs" label="Which investments" value={tab} onChange={setTab} options={tabs.map(([k, l, n]) => ({ v: k, label: l, small: n }))} />}
      {any && <Dd k="Sort" value={sort} onChange={(v) => setUi({ invSort: v })} className="dx-sort" options={DASH_INV_SORTS.map((v) => ({ v, label: INV_SORT_LABEL[v] }))} />}
      <Link className="dsh-link" to={open.to}><span className="long">{open.long}</span><span className="short">{open.short}</span> →</Link>
    </div>
  );
  const reading = (r: InvRow) => {
    if (r.kind === "mf") { const h = healthText(r.health); return <span className={"dsh-pill dsh-hs " + h.band} title={h.title}>{h.text}</span>; }
    if (r.kind === "etf") return <span className="dsh-navt" title="The last close on the NSE against AMFI's NAV of the same day">{navText(r.premium)}</span>;
    return quotes.isLoading ? <i className="skeleton sk-p" /> : model === "prism" ? <PrismPill v={scoreView(pm[r.symbol!])} /> : <LockPill />;
  };
  return (
    <>
    <Card id="mystocks" title="Your investments today" sub={sub} right={right} className="dsh-ys">
      {loading ? <Rows n={3} h={56} /> : !any ? (
        <div className="dsh-empty"><b>Follow stocks or add your funds to see them here every day</b><p>Price, today's move, FinLit Prism and latest results for each stock you follow; NAV and Mutual Fund Score for your mutual funds.</p>
          <button type="button" className="dsh-search" onClick={() => dispatchEvent(new Event("finlit:open-search"))}>Find a stock to follow</button></div>
      ) : isStockTab ? (!list.length ? (
        tab === "portfolio"
          ? eqPicked ? <div className="dsh-empty"><b>No shares held in the portfolios picked above</b><p>Pick another portfolio in the Showing bar, or add shares to this one on the Equity portfolio page.</p><Link className="dsh-btn" to="/holdings">Open Equity portfolio</Link></div>
          : <div className="dsh-empty"><b>No shares in your portfolio yet</b><p>Add the shares you hold, by name or from your broker's file, to see them here.</p><Link className="dsh-btn" to="/holdings">Add your shares</Link></div>
          : <div className="dsh-empty"><b>Your watchlist is empty</b><p>Follow a few stocks to see their price, score and latest results here.</p><Link className="dsh-btn" to="/watchlist">Add stocks</Link></div>
      ) : (
        <div className="dsh-st" role="table" id={LIST_ID} aria-label={tab === "portfolio" ? "Stocks in your portfolio" : tab === "watchlist" ? "Stocks on your watchlist" : "Stocks you follow and hold"}>
          <div className="dsh-st-h" role="row"><span role="columnheader">Stock</span><span role="columnheader">Size<Tip text={`FinLit's size scale: ${SIZE_RULE_TEXT}.`} /></span><span role="columnheader" className="r">Price</span>
            <span role="columnheader" className="r">{day}<Tip text={day === "Today" ? "The share price move today." : `The share price move on ${day}, the latest trading day.`} /></span>
            <span role="columnheader">FinLit Prism<Tip text="FinLit Prism rates each company's financial health from 0 to 100." /></span>
            <span role="columnheader">Vs its peers<Tip text="Leader, In line or Laggard: the share price over the last year against similar companies and the sector index, with its place among them. It describes the past, not the future." /></span>
            <span role="columnheader" className="r">Revenue YoY<Tip text="The latest quarter's revenue against the same quarter a year earlier." /></span><span role="columnheader" className="r">Profit YoY<Tip text="The latest quarter's net profit against the same quarter a year earlier." /></span><span role="columnheader" className="r">Alert</span></div>
          {shown.map((f, i) => {
            const q = qm.get(f.symbol), fin = fins[i], pl = fin.data?.quarterly?.pl;
            const rev = pl ? yoyLabel(pl.rows.revenue, pl.periodEnds) : null, np = pl ? yoyLabel(pl.rows.net_profit, pl.periodEnds) : null;
            const mine = alerts.filter((a) => a.symbol === f.symbol && a.status !== "done");
            const reasonRev = fin.isError ? "Results not available for this company yet" : rev?.reason ?? undefined;
            const reasonNp = fin.isError ? "Results not available for this company yet" : np?.reason ?? undefined;
            return (
              <div className="dsh-st-r" role="row" key={f.symbol}>
                <div className="nm" role="cell"><span className="dsh-ys-sym"><CoLogo symbol={f.symbol} name={f.name} size={22} inline /><Link to={`/stocks/${f.symbol}`}>{/^\d+$/.test(f.symbol) && f.name ? f.name : f.symbol}</Link>{tab !== "portfolio" && held.has(f.symbol) ? <span className="dsh-held" title="In your Equity portfolio">Held</span> : null}</span><small>{f.name || ""}{held.has(f.symbol) ? <HeldIn acct={heldIn?.equity.get(f.symbol)} lead={f.name ? " · held in" : "Held in"} /> : null}</small></div>
                <div className="sz" role="cell">{sizeOf(f.symbol) ?? "–"}</div>
                <div className="dsh-pr r" role="cell">{quotes.isLoading ? <i className="skeleton sk-n" /> : q?.price != null ? "₹" + nf(q.price) : <span title="No traded price held yet">—</span>}</div>
                <div className={"ch r " + tone(q?.chg)} role="cell">{quotes.isLoading ? <i className="skeleton sk-n" /> : pct(q?.chg, 2)}</div>
                <div className="dsh-st-x">{sizeOf(f.symbol) && <span className="szm">{sizeOf(f.symbol)}</span>}<div className="sc" role="cell">{quotes.isLoading ? <i className="skeleton sk-p" /> : model === "prism" ? <PrismPill v={scoreView(pm[f.symbol])} /> : <LockPill />}</div>
                <div className="pr" role="cell">{(() => { const l = leadOf.get(f.symbol); if (l?.isLoading) return <i className="skeleton sk-p" />; const d = l?.data; if (!d) return <span className="dsh-na">—</span>; if (!d.available) return <span className="dsh-na" title={d.display?.line ?? "Not ranked among its peers"}>Not ranked</span>;
                  return <span className="dsh-peer"><span className={"dsh-pl " + d.label}>{PEER_WORD[d.label]}</span><small>{d.rank} of {d.peerGroup.ranked} peers</small></span>; })()}</div>
                <div className={"yy r " + tone(rev?.tone === "up" ? 1 : rev?.tone === "down" ? -1 : 0)} role="cell" title={reasonRev}><b className="lbl">Revenue </b>{fin.isLoading ? <i className="skeleton sk-n" /> : rev?.text ?? pct(rev?.pct)}</div>
                <div className={"yy r " + tone(np?.tone === "up" ? 1 : np?.tone === "down" ? -1 : 0)} role="cell" title={reasonNp}><b className="lbl">Profit </b>{fin.isLoading ? <i className="skeleton sk-n" /> : np?.text ?? pct(np?.pct)}</div>
                <div className="al r" role="cell">{mine.length ? <Link to="/alerts" title={mine.map((a) => a.label).join(", ")}>{mine.length === 1 ? (mine[0].met ? "Alert met" : "Alert set") : `${mine.length} alerts`}</Link> : <Link to="/alerts">Add alert</Link>}</div></div>
              </div>
            );
          })}
        </div>
      )) : !invList.length ? (
        tab === "mf" ? (has(PLAN_FOR_PORTFOLIO)
          ? <div className="dsh-empty"><b>No mutual funds added yet</b><p>Add your mutual funds to see their NAV and Mutual Fund Score here.</p><Link className="dsh-btn" to="/mf-portfolio">Add a fund</Link></div>
          : <div className="dsh-empty"><b>Track your mutual funds</b><p>The MF portfolio is part of Silver: add your funds to see their NAV here, and their Mutual Fund Score on Gold.</p><Link className="dsh-btn" to="/plans">See plans</Link></div>)
        : has(PLAN_FOR_PORTFOLIO)
          ? <div className="dsh-empty"><b>No ETFs added yet</b><p>Add the ETFs you hold on the ETF portfolio page to see their price, today's move and their price against NAV here.</p><Link className="dsh-btn" to="/etf-portfolio">Add your ETFs</Link></div>
          : <div className="dsh-empty"><b>Track your ETFs</b><p>The ETF portfolio is part of Silver: add your ETFs to see their price against NAV here. Every ETF on the NSE is on the ETFs page.</p><Link className="dsh-btn" to="/etfs">See ETFs</Link></div>
      ) : (
        <div className="dsh-st dsh-inv" role="table" id={LIST_ID} aria-label={tab === "mf" ? "Your mutual funds" : tab === "etf" ? "Your ETFs" : "Your investments"}>
          <div className="dsh-st-h" role="row"><span role="columnheader">Name</span><span role="columnheader">Type</span><span role="columnheader" className="r">Price or NAV</span>
            <span role="columnheader" className="r">{day}<Tip text={`The change on ${day === "Today" ? "today's" : `${day}'s`} session: the share price, or the fund's NAV against its previous NAV.`} /></span>
            <span role="columnheader" className="r">1 year<Tip text="The price or NAV change over the last year. Dividends are not included for shares and ETFs." /></span>
            <span role="columnheader">FinLit reading<Tip text={`Shares: FinLit Prism. Mutual funds: Mutual Fund Score (Gold). ETFs: the last price against the NAV.`} /></span><span role="columnheader" className="r">Alert</span></div>
          {invShown.map((r) => {
            const mine = r.symbol ? alerts.filter((a) => a.symbol === r.symbol && a.status !== "done") : [];
            return (
              <div className="dsh-st-r" role="row" key={r.key} data-kind={r.kind}>
                <div className="nm" role="cell"><span className="dsh-ys-sym">{r.symbol && <CoLogo symbol={r.symbol} name={r.name} size={22} inline />}<Link to={r.href}>{r.kind === "mf" ? r.name : r.symbol && !/^\d+$/.test(r.symbol) ? r.symbol : r.name}</Link></span><small>{r.sub}<HeldIn acct={r.acct} lead={r.kind === "share" ? " in" : " · held in"} /></small></div>
                <div className="ty" role="cell"><span className={"dsh-ty dsh-ty-" + r.kind}>{KIND_TAG[r.kind]}</span></div>
                <div className="dsh-pr r" role="cell" title={r.priceWhy}>{r.price != null ? "₹" + nf(r.price, r.kind === "mf" ? 4 : 2) : (r.kind === "mf" ? fundDetail.some((d) => d.isLoading) : quotes.isLoading) ? <i className="skeleton sk-n" /> : "—"}</div>
                <div className={"ch r " + tone(r.day)} role="cell" title={r.dayWhy}>{r.day != null ? pct(r.day, 2) : (r.kind === "mf" ? fundDetail.some((d) => d.isLoading) : quotes.isLoading) ? <i className="skeleton sk-n" /> : "—"}</div>
                <div className={"y1 r " + tone(r.y1)} role="cell" title={r.y1Why}>{pct(r.y1)}</div>
                <div className="sc" role="cell">{reading(r)}</div>
                <div className="al r" role="cell">{r.kind === "mf" ? <Link to={r.alertHref} title="Score alerts for a fund are set on its page">Add alert</Link>
                  : mine.length ? <Link to="/alerts" title={mine.map((a) => a.label).join(", ")}>{mine.length === 1 ? (mine[0].met ? "Alert met" : "Alert set") : `${mine.length} alerts`}</Link> : <Link to={r.alertHref}>Add alert</Link>}</div>
              </div>);
          })}
        </div>
      )}
      {!loading && isStockTab && list.length > 0 && <ShowMoreButton more={more} noun="stock" total={list.length} controls={LIST_ID} />}
      {/* task #223 (D1): Show all is hidden while the ETFs chip is on */}
      {!loading && !isStockTab && tab !== "etf" && invList.length > 0 && <ShowMoreButton more={invMore} noun={noun[0]} plural={noun[1]} total={invList.length} controls={LIST_ID} />}
    </Card>
    </>
  );
}

/** Task #195: "What your stocks say", its own block under the table. The signals count every followed stock: their prices, latest results and peer labels
 *  (the same cached calls as the table). One card per signal; the names sit in each card's dropdown. Descriptive only. */
export function Signals({ followed, caps = new Map() }: { followed: Followed[]; caps?: ReadonlyMap<string, number | null> }) {
  const syms = followed.map((f) => f.symbol);
  const quotes = useQuotesFor(syms), qm = quoteMap(quotes.data);
  const fins = useQueries({ queries: syms.map((s) => ({ queryKey: ["stock", s, "/financials"], queryFn: () => apiGet<Financials>(`/api/stocks/${s}/financials`), staleTime: 60_000, retry: false })) });
  const leads = useQueries({ queries: syms.map((s) => ({ queryKey: ["leadership", s], queryFn: () => apiGet<Leadership>(`/api/stocks/${encodeURIComponent(s)}/leadership`), staleTime: 15 * 60_000, retry: false })) });
  const idx = useIndices(), day = dayWord(new Date(), idx.data?.asOf ?? null);
  const loading = quotes.isLoading || fins.some((f) => f.isLoading) || leads.some((l) => l.isLoading);
  const signals = useMemo<Signal[]>(() => {
    if (loading) return [];
    const items: MyStock[] = syms.map((s, i) => {
      const pl = fins[i]?.data?.quarterly?.pl, np = pl ? yoyLabel(pl.rows.net_profit, pl.periodEnds) : null, l = leads[i]?.data;
      return { symbol: s, name: followed[i]?.name ?? null, chg: qm.get(s)?.chg ?? null, size: capBucket(caps.get(s) ?? null)?.short ?? null,
        profit: np?.pct ?? null, profitText: np?.text ?? null, reported: !!np && (np.pct != null || np.text != null),
        peer: !l ? null : l.available ? (l.label === "in_line" ? "inline" : l.label) : "unranked" };
    });
    const qe = fins.map((f) => f.data?.quarterly?.pl?.periodEnds?.slice(-1)[0]).filter((x): x is string => !!x).sort().pop() ?? null;
    return myStockSignals(items, day, qe);
  }, [loading, quotes.data, fins, leads, day, caps]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <SignalCards id="say" title="What your stocks say" sub="Signals from your shares' latest results and prices. Open a card for the names." signals={signals} loading={loading && followed.length > 0}
    empty={followed.length ? undefined : "Follow stocks or add the shares you hold: signals from their latest results and prices show here."} />;
}
