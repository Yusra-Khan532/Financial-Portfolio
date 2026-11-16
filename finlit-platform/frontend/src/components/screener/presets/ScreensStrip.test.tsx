// @vitest-environment jsdom
// Task #64, N-38 (14 Nov file, version 4): the Ready-made screens strip on Basic and Advanced.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../../../lib/ui", () => ({ useUI: () => ({ upgrade: vi.fn(), has: () => true, toast: vi.fn() }) }));
import { ScreensStrip, closeDay, figureText } from "./ScreensStrip";
import { usePresetRoute } from "./usePresetRoute";

const P = (id: string, name: string, group: string, o = {}) => ({ id, name, group, cardText: name + " text", count: 25, asOf: "2026-11-12", status: "live", blockedReason: null, chips: [], howItWorks: [], locked: false, figure: "FinLit IQ", ...o });
const F = (pairs: [string, number | null][]) => pairs.map(([name, value]) => ({ symbol: name.toUpperCase().replace(/\s/g, ""), name, value }));
const LIST = { asOf: "2026-11-12", tab: "basic", groups: [
  { id: "trend", name: "Trend", presets: [P("up", "Uptrend", "trend", { joined: 0, first: F([["Alpha", 71], ["Beta", 70], ["Gamma", 66]]) })] },
  { id: "top-rated", name: "Top rated", presets: [
    P("t-large", "Top 10 large caps", "top-rated", { top10: true, count: 19, joined: 3, first: F([["Indrav Infotech", 90], ["Kovrik", 88], ["Parvik Bank", 88]]) }),
    P("both", "Strong on both", "top-rated", { joined: 0, first: F([["Udvel", 87]]) })] },
  { id: "setups", name: "New highs", presets: [P("nh", "Closed above its range", "setups", { figure: "From 52-week high", count: 23, joined: 4, first: F([["Lorvik", 0], ["Quinra", 1.6], ["Velmora", null]]) })] },
  { id: "top-gainers", name: "Top gainers", presets: [P("g1", "Top gainers: 1 week", "top-gainers", { figure: "Since it joined", count: 20, first: F([["Up Co", 4.8], ["Down Co", -1.25]]) })] },
  { id: "prism-basics", name: "Prism basics", presets: [P("pb", "Basics", "prism-basics")] },
] };
let body: unknown = LIST;
beforeEach(() => { body = LIST; vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as unknown as Response)); });
afterEach(cleanup);
const Where = () => { const l = useLocation(); return <output data-testid="loc">{l.search}</output>; };
const Strip = () => { const r = usePresetRoute("basic"); return <ScreensStrip route={r} />; };
const mount = (qs = "") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/score-screener" + qs]}><Strip /><Where /></MemoryRouter></QueryClientProvider>);

describe("Ready-made screens strip", () => {
  it("has the header in the team's words with the close it was built on, and Top rated open first with a crown", async () => {
    mount();
    await screen.findAllByRole("tab");
    const strip = screen.getByRole("region", { name: "Ready-made screens" });
    expect(within(strip).getByRole("heading", { name: "Ready-made screens" })).toBeTruthy();
    expect(strip.textContent).toContain("Lists FinLit builds after every close. Pick one to see the companies that made it, and who joined since yesterday.");
    expect(strip.textContent).toContain("Updated after the 12 Nov close");
    const tabs = within(strip).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.replace(/\d+$/, "").trim())).toEqual(["Top rated", "Trend", "New highs", "Top gainers"]);   // Top rated first even when the API sends it later; Prism basics stays in the panel
    const top = tabs[0];
    expect(top.getAttribute("aria-selected")).toBe("true");
    expect(top.className).toContain("is-crown");
    expect(top.querySelector(".rms-crown")).toBeTruthy();
    expect(tabs[1].querySelector(".rms-gic")).toBeTruthy();       // every other group has its icon
    expect(tabs[2].querySelector(".rms-gic")).toBeTruthy();
  });

  it("shows a Top 10 card deep green with the crown badge, TOP 10 tag, pass count, joined count, first three with scores and See the 10", async () => {
    mount();
    const card = (await screen.findByText("Top 10 large caps")).closest("button")!;
    expect(card.className).toContain("is-top");
    expect(card.querySelector(".rms-cbadge .rms-crown")).toBeTruthy();
    expect(card.textContent).toContain("Start here");                  // no screen on yet: the first card says where to start
    expect(card.textContent).toContain("Top 10 of 19 that pass");
    expect(card.textContent).toContain("+3 joined since yesterday");
    expect(card.textContent).toMatch(/First 3FinLit IQ/);
    expect([...card.querySelectorAll(".rms-pr")].map((r) => r.textContent)).toEqual(["Indrav Infotech90", "Kovrik88", "Parvik Bank88"]);
    expect(card.textContent).toContain("See the 10 →");
    const star = screen.getByText("Strong on both").closest("button")!;
    expect(star.className).toContain("is-star");
    expect(star.textContent).toContain("★");
    expect(star.textContent).not.toContain("joined since yesterday");  // 0 joined: no badge
    expect(star.textContent).toContain("See all 25 →");
  });

  it("other groups are plain cards with their icon and the right figure: distance from the high, change since it joined", async () => {
    mount();
    fireEvent.click(await screen.findByRole("tab", { name: /New highs/ }));
    const nh = screen.getByText("Closed above its range").closest("button")!;
    expect(nh.className).toContain("is-plain");
    expect(nh.querySelector(".rms-ic .rms-gic")).toBeTruthy();
    expect(nh.textContent).toContain("23 match");
    expect(nh.textContent).toContain("+4 joined since yesterday");
    expect(nh.textContent).toMatch(/First 3From 52-week high/);
    expect([...nh.querySelectorAll(".rms-pr")].map((r) => r.textContent)).toEqual(["Lorvikat high", "Quinra−1.6%", "Velmora—"]);
    expect(nh.querySelector(".rms-pr i[title]")?.getAttribute("title")).toMatch(/Not available/);      // a blank says why
    fireEvent.click(screen.getByRole("tab", { name: /Top gainers/ }));
    const g = screen.getByText("Top gainers: 1 week").closest("button")!;
    expect([...g.querySelectorAll(".rms-pr")].map((r) => r.textContent)).toEqual(["Up Co+4.8%", "Down Co−1.3%"]);
  });

  it("a click opens the list below and the chosen card says so", async () => {
    mount();
    fireEvent.click((await screen.findByText("Top 10 large caps")).closest("button")!);
    expect(screen.getByTestId("loc").textContent).toContain("preset=t-large");
    cleanup();
    mount("?preset=t-large");
    const card = (await screen.findByText("Top 10 large caps")).closest("button")!;
    expect(card.className).toContain("is-on");
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(card.textContent).toContain("✓ Showing below");
    expect(card.textContent).toContain("Showing below ↓");
    expect(card.textContent).not.toContain("See the 10");
    expect(card.textContent).not.toContain("Start here");
  });

  it("a list not built yet, and a card below the plan, say why instead of showing numbers", async () => {
    body = { ...LIST, groups: [{ id: "top-rated", name: "Top rated", presets: [P("t", "Top 10 large caps", "top-rated", { top10: true, count: null, first: undefined }), P("l", "Strong on both", "top-rated", { locked: true, count: null })] }] };
    mount();
    const card = (await screen.findByText("Top 10 large caps")).closest("button")!;
    expect(card.textContent).toContain("The list is not built yet");
    expect(card.textContent).not.toContain("See the 10");
    expect(screen.getByText("Strong on both").closest("button")!.textContent).toContain("Part of Silver");
  });

  it("formats each figure and day as the cards show them", () => {
    expect(closeDay("2026-11-12")).toBe("12 Nov");
    expect(closeDay(null)).toBeNull();
    expect(figureText("From 52-week high", 0.02)).toEqual({ t: "at high", up: true });
    expect(figureText("From 52-week high", 2.4).t).toBe("−2.4%");
    expect(figureText("Since it joined", 4.8)).toEqual({ t: "+4.8%", up: true });
    expect(figureText("FinLit Prism", 81.6).t).toBe("82");
  });

  it("the crown's nod stops with reduced motion, the cards scroll sideways on a phone, and nothing advises", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/readyScreens.css"), "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.rms-cw \.rms-crown, \.rms-cbadge \.rms-crown \{ animation: none; \}/);
    expect(css).toMatch(/@media \(max-width: 700px\) \{[\s\S]*\.rms-cards \{ display: flex; overflow-x: auto; scroll-snap-type: x mandatory;[\s\S]*\.rms-card \{ flex: 0 0 78%; scroll-snap-align: start; \}/);
    expect(css).toContain("#34493E"); expect(css).toContain("#EBD59F");
    const src = readFileSync(resolve(process.cwd(), "src/components/screener/presets/ScreensStrip.tsx"), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(src).not.toMatch(/\b(best|top picks?|buy|winners?)\b/i);
  });
});
