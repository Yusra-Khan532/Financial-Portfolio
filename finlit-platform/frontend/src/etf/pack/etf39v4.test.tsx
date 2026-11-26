// @vitest-environment jsdom
// Task #390 reopened (developer file 39 v4, 25 Nov, ETF portfolio) on the MADE-UP seven-ETF list of etf390b.test.tsx (not a member's list): T2 / T2b lines
// between the column groups (Cost included) in every view of Your ETFs; T4 the strip cover under the header while the section bar slides back in (left by
// #389: the ETF 390 px strip); C3 the site's minus sign on every beta; C4 the basis line under the cards; Part D the page's spacing file; E1 the shared bottom.
// A1, A2 and C1 are tested on the page in pages/etf390.test.tsx; C2 (AMFI's newer NAV on a resumed run) in backend/tests/test_etf.py.
import LIST from "../../lib/__fixtures__/etfp390-made-list.json";
import INSIDE from "../../lib/__fixtures__/etfp390-made-inside.json";
import RISK from "../../lib/__fixtures__/etfp390-made-risk.json";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { EtfsTable, type EtfView } from "./EtfList";
import { EtfCards } from "./EtfTop";
import { barStuck, shiftY } from "../../portfolio/pack/PageTop";
import { costCard, etfKeyFigures, underneath, aboutN } from "../../lib/etfKeyFigs";
import { etfCards } from "../../lib/etfTop";
import type { EtfPortfolio, EtfRisk, Inside } from "../../lib/etfPortfolio";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
afterEach(() => { cleanup(); localStorage.clear(); });
const d = LIST as unknown as EtfPortfolio, ins = INSIDE as unknown as Inside, rk = RISK as unknown as EtfRisk;
const src = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");
const table = (view: EtfView) => render(<MemoryRouter><EtfsTable d={d} rk={rk} rows={d.items} view={view} sort={{ k: "name", dir: 1 }} setSort={() => {}} tools={null}
  actions={() => null} gone={() => null} /></MemoryRouter>);

/** check-tables.js "lines", in jsdom: for each group heading after the ETF columns, the column heading and the first body cell at that column carry mff-div. */
function groupLines() {
  const t = document.querySelector("#etp-zone table") as HTMLTableElement, groups = [...t.tHead!.rows[0].cells], heads = [...t.tHead!.rows[1].cells];
  const body = [...t.tBodies[0].rows[0].cells], at = (cells: HTMLTableCellElement[], col: number) => { let k = 0; for (const c of cells) { if (k === col) return c; k += c.colSpan; } return null; };
  const out: [string, boolean, boolean, boolean][] = []; let col = 0;
  for (const g of groups) { if (col > 1 && g.textContent!.trim()) out.push([g.textContent!.trim(), g.classList.contains("mff-div"), !!at(heads, col)?.classList.contains("mff-div"), !!at(body, col)?.classList.contains("mff-div")]); col += g.colSpan; }
  return out;
}

describe("T2 / T2b: a line on the left edge of every column group, in the heading and the body (check-tables.js \"lines\")", () => {
  it("Returns and cost: Price, Price returns and Cost each carry it (Cost had none, Price had none)", () => {
    table("returns");
    expect(groupLines()).toEqual([["Price", true, true, true], ["Price returns, total", true, true, true], ["Cost", true, true, true]]);
  });
  it("Trading: both groups carry it", () => {
    table("trading");
    expect(groupLines().map(([g, ...x]) => [g.replace(/^On .*/, "On the day"), ...x])).toEqual([["On the day", true, true, true], ["How well it follows", true, true, true]]);
  });
  it("Risk: the three groups carry it", () => {
    table("risk");
    expect(groupLines()).toEqual([["3 years", true, true, true], ["Against the Nifty 500, 1 year", true, true, true], ["Share", true, true, true]]);
  });
  it("only the first column of a group: no extra lines inside Price returns", () => {
    table("returns");
    const heads = [...document.querySelector("#etp-zone thead")!.querySelectorAll("tr:nth-child(2) th")].map((h) => h.classList.contains("mff-div"));
    expect(heads).toEqual([false, false, true, true, false, false, false, true]);
  });
});

describe("T4: the strip under the header stays covered while the section bar slides back in (left by #389: the ETF 390 px strip)", () => {
  it("shiftY reads the bar's own transform", () => {
    expect(shiftY("none")).toBe(0);
    expect(shiftY("matrix(1, 0, 0, 1, 0, -40)")).toBe(-40);
    expect(shiftY("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -25, 0, 1)")).toBe(-25);
  });
  it("a bar mid-slide at its sticky place counts as stuck (it read as not stuck, so the cover dropped and rows showed in the 8 px)", () => {
    const bar = document.createElement("nav"); bar.className = "ptk-bar"; document.body.appendChild(bar);
    Object.defineProperty(bar, "offsetHeight", { value: 52, configurable: true });
    bar.style.top = "115px"; bar.style.transform = "matrix(1, 0, 0, 1, 0, -40)";
    bar.getBoundingClientRect = () => ({ top: 75, bottom: 127, left: 0, right: 390, width: 390, height: 52, x: 0, y: 75, toJSON: () => ({}) });   // 115 − 40 mid-slide
    Object.defineProperty(window, "scrollY", { value: 2000, configurable: true });
    expect(barStuck(".ptk-bar")).toBe(true);
    bar.style.transform = "none";
    expect(barStuck(".ptk-bar")).toBe(false);                                       // at 75 px with no transform it really is not at its place
    bar.remove();
  });
});

describe("C3: every beta prints the site's minus sign, never a hyphen", () => {
  const hy = /(?<![\w-])-\d/;
  it("Risk analytics Key figures card 1 (HDFCGOLD −0.05, SILVERIETF −0.02 in this list)", () => {
    const beta = etfKeyFigures("risk", { d, ins, rk }).find((c) => c.id === "beta");
    expect(beta).toBeTruthy();
    const texts = (beta as unknown as { rows: { label: string; text: string }[] }).rows;
    expect(texts.find((r) => r.label === "HDFCGOLD")!.text).toBe("−0.05");
    expect(texts.find((r) => r.label === "SILVERIETF")!.text).toBe("−0.02");
    expect(JSON.stringify(beta)).not.toMatch(hy);
  });
  it("the Risk view of Your ETFs and the view cards", () => {
    table("risk");
    expect(document.body.textContent).toContain("−0.05");
    expect(document.body.textContent).not.toMatch(hy);
    expect(JSON.stringify(etfCards(d, underneath(ins, d), rk, { about: aboutN }))).not.toMatch(hy);
  });
});

describe("C4: the basis is said under the cards", () => {
  const cards = (weighted: boolean) => render(<EtfCards cost={costCard(d)!} asOf="6 Nov" cards={etfCards(d, underneath(ins, d), rk, { about: aboutN })}
    colors={{ etfs: "#2E6B6F", inside: "#C9A227", risk: "#2F5A9E" }} view="etfs" onView={() => {}} weighted={weighted} />);
  it("each ETF counting the same (basis \"equal\"): one line under the cost and the view cards", () => {
    cards(false);
    const p = document.querySelector(".px-strip > .etp-basis")!;
    expect(p.textContent).toBe("Each ETF counts the same until all have a quantity.");
    expect(p.previousElementSibling!.classList.contains("px-vw")).toBe(true);
  });
  it("weighted by value: no line (the figures follow the money)", () => {
    cards(true);
    expect(document.querySelector(".etp-basis")).toBeNull();
  });
  it("the page passes the list's own basis", () => {
    expect(src("pages/EtfPortfolio.tsx")).toMatch(/<EtfCards [^\n]*weighted=\{d\.basis === "value"\}/);
  });
});

describe("Part D: the ETF page's spacing (SHARED.md SP1, SP3, SP6, SP7, SP8)", () => {
  const css = src("etf/pack/spacing390.css");
  it("is imported by the page after the pack CSS, and every rule is scoped to the ETF page", () => {
    const page = src("pages/EtfPortfolio.tsx");
    expect(page.indexOf('import "../etf/pack/spacing390.css"')).toBeGreaterThan(page.indexOf('import "../portfolio/kit/kit.css"'));
    const sels = css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0].replace(/@media[^{]*\{?/, "").trim()).filter(Boolean);
    for (const s of sels) for (const one of s.split(/,(?![^(]*\))/)) expect(one.trim(), one).toMatch(/^\.wrap\.efp\b/);
  });
  it("D1: 18 px between boxes, 28 above the view cards; D4: 12 side by side; D5: 18 under the sub-tabs; D6: 28 between stacked cards", () => {
    expect(css).toMatch(/\.wrap\.efp \{ --pf-gap: 18px; --pf-gap-x: 12px; --pf-crown: 10px; \}/);
    expect(css).toMatch(/\.wrap\.efp \.px-strip \{ margin-top: calc\(var\(--pf-gap\) \+ var\(--pf-crown\)\); margin-bottom: var\(--pf-gap\); \}/);
    expect(css).toMatch(/\.wrap\.efp :is\([^)]*\.ptk-top2[^)]*\.eqr-tiles[^)]*\.mfm-cards[^)]*\) \{ gap: var\(--pf-gap-x\); \}|\.wrap\.efp :is\(\.ptk-top2, \.mfm-cards, \.eqr-tiles/);
    expect(css).toMatch(/\.wrap\.efp \.mfm-subtabs \{ margin-bottom: var\(--pf-gap\); \}/);
    expect(css).toMatch(/@media \(max-width: 1100px\) \{ \.wrap\.efp \.px-strip \{ row-gap: calc\(var\(--pf-gap\) \+ var\(--pf-crown\)\); \} \}/);
  });
  it("D3: the view cards are top-aligned with 16 px top padding on desktop; SP1: full width on a direct visit", () => {
    expect(css).toMatch(/@media \(min-width: 761px\) \{\n  \.wrap\.efp \.px-c\.px-vw \{ display: flex; flex-direction: column; justify-content: flex-start;[^}]*\}\n  \.wrap\.efp \.px-c \{ padding-top: 16px; \}/);
    expect(css).toMatch(/\.wrap\.efp, \.wrap\.efp \.gate, \.wrap\.efp \.gate > div \{ min-width: 0; max-width: 100%; \}/);
  });
});

describe("E1: the shared bottom, as on the Equity and MF pages", () => {
  it("the page uses PageBottom (Questions fold, Disclaimer fold, sources line) and no longer draws its own", () => {
    const page = src("pages/EtfPortfolio.tsx");
    expect(page).toMatch(/<PageBottom kind="etf" sources=\{SOURCES\} \/>\n    <\/div><\/VisitFolds><\/KnowPop\.Provider>/);
    expect(page).not.toMatch(/mfp-disc|<PageFaqs inline|<p className="mfp-foot">/);
  });
});
