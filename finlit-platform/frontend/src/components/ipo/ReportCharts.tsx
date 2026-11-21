// The IPO report's charts: subscription by investor category, the bids at each price, how the issue was reserved, the GMP log and the restated
// financials. Plain SVG and CSS bars; each can be enlarged (ChartZoom). Describes the issue; not a forecast and not advice.
import { useState } from "react";
import { ChartZoom } from "../ChartZoom";
import { MINUS, nf } from "../../lib/format";
import type { BookCategory, IpoDetail, ReservationRow } from "../../lib/ipoHistory";

const COLOURS: Record<string, string> = { anchor: "var(--k1)", qib: "var(--k2)", nii: "var(--k3)", bnii: "var(--k3)", snii: "var(--k4)", retail: "var(--k5)", employee: "var(--k6)",
  shareholder: "var(--k7)", policyholder: "var(--k8)", market_maker: "var(--k8)", other: "var(--muted)" };
const colourOf = (k: string) => COLOURS[k] ?? "var(--muted)";
const dShort = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Times subscribed per category, on one scale; the overall figure as a line. */
export function BookBars({ cats, total }: { cats: BookCategory[]; total: number }) {
  const max = Math.max(total, ...cats.map((c) => c.times), 1);
  return (
    <ChartZoom label="Times subscribed by investor category">
      <ul className="ir-bars" aria-label="Times subscribed by investor category">
        {cats.map((c) => (
          <li key={c.key}><span className="ir-bl">{c.label}</span>
            <span className="ir-bt"><i style={{ width: `${Math.max(0.6, (c.times / max) * 100)}%`, background: colourOf(c.key) }} /><em style={{ left: `${(total / max) * 100}%` }} aria-hidden="true" /></span>
            <b>{nf(c.times, 2)}x</b></li>))}
        <li className="ir-tot"><span className="ir-bl">Overall</span><span className="ir-bt"><i style={{ width: `${(total / max) * 100}%` }} /></span><b>{nf(total, 2)}x</b></li>
      </ul>
    </ChartZoom>
  );
}

/** Bids at each price in the band (lakh shares), the cut-off bids last. */
export function DemandBars({ demand }: { demand: { price: string; lakhShares: number }[] }) {
  const max = Math.max(1, ...demand.map((d) => d.lakhShares));
  return (
    <ChartZoom label="Bids at each price">
      <ul className="ir-dem" aria-label="Bids at each price, lakh shares">
        {demand.map((d) => <li key={d.price}><span>{d.price === "Cut-off" ? "Cut-off" : "₹" + d.price}</span><span className="ir-bt"><i style={{ width: `${Math.max(0.4, (d.lakhShares / max) * 100)}%` }} /></span><b>{nf(d.lakhShares, d.lakhShares < 10 ? 2 : 0)} lakh</b></li>)}
      </ul>
    </ChartZoom>
  );
}

/** How the issue was split between investor categories: one stacked bar and a table. */
export function Reservation({ rows, total }: { rows: ReservationRow[]; total: number }) {
  return (
    <div className="ir-res">
      <ChartZoom label="How the issue was reserved">
        <div className="ir-stack" role="img" aria-label={rows.map((r) => `${r.label} ${nf(r.pct, 1)}%`).join(", ")}>
          {rows.map((r) => <i key={r.key} style={{ width: `${r.pct}%`, background: colourOf(r.key) }} title={`${r.label}: ${nf(r.pct, 2)}%`} />)}
        </div>
      </ChartZoom>
      <div className="ir-tw"><table className="ir-t"><caption className="sr-only">Shares reserved for each investor category</caption>
        <thead><tr><th scope="col">Category</th><th scope="col" className="r">Shares</th><th scope="col" className="r">Of the issue</th><th scope="col" className="r">Most allottees</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key}><th scope="row"><i className="ir-dot" style={{ background: colourOf(r.key) }} />{r.label}</th><td className="r">{nf(r.shares, 0)}</td><td className="r">{nf(r.pct, 2)}%</td><td className="r">{r.maxAllottees != null ? nf(r.maxAllottees, 0) : MINUS}</td></tr>)}
          <tr className="ir-sum"><th scope="row">Total</th><td className="r">{nf(total, 0)}</td><td className="r">100%</td><td /></tr></tbody>
      </table></div>
    </div>
  );
}

/** The GMP InvestorGain recorded, day by day, in rupees; the dashed line is zero (no premium). */
export function GmpLine({ points, issuePrice }: { points: { t: string; gmp: number }[]; issuePrice: number | null }) {
  const [hi, setHi] = useState<number | null>(null);
  if (points.length < 2) return null;
  const W = 640, H = 200, L = 44, R = 12, T = 14, B = 26;
  const ts = points.map((p) => new Date(p.t).getTime()), t0 = Math.min(...ts), t1 = Math.max(...ts);
  const lo = Math.min(0, ...points.map((p) => p.gmp)), top = Math.max(1, ...points.map((p) => p.gmp));
  const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R), y = (v: number) => T + (1 - (v - lo) / (top - lo || 1)) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(ts[i]).toFixed(1)},${y(p.gmp).toFixed(1)}`).join(" ");
  const peak = points.reduce((a, p) => (p.gmp > a.gmp ? p : a), points[0]);
  const h = hi != null ? points[hi] : null;
  return (
    <ChartZoom label="GMP day by day">
      <div className="ir-gmp">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`GMP from ${dShort(points[0].t)} to ${dShort(points[points.length - 1].t)}: first ₹${nf(points[0].gmp, 0)}, peak ₹${nf(peak.gmp, 0)}, last ₹${nf(points[points.length - 1].gmp, 0)}`}
          onMouseLeave={() => setHi(null)} onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const tx = t0 + (((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * (t1 - t0); let b = 0; ts.forEach((t, i) => { if (Math.abs(t - tx) < Math.abs(ts[b] - tx)) b = i; }); setHi(b); }}>
          {[lo, (lo + top) / 2, top].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="ir-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="ir-tick">₹{nf(v, 0)}</text></g>)}
          {lo < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="ir-zero" />}
          <text x={L} y={H - 6} className="ir-tick">{dShort(points[0].t)}</text><text x={W - R} y={H - 6} textAnchor="end" className="ir-tick">{dShort(points[points.length - 1].t)}</text>
          <path d={path} className="ir-line" />
          <circle cx={x(new Date(peak.t).getTime())} cy={y(peak.gmp)} r={4} className="ir-peak" />
          {h && <circle cx={x(new Date(h.t).getTime())} cy={y(h.gmp)} r={5} className="ir-hi" />}
        </svg>
        <p className="ir-gmp-cap" aria-live="polite">{h ? <>{new Date(h.t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: <b>₹{nf(h.gmp, h.gmp % 1 ? 1 : 0)}</b>{issuePrice ? ` (${nf((h.gmp / issuePrice) * 100, 1)}% of the issue price)` : ""}</>
          : <>Peak <b>₹{nf(peak.gmp, peak.gmp % 1 ? 1 : 0)}</b> on {dShort(peak.t)} · last <b>₹{nf(points[points.length - 1].gmp, 0)}</b> on {dShort(points[points.length - 1].t)}</>}</p>
      </div>
    </ChartZoom>
  );
}

const DATEISH = /^\d{4}-\d{2}-\d{2}$/;
const period = (p: string) => (DATEISH.test(p) ? new Date(p + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : p);

/** The restated financials, as the offer document gives them, oldest period on the left; small bars for income and profit. */
export function Financials({ f }: { f: NonNullable<IpoDetail["financials"]> }) {
  const order = f.periods.map((_, i) => i).reverse();
  const pick = (re: RegExp) => f.rows.find((r) => re.test(r.label));
  const income = pick(/total income|revenue/i), pat = pick(/profit after tax|^pat/i);
  const bars = [income, pat].filter((r): r is NonNullable<typeof r> => !!r);
  return (
    <>
      {bars.length > 0 && (
        <ChartZoom label="Income and profit from the offer document">
          <div className="ir-fbars">{bars.map((r) => { const vals = order.map((i) => r.values[i]); const m = Math.max(1, ...vals.map((v) => Math.abs(v ?? 0))); return (
            <figure key={r.label}><figcaption>{r.label}</figcaption>
              <div className="ir-fb">{order.map((i, j) => <span key={i}><i className={(vals[j] ?? 0) < 0 ? "neg" : ""} style={{ height: `${Math.max(2, (Math.abs(vals[j] ?? 0) / m) * 100)}%` }} /><b>{vals[j] == null ? MINUS : nf(vals[j] as number, 0)}</b><small>{period(f.periods[i])}</small></span>)}</div>
            </figure>); })}</div>
        </ChartZoom>)}
      <div className="ir-tw"><table className="ir-t ir-fin"><caption className="sr-only">Restated financials, {f.unit ?? "as given"}</caption>
        <thead><tr><th scope="col">{f.unit ? `In ${f.unit}` : "Line item"}</th>{order.map((i) => <th key={i} scope="col" className="r">{period(f.periods[i])}</th>)}</tr></thead>
        <tbody>{f.rows.map((r) => <tr key={r.label}><th scope="row">{r.label.replace(/^NET Worth$/i, "Net worth")}</th>{order.map((i) => <td key={i} className="r">{r.values[i] == null ? MINUS : nf(r.values[i] as number, 2)}</td>)}</tr>)}</tbody>
      </table></div>
    </>
  );
}
