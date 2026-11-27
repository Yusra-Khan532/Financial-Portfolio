// @vitest-environment jsdom
// Trading Lab > Order Flow > Case for / against: FinLit AI's three sections from /api/lab/case/{symbol} (backend finlit/lab/case.py), every
// source number with its fact in a hover card and in the numbered Sources list, the writing / limit / fallback / switched-off states, the phone
// layout and the describe-only wording. The answers are the backend's own output for RELIANCE (src/lib/__fixtures__/lab-case-reliance.json,
// made with lab/case.py and the scripted AI of the backend tests).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { CaseForAgainst } from "./CaseForAgainst";
import { FLOW_TABS } from "../../pages/OrderFlow";
import { CASE_NOTE, factGroups, limitLine, type LabCase } from "../../lib/labCase";
import FIX from "../../lib/__fixtures__/lab-case-reliance.json";

const WRITTEN = FIX.written as unknown as LabCase, NONE = FIX.none as unknown as LabCase, FALLBACK = FIX.fallback as unknown as LabCase;
// The describe-only words (docs/TRADING-LAB.md rules and the case's own list).
const RULE_WORDS = /\b(buy|sell|hold|target|best|top pick|recommended|forecast|likely|will rise|will fall|bullish|bearish|signals?|undervalued|overvalued|cheap|expensive|should|must|opportunity|upside|downside target)\b/i;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let getBody: unknown = NONE, postBody: unknown = WRITTEN, postStatus = 200, hold: Promise<void> | null = null;
const calls: { url: string; method: string }[] = [];
beforeEach(() => {
  getBody = NONE; postBody = WRITTEN; postStatus = 200; hold = null; calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url), method = init?.method ?? "GET";
    calls.push({ url: u, method });
    if (u.includes("/search-index")) return json({ fields: [], rows: [["RELIANCE", "Reliance Industries Ltd", null, 1], ["TATASTEEL", "Tata Steel Ltd", null, 1]] });
    if (method === "POST") { if (hold) await hold; return json(postBody, postStatus); }
    const sym = u.split("/").pop();
    return json(sym === "RELIANCE" ? getBody : { ...NONE, symbol: sym, name: "Tata Steel Ltd" });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><CaseForAgainst /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 15)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 20 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };
const pop = () => document.querySelector<HTMLElement>(".oflow-pop");
const button = () => screen.queryByRole("button", { name: /Write the case|Writing the case/ }) as HTMLButtonElement | null;

describe("Case for / against, the words", () => {
  it("groups the sheet in its own order and says the day's cases plainly", () => {
    expect(factGroups(WRITTEN.sources).map((g) => g.label)).toEqual(["Share price", "Valuation", "Returns on capital", "Margins", "Debt and liquidity", "Cash", "Growth", "Latest results", "Valuation history", "Order Flow (Trading Lab)"]);
    expect(limitLine(WRITTEN.limit)).toBe("17 of 20 cases left today. A case already written for a stock opens free.");
    expect(limitLine({ ...WRITTEN.limit, left: 0, used: 20 })).toMatch(/^All 20 cases of today are used/);
    expect(WRITTEN.note).toBe(CASE_NOTE);
  });
  it("is a ready tab of Order Flow", () => {
    expect(FLOW_TABS).toContainEqual({ id: "case", name: "Case for / against", ready: true });
  });
});

describe("Case for / against, the tab", () => {
  it("shows the numbered figures and the button before anything is written, without calling the AI", async () => {
    wrap(); await settle();
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/api/lab/case/RELIANCE"))).toBe(true);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(button()!.disabled).toBe(false);
    expect(screen.getByText("17 of 20 cases left today. A case already written for a stock opens free.")).toBeTruthy();
    expect(document.querySelectorAll(".lcase-card")).toHaveLength(0);
    expect(document.querySelectorAll(".lcase-slist li")).toHaveLength(15);                   // the first 15 sources, then "Show 20 more"
    fireEvent.click(screen.getByRole("button", { name: "Show 20 more" }));
    expect(document.querySelectorAll(".lcase-slist li")).toHaveLength(35);
    expect(screen.getByRole("note").textContent).toContain(CASE_NOTE);
  });

  it("writes the case: a loading state, then the three sections side by side with every sentence's sources", async () => {
    let release!: () => void;
    hold = new Promise<void>((r) => { release = r; });
    wrap(); await settle();
    fireEvent.click(button()!); await settle();
    expect(button()!.textContent).toBe("Writing the case…");
    expect(button()!.disabled).toBe(true);
    expect(button()!.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText(/FinLit AI is writing from 35 figures and checking every sentence/)).toBeTruthy();
    release(); await settle();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/lab/case/RELIANCE"]);
    const cards = [...document.querySelectorAll<HTMLElement>(".lcase-card")];
    expect(cards.map((c) => c.querySelector("h3")!.textContent)).toEqual(["What the figures support", "What the figures challenge", "What the data cannot settle"]);
    expect(within(cards[0]).getByText(/Operating cash flow was 180.29% of reported profit in FY26\./)).toBeTruthy();
    const refs = [...cards[0].querySelectorAll<HTMLAnchorElement>(".lcase-ref")];
    expect(refs.map((a) => a.textContent)).toEqual(WRITTEN.sections[0].sentences.flatMap((s) => s.sources.map((n) => `[${n}]`)));
    expect(refs[0].getAttribute("href")).toBe(`#lcase-src-${WRITTEN.sections[0].sentences[0].sources[0]}`);
    expect(screen.getByRole("status").textContent).toContain("Written just now");
    expect(button()).toBeNull();                                                              // written: no second press
    expect(document.querySelector(".lcase-meta")!.textContent).toMatch(/latest filing 30 Jun 2026 · prices to 26 Nov 2026 · kept until a new filing or new prices/);
  });

  it("a source number shows its fact and where it is stored, on the pointer and on keyboard focus", async () => {
    getBody = { ...WRITTEN, cached: true };
    wrap(); await settle();
    expect(screen.getByText("Opened from the saved case")).toBeTruthy();
    const first = WRITTEN.sections[0].sentences[0].sources[0];
    const fact = WRITTEN.sources.find((f) => f.n === first)!;
    const ref = document.querySelector<HTMLAnchorElement>(`.lcase-ref[href="#lcase-src-${first}"]`)!;
    point(ref);
    expect(pop()!.getAttribute("role")).toBe("tooltip");
    expect(within(pop()!).getByText(`Source [${first}]`)).toBeTruthy();
    expect(within(pop()!).getByText(fact.text)).toBeTruthy();
    expect(within(pop()!).getByText(fact.source)).toBeTruthy();
    fireEvent.pointerLeave(ref);
    expect(pop()).toBeNull();
    fireEvent.focus(ref);
    expect(within(pop()!).getByText(fact.text)).toBeTruthy();
    fireEvent.blur(ref);
    expect(pop()).toBeNull();
    // a source beyond the first 15 opens the full list when its number is chosen, and is marked
    const late = WRITTEN.sections.flatMap((s) => s.sentences.flatMap((x) => x.sources)).find((n) => n > 15)!;
    fireEvent.click(document.querySelector(`.lcase-ref[href="#lcase-src-${late}"]`)!);
    expect(document.getElementById(`lcase-src-${late}`)!.className).toBe("hot");
  });

  it("a touch never opens a hover card (the number still links to its source)", async () => {
    getBody = WRITTEN;
    wrap(); await settle();
    const ref = document.querySelector(".lcase-ref")!;
    const e = new MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 }); Object.defineProperty(e, "pointerType", { value: "touch" });
    fireEvent(ref, e);
    expect(pop()).toBeNull();
  });

  it("the day's limit: the button is off and the reason is said", async () => {
    getBody = { ...NONE, limit: { ...NONE.limit, used: 20, left: 0 } };
    wrap(); await settle();
    expect(button()!.disabled).toBe(true);
    expect(screen.getByText(/^All 20 cases of today are used/)).toBeTruthy();
  });

  it("a 429 from the server turns the button off with the server's words", async () => {
    postStatus = 429;
    postBody = { detail: { status: "limit_reached", detail: "You have written all 20 cases of today. They renew at midnight India time; a case already written for a stock still opens.", limit: 20, used: 20, left: 0 } };
    wrap(); await settle();
    fireEvent.click(button()!); await settle();
    expect(screen.getByRole("status").textContent).toMatch(/You have written all 20 cases of today/);
    expect(button()!.disabled).toBe(true);
  });

  it("an answer that broke the rules is never shown: the plain message and the figures instead", async () => {
    postBody = FALLBACK;
    wrap(); await settle();
    fireEvent.click(button()!); await settle();
    expect(screen.getByRole("status").textContent).toBe(FALLBACK.message);
    expect(document.querySelectorAll(".lcase-card")).toHaveLength(0);
    expect(document.querySelectorAll(".lcase-slist li").length).toBeGreaterThan(0);
  });

  it("without the AI switched on, the figures are listed and the reason is said", async () => {
    getBody = { ...NONE, enabled: false };
    wrap(); await settle();
    expect(button()!.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/not switched on yet/);
  });

  it("another company is chosen from the chips or the search", async () => {
    wrap(); await settle();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a company" }), { target: { value: "tata" } });
    await settle();
    fireEvent.click(within(screen.getByRole("list", { name: "Matching companies" })).getByRole("button", { name: /TATASTEEL/ }));
    await settle();
    expect(calls.some((c) => c.url.endsWith("/api/lab/case/TATASTEEL"))).toBe(true);
    expect(screen.getByText("Tata Steel Ltd")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "TCS" }));
    expect(screen.getByRole("button", { name: "TCS" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Case for / against, phone layout and wording", () => {
  const css = readFileSync(resolve(__dirname, "../../styles/orderflow.css"), "utf8");
  it("stacks the three sections and the sources in one column on narrow screens, and the button fills the width on a phone", () => {
    expect(css).toMatch(/\.lcase-grid \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(max-width: 1000px\) \{ \.lcase-grid \{ grid-template-columns: minmax\(0, 1fr\); \} \.lcase-slist \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
    const phone = css.slice(css.lastIndexOf("@media (max-width: 560px) {\n  .lcase-bar"));
    expect(phone).toMatch(/\.lcase-go \{ width: 100%/);
    expect(phone).toMatch(/\.lcase-pick \.opul-found \{ width: 100%; \}/);
    expect(css).toMatch(/\.lcase-stext \{[^}]*overflow-wrap: anywhere/);                  // a long source label wraps, never scrolls sideways
    const motion = css.lastIndexOf("@media (prefers-reduced-motion");
    expect(css.slice(motion)).toMatch(/\.lcase-dot \{ animation: none; \}/);
  });
  it("uses no describe-only word on the rendered page or in its source", async () => {
    getBody = WRITTEN;
    const { container } = wrap(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "Show 20 more" }));
    const text = container.textContent ?? "";
    expect(text.match(RULE_WORDS)).toBeNull();
    for (const f of ["./CaseForAgainst.tsx", "../../lib/labCase.ts"]) {
      const src = readFileSync(resolve(__dirname, f), "utf8");
      expect(src.match(RULE_WORDS), f).toBeNull();
    }
  });
});
