// Task #223 (dashboard pack of 18 Nov, D1): the ETF portfolio's ETFs in "Your investments today": rows with price, today, 1 year and the price against NAV,
// counted in All and ETFs; "Open ETF portfolio →" goes to /etf-portfolio; no Show all on the ETFs chip; the out-of-date empty text is gone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { etfRows, investRows, navText } from "../../lib/dashInvest";

const src = readFileSync(join(__dirname, "MyStocks.tsx"), "utf8");
const E = (symbol: string, premium: number, gone = false) => ({ symbol, name: symbol + " ETF", gone, price: 109.92, changePct: -0.13, ret1y: 7.8, premium, priceDate: "2026-11-18" });

describe("D1: ETFs in Your investments today", () => {
  it("each ETF of the ETF portfolio is a row: type ETF, price, today, 1 year and the price against NAV; a removed one is left out", () => {
    const rows = etfRows([E("GOLDBEES", 0.03), E("MID150BEES", -0.13), E("OLD", 0, true)]);
    expect(rows.map((r) => [r.kind, r.symbol, r.href, r.price, r.day, r.y1, navText(r.premium)])).toEqual([
      ["etf", "GOLDBEES", "/etfs/GOLDBEES", 109.92, -0.13, 7.8, "+0.03% vs NAV"], ["etf", "MID150BEES", "/etfs/MID150BEES", 109.92, -0.13, 7.8, "−0.13% vs NAV"]]);
    expect(rows[0].sub).toBe("GOLDBEES ETF · in portfolio");
  });
  it("they are counted in All: 14 shares + 1 fund + 4 ETFs + 3 watchlist-only = 22", () => {
    const sh = (s: string) => ({ key: "share:" + s, kind: "share" as const, symbol: s, name: s, sub: "", href: "", alertHref: "", price: 1, day: 0, y1: null, value: null });
    const all = investRows({ shares: Array.from({ length: 14 }, (_, i) => sh("S" + i)), funds: [{ ...sh("F"), key: "mf:1", kind: "mf" as const }],
      etfs: etfRows([E("A", 0), E("B", 0), E("C", 0), E("D", 0)]), watch: [sh("S0"), sh("W1"), sh("W2"), sh("W3")].map((r) => ({ ...r, kind: "watch" as const, key: "watch:" + r.symbol })) });
    expect(all).toHaveLength(22); expect(all.filter((r) => r.kind === "etf")).toHaveLength(4);
  });
  it("the ETFs chip links to the ETF portfolio, lists every ETF and has no Show all; the old empty-state text is gone", () => {
    expect(src).toContain('tab === "etf" ? { to: "/etf-portfolio", long: "Open ETF portfolio", short: "ETFs" }');
    expect(src).toContain('invShown = tab === "etf" ? invList : invMore.visible');
    expect(src).toMatch(/\{!loading && !isStockTab && tab !== "etf" && invList\.length > 0 && <ShowMoreButton/);
    expect(src).not.toContain("once the ETF portfolio opens");
    expect(src).toContain("etfs: etfRows(etfItems)");
  });
});
