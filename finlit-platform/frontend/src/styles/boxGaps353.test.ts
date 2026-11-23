// Task #353 (team, 23 Nov 2026): "maintain proper gaping across the page and for every page between the boxes". One 16px gap between the boxes of
// the Mutual funds main column (they touched: 0px), the screener's results column (10/14/18/14px) and the ETF table and pages (12px).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = (f: string) => readFileSync(join(__dirname, f), "utf8");
describe("task #353: 16px between boxes", () => {
  it("Mutual funds: the main column is a 16px stack and its boxes carry no margins of their own", () => {
    expect(css("mf341.css")).toMatch(/\.mf-list \.mf-main \{ display: flex; flex-direction: column; gap: 16px; \}/);
    expect(css("mf341.css")).toMatch(/\.mf-list \.mf-main > \* \{ margin-top: 0; margin-bottom: 0; \}/);
  });
  it("Mutual Fund Screener: count, active filters, result at a glance, table, pages and notes 16px apart (no collapsed 18px)", () => {
    const s = css("mfscreen.css");
    expect(s).toMatch(/\.mfs-main > \.mfs-rbar, \.mfs-main > \.mfs-active, \.mfs-main > \.mfs-glance-wrap \{ margin-bottom: 16px; \}/);
    expect(s).toMatch(/\.mfs-main > \.mfs-pages \{ margin: 16px 0 0; \}/);
    expect(s).toMatch(/\.mfs-main > \.mfs-glance-wrap > :last-child \{ margin-bottom: 0; \}/);
  });
  it("ETFs: the table, the pages and the compare bar 16px apart", () => {
    expect(css("etf351.css")).toMatch(/\.etf-list \.etf-tw \+ \.etf-pager \{ margin: 16px 0; \}/);
  });
});
