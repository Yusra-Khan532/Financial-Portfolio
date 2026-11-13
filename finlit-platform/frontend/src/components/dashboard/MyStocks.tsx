// Block 1, Your stocks today: the stocks on the member's watchlists and in My portfolio, under All / Watchlist / Portfolio tabs (a "Held" chip marks a share in
// the portfolio). Five rows, then "Show N more". Each row: price and today's move from the quotes call for the rows shown, FinLit IQ, latest quarter against the same
// quarter a year earlier, and any alert. Descriptive only; a blank carries its reason.
import { scoreView, usePlanModel, usePlanPrism, type ScoreView } from "../../lib/planScore";
import { useMemo, useState } from "react";
import { CoLogo } from "../CoLogo";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { apiGet, useQuotesFor, type Financials } from "../../lib/api";
import { useAlerts } from "../../lib/alerts";
import { quoteMap, BAND_LABEL } from "../../lib/globalSearch";
import { MINUS, nf } from "../../lib/format";
import { dayMonth, quarterEndLabel, yoyLabel } from "../../lib/dashboard";
import { Card, Rows, ShowMoreButton, tone, useShowMore } from "./parts";

export type Followed = { symbol: string; name: string | null };
export type StockTab = "all" | "watchlist" | "portfolio";
const LIMIT = 5;
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
  return { all: followed, watchlist: followed.filter((f) => watch.has(f.symbol)), portfolio: followed.filter((f) => held.has(f.symbol)) };
}

export function MyStocks({ followed, loading, watch = new Set(), held = new Set() }: { followed: Followed[]; loading: boolean; watch?: ReadonlySet<string>; held?: ReadonlySet<string> }) {
  const [tab, setTab] = useState<StockTab>("all");
  const lists = useMemo(() => stockLists(followed, watch, held), [followed, watch, held]);
  const list = lists[tab];
  const more = useShowMore(list, LIMIT, tab);
  const shown = more.visible, syms = shown.map((f) => f.symbol);
  const quotes = useQuotesFor(syms), qm = quoteMap(quotes.data);
  const model = usePlanModel(), pm = usePlanPrism(syms, model);   // task #100: Gold sees FinLit Prism, Silver the FinLit IQ
  const fins = useQueries({ queries: syms.map((s) => ({ queryKey: ["stock", s, "/financials"], queryFn: () => apiGet<Financials>(`/api/stocks/${s}/financials`), staleTime: 60_000, retry: false })) });
  const { alerts } = useAlerts();
  const latestEnd = fins.map((f) => f.data?.quarterly?.pl?.periodEnds?.slice(-1)[0]).filter(Boolean).sort().pop();
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
        <div className="dsh-st" role="table" id={LIST_ID} aria-label={tab === "portfolio" ? "Stocks in your portfolio" : tab === "watchlist" ? "Stocks on your watchlist" : "Stocks you follow and hold"}>
          <div className="dsh-st-h" role="row"><span role="columnheader">Stock</span><span role="columnheader" className="r">Price</span><span role="columnheader" className="r">Today</span><span role="columnheader">{model === "prism" ? "FinLit Prism" : "FinLit IQ"}</span><span role="columnheader" className="r">Revenue YoY</span><span role="columnheader" className="r">Profit YoY</span><span role="columnheader" className="r">Alert</span></div>
          {shown.map((f, i) => {
            const q = qm.get(f.symbol), fin = fins[i], pl = fin.data?.quarterly?.pl;
            const rev = pl ? yoyLabel(pl.rows.revenue, pl.periodEnds) : null, np = pl ? yoyLabel(pl.rows.net_profit, pl.periodEnds) : null;
            const mine = alerts.filter((a) => a.symbol === f.symbol && a.status !== "done");
            const reasonRev = fin.isError ? "Results not available for this company yet" : rev?.reason ?? undefined;
            const reasonNp = fin.isError ? "Results not available for this company yet" : np?.reason ?? undefined;
            return (
              <div className="dsh-st-r" role="row" key={f.symbol}>
                <div className="nm" role="cell"><span className="dsh-ys-sym"><CoLogo symbol={f.symbol} name={f.name} size={22} inline /><Link to={`/stocks/${f.symbol}`}>{/^\d+$/.test(f.symbol) && f.name ? f.name : f.symbol}</Link>{tab !== "portfolio" && held.has(f.symbol) && <span className="dsh-held" title="In your Equity portfolio">Held</span>}</span><small>{f.name || ""}</small></div>
                <div className="dsh-pr r" role="cell">{quotes.isLoading ? <i className="skeleton sk-n" /> : q?.price != null ? "₹" + nf(q.price) : <span title="No traded price held yet">—</span>}</div>
                <div className={"ch r " + tone(q?.chg)} role="cell">{quotes.isLoading ? <i className="skeleton sk-n" /> : pct(q?.chg, 2)}</div>
                <div className="dsh-st-x"><div className="sc" role="cell">{quotes.isLoading ? <i className="skeleton sk-p" /> : model === "prism" ? <PrismPill v={scoreView("prism", { score: null }, pm[f.symbol])} /> : <Pill score={q?.score ?? null} band={q?.band ?? null} />}</div>
                <div className={"yy r " + tone(rev?.tone === "up" ? 1 : rev?.tone === "down" ? -1 : 0)} role="cell" title={reasonRev}><b className="lbl">Revenue </b>{fin.isLoading ? <i className="skeleton sk-n" /> : rev?.text ?? pct(rev?.pct)}</div>
                <div className={"yy r " + tone(np?.tone === "up" ? 1 : np?.tone === "down" ? -1 : 0)} role="cell" title={reasonNp}><b className="lbl">Profit </b>{fin.isLoading ? <i className="skeleton sk-n" /> : np?.text ?? pct(np?.pct)}</div>
                <div className="al r" role="cell">{mine.length ? <Link to="/alerts" title={mine.map((a) => a.label).join(", ")}>{mine.length === 1 ? (mine[0].met ? "Alert met" : "Alert set") : `${mine.length} alerts`}</Link> : <Link to="/alerts">Add alert</Link>}</div></div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && list.length > 0 && <ShowMoreButton more={more} noun="stock" controls={LIST_ID} />}
    </Card>
  );
}
