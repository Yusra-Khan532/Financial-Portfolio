// @vitest-environment jsdom
// Order Flow > the Signals desk tab (founder, 25 Nov 2026: the signals switch). The tab is not even listed for a Lab member without the switch, and
// ?view=signals then opens Market depth without asking the desk's route; with the switch it is listed and opens the desk with its own disclaimer.
// Every OTHER tab stays describe-only for a member WITH the switch: its rendered text holds no describe-only word and nothing of the desk.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CASE from "../lib/__fixtures__/lab-case-reliance.json";
import DESK from "../lib/__fixtures__/lab-signals-reliance.json";

const auth = { ready: true, user: { id: "u1", email: "m@example.com", role: "investor" } as unknown, features: ["trading_lab"] as string[] };
vi.mock("../lib/auth", () => ({ useAuth: () => auth }));
import { FLOW_TABS, OrderFlowPage } from "./OrderFlow";

// The describe-only words (CLAUDE.md, docs/TRADING-LAB.md rules) plus the desk's own words, none of which may show on another tab.
const RULE_WORDS = /\b(buy|sell|hold|target|best|top pick|recommended|forecast|likely|will rise|will fall|bullish|bearish|signals?|overweight|underweight|conviction)\b/i;
const DESK_TEXT = ["Signals on · internal test", "Run the desk", "Research manager", "Trader's plan", "Trade-size debate", "Bull researcher", "SEBI"];

const stock = (symbol: string, changePct: number, sector: string, buildup: string | null, score: number) => ({
  symbol, name: `${symbol} Ltd`, sector, industry: null, lot: 100, price: 100 + changePct, previousClose: 100, change: changePct, changePct,
  open: 100, high: 110, low: 90, volume: 1000, vwap: 100, vwapGapPct: changePct / 2, oi: 1000, oiChange: 50, oiChangePct: 5.5, buildup,
  direction: changePct > 0 ? 1 : -1, pivots: { p: 100, r1: 104, r2: 108, s1: 96, s2: 92 }, pivotsFrom: "2026-11-24", zone: changePct > 0 ? "r1_r2" : "s2_s1",
  agreement: { score, of: 5, facts: { newPositions: true, vwapSide: true, pastLevel: score > 2, strongOi: true, rangeEnd: null } }, asOf: "2026-11-25T11:02:10+05:30", notes: [],
});
const SNAP = {
  ready: true, tradeDay: "2026-11-25", takenAt: "2026-11-25T11:03:00+05:30", notes: [],
  summary: { stocks: 2, up: 1, down: 1, flat: 0, medianChangePct: 0.5, buildups: { long_buildup: 1, short_buildup: 1, short_covering: 0, long_unwinding: 0 },
    distribution: [{ from: null, to: -5, count: 1 }, { from: 5, to: null, count: 1 }],
    sectors: [{ sector: "Financial Services", stocks: 1, up: 1, down: 0, avgChangePct: 6.2, buildups: {}, oiChange: 100, symbols: ["POLICYBZR"] },
      { sector: "Metals & Mining", stocks: 1, up: 0, down: 1, avgChangePct: -6.1, buildups: {}, oiChange: 100, symbols: ["TATASTEEL"] }] },
  stocks: [stock("POLICYBZR", 6.48, "Financial Services", "long_buildup", 5), stock("TATASTEEL", -8.43, "Metals & Mining", "short_buildup", 4)],
  lines: { times: ["10:00", "11:03"], change: { POLICYBZR: [1, 6.48], TATASTEEL: [-2, -8.43] } },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let access: unknown;
const urls: string[] = [];
beforeEach(() => {
  urls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    urls.push(u);
    if (u.includes("/api/lab/access")) return json(200, access);
    if (u.includes("/api/lab/signals/")) return json(200, DESK.none);
    if (u.includes("/api/lab/case/")) return json(200, CASE.none);
    if (u.includes("/api/lab/flow/money")) return json(503, { detail: { status: "not_ready", detail: "No money flow yet." } });
    if (u.includes("/api/lab/flow")) return json(200, SNAP);
    if (u.includes("/search-index")) return json(200, { fields: [], rows: [] });
    return json(404, { detail: { status: "not_found", detail: "Not stored." } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (path: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><OrderFlowPage /></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 15)); }); };
const tabNames = () => [...document.querySelectorAll(".oflow-tabs a")].map((a) => a.textContent);
const ON = { access: true, reason: "granted", expiresAt: null, signals: true }, OFF = { access: true, reason: "granted", expiresAt: null, signals: false };

describe("Order Flow > the Signals desk tab", () => {
  it("is one Order Flow tab, marked as needing the signals switch", () => {
    expect(FLOW_TABS).toContainEqual({ id: "signals", name: "Signals desk", ready: true, signals: true });
    expect(FLOW_TABS.filter((t) => t.signals).map((t) => t.id)).toEqual(["signals"]);
  });

  it("is not listed for a Lab member without the switch, and ?view=signals opens Market depth without asking the desk's route", async () => {
    access = OFF;
    wrap("/lab/flow?view=signals"); await settle();
    expect(tabNames()).not.toContain("Signals desk");
    expect(screen.queryByRole("link", { name: "Signals desk" })).toBeNull();
    expect(screen.getByRole("link", { name: "Market depth" }).getAttribute("aria-current")).toBe("page");
    expect(urls.some((u) => u.includes("/api/lab/signals"))).toBe(false);
    for (const t of DESK_TEXT) expect(document.body.textContent).not.toContain(t);
  });

  it("is listed with the switch and opens the desk, with the desk's label, its note and its own page disclaimer", async () => {
    access = ON;
    wrap("/lab/flow?view=signals"); await settle();
    expect(tabNames()).toEqual(FLOW_TABS.filter((t) => t.ready).map((t) => t.name));
    const tab = screen.getByRole("link", { name: "Signals desk" });
    expect(tab.getAttribute("href")).toBe("/lab/flow?view=signals");
    expect(tab.getAttribute("aria-current")).toBe("page");
    expect(urls.some((u) => u.endsWith("/api/lab/signals/RELIANCE"))).toBe(true);
    expect(screen.getByRole("heading", { name: /Signals desk/ }).textContent).toContain("Signals on · internal test");
    const disc = document.querySelector(".tlab-disc")!.textContent!;
    expect(disc).toContain("Signals on · internal test");
    expect(disc).toContain("not investment advice");
    expect(disc).not.toContain("does not tell anyone to buy, sell or hold");                 // the Order Flow disclaimer would not be true here
  });

  for (const t of FLOW_TABS.filter((x) => x.ready && !x.signals)) {
    it(`"${t.name}" stays describe-only for a member with the switch: no describe-only word and nothing of the desk`, async () => {
      access = ON;
      wrap(t.id === "depth" ? "/lab/flow" : `/lab/flow?view=${t.id}`); await settle();
      expect(screen.getByRole("link", { name: t.name }).getAttribute("aria-current")).toBe("page");
      const page = document.querySelector(".oflow")!.cloneNode(true) as HTMLElement;
      page.querySelector(".oflow-tabs")?.remove();        // the tab list names the desk's tab, the one place its name may appear
      page.querySelector(".tlab-disc")?.remove();         // the disclaimer says what the page does NOT do ("does not tell anyone to buy, sell or hold")
      // "not a forecast" is the tabs' own describe-only line (it says what the figures are NOT), so the negation is taken out before the scan
      const text = (page.textContent ?? "").replace(/\b(?:is |are )?not a forecast\b/gi, "");
      expect(text.length).toBeGreaterThan(40);
      expect(text.match(RULE_WORDS), t.id).toBeNull();
      for (const d of DESK_TEXT) expect(text, `${t.id}: ${d}`).not.toContain(d);
      expect(urls.some((u) => u.includes("/api/lab/signals")), t.id).toBe(false);
      expect(document.querySelector(".tlab-disc")!.textContent).toContain("does not tell anyone to buy, sell or hold");
    });
  }

  it("the describe-only scans of the other tabs' sources still pass: no rating word, and only OrderFlow.tsx names the desk", () => {
    const read = (f: string) => readFileSync(resolve(__dirname, f), "utf8");
    for (const f of ["../components/lab/CaseForAgainst.tsx", "../lib/labCase.ts", "../components/lab/StockZones.tsx", "../components/lab/OptionPulse.tsx"]) {
      const src = read(f);
      expect(src.match(/\b(overweight|underweight|Run the desk|signals_ctx|labSignals|SignalsDesk)\b/i), f).toBeNull();
    }
    const flow = read("./OrderFlow.tsx");
    expect(flow.match(/<SignalsDesk/g)?.length).toBe(1);                                     // the one route in Flow
    expect(flow).toMatch(/if \(view === "signals"\) return <TipLayer><SignalsDesk \/><\/TipLayer>;/);
  });
});
