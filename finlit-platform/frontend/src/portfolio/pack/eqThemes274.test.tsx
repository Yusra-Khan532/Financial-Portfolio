// @vitest-environment jsdom
// Task #274 (the 20 Nov equity pack, change 20): Themes, from Discover. Each placed share's main theme; the themes only mentioned; per theme Discover's own
// counts, the 3-month median and the long-term uptrend count of its companies (only rated ones: none on a plan without Prism shows "–", never "0 of N");
// the shares not placed yet; three things to know; and the pill in the table that opens the theme with the company found.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ThemePill, themeCards, themeView } from "./EqThemes";
import type { Board } from "../../discovery/model";

afterEach(cleanup);
const row = (s: string, th: string, st = "Operating", sec: string[] = []) => ({ s, n: s + " Ltd", th, sec, st, tone: 0, fc: 1, ev: {}, mac: null, ind: null, dd: null, pg: null, grp: null });
const board = { updated: "2026-11-20T21:37:24+00:00", companies: 6, read: 6, days: 90, efil: {}, events: [], eventsTracked: [], caution: "", method: "",
  rows: [row("TECHM", "AI & GenAI"), row("ZENSARTECH", "AI & GenAI"), row("PERSISTENT", "AI & GenAI"), row("OTHERAI", "AI & GenAI"), row("APOLLO", "Defence & Aerospace", "Under execution"),
    row("AEROFLEX", "Cloud & Data Centres", "Operating", ["Industrial Manufacturing & Capex"])],
  themes: [{ name: "AI & GenAI", label: "AI & GenAI", short: "AI & GenAI", broad: false, n: 125, also: 38, news: { filings: 0, positive: 0, negative: 0 }, verify: [], merged: [] },
    { name: "Defence & Aerospace", label: "", short: "Defence", broad: false, n: 9, also: 11, news: { filings: 0, positive: 0, negative: 0 }, verify: [], merged: [] },
    { name: "Cloud & Data Centres", label: "", short: "Cloud & Data Centres", broad: false, n: 2, also: 10, news: { filings: 0, positive: 0, negative: 0 }, verify: [], merged: [] },
    { name: "Industrial Manufacturing & Capex", label: "", short: "Manufacturing", broad: false, n: 438, also: 106, news: { filings: 0, positive: 0, negative: 0 }, verify: [], merged: [] }],
} as unknown as Board;
const uni = [["TECHM", 9.4, "Uptrend"], ["ZENSARTECH", 10.2, "Sideways"], ["PERSISTENT", 5.0, "Strong uptrend"], ["OTHERAI", -8, "Downtrend"], ["APOLLO", 11.5, "Uptrend"], ["AEROFLEX", 1.2, null]]
  .map(([symbol, r, lt]) => ({ symbol, ret_3m: r, prism_lt: lt })) as never;
const MINE = ["TECHM", "ZENSARTECH", "PERSISTENT", "APOLLO", "AEROFLEX", "INFY", "526433"];

describe("themeView", () => {
  const v = themeView(board, uni, MINE);
  it("places 5 of 7, the largest theme first, with Discover's counts", () => {
    expect([v.placed, v.total]).toEqual([5, 7]);
    expect(v.themes.map((t) => [t.short, t.mine.length, t.n, t.also])).toEqual([["AI & GenAI", 3, 125, 38], ["Defence", 1, 9, 11], ["Cloud & Data Centres", 1, 2, 10]]);
    expect(v.notPlaced).toEqual(["INFY", "526433"]);
  });
  it("the theme's 3-month median and long-term uptrend count over its own companies", () => {
    const ai = v.themes[0];
    expect(ai.m3).toBeCloseTo(7.2, 1);      // median of 9.4, 10.2, 5.0, -8
    expect([ai.up, ai.rated]).toEqual([2, 4]);
    expect(v.themes[2].rated).toBe(0);     // no trend reading: the page shows "–", not "0 of 2"
  });
  it("themes only mentioned are listed apart, with who mentions them", () => {
    expect(v.mentionOnly).toEqual([{ name: "Industrial Manufacturing & Capex", short: "Manufacturing", slug: "industrial-manufacturing-and-capex", mine: ["AEROFLEX"] }]);
  });
  it("three things to know, described and never advised", () => {
    const c = themeCards(v);
    expect(c.map((x) => x.title)).toEqual(["Three of your shares share one theme: AI & GenAI", "2 of 5 moved more than their theme in 3 months", "4 of 5 placed shares are already operating in their theme"]);
    expect(c.map((x) => x.title + x.text).join(" ")).not.toMatch(/\b(buy|sell|hold|avoid|reduce|accumulate|target)\b/i);
  });
});

describe("the theme pill", () => {
  it("shows the short name and opens the theme with the company found; nothing for a company not placed", () => {
    render(<MemoryRouter><ThemePill t={{ short: "AI & GenAI", slug: "ai-and-genai", name: "AI & GenAI" }} name="Tech Mahindra Ltd" /><ThemePill t={null} name="Infosys" /></MemoryRouter>);
    const a = screen.getByRole("link"); expect(a.textContent).toBe("AI & GenAI");
    expect(a.getAttribute("href")).toBe("/discover/themes/ai-and-genai?q=Tech%20Mahindra%20Ltd");
  });
});
