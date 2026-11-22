// Optional blocks of the earlier dashboard, kept for Customise (off in the default layout): quarter results, watchlist movers, second look, bands, DCF scenarios and Gold & silver.
// "Gold & silver today" shows MCX futures prices that come through Dhan, whose terms do not allow showing them on the site: it stays off until a licensed source is connected.
import { PRISM_BANDS, PRISM_BAND_WORD, prismBandOf, rowScore, rowView, usePlanModel, type PrismBand } from "../../lib/planScore";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { titleOf, subOf, codeNote } from "../../lib/companyLabel";
import { apiGet, type ApiError, type Financials } from "../../lib/api";
import type { DcfInputs } from "../../lib/dcf";
import { direction, inr, istTime, signedPct, useCommodities } from "../../lib/commodities";
import { TIER, useUI, type Plan } from "../../lib/ui";
import { type Row } from "../../lib/screener";
import { DEMO } from "../../lib/demo";
import { Icon } from "../../lib/icons";
import { MINUS, cr, nf } from "../../lib/format";
import { CoLogo } from "../CoLogo";

const sgn = (v: number | null | undefined, d = 1) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(v, d) + "%");
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");
function Empty({ icon, title, text, to, cta }: { icon: string; title: string; text: string; to: string; cta: string }) {
  return <div className="dw-empty"><span className="dw-ei"><Icon name={icon} /></span><b>{title}</b><p>{text}</p><Link className="btn" to={to}>{cta}</Link></div>;
}

export function Movers({ items }: { items: Row[] }) {
  const top = [...items].filter((r) => r.change_pct != null).sort((a, b) => Math.abs(b.change_pct as number) - Math.abs(a.change_pct as number)).slice(0, 7);
  if (!items.length) return <Empty icon="wallet" title="No stocks yet" text="Add stocks to a watchlist to see how they moved today." to="/watchlist" cta="Open watchlist" />;
  const max = Math.max(...top.map((r) => Math.abs(r.change_pct as number)), 1);
  return (
    <ul className="dv">{top.map((r) => (
      <li key={r.symbol}><Link to={`/stocks/${r.symbol}`}><b title={codeNote(r)}><CoLogo symbol={r.symbol} name={r.name} size={20} inline />{titleOf(r)}</b>{subOf(r) && <small>{subOf(r)}</small>}</Link>
        <span className="dvbar" aria-hidden="true"><i className={tone(r.change_pct)} style={{ width: `${(Math.abs(r.change_pct as number) / max) * 50}%`, [(r.change_pct as number) >= 0 ? "left" : "right"]: "50%" }} /></span>
        <span className={"dvv " + tone(r.change_pct)}>{sgn(r.change_pct)}</span></li>))}</ul>
  );
}

/** Task #316: the newest quarter of each company as one table row: revenue and net profit, each against the same quarter a year earlier (YoY) and the quarter before (QoQ).
 *  A company held under its numeric BSE code shows its name. A company with fewer than two quarters is left out, as the chart cards did. */
const chg = (a?: number | null, b?: number | null) => (a == null || b == null || !b ? null : ((a - b) / Math.abs(b)) * 100);
const crore = (v: number | null | undefined) => (v == null ? "—" : (v < 0 ? MINUS : "") + "₹" + cr(Math.abs(v)) + " Cr");
function ResultRow({ symbol, name }: { symbol: string; name: string | null }) {
  const { data, isError } = useQuery({ queryKey: ["stock", symbol, "/financials"], queryFn: () => apiGet<Financials>(`/api/stocks/${symbol}/financials`), staleTime: 60_000, retry: false });
  const q = data?.quarterly.pl;
  if (isError || (data && (!q || q.periods.length < 2))) return null;
  if (!q) return <tr><th scope="row"><i className="skeleton sk-n" /></th><td colSpan={6}><i className="skeleton sk-n" /></td></tr>;
  const n = q.periods.length, last = n - 1, yoy = n >= 5 ? n - 5 : -1;
  const cells = (v: (number | null)[]) => {
    const y = chg(v[last], yoy >= 0 ? v[yoy] : null), m = chg(v[last], v[last - 1]);
    return <>
      <td className="n">{crore(v[last])}<span className={"dx-under " + tone(y)}>{sgn(y)} YoY</span></td>
      <td className={"n dx-hide-s " + tone(y)} title={yoy < 0 ? "Needs five quarters of results" : undefined}>{sgn(y)}</td>
      <td className={"n dx-hide-s " + tone(m)}>{sgn(m)}</td>
    </>;
  };
  const code = /^\d+$/.test(symbol);
  return (
    <tr>
      <th scope="row"><Link to={`/stocks/${symbol}#quarter`}>{code && name ? name : symbol}</Link><small>{code ? `BSE ${symbol}` : name ?? ""} · {q.periods[last]}</small></th>
      {cells(q.rows.revenue as (number | null)[])}{cells(q.rows.net_profit as (number | null)[])}
    </tr>
  );
}
export function Results({ symbols, names }: { symbols: string[]; names: Map<string, string | null> }) {
  if (!symbols.length) return <><Empty icon="notes" title="Pick stocks to follow" text="Your watchlist's newest quarterly results appear here, compared with last quarter and last year." to="/watchlist" cta="Build a watchlist" /><p className="rcs-all"><Link to="/results/quarter">See all quarter results <Icon name="arrow" /></Link></p></>;
  return <>
    <div className="dx-tw"><table className="dx-t dx-rt">
      <caption className="dx-sr">The newest quarter of the companies you follow</caption>
      <thead><tr><th scope="col">Company</th><th scope="col" className="n">Revenue<span className="dx-under">YoY</span></th><th scope="col" className="n dx-hide-s">YoY</th><th scope="col" className="n dx-hide-s">QoQ</th>
        <th scope="col" className="n">Net profit<span className="dx-under">YoY</span></th><th scope="col" className="n dx-hide-s">YoY</th><th scope="col" className="n dx-hide-s">QoQ</th></tr></thead>
      <tbody>{symbols.slice(0, 4).map((s) => <ResultRow key={s} symbol={s} name={names.get(s) ?? null} />)}</tbody>
    </table></div>
    <p className="rcs-all"><Link to="/results/quarter">See all quarter results <Icon name="arrow" /></Link></p>
  </>;
}

/** Task #283: the companies on your watchlist with a Strong or Healthy FinLit Prism score (65 or more) whose Prism Valuation part is 65 or more (the share
 *  price against earnings, book value and the company's own history), highest Valuation first. Plans with Prism only (the tile is gated on PLAN_FOR_PRISM). */
export function secondLook(r: Row): string | null {
  const v = rowView(r), val = r.prism_valuation ?? null, b = prismBandOf(r.prism_final);
  if (v.score == null || val == null || !Number.isFinite(val) || (b !== "strong" && b !== "healthy") || val < 65) return null;
  return `FinLit Prism ${v.score}, ${PRISM_BAND_WORD[b]} · Valuation part ${Math.round(val)}`;
}
export function SecondLook({ items }: { items: Row[]; meta?: Record<string, { target?: number }> }) {
  const model = usePlanModel();
  const flagged = model ? items.map((r) => ({ r, s: secondLook(r) })).filter((x): x is { r: Row; s: string } => !!x.s)
    .sort((x, y) => (y.r.prism_valuation ?? 0) - (x.r.prism_valuation ?? 0)).slice(0, 5) : [];
  if (!items.length) return <Empty icon="quality" title="Nothing to review yet" text="Add stocks to your watchlist and FinLit lists the ones with a Strong or Healthy FinLit Prism score and a high Valuation part." to="/watchlist" cta="Open watchlist" />;
  if (!flagged.length) return <p className="muted dw-ok"><Icon name="check" /> No company on your watchlist has a Strong or Healthy FinLit Prism score with a Valuation part of 65 or more right now.</p>;
  return <ul className="sl">{flagged.map(({ r, s }) => { const b = prismBandOf(r.prism_final)!; return <li key={r.symbol}><Link to={`/stocks/${r.symbol}`}><b title={codeNote(r)}><CoLogo symbol={r.symbol} name={r.name} size={20} inline />{titleOf(r)}</b><span className={"band-dot " + b}>Prism {PRISM_BAND_WORD[b]}</span></Link><span>{s}</span></li>; })}</ul>;
}
/** Task #283: the watchlist split across FinLit Prism's four bands (Strong 80+, Healthy 65 to 79, Average 50 to 64, Weak below 50). */
export function Buckets({ items }: { items: Row[] }) {
  const colour: Record<PrismBand, string> = { strong: "var(--v-strong)", healthy: "var(--v-healthy)", average: "var(--v-mixed)", weak: "var(--v-weak)" };
  const counts = PRISM_BANDS.map((b) => ({ ...b, n: items.filter((r) => prismBandOf(rowScore(r)) === b.key).length }));
  const total = counts.reduce((a, c) => a + c.n, 0);
  if (!total) return <Empty icon="layers" title="No scored stocks" text="Add stocks to a watchlist to see them grouped by FinLit Prism band." to="/watchlist" cta="Open watchlist" />;
  return (
    <div><div className="breadth big" role="img" aria-label="Watchlist by band">{counts.filter((c) => c.n).map((c) => <i key={c.key} style={{ flex: c.n, background: colour[c.key] }} />)}</div>
      <ul className="bandk">{counts.map((c) => <li key={c.key}><i style={{ background: colour[c.key] }} /><span>{c.word} · Prism {c.rule}</span><b>{c.n}</b></li>)}</ul></div>
  );
}
export function Locked({ tier, label }: { tier: Plan; label: string }) {
  const { upgrade } = useUI();
  return <div className="dw-lock"><span className="dw-ei"><Icon name="lock" /></span><b>{label}</b><p>Part of the {TIER[tier].n} plan.</p><button className="btn" onClick={() => upgrade(tier, `${label} is part of ${TIER[tier].n}.`)}>Unlock with {TIER[tier].n}</button></div>;
}
export function CommoditiesW() {
  const q = useCommodities();
  const rows = (q.data?.items ?? []).filter((i) => ["gold", "silver", "crude"].includes(i.code) && i.mcx?.price);
  if (q.isError || (q.data && !rows.length)) return <Empty icon="activity" title="Gold and silver today" text="MCX gold, silver and crude oil with the day change, and the international price beside them." to="/macro" cta="Open India economy" />;
  if (!q.data) return <div className="skeleton" style={{ height: 120 }} />;
  return <><ul className="sl">{rows.map((i) => { const m = i.mcx!; const d = direction(m.change?.pct);
    return <li key={i.code}><span className="sl-n"><b>{i.name}</b>{m.change ? <span className={"chip " + (d === "up" ? "up" : d === "down" ? "down" : "gold")}>{signedPct(m.change.pct)}</span> : null}</span>
      <span>{inr(m.price!.value)} {m.price!.unit.replace(/^₹\s*/, "")} · {m.contract}{m.asOf ? ` · ${m.state === "closed" ? "last trade" : "trade at"} ${istTime(m.asOf)} IST` : ""}</span></li>; })}</ul></>;
}

type SavedDcf = { name: string; symbol: string | null; updatedAt: string; inputs: DcfInputs };
/** Tools row (task #195): the DCF calculator as a tool card: what it does, and the member's saved scenarios by name (each reopens with its inputs). No verdict words. */
export function DcfW() {
  const q = useQuery<{ scenarios: SavedDcf[] }, ApiError>({ queryKey: ["dcf-scenarios"], queryFn: () => apiGet("/api/dcf/scenarios"), retry: false, enabled: !DEMO });
  const list = (q.data?.scenarios ?? []).slice(0, 3), n = q.data?.scenarios.length ?? 0;
  return (
    <section className="dsh-card dsh-tool" aria-labelledby="dsh-dcf">
      <h2 id="dsh-dcf">DCF calculator</h2>
      <p className="dsh-p">Work out the value per share, the margin-of-safety price, and what today's price implies.</p>
      {n > 0 && <><div className="dsh-lh">Your saved scenarios · {n}</div><div className="dsh-lines">{list.map((s) => <Link key={s.name} to={dcfLink(s)} className="dsh-ipo"><b>{s.name}</b><span>{s.symbol ?? "Your own inputs"}</span></Link>)}</div></>}
      <Link className="dsh-link foot" to="/dcf">Open the DCF calculator →</Link>
    </section>
  );
}
const dcfLink = (s: SavedDcf) => {
  const i = s.inputs, sp = new URLSearchParams({ fcf: String(i.fcf0), r: String(i.r), g1: String(i.g1), g2: String(i.g2), gt: String(i.gT), mc: String(i.marketCap), p: String(i.price), nd: String(i.netDebt), mos: String(i.mos) });
  if (i.shares != null) sp.set("sh", String(i.shares));
  if (i.midYear) sp.set("mid", "1");
  if (i.tvMethod === "exit") { sp.set("tv", "exit"); if (i.exitMultiple != null) sp.set("xm", String(i.exitMultiple)); }
  if (s.symbol) sp.set("sym", s.symbol);
  return "/dcf?" + sp.toString();
};
