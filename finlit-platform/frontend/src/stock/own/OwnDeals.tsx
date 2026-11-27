// Company report, section 12 Ownership, tab "Bulk & block deals": the year's closing prices with a dot per bulk or block deal at its deal price (green
// bought, red sold; a card on hover or focus, as the GMP chart's dots), the totals, the latest deals and the short-selling reports. Each trade once.
// A deal is drawn only when our close on the deal day shows the deal price is in the same terms as the chart (no split or bonus since); the others are
// listed and counted below the chart. Describes what was traded; never advises.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { usePrice } from "../../lib/api";
import { MINUS, nf } from "../../lib/format";
import { crIn, dayIn, useStockDeals, type Deal } from "../../lib/deals";
import { DealFollow } from "../../components/DealFollow";
import { ChartZoom } from "../../components/ChartZoom";
import "../../styles/deals.css";

const W = 720, H = 220, PAD = { l: 48, r: 12, t: 12, b: 26 };

/** The deals that can sit on the chart: bulk and block, each trade once, inside the chart's dates, in the same terms as its prices. */
export function drawable(rows: Deal[], first: string, last: string): { on: Deal[]; off: Deal[] } {
  const once = rows.filter((r) => (r.kind === "bulk" || r.kind === "block") && !r.alsoBlock && r.day >= first && r.day <= last && r.price != null);
  const ok = (r: Deal) => r.dayClose != null && r.dayClose / (r.price as number) >= 0.75 && r.dayClose / (r.price as number) <= 1.33;
  return { on: once.filter(ok), off: once.filter((r) => !ok(r)) };
}

export function OwnDeals({ symbol }: { symbol: string }) {
  const q = useStockDeals(symbol);
  const px = usePrice(symbol, "1Y");
  const [hi, setHi] = useState<number | null>(null);
  const series = px.data?.series;
  const chart = useMemo(() => {
    if (!series?.t.length || !q.data) return null;
    const t = series.t.map((d) => d.slice(0, 10)), c = series.c;
    const { on, off } = drawable(q.data.rows, t[0], t[t.length - 1]);
    const ys = [...c, ...on.map((r) => r.price as number)];
    const lo = Math.min(...ys) * 0.97, top = Math.max(...ys) * 1.03;
    const t0 = new Date(t[0]).getTime(), t1 = new Date(t[t.length - 1]).getTime() || t0 + 1;
    const x = (d: string) => PAD.l + ((new Date(d.slice(0, 10)).getTime() - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(1e-9, top - lo)) * (H - PAD.t - PAD.b);
    const path = t.map((d, i) => `${i ? "L" : "M"}${x(d).toFixed(1)},${y(c[i]).toFixed(1)}`).join("");
    const ticks = [lo + (top - lo) * 0.1, (lo + top) / 2, top - (top - lo) * 0.1];
    return { on, off, x, y, path, ticks, first: t[0], last: t[t.length - 1] };
  }, [series, q.data]);

  if (q.isLoading) return <div className="skeleton" style={{ height: 240 }} role="status" aria-label="Loading the deals" />;
  if (q.isError || !q.data) return <p className="faint">The bulk and block deals could not be loaded. Please try again shortly.</p>;
  const d = q.data, once = d.rows.filter((r) => r.kind !== "short" && !r.alsoBlock), shorts = d.rows.filter((r) => r.kind === "short");
  const held = d.coverage.first_day ? `Deals held from ${dayIn(d.coverage.first_day)} to ${dayIn(d.coverage.last_day)}.` : "No deals are held yet.";
  const h = chart && hi != null ? chart.on[hi] : null;
  return (
    <div className="bbd bbd-own">
      <p className="bbd-ol">{once.length
        ? <><b>{nf(once.length, 0)}</b> bulk and block {once.length === 1 ? "trade" : "trades"} in {symbol}: <span className="up">{crIn(d.buyCr)}</span> bought, <span className="down">{crIn(d.sellCr)}</span> sold, net {d.netCr >= 0 ? "+" : MINUS}{crIn(Math.abs(d.netCr))}.</>
        : <>No bulk or block deal in {symbol}.</>} {held}</p>
      {chart && chart.on.length > 0 && <figure className="bbd-ch">
        <ChartZoom label={`${symbol}: closing prices and bulk and block deals`}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${symbol} closing prices over the last year, with ${chart.on.length} bulk and block deals at their deal prices`}>
          {chart.ticks.map((v) => <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={chart.y(v)} y2={chart.y(v)} className="bbd-gl" /><text x={PAD.l - 6} y={chart.y(v) + 4} textAnchor="end" className="bbd-tx">{nf(v, v >= 1000 ? 0 : 1)}</text></g>)}
          <text x={PAD.l} y={H - 6} className="bbd-tx">{dayIn(chart.first)}</text><text x={W - PAD.r} y={H - 6} textAnchor="end" className="bbd-tx">{dayIn(chart.last)}</text>
          <path d={chart.path} className="bbd-ln2" />
          {chart.on.map((r, i) => <circle key={r.id} cx={chart.x(r.day)} cy={chart.y(r.price as number)} r={hi === i ? 7 : 5} className={"bbd-dot " + (r.side ?? "")} tabIndex={0}
            aria-label={`${dayIn(r.day)}: ${r.client ?? "a client"} ${r.side === "buy" ? "bought" : "sold"} ${nf(r.qty, 0)} shares at ₹${nf(r.price as number, 2)}, ${crIn(r.valueCr)}`}
            onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(i)} onBlur={() => setHi(null)} />)}
        </svg>
        </ChartZoom>
        {h && <div className="bbd-tip" role="status" style={{ left: `${(chart.x(h.day) / W) * 100}%` }}>
          <b>{dayIn(h.day)} · {h.kind === "block" ? "Block" : "Bulk"}</b><span>{h.client}</span>
          <span className={h.side === "buy" ? "up" : "down"}>{h.side === "buy" ? "Bought" : "Sold"} {nf(h.qty, 0)} at ₹{nf(h.price as number, 2)}</span><span>{crIn(h.valueCr)}{h.pctEquity != null ? ` · ${nf(h.pctEquity, 2)}% of equity` : ""}</span></div>}
        <figcaption className="faint"><span className="bbd-key buy" /> bought <span className="bbd-key sell" /> sold, at the deal price. {chart.off.length ? `${chart.off.length} older ${chart.off.length === 1 ? "deal is" : "deals are"} not drawn: a split or bonus since, or no close held for the day.` : ""}</figcaption>
      </figure>}
      {once.length > 0 && <div className="bbd-cpt"><table className="ia-t"><caption className="sr-only">The latest bulk and block deals in {symbol}</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Client</th><th scope="col">Action</th><th scope="col" className="r">Qty</th><th scope="col" className="r">Price</th><th scope="col" className="r">Value</th></tr></thead>
        <tbody>{once.slice(0, 12).map((r) => <tr key={r.id}><td>{dayIn(r.day)}<small>{r.kind === "block" ? "Block" : "Bulk"}{r.alsoBulk ? " · also in bulk list" : ""}</small></td>
          <td className="bbd-ct">{r.clientKey ? <Link to={`/ipo?view=deals&client=${encodeURIComponent(r.clientKey)}`}>{r.client}</Link> : MINUS}</td>
          <td><span className={"bbd-b " + (r.side ?? "")}>{r.side === "buy" ? "Buy" : "Sell"}</span></td><td className="r">{nf(r.qty, 0)}</td>
          <td className="r">{r.price != null ? "₹" + nf(r.price, 2) : MINUS}</td><td className="r">{crIn(r.valueCr)}</td></tr>)}</tbody></table></div>}
      {shorts.length > 0 && <p className="bbd-ol">Short selling reported on {nf(shorts.length, 0)} {shorts.length === 1 ? "day" : "days"}; the latest, {dayIn(shorts[0].day)}: {nf(shorts[0].qty, 0)} shares.</p>}
      <DealFollow what="symbol" value={symbol} label={symbol} />
      <p className="faint bbd-ol">Source: NSE's bulk and block deal files and short-selling reports. A block deal NSE also lists as a bulk deal is counted once. <Link to={`/ipo?view=deals&q=${encodeURIComponent(symbol)}&period=1y`}>Every deal in {symbol} →</Link></p>
    </div>
  );
}
