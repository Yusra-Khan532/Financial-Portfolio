import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers, type IChartApi, type MouseEventParams, type Time } from "lightweight-charts";
import { apiGet, usePrice } from "../../lib/api";
import { useQuery } from "@tanstack/react-query";
import { useFocusTrap } from "../../lib/focusTrap";
import { CoLogo } from "../CoLogo";
import "../../styles/chartpanel.css";

/** The chart that opens from a row of the stock screeners: candles, volume and the 50- and 200-day averages, from the site's own price data.
 *  Drawn with TradingView Lightweight Charts 5.0.9 (Apache 2.0; the licence is in public/licenses). It sits beside the table, not over it:
 *  the list stays usable and Esc or × closes it. */
const RANGES = ["1M", "6M", "1Y", "3Y", "5Y"] as const;
type Range = (typeof RANGES)[number];
const KEY = "fl.chart.v1";
const read = (): { range: Range; ema50: boolean; ema200: boolean; log: boolean; bench: boolean; events: boolean } => {
  const d = { range: "6M" as Range, ema50: true, ema200: true, log: false, bench: false, events: true };
  try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return { ...d, ...(RANGES.includes(o.range) ? { range: o.range } : {}), ema50: o.ema50 !== false, ema200: o.ema200 !== false, log: o.log === true, bench: o.bench === true, events: o.events !== false }; } catch { return d; }
};
const num = (n: number | null | undefined, d = 2) => (n == null ? "–" : n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
const css = (v: string, fb: string) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb; } catch { return fb; } };

/** What a chart-pattern scan found, as the server words it: facts ([label, value]) and the drawing (level, box, pole, swings, bar, dates already worked out). The page never sees a rule. */
export type Draw = { level?: number; from?: string | null; box?: { from: string | null; to: string | null; low: number; high: number }; pole?: { from: string | null; low: number; to: string | null; high: number };
  swings?: { date: string | null; price: number; kind: string }[]; bar?: string | null; ema?: number };
export type PanelRow = { symbol: string; name?: string | null; sector?: string | null; price?: number | null; facts?: [string, string | null][]; draw?: Draw; screen?: string };

export function ChartPanel({ row, onClose }: { row: PanelRow; onClose: () => void }) {
  const [opt, setOpt] = useState(read);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch { /* private window */ } }, [opt]);
  const q = usePrice(row.symbol, opt.range);
  const box = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), chart = useRef<IChartApi | null>(null);
  const [legend, setLegend] = useState<string | null>(null);
  useFocusTrap(box, false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const bq = useQuery<{ rows: { d: string; c: number }[] }, Error>({ queryKey: ["nif500-for-chart"], queryFn: () => apiGet("/api/indices/NIF500/history"), enabled: opt.bench, staleTime: 3_600_000, retry: 0 });
  const eq = useQuery<{ actions: { date: string; type: string; title: string }[] }, Error>({ queryKey: ["events-for-chart", row.symbol], queryFn: () => apiGet(`/api/stocks/${encodeURIComponent(row.symbol)}/events`), enabled: opt.events, staleTime: 3_600_000, retry: 0 });
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
    if (opt.bench && bq.data?.rows?.length) {          // NIFTY 500 on the same days, drawn as the same starting level so the two can be compared by eye
      const first = bars[0], byDate = new Set(bars.map((b) => b.t)), from = bq.data.rows.find((r) => r.d >= first.t);
      if (from) c.addSeries(LineSeries, { color: "#0ea5e9", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "NIFTY 500 (scaled)" })
        .setData(bq.data.rows.filter((r) => r.d >= first.t && byDate.has(r.d)).map((r) => ({ time: r.d as Time, value: (r.c / from.c) * first.c })));
    }
    if (opt.events && eq.data?.actions?.length) {
      const days = new Set(bars.map((b) => b.t));
      const mk = eq.data.actions.filter((a) => days.has(a.date)).map((a) => ({ time: a.date as Time, position: "aboveBar" as const, color: "#b8892b", shape: "circle" as const, text: /dividend/i.test(a.type) ? "D" : /bonus/i.test(a.type) ? "B" : /split/i.test(a.type) ? "S" : /right/i.test(a.type) ? "Rt" : "" })).filter((m) => m.text);
      if (mk.length) createSeriesMarkers(candles, mk.sort((a, b) => String(a.time).localeCompare(String(b.time))));
    }
    const dr = row.draw;
    if (dr) {
      const line = (price: number, title: string, color: string) => candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
      if (dr.level != null) line(dr.level, "Pivot", "#b8892b");
      if (dr.box) { line(dr.box.high, "Top of base", "#6366f1"); line(dr.box.low, "Bottom of base", "#6366f1"); }
      if (dr.pole) { line(dr.pole.high, "Run-up high", "#16a34a"); }
      if (dr.swings && dr.swings.length > 1) {
        const pts = dr.swings.filter((w) => w.date).map((w) => ({ time: w.date as Time, value: w.price }));
        if (pts.length > 1) c.addSeries(LineSeries, { color: "#a855f7", lineWidth: 2, priceLineVisible: false, lastValueVisible: false }).setData(pts);
      }
      if (dr.bar) createSeriesMarkers(candles, [{ time: dr.bar as Time, position: "belowBar", color: "#b8892b", shape: "arrowUp", text: "" }]);
    }
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
  }, [bars, opt.ema50, opt.ema200, opt.log, opt.bench, opt.events, bq.data, eq.data, row.draw]);

  const last = bars[bars.length - 1], first = bars[0];
  const chg = last && first ? (last.c / first.c - 1) * 100 : null;
  const tog = (k: "ema50" | "ema200" | "log" | "bench" | "events") => setOpt((o) => ({ ...o, [k]: !o[k] }));
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
        <button type="button" className={opt.bench ? "on" : ""} aria-pressed={opt.bench} onClick={() => tog("bench")}>vs NIFTY 500</button>
        <button type="button" className={opt.events ? "on" : ""} aria-pressed={opt.events} onClick={() => tog("events")} title="D dividend, B bonus, S split, Rt rights">Events</button>
      </div>
      {!!row.facts?.length && <dl className="cp-facts" aria-label="What the chart shows">{row.facts.filter(([, v]) => v != null).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
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
