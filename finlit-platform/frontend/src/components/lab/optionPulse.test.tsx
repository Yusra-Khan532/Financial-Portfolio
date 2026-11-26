// @vitest-environment jsdom
// Trading Lab > Order Flow > Option Pulse (founder, 26 Nov 2026): put and call OI strike by strike from the Lab's option chain routes, the
// largest OI each side, PCR and max pain in one plain line, the largest OI changes, a card on every strike, facts only.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { OptionPulse, largest, pulseLine } from "./OptionPulse";
import type { Chain, Row, Side } from "../../lib/options";

const side = (oi: number, chg: number, buildup: Side["buildup"] = null): Side => ({ securityId: 1, oi, prevOi: oi - chg, oiChange: chg, oiChangePct: +((chg / (oi - chg)) * 100).toFixed(2),
  volume: 1000, prevVolume: null, iv: 12.5, ltp: 50, prevClose: 45, change: 5, changePct: 11.1, avgPrice: 50, bid: 49.9, bidQty: 75, ask: 50.1, askQty: 75,
  delta: null, gamma: null, theta: null, vega: null, buildup });
const rows: Row[] = [
  { strike: 24200, pe: side(3_000_000, 500_000, "short_buildup"), ce: side(400_000, -50_000), atm: false, ceItm: true, peItm: false },
  { strike: 24300, pe: side(4_800_000, 1_100_000, "short_buildup"), ce: side(2_600_000, 200_000), atm: true, ceItm: true, peItm: false },
  { strike: 24400, pe: side(2_100_000, -300_000), ce: side(4_000_000, 700_000, "short_buildup"), atm: false, ceItm: false, peItm: true },
  { strike: 24500, pe: side(1_000_000, 100_000), ce: side(5_100_000, -500_000, "long_unwinding"), atm: false, ceItm: false, peItm: true },
];
const und = { key: "NIFTY", name: "NIFTY", kind: "index" as const, segment: "IDX_I", securityId: 13, exchange: "NSE" };
const CHAIN: Chain = { underlying: und, expiry: "2026-12-02", daysToExpiry: 6, spot: 24352.4, atm: 24300, rows,
  summary: { pcrOi: 1.04, pcrVolume: 1.18, maxPain: { strike: 24350, payout: 1 }, totals: { ce: { strikes: 4, oi: 12_100_000, oiChange: 350_000, volume: 1, prevOi: 1 }, pe: { strikes: 4, oi: 10_900_000, oiChange: 1_400_000, volume: 1, prevOi: 1 } }, strikes: 4, missing: {} },
  maxPainCurve: [{ strike: 24200, payout: 9 }, { strike: 24300, payout: 4 }, { strike: 24400, payout: 6 }, { strike: 24500, payout: 10 }], notes: [],
  lotSize: 75, lotSource: "instrument file", lotMixed: false, asOf: "2026-11-26T15:30:00+05:30", ageSeconds: 30, state: "fresh", marketOpen: false, nextOpen: null, refreshSeconds: 60 };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
beforeEach(() => { urls.length = 0; vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(String(url));
  return String(url).includes("/underlyings") ? json({ indices: [und], stocks: [{ key: "RELIANCE", name: "Reliance Industries", securityId: 2885, lotSize: 500 }], connected: true })
    : String(url).includes("/expiries") ? json({ underlying: und, expiries: ["2026-12-02", "2026-12-09"], asOf: "", state: "fresh" }) : json(CHAIN); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><OptionPulse /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

describe("Option Pulse", () => {
  it("reads the Lab's own chain routes (not the Gold page's) for the nearest expiry", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.includes("/api/options/lab/chain?u=NIFTY&expiry=2026-12-02"))).toBe(true);
    expect(urls.some((u) => /\/api\/options\/(chain|expiries|underlyings)/.test(u))).toBe(false);
  });
  it("says in one plain line where OI is largest, PCR and max pain", async () => {
    wrap(); await settle();
    expect(document.querySelector(".oflow-money-line")?.textContent).toBe("NIFTY at 24,352.40 · most put OI at 24,300 · most call OI at 24,500 · PCR 1.04 · max pain 24,350");
    expect(screen.getByRole("img", { name: /most put OI at 24,300; most call OI at 24,500/ })).toBeTruthy();
  });
  it("lists the largest OI changes each side with their build-up", async () => {
    wrap(); await settle();
    const puts = within(screen.getByRole("list", { name: "Largest put OI changes" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(puts[0]).toMatch(/^24,300\+11\.00 LShort build-up$/);
  });
  it("pointing at a strike shows both sides in full", async () => {
    wrap(); await settle();
    const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" });
    fireEvent(document.querySelectorAll(".opul-row")[3], e);
    const pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("NIFTY 24,500")).toBeTruthy();
    expect(within(pop).getByText("Put")).toBeTruthy(); expect(within(pop).getByText("Call")).toBeTruthy();
    expect(within(pop).getByText("Long unwinding")).toBeTruthy();
  });
  it("finds any F&O stock by name and switches to it", async () => {
    wrap(); await settle();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find an F&O stock" }), { target: { value: "reli" } });
    fireEvent.click(within(screen.getByRole("list", { name: "Matching stocks" })).getByRole("button"));
    await settle();
    expect(urls.some((u) => u.includes("/api/options/lab/expiries?u=RELIANCE"))).toBe(true);
  });
  it("pure helpers: the largest OI on each side and the line", () => {
    expect(largest(rows, "pe")?.strike).toBe(24300); expect(largest(rows, "ce")?.strike).toBe(24500); expect(largest([], "ce")).toBeNull();
    expect(pulseLine({ ...CHAIN, spot: null, summary: { ...CHAIN.summary, pcrOi: null, maxPain: null } })).toBe("NIFTY · most put OI at 24,300 · most call OI at 24,500");
  });
  it("never uses an advice word", async () => {
    wrap(); await settle();
    expect(document.querySelector(".opul")!.textContent!).not.toMatch(/\b(buy|sell|target|support zone|resistance zone|will cap|should)\b/i);
  });
});
