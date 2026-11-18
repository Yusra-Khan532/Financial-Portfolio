// @vitest-environment jsdom
// Task #216 round 4 (company report handover, 17 Nov 2026): sections 02 to 18 (README 3.2 to 3.18, 3.20): 03 merges 11's findings into one list of
// drop-downs; 11 counts findings only and shows them as drop-downs; the report FAQ follows the plan; 02's redrawn backdrop and history; 10, 12, 15's
// drop-downs; 13's ranking status; 14's readings linking to their tabs and the head-to-head with the group leader; 18's tiles and side column.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { splitTitle, earningsItems } from "./EarningsCash";
import { dedupe } from "./KeyFindings";
import { reportFaqFor } from "../content/reportFaqPlan";
import { groupWord } from "../lib/standsPack";
import { macroWindow, macroSummary, type HistoryPoint } from "../lib/macroOutlook";

const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
const css = readFileSync(join(__dirname, "../styles/report216.css"), "utf8");

describe("11 Earnings and cash quality (README 3.11)", () => {
  it("counts findings only: the red flag, the watch items and the items to investigate, never \"The read\"", () => {
    expect(src("EarningsCash.tsx")).toContain("return { red: flag ? 1 : 0, watch: watch.length, investigate: investigate.length };");
  });
  it("an item's first sentence is its title and the rest its explanation; a bare question points to step 3", () => {
    expect(splitTitle("Other income is 25% of pre-tax profit (FY26). Check where it comes from.")).toEqual({ title: "Other income is 25% of pre-tax profit (FY26)", text: "Check where it comes from." });
    expect(splitTitle("Is the tax rate unusually low?").text).toMatch(/step 3, “Is the profit clean\?”/);
  });
  it("its findings become list items: red flag first, then watch, then investigate (tagged)", () => {
    const f = { flag: { title: "Customers are paying more slowly", text: "Receivables grew." }, watch: [{ id: "stock", text: "Stock is building up", why: "Inventory grew." }], investigate: ["Is the tax rate low?"] };
    const r = earningsItems(f as never);
    expect(r.flags.map((x) => x.title)).toEqual(["Customers are paying more slowly"]);
    expect(r.watch.map((x) => [x.title, x.tag])).toEqual([["Stock is building up", undefined], ["Is the tax rate low?", "Investigate"]]);
    expect(r.watch.every((x) => x.to === "earnings")).toBe(true);
  });
});

describe("03 Key findings (README 3.3)", () => {
  it("one list: 11's findings are merged in, a title found twice keeps the red flag", () => {
    const k = dedupe({ flags: [{ key: "ec-flag", title: "Customers are paying more slowly", text: "a", to: "earnings" }], watch: [{ key: "c", title: "Customers are paying more slowly", text: "b", to: "earnings" }], good: [] });
    expect(k.flags).toHaveLength(1); expect(k.watch).toHaveLength(0);
    expect(src("KeyFindings.tsx")).toMatch(/flags: \[\.\.\.fromPl\("caution"\), \.\.\.\(earn\?\.flags \?\? \[\]\), \.\.\.\(checks\?\.flags \?\? \[\]\)\]/);
  });
  it("each finding is a drop-down with the round arrow and \"See the section ↓\"; an empty column is dimmed", () => {
    const s = src("KeyFindings.tsx");
    expect(s).toContain('<details className={"ins kf-it xdd " + kind}');
    expect(s).toContain("See the section ↓");
    expect(s).toContain('"kf-col" + (items.length ? "" : " empty")');
  });
});

describe("20 the report FAQ follows the plan (README 3.20)", () => {
  const items = [{ q: "What does the FinLit IQ at the top mean?", a: "IQ" }, { q: "What is in a report?", a: "The FinLit Prism score and how it has moved, then …" }];
  it("Gold and Platinum get the Prism question; Silver keeps the FinLit IQ one and its report list starts with the FinLit IQ", () => {
    expect(reportFaqFor(items, "prism")[0].q).toBe("What does the FinLit Prism score at the top mean?");
    expect(reportFaqFor(items, "prism")[0].a).not.toMatch(/\b(buy|sell|hold|target|avoid)\b/i);
    expect(reportFaqFor(items, "iq")[0].q).toBe("What does the FinLit IQ at the top mean?");
    expect(reportFaqFor(items, "iq")[1].a).toBe("The FinLit IQ, then …");
    expect(reportFaqFor(items, null)).toEqual(items);
  });
});

describe("02 Macro outlook (README 3.2)", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000).toISOString().slice(0, 10);
  const pts = (n: number): HistoryPoint[] => Array.from({ length: n }, (_, i) => ({ date: day(i), score: 40 + i, label: i < n - 2 ? "Neutral" : "Supportive", status: "ok", basis: "live" }));
  it("every reading while there are 7 or fewer; otherwise the last 1 week, 2 weeks or 1 month", () => {
    expect(macroWindow(pts(5), "1w")).toHaveLength(5);
    expect(macroWindow(pts(20), "1w")).toHaveLength(7);
    expect(macroWindow(pts(20), "2w")).toHaveLength(14);
    expect(macroWindow(pts(20), "1m")).toHaveLength(20);
  });
  it("the summary: latest score and word, change since the first reading, and the streak", () => {
    expect(macroSummary(pts(5))).toEqual({ score: 44, label: "Supportive", change: 4, since: day(0), first: 40, firstLabel: "Neutral", streak: 2 });
    expect(macroSummary([])).toBeNull();
  });
  it("the method sits in a drop-down above the backdrop; the enlarge button wraps only the chart", () => {
    const s = src("MacroOutlook.tsx");
    expect(s).toContain("How this reading is made");
    expect(s.indexOf("How this reading is made")).toBeLessThan(s.indexOf("<Backdrop"));
  });
});

describe("10, 12, 13, 15 drop-downs and the ranking status (README 3.10, 3.12, 3.13, 3.15)", () => {
  it("10's findings, 12's insight cards and 15's trigger are drop-downs", () => {
    expect(src("DecodeRoe.tsx")).toContain("dp-insc xdd");
    expect(src("own/OwnInsightCards.tsx")).toContain("ow-icard xdd");
    expect(src("own/OwnInsightCards.tsx")).not.toContain('href="#method"');
    expect(src("Sections3.tsx")).toContain("Why it matters, and what to watch");
  });
  it("13: the label chip alone, its rank and reading and its method in two drop-downs", () => {
    const s = src("Leadership.tsx");
    expect(s).toContain("Rank, gaps and this week's reading");
    expect(s).toMatch(/How this label works · /);
  });
});

describe("14 Where it stands (README 3.14)", () => {
  it("each reading has its own link to its tab (no i button inside a button) and opens and scrolls to the panel", () => {
    const s = src("pack/WhereStands.tsx");
    expect(s.match(/className="ws-go" onClick=\{\(\) => open\("/g)?.length).toBeGreaterThanOrEqual(4);
    expect(s).not.toMatch(/<button[^>]*className="ws-pill"/);
    expect(s).toContain('document.getElementById("ws-panel")');
  });
  it("a group already called \"peers\" is not named twice (\"10 peers peers\")", () => {
    expect(groupWord("peers")).toBe(""); expect(groupWord("Refineries")).toBe("Refineries "); expect(groupWord(null)).toBe("");
  });
  it("tab 2 shows the head-to-head with the group leader in place of a copy of 13's ranking table; peer cards follow the plan", () => {
    const s = src("pack/WhereStands.tsx");
    expect(s).toContain("<HeadToHead name={name} symbol={symbol} lead={lead} />");
    expect(s).toContain("The full ranking table, with each company's label, is in");
    expect(s).toContain('model === "prism" ? "Prism is the FinLit Prism score, 0 to 100." : "Score is the FinLit IQ, 0 to 100."');
    expect(css).toMatch(/\.ws-h2h \.ws-six-s \.dot\.me \{/);
    expect(css).toMatch(/@media \(max-width: 760px\) \{ \.ws \.ws-reads \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
  });
});

describe("18 Community (README 3.18)", () => {
  it("count tiles, and a side column with the numbered trending list", () => {
    const s = src("CommunitySection.tsx");
    expect(s).toContain("fo-tiles"); expect(s).toContain("fo-side");
    expect(css).toContain(".fo-trend-n");
  });
});
