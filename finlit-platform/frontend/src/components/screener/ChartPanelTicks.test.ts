import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #100: the chart panel's returns row, the time axis and the TradingView credit.
const src = readFileSync(join(process.cwd(), "src/components/screener/ChartPanel.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/styles/chartpanel.css"), "utf8");

describe("chart panel details", () => {
  it("writes the range change like the 1M and 3M ones (no colon) and keeps each figure on one line", () => {
    expect(src).toMatch(/\{opt\.range\} \{pct\(chg\)\}/);
    expect(src).not.toMatch(/\{opt\.range\}: \{pct\(chg\)\}/);
    expect(css).toMatch(/\.cp-p > span \{ white-space: nowrap; \}/);
  });
  it("names a day tick on the time axis (3 Nov, not a bare 3)", () => {
    expect(src).toMatch(/tickMarkFormatter: dayTick/);
    expect(src).toMatch(/return m >= 1 && m <= 12 && d \? `\$\{d\} \$\{MONTHS\[m - 1\]\}` : null;/);
  });
  it("credits TradingView with a link in the footer instead of a logo drawn over the volume bars", () => {
    expect(src).toMatch(/attributionLogo: false/);
    expect(src).toMatch(/href="https:\/\/www\.tradingview\.com\/"/);
  });
});
