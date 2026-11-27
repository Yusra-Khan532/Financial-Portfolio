// @vitest-environment jsdom
// Developer file 49, the founder's points of 27 Nov 2026 (2:30 pm): the sections' names in his words, the ratio key "spilling out" and brought to the top,
// bigger section headings.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HScroll } from "../components/HScroll";
import { scopeChain } from "../components/ChartZoom";
import { HEADING, NAV, sectionNo } from "../lib/sectionNav";
import { foldText } from "./StockPage";

afterEach(cleanup);
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };   // jsdom has none
const SRC = resolve(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("1 · the sections' names", () => {
  it("are the founder's list, 01 to 15 (04 to 07, 16 and 17 kept); 10 and 15 named for him", () => {
    const want: Record<string, string> = {
      business: "Company description", notes: "Strengths and weaknesses", price: "Price, technicals and returns", quarter: "Latest quarterly results",
      financials: "Profit & loss, balance sheet and cash flow", trends: "Sales, profit and cash over the years", segments: "Revenue by business segment",
      ratios: "Financial ratios and history", dupont: "DuPont analysis", earnings: "Earnings quality and cash conversion", dividends: "Dividends and history",
      ownership: "Shareholding pattern", peers: "Comparison with peers", sector: "Industry analysis", macro: "Macro impact on the sector",
      news: "Exchange filings and news", community: "Community discussions",
    };
    expect(HEADING).toEqual(want);
    expect(Object.keys(want).map((id) => sectionNo(id))).toEqual(Array.from({ length: 17 }, (_, i) => String(i + 1).padStart(2, "0")));
  });
  it("the section bar, the All sections panel and a phone's closed rows use a short form of the same name", () => {
    const bar = Object.fromEntries(NAV.map(([id, l]) => [id, l]));
    expect([bar.notes, bar.ownership, bar.macro, bar.dupont, bar.peers, bar.sector]).toEqual(["Strengths & weaknesses", "Shareholding", "Macro", "DuPont analysis", "Peers", "Industry"]);
    expect(foldText("ratios")).toEqual(["Ratios", "Financial ratios and history, the DuPont analysis, and earnings quality and cash conversion"]);
    expect(read("stock/MacroOutlook.tsx")).toContain('<section className="block mo" aria-label={HEADING.macro}>');   // a screen reader hears the same name
  });
});

describe("2 · the ratio key keeps inside its card, above the table", () => {
  it("a table's scroll box bleeds exactly the card's padding (it bled 24 px, then 16 on a phone, into 18 and 14 px)", () => {
    const l = read("styles/company-report-layout.css"), c47 = read("styles/report47.css");
    expect(c47).toContain("section.block .card { padding: 16px 18px; }");
    expect(c47).toMatch(/@media \(max-width: 760px\) \{ section\.block \.card \{ padding: 14px; \}/);
    expect(l).toContain("section.block .card { --card-px: 18px; }");
    expect(l).toContain("@media (max-width: 760px) { section.block .card { --card-px: 14px; } }");
    expect(l).toContain("section.block .card .tw { --tw-pad: var(--card-px); }");
  });
  it("HScroll draws a key above and a line under the scroll box, outside it (so they never scroll away with the columns)", () => {
    const { container } = render(<HScroll head={<p data-k>key</p>} foot={<p data-f>more</p>}><table><tbody><tr><td>x</td></tr></tbody></table></HScroll>);
    const tw = container.querySelector(".tw")!, k = container.querySelector("[data-k]")!, f = container.querySelector("[data-f]")!;
    expect(tw.contains(k) || tw.contains(f)).toBe(false);
    expect(k.compareDocumentPosition(tw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(f.compareDocumentPosition(tw) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const { container: c2 } = render(<HScroll><table /></HScroll>);   // every other table: unchanged
    expect(c2.querySelector(".cz-tbl")!.children.length).toBe(1);
  });
  it("08's key is the head, Show all the foot", () => {
    const s = read("stock/Sections3.tsx");
    expect(s).toContain('<HScroll className="" label="ratio history" head={<p className="faint tkey tkey-top">');   // the enlarged view is titled Ratio history
    expect(s).toMatch(/foot=\{\(hidden > 0[^\n]*<p className="rh-more">/);
    expect(s).not.toMatch(/<\/table>\{[^\n]*rh-more/);
  });
  it("a table's slider under the enlarge button's strip starts below the button", () => {
    expect(read("styles/company-report-layout.css")).toContain("section.block :is(.cz-strip, .cz-table:not(.cz-boxed)) .cz-tbl > .hs-bar:first-child { margin-top: 10px; }");
  });
  it("10's hover areas stay inside the chart", () => {
    expect(read("stock/RevenueCash.tsx")).toContain("x0 = Math.max(0, x(i) - w / 2), x1 = Math.min(W, x(i) + w / 2);");
  });
});

describe("2b · an enlarged chart or table keeps its report section's styles", () => {
  it("the view holds it inside empty copies of its ancestors up to the section: same tags and classes, no ids, drawn as nothing", () => {
    document.body.innerHTML = '<section class="block ow" id="own" aria-label="x"><div class="card ow-card"><div class="cz cz-table"><div class="cz-slot"></div></div></div></section><div class="cz"><div class="cz-slot" id="out"></div></div>';
    const c = scopeChain(document.querySelector<HTMLElement>("section .cz-slot"))!;
    const names: string[] = []; for (let e: Element | null = c.outer; e; e = e.firstElementChild) names.push(e.tagName.toLowerCase() + "." + e.className);
    expect(names).toEqual(["section.block ow", "div.card ow-card", "div.cz cz-table", "div.cz-slot"]);
    expect(c.inner.className).toBe("cz-slot");
    for (let e: Element | null = c.outer; e; e = e.firstElementChild) { expect(e.hasAttribute("data-cz-scope")).toBe(true); expect(e.id).toBe(""); expect(e.getAttribute("aria-label")).toBeNull(); }
    expect(scopeChain(document.getElementById("out"))).toBeNull();   // outside the company report: nothing copied, the view as before
    const css = read("styles/chartzoom.css");
    expect(css).toContain(".cz-body [data-cz-scope] { display: contents !important; }");
    expect(css).toContain(".cz-body [data-cz-scope]::before, .cz-body [data-cz-scope]::after { content: none !important; display: none !important; }");
    document.body.innerHTML = "";
  });
});

describe("3 · bigger section headings", () => {
  it("24 px (20 on a phone) with a 28 px number (24), set on the report's section head and not on :root", () => {
    const c = read("styles/report47.css");
    expect(c).toContain("section.block .sh { --ui-fs-h2: var(--fs-24); --fs-num: var(--fs-28); }");
    expect(c).toContain("@media (max-width: 760px) { section.block .sh { --ui-fs-h2: var(--fs-20); --fs-num: var(--fs-24); } }");
    expect(c).toContain(":root { --fs-num: var(--fs-24); --section-gap: 32px; }");
  });
});
