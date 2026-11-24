// Task #311 (developer file 21, 22 Nov 2026): the "how it is made" text is off the 12 tool pages. Each row of the file: the old text is gone from the
// source that draws it, the new text is there. FAQ blocks are left as they are (except the one question about a line that no longer exists).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { howPrismWorks } from "./lib/prism";
import { togetherWords, diiFeedText } from "./lib/flowsMath";
import { estimateLine } from "./stock/MacroOutlook";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const ROWS: [string, string, string[], string[]][] = [
  ["P1 company report", "./stock/PrismCompare.tsx", ["Advanced model ·", ">how it works<"], [">What the score means<"]],
  ["P1 company report", "./stock/prismCardLogic.ts", ["Technical indicators assess price trend and momentum separately", "Assesses price trend and momentum using technical indicators."], ["Price trend and momentum, shown separately from the score."]],
  ["P1 company report", "./stock/PrismCardView.tsx", ["{TECH_SEPARATE_NOTE}", "FUND_NOTE"], []],
  ["P1 company report", "./stock/ScoreMoves.tsx", ["Recording began", "it is not a forecast or a recommendation"], ["Risk: higher means lower risk</p>"]],
  ["P1 company report", "./stock/DiscoverThemes.tsx", ["Information only, not a recommendation."], []],
  ["P1 company report", "./stock/KeyFindings.tsx", ["not investment advice"], []],
  ["P1 company report", "./stock/MacroOutlook.tsx", ["How this reading is made", "model v{c.modelVersion}"], ["An early estimate for the company's"]],
  ["P2 Prism", "./components/prism/pzr/Landing.tsx", ["starts calculating", "Each member can calculate 20 a day", "Opening one never starts a calculation", "and which inputs are missing"], ["The latest rating for each company."]],
  ["P3 screener", "./pages/ScreenerPro.tsx", ["until a company's report is loaded", "no full report loaded yet", "Report loaded"], []],   // task #364: "have no ratios yet" and "With ratios" left with the coverage ring, which the team asked off the page; the foot line still gives the count
  ["P3 screener", "./components/screener/PageParts.tsx", ["({nf(pct, 0)}%)</li>"], []],
  ["P4 superinvestors", "./superinvestors/TrackedTab.tsx", ["the same-size market is the median move"], ["against companies of the same size. It is not the investor's own return."]],
  ["P4 superinvestors", "./pages/Superinvestors.tsx", ["Built from the filings of", "(fetched"], ["companies covered."]],
  ["P5 IPO calendar", "./pages/Ipo.tsx", ["updated automatically from exchange data"], ["For information only; the offer document is the authoritative source."]],
  ["P6 fund page", "./pages/Funds.tsx", ["standard deviation of daily NAV changes", "square root of 252"], ["How much the NAV moves from day to day, shown as a yearly figure.", "The deepest fall from a NAV high"]],
  ["P6 fund page", "./mf/ScoreCard.tsx", ["How it works</Link>{s.runDate", "worked out ${dateIN"], ["What the score means</Link>"]],
  ["P7 MF score page", "./pages/MfScoreMethod.tsx", ["How the {MF_SCORE_NAME} works", "stays with the model", "At least 8 such funds", "median points", "The five states of a measure", "Worked examples", "One fund, measure by measure", "What is used"], ["What the {MF_SCORE_NAME} means", "Each part is shown as a word: Strong, Fair or Weak.", "Direct plans are compared with Direct, Regular with Regular.", "a missing figure never helps a fund's score", "What the score is, and what it is not", "Labels and colours", "Freshness", "History and status"]],
  ["P8 Sector Pulse guide", "./pages/LearnSectorSignals.tsx", ["with enough traded stocks", "9, 20 and 50-day", "200-day average", "A full flag means"], ["How many of the industry's stocks are rising over the short, medium and longer term.", "Whether the market as a whole is in an uptrend", "A flag marks a stock at a new high while its industry is still well below its own."]],
  ["P9 all my investments", "./myinvest/AllTogether.tsx", ["Every beta is from weekly prices"], ['line="Against the Nifty 500, over the past year."']],
  ["P9 all my investments", "./pages/MyInvestments.tsx", ["quantity × average buy price", "Beta together is the sum", "Nothing is sent to your broker.\"]"], ["Gain or loss is today's value minus what you paid, from the buy price you gave."]],
  ["P10 MF screener", "./pages/MfScreener.tsx", ["month-end NAVs up to the last full month"], ["Risk figures are to the end of last month. Ranks compare funds of the same category and plan."]],
  ["P10 MF screener", "./mf/screen/Panel.tsx", ["so every fund is on the same ruler", "no parsed file"], ["Figures to the end of last month.", "From each fund's latest monthly portfolio."]],
  ["P10 MF screener", "./lib/mfScreenDefs.ts", ["standard deviation", "all plans of the scheme together"], ["How much returns moved from month to month over 3 years, shown as a yearly figure.", "Average assets over the latest quarter. Size says how big a fund is, not how good it is."]],
  ["P11 India macro", "./pages/Macro.tsx", ["CPI (base 2024 = 100), as published"], ["Source: MoSPI. Change over the same month a year earlier."]],
  ["P12 FII and DII", "./pages/FiiDii.tsx", ["running total of daily net flow", "the first day NSDL's DII report exists", "The range follows the buttons on the main chart", "Left axis: running total"], ["Left axis: total flow since the start of the range"]],
];

describe("task #311: method text off the pages", () => {
  for (const [page, file, gone, there] of ROWS)
    it(`${page}: ${file}`, () => {
      const s = src(file);
      for (const g of gone) expect(s, `still has: ${g}`).not.toContain(g);
      for (const t of there) expect(s, `missing: ${t}`).toContain(t);
    });

  it("P2: the Prism page shows the member's own allowance", () => {
    expect(howPrismWorks(10)).toBe("Choose a company to open its rating. A new rating can take up to half a minute. You can open 10 a day.");
    expect(howPrismWorks(20)).toContain("You can open 20 a day.");
    expect(howPrismWorks(null)).toBe("Choose a company to open its rating. A new rating can take up to half a minute.");
  });
  it("P1 row 12: one estimate line with its date", () => {
    expect(estimateLine({ snapshotDate: "2026-11-22", mapping: { basis: "primary" } } as never)).toBe("An early estimate for the company's main sector · 22 Nov 2026");
  });
  it("P12: plain words for the flow and index chart and the DII start", () => {
    expect(togetherWords(0.31)).toBe("flows and the index have tended to move together");
    expect(togetherWords(-0.4)).toContain("opposite");
    expect(togetherWords(0.02)).toContain("almost no link");
    expect(diiFeedText("2026-06-01")).toBe("DII daily figures start on 1 Jun 2026.");
  });
  it("S1: none of the file's search words is left in the pages' sources", () => {
    const files = [...new Set(ROWS.map((r) => r[1]))].map(src).join("\n");
    for (const w of ["coverage 100%", "inputs available", "square root", "standard deviation", "9, 20 and 50-day", "median points", "report is loaded", "starts calculating"]) expect(files, w).not.toContain(w);
  });
  it("S3: FinEdge still named on Superinvestor portfolios and the IPO calendar (Hold)", () => {
    expect(src("./pages/Ipo.tsx")).toContain('"Source: FinEdge"');
    expect(src("./pages/Ipo.tsx")).toContain("Data as of {stamp}");
  });
});
