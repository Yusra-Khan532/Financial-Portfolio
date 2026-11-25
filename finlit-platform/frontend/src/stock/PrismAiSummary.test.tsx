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
  it("task #382: every figure is kept with its band, a one-line meaning and its detail: the team's card (58.1 Average, 58 / 34.6 / 79 / 86, +38 / −32)", () => {
    // task #228 rework 2: pointers with key words in bold; task #382 (24 Nov 2026) replaces its "no numbers": "Keep the numerical score prominent"
    const ps = cardSummary("Reliance Industries Ltd", R, PARTS, TECH);
    expect(ps.map((p) => [p.head, p.fig, p.band, p.tone, p.group])).toEqual([
      ["Overall", "58.1", "Average · Rated", "mixed", "score"],
      ["Quality", "79", "Healthy", "good", "score"], ["Risk", "86", "Strong", "good", "score"],
      ["Growth & Profitability", "58", "Average", "mixed", "score"], ["Valuation", "34.6", "Poor", "weak", "score"],
      ["Short-term trend", "+38", "Uptrend", "good", "price"], ["Long-term trend", "−32", "Downtrend", "weak", "price"],
      ["Alignment", undefined, "Bounce in a downtrend", "mixed", "price"],
    ]);
    expect(ps.map((p) => p.text)).toEqual([
      "Reliance Industries Ltd's business and finances read as mixed: some parts are sound while others weigh on it.",
      "Borrowing is under control, interest is well covered and profits are backed by cash.",
      "The share price has moved calmly, with smaller falls, ample trading and few pledged shares.",
      "Sales and profit growth and margins are middling.",
      "The share price looks high against its earnings and its own history.",
      "Price has mostly been rising, over the last 5–20 trading sessions.",
      "Price has mostly been falling, over the last 6–18 months.",
      "Price has risen in recent weeks, but the longer trend is still down.",
    ]);
    // rule 2: the range, the direction and what it is measured against; Risk's direction is said, never assumed
    expect(ps[0].more).toMatch(/0 to 100 .*Strong 80 and above.*Poor below 35; higher is better \(a higher Risk score means lower risk\)/);
    expect(ps.find((p) => p.head === "Risk")!.more).toMatch(/Why it matters: a higher Risk score means lower risk/);
    expect(ps.find((p) => p.head === "Valuation")!.more).toMatch(/Measures the share price against earnings.*not the health of the business/);
    expect(ps.find((p) => p.head === "Short-term trend")!.more).toMatch(/−100 to \+100.*Uptrend \+20 up to \+50.*not the business/);
    const all = ps.map((p) => [p.head, p.text, p.band, p.more].join(" ")).join(" ");
    expect(all).not.toMatch(FORBIDDEN);                                          // the site's own advice words (wording file)
    expect(all).not.toMatch(/\b(recommend|best|should|consider|investors)\b/i);   // describes, never advises
    for (const p of ps) expect(p.text.split(" ").length).toBeLessThanOrEqual(24);    // one line each, never a paragraph
  });

  it("task #382: the bands at their edges, a provisional or unrated card, a missing part and a missing trend are flagged, never guessed", () => {
    for (const [v, band, tone] of [[80, "Strong", "good"], [79.9, "Healthy", "good"], [65, "Healthy", "good"], [64.9, "Average", "mixed"], [50, "Average", "mixed"],
      [49.9, "Weak", "weak"], [35, "Weak", "weak"], [34.9, "Poor", "weak"]] as const) {
      const ps = cardSummary("X", { ...(R as object), label: "STRONG", status: "PROVISIONAL" } as never, PARTS.map((p) => ({ ...p, value: v })), null);
      expect(ps[0]).toMatchObject({ head: "Overall", band: "Strong · Provisional", text: "X's business and finances read as strong: most of what FinLit Prism measures is sound. A first view: some of the data it needs is missing." });
      expect(ps.slice(1).map((p) => [p.band, p.tone])).toEqual(Array(4).fill([band, tone]));
      expect(ps).toHaveLength(5);                                                // the overall pointer and one for each part, no trends without a view
    }
    const nr = cardSummary("X", { final: null, label: "NOT RATED", status: "NOT RATED", parts: {} } as never, PARTS.map((p) => ({ ...p, value: null })), null);
    expect(nr).toEqual([{ head: "Overall", band: "Cannot be interpreted", tone: "na", group: "score", text: "X has no overall FinLit Prism rating at the moment: too little of the data it needs is available." }]);
    const gap = cardSummary("X", R, [...PARTS.slice(0, 3), { ...PARTS[3], value: null }], { ...TECH, shortTerm: hz(null, "") } as never);
    expect(gap.find((p) => p.head === "Risk")).toMatchObject({ band: "Cannot be interpreted", tone: "na" });
    expect(gap.find((p) => p.head === "Risk")!.fig).toBeUndefined();          // no figure is made up for a part without a score
    expect(gap.find((p) => p.head === "Short-term trend")).toMatchObject({ band: "Cannot be interpreted", text: "No score: a required price signal is missing." });
    expect(gap.find((p) => p.head === "Alignment")).toMatchObject({ band: "Cannot be interpreted", text: "It needs both trend scores." });
  });

  it("task #382: the method's own reason under a sound or weak part, a profit streak as growth quarters out of those judged", () => {
    const review = { parts: [
      { key: "fundamental", name: "G", cons: [{ metric: "PROFIT_STREAK", label: "Profit streak", valueText: "1 growth quarters", summary: "Weighs on the assessment. 1 growth quarters across 10 comparable quarters. Loss-making quarters do not count as growth quarters." }] },
      { key: "quality", name: "Q", pros: [{ metric: "ROE", label: "ROE", valueText: "21.40%", summary: "Returns on equity are strong. Something else." }] },
      { key: "valuation", name: "V", cons: [{ metric: "PE_VS_HISTORY", label: "P/E vs own history", valueText: "48.20x", summary: "P/E is relatively high against the company's own history." }] }] };
    const ps = cardSummary("X", R, [{ ...PARTS[0], value: 40 }, ...PARTS.slice(1)], null, review as never);
    expect(ps.find((p) => p.head === "Growth & Profitability")!.reason).toBe("Profit streak: growth in 1 of 10 quarters judged, each against the same quarter a year before; loss-making quarters do not count.");
    expect(ps.find((p) => p.head === "Quality")!.reason).toBe("ROE (21.40%): Returns on equity are strong.");
    expect(ps.find((p) => p.head === "Valuation")!.reason).toBe("P/E vs own history (48.20x): P/E is relatively high against the company's own history.");
    expect(ps.find((p) => p.head === "Risk")!.reason).toBeUndefined();         // no reason in the report: none made up
  });

  it("draws each figure in bold with its band, the meaning below, an (i) that opens the detail, and the business apart from the price", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /^Summarise$/ }));
    const box = screen.getByRole("region", { name: /summary of the FinLit Prism rating of Reliance/ });
    expect([...box.querySelectorAll(".pai2-g")].map((g) => g.textContent)).toEqual(["Business and finances: the FinLit Prism score", "Share price trend: the price, not the business"]);
    const items = box.querySelectorAll("ul.pai2-list > li.pai2-p");
    expect(items).toHaveLength(8);
    expect([...box.querySelectorAll(".pai2-h > b")].map((b) => b.textContent)).toEqual(["Overall 58.1", "Quality 79", "Risk 86", "Growth & Profitability 58",
      "Valuation 34.6", "Short-term trend +38", "Long-term trend −32", "Alignment"]);
    expect(items[4].getAttribute("data-tone")).toBe("weak");
    expect(items[4].querySelector(".pai2-band")!.textContent).toBe("Poor");
    const i = screen.getByRole("button", { name: "What Risk means" });
    expect(i.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(i);
    expect(i.getAttribute("aria-expanded")).toBe("true");
    expect(items[2].querySelector(".pai2-more")!.textContent).toMatch(/a higher Risk score means lower risk/);
    expect([...box.querySelectorAll(".pai2-m b")].map((b) => b.textContent)).toEqual(["read as mixed"]);
  });

  it("a visitor gets the card summary at once, said plainly, with the plans link and the disclaimer; FinLit AI is not asked", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /^Summarise$/ }));
    const box = screen.getByRole("region", { name: /summary of the FinLit Prism rating of Reliance/ });
    expect(box.textContent).toContain("read as mixed");
    expect(box.textContent).toContain("Overall 58.1");                    // task #382: the figures are kept (replaces #228's "no numbers")
    expect(box.textContent).toContain("An AI summary from FinLit AI (10 a month) is part of the Silver and Gold plans");
    expect(screen.getByRole("link", { name: "Compare plans" }).getAttribute("href")).toBe("/plans");
    expect(box.textContent).toContain("not a recommendation");
    expect(asked).toEqual([]);
  });

  it("a Gold member gets FinLit AI's summary of what the card means, streamed in place, from the 10 AI summaries, never from the questions", async () => {
    auth = { user: { id: "u1", role: "investor" }, plan: "gold" }; quota = { enabled: true, left: 97, limit: 100, summary: ALLOW(7) };
    show();
    expect(await screen.findByText(/A few lines from FinLit AI · 7 of 10 left this month/)).toBeTruthy();
    expect(screen.queryByText(/97 of 100/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Summarise$/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /^Summarise$/ }));
    const box = screen.getByRole("region", { name: /summary of the FinLit Prism rating of/ });
    expect(box.textContent).toMatch(/You have used this month's 10 AI summaries \(they renew on 1 Dec 2026\), so this summary is written from the card itself\. Your FinLit AI questions are counted separately\./);
    expect(box.textContent).toContain("read as mixed");
    expect(asked).toEqual([]);
  });

  it("a Basic member is not sent to FinLit AI; a refusal from the server falls back to the card summary with its reason", async () => {
    auth = { user: { id: "u2", role: "investor" }, plan: "basic" }; quota = { enabled: true, left: 0, limit: 0, summary: { limit: 0, used: 0, left: 0, resets: "2026-12-01" } };
    show();
    fireEvent.click(screen.getByRole("button", { name: /^Summarise$/ }));
    expect(screen.getByRole("region", { name: /summary of the FinLit Prism rating of/ }).textContent).toContain("part of the Silver and Gold plans");
    expect(asked).toEqual([]);
    cleanup();
    auth = { user: { id: "u4", role: "investor" }, plan: "silver" }; quota = { enabled: true, left: 3, limit: 50, summary: ALLOW(2) }; mode = "refuse";
    show();
    await screen.findByText(/2 of 10 left this month/);
    fireEvent.click(screen.getByRole("button", { name: /^Summarise$/ }));
    const box = await screen.findByRole("region", { name: /summary of the FinLit Prism rating of/ });
    expect(box.textContent).toContain("You have used all 10 AI summaries of this month. They renew on 01 Dec 2026. Your FinLit AI questions are counted separately.");
  });
});
