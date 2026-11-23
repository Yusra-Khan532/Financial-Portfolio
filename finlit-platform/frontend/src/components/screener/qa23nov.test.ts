// QA pass of 23 Nov 2026 on the Advanced screener (items 3, 5, 6, 7).
import { describe, expect, it } from "vitest";
import { headerDateLine } from "../../pages/AdvancedScoreScreener";
import { candleDay } from "./ChartPanel";
import { isTop10 } from "./presets/ScreensStrip";
import { ratingOfScore } from "../../lib/scoreScreen";
import { LABEL_WORD } from "../../lib/scorePrism";

describe("QA 23 Nov, Advanced screener", () => {
  it("item 3: the header names the close the ready-made lists come from, beside the Prism and price dates", () => {
    expect(headerDateLine("2026-11-23", "2026-11-23", "2026-11-20T16:00:00Z")).toMatch(/technical views: prices to .*23.* · ready-made screens: lists from the 20 Nov close \(built each night after the close\)$/);
    expect(headerDateLine("2026-11-23", null, null)).not.toMatch(/ready-made/);
  });
  it("item 5: a Top 10 screen's card text '33 pass · the top 10 first' still marks it Top 10", () => {
    expect(isTop10({ listText: "33 pass · the top 10 first" } as never)).toBe(true);
    expect(isTop10({ listText: "62 companies" } as never)).toBe(false);
  });
  it("item 6: two companies shown at 65 read the same word (64.6 and 65.4 both Healthy)", () => {
    expect(LABEL_WORD[ratingOfScore(64.6)]).toBe(LABEL_WORD[ratingOfScore(65.4)]);
    expect(ratingOfScore(64.4)).toBe("AVERAGE");
  });
  it("item 7: the chart panel names the day of its last candle", () => {
    expect(candleDay("2026-11-20")).toBe("20 Nov");
    expect(candleDay("2026-11-18T00:00:00")).toBe("18 Nov");
  });
});
