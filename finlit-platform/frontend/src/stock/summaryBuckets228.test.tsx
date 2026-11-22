// @vitest-environment jsdom
// Task #228 rework 3 (the team, 22 Nov 2026): "make it summarize the score and nothing else in pointer not paragraphs not big sentence instead create a
// major bucket headline then give point". The server asks FinLit AI for numbered bucket headlines with short points (ask/service.summary_question);
// the answer is drawn as one block per bucket, the headline above its points.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerText } from "../components/AnswerText";

afterEach(cleanup);
const SAMPLE = ["1. Overall", "- **57.7**, Average, Rated", "2. Sound", "- Quality **79**: low debt, cash-backed profit", "- Risk **86**: calm price, few pledges",
  "3. In between", "- Growth & Profitability **58**", "4. Weighs on it", "- Valuation **35**: price high against earnings", "5. Price trend",
  "- Short-term **+38**, long-term **−32**: bounce in a downtrend"].join("\n");

describe("task #228: the AI summary in bucket headlines", () => {
  it("draws each bucket as a headline with its short points under it", () => {
    render(<AnswerText text={SAMPLE} />);
    expect([...document.querySelectorAll("h4.aif-a-h")].map((h) => h.textContent)).toEqual(["1. Overall", "2. Sound", "3. In between", "4. Weighs on it", "5. Price trend"]);
    const sound = document.querySelector('section[aria-label="2. Sound"]')!;
    expect([...sound.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["Quality 79: low debt, cash-backed profit", "Risk 86: calm price, few pledges"]);
    expect(document.querySelectorAll("section.aif-a-sec p").length).toBe(0);                // no paragraph
  });
});
