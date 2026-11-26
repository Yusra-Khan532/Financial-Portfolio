// @vitest-environment jsdom
// Task #391 PR A (developer file 35, All my investments, 24 Nov updated 25 Nov): the calm top, one stop at a time, the plain words. Each test names the
// checklist line it proves. The list is the repo's made-up sample (sample-qty.json) with made-up company names; no member's figures.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AllInvestments } from "../lib/myInvest";
import QTY from "./sample-qty.json";

const st = vi.hoisted(() => ({ plan: "gold" as "silver" | "gold", answer: null as unknown, user: null as null | { id: string }, visit: null as string | null, changes: null as unknown, phone: false }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: st.user }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiSend: vi.fn(async (_m: string, p: string) => (p === "/api/me/all-investments" ? st.answer : p.startsWith("/api/visits/") ? { previous: st.visit } : {})),
  apiGet: vi.fn(async (p: string) => (p.startsWith("/api/discovery/changes") ? st.changes : { holdings: [] })) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: (p: string) => (p === "gold" ? st.plan === "gold" : true), upgrade: vi.fn(), toast: vi.fn() }), TIER: { silver: { name: "Silver" }, gold: { name: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { portfolio } from "../lib/portfolio";
import { MyInvestmentsPage } from "../pages/MyInvestments";
import { MI_STEPS, asOfParts, coLabel, miSince, moneyNote, miStepFromParam, miStepParam, movesX, riskSays, riskWord, sectorsCaption, swingWindows, viewCard } from "../lib/mi391";
import { moneyByKind } from "../lib/myInvest";
import { fallFigures, MarketFall } from "../portfolio/pack/MarketFall";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = vi.fn();
/** The made-up sample with two made-up company names in the fund files' raw style. */
const D = () => {
  const d = structuredClone(QTY) as unknown as AllInvestments;
  const a = d.companies.find((c) => c.symbol === "ICICIBANK")!; a.symbol = "KONKANBK"; a.name = "Bank Of Konkan";
  const b = d.companies.find((c) => c.symbol === "KPITTECH")!; b.name = "Sahyadri Peripherals Ltd";
  d.shares.find((s) => s.symbol === "KPITTECH")!.name = "Sahyadri Peripherals Ltd";
  return d;
};
const mount = (path = "/my-investments") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><MyInvestmentsPage /></MemoryRouter></QueryClientProvider>);
const text = () => document.body.textContent ?? "";
const chips = () => [...document.querySelectorAll(".stb-chip")];
beforeEach(() => {
  st.plan = "gold"; st.answer = D(); st.user = null; st.visit = null; st.phone = false;
  st.changes = { days: 90, events: [], notPlaced: [], companies: [] };
  localStorage.clear(); portfolio.reset(); portfolio.add({ symbol: "HDFCBANK", qty: 40, price: 0, owned: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (q: string) => ({ matches: st.phone && /max-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} }) });
});
afterEach(cleanup);

describe("S1–S6, U1–U3, F5, R8, R9: seven numbered stops, one at a time", () => {
  it("the address: no step = stop 1, step=all = All sections, kf opens stop 1, unknown opens stop 1", () => {
    expect(miStepFromParam(null)).toBe("mi-money");
    expect(miStepFromParam("all")).toBe("all");
    expect(miStepFromParam("kf")).toBe("mi-money");
    expect(miStepFromParam("changed")).toBe("what-changed");
    expect(miStepFromParam("risk")).toBe("mi-risk");
    expect(miStepFromParam("nonsense")).toBe("mi-money");
    expect(MI_STEPS.map((s) => miStepParam(s.id))).toEqual(["money", "made", "sectors", "every", "changed", "health", "risk"]);
    expect(MI_STEPS.map((s) => `${s.n} ${s.label}`)).toEqual(["1 Your money", "2 Made of", "3 Sectors and sizes", "4 Every company", "5 What changed", "6 Health", "7 Risk"]);
  });
  it("the page opens on stop 1 only, with Key figures inside it; a stop shows that section only; All sections shows them all", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect(screen.getByRole("heading", { name: "Key figures" })).toBeTruthy();
    expect(text()).not.toContain("What it is made of");
    expect(chips()[0].getAttribute("aria-current")).toBe("step");
    expect(chips().map((c) => c.querySelector(".stb-n")!.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    fireEvent.click(chips()[6]);
    await screen.findByText("How risky it is, all together");
    expect(text()).not.toContain("Where your money sits");
    expect(chips()[6].getAttribute("aria-current")).toBe("step");
    fireEvent.click(screen.getByRole("button", { name: /^All sections$/ }));
    await screen.findByText("What it is made of");
    expect(screen.getByRole("button", { name: /^All sections$/ }).getAttribute("aria-pressed")).toBe("true");
    for (const h of ["Where your money sits", "Key figures", "What it is made of", "How healthy it is", "How risky it is, all together"]) expect(text()).toContain(h);
  });
  it("the step labels inside the sections follow the bar: Step 6 How healthy it is, Step 7 How risky it is; See Step 7 →", async () => {
    mount("/my-investments?step=all"); await screen.findByText("How healthy it is");
    const label = (id: string) => document.getElementById(id)!.querySelector(".mi-eyebrow")!.textContent;
    expect([label("mi-money"), label("mi-made"), label("mi-sectors"), label("mi-every"), label("mi-health"), label("mi-risk")]).toEqual(["Step 1", "Step 2", "Step 3", "Step 4", "Step 6", "Step 7"]);
    expect(document.getElementById("mi-health")!.querySelector(".mi-sh-n")!.textContent).toBe("6");
    expect(screen.getByRole("button", { name: "See Step 7 →" })).toBeTruthy();
  });
  it("R9: the member's last stop is remembered; an address with a step wins", async () => {
    st.user = { id: "u1" };
    mount("/my-investments?step=health"); await screen.findByText("How healthy it is");
    expect(localStorage.getItem("finlit-my-investments-step:u1")).toBe("mi-health");
    cleanup(); mount(); await screen.findByText("How healthy it is");
    expect(text()).not.toContain("Where your money sits");
    cleanup(); mount("/my-investments?step=made"); await screen.findByText("What it is made of");
    expect(text()).not.toContain("How healthy it is");
    fireEvent.click(chips()[0]); await screen.findByText("Where your money sits");
    cleanup(); mount(); await screen.findByText("Where your money sits");   // stop 1 chosen last: stop 1 opens
    expect(text()).not.toContain("What it is made of");
  });
  it("a Key figures link opens the stop that holds its section", async () => {
    mount(); await screen.findByText("Where your money sits");
    fireEvent.click(screen.getByRole("button", { name: "See Step 7 →" }));
    await screen.findByText("How risky it is, all together");
    expect(chips()[6].getAttribute("aria-current")).toBe("step");
  });
  it("the selected stop is black with a white number (CSS, scoped to the page)", () => {
    const css = readFileSync(join(__dirname, "../styles/mi391.css"), "utf8");
    expect(css).toMatch(/\.mi \.stb-one \.stb-chip\[aria-current="step"\][^{]*\{ background: var\(--text\) !important; color: var\(--s1\) !important;/);
    expect(css).toMatch(/\.mi \.stb-one \.stb-chip\[aria-current="step"\] \.stb-n \{ background: var\(--s1\); color: var\(--text\); \}/);
    for (const m of css.matchAll(/font:\s*\d+\s+var\(--fs-(\d+)\)/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12);
    for (const sel of css.split("}").map((r) => r.split("{")[0].trim()).filter((x) => x && !x.startsWith("@") && !x.startsWith("/*")))
      for (const part of sel.split(",")) expect(part.trim()).toMatch(/^(html\.mi7-rowup )?(\.wrap)?\.mi /);
  });
});

describe("Top: four calm cards, Since your last visit, Data as of, the money box", () => {
  it("T2–T5: the cards' words", () => {
    const d = D();
    expect(viewCard("all", d)).toMatchObject({ k: "All together", x: "6 shares · 3 funds · 3 ETFs" });
    expect(viewCard("equity", d).v).toBe("Prism 57 · moves 1.18×");
    expect(viewCard("mf", d)).toMatchObject({ v: "Mutual Fund Score 66 · Average", x: "3 funds · moves 0.71× the Nifty 500" });
    expect(viewCard("etf", d).v).toBe("0.31% a year · moves 0.86×");
    const n = D(); n.byValue = false; n.missing = ["shares", "funds", "etfs"];
    const e = D(); e.byValue = false; e.missing = ["etfs"];
    expect(viewCard("all", e).x).toBe("6 shares · 3 funds · 3 ETFs; ETFs ⅓ until you add quantities");
    expect(viewCard("all", n)).toMatchObject({ v: "12 holdings", x: "6 shares · 3 funds · 3 ETFs, ⅓ each until you add quantities" });
    expect(movesX(null)).toBeNull();
  });
  it("T6, T6b: Since your last visit, with 0, 1 and N new, and before any visit", () => {
    expect(miSince("23 Nov", 1)).toEqual({ lead: "Since your last visit on 23 Nov:", rest: "1 new filing at companies you own." });
    expect(miSince("23 Nov", 4).rest).toBe("4 new filings at companies you own.");
    expect(miSince("23 Nov", 0).rest).toBe("nothing new at the companies you own.");
    expect(miSince(null, 0).lead).toBe("Since your last visit:");
  });
  it("T6: the line sits under the cards and See what changed → opens stop 5", async () => {
    st.user = { id: "u2" }; st.visit = "2026-11-12T09:00:00+00:00";
    st.changes = { days: 90, events: [], notPlaced: [], companies: [{ s: "HDFCBANK", n: "HDFC Bank", ev: { rating: { n: 1, d: "2026-11-14", t: "Rating", l: "https://x", dates: ["2026-11-14"] } } }] };
    mount(); await screen.findByText("Where your money sits");
    await waitFor(() => expect(document.querySelector(".mi391-since")?.textContent).toContain("Since your last visit on 12 Nov: 1 new filing at companies you own."));
    expect(document.querySelector(".mi391-since")!.previousElementSibling!.id).toBe("mi-tabs");   // under the cards
    fireEvent.click(screen.getByRole("button", { name: "See what changed →" }));
    await screen.findByRole("heading", { name: /^What changed at the companies you own/ });
    expect(chips()[4].getAttribute("aria-current")).toBe("step");
  });
  it("T7: Data as of under the section bar", async () => {
    // developer file 41 v4 (A1): the sample's funds are on the NAV of 13 Nov, its shares and ETFs on the close of 14 Nov, so Data as of says each
    expect(asOfParts(D(), 90)).toEqual([["Prices", "Shares and ETFs close of 14 Nov · funds NAV 13 Nov"], ["Fund and ETF holdings", "each file of 31 Oct 2026"], ["Filings", "the last 90 days"], ["Risk", "weekly prices, past year"]]);
    mount(); await screen.findByText("Where your money sits");
    const p = document.querySelector(".mi391-asof")!;
    expect(p.previousElementSibling!.className).toContain("stb-wrap");
    expect(p.textContent).toBe("Data as ofPrices Shares and ETFs close of 14 Nov · funds NAV 13 Nov·Fund and ETF holdings each file of 31 Oct 2026·Filings the last 90 days·Risk weekly prices, past year");
  });
  it("T8, F3, F4: the big figure covers the holdings with a buy price; every holding with a quantity on its own line; the note in three sentences", async () => {
    const d = D(); d.byValue = false; d.missing = ["shares", "funds", "etfs"];
    // a made-up split: 2 shares with buys (HDFCBANK, INFY), every other holding with a quantity but no buy price
    portfolio.reset(); portfolio.add({ symbol: "HDFCBANK", qty: 40, price: 1500, owned: true }); portfolio.add({ symbol: "INFY", qty: 10, price: 1400, owned: true });
    d.funds = d.funds.map((f) => ({ ...f, invested: null })); d.etfs = d.etfs.map((e) => ({ ...e, invested: null }));
    const m = moneyByKind(d, portfolio.get().holdings).all;
    expect(m.full).toBe(2); expect(m.withQty).toBe(12);
    expect(m.nowPriced).toBeCloseTo(d.shares.filter((s) => ["HDFCBANK", "INFY"].includes(s.symbol)).reduce((a, s) => a + s.qty! * s.price!, 0), 2);
    expect(m.gain).toBeCloseTo(m.nowPriced - m.invested, 2);
    st.answer = d; mount(); await screen.findByText("Where your money sits");
    const box = screen.getByRole("region", { name: "All your investments" });
    expect(box.querySelector(".mi7-big small")!.textContent).toBe("value now, of the 2 with a buy price");
    expect(box.querySelector(".mi391-allv")!.textContent).toMatch(/^Value now of all 12 with a quantity₹/);
    expect(box.querySelector(".mi7-cov p")!.textContent).toBe("Money figures cover 2 of 12 holdings. Only HDFC Bank and Infosys have a quantity and buy price. The other 10 count in every reading but not in the money. For now each kind counts as ⅓. Add quantities");
  });
  it("the last sentence goes once each kind counts by value (fault 1 built)", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect(text()).not.toContain("For now each kind counts as");
  });
});

describe("Sections: names, Key figures questions, What changed, risk words, plans", () => {
  it("C1, C1b, X12–X14: company name first, share code under it; Of → of; no Ltd", async () => {
    expect(coLabel({ symbol: "KONKANBK", name: "Bank Of Konkan" })).toBe("Bank of Konkan");
    expect(coLabel({ symbol: "KPITTECH", name: "Sahyadri Peripherals Ltd" })).toBe("Sahyadri Peripherals");
    expect(coLabel({ symbol: "ABC", name: null })).toBe("ABC");
    mount("/my-investments?step=every"); await screen.findByText("Every company you own, counted once");
    const row = [...document.querySelectorAll(".mi-co tbody th")].find((t) => t.textContent!.includes("Bank of Konkan"))!;
    expect(row.querySelector("b")!.textContent).toBe("Bank of Konkan");
    expect(row.querySelector("small")!.textContent).toMatch(/^KONKANBK · /);
    expect(document.querySelector(".mi-co")!.textContent).not.toContain("Bank Of Konkan");
  });
  it("X14: the largest holding by its short name; C2: names in Key figures and In short", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect(document.querySelector(".mi-tb tbody tr td:nth-last-child(2)")!.textContent).toBe("Sahyadri Peripherals");
    expect(document.getElementById("mi-kf")!.textContent).not.toMatch(/\bKPITTECH\b|\bHDFCBANK\b/);
    expect(document.querySelector(".mi-short")!.textContent).toContain("led by HDFC Bank");
  });
  it("C3: each Key figures card opens with its numbered question; the bold answer stays", async () => {
    mount(); await screen.findByText("Where your money sits");
    const q = [...document.querySelectorAll("#mi-kf .mi391-kq")].map((x) => x.textContent);
    expect(q).toEqual(["1How many companies do you hold more than one way?", "2Which company is the biggest part of everything?", "3Which kind brings the most market risk?"]);
    expect(document.querySelectorAll("#mi-kf .mi7-kfsay b")).toHaveLength(3);
    expect(document.getElementById("mi-kf")!.textContent).not.toMatch(/ and \S+ and /);   // "A, B and C", never "A and B and C"
  });
  it("C4–C4e: What changed counts updates and filings, short names, a closed Not in Discover yet list and the note", async () => {
    st.changes = { days: 90, events: [], notPlaced: [{ s: "TITAN", n: "Titan Company Ltd" }], companies: [{ s: "KPITTECH", n: "Sahyadri Peripherals Ltd", ev: { rating: { n: 10, d: "2026-11-14", t: "Rating", l: "https://x", dates: ["2026-11-14"] } } }] };
    mount("/my-investments?step=changed"); await screen.findByRole("heading", { name: /^What changed at the companies you own/ });
    await screen.findByRole("link", { name: "Sahyadri Peripherals" });
    expect(document.querySelector(".wc-tile .wc-unit")!.textContent).toMatch(/updates?/);
    expect(document.querySelector(".wc-k small")!.textContent).toBe(" · 10 filings");
    expect(screen.getByText("An update is one kind of news from one company. Some bundle several filings; the row then says how many.")).toBeTruthy();
    expect((document.querySelector(".wc-np") as HTMLDetailsElement).open).toBe(false);
  });
  it("C5, X8, X9: the six ranges in one helper; old and new server words read the same", () => {
    expect(riskWord("Defensive", 0.75)).toBe("Less sensitive");
    expect(riskWord("Less sensitive", 0.58)).toBe("Much less sensitive");
    expect(riskWord("Less sensitive", 0.75)).toBe("Less sensitive");       // PR B's new word for 0.65–0.90
    expect(riskWord("Much less sensitive", 0.58)).toBe("Much less sensitive");
    expect(riskWord("Similar", 1)).toBe("Similar");
    expect(riskWord("whatever", 0.7, "defensive")).toBe("Less sensitive");   // PR B's key wins
    expect(riskSays("Defensive: moves a little less than the market.", "Defensive", 0.8)).toBe("Less sensitive: moves a little less than the market.");
  });
  it("C5, C5b, C5c, C6, C7, F8, F12, I2: How risky it is", async () => {
    const d = D(); d.risk.parts = d.risk.parts.map((p) => ({ ...p, band: p.kind === "etfs" ? "Less sensitive" : p.band }));
    d.risk.parts.find((p) => p.kind === "etfs")!.beta = 0.58;
    st.answer = d; mount("/my-investments?step=risk"); await screen.findByText("How risky it is, all together");
    const sec = document.getElementById("mi-risk")!.closest("section")!;
    expect([...sec.querySelectorAll(".mi-chip")].map((c) => c.textContent)).toEqual(["More sensitive", "Less sensitive", "Much less sensitive"]);
    expect(sec.textContent).toContain("Together it moves 0.91× as much as the Nifty 500.");
    expect(sec.textContent).not.toMatch(/Defensive|\bpts\b|Together Beta/);
    expect(sec.textContent).toMatch(/0\.9 points less than the Nifty 500’s 10%/);
    // fault 9: one line, the long note behind an i of its own
    const note = sec.querySelector(".mi391-rnote")!;
    expect(note.firstChild!.textContent).toBe("Swing and worst fall are each kind’s own figure, as on its portfolio page.");
    expect(note.querySelector("button.info")!.getAttribute("aria-label")).toBe("What is swing and worst fall here?");
    expect(sec.textContent!.split("Swing and worst fall are each kind").length - 1).toBe(1);   // said once, not repeated
    // fault 8: no Hide on the fall chart; the page's i
    const fall = document.getElementById("mi-fall")!.closest("section")!;
    expect(within(fall).queryByRole("button", { name: /^Hide/ })).toBeNull();
    expect(fall.querySelector("h2 button.info")!.getAttribute("aria-label")).toBe("What is the fall picture?");
    expect(fall.querySelector(".sp-i")).toBeNull();
    // fault 12: the windows in the column header
    expect(sec.querySelector(".mi391-win")!.textContent).toBe("Shares weekly, 2 years · funds and ETFs daily, 3 years");
    expect(sec.querySelector("tbody")!.textContent).not.toMatch(/\(\d\.\d y\)/);
  });
  it("F12: PR B's window field wins when present", () => {
    expect(swingWindows(["shares", "funds"], { shares: { beta: 1, swing: 10, worstFall: -5, years: 2, why: null, swingWindow: "daily, 3 years" }, funds: { beta: 1, swing: 9, worstFall: -5, years: 3, why: null } })).toBe("Shares and funds daily, 3 years");
  });
  it("C7: MarketFall keeps its Hide and plain i on the other pages (default unchanged)", () => {
    const P = { id: "x-fall", scenarios: [{ label: "All", beta: 1.1, src: "s", parts: false }], parts: [], value: null };
    render(<MemoryRouter><MarketFall {...P} /></MemoryRouter>);
    expect(screen.getAllByRole("button", { name: /Hide/ }).length).toBeGreaterThan(0);
    expect(fallFigures(P, 10, 0).chip!.text).toBe("1.0 pts more than the market’s 10%");
  });
  it("F6: 12 macro sectors and shares listed abroad", () => {
    expect(sectorsCaption(12, 13)).toBe("12 macro sectors and shares listed abroad");
    expect(sectorsCaption(12, 12)).toBe("Macro sectors · 12");
  });
  it("C8, C9, F11: the plan names come from the plan list; the page's gate is unchanged", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect(text()).toContain("This page is in Silver and Gold: your shares, mutual funds and ETFs together. On Gold the shares are read with FinLit Prism");
    expect(text()).not.toMatch(/Silver: your shares/);
  });
});

describe("U4–U8: things to know as a pop-up; the filter row under the section bar", () => {
  it("each section with notes has a pill at its heading with one dot per note; it opens a pop-up with Open all and ×; Esc closes; one at a time", async () => {
    mount("/my-investments?step=all"); await screen.findByText("What it is made of");
    expect(document.querySelector(".mi-notes")).toBeNull();
    const made = document.getElementById("mi-made")!.querySelector(".mi-sh-r .eq8k-btn") as HTMLButtonElement;
    const sectors = document.getElementById("mi-sectors")!.querySelector(".mi-sh-r .eq8k-btn") as HTMLButtonElement;
    expect(made.textContent).toBe("2 things to know");
    expect(made.querySelectorAll(".eq8k-dots i")).toHaveLength(2);
    fireEvent.click(made);
    const pop = screen.getByRole("dialog", { name: "Two things to know" });
    expect(within(pop).getByRole("button", { name: /Open all/ })).toBeTruthy();
    expect(within(pop).getByRole("button", { name: "Close" })).toBeTruthy();
    fireEvent.click(sectors);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // the fall chart keeps its own heading clean: no pill moved into it
    expect(document.getElementById("mi-fall")!.closest("section")!.querySelector(".eq8k-btn")).toBeNull();
  });
  it("U8: the filter row sticks under the section bar's bottom, and the bar stays", () => {
    const css = readFileSync(join(__dirname, "../styles/mi391.css"), "utf8");
    expect(css).toContain(".mi .mi7-frow { top: var(--eq-bar-b, 62px); }");
    expect(css).toContain("html.mi7-rowup .wrap.mi .stb-wrap { transform: none; opacity: 1; pointer-events: auto; }");
  });
});

describe("P1–P6: the phone", () => {
  it("with All sections on, every stop after the first folds to its heading block with Open ▾; Open shows it and Close ▴; one stop chosen: no fold", async () => {
    st.phone = true;
    mount("/my-investments?step=all"); await screen.findByText("What it is made of");
    const folds = [...document.querySelectorAll(".mi391-fold")];
    expect(folds.map((f) => f.getAttribute("data-fold"))).toEqual(["mi-made", "mi-sectors", "mi-every", "what-changed", "mi-health", "mi-risk"]);
    expect(document.querySelector('[data-fold="mi-money"]')).toBeNull();
    // the heading block stays: number, title, first line
    const made = folds[0];
    expect(made.querySelector(".mi-sh-n")!.textContent).toBe("2");
    expect(made.querySelector(".mi-sh-l")).toBeTruthy();
    // What changed folds its inner section, keeping its heading and the Discover line
    expect(folds[3].querySelector(".mi7-wc > section.wc > h2")).toBeTruthy();
    fireEvent.click(within(made as HTMLElement).getByRole("button", { name: "Open What it is made of" }));
    expect(made.className).toContain("open");
    fireEvent.click(within(made as HTMLElement).getByRole("button", { name: "Close What it is made of" }));
    expect(made.className).not.toContain("open");
    cleanup(); mount("/my-investments?step=made"); await screen.findByText("What it is made of");
    expect(document.querySelector(".mi391-fold")).toBeNull();
  });
  it("P1: the cards stack one per row with the name and the figure only (CSS)", () => {
    const css = readFileSync(join(__dirname, "../styles/mi391.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 760px\) \{\s*\.mi \.mi391-strip \{ grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toContain(".mi .mi391-k em, .mi .mi391-x { display: none; }");
  });
});

describe("with PR B's optional fields (fault 1, 2, 7, 12) and the other views in step mode", () => {
  it("F1/T8b: the note names the holdings left out of the split; the equal-part sentence only for a kind with no quantity at all", () => {
    const d = D(); d.byValue = true; d.missing = [];
    d.noQuantity = [{ kind: "funds", code: 1, name: "Made-up Flexi Cap" }, { kind: "etfs", symbol: "MADEUPBEES", name: "Made-up ETF" }];
    expect(moneyNote(d, 7, 12)).toEqual(["The other 3 count in every reading but not in the money.", "Made-up Flexi Cap and MADEUPBEES have no quantity yet, so they are listed but not counted in the split."]);
    const e = D(); e.byValue = false; e.missing = ["etfs"];
    expect(moneyNote(e, 7, 12)).toEqual(["The other 5 count in every reading but not in the money.", "For now your ETFs count as ⅓."]);
  });
  it("F2: a fund priced for some lots counts those lots only in Invested and Gain (never a wrong gain); value now covers every unit", () => {
    const d = D();
    d.funds = d.funds.map((f, i) => (i === 0 ? { ...f, invested: null, investedPriced: 100000, valuePriced: 112000, lotsPriced: 1, lots: 2 } : { ...f, invested: null }));
    const m = moneyByKind(d, []).funds;
    expect(m.part).toBe(1); expect(m.full).toBe(1); expect(m.invested).toBe(100000); expect(m.gain).toBe(12000); expect(m.nowPriced).toBe(112000);
    expect(m.now).toBeCloseTo(d.funds.reduce((a, f) => a + f.units! * f.nav!, 0), 2);
  });
  it("F7/F12: the server's sentence and window line win when sent", async () => {
    const d = D(); d.risk.bandKey = "similar"; d.risk.bandSays = "Similar: moves about with the market. When the Nifty 500 moved 1%, this moved about 0.91%.";
    d.risk.swingWindows = { differ: true, line: "Shares: weekly prices, 2 years. Mutual funds and ETFs: daily NAVs and prices, 3 years." };
    st.answer = d; mount("/my-investments?step=risk"); await screen.findByText("How risky it is, all together");
    expect(document.querySelector(".mi391-win")!.textContent).toBe("Shares: weekly prices, 2 years. Mutual funds and ETFs: daily NAVs and prices, 3 years.");
    expect(document.querySelector(".mi-rh-dark")!.textContent).toContain("Similar: moves about with the market.");
  });
  it("the Equity view is one step at a time: Key figures in step 1, a Key figures link opens its step, &step= in the address", async () => {
    mount("/my-investments?tab=equity"); await screen.findByRole("heading", { name: "Key figures" });
    expect(chips().map((c) => c.textContent)).toEqual(["1Your shares", "2Spread", "3Risk", "4Also in funds and ETFs"]);
    expect(document.getElementById("mi-eq-risk")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See the risk →" }));
    await waitFor(() => expect(document.getElementById("mi-eq-risk")).toBeTruthy());
    expect(chips()[2].getAttribute("aria-current")).toBe("step");
    cleanup(); mount("/my-investments?tab=etf&step=risk"); await waitFor(() => expect(document.getElementById("mi-etf-risk")).toBeTruthy());
    expect(document.getElementById("mi-etf-list")).toBeNull();
  });
});

describe("I1: every i on the page has its own label", () => {
  it("no two i buttons share a label; none says What does this mean?", async () => {
    mount("/my-investments?step=all"); await screen.findByText("How risky it is, all together");
    await act(async () => {});
    const labels = [...document.querySelectorAll("button.info, button.sp-i")].map((b) => b.getAttribute("aria-label") ?? "");
    expect(labels.length).toBeGreaterThan(10);
    expect(labels).not.toContain("What does this mean?");
    expect(new Set(labels).size).toBe(labels.length);
  });
});
