// @vitest-environment jsdom
// Task #228: the AI summary button under the FinLit Prism cards of the company page. Team note, 19 Nov 2026: "it is just showing numbers, i dont
// want it to show numbrrs but meaning of it; also give limit for this AI summarize limit to 10 keeping it seperate from chatbot question limit".
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FORBIDDEN, type TechAssessment } from "../lib/prismTechnical";

type Allow = { limit: number; used: number; left: number; resets: string };
let auth: { user: { id: string; role: string } | null; plan: string } = { user: null, plan: "basic" };
let quota: { enabled: boolean; left?: number; limit?: number; summary?: Allow } | undefined;
const asked: { symbol: string }[] = [];
const questions: string[] = [];
let mode: "stream" | "refuse" = "stream";
vi.mock("../lib/auth", () => ({ useAuth: () => auth }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<object>()), apiGet: vi.fn(async (p: string) => { if (p === "/api/ask/quota") return quota; throw new Error("not mocked " + p); }) }));
vi.mock("../lib/askAi", async (orig) => {
  const real = await orig<typeof import("../lib/askAi")>();
  return {
    ...real,
    askAi: vi.fn(async (q: string) => { questions.push(q); }),
    askSummary: vi.fn(async (symbol: string, on: (e: unknown) => void) => {
      asked.push({ symbol });
      if (mode === "refuse") throw new real.AskRefused(429, "quota_used", "You have used all 10 AI summaries of this month. They renew on 01 Dec 2026. Your FinLit AI questions are counted separately.", {});
      on({ type: "status", text: "Reading the company page (RELIANCE)" });
      on({ type: "text", text: "Reliance's finances are sound: borrowing is low. " });
      on({ type: "text", text: "The share price looks high against its earnings." });
      on({ type: "done", disclaimer: "x", sources: [] });
    }),
  };
});
import { PrismAiSummary, cardSummary } from "./PrismAiSummary";

const R = { final: 58.1, label: "AVERAGE", status: "RATED", parts: { fundamental: 58, valuation: 35, quality: 79, risk: 86 }, confidence: 1 } as never;
const PARTS = [
  { key: "fundamental", name: "Growth & Profitability", color: "", value: 58 }, { key: "valuation", name: "Valuation", color: "", value: 34.6 },
  { key: "quality", name: "Quality", color: "", value: 79 }, { key: "risk", name: "Risk", color: "", value: 86 },
];
const hz = (score: number | null, rating: string) => ({ score, rating, status: "ready", horizon: null, availableCount: 1, requiredCount: 1, stageCapped: false, provisional: false, provisionalNote: null, uncappedScore: null, divisor: null, factors: [] });
const TECH = { shortTerm: hz(38, "UPTREND"), longTerm: hz(-32, "DOWNTREND"), verdict: { label: null, tone: null } } as unknown as TechAssessment;
const ALLOW = (left: number): Allow => ({ limit: 10, used: 10 - left, left, resets: "2026-12-01" });

afterEach(() => { cleanup(); auth = { user: null, plan: "basic" }; quota = undefined; asked.length = 0; questions.length = 0; mode = "stream"; });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PrismAiSummary symbol="RELIANCE" name="Reliance Industries Ltd" r={R} parts={PARTS} a={TECH} /></MemoryRouter></QueryClientProvider>);

describe("AI summary under the FinLit Prism cards (task #228)", () => {
  it("the card summary is short pointers with bold labels and key words, in words, with no numbers: the team's card (58.1 Average, 58 / 35 / 79 / 86, +38 / −32)", () => {
    // task #228 rework 2 (20 Nov 2026): "make it in pointers its too big of a paragaph and highlight keywords"
    const ps = cardSummary("Reliance Industries Ltd", R, PARTS, TECH);
    expect(ps).toEqual([
      { head: "Overall", text: "Reliance Industries Ltd's business and finances read as mixed: some parts are sound while others weigh on it.", key: "read as mixed" },
      { head: "Quality, sound", text: "Borrowing is under control, interest is well covered and profits are backed by cash." },
      { head: "Risk, sound", text: "The share price has moved calmly, with smaller falls, ample trading and few pledged shares." },
      { head: "Growth & Profitability, in between", text: "Sales and profit growth and margins are middling." },
      { head: "Valuation, weighs on it", text: "The share price looks high against its earnings and its own history." },
      { head: "Price trend", text: "The price has been rising over the last few weeks, while the longer trend over months is down (bounce in a downtrend).", key: "bounce in a downtrend" },
    ]);
    const all = ps.map((p) => p.head + " " + p.text).join(" ");
    expect(all).not.toMatch(/\d/);                                              // "i dont want it to show numbrrs but meaning of it"
    expect(all).not.toMatch(FORBIDDEN);                                          // the site's own advice words (wording file)
    expect(all).not.toMatch(/\b(recommend|best)\b/i);
    for (const p of ps) expect(p.text.split(" ").length).toBeLessThanOrEqual(24);    // each pointer short, never a paragraph
  });

  it("every band of every part, a provisional or unrated card and missing trends all read in words, never in numbers", () => {
    for (const v of [10, 40, 55, 70, 90]) {
      const ps = cardSummary("X", { ...(R as object), label: "STRONG", status: "PROVISIONAL" } as never, PARTS.map((p) => ({ ...p, value: v })), null);
      expect(ps[0]).toEqual({ head: "Overall", text: "X's business and finances read as strong: most of what FinLit Prism measures is sound. A first view: some of the data it needs is missing.", key: "read as strong" });
      const all = ps.map((p) => p.head + " " + p.text).join(" ");
      expect(all).not.toMatch(/\d/);
      expect(all).not.toMatch(FORBIDDEN);
      expect(ps).toHaveLength(5);                                                // the overall pointer and one for each part
    }
    const nr = cardSummary("X", { final: null, label: "NOT RATED", status: "NOT RATED", parts: {} } as never, PARTS.map((p) => ({ ...p, value: null })), null);
    expect(nr).toEqual([{ head: "Overall", text: "X has no overall FinLit Prism rating at the moment: too little of the data it needs is available." }]);
    const gap = cardSummary("X", R, [...PARTS.slice(0, 3), { ...PARTS[3], value: null }], { ...TECH, shortTerm: hz(null, "") } as never);
    expect(gap).toContainEqual({ head: "Not enough data yet", text: "Risk." });
    expect(gap[gap.length - 1]).toEqual({ head: "Price trend", text: "The short-term view is not available; the longer trend over months is down." });
  });

  it("draws the pointers as a list with the labels and key words in bold", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    const box = screen.getByRole("region", { name: /Summary of the FinLit Prism rating of Reliance/ });
    const items = box.querySelectorAll("ul.pai-list > li");
    expect(items).toHaveLength(6);
    expect([...box.querySelectorAll("ul.pai-list b")].map((b) => b.textContent)).toEqual(["Overall:", "read as mixed", "Quality, sound:", "Risk, sound:",
      "Growth & Profitability, in between:", "Valuation, weighs on it:", "Price trend:", "bounce in a downtrend"]);
  });

  it("a visitor gets the card summary at once, said plainly, with the plans link and the disclaimer; FinLit AI is not asked", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    const box = screen.getByRole("region", { name: /Summary of the FinLit Prism rating of Reliance/ });
    expect(box.textContent).toContain("read as mixed");
    expect(box.textContent).not.toMatch(/58\.1|out of 100/);
    expect(box.textContent).toContain("An AI summary from FinLit AI (10 a month) is part of the Silver and Gold plans");
    expect(screen.getByRole("link", { name: "Compare plans" }).getAttribute("href")).toBe("/plans");
    expect(box.textContent).toContain("not a recommendation");
    expect(asked).toEqual([]);
  });

  it("a Gold member gets FinLit AI's summary of what the card means, streamed in place, from the 10 AI summaries, never from the questions", async () => {
    auth = { user: { id: "u1", role: "investor" }, plan: "gold" }; quota = { enabled: true, left: 97, limit: 100, summary: ALLOW(7) };
    show();
    expect(await screen.findByText(/7 of 10 AI summaries left this month, apart from your FinLit AI questions/)).toBeTruthy();
    expect(screen.queryByText(/97 of 100/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    const box = await screen.findByRole("region", { name: /AI summary of the FinLit Prism rating of Reliance/ });
    await waitFor(() => expect(box.textContent).toContain("The share price looks high against its earnings."));
    expect(asked).toEqual([{ symbol: "RELIANCE" }]);                             // the summary call: the server writes what is asked
    expect(questions).toEqual([]);                                               // not a FinLit AI question
    expect(box.textContent).toContain("not a recommendation");
    expect(screen.getByRole("button", { name: /Summarise again/ })).toBeTruthy();
  });

  it("the AI summaries used up: the card summary in words, with when they renew and that the questions are separate, even with questions left", async () => {
    auth = { user: { id: "u3", role: "investor" }, plan: "silver" }; quota = { enabled: true, left: 40, limit: 50, summary: ALLOW(0) };
    show();
    await screen.findByText(/What this card means, in a few lines$/);
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    const box = screen.getByRole("region", { name: /^Summary of/ });
    expect(box.textContent).toMatch(/You have used this month's 10 AI summaries \(they renew on 1 Dec 2026\), so this summary is written from the card itself\. Your FinLit AI questions are counted separately\./);
    expect(box.textContent).toContain("read as mixed");
    expect(asked).toEqual([]);
  });

  it("a Basic member is not sent to FinLit AI; a refusal from the server falls back to the card summary with its reason", async () => {
    auth = { user: { id: "u2", role: "investor" }, plan: "basic" }; quota = { enabled: true, left: 0, limit: 0, summary: { limit: 0, used: 0, left: 0, resets: "2026-12-01" } };
    show();
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    expect(screen.getByRole("region", { name: /^Summary of/ }).textContent).toContain("part of the Silver and Gold plans");
    expect(asked).toEqual([]);
    cleanup();
    auth = { user: { id: "u4", role: "investor" }, plan: "silver" }; quota = { enabled: true, left: 3, limit: 50, summary: ALLOW(2) }; mode = "refuse";
    show();
    await screen.findByText(/2 of 10 AI summaries left/);
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    const box = await screen.findByRole("region", { name: /^Summary of/ });
    expect(box.textContent).toContain("You have used all 10 AI summaries of this month. They renew on 01 Dec 2026. Your FinLit AI questions are counted separately. Meanwhile, this summary is written from the card itself.");
  });
});
