// @vitest-environment jsdom
// Task #122 (14 Nov 2026): the landing page's FinLit Prism part as the team drew it. One test per point of the task:
//   1. the layout of the first picture   2. the card larger than the old picture   3. the red-box line removed
//   4. the gold light on hover (second picture)   5. the new line "Beyond Ratios. A Statistical Model for Deeper Financial Analysis."
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { PrismShowcase } from "./PrismShowcase";
import { partTone, techPos } from "../lib/prismShowcase";

afterEach(cleanup);
const open = () => render(<MemoryRouter><PrismShowcase /></MemoryRouter>);
const css = readFileSync(join(__dirname, "..", "styles", "prism-showcase.css"), "utf8");

describe("task #122: the landing page's FinLit Prism part", () => {
  it("5. uses the new line instead of 'Financial health in four parts'", () => {
    open();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Beyond Ratios. A Statistical Model for Deeper Financial Analysis.");
    expect(document.body.textContent).not.toMatch(/Financial health in four parts/);
    expect(readFileSync(join(__dirname, "..", "pages", "Home.tsx"), "utf8")).not.toContain("Financial health in four parts");
  });
  it("3. has no red-box line under the title", () => {
    open();
    expect(document.body.textContent).not.toMatch(/A single view of a company's business strength, financial quality and price momentum/);
  });
  it("1. has the first picture's parts: the pill, three feature items, and the card with its three blocks", () => {
    open();
    expect(screen.getByText("FinLit Prism", { selector: ".hpz-pill" })).toBeTruthy();
    const feats = within(screen.getByRole("list", { name: "What FinLit Prism reads" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(feats).toEqual(["4 Fundamental AreasGrowth, Valuation, Quality, Risk", "2 Technical ViewsShort term (5–20) & Long term (6–18 months)", "One Health ScoreA consolidated view of overall strength"]);
    const fund = screen.getByRole("region", { name: "Fundamental analysis" });
    for (const t of ["Fundamental analysis", "Evaluates business and financial strength across four areas.", "Sample Reading", "59.4", "/ 100", "Cumulative fundamental score"]) expect(within(fund).getAllByText(t).length).toBeGreaterThan(0);
    const parts = within(within(fund).getByRole("list", { name: "The four parts" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(parts).toEqual(["Growth & ProfitabilityAverage", "ValuationWeak", "QualityHealthy", "RiskStrong"]);
    const tech = screen.getByRole("region", { name: "Technical analysis" });
    for (const t of ["Technical short term", "5–20 sessions", "+29", "▲ Uptrend", "Technical long term", "6–18 months", "−55", "▼ Strong downtrend"]) expect(within(tech).getByText(t)).toBeTruthy();
    const all = screen.getByRole("region", { name: "Overall financial health" });
    expect(within(all).getByText("Overall Financial Health")).toBeTruthy();
    expect(within(all).getByText("Combines fundamental and technical views for a unified read on strength and momentum.")).toBeTruthy();   // the picture's words (founder, 14 Nov 2026)
    expect(screen.getByText("Reliance Industries on FinLit Prism, 6 Nov 2026. Shown as an example, not a recommendation.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open FinLit Prism/ }).getAttribute("href")).toBe("/prism");
  });
  it("4. hovering a feature item lights it and its block in gold, and focusing it does the same", () => {
    open();
    const item = (k: string) => document.querySelector(`.hpz-feat[aria-describedby="hpz-b-${k}"]`) as HTMLElement;
    const block = (k: string) => document.getElementById(`hpz-b-${k}`) as HTMLElement;
    for (const k of ["fund", "tech", "overall"]) {
      fireEvent.mouseEnter(item(k));
      expect(item(k).className).toContain("lit"); expect(block(k).className).toContain("lit");
      for (const o of ["fund", "tech", "overall"].filter((x) => x !== k)) { expect(block(o).className).not.toContain("lit"); expect(item(o).className).not.toContain("lit"); }
      fireEvent.mouseLeave(item(k));
      expect(block(k).className).not.toContain("lit");
    }
    fireEvent.focus(item("tech")); expect(block("tech").className).toContain("lit");
    fireEvent.mouseEnter(block("overall")); expect(item("overall").className).toContain("lit");   // and the other way round: the block lights its item
    expect(css).toMatch(/\.hpz-feat\.lit \{[^}]*border-color: var\(--hpz-glow\)/);
    expect(css).toMatch(/\.hpz-blk\.lit \{[^}]*border-color: var\(--hpz-glow\)/);
  });
  it("2. draws the card larger than the old 980 px picture", () => {
    const w = Number(/\.hpz-card \{[^}]*max-width: (\d+)px/.exec(css)?.[1]);
    expect(w).toBeGreaterThan(980);
    expect(readFileSync(join(__dirname, "..", "styles", "human-home.css"), "utf8")).not.toContain(".hh-prism-fig");   // the old picture's frame is gone
  });
  it("shows the sample's words in their colour families and the technical marks where they belong", () => {
    expect([partTone("Average"), partTone("Weak"), partTone("Healthy"), partTone("Strong"), partTone("Poor")]).toEqual(["gold", "red", "green", "green", "red"]);
    expect([techPos(29), techPos(-55), techPos(-100), techPos(100)]).toEqual([64.5, 22.5, 0, 100]);
  });
});
