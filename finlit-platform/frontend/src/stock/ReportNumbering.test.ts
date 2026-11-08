// Task #34 and #37: the company report has no "Historical trend" section, and the section numbers run 01 to 19 with no gap (every main section is numbered).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV } from "../lib/sectionNav";

const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
const numbered = () => {
  const out: [number, string][] = [];
  for (const f of files(__dirname)) for (const m of readFileSync(f, "utf8").matchAll(/\bno(?:=|:\s*)"(\d{2}) · ([^"]+)"/g)) out.push([Number(m[1]), m[2]]);
  return out;
};

describe("company report numbering", () => {
  it("has the sections 01 to 19, each number once, in one unbroken run", () => {
    const nums = [...new Set(numbered().map(([n]) => n))].sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });
  it("no longer has the Historical trend section or its menu entry", () => {
    expect(numbered().some(([, t]) => /Historical trend/i.test(t))).toBe(false);
    expect(NAV.some(([id]) => id === "history")).toBe(false);
    expect(readFileSync(join(__dirname, "Sections3.tsx"), "utf8")).not.toContain("Margins and returns against their own history");
  });
  it("every main section has its number, in the order of the page", () => {
    const m = new Map(numbered().map(([n, t]) => [t.split(" · ")[0], n]));
    const want: [string, number][] = [["Company overview", 1], ["Macro and sector outlook", 2], ["What's going well and what to watch", 3], ["Price & technicals", 4], ["Latest quarter", 5], ["Financials", 6], ["Trends", 7],
      ["Chart lab", 8], ["Ratios", 9], ["DuPont analysis", 10], ["Earnings & cash quality", 11], ["Ownership", 12], ["Peers", 13], ["Sector & peers", 14], ["Leadership", 15], ["Gold insights", 16],
      ["Segments", 17], ["Dividends & events", 18], ["Pros, cons & Prism history", 19]];
    for (const [t, n] of want) expect(m.get(t), t).toBe(n);
  });
  it("Leadership sits right after Sector & peers, in the report and in the section bar", () => {
    const ids = NAV.map(([id]) => id);
    expect(ids.indexOf("leadership")).toBe(ids.indexOf("sector") + 1);
    const page = readFileSync(join(__dirname, "StockPage.tsx"), "utf8");
    expect(page.indexOf("<LeadershipSection")).toBeGreaterThan(page.indexOf("<SectorPeersSection"));
    expect(page.indexOf("<LeadershipSection")).toBeLessThan(page.indexOf("<InsightsSection"));
  });
});
