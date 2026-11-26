// @vitest-environment jsdom
// Task #391 reopened (developer file 41 v4, 25 Nov 2026), All my investments: K1 (Key figures is the site's fold, closed on every visit), A1 (the time of
// the prices in market hours, each kind's prices when they differ), A2 (What changed is Step 5), A3 (the ETFs card says its basis), A4 (an ETF without a
// quantity is left out for that, not for "under a year of prices"), E2 (the shared bottom), E3 (no funds part without funds), E4 (an opened phone step
// places its Enlarge arrow again), D1/E1 (the full-width wrap, .sp-sec boxes, the page's spacing sheet). Each test names the point it proves; it would have failed
// before the fix. The list is the repo's made-up sample (sample-qty.json); no member's figures.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betaWindowTxt, type AllInvestments } from "../lib/myInvest";
import QTY from "./sample-qty.json";

const st = vi.hoisted(() => ({ answer: null as unknown, phone: false }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiSend: vi.fn(async (_m: string, p: string) => (p === "/api/me/all-investments" ? st.answer : p.startsWith("/api/visits/") ? { previous: null } : {})),
  apiGet: vi.fn(async (p: string) => (p.startsWith("/api/discovery/changes") ? { days: 90, events: [], notPlaced: [], companies: [] } : { holdings: [] })) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, upgrade: vi.fn(), toast: vi.fn() }), TIER: { silver: { name: "Silver" }, gold: { name: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { portfolio } from "../lib/portfolio";
import { MyInvestmentsPage } from "../pages/MyInvestments";
import { headerStamp, priceWhen, pricesPart, sourcesLine, viewCard } from "../lib/mi391";
import { priceStamp } from "../portfolio/pack/EqTop";
import { ChartZoom } from "../components/ChartZoom";
import { MiStep, MiStepCtx } from "./Steps391";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = vi.fn();
const D = (src: Partial<AllInvestments["sources"]> = {}) => { const d = structuredClone(QTY) as unknown as AllInvestments; d.sources = { ...d.sources, ...src }; return d; };
const OPEN = { sharesAt: "2026-11-26T10:16:05+05:30", sharesTo: "2026-11-26", etfsTo: "2026-11-25", navsTo: "2026-11-25" };
const CLOSE = { sharesAt: "2026-11-26T15:29:58+05:30", sharesTo: "2026-11-26", etfsTo: "2026-11-26", navsTo: "2026-11-26" };
const mount = (path = "/my-investments") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><MyInvestmentsPage /></MemoryRouter></QueryClientProvider>);
const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
beforeEach(() => {
  st.answer = D(); st.phone = false;
  localStorage.clear(); portfolio.reset(); portfolio.add({ symbol: "HDFCBANK", qty: 40, price: 0, owned: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (q: string) => ({ matches: st.phone && /max-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} }) });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("K1: Key figures is the site's fold, closed until clicked", () => {
  it("section#mi-kf is details.sp-sec.sp-fold, closed on arrival, Show ▾; opened it says Hide ▴; it stays open for the visit only", async () => {
    const { unmount } = mount(); await screen.findByText("Where your money sits");
    const kf = () => document.getElementById("mi-kf") as HTMLDetailsElement;
    expect(kf().matches("details.sp-sec.sp-fold")).toBe(true);
    expect(kf().open).toBe(false);
    expect(kf().querySelector("summary h2")!.textContent).toBe("Key figures");
    expect(kf().querySelector("summary small")!.textContent).toBe("What everything adds up to, from the steps that follow.");
    expect(kf().querySelector("summary .sp-show")!.textContent).toBe("Show ▾");
    act(() => { kf().open = true; fireEvent(kf(), new Event("toggle")); });
    expect(kf().querySelector("summary .sp-show")!.textContent).toBe("Hide ▴");
    // another stop and back: still open (the page's VisitFolds)
    fireEvent.click([...document.querySelectorAll(".stb-chip")][6]); await screen.findByText(/How risky it is, all together/);
    fireEvent.click([...document.querySelectorAll(".stb-chip")][0]); await screen.findByText("Where your money sits");
    expect(kf().open).toBe(true);
    unmount(); mount(); await screen.findByText("Where your money sits");
    expect(kf().open).toBe(false);                                                       // the next visit starts closed
  });
  it("the step 1 link (?step=kf) opens stop 1, which holds the fold", async () => {
    mount("/my-investments?step=kf"); await screen.findByText("Where your money sits");
    expect(document.getElementById("mi-kf")).not.toBeNull();
  });
});

describe("A1: the time of the prices, as the Equity page's priceStamp; each kind's prices when they differ", () => {
  it("market hours: the header says the time; Data as of names each kind (shares at the time, funds NAV, ETFs close)", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-26T04:50:00Z"));   // 10:20 IST
    const d = D(OPEN);
    expect(headerStamp(d)).toBe(priceStamp(OPEN.sharesAt)); expect(headerStamp(d)).toBe("Prices at 10:16 · 26 Nov");
    expect(pricesPart(d)).toBe("Shares at 10:16 · funds NAV 25 Nov · ETFs close of 25 Nov");
    expect(sourcesLine(d)).toMatch(/^Shares: NSE prices, the latest at 10:16 on 26 Nov\. ETFs: NSE closing prices to 25 Nov 2026\. Funds: NAVs and costs from AMFI to 25 Nov 2026;/);
  });
  it("after the close: \"close of <date>\", one reading when every kind is on it", () => {
    const d = D(CLOSE);
    expect(headerStamp(d)).toBe("Prices at close · 26 Nov");
    expect(pricesPart(d)).toBe("close of 26 Nov");
    expect(sourcesLine(d)).toMatch(/^Shares and ETFs: NSE closing prices to 26 Nov 2026\. Funds:/);
    expect(pricesPart(D({ ...CLOSE, navsTo: "2026-11-25" }))).toBe("Shares and ETFs close of 26 Nov · funds NAV 25 Nov");
  });
  it("the next morning before the session, the last trades of the day before read as its close", () => {
    expect(priceWhen("2026-11-26T15:29:58+05:30")).toEqual({ time: null, day: "26 Nov" });
    expect(priceWhen("2026-11-26T11:05:00+05:30")).toEqual({ time: "11:05", day: "26 Nov" });
  });
  it("the page shows it: header and Data as of (before: \"Prices at close\" and \"Prices close of\" at 10:16)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-26T04:50:00Z"));
    st.answer = D(OPEN); mount(); await screen.findByText("Where your money sits");
    expect(document.querySelector(".mi7-asof")!.textContent).toBe("Prices at 10:16 · 26 Nov");
    expect(document.querySelector(".mi391-asof")!.textContent).toContain("Prices Shares at 10:16 · funds NAV 25 Nov · ETFs close of 25 Nov");
  });
  it("an older answer (one date for all prices) reads as before", () => {
    expect(pricesPart(D({ navsTo: "2026-11-14" }))).toBe("close of 14 Nov");
  });
});

describe("A2: every section carries its step number, 1 to 7", () => {
  it("All sections: Step 1 … Step 7, What changed is Step 5", async () => {
    mount("/my-investments?step=all"); await screen.findByText("Where your money sits");
    await waitFor(() => expect(document.querySelector(".mi7-wc .mi41-step")).not.toBeNull());
    const steps = [...document.querySelectorAll(".mi-panel .mi-eyebrow")].map((e) => e.textContent).filter((t) => /^Step \d$/.test(t ?? ""));
    expect(steps).toEqual(["Step 1", "Step 2", "Step 3", "Step 4", "Step 5", "Step 6", "Step 7"]);
  });
});

describe("A3: the ETFs card says its basis, smaller, under the figures", () => {
  it("by value · N of M ETFs; each counts the same without quantities", async () => {
    const d = D(); d.cards.etfs.counted = 3; d.cards.etfs.of = 5; d.cards.etfs.count = 5;
    expect(viewCard("etf", d).b).toBe("by value · 3 of 5 ETFs");
    const e = D(); e.cards.etfs.valued = false;
    expect(viewCard("etf", e).b).toBe("each counts the same · 3 ETFs");
    expect(viewCard("mf", d).b).toBeUndefined();
    mount(); await screen.findByText("Where your money sits");
    expect(document.querySelector("#mi-t-etf .mi391-b")!.textContent).toMatch(/^by value · \d+ of \d+ ETFs?$/);
    expect(src("../styles/mi41.css")).toMatch(/\.mi \.mi391-b \{ margin: 4px 0 0; font: 400 var\(--fs-12\)/);
  });
});

describe("A4: the reason an ETF is left out of the ETFs' beta is the real one", () => {
  it("no quantity yet, apart from under a year of prices (before: both read \"under a year of prices\")", () => {
    const w = { index: "Nifty 500", grain: "weekly", window: "past year" };
    expect(betaWindowTxt({ ...w, counted: 3, of: 5, short: [], noQty: ["MID150X", "SMALLX"] })).toBe("vs Nifty 500 · weekly · past year · 3 of 5 (MID150X and SMALLX: no quantity yet)");
    expect(betaWindowTxt({ ...w, counted: 2, of: 4, short: ["YOUNG"], noQty: ["NOQ"] })).toBe("vs Nifty 500 · weekly · past year · 2 of 4 (NOQ: no quantity yet; YOUNG: under a year of prices)");
  });
});

describe("E2 / E3: the shared bottom; the sources line names the funds only when there are funds", () => {
  it("Questions about this page · 8 (fold), then the Disclaimer fold, then the sources line; both closed; the eight questions and the text unchanged", async () => {
    mount(); await screen.findByText("Where your money sits");
    const pgb = document.querySelector(".wrap.mi .pgb")!;
    expect([...pgb.children].map((e) => e.className.split(" ")[0])).toEqual(["pfq", "sp-sec", "mfp-foot"]);
    const faq = pgb.querySelector("details.pfq-fold") as HTMLDetailsElement, disc = pgb.querySelector("details.pgb-disc") as HTMLDetailsElement;
    expect(faq.open).toBe(false); expect(disc.open).toBe(false);
    expect(faq.querySelector("summary")!.textContent).toBe("Questions about this page · 8");
    expect(faq.querySelectorAll(".pfq-q")).toHaveLength(8);
    expect(faq.textContent).toContain("Is anything sent to my broker?");
    expect(disc.querySelector("summary")!.textContent).toBe("DisclaimerWhat this page is, and is notShow ▾");
    expect(disc.textContent).toContain("This page describes your lists; it does not tell you what to do with them. Nothing is sent to a broker.");
    expect(document.querySelector(".mi-faq, details.mi-fold, .mi-src")).toBeNull();      // the page's own Questions card and round-chevron fold are gone
    expect(pgb.querySelector(".pgb-src")!.textContent).toMatch(/Funds: NAVs and costs from AMFI to 13 Nov 2026/);
  });
  it("no funds: no funds part (before: \"Funds: NAVs and costs from AMFI to —\")", () => {
    const d = D({ navsTo: null }); d.counts.funds = 0; d.funds = [];
    const s = sourcesLine(d);
    expect(s).not.toMatch(/Funds:|AMFI to —/);
    expect(s).toMatch(/^Shares and ETFs: NSE closing prices to 14 Nov 2026\. ETF holdings from each fund house's monthly portfolio file \(31 Oct 2026\)\. Nifty 500 from NSE\./);
  });
});

describe("E4: phone, an opened step places its Enlarge arrow again", () => {
  it("each fold toggle sends cz-refit, and every Enlarge arrow finds its box again on it", () => {
    st.phone = true;
    const sent = vi.fn(); window.addEventListener("cz-refit", sent);
    render(<MiStepCtx.Provider value={{ step: "all", first: "mi-money" }}><MiStep id="mi-made" title="What it is made of"><section className="sp-sec mi-step"><p>body</p></section></MiStep></MiStepCtx.Provider>);
    expect(sent).not.toHaveBeenCalled();                                                 // nothing on the first draw
    fireEvent.click(screen.getByRole("button", { name: "Open What it is made of" })); expect(sent).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close What it is made of" })); expect(sent).toHaveBeenCalledTimes(2);
    window.removeEventListener("cz-refit", sent);
  });
  it("ChartZoom works its box out again on cz-refit (before: only on a resize, with the box found while the step was closed)", () => {
    const seen: Element[] = [];
    const real = window.getComputedStyle;
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, p?: string | null) => { seen.push(el); return real(el, p); });
    render(<div className="box" style={{ border: "1px solid red" }}><ChartZoom label="t" kind="table"><svg viewBox="0 0 1 1" role="img" /></ChartZoom></div>);
    const before = seen.filter((e) => (e as HTMLElement).classList?.contains("box")).length;
    act(() => { window.dispatchEvent(new Event("cz-refit")); });
    expect(seen.filter((e) => (e as HTMLElement).classList?.contains("box")).length).toBeGreaterThan(before);
    spy.mockRestore();
  });
});

describe("D1, E1, D2–D7, T1: the wrap, the boxes and the page's spacing sheet", () => {
  it("the wrap is full width by its own rule; the sections are .sp-sec (not .card); the sheet is loaded with the page", async () => {
    mount("/my-investments?step=all"); await screen.findByText("Where your money sits");
    expect(document.querySelector(".wrap.mi")!.classList.contains("pfx")).toBe(false);   // the width rule, not pf.css's page-wide .pfx base (see MyInvestments.tsx)
    const secs = [...document.querySelectorAll(".mi-panel section.mi-step")];
    expect(secs.length).toBe(6); expect(secs.every((s) => s.classList.contains("sp-sec") && !s.classList.contains("card"))).toBe(true);
    expect(document.querySelector(".mi-short")!.classList.contains("sp-sec")).toBe(true);
    expect(document.querySelector(".mi7-top")!.classList.contains("card")).toBe(true);   // the header card stays .card
    expect(src("../pages/MyInvestments.tsx")).toMatch(/import "\.\.\/styles\/mi41\.css";/);
  });
  it("the sheet: 18 between boxes, 28 above the view cards, 12 side by side, 18 px corners, top-aligned cards, the bar's 8 px cover", () => {
    const css = src("../styles/mi41.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.wrap\.mi \{ --pf-gap: 18px; --pf-gap-x: 12px; --pf-crown: 10px; \}/);
    expect(css).toMatch(/\.wrap\.mi, \.wrap\.mi \.gate, \.wrap\.mi \.gate > div \{ min-width: 0; max-width: 100%; \}/);
    expect(css).toMatch(/\.mi \.mi391-strip \{ margin-top: calc\(var\(--pf-gap\) \+ var\(--pf-crown\)\); margin-bottom: var\(--pf-gap\); \}/);
    expect(css).toMatch(/\.mi \.mi391-c \{ display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch; text-align: left; padding-top: 16px; \}/);
    expect(css).toMatch(/\.mi \.mi391-since, \.mi \.mi7-wc > \.wc\.wp-sec, \.mi \.mi7-nextb \{ border-radius: var\(--r-card\); \}/);   // --r-card is 18 px (ui-tokens.css)
    expect(css).toMatch(/\.mi :is\(\.mi7-t2, \.mi7-kfrow, \.mi-three[^)]*\) \{ gap: var\(--pf-gap-x\); \}/);
    expect(css).toMatch(/padding: 24px 24px 22px; border: 1px solid var\(--sp-line\);[^}]*box-shadow: none; \}/);
    expect(css).toMatch(/\.mi \.mi391-fold:not\(\.open\) \{ margin-bottom: var\(--pf-gap\);/);
    expect(css).toMatch(/html\.mi7-rowup \.wrap\.mi \.stb-wrap::after \{ content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 8px; background: var\(--bg\); \}/);
    expect(css).not.toMatch(/pointer-events:\s*none/);                                  // the cover is a real box the check can see
  });
});
