// @vitest-environment jsdom
// Task #228: the AI summary button under the FinLit Prism cards of the company page.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TechAssessment } from "../lib/prismTechnical";

let auth: { user: { id: string; role: string } | null; plan: string } = { user: null, plan: "basic" };
let quota: { enabled: boolean; left?: number; limit?: number } | undefined;
const asked: { q: string; symbol: string | null }[] = [];
let mode: "stream" | "refuse" = "stream";
vi.mock("../lib/auth", () => ({ useAuth: () => auth }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<object>()), apiGet: vi.fn(async (p: string) => { if (p === "/api/ask/quota") return quota; throw new Error("not mocked " + p); }) }));
vi.mock("../lib/askAi", async (orig) => {
  const real = await orig<typeof import("../lib/askAi")>();
  return {
    ...real,
    askAi: vi.fn(async (q: string, _h: unknown, symbol: string | null, on: (e: unknown) => void) => {
      asked.push({ q, symbol });
      if (mode === "refuse") throw new real.AskRefused(429, "quota_used", "You have used all 50 FinLit AI questions of your plan this month.", {});
      on({ type: "status", text: "Reading the company card (RELIANCE)" });
      on({ type: "text", text: "Reliance scores **58.1** (Average). " });
      on({ type: "text", text: "Risk is its strongest part." });
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
const hz = (score: number, rating: string) => ({ score, rating, status: "ready", horizon: null, availableCount: 1, requiredCount: 1, stageCapped: false, provisional: false, provisionalNote: null, uncappedScore: null, divisor: null, factors: [] });
const TECH = { shortTerm: hz(38, "UPTREND"), longTerm: hz(-32, "DOWNTREND"), verdict: { label: null, tone: null } } as unknown as TechAssessment;

afterEach(() => { cleanup(); auth = { user: null, plan: "basic" }; quota = undefined; asked.length = 0; mode = "stream"; });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PrismAiSummary symbol="RELIANCE" name="Reliance Industries Ltd" r={R} parts={PARTS} a={TECH} /></MemoryRouter></QueryClientProvider>);

describe("AI summary under the FinLit Prism cards (task #228)", () => {
  it("the card summary restates the card: score and label, strongest and weakest parts, the others, the technical view", () => {
    const lines = cardSummary("Reliance Industries Ltd", R, PARTS, TECH);
    expect(lines[0]).toBe("Reliance Industries Ltd: FinLit Prism 58.1 out of 100, Average.");
    expect(lines[1]).toBe("Strongest part: Risk 86 (Strong). Weakest: Valuation 35 (Poor).");
    expect(lines[2]).toBe("Growth & Profitability 58 (Average), Quality 79 (Healthy).");
    expect(lines).toContain("A higher Risk score means lower risk.");
    expect(lines[lines.length - 1]).toMatch(/^Technical view: short term \+38 \(.+\), long term −32 \(.+\)/);
    expect(lines.join(" ")).not.toMatch(/\b(buy|sell|hold|target|recommend)/i);
  });

  it("a visitor gets the card summary at once, said plainly, with the plans link and the disclaimer; FinLit AI is not asked", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    const box = screen.getByRole("region", { name: /Summary of the FinLit Prism rating of Reliance/ });
    expect(box.textContent).toContain("FinLit Prism 58.1 out of 100, Average");
    expect(box.textContent).toContain("A written summary from FinLit AI is part of the Silver and Gold plans");
    expect(screen.getByRole("link", { name: "Compare plans" }).getAttribute("href")).toBe("/plans");
    expect(box.textContent).toContain("not a recommendation");
    expect(asked).toEqual([]);
  });

  it("a Gold member gets FinLit AI's summary streamed in place, about this company, with the questions left and the disclaimer", async () => {
    auth = { user: { id: "u1", role: "investor" }, plan: "gold" }; quota = { enabled: true, left: 97, limit: 100 };
    show();
    expect(await screen.findByText(/97 of 100 FinLit AI questions left this month/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    const box = await screen.findByRole("region", { name: /AI summary of the FinLit Prism rating of Reliance/ });
    await waitFor(() => expect(box.textContent).toContain("Risk is its strongest part."));
    expect(asked[0].symbol).toBe("RELIANCE");
    expect(asked[0].q).toMatch(/Summarise the FinLit Prism rating of Reliance Industries Ltd \(RELIANCE\)/);
    expect(box.textContent).toContain("not a recommendation");
    expect(screen.getByRole("button", { name: /Summarise again/ })).toBeTruthy();
  });

  it("a Basic member is not sent to FinLit AI; a member whose questions are used, or a refusal, falls back to the card summary with the reason", async () => {
    auth = { user: { id: "u2", role: "investor" }, plan: "basic" }; quota = { enabled: true, left: 0, limit: 0 };
    show();
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    expect(screen.getByRole("region", { name: /^Summary of/ }).textContent).toContain("part of the Silver and Gold plans");
    expect(asked).toEqual([]);
    cleanup();
    auth = { user: { id: "u3", role: "investor" }, plan: "silver" }; quota = { enabled: true, left: 0, limit: 50 };
    show();
    await screen.findByText(/A few lines on this card/);
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    expect(screen.getByRole("region", { name: /^Summary of/ }).textContent).toContain("You have used this month's FinLit AI questions");
    cleanup();
    auth = { user: { id: "u4", role: "investor" }, plan: "silver" }; quota = { enabled: true, left: 3, limit: 50 }; mode = "refuse";
    show();
    await screen.findByText(/3 of 50 FinLit AI questions left/);
    fireEvent.click(screen.getByRole("button", { name: /AI summary/ }));
    const box = await screen.findByRole("region", { name: /^Summary of/ });
    expect(box.textContent).toContain("You have used all 50 FinLit AI questions of your plan this month. Meanwhile, this summary is written from the card's own figures.");
  });
});
