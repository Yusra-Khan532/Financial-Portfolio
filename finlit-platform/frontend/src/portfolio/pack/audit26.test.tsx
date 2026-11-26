// @vitest-environment jsdom
// Audit of 26 Nov on the Equity (#388), MF (#389) and ETF (#390) portfolio pages, run against the live pages with made-up member data. Each test here
// would have caught one of the fails it found:
//   1. MF M4 / ETF T4: rows showed in the strip beside the stuck filter row (the frame bleeds by the card's padding, the row's cover did not) and at the
//      bar's rounded ends (the covers let a point test through).
//   2. Equity Risk, Each share's risk: a 100 px heading row (labels on 3 lines, each i on a line of its own).
//   3. Equity Your shares in By sector, By company size, Ratios and Financials: the Against peers line missing on the group rows, labels on 3 lines (61 to
//      64 px headings), and on a phone the open tools row (386 px) stuck over the pinned heading.
//   4. Inner gaps of 10 / 14 / 37 px where the rule is 12 side by side and 18 top to bottom.
//   5. MF and ETF bar labels cut mid-word on a phone ("5'", "Not loade").
//   6. MF and ETF "Since your last visit" corners 12 px among 18 px boxes.
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { splitTwo, twoLines } from "../twoLines";
import { fitSlices } from "../../mf/pack/FitStack";

afterEach(() => cleanup());
const src = (f: string) => readFileSync(join(__dirname, "../..", f), "utf8");

describe("1. MF and ETF: nothing shows beside the stuck filter row or at the bar's ends", () => {
  const css = src("portfolio/kit/kit.css");
  it("the card's padding is one value: the frame bleeds by it, the stuck row's cover reaches as far (24 px, 14 on a phone)", () => {
    expect(css).toMatch(/\.sp-sec:has\(\.ptk-frow\) \{ --card-pad: 24px; \}/);
    expect(css).toMatch(/\.sp-sec:has\(\.ptk-frow\) \.tw \{ --tw-pad: var\(--card-pad\); \}/);
    expect(css).toMatch(/\.ptk-frow\.stuck::before \{ left: calc\(-1 \* var\(--card-pad, 24px\)\); right: calc\(-1 \* var\(--card-pad, 24px\)\); \}/);
    expect(css).toMatch(/@media \(max-width: 760px\) \{ \.sp-sec:has\(\.ptk-frow\) \{ --card-pad: 14px; \} \}/);
  });
  it("the covers take the pointer (pointer-events: none let a point test, and a click, through to the rows behind)", () => {
    const last = css.lastIndexOf(".ptk-bar::before, .ptk-frow.stuck::before { pointer-events: auto; }");
    expect(last).toBeGreaterThan(css.lastIndexOf("pointer-events: none; }"));
  });
});

describe("2. Equity Risk, Each share's risk: the heading row at most two lines a label", () => {
  const css = src("portfolio/pack/risk385.css");
  it("each label sits beside its i (not over it), the sort arrow follows the last word, and no word is broken", () => {
    expect(css).toMatch(/\.eq table\.eqr-each thead tr:last-child th > \.eqs-sort \{ display: inline-block; max-width: calc\(100% - 22px\); vertical-align: bottom; overflow-wrap: normal; \}/);
    expect(css).toMatch(/\.eq table\.eqr-each thead tr:last-child th \.eqs-sort > i:empty \{ display: none; \}/);
    expect(css).toMatch(/\.eq table\.eqr-each thead tr:last-child th > \.sp-i \{ vertical-align: bottom;/);
  });
  it("the column widths add up to the whole table, with and without the Prism Risk column", () => {
    const w = (c: string) => Number(new RegExp(`\\.eq table\\.eqr-each col\\.${c} \\{ width: ([\\d.]+)%; \\}`).exec(css)![1]);
    const ten = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"].reduce((a, c) => a + w(c), 0);
    expect(Math.round((ten + w("c10") + w("c11")) * 10) / 10).toBe(100);
    expect(Math.round((ten + Number(/\.eq table\.eqr-each\.g10 col\.c10 \{ width: ([\d.]+)%; \}/.exec(css)![1])) * 10) / 10).toBe(100);
  });
  it("below 1,400 px the table keeps its widths and scrolls sideways (Share frozen) instead of squeezing the labels to 3 lines", () => {
    expect(css).toMatch(/\.eq table\.eqr-each \{ width: 100%; min-width: 1230px; table-layout: fixed; \}/);
    expect(css).toMatch(/@media \(min-width: 1400px\) \{\n  \.eq \.eqr-each-w, \.eq \.eqr-each-w \.tw \{ overflow-x: visible; \}\n  \.eq table\.eqr-each \{ min-width: 0; \}/);
  });
});

describe("3. Equity Your shares in every column set", () => {
  it("a label of three words or more is two set lines, broken where they are most even; the text reads the same", () => {
    expect(splitTwo("Avg buy price")).toEqual(["Avg buy", "price"]);
    expect(splitTwo("Debt to equity")).toEqual(["Debt to", "equity"]);
    expect(splitTwo("Net sales / revenue")).toEqual(["Net sales /", "revenue"]);
    expect(splitTwo("Operating profit")).toEqual(["Operating profit"]);   // two words never take three lines
    expect(splitTwo("Vs its peers")).toEqual(["Vs its peers"]);           // short: one line as before
    const { container } = render(<>{twoLines("Avg buy price")}</>);
    expect(container.querySelectorAll(".pfx-l2 br")).toHaveLength(1);
    expect(container.textContent).toBe("Avg buy price");
    expect(src("portfolio/pack/round388.css")).toMatch(/#pf-shares \.pfx-table thead \.pfx-l2 \{ white-space: nowrap; \}/);
  });
  it("only the one-line stuck tools row sticks; the open row (386 px on a phone in By sector) scrolls away, and the heading pins under the section bar then", () => {
    expect(src("portfolio/pack/round388.css")).toMatch(/\.eq #pf-shares:not\(\.eqs-full\) \.pfx-tools\.pfh:not\(\.stuck\) \{ position: relative; top: auto; \}/);
    expect(src("portfolio/pack/round388.css")).toMatch(/\.eq #pf-shares \.pfx-tools\.pfh\.stuck > \.pfx-chipsrow \{ flex: none; flex-wrap: nowrap; \}/);   // the chips on the one line too (165 px before)
    const t = src("portfolio/SharesTable.tsx");
    expect(t).toMatch(/pinBelow=\{p\.editSell \? \(full \? "#pf-shares \.pfx-tools\.pfh" : "#pf-shares \.pfx-tools\.pfh, \.eqt-bar"\) : undefined\}/);
    expect(t).toMatch(/cs\.position === "sticky" \? parseFloat\(cs\.top\) : num\("--eq-bar-b"\)/);
    expect(t).toMatch(/className="pfh-keep" aria-hidden="true" style=\{\{ height: keep \}\}/);   // no jump when the row sticks
  });
});

describe("4. Inner gaps: 12 side by side, 18 top to bottom", () => {
  it("Equity: the pair cards 12, the switch 18 above the score card, the beta build's tab bar 18 under the boxes (its caption inside it)", () => {
    const d = src("portfolio/pack/div385.css"), r = src("portfolio/pack/risk385.css");
    expect(d).toMatch(/\.eq \.eqd-pairs \{ margin-bottom: 12px; \}/);
    expect(d).toMatch(/\.eq \.eqv-sw, \.eq \.eqv-pc \{ margin-bottom: 18px; \}/);
    expect(r).toMatch(/\.pfx \.xtabs\.eqb-tabs3 > \.x2-k \{ grid-column: 1 \/ -1;/);
    expect(r).toMatch(/\.eq \.eqb-sum \{ margin-bottom: 18px; \}/);
    expect(r).toMatch(/\.pfx \.xtabs\.eqb-tabs3 > \[role="tab"\]:last-child \{ grid-column: 1 \/ -1; \}/);   // the caption no longer shifts nth-child
  });
  it("MF Mix: the six reading cards 12 apart; MF and ETF beta ranges 12 side by side, 18 top to bottom", () => {
    expect(src("mf/pack/mf-pack.css")).toMatch(/^\.mfm-reads \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); gap: 12px;/m);
    const m = src("mf/pack/mf-risk389.css");
    expect(m).toMatch(/\.mfp \.eqr-ranges\.mfr-ranges \{ gap: 18px 12px; margin-bottom: 18px; \}/);
    expect(m).toMatch(/\.mfp \.eqr-hint \{ margin-bottom: 18px; \}/);
  });
});

describe("5. MF and ETF bars: a label that does not fit drops its word, then its percent; never cut", () => {
  const slice = (scroll: number[], client: number, html: string) => { const i = document.createElement("i"); i.innerHTML = html; let k = 0;
    Object.defineProperty(i, "scrollWidth", { get: () => scroll[Math.min(k++, scroll.length - 1)] }); Object.defineProperty(i, "clientWidth", { get: () => client }); return i; };
  it("fits: no mark; too wide: word dropped; still too wide: all text dropped; empty slices untouched", () => {
    const bar = document.createElement("div");
    const fits = slice([40], 60, "<b>62%</b><small>Shares</small>"), word = slice([90, 50], 60, "<b>18%</b><small>Not loaded</small>"),
      none = slice([30, 30], 16, "<b>5%</b>"), text = slice([70], 30, '<span class="mfm-w">Shares </span>62%'), blank = slice([0], 10, "");
    bar.append(fits, word, none, text, blank);
    fitSlices(bar);
    expect(fits.getAttribute("data-fit")).toBeNull();
    expect(word.getAttribute("data-fit")).toBe("pct");
    expect(none.getAttribute("data-fit")).toBe("none");
    expect(text.getAttribute("data-fit")).toBe("none");
    expect(blank.getAttribute("data-fit")).toBeNull();
    const css = src("mf/pack/mf-pack.css");
    expect(css).toMatch(/\.mfm-stack > i\[data-fit="pct"\] :is\(small, \.mfm-w\), \.etp-bar > i\[data-fit="pct"\] :is\(small, \.mfm-w\) \{ display: none; \}/);
    expect(css).toMatch(/\.mfm-stack > i\[data-fit="none"\] > \*, \.etp-bar > i\[data-fit="none"\] > \* \{ display: none; \}/);
    expect(css).toMatch(/\.mfm-stack:not\(\.big\) > i \{ flex-direction: row; justify-content: flex-start; align-items: center;/);   // "Shares 98%" stays one line
  });
  it("the MF and ETF bars use it: the money bar, each fund's or ETF's bar, and the size bars", () => {
    const mf = src("mf/pack/MfMix.tsx"), etf = src("etf/pack/EtfInside.tsx");
    expect(mf.match(/<FitStack /g)).toHaveLength(3);
    expect(etf.match(/<FitStack /g)).toHaveLength(3);
    expect(mf).not.toMatch(/<span className="mfm-stack">\{/);
    expect(etf).not.toMatch(/<span className="mfm-stack">\{/);
  });
});

describe("6. MF and ETF: Since your last visit has the 18 px corners of a box on the page", () => {
  it("border-radius r-card (18), as on Equity", () => {
    expect(src("mf/pack/mf389.css")).toMatch(/\.mfp \.px-since \{[^}]*border-radius: var\(--r-card\);/);
  });
});

describe("6b. MF and ETF view cards open with Space as with Enter and a click", () => {
  // The audit's Space reading was the remembered place: a bare /mf-portfolio (/etf-portfolio) reopens the last view, so after Enter had opened Mix the
  // first card that was not current was Your funds, and Space opened it (the address stayed /mf-portfolio). Checked in a browser with a fresh visit for
  // each key: Space opens the card. The cards stay native buttons, with nothing that swallows the key.
  for (const f of ["mf/pack/MfTop.tsx", "etf/pack/EtfTop.tsx"]) it(f, () => {
    const card = /<button key=\{[^}]+\} type="button" className=\{"px-c px-vw"[^\n]*\n[^\n]*>/.exec(src(f))![0];
    expect(card).toMatch(/onClick=\{\(\) => onView\(/);
    expect(card).not.toMatch(/onKey(Down|Up|Press)/);
  });
});
