// @vitest-environment jsdom
// Task #389 PR C (developer file 32, Risk analytics view; Update 25 Nov rows 3, 4, 5; Build these too 2 and 3; Words): the six range names in one pass, "Moves
// with its markets", the step 5 line from the server's basis (fault 5), Yours / Index lines and the Overall column, range boxes of one size with "+N more",
// card words and real minus signs, sorting (words by rank, a dash last both ways), lists above 12 stopping at 10, the fall chart's 10 deepest, "What stands
// out" one note a line (fault 13), "falls taken" blank when not compared (fault 6), "points", In short, one label per i. Figures: the pack's Preview sample.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { BuildSection, EachFundSection, FallSection, OwnBenchSection, RiskShareSection, RiskTab, bandWord, buildSteps, glanceTiles, standsOutNotes, sumLine } from "./MfRisk";
import { shortLines } from "./MfShort";
import { fallBars } from "../../portfolio/pack/MarketFall";
import type { FundRisk, MfRisk } from "../../lib/mfPack";

afterEach(cleanup);
// the server's words (bench.BANDS): the keys stay, the page renames them by key
const SERVER = { less: "Less sensitive", defensive: "Defensive", similar: "Similar", more: "More sensitive", high: "High", very_high: "Very high" } as const;
const band = (b: number) => { const k = b < 0.65 ? "less" : b < 0.9 ? "defensive" : b < 1.1 ? "similar" : b < 1.35 ? "more" : b < 1.75 ? "high" : "very_high"; return { key: k, word: SERVER[k] } as FundRisk["band"]; };
const F = (code: number, short: string, type: string, betaOwn: number, x: Partial<FundRisk> = {}): FundRisk => ({ code, name: short, short, category: type, swing: 13, worstFall: -15, beta: betaOwn, fallsTaken: 90,
  from: null, to: null, years: 3, why: null, benchmark: "Nifty 500", compared: true, benchKind: "index", betaOwn, band: band(betaOwn), explained: 94, downPer100: 90, upPer100: 95, oneYear: 3.1, benchOneYear: 1.3,
  beta500: betaOwn, riskShare: 12, listShare: 12, type, ...x });
// the Preview sample, its recorded figures (file 32 screenshots 09 and r2-04)
const SAMPLE: FundRisk[] = [
  F(1, "Nippon India Large Cap", "Large cap", 0.95, { benchmark: "Nifty 100", downPer100: 96, upPer100: 99, oneYear: 1.6, benchOneYear: 0.3, listShare: 10, riskShare: 12.1 }),
  F(2, "HDFC Balanced Advantage", "Hybrid", 1.41, { benchmark: "50% Nifty 50 + 50% debt", benchKind: "blend", standIn: true, downPer100: 149, upPer100: 139, beta500: 0.98, listShare: 11, riskShare: 10.1 }),
  F(3, "HDFC Liquid", "Liquid", 0, { compared: false, benchmark: "Not compared", benchKind: "none", explained: null, downPer100: null, upPer100: null, fallsTaken: -4, beta500: 0.01, listShare: 7, riskShare: 0.1 }),
  F(4, "Axis Midcap", "Mid cap", 0.87, { benchmark: "Nifty Midcap 150", downPer100: 73, upPer100: 89, listShare: 16, riskShare: 18.8 }),
  F(5, "UTI Nifty 50 Index", "Index & other", 0.98, { benchmark: "Nifty 50", downPer100: 98, upPer100: 94, listShare: 11, riskShare: 13.9 }),
  F(6, "Parag Parikh Flexi Cap", "Diversified equity", 0.62, { downPer100: 64, upPer100: 64, listShare: 19, riskShare: 15.3, worstFall: -11 }),
  F(7, "SBI Small Cap", "Small cap", 0.8, { benchmark: "Nifty Smallcap 250", downPer100: 77, upPer100: 83, listShare: 16, riskShare: 17.7, worstFall: -22.4 }),
  F(8, "Mirae Asset ELSS Tax Saver", "Diversified equity", 1.01, { downPer100: 100, upPer100: 105, listShare: 9, riskShare: 12 }),
];
const rkOf = (funds: FundRisk[], x: Partial<MfRisk> = {}) => ({ count: funds.length, basis: "value", funds, list: { swing: 11.1, worstFall: -13, level: null }, bench: { name: "NIFTY 500", swing: 14.4, worstFall: -18.8, from: "2023-11-20", to: "2026-11-20" },
  own: { from: "2025-11-21", to: "2026-11-20", list: { betaOwn: 0.84, betaOwnBand: band(0.84), betaExLiquid: 0.91, betaExLiquidBand: band(0.91), beta500: 0.78, beta500Band: band(0.78), liquidShare: 7,
    worst10: { list: -2.2, nifty500: -2.8 }, fall10: { own: -8.4, nifty500: -7.8 } } }, ...x }) as unknown as MfRisk;
const RK = rkOf(SAMPLE);
/** A made-up long list: 30 funds, betas spread over every range. */
const LONG = rkOf(Array.from({ length: 30 }, (_, i) => F(100 + i, `Made-up Fund ${String(i + 1).padStart(2, "0")}`, i % 2 ? "Mid cap" : "Small cap", 0.3 + i * 0.06, { listShare: 100 / 30, riskShare: 100 / 30, downPer100: 60 + i * 3, upPer100: 70 + i * 2 })));
const view = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const text = () => document.body.textContent ?? "";

describe("Risk 1 and Words: the six range names, renamed in one pass from their keys", () => {
  it("reads Much less sensitive below 0.65 and Less sensitive for 0.65–0.90; never Defensive, never a chained rename", () => {
    expect([bandWord({ key: "less", word: "Less sensitive" }), bandWord({ key: "defensive", word: "Defensive" }), bandWord({ key: "similar", word: "Similar" }), bandWord({ key: "more", word: "More sensitive" }),
      bandWord({ key: "high", word: "High" }), bandWord({ key: "very_high", word: "Very high" })]).toEqual(["Much less sensitive", "Less sensitive", "Similar", "More sensitive", "High", "Very high"]);
    view(<RiskTab rk={RK} />);
    expect(text()).not.toMatch(/Defensive|defensive|Relatively/);
    expect(within(document.querySelector(".mfr-ranges") as HTMLElement).getAllByText(/sensitive|Similar|High|Very high/).filter((e) => e.classList.contains("eqr-chip")).map((e) => e.textContent))
      .toEqual(["Much less sensitive", "Less sensitive", "Similar", "More sensitive", "High", "Very high"]);
    expect(Array.from(document.querySelectorAll(".eqr-bands span")).map((s) => s.textContent)).toEqual(["Much less sensitive", "Less sensitive", "Similar", "More sensitive", "High", "Very high"]);
    // the Each fund table's chips: Parag Parikh 0.62 Much less sensitive, Axis Midcap 0.87 Less sensitive
    const each = document.querySelector(".mfr-each") as HTMLElement;
    expect(within(each).getByText("Parag Parikh Flexi Cap").closest("tr")!.textContent).toMatch(/0\.62 Much less sensitive/);
    expect(within(each).getByText("Axis Midcap").closest("tr")!.textContent).toMatch(/0\.87 Less sensitive/);
  });
  it("In short: the funds range from much less sensitive to high", () => {
    expect(shortLines(undefined, RK)).toEqual([["Risk", "Against their own benchmarks the funds range from much less sensitive to high. The liquid fund holds the list's beta down to 0.84."]]);
  });
});

describe("Risk 2 and 3, Update row 5: the tile, the scenario line, step 5 from the basis, the card words and minus signs", () => {
  it("the tile reads Moves with its markets, and the fall reads Moves 0.84× as much as its markets", () => {
    expect(glanceTiles(RK)[3]).toMatchObject({ k: "Moves with its markets", v: "0.84×", vs: "its markets: 1.00×" });
    view(<FallSection rk={RK} />);
    expect(document.querySelector(".fx-src")!.textContent).toBe("Moves 0.84× as much as its markets: each fund against its own benchmark");
    expect(text()).not.toMatch(/Your funds' beta|\bpts\b/);
    expect(document.querySelector(".fx-chip")!.textContent).toBe("1.6 points less than the Nifty 500’s 10%");     // "2 pts" → "2 points"
  });
  it("step 5 reads By what you hold now when units are in (fault 5), and says each fund counts the same when they are not", () => {
    expect(buildSteps("value")[4]).toEqual(["Weight by the list", "By what you hold now"]);
    expect(buildSteps("equal")[4][1]).toBe("Each fund the same until units are in for every fund");
    view(<BuildSection rk={RK} />);
    expect(text()).toMatch(/Weight by the listBy what you hold now/);
    expect(text()).not.toMatch(/By count now/);
  });
  it("Moves, on average 0.75×; Adds to the list's figure; a real minus in the sum", () => {
    view(<BuildSection rk={RK} />);
    const card = Array.from(document.querySelectorAll(".eqr-card")).find((c) => c.textContent!.startsWith("Diversified equity"))!;
    expect(card.textContent).toMatch(/Moves, on average0\.\d\d×Share of the list× \d+%Adds to the list's figure0\.\d\d/);
    expect(text()).not.toMatch(/Average beta|Adds to the list's beta/);
    expect(sumLine([0.59, -0.01, 0])).toBe("0.59 − 0.01 + 0.00");
    expect(sumLine([-0.04, 0.2])).toBe("−0.04 + 0.20");
  });
});

describe("Update rows 3 and 4: labels on the scale, six range boxes of one size", () => {
  it("puts 0.84 Your list (filled) and 0.91 Without liquid (outlined) on the scale; a tapped fund joins dashed", () => {
    view(<BuildSection rk={RK} />);
    const labs = () => Array.from(document.querySelectorAll(".eqb-lab")).map((l) => [l.textContent, l.className]);
    expect(labs()).toEqual([["0.84Your list", "eqb-lab list"], ["0.91Without liquid", "eqb-lab"]]);
    fireEvent.click(screen.getByRole("button", { name: "Axis Midcap" }));
    expect(labs()[2]).toEqual(["0.87Axis Midcap", "eqb-lab pick"]);
    expect(document.querySelector(".eqr-pins")).toBeNull();                                  // the stacked labels over the scale are gone
  });
  it("six boxes: chip, range, count, three funds, +N more; an empty range says None of your funds; no second description line", () => {
    view(<BuildSection rk={RK} />);
    const boxes = Array.from(document.querySelectorAll(".mfr-ranges .eqr-range"));
    expect(boxes).toHaveLength(6);
    expect(boxes.map((b) => b.querySelector(".eqr-n")!.textContent)).toEqual(["1 fund · 14%", "2 funds · 29%", "3 funds · 43%", "0 funds · 0%", "1 fund · 14%", "0 funds · 0%"]);
    expect(boxes.map((b) => b.querySelector(".eqr-mute")!.textContent)).toEqual(["below 0.65", "0.65 – 0.90", "0.90 – 1.10", "1.10 – 1.35", "1.35 – 1.75", "above 1.75"]);
    expect([boxes[3], boxes[5]].map((b) => b.querySelector("li")!.textContent)).toEqual(["None of your funds", "None of your funds"]);
    expect(text()).not.toMatch(/than its market|market sensitivity/);
    expect(boxes.every((b) => b.querySelector(".mfr-foot"))).toBe(true);                       // the "+N more" line is kept in every box
  });
  it("+N more opens every fund of the range; tapping one places it on the scale and closes the pop-up", () => {
    view(<BuildSection rk={LONG} />);
    const boxes = Array.from(document.querySelectorAll(".mfr-ranges .eqr-range"));
    expect(boxes.map((b) => b.querySelectorAll("ul > li").length)).toEqual([3, 3, 3, 3, 3, 3]);
    const more = within(boxes[0] as HTMLElement).getByRole("button", { name: /^\+\d+ more$/ });
    const n = Number(more.textContent!.match(/\d+/)![0]) + 3;
    fireEvent.click(more);
    const pop = screen.getByRole("dialog");
    expect(pop.getAttribute("aria-label")).toBe(`Much less sensitive · ${n} funds · ${Math.round((n / 30) * 100)}%`);
    expect(within(pop).getAllByRole("listitem")).toHaveLength(n);
    fireEvent.click(within(pop).getByRole("button", { name: "Made-up Fund 01" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(Array.from(document.querySelectorAll(".eqb-lab.pick")).map((l) => l.textContent)).toEqual(["0.30Made-up Fund 01"]);
  });
});

describe("Risk 4: Yours and Index lines, and the Overall column", () => {
  it("reads the down-week and up-week figures together, as the file's table says", () => {
    view(<OwnBenchSection rk={RK} />);
    const row = (n: string) => screen.getByText(n).closest("tr")!;
    expect(Array.from(row("Nippon India Large Cap").querySelectorAll(".mfr-yi")).map((x) => x.textContent)).toEqual(["Yours +1.6%", "Index +0.3%"]);
    expect(row("Nippon India Large Cap").querySelector(".mfr-ov")!.textContent).toBe("Moves less both ways");     // 96 / 99
    expect(row("HDFC Balanced Advantage").querySelector(".mfr-ov")!.textContent).toBe("Moves more both ways");    // 149 / 139
    expect(row("HDFC Liquid").textContent).toMatch(/Not compared$/);
    const mixed = rkOf([F(1, "Rises", "x", 1, { downPer100: 80, upPer100: 105 }), F(2, "Falls", "x", 1, { downPer100: 110, upPer100: 90 })]);
    cleanup(); view(<OwnBenchSection rk={mixed} />);
    expect([row("Rises").querySelector(".mfr-ov")!.className, row("Rises").querySelector(".mfr-ov")!.textContent]).toEqual(["mfr-ov g", "Rises more, falls less"]);
    expect([row("Falls").querySelector(".mfr-ov")!.className, row("Falls").querySelector(".mfr-ov")!.textContent]).toEqual(["mfr-ov r", "Rises less, falls more"]);
  });
});

describe("Risk 6, Build these too 2 and 3: every column sorts; above 12 rows, 10 then Show all", () => {
  const names = (sel: string) => Array.from(document.querySelectorAll(`${sel} tbody th`)).map((t) => t.firstChild!.textContent);
  it("sorts the Overall words by rank and puts a dash last both ways", () => {
    view(<OwnBenchSection rk={RK} />);
    fireEvent.click(screen.getByRole("button", { name: /^Overall/ }));
    const first = names(".mfr-sb");
    expect(first[first.length - 1]).toBe("HDFC Liquid");
    fireEvent.click(screen.getByRole("button", { name: /^Overall/ }));
    const back = names(".mfr-sb");
    expect(back[back.length - 1]).toBe("HDFC Liquid");
    expect(first.slice(0, 2)).toEqual(["HDFC Balanced Advantage", "Mirae Asset ELSS Tax Saver"]);           // Moves more both ways ranks above Moves less both ways
    expect(back.slice(5, 7)).toEqual(["HDFC Balanced Advantage", "Mirae Asset ELSS Tax Saver"]);
    expect(document.querySelector(".mfr-sb th[aria-sort='ascending']")).toBeTruthy();
  });
  it("Each fund's risk: highest first, every heading a sort button, the liquid fund last both ways", () => {
    view(<EachFundSection rk={RK} />);
    expect(names(".mfr-each")).toEqual(["HDFC Balanced Advantage", "Mirae Asset ELSS Tax Saver", "UTI Nifty 50 Index", "Nippon India Large Cap", "Axis Midcap", "SBI Small Cap", "Parag Parikh Flexi Cap", "HDFC Liquid"]);
    expect(document.querySelectorAll(".mfr-each thead th button.eqs-sort")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: /^Beta against its benchmark/ }));
    expect(names(".mfr-each")).toEqual(["Parag Parikh Flexi Cap", "SBI Small Cap", "Axis Midcap", "Nippon India Large Cap", "UTI Nifty 50 Index", "Mirae Asset ELSS Tax Saver", "HDFC Balanced Advantage", "HDFC Liquid"]);
    fireEvent.click(screen.getByRole("button", { name: /^Worst fall/ }));
    expect(names(".mfr-each")[0]).toBe("Parag Parikh Flexi Cap");                                 // figures: high to low first (−11.0% is the highest)
    fireEvent.click(screen.getByRole("button", { name: /^Worst fall/ }));
    expect(names(".mfr-each")[0]).toBe("SBI Small Cap");
  });
  it("12 rows show in full; 13 and 30 show 10 and Show all N funds", () => {
    for (const [n, shown, btn] of [[12, 12, null], [13, 10, "Show all 13 funds ▾"], [30, 10, "Show all 30 funds ▾"]] as const) {
      const rk = rkOf(LONG.funds.slice(0, n));
      for (const [Sec, sel] of [[OwnBenchSection, ".mfr-sb"], [EachFundSection, ".mfr-each"], [RiskShareSection, ".eqr-rs"]] as const) {
        view(<Sec rk={rk} />);
        expect(document.querySelectorAll(`${sel} tbody tr`)).toHaveLength(shown);
        const b = document.querySelector(".eqs-more");
        expect(b?.textContent ?? null).toBe(btn);
        if (b) { fireEvent.click(b); expect(document.querySelectorAll(`${sel} tbody tr`)).toHaveLength(n); expect(b.textContent).toBe("Show fewer ▴"); }
        cleanup();
      }
    }
  });
  it("If the Nifty 500 fell: above 12 funds the 10 deepest falls, Market and Your funds first, then Show all", () => {
    view(<FallSection rk={LONG} />);
    const bars = () => Array.from(document.querySelectorAll(".fx-c b")).map((b) => b.textContent);
    expect(bars()).toHaveLength(12);
    expect(bars().slice(0, 3)).toEqual(["Market", "Your funds", "Made-up Fund 30"]);
    expect(bars()[11]).toBe("Made-up Fund 21");
    fireEvent.click(screen.getByRole("button", { name: /^Show all 30 funds/ }));
    expect(bars()).toHaveLength(32);
    expect(document.querySelector(".fx-wide")).toBeTruthy();                                     // a long chart scrolls inside its card
    cleanup(); view(<FallSection rk={RK} />);
    expect(document.querySelectorAll(".fx-c")).toHaveLength(10);                                 // 8 funds: every bar, no button
    expect(document.querySelector(".fx-more")).toBeNull();
    expect(fallBars([{ fall: -1 }, { fall: -3 }, { fall: -2 }], { over: 2, keep: 1 }, false).shown).toEqual([{ fall: -3 }]);
    expect(fallBars([{ fall: -1 }, { fall: -3 }], undefined, false)).toEqual({ shown: [{ fall: -1 }, { fall: -3 }], capped: false });
  });
});

describe("Faults 6 and 13 on the page, and the i labels", () => {
  it("a fund not compared shows a dash for falls taken, never the server's figure", () => {
    view(<EachFundSection rk={RK} />);
    const liq = screen.getByText("HDFC Liquid").closest("tr")!;
    expect(liq.textContent).not.toMatch(/per 100/);
    expect(liq.querySelectorAll("td")[4].textContent).toBe("–");
    expect(screen.getByText("Axis Midcap").closest("tr")!.querySelectorAll("td")[4].textContent).toBe("90 per 100");
  });
  it("What stands out: one note a line, at most two, then +N more that opens the rest in place", () => {
    expect(standsOutNotes(RK.funds[1])).toEqual(["Moves more on its own benchmark than on the Nifty 500 (past year, weekly)", "Benchmark is a stand-in"]);
    const busy = rkOf([F(1, "Busy Fund", "x", 1.5, { years: 2, standIn: true, beta500: 0.9, worstFall: -30, listShare: 10, riskShare: 20 })]);
    view(<EachFundSection rk={busy} />);
    const cell = document.querySelector(".mfr-so")!;
    expect(Array.from(cell.querySelectorAll("li")).map((l) => l.textContent)).toEqual(["Under 3 years of NAVs (2 years)", "+4 more"]);
    fireEvent.click(screen.getByRole("button", { name: "+4 more" }));
    expect(cell.querySelectorAll("li")).toHaveLength(6);
    cleanup(); view(<EachFundSection rk={RK} />);
    expect(Array.from(screen.getByText("HDFC Balanced Advantage").closest("tr")!.querySelectorAll(".mfr-so li")).map((l) => l.textContent)).toEqual(standsOutNotes(RK.funds[1]));
  });
  it("every i on the Risk view has its own label (none reads What does this mean?)", () => {
    view(<RiskTab rk={RK} />);
    const labels = Array.from(document.querySelectorAll("button[aria-label^='About']")).map((b) => b.getAttribute("aria-label"));
    expect(document.querySelectorAll("button[aria-label='What does this mean?']")).toHaveLength(0);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(expect.arrayContaining(["About “Reading a beta”", "About “Against own benchmarks”", "About “Overall”", "About “Moves with its markets”"]));
  });
});
