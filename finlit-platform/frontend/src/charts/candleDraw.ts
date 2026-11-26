// Candle marks shared by the daily and the intraday price charts (developer file 42). The bars come from lib/candles (joined to fit the width).
import { css, el } from "../lib/svg";
import type { Ohlc } from "../lib/candles";

/** A candle's open, high, low and close, with a close-only bar drawn flat at its close. */
export function bar(g: Ohlc, i: number) {
  const c = g.c[i], o = g.o[i] ?? c, h = g.h[i] ?? Math.max(o, c), l = g.l[i] ?? Math.min(o, c);
  return { o, h, l, c, up: c >= o };
}

/** The price range the candles need: the lowest low and the highest high (and the averages drawn with them). */
export function candleRange(g: Ohlc, extra: (number | null)[][] = []): [number, number] {
  const v = [...g.h, ...g.l, ...g.c, ...extra.flat()].filter((x): x is number => x != null);
  return [Math.min(...v), Math.max(...v)];
}

/** Wick from the high to the low, body from the open to the close: green when it closed at or above its open, red when below. */
export function drawCandles(svgEl: SVGSVGElement, g: Ohlc, x: (i: number) => number, y: (p: number) => number, bw: number) {
  const up = css("--gain"), down = css("--loss"), grp = el("g", { "data-candles": g.t.length }, svgEl);
  g.t.forEach((_, i) => {
    const b = bar(g, i), col = b.up ? up : down, top = y(Math.max(b.o, b.c)), bot = y(Math.min(b.o, b.c));
    el("line", { x1: x(i), x2: x(i), y1: y(b.h), y2: y(b.l), stroke: col, "stroke-width": bw > 5 ? 1.2 : 1 }, grp);
    el("rect", { x: x(i) - bw / 2, y: top, width: bw, height: Math.max(1, bot - top), fill: col, rx: bw > 6 ? 1 : 0 }, grp);
  });
}

/** Volume under the candles, in the candle's own colour, light. */
export function drawCandleVolume(svgEl: SVGSVGElement, g: Ohlc, x: (i: number) => number, base: number, volH: number, bw: number) {
  const vv = g.v.map((v) => v ?? 0), vmax = Math.max(...vv, 1), up = css("--gain"), down = css("--loss");
  vv.forEach((v, i) => el("rect", { x: x(i) - bw / 2, y: base - (v / vmax) * volH, width: bw, height: (v / vmax) * volH, fill: bar(g, i).up ? up : down, opacity: 0.32 }, svgEl));
}
