// The dashboard refresh (task #37): tabs and the Held chip, top / bottom sectors and the Sector Pulse line, 30-session flow bars, Your portfolio at a
// glance, the one-line Stress Lab and "Show N more".
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { stockLists } from "./MyStocks";
import { finlitSizes, glance } from "./Portfolio";
import { pulseLine } from "./Snapshot";
import { PairBars } from "./Flows";
import { Stress } from "./Stress";
import { ShowMoreButton } from "./parts";
import type { Row } from "../../lib/screener";
import type { Board } from "../../lib/sectors";

const row = (symbol: string, o: Partial<Row> = {}) => ({ symbol, name: symbol, sector: "IT", market_cap: 1000, ...o }) as Row;

describe("Your stocks today", () => {
  it("splits what is followed into watchlist and portfolio; a share can be in both; All lists the shares held first (final pages pack)", () => {
    const f = ["A", "B", "C", "D"].map((symbol) => ({ symbol, name: null }));
    const l = stockLists(f, new Set(["A", "B"]), new Set(["B", "C"]));
    expect(l.all.map((x) => x.symbol)).toEqual(["B", "C", "A", "D"]);
    expect(l.watchlist.map((x) => x.symbol)).toEqual(["A", "B"]);
    expect(l.portfolio.map((x) => x.symbol)).toEqual(["B", "C"]);
  });
});

describe("Show more", () => {
  it("names how many are hidden, says Show fewer when open and is absent when nothing is hidden", () => {
    const html = (extra: number, open: boolean) => renderToStaticMarkup(<ShowMoreButton more={{ extra, open, toggle: () => undefined }} noun="stock" controls="x" />);
    expect(html(2, false)).toContain("Show 2 more stocks"); expect(html(1, false)).toContain("Show 1 more stock<");
    expect(html(2, true)).toContain("Show fewer"); expect(html(2, true)).toContain('aria-expanded="true"');
    expect(html(0, false)).toBe("");
  });
});

describe("Your portfolio at a glance", () => {
  it("sizes companies by FinLit's rule: Large above ₹50,000 Cr, Mid above ₹10,000 Cr, Small below (as every page of the final pages pack)", () => {
    const rows = [row("L", { market_cap: 60000 }), row("M", { market_cap: 50000 }), row("N", { market_cap: 10001 }), row("S", { market_cap: 10000 }), row("Z", { market_cap: null })];
    const s = finlitSizes(rows);
    expect([s.get("L"), s.get("M"), s.get("N"), s.get("S"), s.get("Z")]).toEqual(["Large", "Mid", "Mid", "Small", undefined]);
  });
  it("averages the Prism score and parts of the shares held, counts colours, sectors and sizes", () => {
    const rows = [row("A", { prism_final: 80, prism_fundamental: 90, prism_valuation: 40, prism_quality: 70, prism_risk: 80, market_cap: 3 }),
      row("B", { prism_final: 55, prism_fundamental: 50, prism_valuation: 60, prism_quality: 60, prism_risk: 70, sector: "Banks", market_cap: 2 }),
      row("C", { prism_final: null, market_cap: 1 })];
    const g = glance(["A", "B", "C", "X"], rows);
    expect(g.count).toBe(4); expect(g.scored).toBe(2); expect(g.avgPrism).toBe(68);
    expect(g.colours).toEqual({ g: 1, o: 1, r: 0, n: 2 });                 // C has no score, X is not a listed company we hold
    expect(g.parts.map((p) => p.value)).toEqual([70, 50, 65, 75]);
    expect(g.sectors).toBe(2); expect(g.largest).toEqual({ name: "IT", count: 2 });
    expect(g.sizes).toEqual([{ label: "Small", count: 3 }]);                 // market values of 1 to 3 crore
  });
});

describe("Sector Pulse line", () => {
  it("adds the two thrust states, and says locked or nothing when there is no reading", () => {
    const b = { date: "2026-11-04", counts: { "Thrust C": 6, "Thrust CAP": 4, Confirmed: 0, Fading: 17, Washout: 11, Neutral: 0 } } as unknown as Board;
    expect(pulseLine(b)).toEqual({ locked: false, date: "2026-11-04", thrust: 10, confirmed: 0, fading: 17, washout: 11 });
    expect(pulseLine({ ...b, locked: { rows: "silver" } } as Board)).toEqual({ locked: true });
    expect(pulseLine(undefined)).toBeNull();
  });
});

describe("FII / DII bars and the one-line Stress Lab", () => {
  it("draws an FII bar and a DII bar for each of the last 30 sessions, buying above the line and selling below, with a spoken summary (final pages pack)", () => {
    const days = Array.from({ length: 40 }, (_, i) => ({ d: `2026-10-${String((i % 28) + 1).padStart(2, "0")}-${i}`, fii: { buy: null, sell: null, net: i % 2 ? 500 : -1000 }, dii: { buy: null, sell: null, net: 200 } }));
    const html = renderToStaticMarkup(<PairBars days={days} />);
    expect((html.match(/class="fii"/g) || []).length).toBe(30 + 1);            // 30 bars and the legend swatch
    expect((html.match(/class="dii"/g) || []).length).toBe(30 + 1);
    expect(html).toMatch(/aria-label="FII and DII net flows, last 30 sessions from/);
  });
  it("Stress Lab is one line while the nightly run covers none of the stocks", () => {
    const html = renderToStaticMarkup(<MemoryRouter><Stress followed={[{ symbol: "A", name: null }, { symbol: "B", name: null }]} loading={false} /></MemoryRouter>);
    expect(html).toContain("dsh-strip"); expect(html).toContain("None of your 2 stocks are in the nightly run yet");
    expect(html).not.toContain("Not covered yet");
  });
});
