// @vitest-environment jsdom
// Founder, 22 Nov 2026: "earlier they used to be inside a box, but something changed" and "the sentences written below them are taking too much spacing, I want them
// to be concise". Task #310 PR C (c6dfaea, 22 Nov) had made every page header open (no card). Every tool page's header is now in the shared card, the same box as the
// Equity portfolio header (.card.eqx-top), with a one-line description. The company pages (About, Services ...) keep their open hero with a shorter line.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader } from "../components/PageHeader";

const SRC = join(__dirname, "..");
const read = (f: string) => readFileSync(join(SRC, f), "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
afterEach(cleanup);

/** Every page-header family: the file that draws it and the element's class list, which must carry "card". */
const HEADS: [string, string][] = [
  ["components/screener/ScreenerHead.tsx", 'className="sp sp-head xsh card"'],
  ["pages/Discovery.tsx", 'className="sp sp-head xsh dsc-head card"'],
  ["components/sectors/pack/PulseHead.tsx", 'className="sp-head card"'],
  ["components/sectors/pack/IndustryPack.tsx", 'className="sp-head ip-head card"'],
  ["components/results/pack/ResultsPack.tsx", 'className="sp-head rs-head card"'],
  ["pages/MfPortfolio.tsx", 'className="ptk-head card"'],
  ["pages/EtfPortfolio.tsx", 'className="ptk-head card"'],
  ["pages/Watchlist.tsx", 'className="wp-head card"'],
  ["pages/Glossary.tsx", 'className="gp-head card"'],
  ["pages/Dashboard.tsx", 'className="dsh-head card"'],
  ["pages/Forum.tsx", 'className="fo-intro card"'],
  ["pages/Faqs.tsx", 'className="pfq-hub-h card"'],
  ["pages/Account.tsx", 'className="acct-h card"'],
];

/** The header rule of each family's stylesheet: the Equity portfolio header's padding, never the open 8px 0 4px of task #310. */
const BOXED: [string, RegExp][] = [
  ["styles/page-header.css", /\.ph \{[^}]*padding: 14px 18px 16px; margin: 12px 0 16px;/],
  ["styles/sectors-pack.css", /\.sp-head \{ margin: 12px 0 16px; padding: 14px 18px 16px; \}/],
  ["styles/screeners243.css", /\.xsh\.sp-head \{ margin: 12px 0 16px; padding: 14px 18px 16px; \}/],
  ["styles/watchlist-pack.css", /\.wp-head \{ margin: 12px 0 16px; padding: 14px 18px 16px;/],
  ["styles/glossary-pack.css", /\.gp-head \{ margin: 12px 0 16px; padding: 14px 18px 16px; \}/],
  ["styles/dashboard.css", /\.dsh-head \{[^}]*padding: 14px 18px 16px; \}/],
  ["portfolio/kit/kit.css", /\.ptk-head \{ margin: 12px 0 16px; padding: 14px 18px 16px; \}/],
  ["styles/forum.css", /\.fo-intro \{ margin: 12px 0 16px; padding: 14px 18px 16px; \}/],
  ["styles/pagefaqs.css", /\.pfq-hub-h \{ margin: 12px 0 16px; padding: 14px 18px 16px; \}/],
  ["styles/account.css", /\.acct-h \{[^}]*margin: 12px 0 16px; padding: 14px 18px 16px; \}/],
];

/** The founder's one-line descriptions (the "Page Headers Preview" of 22 Nov 2026), each in the file that holds it. */
const LINES: [string, string][] = [
  ["components/screener/ScreenerHead.tsx", "Filter every listed company by size, valuation, growth, debt, ownership and price trend."],
  ["components/screener/ScreenerHead.tsx", "Every company's Prism score, its four health parts and two trend views: filter, sort, compare."],
  ["pages/Discovery.tsx", "Companies grouped by what they are building, from their newest investor presentations."],
  ["pages/QueryBuilder.tsx", "</code>; we check it as you type and list every match."],
  // pages/Baskets.tsx's line went with the page: My baskets is a drop-down on the Query builder page (founder, 25 Nov 2026)
  ["pages/Premium.tsx", "Gold research tools, kept up to date from the same sources our analysts use."],
  ["pages/Markets.tsx", "This week's company disclosures, and every index against its own history, with commodity indices."],
  ["pages/PremiumReport.tsx", "A one-document research report on any company, to print or save as a PDF."],
  ["pages/Prism.tsx", "A company's financial health in four parts, the way a prism splits light."],
  ["pages/Compare.tsx", "and price behaviour across listed companies.</>}"],
  ["pages/GraphStudio.tsx", "Put charts side by side to spot patterns: pick companies, measures and a chart type for each."],
  ["etf/List.tsx", "Price and 1-day, 1-year and 5-year returns of every NSE ETF; search, filter, compare up to four."],
  ["etf/Compare.tsx", "Two to four ETFs on one chart, each rebased to 100 on the same day."],
  ["etf/CompareIndex.tsx", "An index's ETFs and index funds, compared on returns, costs, tracking and risk."],
  ["pages/FundScoreScreener.tsx", "Every scored fund's {MF_SCORE_NAME}, with its four parts."],
  ["pages/MfScoreMethod.tsx", "Describes a fund's health from its past NAVs, costs and holdings; not a recommendation."],
  ["pages/Funds.tsx", "Funds in your chosen categories by returns, SIP returns, latest NAV, checklist and more."],
  ["pages/MfScreener.tsx", "Filter every mutual fund and ETF by category, fund house, size, returns, cost, risk and portfolio."],
  ["pages/FundHeadToHead.tsx", "Two funds of one category, head to head on returns, risk, consistency and cost over 1–10 years."],
  ["pages/FundInsights.tsx", "Where India's fund money sits and where it moved last month, from AMFI's monthly report."],
  ["lib/watchlistPack.ts", "The companies you follow: how they are doing, against their peers, and what to look at next."],
  ["pages/Dcf.tsx", "A company's intrinsic value from its projected cash flows, with every step shown and checked."],
  ["pages/ReverseValuation.tsx", "The growth, margin, exit multiple or return today's price assumes. It describes; it does not predict."],
  ["pages/Outlook.tsx", "Revenue and profit by year, with a 1-, 3- or 5-year estimate from past growth; not a prediction."],
  ["pages/StressLab.tsx", "How a shock to crude, the rupee, inflation, rates or demand could move next-year earnings; illustrative."],
  ["pages/Superinvestors.tsx", "What well-known investors own and changed, from shareholding filings (holders of 1% or more)."],
  ["pages/EpsCalculator.tsx", "EPS, P/E and PEG from four numbers, and the price a future EPS and target P/E would imply."],
  ["pages/SipCalculator.tsx", "What a monthly investment could grow to, year by year, with goals, delay and tax."],
  ["pages/Alerts.tsx", "Be told in the app or browser when a stock meets your price, technical, ratio, score or news rule."],
  ["pages/Forum.tsx", "Discuss, ask and share what you find in Indian companies' filings."],
  ["pages/Ipo.tsx", "Open, upcoming and just-listed issues, and every IPO since 2020; the offer document is the final word."],   // task #329: one page, IPOs
  ["pages/ConcallMonitor.tsx", "Earnings call investor presentations, AI summaries and upcoming result meets."],   // task #339
  ["pages/Macro.tsx", "Inflation, growth, jobs, RBI rates, reserves and the rupee, from MoSPI and the RBI, with history."],
  ["pages/SectorPulse.tsx", "Which industries are being sold, bouncing back or rising together, as of each Friday's close."],
  ["pages/SectorRotation.tsx", "Which industries lead the market, which lag, and which are changing places over the months."],
  ["pages/LearnSectorRotation.tsx", "What the corners, breadth and rotation rank mean, and how to use them."],
  ["pages/LearnSectorSignals.tsx", "What each Sector Pulse reading means for an NSE industry, and how to use it."],
  ["pages/FiiDii.tsx", "Net buying (bought minus sold) by FIIs and DIIs on the latest day, with streaks and history."],
  ["pages/Results.tsx", "Who reports when, how each industry did, and every company's results for the quarter"],   // task #330: one Results page (Latest results is its Companies view)
  ["pages/News.tsx", "Exchange announcements and results filings sorted into topics, plus market news we pick."],
  ["pages/Documents.tsx", "Annual reports, presentations, transcripts and results filings, linked to the exchange."],
  ["pages/Companies.tsx", "Every listed Indian company, A to Z: pick a letter, then open a company's report."],
  ["lib/glossaryPack.ts", "investing terms in plain words: what each means, why it matters, how to use it, and its formula."],
  ["pages/BrowserExtension.tsx", "Select a term or company on any web page to see a FinLit card. Free; it reads only your selection."],
  ["pages/Faqs.tsx", "questions across {PAGE_FAQS.length} pages; each page also lists its own at the bottom."],
  ["pages/Research.tsx", "Prism score, statements, ratios, ownership and peers for"],
  ["pages/Services.tsx", "From your first investment to a portfolio review. Not sure which fits? Book a first session."],
  ["pages/About.tsx", "Stock research, portfolio reviews and planning. If we cannot explain it plainly, we do not share it."],
  ["pages/ConnectAI.tsx", "A free, read-only connection that lets AI assistants look up FinLit's Indian market data."],
  ["pages/LeadershipLabel.tsx", "How a stock's last 12 months compare with similar companies. It looks back; it does not predict."],
  ["pages/Contact.tsx", "Tell us what you need. A person reads every message; we usually reply within one working day."],
  ["pages/Blog.tsx", "Explainers, myth-busters and thought pieces on investing, in plain language; never a recommendation."],
  ["pages/Plans.tsx", "Free to start; Mutual Fund + ETF and Equity Portfolio open one area each; Gold and Platinum open everything."],   // task #410
];

describe("page headers are boxed again (founder, 22 Nov 2026)", () => {
  it("the shared page header is a card, with the plan badge beside the title", () => {
    const { container } = render(<MemoryRouter><PageHeader plan="gold" eyebrow="Research" title="Fund score screener" description="One line." /></MemoryRouter>);
    const head = container.querySelector("section.ph")!;
    expect(head.classList.contains("card")).toBe(true);
    const line = head.querySelector(".ph-tline")!;
    expect(line.querySelector("h1")?.textContent).toBe("Fund score screener");
    expect(line.querySelector(".ph-plan")?.textContent).toBe("Gold");
    expect(head.querySelector(".ph-top")?.textContent).toBe("Research");   // the eyebrow keeps its line above the title
  });
  it("a header with no plan has the title alone (no empty line beside it)", () => {
    const { container } = render(<MemoryRouter><PageHeader title="Compare ETFs" /></MemoryRouter>);
    expect(container.querySelector(".ph-tline")).toBeNull();
    expect(container.querySelector(".ph-top")).toBeNull();
    expect(container.querySelector(".ph.card > .ph-main > h1")?.textContent).toBe("Compare ETFs");
  });
  it.each(HEADS)("%s draws its header in the card", (file, cls) => {
    expect(read(file)).toContain(cls);
  });
  it.each(BOXED)("%s pads the header like the Equity portfolio header", (file, rule) => {
    const css = noComments(read(file));
    expect(css).toMatch(rule);
    expect(css).not.toMatch(/(\.ph|\.sp-head|\.wp-head|\.gp-head|\.dsh-head|\.ptk-head) \{[^}]*padding: 8px 0 4px/);   // task #310's open header
  });
  it("the reference header keeps the same padding (portfolio/pack/eq-top.css)", () => {
    expect(read("portfolio/pack/eq-top.css")).toContain(".eqx-top { margin: 12px 0 0; padding: 14px 18px 16px; }");
  });
  it("each description is one line wide on a desktop, above the site's card reading width (.card p, 68ch)", () => {
    expect(noComments(read("styles/page-header.css"))).toContain(".ph .ph-desc, .ph .ph-meta { max-width: 104ch; }");
    expect(noComments(read("styles/sectors-pack.css"))).toContain(".sp-head .sp-desc { max-width: 104ch; }");
    expect(noComments(read("styles/screeners243.css"))).toContain(".xsh .sp-desc { max-width: 104ch; margin: 0; }");
    expect(noComments(read("styles/glossary-pack.css"))).toContain(".gp-head .gp-desc { max-width: 104ch; }");
    expect(noComments(read("styles/premium.css"))).toContain(".card p, .feat p { max-width: 68ch; }");   // the rule the header rules outrank
  });
  it("on a phone the description takes the body size (14px on 20px), so the header is no taller than in the approved preview", () => {
    const phone = (f: string) => (noComments(read(f)).match(/@media \(max-width: 760px\)[^@]*/g) ?? []).join(" ");
    expect(phone("styles/page-header.css")).toContain(".ph .ph-desc { font-size: var(--fs-14); line-height: var(--lh-14); }");
    expect(phone("styles/sectors-pack.css")).toContain(".sp-head.card .sp-desc { font-size: var(--fs-14); line-height: var(--lh-14); }");
    expect(phone("styles/glossary-pack.css")).toContain(".gp-head .gp-desc { font-size: var(--fs-14); line-height: var(--lh-14); }");
    expect(phone("styles/watchlist-pack.css")).toContain(".wp-head .wp-head-t p { font-size: var(--fs-14); line-height: var(--lh-14); }");
    expect(phone("styles/forum.css")).toContain(".fo-intro.card p { font-size: var(--fs-14); line-height: var(--lh-14); }");
    expect(phone("styles/pagefaqs.css")).toContain(".pfq-hub-h.card p { font-size: var(--fs-14); line-height: var(--lh-14); }");
  });
  it("section.ph.card and .xsh.sp-head.card outrank the page-scoped card padding (.mf .card, .ssw .card ...)", () => {
    expect(noComments(read("styles/page-header.css"))).toContain("section.ph.card { padding: 14px 18px 16px; }");
    expect(noComments(read("styles/screeners243.css"))).toContain(".xsh.sp-head.card { padding: 14px 18px 16px; }");
    expect(noComments(read("styles/mf.css"))).toContain(".mf .card { padding: 20px 22px; }");   // the rule they outrank
  });
});

describe("the one-line descriptions (founder, 22 Nov 2026)", () => {
  it.each(LINES)("%s: %s", (file, line) => {
    expect(read(file)).toContain(line);
  });
  it("every line stays short: at most 110 characters before the code sample or the plan list", () => {
    for (const [, line] of LINES) expect(line.length).toBeLessThanOrEqual(110);
  });
  it("the disclaimers sit in the note under the description", () => {
    expect(read("pages/Companies.tsx")).toContain('meta="Describes the company\'s financial health from its filings and prices; not a recommendation. Information only, not investment advice."');
    expect(read("pages/Prism.tsx")).toContain("meta={children ? undefined : PRISM_NOTE}");
    expect(read("pages/FundScoreScreener.tsx").match(/meta=\{MF_SCORE_NOTE\}/g)).toHaveLength(2);   // the visitor's header and the Gold member's
  });
  it("the latest results line names the quarter end with the three-letter month", async () => {
    const { dayMonth } = await import("../lib/dashboard");
    expect(`Results for the quarter ended ${dayMonth("2026-09-30", true)}, newest first, each compared with similar companies.`)
      .toBe("Results for the quarter ended 30 Sep 2026, newest first, each compared with similar companies.");
  });
  it("the long sentences stay the pages' search descriptions, not the header", () => {
    for (const f of ["pages/SectorPulse.tsx", "pages/SectorRotation.tsx", "pages/LearnSectorRotation.tsx", "pages/LearnSectorSignals.tsx"]) {
      const t = read(f);
      expect(t).toMatch(/useDocTitle\(TITLE, ((?:tw|rw)\()?DESC\)?\)/);     // rw(): Sector Rotation's own words for its two views (task #332)
      expect(t).toMatch(/desc(ription)?=\{((?:tw|rw)\()?HEAD_DESC\)?\}/);
    }
    expect(read("pages/ConcallMonitor.tsx")).toContain('useDocTitle("Concall Monitor", SUBTITLE)');
    expect(read("pages/ConcallMonitor.tsx")).toContain("description={HEAD_DESC}");
  });
});
