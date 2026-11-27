// @vitest-environment jsdom
// Task #135 (dashboard pack 06): insight cards open and close, "Open all", company chips, the investments table's rows and readings, the fund panel's figures,
// and the shares panel in band words (no "70+" or "50–69").
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { DashCards, DashCardsProvider, OpenAll } from "./DashCards";
import { bandLine } from "./Portfolio";
import type { Card } from "../../lib/pulsePack";
import { healthText, byMove, investLine, investRows, mfGlance, fundBandLine, navText, orderType, type InvRow } from "../../lib/dashInvest";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* jsdom */ } });

const CARDS: Card[] = [
  { kind: "good", title: "Profit grew at 36 of the 42 that reported", text: "September-quarter profit was higher than a year ago everywhere except TCS (−4.0%).",
    groups: [{ label: "Profit fell, against a year ago · 1", tone: "down", chips: [{ symbol: "TCS", label: "TCS", note: "−4.0%" }] }] },
  { kind: "insight", title: "16 lead their peers, 11 lag", text: "INFY lead; WIPRO lag.", note: "8 are not ranked: too new, or too thinly traded to compare fairly.",
    groups: [{ label: "Lead · 1", tone: "up", chips: [{ symbol: "INFY", label: "INFY" }] }, { label: "Lag · 1", tone: "down", chips: [{ symbol: "WIPRO", label: "WIPRO" }] }] },
];
const show = (user = 7) => render(<MemoryRouter><DashCardsProvider userId={user}><OpenAll scope="say" n={CARDS.length} /><DashCards items={CARDS} scope="say" /></DashCardsProvider></MemoryRouter>);
const row = (name: RegExp) => screen.getByRole("button", { name });

describe("insight cards open and close (task #135)", () => {
  it("are closed by default: one row with the icon, the label and the headline; the row is one button", () => {
    show();
    const b = row(/Good sign.*Profit grew at 36 of the 42/);
    expect(b.tagName).toBe("BUTTON");                                                   // Enter and Space open it, as any button
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect((screen.getByText(/higher than a year ago everywhere/).closest(".dsh-ic-body") as HTMLElement).hidden).toBe(true);   // the body is hidden
  });
  it("open with a tap: the full sentence, the names as chips that open each company report, Lead green and Lag red, the note", () => {
    show();
    fireEvent.click(row(/Insight.*16 lead their peers/));
    expect(row(/Insight/).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("INFY lead; WIPRO lag.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /INFY/ }).getAttribute("href")).toBe("/stocks/INFY");
    expect(screen.getByText("Lead · 1").closest(".dsh-ic-g")!.className).toContain("up");
    expect(screen.getByText("Lag · 1").closest(".dsh-ic-g")!.className).toContain("down");
    expect(screen.getByText("8 are not ranked: too new, or too thinly traded to compare fairly.")).toBeTruthy();
    expect(row(/Good sign/).getAttribute("aria-expanded")).toBe("false");               // its neighbour stays closed
  });
  it("Open all opens every card in the section and turns into Close all", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Close all" }));
    expect(screen.queryAllByRole("button", { expanded: true })).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Open all" })).toBeTruthy();
  });
  it("remembers which cards a member opened, for that member, until they close them", () => {
    show(7);
    fireEvent.click(row(/Good sign/));
    cleanup(); show(7);
    expect(row(/Good sign/).getAttribute("aria-expanded")).toBe("true");
    cleanup(); show(8);
    expect(row(/Good sign/).getAttribute("aria-expanded")).toBe("false");               // another member starts closed
  });
});

const r = (o: Partial<InvRow>): InvRow => ({ key: o.kind + ":" + o.name, kind: "share", name: "X", sub: "", href: "/", alertHref: "/", price: 1, day: 0, y1: 0, value: null, ...o } as InvRow);
describe("Your investments today: rows and readings (task #135)", () => {
  it("lists held shares, then mutual funds, ETFs and the watchlist; largest first when every quantity is known, else A to Z", () => {
    const rows = investRows({
      shares: [r({ symbol: "B", name: "Bee", value: 100 }), r({ symbol: "A", name: "Ant", value: 900 })],
      funds: [r({ kind: "mf", name: "Zeta Fund", value: null }), r({ kind: "mf", name: "Alpha Fund", value: 50 })],
      etfs: [],
      watch: [r({ kind: "watch", symbol: "C", name: "Cat" }), r({ kind: "watch", symbol: "B", name: "Bee" })],
    });
    expect(rows.map((x) => x.name)).toEqual(["Ant", "Bee", "Alpha Fund", "Zeta Fund", "Cat"]);   // a held share on the watchlist is listed once, as held
    expect(orderType([r({ name: "b", value: 1 }), r({ name: "a", value: 2 })]).map((x) => x.name)).toEqual(["a", "b"]);
  });
  it("reads a fund by its Mutual Fund Score and an ETF by its price against NAV; a blank says why", () => {
    expect(healthText({ score: 60, label: "Average", locked: false })).toEqual({ text: "Health 60 · Average", band: "o" });
    expect(healthText({ score: null, label: null, locked: true }).text).toBe("Mutual Fund Score: Gold");
    expect(healthText({ score: null, label: null, locked: false, why: "Too new" })).toMatchObject({ text: "Not scored yet", title: "Too new" });
    expect([navText(-0.12), navText(0.18), navText(0), navText(null), navText(-0.134)]).toEqual(["−0.12% vs NAV", "+0.18% vs NAV", "0.00% vs NAV", "—", "−0.13% vs NAV"]);   // task #223: the pack writes "−0.13% vs NAV"
    expect(investLine(18, ["investment", "investments"], "Friday", "13 Nov", true)).toBe("18 investments · biggest moves on Friday first · prices and NAVs of 13 Nov");   // task #195
    expect(investLine(1, ["stock", "stocks"], "Today", null, false)).toBe("1 stock · biggest moves today first");
  });
  it("sorts by the size of the last day's move, a fall as big as a rise, rows with no move last (task #195)", () => {
    expect(byMove([r({ name: "a", day: 0.5 }), r({ name: "b", day: -4.1 }), r({ name: "c", day: null }), r({ name: "d", day: 2.67 }), r({ name: "e", day: -0.69 })]).map((x) => x.name)).toEqual(["b", "d", "e", "a", "c"]);
  });
});

describe("the at a glance panels (task #135)", () => {
  it("the shares panel names its bands; no cut-offs", () => {
    const t = bandLine({ g: 6, o: 6, r: 2, n: 0 });
    expect(t).toBe("6 strong or healthy · 6 average · 2 weak or poor");
    expect(t).not.toMatch(/70|50/);
  });
  it("the funds panel: band split, value-weighted 1-year change and the lowest-scoring fund with its two weakest parts", () => {
    const f = (code: number, name: string, score: number, label: string, weight: number, r1y: number, parts: Record<string, number>) => ({ code, name, score, label, weight, r1y, locked: false, parts });
    const g = mfGlance([f(1, "Parag Parikh Flexi Cap Fund", 60, "Average", 0.5, 10, {}), f(2, "ICICI Prudential FMCG Fund", 29, "Poor", 0.25, -6, { performance: 20, risk: 40, cost: 10, quality: 50 }),
      f(3, "UTI Nifty 50 Index Fund", 66, "Healthy", 0.25, 2, {})], { value: 52, label: "Average", locked: false });
    expect(fundBandLine(g.bands)).toBe("1 healthy · 1 average · 1 poor");
    expect(g.r1y).toBe(4);                                                                // 0.5×10 + 0.25×(−6) + 0.25×2
    expect(g.weakest).toEqual({ name: "ICICI Prudential FMCG Fund", score: 29, label: "Poor", parts: ["cost", "performance"] });
    expect(mfGlance([], { value: null, label: null, locked: true }).locked).toBe(true);
  });
});

describe("the chips row of a card", () => {
  it("each chip is a link to its company report", () => {
    show();
    fireEvent.click(row(/Good sign/));
    const g = screen.getByText("Profit fell, against a year ago · 1").closest(".dsh-ic-g") as HTMLElement;
    expect(within(g).getByRole("link", { name: /TCS/ }).getAttribute("href")).toBe("/stocks/TCS");
    expect(within(g).getByRole("link", { name: /TCS/ }).textContent).toContain("−4.0%");
  });
});
