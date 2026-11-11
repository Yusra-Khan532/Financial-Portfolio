import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, createChart, type IChartApi, type MouseEventParams, type Time } from "lightweight-charts";
import { usePrice } from "../../lib/api";
import { useFocusTrap } from "../../lib/focusTrap";
import { CoLogo } from "../CoLogo";
import "../../styles/chartpanel.css";

/** The chart that opens from a row of the stock screeners: candles, volume and the 50- and 200-day averages, from the site's own price data.
 *  Drawn with TradingView Lightweight Charts 5.0.9 (Apache 2.0; the licence is in public/licenses). It sits beside the table, not over it:
 *  the list stays usable and Esc or × closes it. */
const RANGES = ["1M", "6M", "1Y", "3Y", "5Y"] as const;
type Range = (typeof RANGES)[number];
const KEY = "fl.chart.v1";
const read = (): { range: Range; ema50: boolean; ema200: boolean; log: boolean } => {
  const d = { range: "6M" as Range, ema50: true, ema200: true, log: false };
  try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return { ...d, ...(RANGES.includes(o.range) ? { range: o.range } : {}), ema50: o.ema50 !== false, ema200: o.ema200 !== false, log: o.log === true }; } catch { return d; }
};
const num = (n: number | null | undefined, d = 2) => (n == null ? "–" : n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
const css = (v: string, fb: string) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb; } catch { return fb; } };

export type PanelRow = { symbol: string; name?: string | null; sector?: string | null; price?: number | null };

export function ChartPanel({ row, onClose }: { row: PanelRow; onClose: () => void }) {
  const [opt, setOpt] = useState(read);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch { /* private window */ } }, [opt]);
  const q = usePrice(row.symbol, opt.range);
  const box = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), chart = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<string | null>(null);
  useFocusTrap(box, false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const s = q.data?.series;
  const bars = useMemo(() => {
    if (!s) return [];
    return s.t.map((t, i) => {
      const c = s.c[i], o = s.o?.[i] ?? c, h = s.h?.[i] ?? Math.max(o ?? 0, c ?? 0), l = s.l?.[i] ?? Math.min(o ?? 0, c ?? 0);
      return { t, o, h, l, c, v: s.v?.[i] ?? null, e50: s.ema50?.[i] ?? null, e200: s.ema200?.[i] ?? null };
    }).filter((b) => b.c != null && b.o != null) as { t: string; o: number; h: number; l: number; c: number; v: number | null; e50: number | null; e200: number | null }[];
  }, [s]);

  useEffect(() => {
    const el = host.current;
    if (!el || !bars.length) return;
    const up = css("--green", "#16a34a"), down = css("--red", "#dc2626"), text = css("--muted", "#6b7280"), grid = css("--line", "#e5e7eb");
    const c = createChart(el, {
      width: el.clientWidth, height: 360, autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, attributionLogo: true },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } }, crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: grid, mode: opt.log ? 1 : 0 }, timeScale: { borderColor: grid, rightOffset: 4 },
    });
    chart.current = c;
    const candles = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
    candles.setData(bars.map((b) => ({ time: b.t as Time, open: b.o, high: b.h, low: b.l, close: b.c })));
    const vol = c.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(bars.filter((b) => b.v != null).map((b) => ({ time: b.t as Time, value: b.v as number, color: (b.c >= b.o ? up : down) + "66" })));
    if (opt.ema50) c.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(bars.filter((b) => b.e50 != null).map((b) => ({ time: b.t as Time, value: b.e50 as number })));
    if (opt.ema200) c.addSeries(LineSeries, { color: "#6366f1", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(bars.filter((b) => b.e200 != null).map((b) => ({ time: b.t as Time, value: b.e200 as number })));
    c.timeScale().fitContent();
    const byDay = new Map(bars.map((b, i) => [b.t, i]));
    const show = (p: MouseEventParams<Time>) => {
      const i = p.time != null ? byDay.get(String(p.time)) : bars.length - 1;
      const b = i == null ? null : bars[i];
      if (!b) { setLegend(null); return; }
      const prev = i != null && i > 0 ? bars[i - 1].c : null;
      const ch = prev ? ((b.c / prev - 1) * 100) : null;
      setLegend(`${b.t}  O ${num(b.o)}  H ${num(b.h)}  L ${num(b.l)}  C ${num(b.c)}${ch != null ? `  ${ch >= 0 ? "+" : ""}${num(ch)}%` : ""}${b.v != null ? `  Vol ${num(b.v, 0)}` : ""}`);
    };
    c.subscribeCrosshairMove(show);
    show({} as MouseEventParams<Time>);
    return () => { c.remove(); chart.current = null; };
  }, [bars, opt.ema50, opt.ema200, opt.log]);

  const last = bars[bars.length - 1], first = bars[0];
  const chg = last && first ? (last.c / first.c - 1) * 100 : null;
  const tog = (k: "ema50" | "ema200" | "log") => setOpt((o) => ({ ...o, [k]: !o[k] }));
  return (
    <aside className="cp" ref={box} role="complementary" aria-label={`${row.name || row.symbol} chart`}>
      <header className="cp-h">
        <CoLogo symbol={row.symbol} name={row.name} size={32} />
        <div className="cp-t"><b>{row.name || row.symbol}</b><small>{row.symbol}{row.sector ? ` · ${row.sector}` : ""}</small></div>
        <button type="button" className="cp-x" onClick={onClose} aria-label="Close chart">×</button>
      </header>
      <div className="cp-p"><b>₹{num(last?.c ?? row.price)}</b>{chg != null && <span className={chg >= 0 ? "up" : "dn"}>{chg >= 0 ? "+" : ""}{num(chg)}% in {opt.range}</span>}</div>
      <div className="cp-bar" role="group" aria-label="Chart range and lines">
        {RANGES.map((r) => <button type="button" key={r} className={opt.range === r ? "on" : ""} aria-pressed={opt.range === r} onClick={() => setOpt((o) => ({ ...o, range: r }))}>{r}</button>)}
        <span className="cp-gap" />
        <button type="button" className={opt.ema50 ? "on" : ""} aria-pressed={opt.ema50} onClick={() => tog("ema50")}>50-day</button>
        <button type="button" className={opt.ema200 ? "on" : ""} aria-pressed={opt.ema200} onClick={() => tog("ema200")}>200-day</button>
        <button type="button" className={opt.log ? "on" : ""} aria-pressed={opt.log} onClick={() => tog("log")}>Log</button>
      </div>
      <div className="cp-leg" aria-live="off">{legend || " "}</div>
      <div className="cp-c" ref={host}>
        {q.isLoading && <p className="cp-m">Loading the chart…</p>}
        {!q.isLoading && !bars.length && <p className="cp-m">{q.isError ? "The chart could not be loaded." : "No price history yet for this company."}{q.isError && <button type="button" className="btn" onClick={() => q.refetch()}>Try again</button>}</p>}
      </div>
      <p className="cp-f">Charts help you study a company; they are not advice to buy or sell. Charts by TradingView Lightweight Charts™, Copyright (c) 2025 TradingView, Inc.</p>
      <Link className="btn primary cp-r" to={`/stocks/${row.symbol}`}>Open full report</Link>
    </aside>
  );
}
