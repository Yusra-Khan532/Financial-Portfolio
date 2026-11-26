// @vitest-environment jsdom
// Task #388 reopened (developer file 38 v4, 25 Nov): A1 ("Where your gain or loss came from" leaves the Equity page; the Portfolio step still lands on Your
// shares), A2 (Key figures in all three views is the site's fold: closed on every visit, Show ▾ / Hide ▴, the i beside the title, opening lasts for the
// visit) and Part D (the page's spacing system: SP2, SP5, SP6, SP7, SP8). E1 (the shared bottom) is in eq385.test.tsx. Sample data only (made up).
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KeyFigures, VisitFolds, portfolioKeyFigs } from "../shared";
import type { Share } from "../../lib/equityPack";

afterEach(() => cleanup());
const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
const sh = (symbol: string, name: string, p: Partial<Share> = {}): Share => ({ symbol, name, industry: "Sample", size: "Large", chg: 0, prism: 60, prismWord: "Average", valuation: 60, risk: 60, st: 30, lt: 30, below52: 5, m1: 0,
  peer: { label: "in_line", raw: null, rank: 3, of: 9, group: "Sample", vs: 4.2, bench: "NIFTY Auto", direction: null }, notCompared: null, ...p });
const S = [sh("AAA", "Alpha Gears Ltd", { peer: { label: "laggard", raw: null, rank: 9, of: 9, group: "G", vs: -5, bench: "x", direction: null } }), sh("BBB", "Beta Motor Ltd"), sh("CCC", "Gamma Labs Ltd")];
const kf = (id = "eq-keys") => <KeyFigures id={id} sub="What your 3 shares add up to, from the table above and the sections below." cards={portfolioKeyFigs(S, true)} about="Key figures, Portfolio" />;
const fold = () => document.querySelector("details.eqkf") as HTMLDetailsElement;
const toggle = (d: HTMLDetailsElement, open: boolean) => act(() => { d.open = open; fireEvent(d, new Event("toggle")); });

describe("A2: Key figures is the site's fold, closed until clicked", () => {
  it("details.sp-sec.sp-fold; the summary holds Key figures with its i beside it, its one line and Show ▾; closed on arrival", () => {
    render(<MemoryRouter>{kf()}</MemoryRouter>);
    const d = fold();
    expect(d.matches("details.sp-sec.sp-fold")).toBe(true);
    expect(d.open).toBe(false);
    const sum = d.querySelector("summary")!;
    const h = sum.querySelector("h2#eq-keys")!;
    expect(h.textContent).toBe("Key figuresi");                                            // the title, its i right beside it
    expect(h.querySelector("button.sp-i")!.getAttribute("aria-label")).toBe("About “Key figures, Portfolio”");
    expect(sum.querySelector("small")!.textContent).toBe("What your 3 shares add up to, from the table above and the sections below.");
    expect(sum.querySelector(".sp-show")!.textContent).toBe("Show ▾");
    expect(d.querySelector(".eqkf-grid")!.parentElement).toBe(d);                       // the cards are the fold's body
  });
  it("opened, the same place says Hide ▴; closed again, Show ▾", () => {
    render(<MemoryRouter>{kf()}</MemoryRouter>);
    toggle(fold(), true); expect(fold().querySelector("summary .sp-show")!.textContent).toBe("Hide ▴");
    toggle(fold(), false); expect(fold().querySelector("summary .sp-show")!.textContent).toBe("Show ▾");
  });
  it("a click on the i opens its tip, never the fold", () => {
    render(<MemoryRouter>{kf()}</MemoryRouter>);
    const i = fold().querySelector("summary button.sp-i") as HTMLButtonElement;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => { i.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);                                                // the summary's own toggle is cancelled
    expect(i.getAttribute("aria-expanded")).toBe("true");
  });
  it("opening lasts for the visit (the view or step drawn again keeps it open); a new visit starts closed", () => {
    function Page() { const [on, setOn] = useState(true); return <><button onClick={() => setOn(!on)}>switch</button>{on ? kf() : <p>another step</p>}</>; }
    const { unmount } = render(<MemoryRouter><VisitFolds><Page /></VisitFolds></MemoryRouter>);
    toggle(fold(), true);
    fireEvent.click(screen.getByText("switch")); expect(fold()).toBeNull();
    fireEvent.click(screen.getByText("switch")); expect(fold().open).toBe(true);           // back on the step: still open
    unmount();
    render(<MemoryRouter><VisitFolds><Page /></VisitFolds></MemoryRouter>);              // the next visit
    expect(fold().open).toBe(false);
  });
  it("each view's Key figures keeps its own state (eq-keys, eq-keysd, eq-keysr)", () => {
    render(<MemoryRouter><VisitFolds>{kf("eq-keys")}{kf("eq-keysd")}</VisitFolds></MemoryRouter>);
    const [a, b] = [...document.querySelectorAll("details.eqkf")] as HTMLDetailsElement[];
    toggle(a, true); expect(a.open).toBe(true); expect(b.open).toBe(false);
  });
  it("all three views use it, inside the page's visit memory", () => {
    const h = readFileSync(join(__dirname, "../../pages/Holdings.tsx"), "utf8");
    expect(h).toMatch(/<KeyFigures id="eq-keys" /); expect(h).toMatch(/<KeyFigures id="eq-keysd" /);
    expect(src("./RiskPack.tsx")).toMatch(/<KeyFigures id="eq-keysr" /);
    expect(h).toMatch(/<VisitFolds><div className="wrap ipo pfx sp eq">/);
    expect(readFileSync(join(__dirname, "../shared/KeyFigures.tsx"), "utf8")).not.toMatch(/<section className="sp-sec eqkf"/);
  });
});

describe("A1: Where your gain or loss came from leaves the Equity page", () => {
  const h = readFileSync(join(__dirname, "../../pages/Holdings.tsx"), "utf8");
  it("no section, no eq-gl, and the Portfolio step still lands on Your shares", () => {
    expect(h).not.toMatch(/GainLossSection|eq-gl|glRows/);
    expect(h).toContain('{ id: "pf-shares", label: "Your shares", secs: ["pf-shares", "eq-keys", "pf-sold"] }');
    expect(h).toMatch(/<Step id="pf-shares" title="Your shares"/);
  });
  it("the MF and ETF pages dropped it too (file 40 v4 A1, file 39 v4 A1)", () => {
    expect(readFileSync(join(__dirname, "../../pages/MfPortfolio.tsx"), "utf8")).not.toMatch(/GainLossSection|mfp-gl/);   // task #389 file 40 v4 A1: the MF page dropped it too
    expect(readFileSync(join(__dirname, "../../pages/EtfPortfolio.tsx"), "utf8")).not.toMatch(/GainLossSection|etp-gl/);   // task #390 file 39 v4 A1
    expect(src("./EqSteps385.tsx")).not.toMatch(/id = "eq-gl"/);
  });
});

describe("Part D: the Equity page's spacing (SP2, SP5, SP6, SP7, SP8)", () => {
  const css = src("./spacing388.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = css.split("}").map((r) => r.trim()).filter((r) => r && !r.startsWith("@media"));
  it("is loaded with the page's own styles", () => { expect(src("./EqTop385.tsx")).toMatch(/import "\.\/eq385\.css";\s*import "\.\/spacing388\.css";/); });
  it("every rule is scoped to the Equity page", () => {
    for (const r of css.match(/[^{}]+(?=\{)/g)!.map((x) => x.trim()).filter((x) => !x.startsWith("@media"))) for (const sel of r.split(/,(?![^(]*\))/)) expect(sel.trim(), r).toMatch(/^(\.wrap\.eq|\.eq |#eq-panel)/);
    expect(rules.length).toBeGreaterThan(10);
  });
  it("D1–D3: 18 between boxes, 28 above the view cards (18 + the 10 px crown), every panel block 0 above and 18 below", () => {
    expect(css).toMatch(/\.wrap\.eq \{ --pf-gap: 18px; --pf-gap-x: 12px; --pf-crown: 10px; \}/);
    expect(css).toMatch(/\.eq \.pfx-flow \{ gap: var\(--pf-gap\); \}/);
    expect(css).toMatch(/\.eq \.eqc-strip \{ margin-top: var\(--pf-crown\); \}/);
    expect(css).toMatch(/\.eq \.eqc-since \{ margin-top: var\(--pf-gap\); \}/);
    expect(css).toMatch(/\.eq \.pfx-flow > \.eqt-bar \{ margin-bottom: 0; \}/);
    expect(css).toMatch(/#eq-panel > \* \{ margin-top: 0; margin-bottom: var\(--pf-gap\); \}/);
    expect(css).toMatch(/#eq-panel > :last-child \{ margin-bottom: 0; \}/);
  });
  it("D5, D9: one top line (3 px inset on a 1 px border), top-aligned score card, 20 px title rows; stacked cards 28 apart", () => {
    expect(css).toMatch(/\.eq \.eqc-v \{ border-top: 1px solid var\(--border\); box-shadow: inset 0 3px 0 var\(--vc\); \}/);
    expect(css).toMatch(/\.eq \.eqc-sc \{ align-items: flex-start; \}/);
    expect(css).toMatch(/\.eq \.eqc-k \{ min-height: 20px; \}/);
    expect(css).toMatch(/@media \(max-width: 1100px\) \{ \.eq \.eqc-strip \{ row-gap: calc\(var\(--pf-gap\) \+ var\(--pf-crown\)\); \} \}/);
  });
  it("D6: 18 px corners; D7: 12 px side by side; D8: 18 under the sub-tabs; D4: the bottom 18 under the last box", () => {
    expect(css).toMatch(/\.eq \.pfx-card:not\(\.eqs-full\), \.eq \.x-axbar, \.eq .eqx-nextb \{ border-radius: var\(--r-card\); \}/);
    expect(css).toMatch(/\.eq :is\(\.eqx-t2, \.eqkf-grid, \.eqr-tiles, \.eqr-cards, \.eqr-b3, \.eqr-f4, \.eq-lc, \.fx, \.spx, \.eqd-k3, \.eqd-two, \.eqv-rp, \.eqb-sum\) \{ gap: var\(--pf-gap-x\); \}/);
    expect(css).toMatch(/\.eq :is\(\.eqd-subbar, \.xtabs\) \{ margin-bottom: var\(--pf-gap\); \}/);
    expect(css).toMatch(/\.wrap\.eq > \.pgb \{ margin-top: var\(--pf-gap\); \}/);
  });
});
