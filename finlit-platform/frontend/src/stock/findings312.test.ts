// Task #312 (developer file 20, "Other findings from the check"): one finding under two titles is shown once (Watch showed 6 where 4 were distinct);
// a finding names its period; "above its 200-day average" never reads as a healthy longer trend while the 50-day average is still below the 200-day.
import { describe, expect, it } from "vitest";
import { dedupe, topicOf } from "./KeyFindings";
import { longTrend } from "./Sections";
import { titled } from "../lib/plFlags";

const it_ = (key: string, title: string, text: string) => ({ key, title, text, to: "x" });

describe("task #312: findings from the check", () => {
  it("the same finding under two titles is one item, the second fact kept in its details", () => {
    const k = dedupe({
      flags: [it_("a", "Customers are paying more slowly", "Receivables grew 38.9% against revenue growth of 9.7% (FY26).")],
      watch: [it_("b", "Collection efficiency deteriorating", "Debtor days rose from 14 to 17."), it_("c", "Other income is 24% of pre-tax profit", "Check where it comes from."),
        it_("d", "How much of the profit comes from non-operating income or one-off items?", "Other income share is high."), it_("e", "Thin margins", "Net margin 4%.")],
      good: [],
    });
    expect(k.flags.map((i) => i.title)).toEqual(["Customers are paying more slowly"]);
    expect(k.flags[0].text).toBe("Receivables grew 38.9% against revenue growth of 9.7% (FY26). Debtor days rose from 14 to 17.");
    expect(k.watch.map((i) => i.title)).toEqual(["Other income is 24% of pre-tax profit", "Thin margins"]);
    expect(k.watch[0].text).toContain("Other income share is high.");
    expect(topicOf("Profit lagging sales over 5 years")).toBe("profit lagging sales over 5 years");
  });
  it("a profit-and-loss finding names its period", () => {
    expect(titled("Profit is growing much faster than revenue", 1, "quarterly", "Sep 2026")).toBe("Profit is growing much faster than revenue in the Sep quarter");
    expect(titled("Revenue fell while profit rose", 2, "annual", "FY26")).toBe("Revenue fell while profit rose in FY26");
    expect(titled("Revenue and profit have moved in opposite directions for several quarters", 8, "quarterly", "Sep 2026")).toBe("Revenue and profit have moved in opposite directions for several quarters");
  });
  it("above the 200-day average after a fall is not called a healthy longer trend (Reliance, 22 Nov: 50-day 1,276 under 200-day 1,315)", () => {
    expect(longTrend({ vsEma200Pct: 4.61, ema50: 1276.4, ema200: 1314.52 })).toBe("after a fall: its 50-day average is still below the 200-day, so the longer trend has not turned up yet");
    expect(longTrend({ vsEma200Pct: 4.61, ema50: 1330, ema200: 1314.52 })).toBe("which suggests the longer trend is healthy");
    expect(longTrend({ vsEma200Pct: -3, ema50: 1276, ema200: 1314 })).toBe("which suggests the longer trend is weak");
  });
});
