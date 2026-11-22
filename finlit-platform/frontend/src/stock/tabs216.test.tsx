// @vitest-environment jsdom
// Task #216 round 2 part 2 (company report handover, 17 Nov 2026): the tab groups of 11, 12, 16 and 17 (README 1.2, 3.11, 3.12, 3.16, 3.17), the sections
// bar's "Announcements" opening 17's third tab (since task #222 the filings are section 18, NewsSection), the 9 new i buttons with the pack's texts (1.4), every i button inside its tile (1.4), 12's year chips
// looking like the tabs (1.5), and the drop-downs that had no round arrow (1.3).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Events } from "../lib/api";
import { NEW_I, newInfo } from "../lib/reportInfo";
import { DividendsSection } from "./Sections2";

afterEach(cleanup);
const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
const css = (f: string) => readFileSync(join(__dirname, "../styles", f), "utf8");

const EV: Events = {
  meta: {} as Events["meta"], dividendYieldTtm: 0.5,
  actions: [{ type: "final_dividend", date: "2026-08-14", amount: 6 } as Events["actions"][number]],
  announcements: [{ date: "2026-11-10", category: "Results", description: "Board meeting outcome", link: "https://www.nseindia.com/x" } as Events["announcements"][number]],
  dividendsByFY: { periods: ["FY25", "FY26"], dps: [5.5, 6], dpsUnadjusted: [5.5, 6], basis: "Declared for each financial year" },
};

describe("17 Dividends (README 3.17; task #222, 19 Nov pack S1: two views, the filings are their own section 18)", () => {
  it("is one tab group of 2 views: Dividend history · What it would pay you; no Exchange announcements tab; the KPI tiles stay above it", () => {
    const { container } = render(<MemoryRouter><DividendsSection e={EV} price={1200} /></MemoryRouter>);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["1Dividend history", "2What it would pay you"]);
    expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("Dividends");
    expect(container.querySelector(".ctabs-h b")!.textContent).toBe("2 views");
    expect(container.querySelector(".dvk")!.compareDocumentPosition(container.querySelector(".ctabs")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("#announcements")).toBeNull();
    expect([...container.querySelectorAll(".ct-next-k")].map((x) => x.textContent)).toEqual(["Next view · 1 of 2", "Back to the first view · 2 of 2"]);
    const line = container.querySelector(".nf-x")!;
    expect(line.textContent).toBe("Board decisions, record dates and other dividend notices are listed in 18 News and filings.");
    expect(line.querySelector("a")!.getAttribute("href")).toBe("#news");
  });
  it("the sections bar waits for the hidden panel to open before it scrolls (no jump to the top of a hidden box)", () => {
    expect(src("StockPage.tsx")).toMatch(/if \(t && t\.closest\("\[hidden\]"\) && tries < 4\) \{ requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => jump\(id, tries \+ 1\)\)\); return; \}/);
  });
});

describe("11, 12 and 16 (README 3.11, 3.12, 3.16)", () => {
  it("11: steps 1 to 3 are a tab group; step 4, the six checks, stays outside under it; a lender has no tab group", () => {
    const s = src("EarningsCash.tsx");
    expect(s).toMatch(/<TabGroup label="Earnings and cash quality" views=\{\[\s*\{ key: "cash", label: "Profit against cash"[\s\S]*\{ key: "stock", label: "Collections and stock"[\s\S]*\{ key: "clean", label: "Is the profit clean\?"/);
    expect(s.indexOf('<TabGroup label="Earnings and cash quality"')).toBeLessThan(s.indexOf('aria-labelledby="ec-4"'));
    expect(s).toMatch(/\{lender \? <section className="ec-sec" aria-labelledby="ec-3">/);
  });
  it("12: owners first, then What changed · Pattern over time · Filing facts & top holders", () => {
    const s = src("own/OwnershipSection.tsx");
    expect(s.indexOf("<OwnersToday")).toBeLessThan(s.indexOf("<TabGroup"));
    expect(s).toMatch(/label: "What changed"[\s\S]*label: "Pattern over time"[\s\S]*label: "Filing facts & top holders"/);
  });
  it("16: How the mix has changed · Segment trends · Insights, highlighted; a single part needs no tab group", () => {
    const s = src("SegmentMix.tsx");
    expect(s).toMatch(/label: "How the mix has changed"[\s\S]*label: "Segment trends"[\s\S]*label: "Insights"/);
    expect(s).toContain('views.length > 1 ? <TabGroup label="Segments" variant="highlighted" views={views} /> : views[0].content');
  });
});

describe("i buttons (README 1.4)", () => {
  it("the 9 new i buttons carry the pack's texts word for word", () => {
    expect(Object.keys(NEW_I)).toEqual(["Size", "Style", "Income", "Momentum", "Where it fits", "Shareholders", "Promoter shares pledged", "Shares outstanding", "Shares under lock-in"]);
    expect(NEW_I.Size).toBe("FinLit’s fixed size bands: large above ₹75,000 Cr, mid ₹25,000–75,000 Cr, small ₹10,000–25,000 Cr, micro below ₹10,000 Cr.");
    expect(NEW_I["Shares under lock-in"]).toBe("Shares that cannot be sold yet, usually after an IPO or a preferential issue.");
    expect(newInfo("Momentum")).toEqual({ key: "i216-momentum", label: "Momentum", what: "Oversold, neutral or overbought, from the 14-day RSI." });
    expect(newInfo("P/E")).toBeNull();   // the site's own i buttons keep their own texts
  });
  it("15's Size, Style, Income, Momentum and Where it fits show them", () => {
    const s = src("Sections3.tsx");
    expect(s).toContain('<span className="label">{k}<Info g={newInfo(k)} /></span>');
    expect(s).toContain('<span className="label">Where it fits<Info g={newInfo("Where it fits")} /></span>');
  });
  it("the key-figure tiles keep their i button inside, top right, and their notes wrap", () => {
    const r = css("report216.css");
    expect(r).toMatch(/\.kpis \.kpi \.kl > button\.info \{ position: absolute; top: 10px; right: 10px;/);
    expect(r).toMatch(/\.kpis \.kpi \.kl \{ padding-right: 26px;/);
    expect(r).toMatch(/\.kpis \.kpi \.s \{ white-space: normal; overflow: visible; text-overflow: clip;/);
  });
});

describe("year chips and drop-downs (README 1.5, 1.3)", () => {
  it("12's year chips look like the tabs: in the same edged bar, white chips, the one selected look when chosen (task #310: not the chart blue)", () => {
    const r = css("report216.css");
    expect(r).toMatch(/section\.block \.own-yr2 \{[^}]*border-left: 5px solid var\(--ui-on-bg\)/);
    expect(r).toMatch(/section\.block \.own-chip\[aria-checked="true"\] \{ background: var\(--ui-on-bg\); border-color: var\(--ui-on-bg\); color: var\(--ui-on-fg\);/);
    expect(r).not.toMatch(/own-(yr2|chip)[^{]*\{[^}]*var\(--c1\)/);
  });
  it("\"Show as table\" (score history) and \"Sources and checks\" (company brief) show the round arrow", () => {
    expect(src("PrismHistory.tsx")).toContain('<details className="phx-table xdd"><summary>Show as table<DropChev /></summary>');
    expect(src("CompanyBrief.tsx")).toMatch(/<details className="cb-det xdd">\s*<summary>Sources and checks<DropChev \/><\/summary>/);
  });
});
describe("shared fixes found while checking", () => {
  it("a tab group never widens a grid parent (10's seven tabs made the phone page scroll 485 px sideways)", () => {
    expect(css("tabgroup.css")).toMatch(/\.ctabs, \.ct-panels, \.ctab-panel \{ min-width: 0; \}/);
  });
  it("a chart inside a tab panel keeps its enlarge button in its own corner, never on the tab bar (16)", () => {
    expect(readFileSync(join(__dirname, "../components/ChartZoom.tsx"), "utf8")).toMatch(/if \(a\.hasAttribute\("data-ct-panel"\)\) return null;/);
  });
});
describe("sections bar company chip (README 1.8)", () => {
  it("200 px past the bar the company bar folds away and \"RELIANCE ₹… ▲ +…%\" shows at the left, linking back to the top; phones hide the change", () => {
    const p = src("StockPage.tsx"), c = css("report216.css");
    expect(p).toContain("setFolded(bt < -70); if (bt < 130) setStuck(true); else if (bt > 200) setStuck(false);");
    expect(p).toContain("<MiniBar s={s} on={stuck && !folded} />");
    expect(p).toMatch(/\{stuck && folded && <a className="sn-co" href="#top" title="Back to the top"/);
    // task #246: the chip leads with the company's short name for a BSE-only company (its code in the title); an NSE symbol is unchanged
    expect(p).toMatch(/<b title=\{coTitle\(s\.profile\)\}>\{shortLabel\(s\.profile\)\}<\/b><span className="sn-co-px">₹/);
    expect(c).toMatch(/@media \(max-width: 640px\) \{ \.secnav \.sn-co-chg \{ display: none; \} \}/);
    expect(p).not.toMatch(/\.scrollIntoView\(/);   // the tracker never calls scrollIntoView (1.8)
  });
});
vi.restoreAllMocks();
