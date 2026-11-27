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
import { PAGE_FAQS } from "../content/pageFaqs";
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

describe("20 the report FAQ (README 3.20; task #283: the same FinLit Prism question for every plan)", () => {
  it("the company report's questions ask about FinLit Prism for every plan, without advice words", () => {
    const items = PAGE_FAQS.find((f) => f.id === "company-report")!.items;
    const q = items.find((i) => i.q === "What does the FinLit Prism score at the top mean?")!;
    expect(q.a).not.toMatch(/\b(buy|sell|hold|target|avoid)\b/i);
    expect(reportFaqFor(items, "prism")).toEqual(items); expect(reportFaqFor(items, null)).toEqual(items);
    expect(JSON.stringify(items)).not.toMatch(/\bIQ\b/);
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
  it("task #311: one estimate line (no method drop-down) above the backdrop; the enlarge button wraps only the chart", () => {
    const s = src("MacroOutlook.tsx");
    expect(s).not.toContain("How this reading is made");
    expect(s.indexOf("{estimateLine(c)}")).toBeGreaterThan(0);
    expect(s.indexOf("{estimateLine(c)}")).toBeLessThan(s.indexOf("<Backdrop"));
  });
});

describe("10, 12, 13, 15 drop-downs and the ranking status (README 3.10, 3.12, 3.13, 3.15)", () => {
  it("DuPont's findings and Ownership's insight cards are drop-downs (15's trigger cards went with Gold insights, developer file 41)", () => {
    expect(src("DecodeRoe.tsx")).toContain("dp-insc xdd");
    expect(src("own/OwnInsightCards.tsx")).toContain("ow-icard xdd");
    expect(src("own/OwnInsightCards.tsx")).not.toContain('href="#method"');
    expect(src("Sections3.tsx")).not.toContain("Why it matters, and what to watch");
  });
  it("13: the label chip alone, its rank and reading and its method in two drop-downs", () => {
    const s = src("Leadership.tsx");
    expect(s).toContain("Rank, gaps and this week's reading");
    expect(s).toMatch(/How this label works · /);
  });
});

describe("14 Industry (README 3.14; developer file 47: the industry only, no tabs)", () => {
  it("its readings are plain readings (the industry is the one view, so they link to no tab); the chart reading still points to 03", () => {
    const s = src("pack/WhereStands.tsx");
    expect(s).not.toMatch(/className="ws-go" onClick=\{\(\) => open\("/);
    expect(s).not.toMatch(/<button[^>]*className="ws-pill"/);
    expect(s).toContain('<a className="ws-go" href="#price" onClick={toPrice}>');
  });
  it("a group already called \"peers\" is not named twice (\"10 peers peers\")", () => {
    expect(groupWord("peers")).toBe(""); expect(groupWord("Refineries")).toBe("Refineries "); expect(groupWord(null)).toBe("");
  });
  it("the peers are 13's alone: no head-to-head and no copy of its company cards here; the group leader what-if is in 13", () => {
    const s = src("pack/WhereStands.tsx");
    expect(s).not.toContain("<HeadToHead ");
    expect(s).not.toContain("Business against similar companies");
    expect(src("Sections3.tsx")).toContain("<LeaderWhatIf symbol={self}");
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
