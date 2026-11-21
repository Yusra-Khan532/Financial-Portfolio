// Task #283: FinLit IQ is retired; FinLit Prism is FinLit's only company score. No file of the site names the retired score, except lib/retiredScore.ts,
// the one place FinLit AI's "it has been retired" answer is written. The screener change (the second pull request) removed the last screener mentions,
// so the allow-list is that one file and a new mention anywhere else fails.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "__fixtures__" || n === "fixtures" ? [] : files(p)) : /\.(tsx?|json|css)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []; });
const NAME = /FinLit\s+IQ/i;
const ALLOWED = new Set(["lib/retiredScore.ts"]);

describe("task #283: the retired company score is named nowhere on the site", () => {
  const all = files(ROOT).map((f) => f.replace(ROOT, ""));
  it("no source file but the retirement answer names it", () => {
    const hits = all.filter((f) => !ALLOWED.has(f) && NAME.test(readFileSync(join(ROOT, f), "utf8")));
    expect(hits).toEqual([]);
  });
  it("the allow-list is the one retirement file, and it exists", () => {
    expect([...ALLOWED]).toEqual(["lib/retiredScore.ts"]);
    for (const f of ALLOWED) expect(all, f).toContain(f);
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
  it("no source file links to the retired Basic stock screener (its address only redirects, in App.tsx)", () => {
    const LINK = /["'`(]\/score-screener\b/;
    const hits = all.filter((f) => f !== "App.tsx" && LINK.test(readFileSync(join(ROOT, f), "utf8")));
    expect(hits).toEqual([]);
    expect(readFileSync(join(ROOT, "App.tsx"), "utf8")).toMatch(/path="score-screener" element=\{<Navigate to="\/advanced-score-screener" replace \/>\}/);
  });
  it("no source file sorts or filters by the retired score in a link (sort=overall)", () => {
    const hits = all.filter((f) => /sort=overall/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(hits).toEqual([]);
  });
});
