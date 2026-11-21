// Task #283: FinLit IQ is retired; FinLit Prism is FinLit's only company score. No file of the site names the retired score, except:
//  - lib/retiredScore.ts, the one place FinLit AI's "it has been retired" answer is written;
//  - the screener files that the screener change (task #283, second pull request) removes or rewrites. Each is named here, so a new mention anywhere
//    else fails, and this list only shrinks.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "__fixtures__" || n === "fixtures" ? [] : files(p)) : /\.(tsx?|json|css)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []; });
const NAME = /FinLit\s+IQ/i;

/** The screener change's files (left for its own pull request). */
const SCREENER_PR = new Set([
  "pages/ScoreScreener.tsx", "lib/scoreScreen.ts", "components/screener/IqScoreFilter.tsx", "components/screener/HeaderFilters.tsx",
  "components/screener/presets/BasicScreenFilters.tsx", "components/screener/presets/AdvScreenFilters.tsx", "components/screener/presets/ScreenParts.tsx", "components/screener/presets/ScreenView.tsx",
  "components/screener/ScreenerHead.tsx", "components/screener/ReadyScreens.tsx", "components/screener/ScreenerFrame.tsx", "components/screener/AdvancedUpgrade.tsx",
  "pages/ScreenerPro.tsx", "pages/ScreenerLite.tsx", "lib/proscreen.ts", "lib/presets.ts", "lib/screener.ts", "content/queryRules.json",
  "styles/fgx.css", "styles/psx257.css", "styles/scorescreen.css",
]);

describe("task #283: the retired company score is named nowhere on the site", () => {
  const all = files(ROOT).map((f) => f.replace(ROOT, ""));
  it("no source file outside the screener change names it", () => {
    const hits = all.filter((f) => f !== "lib/retiredScore.ts" && !SCREENER_PR.has(f) && NAME.test(readFileSync(join(ROOT, f), "utf8")));
    expect(hits).toEqual([]);
  });
  it("the one place that names it is FinLit AI's retirement answer, and it points to FinLit Prism", async () => {
    const { RETIRED_SCORE_ANSWER, asksRetiredScore } = await import("./retiredScore");
    expect(RETIRED_SCORE_ANSWER).toMatch(/^FinLit IQ has been retired\. FinLit Prism is now FinLit's only company score/);
    expect(RETIRED_SCORE_ANSWER).not.toMatch(/\b(buy|sell|hold|target|best)\b/i);
    expect(asksRetiredScore("What is the FinLit IQ?")).toBe(true); expect(asksRetiredScore("TCS finlit-iq score")).toBe(true);
    expect(asksRetiredScore("What is the P/E of TCS?")).toBe(false);
  });
  it("FinLit AI answers \"What is the FinLit IQ?\" with the retirement note, from written text", async () => {
    const { generalAnswer } = await import("./askAnswers");
    expect(generalAnswer("What is the FinLit IQ?")).toMatch(/^FinLit IQ has been retired\. FinLit Prism is now FinLit's only company score/);
  });
  it("every screener file listed still exists (the list only shrinks)", () => {
    for (const f of SCREENER_PR) expect(all, f).toContain(f);
  });
});
