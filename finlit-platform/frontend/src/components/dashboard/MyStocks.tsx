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
import { Cards, Tip } from "../sectors/pack/Common";
import { apiGet, useQuotesFor, type Financials } from "../../lib/api";
import { useAlerts } from "../../lib/alerts";
import { quoteMap, BAND_LABEL } from "../../lib/globalSearch";
import { MINUS, nf } from "../../lib/format";
import { dayMonth, quarterEndLabel, yoyLabel } from "../../lib/dashboard";
import { Card, Rows, ShowMoreButton, tone, useShowMore } from "./parts";

export type Followed = { symbol: string; name: string | null };
export type StockTab = "all" | "watchlist" | "portfolio";
const LIMIT = 6;
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
export function stockLists(followed: Followed[], watch: ReadonlySet<string>, held: ReadonlySet<string>): Record<StockTab, Followed[]> {
  const all = [...followed.filter((f) => held.has(f.symbol)), ...followed.filter((f) => !held.has(f.symbol))];   // the pack lists the shares held first
  return { all, watchlist: followed.filter((f) => watch.has(f.symbol)), portfolio: followed.filter((f) => held.has(f.symbol)) };
}

const PEER_WORD = { leader: "Leader", in_line: "In line", laggard: "Laggard" } as const;
export function MyStocks({ followed, loading, watch = new Set(), held = new Set(), caps = new Map() }: { followed: Followed[]; loading: boolean; watch?: ReadonlySet<string>; held?: ReadonlySet<string>; caps?: ReadonlyMap<string, number | null> }) {
  const [tab, setTab] = useState<StockTab>("all");
  const lists = useMemo(() => stockLists(followed, watch, held), [followed, watch, held]);
  const list = lists[tab];
  const more = useShowMore(list, LIMIT, tab);
  const shown = more.visible, syms = shown.map((f) => f.symbol), allSyms = followed.map((f) => f.symbol);
  // the cards count every followed stock, so prices, results and peer labels are read for all of them (each call is cached and shared with the rows)
  const quotes = useQuotesFor(allSyms), qm = quoteMap(quotes.data);
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
      return { symbol: s, chg: qm.get(s)?.chg ?? null, size: sizeOf(s), profit: np?.pct ?? null, profitText: np?.text ?? null, reported: !!np && (np.pct != null || np.text != null), peer: peerOf(s) }; });
    const qe = finsAll.map((f) => f.data?.quarterly?.pl?.periodEnds?.slice(-1)[0]).filter((x): x is string => !!x).sort().pop() ?? null;
    return myStockCards(items, day, qe);
  }, [quotes.isLoading, quotes.data, finsAll, leads, day]);   // eslint-disable-line react-hooks/exhaustive-deps
  const { alerts } = useAlerts();
  const latestEnd = finsAll.map((f) => f.data?.quarterly?.pl?.periodEnds?.slice(-1)[0]).filter(Boolean).sort().pop();
  const priced = [...qm.values()].map((q) => q.date).filter(Boolean).sort().pop();
  const when = priced ? dayMonth(priced) : null;
  const tail = [when ? `prices of ${when}` : null, latestEnd ? `latest quarter ${quarterEndLabel(latestEnd)}` : null].filter(Boolean).join(" · ");
  const head = tab === "portfolio" ? `${lists.portfolio.length} held` : tab === "watchlist" ? `${lists.watchlist.length} on your watchlist`
    : `${lists.watchlist.length} on your watchlist, ${lists.portfolio.length} in your portfolio`;
  const sub = followed.length ? [head, tail].filter(Boolean).join(" · ") : undefined;
  const open = tab === "portfolio" ? { to: "/holdings", long: "Open Equity portfolio", short: "Portfolio" } : { to: "/watchlist", long: "Open watchlist", short: "Watchlist" };
  const tabs: [StockTab, string][] = [["all", "All"], ["watchlist", "Watchlist"], ["portfolio", "Portfolio"]];
  const right = (
    <div className="dsh-ys-tools">
      {followed.length > 0 && <div className="dsh-seg dsh-ys-tabs" role="group" aria-label="Which stocks">
        {tabs.map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l} <span className="n">{lists[k].length}</span></button>)}</div>}
      <Link className="dsh-link" to={open.to}><span className="long">{open.long}</span><span className="short">{open.short}</span> →</Link>
    </div>
  );
  return (
    <Card id="mystocks" title="Your stocks today" sub={sub} right={right} className="dsh-ys">
      {loading ? <Rows n={3} h={56} /> : !followed.length ? (
        <div className="dsh-empty"><b>Follow stocks to see them here every day</b><p>Price, today's move, {model === "prism" ? "FinLit Prism" : "FinLit IQ"} and latest results for each stock you follow.</p>
          <button type="button" className="dsh-search" onClick={() => dispatchEvent(new Event("finlit:open-search"))}>Find a stock to follow</button></div>
      ) : !list.length ? (
        tab === "portfolio"
          ? <div className="dsh-empty"><b>No shares in your portfolio yet</b><p>Add the shares you hold, by name or from your broker's file, to see them here.</p><Link className="dsh-btn" to="/holdings">Add your shares</Link></div>
          : <div className="dsh-empty"><b>Your watchlist is empty</b><p>Follow a few stocks to see their price, score and latest results here.</p><Link className="dsh-btn" to="/watchlist">Add stocks</Link></div>
      ) : (
        <>
        {tab === "all" && cards.length > 0 && <div className="sp dsh-cards"><Cards items={cards} /></div>}
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
                <div className="nm" role="cell"><span className="dsh-ys-sym"><CoLogo symbol={f.symbol} name={f.name} size={22} inline /><Link to={`/stocks/${f.symbol}`}>{/^\d+$/.test(f.symbol) && f.name ? f.name : f.symbol}</Link>{tab !== "portfolio" && held.has(f.symbol) ? <span className="dsh-held" title="In your Equity portfolio">Held</span> : tab === "all" && watch.has(f.symbol) ? <span className="dsh-held wl" title="On your watchlist">Watchlist</span> : null}</span><small>{f.name || ""}</small></div>
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
        </>
      )}
      {!loading && list.length > 0 && <ShowMoreButton more={more} noun="stock" controls={LIST_ID} />}
    </Card>
  );
}
