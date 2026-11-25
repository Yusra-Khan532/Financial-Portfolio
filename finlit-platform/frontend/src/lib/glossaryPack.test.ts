// The Glossary's figures and words (board 02) come out of the glossary data, and board 03's change list is in it: 7 new terms, 35 renamed or
// rewritten (5 renamed, 2 rewritten, 28 with the scoring rules taken off), and no weights, cut-offs or points left in the entries it names.
import { describe, expect, it } from "vitest";
import { LETTERS, TERMS, TOPICS } from "./glossary";
import { DESC, SEARCH_HINT, badge, countLine, counts, firstLetter, letterCounts, pick, tabs, tiles } from "./glossaryPack";

const C = counts(TERMS, TOPICS);
const T = (name: string) => TERMS.find((t) => t.term === name)!;

describe("the pack's figures", () => {
  it("task #381: 1,260 terms, 20 topics, 819 new and 54 updated (the team's 1,000-term glossary added 812 and updated 20), 35 FinLit words", () => {
    expect(C).toEqual({ terms: 1260, topics: 20, added: 819, updated: 54, finlit: 35 });
    expect(tiles(C)).toEqual([{ k: "Terms", v: 1260, s: "from A to Z" }, { k: "Topics", v: 20, s: "pick one on the left" }, { k: "New this update", v: 819, s: "including the team's 1,000-term glossary" }, { k: "Updated this update", v: 54, s: "renamed or rewritten" }]);
    expect(tabs(C).map((t) => [t.title, t.sub])).toEqual([["Browse A to Z", "All 1,260 terms, by letter or topic"], ["FinLit words", "35 terms behind the scores and labels"], ["New and updated", "873 terms added or changed"]]);
    expect(DESC(1260)).toBe("1,260 investing terms in plain words: what each means, why it matters, how to use it, and its formula.");   // one line (founder, 22 Nov 2026)
    expect(SEARCH_HINT(1260)).toBe('Search 1,260 terms, for example "P/E", "Sold off" or "Company size"');
  });
  it("letter A holds 66 terms (21 as drawn, plus the 1,000-term glossary of task #381), ATR among them marked Updated; the topic counts follow the data", () => {
    const n = letterCounts(TERMS, LETTERS, {});
    expect(n.A).toBe(66);                                              // task #381: the 1,000-term glossary added 45 terms under A
    expect({ "0–9": n["0–9"], B: n.B, C: n.C, D: n.D, S: n.S, Z: n.Z }).toEqual({ "0–9": 1, B: 69, C: 139, D: 92, S: 119, Z: 3 });
    expect(countLine(pick(TERMS, { letter: "A" }).length)).toBe("66 terms · select a term to open it");
    expect(pick(TERMS, { letter: "A" })[0].term).toBe("Absolute and annualised return");
    expect(badge(T("Average true range (ATR)"))).toBe("Updated");
    const topic = (x: string) => TERMS.filter((t) => t.topic === x).length;
    expect([topic("Banks and lenders"), topic("Funds, bonds and derivatives"), topic("FinLit words"), topic("Valuation")]).toEqual([88, 97, 35, 74]);
    expect(firstLetter({ "0–9": 0, A: 3 }, ["0–9", "A"])).toBe("A");
  });
});

describe("board 03: the change list is applied", () => {
  it("the seven new terms and the five renamed ones are there, and the old names are gone", () => {
    for (const n of ["Stock stages (Accumulation, Advancing, Distribution, Declining)", "Stocks rising (industry breadth)", "Last bounce", "Result verdict (Strong, Good, Weak, Poor)", "Moves like (independent bets)", "Moves with the rest", "Portfolio score and diversification score"]) expect(T(n)?.change, n).toBe("new");
    for (const n of ["Company size (Large, Mid, Small, Micro)", "Industry states (Sold off, Bouncing back, Rising together, Losing steam, No clear signal)", "Bouncing back (and Bouncing back after a crash)", "Crash (capitulation)", "Standout (strong and early)"]) expect(T(n)?.change, n).toBe("updated");
    for (const old of ["Company size bands (mega cap to nano cap)", "Sector signal states (Washout, Thrust, Confirmed, Fading)", "Breadth thrust (C and CAP)", "Capitulation and higher-low share", "Leader flag"]) expect(TERMS.some((t) => t.term === old), old).toBe(false);
  });
  it("the three before-and-after examples read as the pack's After", () => {
    const size = T("Company size (Large, Mid, Small, Micro)"), prism = T("FinLit Prism"), lead = T("Leader label (Leader, In line, Laggard)");
    expect(size.meaning).toBe("FinLit sorts every listed company into four sizes by its market value: Large above ₹75,000 crore, Mid from ₹25,000 crore to ₹75,000 crore, Small from ₹10,000 crore to ₹25,000 crore, and Micro below ₹10,000 crore.");
    expect(size.finlit).toBe("The same four sizes are used on every FinLit page: the screener, Markets pages, portfolios, watchlists and company reports. Until 20 Nov 2026 there were three; what was Small then (below ₹10,000 crore) is now Micro. FinLit does not use mega or nano labels.");
    expect(prism.meaning).toBe("FinLit's advanced financial-health rating of a listed company, part of the Gold plan. It scores four parts from the company's filings and prices (Growth & Profitability, Valuation, Quality and Risk) and combines them into a score out of 100 with a label: Strong, Healthy, Average, Weak or Poor.");
    expect(prism.formula).toBe("");
    expect(prism.finlit).toBe("Each part is weighed by industry group, with rules for losses and weak businesses; the weights stay inside the model. Every Prism report can be saved as a PDF.");
    expect(lead.how).toBe("The label describes the past, not what comes next. Leaders can fall as hard as everyone else in a market-wide sell-off.");
    expect(lead.finlit).toBe("FinLit compares the share's return with its closest peers and with their sector index. \"Gaining\" or \"weakening\" shows the recent direction. Labels refresh weekly after Friday's close.");
  });
  it("no FinLit word shows a weight, a cut-off, a points rule or a top or bottom share", () => {
    const rule = /\b0\.\d{2}\s*×|\(\s*\d+\s*(and above|to \d+)|top \d+%|bottom \d+%|capped at|\+\d+ points?|earns more points|stops at Healthy/i;
    const hits = TERMS.filter((t) => t.topic === "FinLit words" || t.change).filter((t) => rule.test([t.meaning, t.how, t.formula, t.finlit].join(" "))).map((t) => t.term);
    expect(hits).toEqual([]);
  });
});
