// @vitest-environment jsdom
// Trading Lab > Option Pulse > OI Flow: how fast call and put OI changes by strike, from the 3-minute snapshots (lab/oiflow.py). Facts only.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { OIFlow } from "./OIFlow";
import { flowLine, heatMax, isFlowUnderlying, windowNote, type OIFlow as Flow } from "../../lib/oiflow";
import { compact } from "../../lib/options";

const side = (oi: number, day: number | null, m15: number | null, m60: number | null) => ({ oi, day, m15, m60 });
const FLOW: Flow = {
  status: "ok", underlying: "NIFTY", session: "2026-11-26", today: true, marketOpen: true, available: true,
  expiry: "2026-12-01", spot: 25003, atm: 25000, asOf: "11:30", firstAt: "09:15", snapshots: 46, gapMinutes: { m15: 15, m60: 60 },
  strikes: [
    { strike: 24950, atm: false, ce: side(900_000, 50_000, -20_000, 10_000), pe: side(1_800_000, 400_000, 210_000, 300_000) },
    { strike: 25000, atm: true, ce: side(2_400_000, 600_000, 230_000, 410_000), pe: side(2_000_000, -100_000, -40_000, -90_000) },
    { strike: 25050, atm: false, ce: side(1_500_000, 200_000, 0, 30_000), pe: side(700_000, null, null, null) },
  ],
  movers: { ce: { build: [{ strike: 25000, change: 230_000 }], unwind: [{ strike: 24950, change: -20_000 }] }, pe: { build: [{ strike: 24950, change: 210_000 }], unwind: [{ strike: 25000, change: -40_000 }] } },
  totals: { ce: { m15: 210_000, m60: 450_000, day: 850_000 }, pe: { m15: 170_000, m60: 210_000, day: 300_000 } },
  heat: { from: "11:21", times: ["11:24", "11:27", "11:30"], strikes: [24950, 25000, 25050], ce: [[1, -2, 3], [50, 0, 80_000], [null, 0, 0]], pe: [[0, 0, 0], [-10, 0, 0], [0, 0, null]] },
};
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
let answer: unknown = FLOW;
const urls: string[] = [];
beforeEach(() => { urls.length = 0; answer = FLOW; vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); return json(answer); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (u = "NIFTY") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TipLayer><OIFlow u={u} /></TipLayer></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const BANNED = /\b(buy|sell|hold|target|stop[- ]?loss|entry|best|bullish|bearish|will (rise|fall|cap))\b/i;

describe("OI Flow", () => {
  it("covers the five indices only, and says how long each window really is", () => {
    expect(["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX"].every(isFlowUnderlying)).toBe(true);
    expect(isFlowUnderlying("RELIANCE")).toBe(false);
    expect(windowNote(FLOW, "m15")).toBe("over the last 15 minutes");
    expect(windowNote({ ...FLOW, gapMinutes: { m15: null, m60: null } }, "m60")).toBe("needs an hour of snapshots");
    expect(windowNote(FLOW, "day")).toBe("against the previous close");
    expect(flowLine(FLOW, "m15", compact)).toMatch(/^NIFTY 15 minutes: call OI \+2\.10 L · put OI \+1\.70 L across the 3 strikes around ATM$/);
    expect(heatMax(FLOW.heat!.ce)).toBe(80_000);
  });
  it("reads the Lab route, draws the bars, the movers and the heat map, with a card on every strike and cell", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.includes("/api/lab/oiflow/NIFTY"))).toBe(true);
    expect(screen.getByText(/46 snapshots from 09:15 to 11:30 IST/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /NIFTY OI change by strike, 15 minutes/ })).toBeTruthy();
    expect(screen.getByRole("list", { name: /Call strikes with the largest OI added and closed/ }).textContent).toMatch(/25,000\+2\.30 Ladded24,950−20\.0 Kclosed/);
    fireEvent.click(screen.getByRole("button", { name: "1 hour" }));
    expect(screen.getByRole("img", { name: /1 hour/ })).toBeTruthy();
    const row = document.querySelectorAll(".oiflw-bars .opul-row")[1];
    fireEvent.pointerMove(row, { clientX: 100, clientY: 100 });
    expect(screen.getByRole("tooltip").textContent).toMatch(/NIFTY 25,000.*At the money.*Put OI.*Call OI/);
    fireEvent.pointerMove(document.querySelectorAll(".oiflw-cell")[5], { clientX: 120, clientY: 120 });
    expect(screen.getByRole("tooltip").textContent).toMatch(/NIFTY 25,000 call.*11:27 → 11:30 IST.*\+80/);
    fireEvent.pointerMove(document.querySelectorAll(".oiflw-cell")[0], { clientX: 120, clientY: 120 });
    expect(screen.getByRole("tooltip").textContent).toMatch(/NIFTY 24,950 call.*11:21 → 11:24 IST/);
    fireEvent.click(screen.getByRole("button", { name: "Puts" }));
    expect(screen.getByRole("img", { name: /put OI change between snapshots/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(BANNED);
  });
  it("says plainly when there is no snapshot yet, and the last session when the market is closed", async () => {
    answer = { status: "ok", underlying: "NIFTY", session: null, today: false, marketOpen: false, available: false, detail: "No snapshot yet today: the first is taken at 09:15 and then every 3 minutes." };
    wrap(); await settle();
    expect(screen.getByText(/No snapshot yet today/)).toBeTruthy();
    cleanup(); answer = { ...FLOW, today: false, marketOpen: false };
    wrap(); await settle();
    expect(screen.getByText(/Last session \(2026-11-26\)/)).toBeTruthy();
  });
  it("on a phone the heat map keeps the latest 12 snapshots, readable, and says so", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("560px"), addEventListener: () => {}, removeEventListener: () => {} }));
    const times = Array.from({ length: 15 }, (_, i) => `10:${String(i * 3).padStart(2, "0")}`);
    answer = { ...FLOW, heat: { from: "09:57", times, strikes: [25000], ce: [times.map((_, i) => i * 10)], pe: [times.map(() => 0)] } };
    wrap(); await settle();
    expect(document.querySelectorAll(".oiflw-cell")).toHaveLength(12);
    expect(screen.getByText("The latest 12 snapshots; a wider screen shows the last 15.")).toBeTruthy();
    fireEvent.pointerMove(document.querySelectorAll(".oiflw-cell")[0], { clientX: 120, clientY: 120 });
    expect(screen.getByRole("tooltip").textContent).toMatch(/NIFTY 25,000 call.*10:06 → 10:09 IST.*\+30/);
  });
});

