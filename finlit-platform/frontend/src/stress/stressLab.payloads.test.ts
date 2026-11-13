// @vitest-environment jsdom
// Task 79: every page the server can send draws, and every control on it works, with no NaN, undefined, null or Infinity on the page and no words that are wrong for
// the company. The variants are the ones backend/finlit/stress/page.py, router.py (strip_value) and service.py really produce: a company without debt or other
// income, a loss, no share count, no sector or price, no share prices stored yet, few past years, a partial latest-quarter check, the value move switched off.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../public/demo/stress-page.json";
import StressEngine from "./engine";
import { badText, draw, exercise, peerOf, type Payload } from "./harness";
import { skeleton } from "./skeleton";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = () => {};
afterEach(() => { document.body.innerHTML = ""; });

const base = (): Payload => JSON.parse(JSON.stringify(fixture));
/** strip_value() and flags.showValue false, as router.page() sends them when STRESS_SHOW_VALUE is off. */
const noValue = (p: Payload): Payload => {
  const strip = (o: any): any => Array.isArray(o) ? o.map(strip) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => !["value", "value_move", "value_other_persistence"].includes(k)).map(([k, v]) => [k, strip(v)])) : o;
  return strip({ ...p, flags: { showValue: false } });
};
/** plan_payload(..., "silver"). */
const silver = (p: Payload): Payload => {
  const keep = ["today", "today_eia", "2022", "2020"];
  return { ...p, plan: "silver", scenarios: p.scenarios.filter((s: any) => keep.includes(s.id)), locked_scenarios: p.scenarios.filter((s: any) => !keep.includes(s.id)).map((s: any) => ({ id: s.id, name: s.name })) };
};
const v = (f: (p: Payload) => void): Payload => { const p = base(); f(p); return p; };
const nifty = (fall: number) => ({ fall_pct: fall, peak: "2020-01-14", trough: "2020-03-23", back: "2020-11-20" });

const VARIANTS: Record<string, Payload> = {
  base: base(),
  noEia: v((p) => { p.eia_outlook = null; p.scenarios = p.scenarios.filter((s: any) => s.id !== "today_eia"); }),
  noDebt: v((p) => { p.company.debt = 0; p.company.interest = 0; }),
  noOtherIncome: v((p) => { p.company.other_income = 0; }),
  noOtherIncomeNoCash: v((p) => { p.company.other_income = 0; p.company.cash = 0; p.company.debt = 0; p.company.interest = 0; }),
  loss: v((p) => { p.company.rm = p.company.revenue * 0.85; p.company.reported_eps = -20; }),
  thinProfit: v((p) => { const c = p.company; c.rm = c.revenue - c.emp - c.opex - c.other_income * 0 - (c.dep + c.interest - c.other_income) - 5; }),
  noShares: v((p) => { p.company.shares = null; p.company.reported_eps = null; }),
  noProfile: v((p) => { Object.assign(p.company, { sector: null, industry: null, market_cap_cr: null, price: null, price_as_of: "", size: "", inventory_days_fy26: null }); }),
  noHistory: v((p) => { p.history = []; }),
  niftyOnly: v((p) => { p.history = p.history.map((h: any, i: number) => ({ ...h, nifty: nifty(-10 - i), ASIANPAINT: null })); }),
  listedLate: v((p) => { p.history = p.history.map((h: any, i: number) => ({ ...h, nifty: nifty(-10 - i), ASIANPAINT: i < 2 ? null : { fall_pct: i === 3 ? 0 : -8, peak: null, trough: null, back: null } })); }),
  fewYears: v((p) => { p.backtest.years = p.backtest.years.slice(-1); p.backtest.summary = { all_years: { years: 1, direction_right: 1, mean_abs_error_pts: 0.8, mean_abs_change_reported_pts: 1.1 }, shock_years: { years: 0 } }; }),
  noBacktest: v((p) => { p.backtest = { years: [], summary: { all_years: { years: 0 }, shock_years: { years: 0 } }, latest_quarter: null }; p.calibration_years = []; }),
  lqPartial: v((p) => { p.backtest.latest_quarter = { from: "Jul to Sep 2025", to: "Jul to Sep 2026", margin_before: null, predicted: 13.9, reported: null }; }),
  exporter: v((p) => { Object.assign(p.company.exposure, { export_rev: 0.6, import_rm: 0.3 }); }),
  crudeRevenue: v((p) => { Object.assign(p.company.exposure, { crude_rev: 0.7, crude_rev_beta: 0.9, crude_rm: 0.8, import_rm: 0.1, metal_rm: 0, agri_rm: 0, export_rev: 0.1 }); }),
  noCalibration: v((p) => { p.company.calibration = {}; delete p.company.field_source; }),
  standalone: v((p) => { p.company.statement = "standalone"; p.today_inputs.usdinr_source = "FinLit usdinr"; }),
};

const text = (root: ShadowRoot) => root.querySelector(".sl-root")?.textContent || "";

describe("Stress Lab draws every payload the server can send, and every control works", () => {
  for (const [name, p] of Object.entries(VARIANTS)) {
    it(`${name}: Gold alone and side by side, Silver, and the value move off`, () => {
      const probs: string[] = [];
      const run = (label: string, d: Payload, view: "single" | "compare", peer: any) => { const { root, h } = draw(d, view, peer); probs.push(...exercise(root, label)); h.destroy(); document.body.innerHTML = ""; };
      run(`${name} gold`, p, "single", null);
      run(`${name} gold compare`, p, "compare", peerOf(base()));
      run(`${name} as the second company`, base(), "compare", peerOf(p));
      run(`${name} silver, value off`, noValue(silver(p)), "single", null);
      expect(probs).toEqual([]);
    }, 120_000);
  }
});

describe("what the page says for each kind of company (task 79)", () => {
  it("no other income: the change has no percentage (never +Infinity%)", () => {
    const { root } = draw(VARIANTS.noOtherIncome);
    const row = [...root.querySelectorAll("#tbl tr")].find((r) => /^Other income/.test(r.textContent || ""))!;
    expect(row.querySelectorAll("td")[3].textContent).toBe("–");
    expect(text(root)).not.toMatch(/Infinity|NaN/);
  });
  it("no debt: says there is nothing to cover, not 'covers interest no interest'", () => {
    const { root } = draw(VARIANTS.noDebt);
    expect(text(root)).toMatch(/It has no borrowings, so there is no interest to cover/);
    expect(text(root)).not.toMatch(/covers interest no interest/);
  });
  it("a loss in the base period: ₹ Cr bars, no EPS percentages, no 'hardest' from missing numbers", () => {
    const { root } = draw(VARIANTS.loss);
    expect(root.querySelector<HTMLButtonElement>("[data-unit=eps]")!.disabled).toBe(true);
    expect(root.getElementById("drv")!.textContent).toMatch(/Shown in ₹ Cr: the base period was a loss/);
    expect(root.getElementById("sens")!.textContent).toMatch(/made a loss over the last four quarters/);
    expect(root.getElementById("every")!.textContent).not.toMatch(/The hardest/);
    expect(root.getElementById("ana")!.textContent).toMatch(/no percentage: the base period was a loss/);
    expect(root.getElementById("ana")!.textContent).not.toMatch(/move –/);
  });
  it("a loss for one of two companies: 'Not comparable', never a winner from a missing number", () => {
    const { root } = draw(base(), "compare", peerOf(VARIANTS.loss));
    expect(root.getElementById("every")!.textContent).toMatch(/Not comparable/);
    expect(root.getElementById("sens")!.textContent).toMatch(/Not worked out \(loss\)/);
  });
  it("no share count: one plain sentence instead of a page of NaN, and no controls that would draw it", () => {
    const { root } = draw(VARIANTS.noShares);
    expect(root.getElementById("head")!.textContent).toMatch(/cannot work out earnings per share for Asian Paints: its share count is not on file/);
    expect(badText(root)).toBeNull();
    expect(root.getElementById("chips")!.closest("section")!.hidden).toBe(true);
    expect(root.getElementById("grid2")!.hidden).toBe(true);
    expect(root.getElementById("costrip")!.textContent).toMatch(/Asian Paints/);
  });
  it("a second company without a share count: the first is shown alone with the reason and the 'Compare with' box", () => {
    const { root } = draw(base(), "compare", peerOf(VARIANTS.noShares));
    expect(root.getElementById("peerbox")!.textContent).toMatch(/Peer Co Ltd cannot be compared: its share count or revenue is not on file/);
    expect(root.querySelector("#peerbox input[type=search]")).toBeTruthy();
    expect(badText(root)).toBeNull();
  });
  it("no sector, size or price: left out of the strip, never 'null'", () => {
    const { root } = draw(VARIANTS.noProfile);
    expect(root.querySelector(".costrip small")!.textContent).toBe("ASIANPAINT");
    expect(text(root)).not.toMatch(/null|the {2}industry|industry industry/);
  });
  it("no share prices stored yet: says so once, no '0 of 0 episodes', no 'Listed later'", () => {
    for (const p of [VARIANTS.noHistory, base()]) {     // the demo page has the episodes but no prices
      const { root } = draw(p);
      expect(root.getElementById("hist")!.textContent).toMatch(/not on file yet/);
      expect(root.getElementById("hist")!.textContent).not.toMatch(/0 of 0|Listed later/);
      document.body.innerHTML = "";
    }
  });
  it("Nifty prices but none for the company: 'No prices on file', not 'Listed later'", () => {
    const { root } = draw(VARIANTS.niftyOnly);
    const t = root.getElementById("hist")!.textContent!;
    expect(t).toMatch(/No prices on file/); expect(t).not.toMatch(/Listed later|0 of 0/);
    expect(t).toMatch(/cannot be set side by side here/);
  });
  it("a company listed after the first episodes: 'Listed later' only for those, and 'No fall' when there was none", () => {
    const { root } = draw(VARIANTS.listedLate);
    const rows = [...root.querySelectorAll("#hist tbody tr")].map((r) => r.textContent || "");
    expect(rows[0]).toMatch(/Listed later/); expect(rows[1]).toMatch(/Listed later/);
    expect(rows[3]).toMatch(/No fall/); expect(rows[3]).not.toMatch(/Not yet/);
    expect(root.getElementById("hist")!.textContent).toMatch(/in 2 of 2 episodes/);
  });
  it("the back-test names this company's own years and says the FY22 sentence only from its FY22 row", () => {
    let { root } = draw(base());
    expect(root.getElementById("bt")!.textContent).toMatch(/reported change in the EBITDA margin, FY18 to FY26/);
    expect(root.getElementById("bt")!.textContent).toMatch(/FY22, is called in the right direction but under-stated/);   // FY22: −3.86 predicted, −5.86 reported
    document.body.innerHTML = "";
    const over = v((p) => { const y = p.backtest.years.find((x: any) => x.to === "FY22"); y.change_predicted_pts = -8; });
    ({ root } = draw(over));
    expect(root.getElementById("bt")!.textContent).toMatch(/FY22, is called in the right direction but over-stated/);
    document.body.innerHTML = "";
    ({ root } = draw(VARIANTS.fewYears));
    expect(root.getElementById("bt")!.textContent).toMatch(/FY25 to FY26/);
    expect(root.getElementById("bt")!.textContent).not.toMatch(/FY22|FY19 to FY26/);
    document.body.innerHTML = "";
    ({ root } = draw(VARIANTS.noBacktest));
    expect(root.getElementById("bt")!.textContent).toMatch(/not enough past years/);
  });
  it("a latest-quarter check with missing figures is left out, not shown as '–'", () => {
    const { root } = draw(VARIANTS.lqPartial);
    expect(root.getElementById("bt")!.textContent).not.toMatch(/Latest quarter, not used/);
    expect(root.getElementById("ana")!.textContent).not.toMatch(/In the latest quarter/);
  });
  it("the pass-through note follows the company's calibration, and the sources follow the data", () => {
    let { root } = draw(base());
    expect(root.getElementById("asm")!.textContent).toMatch(/pulled towards the Paints industry’s value because there are only a few such years/);
    document.body.innerHTML = "";
    ({ root } = draw(VARIANTS.noCalibration));
    expect(root.getElementById("asm")!.textContent).toMatch(/too few years with a large move in input costs/);
    expect(root.getElementById("asm")!.textContent).not.toMatch(/pulled towards/);
    document.body.innerHTML = "";
    ({ root } = draw(VARIANTS.standalone));
    expect(root.getElementById("costrip")!.textContent).toMatch(/AccountsStandalone/);
    expect(text(root)).toMatch(/Rupee: FBIL reference rate, published by the RBI\./);
    expect(text(root)).toMatch(/annual results, standalone\./);
    document.body.innerHTML = "";
    ({ root } = draw(base()));                             // the demo page's rupee came from the stop-gap
    expect(text(root)).toMatch(/Rupee: monthly averages from x-rates\.com/);
    expect(skeleton("gold", "d", "m", "x")).not.toMatch(/#6b665a/);
  });
  it("with the value move off, the shocks that only move value are not shown", () => {
    const { root } = draw(noValue(base()));
    expect(text(root)).not.toMatch(/Investor caution|Equity risk premium|Value move/);
  });
  it("a crude price that halves EPS by falling is not called a rise", () => {
    const { root } = draw(VARIANTS.crudeRevenue);
    const tile = [...root.querySelectorAll("#sens .bp")].find((b) => /Crude/.test(b.textContent || ""))!;
    const val = tile.querySelector(".v")!.textContent!;
    if (/^−/.test(val)) expect(tile.textContent).toMatch(/Crude fall/); else expect(tile.textContent).not.toMatch(/Crude fall/);
  });
});

describe("the compare view (task 79)", () => {
  it("names the second company in the breaking points, never 'Sample'", () => {
    const { root } = draw(base(), "compare", peerOf(base()));
    expect(root.getElementById("sens")!.querySelector("thead")!.textContent).toMatch(/Peer Co/);
    expect(text(root)).not.toMatch(/Sample/);
  });
  it("says how the second company was picked: same quarter or not", () => {
    let { root } = draw(base(), "compare", { ...peerOf(base()), picked: true, same_quarter: true });
    expect(root.getElementById("costrip")!.textContent).toMatch(/has results to the same quarter \(Sep 2026\)/);
    document.body.innerHTML = "";
    const other = peerOf(base()); other.company.base_end = "2026-06-30";
    ({ root } = draw(base(), "compare", { ...other, picked: true, same_quarter: false }));
    expect(root.getElementById("costrip")!.textContent).toMatch(/No covered peer has results to Sep 2026 yet/);
    expect(root.getElementById("costrip")!.textContent).not.toMatch(/has results to the same quarter/);
  });
  it("counts who takes the bigger hit with each company's own Today, as the table does", () => {
    const b = peerOf(base());
    const today = b.scenarios.find((s: any) => s.id === "today"); today.crude = 250; today.demand = -40;   // B's own Today is far harsher
    const { root } = draw(base(), "compare", b);
    const rows = [...root.querySelectorAll("#every tbody tr")];
    const bigger = rows.filter((r) => /Peer Co/.test(r.querySelectorAll("td")[5]?.textContent || "")).length;
    const words = root.getElementById("calls")!.textContent || "";
    const m = words.match(/(Asian Paints|Peer Co) takes the bigger hit in (\d+) of (\d+) scenarios/);
    if (m) expect(m[1] === "Peer Co" ? +m[2] : +m[3] - +m[2]).toBeGreaterThanOrEqual(bigger);
    expect(StressEngine.run(b.company, today).change_pct.eps!).toBeLessThan(StressEngine.run(base().company, base().scenarios[0]).change_pct.eps!);
  });
  for (const [status, words] of [["none", /No peer of this company is covered/], ["preparing", /being prepared\. This page checks again by itself every 20 seconds/], ["error", /could not be loaded/], ["loading", /Finding a company/]] as const) {
    it(`no second company (${status}): the reason and the 'Compare with' box are at the top`, () => {
      const { root } = draw(base(), "compare", null, { peerStatus: status });
      const box = root.getElementById("costrip")!.querySelector("#peerbox")!;
      expect(box.textContent).toMatch(words);
      expect(box.querySelector("input[type=search]")).toBeTruthy();
    });
  }
  it("a second company Stress Lab does not cover: the server's own plain reason, escaped, with the 'Compare with' box", () => {
    const { root } = draw(base(), "compare", null, { peerStatus: "notcovered", peerReason: "Stress Lab does not cover financial companies yet. <b>x</b>" } as never);
    const box = root.getElementById("costrip")!.querySelector("#peerbox")!;
    expect(box.textContent).toBe("Stress Lab does not cover financial companies yet. <b>x</b> Search for another company to compare with.");
    expect(box.querySelector("b")).toBeNull();
  });
  it("Silver never gets the 'Compare with' box", () => {
    const { root } = draw(silver(base()), "single", null, { peerStatus: "none" });
    expect(root.getElementById("peerbox")).toBeNull();
  });
});

describe("controls (task 79)", () => {
  it("Silver's 'See what Gold adds' opens the site's upgrade flow", () => {
    const onUpgrade = vi.fn();
    const { root } = draw(silver(base()), "single", null, { onUpgrade });
    const a = root.querySelector<HTMLAnchorElement>("[data-upgrade]")!;
    expect(a.getAttribute("href")).toBe("/plans");
    a.click(); expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
  it("an i button opens on a tap or Enter, one at a time, and closes on Escape or a tap elsewhere", () => {
    const { root } = draw(base());
    const [a, b] = [...root.querySelectorAll<HTMLElement>("#head .ib")];
    a.click(); expect(a.classList.contains("open")).toBe(true); expect(a.getAttribute("aria-expanded")).toBe("true");
    b.click(); expect(a.classList.contains("open")).toBe(false); expect(b.classList.contains("open")).toBe(true);
    b.click(); expect(b.classList.contains("open")).toBe(false);
    b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true })); expect(b.classList.contains("open")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); expect(b.classList.contains("open")).toBe(false);
    b.click(); document.body.click(); expect(b.classList.contains("open")).toBe(false);
  });
});

describe("design check fixes (task 79, SL-8)", () => {
  const css = () => readFileSync(join(__dirname, "stresslab.css"), "utf8");
  it("says the base window in months, the month after the first quarter end to the last (never ISO dates)", () => {
    const p = base(); p.base_window = ["2025-09-30", "2026-09-30"];
    const { root } = draw(p);
    expect(root.textContent).toMatch(/Four quarters, Oct 2025 to Sep 2026/);
    expect(root.textContent).not.toMatch(/2025-09-30 to 2026-09-30/);
  });
  it("keeps a window the server already wrote in words", () => {
    const p = base(); p.base_window = ["Oct 2025", "Sep 2026"];
    expect(draw(p).root.textContent).toMatch(/Four quarters, Oct 2025 to Sep 2026/);
  });
  it("Escape closes an explanation opened by a tap and takes the focus off it", () => {
    const { root } = draw(base());
    const b = root.querySelector<HTMLElement>(".ib")!;
    b.focus(); b.click();
    expect(b.classList.contains("open")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(b.classList.contains("open")).toBe(false);
    expect(root.activeElement).not.toBe(b);
  });
  it("an explanation shows on hover, keyboard focus or an open tap, never on a plain focus left by a tap", () => {
    expect(css()).toMatch(/\.ib:hover \.tip,\.ib:focus-visible \.tip,\.ib\.open \.tip\{display:block\}/);
    expect(css()).not.toMatch(/\.ib:focus \.tip/);
  });
  it("'What moves the company most' spans the page on one company, and a column in Compare two", () => {
    expect(css()).toMatch(/\.senscard\{grid-column:1\/-1\}\.sl-root\.v-compare \.senscard\{grid-column:auto\}/);
  });
});
