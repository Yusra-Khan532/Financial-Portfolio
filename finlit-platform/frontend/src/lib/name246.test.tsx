// @vitest-environment jsdom
// Task #246 (19 Nov 2026): name first for BSE-only stocks. A stock listed only on the BSE has a six-digit code as its symbol (2,552 of 5,841). Lists show its NAME as the main
// label and "BSE 526433" on the small line; chips show the short name with the code in the title. NSE symbols are unchanged; links stay /stocks/<symbol>.
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../components/CoLogo", () => ({ CoLogo: () => null }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import { clip, codeText, coLabel, coTitle, shortLabel, shortName, sortLabel, subLine, titleOf } from "./companyLabel";
import { CoName } from "../components/CoName";
import { SharesTable } from "../portfolio/SharesTable";
import type { Line, Ready } from "./portfolioOverview";

afterEach(cleanup);
const ASM = { symbol: "526433", name: "Asm Technologies Ltd" }, NSEX = { symbol: "544937", name: "National Stock Exchange Of India Ltd" };
const TIPS = { symbol: "TIPSMUSIC", name: "Tips Music Ltd" }, NONAME = { symbol: "530001", name: null };

describe("the rule (companyLabel)", () => {
  it("a BSE code with a name: the name leads, the code moves to the small line as 'BSE 526433', the title holds both", () => {
    expect(coLabel(ASM)).toEqual({ main: "Asm Technologies Ltd", code: "BSE 526433", title: "Asm Technologies Ltd · BSE 526433" });
    expect(titleOf(ASM)).toBe("Asm Technologies Ltd"); expect(coTitle(ASM)).toBe("Asm Technologies Ltd · BSE 526433");
    expect(subLine(ASM, "IT - Software")).toBe("BSE 526433 · IT - Software");
    expect(subLine(ASM, "Asm Technologies Ltd")).toBe("BSE 526433");            // the name is never repeated underneath
    expect(codeText("526433")).toBe("BSE 526433");
  });
  it("a BSE code with no name keeps the code, with its reason on hover", () => {
    expect(coLabel(NONAME)).toEqual({ main: "530001", code: null, title: "BSE code. The company name is not in our data yet." });
    expect(subLine(NONAME, null)).toBeNull(); expect(shortLabel(NONAME)).toBe("530001");
  });
  it("an NSE symbol is unchanged: same label, same small line, no new title", () => {
    expect(titleOf(TIPS)).toBe("TIPSMUSIC"); expect(subLine(TIPS, "Tips Music Ltd")).toBe("Tips Music Ltd"); expect(coTitle(TIPS)).toBeUndefined();
    expect(shortLabel(TIPS)).toBe("TIPSMUSIC"); expect(codeText("RELIANCE")).toBe("RELIANCE"); expect(shortLabel({ symbol: "SKYGOLD", name: "Sky Gold And Diamonds Ltd" })).toBe("SKYGOLD");
  });
  it("chips: the short name, no 'Ltd', cut at 22 characters with '…'", () => {
    expect(shortName("Asm Technologies Ltd")).toBe("Asm Technologies"); expect(shortName("Foo Limited")).toBe("Foo"); expect(shortName("Bar Ltd.")).toBe("Bar");
    expect(shortLabel(ASM)).toBe("Asm Technologies");
    expect(shortLabel(NSEX)).toBe("National Stock Exchan…");                        // the README's own example
    expect(clip("abcdef", 4)).toBe("abc…"); expect(clip("abc", 4)).toBe("abc");
  });
  it("a company column sorts by the label that is shown", () => {
    expect([TIPS, ASM, { symbol: "AARTIIND", name: "Aarti Industries Ltd" }].sort((a, b) => sortLabel(a).localeCompare(sortLabel(b))).map((r) => r.symbol)).toEqual(["AARTIIND", "526433", "TIPSMUSIC"]);
  });
});

describe("<CoName>", () => {
  const html = (el: ReactElement) => { const { container } = render(<MemoryRouter>{el}</MemoryRouter>); const h = container.innerHTML; cleanup(); return h; };
  it("BSE with a name: <b title>name</b><small>BSE 526433 · what the line showed</small>, linked to /stocks/526433", () => {
    render(<MemoryRouter><CoName symbol="526433" name="Asm Technologies Ltd" sub="IT - Software" to /></MemoryRouter>);
    const b = screen.getByText("Asm Technologies Ltd");
    expect(b.tagName).toBe("B"); expect(b.getAttribute("title")).toBe("Asm Technologies Ltd · BSE 526433");
    expect(b.closest("a")!.getAttribute("href")).toBe("/stocks/526433");
    expect(screen.getByText("BSE 526433 · IT - Software").tagName).toBe("SMALL");
  });
  it("NSE: the same markup as before (no title added)", () => {
    expect(html(<CoName symbol="TIPSMUSIC" name="Tips Music Ltd" sub="Tips Music Ltd" />)).toBe("<b>TIPSMUSIC</b><small>Tips Music Ltd</small>");
  });
  it("short: one line, the short name, the full name and code in the title; the page's own tag and class kept", () => {
    expect(html(<CoName symbol="544937" name="National Stock Exchange Of India Ltd" short as="span" className="si-chip" after=" 98%" />))
      .toBe('<span class="si-chip" title="National Stock Exchange Of India Ltd · BSE 544937">National Stock Exchan… 98%</span>');
  });
  it("no name on file: the code stays, with the reason", () => {
    expect(html(<CoName symbol="530001" />)).toBe('<b title="BSE code. The company name is not in our data yet.">530001</b>');
  });
});

describe("the equity portfolio: Your shares (README check 1)", () => {
  const ready = (symbol: string, name: string, industry: string): Ready => ({ symbol, status: "ready", name, sector: industry, industry, isBank: false, basis: "consolidated", reportAt: "2026-10-30", price: 100, changePct: 1,
    priceAsOf: "2026-11-13", marketCapCr: 2000, ratios: {}, financials: {}, prism: { state: "rated", final: 60, label: "HEALTHY", status: "RATED", parts: { fundamental: 60, valuation: 40, quality: 75, risk: 55 },
      shortTerm: { score: 30, word: "Uptrend" }, longTerm: { score: 10, word: "Sideways" }, at: null, reason: null }, finlit: { overall: 60, band: "healthy", word: "Mixed", pillars: {}, pillarWords: {} } } as unknown as Ready);
  const LINES: Line[] = [{ symbol: "526433", name: "Asm Technologies Ltd", ov: ready("526433", "Asm Technologies Ltd", "IT - Software") }, { symbol: "TIPSMUSIC", name: "Tips Music Ltd", ov: ready("TIPSMUSIC", "Tips Music Ltd", "Media") }];
  const open = () => render(<MemoryRouter><SharesTable lines={LINES} meta={{}} page={{ order: ["526433", "TIPSMUSIC"], corr: [[1, 0], [0, 1]], avg_with_rest: {}, groups: [], short_history: [] } as never} mode="eq" colors={{}}
    model="prism" tab="overview" period="year" limit={30} state="ready" onTab={() => {}} onPeriod={() => {}} actions={() => null} qtyOf={() => 1} onQty={() => {}} /></MemoryRouter>);
  it("526433 reads Asm Technologies Ltd over 'BSE 526433 · IT - Software' and opens /stocks/526433; TIPSMUSIC is as before", () => {
    open();
    const cells = [...document.querySelectorAll("tbody td.pfx-name")];
    const asm = cells.find((c) => c.textContent!.includes("Asm"))!, tips = cells.find((c) => c.textContent!.includes("TIPSMUSIC"))!;
    expect(asm.querySelector("a.pfx-co b")!.textContent).toBe("Asm Technologies Ltd");
    expect(asm.querySelector("a.pfx-co")!.getAttribute("href")).toBe("/stocks/526433");
    expect(asm.querySelector("small")!.textContent).toBe("BSE 526433 · IT - Software");
    expect(tips.querySelector("a.pfx-co b")!.textContent).toBe("TIPSMUSIC"); expect(tips.querySelector("a.pfx-co b")!.hasAttribute("title")).toBe(false);
    expect(tips.querySelector("small")!.textContent).toBe("Tips Music Ltd");
    expect(document.body.textContent).not.toMatch(/^526433|>526433</);
  });
});

describe("guard: a new list cannot print a bare BSE code as a company's label", () => {
  // Every <b>{x.symbol}</b> in the pages must go through companyLabel (titleOf, shortLabel, codeText) or <CoName>. These are the places that may still print a bare symbol, and why.
  const ALLOW: Record<string, string> = {
    "components/AskFunds.tsx": "the ETF in context: ETF symbols are NSE tickers",
    "pages/OrderFlow.tsx": "Order Flow (Trading Lab): every stock there is an NSE F&O stock, named by its NSE ticker from the exchange's futures list (never a BSE code)",
    "components/lab/FlowTips.tsx": "Order Flow hover cards: every stock there is an NSE F&O stock, read from the exchange's futures list by its NSE ticker (never a BSE code)",
    "etf/Compare.tsx": "ETF symbols are NSE tickers",
    "etf/pack/EtfInside.tsx": "the ETF bars: ETF symbols are NSE tickers",
    "myinvest/KindTabs.tsx": "the ETFs tab (links to /etfs/): ETF symbols are NSE tickers; its stock rows use the rule",
  };
  const SRC = resolve(process.cwd(), "src");
  const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) ? [p] : []; });
  it("no <b>{x.symbol}</b> outside the allow list", () => {
    const bad = files(SRC).flatMap((p) => { const rel = p.slice(SRC.length + 1); const n = (readFileSync(p, "utf8").match(/<(b|strong)[^>]*>\{[a-zA-Z_.?!]*\.(symbol|sym)\}<\/(b|strong)>/g) ?? []).length; return n && !ALLOW[rel] ? [`${rel} (${n})`] : []; });
    expect(bad).toEqual([]);
  });
  it("the superinvestor chips go through the rule (README check 2)", () => {
    const s = readFileSync(join(SRC, "pages/Superinvestors.tsx"), "utf8");
    expect(s).toMatch(/className="si-chip" title=\{coTitle\(h\) \?\? h\.name\}>\{shortLabel\(h\)\}/);
  });
});
