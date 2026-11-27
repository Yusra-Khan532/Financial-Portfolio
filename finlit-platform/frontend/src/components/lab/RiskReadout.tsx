// Trading Lab > Order Flow > Risk read-out (docs/TRADING-LAB.md "Risk read-out", Build order item 6): how one NSE stock's price moved in the
// past, worked out from its stored daily closes (backend finlit/lab/risk.py, no LLM): 20-session against 1-year volatility, the deepest fall with
// its dates and recovery, one-day VaR and expected shortfall, Sortino, Calmar, beta and correlation with the Nifty 50, each with its window,
// beside the same figures for the Nifty 50. Hover any tile, bar, dot or point for the detail. Facts about the past only.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../lib/api";
import { matchUnderlyings, type Underlyings } from "../../lib/options";
import {
  NOTE, bins, day, fallLine, fit, nearestIndex, num, ordinal, pct, pctU, rs, ticks, volWords, windowLine,
  type Bin, type Drawdown, type Ratio, type Risk, type RiskFigures, type RiskWindow, type Tail,
} from "../../lib/risk";
import { useTip } from "./FlowTips";
import { ChartZoom, useZoomHeight } from "../ChartZoom";

const getUnderlyings = () => apiGet<Underlyings>("/api/options/lab/underlyings");
const getRisk = (s: string) => apiGet<Risk>(`/api/lab/risk/${encodeURIComponent(s)}`);
const QUICK = ["RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "SBIN", "TCS"];
const tk = (t: number, unit = "%") => `${t < 0 ? "−" : ""}${Math.abs(t)}${unit}`;   // an axis label with a true minus sign
const mon = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

/** The drawing's own width in CSS pixels, so its text stays at its real size on a phone and in the enlarged view. */
function useWidth(base: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const n = Math.round(el.getBoundingClientRect().width); setW((o) => (Math.abs(o - n) > 1 ? n : o)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w > 200 ? w : base];
}

// ------------------------------------------------------------------------------------------------------------------ tiles

type Row = [string, ReactNode];

function Pop({ title, sub, value, rows, what }: { title: string; sub?: string; value?: ReactNode; rows: Row[]; what?: string }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{title}</b>{sub && <small>{sub}</small>}</div>{value != null && <div className="r"><b>{value}</b></div>}</header>
      <dl className="oflow-pop-t one">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {what && <p className="muted rsk-pop-what">{what}</p>}
    </>
  );
}

function Tile({ label, value, tone, nifty, extra, w, what, pop }: {
  label: string; value: string; tone?: string; nifty?: string | null; extra?: string; w: RiskWindow | null | undefined; what: string; pop: ReactNode;
}) {
  const tip = useTip();
  return (
    <article className="rsk-tile" aria-label={label} onPointerMove={(e) => tip.show(e, pop)} onPointerLeave={() => tip.hide()}>
      <p className="rsk-tl">{label}</p>
      <p className="rsk-v"><b className={tone}>{value}</b>{nifty != null && <small>Nifty 50: {nifty}</small>}</p>
      {extra && <p className="rsk-x">{extra}</p>}
      <p className="rsk-w">{windowLine(w)}{w?.short && <em className="rsk-short">Short: {w.returns} returns</em>}</p>
      <p className="rsk-what">{what}</p>
    </article>
  );
}

const winRows = (w: RiskWindow | null | undefined): Row[] => (w ? [["Window", `${w.label}: ${day(w.from)} to ${day(w.to)}`], ["Daily returns", `${w.returns}${w.full ? "" : ` (of ${w.wanted} wanted)`}`]] : []);
const tailAt = (f: RiskFigures | null | undefined, lv: number): Tail | null => f?.tail.levels.find((t) => t && t.level === lv) ?? null;

function fallRows(d: Drawdown): Row[] {
  const f = d.deepest;
  if (!f) return [["Deepest fall", "none: no close below an earlier high"]];
  return [
    ["High", `${day(f.peak.d)} · ₹${f.peak.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`],
    ["Low", `${day(f.trough.d)} · ₹${f.trough.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`],
    ["High to low", `${f.fallSessions} sessions (${f.fallDays} days)`],
    f.recovered ? ["Back at the high", `${day(f.recovered.d)} · ${f.recoverySessions} sessions after the low`] : ["Back at the high", `not yet: ${f.sessionsSincePeak} sessions (${f.daysSincePeak} days) since the high, ${pctU(f.belowPeakPct)} below it`],
  ];
}

function ratioTile(label: string, r: Ratio | null | undefined, n: Ratio | null | undefined, what: string, kind: "sortino" | "calmar") {
  const rows: Row[] = r ? [
    ...(kind === "sortino" ? [["Mean daily return", pct(r.meanPct, 3)], ["Downside deviation (daily)", pctU(r.downsidePct, 3)]] as Row[]
      : [["Compounded yearly return", pct(r.annReturnPct)], ["Deepest fall in the window", pctU(r.maxFallPct)]] as Row[]),
    ["Nifty 50", num(n?.value)], ...winRows(r.window)] : [];
  return <Tile key={label} label={label} value={r ? num(r.value) : "—"} nifty={n ? num(n.value) : null} w={r?.window} what={r?.why ?? what}
    pop={<Pop title={label} value={r ? num(r.value) : "—"} rows={rows.length ? rows : [["Window", "not enough stored closes"]]} what={r?.why ?? what} />} />;
}

function Tiles({ r }: { r: Risk }) {
  const s = r.stock, n = r.nifty, e = r.explain, b = r.beta;
  const v = (x: number | null | undefined) => pctU(x);
  const tails = ([0.95, 0.99] as const).flatMap((lv) => {
    const t = tailAt(s, lv), tn = tailAt(n, lv), p = Math.round(lv * 100), worst = `${100 - p}%`;
    const rows = (kind: "var" | "es"): Row[] => t ? [
      ["Loss", `${pctU(kind === "var" ? t.varPct : t.esPct, 2)} · ${rs(kind === "var" ? t.varRs : t.esRs)} per ₹1 lakh held`],
      [kind === "var" ? "Rank" : "Days averaged", kind === "var" ? `the ${ordinal(t.k)} worst of ${t.n} days` : `the worst ${t.k} of ${t.n} days`],
      ["Nifty 50", tn ? `${pctU(kind === "var" ? tn.varPct : tn.esPct, 2)} · ${rs(kind === "var" ? tn.varRs : tn.esRs)}` : "—"], ...winRows(s.tail.window)] : [["Window", "no returns"]];
    return [
      <Tile key={`var${p}`} label={`One-day VaR ${p}%`} value={t ? `−${t.varPct.toFixed(2)}%` : "—"} tone="loss" nifty={tn ? `−${tn.varPct.toFixed(2)}%` : null}
        extra={t ? `${rs(t.varRs)} per ₹1 lakh held` : undefined} w={s.tail.window} what={e.var.replace("5% (or 1%)", worst)}
        pop={<Pop title={`One-day VaR ${p}%`} sub="historical, from the last year's daily returns" rows={rows("var")} what={e.var.replace("5% (or 1%)", worst)} />} />,
      <Tile key={`es${p}`} label={`Expected shortfall ${p}%`} value={t ? `−${t.esPct.toFixed(2)}%` : "—"} tone="loss" nifty={tn ? `−${tn.esPct.toFixed(2)}%` : null}
        extra={t ? `${rs(t.esRs)} per ₹1 lakh held` : undefined} w={s.tail.window} what={e.es.replace("5% (or 1%)", worst)}
        pop={<Pop title={`Expected shortfall ${p}%`} sub="the average of the worst days" rows={rows("es")} what={e.es.replace("5% (or 1%)", worst)} />} />,
    ];
  });
  const fall = (label: string, d: Drawdown | null, dn: Drawdown | null | undefined) => d
    ? <Tile key={label} label={label} value={d.deepest ? pctU(d.deepest.depthPct) : "0%"} tone={d.deepest ? "loss" : undefined}
        nifty={dn ? (dn.deepest ? pctU(dn.deepest.depthPct) : "0%") : null} extra={fallLine(d.deepest)} w={d.window} what={e.drawdown}
        pop={<Pop title={label} value={d.deepest ? pctU(d.deepest.depthPct) : "0%"} rows={[...fallRows(d), ["Nifty 50", dn?.deepest ? fallLine(dn.deepest) : "—"], ...winRows(d.window)]} what={e.drawdown} />} />
    : <Tile key={label} label={label} value="—" w={null} what={s.threeYearNote ?? e.drawdown} pop={<Pop title={label} rows={[["Window", s.threeYearNote ?? "—"]]} />} />;
  return (
    <div className="rsk-groups">
      <section className="rsk-group" aria-labelledby="rsk-g1"><h3 id="rsk-g1">How widely it swung</h3><div className="rsk-tiles">
        <Tile label="Volatility, 20 sessions" value={v(s.vol20.pct)} nifty={n ? v(n.vol20.pct) : null} extra="annualised" w={s.vol20.window} what={e.vol20}
          pop={<Pop title="Volatility, 20 sessions" sub="annualised, from daily log returns" value={v(s.vol20.pct)} rows={[["Nifty 50", n ? v(n.vol20.pct) : "—"], ...winRows(s.vol20.window)]} what={e.vol20} />} />
        <Tile label="Volatility, 1 year" value={v(s.vol1y.pct)} nifty={n ? v(n.vol1y.pct) : null} extra="annualised" w={s.vol1y.window} what={e.vol1y}
          pop={<Pop title="Volatility, 1 year" sub="annualised, from daily log returns" value={v(s.vol1y.pct)} rows={[["Nifty 50", n ? v(n.vol1y.pct) : "—"], ...winRows(s.vol1y.window)]} what={e.vol1y} />} />
        <Tile label="20 sessions against 1 year" value={s.volRatio.value == null ? "—" : `${s.volRatio.value.toFixed(2)}×`} nifty={n?.volRatio.value == null ? null : `${n.volRatio.value.toFixed(2)}×`}
          extra={volWords(s.volRatio.value)} w={s.volRatio.window} what={e.volRatio}
          pop={<Pop title="20 sessions against 1 year" value={s.volRatio.value == null ? "—" : `${s.volRatio.value.toFixed(2)}×`}
            rows={[["20 sessions", v(s.vol20.pct)], ["1 year", v(s.vol1y.pct)], ["Nifty 50", n?.volRatio.value == null ? "—" : `${n.volRatio.value.toFixed(2)}×`]]} what={e.volRatio} />} />
      </div></section>
      <section className="rsk-group" aria-labelledby="rsk-g2"><h3 id="rsk-g2">Deepest fall</h3><div className="rsk-tiles two">
        {fall("Deepest fall, 1 year", s.drawdown1y, n?.drawdown1y)}
        {fall(s.drawdown3y?.window.label === "Stored history" ? "Deepest fall, stored history" : "Deepest fall, 3 years", s.drawdown3y, n?.drawdown3y)}
      </div></section>
      <section className="rsk-group" aria-labelledby="rsk-g3"><h3 id="rsk-g3">One-day loss on the worst days</h3><div className="rsk-tiles four">{tails}</div></section>
      <section className="rsk-group" aria-labelledby="rsk-g4"><h3 id="rsk-g4">Return for the swings taken</h3><div className="rsk-tiles four">
        {ratioTile("Sortino, 1 year", s.sortino1y, n?.sortino1y, e.sortino, "sortino")}
        {ratioTile(s.sortino3y?.window.label === "Stored history" ? "Sortino, stored history" : "Sortino, 3 years", s.sortino3y, n?.sortino3y, s.sortino3y ? e.sortino : s.threeYearNote ?? e.sortino, "sortino")}
        {ratioTile("Calmar, 1 year", s.calmar1y, n?.calmar1y, e.calmar, "calmar")}
        {ratioTile(s.calmar3y?.window.label === "Stored history" ? "Calmar, stored history" : "Calmar, 3 years", s.calmar3y, n?.calmar3y, s.calmar3y ? e.calmar : s.threeYearNote ?? e.calmar, "calmar")}
      </div></section>
      <section className="rsk-group" aria-labelledby="rsk-g5"><h3 id="rsk-g5">Against the Nifty 50</h3><div className="rsk-tiles two">
        <Tile label="Beta against the Nifty 50" value={num(b?.value)} nifty={b ? "1.00 (itself)" : null} extra={b ? `${b.aligned} days with a close for both` : "Nifty 50 closes are not stored"}
          w={b?.window} what={b?.why ?? e.beta}
          pop={<Pop title="Beta against the Nifty 50" value={num(b?.value)} rows={b ? [["Days both closed", String(b.aligned)], ["Days only the stock has", String(b.onlyStock)],
            ["Days only the Nifty 50 has", String(b.onlyIndex)], ["Fitted line", b.value == null ? "—" : `stock = ${num(b.alphaPct, 3)}% + ${num(b.value)} × Nifty 50`], ...winRows(b.window)] : [["Nifty 50", "not stored"]]} what={b?.why ?? e.beta} />} />
        <Tile label="Correlation with the Nifty 50" value={num(b?.corr)} nifty={b ? "1.00 (itself)" : null} extra={b?.r2 != null ? `${Math.round(b.r2 * 100)}% of the stock's daily swing lined up with the index's` : undefined}
          w={b?.window} what={e.corr}
          pop={<Pop title="Correlation with the Nifty 50" value={num(b?.corr)} rows={b ? [["R²", b.r2 == null ? "—" : num(b.r2)], ["Days both closed", String(b.aligned)], ...winRows(b.window)] : [["Nifty 50", "not stored"]]} what={e.corr} />} />
      </div></section>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ charts

function xTicks(d: string[], count: number): number[] {
  if (d.length < 2) return [0];
  const step = Math.max(1, Math.round((d.length - 1) / count));
  const out: number[] = [];
  for (let i = 0; i < d.length; i += step) out.push(i);
  return out;
}

/** How far below its running closing high the stock was each day, with the deepest fall marked (high, low and back at the high). */
export function UnderwaterChart({ r, w, h }: { r: Risk; w: number; h: number }) {
  const tip = useTip();
  const [hot, setHot] = useState<number | null>(null);
  const { d, c, dd } = r.underwater, n = d.length;
  const deep = r.stock.drawdown3y?.deepest ?? r.stock.drawdown1y.deepest;
  const L = 46, R = 12, T = 22, B = 24;
  const lo = Math.min(-1, ...dd) * 1.08;
  const x = (i: number) => L + (n > 1 ? (i / (n - 1)) * (w - L - R) : 0), y = (v: number) => T + (v / lo) * (h - T - B);
  const highs = useMemo(() => { let hi = 0; return c.map((v, i) => { if (v >= c[hi]) hi = i; return hi; }); }, [c]);
  const path = dd.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = n > 1 ? `${path}L${x(n - 1).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const at = (iso?: string) => (iso ? d.indexOf(iso) : -1);
  const pk = at(deep?.peak.d), tr = at(deep?.trough.d), rc = at(deep?.recovered?.d), yr = n - 1 - Math.min(n - 1, 252);
  const show = (e: React.PointerEvent<SVGRectElement>) => {
    const i = nearestIndex(e, n, w, L, R); setHot(i);
    tip.show(e, <Pop title={day(d[i])} sub={r.symbol} value={pctU(dd[i], 2)} rows={[["Close", `₹${c[i].toLocaleString("en-IN", { maximumFractionDigits: 2 })}`],
      ["Closing high before it", `${day(d[highs[i]])} · ₹${c[highs[i]].toLocaleString("en-IN", { maximumFractionDigits: 2 })}`],
      ["Below that high", pctU(dd[i], 2)]]} what={i >= pk && i <= (rc >= 0 ? rc : n - 1) && pk >= 0 ? "Inside the deepest fall of the window." : undefined} />);
  };
  return (
    <svg className="rsk-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      aria-label={`${r.symbol}: fall below the running closing high on ${n} days, deepest ${deep ? pctU(deep.depthPct) : "none"}`} onPointerLeave={() => { setHot(null); tip.hide(); }}>
      {ticks(lo, 0, 4).map((t) => <g key={t} className="rsk-grid"><line x1={L} x2={w - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 4} textAnchor="end">{tk(t)}</text></g>)}
      {xTicks(d, w < 520 ? 3 : 6).map((i) => <text key={i} className="rsk-xt" x={x(i)} y={h - 6} textAnchor={i === 0 ? "start" : "middle"}>{mon(d[i])}</text>)}
      {pk >= 0 && <rect className="rsk-span" x={x(pk)} y={T} width={Math.max(1, x(rc >= 0 ? rc : n - 1) - x(pk))} height={h - T - B} />}
      {yr > 0 && <g className="rsk-yr"><line x1={x(yr)} x2={x(yr)} y1={T} y2={h - B} /><text x={x(yr) + 4} y={T - 8}>1 year</text></g>}
      <path className="rsk-under" d={area} />
      <path className="rsk-under-l" d={path} />
      {pk >= 0 && <g className="rsk-mk"><circle cx={x(pk)} cy={y(0)} r={4} /><text x={x(pk)} y={T - 8} textAnchor={x(pk) > w - 90 ? "end" : "middle"}>High</text></g>}
      {tr >= 0 && <g className="rsk-mk low"><circle cx={x(tr)} cy={y(dd[tr])} r={5} /><text x={x(tr)} y={y(dd[tr]) - 9} textAnchor={x(tr) > w - 120 ? "end" : x(tr) < L + 60 ? "start" : "middle"}>Low {pctU(dd[tr])}</text></g>}
      {rc >= 0 && <g className="rsk-mk back"><circle cx={x(rc)} cy={y(0)} r={4} /><text x={x(rc)} y={T + 14} textAnchor={x(rc) > w - 120 ? "end" : "middle"}>Back at the high</text></g>}
      {hot != null && <g className="rsk-hot"><line x1={x(hot)} x2={x(hot)} y1={T} y2={h - B} /><circle cx={x(hot)} cy={y(dd[hot])} r={4} /></g>}
      <rect className="rsk-hit" x={L} y={T} width={w - L - R} height={h - T - B} onPointerMove={show} />
    </svg>
  );
}

/** The 20-session volatility on each day of the last year, against the 1-year level. */
export function RollingChart({ r, w, h }: { r: Risk; w: number; h: number }) {
  const tip = useTip();
  const [hot, setHot] = useState<number | null>(null);
  const { d, v } = r.rolling, n = d.length, level = r.stock.vol1y.pct;
  const L = 46, R = 12, T = 22, B = 24;
  const hi = Math.max(1, level ?? 0, ...v.map((q) => q ?? 0)) * 1.12;
  const x = (i: number) => L + (n > 1 ? (i / (n - 1)) * (w - L - R) : 0), y = (q: number) => T + (1 - q / hi) * (h - T - B);
  const path = v.reduce((p, q, i) => (q == null ? p : p + `${p && v[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(q).toFixed(1)}`), "");
  const show = (e: React.PointerEvent<SVGRectElement>) => {
    const i = nearestIndex(e, n, w, L, R); setHot(i);
    const q = v[i];
    tip.show(e, <Pop title={day(d[i])} sub="20 sessions up to this day, annualised" value={pctU(q)} rows={[["1-year level (now)", pctU(level)],
      ["Against the 1-year level", q == null || !level ? "—" : `${(q / level).toFixed(2)}×`]]} what={r.explain.vol20} />);
  };
  return (
    <svg className="rsk-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      aria-label={`${r.symbol}: 20-session volatility on ${n} days against the 1-year level of ${pctU(level)}`} onPointerLeave={() => { setHot(null); tip.hide(); }}>
      {ticks(0, hi, 4).map((t) => <g key={t} className="rsk-grid"><line x1={L} x2={w - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 4} textAnchor="end">{tk(t)}</text></g>)}
      {xTicks(d, w < 520 ? 3 : 6).map((i) => <text key={i} className="rsk-xt" x={x(i)} y={h - 6} textAnchor={i === 0 ? "start" : "middle"}>{mon(d[i])}</text>)}
      {level != null && <g className="rsk-level"><line x1={L} x2={w - R} y1={y(level)} y2={y(level)} /><text x={w - R} y={y(level) - 6} textAnchor="end">1-year level {pctU(level)}</text></g>}
      <path className="rsk-roll" d={path} />
      {hot != null && v[hot] != null && <g className="rsk-hot"><line x1={x(hot)} x2={x(hot)} y1={T} y2={h - B} /><circle cx={x(hot)} cy={y(v[hot]!)} r={4} /></g>}
      <rect className="rsk-hit" x={L} y={T} width={w - L - R} height={h - T - B} onPointerMove={show} />
    </svg>
  );
}

/** The last year's daily returns counted into bins, with the VaR and expected shortfall lines. */
export function ReturnHistogram({ r, w, h }: { r: Risk; w: number; h: number }) {
  const tip = useTip();
  const { r: rets, d } = r.returns1y;
  const hb = useMemo(() => bins(rets, d), [rets, d]);
  const t95 = tailAt(r.stock, 0.95), t99 = tailAt(r.stock, 0.99);
  const L = 40, R = 12, T = 66, B = 24, bs = hb.bins;   // four label rows above the bars, one per tail line, so no two labels meet
  const lo = Math.min(bs[0]?.lo ?? -1, t99 ? -t99.esPct : 0), hi = Math.max(bs[bs.length - 1]?.hi ?? 1, 0.5);
  const x = (q: number) => L + ((q - lo) / (hi - lo || 1)) * (w - L - R);
  const top = Math.max(1, ...bs.map((b) => b.count)), y = (k: number) => T + (1 - k / top) * (h - T - B);
  const lines = [
    t95 && { key: "var95", at: -t95.varPct, label: "VaR 95%", t: t95, kind: "var" as const },
    t99 && { key: "var99", at: -t99.varPct, label: "VaR 99%", t: t99, kind: "var" as const },
    t95 && { key: "es95", at: -t95.esPct, label: "ES 95%", t: t95, kind: "es" as const },
    t99 && { key: "es99", at: -t99.esPct, label: "ES 99%", t: t99, kind: "es" as const },
  ].filter(Boolean) as { key: string; at: number; label: string; t: Tail; kind: "var" | "es" }[];
  const ordered = [...lines].sort((a, b) => b.at - a.at);
  const binPop = (b: Bin) => <Pop title={`${pct(b.lo)} to ${pct(b.hi)}`} sub="one-day returns, last year" value={`${b.count} ${b.count === 1 ? "day" : "days"}`}
    rows={b.days.length ? [["Days", b.days.slice(-6).map(day).join(", ") + (b.days.length > 6 ? ` and ${b.days.length - 6} more` : "")]] : []}
    what={t95 && b.hi <= -t95.varPct + 1e-9 ? "Inside the worst 5% of days." : undefined} />;
  return (
    <svg className="rsk-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      aria-label={`${r.symbol}: ${rets.length} one-day returns in ${bs.length} bins of ${hb.width} percentage points, with VaR and expected shortfall`} onPointerLeave={() => tip.hide()}>
      {ticks(0, top, 4).filter((t) => Number.isInteger(t)).map((t) => <g key={t} className="rsk-grid"><line x1={L} x2={w - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
      {ticks(lo, hi, w < 520 ? 4 : 8).map((t) => <text key={t} className="rsk-xt" x={x(t)} y={h - 6} textAnchor="middle">{tk(t)}</text>)}
      {bs.map((b) => {
        const worst = t95 != null && b.hi <= -t95.varPct + 1e-9;
        return <rect key={b.lo} className={`rsk-bin${worst ? " tail" : b.lo >= 0 ? " up" : ""}`} x={x(b.lo) + 1} width={Math.max(1, x(b.hi) - x(b.lo) - 2)} y={y(b.count)} height={Math.max(0, y(0) - y(b.count))}
          rx={2} onPointerMove={(e) => tip.show(e, binPop(b))} onPointerLeave={() => tip.hide()} />;
      })}
      <line className="rsk-zero" x1={x(0)} x2={x(0)} y1={T} y2={h - B} />
      {ordered.map((l, i) => (
        <g key={l.key} className={`rsk-tailline ${l.kind}`} onPointerMove={(e) => tip.show(e, <Pop title={`${l.label}: −${(l.kind === "var" ? l.t.varPct : l.t.esPct).toFixed(2)}%`}
          sub="one day, from the last year's returns" rows={[["Per ₹1 lakh held", rs(l.kind === "var" ? l.t.varRs : l.t.esRs)], [l.kind === "var" ? "Rank" : "Days averaged", l.kind === "var" ? `the ${ordinal(l.t.k)} worst of ${l.t.n} days` : `the worst ${l.t.k} of ${l.t.n} days`]]}
          what={(l.kind === "var" ? r.explain.var : r.explain.es).replace("5% (or 1%)", `${Math.round((1 - l.t.level) * 100)}%`)} />)} onPointerLeave={() => tip.hide()}>
          <line x1={x(l.at)} x2={x(l.at)} y1={10 + i * 14} y2={h - B} /><line className="hit" x1={x(l.at)} x2={x(l.at)} y1={10 + i * 14} y2={h - B} />
          <text x={x(l.at) - 4} y={14 + i * 14} textAnchor="end">{l.label}</text>
        </g>
      ))}
    </svg>
  );
}

/** Each day of the last year as a dot: the Nifty 50's return across, the stock's up; the fitted line's slope is the beta. */
export function BetaScatter({ r, w, h }: { r: Risk; w: number; h: number }) {
  const tip = useTip();
  const [hot, setHot] = useState<number | null>(null);
  const p = r.pairs ?? { d: [], s: [], m: [] };
  const line = fit(p.m, p.s);
  const L = 44, R = 12, T = 18, B = 26;
  const ext = (a: number[]) => { const m = Math.max(0.5, ...a.map(Math.abs)) * 1.08; return [-m, m] as const; };
  const [xl, xh] = ext(p.m), [yl, yh] = ext(p.s);
  const x = (v: number) => L + ((v - xl) / (xh - xl)) * (w - L - R), y = (v: number) => T + ((yh - v) / (yh - yl)) * (h - T - B);
  return (
    <svg className="rsk-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      aria-label={`${r.symbol} against the Nifty 50: ${p.d.length} days with a close for both${line ? `, fitted slope ${line.b.toFixed(2)}` : ""}`} onPointerLeave={() => { setHot(null); tip.hide(); }}>
      {ticks(yl, yh, 4).map((t) => <g key={`y${t}`} className="rsk-grid"><line x1={L} x2={w - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 4} textAnchor="end">{tk(t)}</text></g>)}
      {ticks(xl, xh, w < 520 ? 4 : 8).map((t) => <text key={`x${t}`} className="rsk-xt" x={x(t)} y={h - 8} textAnchor="middle">{tk(t)}</text>)}
      <line className="rsk-zero" x1={x(0)} x2={x(0)} y1={T} y2={h - B} /><line className="rsk-zero" x1={L} x2={w - R} y1={y(0)} y2={y(0)} />
      <text className="rsk-axis" x={w - R} y={y(0) - 6} textAnchor="end">Nifty 50 →</text>
      <text className="rsk-axis" x={x(0) + 6} y={T + 10}>↑ {r.symbol}</text>
      {line && (() => {   // the fitted line across the plot, cut where it leaves the top or bottom
        const xa = line.b ? (yl - line.a) / line.b : xl, xb = line.b ? (yh - line.a) / line.b : xh;
        const x0 = line.b ? Math.max(xl, Math.min(xa, xb)) : xl, x1 = line.b ? Math.min(xh, Math.max(xa, xb)) : xh;
        return <g className="rsk-fit" onPointerMove={(e) => tip.show(e, <Pop title={`Fitted line: slope ${line.b.toFixed(2)}`} sub="least squares on the dots" rows={[["Beta", num(r.beta?.value)], ["Correlation", num(r.beta?.corr)],
          ["Days", String(p.d.length)]]} what={r.explain.beta} />)} onPointerLeave={() => tip.hide()}>
          <line x1={x(x0)} y1={y(line.a + line.b * x0)} x2={x(x1)} y2={y(line.a + line.b * x1)} />
          <line className="hit" x1={x(x0)} y1={y(line.a + line.b * x0)} x2={x(x1)} y2={y(line.a + line.b * x1)} /></g>; })()}
      {p.d.map((dd, i) => (
        <circle key={dd} className={`rsk-dot${hot === i ? " hot" : ""}`} cx={x(p.m[i])} cy={y(p.s[i])} r={hot === i ? 6 : 3.5}
          onPointerMove={(e) => { setHot(i); tip.show(e, <Pop title={day(dd)} sub="one-day returns, same day" rows={[["Nifty 50", pct(p.m[i])], [r.symbol, pct(p.s[i])],
            ["On the fitted line", line ? pct(line.a + line.b * p.m[i]) : "—"]]} />); }} />
      ))}
    </svg>
  );
}

function Panel({ title, sub, zoom, legend, base, children }: { title: string; sub: string; zoom: string; legend?: ReactNode; base: number; children: (w: number, h: number) => ReactNode }) {
  const [ref, w] = useWidth(600);
  const [href, h] = useZoomHeight<HTMLDivElement>(base);
  return (
    <div className="rsk-panel">
      <div className="rsk-ph"><h3>{title}</h3><p className="muted">{sub}</p></div>
      <ChartZoom label={zoom}><div ref={(el) => { ref.current = el; href.current = el; }} className="rsk-box">{children(w, h)}</div>
        {legend && <p className="muted rsk-legend">{legend}</p>}</ChartZoom>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ the tab

export function RiskReadout() {
  const [sym, setSym] = useState("RELIANCE");
  const [find, setFind] = useState("");
  const und = useQuery({ queryKey: ["opul-und"], queryFn: getUnderlyings, retry: false, staleTime: 3600_000 });
  const q = useQuery({ queryKey: ["lab-risk", sym], queryFn: () => getRisk(sym), retry: false, staleTime: 600_000 });
  const matches = useMemo(() => (find.trim() && und.data ? matchUnderlyings(und.data.stocks, find, 8) : []), [find, und.data]);
  const pick = (s: string) => { setSym(s.trim().toUpperCase()); setFind(""); };
  const r = q.data;
  const ok = !!r && r.status === "ok";
  const err = q.error instanceof ApiError ? q.error : null;
  return (
    <section className="card oflow-board rsk" aria-labelledby="rsk-h">
      <div className="oflow-hero-h"><div><h2 id="rsk-h">Risk read-out</h2>
        <p className="oflow-money-line">{ok ? `${r!.name} (${r!.symbol}) · daily closes to ${day(r!.asOf)}` : "How a stock's price moved in the past, from its stored daily closes, beside the Nifty 50."}</p></div></div>
      <div className="opul-pick">
        <div className="oflow-bchips" role="group" aria-label="Stocks">{QUICK.map((s) => (
          <button key={s} type="button" className="oflow-bchip" aria-pressed={sym === s} onClick={() => pick(s)}>{s}</button>))}</div>
        <form className="opul-find" role="search" onSubmit={(e) => { e.preventDefault(); const t = (matches[0]?.key ?? find).trim(); if (t) pick(t); }}>
          <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Any NSE stock" aria-label="Find a stock" />
          {matches.length > 0 && <ul className="opul-found" aria-label="Matching stocks">{matches.map((m) => (
            <li key={m.key}><button type="button" onClick={() => pick(m.key)}><b>{m.key}</b> <span className="muted">{m.name}</span></button></li>))}</ul>}
        </form>
      </div>
      {q.isPending && <div className="skeleton" style={{ height: 440 }} aria-label="Working out the figures" />}
      {q.isError && <div className="formerr" role="alert">{err?.body.detail || (err?.status === 429 ? "Too many requests. Please wait a minute and try again." : `The figures for ${sym} could not be read right now. Try again in a minute.`)}</div>}
      {ok && <>
        <p className="muted rsk-src">{r!.source.label}: {r!.source.closes} daily closes, {day(r!.source.from)} to {day(r!.source.to)} · {r!.index.label}: {r!.index.closes ? `${r!.index.closes} closes to ${day(r!.index.to)}` : "not stored"}</p>
        {r!.notes.map((t) => <p key={t} className="oflow-note muted rsk-flag">{t}</p>)}
        <Tiles r={r!} />
        <div className="rsk-charts">
          <Panel title="Deepest fall, underwater" sub={`Below the running closing high each day · ${windowLine(r!.stock.drawdown3y?.window ?? r!.stock.drawdown1y.window)}`} zoom={`${r!.symbol} deepest fall`} base={260}
            legend={<><span><i className="sw rsk-sw-under" /> below the high</span><span><i className="sw rsk-sw-span" /> the deepest fall, high to back at the high (or to today)</span><span>dashed: start of the last year</span></>}>
            {(w, h) => <UnderwaterChart r={r!} w={w} h={h} />}</Panel>
          <Panel title="20-session volatility, last year" sub={`Annualised, each day's last 20 sessions · against the 1-year level ${pctU(r!.stock.vol1y.pct)}`} zoom={`${r!.symbol} 20-session volatility`} base={260}
            legend={<><span><i className="sw rsk-sw-roll" /> 20 sessions</span><span><i className="sw rsk-sw-level" /> 1-year level</span></>}>
            {(w, h) => <RollingChart r={r!} w={w} h={h} />}</Panel>
          <Panel title="One-day returns, last year" sub={windowLine(r!.stock.tail.window)} zoom={`${r!.symbol} one-day returns`} base={260}
            legend={<><span><i className="sw rsk-sw-tail" /> the worst 5% of days</span><span>red dashed: VaR · dotted: expected shortfall, at 95% and 99%</span></>}>
            {(w, h) => <ReturnHistogram r={r!} w={w} h={h} />}</Panel>
          {r!.beta && r!.pairs ? <Panel title="Against the Nifty 50" sub={`Each day: Nifty 50 across, ${r!.symbol} up · ${windowLine(r!.beta.window)}`} zoom={`${r!.symbol} against the Nifty 50`} base={300}
            legend={<><span><i className="sw rsk-sw-dot" /> one day</span><span><i className="sw rsk-sw-fit" /> fitted line, slope = beta {num(r!.beta.value)}</span></>}>
            {(w, h) => <BetaScatter r={r!} w={w} h={h} />}</Panel>
            : <div className="rsk-panel"><div className="rsk-ph"><h3>Against the Nifty 50</h3></div><p className="muted">Nifty 50 closes are not stored, so the days cannot be compared.</p></div>}
        </div>
      </>}
      <p className="rsk-note" role="note">{ok ? r!.note : NOTE}</p>
      <details className="oflow-how"><summary>How it is worked out</summary><div className="muted oflow-method rsk-method">
        <p>From stored daily closes: the stock's exchange daily candles (Dhan, NSE first) or, when those are missing or older, FinLit's stored daily prices; the Nifty 50's daily closes from FinLit's index store. No live call is made. One year is 252 sessions, three years 756; when fewer are stored the window says so, and a 1- or 3-year figure from fewer than 200 daily returns is marked short.</p>
        <p><b>Volatility</b>: the sample standard deviation of daily log returns ln(close ÷ previous close), × √252, over the last 20 and the last 252 returns; the ratio is the first over the second.</p>
        <p><b>Deepest fall</b>: each day's close against the highest close so far; the lowest point is the low, the high before it the high, and the first later close at or above that high the recovery.</p>
        <p><b>VaR and expected shortfall</b>: historical, one day, from the last 252 simple daily returns sorted from the worst. With n returns, k = n × 5% (or 1%) rounded up; VaR is the k-th worst loss, expected shortfall the average of the k worst. Per ₹1 lakh held = the loss × ₹1,00,000.</p>
        <p><b>Sortino</b>: the mean daily return ÷ the downside deviation √(mean of min(return, 0)²), × √252, with 0 as the minimum acceptable return. <b>Calmar</b>: the compounded yearly return (last ÷ first close)^(252 ÷ returns) − 1 ÷ the depth of the deepest fall in the same window.</p>
        <p><b>Beta and correlation</b>: on the days both the stock and the Nifty 50 have a close in the last year, the returns from one shared day to the next; beta = covariance ÷ the Nifty 50's variance (the slope of the fitted line), correlation = covariance ÷ both standard deviations. The days only one side has are counted, never filled in.</p>
        <p>A one-day move of 30% or more is named: if it was a split or bonus the stored prices do not adjust for, the figures that include it overstate the swings.</p>
      </div></details>
    </section>
  );
}
