// Bulk & Block Deals: the third view of the IPOs page (/ipo?view=deals; /deals redirects here). NSE's bulk, block and short-selling deals, read by the
// `deals` job (finlit/deals.py) and served by finlit/dealsapi.py.
//   Header: last updated, exchanges, how far back the history goes; one line saying what is shown ("Last 7 days · NSE · 679 deals (612 trades after
//   removing block deals also listed as bulk)"); what bulk and block deals are, folded.
//   Filters (all in the address, so a view can be shared): side, kind, period (or two dates), search a share or client, a minimum value.
//   Largest deals (each trade once), the summary strip (bought and sold by kind, most active shares and clients), then the table (sortable, paged, its
//   header sticking) or cards on a phone, and the CSV of every matching row. A client's own view (&client=…): net per share, shares both bought and sold.
// Counted once: NSE lists most block deals in its bulk file too; such a bulk line is shown under Bulk with "also block" and left out everywhere else.
// Describes what was traded, by whom, at what price; never advises.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router";
import { dateFormat, MINUS, nf } from "../lib/format";
import { apiUrl } from "../lib/api";
import {
  countLine, crIn, csvPath, dayIn, filtersFromParams, KIND_LABEL, KINDS, MINS, NO_FILTERS, paramsFromFilters, periodLabel, PERIODS, SIDES, useClientDeals, useDealList, useDealSummary,
  type Coverage, type Deal, type DealFilters, type DealSummary, type SortKey, type Totals,
} from "../lib/deals";
import { Chips, Dd, Ico, OptList } from "../discovery/Toolbar";
import { DealFollow } from "../components/DealFollow";
import "../discovery/discover.css";
import "../styles/ipo-all.css";
import "../styles/ipo-all-compact.css";
import "../styles/deals.css";

const stampIn = (iso: string | null | undefined) => (iso ? dateFormat({ day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso)) + " IST" : MINUS);
const signedCr = (v: number) => (v > 0 ? "+" : v < 0 ? MINUS : "") + crIn(Math.abs(v));
const rupee = (v: number | null | undefined) => (v == null ? MINUS : "₹" + nf(v, 2));
const pctIn = (v: number | null | undefined, dp = 1) => (v == null ? MINUS : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), dp)}%`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");
const qtyIn = (v: number) => nf(v, 0);

/** What bulk and block deals are (the glossary's words). */
export const EXPLAIN: [string, string][] = [
  ["Bulk deal", "Any client's trades in one share on one day that add up to more than 0.5% of the company's listed shares. They happen in the normal market; the broker reports them the same day and the exchange publishes them after the close."],
  ["Block deal", "A single large trade in the separate block-deal windows. Since 7 Dec 2025 (SEBI circular SEBI/HO/MRD/POD-III/CIR/P/2025/134 of 8 Oct 2025): the morning window 08:45–09:00, priced off the previous close, and the afternoon window 14:05–14:20, priced off a VWAP; the price within ±3% of that reference; at least ₹25 crore an order (₹10 crore before); delivery is compulsory."],
  ["Short selling (reported)", "Shares sold short in the day, as the exchange reports them from the brokers' disclosures: the share and the quantity, with no client name."],
  ["Counted once", "A block deal is usually above 0.5% of the shares too, so NSE often lists the same trade in both files. Here such a bulk line keeps an \"also block\" tag under Bulk and is left out of All deals, every total and the largest deals."],
];

/** /deals: the IPOs page on its deals view, every parameter kept. */
export function DealsRedirect() {
  const { search } = useLocation();
  const p = new URLSearchParams(search);
  p.delete("view");
  const rest = p.toString();
  return <Navigate to={`/ipo?view=deals${rest ? "&" + rest : ""}`} replace />;
}

function SegRow({ label, value, opts, onChange }: { label: string; value: string; opts: [string, string][]; onChange: (v: string) => void }) {
  return <div className="bbd-seg"><span>{label}</span><div className="dbx-seg" role="radiogroup" aria-label={label}>{opts.map(([v, t]) => (
    <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{t}</button>))}</div></div>;
}

const SideBadge = ({ d }: { d: Deal }) => (d.kind === "short" ? <span className="bbd-b short">Short</span>
  : <span className={"bbd-b " + (d.side ?? "")}>{d.side === "buy" ? "Buy" : d.side === "sell" ? "Sell" : MINUS}</span>);

function Tags({ d }: { d: Deal }) {
  return <>{d.alsoBlock && <span className="bbd-tag" title="The same trade is in NSE's block-deal file; counted once">also block</span>}
    {d.alsoBulk && <span className="bbd-tag" title="NSE lists this trade in its bulk-deal file too; counted once">also in bulk list</span>}</>;
}

/** "Close now ₹X, +Y% since deal", or why it is not worked out. */
function Since({ d, long }: { d: Deal; long?: boolean }) {
  if (d.closeNow == null) return <span className="muted" title="No latest close held for this share">{long ? "No latest close held" : MINUS}</span>;
  return <>{long ? "Close now " : ""}{rupee(d.closeNow)}{d.sinceDealPct != null ? <>, <span className={tone(d.sinceDealPct)}>{pctIn(d.sinceDealPct)}</span>{long ? " since deal" : ""}</>
    : <small className="muted" title={d.sinceNote ?? undefined}>{d.sinceNote?.startsWith("a split") ? "split or bonus since: not compared" : "not compared"}</small>}</>;
}

function StockCell({ d }: { d: Deal }) {
  return <><Link to={`/stocks/${encodeURIComponent(d.symbol)}`}>{d.symbol}</Link><small>{d.name ?? ""}</small></>;
}

function ClientLink({ d, onClient }: { d: Deal; onClient: (k: string) => void }) {
  if (!d.client || !d.clientKey) return <span className="muted">{d.kind === "short" ? "Not published for short sales" : MINUS}</span>;
  return <button type="button" className="bbd-cl" onClick={() => onClient(d.clientKey!)} title={`Every deal by ${d.client}`}>{d.client}</button>;
}

function Largest({ s, label, onClient }: { s: DealSummary; label: string; onClient: (k: string) => void }) {
  if (!s.largest.length) return null;
  return <section className="bbd-sec" aria-label="Largest deals">
    <h3 className="bbd-h">Largest deals <small>each trade once · {label}</small></h3>
    <div className="bbd-lg">{s.largest.map((d) => (
      <article key={d.id} className="card ui-card ui-card--sm bbd-lc">
        <div className="bbd-lh"><Link to={`/stocks/${encodeURIComponent(d.symbol)}`} className="bbd-ls">{d.symbol}</Link><SideBadge d={d} /></div>
        <p className="bbd-ln">{d.name}</p>
        <p className="bbd-lv">{crIn(d.valueCr)}</p>
        <p className="bbd-lm">{KIND_LABEL[d.kind]} · {d.exchange} · {dayIn(d.day)}{d.alsoBulk ? " · also in bulk list" : ""}</p>
        <p className="bbd-lcl"><ClientLink d={d} onClient={onClient} /></p>
        <p className="bbd-lm">{qtyIn(d.qty)} shares at {rupee(d.price)}{d.pctEquity != null ? ` · ${nf(d.pctEquity, 2)}% of equity` : ""}</p>
        <p className="bbd-lm"><Since d={d} long /></p>
      </article>))}</div>
  </section>;
}

function Strip({ t, s, onClient, onShare }: { t: Totals; s?: DealSummary; onClient: (k: string) => void; onShare: (sym: string) => void }) {
  return <section className="bbd-strip" aria-label="Summary of the period">
    <div className="card bbd-sb"><h4>Bought and sold, by kind</h4>
      <dl>
        <div><dt>Bulk</dt><dd><span className="up">{crIn(t.byKind.bulk.buyCr)}</span> bought · <span className="down">{crIn(t.byKind.bulk.sellCr)}</span> sold <small>{nf(t.byKind.bulk.trades, 0)} trades</small></dd></div>
        <div><dt>Block</dt><dd><span className="up">{crIn(t.byKind.block.buyCr)}</span> bought · <span className="down">{crIn(t.byKind.block.sellCr)}</span> sold <small>{nf(t.byKind.block.trades, 0)} trades</small></dd></div>
        <div><dt>Short selling</dt><dd>{nf(t.byKind.short.qty, 0)} shares <small>{nf(t.byKind.short.deals, 0)} reports</small></dd></div>
      </dl></div>
    <div className="card bbd-sb"><h4>Most active shares <small>by value traded</small></h4>
      {s?.activeShares.length ? <ol>{s.activeShares.slice(0, 5).map((x) => <li key={x.symbol}><button type="button" className="bbd-cl" onClick={() => onShare(x.symbol)}>{x.symbol}</button>
        <span>{crIn(x.grossCr)}</span><small className={tone(x.netCr)}>net {signedCr(x.netCr)}</small></li>)}</ol> : <p className="muted">No deals in this period.</p>}</div>
    <div className="card bbd-sb"><h4>Most active clients <small>by value traded</small></h4>
      {s?.activeClients.length ? <ol>{s.activeClients.slice(0, 5).map((x) => <li key={x.clientKey}><button type="button" className="bbd-cl" onClick={() => onClient(x.clientKey)}>{x.client}</button>
        <span>{crIn(x.grossCr)}</span><small>{nf(x.shares, 0)} {x.shares === 1 ? "share" : "shares"}</small></li>)}</ol> : <p className="muted">No deals in this period.</p>}</div>
  </section>;
}

function ClientPanel({ k, onClose }: { k: string; onClose: () => void }) {
  const c = useClientDeals(k);
  if (c.isLoading) return <div className="skeleton" style={{ height: 160 }} role="status" aria-label="Loading the client's deals" />;
  if (c.isError || !c.data) return <div className="card bbd-cp"><p>No deals are held for this client. <button type="button" className="ia-link" onClick={onClose}>Show every client</button></p></div>;
  const d = c.data, net = d.buyCr - d.sellCr;
  return <section className="card bbd-cp" aria-label={`Deals by ${d.client}`}>
    <div className="bbd-cph"><div><h3>{d.client}</h3><p className="muted">Every bulk and block deal held for this client{d.spellings.length > 1 ? `, under ${d.spellings.length} spellings of the name` : ""}. Bought {crIn(d.buyCr)}, sold {crIn(d.sellCr)}, net <span className={tone(net)}>{signedCr(net)}</span>.</p></div>
      <button type="button" className="dbx-ddb" onClick={onClose}>Every client {Ico.x}</button></div>
    <DealFollow what="client" value={d.clientKey} label={d.client ?? "this client"} />
    {d.bothSides.length > 0 && <p className="bbd-both"><b>Both bought and sold:</b> {d.bothSides.join(", ")}</p>}
    <div className="bbd-cpt"><table className="ia-t"><caption className="sr-only">Net value per share for this client</caption>
      <thead><tr><th scope="col">Share</th><th scope="col" className="r">Deals</th><th scope="col" className="r">Bought</th><th scope="col" className="r">Sold</th><th scope="col" className="r">Net</th><th scope="col">Dates</th></tr></thead>
      <tbody>{d.shares.map((s) => <tr key={s.symbol}><th scope="row"><Link to={`/stocks/${encodeURIComponent(s.symbol)}`}>{s.symbol}</Link><small>{s.name}{s.bothSides ? " · both sides" : ""}</small></th>
        <td className="r">{s.deals}</td><td className="r">{crIn(s.buyCr)}</td><td className="r">{crIn(s.sellCr)}</td><td className={"r " + tone(s.netCr)}>{signedCr(s.netCr)}</td>
        <td>{s.first === s.last ? dayIn(s.first) : `${dayIn(s.first)} – ${dayIn(s.last)}`}</td></tr>)}</tbody></table></div>
  </section>;
}

type Col = { k: SortKey | null; l: string; c?: string };
const COLS: Col[] = [{ k: "symbol", l: "Stock" }, { k: "day", l: "Date" }, { k: "client", l: "Client" }, { k: null, l: "Action" }, { k: "qty", l: "Qty", c: "r" },
  { k: "price", l: "Avg price", c: "r" }, { k: "value", l: "Value ₹ Cr", c: "r" }, { k: "pct", l: "% of equity", c: "r" }, { k: null, l: "Close now, since deal", c: "r" }];
const SHORT_COLS: Col[] = [{ k: "symbol", l: "Stock" }, { k: "day", l: "Date" }, { k: "qty", l: "Qty sold short", c: "r" }, { k: "pct", l: "% of equity", c: "r" }];

function CoverageNote({ cov, f, total }: { cov: Coverage; f: DealFilters; total: number }) {
  if (!cov.first_day) return <p className="bbd-note" role="status">No deals are held yet: the first run of the deals job reads NSE's files after today's close (from 16:00 IST on trading days).</p>;
  const bits: ReactNode[] = [];
  if (cov.shorterThanPeriod) bits.push(<span key="h">History from {dayIn(cov.first_day)}: this period starts before the first day held, so it covers only the days from then.{!cov.historyDone ? " Older days are being added a month at a time." : ""}</span>);
  if (f.period === "1d" && !total && cov.last_day) bits.push(<span key="t">NSE publishes the day's deals after the close; none are held for today yet. The latest day held is {dayIn(cov.last_day)}.</span>);
  if (!bits.length) return null;
  return <p className="bbd-note" role="status">{bits}</p>;
}

export function DealsView({ active = true }: { active?: boolean }) {
  const [params, setParams] = useSearchParams();
  const f = useMemo(() => filtersFromParams(params), [params]);
  const set = (n: Partial<DealFilters>) => setParams(paramsFromFilters({ ...f, page: 1, ...n }), { replace: true });
  const [q, setQ] = useState(f.q);
  useEffect(() => { setQ(f.q); }, [f.q]);
  useEffect(() => {
    if (q === f.q) return;
    const t = window.setTimeout(() => set({ q }), 300);
    return () => window.clearTimeout(t);
  }, [q]);  // eslint-disable-line react-hooks/exhaustive-deps
  const list = useDealList(f, active);
  const sum = useDealSummary(f, active && !f.client);
  const data = list.data, t = data?.totals, cov = data?.coverage;
  const short = f.kind === "short";
  const cols = short ? SHORT_COLS : COLS;
  const onClient = (k: string) => { set({ client: k, q: "" }); window.scrollTo({ top: 0 }); };
  const onShare = (sym: string) => set({ q: sym });
  const onSort = (k: SortKey) => set({ sort: k, dir: f.sort === k ? (f.dir === "asc" ? "desc" : "asc") : k === "symbol" || k === "client" ? "asc" : "desc" });
  const chips: [string, string][] = [];
  if (f.q.trim()) chips.push(["q", `“${f.q.trim()}”`]);
  if (f.min) chips.push(["min", MINS.find(([v]) => v === f.min)![1]]);
  if (f.client) chips.push(["client", "One client"]);
  const unset = (k: string) => set(k === "all" ? { q: "", min: "", client: "" } : { [k]: "" } as Partial<DealFilters>);
  const exchanges = cov?.exchanges?.length ? cov.exchanges.join(" · ") : "NSE";
  const sortName = cols.find((c) => c.k === f.sort)?.l ?? "Value ₹ Cr";
  const order = f.sort === "day" ? (f.dir === "desc" ? "newest first" : "oldest first") : f.sort === "symbol" || f.sort === "client" ? (f.dir === "asc" ? "A to Z" : "Z to A") : f.dir === "desc" ? "highest first" : "lowest first";

  return (
    <div className="ia p4 bbd">
      <header className="card bbd-head">
        <div className="bbd-meta"><span>Last updated <b>{stampIn(cov?.lastUpdated)}</b></span><span>Exchanges: <b>{exchanges}</b></span>
          {cov?.first_day && <span>History from <b>{dayIn(cov.first_day)}</b></span>}</div>
        <p className="bbd-line">{data ? <>{periodLabel(f, data.period)} · {exchanges} · {f.kind === "short" ? `${nf(t!.byKind.short.deals, 0)} short-selling reports` : countLine(t!)}</> : " "}</p>
        <details className="bbd-ex"><summary>What bulk and block deals are</summary>
          <dl>{EXPLAIN.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></details>
      </header>

      <div className="bbd-tools" role="search" aria-label="Filter the deals">
        <SegRow label="Side" value={f.side} opts={SIDES} onChange={(v) => set({ side: v as DealFilters["side"] })} />
        <SegRow label="Kind" value={f.kind} opts={KINDS} onChange={(v) => set({ kind: v as DealFilters["kind"], sort: v === "short" && (f.sort === "value" || f.sort === "client" || f.sort === "price") ? "qty" : f.sort })} />
        <SegRow label="Period" value={f.period} opts={PERIODS.map(([k, l]) => [k, l])} onChange={(v) => set(v === "custom" ? { period: "custom", from: f.from || data?.period.from || "", to: f.to || data?.period.to || "" } : { period: v as DealFilters["period"], from: "", to: "" })} />
        {f.period === "custom" && <div className="bbd-dates">
          <label>From <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label>
          <label>To <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label></div>}
      </div>
      <div className="p4-tools">
        <label className="dbx-q">{Ico.search}<input type="search" placeholder="Search a stock or a client" aria-label="Search a stock or a client" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} /></label>
        <div className="dbx-dds">
          <Dd label="Value" value={f.min ? MINS.find(([v]) => v === f.min)![1] : ""}>{(close) => <OptList title="Value of the trade" items={MINS.map(([v, t]) => ({ v, t, sel: f.min === v }))} onPick={(v) => { set({ min: v }); close(); }} />}</Dd>
        </div>
        <a className="dbx-ddb p4-csv" href={apiUrl(csvPath(f))} download aria-disabled={!data?.total || undefined} onClick={(e) => { if (!data?.total) e.preventDefault(); }}>Download CSV</a>
      </div>
      <Chips chips={chips} unset={unset} />

      {cov && <CoverageNote cov={cov} f={f} total={data!.total} />}
      {f.client && <ClientPanel k={f.client} onClose={() => set({ client: "" })} />}
      {!f.client && !short && sum.data && <Largest s={sum.data} label={periodLabel(f, sum.data.period)} onClient={onClient} />}
      {!f.client && t && <Strip t={t} s={sum.data} onClient={onClient} onShare={onShare} />}

      {list.isError && <p className="formerr">The deals could not be loaded. Please try again shortly.</p>}
      {list.isLoading && <div className="skeleton" style={{ height: 420 }} role="status" aria-label="Loading the deals" />}
      {data && <>
        <div className="dbx-rbar"><span className="dbx-cnt" aria-live="polite"><b>{nf(data.total, 0)}</b> {short ? (data.total === 1 ? "report" : "reports") : data.total === 1 ? "deal" : "deals"}{f.kind === "all" ? " (each trade once)" : ""} · sorted by {sortName}, {order}</span>
          <span className="p4-hint">Select a stock for its report, or a client for every deal by it</span></div>
        {!data.total ? <div className="card ia-none bbd-empty"><p>{f.period === "1d" && cov?.last_day ? "No deals are held for today yet." : "No deals match these filters."}</p>
          {f.period === "1d" && cov?.last_day ? <button type="button" className="ia-btn" onClick={() => set({ period: "custom", from: cov.last_day!, to: cov.last_day! })}>Show {dayIn(cov.last_day)}, the latest day held</button>
            : (chips.length > 0 || f.side !== "all" || f.kind !== "all") && <button type="button" className="ia-btn" onClick={() => set({ ...NO_FILTERS, period: f.period, from: f.from, to: f.to })}>Clear the filters</button>}</div> : <>
          <div className="card ia-tw p4-iatw bbd-tw">
            <table className="ia-t p4-iat bbd-t">
              <caption className="sr-only">{short ? "Short-selling reports" : "Deals"} matching the filters, sorted by {sortName}, {order}</caption>
              <thead><tr>{cols.map((c) => <th key={c.l} scope="col" className={c.c} aria-sort={c.k && f.sort === c.k ? (f.dir === "asc" ? "ascending" : "descending") : c.k ? "none" : undefined}>
                {c.k ? <button type="button" onClick={() => onSort(c.k!)}>{c.l}{f.sort === c.k ? (f.dir === "asc" ? " ▲" : " ▼") : ""}</button> : c.l}</th>)}</tr></thead>
              <tbody>{data.rows.map((d) => short ? (
                <tr key={d.id}><th scope="row"><StockCell d={d} /></th><td>{dayIn(d.day)}</td><td className="r">{qtyIn(d.qty)}</td><td className="r">{d.pctEquity != null ? nf(d.pctEquity, 3) + "%" : MINUS}</td></tr>
              ) : (
                <tr key={d.id}>
                  <th scope="row"><StockCell d={d} /></th>
                  <td>{dayIn(d.day)}<small>{KIND_LABEL[d.kind]} · {d.exchange}</small></td>
                  <td className="bbd-ct"><ClientLink d={d} onClient={onClient} /><Tags d={d} /></td>
                  <td><SideBadge d={d} /></td>
                  <td className="r">{qtyIn(d.qty)}</td>
                  <td className="r">{rupee(d.price)}</td>
                  <td className="r"><b>{d.valueCr != null ? nf(d.valueCr, 2) : MINUS}</b></td>
                  <td className="r">{d.pctEquity != null ? nf(d.pctEquity, 2) + "%" : MINUS}</td>
                  <td className="r"><Since d={d} /></td>
                </tr>))}</tbody>
            </table>
          </div>
          <ul className="ia-cards bbd-cards" aria-label="Deals matching the filters">{data.rows.map((d) => (
            <li key={d.id}><div className="card ia-c bbd-c">
              <div className="ia-ch"><b><Link to={`/stocks/${encodeURIComponent(d.symbol)}`}>{d.symbol}</Link> <SideBadge d={d} /></b><span>{d.name}</span></div>
              {!short && <p className="bbd-cc"><ClientLink d={d} onClient={onClient} /> <Tags d={d} /></p>}
              <dl>
                <div><dt>Date</dt><dd>{dayIn(d.day)}</dd></div>
                <div><dt>{short ? "Qty sold short" : "Qty"}</dt><dd>{qtyIn(d.qty)}</dd></div>
                {!short && <div><dt>Value</dt><dd>{crIn(d.valueCr)}</dd></div>}
                {!short && <div><dt>Avg price</dt><dd>{rupee(d.price)}</dd></div>}
                <div><dt>% of equity</dt><dd>{d.pctEquity != null ? nf(d.pctEquity, 2) + "%" : MINUS}</dd></div>
                {!short && <div><dt>Since deal</dt><dd className={tone(d.sinceDealPct)}>{pctIn(d.sinceDealPct)}</dd></div>}
              </dl>
              <small className="muted">{KIND_LABEL[d.kind]} · {d.exchange}</small>
            </div></li>))}</ul>
          {data.pages > 1 && <nav className="ia-more" aria-label="Pages">
            <button type="button" className="ia-btn" disabled={f.page <= 1} onClick={() => setParams(paramsFromFilters({ ...f, page: f.page - 1 }), { replace: true })}>← Previous</button>
            <span className="muted">Page {nf(f.page, 0)} of {nf(data.pages, 0)} · {nf(data.total, 0)} rows</span>
            <button type="button" className="ia-btn" disabled={f.page >= data.pages} onClick={() => setParams(paramsFromFilters({ ...f, page: f.page + 1 }), { replace: true })}>Next →</button></nav>}
        </>}
        <p className="muted ia-foot">
          Source: <a href={data.sources.deals.url ?? undefined} target="_blank" rel="noopener noreferrer">{data.sources.deals.name}</a>, bulk and block deal files and the short-selling report, for {dayIn(data.period.from)} to {dayIn(data.period.to)}{cov?.first_day ? ` (history held from ${dayIn(cov.first_day)} to ${dayIn(cov.last_day)})` : ""}.
          {" "}Value = quantity × price ÷ 1 crore. % of equity = quantity ÷ the company's shares (its market cap ÷ its price in FinEdge's market list); a dash means the share count is not held.
          {" "}Close now = the latest close we hold; the change since the deal is worked out only when our close on the deal day is in the same terms as the deal price (no split or bonus since).
          {" "}A block deal that NSE also lists as a bulk deal is counted once. {data.note}
        </p>
      </>}
    </div>
  );
}
