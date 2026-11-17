// @vitest-environment jsdom
// Task #193 (results calendar pack, 15 Nov): the pure helpers behind the four tiles, the day picker and Coming up, and the shared DropTile.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DropTile } from "../components/DropTile";
import { byDayLine, declaredByWeek, dueDays, growthTone, industryLines, lastDayLine, mondayOf, pickerDays, quarterLine, yoursTile } from "./resultsCalendar";

afterEach(cleanup);

describe("the four tiles' words", () => {
  it("Declared so far, by week: this week so far, the two weeks before, then everything earlier (pack: 9 to 15 Nov, 2 to 8 Nov, 26 Oct to 1 Nov, before)", () => {
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    const days = [{ date: "2026-11-15", n: 1 }, { date: "2026-11-14", n: 687 }, { date: "2026-11-09", n: 14 }, { date: "2026-11-08", n: 1 }, { date: "2026-11-02", n: 220 }, { date: "2026-11-01", n: 2 }, { date: "2026-10-26", n: 92 }, { date: "2026-10-25", n: 2 }, { date: "2026-11-19", n: 2 }];
    expect(declaredByWeek(days, "2026-11-15")).toEqual([{ label: "9 Nov to 15 Nov", n: 702 }, { label: "2 Nov to 8 Nov", n: 221 }, { label: "26 Oct to 1 Nov", n: 94 }, { label: "Before 26 Oct", n: 2 }]);
  });
  it("Due in the next 7 days: by day, soonest first", () => {
    const cal = [{ date: "2026-11-19", n: 2, names: [], due: true, quarter: null }, { date: "2026-11-16", n: 2, names: [], due: true, quarter: null }, { date: "2026-11-23", n: 1, names: [], due: true, quarter: null }, { date: "2026-11-14", n: 687, names: [], due: false, quarter: null }];
    const d = dueDays(cal, "2026-11-16", "2026-11-22");
    expect(byDayLine(d)).toBe("Mon 16 Nov · 2, Thu 19 Nov · 2");
    expect(pickerDays(cal, "2026-11-15").map((x) => x.label)).toEqual(["Sat 14 Nov · 687 declared"]);
  });
  it("Your companies and Last full day", () => {
    expect(yoursTile(14, 3, 17, 17, 0)).toEqual({ value: "All 17", unit: "reported", sub: "14 you hold · 3 you follow · none due this week", tone: "good" });
    expect(yoursTile(2, 0, 1, 2, 1).value).toBe("1 of 2");
    expect(yoursTile(0, 0, 0, 0, 0).value).toBe("None");
    expect(lastDayLine({ Strong: 54, Good: 38, "In line": 15, Weak: 38, Poor: 63, Loss: 124 }, 687, 332)?.sub).toBe("92 Strong or Good · 187 Poor or loss · 355 without figures yet");
    expect(lastDayLine(null, 687, 332)).toBeNull();
  });
  it("the one quarter line: the figures for Silver, the counts and the plan for Basic", () => {
    const t = { declared: 5166, companies: 5175, medianRevenueYoY: 16.8, medianProfitYoY: 11.1, beatShare: 34 };
    expect(quarterLine("Q2 FY27", t, false)).toBe("Quarter so far, Q2 FY27: typical revenue +16.8% · typical profit +11.1% · 34% beat their industry.");
    expect(quarterLine("Q2 FY27", { ...t, medianRevenueYoY: null, medianProfitYoY: null }, true)).toBe("Quarter so far, Q2 FY27: 5,166 of 5,175 companies declared · the growth figures open with Silver.");
  });
});

describe("Coming up", () => {
  it("the typical profit chip: green above +0.5%, red below −0.5%, grey between", () => {
    expect([6.2, 0.51, 0.5, 0, -0.1, -0.5, -0.51, -24].map(growthTone)).toEqual(["up", "up", "flat", "flat", "flat", "flat", "down", "down"]);
  });
  it("an industry cell that is not an industry says Industry not set, with what is known underneath; never (broad group)", () => {
    expect(industryLines("IT - Services")).toEqual({ main: "IT - Services", under: null, set: true });
    expect(industryLines("Macro sector: Information Technology")).toEqual({ main: "Industry not set", under: "Macro sector: Information Technology", set: false });
    expect(industryLines("Sector: Capital Goods")).toEqual({ main: "Industry not set", under: "Sector: Capital Goods", set: false });
    expect(industryLines(null)).toEqual({ main: "Industry not set", under: "No NSE classification", set: false });
  });
});

describe("DropTile (shared)", () => {
  it("label in capitals, one key number with its tone, a sub-line, a pill, and a ▾ button that opens a floating panel; Escape closes it", () => {
    render(<DropTile label="Declared so far" value="5,166" unit="of 5,175" tone="good" sub="99.8% in · 9 still due" pill={{ text: "+12 today", tone: "good" }} moreLabel="By size and week" more={<p>Detail</p>} />);
    expect(document.querySelector(".dtl-n")?.className).toContain("dtl-good");
    const btn = screen.getByRole("button", { name: /By size and week/ });
    const panel = document.querySelector(".dtl-panel")!;
    expect(panel.hasAttribute("hidden")).toBe(true);
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("hidden")).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel.hasAttribute("hidden")).toBe(true);
  });
});
