// @vitest-environment jsdom
// Task #454 (team, 28 Nov 2026): "colour coding is missing. make proper colour coding" (red box: Volatility 3 yrs, Biggest fall, Rank 3 yrs).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { COLOUR_KEY, ResultTable, rankTone, signTone, volTone } from "./Results";
import { DEFAULTS, type ScreenRow } from "../../lib/mfScreen";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);

const row = (over: Partial<ScreenRow>, x: Record<string, unknown> = {}): ScreenRow => ({
  code: 1, name: "Alpha Flexi Cap Fund", amc: "Alpha Mutual Fund", category: "Equity Scheme - Flexi Cap Fund", plan: "Direct", option: "Growth",
  nav: 96.5, navDate: "2026-11-26", active: true, r1y: 0.016, r3y: -0.02, r5y: 0.126, ter: 0.6, aum: 100000, fall3y: -10.1,
  x: { risk: { vol3: 10.1, volRel: 0.8 }, rank: { "1y": null, "3y": { rank: 3, of: 33 }, "5y": null }, ...x }, ...over,
} as unknown as ScreenRow);

function cells(r: ScreenRow) {
  render(<MemoryRouter><ResultTable rows={[r]} q={DEFAULTS} onSort={() => {}} loading={false}
    score={{ gold: true, items: new Map(), loading: false }} pick={{ picked: [], onPick: () => {} }} /></MemoryRouter>);
  const heads = [...document.querySelectorAll(".mfs-table thead th")].map((th) => th.textContent!.replace(/[▲▼]/g, "").trim());
  const tds = [...document.querySelectorAll(".mfs-table tbody tr")[0].children];
  return (label: string) => tds[heads.indexOf(label)] as HTMLElement;
}

describe("task #454: the screener's colour rule", () => {
  it("the three columns in the red box are coloured, with the reason on hover", () => {
    const at = cells(row({}));
    expect(at("Volatility 3 yrs").querySelector(".mfs-t-pos")!.getAttribute("title")).toMatch(/moved less than most funds of its category \(0\.80x/);
    expect(at("Biggest fall").querySelector(".mfs-t-neg")!.textContent).toBe("−10.1%");
    expect(at("Rank 3 yrs").querySelector(".mfs-t-pos")!.textContent).toBe("3 of 33");
  });
  it("returns follow the same rule (green gain, red loss); expense and size stay plain", () => {
    const at = cells(row({}));
    expect(at("1 year").querySelector(".mfs-t-pos")).toBeTruthy();
    expect(at("3 yrs a year").querySelector(".mfs-t-neg")).toBeTruthy();
    expect(at("Expense").querySelector("[class^='mfs-t-']")).toBeNull();
    expect(at("Size").querySelector("[class^='mfs-t-']")).toBeNull();
  });
  it("a dash is never coloured", () => {
    const at = cells(row({ fall3y: null } as Partial<ScreenRow>, { risk: { vol3: null, volRel: null }, rank: { "1y": null, "3y": null, "5y": null } }));
    for (const l of ["Volatility 3 yrs", "Biggest fall", "Rank 3 yrs"]) {
      expect(at(l).querySelector(".mf-na")!.textContent).toBe("—");
      expect(at(l).querySelector("[class^='mfs-t-']")).toBeNull();
    }
  });
  it("the thresholds: volatility 0.9x / 1.1x of the category median, rank by thirds, returns by sign", () => {
    expect([volTone(0.89).t, volTone(0.9).t, volTone(1.1).t, volTone(1.11).t, volTone(null).t]).toEqual(["pos", "", "", "neg", ""]);
    expect([rankTone({ rank: 11, of: 33 }).t, rankTone({ rank: 12, of: 33 }).t, rankTone({ rank: 22, of: 33 }).t, rankTone({ rank: 23, of: 33 }).t]).toEqual(["pos", "", "", "neg"]);
    expect(rankTone({ rank: 1, of: 2 }).t).toBe("");
    expect([signTone(0.1).t, signTone(-0.1).t, signTone(0).t, signTone(null).t]).toEqual(["pos", "neg", "", ""]);
  });
  it("the rule is printed under the table, in describing words only", () => {
    cells(row({}));
    expect(document.querySelector("[data-testid=colour-key]")!.textContent).toBe(COLOUR_KEY);
    expect(COLOUR_KEY).toMatch(/do not rate the fund/);
    expect(COLOUR_KEY).not.toMatch(/\b(buy|sell|hold|avoid|best|target)\b/i);
  });
  it("uses the site's gain and loss colours, scoped to the screener table", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/task454.css"), "utf8");
    expect(css).toMatch(/\.mfs-table td\.num \.mfs-t-pos \{ color: var\(--gain\); \}/);
    expect(css).toMatch(/\.mfs-table td\.num \.mfs-t-neg \{ color: var\(--loss\); \}/);
  });
});
