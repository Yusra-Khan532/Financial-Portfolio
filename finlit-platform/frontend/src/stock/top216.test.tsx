// @vitest-environment jsdom
// Task #216 round 3 (company report handover, README 2.1, 2.2, 2.4): header option D, the Prism card's layout B and technical scale, the key-figure tiles.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const cls = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("../lib/taxonomy", async (orig) => ({ ...(await orig<typeof import("../lib/taxonomy")>()), useClassification: () => ({ data: cls.data }) }));
import { ClassPath, RatingCell } from "./Hero";
import type { Summary } from "../lib/api";

afterEach(cleanup);
const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
const code = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");   // without comments
const css = (f: string) => readFileSync(join(__dirname, "../styles", f), "utf8");
const S = { profile: { symbol: "RELIANCE" }, score: { overall: 71.4, band: { label: "Healthy" } } } as unknown as Summary;

describe("2.1 header option D", () => {
  it("four rows in order: identity (logo, name, dots, price, buttons) · strip (Rating, Against peers, Market cap, Listed as) · classification · trading details; no Download", () => {
    const h = src("Hero.tsx");
    const order = ['className="hxd-top"', 'className="hxd-strip"', "<ClassPath", '<details className="hxd-more xdd">'].map((x) => h.indexOf(x));
    expect(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1]))).toBe(true);
    const strip = h.slice(h.indexOf('className="hxd-strip"'), h.indexOf("<ClassPath"));
    expect([...strip.matchAll(/<span className="hx-k">([^<]+)<\/span>/g)].map((m) => m[1])).toEqual(["Fundamental rating", "Against peers", "Market cap", "Listed as"])   // task #280;
    expect(code("Hero.tsx")).not.toMatch(/Download/);
    expect(h).toMatch(/Trading details · \{asOf/);
    for (const b of ["Set alert", '{watch ? "Watching" : "Watchlist"}', "Value (DCF)", "Share"]) expect(h.slice(h.indexOf('className="hx-acts icons"'), h.indexOf('className="hxd-strip"'))).toContain(b);
  });
  it("the four actions are shared secondary small buttons in one row, labels shown at every width (task #310 F)", () => {
    const r = css("report216.css");
    const h = code("Hero.tsx");
    expect(h.match(/className="ui-btn ui-btn--secondary ui-btn--sm"/g)?.length).toBe(4);
    expect(h).toMatch(/className="ui-btn ui-btn--secondary ui-btn--sm" aria-pressed=\{watch\}/);
    expect(r).toMatch(/\.hx-d \.hx-acts \.actions \{ flex-wrap: nowrap;/);
    expect(r).not.toMatch(/\.hx-acts[^{]*span \{ display: none/);
  });
  it("the four classification levels come from the API, Sector included; the basic industry is filled", () => {
    cls.data = { symbol: "RELIANCE", isin: null, macro_sector: "Energy", sector: "Oil, Gas & Consumable Fuels", industry: "Petroleum Products", basic_industry: "Refineries & Marketing", source: "basic_industry", note: null };
    const { container } = render(<ClassPath symbol="RELIANCE" />);
    expect([...container.querySelectorAll(".hc-s")].map((x) => x.textContent)).toEqual(["Macro sectorEnergy", "SectorOil, Gas & Consumable Fuels", "IndustryPetroleum Products", "Basic industryRefineries & Marketing"]);
    expect(container.querySelector(".hc-s.s4")!.textContent).toContain("Refineries & Marketing");
    expect(container.querySelectorAll(".hc-a")).toHaveLength(3);
  });
  it("a blank level says why; a company not placed yet shows its industry", () => {
    cls.data = { symbol: "X", isin: null, macro_sector: "Energy", sector: "Oil, Gas & Consumable Fuels", industry: "Petroleum Products", basic_industry: null, source: "industry", note: "Basic industry not shown: NSE has not published one for this company." };
    const { container, unmount } = render(<ClassPath symbol="X" />);
    expect(container.querySelector(".hc-s.s4")!.textContent).toBe("Basic industryNot shown");
    expect(container.querySelector(".hc-why")!.textContent).toMatch(/^Basic industry not shown/);
    unmount();
    cls.data = null;
    expect(render(<ClassPath symbol="X" fallback="Refineries" />).container.textContent).toBe("IndustryRefineries");
  });
  it("Rating: Gold sees FinLit Prism (58.5 /100 Average); every other plan the locked Prism chip (task #283); Gold while loading never says Silver", () => {
    const prism = { kind: "report", final: 58.5, word: "Average", status: "RATED", parts: {} } as never;
    const gold = render(<MemoryRouter><RatingCell s={S} effPlan="gold" seesAll={false} prismIn={prism} /></MemoryRouter>).container.textContent;
    expect(gold).toBe("58.5/100AverageFinLit Prism");
    cleanup();
    expect(render(<MemoryRouter><RatingCell s={S} effPlan="silver" seesAll={false} prismIn={{ kind: "loading" }} /></MemoryRouter>).container.textContent).toBe("FinLit Prism · see plans");
    cleanup();
    expect(render(<MemoryRouter><RatingCell s={S} effPlan="basic" seesAll={false} prismIn={{ kind: "loading" }} /></MemoryRouter>).container.textContent).toBe("FinLit Prism · see plans");
    cleanup();
    expect(render(<MemoryRouter><RatingCell s={S} effPlan="gold" seesAll={false} prismIn={{ kind: "loading" }} /></MemoryRouter>).container.textContent).toBe("Reading the rating…");
  });
});

describe("2.2 Prism card", () => {
  it("layout B from 1,000 px: financial health wide on the left, the technical rail on the right; below that the two stack", () => {
    const r = css("report216.css");
    expect(r).toMatch(/@media \(min-width: 1000px\) \{\s*\.dk-pair \.pcx-body \{ display: grid; grid-template-columns: minmax\(0, 1\.65fr\) minmax\(300px, 1fr\);/);
    expect(css("prism-card.css")).toMatch(/\.pcx-body \{ display: flex; flex-direction: column;/);   // the stacked layout below 1,000 px
  });
  it("the technical scale fills from 0 to the reading (green above 0, red below) with a 0 mark; the signals chip is green when complete, amber when not", () => {
    const v = src("PrismCardView.tsx");
    expect(v).toMatch(/<b className=\{"pcx-tfill " \+ \(\(h\.score \?\? 0\) >= 0 \? "up" : "down"\)\}/);
    expect(v).toContain('<s className="pcx-zero" style={{ left: `${scalePos(0)}%` }} />');
    expect(v).toContain('className={"pcx-sg" + (h.availableCount < h.requiredCount ? " warn" : " all")}');
    const c = css("prism-card.css");
    expect(c).toMatch(/\.pcx-sc \.pcx-tfill\.up \{ background: var\(--gain\); \} \.pcx-sc \.pcx-tfill\.down \{ background: var\(--loss\); \}/);
    expect(c).toMatch(/\.pcx-sg\.all \{ color: var\(--gain\);/);
  });
  it("neither removed part is on the page: the 'What supports and weighs' drop-down with Recalculate, and 'Show full breakdown'", () => {
    const p = code("PrismCompare.tsx");
    expect(p).not.toMatch(/What supports and weighs on the rating|Show full breakdown|Pros and cons by part/);
  });
});

describe("2.4 key figures", () => {
  it("a label with a \"/\" may wrap after it (DEBT/ EQUITY); the i button inside each tile; notes wrap", () => {
    expect(src("Hero.tsx")).toContain('<span className="kl-t">{label.split("/").map((x, i) => <span key={i}>{i > 0 && <>/<wbr /></>}{x}</span>)}</span>');
    expect(css("report216.css")).toMatch(/\.kpis \.kpi \.kl > button\.info \{ position: absolute; top: 10px; right: 10px;/);
  });
});

describe("the company header never squeezes the name (owner, 25 Nov 2026: TCS stood one letter per line at a 1150px window)", () => {
  it("the top row follows the card's width: actions on their own row under 1320px of card, price too under 760px", () => {
    const r = readFileSync(join(__dirname, "../styles/report216.css"), "utf8");
    expect(r).toContain(".hx-d { container: hxd / inline-size; }");
    expect(r).toMatch(/@container hxd \(max-width: 1320px\) \{\s*\.hx-d \.hxd-top \{ grid-template-columns: auto minmax\(0, 1fr\) auto; \}\s*\.hx-d \.hxd-top \.hx-acts \{ grid-column: 1 \/ -1; \}/);
    expect(r).toMatch(/@container hxd \(max-width: 760px\) \{\s*\.hx-d \.hxd-top \{ grid-template-columns: auto minmax\(0, 1fr\); \}/);
  });
});
