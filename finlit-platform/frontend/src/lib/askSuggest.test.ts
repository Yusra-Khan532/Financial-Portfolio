// Task #268: the typing box's suggestions, grouped as in the team's reference, and the last line for the words as typed.
import { describe, expect, it } from "vitest";
import { MARKET_QUESTIONS } from "./askFlow";
import { TOPICS } from "./askExplorer";
import { fallbackLine, groupOf, groupSuggestions } from "./askSuggest";
import { FORBIDDEN } from "./prismTechnical";

describe("suggestion groups (task #268)", () => {
  it("names each listed question's group: company tab, topic, start here, markets", () => {
    expect(groupOf({ id: "C.3.Q10", text: "x" }, "RELIANCE")).toBe("RELIANCE · Financials");
    expect(groupOf({ id: "C.6.Q1", text: "x" }, null)).toBe("Valuation");
    expect(groupOf({ id: "C.9.Q1", text: "x" }, "TCS")).toBe("TCS · Outlook & Risks");
    expect(groupOf({ id: "s0", text: "x" })).toBe("Start here");
    expect(groupOf(MARKET_QUESTIONS[0])).toBe("Markets & Economy");
    expect(groupOf(TOPICS[1].questions[0])).toBe(TOPICS[1].title);
  });
  it("keeps the rank: a group where its best question ranks, its questions in order", () => {
    const g = groupSuggestions([{ id: "C.3.Q1", text: "a" }, { id: "s1", text: "b" }, { id: "C.4.Q2", text: "c" }], "X");
    expect(g).toEqual([{ title: "X · Financials", items: [{ id: "C.3.Q1", text: "a" }, { id: "C.4.Q2", text: "c" }] }, { title: "Start here", items: [{ id: "s1", text: "b" }] }]);
  });
  it("the last line says where the words as typed go, by plan, in plain words", () => {
    expect(fallbackLine(" ev margins ", true, false, 38)).toEqual({ label: "Ask FinLit AI: “ev margins”", note: "A written answer · 38 left this month" });
    expect(fallbackLine("ev margins", false, true)).toEqual({ label: "Ask “ev margins”", note: "Written answers are part of Silver and Gold" });
    expect(fallbackLine("ev margins", false, false)).toEqual({ label: "Search the listed questions for “ev margins”", note: "The closest ones answer at once" });
    for (const f of [fallbackLine("a", true, false, 1), fallbackLine("a", false, true), fallbackLine("a", false, false)]) expect(f.label + f.note).not.toMatch(FORBIDDEN);
  });
});
