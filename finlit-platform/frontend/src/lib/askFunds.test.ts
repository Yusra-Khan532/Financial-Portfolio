// Task #203: the FinLit AI theme "Mutual funds & ETFs" from the team's question bank (docs/design/mf-etf-questions/mf_etf_question_bank.xlsx).
import { describe, expect, it } from "vitest";
import raw from "../content/mfQuestionBank.json";
import { FUND_TEXT } from "./askFundsText";
import { categoryOf, houseOf, kindOf, metricOf, planOf, searchFundQs, shape, shownText, yearsOf } from "./askFunds";

const { segments, all } = shape(raw as never);

describe("the question bank (task #203)", () => {
  it("holds every question of the team's sheet: 1,391 in 20 segments, in order, ids unique", () => {
    expect(all).toHaveLength(1391);
    expect(segments.map((s) => s.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(segments.map((s) => s.title)).toEqual(["Fund discovery", "Fund basics", "NAV", "Returns", "Risk", "SIP", "Fund size (AUM)", "Expense ratio", "Fund facts", "Benchmark, risk & managers",
      "Portfolio", "Checklist", "Compare", "Rankings", "Industry insights", "ETFs", "Education", "Data & trust", "Gaps & guardrails", "Navigation & how-to"]);
    expect(new Set(all.map((q) => q.id)).size).toBe(1391);
    expect(all[0]).toMatchObject({ id: "Q0001", text: "Show me all Large Cap funds", segTitle: "Fund discovery", sub: "By category" });
  });
  it("marks the questions that need a fund, a second fund or an ETF", () => {
    expect(all.find((q) => q.text === "Compare {fund} and {fund2}")!.slots).toEqual(["fund", "fund2"]);
    expect(all.find((q) => q.text === "What is the price of {etf}?")!.slots).toEqual(["etf"]);
    expect(shownText("Which {c} funds hold the most IT stocks?")).toBe("Which a category funds hold the most IT stocks?".replace("a category", "a category"));
  });
  it("every question has an answer: written text, or FinLit's data", () => {
    const missing = all.filter((q) => kindOf(q) === "written" && !FUND_TEXT[q.id]).map((q) => q.id);
    expect(missing).toEqual([]);
  });
  it("the written answers describe and never advise; each is a few bullet lines", () => {
    for (const [id, w] of Object.entries(FUND_TEXT)) {
      expect(w.text, id).not.toMatch(/\b(buy|sell|should|recommend|best|safest|avoid|multibagger|top pick|accumulate)\b/i);
      const lines = w.text.split("\n");
      expect(lines.length, id).toBeGreaterThanOrEqual(1);
      expect(lines.length, id).toBeLessThanOrEqual(6);
      for (const l of lines) expect(l, id).toMatch(/^• /);
      if (w.link) expect(w.link.to, id).toMatch(/^\//);
    }
  });
  it("a search finds questions by every typed word", () => {
    const hits = searchFundQs(all, "gold etf");
    expect(hits.length).toBeGreaterThan(0);
    for (const q of hits) expect(q.text.toLowerCase()).toMatch(/gold/);
  });
});

describe("reading a question", () => {
  it("finds the category, longest name first", () => {
    expect(categoryOf("Show SBI Large & Mid Cap funds")!.key).toBe("large-mid-cap");
    expect(categoryOf("Which Mid Cap funds are Direct plans?")!.key).toBe("mid-cap");
    expect(categoryOf("Top 5 ELSS (tax saver) funds")!.key).toBe("elss");
    expect(categoryOf("Which Banking & PSU funds are the largest?")!.key).toBe("banking-psu");
    expect(categoryOf("What is a mutual fund?")).toBeNull();
  });
  it("finds the fund house, the plan and the period", () => {
    expect(houseOf("Show all ICICI Prudential mutual funds")!.find).toBe("icici");
    expect(houseOf("Which is the best performing Parag Parikh fund?")!.find).toBe("ppfas");
    expect(planOf("Best Direct plan Large Cap funds")).toBe("Direct");
    expect(yearsOf("over 5 years")).toBe(5);
    expect(yearsOf("Compare A and B over 1Y")).toBe(1);
  });
  it("ranks by what the question asks, the right way round", () => {
    expect(metricOf({ src: "category + r1y/r3y/r5y sort", text: "Which Large Cap fund has given the best 3 years return?" })).toMatchObject({ sort: "r3y", dir: "desc" });
    expect(metricOf({ src: "ter, terRegular, terDirect", text: "Which Large Cap funds have the lowest expense ratio?" })).toMatchObject({ sort: "ter", dir: "asc" });
    expect(metricOf({ src: "ter, terRegular, terDirect", text: "Which Multi Cap funds have the highest expense ratio?" })).toMatchObject({ sort: "ter", dir: "desc" });
    expect(metricOf({ src: "aum_lakh", text: "Which Large Cap funds are the smallest?" })).toMatchObject({ sort: "aum", dir: "asc" });
    expect(metricOf({ src: "fall3y", text: "Top 5 Large Cap funds by smallest 3-year fall" })).toMatchObject({ sort: "fall", dir: "asc" });
    expect(metricOf({ src: "sip5y", text: "Top 5 Large Cap funds by best 5-year SIP return" })).toMatchObject({ sort: "sip5y", dir: "desc" });
  });
  it("sends each question to the right kind of answer", () => {
    const k = (id: string) => kindOf(all.find((q) => q.id === id)!);
    expect(k("Q0001")).toBe("show"); expect(k("Q0003")).toBe("count"); expect(k("Q0476")).toBe("average");
    expect(k("Q1099")).toBe("house"); expect(k("Q1243")).toBe("written"); expect(k("Q1344")).toBe("written");
    expect(kindOf(all.find((q) => q.text === "Compare {fund} and {fund2}")!)).toBe("two");
    expect(kindOf(all.find((q) => q.text === "What is the latest NAV of {fund}?")!)).toBe("fund");
  });
});

describe("above or below a figure", () => {
  it("reads a comparison only when a comparison word sits right before the figure and its unit", async () => {
    const { thresholdOf } = await import("./askFunds");
    expect(thresholdOf("Which funds have AUM above Rs 10,000 crore?")).toMatchObject({ field: "aum", lo: 10000, hi: null });
    expect(thresholdOf("Which funds have expense ratio below 0.5%?")).toMatchObject({ field: "ter", lo: null, hi: 0.5 });
    expect(thresholdOf("Which funds are more than 10 years old?")).toMatchObject({ field: "age", lo: 10 });
    expect(thresholdOf("Which funds were launched in the last 1 year?")).toMatchObject({ field: "age", hi: 1 });
    expect(thresholdOf("Top 5 Large Cap funds by lowest expense ratio")).toBeNull();
    expect(thresholdOf("Which is the best performing Old Bridge fund over 5 years?")).toBeNull();
    expect(thresholdOf("What is the total industry AUM for last 3 months?")).toBeNull();
  });
});
