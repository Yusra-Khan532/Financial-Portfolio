// @vitest-environment jsdom
// Task #277 (All my investments pack of 20 Nov 2026, change 19): What changed at the companies you own, under Step 4. The companies: held directly, or
// 0.1% or more of everything through funds and ETFs; the switch Everything · Direct · Through funds and ETFs · Watchlists; the line under each name is
// how it is held ("D F E 2.36% of everything"); Alert me sets one alert on the list that is open ("invest", "equity", "invest:through", "watch").
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
const sent = vi.hoisted(() => ({ get: [] as string[] }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ has: () => true, toast: vi.fn(), upgrade: vi.fn(), plan: "gold" }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(async (p: string) => { sent.get.push(p); return CHANGES; }) }));
import demo from "../../public/demo/my-investments.json";
import type { AllInvestments } from "../lib/myInvest";
import { watch } from "../lib/watchlist";
import { InvestChanges, changesOf } from "./Changes277";

afterEach(() => { cleanup(); sent.get = []; });
const D = () => structuredClone(demo) as unknown as AllInvestments;
const F = (d: string, t: string) => ({ n: 1, d, t, l: "https://nsearchives.nseindia.com/x.pdf", dates: [d] });
const CHANGES = { days: 90, events: [], notPlaced: [], companies: [{ s: "HDFCBANK", n: "HDFC Bank", ev: { rating: F("2026-11-14", "Credit rating reaffirmed") } }] };

function mount(d: AllInvestments) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><InvestChanges d={d} /></MemoryRouter></QueryClientProvider>);
}

describe("which companies", () => {
  it("held directly, or 0.1% or more of everything through funds and ETFs; never abroad", () => {
    const d = D(); delete (d as { changes?: unknown }).changes;
    const ch = changesOf(d), all = d.companies;
    expect(ch.direct).toEqual(all.filter((c) => c.symbol && !c.abroad && c.direct > 0).map((c) => c.symbol));
    expect(ch.through.every((s) => { const c = all.find((x) => x.symbol === s)!; return c.direct === 0 && c.all >= 0.1 && !c.abroad; })).toBe(true);
    expect(all.some((c) => c.symbol && c.direct === 0 && c.all < 0.1 && ch.through.includes(c.symbol))).toBe(false);
  });
  it("the server's list wins when the answer carries it", () => {
    const d = D(); d.changes = { direct: ["A"], through: ["B", "C"] };
    expect(changesOf(d)).toEqual({ direct: ["A"], through: ["B", "C"] });
  });
});

describe("the section", () => {
  it("title, the four-way switch with counts, the held line under the name, Filing ↗ and Details in Discover ↗", async () => {
    watch.replace({ lists: [{ id: "main", name: "My watchlist", symbols: ["TCS", "WHEELS"] }], meta: {} });
    const d = D(); d.changes = { direct: ["HDFCBANK", "RELIANCE"], through: ["TCS"] };
    mount(d);
    expect(screen.getByRole("heading", { name: "What changed at the companies you own" })).toBeTruthy();
    const sw = screen.getByRole("group", { name: "Which list" });
    expect(within(sw).getAllByRole("button").map((b) => b.textContent)).toEqual(["Everything · 3", "Direct · 2", "Through funds and ETFs, 0.1% or more · 1", "Watchlists · 2"]);
    const row = (await screen.findByRole("link", { name: "HDFC Bank" })).closest("li")!;
    const hd = d.companies.find((c) => c.symbol === "HDFCBANK")!;
    expect(row.querySelector(".wc-cs [aria-label]")?.getAttribute("aria-label") ?? row.querySelector(".mi7-wch")!.getAttribute("aria-label")).toBe(
      `${hd.held.map((m) => ({ D: "Direct", F: "Through a fund", E: "Through an ETF" })[m as "D"]).join(", ")}; ${hd.all.toFixed(2)}% of everything`);
    expect(row.querySelector(".wc-cs")!.textContent).toMatch(/^DFE\d+\.\d{2}% of everything$/);
    expect(within(row).getByRole("link", { name: "Details in Discover ↗" }).getAttribute("href")).toBe("/discover/changes/rating?q=HDFC%20Bank");
    expect(within(row).getByRole("link", { name: "Filing ↗" })).toBeTruthy();
    expect(sent.get[0]).toBe("/api/discovery/changes?symbols=" + encodeURIComponent("HDFCBANK,RELIANCE,TCS"));
    fireEvent.click(within(sw).getByRole("button", { name: /Watchlists/ }));
    expect(sent.get.at(-1)).toBe("/api/discovery/changes?symbols=" + encodeURIComponent("TCS,WHEELS"));
  });
  it("Alert me opens the one-alert form for the list that is open", () => {
    const d = D(); d.changes = { direct: ["HDFCBANK"], through: ["TCS"] };
    mount(d);
    fireEvent.click(screen.getByRole("button", { name: /Through funds and ETFs/ }));
    fireEvent.click(screen.getByRole("button", { name: "Alert me" }));
    expect(document.querySelector(".wc")!.textContent).toContain("All my investments (through funds and ETFs)");
    expect(screen.getByRole("button", { name: "Set alert" })).toBeTruthy();
  });
  it("a watchlist company you do not own says so under its name", async () => {
    watch.replace({ lists: [{ id: "main", name: "My watchlist", symbols: ["HDFCBANK"] }], meta: {} });
    const d = D(); d.companies = d.companies.filter((c) => c.symbol !== "HDFCBANK"); d.changes = { direct: [], through: [] };
    mount(d);
    fireEvent.click(screen.getByRole("button", { name: /Watchlists/ }));
    expect((await screen.findByRole("link", { name: "HDFC Bank" })).closest("li")!.querySelector(".wc-cs")!.textContent).toBe("On your watchlist · not owned");
  });
});
