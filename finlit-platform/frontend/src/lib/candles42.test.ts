// Developer file 42 (founder, 26 Nov 2026): "add candle chart as a tab in section 3 line chart". Candles that fit the width, and say how long one is.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calendarCandles, candleNote, hasOhlc, intradayCandles, maxCandles, merge, weekOf, type Ohlc } from "./candles";

const days = (n: number, from = "2025-11-24"): string[] => {
  const out: string[] = [], d = new Date(from + "T00:00:00Z");
  while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
};
const series = (t: string[]): Ohlc => ({ t, o: t.map((_, i) => 100 + i), h: t.map((_, i) => 102 + i), l: t.map((_, i) => 99 + i), c: t.map((_, i) => 101 + i), v: t.map(() => 10), ema50: t.map((_, i) => 90 + i), ema200: t.map(() => null) });

describe("joining bars into longer candles", () => {
  it("a joined candle opens at its first open, closes at its last close, spans the highest high and the lowest low, and adds the volumes", () => {
    const s: Ohlc = { t: ["2026-11-23", "2026-11-24", "2026-11-25"], o: [10, 12, 9], h: [13, 14, 11], l: [9, 8, 7], c: [12, 9, 10], v: [5, null, 7], ema50: [1, 2, 3] };
    const g = merge(s, weekOf);
    expect(g).toEqual({ t: ["2026-11-23"], o: [10], h: [14], l: [7], c: [10], v: [12], ema50: [3] });
  });
  it("a bar with only a close draws flat at its close (the server keeps close-only weeks that way)", () => {
    const g = merge({ t: ["2026-11-23"], o: [null], h: [null], l: [null], c: [50], v: [null] }, (t) => t);
    expect([g.o[0], g.h[0], g.l[0], g.c[0]]).toEqual([50, 50, 50, 50]);
  });
  it("weeks start on Monday", () => {
    expect(["2026-11-23", "2026-11-26", "2026-11-29"].map(weekOf)).toEqual(["2026-11-23", "2026-11-23", "2026-11-23"]);
    expect(weekOf("2026-11-30")).toBe("2026-11-30");
  });
});

describe("candles that fit the chart's width (about 2.5 px each)", () => {
  const year = series(days(249));
  it("a desktop chart (about 700 px) draws a year as days; a phone (about 250 px) as weeks", () => {
    expect(maxCandles(700)).toBe(280);
    expect(calendarCandles(year, "daily", maxCandles(700))).toMatchObject({ per: "day" });
    const phone = calendarCandles(year, "daily", maxCandles(250));
    expect(phone.per).toBe("week");
    expect(phone.s.t.length).toBeLessThanOrEqual(maxCandles(250));
  });
  it("weekly ranges become months, then quarters, when they have more weeks than room", () => {
    const weeks = series(Array.from({ length: 1040 }, (_, i) => new Date(Date.UTC(2006, 0, 2 + 7 * i)).toISOString().slice(0, 10)));
    expect(calendarCandles(weeks, "weekly", 280).per).toBe("month");
    expect(calendarCandles(weeks, "weekly", 100).per).toBe("quarter");
  });
  it("intraday: 1-minute bars become 5, 15, 30 or 60 minutes or one session; the 1D clock axis must fit a whole session", () => {
    const t = Array.from({ length: 375 }, (_, m) => new Date(Date.parse("2026-11-26T09:15:00+05:30") + m * 60000).toISOString());
    const one = intradayCandles(series(t), 1, maxCandles(700), true);
    expect(one.minutes).toBe(5); expect(one.s.t.length).toBe(75);
    expect(intradayCandles(series(t), 1, maxCandles(250), true).minutes).toBe(5);
    expect(intradayCandles(series(t), 1, 20, true).minutes).toBe(30);
  });
  it("the note says how long one candle is", () => {
    expect(["day", "week", "month", "quarter"].map((p) => candleNote(p as "day"))).toEqual(["Each candle is one trading day.", "Each candle is one week.", "Each candle is one month.", "Each candle is one quarter."]);
    expect([1, 5, 60, 375].map(candleNote)).toEqual(["Each candle is 1 minute.", "Each candle is 5 minutes.", "Each candle is one hour.", "Each candle is one trading session."]);
  });
  it("candles need the open, high and low; a close-only series keeps the line", () => {
    expect(hasOhlc({ o: [1], h: [2], l: [0], c: [1] })).toBe(true);
    expect(hasOhlc({ c: [1, 2] })).toBe(false);
    expect(hasOhlc({ o: [null], h: [null], l: [null], c: [1] })).toBe(false);
  });
});

describe("the price section's Line and Candles tabs", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
  it("both views on every range, daily and intraday, the legend and the ? help say what a candle is", () => {
    const sec = read("stock/Sections.tsx");
    expect(sec).toContain('aria-label="Chart view"');
    expect(sec).toContain('candles={candles} />');                        // the daily and weekly chart
    expect(sec).toContain('candles={view === "candles"} />');             // the intraday chart
    expect(sec).toContain("<CandleKey />");
    expect(sec).toContain('"This range has closing prices only"');
    expect(read("lib/chartHelp.ts")).toContain("A candle is green when the price closed at or above where it opened");
  });
  it("the hover box stays inside the chart on a phone (it is slid in by its own width)", () => {
    for (const f of ["charts/PriceChart.tsx", "charts/IntradayChart.tsx"]) expect(read(f)).toContain("fitTip(t, (px / W) * r.width, r.width);");
  });
});
