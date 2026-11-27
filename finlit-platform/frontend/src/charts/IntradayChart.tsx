import { useRef } from "react";
import { css as cssAt, drawIn, el, niceTicks, vgrad } from "../lib/svg";
import { nf } from "../lib/format";
import { axisDay, barSpan, dayDomain, dayTicks, hhmm, istDay, istMinutes, OPEN_MIN, sessionStarts } from "../lib/intraday";
import { labelEvery } from "../lib/chartAxis";
import { useChart } from "./useChart";
import type { Intraday } from "../lib/api";
import { ChartZoom } from "../components/ChartZoom";
import { candleNote, intradayCandles, maxCandles } from "../lib/candles";
import { drawCandleVolume, drawCandles } from "./candleDraw";
import { fitTip } from "./tipFit";

/** Intraday close line with volume bars, drawn like the daily price chart. 1D runs on a clock axis (09:15 to 15:30 IST) so a session in
 *  progress fills only the time that has passed; 5D and 1M put bars side by side with one label and a faint divider per session, so nights
 *  and weekends leave no gaps. High and low are the true traded extremes of the range (bar highs and lows), not the highest close.
 *  Developer file 42: `candles` draws the bars as candles on the same axes; joined into 5, 15, 30 or 60 minutes or whole sessions when the
 *  width has no room for one a bar (lib/candles), with a note saying how long one candle is. */
export function IntradayChart({ data, showVol, candles = false }: { data: Intraday; showVol: boolean; candles?: boolean }) {
  const tip = useRef<HTMLDivElement>(null), note = useRef<HTMLParagraphElement>(null);
  const s0 = data.series!;
  const { wrap, svg } = useChart((svgEl, W, first, fill) => {
    const css = (v: string) => cssAt(v, svgEl);   // developer file 45: colours are read where the chart sits, so the report's palette (styles/report45.css) applies
    if (s0.t.length < 2) return;
    // task #167: in the full-screen view the chart fills the height (fill), else its own height
    const H = Math.max(W < 520 ? 260 : 470, fill ?? 0), pl = 4, pr = 56, pt = 16, pb = 28, volH = showVol ? 46 : 0, iw = W - pl - pr;
    const oneDay = data.range === "1D";
    const cs = candles ? intradayCandles(s0, data.interval, maxCandles(iw), oneDay) : null;
    const s = (cs ? cs.s : s0) as typeof s0, iv = cs ? cs.minutes : data.interval, n = s.t.length;
    if (note.current) { note.current.hidden = !cs; if (cs) note.current.textContent = candleNote(cs.minutes); }
    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`); svgEl.style.height = H + "px";
    let hi = 0, lo = 0; s.h.forEach((p, i) => { if (p > s.h[hi]) hi = i; }); s.l.forEach((p, i) => { if (p < s.l[lo]) lo = i; });
    let mn = Math.min(s.l[lo], ...s.c), mx = Math.max(s.h[hi], ...s.c); const pad = (mx - mn) * 0.1 || mx * 0.002; mn -= pad; mx += pad;
    const ph = H - pt - pb - volH - (volH ? 10 : 0), li = n - 1;
    const [d0, d1] = dayDomain(s.t, iv), mins = s.t.map(istMinutes);
    const xt = (m: number) => pl + ((m - d0) / (d1 - d0)) * iw;
    // a candle sits in the middle of its time slot (1D) or of its share of the width (5D, 1M); the line runs edge to edge
    const slot = (m: number) => OPEN_MIN + (Math.floor((m - OPEN_MIN) / iv) + 0.5) * iv;
    const x = (i: number) => (oneDay ? xt(cs ? slot(mins[i]) : mins[i]) : cs ? pl + ((i + 0.5) / n) * iw : pl + (i / li) * iw), y = (p: number) => pt + (1 - (p - mn) / (mx - mn)) * ph;
    const area = vgrad(svgEl, css("--area"), 0.32, 0);
    niceTicks(mn, mx, 4).forEach((p) => {
      if (p < mn || p > mx) return;
      el("line", { x1: pl, x2: W - pr, y1: y(p), y2: y(p), stroke: css("--border"), "stroke-dasharray": "3 5" }, svgEl);
      el("text", { x: W - pr + 10, y: y(p) + 4, fill: css("--faint"), "font-size": 11, "font-family": "Inter Variable, Inter, monospace" }, svgEl).textContent = "₹" + Math.round(p).toLocaleString("en-IN");
    });
    const label = (px: number, text: string, anchor: string) => {
      el("text", { x: px, y: H - 6, fill: css("--faint"), "font-size": 11, "text-anchor": anchor, "font-family": "Inter Variable, Inter, monospace" }, svgEl).textContent = text;
    };
    let right = -Infinity;
    const place = (px: number, text: string) => {     // centred on its point, kept inside the plot, skipped if it would touch the previous one
      const half = (text.length * 6.6) / 2, cx = Math.min(Math.max(px, pl + half), W - pr - half);
      if (cx - half < right + 8) return;
      right = cx + half;
      label(cx, text, "middle");
    };
    if (oneDay) {
      dayTicks(W).filter((m) => m >= d0 && m <= d1).forEach((m) => place(xt(m), hhmm(m)));
    } else {
      const starts = sessionStarts(s.t), every = labelEvery(starts.length, iw, 7), gap = cs ? iw / n / 2 : iw / li / 2;
      starts.forEach((i, k) => {
        if (k > 0) el("line", { x1: x(i) - gap, x2: x(i) - gap, y1: pt, y2: H - pb, stroke: css("--border"), "stroke-dasharray": "2 4" }, svgEl);
        if (k % every === 0) place(x(i), axisDay(s.t[i], data.range));
      });
    }
    const slotW = oneDay ? (iw * iv) / (d1 - d0) : iw / n, cbw = Math.max(1, Math.min(14, slotW * 0.64));
    if (showVol && cs) drawCandleVolume(svgEl, s, x, H - pb, volH, cbw);
    else if (showVol) {
      const vv = s.v.map((v) => v ?? 0), vmax = Math.max(...vv, 1), base = H - pb;
      const bw = Math.max(1, slotW - 1.2), vg = vgrad(svgEl, css("--cmp"), 0.55, 0.15);   // developer file 45: volume is context, grey
      vv.forEach((v, i) => el("rect", { x: x(i) - bw / 2, y: base - (v / vmax) * volH, width: bw, height: (v / vmax) * volH, rx: Math.min(2, bw / 2), fill: vg }, svgEl));
    }
    if (cs) drawCandles(svgEl, s, x, y, cbw);
    else {
      const line = s.c.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
      el("path", { d: `${line}L${x(li)},${pt + ph}L${x(0)},${pt + ph}Z`, fill: area }, svgEl);
      drawIn(el("path", { d: line, fill: "none", stroke: css("--line"), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svgEl), first);
    }
    ([[hi, s.h[hi], "High", cs ? -8 : -12, "--gain"], [lo, s.l[lo], "Low", cs ? 16 : 20, "--loss"]] as const).forEach(([i, p, lab, dy, c]) => {
      if (!cs) el("circle", { cx: x(i), cy: y(p), r: 3.5, fill: css(c), stroke: css("--s1"), "stroke-width": 1.5 }, svgEl);
      el("text", { x: Math.min(Math.max(x(i), 48), W - pr - 48), y: y(p) + dy, "text-anchor": "middle", "font-size": 11, "font-weight": 600, fill: css(c), "font-family": "Inter Variable, Inter, sans-serif" }, svgEl).textContent = `${lab} ₹${nf(p)}`;
    });
    if (cs) el("line", { x1: x(li), x2: W - pr + 4, y1: y(s.c[li]), y2: y(s.c[li]), stroke: css("--gold"), "stroke-dasharray": "2 3" }, svgEl);
    else {
      el("circle", { cx: x(li), cy: y(s.c[li]), r: 9, fill: css("--gold"), opacity: 0.2 }, svgEl);
      el("circle", { cx: x(li), cy: y(s.c[li]), r: 4.5, fill: css("--gold"), stroke: css("--s1"), "stroke-width": 2 }, svgEl);
    }
    el("rect", { x: W - pr + 4, y: y(s.c[li]) - 10, width: 50, height: 20, rx: 6, fill: css("--gold") }, svgEl);
    el("text", { x: W - pr + 29, y: y(s.c[li]) + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: css("--ui-on-prism"), "font-family": "Inter Variable, Inter, sans-serif" }, svgEl).textContent = nf(s.c[li], 0);

    const cross = el("line", { y1: pt, y2: pt + ph, stroke: css("--border-strong"), "stroke-dasharray": "3 3", visibility: "hidden" }, svgEl);
    const dot = el("circle", { r: 5, fill: css("--line"), stroke: css("--s1"), "stroke-width": 2, visibility: "hidden" }, svgEl);
    const open0 = s.o[0], xs = s.c.map((_, i) => x(i));
    const nearest = (px: number) => { let b = 0; xs.forEach((v, i) => { if (Math.abs(v - px) < Math.abs(xs[b] - px)) b = i; }); return b; };
    svgEl.onpointermove = (ev) => {
      const r = svgEl.getBoundingClientRect(), mxp = ((ev.clientX - r.left) / r.width) * W;
      const i = nearest(mxp), px = x(i), py = y(s.c[i]);
      cross.setAttribute("x1", String(px)); cross.setAttribute("x2", String(px)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", String(px)); dot.setAttribute("cy", String(py)); dot.setAttribute("visibility", cs ? "hidden" : "visible");
      const t = tip.current; if (!t) return;
      const ch = (s.c[i] / open0 - 1) * 100;
      t.hidden = false; t.style.left = Math.min(Math.max((px / W) * r.width, 80), r.width - 80) + "px"; t.style.top = Math.max((py / H) * r.height, 70) + "px";
      t.replaceChildren();
      const add = (txt: string, cls = "", tag = "span") => { const e = document.createElement(tag); e.className = cls; e.textContent = txt; t.appendChild(e); };
      add(`${istDay(s.t[i])}, ${barSpan(s.t[i], iv)} IST`, "faint"); add("₹" + nf(s.c[i]), "", "b");
      add(`${ch >= 0 ? "▲ +" : "▼ −"}${nf(Math.abs(ch), 2)}% since the open${oneDay ? "" : " of " + istDay(s.t[0])}`, ch >= 0 ? "pos" : "neg");
      add(`${cs ? `Open ₹${nf(s.o[i])} · ` : ""}High ₹${nf(s.h[i])} · Low ₹${nf(s.l[i])}`, "muted", "div");
      if (s.v[i] != null) add(`Volume ${(s.v[i] as number).toLocaleString("en-IN")}`, "muted", "div");
      fitTip(t, (px / W) * r.width, r.width);
    };
    svgEl.onpointerleave = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); if (tip.current) tip.current.hidden = true; };
  }, [data, showVol, candles]);
  const s = s0, last = s.c[s.c.length - 1];
  return <ChartZoom label="Intraday price chart"><div className="chart" ref={wrap}><svg ref={svg} role="img" aria-label={`Intraday price, ${data.range}: from ₹${nf(s.o[0])} at the open to ₹${nf(last)} at ${barSpan(s.t[s.t.length - 1], data.interval)} IST`} /><div className="tip" ref={tip} hidden /></div><p className="faint pc-note" ref={note} hidden /></ChartZoom>;
}
