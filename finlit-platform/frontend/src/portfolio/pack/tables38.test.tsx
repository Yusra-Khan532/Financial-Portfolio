// @vitest-environment jsdom
// Task #388 (reopened, developer file 38 v4): the tables of the equity portfolio. A3 / A3a: the technical view as two sortable columns, each a chip and
// its word from the company report header's own functions. T1–T11 through the shared roots F1–F6: the frame's inset on the table (F1), the pin rule with a
// <th> corner and a lower edge (F2), the group tokens on every grouped table and the corner's colour (F3), the group lines (F4), the bars (F5) and the
// 48px heading row (F6). Each test would have caught the fault it names. Sample data only (made up).
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../components/CoLogo", () => ({ CoLogo: () => null }));
vi.mock("../../lib/auth", async (orig) => ({ ...(await orig<typeof import("../../lib/auth")>()), useAuth: () => ({ user: { id: "u-sample" }, plan: "gold", limits: null, seesAll: false }) }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import type { Holding } from "../../lib/portfolio";
import type { Line, Ready } from "../../lib/portfolioOverview";
import type { LotsProps } from "../HoldingCells";
import type { Share } from "../../lib/equityPack";
import { SharesTable, techView } from "../SharesTable";
import { TechRows } from "../../stock/Hero";

afterEach(cleanup);
const SRC = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(SRC, f), "utf8");
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

const H: Holding[] = [{ id: "1", symbol: "AAA", pf: "main", date: "2025-01-02", qty: 30, price: 100, owned: true }, { id: "2", symbol: "BBB", pf: "main", date: "2025-01-05", qty: 10, price: 500, owned: true },
  { id: "3", symbol: "CCC", pf: "main", date: "2025-03-05", qty: 5, price: 900, owned: true }, { id: "4", symbol: "DDD", pf: "main", date: "2025-03-05", qty: 5, price: 90, owned: true }];
const PX: Record<string, number> = { AAA: 120, BBB: 450, CCC: 1000, DDD: 80 };
const fig = (v: number) => ({ value: v });
type T = { score: number | null; word: string | null };
const ready = (symbol: string, st: T, lt: T): Ready => ({ symbol, status: "ready", name: symbol + " Ltd", sector: "Banks", industry: "Banks", isBank: false, basis: "consolidated",
  reportAt: null, price: PX[symbol], changePct: 1.2, priceAsOf: "2026-11-23", marketCapCr: 90000, ratios: { pe: fig(1), pb: fig(1), roe: fig(1), dividend_yield: fig(1), debt_to_equity: fig(1) },
  financials: { year: { available: true, period: "FY26", periodEnd: "2026-03-31" }, quarter: { available: true, period: "Q2", periodEnd: "2026-09-30" } },
  prism: { state: "rated", final: 70, label: "HEALTHY", status: "RATED", parts: { fundamental: 70, valuation: 30, quality: 60, risk: 40 }, shortTerm: st, longTerm: lt, at: null, reason: null } } as unknown as Ready);
// the server's words ride along (as on the live answer); a score on a band edge, a 0, a missing score
const LINES: Line[] = [
  { symbol: "AAA", name: "AAA Ltd", ov: ready("AAA", { score: 57, word: "Strong uptrend" }, { score: -22, word: "Downtrend" }) },
  { symbol: "BBB", name: "BBB Ltd", ov: ready("BBB", { score: 0, word: "Sideways" }, { score: 59, word: "Strong uptrend" }) },
  { symbol: "CCC", name: "CCC Ltd", ov: ready("CCC", { score: -50, word: "Strong downtrend" }, { score: 20, word: "Uptrend" }) },
  { symbol: "DDD", name: "DDD Ltd", ov: ready("DDD", { score: null, word: null }, { score: 19.96, word: null }) },
];
const lots = (): LotsProps => ({ holdings: H, cur: "all", pfName: () => "Main account", nPortfolios: 1, priceOf: (s) => PX[s], changeOf: () => 1,
  add: vi.fn(), edit: vi.fn(), remove: vi.fn(), goTo: "main", open: new Set(), onOpen: vi.fn(), focus: null });
const share = (s: string): Share => ({ symbol: s, name: s, industry: "Banks", size: "Large", chg: 0, prism: 70, prismWord: "Healthy", valuation: 60, risk: 60, st: 30, lt: 30, below52: 7.6, m1: 0, peer: null, notCompared: "too few peers" } as Share);
const table = () => wrap(<SharesTable lots={lots()} editSell={{ onEdit: () => {}, onSell: () => {} }} lines={LINES} meta={{}} page={null} mode="eq" colors={{}} model="prism" tab="overview" period="year" limit={500}
  state="ready" onTab={() => {}} onPeriod={() => {}} actions={() => null} qtyOf={() => null} onQty={() => {}} peerOf={share} day="Monday" />);
const order = () => [...document.querySelectorAll("#pf-panel tbody tr[data-sym]")].map((r) => r.getAttribute("data-sym"));
const heads = () => [...document.querySelectorAll("#pf-panel thead tr:last-child th")];
const cellsOf = (sym: string) => [...document.querySelectorAll(`tr[data-sym="${sym}"] td.eq-tvx`)].map((c) => c.textContent);

describe("A3 / A3a: the technical view as two columns, read like the Prism column", () => {
  it("two headings, Short term and Long term, in place of one Trend column; no Short / Long pills", () => {
    table();
    const labels = heads().map((t) => t.textContent);
    expect(labels).toContain("Short term"); expect(labels).toContain("Long term");
    expect(labels.some((l) => /^Trend/.test(l ?? ""))).toBe(false);
    expect(document.querySelector(".eq-tvs, .eq-tvh, [aria-label='Sort by one trend']")).toBeNull();
    expect(document.querySelector(".eq-gtv")!.getAttribute("colspan")).toBe("2");
  });
  it("each cell is a chip and its word: sign always shown, U+2212 for minus, the report's bands (50 / 20 / −20 / −50)", () => {
    table();
    expect(cellsOf("AAA")).toEqual(["+57Strong uptrend", "−22Downtrend"]);
    expect(cellsOf("BBB")).toEqual(["0Sideways", "+59Strong uptrend"]);
    expect(cellsOf("CCC")).toEqual(["−50Strong downtrend", "+20Uptrend"]);
    expect(cellsOf("DDD")[0]).toMatch(/^−\s*not calculated/);                    // no score: a dash that says why
    expect(cellsOf("DDD")[1]).toBe("+19.96Sideways");                           // never "+20" for a score that is Sideways (the report's own rounding)
    const chip = document.querySelector('tr[data-sym="AAA"] td.eq-tvx .pfx-sc.big') as HTMLElement;
    expect(chip.style.color).toBe("var(--band-hi-ink)");
    expect(document.querySelector('tr[data-sym="AAA"] td.eq-tvx:nth-of-type(n) .eq-pw.hi')).toBeTruthy();
    expect((document.querySelectorAll('tr[data-sym="AAA"] td.eq-tvx')[1].querySelector(".pfx-sc") as HTMLElement).style.color).toBe("var(--band-lo-ink)");
    expect((document.querySelector('tr[data-sym="BBB"] td.eq-tvx .pfx-sc') as HTMLElement).style.color).toBe("var(--band-mid-ink)");
  });
  it("A3a: the pair word and the distance from the 1-year high left this table", () => {
    table();
    const body = document.querySelector("#pf-panel tbody")!.textContent!;
    expect(body).not.toMatch(/1-year high|Rising|Falling|bouncing|dipping/);
    expect(document.querySelector("#pf-panel .eq-tv, #pf-panel .eq-ts, #pf-panel .eq-hi, #pf-panel .eq-tvr")).toBeNull();
  });
  it("each heading sorts by its score like the Prism heading, high to low first, then low to high", () => {
    table();
    const btn = (n: string) => heads().find((t) => t.textContent?.startsWith(n))!.querySelector("button")!;
    fireEvent.click(btn("Short term")); expect(order()).toEqual(["AAA", "BBB", "CCC", "DDD"]);
    expect(btn("Short term").closest("th")!.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(btn("Short term")); expect(order().slice(0, 3)).toEqual(["CCC", "BBB", "AAA"]);
    fireEvent.click(btn("Long term")); expect(order()).toEqual(["BBB", "CCC", "DDD", "AAA"]);
  });
  it("the words match the company report header for the same share (the same functions, so they never disagree)", () => {
    for (const [score, word] of [[57, "Strong uptrend"], [-22, "Downtrend"], [0, "Sideways"], [-50, "Strong downtrend"], [20, "Uptrend"], [19.96, null]] as const) {
      cleanup();
      render(<MemoryRouter><TechRows effPlan="gold" seesAll={false} prismIn={{ kind: "report", final: 70, word: "Healthy", status: "RATED", short: { score, rating: word }, long: null }} /></MemoryRouter>);
      const row = document.querySelector(".hxt")!;
      const v = techView({ score, word })!;
      expect(row.querySelector("b")!.textContent).toBe(v.score);
      expect(row.querySelector(".hxt-w")!.textContent).toContain(v.word);
    }
  });
});

describe("T3 / T4 (F4): every column group has its line from the group heading to the last row", () => {
  it("Latest price and Today carry the WHAT IT IS WORTH NOW classes in the body, like Value now (T3)", () => {
    table();
    const row = document.querySelector('tr[data-sym="AAA"]')!, hr = document.querySelector("#pf-panel thead tr:last-child")!;
    const at = (label: string) => [...hr.children].findIndex((c) => c.textContent?.startsWith(label));
    const price = row.children[at("Latest price")], today = row.children[at("Today")];
    expect(price.className.split(" ")).toEqual(expect.arrayContaining(["x-c2", "x-gs", "cg-h"]));
    expect(today.className.split(" ")).toEqual(expect.arrayContaining(["x-c2", "cg-h"]));
    expect(price.textContent).toBe("₹120.00");
  });
  it("the FinLit Prism group heading carries the same 3px line as its columns (T4)", () => {
    table();
    expect(document.querySelector("th.eq-gpr")!.classList.contains("eq-divp")).toBe(true);
    expect(document.querySelector('tr[data-sym="AAA"] td.eq-divp')).toBeTruthy();
    expect(src("portfolio/add-shares.css")).toMatch(/\.pfx-table \.eq-divp \{ border-left: 3px solid/);
  });
});

describe("F1 (T1, T11): the frame's inset sits on the table, so nothing shows left of a frozen column", () => {
  const css = src("styles/finlit.css");
  it("the base frame has no side padding (a sticky first column stops at the padding); the table carries the inset", () => {
    expect(css).toMatch(/\n\.tw \{ overflow-x: auto; --tw-pad: 24px; margin: 0 calc\(-1 \* var\(--tw-pad\)\); padding: 0; \}/);
    expect(css).toMatch(/\.tw > table \{ margin-left: var\(--tw-pad\); margin-right: var\(--tw-pad\); max-width: calc\(100% - 2 \* var\(--tw-pad\)\); \}/);
    expect(css).toMatch(/@media \(max-width: 760px\)[^]*\.tw \{ --tw-pad: 16px; \}/);
    expect(css).not.toMatch(/\.tw \{[^}]*padding: 0 (24|16)px/);
  });
  it("every frame that sets no inset today keeps none: each rule that zeroes a frame's padding is in the zero list", () => {
    const zero = css.slice(css.lastIndexOf("Task #388 (F1): the frames that set no inset"));
    for (const sel of [".scr-tw", ".etf-tw", ".qr-scroll", ".sx-scroll", ".mf", ".sx-tablebox", ".etf-datatable", ".cz-body .cz-host", "table.eqr-sb", "table.eqr-rs", "table.eqr-each"]) expect(zero).toContain(sel);
    expect(zero).toMatch(/\{ --tw-pad: 0px; \}/);
    // the scan that found them: any CSS rule on a frame class that sets its padding to 0 must be listed (a new one would show here)
    const files: string[] = []; const walk = (d: string) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else if (f.endsWith(".css")) files.push(f); } }; walk(SRC);
    const frames = ["tw", "scr-tw", "etf-tw", "qr-scroll", "sx-scroll", "eqs-frz"];
    const missing: string[] = [];
    for (const f of files) { const s = readFileSync(f, "utf8").replace(/\/\*[^]*?\*\//g, ""); for (const m of s.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/padding(-left|-right)?\s*:\s*0(px)?\s*[;}]?/.test(m[2]) || /--tw-pad/.test(m[2])) continue;
      for (const sel of m[1].split(",").map((x) => x.trim())) { const last = sel.split(/[\s>+~]+(?![^(]*\))/).pop() ?? ""; if (!frames.some((c) => new RegExp("\\." + c + "(?![\\w-])").test(last))) continue;
        if (!/(scr-tw|etf-tw|qr-scroll|sx-scroll|\.mf|sx-tablebox|etf-datatable|cz-host|eqr-sb|eqr-rs|eqr-each)/.test(sel)) missing.push(f.replace(SRC, "") + " " + sel); } } }
    expect(missing).toEqual([]);
  });
  it("Enlarge: the shares frame bleeds by the card's own padding (20px), so the frozen Share column is not cut at the screen's edge (T11)", () => {
    const eq = src("portfolio/pack/eq385.css");
    expect(eq).toMatch(/\.eq #pf-shares\.eqs-full \{[^}]*--card-pad: 20px; padding: 0 var\(--card-pad\) 40px; \}/);
    expect(eq).toMatch(/\.eq #pf-shares \.tw \{ --tw-pad: var\(--card-pad, 24px\); \}/);
    expect(src("portfolio/pf.css")).toMatch(/\.pfx-card \{[^}]*--card-pad: 24px; padding: var\(--card-pad\);/);
    expect(src("portfolio/pf.css")).toMatch(/\.pfx-card \{ --card-pad: 16px; padding: var\(--card-pad\);/);
  });
});

describe("F2 (T2, T9): the pinned heading is always on top, corner included, with a clear lower edge", () => {
  it("the Diversification grids start their heading row with a <th> corner, never a <td> (T2)", () => {
    const div = src("portfolio/pack/DivPack.tsx");
    expect(div).not.toMatch(/<thead><tr><td/);
    expect(div.match(/<thead><tr><th scope="col" className="eqd-corner"><span className="sr-only">/g)).toHaveLength(3);
  });
  it("the pin rule moves a <td> heading cell too, keeps it solid, and draws a line and a shadow under the pinned heading (T9)", () => {
    const sh = src("portfolio/shared/shared.css");
    expect(sh).toMatch(/\.eqs-frz thead\.is-pinned > tr > :is\(th, td\) \{ transform: translateY\(var\(--pin, 0px\)\);/);
    expect(sh).toMatch(/\.eqs-frz thead\.is-pinned > tr > td \{ background-color: var\(--s1\); \}/);
    expect(sh).toMatch(/\.eqs-frz thead\.is-pinned tr:last-child > :is\(th, td\) \{ box-shadow: 0 1px 0 var\(--border-strong\), 0 8px 12px/);
    expect(src("portfolio/add-shares.css")).toMatch(/#pf-shares \.pfx-table thead\.is-pinned tr:last-child th \{ box-shadow: 0 1px 0 var\(--border-strong\), 0 8px 12px/);
  });
});

describe("F3 (T5, ETF/MF see-through group cells): the group colours exist on every grouped table", () => {
  it("the tokens are set on table.x-grp itself, in light and both dark rules", () => {
    const k = src("portfolio/holdings-kit.css");
    expect(k).toMatch(/\.acc-bar, \.pfx-card, \.xm-row, \.x-sold, \.acc-dlg, \.x-miss, table\.x-grp \{[^}]*--xg1: #a16207; --xg2: #2f5a9e; --xg3: #0e6471; \}/);
    expect(k).toMatch(/:root\[data-theme="dark"\] :is\([^)]*table\.x-grp\) \{[^}]*--xg1: #e0a63b;/);
    expect(k).toMatch(/:root:not\(\[data-theme="light"\]\) :is\([^)]*table\.x-grp\) \{[^}]*--xg1: #e0a63b;/);
    expect(k).toMatch(/\.x-g1, \.x-c1 \{ --gc: var\(--xg1\); \}/);
  });
  it("the empty group cell over Share and Industry is the heading's solid colour (T5)", () => {
    expect(src("portfolio/pack/eq385.css")).toMatch(/\.eq #pf-shares \.x-grp thead tr:first-child > th:first-child \{ background: linear-gradient\(var\(--s1\), var\(--s1\)\), var\(--bg\); \}/);
  });
});

describe("F5 (T6, T7, T10): no rows between or beside the bars", () => {
  it("the section bar is solid (it was 94% opaque) and the strip under the site header is a real cover", () => {
    const top = src("portfolio/pack/pagetop.css");
    expect(top).not.toMatch(/\.eqt-bar \{[^}]*94%/);
    expect(top).toMatch(/\.eqt-bar \{[^}]*background: linear-gradient\(var\(--sp-panel, var\(--s1\)\), var\(--sp-panel, var\(--s1\)\)\), var\(--bg\);/);
    expect(top).not.toMatch(/x-hstrip[^{]*\{[^}]*pointer-events: none/);
  });
  it("the 6px under the section bar is the stuck row's own page-coloured border (T7); its ends bleed by the card's padding (T10)", () => {
    expect(src("portfolio/pack/round388.css")).toMatch(/\.eq #pf-shares:not\(\.eqs-full\) \.pfx-tools\.pfh\.stuck \{ top: calc\(var\(--eq-bar-b, var\(--top-h, 63px\)\) - 6px\); margin-top: 10px; border-top: 6px solid var\(--bg\);/);
    expect(src("portfolio/add-shares.css")).toMatch(/\.pfx-tools\.pfh\.stuck \{[^}]*margin-left: calc\(-1 \* var\(--card-pad, 18px\)\); margin-right: calc\(-1 \* var\(--card-pad, 18px\)\); padding: 6px var\(--card-pad, 18px\);/);
  });
  it("Enlarge: no padding above the sticky tools row (T6)", () => {
    expect(src("portfolio/pack/eq385.css")).toMatch(/\.eq #pf-shares\.eqs-full > :first-child \{ margin-top: 16px; \}/);
  });
});

describe("F6 (T8): the column-heading row is 48px, two lines at most", () => {
  it("short sub-lines and an i never take a line of their own", () => {
    const eq = src("portfolio/pack/eq385.css");
    expect(eq).toMatch(/\.eq #pf-shares \.x-grp \.eqs-hsub \{ white-space: nowrap; \}/);
    expect(eq).toMatch(/\.eq #pf-shares \.x-grp thead tr:last-child th:has\(> \.sp-i\) \{ white-space: nowrap; \}/);
    expect(eq).toMatch(/\.eq #pf-shares \.x-grp thead tr:last-child th > \.sp-i \{ display: inline-grid;/);
  });
});
