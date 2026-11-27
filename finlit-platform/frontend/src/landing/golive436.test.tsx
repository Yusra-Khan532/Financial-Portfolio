// @vitest-environment jsdom
// Task #436 (27-28 Nov 2026): the landing page update from the team's pack (01_landing-page-changes.md). Changes 1-10 came in with task #411 and are
// held by golive411.test.tsx; these tests hold the points this round adds or changes:
//   10. the strip line: "Track what matters" in the same colour as the other two phrases, no full stop;
//   11. prices hidden ("Coming soon"): one switch, FL_PRICES_LIVE = false; paid plans read "Coming soon" / "Yearly plan", Free keeps ₹0; the Combined
//       tag reads "Both plans in one"; the table note "Prices are coming soon. Start on Free today."; "Where to begin" shows "Price coming soon";
//       add-ons "Add-on · buy on its own" with no yearly price; "About these plans" names no ₹ figure. /plans keeps its prices;
//   12. the hero fills the first screen again from 761px wide (the rule replaces task #411's shorter hero);
//    9. the table's title: serif at 20px, the type-scale step nearest the pack's 22px (22px is off the site's one scale, docs/TYPE-SCALE.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { GoLiveMarkup } from "./GoLiveMarkup";
import { initGoLive, FL_PRICES_LIVE } from "./golive";

const src = (p: string) => readFileSync(join(__dirname, p), "utf8");
const TOUR = { src: "/landing/finlit-tour-dark-720p.mp4", poster: "/landing/golive/tour-dark-poster.jpg" };
const noop = { navigate: () => {}, searchIndex: async () => ({ rows: [] }), quote: async () => null };

const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
// media queries answer from the window's width, so the hero's (min-width) rules can be checked at each width
const mm = (q: string) => {
  const m = /min-width:\s*(\d+)px/.exec(q), x = /max-width:\s*(\d+)px/.exec(q);
  return (!m || window.innerWidth >= +m[1]) && (!x || window.innerWidth <= +x[1]);
};
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: mm(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () {};
  HTMLMediaElement.prototype.load = function () {};
  window.scrollTo = (() => {}) as typeof window.scrollTo;
});
afterEach(() => { cleanup(); setWidth(1024); });

function landing(width = 1440, extra: { pricesLive?: boolean } = {}) {
  setWidth(width);
  const { container } = render(<main><GoLiveMarkup tour={TOUR} /></main>);
  let stop = () => {};
  act(() => { stop = initGoLive({ ...noop, ...extra }); });
  return { container, stop: () => stop() };
}

describe("task #436 (10): the strip line above the hero", () => {
  it("three phrases in one colour (no green em) and no full stop", () => {
    const { container, stop } = landing();
    const strip = container.querySelector(".hh-strip")!;
    expect(strip.textContent).toBe("Quantify the market×Research deeper×Track what matters");
    expect(strip.querySelector("em")).toBeNull();
    expect([...strip.querySelectorAll("span")].map((s) => s.textContent)).toEqual(["Quantify the market", "Research deeper", "Track what matters"]);
    stop();
  });
});

describe("task #436 (11): prices hidden until payments open", () => {
  it("one switch, off: FL_PRICES_LIVE is false", () => {
    expect(FL_PRICES_LIVE).toBe(false);
    expect(src("golive.js")).toMatch(/var LIVE=opts\.pricesLive!=null\?!!opts\.pricesLive:FL_PRICES_LIVE;/);
  });
  it("laptop table: paid plans read Coming soon / Yearly plan, Free keeps ₹0, the Combined tag and the note change", () => {
    const { container, stop } = landing();
    const plans = [...container.querySelector(".lq-head")!.children].slice(1);
    expect(plans.map((p) => p.querySelector("b")!.textContent)).toEqual(["Free", "Gold", "Platinum", "Mutual Fund + ETF", "Equity Portfolio", "Combined"]);
    expect(plans[0].querySelector(".lq-pr")!.textContent).toBe("₹0");
    for (const p of plans.slice(1)) {
      const pr = p.querySelector(".lq-pr.lq-soon")!;
      expect(pr.querySelector(".lq-pm")!.textContent).toBe("Coming soon");
      expect(pr.querySelector(".lq-py")!.textContent).toBe("Yearly plan");
    }
    expect(plans[5].querySelector(".lq-sub em")!.textContent).toBe("Both plans in one");
    expect(container.querySelector(".lq-lead2 .lq-ls")!.textContent).toBe("Prices are coming soon. Start on Free today.");
    stop();
  });
  it("add-ons show no yearly price: 'Add-on · buy on its own'", () => {
    const { container, stop } = landing();
    act(() => { (container.querySelector("[data-cq=groups]") as HTMLElement).click(); });
    const ao = [...container.querySelectorAll(".lq-ao2")];
    expect(ao.length).toBeGreaterThan(0);
    for (const a of ao) { expect(a.textContent).toBe("Add-onbuy on its own"); expect(a.getAttribute("title")).not.toMatch(/₹|a year/); }
    stop();
  });
  it("'About these plans' names no ₹ figure and says prices will be announced", () => {
    const { container, stop } = landing();
    const n = container.querySelector(".lq-notes")!;
    expect(n.querySelector("summary small")!.textContent).toBe("One-area plans, do-it-yourself add-ons and when plans open");
    expect(n.textContent).not.toContain("₹");
    expect(n.textContent).toContain("The combined plan has both, plus");
    expect(n.textContent).toContain("Any plan can also add more room:");
    expect(n.textContent).toContain("Prices will be announced soon. Plans will be yearly. Payments are not live yet:");
    stop();
  });
  it("the whole plans section and Where to begin carry no ₹ except Free's ₹0", () => {
    const { container, stop } = landing();
    act(() => { (container.querySelector("[data-cq=groups]") as HTMLElement).click(); });
    const t = container.querySelector("#lp-cq")!.textContent!;
    expect(t.split("₹").length - 1).toBe(1);   // one ₹ only: Free's
    expect(container.querySelector(".lq-head .lq-pr.free")!.textContent).toBe("₹0");
    const go = [...container.querySelectorAll("[data-goplan] .lp-go-p em")].map((e) => e.textContent);
    expect(go.length).toBeGreaterThan(0);
    for (const e of go) expect(["Price coming soon", "Free"]).toContain(e);
    stop();
  });
  it("phone: the plan view reads Coming soon", () => {
    const { container, stop } = landing(390);
    act(() => { ([...container.querySelectorAll(".lp-pp-b")][5] as HTMLElement).click(); });
    const pv = container.querySelector(".lq-pv")!;
    expect(pv.querySelector(".lq-pr")!.textContent).toBe("Coming soonYearly plan");
    expect(pv.textContent).not.toContain("₹");
    stop();
  });
  it("turning the switch on brings the prices back with no other change", () => {
    const { container, stop } = landing(1440, { pricesLive: true });
    const head = container.querySelector(".lq-head")!.textContent!;
    for (const t of ["₹458", "₹833", "₹142", "₹275", "₹375", "₹501 less than both"]) expect(head).toContain(t);
    expect(container.querySelector(".lq-soon")).toBeNull();
    stop();
  });
  it("/plans keeps its prices (it passes pricesLive: true)", () => {
    expect(readFileSync(join(__dirname, "../pages/Plans.tsx"), "utf8")).toMatch(/combinedCard: true,[\s\S]{0,120}pricesLive: true,/);
  });
  it("the Coming soon block has its own styles, on the site's tokens", () => {
    const css = src("golive.css");
    expect(css).toMatch(/\.lq-head \.lq-pr\.lq-soon \.lq-pm strong \{\n  font: 600 18px\/1\.2 var\(--serif\);/);
    expect(css).toMatch(/\.lq-head \.lq-pr\.lq-soon \.lq-py \{\n  font-size: var\(--fs-12\);\n  color: var\(--muted\);/);
  });
});

describe("task #436 (12): the hero fills the first screen again", () => {
  it("the hero takes the fill class from 761px (tablets too), not on phones", () => {
    for (const [w, on] of [[1440, true], [1100, true], [1024, true], [761, true], [760, false], [390, false]] as [number, boolean][]) {
      const { container, stop } = landing(w);
      expect(container.querySelector(".hh-top")!.classList.contains("lp-fill"), String(w)).toBe(on);
      stop(); cleanup();
    }
  });
  it("the CSS: at least the screen's height under the header from 761px, content centred; #411's min-height: 0 is gone", () => {
    const css = src("golive.css");
    expect(css).toMatch(/@media \(min-width:761px\) \{\n  main \.hh \.hh-top\.lp-fill \{\n    min-height: calc\(100svh - var\(--lp-hdr,62px\)\)!important;\n    padding-top: 24px!important;\n    padding-bottom: 32px!important;\n    display: flex!important;\n    flex-direction: column!important;\n    justify-content: center!important;/);
    expect(css).not.toMatch(/main \.hh \.hh-top\.lp-fill \{\n    min-height: 0!important;/);
  });
});

describe("task #436 (9): the table's title", () => {
  it("'What each plan gives you' is serif on the site's type scale: 20px (the pack's 22px is not a scale size, docs/TYPE-SCALE.md)", () => {
    expect(src("golive.css")).toMatch(/\.lq-lead2 \.lq-lt \{\n  margin: 0;\n  font: 500 20px\/1\.2 var\(--serif\);/);
  });
});
