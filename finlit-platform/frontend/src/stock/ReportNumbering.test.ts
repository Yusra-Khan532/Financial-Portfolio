// Task #34 and #37: the company report has no "Historical trend" section, and the section numbers run 01 to 18 with no gap (Where it stands, the final pages pack's new section, is drawn without a number; 17 is Pros, cons & Prism history; Community discussions is the last section, 18: tasks #105 and #113) (every main section is numbered).
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
  it("has the sections 01 to 18, each number once, in one unbroken run", () => {
    const nums = [...new Set(numbered().map(([n]) => n))].sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });
  it("no longer has the Historical trend section or its menu entry", () => {
    expect(numbered().some(([, t]) => /Historical trend/i.test(t))).toBe(false);
    expect(NAV.some(([id]) => id === "history")).toBe(false);
    expect(readFileSync(join(__dirname, "Sections3.tsx"), "utf8")).not.toContain("Margins and returns against their own history");
  });
  it("every main section has its number, in the order of the page", () => {
    const m = new Map(numbered().map(([n, t]) => [t.split(" · ")[0], n]));
    const want: [string, number][] = [["Company overview", 1], ["Macro and sector outlook", 2], ["What's going well and what to watch", 3], ["Price & technicals", 4], ["Latest quarter", 5], ["Financials", 6], ["Trends", 7],
      ["Chart lab", 8], ["Ratios", 9], ["DuPont analysis", 10], ["Earnings & cash quality", 11], ["Ownership", 12], ["Peers", 13], ["Gold insights", 14],
      ["Segments", 15], ["Dividends & events", 16], ["Pros, cons & Prism history", 17], ["Community", 18]];
    for (const [t, n] of want) expect(m.get(t), t).toBe(n);
  });
  it("Where it stands replaces Sector & peers and Leadership, after Peers and before Gold insights, in the report and in the section bar", () => {
    const ids = NAV.map(([id]) => id);
    expect(ids).not.toContain("leadership");
    expect(NAV.find(([id]) => id === "sector")?.[1]).toBe("Where it stands");
    const page = readFileSync(join(__dirname, "StockPage.tsx"), "utf8");
    expect(page).not.toContain("<LeadershipSection"); expect(page).not.toContain("<SectorPeersSection");
    expect(page.indexOf("<WhereStands")).toBeGreaterThan(page.indexOf("<PeersSection"));
    expect(page.indexOf("<WhereStands")).toBeLessThan(page.indexOf("<InsightsSection"));
  });
  it("Community discussions is the last section of the report, after Pros & cons (task #113), in the page and in the section bar", () => {
    const page = readFileSync(join(__dirname, "StockPage.tsx"), "utf8");
    const at = (tag: string) => page.indexOf(tag);
    expect(at("<CommunitySection symbol")).toBeGreaterThan(at("<MethodSection"));
    for (const tag of ["<BusinessSection", "<PriceSection", "<DividendsSection", "<MethodSection"]) expect(at(tag), tag).toBeLessThan(at("<CommunitySection symbol"));
    const ids = NAV.map(([id]) => id);
    expect(ids[ids.length - 1]).toBe("community"); expect(ids[ids.length - 2]).toBe("method");
  });
});
