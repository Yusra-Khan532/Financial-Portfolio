// @vitest-environment jsdom
// Task #411 (27 Nov 2026): the landing page update from the team's pack (01_landing-page-changes.md). These tests hold the page to the pack's points:
// one background, the explorer without "Start here", dots or gold boxes, FinLit Prism and the Mutual Fund Score built on the page (no pictures), no
// figcaption under the tour, the new tour files with the theme rule kept, the combined plan as the table's sixth column (27 of 40, the pack's values
// tool by tool), the band and the solid line after Platinum, the top-left cells, the phone's Combined tab, and /plans kept as it was.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { GoLiveMarkup, GoLiveCompare } from "./GoLiveMarkup";
import { initGoLive } from "./golive";
import { AREAS, PLANS, COMBINED } from "./goliveData";

const src = (p: string) => readFileSync(join(__dirname, p), "utf8");
const PUB = join(__dirname, "../../public/landing");
const TOUR = { src: "/landing/finlit-tour-dark-720p.mp4", poster: "/landing/golive/tour-dark-poster.jpg" };
const noop = { navigate: () => {}, searchIndex: async () => ({ rows: [] }), quote: async () => null };

const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () {};
  HTMLMediaElement.prototype.load = function () {};
  window.scrollTo = (() => {}) as typeof window.scrollTo;
});
afterEach(() => { cleanup(); setWidth(1024); document.documentElement.removeAttribute("data-theme"); });

// task #436: prices are hidden on the landing page until payments open (FL_PRICES_LIVE); the tests of the price figures pass pricesLive: true
function landing(width = 1440, extra: { combinedCard?: boolean; pricesLive?: boolean } = {}) {
  setWidth(width);
  const { container } = render(<GoLiveMarkup tour={TOUR} />);
  let stop = () => {};
  act(() => { stop = initGoLive({ ...noop, ...extra }); });
  return { container, stop: () => stop() };
}

/** The pack's table "Combined plan values, tool by tool" (section 7): ✓ = "Y", — = "N". */
const PACK_COMBINED: Record<string, string> = {
  "Stock screener": "No custom ratios", "Advanced stock screener": "Y", "Query builder & baskets": "200+ ratios · 15 baskets", "Discover": "N",
  "Superinvestor portfolios": "Y", "Mutual funds & ETFs": "Y", "Mutual Fund Score": "Y",
  "Company report": "No sector sections", "FinLit Prism": "10 a day", "Annual reports & presentations": "Y", "Compare companies": "2 at once",
  "Chart builder": "N", "Correlation charts": "N",
  "DCF valuation calculator": "N", "Reverse valuation": "N", "Profit and revenue forecasting": "N", "P/E, EPS & PEG calculator": "Y", "SIP calculator": "Y", "Stress Lab": "N",
  "All my investments": "Y", "Equity portfolio": "50 stocks", "MF portfolio": "30 funds", "ETF portfolio": "Y", "Watchlists": "3 lists", "Alerts": "20 a week",
  "Dashboard": "Full", "Sector Pulse": "N", "Sector Rotation": "N", "Market events & index": "N", "FII & DII flows and India economy": "Y", "Results": "N",
  "Concall Monitor": "Y", "IPOs": "Y", "News & filings": "Y",
  "Glossary & guides": "Y", "Insights & blog": "Y", "Discussion forums": "Y", "FinLit AI": "60 questions a month", "Browser extension": "N", "Connect AI assistants": "N",
};

describe("task #411: the combined plan's data (goliveData.js, one source)", () => {
  it("every row and part has a sixth value, the combined plan's; every row matches the pack's table and 27 of 40 are in the plan", () => {
    const rows = PLANS.G.flatMap((g) => g.rows);
    expect(rows).toHaveLength(40);
    for (const r of rows) { expect(r.v, r.n).toHaveLength(6); for (const s of r.subs) expect(s.v, `${r.n} / ${s.n}`).toHaveLength(6); }
    expect(Object.fromEntries(rows.map((r) => [r.n, r.v[5]]))).toEqual(PACK_COMBINED);
    expect(rows.filter((r) => r.v[5] !== "N" && r.v[5] !== "A")).toHaveLength(27);
    // the five plans keep their own counts (the table's other columns did not change)
    for (let k = 0; k < 5; k++) expect(rows.filter((r) => r.v[k] !== "N" && r.v[k] !== "A").length, PLANS.P[k][0]).toBe(PLANS.cnt[k]);
  });
  it("the pack's rule: the better of the two one-area plans, plus five tools from Gold; the parts follow their row", () => {
    const gold: Record<string, string> = { "All my investments": "Y", "Dashboard": "Full", "Watchlists": "3 lists", "Discussion forums": "Y", "FinLit AI": "60 questions a month" };
    const better = (v: string[]) => (v[2] !== "N" && v[2] !== "Browse") ? v[2] : (v[1] !== "N" ? v[1] : v[2]);
    for (const r of PLANS.G.flatMap((g) => g.rows)) {
      expect(r.v[5], r.n).toBe(gold[r.n] ?? better(r.v));
      for (const s of r.subs) expect(s.v[5], `${r.n} / ${s.n}`).toBe(r.n === "Watchlists" && s.n === "Watchlists" ? "3" : better(s.v));
    }
  });
  it("its name, price and colour are COMBINED's: ₹4,499 a year, ₹375 a month, ₹501 less than both one-area plans", () => {
    expect([COMBINED.head[0], COMBINED.y, Math.round(COMBINED.y / 12)]).toEqual(["Combined", 4499, 375]);
    expect(PLANS.P[1][4]!.y + PLANS.P[2][4]!.y - COMBINED.y).toBe(501);
    expect(PLANS.P).toHaveLength(5);   // the shared plan list (read by /plans and the account page) is unchanged
  });
});

describe("task #411: the markup", () => {
  it("no figcaption under the hero video: no Product tour label, no jump-to chips", () => {
    const { container } = render(<GoLiveMarkup tour={TOUR} />);
    const fig = container.querySelector("#lp-vid")!;
    expect(fig.querySelector("figcaption")).toBeNull();
    expect(fig.textContent).not.toMatch(/Product tour/i);
    expect(fig.querySelector(".lp-vid-c")).toBeNull();
  });
  it("FinLit Prism is built on the page (HTML, no pictures): the ring 57.9, the four parts, the technical views and the caption", () => {
    const { container } = render(<GoLiveMarkup tour={TOUR} />);
    const pz = container.querySelector("#prism")!;
    expect(pz.querySelectorAll("img, picture")).toHaveLength(0);
    const fund = pz.querySelector(".nx-fund")!, tech = pz.querySelector(".nx-tech")!;
    expect(fund.querySelector(".nx-total-n b")!.textContent).toBe("57.9");
    expect([...fund.querySelectorAll(".nx-part")].map((p) => [p.querySelector(".nx-pn")!.textContent, p.querySelector("b")!.textContent, p.querySelector("em")!.textContent]))
      .toEqual([["Growth & Profitability", "58", "Average"], ["Valuation", "36", "Weak"], ["Quality", "77", "Healthy"], ["Risk", "86", "Strong"]]);
    expect(fund.textContent).toMatch(/higher = lower risk/);
    expect([...tech.querySelectorAll(".nx-th b")].map((b) => b.textContent)).toEqual(["+46", "−32"]);
    expect(tech.querySelector(".nx-al-b")!.textContent).toBe("Bounce in a downtrend");
    expect(pz.querySelector(".lp-sh-cap")!.textContent).toBe("From the live report · Reliance Industries, 22 Nov 2026 · an example, not a recommendation");
  });
  it("the Mutual Fund Score is built on the page: ring 59.0, rank, four rows to light up, four facts and the caption", () => {
    const { container } = render(<GoLiveMarkup tour={TOUR} />);
    const mf = container.querySelector("#mf-score")!;
    expect(mf.querySelectorAll("img, picture, .lp-hlb")).toHaveLength(0);
    expect(mf.querySelector(".nx-total-n b")!.textContent).toBe("59.0");
    expect(mf.querySelector(".nx-rank")!.textContent).toBe("14th of 36 Flexi Cap funds(Direct plan)");
    expect([...mf.querySelectorAll(".nx-mbar")].map((r) => [r.getAttribute("data-hl"), r.querySelector("b")!.textContent, r.querySelector("em")!.textContent]))
      .toEqual([["performance", "40.2", "Weak"], ["risk", "86.6", "Strong"], ["cost", "71.5", "Strong"], ["quality", "41.0", "Weak"]]);
    expect([...mf.querySelectorAll(".nx-facts dd")].map((d) => d.textContent)).toEqual(["63% of the group", "53.1", "35 funds, same category and plan", "63 months"]);
    expect(mf.querySelector(".lp-sh-cap")!.textContent).toMatch(/^From the live fund page · .* · an example, not a recommendation$/);
  });
  it("no picture of the old shots/ folder is named anywhere, and the folder is gone", () => {
    for (const f of ["GoLiveMarkup.tsx", "golive.js", "golive.css", "goliveData.js"]) expect(src(f), f).not.toMatch(/golive\/shots|shots\/(x\/)?(p|mfs)-/);
    expect(existsSync(join(PUB, "golive/shots"))).toBe(false);
  });
});

describe("task #411: the tour", () => {
  it("keeps the file names and the rule: the dark recording on the light page, the light one on the dark page", () => {
    for (const f of ["finlit-tour-light-720p.mp4", "finlit-tour-dark-720p.mp4", "golive/tour-poster.jpg", "golive/tour-dark-poster.jpg"]) expect(statSync(join(PUB, f)).size, f).toBeGreaterThan(50_000);
    document.documentElement.setAttribute("data-theme", "light");
    let r = landing();
    expect(r.container.querySelector("video.lp-tour")!.getAttribute("src")).toBe("/landing/finlit-tour-dark-720p.mp4");
    r.stop(); cleanup();
    document.documentElement.setAttribute("data-theme", "dark");
    r = landing();
    const v = r.container.querySelector("video.lp-tour") as HTMLVideoElement;
    expect(v.getAttribute("src")).toBe("/landing/finlit-tour-light-720p.mp4");
    expect(v.getAttribute("poster")).toBe("/landing/golive/tour-poster.jpg");
    r.stop();
  });
  it("the phone's tour button points at a poster that exists (it was a broken relative address)", () => {
    expect(src("golive.css")).toContain('url("/landing/golive/tour-poster.jpg")');
    expect(src("golive.css")).not.toMatch(/url\("tour-poster\.jpg"\)/);
  });
});

describe("task #411: the explorer", () => {
  it("no Start here legend, no dots and no gold highlighted box or item in any area; the crown's legend stays", () => {
    const { container, stop } = landing();
    for (let a = 0; a < AREAS.length; a++) {
      act(() => { (container.querySelectorAll(".lp-ex-a button")[a] as HTMLElement).click(); });
      const ex = container.querySelector("#lp-ex")!;
      expect(ex.textContent, AREAS[a].name).not.toMatch(/Start here/);
      expect(ex.querySelectorAll(".lp-dot, .lp-dot0, .lp-hl"), AREAS[a].name).toHaveLength(0);
      expect(ex.querySelector(".lp-ex-st")!.textContent).toBe("FinLit’s own model");
    }
    stop();
  });
});

describe("task #411: the plans table", () => {
  const cells = (row: Element) => [...row.children];
  it("six columns: Free · Gold · Platinum | Mutual Fund + ETF · Equity Portfolio · Combined; Combined is ₹375 a month, 27 of 40, ₹501 less than both", () => {
    const { container, stop } = landing(1440, { pricesLive: true });
    const head = container.querySelector(".lq-head")!;
    const plans = cells(head).slice(1);
    expect(plans.map((p) => p.querySelector("b")!.textContent)).toEqual(["Free", "Gold", "Platinum", "Mutual Fund + ETF", "Equity Portfolio", "Combined"]);
    const c = plans[5];
    expect(c.classList.contains("k5")).toBe(true);
    expect(c.textContent).toContain("₹375/month"); expect(c.textContent).toContain("₹4,499 + GST"); expect(c.textContent).toContain("billed yearly");
    expect(c.querySelector("small")!.textContent).toBe("27 of 40 tools");
    expect(c.querySelector(".lq-sub em")!.textContent).toBe("₹501 less than both");
    expect(container.querySelector(".lq-bun")).toBeNull();
    stop();
  });
  it("a band over the two groups (aligned to the columns), the solid line's column class, and the top-left cells filled", () => {
    const { container, stop } = landing(1440, { pricesLive: true });
    const band = container.querySelector(".lq-t > .lq-band")!;
    expect(band.querySelector(".lq-band-l")!.textContent).toBe("Compare plans40 tools in 6 areas");
    const a = band.querySelector(".lq-band-a") as HTMLElement, b = band.querySelector(".lq-band-b") as HTMLElement;
    expect([a.textContent, a.style.gridColumn.replace(/ /g, "")]).toEqual(["Standard plansEverything grows with the plan", "2/5"]);
    expect([b.textContent, b.style.gridColumn.replace(/ /g, "")]).toEqual(["Plans for one needPick by what you hold", "5/8"]);
    // the line runs down the left edge of Mutual Fund + ETF in every row: the band, the header, the area rows and the button row
    act(() => { (container.querySelector("[data-cq=groups]") as HTMLElement).click(); });
    for (const row of container.querySelectorAll(".lq-head, .lq-gh, .lq-row, .lq-cta")) expect(cells(row)[4].classList.contains("k1"), row.className).toBe(true);
    const lead = container.querySelector(".lq-head .lq-lead2")!;
    expect(lead.querySelector(".lq-lt")!.textContent).toBe("What each plan gives you");
    expect(lead.querySelector(".lq-ls")!.textContent).toBe("Yearly plans, shown per month. Prices before GST.");
    expect([...lead.querySelectorAll(".lq-key-in > span")].map((s) => s.textContent)).toEqual(["In the plan", "20 a weekWith a limit", "Not in the plan", "Add-onBuy just that tool"]);
    expect(lead.querySelector(".lq-lc")!.textContent).toBe("Tools by area ↓");
    // the key above the table is inside the table now, so the bar shows it on phones only; Open all areas stays
    expect((container.querySelector(".lq-bar .lq-key") as HTMLElement).style.visibility).toBe("hidden");
    expect(container.querySelector(".lq-bar [data-cq=groups]")).not.toBeNull();
    stop();
  });
  it("the Combined column shows the pack's value in every row, and each area's count adds up to 27", () => {
    const { container, stop } = landing();
    act(() => { (container.querySelector("[data-cq=groups]") as HTMLElement).click(); });
    for (const row of container.querySelectorAll(".lq-row:not(.lq-sub)")) {
      const name = row.querySelector(".lq-n b")!.childNodes[0].textContent!, cell = cells(row)[6], want = PACK_COMBINED[name];
      if (want === "Y") expect(cell.querySelector(".lq-y"), name).not.toBeNull();
      else if (want === "N") expect(cell.querySelector(".lq-no, .lq-add"), name).not.toBeNull();
      else expect(cell.textContent, name).toBe(want);
    }
    const sums = [...container.querySelectorAll(".lq-gh")].map((g) => +cells(g)[6].querySelector("b")!.textContent!);
    expect(sums.reduce((x, y) => x + y, 0)).toBe(27);
    stop();
  });
  it("the notes say the combined plan has both (no longer 'above')", () => {
    const { container, stop } = landing(1440, { pricesLive: true });
    const t = container.querySelector(".lq-notes")!.textContent!;
    expect(t).toContain("The combined plan has both for ₹4,499");
    expect(t).not.toContain("combined plan above");
    // upgrade: the sum of the two one-area plans is worked out from goliveData too (it was typed into the sentence)
    expect(t).toContain(`Both one-area plans bought separately are ₹${(PLANS.P[1][4]!.y + PLANS.P[2][4]!.y).toLocaleString("en-IN")} a year.`);
    expect(src("golive.js")).not.toContain("₹5,000");
    stop();
  });
  it("phone: Combined is the sixth plan button; its line and its count", () => {
    const { container, stop } = landing(390, { pricesLive: true });
    const tabs = [...container.querySelectorAll(".lp-pp-b")];
    expect(tabs.map((b) => b.textContent)).toEqual(["Free", "Gold", "Platinum", "MF + ETF", "Equity", "Combined"]);
    act(() => { (tabs[5] as HTMLElement).click(); });
    const pv = container.querySelector(".lq-pv")!;
    expect(pv.querySelector(".lq-pv-w")!.textContent).toBe("Equity Portfolio + Mutual Fund + ETF, plus five tools from Gold");
    expect(pv.textContent).toContain("27 of 40 tools.");
    expect(pv.textContent).toContain("₹375");
    expect((container.querySelector(".lq-bar .lq-key") as HTMLElement).style.visibility).toBe("");
    stop();
  });
  it("/plans keeps its own layout: five columns and the combined plan's card, no band", () => {
    setWidth(1440);
    const { container } = render(<GoLiveCompare />);
    let stop = () => {};
    act(() => { stop = initGoLive({ ...noop, combinedCard: true, pricesLive: true }); });   // as pages/Plans.tsx starts it
    expect([...container.querySelector(".lq-head")!.children].slice(1).map((p) => p.querySelector("b")!.textContent)).toEqual(["Free", "Gold", "Platinum", "Mutual Fund + ETF", "Equity Portfolio"]);
    expect(container.querySelector(".lq-band")).toBeNull();
    expect(container.querySelector(".lq-bun")!.textContent).toMatch(/₹375/);
    expect(container.querySelector(".lq-bun")!.textContent).toMatch(/27 of 40 tools/);
    expect(container.querySelector(".lq-notes")!.textContent).toContain("The combined plan above has both for ₹4,499");
    stop();
  });
});

describe("task #411: hover lights the right part", () => {
  it("4 Fundamental Areas lights the fundamental block, 2 Technical Views the technical one; each fund feature its own row", () => {
    const { container, stop } = landing();
    const feats = container.querySelectorAll("#prism .hpz-feats .hpz-feat");
    feats[0].dispatchEvent(new MouseEvent("mouseenter"));
    expect(container.querySelector("#prism .nx-fund")!.classList.contains("lit")).toBe(true);
    expect(container.querySelector("#prism .nx-tech")!.classList.contains("lit")).toBe(false);
    feats[0].dispatchEvent(new MouseEvent("mouseleave")); feats[1].dispatchEvent(new MouseEvent("mouseenter"));
    expect(container.querySelector("#prism .nx-fund")!.classList.contains("lit")).toBe(false);
    expect(container.querySelector("#prism .nx-tech")!.classList.contains("lit")).toBe(true);
    const mf = container.querySelectorAll("#mf-score .hpz-feats .hpz-feat");
    ["performance", "risk", "cost", "quality"].forEach((k, i) => {
      mf[i].dispatchEvent(new MouseEvent("mouseenter"));
      expect([...container.querySelectorAll("#mf-score .nx-mbar.lit")].map((r) => r.getAttribute("data-hl"))).toEqual([k]);
      mf[i].dispatchEvent(new MouseEvent("mouseleave"));
    });
    stop();
  });
});

describe("task #411: wording and styles", () => {
  it("no Silver and no FinLit IQ anywhere on the landing page; no buy, sell, hold or target wording", () => {
    const { container, stop } = landing();
    act(() => { (container.querySelector("[data-cq=groups]") as HTMLElement).click(); });
    const t = container.textContent!;
    expect(t).not.toMatch(/\bSilver\b/); expect(t).not.toMatch(/FinLit IQ/);
    expect(t).not.toMatch(/\b(buy|sell|hold) (this|these|now)\b|\btarget price\b/i);
    stop();
  });
  it("the pack's CSS is in: one page background in light mode, the same feature boxes, the 2px line (task #436: the hero fills the first screen again, see golive436)", () => {
    const css = src("golive.css");
    expect(css).toMatch(/:root\[data-theme=light\] \.hh \.hh-top \{\n  background: var\(--bg\)!important;/);
    expect(css).toMatch(/--hh-hero-a: var\(--bg\);\n  --hh-hero-b: var\(--bg\);/);
    expect(css).toMatch(/\.lp-ex-d \.lp-tls>li\.lp-tl,\.lp-ex-di \.lp-tls>li\.lp-tl \{\n  margin: 0;\n  border: 1px solid var\(--border\);\n  background: var\(--s1\);/);
    expect(css).toMatch(/\.lq-t:has\(\.lq-band\) \.lq-c\.k1 \{\n  border-left: 2px solid var\(--border-strong\)!important;/);
    // the dark text tokens change the landing page only
    expect(css).toMatch(/:root\[data-theme=dark\]:has\(\.hh\) \{\n  --text: #f8f7f3;/);
    expect(css).not.toMatch(/^:root\[data-theme=dark\] ?\{/m);
  });
});
