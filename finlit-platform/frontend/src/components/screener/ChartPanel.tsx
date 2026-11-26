import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { BarSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, PriceScaleMode, createChart, createSeriesMarkers,
  type IChartApi, type ISeriesApi, type ISeriesPrimitive, type MouseEventParams, type SeriesType, type Time } from "lightweight-charts";
import { apiGet, useSection, usePrice, type Peers } from "../../lib/api";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useFocusTrap } from "../../lib/focusTrap";
import { useThemeKey } from "../../lib/ui";
import { CoLogo } from "../CoLogo";
import { ScoreChip, prismParts, scoreView, usePlanModel, usePlanPrism } from "../../lib/planScore";
import "../../styles/chartpanel.css";
import { DISC_EVENTS, type DiscEvent, type DiscLatest } from "../../lib/presets";
import { themePath } from "../../discovery/model";
import { dateIN } from "../../lib/format";
import { EVENT_KEY, axisPrice, behindNote, changeTo, datedWeeks, eventLetter, factValue, factsHeading, levelTitle, legendHead, lineLabel, listClose, singleMark, todayIST, volumeLine, weekOf, weeklyEmas, type Bar } from "./chartPanelParts";

/** The chart that opens from a row of the stock screeners, built to the 11 Nov design: candles, bars or a line, daily or weekly, volume in its own pane, an Indicators menu
 *  (EMA 9/20/50/200, SMA 10/20/50, volume average, highest volume in 3 months, strength against NIFTY 500, events, the pattern), Compare, Measure and a reset.
 *  Drawn with TradingView Lightweight Charts 5.0.9 (Apache 2.0; the licence is in public/licenses). It sits beside the table, not over it: the list stays usable and Esc or × closes it. */
const RANGES = ["1M", "6M", "1Y", "3Y", "5Y", "MAX"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The time axis: a tick that falls on a day of the month reads "3 Nov", not a bare "3" (years and months keep the chart's own labels). */
const dayTick = (time: unknown, type: number): string | null => {
  if (type !== 2) return null;
  let m = 0, d = 0;
  if (typeof time === "number") { const t = new Date(time * 1000); m = t.getUTCMonth() + 1; d = t.getUTCDate(); }
  else if (typeof time === "string") { const [, mm, dd] = time.split("-").map(Number); m = mm; d = dd; }
  else if (time && typeof time === "object") { const b = time as { month: number; day: number }; m = b.month; d = b.day; }
  return m >= 1 && m <= 12 && d ? `${d} ${MONTHS[m - 1]}` : null;
};
type Range = (typeof RANGES)[number];
type Mode = "candles" | "bars" | "line";
type Ind = { ema9: boolean; ema20: boolean; ema50: boolean; ema200: boolean; sma10: boolean; sma20: boolean; sma50: boolean; volAvg: boolean; hiVol: boolean; rs: boolean; events: boolean; draw: boolean };
type Cmp = { nifty: boolean; peers: string[] };
const KEY = "fl.chart.v2", IND_KEY = "fl.chart.ind";
/** Task #394 (W3): each line is named by its unit where it is shown ("50-day EMA", "50-week SMA" on weekly candles), from src and n (lineLabel). */
const LINES: { k: keyof Ind; color: string; src: "ema" | "sma"; n: number }[] = [
  { k: "ema9", color: "#06b6d4", src: "ema", n: 9 }, { k: "ema20", color: "#ec4899", src: "ema", n: 20 },
  { k: "ema50", color: "#f59e0b", src: "ema", n: 50 }, { k: "ema200", color: "#6366f1", src: "ema", n: 200 },
  { k: "sma10", color: "#14b8a6", src: "sma", n: 10 }, { k: "sma20", color: "#84cc16", src: "sma", n: 20 }, { k: "sma50", color: "#f97316", src: "sma", n: 50 },
];
const BASE_COLOR = LINES[3].color;   // the base box and its marks share the 200-day line's indigo, as before
const PEER_COLORS = ["#8b5cf6", "#ef4444", "#10b981"], NIFTY_COLOR = "#0ea5e9";
const OFF: Ind = { ema9: false, ema20: false, ema50: false, ema200: false, sma10: false, sma20: false, sma50: false, volAvg: false, hiVol: false, rs: false, events: true, draw: true };
/** The lines a screen opens with: 9-day for "Consolidating above the 9 EMA", 20-day for "Closed above the 52-week high, then eased back", otherwise 50 and 200. */
export const defaultIndicators = (screen?: string): Ind => /ema9/.test(screen || "") ? { ...OFF, ema9: true } : /breakout-pullback/.test(screen || "") ? { ...OFF, ema20: true } : { ...OFF, ema50: true, ema200: true };
const readOpt = (): { range: Range; mode: Mode; weekly: boolean; log: boolean } => {
  const d = { range: "6M" as Range, mode: "candles" as Mode, weekly: false, log: false };
  try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return { range: RANGES.includes(o.range) ? o.range : d.range, mode: ["candles", "bars", "line"].includes(o.mode) ? o.mode : d.mode, weekly: o.weekly === true, log: o.log === true }; } catch { return d; }
};
const readInd = (screen?: string): Ind => {   // the reader's choice for this session, else the screen's default
  try { const o = JSON.parse(sessionStorage.getItem(IND_KEY) || "null"); if (o) return { ...OFF, ...o }; } catch { /* private window */ }
  return defaultIndicators(screen);
};
export const num = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "–" : n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
const css = (v: string, fb: string) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb; } catch { return fb; } };
const palette = () => ({ up: css("--gain", "#16a34a"), down: css("--loss", "#dc2626"), text: css("--muted", "#6b7280"), line: css("--border", "#e5e7eb"), strong: css("--border-strong", "#9ca3af"), fg: css("--text", "#111"), bg: css("--s1", "#fff"), gold: css("--gold", "#b8892b") });

/** What a chart-pattern scan found, as the server words it: facts ([label, value]) and the drawing (level, box, pole, swings, bar, dates already worked out). The page never sees a rule. */
export type Draw = { level?: number; from?: string | null; box?: { from: string | null; to: string | null; low: number; high: number }; pole?: { from: string | null; low: number; to: string | null; high: number };
  swings?: { date: string | null; price: number; kind: string }[]; bar?: string | null; ema?: number; /** task #394 (C4): the level's name, "Level" or "Pivot" */ levelLabel?: string | null };
export type PanelRow = { symbol: string; name?: string | null; sector?: string | null; price?: number | null; facts?: [string, string | null][]; draw?: Draw; screen?: string;
  /** Task #325 (file 25, section 4): on Emerging tech, what Discover knows of the company. */ disc?: PanelDisc | null;
  /** Task #394 (file 37): the list's day (the screen's asOf), the row's official close of that day (price_on) and the day "What the chart shows" is worked
   *  out from (factsAsOf, sent by the server when it has it). Each is optional: without them the panel reads as before. */
  listDay?: string | null; priceOn?: number | null; factsAsOf?: string | null };
export type PanelDisc = { placed: boolean; stage?: string | null; themes?: string[]; ev?: Partial<Record<DiscEvent, number>>; latest?: DiscLatest | null };

/** Task #325 (file 25, section 4, screenshot 03): the chart panel's "From Discover" block: themes, stage, counts of the four filing kinds over 90 days,
 *  the latest of them, and the way to the company on Discover. A company with no presentation on file says Discover has not placed it. */
export function DiscBlock({ d, name }: { d: PanelDisc; name: string }) {
  if (!d.placed) return <div className="cp-disc" aria-label="From Discover"><b>From Discover</b><p>No investor presentation on file yet, so Discover has not placed this company.</p></div>;
  const main = d.themes?.[0];
  return (
    <div className="cp-disc" aria-label="From Discover"><b>From Discover</b>
      <dl className="cp-facts">
        {!!d.themes?.length && <div><dt>{d.themes.length === 1 ? "Theme" : "Themes"}</dt><dd>{d.themes.join(", ")}</dd></div>}
        <div><dt>Stage it describes</dt><dd>{d.stage || "Not stated"}</dd></div>
        <div><dt>Filings, 90 days</dt><dd>{DISC_EVENTS.map(([k, l]) => `${l} ${d.ev?.[k] ?? 0}`).join(" · ")}</dd></div>
        <div><dt>Latest filing</dt><dd>{d.latest ? <>{d.latest.el}, {dateIN(d.latest.d)}: {d.latest.l ? <a href={d.latest.l} target="_blank" rel="noreferrer noopener">{d.latest.t}</a> : d.latest.t}</> : "None of these kinds in 90 days"}</dd></div>
      </dl>
      {main && <Link className="cp-dlink" to={`${themePath(main)}?q=${encodeURIComponent(name)}`}>Open in Discover ›</Link>}
    </div>);
}

/** The day of a candle as "20 Nov" (QA 23 Nov: the panel's price had no date, so a chart a close or two behind the list read as a wrong price). */
export const candleDay = (t: string): string => { const d = new Date(`${String(t).slice(0, 10)}T00:00:00Z`); return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }); };

/** Weekly candles from daily bars: first open, highest high, lowest low, last close, the week's volume, dated on the last trading day. */
export function toWeekly(b: Bar[]): Bar[] {
  const out: Bar[] = []; let key = "";
  for (const x of b) {
    const d = new Date(x.t + "T00:00:00Z"), mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
    const w = out[out.length - 1];
    if (mon === key && w) { w.h = w.h != null && x.h != null ? Math.max(w.h, x.h) : null; w.l = w.l != null && x.l != null ? Math.min(w.l, x.l) : null; w.c = x.c; w.t = x.t; w.v = w.v != null && x.v != null ? w.v + x.v : w.v ?? x.v; w.e = x.e; }
    else { out.push({ ...x, e: x.e }); key = mon; }
  }
  return out;
}
const smaOf = (c: number[], n: number) => c.map((_, i) => (i + 1 < n ? null : c.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n));

/** The shaded base of a pattern: a box between two dates and two prices, drawn behind the candles. */
class BoxPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi; private series: ISeriesApi<SeriesType>; private box: { x1: Time; x2: Time; low: number; high: number }; private color: string; 
  constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, box: { x1: Time; x2: Time; low: number; high: number }, color: string) { this.chart = chart; this.series = series; this.box = box; this.color = color; }
    paneViews() {
    const self = this;
    return [{ zOrder: () => "bottom" as const, renderer: () => ({ draw: (target: { useBitmapCoordinateSpace: (f: (s: { context: CanvasRenderingContext2D; horizontalPixelRatio: number; verticalPixelRatio: number }) => void) => void }) => {
      const ts = self.chart.timeScale(), x1 = ts.timeToCoordinate(self.box.x1), x2 = ts.timeToCoordinate(self.box.x2), y1 = self.series.priceToCoordinate(self.box.high), y2 = self.series.priceToCoordinate(self.box.low);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return;
      target.useBitmapCoordinateSpace(({ context: g, horizontalPixelRatio: hx, verticalPixelRatio: vy }) => {
        g.fillStyle = self.color + "26"; g.strokeStyle = self.color; g.lineWidth = Math.max(1, hx);
        const x = Math.min(x1, x2) * hx, y = Math.min(y1, y2) * vy, w = Math.abs(x2 - x1) * hx, h = Math.abs(y2 - y1) * vy;
        g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h);
      });
    } }) }];
  }
}

/** `inline` (task #325, List + chart): the panel sits beside the list instead of over the page; it has no close button, keeps no focus trap, and Escape does not
 *  close it. Up and down arrows still move through the list. */
export function ChartPanel({ row, onClose, onStep, extra, inline = false, onChartEnd }: { row: PanelRow; onClose: () => void; onStep?: (dir: 1 | -1) => void; extra?: React.ReactNode; inline?: boolean;
  /** task #394 (C11): told the day of this company's last daily candle once the chart has it, so the list can mark a row whose chart is behind */ onChartEnd?: (symbol: string, day: string) => void }) {
  const [opt, setOpt] = useState(readOpt);
  const [ind, setInd] = useState(() => readInd(row.screen));
  const [cmp, setCmp] = useState<Cmp>({ nifty: false, peers: [] });
  const [menu, setMenu] = useState<null | "ind" | "cmp">(null);
  const [measure, setMeasure] = useState<{ on: boolean; a: { t: string; p: number } | null; out: string | null }>({ on: false, a: null, out: null });
  const [log, setLog] = useState(opt.log);
  const model = usePlanModel();                                  // task #283: FinLit Prism for plans that have it; no score otherwise
  const prismMap = usePlanPrism(useMemo(() => [row.symbol], [row.symbol]), model);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ ...opt, log })); } catch { /* private window */ } }, [opt, log]);
  const touch = (n: Ind) => { setInd(n); try { sessionStorage.setItem(IND_KEY, JSON.stringify(n)); } catch { /* private window */ } };
  const theme = useThemeKey();
  // W2 (task #394): 3Y and 5Y come as weekly candles. When the server says it can send them daily (dailyAvailable), D asks for ?grain=daily; weekly stays the default there.
  const [longDaily, setLongDaily] = useState(false);
  const qRange = usePrice(row.symbol, opt.range);
  const dailyAvail = qRange.data?.grain === "weekly" && qRange.data?.dailyAvailable === true;
  const qDaily = usePrice(row.symbol, opt.range, dailyAvail && longDaily, "daily");
  const q = dailyAvail && longDaily ? qDaily : qRange;
  const q6 = usePrice(row.symbol, "6M");
  const peers = useSection<Peers>(row.symbol, "peers", menu === "cmp" || cmp.peers.length > 0).data;
  const box = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), chart = useRef<IChartApi | null>(null), main = useRef<ISeriesApi<SeriesType> | null>(null);
  const [legend, setLegend] = useState<string[]>([]);
  useFocusTrap(box, false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (menu) setMenu(null); else if (!inline) onClose(); return; }
      const t = e.target as HTMLElement | null;
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && onStep && !(t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) { e.preventDefault(); onStep(e.key === "ArrowDown" ? 1 : -1); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose, onStep, menu, inline]);
  useEffect(() => { if (!menu) return; const d = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".cp-menu")) setMenu(null); }; document.addEventListener("mousedown", d); return () => document.removeEventListener("mousedown", d); }, [menu]);

  const needBench = cmp.nifty || ind.rs;
  const bq = useQuery<{ rows: { d: string; c: number }[] }, Error>({ queryKey: ["nif500-for-chart"], queryFn: () => apiGet("/api/indices/NIF500/history"), enabled: needBench, staleTime: 3_600_000, retry: 0 });
  const eq = useQuery<{ actions: { date: string; type: string; title: string }[] }, Error>({ queryKey: ["events-for-chart", row.symbol], queryFn: () => apiGet(`/api/stocks/${encodeURIComponent(row.symbol)}/events`), enabled: ind.events, staleTime: 3_600_000, retry: 0 });
  const pq = useQueries({ queries: cmp.peers.map((p) => ({ queryKey: ["peer-price", p, opt.range], queryFn: () => apiGet<{ series: { t: string[]; c: number[] } }>(`/api/stocks/${encodeURIComponent(p)}/price?range=${opt.range}`), staleTime: 3_600_000, retry: 0 })) });

  const s = q.data?.series;
  const daily = useMemo<Bar[]>(() => {
    if (!s) return [];
    return s.t.map((t, i) => ({ t, o: s.o?.[i] ?? null, h: s.h?.[i] ?? null, l: s.l?.[i] ?? null, c: s.c[i], v: s.v?.[i] ?? null,
      e: { ema9: s.ema9?.[i] ?? null, ema20: s.ema20?.[i] ?? null, ema50: s.ema50?.[i] ?? null, ema200: s.ema200?.[i] ?? null } })).filter((b) => b.c != null);
  }, [s]);
  const grain = q.data?.grain ?? "daily";
  const canDaily = grain === "daily", weekly = !canDaily || opt.weekly;     // 3Y and 5Y arrive as weekly candles from the server; daily only when it says so (W2)
  // the daily candle days the panel holds: this range's when daily, else the 6-month answer's (always daily). They count each week's sessions (W4) and date it (W5).
  const s6 = q6.data?.grain === "daily" ? q6.data.series : undefined;
  const dailyDays = useMemo(() => (canDaily && s ? s.t : s6?.t ?? []), [canDaily, s, s6]);
  // Task #394 (QA of 26 Nov 2026): on weekly candles the lines are WEEKLY averages, worked out on the company's whole weekly history (the MAX chart)
  // and read on each week shown; the daily EMA read at a week's end (the same figure as the daily view) is never shown on a weekly chart.
  const qMax = usePrice(row.symbol, "MAX", weekly);
  const maxSeries = qMax.data?.series;
  const wEma = useMemo(() => weeklyEmas(maxSeries), [maxSeries]);
  const bars = useMemo(() => {
    if (!weekly) return daily;
    const wk = datedWeeks(canDaily ? toWeekly(daily) : daily, dailyDays);
    const locked = !!s && s.ema200 === undefined;          // ema200 is removed from the response below Silver: none on weekly either
    return wk.map((b): Bar => { const e = wEma.get(weekOf(b.t)); return { ...b, e: { ema9: e?.ema9 ?? null, ema20: e?.ema20 ?? null, ema50: e?.ema50 ?? null, ema200: locked ? null : e?.ema200 ?? null } }; });
  }, [daily, canDaily, weekly, dailyDays, wEma, s]);
  const lastDaily = s6?.t?.length ? s6.t[s6.t.length - 1] : canDaily && s?.t?.length ? s.t[s.t.length - 1] : null;
  useEffect(() => { if (lastDaily && onChartEnd) onChartEnd(row.symbol, lastDaily); }, [lastDaily, onChartEnd, row.symbol]);
  // events drawn on the chart, worked out once for the marks, the legend and the key under the chart (C4)
  const evs = useMemo(() => {
    const acts = ind.events && bars.length ? eq.data?.actions ?? [] : [];
    return acts.filter((a) => a.date >= bars[0].t).map((a) => ({ a, d: bars.find((b) => b.t >= a.date)?.t ?? bars[bars.length - 1].t, txt: eventLetter(a.type) })).filter((x) => x.txt);
  }, [ind.events, bars, eq.data]);
  const hasOHL = bars.length > 0 && bars.every((b) => b.o != null && b.h != null && b.l != null);
  const mode: Mode = bars.length > 0 && !hasOHL ? "line" : opt.mode;   // while the chart loads the chosen kind stays selected (it is not a line chart yet)                 // a bar with no open, high or low is never drawn as a dot: the chart falls back to a line
  const hasLock = (k: "ema200") => !!s && s[k] === undefined;      // ema200 is removed from the response below Silver

  const compareOn = cmp.nifty || cmp.peers.length > 0;
  const lastBar = bars[bars.length - 1];

  const build = useCallback(() => {
    const el = host.current;
    if (!el || !bars.length) return () => undefined;
    const pal = palette();
    const c = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: pal.text, attributionLogo: false, panes: { enableResize: true, separatorColor: pal.line, separatorHoverColor: pal.strong } },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } }, crosshair: { mode: CrosshairMode.Normal, vertLine: { color: pal.strong, labelBackgroundColor: pal.strong }, horzLine: { color: pal.strong, labelBackgroundColor: pal.strong } },
      rightPriceScale: { borderColor: pal.line, mode: compareOn ? PriceScaleMode.Percentage : log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal },
      timeScale: { borderColor: pal.line, rightOffset: 4, minimumHeight: 28, fixLeftEdge: true, tickMarkFormatter: dayTick },     // C7: no empty slots left of the first candle
    });
    chart.current = c;
    const T = (t: string) => t as Time;
    const pf = compareOn ? {} : { priceFormat: { type: "custom" as const, formatter: axisPrice, minMove: 0.01 } };   // C3: "14,000", not "14000.00"; the volume scale keeps K and M
    let m: ISeriesApi<SeriesType>;
    if (mode === "line") { m = c.addSeries(LineSeries, { ...pf, color: pal.up, lineWidth: 2, priceLineStyle: LineStyle.Dashed, title: compareOn ? row.symbol : "" }); m.setData(bars.map((b) => ({ time: T(b.t), value: b.c }))); }
    else if (mode === "bars") { m = c.addSeries(BarSeries, { ...pf, upColor: pal.up, downColor: pal.down, priceLineStyle: LineStyle.Dashed, title: compareOn ? row.symbol : "" }); m.setData(bars.map((b) => ({ time: T(b.t), open: b.o as number, high: b.h as number, low: b.l as number, close: b.c }))); }
    else { m = c.addSeries(CandlestickSeries, { ...pf, upColor: pal.up, downColor: pal.down, borderUpColor: pal.up, borderDownColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down, priceLineStyle: LineStyle.Dashed, title: compareOn ? row.symbol : "" }); m.setData(bars.map((b) => ({ time: T(b.t), open: b.o as number, high: b.h as number, low: b.l as number, close: b.c }))); }
    main.current = m;

    // volume in pane 1 (its divider drags), with the 20-bar average and the highest-volume-in-3-months bars in blue
    let pane = 1;
    const vols = bars.map((b) => b.v);
    if (vols.some((v) => v != null)) {
      const vol = c.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, pane);
      const lookback = weekly ? 13 : 63;
      vol.setData(bars.filter((b) => b.v != null).map((b, i, arr) => {
        const hi = ind.hiVol && arr.slice(Math.max(0, i - lookback + 1), i + 1).every((x) => (x.v as number) <= (b.v as number));
        return { time: T(b.t), value: b.v as number, color: hi ? "#2563eb" : (b.c >= (b.o ?? b.c) ? pal.up : pal.down) + "99" };
      }));
      if (ind.volAvg) {
        const vs = vols.map((v) => v ?? 0), avg = smaOf(vs, 20);
        c.addSeries(LineSeries, { color: pal.gold, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "Avg vol 20" }, pane).setData(bars.map((b, i) => ({ time: T(b.t), value: avg[i] })).filter((p) => p.value != null) as { time: Time; value: number }[]);
      }
      c.priceScale("right", pane).applyOptions({ mode: PriceScaleMode.Normal });     // the volume pane stays in numbers while the price pane is in percent
      pane += 1;
    }
    c.panes()[0]?.setStretchFactor(4);
    if (c.panes()[1]) c.panes()[1].setStretchFactor(1);

    const closes = bars.map((b) => b.c);
    for (const L of LINES) {
      if (!ind[L.k]) continue;
      const vals = L.src === "sma" ? smaOf(closes, L.n) : bars.map((b) => b.e[L.k] ?? null);
      c.addSeries(LineSeries, { color: L.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(bars.map((b, i) => ({ time: T(b.t), value: vals[i] })).filter((p) => p.value != null) as { time: Time; value: number }[]);
    }
    const days = new Set(bars.map((b) => b.t)), snap = (d: string | null | undefined) => (d ? (bars.find((b) => b.t >= d)?.t ?? bars[bars.length - 1].t) : null);
    const benchRows = (bq.data?.rows ?? []).filter((r) => days.has(r.d));
    if (cmp.nifty && benchRows.length) c.addSeries(LineSeries, { color: NIFTY_COLOR, lineWidth: 2, priceLineVisible: false, title: "NIFTY 500" }).setData(benchRows.map((r) => ({ time: T(r.d), value: r.c })));
    cmp.peers.forEach((p, i) => {
      const d = pq[i]?.data?.series; if (!d) return;
      c.addSeries(LineSeries, { color: PEER_COLORS[i % 3], lineWidth: 2, priceLineVisible: false, title: p }).setData(d.t.map((t, j) => ({ time: T(t), value: d.c[j] })).filter((x) => days.has(x.time as string) && x.value != null));
    });
    if (ind.rs && benchRows.length) {       // strength against NIFTY 500: the company's close divided by the index close, both from the first day shown, in its own pane
      const base = benchRows[0], byDay = new Map(bars.map((b) => [b.t, b.c])), first = byDay.get(base.d);
      if (first) c.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 2, priceLineVisible: false, title: "Strength vs NIFTY 500" }, pane)
        .setData(benchRows.filter((r) => byDay.has(r.d)).map((r) => ({ time: T(r.d), value: ((byDay.get(r.d) as number) / first) / (r.c / base.c) * 100 })));
      c.priceScale("right", pane).applyOptions({ mode: PriceScaleMode.Normal });
      c.panes()[pane]?.setStretchFactor(1);
    }
    type Mk = { time: Time; position: "aboveBar" | "belowBar"; color: string; shape: "circle" | "arrowUp" | "arrowDown"; text: string };
    const marks: Mk[] = evs.map((x) => ({ time: T(x.d), position: "aboveBar" as const, color: pal.gold, shape: "circle" as const, text: x.txt }));
    const dr = ind.draw ? row.draw : undefined;
    if (dr) {
      if (dr.level != null) m.createPriceLine({ price: dr.level, color: pal.gold, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: levelTitle(dr) });   // C4
      if (dr.box) {
        const a = snap(dr.box.from), b = snap(dr.box.to);
        if (a && b) m.attachPrimitive(new BoxPrimitive(c, m, { x1: T(a), x2: T(b), low: dr.box.low, high: dr.box.high }, BASE_COLOR));
        else { m.createPriceLine({ price: dr.box.high, color: BASE_COLOR, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Top of base" }); m.createPriceLine({ price: dr.box.low, color: BASE_COLOR, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Bottom of base" }); }
      }
      if (dr.pole) m.createPriceLine({ price: dr.pole.high, color: pal.up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Run-up high" });
      if (dr.swings && dr.swings.length > 1) {
        const pts = dr.swings.filter((w) => w.date).map((w) => ({ time: T(snap(w.date) as string), value: w.price }));
        if (pts.length > 1) c.addSeries(LineSeries, { color: "#a855f7", lineWidth: 2, priceLineVisible: false, lastValueVisible: false }).setData(pts);
      }
      else {      // C2: a single mark ("Close above" on Fresh close above a base, "Base low" on the bases) is drawn too, above or below its candle
        const one = singleMark(dr.swings, bars, el.clientWidth > 0 && el.clientWidth < 520, { level: pal.gold, base: BASE_COLOR });
        if (one) marks.push({ ...one, time: T(one.time) });
      }
      if (dr.bar) marks.push({ time: T(snap(dr.bar) as string), position: "belowBar", color: pal.gold, shape: "arrowUp", text: "" });
    }
    if (marks.length) createSeriesMarkers(m, marks.sort((a, b) => String(a.time).localeCompare(String(b.time))));
    const fit = () => {
      c.timeScale().fitContent();
      const pad = Math.max(2, Math.ceil(bars.length * 0.04));     // room left of the first bar, so the first label on the time axis ("2022") is not cut off
      c.timeScale().setVisibleLogicalRange({ from: -pad, to: bars.length - 1 + 4 });
    };
    fit();
    // C7: the chart refits when its box gets wider or narrower (the window or the panel is resized), so its left never stays empty
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") { let w = el.clientWidth; ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; fit(); } }); ro.observe(el); }

    // the legend at the pointer: the day and its prices, every line that is on with its value (named by unit, W3), the volume against its 50-day average (C5;
    // a weekly candle against full weeks, and none for a week in progress, W4), and the events of that day
    const idx = new Map(bars.map((b, i) => [b.t, i])), today = todayIST();
    const show = (p: MouseEventParams<Time>) => {
      const i = p.time != null ? idx.get(String(p.time)) : bars.length - 1;
      const b = i == null ? null : bars[i];
      if (!b || i == null) { setLegend([]); return; }
      const out = [legendHead(bars, i, weekly, today, num)];
      const ls = LINES.filter((L) => ind[L.k]).map((L) => { const v = L.src === "sma" ? smaOf(closes, L.n)[i] : b.e[L.k]; return v == null ? null : `${lineLabel(L.src, L.n, weekly)} ${num(v)}`; }).filter(Boolean) as string[];
      if (ls.length) out.push(ls.join(" · "));
      const vl = volumeLine(bars, i, weekly, today, s6 ? { t: s6.t, v: s6.v } : null); if (vl) out.push(vl);
      if (cmp.nifty && benchRows.length) { const r = benchRows.find((x) => x.d === b.t), f = benchRows[0]; if (r && f) out.push(`NIFTY 500 ${num((r.c / f.c - 1) * 100)}% since ${f.d}`); }
      const ev = evs.filter((x) => x.d === b.t).map((x) => x.a.title || x.a.type);     // C4: the event's name on its day
      if (ev.length) out.push(`Event: ${ev.join("; ")}`);
      setLegend(out);
    };
    c.subscribeCrosshairMove(show);
    show({} as MouseEventParams<Time>);
    c.subscribeClick((p) => {
      setMeasure((ms) => {
        if (!ms.on || p.time == null || !p.point || !main.current) return ms;
        const price = main.current.coordinateToPrice(p.point.y);
        if (price == null) return ms;
        const pt = { t: String(p.time), p: price as number };
        if (!ms.a) return { ...ms, a: pt, out: "Click the end point" };
        const i1 = idx.get(ms.a.t) ?? 0, i2 = idx.get(pt.t) ?? 0, ch = pt.p - ms.a.p, pc = (pt.p / ms.a.p - 1) * 100;
        return { on: false, a: null, out: `${ms.a.t} → ${pt.t}:  ${ch >= 0 ? "+" : ""}${num(pc)}%  ·  ${ch >= 0 ? "+" : "−"}₹${num(Math.abs(ch))}  ·  ${Math.abs(i2 - i1)} ${weekly ? "weeks" : "sessions"}` };
      });
    });
    return () => { ro?.disconnect(); c.remove(); chart.current = null; main.current = null; };
  // the chart is drawn again when the data, the view or the choices change; colour changes on a theme switch go through applyOptions below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, mode, weekly, log, ind, cmp, compareOn, bq.data, evs, row.draw, s6, pq.map((x) => x.dataUpdatedAt).join(",")]);
  useEffect(() => build(), [build]);

  // a theme switch while the panel is open: new colours through applyOptions, without redrawing or losing the zoom
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const c = chart.current, m = main.current; if (!c) return;
      const pal = palette();
      c.applyOptions({ layout: { textColor: pal.text, panes: { separatorColor: pal.line, separatorHoverColor: pal.strong } }, rightPriceScale: { borderColor: pal.line }, timeScale: { borderColor: pal.line },
        crosshair: { vertLine: { color: pal.strong, labelBackgroundColor: pal.strong }, horzLine: { color: pal.strong, labelBackgroundColor: pal.strong } } });
      if (m) m.applyOptions(mode === "line" ? { color: pal.up } as never : { upColor: pal.up, downColor: pal.down, borderUpColor: pal.up, borderDownColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down } as never);
    });
    return () => cancelAnimationFrame(id);
  }, [theme, mode]);

  const ret = (d: number) => {            // the change over the last 1 or 3 months, from the 6-month daily series
    const t = q6.data?.series?.t, c = q6.data?.series?.c; if (!t?.length || !c) return null;
    const end = new Date(t[t.length - 1] + "T00:00:00Z"); end.setUTCMonth(end.getUTCMonth() - d);
    const from = end.toISOString().slice(0, 10); let i = t.findIndex((x) => x >= from); if (i < 0 || (d === 3 && t[0] > from)) return null; if (i === 0 && t[0] > from) return null;
    return (c[c.length - 1] / c[i] - 1) * 100;
  };
  // C1: the list's official close of its day beside the chart (price_on), when the row has it and the day is one the chart can stand on; 1M and 3M then run to it
  const lc = listClose(row, s6?.t ?? []);
  const r1 = lc && s6 ? changeTo(s6.t, s6.c, lc.day, lc.price, 1) : ret(1), r3 = lc && s6 ? changeTo(s6.t, s6.c, lc.day, lc.price, 3) : ret(3);
  const note = behindNote(lastDaily, row.listDay, row.priceOn);      // F6
  const keyOn = EVENT_KEY.filter(([k]) => evs.some((x) => x.txt === k));    // C4: the key lists the letters drawn on the chart
  const prep = (q.failureReason as { status?: number } | null)?.status === 202 || (q.error as { status?: number } | null)?.status === 202;   // F7
  // the range's change runs from the first candle of the range as the server sends it, whatever D or W shows (QA 26 Nov 2026: 6M read +33.01% on D
  // and +28.13% on W, because the first weekly bar closes at the end of the range's first week)
  const first = daily[0] ?? bars[0], chg = lastBar && first ? (lastBar.c / first.c - 1) * 100 : null;
  const tog = (k: keyof Ind) => touch({ ...ind, [k]: !ind[k] });
  const reset = () => { touch(defaultIndicators(row.screen)); setCmp({ nifty: false, peers: [] }); setLog(false); setLongDaily(false); setOpt((o) => ({ ...o, mode: "candles", weekly: false })); setMeasure({ on: false, a: null, out: null }); chart.current?.timeScale().fitContent(); };
  const peerList = (peers?.symbols ?? []).filter((p) => p !== row.symbol).slice(0, 8);
  const pct = (v: number | null) => v == null ? null : <span className={v >= 0 ? "up" : "dn"}>{v >= 0 ? "+" : ""}{num(v)}%</span>;
  return (
    <aside className={"cp" + (inline ? " cp-inline" : "")} ref={box} role="complementary" aria-label={`${row.name || row.symbol} chart`}>
      <header className="cp-h">
        <CoLogo symbol={row.symbol} name={row.name} size={32} />
        <div className="cp-t"><b>{row.name || row.symbol}</b><small>{row.symbol}{row.sector ? ` · ${row.sector}` : ""}</small></div>
        {onStep && <span className="cp-nav" role="group" aria-label="Move between companies"><button type="button" onClick={() => onStep(-1)} aria-label="Previous company (up arrow)" title="Previous company (↑)">↑</button><button type="button" onClick={() => onStep(1)} aria-label="Next company (down arrow)" title="Next company (↓)">↓</button></span>}
        {!inline && <button type="button" className="cp-x" onClick={onClose} aria-label="Close chart">×</button>}
      </header>
      <div className="cp-p">{lc ? <><b>₹{num(lc.price)}</b><small className="cp-asof" title={`The list's official close of ${candleDay(lc.day)}, the same day as the list`}>{candleDay(lc.day)} close</small></>
        : <><b>₹{num(lastBar?.c ?? row.price)}</b>{!lastBar && row.price != null && <small className="cp-asof" title="The price in the list; the chart's close shows when it has loaded">list price</small>}{lastBar && <small className="cp-asof" title="The chart's last candle. The list beside it shows the latest close, which can be newer while this chart is refreshed.">close of {candleDay(lastBar.t)}</small>}</>}
        {r1 != null && <span title={lc ? `Change over the month to ${candleDay(lc.day)}` : "Change over the last month"}>1M {pct(r1)}</span>}{r3 != null && <span title={lc ? `Change over the 3 months to ${candleDay(lc.day)}` : "Change over the last 3 months"}>3M {pct(r3)}</span>}
        {chg != null && opt.range !== "1M" && <span className="cp-rng" title={`Change over the chart range (${opt.range})`}>{opt.range} {pct(chg)}</span>}
        {model && <ScoreChip className="cp-badge" v={scoreView(prismMap[row.symbol])} />}</div>
      {note && <p className="cp-note" role="note"><b>{note[0]}</b> {note[1]}</p>}
      {!!row.facts?.filter(([, v]) => v != null).length && <div className="cp-fbox" aria-label="What the chart shows"><b>{factsHeading(row.factsAsOf)}</b>
        <dl className="cp-facts">{row.facts.filter(([, v]) => v != null).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{factValue(k, v)}</dd></div>)}</dl></div>}
      <div className="cp-bar" role="group" aria-label="Chart range and tools">
        <span className="cp-seg" role="group" aria-label="Daily or weekly">
          <button type="button" className={!weekly ? "on" : ""} aria-pressed={!weekly} disabled={!canDaily && !dailyAvail} title={canDaily || dailyAvail ? "Daily candles" : "3 and 5 years are shown as weekly candles"} onClick={() => { if (dailyAvail) setLongDaily(true); setOpt((o) => ({ ...o, weekly: false })); }}>D</button>
          <button type="button" className={weekly ? "on" : ""} aria-pressed={weekly} onClick={() => { setLongDaily(false); setOpt((o) => ({ ...o, weekly: true })); }} title="Weekly candles">W</button></span>
        <span className="cp-seg" role="group" aria-label="Chart type">
          {(["candles", "bars", "line"] as Mode[]).map((m) => <button type="button" key={m} className={mode === m ? "on" : ""} aria-pressed={mode === m} disabled={m !== "line" && bars.length > 0 && !hasOHL} onClick={() => setOpt((o) => ({ ...o, mode: m }))}>{m[0].toUpperCase() + m.slice(1)}</button>)}</span>
        <span className="cp-seg" role="group" aria-label="Range">
          {RANGES.map((r) => <button type="button" key={r} className={opt.range === r ? "on" : ""} aria-pressed={opt.range === r} onClick={() => { setLongDaily(false); setOpt((o) => ({ ...o, range: r })); }}>{r}</button>)}</span>
      </div>
      <div className="cp-bar" role="group" aria-label="Lines, compare and measure">
        <span className="cp-menu"><button type="button" className={"cp-dd" + (menu === "ind" ? " on" : "")} aria-haspopup="true" aria-expanded={menu === "ind"} onClick={() => setMenu(menu === "ind" ? null : "ind")}>Indicators ▾</button>
          {menu === "ind" && <div className="cp-pop" role="group" aria-label="Indicators">
            {LINES.map((L) => { const lock = L.k === "ema200" && hasLock("ema200"); return <label key={L.k} className={lock ? "lk" : ""}><input type="checkbox" checked={ind[L.k] && !lock} disabled={lock} onChange={() => tog(L.k)} /><i style={{ background: L.color }} />{lineLabel(L.src, L.n, weekly)}{lock ? " (Silver)" : ""}</label>; })}
            <hr />
            <label><input type="checkbox" checked={ind.volAvg} onChange={() => tog("volAvg")} />Volume average (20)</label>
            <label><input type="checkbox" checked={ind.hiVol} onChange={() => tog("hiVol")} /><i style={{ background: "#2563eb" }} />Highest volume in 3 months</label>
            <label><input type="checkbox" checked={ind.rs} onChange={() => tog("rs")} /><i style={{ background: "#8b5cf6" }} />Strength vs NIFTY 500 (own pane)</label>
            <label><input type="checkbox" checked={ind.events} onChange={() => tog("events")} />Events (D dividend, B bonus, S split, Rt rights)</label>
            <label><input type="checkbox" checked={ind.draw} disabled={!row.draw} onChange={() => tog("draw")} />Draw the pattern{row.draw ? "" : " (this screen has none)"}</label></div>}</span>
        <span className="cp-menu"><button type="button" className={"cp-dd" + (compareOn || menu === "cmp" ? " on" : "")} aria-haspopup="true" aria-expanded={menu === "cmp"} onClick={() => setMenu(menu === "cmp" ? null : "cmp")}>Compare ▾</button>
          {menu === "cmp" && <div className="cp-pop" role="group" aria-label="Compare">
            <label><input type="checkbox" checked={cmp.nifty} onChange={() => setCmp((c) => ({ ...c, nifty: !c.nifty }))} /><i style={{ background: NIFTY_COLOR }} />NIFTY 500</label>
            {peerList.length > 0 && <small className="cp-sub">Peers (up to 3)</small>}
            {peerList.map((p) => { const on = cmp.peers.includes(p); return <label key={p}><input type="checkbox" checked={on} disabled={!on && cmp.peers.length >= 3} onChange={() => setCmp((c) => ({ ...c, peers: on ? c.peers.filter((x) => x !== p) : [...c.peers, p] }))} />{on && <i style={{ background: PEER_COLORS[cmp.peers.indexOf(p) % 3] }} />}{p}</label>; })}
            {!peerList.length && <small className="cp-sub">Peers load with the company's report.</small>}
            {compareOn && <small className="cp-sub">Compared lines show the % change from the first bar in view.</small>}</div>}</span>
        <button type="button" className={log ? "on" : ""} aria-pressed={log} disabled={compareOn} title={compareOn ? "Percent scale is on while comparing" : "Logarithmic price scale"} onClick={() => setLog((v) => !v)}>Log</button>
        <button type="button" className={measure.on ? "on" : ""} aria-pressed={measure.on} onClick={() => setMeasure((m) => ({ on: !m.on, a: null, out: m.on ? null : "Click the start point" }))}>Measure</button>
        <button type="button" onClick={reset} aria-label="Reset the chart" title="Reset the chart">↺</button>
      </div>
      {!canDaily && <p className="cp-wk">3Y, 5Y and MAX show weekly candles; the averages on them are weekly.</p>}
      {measure.out && <div className="cp-meas" role="status">{measure.out}</div>}
      <div className="cp-leg" aria-live="off">{legend.length ? legend.map((l, i) => <div key={i}>{l}</div>) : " "}</div>
      <div className="cp-c" ref={host}>
        {q.isLoading && <p className="cp-m">{prep ? "Preparing this company's chart…" : "Loading the chart…"}</p>}
        {!q.isLoading && !bars.length && <p className="cp-m">{q.isError ? (prep ? "Preparing this company's chart. It is taking longer than usual." : "The chart could not be loaded.") : "No price history yet for this company."}{q.isError && <button type="button" className="btn" onClick={() => q.refetch()}>Try again</button>}</p>}
      </div>
      {keyOn.length > 0 && <div className="cp-key" aria-label="Marks on the chart">{keyOn.map(([k, w]) => <span key={k}><i>{k}</i>{w}</span>)}</div>}
      {model === "prism" && prismParts(prismMap[row.symbol]).length > 0 && <ul className="cp-score cp-pz" aria-label="FinLit Prism scores">{prismParts(prismMap[row.symbol]).map((p) => <li key={p.key} className={"pb-" + p.band}><small>{p.label}</small><b>{p.text}</b><em>{p.word ?? (p.value == null ? "Not available" : p.key === "risk" ? "Higher means lower risk" : "Higher is better")}</em></li>)}</ul>}
      {extra}
      {row.disc && <DiscBlock d={row.disc} name={row.name || row.symbol} />}
      <p className="cp-f">Charts help you study a company; they are not advice to buy or sell. Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts™</a>, Copyright (c) 2025 TradingView, Inc.</p>
      <Link className="btn primary cp-r" to={`/stocks/${row.symbol}`}>Open full report</Link>
    </aside>
  );
}
