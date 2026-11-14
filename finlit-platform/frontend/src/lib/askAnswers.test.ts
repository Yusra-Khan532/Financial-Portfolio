// Task #138 (founder, 14 Nov 2026): FinLit AI with no language model. Every listed question has an answer; company answers come from the company's own
// FinLit figures (RELIANCE's real report sections, saved from the live site on 14 Nov 2026), with their period and source; nothing is guessed or advised.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import suggestions from "../content/questionSuggestions.json";
import { CONCEPT_QUESTIONS, MARKET_QUESTIONS, PLATFORM_QUESTIONS } from "./askFlow";
import { TOPICS } from "./askExplorer";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/ask/${n}.json`, import.meta.url), "utf8"));
const calls: string[] = [];
const missing = new Set<string>();
vi.mock("./api", () => ({ apiGet: async (p: string) => {
  calls.push(p);
  const m: [RegExp, string][] = [[/TCS\/ratios/, "tcs_ratios"], [/\/financials$/, "fin"], [/\/ratios$/, "ratios"], [/\/ownership$/, "own"], [/\/events$/, "events"], [/\/peers$/, "peers"],
    [/range=1Y/, "price"], [/range=MAX/, "max"], [/\/stats$/, "stats"], [/score-history/, "scores"], [/RELIANCE$/, "summary"]];
  const hit = m.find(([re]) => re.test(p));
  if (!hit || [...missing].some((x) => p.includes(x))) throw new Error("404 " + p);
  return fx(hit[1]);
} }));
import { answerCompany, clearAnswerCache, COMPANY_DISCLAIMER, COMPANY_RULES, generalAnswer, matchQuestion, searchListed } from "./askAnswers";

const ADVICE = /\b(buy|sell|hold|reduce|avoid|accumulate|target|best|multibagger|top pick)\b/i;
beforeEach(() => { clearAnswerCache(); calls.length = 0; missing.clear(); });

describe("every listed question has an answer, with no model", () => {
  it("every company question of the question bank has an answer rule", () => {
    const ids = [...suggestions.company, ...suggestions.groups.flatMap((g) => g.items)].map((q) => q.id);
    expect(ids.filter((id) => !COMPANY_RULES[id])).toEqual([]);
  });
  it("every general question (explorer topics, concepts, platform, market) has a written answer that describes and never advises", () => {
    const qs = [...TOPICS.flatMap((t) => t.questions), ...CONCEPT_QUESTIONS, ...PLATFORM_QUESTIONS, ...MARKET_QUESTIONS];
    for (const q of qs) { const a = generalAnswer(q.text); expect(a, q.text).toBeTruthy(); expect(a!, q.text).not.toMatch(ADVICE); expect(a!).toMatch(/not investment advice/i); }
  });
  it("every company answer on RELIANCE's real figures carries the disclaimer, a source and no advice word", async () => {
    for (const id of Object.keys(COMPANY_RULES)) {
      const a = await answerCompany(id, "RELIANCE", id === "C.11.Q39" ? { second: "TCS" } : id === "quarter" ? { quarter: 2, fy: "FY27" } : {});
      expect(a.text, id).toContain(COMPANY_DISCLAIMER);
      expect(a.text.replace(COMPANY_DISCLAIMER, ""), id).not.toMatch(ADVICE);
      expect(a.text, id).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});

describe("company answers use the company's own figures, with their period", () => {
  it("revenue: the last 5 years and the last 8 quarters", async () => {
    const a = await answerCompany("C.2.Q3", "RELIANCE");
    expect(a.text).toMatch(/FY22 ₹7\.22 L Cr, FY23 ₹8\.93 L Cr, FY24 ₹9\.14 L Cr, FY25 ₹9\.80 L Cr, FY26 ₹10\.76 L Cr/);
    expect(a.text).toMatch(/Sep 2026 ₹3\.33 L Cr/);
    expect(a.text).toMatch(/consolidated statements/);
    expect(a.link?.to).toBe("/stocks/RELIANCE#financials");
  });
  it("a quarter of a named financial year: Q2 FY27 is the quarter ending Sep 2026, against Sep 2025", async () => {
    const a = await answerCompany("quarter", "RELIANCE", { quarter: 2, fy: "FY27" });
    expect(a.text).toMatch(/quarter ending Sep 2026: revenue ₹3\.33 L Cr \(\+28\.6% on the year-ago quarter Sep 2025/);
  });
  it("a quarter FinLit does not hold says so, with the latest quarter it holds", async () => {
    const a = await answerCompany("quarter", "RELIANCE", { quarter: 3, fy: "FY27" });
    expect(a.text).toMatch(/has no results for Q3 FY27 of RELIANCE; its latest quarter is Sep 2026/);
  });
  it("net debt and debt to EBITDA from the balance sheet", async () => {
    const a = await answerCompany("C.3.Q12", "RELIANCE");
    expect(a.text).toMatch(/borrowings of ₹3\.74 L Cr and cash of ₹1\.46 L Cr: net debt of ₹2\.28 L Cr/);
    expect(a.text).toMatch(/Debt to EBITDA: 2\.09×/);
  });
  it("a negative cash conversion cycle keeps its sign", async () => {
    expect((await answerCompany("C.3.Q13", "RELIANCE")).text).toMatch(/FY22 −27 days/);
  });
  it("valuation as of its date, and the dividend record by financial year", async () => {
    expect((await answerCompany("C.6.Q22", "RELIANCE")).text).toMatch(/P\/E of 22\.08×, P\/B of 1\.92×, P\/S of 1\.47× and EV\/EBITDA of 9\.45×[\s\S]*as of 13 Nov 2026/);
    expect((await answerCompany("C.6.Q25", "RELIANCE")).text).toMatch(/each of the last 6 financial years FinLit has \(FY21 ₹3\.50[\s\S]*FY26 ₹6\.00/);
  });
  it("price against its highs and lows, in words", async () => {
    expect((await answerCompany("C.8.Q31", "RELIANCE")).text).toMatch(/16\.9% below its 52-week high of ₹1,611\.20, 16\.3% above its 52-week low of ₹1,152\.30/);
  });
  it("two companies compared on the same figures", async () => {
    const a = await answerCompany("C.11.Q39", "RELIANCE", { second: "TCS" });
    expect(a.text).toMatch(/ROE: RELIANCE 8\.7%, TCS 43\.4%/);
    expect(a.link?.to).toBe("/compare?c=RELIANCE,TCS");
  });
  it("a figure FinLit does not hold is never guessed: the answer says so plainly", async () => {
    for (const [id, what] of [["C.7.Q28", /pledged/], ["C.5.Q21", /NIM, GNPA, NNPA and CASA/], ["C.7.Q30", /number of shareholders/]] as const)
      expect((await answerCompany(id, "RELIANCE")).text).toMatch(new RegExp("FinLit does not have[\\s\\S]*" + what.source));
    expect((await answerCompany("C.5.Q18", "RELIANCE")).text).toMatch(/does not have a sector median/);
  });
  it("a company with no report says so and links to the report", async () => {
    missing.add("/financials");
    const a = await answerCompany("C.2.Q3", "RELIANCE");
    expect(a.text).toMatch(/FinLit does not have a report for RELIANCE yet/);
    expect(a.link?.to).toBe("/stocks/RELIANCE");
  });
  it("fetches only the report parts a question needs, once per visit", async () => {
    await answerCompany("C.2.Q3", "RELIANCE"); await answerCompany("C.3.Q10", "RELIANCE");
    expect(calls.filter((p) => p.endsWith("/financials"))).toHaveLength(1);
    expect(calls.some((p) => p.includes("range=MAX"))).toBe(false);
  });
});

describe("finding the question", () => {
  it("knows a listed company question as the panel writes it, with the company filled in", () => {
    expect(matchQuestion("What are TCS's 3-year and 5-year profit CAGRs?")).toEqual({ id: "C.2.Q7", sym: "TCS" });
    expect(["C.2.Q6", "C.2.2.1"]).toContain(matchQuestion("How have TCS's operating profit (EBITDA) and operating margin trended over the last 5 years?")?.id);   // the same question under two ids, one answer
  });
  it("knows the quarter questions, the two-company question and the 'About X:' follow-up", () => {
    expect(matchQuestion("How did INFY do in Q1 of FY26 (Apr–Jun): revenue, profit and margins against the same quarter a year earlier?")).toEqual({ id: "quarter", sym: "INFY", quarter: 1, fy: "FY26" });
    expect(matchQuestion("How does RELIANCE compare with TCS on growth, margins, returns and valuation?")).toEqual({ id: "C.11.Q39", sym: "RELIANCE", second: "TCS" });
    expect(matchQuestion("How does RELIANCE compare with XYZ on growth, margins, returns and valuation?")).toEqual({ id: "C.11.Q39", sym: "RELIANCE" });
    expect(matchQuestion("Will it go up?")).toBeNull();
  });
  it("search: a few words find the listed questions (the company's too); a long sentence finds the closest", () => {
    expect(searchListed("free cash flow", "TCS").map((q) => q.text)).toContain("What is TCS's free cash flow trend and FCF yield, and in how many of the last 10 years was FCF positive?");
    expect(searchListed("dupont").length).toBeGreaterThan(0);
    expect(searchListed("Will the dividend rise much higher next year, do you think?", "TCS", 6, true).map((q) => q.text).join(" ")).toMatch(/dividend/);
  });
});
