// @vitest-environment jsdom
// Task #385 (developer file 33, phase 1): the four calm cards, the six parts, Since your last visit, Data as of, one section at a time and the phone folds,
// Where your gain or loss came from, Key figures, the shares table (Technical view, account split, Today, Record a sale, subtotal rows, 25 rows above 30,
// sorting), the phone list, What changed, the other sections' wording and In short. Sample data only (made up).
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../components/CoLogo", () => ({ CoLogo: () => null }));
vi.mock("../../lib/auth", async (orig) => ({ ...(await orig<typeof import("../../lib/auth")>()), useAuth: () => ({ user: { id: "u-sample" }, plan: "gold", limits: null, seesAll: false }) }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import type { Holding } from "../../lib/portfolio";
import type { Line, Ready } from "../../lib/portfolioOverview";
import type { LotsProps } from "../HoldingCells";
import type { Share } from "../../lib/equityPack";
import { SharesTable } from "../SharesTable";
import { DataAsOf, PageEnd, ScoreCards, SinceVisit, SixParts, riskPill, sinceText, type CardsInput } from "./EqTop385";
import { GainLossSection, Step, StepCtx, stepOf } from "./EqSteps385";
import { PhoneList } from "./PhoneList385";
import { KeyFigures, portfolioKeyFigs, CAP_PHONE_LIST } from "../shared";
import { PeersSection, InShort } from "./EquityPack";
import { SectionsBar } from "./PageTop";
import { pct, tone } from "../money";
import { WhatChanged } from "../../components/changes/WhatChanged";
import { applyFilters, filterDefs } from "../ShareFilters";
import { PHONE_Q } from "../../components/PhoneFold";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
const phone = (on: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q === PHONE_Q, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));

// ------------------------------------------------------------------------------------------------ the top
const CARDS: CardsInput = { locked: false, score: { total: 61, band: "Average" },
  strength: { avg: 64, word: "Average", byValue: true, counts: [["Strong", 1], ["Healthy", 3], ["Average", 4], ["Weak", 2], ["Poor", 0]] },
  spread: { score: 58, word: "Fairly spread", byCount: 63 }, risk: { beta: 1.12, swing: 19.5, swingIndex: 14.2, bench: "NIFTY 50", byValue: true } };
describe("Top of the page: four calm cards (file 33)", () => {
  it("Score, Strength, Spread and Risk, each with a crown and its own i; the open view says You are here, the others Open →", () => {
    const onView = vi.fn();
    wrap(<ScoreCards c={CARDS} view="portfolio" onView={onView} sixOpen={false} onSix={() => {}} />);
    expect(document.querySelectorAll(".eqc-c")).toHaveLength(4);
    expect(document.querySelectorAll(".eqc-crown")).toHaveLength(4);
    const labels = [...document.querySelectorAll(".sp-i")].map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["About “Your portfolio score”", "About “Strength”", "About “Spread”", "About “Risk”"]);
    expect(screen.getByText("You are here").closest(".eqc-c")!.textContent).toMatch(/Strength/);
    fireEvent.click(screen.getByRole("button", { name: "Open the Risk view" })); expect(onView).toHaveBeenCalledWith("risk");
    expect(document.querySelector(".eqc-sc")!.className).toMatch(/b-mid/);   // the score card takes its band's colour
  });
  it("the cards read the pack's lines: the score's six parts, FinLit Prism · fundamental score with its counts, By what you hold now, 1.12× with no β", () => {
    wrap(<ScoreCards c={CARDS} view="portfolio" onView={() => {}} sixOpen={false} onSix={() => {}} />);
    const t = document.querySelector(".eqc-strip")!.textContent!;
    expect(t).toContain("Six parts together: strength, spread, risk, price trend, valuation and concentration.");
    expect(t).toContain("FinLit Prism · fundamental score");
    expect(t).toContain("1 strong · 3 healthy · 4 average · 2 weak");
    expect(t).toContain("By what you hold now · 63 counting each share equally");
    expect(t).toContain("1.12×"); expect(t).toContain("Above · swings more"); expect(t).toContain("as much as the Nifty 50 moves");
    expect(t).toContain("Typical swing in a year, by what you hold now");
    expect(t).not.toMatch(/β/);
    expect(screen.getByRole("button", { name: /See the six parts/ }).getAttribute("aria-expanded")).toBe("false");
  });
  it("the Risk pill reads the beta against 1 and the swing against the index's", () => {
    expect(riskPill(1.08, 21.2, 14.3)).toBe("In line · swings more"); expect(riskPill(0.8, 10, 14)).toBe("Below · swings less"); expect(riskPill(1.3, 14, 14)).toBe("Above · swings about the same");
  });
  it("Silver: the score and Strength say Gold, never a figure", () => {
    wrap(<ScoreCards c={{ ...CARDS, locked: true, score: null, strength: null }} view="portfolio" onView={() => {}} sixOpen={false} onSix={() => {}} />);
    expect(screen.getAllByRole("link", { name: "See plans" })).toHaveLength(2);
  });
});

describe("the six parts (file 33; open item 4; open item 9)", () => {
  const S = { locked: false, total: 61, band: "Average", basis: "value" as const, of: 3, valued: 3, benchmark: "NIFTY 50",
    byValue: { prism: 64, spread: { score: 58, band: "Fairly spread", comovement: 1, sector_spread: 1, effective_stocks: 2.1, effective_sectors: 1.8 }, market: null },
    readings: { strength: { word: "Average", figure: 64, scoredShare: 1 }, spread: { word: "Fairly spread", figure: 58 }, risk: { word: "Within your comfort", against: "In line with the index", beta: 1.08, benchmark: "NIFTY 50", swing: 21.2, swingIndex: 14.3, worstFall: -18.9, worstFallIndex: -14.8 },
      trend: { word: "Split", term: "long", upShare: 0.46, downShare: 0.2 }, valuation: { word: "Weak" }, concentration: { word: "High", largest: 0.31, largestName: "AAA", topFive: 1 } } };
  it("one row per part, each with its own i; words where the score sends only words; valuation has no figure", () => {
    const set = vi.fn();
    wrap(<SixParts s={S} choices={{ horizon: "3-5", risk: "medium", goal: "grow", benchmark: "NIF50" }} onChoices={set} nameOf={() => "Alpha Gears"} open />);
    const rows = [...document.querySelectorAll(".eqc-p")];
    expect(rows.map((r) => r.querySelector(".eqc-pk")!.textContent!.replace(/i$/, ""))).toEqual(["Strength", "Spread", "Risk against the index", "Price trend", "Valuation", "Concentration"]);
    expect(rows[4].querySelector(".eqc-num")).toBeNull();                     // valuation: a word, no figure behind it
    expect(rows[3].textContent).toContain("Uses FinLit Prism's technical view, long term");
    expect(rows[5].textContent).toContain("Largest: Alpha Gears 31% · 3 shares in all");
    expect(rows[2].textContent).toMatch(/Moves 1\.08× as much as the Nifty 50/);
    const labels = [...document.querySelectorAll(".sp-i")].map((b) => b.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(labels.length);
    fireEvent.click(screen.getByRole("button", { name: "Make the score yours" }));
    fireEvent.change(screen.getByLabelText("Horizon"), { target: { value: "1-3" } });
    expect(set).toHaveBeenCalledWith({ horizon: "1-3", risk: "medium", goal: "grow", benchmark: "NIF50" });
  });
});

describe("Since your last visit, Data as of, the end of the page", () => {
  it("reads the pack's line, counts of one singular", () => {
    expect(sinceText("24 Nov", 0, 6, 13, 17)).toEqual({ lead: "Since your last visit on 24 Nov: nothing new from your companies.", rest: "In the last 90 days, 6 of your 13 companies filed 17 updates." });
    expect(sinceText("24 Nov", 1, 1, 1, 1).lead).toBe("Since your last visit on 24 Nov: 1 new filing from your companies.");
    expect(sinceText(null, 0, 1, 1, 1).rest).toBe("In the last 90 days, 1 of your 1 company filed 1 update.");
    const see = vi.fn(); wrap(<SinceVisit lead="a" rest="b" onSee={see} />); fireEvent.click(screen.getByRole("button", { name: "See what changed →" })); expect(see).toHaveBeenCalled();
  });
  it("Data as of lists each date", () => { wrap(<DataAsOf parts={["Prices: close of 23 Nov", "Filings: the last 90 days"]} />); expect(document.querySelector(".eqc-asof")!.textContent).toBe("Data as ofPrices: close of 23 NovFilings: the last 90 days"); });
  it("Questions and the disclaimer stay closed behind two buttons, with the line beside them", () => {
    wrap(<PageEnd />);
    expect(screen.getByRole("button", { name: /Questions about this page/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "Disclaimer" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Information only, not investment advice.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disclaimer" })); expect(document.getElementById("eqc-disc")!.hidden).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------ one section at a time
describe("the section bar: one section at a time, All sections, the phone folds (file 33)", () => {
  const ALL = { portfolio: { label: "Portfolio", secs: [["pf-shares", "Your shares"], ["eq-wc", "What changed"], ["eq-trend", "Trends"]] as [string, string][] }, diversification: { label: "D", secs: [] }, risk: { label: "R", secs: [] } };
  it("numbered steps with arrows; a chip shows its step; All sections is a button that puts everything back", () => {
    const onStep = vi.fn();
    wrap(<SectionsBar tab="portfolio" all={ALL} steps step="eq-wc" onStep={onStep} onTab={() => {}} />);
    expect([...document.querySelectorAll(".eqt-chip")].map((c) => c.textContent)).toEqual(["1Your shares", "2What changed", "3Trends"]);
    expect(document.querySelectorAll(".eqt-arrow")).toHaveLength(2);
    const chip = (t: string) => [...document.querySelectorAll(".eqt-chip")].find((c) => c.textContent === t) as HTMLButtonElement;
    expect(chip("2What changed").getAttribute("aria-current")).toBe("step");
    fireEvent.click(chip("3Trends")); expect(onStep).toHaveBeenCalledWith("eq-trend");
    fireEvent.click(screen.getByRole("button", { name: "All sections" })); expect(onStep).toHaveBeenCalledWith("all");
  });
  it("a step shows only its own sections; All sections shows every one; on a phone every step after the first folds to its heading, one line and Open ▾", () => {
    const page = (step: string) => <StepCtx.Provider value={{ step, firstStep: "a" }}><Step id="a" title="Your shares" line=""><p>A body</p></Step><Step id="b" title="What changed at your companies" line="17 updates from 6 of your 13 companies in the last 90 days"><p>B body</p></Step></StepCtx.Provider>;
    phone(false);
    const { rerender } = wrap(page("b"));
    expect(screen.queryByText("A body")).toBeNull(); expect(screen.getByText("B body")).toBeTruthy();
    cleanup(); phone(true); wrap(page("all"));
    expect(screen.getByText("A body")).toBeTruthy();                                // the first step stays open
    const sum = screen.getByRole("button", { name: /17 updates from 6 of your 13 companies/ });
    expect(sum.textContent).toMatch(/Open ▾$/); expect(screen.getByRole("heading", { name: "What changed at your companies" })).toBeTruthy();
    fireEvent.click(sum); expect(document.querySelector(".eqf-close")!.textContent).toBe("Close ▴"); expect(screen.getByText("B body")).toBeTruthy();
    void rerender;
  });
  it("a jump finds its step", () => { expect(stepOf([{ id: "pf-shares", label: "Your shares", secs: ["pf-shares", "eq-gl", "eq-keys"] }], "eq-keys")).toBe("pf-shares"); });
});

// ------------------------------------------------------------------------------------------------ gain or loss, key figures
describe("Where your gain or loss came from (file 33)", () => {
  const rows = [{ symbol: "A", name: "Alpha Gears", gain: 9000, pct: 12 }, { symbol: "B", name: "Beta Motor", gain: -40000, pct: -30 }, { symbol: "C", name: "Gamma Labs", gain: 5000, pct: 4 }];
  it("biggest gain at the top, a bar each, the named share bold, the i's own text, and one line on shares without a buy price", () => {
    wrap(<GainLossSection rows={rows} noPrice={1} />);
    expect([...document.querySelectorAll(".eqg-l .n")].map((x) => x.textContent)).toEqual(["Alpha Gears", "Gamma Labs", "Beta Motor"]);
    expect(document.querySelector(".eqg-l li.k .n")!.textContent).toBe("Beta Motor");
    expect(document.querySelector(".eqg-lead")!.textContent).toBe("One share explains the whole loss. Beta Motor is down ₹40,000; the other 2 shares are up ₹14,000 together.");
    expect(screen.getByRole("button", { name: "About “Where your gain or loss came from”" })).toBeTruthy();
    expect(screen.getByText("1 share without a buy price is left out.")).toBeTruthy();
    expect(document.querySelector(".eqg-l .h.l i")).toBeTruthy(); expect(document.querySelectorAll(".eqg-l .h.r i")).toHaveLength(2);
  });
  it("a one-share account hides the section", () => { wrap(<GainLossSection rows={[rows[0]]} noPrice={0} />); expect(document.getElementById("eq-gl")).toBeNull(); });
});

const sh = (symbol: string, name: string, p: Partial<Share> = {}): Share => ({ symbol, name, industry: "Sample", size: "Large", chg: 0, prism: 60, prismWord: "Average", valuation: 60, risk: 60, st: 30, lt: 30, below52: 5, m1: 0,
  peer: { label: "in_line", raw: null, rank: 3, of: 9, group: "Sample", vs: 4.2, bench: "NIFTY Auto", direction: null }, notCompared: null, ...p });
describe("Key figures, Portfolio (file 33)", () => {
  it("numbered questions with their own i, a big figure, the bar's legend, worth a look and the link", () => {
    const S = [sh("AAA", "Alpha Gears Ltd", { peer: { label: "laggard", raw: null, rank: 9, of: 9, group: "G", vs: -5, bench: "x", direction: null }, st: -30, lt: -30, valuation: 20 }), sh("BBB", "Beta Motor Ltd"), sh("CCC", "Gamma Labs Ltd")];
    wrap(<KeyFigures id="eq-keys" sub="What your 3 shares add up to." cards={portfolioKeyFigs(S, true)} />);
    expect([...document.querySelectorAll(".eqkf-q .t")].map((x) => x.textContent)).toEqual(["Do your shares beat similar companies?", "Are their prices rising?", "Are you paying a lot for them?"]);
    expect([...document.querySelectorAll(".eqkf-n")].map((x) => x.textContent)).toEqual(["1", "2", "3"]);
    expect(document.querySelector(".eqkf-worth")!.textContent).toBe("Furthest behindAlpha Gears (9th of 9).");
    expect(screen.getByRole("button", { name: "See peers →" })).toBeTruthy();
    const labels = [...document.querySelectorAll(".sp-i")].map((b) => b.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ------------------------------------------------------------------------------------------------ the shares table
const H: Holding[] = [
  { id: "1", symbol: "AAA", pf: "main", date: "2025-01-02", qty: 30, price: 100, owned: true }, { id: "2", symbol: "AAA", pf: "acc2", date: "2025-02-02", qty: 20, price: 110, owned: true },
  { id: "3", symbol: "BBB", pf: "main", date: "2025-01-05", qty: 10, price: 500, owned: true }, { id: "4", symbol: "CCC", pf: "acc2", date: "2025-03-05", qty: 5, price: 900, owned: true }];
const PX: Record<string, number> = { AAA: 120, BBB: 450, CCC: 1000 };
const fig = (v: number) => ({ value: v });
const ready = (symbol: string, st: number, lt: number, final: number, ind: string, cap: number): Ready => ({ symbol, status: "ready", name: { AAA: "Alpha Gears Ltd", BBB: "Beta Motor Ltd", CCC: "Gamma Labs Ltd" }[symbol] ?? symbol, sector: ind, industry: ind, isBank: false, basis: "consolidated",
  reportAt: null, price: PX[symbol], changePct: symbol === "BBB" ? -0.004 : 1.2, priceAsOf: "2026-11-23", marketCapCr: cap, ratios: { pe: fig(1), pb: fig(1), roe: fig(1), dividend_yield: fig(1), debt_to_equity: fig(1) },
  financials: { year: { available: true, period: "FY26", periodEnd: "2026-03-31" }, quarter: { available: true, period: "Q2", periodEnd: "2026-09-30" } },
  prism: { state: "rated", final, label: final >= 65 ? "HEALTHY" : "AVERAGE", status: "RATED", parts: { fundamental: final, valuation: 100 - final, quality: 60, risk: 40 }, shortTerm: { score: st, word: "x" }, longTerm: { score: lt, word: "y" }, at: null, reason: null } } as unknown as Ready);
const LINES: Line[] = [{ symbol: "AAA", name: "Alpha Gears Ltd", ov: ready("AAA", 30, 60, 70, "Banks", 90000) }, { symbol: "BBB", name: "Beta Motor Ltd", ov: ready("BBB", -30, 60, 55, "Banks", 30000) }, { symbol: "CCC", name: "Gamma Labs Ltd", ov: ready("CCC", -40, -50, 45, "Pharma", 4000) }];
const lots = (cur = "all"): LotsProps => ({ holdings: H, cur, pfName: (id) => (id === "main" ? "Main account" : "Second broker"), nPortfolios: 2, priceOf: (s) => PX[s], changeOf: () => 1,
  add: vi.fn(), edit: vi.fn(), remove: vi.fn(), goTo: "main", open: new Set(), onOpen: vi.fn(), focus: null });
const peerOf = (s: string) => sh(s, s, { below52: s === "AAA" ? 7.6 : null, peer: s === "CCC" ? null : { label: s === "AAA" ? "leader" : "laggard", raw: null, rank: 1, of: 5, group: "G", vs: 3, bench: "x", direction: null } });
const table = (tab: "overview" | "sector" | "ratios" = "overview", lines = LINES) => wrap(<SharesTable lots={lots()} editSell={{ onEdit: () => {}, onSell: () => {} }} lines={lines} meta={{}} page={null} mode="eq" colors={{}} model="prism" tab={tab} period="year" limit={50}
  state="ready" onTab={() => {}} onPeriod={() => {}} actions={() => null} qtyOf={() => null} onQty={() => {}} peerOf={peerOf} day="Monday" />);
const order = () => [...document.querySelectorAll("#pf-panel tbody tr[data-sym]")].map((r) => r.getAttribute("data-sym"));

describe("Your shares (file 33)", () => {
  it("the count reads up to the plan's limit; one heading over the score and its four parts; Strong = cheaper / safer; one Technical view column", () => {
    table();
    expect(document.querySelector(".pfx-count")!.textContent).toBe("3 shares · up to 50");
    const band = [...document.querySelectorAll(".eq-band th")].map((t) => t.textContent).filter(Boolean);
    expect(band).toContain("FinLit Prism · fundamental scorei"); expect(band).toContain("Technical viewi");
    expect(document.querySelector(".eq-gpr")!.getAttribute("colspan")).toBe("5");
    expect(document.querySelector("#pf-panel thead")!.textContent).toMatch(/Val\.[^]*Strong = cheaper/); expect(document.querySelector("#pf-panel thead")!.textContent).toMatch(/Risk[^]*Strong = safer/);
    expect(document.querySelector("#pf-panel thead")!.textContent).not.toMatch(/Short term|Long term/);
    const aaa = document.querySelector('tr[data-sym="AAA"] .eq-tv')!.textContent!;
    expect(aaa).toMatch(/^Rising/); expect(aaa).toContain("7.6% below its 1-year high");
    expect(document.querySelector('tr[data-sym="BBB"] .eq-ts')!.textContent).toBe("Rising but dipping");
  });
  it("a share in two accounts says how many in each; Record a sale; Today in every view; 0.0% for a change that rounds to zero", () => {
    table();
    expect(document.querySelector('tr[data-sym="AAA"] .pfs-acc')!.textContent).toBe("30 in Main account · 20 in Second broker");
    expect(document.querySelector('tr[data-sym="BBB"] .pfs-acc')).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Record a sale of/ })).toHaveLength(3);
    expect(document.body.textContent).not.toMatch(/(^|\s)Sell(\s|$)/);
    expect([...document.querySelectorAll("#pf-panel thead th")].some((t) => /^Today/.test(t.textContent ?? ""))).toBe(true);
    expect(document.body.textContent).not.toContain("Monday");
    cleanup(); table("ratios");
    expect([...document.querySelectorAll("#pf-panel thead th")].map((t) => t.textContent)).toContain("Today");
    expect(document.body.textContent).not.toContain("Monday");
  });
  it("sorting: Share A to Z first, figures high to low first, Vs its peers by rank, a part reorders, aria-sort and ▲ ▼ follow; Enter sorts", () => {
    table();
    const head = (n: RegExp) => [...document.querySelectorAll("#pf-panel thead th button.pfx-sort")].find((b) => n.test(b.textContent ?? "")) as HTMLButtonElement;
    fireEvent.click(head(/^Share/)); expect(order()).toEqual(["AAA", "BBB", "CCC"]); expect(head(/^Share/).closest("th")!.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(head(/^Value now/)); expect(order()).toEqual(["AAA", "CCC", "BBB"]); expect(head(/^Value now/).textContent).toContain("▼");
    fireEvent.click(head(/^Vs its peers/)); expect(order()).toEqual(["AAA", "BBB", "CCC"]);   // Leader, Laggard, Not compared
    fireEvent.click(head(/^Val\./)); expect(order()[0]).toBe("CCC");                        // the part's own figure, high to low
    fireEvent.click(head(/^Trend/)); expect(order()).toEqual(["AAA", "BBB", "CCC"]);        // Rising > Rising but dipping > Falling
    fireEvent.click(screen.getByRole("button", { name: "Sort by the short-term trend" })); expect(order()).toEqual(["AAA", "BBB", "CCC"]);
  });
  it("Moves with rest keeps its word; By sector reads as subtotal rows with the group's share of the money", () => {
    table("sector");
    const sub = [...document.querySelectorAll("tr.eqs-sub")];
    expect(sub.length).toBeGreaterThan(0);
    const banks = sub.find((r) => /2 of 3 shares/.test(r.textContent ?? ""))!;
    // Financial Services: AAA 50 × 120 = 6,000 and BBB 10 × 450 = 4,500 of 15,500 in all: 67.7% of the money; paid 5,200 + 5,000
    expect(banks.textContent).toMatch(/67\.7% of the money, 2 of 3 shares/);
    expect(banks.textContent).toContain("₹10,200"); expect(banks.textContent).toContain("₹10,500"); expect(banks.textContent).toContain("+₹300");
  });
  it("above 30 shares, 25 rows then Show all N shares, after any sort or filter", () => {
    const many: Line[] = Array.from({ length: 31 }, (_, i) => ({ symbol: "S" + i, name: "Share " + i, ov: ready("AAA", 30, 60, 70, "Banks", 90000) }));
    table("overview", many);
    expect(order()).toHaveLength(25);
    const more = document.querySelector("tr.eqs-capr button") as HTMLButtonElement; expect(more.textContent).toBe("Show all 31 shares ▾"); fireEvent.click(more); expect(order()).toHaveLength(31);
    expect(screen.getByRole("button", { name: /Show fewer/ })).toBeTruthy();
  });
  it("the Trend filter offers both trends, the long term and the short term", () => {
    const d = filterDefs("Prism", ["Strong"], ["Rising", "Falling"]).find((x) => x.key === "trend")!;
    expect(d.choices.map((c) => c.v)).toEqual(["Both trends: Rising", "Both trends: Falling", "Long term: Rising", "Long term: Flat", "Long term: Falling", "Short term: Rising", "Short term: Flat", "Short term: Falling", "Not rated"]);
    const get = { prism: () => "", size: () => "", peers: () => "", buys: () => "", trend: (s: string) => (s === "A" ? ["Both trends: Rising", "Long term: Rising", "Short term: Rising"] : ["Long term: Falling"]) };
    expect(applyFilters(["A", "B"], { trend: ["Short term: Rising"] }, get)).toEqual(["A"]);
    expect(applyFilters(["A", "B"], { trend: ["Long term: Falling"] }, get)).toEqual(["B"]);
  });
});

describe("the phone list (file 33, Phone)", () => {
  it("code and name, quantity, value, gain or loss, Prism tag, trend chip and Today; sort chips; a row opens its details", () => {
    wrap(<PhoneList lines={LINES} total={3} lots={lots()} peerOf={peerOf} model="prism" rule={CAP_PHONE_LIST} onEdit={() => {}} onSell={() => {}} accounts={(s) => (s === "AAA" ? "30 in Main account · 20 in Second broker" : null)} />);
    expect(within(screen.getByRole("group", { name: "Sort the list" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Value", "Today", "Gain or loss", "Prism"]);
    expect([...document.querySelectorAll(".eqp-sym")].map((b) => b.textContent)).toEqual(["AAA", "CCC", "BBB"]);         // by value
    const first = document.querySelector(".eqp-row")!.textContent!;
    expect(first).toMatch(/Alpha Gears Ltd · 50 shares/); expect(first).toContain("₹6,000"); expect(first).toContain("+₹800 · +15.4%"); expect(first).toMatch(/Prism 70/); expect(first).toContain("Rising");
    fireEvent.click(screen.getByRole("button", { name: "Gain or loss" })); expect([...document.querySelectorAll(".eqp-sym")].map((b) => b.textContent)[0]).toBe("AAA");
    fireEvent.click(document.querySelector(".eqp-row")!);
    const d = document.querySelector(".eqp-d")!.textContent!;
    expect(d).toContain("30 in Main account · 20 in Second broker"); expect(d).toContain("Technical view"); expect(d).toContain("Record a sale");
    expect(document.querySelector('.eqp-row .eqs-pct.flat')).toBeTruthy();                                                 // BBB −0.04% today reads 0.00%, grey
  });
});

// ------------------------------------------------------------------------------------------------ live bug 15, What changed, the other sections
describe("numbers and words in the other sections", () => {
  it("live bug 15: a change that rounds to zero prints 0.0% with no colour", () => { expect(pct(-0.04)).toBe("0.0%"); expect(tone(-0.04)).toBe(""); expect(pct(-2.61)).toBe("−2.6%"); });
  it("Against their peers: points in words, the line on points, short names", () => {
    wrap(<PeersSection shares={[sh("AAA", "Alpha Gears Ltd", { peer: { label: "leader", raw: null, rank: 1, of: 9, group: "Auto", vs: 46.6, bench: "NIFTY Auto", direction: null } }), sh("BBB", "Beta Motor Ltd", { peer: { label: "laggard", raw: null, rank: 9, of: 9, group: "Auto", vs: -5.5, bench: "NIFTY Auto", direction: "weakening" } })]} />);
    const t = document.body.textContent!;
    expect(t).toContain("Beat the Nifty Auto by 46.6 points over 12 months"); expect(t).toContain("Trailed the Nifty Auto by 5.5 points over 12 months · weakening lately");
    expect(t).toContain("Points are percentage points: the share’s 12-month return minus the return of the group or index it is compared with.");
    expect(t).not.toMatch(/\bpts\b/); expect(screen.getByRole("link", { name: "Alpha Gears" })).toBeTruthy();
  });
  it("In short: names, never share codes (the page passes the sentences through namesInText)", () => {
    const src = readFileSync(join(process.cwd(), "src/pages/Holdings.tsx"), "utf8");
    expect(src).toMatch(/text: namesInText\(r\.text, m\)/);
    wrap(<InShort items={[{ rule: "a", section: "together", priority: 1, text: "Alpha Gears and Beta Motor move together (0.62).", mode: "eq" }]} />);
    expect(screen.getByText("Alpha Gears and Beta Motor move together (0.62).")).toBeTruthy();
  });
  it("What changed (plain): 1 update / 4 updates, the line on updates, · N filings, short names, Not in Discover yet closed", async () => {
    const data = { days: 90, events: [], companies: [{ s: "AAA", n: "Alpha Gears Ltd", ev: { order: { n: 10, d: "2026-11-20", t: "Order received", l: null, dates: ["2026-11-20"] } } }], notPlaced: [{ s: "BBB", n: "Beta Motor Ltd" }] };
    vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response(JSON.stringify(String(u).includes("visits") ? { previous: null } : data), { status: 200, headers: { "content-type": "application/json" } })));
    await act(async () => { wrap(<WhatChanged title="What changed at your companies" symbols={["AAA", "BBB"]} listName="your shares" listRef="equity" page="equity-portfolio" plain shortName={(s, n) => (s === "AAA" ? "Alpha Gears" : n)} />); });
    await screen.findByText("Alpha Gears");
    expect(document.querySelector(".wc-tile.g")!.textContent).toMatch(/1update$/);
    expect(screen.getByText("An update is one kind of news from one company. Some bundle several filings; the row then says how many.")).toBeTruthy();
    expect(document.querySelector(".wc-k small")!.textContent).toBe(" · 10 filings");
    const np = document.querySelector("details.wc-np") as HTMLDetailsElement; expect(np.open).toBe(false); expect(np.querySelector("summary")!.textContent).toMatch(/^Not in Discover yet · 1/);
  });
});
