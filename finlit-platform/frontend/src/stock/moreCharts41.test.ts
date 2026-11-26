// Developer file 41, the founder's check (26 Nov 2026): "check each and everything: font, spacing, font size, boxes, formatting, table formatting, i button".
// The old Chart lab's charts now sit in Price & technicals, Financials and Dividends, so they take those sections' look; their labels never collide.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labelLines, yearLabels } from "../charts/Atlas";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const more = read("stock/MoreCharts.tsx");
const cardsWith = (ac: string) => [...more.matchAll(new RegExp(`<Card ac="${ac}" help="([a-z0-9-]+)"`, "g"))].map((m) => m[1]);

describe("the moved cards take their section's colour (Chart lab drew them all in gold)", () => {
  it("Price & technicals' pink for the price statistics, Financials' green for the statement charts, the gold of Dividends for the timeline", () => {
    expect(cardsWith("--p-tech")).toEqual(["monthly-returns", "drawdown", "volatility", "daily-histogram", "daily-box"]);
    expect(cardsWith("--p-growth")).toEqual(["pl-waterfall", "pl-margin-split", "yoy-growth", "bs-assets", "bs-treemap", "cf-bridge"]);
    expect(more).toContain('<Card help="events-timeline"');                                   // the default, gold, as Dividends' own cards
    const page = read("stock/Sections.tsx");
    expect(page).toContain('<SectionHead id="price" no="Price & technicals" icon="line" tier="basic"');
    expect(page.match(/color="--p-tech"/g)!.length).toBeGreaterThan(0);
    expect(page.match(/color="--p-growth"/g)!.length).toBeGreaterThan(0);
  });
  it("the price statistics' label shows its plan, as the section headings and the Momentum card do", () => {
    expect(read("stock/Sections.tsx")).toContain('<p className="label rp-more-h">Price statistics <TierChip tier={PLAN_FOR_REPORT_EXTRAS} /></p>');
  });
  it("the cash bridge (four steps) is drawn at the box's width when each step has room, so a phone sees the whole bridge", () => {
    // developer file 42: the profit steps are rows now (stock/ProfitCharts.tsx ProfitBridge), so only the cash bridge is a waterfall
    expect(more.match(/<Waterfall steps=\{steps\} fmt=\{crf\}( height=\{250\})? fit \/>/g)).toHaveLength(1);
  });
});

describe("chart labels never run into each other", () => {
  it("a waterfall step's name stays on one line when it fits, else breaks after its first word (or its first two, when those fit)", () => {
    expect(labelLines("Operating profit", 120)).toEqual(["Operating profit"]);
    expect(labelLines("Operating profit", 66)).toEqual(["Operating", "profit"]);
    expect(labelLines("Profit before tax", 90)).toEqual(["Profit before", "tax"]);
    expect(labelLines("Net change in cash", 70)).toEqual(["Net change", "in cash"]);
    expect(labelLines("Depreciation", 40)).toEqual(["Depreciation"]);                              // one word cannot break
  });
  it("the timeline keeps a year label only when it clears the next one on screen (a phone drops the first year pinned to the edge)", () => {
    const years = ["2010", "2011", "2012"], at = (y: string) => ({ "2010": 24, "2011": 30, "2012": 90 })[y]!;
    expect(yearLabels(years, at, 1.17).map(([y]) => y)).toEqual(["2011", "2012"]);              // 24 and 30 units overlap at any width
    const at2 = (y: string) => ({ "2010": 24, "2011": 65, "2012": 135 })[y]!;
    expect(yearLabels(years, at2, 1.17).map(([y]) => y)).toEqual(["2010", "2011", "2012"]);   // a desktop has room for all three
    expect(yearLabels(years, at2, 0.68).map(([y]) => y)).toEqual(["2011", "2012"]);           // a phone drops the first
  });
});
