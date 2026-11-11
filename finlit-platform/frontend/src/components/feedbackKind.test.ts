import { describe, expect, it } from "vitest";
import { feedbackKind } from "./FeedbackFooter";

describe("which pages carry the feedback block", () => {
  it("every report page and every dashboard page, and nothing else", () => {
    for (const p of ["/stocks/TCS", "/prism/TCS", "/premium/report/TCS", "/premium/markets", "/outlook/TCS", "/research/stress-lab/TCS", "/dcf", "/compare", "/funds/123", "/diversification"]) expect(feedbackKind(p), p).toBe("report");
    for (const p of ["/dashboard", "/portfolio", "/watchlist", "/mf-portfolio"]) expect(feedbackKind(p), p).toBe("dashboard");
    for (const p of ["/", "/feedback", "/plans", "/screener", "/funds/screener", "/login", "/outlook"]) expect(feedbackKind(p), p).toBeNull();
  });
});
