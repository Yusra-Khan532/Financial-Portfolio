import { describe, expect, it } from "vitest";
import type { FundScore } from "./mfScore";
import { FLAG_TEXT, MF_SCORE_COMPLIANCE, PILLAR_HELP, STATE_TEXT, STATUS_TEXT, builtOnText, filledText, ordinal, scoreSentence, partWord, rankText } from "./mfScore";
import { MfScoreMethodPage } from "../pages/MfScoreMethod";
import * as mfScoreModule from "./mfScore";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BANNED = /\b(buy|sell|hold|recommended|recommend|best[- ]to[- ]buy|should|invest in)\b/i;

describe("FinLit FundPulse wording", () => {
  it("has the exact compliance line", () => {
    expect(MF_SCORE_COMPLIANCE).toBe("Describes the fund's health from its past NAVs, costs and holdings; not a recommendation. Information only, not investment advice.");
  });
  it("uses no advice words in any fixed text", () => {
    const all = [...Object.values(PILLAR_HELP), ...Object.values(STATUS_TEXT), ...Object.values(FLAG_TEXT), ...Object.values(STATE_TEXT)];
    for (const t of all) expect(t).not.toMatch(BANNED);
  });
  it("scans the method page and the score components", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(MfScoreMethodPage)));
    expect(html.replace(/<[^>]+>/g, " ").replace(/not a recommendation|not investment advice|Not advice|not advice/gi, "")).not.toMatch(BANNED);
    for (const f of ["../mf/ScoreCard.tsx", "../mf/ScoreCompare.tsx", "../mf/FundTable.tsx", "../pages/MfScoreMethod.tsx"]) {
      const src = readFileSync(resolve(__dirname, f), "utf8");
      const strings = (src.match(/"[^"\n]{12,}"|`[^`\n]{12,}`/g) || []).filter((s) => !/^["`](\.\.|@|\/|\w+[-:])/.test(s) && !/className/.test(s));
      for (const s of strings) expect(s.replace(/not a recommendation/gi, "")).not.toMatch(BANNED);
    }
  });
  it("shows a part in words, and the site holds no weights table any more", () => {
    expect([null, 49.9, 50, 69.9, 70].map((v) => partWord(v))).toEqual(["Not scored", "Weak", "Fair", "Fair", "Strong"]);
    expect(Object.keys(mfScoreModule)).not.toContain("GROUP_WEIGHTS");
  });
  it("writes the rank line", () => {
    expect(rankText({ rank: 12, of: 48, scope: "sub", percentile: 77, categoryLabel: "Large Cap", plan: "Direct" })).toBe("12 of 48 in Large Cap (Direct plan)");
    expect(rankText({ rank: 2, of: 14, scope: "fam", percentile: 92, categoryLabel: null, plan: "Regular" }, { key: "nifty50", index: "NIFTY 50 TRI" })).toBe("2 of 14 funds tracking NIFTY 50 TRI (Regular plan)");
    expect(builtOnText({ n: 1, of: 19 })).toBe("Built on real data: 18 of 19 measures");          // task #132: measures, never weights
    expect(builtOnText(undefined)).toBe("");
    expect(filledText({ n: 3, of: 19 })).toBe("3 of 19 measures used the group value because data was missing.");
    expect(filledText({ n: 0, of: 19 })).toBe("");
  });
});

describe("FundPulse in one line (task #132)", () => {
  const P = (perf: string, risk: string, cost: string, qual: string) => [["performance", "Performance", perf], ["risk", "Risk", risk], ["cost", "Cost", cost], ["quality", "Quality", qual]].map(([key, name, reading]) => ({ key, name, reading })) as FundScore["pillars"];
  const rank = { rank: 14, of: 36, scope: "sub", percentile: 63, categoryLabel: "Flexi Cap", plan: "Direct" };
  it("builds the team's sentence from the part words and the rank", () => {
    expect(scoreSentence({ final: 60.3, label: "Average", pillars: P("Weak", "Strong", "Strong", "Weak"), rank, family: null })).toBe("Strong on risk and cost, weak on performance and quality: 60.3, Average, 14th of 36 Flexi Cap funds (Direct plan).");
  });
  it("names fair parts, all-equal parts and a missing rank in plain words", () => {
    expect(scoreSentence({ final: 71, label: "Healthy", pillars: P("Strong", "Fair", "Strong", "Weak"), rank: null, family: null })).toBe("Strong on performance and cost, fair on risk, weak on quality: 71.0, Healthy.");
    expect(scoreSentence({ final: 80, label: "Strong", pillars: P("Strong", "Strong", "Strong", "Strong"), rank: { ...rank, rank: 1 }, family: null })).toBe("Strong on all four parts: 80.0, Strong, 1st of 36 Flexi Cap funds (Direct plan).");
    expect(scoreSentence({ final: null, label: null, pillars: P("Weak", "Weak", "Weak", "Weak"), rank: null, family: null })).toBeNull();
  });
  it("writes ordinals", () => { expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd"]); });
});
