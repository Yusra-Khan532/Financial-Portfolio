// @vitest-environment jsdom
// Task #385 phase 2 (developer file 33, Risk view): plain-words beta, Risk at a glance's headline, measuring line, card line and the shares left out (open
// items 1, 3, 13), the weighting switch (open item 7), the shared Key figures, Overall for each size, the key and sorting of the risk split, Each share's risk
// in column groups sorting inside each size with 8 of a long group, the phone fold lines, unique i labels and no banned words. Made-up sample data only.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../../components/CoLogo", () => ({ CoLogo: () => null }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import type { RiskAnswer, RiskShare } from "../../lib/eqRisk";
import type { Share } from "../../lib/equityPack";
import { EachShareRisk, RiskShareSection, RiskView, SizeBench, riskSplit } from "./RiskPack";
import { cardLine, coverageLine, foldLines, glanceLede, measureLine, overallOf, pickBasis, riskKeyFigs } from "./risk385";
import { StepCtx } from "./EqSteps385";
import { PHONE_Q } from "../../components/PhoneFold";
import { bannedIn } from "../shared";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const view = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const KEYS = [["less", 0.65], ["defensive", 0.9], ["similar", 1.1], ["more", 1.35], ["high", 1.75], ["very_high", 9]] as const;
const band = (b: number) => { const k = KEYS.find(([, t]) => b < t)![0]; return { key: k, word: k === "defensive" ? "Defensive" : k }; };
const BENCH = { Large: "Nifty 50", Mid: "Nifty Midcap 150", Small: "Nifty Smallcap 250", Micro: "Nifty Microcap 250" } as const;
type Sz = keyof typeof BENCH;
const sh = (symbol: string, size: Sz, beta: number | null, x: Partial<RiskShare> = {}): RiskShare => ({ symbol, size, sector: "Industrials", benchmark: BENCH[size], beta, explained: beta == null ? null : 40,
  band: beta == null ? null : band(beta), why: beta == null ? "Under a year of prices" : null, swing: 24, worstFall: -30, years: 3, oneYear: 8, ...x });

/** A made-up answer: `n` shares spread over the sizes, each with its part of the list and of the ups and downs. */
function answer(shares: RiskShare[], basis: "value" | "equal" = "equal"): RiskAnswer {
  const counted = shares.filter((s) => s.beta != null), n = counted.length;
  const wt = (s: RiskShare) => (basis === "value" ? (s.symbol.length % 3) + 1 : 1), tot = counted.reduce((a, s) => a + wt(s), 0);
  const rtot = counted.reduce((a, s) => a + wt(s) * (s.beta as number), 0);
  const withParts = shares.map((s) => (s.beta == null ? { ...s, listShare: null, riskShare: null } : { ...s, listShare: (wt(s) / tot) * 100, riskShare: ((wt(s) * (s.beta as number)) / rtot) * 100 }));
  const sizes = (["Large", "Mid", "Small", "Micro"] as Sz[]).map((k) => { const xs = withParts.filter((s) => s.size === k && s.beta != null), ls = xs.reduce((a, s) => a + (s.listShare ?? 0), 0);
    const avg = xs.length ? xs.reduce((a, s) => a + (s.beta as number) * (s.listShare ?? 0), 0) / ls : null;
    return { size: k, benchmark: BENCH[k], n: xs.length, avgBeta: avg == null ? null : Math.round(avg * 100) / 100, band: avg == null ? null : band(avg), listShare: Math.round(ls * 10) / 10,
      adds: avg == null ? null : Math.round(avg * (ls / 100) * 100) / 100, oneYear: k === "Mid" ? -3 : 12, benchOneYear: 2, downPer100: k === "Large" ? 88 : k === "Mid" ? 83 : k === "Small" ? 105 : 104, upPer100: k === "Large" ? 120 : k === "Mid" ? 86 : k === "Small" ? 90 : 115 }; });
  const w = sizes.reduce((a, s) => a + (s.adds ?? 0), 0);
  return { to: "2026-11-20", from: "2025-11-21", counted: n, unknown: [], missingIndex: [], shares: withParts, sizes, basis,
    betas: { weighted: n ? Math.round(w * 100) / 100 : null, blended: n ? 1.2 : null, nifty: n ? 1.05 : null, weightedBand: n ? band(w) : null, blendedBand: band(1.2), niftyBand: band(1.05) },
    glance: { list: { swing: 21.4, worstFall: -19.2, grain: "weekly", years: 3 }, nifty: { swing: 13.9, worstFall: -14.6, grain: "weekly", years: 3 }, worst10: { list: -3.1, nifty: -2.6 }, weighted: w },
    ranges: KEYS.map(([k, t]) => ({ key: k, word: k === "defensive" ? "Defensive" : k, below: t === 9 ? null : t })) };
}
const NAMES: Record<string, string> = { ALPHA: "Alpha Motors", BETACO: "Betaco Finance", GAMMA: "Gamma Cables", DELTA: "Delta Power", EPSI: "Epsilon Foods", ZETA: "Zeta Labs", ETA: "Eta Steel", THETA: "Theta Tech" };
const nameOf = (s: string) => NAMES[s] ?? s;
const L13 = [sh("ALPHA", "Large", 1.72), sh("BETACO", "Large", 1.4), sh("GAMMA", "Large", 0.8), sh("DELTA", "Large", 1.1), sh("EPSI", "Mid", 1.0), sh("ZETA", "Small", 1.3),
  sh("ETA", "Micro", 1.2), sh("THETA", "Micro", 0.6), sh("IOTA", "Micro", 1.5), sh("KAPPA", "Micro", 1.25), sh("LAMBDA", "Large", 0.95), sh("MU", "Large", 1.05), sh("NEWCO", "Small", null, { years: 0.5 })];
const EQ = answer(L13), VAL = answer(L13, "value");
const BOTH: RiskAnswer = { ...EQ, byValue: VAL, noQuantity: [] };
const page = null;
const shares: Share[] = L13.map((s) => ({ symbol: s.symbol, name: nameOf(s.symbol) + " Ltd", industry: null, size: null, chg: null, prism: null, prismWord: null, valuation: null, risk: 70, st: null, lt: null, below52: 4, m1: 2 }) as unknown as Share);

describe("words and figures (risk385)", () => {
  it("Overall from the down-week and up-week figures, green or red only when both point the same way", () => {
    expect(overallOf(88, 162)).toEqual({ word: "Rises more, falls less", tone: "g" });
    expect(overallOf(105, 86)).toEqual({ word: "Rises less, falls more", tone: "r" });
    expect(overallOf(105, 115)).toEqual({ word: "Moves more both ways", tone: "n" });
    expect(overallOf(83, 86)).toEqual({ word: "Moves less both ways", tone: "n" });
    expect(overallOf(null, 90)).toBeNull();
  });
  it("the headline sentence measures each share against its own size index; one size reads in the singular", () => {
    expect(glanceLede(EQ, { name: "Nifty 50", swing: 13.9 }).rest).toBe(`Measuring each share against its own size index, the list has moved ${EQ.betas.weighted!.toFixed(2)}× as much as its markets, and over 3 years it has swung 21.4% in a typical year against 13.9% for the Nifty 50.`);
    const one = answer([sh("ALPHA", "Large", 1.72)]);
    expect(glanceLede(one, { name: "Nifty 50", swing: 13.9 }).lead).toBe("Your list moves more than its own market.");
  });
  it("names the shares left out of the beta and swing, and why (open item 3)", () => {
    const r = answer([...L13, sh("GHOST", "Small", null, { why: "No stored prices", swing: null, worstFall: null })]);
    expect(coverageLine(r, nameOf)).toBe("GHOST has no stored prices yet, so it is left out of the beta, the swing and the worst fall. NEWCO has under a year of prices: left out of the beta and the list's swing; its own swing shows in Each share's risk.");
    expect(coverageLine(answer([sh("ALPHA", "Large", 1.2)]), nameOf)).toBe("");
  });
  it("one measuring line with the end date, the list and the index measured alike (open item 1)", () => {
    expect(measureLine(VAL, "value", "Nifty 50")).toBe("How these are measured: each share by what you hold now · swing and worst fall: 3 years of weekly closes, the list and the Nifty 50 alike · moves with its markets and the 10 worst weeks: the past year of weekly closes · all to 20 Nov 2026 · 12 shares counted");
  });
  it("ties the four boxes to the Risk card, the card's figure named as the alternate (items 169, 13)", () => {
    const card = { beta: 1.08, swing: 21.2, worstFall: -18.9, byValue: true };
    expect(cardLine("equal", card)).toBe("These four hold equal amounts in each share. By what you hold now, as on the Risk card: moves 1.08× the Nifty 50, swings 21.2% in a typical year, worst fall −18.9%.");
    expect(cardLine("value", card)).toMatch(/^The Risk card reads the whole list against the Nifty 50 alone over the past year: moves 1\.08× .*the headline figure\.$/);
    expect(cardLine("value", null)).toBe("");
  });
  it("Key figures: three plain questions, what each size adds, and lists of one and two shares", () => {
    const sp = riskSplit(page, VAL, () => "Industrials");
    const k = riskKeyFigs(VAL, sp.bySize, nameOf, "value");
    expect(k.map((c) => c.q)).toEqual(["How much does your list move with the market?", "Where do the ups and downs come from?", "Which share moves most with the market?"]);
    expect(k[0]).toMatchObject({ big: `${VAL.betas.weighted!.toFixed(2)}×`, ans: "as much as its markets move" });
    expect(k[0].bar!.map((b) => `${b.label} ${b.shown}`)).toEqual(VAL.sizes.filter((s) => s.adds).map((s) => `${s.size} adds ${s.adds!.toFixed(2)}`));
    expect(k[2]).toMatchObject({ big: "1.72×", ans: "Alpha Motors", sub: "moves the most of your shares, against the Nifty 50" });
    expect(k[2].rows!.map((r) => r.label)).toEqual(["Alpha Motors", "IOTA", "Betaco Finance"]);
    expect(k[1].sub).toMatch(/^which are \d+% of the list$/);
    const one = answer([sh("ALPHA", "Large", 1.72)]), k1 = riskKeyFigs(one, riskSplit(page, one, () => "X").bySize, nameOf, "equal");
    expect([k1[1].big, k1[1].ans, k1[1].sub, k1[2].sub, k1[2].rows!.length]).toEqual(["100%", "from large companies", "which are 100% of the list", "against the Nifty 50", 1]);
    const two = answer([sh("ALPHA", "Large", 1.72), sh("ETA", "Micro", 0.7)]);
    expect(riskKeyFigs(two, riskSplit(page, two, () => "X").bySize, nameOf, "equal")[2].rows!.map((r) => r.label)).toEqual(["Alpha Motors", "Eta Steel"]);
    expect(bannedIn(JSON.stringify(k))).toEqual([]);
  });
  it("the folded lines of each section on a phone (rows 213–217)", () => {
    const sp = riskSplit(page, EQ, () => "Industrials"), f = foldLines(EQ, sp.bySize, nameOf);
    expect(f.build).toMatch(new RegExp(`^Moves ${EQ.betas.weighted!.toFixed(2)}× as much as its markets · (Similar|More sensitive|High)$`));
    expect(f.sizeb).toBe("Large: rises more, falls less · Mid: moves less both ways · Small: rises less, falls more · Micro: moves more both ways");
    expect(f.mr).toMatch(/^(Large|Mid|Small|Micro) companies: \d+\.\d% of the list, \d+\.\d% of the ups and downs$/);
    expect(f.fall).toBe(`Your list would fall about ${(Math.round(EQ.betas.weighted! * 100) / 10).toFixed(1)}% if the market fell 10%`);
    expect(f.each).toBe("Alpha Motors moves the most with its market: 1.72×");
  });
  it("reads the answer by what is held now when the server sent it, else equal amounts", () => {
    expect(pickBasis(BOTH, "value")).toEqual({ r: VAL, basis: "value" });
    expect(pickBasis(BOTH, "equal").basis).toBe("equal");
    expect(pickBasis(EQ, "value")).toEqual({ r: EQ, basis: "equal" });
  });
});

describe("the tables", () => {
  it("Each size: Yours and Index in the 1-year cell, Overall last, every column sorts", () => {
    view(<SizeBench r={EQ} />);
    const rows = () => Array.from(document.querySelectorAll(".eqr-sb tbody tr")).map((r) => r.querySelector("th b")!.textContent);
    expect(rows()).toEqual(["Large", "Mid", "Small", "Micro"]);
    expect(document.querySelector(".eqr-sb tbody tr td.r")!.textContent).toBe("Yours +12.0%Index +2.0%");
    expect(Array.from(document.querySelectorAll(".eqr-ov")).map((x) => `${x.textContent}:${x.className.split(" ")[1]}`)).toEqual(["Rises more, falls less:g", "Moves less both ways:n", "Rises less, falls more:r", "Moves more both ways:n"]);
    fireEvent.click(screen.getByRole("button", { name: /^In up weeks/ }));
    expect(rows()).toEqual(["Large", "Micro", "Small", "Mid"]);
    expect(screen.getByRole("button", { name: /^In up weeks/ }).closest("th")!.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(screen.getByRole("button", { name: /^Overall/ }));
    expect(rows()).toEqual(["Large", "Micro", "Mid", "Small"]);   // by rank, not by alphabet
    expect(document.querySelector(".eqr-sb")!.closest(".eqs-frz")).toBeTruthy();   // a phone keeps the first column (row 202)
  });
  it("Share of the list vs share of the risk: the key beside the switch, sorting, and 8 of a long list with Show all", () => {
    const many = answer(Array.from({ length: 14 }, (_, i) => sh(`S${String(i).padStart(2, "0")}`, i % 2 ? "Small" : "Large", 0.7 + i * 0.07)));
    view(<RiskShareSection r={many} split={riskSplit(page, many, (s) => `Sector ${s}`)} />);
    expect(document.querySelector(".eqr-key")!.textContent).toBe("Share of the listShare of the ups and downsCarries more than its share");
    fireEvent.click(screen.getByRole("button", { name: "By share" }));
    const firsts = () => Array.from(document.querySelectorAll(".eqr-rs tbody th b")).map((b) => b.textContent);
    expect(firsts()).toHaveLength(8);
    expect(firsts()[0]).toBe("S13");   // the most of the ups and downs first
    fireEvent.click(screen.getByRole("button", { name: "Show all 14 shares" }));
    expect(firsts()).toHaveLength(14);
    fireEvent.click(screen.getByRole("button", { name: /^Share/ }));
    expect(firsts().slice(0, 3)).toEqual(["S00", "S01", "S02"]);   // text A to Z on the first click
    fireEvent.click(screen.getByRole("button", { name: "By sector" }));
    expect(screen.getByRole("button", { name: "Show all 14 macro sectors" })).toBeTruthy();
  });
  it("Each share's risk: column groups, a group row per size, Share A to Z first, every column sorting inside each size, 8 of a long group", () => {
    const big = answer([...Array.from({ length: 12 }, (_, i) => sh(`LG${String(11 - i).padStart(2, "0")}`, "Large", 0.8 + i * 0.05)), sh("MIDA", "Mid", 1.1), sh("MIDB", "Mid", 1.4)]);
    view(<EachShareRisk r={big} split={riskSplit(page, big, () => "X")} shares={[]} gold />);
    expect(Array.from(document.querySelectorAll(".eqr-thg th[scope=colgroup]")).map((t) => t.textContent)).toEqual(["Against its size index · past year", "Over 3 years", "Price"]);
    expect(document.querySelector(".eqr-each col.c11")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    const names = (k: string) => Array.from(document.querySelectorAll(`#eqr-each-${k} tr.eqr-er td:first-child b`)).map((b) => b.textContent);
    expect(names("Large")).toEqual(["LG00", "LG01", "LG02", "LG03", "LG04", "LG05", "LG06", "LG07"]);
    expect(names("Mid")).toEqual(["MIDA", "MIDB"]);
    fireEvent.click(screen.getByRole("button", { name: "Show all 12 large companies" }));
    expect(names("Large")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: /^Moves with its index/ }));
    expect(names("Large")[0]).toBe("LG00");   // highest first: LG00 has the highest figure
    expect(names("Mid")).toEqual(["MIDB", "MIDA"]);   // sorted inside its own group
    expect(document.querySelector(".eqr-each th[aria-sort=descending]")!.textContent).toMatch(/^Moves with its index▼/);
    expect(screen.getByText("higher = safer")).toBeTruthy();
    const groupRow = document.querySelector("#eqr-each-Mid .eqr-g button")!;
    expect(Array.from(groupRow.querySelectorAll(".t")).map((t) => t.textContent)).toEqual(["2 shares", "against Nifty Midcap 150", "on average 1.25× its index, more sensitive", "16% of the risk"]);
    expect(groupRow.querySelector(".h")!.textContent).toBe("Hide");
    fireEvent.click(groupRow);
    expect(names("Mid")).toEqual([]);
  });
});

describe("the whole Risk view", () => {
  const card = { beta: 1.08, swing: 21.2, worstFall: -18.9, byValue: true };
  const all = (ui: React.ReactNode) => view(<StepCtx.Provider value={{ step: "all", firstStep: "eq-rg" }}>{ui}</StepCtx.Provider>);
  it("opens by what you hold now, switches to equal amounts, and every i has its own label", () => {
    all(<RiskView answer={BOTH} page={page} sectorOf={() => "Industrials"} shares={shares} gold value={{ now: 500000 }} card={card} nameOf={nameOf} />);
    const sw = within(document.querySelector(".eqr-basis") as HTMLElement);
    expect(sw.getByRole("button", { name: "By what you hold now" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".eqr-meas")!.textContent).toMatch(/^How these are measured: each share by what you hold now/);
    expect(screen.getByText(/^The Risk card reads the whole list against the Nifty 50 alone/)).toBeTruthy();
    expect(document.querySelector(".eqkf-big b")!.textContent).toBe(`${VAL.betas.weighted!.toFixed(2)}×`);
    fireEvent.click(sw.getByRole("button", { name: "Equal amounts" }));
    expect(document.querySelector(".eqkf-big b")!.textContent).toBe(`${EQ.betas.weighted!.toFixed(2)}×`);
    expect(screen.getByText(/^These four hold equal amounts in each share\. By what you hold now, as on the Risk card/)).toBeTruthy();
    expect(Array.from(document.querySelectorAll(".eqr-tile .sp-cap")).slice(0, 4).map((x) => x.firstChild!.textContent!.trim())).toEqual(["Typical swing in a year", "Worst fall from a high", "In the 10 worst weeks", "Moves with its markets"]);
    const labels = Array.from(document.querySelectorAll("button[aria-label^='About']")).map((b) => b.getAttribute("aria-label"));
    expect(labels.length).toBeGreaterThan(25);
    expect(new Set(labels).size).toBe(labels.length);
    const text = document.body.textContent ?? "";
    expect(bannedIn(text)).toEqual([]);
    expect(text).not.toMatch(/\bbeta \d|Size-weighted beta/);
  });
  it("without a quantity for every share, Equal amounts is the only basis and the page says why", () => {
    all(<RiskView answer={{ ...EQ, noQuantity: ["ALPHA"] }} page={page} sectorOf={() => "Industrials"} shares={shares} gold={false} value={null} card={null} nameOf={nameOf} />);
    expect(screen.getByRole("button", { name: "By what you hold now" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("1 share without a quantity (Alpha Motors), so every share counts the same.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Equal amounts" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".eqr-each col.c11")).toBeNull();   // Silver: ten columns, no Prism Risk
  });
  it("on a phone with All sections, each section after the first folds to its own summary line", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === PHONE_Q, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    all(<RiskView answer={BOTH} page={page} sectorOf={() => "Industrials"} shares={shares} gold value={null} card={card} nameOf={nameOf} />);
    const lines = Array.from(document.querySelectorAll(".eqf-sum .s")).map((s) => s.textContent);
    expect(lines).toHaveLength(6);
    expect(lines[1]).toMatch(/^Moves \d\.\d\d× as much as its markets · (Similar|More sensitive|High|Less sensitive|Much less sensitive|Very high)$/);
    expect(lines[2]).toMatch(/^Large: rises more, falls less · Mid: moves less both ways · /);
    expect(lines[5]).toBe("Alpha Motors moves the most with its market: 1.72×");
  });
});
