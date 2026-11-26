// The company report's order and numbering. Developer file 41 (founder, 25 Nov 2026): "rearrange the sections and remove section 15 ... merge section 8
// into these and remove it ... funnelling: we go from company to industry/sector; news, filings and discussion remain where they are". One list
// (lib/sectionNav NAV) sets the order; the page draws its sections in it and every heading, chip and menu line takes its number from it.
// Earlier rules kept: no Historical trend section (tasks #34, #37), no live 17 "Pros, cons & Prism history" (task #216), Where it stands in place of
// Sector & peers and Leadership, Community discussions last (tasks #105, #113).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GROUP_START, NAV, sectionNo } from "../lib/sectionNav";

const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
const page = read("StockPage.tsx");
/** The section ids in the order the page draws them (its phone rows; DuPont and Earnings & cash sit inside Ratios, right after it). */
const drawn = () => [...page.matchAll(/<PhoneFold page="stock" \{\.\.\.foldOf\("([a-z-]+)"\)\}>/g)].map((m) => m[1]);
/** Every report heading's id and the name it passes (`<SectionHead id="ratios" no="Ratios" …>`, or the HEAD object of Ownership). */
const heads = () => files(__dirname).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/id(?:=|:\s*)"([a-z-]+)",?\s*no(?:=|:\s*)"([^"]+)"/g)].map((m) => [m[1], m[2]] as [string, string]));

describe("company report order: from the company out to its industry, its sector and the economy (developer file 41)", () => {
  const ids = NAV.map(([id]) => id);
  it("the one order: the company first, then peers, where it stands and the economy; News and filings and Discussions last", () => {
    expect(ids).toEqual(["prism", "business", "notes", "price", "quarter", "financials", "trends", "segments", "ratios", "dupont", "earnings", "dividends", "ownership",
      "peers", "sector", "macro", "news", "community"]);
  });
  it("the page draws its sections in that order (DuPont and Earnings & cash are inside Ratios)", () => {
    expect(drawn()).toEqual(ids.filter((id) => !["prism", "dupont", "earnings"].includes(id)));
    expect(page).not.toContain('foldOf("company-brief")');   // developer file 44: the Company brief is no longer in the report
  });
  it("the numbers run 01 to 17 with no gap, in that order; Scores has none", () => {
    expect(sectionNo("prism")).toBeNull();
    expect(ids.slice(1).map(sectionNo)).toEqual(Array.from({ length: 17 }, (_, i) => String(i + 1).padStart(2, "0")));
    expect([sectionNo("business"), sectionNo("quarter"), sectionNo("macro"), sectionNo("news"), sectionNo("community")]).toEqual(["01", "04", "15", "16", "17"]);
  });
  it("every heading takes its number from the order (none is typed in a section's file) and every section has its heading", () => {
    const h = heads().filter(([id]) => ids.includes(id));
    for (const [id, no] of h) expect(no, id).not.toMatch(/^\d/);
    expect(new Set(h.map(([id]) => id))).toEqual(new Set(ids.filter((id) => id !== "prism")));
    const name = new Map(h);
    expect([name.get("business"), name.get("macro"), name.get("news"), name.get("community")]).toEqual(["Company overview", "Economy and sector", "News and filings", "Community"]);
  });
  it("the separators of the section bar: price · results · ratios · shareholders · industry, sector and economy · filings and discussions", () => {
    expect([...GROUP_START]).toEqual(["price", "quarter", "ratios", "dividends", "peers", "news"]);
  });
  it("text that names a section number takes it from the order: Dividends' pointer to News and filings, the earnings checks, the filing scores", () => {
    expect(read("Sections2.tsx")).toContain('<a href="#news">{sectionNo("news")} News and filings</a>');
    expect(read("EarningsCash.tsx")).toContain('`Section ${sectionNo("earnings")} looks at this in step 3');
    expect(read("FilingScores.tsx")).toContain('in Section {sectionNo("news")} or in');
  });
});

describe("section 08 Chart lab and section 15 Gold insights are gone (developer file 41)", () => {
  it("no Chart lab and no Gold insights in the page, the section bar or the code", () => {
    expect(NAV.some(([id]) => id === "charts" || id === "insights")).toBe(false);
    for (const t of ["<ChartLab", "<InsightsSection", "./ChartLab"]) expect(page, t).not.toContain(t);
    expect(read("Sections3.tsx")).not.toContain("export function InsightsSection");
    expect(heads().some(([, no]) => /Chart lab|Gold insights/.test(no))).toBe(false);
  });
  it("its charts that no other section draws are inside their own sections; the ones that repeated a section's own are not kept", () => {
    const more = read("MoreCharts.tsx"), price = read("Sections.tsx"), div = read("Sections2.tsx");
    expect(price).toContain("<PriceStats symbol={symbol} />");                                 // Price & technicals: the price statistics
    expect(price).toContain('{kind === "bs" ? <BsCharts f={f} /> : kind === "cf" ? <CfCharts f={f} /> : <PlCharts f={f} />}');   // Financials, on the table's accounts
    expect(div).toContain('{ key: "actions", label: "Bonus and splits", content: <ActionsTimeline e={e} /> }');   // Dividends
    // repeats: the candle chart (Price), EPS (Trends), the funding shares (the balance sheet chart), the cash streams and free cash flow (the cash flow
    // chart and Trends), every ownership chart (Ownership), the valuation dumbbell (Ratios' valuation history), the peers' market values (Peers)
    for (const t of ['help="price-candles"', 'help="eps"', 'help="bs-funding"', 'help="cf-streams"', 'help="cf-fcf"', 'help="own-', 'help="val-dumbbell"', 'help="peers-'])
      expect(more, t).not.toContain(t);
  });
});

describe("earlier rules that still hold", () => {
  it("no Historical trend section or menu entry (tasks #34, #37)", () => {
    expect(heads().some(([, t]) => /Historical trend/i.test(t))).toBe(false);
    expect(NAV.some(([id]) => id === "history")).toBe(false);
    expect(read("Sections3.tsx")).not.toContain("Margins and returns against their own history");
  });
  it("Where it stands replaces Sector & peers and Leadership, right after Peers", () => {
    const ids = NAV.map(([id]) => id);
    expect(ids).not.toContain("leadership");
    expect(NAV.find(([id]) => id === "sector")?.[1]).toBe("Where it stands");
    expect(page).not.toContain("<LeadershipSection"); expect(page).not.toContain("<SectorPeersSection");
    expect(page.indexOf("<WhereStands")).toBeGreaterThan(page.indexOf("<PeersSection"));
    expect(ids.indexOf("sector")).toBe(ids.indexOf("peers") + 1);
  });
  it("Community discussions is the last section, after News and filings", () => {
    for (const tag of ["<BusinessSection", "<PriceSection", "<DividendsSection", "<MacroOutlookSection", "<NewsSection"]) expect(page.indexOf(tag), tag).toBeLessThan(page.indexOf("<CommunitySection symbol"));
    expect(NAV[NAV.length - 1][0]).toBe("community");
  });
  it("live section 17 \"Pros, cons & Prism history\" stays gone; its chart sits under the Prism card (task #216)", () => {
    expect(page).not.toContain("<MethodSection");
    expect(read("Sections2.tsx")).not.toContain("Pros, cons & Prism history");
    expect(NAV.some(([id]) => id === "method")).toBe(false);
    const hero = read("Hero.tsx");
    expect(hero.indexOf("<ScoreMovesCard")).toBeGreaterThan(hero.indexOf("<PrismCompare"));
  });
});
