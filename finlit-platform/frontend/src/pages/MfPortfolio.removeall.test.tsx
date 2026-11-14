// @vitest-environment jsdom
// MF portfolio "Remove all" (task #127): the button sits beside "Import a file", asks with the number of funds and says it cannot be undone, and removes them
// with one call to the server; with no funds there is no button.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MfPortfolio } from "../lib/mfPortfolio";

const st = vi.hoisted(() => ({ data: null as unknown, clear: null as unknown as ReturnType<typeof vi.fn>, toast: null as unknown as ReturnType<typeof vi.fn> }));
const mutation = () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() });
vi.mock("../lib/mfPortfolio", async (orig) => ({
  ...(await orig<typeof import("../lib/mfPortfolio")>()),
  useMfSpread: () => ({ data: undefined, isPending: false, isError: false, error: null }),
  useMfPortfolio: () => ({ data: st.data, isPending: false, isError: false, error: null, refetch: () => {} }),
  useMfWrites: () => new Proxy({}, { get: (_t, k) => (k === "clear" ? { ...mutation(), mutateAsync: st.clear } : mutation()) }),
}));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: st.toast, plan: "silver", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { MfPortfolioPage } from "./MfPortfolio";

const base = { plan: "silver", scoreLocked: true, limit: 500, dataDate: "2026-10-29", holdings: [], summary: { funds: 0, valued: 0, withCost: 0, gainFunds: 0, invested: 0, current: 0, gain: 0, gainPct: null, navFrom: null, navTo: null, notes: [], xirr: null, xirrFunds: 0, xirrWhy: null, score: { locked: true } },
  allocation: { byCategory: [], byAmc: [] }, concentration: { level: null, text: "", top1Pct: null, top3Pct: null }, disclaimer: "", scoreDisclaimer: "" };
beforeEach(() => { st.clear = vi.fn(async () => ({ status: "deleted", removed: 3 })); st.toast = vi.fn(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(cleanup);
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><MfPortfolioPage /></MemoryRouter></QueryClientProvider>);

describe("MF portfolio, Remove all", () => {
  it("asks with the count and the warning, then removes every fund with one call and says how many", async () => {
    st.data = { ...base, count: 3 } as unknown as MfPortfolio;
    open();
    const btn = screen.getByRole("button", { name: "Remove all" });
    expect(btn.closest(".mfp-add2")?.textContent).toContain("Import a file");       // beside "Import a file", in the add bar
    fireEvent.click(btn);
    expect(st.clear).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Remove all 3 funds?" }).textContent).toContain("This cannot be undone.");
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove all" }));
    await vi.waitFor(() => expect(st.clear).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(st.toast).toHaveBeenCalledWith("Removed 3 funds."));
  });
  it("says so plainly when the server cannot remove them", async () => {
    st.data = { ...base, count: 2 } as unknown as MfPortfolio; st.clear = vi.fn(async () => { throw new Error(""); });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Remove all" })); fireEvent.click(screen.getByRole("button", { name: "Yes, remove all" }));
    await vi.waitFor(() => expect(st.toast).toHaveBeenCalledWith("The funds could not be removed. Try again in a moment."));
  });
  it("has no Remove all button when there are no funds", () => {
    st.data = { ...base, count: 0 } as unknown as MfPortfolio;
    open();
    expect(screen.queryByRole("button", { name: "Remove all" })).toBeNull();
  });
});
