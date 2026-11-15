// Block 1, Your stocks today, as the "FinLit final pages" pack draws it (04): the stocks in My portfolio and on the watchlists, under All / Watchlist / Portfolio
// tabs (Held and Watchlist chips; held shares first), three cards counted over every followed stock (big falls, profit, peers), then six rows and "Show N more".
// Each row: size, price, the day's move, FinLit IQ (Prism for Gold), vs its peers, latest quarter against a year earlier, and any alert. Descriptive only.
import { scoreView, usePlanModel, usePlanPrism, type ScoreView } from "../../lib/planScore";
import { useMemo, useState } from "react";
import { CoLogo } from "../CoLogo";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { capBucket } from "../../lib/capBuckets";
import type { Leadership } from "../../lib/leadership";
import { dayWord, myStockCards, type MyStock } from "../../lib/dashPack";
import { useIndices } from "../../lib/indices";
import { Tip } from "../sectors/pack/Common";
import { DashCards, OpenAll } from "./DashCards";
import { apiGet, useQuotesFor, type Financials } from "../../lib/api";
import { useAlerts } from "../../lib/alerts";
import { quoteMap, BAND_LABEL } from "../../lib/globalSearch";
import { MINUS, nf } from "../../lib/format";
import { dayMonth, quarterEndLabel, yoyLabel } from "../../lib/dashboard";
import { Card, Rows, ShowMoreButton, tone, useShowMore } from "./parts";
import { useUI } from "../../lib/ui";
import { useMfPortfolio, type Holding as MfHolding } from "../../lib/mfPortfolio";
import type { FundDetail } from "../../lib/mf";
import { KIND_TAG, healthText, investRows, investSub, navText, type InvRow } from "../../lib/dashInvest";

export type Followed = { symbol: string; name: string | null };
export type StockTab = "all" | "watchlist" | "portfolio" | "mf" | "etf";   // task #135: Portfolio is shown as "Shares"; Mutual funds and ETFs added
const LIMIT = 6;
const INV_LIMIT = 10;   // All, Mutual funds and ETFs: the first 10, then "Show N more" (pack 06)
const LIST_ID = "dsh-mystocks-list";
const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(v, d) + "%");

/** Gold: the Prism score and its word (task #100). Its colour uses the same pill classes: green 70+, orange 50-69, red under 50. */
function PrismPill({ v }: { v: ScoreView }) {
  if (v.pending) return <i className="skeleton sk-p" />;
  if (v.score == null) return <span className="dsh-pill none" title={v.why ?? "Not rated yet"}>{v.word === "Not rated" ? "Not rated" : "Not rated yet"}</span>;
  return <span className={"dsh-pill " + (v.band === "hi" ? "strong" : v.band === "mid" ? "mixed" : "watch")} title={`FinLit Prism ${v.score} out of 100`}>{v.score} · {v.word}</span>;
}
function Pill({ score, band }: { score: number | null; band: string | null }) {
  if (band === "locked") return <span className="dsh-pill none" title="The FinLit IQ is part of the Silver plan">Silver</span>;
  if (score == null || !band) return <span className="dsh-pill none" title="Not scored yet">—</span>;
  return <span className={"dsh-pill " + band}>{Math.round(score)} · {BAND_LABEL[band] ?? band}</span>;
}

/** The three lists: everything followed, the watchlist part and the portfolio part (a share can be in both). */
export function stockLists(followed: Followed[], watch: ReadonlySet<string>, held: ReadonlySet<string>): Record<"all" | "watchlist" | "portfolio", Followed[]> {
  const all = [...followed.filter((f) => held.has(f.symbol)), ...followed.filter((f) => !held.has(f.symbol))];   // the pack lists the shares held first
  return { all, watchlist: followed.filter((f) => watch.has(f.symbol)), portfolio: followed.filter((f) => held.has(f.symbol)) };
}

/** Task #135: the rows of All, Mutual funds and ETFs. Shares and the watchlist from the quotes and the stock list (1-year move), funds from the MF portfolio
 *  (NAV, 1-year return, Health Score) and each fund's page answer (the last NAV move and its date). ETFs: none until the ETF portfolio exists (task #136). */
function buildInv(lists: ReturnType<typeof stockLists>, followed: Followed[], funds: MfHolding[], details: (FundDetail | undefined)[], qm: ReturnType<typeof quoteMap>,
  oneYear: ReadonlyMap<string, number | null>, qty: ReadonlyMap<string, number>): { all: InvRow[]; funds: InvRow[]; etfs: InvRow[] } {
  const nameOf = new Map(followed.map((f) => [f.symbol, f.name]));
  const stock = (sym: string, kind: "share" | "watch"): InvRow => {
    const q = qm.get(sym), n = qty.get(sym);
    return { key: kind + ":" + sym, kind, symbol: sym, name: nameOf.get(sym) || sym, sub: [nameOf.get(sym) || "", kind === "share" ? "held" : "watchlist"].filter(Boolean).join(" · "),
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
  const all = investRows({ shares, funds: fundRows, etfs: [], watch });
  return { all, funds: all.filter((r) => r.kind === "mf"), etfs: [] };
}

const PEER_WORD = { leader: "Leader", in_line: "In line", laggard: "Laggard" } as const;
export function MyStocks({ followed, loading, watch = new Set(), held = new Set(), caps = new Map(), oneYear = new Map(), qty = new Map() }: {
  followed: Followed[]; loading: boolean; watch?: ReadonlySet<string>; held?: ReadonlySet<string>; caps?: ReadonlyMap<string, number | null>;
  oneYear?: ReadonlyMap<string, number | null>; qty?: ReadonlyMap<string, number> }) {
  const [tab, setTab] = useState<StockTab>("all");
  const { has } = useUI();
  const lists = useMemo(() => stockLists(followed, watch, held), [followed, watch, held]);
  // task #135: the member's mutual funds (MF portfolio, Silver and up) with each fund's last NAV move from its own page's answer (cached, shared)
  const mfq = useMfPortfolio(has("silver"));
  const funds = mfq.data?.holdings ?? [];
  const fundDetail = useQueries({ queries: funds.map((h) => ({ queryKey: ["mf", "detail", h.code], queryFn: () => apiGet<FundDetail>(`/api/mf/${h.code}`), staleTime: 300_000, retry: false })) });
  const allSyms = followed.map((f) => f.symbol);
  // the cards count every followed stock, so prices, results and peer labels are read for all of them (each call is cached and shared with the rows)
  const quotes = useQuotesFor(allSyms), qm = quoteMap(quotes.data);
  const fundData = fundDetail.map((d) => d.data);
  const inv = useMemo(() => buildInv(lists, followed, funds, fundData, qm, oneYear, qty), [lists, followed, funds, fundData.map((d) => d?.code ?? 0).join(","), quotes.data, oneYear, qty]);   // eslint-disable-line react-hooks/exhaustive-deps
  const isStockTab = tab === "watchlist" || tab === "portfolio";
  const list = isStockTab ? lists[tab as "watchlist" | "portfolio"] : [];
  const invList = tab === "mf" ? inv.funds : tab === "etf" ? inv.etfs : inv.all;
  const more = useShowMore(list, LIMIT, tab), invMore = useShowMore(invList, INV_LIMIT, tab);
  const shown = more.visible, invShown = invMore.visible;
  const syms = isStockTab ? shown.map((f) => f.symbol) : invShown.filter((r) => r.symbol).map((r) => r.symbol as string);
  const model = usePlanModel(), pm = usePlanPrism(syms, model);   // task #100: Gold sees FinLit Prism, Silver the FinLit IQ
  const finsAll = useQueries({ queries: allSyms.map((s) => ({ queryKey: ["stock", s, "/financials"], queryFn: () => apiGet<Financials>(`/api/stocks/${s}/financials`), staleTime: 60_000, retry: false })) });
  const leads = useQueries({ queries: allSyms.map((s) => ({ queryKey: ["leadership", s], queryFn: () => apiGet<Leadership>(`/api/stocks/${encodeURIComponent(s)}/leadership`), staleTime: 15 * 60_000, retry: false })) });
  const finOf = new Map(allSyms.map((s, i) => [s, finsAll[i]])), leadOf = new Map(allSyms.map((s, i) => [s, leads[i]]));
  const fins = syms.map((s) => finOf.get(s)!);
  const idx = useIndices(), day = dayWord(new Date(), idx.data?.asOf ?? null);
  const sizeOf = (s: string) => (capBucket(caps.get(s) ?? null)?.label.replace(" cap", "") ?? null) as MyStock["size"];
  const peerOf = (s: string): MyStock["peer"] => { const l = leadOf.get(s)?.data; return !l ? null : l.available ? (l.label === "in_line" ? "inline" : l.label) : "unranked"; };
  const cards = useMemo(() => {
    if (quotes.isLoading || finsAll.some((f) => f.isLoading) || leads.some((l) => l.isLoading)) return [];
    const items: MyStock[] = allSyms.map((s) => { const pl = finOf.get(s)?.data?.quarterly?.pl, np = pl ? yoyLabel(pl.rows.net_profit, pl.periodEnds) : null;
      return { symbol: s, name: followed.find((f) => f.symbol === s)?.name ?? null, chg: qm.get(s)?.chg ?? null, size: sizeOf(s), profit: np?.pct ?? null, profitText: np?.text ?? null, reported: !!np && (np.pct != null || np.text != null), peer: peerOf(s) }; });
    const qe = finsAll.map((f) => f.data?.quarterly?.pl?.periodEnds?.slice(-1)[0]).filter((x): x is string => !!x).sort().pop() ?? null;
    return myStockCards(items, day, qe);
  }, [quotes.isLoading, quotes.data, finsAll, leads, day]);   // eslint-disable-line react-hooks/exhaustive-deps
  const { alerts } = useAlerts();
  const latestEnd = finsAll.map((f) => f.data?.quarterly?.pl?.periodEnds?.slice(-1)[0]).filter(Boolean).sort().pop();
  const priced = [...qm.values()].map((q) => q.date).filter(Boolean).sort().pop();
  const when = priced ? dayMonth(priced) : null;
  const counts = { watch: lists.watchlist.length, shares: lists.portfolio.length, funds: funds.length, etfs: inv.etfs.length };
  const navWhen = funds.map((h) => h.navDate).filter(Boolean).sort().pop();
  const subWhen = when ?? (navWhen ? dayMonth(navWhen) : null);
  const sub = followed.length || funds.length ? [investSub(counts, subWhen), tab === "watchlist" || tab === "portfolio" ? (latestEnd ? `latest quarter ${quarterEndLabel(latestEnd)}` : null) : null].filter(Boolean).join(" · ") : undefined;
  const open = tab === "portfolio" ? { to: "/holdings", long: "Open Equity portfolio", short: "Shares" } : tab === "mf" ? { to: "/mf-portfolio", long: "Open MF portfolio", short: "Funds" }
    : tab === "etf" ? { to: "/etfs", long: "Open ETFs", short: "ETFs" } : { to: "/watchlist", long: "Open watchlist", short: "Watchlist" };
  const tabs: [StockTab, string, number][] = [["all", "All", inv.all.length], ["watchlist", "Watchlist", counts.watch], ["portfolio", "Shares", counts.shares], ["mf", "Mutual funds", counts.funds], ["etf", "ETFs", counts.etfs]];
  const right = (
    <div className="dsh-ys-tools">
      {(followed.length > 0 || funds.length > 0) && <div className="dsh-seg dsh-ys-tabs" role="group" aria-label="Which investments">
        {tabs.map(([k, l, n]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l} <span className="n">{n}</span></button>)}</div>}
      <Link className="dsh-link" to={open.to}><span className="long">{open.long}</span><span className="short">{open.short}</span> →</Link>
    </div>
  );
  const reading = (r: InvRow) => {
    if (r.kind === "mf") { const h = healthText(r.health); return <span className={"dsh-pill dsh-hs " + h.band} title={h.title}>{h.text}</span>; }
    if (r.kind === "etf") return <span className="dsh-navt" title="The last close on the NSE against AMFI's NAV of the same day">{navText(r.premium)}</span>;
    const q = qm.get(r.symbol!);
    return quotes.isLoading ? <i className="skeleton sk-p" /> : model === "prism" ? <PrismPill v={scoreView("prism", { score: null }, pm[r.symbol!])} /> : <Pill score={q?.score ?? null} band={q?.band ?? null} />;
  };
  return (
    <>
    <Card id="mystocks" title="Your investments today" sub={sub} right={right} className="dsh-ys">
      {loading ? <Rows n={3} h={56} /> : !followed.length && !funds.length ? (
        <div className="dsh-empty"><b>Follow stocks or add your funds to see them here every day</b><p>Price, today's move, {model === "prism" ? "FinLit Prism" : "FinLit IQ"} and latest results for each stock you follow; NAV and the Health Score for your mutual funds.</p>
          <button type="button" className="dsh-search" onClick={() => dispatchEvent(new Event("finlit:open-search"))}>Find a stock to follow</button></div>
      ) : isStockTab ? (!list.length ? (
        tab === "portfolio"
          ? <div className="dsh-empty"><b>No shares in your portfolio yet</b><p>Add the shares you hold, by name or from your broker's file, to see them here.</p><Link className="dsh-btn" to="/holdings">Add your shares</Link></div>
          : <div className="dsh-empty"><b>Your watchlist is empty</b><p>Follow a few stocks to see their price, score and latest results here.</p><Link className="dsh-btn" to="/watchlist">Add stocks</Link></div>
      ) : (
        <div className="dsh-st" role="table" id={LIST_ID} aria-label={tab === "portfolio" ? "Stocks in your portfolio" : tab === "watchlist" ? "Stocks on your watchlist" : "Stocks you follow and hold"}>
          <div className="dsh-st-h" role="row"><span role="columnheader">Stock</span><span role="columnheader">Size<Tip text="FinLit's size scale: Large above ₹50,000 Cr, Mid ₹10,000–50,000 Cr, Small below ₹10,000 Cr." /></span><span role="columnheader" className="r">Price</span>
            <span role="columnheader" className="r">{day}<Tip text={day === "Today" ? "The share price move today." : `The share price move on ${day}, the latest trading day.`} /></span>
            <span role="columnheader">{model === "prism" ? "FinLit Prism" : "FinLit IQ"}<Tip text={model === "prism" ? "FinLit Prism rates each company's financial health from 0 to 100." : "FinLit IQ rates each company's financial health from 0 to 100."} /></span>
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
                <div className="nm" role="cell"><span className="dsh-ys-sym"><CoLogo symbol={f.symbol} name={f.name} size={22} inline /><Link to={`/stocks/${f.symbol}`}>{/^\d+$/.test(f.symbol) && f.name ? f.name : f.symbol}</Link>{tab !== "portfolio" && held.has(f.symbol) ? <span className="dsh-held" title="In your Equity portfolio">Held</span> : null}</span><small>{f.name || ""}</small></div>
                <div className="sz" role="cell">{sizeOf(f.symbol) ?? "–"}</div>
                <div className="dsh-pr r" role="cell">{quotes.isLoading ? <i className="skeleton sk-n" /> : q?.price != null ? "₹" + nf(q.price) : <span title="No traded price held yet">—</span>}</div>
                <div className={"ch r " + tone(q?.chg)} role="cell">{quotes.isLoading ? <i className="skeleton sk-n" /> : pct(q?.chg, 2)}</div>
                <div className="dsh-st-x">{sizeOf(f.symbol) && <span className="szm">{sizeOf(f.symbol)}</span>}<div className="sc" role="cell">{quotes.isLoading ? <i className="skeleton sk-p" /> : model === "prism" ? <PrismPill v={scoreView("prism", { score: null }, pm[f.symbol])} /> : <Pill score={q?.score ?? null} band={q?.band ?? null} />}</div>
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
        tab === "mf" ? (has("silver")
          ? <div className="dsh-empty"><b>No mutual funds added yet</b><p>Add your mutual funds to see their NAV and Health Score here.</p><Link className="dsh-btn" to="/mf-portfolio">Add a fund</Link></div>
          : <div className="dsh-empty"><b>Track your mutual funds</b><p>The MF portfolio is part of Silver: add your funds to see their NAV here, and their Health Score on Gold.</p><Link className="dsh-btn" to="/plans">See plans</Link></div>)
        : <div className="dsh-empty"><b>No ETFs added yet</b><p>ETFs you hold will show here with their price against NAV once the ETF portfolio opens. Until then, every ETF on the NSE is on the ETFs page.</p><Link className="dsh-btn" to="/etfs">See ETFs</Link></div>
      ) : (
        <div className="dsh-st dsh-inv" role="table" id={LIST_ID} aria-label={tab === "mf" ? "Your mutual funds" : tab === "etf" ? "Your ETFs" : "Your investments"}>
          <div className="dsh-st-h" role="row"><span role="columnheader">Name</span><span role="columnheader">Type</span><span role="columnheader" className="r">Price or NAV</span>
            <span role="columnheader" className="r">{day}<Tip text={`The change on ${day === "Today" ? "today's" : `${day}'s`} session: the share price, or the fund's NAV against its previous NAV.`} /></span>
            <span role="columnheader" className="r">1 year<Tip text="The price or NAV change over the last year. Dividends are not included for shares and ETFs." /></span>
            <span role="columnheader">FinLit reading<Tip text={`Shares: ${model === "prism" ? "FinLit Prism" : "FinLit IQ"}. Mutual funds: the Health Score (Gold). ETFs: the last price against the NAV.`} /></span><span role="columnheader" className="r">Alert</span></div>
          {invShown.map((r) => {
            const mine = r.symbol ? alerts.filter((a) => a.symbol === r.symbol && a.status !== "done") : [];
            return (
              <div className="dsh-st-r" role="row" key={r.key} data-kind={r.kind}>
                <div className="nm" role="cell"><span className="dsh-ys-sym">{r.symbol && <CoLogo symbol={r.symbol} name={r.name} size={22} inline />}<Link to={r.href}>{r.kind === "mf" ? r.name : r.symbol && !/^\d+$/.test(r.symbol) ? r.symbol : r.name}</Link></span><small>{r.sub}</small></div>
                <div className="ty" role="cell"><span className={"dsh-ty " + r.kind}>{KIND_TAG[r.kind]}</span></div>
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
      {!loading && isStockTab && list.length > 0 && <ShowMoreButton more={more} noun="stock" controls={LIST_ID} />}
      {!loading && !isStockTab && invList.length > 0 && <ShowMoreButton more={invMore} noun="investment" controls={LIST_ID} />}
    </Card>
    {/* task #135: "What your stocks say", under the table: the cards about the member's own stocks (results, peers), each one opening to its names */}
    {cards.length > 0 && (
      <section className="sp dsh-say" aria-labelledby="dsh-say-h">
        <div className="dsh-say-h"><div><h2 id="dsh-say-h">What your stocks say</h2><p className="dsh-sub">Tap a card to see the names behind it.</p></div><OpenAll scope="say" n={cards.length} /></div>
        <DashCards items={cards} scope="say" cols={Math.min(cards.length, 3)} />
      </section>)}
    </>
  );
}
