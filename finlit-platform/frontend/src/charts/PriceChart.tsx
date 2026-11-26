import { useRef } from "react";
import { css as cssAt, drawIn, el, niceTicks, reduced, vgrad } from "../lib/svg";
import { dateIN, nf } from "../lib/format";
import { useChart } from "./useChart";
import type { PriceRange } from "../lib/api";
import { ChartZoom } from "../components/ChartZoom";
import { calendarCandles, candleNote, hasOhlc, maxCandles, type Ohlc, type Per } from "../lib/candles";
import { bar, candleRange, drawCandleVolume, drawCandles } from "./candleDraw";
import { fitTip } from "./tipFit";

const PER_WORD: Record<Per, string> = { day: "", week: "Week of ", month: "Month of ", quarter: "Quarter from " };

/** Close line with 50/200-day averages (computed server-side on full history) and volume bars. Developer file 42: `candles` draws the same
 *  range as candles (open, high, low, close), on the same axes, averages, volume and hover; joined into weeks, months or quarters when the
 *  width has no room for one a bar (lib/candles), with a note saying how long one candle is. */
export function PriceChart({ data, showEma50, showEma200, showVol, candles = false }: { data: PriceRange; showEma50: boolean; showEma200: boolean; showVol: boolean; candles?: boolean }) {
  const tip = useRef<HTMLDivElement>(null), note = useRef<HTMLParagraphElement>(null);
  const s = data.series, asCandles = candles && hasOhlc(s);
  const { wrap, svg } = useChart((svgEl, W, first, fill) => {
    const css = (v: string) => cssAt(v, svgEl);   // developer file 45: colours are read where the chart sits, so the report's palette (styles/report45.css) applies
    const n = s.t.length;
    if (n < 2) return;
    // task #167: in the full-screen view the chart fills the height (fill), else its own height
    const H = Math.max(W < 520 ? 260 : 470, fill ?? 0), pl = 4, pr = 56, pt = 16, pb = 28, volH = showVol ? 46 : 0;
    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`); svgEl.style.height = H + "px";
    if (asCandles) { drawCandleChart(svgEl, W, H, { pl, pr, pt, pb, volH }); return; }
    if (note.current) note.current.hidden = true;
    const vals = [...s.c, ...(showEma50 ? s.ema50 : []), ...(showEma200 ? s.ema200 : [])].filter((v): v is number => v != null);
    let mn = Math.min(...vals), mx = Math.max(...vals); const pad = (mx - mn) * 0.1; mn -= pad; mx += pad;
    const ph = H - pt - pb - volH - (volH ? 10 : 0), li = n - 1;
    const x = (i: number) => pl + (i / li) * (W - pl - pr), y = (p: number) => pt + (1 - (p - mn) / (mx - mn)) * ph;
    const area = vgrad(svgEl, css("--area"), 0.32, 0);
    niceTicks(mn, mx, 4).forEach((p) => {
      if (p < mn || p > mx) return;
      el("line", { x1: pl, x2: W - pr, y1: y(p), y2: y(p), stroke: css("--border"), "stroke-dasharray": "3 5" }, svgEl);
      el("text", { x: W - pr + 10, y: y(p) + 4, fill: css("--faint"), "font-size": 11, "font-family": "Inter Variable, Inter, monospace" }, svgEl).textContent = "₹" + Math.round(p).toLocaleString("en-IN");
    });
    const ticks = Math.max(2, Math.min(6, Math.floor((W - pl - pr) / 100)));
    for (let i = 0; i <= ticks; i++) {
      const idx = Math.round((i / ticks) * li);
      const t = el("text", { x: x(idx), y: H - 6, fill: css("--faint"), "font-size": 11, "text-anchor": i === 0 ? "start" : i === ticks ? "end" : "middle", "font-family": "Inter Variable, Inter, monospace" }, svgEl);
      t.textContent = dateIN(s.t[idx], data.range === "1M" ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" });
    }
    if (showVol) {
      const vv = s.v.map((v) => v ?? 0), vmax = Math.max(...vv, 1), base = H - pb, bw = Math.max(1.2, (W - pl - pr) / n - 1.4), vg = vgrad(svgEl, css("--cmp"), 0.55, 0.15);   // developer file 45: volume is context, grey
      vv.forEach((v, i) => el("rect", { x: x(i) - bw / 2, y: base - (v / vmax) * volH, width: bw, height: (v / vmax) * volH, rx: Math.min(2, bw / 2), fill: vg }, svgEl));
    }
    const line = s.c.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
    el("path", { d: `${line}L${x(li)},${pt + ph}L${x(0)},${pt + ph}Z`, fill: area }, svgEl);
    const ema = (arr: (number | null)[], color: string, dash: string) => {
      let d = ""; arr.forEach((v, i) => { if (v != null) d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
      if (d) el("path", { d, fill: "none", stroke: color, "stroke-width": 1.6, "stroke-dasharray": dash }, svgEl);
    };
    if (showEma50) ema(s.ema50, css("--c2"), "5 4");
    if (showEma200) ema(s.ema200, css("--c3"), "");
    drawIn(el("path", { d: line, fill: "none", stroke: css("--line"), "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svgEl), first);
    let hi = 0, lo = 0; s.c.forEach((p, i) => { if (p > s.c[hi]) hi = i; if (p < s.c[lo]) lo = i; });
    ([[hi, "High", -12, "--gain"], [lo, "Low", 20, "--loss"]] as const).forEach(([i, lab, dy, c]) => {
      el("circle", { cx: x(i), cy: y(s.c[i]), r: 3.5, fill: css(c), stroke: css("--s1"), "stroke-width": 1.5 }, svgEl);
      el("text", { x: Math.min(Math.max(x(i), 48), W - pr - 48), y: y(s.c[i]) + dy, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: css(c), "font-family": "Inter Variable, Inter, sans-serif" }, svgEl).textContent = `${lab} ₹${nf(s.c[i], 0)}`;
    });
    el("circle", { cx: x(li), cy: y(s.c[li]), r: 9, fill: css("--gold"), opacity: 0.2 }, svgEl);
    el("circle", { cx: x(li), cy: y(s.c[li]), r: 4.5, fill: css("--gold"), stroke: css("--s1"), "stroke-width": 2 }, svgEl);
    el("rect", { x: W - pr + 4, y: y(s.c[li]) - 10, width: 50, height: 20, rx: 6, fill: css("--gold") }, svgEl);
    el("text", { x: W - pr + 29, y: y(s.c[li]) + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: css("--ui-on-prism"), "font-family": "Inter Variable, Inter, sans-serif" }, svgEl).textContent = nf(s.c[li], 0);

    const cross = el("line", { y1: pt, y2: pt + ph, stroke: css("--border-strong"), "stroke-dasharray": "3 3", visibility: "hidden" }, svgEl);
    const dot = el("circle", { r: 5, fill: css("--line"), stroke: css("--s1"), "stroke-width": 2, visibility: "hidden" }, svgEl);
    const first0 = s.c[0];
    svgEl.onpointermove = (ev) => {
      const r = svgEl.getBoundingClientRect(), mxp = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(li, Math.round(((mxp - pl) / (W - pl - pr)) * li))), px = x(i), py = y(s.c[i]);
      cross.setAttribute("x1", String(px)); cross.setAttribute("x2", String(px)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", String(px)); dot.setAttribute("cy", String(py)); dot.setAttribute("visibility", "visible");
      const t = tip.current; if (!t) return;
      const ch = (s.c[i] / first0 - 1) * 100;
      t.hidden = false; t.style.left = Math.min(Math.max((px / W) * r.width, 80), r.width - 80) + "px"; t.style.top = Math.max((py / H) * r.height, 70) + "px";
      t.replaceChildren();
      const add = (txt: string, cls = "", tag = "span") => { const e = document.createElement(tag); e.className = cls; e.textContent = txt; t.appendChild(e); };
      add((data.grain === "weekly" ? "Week of " : "") + dateIN(s.t[i]), "faint"); add("₹" + nf(s.c[i]), "", "b");
      add(`${ch >= 0 ? "▲ +" : "▼ −"}${nf(Math.abs(ch), 1)}% from start`, ch >= 0 ? "pos" : "neg");
      if (showEma50 && s.ema50[i] != null) add(`EMA 50 ₹${nf(s.ema50[i] as number)}`, "muted", "div");
      if (showEma200 && s.ema200[i] != null) add(`EMA 200 ₹${nf(s.ema200[i] as number)}`, "muted", "div");
      fitTip(t, (px / W) * r.width, r.width);
    };
    svgEl.onpointerleave = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); if (tip.current) tip.current.hidden = true; };
  }, [data, showEma50, showEma200, showVol, asCandles]);

  function drawCandleChart(svgEl: SVGSVGElement, W: number, H: number, { pl, pr, pt, pb, volH }: { pl: number; pr: number; pt: number; pb: number; volH: number }) {
    const css = (v: string) => cssAt(v, svgEl);
    const src: Ohlc = { t: s.t, o: s.o!, h: s.h!, l: s.l!, c: s.c, v: s.v, ema50: s.ema50, ema200: s.ema200 };
    const { s: g, per } = calendarCandles(src, data.grain, maxCandles(W - pl - pr));
    const n = g.t.length, li = n - 1;
    if (note.current) { note.current.hidden = false; note.current.textContent = candleNote(per); }
    let [mn, mx] = candleRange(g, [showEma50 ? g.ema50 ?? [] : [], showEma200 ? g.ema200 ?? [] : []]); const pad = (mx - mn) * 0.08 || mx * 0.01; mn -= pad; mx += pad;
    const ph = H - pt - pb - volH - (volH ? 10 : 0), step = (W - pl - pr) / n, bw = Math.max(1, Math.min(14, step * 0.64));
    const x = (i: number) => pl + (i + 0.5) * step, y = (p: number) => pt + (1 - (p - mn) / (mx - mn)) * ph;
    niceTicks(mn, mx, 4).forEach((p) => {
      if (p < mn || p > mx) return;
      el("line", { x1: pl, x2: W - pr, y1: y(p), y2: y(p), stroke: css("--border"), "stroke-dasharray": "3 5" }, svgEl);
      el("text", { x: W - pr + 10, y: y(p) + 4, fill: css("--faint"), "font-size": 11, "font-family": "Inter Variable, Inter, monospace" }, svgEl).textContent = "₹" + Math.round(p).toLocaleString("en-IN");
    });
    const ticks = Math.max(2, Math.min(6, Math.floor((W - pl - pr) / 100)));
    for (let i = 0; i <= ticks; i++) {
      const idx = Math.round((i / ticks) * li);
      el("text", { x: i === 0 ? pl : i === ticks ? W - pr : x(idx), y: H - 6, fill: css("--faint"), "font-size": 11, "text-anchor": i === 0 ? "start" : i === ticks ? "end" : "middle", "font-family": "Inter Variable, Inter, monospace" }, svgEl)
        .textContent = dateIN(g.t[idx], data.range === "1M" ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" });
    }
    if (showVol) drawCandleVolume(svgEl, g, x, H - pb, volH, bw);
    const ema = (arr: (number | null)[] | undefined, color: string, dash: string) => {
      let d = ""; (arr ?? []).forEach((v, i) => { if (v != null) d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
      if (d) el("path", { d, fill: "none", stroke: color, "stroke-width": 1.6, "stroke-dasharray": dash }, svgEl);
    };
    drawCandles(svgEl, g, x, y, bw);
    if (showEma50) ema(g.ema50, css("--c2"), "5 4");
    if (showEma200) ema(g.ema200, css("--c3"), "");
    // the highest high and the lowest low of the range, as the intraday chart marks them
    let hi = 0, lo = 0; g.t.forEach((_, i) => { if (bar(g, i).h > bar(g, hi).h) hi = i; if (bar(g, i).l < bar(g, lo).l) lo = i; });
    ([[hi, bar(g, hi).h, "High", -8, "--gain"], [lo, bar(g, lo).l, "Low", 16, "--loss"]] as const).forEach(([i, p, lab, dy, c]) => {
      el("text", { x: Math.min(Math.max(x(i), 48), W - pr - 48), y: y(p) + dy, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: css(c), "font-family": "Inter Variable, Inter, sans-serif" }, svgEl).textContent = `${lab} ₹${nf(p)}`;
    });
    const lastC = g.c[li];
    el("line", { x1: x(li), x2: W - pr + 4, y1: y(lastC), y2: y(lastC), stroke: css("--gold"), "stroke-dasharray": "2 3" }, svgEl);
    el("rect", { x: W - pr + 4, y: y(lastC) - 10, width: 50, height: 20, rx: 6, fill: css("--gold") }, svgEl);
    el("text", { x: W - pr + 29, y: y(lastC) + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: css("--ui-on-prism"), "font-family": "Inter Variable, Inter, sans-serif" }, svgEl).textContent = nf(lastC, 0);

    const band = el("rect", { y: pt, height: H - pt - pb, width: Math.max(step, 2), fill: css("--border-strong"), opacity: 0.18, visibility: "hidden" }, svgEl);
    svgEl.onpointermove = (ev) => {
      const r = svgEl.getBoundingClientRect(), mxp = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(li, Math.floor((mxp - pl) / step))), b = bar(g, i), px = x(i);
      band.setAttribute("x", String(px - step / 2)); band.setAttribute("visibility", "visible");
      const t = tip.current; if (!t) return;
      const ref = i > 0 ? g.c[i - 1] : b.o, ch = (b.c / ref - 1) * 100;
      t.hidden = false; t.style.left = Math.min(Math.max((px / W) * r.width, 90), r.width - 90) + "px"; t.style.top = Math.max((y(b.h) / H) * r.height, 90) + "px";
      t.replaceChildren();
      const add = (txt: string, cls = "", tag = "span") => { const e = document.createElement(tag); e.className = cls; e.textContent = txt; t.appendChild(e); };
      add(PER_WORD[per] + dateIN(g.t[i]), "faint"); add("₹" + nf(b.c), "", "b");
      add(`${ch >= 0 ? "▲ +" : "▼ −"}${nf(Math.abs(ch), 1)}% ${i > 0 ? "on the previous close" : "on the open"}`, ch >= 0 ? "pos" : "neg");
      add(`Open ₹${nf(b.o)} · High ₹${nf(b.h)} · Low ₹${nf(b.l)}`, "muted", "div");
      if (showEma50 && g.ema50?.[i] != null) add(`EMA 50 ₹${nf(g.ema50[i] as number)}`, "muted", "div");
      if (showEma200 && g.ema200?.[i] != null) add(`EMA 200 ₹${nf(g.ema200[i] as number)}`, "muted", "div");
      if (g.v[i] != null) add(`Volume ${(g.v[i] as number).toLocaleString("en-IN")}`, "muted", "div");
      fitTip(t, (px / W) * r.width, r.width);
    };
    svgEl.onpointerleave = () => { band.setAttribute("visibility", "hidden"); if (tip.current) tip.current.hidden = true; };
  }

  const label = asCandles ? `Candle chart from ₹${nf(s.c[0])} to ₹${nf(s.c[s.c.length - 1])} over ${data.range}` : `Price from ₹${nf(s.c[0])} to ₹${nf(s.c[s.c.length - 1])} over ${data.range}`;
  return <ChartZoom label="Price chart"><div className="chart" ref={wrap}><svg ref={svg} role="img" aria-label={label} /><div className="tip" ref={tip} hidden /></div><p className="faint pc-note" ref={note} hidden /></ChartZoom>;
}
void reduced;
