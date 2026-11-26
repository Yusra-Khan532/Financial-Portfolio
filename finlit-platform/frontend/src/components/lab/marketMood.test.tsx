// @vitest-environment jsdom
// Trading Lab > Order Flow > Market mood: India's news and filings by day and sector, the most positive and negative items, and world
// headlines by topic, all scored by FinLit's sentiment model; hover cards; it describes tone and never forecasts.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { MarketMood, moodLine, tallyText, type Mood } from "./MarketMood";

const t = (pos: number, neg: number, neu: number) => ({ pos, neg, neu, total: pos + neg + neu, index: Math.round(((pos - neg) / (pos + neg + neu)) * 100) });
const M: Mood = {
  asOf: "2026-11-26T19:00:00+05:30", notes: [],
  india: {
    days: [{ day: "2026-11-24", ...t(30, 10, 60) }, { day: "2026-11-25", ...t(20, 25, 55) }, { day: "2026-11-26", ...t(40, 12, 48) }],
    latest: { day: "2026-11-26", ...t(40, 12, 48) }, week: t(90, 47, 163),
    sectors: [{ sector: "Information Technology", ...t(12, 2, 10) }, { sector: "Metals & Mining", ...t(3, 9, 8) }],
    mostPositive: [{ id: 1, title: "Infosys wins large deal", company: "Infosys", symbol: "INFY", source: "Exchange filing", link: "https://x/1", day: "2026-11-26", score: 0.91, band: "positive" }],
    mostNegative: [{ id: 2, title: "Plant shut after fire", company: "Some Metals", source: "Exchange filing", link: null, day: "2026-11-25", score: -0.84, band: "negative" }],
  },
  world: { at: "2026-11-26T18:30+00:00", overall: t(6, 9, 5), topics: [
    { key: "crude", name: "Crude oil", ...t(1, 3, 1), items: [{ title: "Crude at 3-week high on Gulf attacks", source: "Quantum", link: "https://x/2", at: "2026-11-26T18:34+00:00", score: -0.7, band: "negative" }] },
    { key: "fed", name: "US Federal Reserve", ...t(2, 1, 2), items: [{ title: "Fed speaker sees steady growth", source: "Reuters", link: null, at: "2026-11-26T15:00+00:00", score: 0.4, band: "positive" }] }] },
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
beforeEach(() => { urls.length = 0; vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); return json(M); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><MarketMood /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };

describe("Market mood, the words", () => {
  it("writes a tally and the day in one line", () => {
    expect(tallyText(t(54, 31, 125))).toBe("+11 (54 positive, 31 negative of 210)");
    expect(moodLine(M)).toBe("India's news this week +14 (90 positive, 47 negative of 300) · world headlines today −15 (6 positive, 9 negative of 20)");
  });
});

describe("Market mood, the tab", () => {
  it("reads the Lab's own route and shows the dials, the days, the sectors, the extremes and the world topics", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/mood"))).toBe(true);
    expect(screen.getAllByRole("img", { name: /mood .* on a scale from −100 to \+100/ })).toHaveLength(3);
    expect(document.querySelectorAll(".mood-day")).toHaveLength(3);
    expect(within(screen.getByRole("list", { name: "Mood by sector" })).getAllByRole("listitem")[0].textContent).toContain("Information Technology");
    expect(within(screen.getByRole("list", { name: "Most positive items" })).getByRole("link").getAttribute("href")).toBe("https://x/1");
    expect(screen.getByRole("article", { name: "Crude oil" }).textContent).toContain("Crude at 3-week high");
  });
  it("pointing at a day, a sector or a headline shows its detail", async () => {
    wrap(); await settle();
    point(document.querySelectorAll(".mood-day")[1]);
    let pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("25 Nov")).toBeTruthy(); expect(within(pop).getByText("−5")).toBeTruthy();
    point(within(screen.getByRole("list", { name: "Mood by sector" })).getAllByRole("listitem")[1]);
    expect(within(screen.getByRole("tooltip")).getByText("Metals & Mining")).toBeTruthy();
    point(within(screen.getByRole("list", { name: "Crude oil headlines" })).getByRole("listitem"));
    pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("−0.70")).toBeTruthy(); expect(pop.textContent).toContain("Crude at 3-week high on Gulf attacks");
  });
  it("describes tone and never forecasts", async () => {
    wrap(); await settle();
    const text = (document.querySelector(".mood")?.textContent ?? "").toLowerCase();
    for (const w of ["will rise", "will fall", "bullish", "bearish", "buy", "sell", "prediction"]) expect(text).not.toContain(w);
  });
});
