// Markets today (docs/MOBILE-APP.md): the Markets tab's first page on a phone, and the phone home for a visitor. Charts first (the team's note on
// the sample: "charts vagerah first"): the Nifty 50 line with its return over 1M, 3M, 6M and 1Y, then the other indices with their day range, the
// market mood from Sector Pulse, FII and DII money, IPOs and results this week and the world's markets. Every figure is FinLit's live data with
// its date; a block whose data is not there says why instead of showing a number. Class prefix mt- is taken (old tab bar), so this page uses mkt-.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { useIndices } from "../lib/indices";
import { useLevels } from "../lib/markets";
import { useFlows } from "../lib/flows";
import { useIpos, type Ipo } from "../lib/ipo";
import { useSectorBoard } from "../lib/sectors";
import { useResultsCalendar } from "../lib/resultsCalendar";
import { useFeed } from "../lib/feed";
import { MINUS, nf } from "../lib/format";
import { Icon } from "../lib/icons";
import { ChartZoom } from "../components/ChartZoom";
import { MOST_USED, freeAccountLine, planAddsLine } from "../lib/mobileNav";
import { COMPANY } from "../content/site";
import { useDocTitle } from "../lib/title";
import "../styles/sectors.css";
import "../styles/markets-today.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dm = (iso: string | null | undefined) => (iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}` : "");
export const sgn = (v: number | null | undefined, d = 2, unit = "%") => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(v, d) + unit);
export const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? " up" : " dn");
const crore = (v: number | null | undefined) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? MINUS : "") + "₹" + nf(v, 0) + " Cr");
const ixName = (n: string) => n.replace(/^NIFTY /, "Nifty ").replace("BSE SENSEX", "Sensex").replace("INDIA VIX", "India VIX");

/** A line chart drawn in the page's own colours: green when the period ended higher, red when lower. */
export function Line({ c, h = 96, id }: { c: number[]; h?: number; id: string }) {
  if (c.length < 2) return null;
  const W = 340, lo = Math.min(...c), hi = Math.max(...c), x = (i: number) => (i / (c.length - 1)) * W, y = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (h - 12);
  const col = c[c.length - 1] >= c[0] ? "var(--gain)" : "var(--loss)", d = c.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg className="mkt-line" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ height: h }} role="img" aria-label={`Line chart, ${c.length} closes`}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".18" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d}L${W},${h}L0,${h}Z`} fill={`url(#${id})`} /><path d={d} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const RANGES = [["1M", 21], ["3M", 63], ["6M", 126], ["1Y", 0]] as const;

function NiftyCard() {
  const ix = useIndices(), lv = useLevels("NIF50", 1);
  const [r, setR] = useState<(typeof RANGES)[number][0]>("6M");
  const row = ix.data?.items.find((x) => x.code === "NIF50");
  const all = lv.data?.rows.map((x) => x.c) ?? [];
  const cut = (n: number) => (n ? all.slice(-n) : all);
  const ret = (n: number) => { const a = cut(n); return a.length > 1 ? (a[a.length - 1] / a[0] - 1) * 100 : null; };
  const n = RANGES.find((x) => x[0] === r)![1];
  return (
    <section className="mkt-card mkt-nifty" aria-label="Nifty 50">
      <div className="mkt-nh">
        <div><small>Nifty 50</small>
          <div className="mkt-px"><b className="num">{row?.close != null ? nf(row.close, 2) : "—"}</b>{row && <span className={"mkt-pill" + tone(row.changePct)}>{sgn(row.changePct)}</span>}</div></div>
        <span className="mkt-asof">{row?.date ? `${ix.data?.marketOpen ? "Live" : "Close"} ${dm(row.date)}` : ix.isLoading ? "Loading" : ix.isError ? "Prices not available now" : ""}</span>
      </div>
      <div className="mkt-chart">{all.length > 1 ? <ChartZoom label={`Nifty 50, last ${r === "1Y" ? "year" : r}`}><Line c={cut(n)} id="mkt-nf" /></ChartZoom> : <p className="mkt-why">{lv.isLoading ? "Loading the chart" : "The Nifty 50 history is not available right now."}</p>}</div>
      <div className="mkt-ranges" role="group" aria-label="Period">
        {RANGES.map(([k, m]) => { const v = ret(m); return <button key={k} type="button" aria-pressed={r === k} className={r === k ? "on" : ""} onClick={() => setR(k)}>{k}<span className={tone(v)}>{v == null ? "—" : sgn(v, 1)}</span></button>; })}
      </div>
    </section>
  );
}

function IndexChips() {
  const ix = useIndices();
  const rows = (ix.data?.key ?? []).filter((c) => c !== "NIF50").map((c) => ix.data!.items.find((x) => x.code === c)).filter(Boolean) as NonNullable<ReturnType<typeof useIndices>["data"]>["items"];
  if (!rows.length) return null;
  return (
    <div className="mkt-hs" role="list" aria-label="Indices">
      {rows.map((x) => { const p = x.high != null && x.low != null && x.close != null && x.high > x.low ? ((x.close - x.low) / (x.high - x.low)) * 100 : 50;
        return <div role="listitem" key={x.code} className="mkt-ix"><small>{ixName(x.name)}</small><b className="num">{x.close != null ? nf(x.close, 2) : "—"}</b>
          <span className={"mkt-pill sm" + tone(x.changePct)}>{sgn(x.changePct)}</span>
          {x.high != null && x.low != null && <><span className="mkt-rng" aria-hidden="true"><i style={{ left: `${Math.max(0, Math.min(100, p)).toFixed(0)}%` }} /></span>
            <span className="mkt-rngl num" aria-label={`Day range ${nf(x.low, 0)} to ${nf(x.high, 0)}`}><span>{nf(x.low, 0)}</span><span>{nf(x.high, 0)}</span></span></>}</div>; })}
    </div>
  );
}

/** The four states that move, in Sector Pulse's own colours (sectors.css; the card wears .sx so they apply in both themes). */
const MOOD: [string, string[], string][] = [["Bouncing back", ["Thrust C", "Thrust CAP"], "var(--sx-c-bd)"], ["Rising together", ["Confirmed"], "var(--sx-confirmed-bd)"], ["Sold off", ["Washout"], "var(--sx-washout-bd)"], ["Losing steam", ["Fading"], "var(--sx-fading-bd)"]];
function MoodCard() {
  const b = useSectorBoard("sectors");
  if (b.isLoading) return <div className="mkt-card mkt-skel" aria-busy="true" />;
  if (!b.data) return <div className="mkt-card"><p className="mkt-why">Sector Pulse is not available right now.</p></div>;
  const d = b.data, total = d.rows.length, seg = MOOD.map(([l, keys, c]) => [l, keys.reduce((n, k) => n + ((d.counts as Record<string, number>)[k] ?? 0), 0), c] as const);
  const sold = (d.counts as Record<string, number>).Washout ?? 0;
  const bouncing = d.rows.filter((r) => r.state === "Thrust C" || r.state === "Thrust CAP").map((r) => r.name);
  return (
    <Link to="/sectors" className="mkt-card mkt-mood sx">
      <div className="mkt-mh"><b>{sold} of {total} sectors sold off</b><span className="mkt-badge">Sector Pulse</span></div>
      <div className="mkt-bar" aria-hidden="true">{seg.map(([l, n, c]) => n ? <i key={l} style={{ width: `${(n / total) * 100}%`, background: c }} /> : null)}</div>
      <div className="mkt-lg">{seg.map(([l, n, c]) => <span key={l}><i style={{ background: c }} />{l} {n}</span>)}</div>
      <p className="mkt-note">Bouncing now: {bouncing.length ? bouncing.join(", ") : "none"} · NSE, {d.date_label ?? dm(d.date)} close</p>
    </Link>
  );
}

function FlowsCard() {
  const f = useFlows();
  const l = f.data?.latest;
  if (f.isLoading) return <div className="mkt-card mkt-skel" aria-busy="true" />;
  if (!l) return <div className="mkt-card"><p className="mkt-why">FII and DII figures are not available right now.</p></div>;
  const s = f.data!.streaks;
  return (
    <Link to="/fii-dii" className="mkt-card mkt-flows">
      <div className="mkt-mh"><b>FII & DII, {dm(l.d)}</b><span className="mkt-badge">Flows</span></div>
      <div className="mkt-k2">
        <div><small>Foreign (FII) net</small><b className={"num" + tone(l.fii.net)}>{crore(l.fii.net)}</b></div>
        <div><small>Domestic (DII) net</small><b className={"num" + tone(l.dii?.net)}>{l.dii ? crore(l.dii.net) : "Not published yet"}</b></div>
      </div>
      {(s.fii || s.dii) && <p className="mkt-note">{s.fii && `FII ${s.fii.side} ${s.fii.days} session${s.fii.days === 1 ? "" : "s"} in a row`}{s.fii && s.dii && " · "}{s.dii && `DII ${s.dii.side} ${s.dii.days}`}</p>}
    </Link>
  );
}

const ST: Record<string, [string, string]> = { open: ["Open now", "var(--gain)"], upcoming: ["Upcoming", "var(--gold)"], closed: ["Closed, listing soon", "var(--faint)"] };
function IpoCards() {
  const q = useIpos();
  const list = (q.data ?? []).filter((i: Ipo) => i.status === "open" || i.status === "upcoming").sort((a, b) => a.openDate.localeCompare(b.openDate)).slice(0, 8);
  if (q.isLoading) return <div className="mkt-card mkt-skel" aria-busy="true" />;
  if (!list.length) return <p className="mkt-why">No IPO is open or about to open right now. <Link to="/ipo">Every IPO since 2020</Link></p>;
  return (
    <div className="mkt-hs" role="list" aria-label="IPOs">
      {list.map((i) => <Link role="listitem" key={i.id} to={`/ipo/${i.id}`} className="mkt-card mkt-ipo">
        <span className="mkt-st"><i style={{ background: ST[i.status]?.[1] }} />{ST[i.status]?.[0]}</span>
        <b>{i.name.replace(/\s+(Limited|Ltd\.?)$/i, "")}</b>
        <small>{i.kind === "sme" ? "SME" : "Mainboard"} · {dm(i.openDate)} – {dm(i.closeDate)}</small>
        <span className="mkt-kv"><span><small>Price band</small><b className="num">{i.priceLow != null && i.priceHigh != null ? `₹${nf(i.priceLow, 0)}–${nf(i.priceHigh, 0)}` : "Not announced"}</b></span>
          <span><small>Issue size</small><b className="num">{i.issueSizeCr != null ? `₹${nf(i.issueSizeCr, 0)} Cr` : "Not announced"}</b></span></span>
      </Link>)}
    </div>
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function ResultsWeek() {
  const from = iso(new Date()), to = iso(new Date(Date.now() + 6 * 86_400_000));
  const q = useResultsCalendar(from, to);
  const days = (q.data?.days ?? []).filter((d) => d.n > 0).slice(0, 4);
  if (q.isLoading) return <div className="mkt-card mkt-skel" aria-busy="true" />;
  if (!days.length) return <p className="mkt-why">No results are due in the next seven days. <Link to="/results">The results calendar</Link></p>;
  return (
    <div className="mkt-list">
      {days.map((d) => <Link key={d.date} to={`/results?day=${d.date}`} className="mkt-row">
        <span className="mkt-rm"><b>{new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</b>
          <small>{d.names.slice(0, 3).map((n) => n.replace(/\s+(Limited|Ltd\.?)$/i, "")).join(", ")}{d.n > 3 ? ` and ${d.n - 3} more` : ""}</small></span>
        <span className="mkt-rv"><b className="num">{d.n}</b><small>{d.n === 1 ? "company" : "companies"}</small></span></Link>)}
    </div>
  );
}

/** The newest exchange filings, one line each (round 4): what companies told the exchange today, with the time it was filed. */
function LatestFilings() {
  const q = useFeed("news", { limit: 5 });
  const rows = (q.data ?? []).slice(0, 5);
  if (q.isLoading) return <div className="mkt-card mkt-skel" aria-busy="true" />;
  if (!rows.length) return <p className="mkt-why">No filings have come in yet today. <Link to="/news">News & filings</Link></p>;
  return (
    <div className="mkt-list">
      {rows.map((n) => <Link key={n.id} to={n.symbol ? `/stocks/${encodeURIComponent(n.symbol)}` : "/news"} className="mkt-row">
        <span className="mkt-rm"><b>{(n.company || n.symbol || "A listed company").replace(/\s+(Limited|Ltd\.?)$/i, "")}</b><small>{n.category || n.title}</small></span>
        <span className="mkt-rv"><small>{dm(n.date.slice(0, 10))}</small></span></Link>)}
    </div>
  );
}

type Gm = { rows: { key: string; label: string; group: string; last: number | null; asOf: string | null; d1: number | null; unit: string }[] };
function World() {
  const q = useQuery<Gm>({ queryKey: ["global-markets"], queryFn: () => apiGet("/api/global-markets"), staleTime: 300_000, retry: 1 });
  const [all, setAll] = useState(false);
  const rows = q.data?.rows ?? [];
  if (q.isLoading) return <div className="mkt-card mkt-skel" aria-busy="true" />;
  if (!rows.length) return <p className="mkt-why">World market prices are not available right now.</p>;
  return (
    <div className="mkt-list">
      {(all ? rows : rows.slice(0, 6)).map((r) => <div key={r.key} className="mkt-row">
        <span className="mkt-rm"><b>{r.label}</b><small>{r.group}{r.asOf ? ` · ${dm(r.asOf)}` : ""}</small></span>
        <span className="mkt-rv"><b className="num">{r.last != null ? nf(r.last, 2) : "—"}</b><small className={"num" + tone(r.d1)}>{r.d1 == null ? "—" : r.unit === "%" ? sgn(r.d1, 2, " pts") : sgn(r.d1)}</small></span></div>)}
      {rows.length > 6 && <button type="button" className="mkt-more" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${rows.length}`}</button>}
    </div>
  );
}

const Sec = ({ title, to, link, children }: { title: string; to?: string; link?: string; children: React.ReactNode }) => (
  <section className="mkt-sec" aria-label={title}>
    <div className="mkt-sh"><h2>{title}</h2>{to && <Link to={to}>{link}</Link>}</div>
    {children}
  </section>
);

/** The page. `home` draws it as the phone home for a visitor (a greeting line and the sign-up strip). */
export function MarketsToday({ home = false }: { home?: boolean }) {
  useDocTitle(home ? "FinLit: markets today" : "Markets today", "The Nifty 50, India's indices, sector mood, FII and DII money, IPOs and results this week, and world markets, from FinLit's live data. Information only, not investment advice.");
  const ix = useIndices();
  const when = useMemo(() => ix.data?.asOf ? `${ix.data.marketOpen ? "Market open" : "Close"}, ${dm(ix.data.asOf)}` : "", [ix.data]);
  return (
    <div className="mkt wrap">
      <div className="mkt-hello"><h1 className="ui-title">Markets today</h1>{when && <p>{when}</p>}</div>
      <NiftyCard />
      <IndexChips />
      <Sec title="Market mood" to="/sectors" link="Sectors"><MoodCard /></Sec>
      <Sec title="Money in and out" to="/fii-dii" link="FII & DII"><FlowsCard /></Sec>
      <Sec title="IPOs this week" to="/ipo" link="All IPOs"><IpoCards /></Sec>
      <Sec title="Results this week" to="/results" link="Calendar"><ResultsWeek /></Sec>
      <Sec title="Latest filings" to="/news" link="All news"><LatestFilings /></Sec>
      <Sec title="World markets"><World /></Sec>
      {home && <Sec title="Explore">
        <div className="mkt-grid">{MOST_USED.map((m) => <Link key={m.to} to={m.to} className="mkt-tool"><span><Icon name={m.icon} /></span>{m.label}</Link>)}</div>
      </Sec>}
      {home && <div className="mkt-card mkt-join"><span className="mkt-ji"><Icon name="star" /></span><span><b>A free account, no card</b><small>{`It keeps ${freeAccountLine()}. ${planAddsLine()}`.trim()}</small></span><Link to="/login?mode=signup">Sign up</Link></div>}
      <p className="mkt-disc">{COMPANY.disclaimer} Prices and figures as published by the exchanges and the named sources; market data may be delayed.</p>
    </div>
  );
}

export default MarketsToday;
