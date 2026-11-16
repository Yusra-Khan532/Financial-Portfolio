// @vitest-environment jsdom
// Task #122 (14 Nov 2026): the landing page's FinLit Prism part as the team drew it. One test per point of the task:
//   1. the layout of the first picture   2. the card larger than the old picture   3. the red-box line removed
//   4. the gold light on hover (second picture)   5. the new line "Beyond Ratios. A Statistical Model for Deeper Financial Analysis."
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismShowcase } from "./PrismShowcase";
import { PRISM_SAMPLE, partTone, partWordOf, showcaseView, techPos, type ShowcaseReading } from "../lib/prismShowcase";

afterEach(cleanup);
// The live reading is asked of /api/prism/showcase; these first tests answer "none stored" so the card keeps its dated example (task #122's numbers).
let answer: { status: number; body: unknown } = { status: 404, body: { status: "none" } };
beforeEach(() => { answer = { status: 404, body: { status: "none" } }; vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } }))); });
afterEach(() => vi.unstubAllGlobals());
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PrismShowcase /></MemoryRouter></QueryClientProvider>);
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
  it("1. has the first picture's parts: the pill, the feature items, and the card with its blocks (two of each since task #149)", () => {
    open();
    expect(screen.getByText("FinLit Prism", { selector: ".hpz-pill" })).toBeTruthy();
    const feats = within(screen.getByRole("list", { name: "What FinLit Prism reads" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(feats).toEqual(["4 Fundamental AreasGrowth, Valuation, Quality, Risk", "2 Technical ViewsShort term (5–20) & Long term (6–18 months)"]);
    const fund = screen.getByRole("region", { name: "Fundamental analysis" });
    for (const t of ["Fundamental analysis", "Evaluates business and financial strength across four areas.", "Reliance Industries", "59.4", "/ 100", "Cumulative fundamental score"]) expect(within(fund).getAllByText(t).length).toBeGreaterThan(0);
    const parts = within(within(fund).getByRole("list", { name: "The four parts" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(parts).toEqual(["Growth & ProfitabilityAverage58", "ValuationWeak39", "QualityHealthy79", "RiskStrong86"]);   // the number of each part (task #153)
    const tech = screen.getByRole("region", { name: "Technical analysis" });
    for (const t of ["Technical short term", "5–20 sessions", "+29", "▲ Uptrend", "Technical long term", "6–18 months", "−55", "▼ Strong downtrend"]) expect(within(tech).getByText(t)).toBeTruthy();
    expect(screen.getByText("Reliance Industries on FinLit Prism, 6 Nov 2026. Shown as an example, not a recommendation.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open FinLit Prism/ }).getAttribute("href")).toBe("/prism");
  });
  it("4. hovering a feature item lights it and its block in gold, and focusing it does the same", () => {
    open();
    const item = (k: string) => document.querySelector(`.hpz-feat[aria-describedby="hpz-b-${k}"]`) as HTMLElement;
    const block = (k: string) => document.getElementById(`hpz-b-${k}`) as HTMLElement;
    for (const k of ["fund", "tech"]) {
      fireEvent.mouseEnter(item(k));
      expect(item(k).className).toContain("lit"); expect(block(k).className).toContain("lit");
      for (const o of ["fund", "tech"].filter((x) => x !== k)) { expect(block(o).className).not.toContain("lit"); expect(item(o).className).not.toContain("lit"); }
      fireEvent.mouseLeave(item(k));
      expect(block(k).className).not.toContain("lit");
    }
    fireEvent.focus(item("tech")); expect(block("tech").className).toContain("lit");
    fireEvent.mouseEnter(block("fund")); expect(item("fund").className).toContain("lit");   // and the other way round: the block lights its item
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

// Task #149 (14 Nov 2026): "remove the red box part completely". The picture boxes two things in red: the "One Health Score" feature item at the top
// and the "Overall Financial Health" strip at the foot of the card. Both are gone, with their styles; nothing else of the part changes.
describe("task #149: the One Health Score item and the Overall Financial Health strip are removed completely", () => {
  it("has no One Health Score item and no Overall Financial Health strip, words or score", () => {
    open();
    const items = within(screen.getByRole("list", { name: "What FinLit Prism reads" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.queryByRole("region", { name: /Overall financial health/i })).toBeNull();
    expect(document.getElementById("hpz-b-overall")).toBeNull();
    expect(document.body.textContent).not.toMatch(/One Health Score|consolidated view of overall strength|Overall Financial Health|unified read on strength and momentum/);
    expect(document.querySelectorAll(".hpz-blk")).toHaveLength(2);   // only Fundamental analysis and Technical analysis
    expect(screen.getAllByText("59.4")).toHaveLength(1);              // the score shows once, in the Fundamental ring
  });
  it("leaves no style behind for the removed parts, and lays the two items out in two columns", () => {
    expect(css).not.toMatch(/hpz-overall|hpz-total|hpz-bi\.green/);
    expect(css).toMatch(/\.hpz-feats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  });
});

// Task #153 (14 Nov 2026): "mention reliance actual score of all 4 pillars of fundmanetal and technical"; the founder: "daily live data numbers of reliance
// and also can be mentioned reliance compani's name". The card reads the showcase company's newest stored reading every day and shows each part's number.
const LIVE: ShowcaseReading = { symbol: "RELIANCE", name: "Reliance Industries Ltd", final: 59.05, label: "AVERAGE", status: "RATED", at: "2026-11-13", techAt: "2026-11-13",
  parts: { fundamental: 58.14, valuation: 38.21, quality: 78.89, risk: 85.58 }, st: { score: 26.6, word: "Uptrend" }, lt: { score: -41.8, word: "Downtrend" } };

describe("task #153: Reliance's live reading with the actual score of each part", () => {
  it("shows the live total, each part's number and word, both technical views, the company's name and the date", async () => {
    answer = { status: 200, body: LIVE };
    open();
    await waitFor(() => expect(screen.getByText(/13 Nov 2026/)).toBeTruthy());
    const fund = screen.getByRole("region", { name: "Fundamental analysis" });
    expect(within(fund).getByText("59.0")).toBeTruthy();   // one decimal, as the Prism page shows it expect(within(fund).getByText("Reliance Industries", { selector: ".hpz-sample" })).toBeTruthy();
    const parts = within(within(fund).getByRole("list", { name: "The four parts" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(parts).toEqual(["Growth & ProfitabilityAverage58", "ValuationWeak38", "QualityHealthy79", "RiskStrong86"]);
    const tech = screen.getByRole("region", { name: "Technical analysis" });
    for (const s of ["+27", "▲ Uptrend", "−42", "▼ Downtrend"]) expect(within(tech).getByText(s)).toBeTruthy();
    expect(screen.getByText("Reliance Industries on FinLit Prism, 13 Nov 2026. Updated daily. Shown as an example, not a recommendation.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/6 Nov 2026|Sample Reading/);
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/api\/prism\/showcase$/);
  });
  it("keeps the dated example, with its own date and its numbers, when no live reading can be read", async () => {
    answer = { status: 503, body: { status: "unavailable" } };
    open();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.getByText(PRISM_SAMPLE.caption)).toBeTruthy();
    const parts = within(screen.getByRole("list", { name: "The four parts" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(parts).toEqual(["Growth & ProfitabilityAverage58", "ValuationWeak39", "QualityHealthy79", "RiskStrong86"]);
  });
  it("never draws a half-filled card: a reading missing any figure keeps the example", () => {
    expect(showcaseView(LIVE)?.live).toBe(true);
    for (const bad of [{ ...LIVE, final: null }, { ...LIVE, label: "NOT RATED" }, { ...LIVE, at: null }, { ...LIVE, parts: { ...LIVE.parts, risk: null } },
      { ...LIVE, st: { score: null, word: null } }, { ...LIVE, lt: { score: 3, word: null } }]) expect(showcaseView(bad as ShowcaseReading)).toBeNull();
    expect(showcaseView(null)).toBeNull();
  });
  it("words each part on the Prism page's bands and names the technical-view date when it differs", () => {
    expect([80, 79.9, 65, 50, 49.9, 35, 34.9].map(partWordOf)).toEqual(["Strong", "Healthy", "Healthy", "Average", "Weak", "Weak", "Poor"]);
    expect(showcaseView({ ...LIVE, techAt: "2026-11-14" })!.caption).toBe("Reliance Industries on FinLit Prism, 13 Nov 2026 (technical views to 14 Nov 2026). Updated daily. Shown as an example, not a recommendation.");
  });
});
