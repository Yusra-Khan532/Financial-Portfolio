// @vitest-environment jsdom
// Reverse valuation page (task #69): a loaded company gives a headline answer, the miss scenarios and the grid; switching what to solve for changes the answer; a company without
// revenue history says so instead of showing numbers.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ fin: null as unknown }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, upgrade: vi.fn(), toast: vi.fn() }), TIER: { gold: { n: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</>, TierChip: () => null }));
vi.mock("../components/PageHeader", () => ({ PageHeader: () => <header /> }));
vi.mock("../components/SearchFilters", () => ({
  SearchFilters: () => null, FilterNote: () => null,
  useIndexFilter: () => ({ idx: { data: {} }, search: () => [], facets: [], filter: {}, setFilter: () => {}, count: 0, on: false, hidden: () => 0 }),
}));
vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  apiGet: async () => ({ symbol: "ABC", name: "ABC Ltd", sector: "IT", price: 100, priceAsOf: "2026-11-10", marketCap: 5000, shares: { diluted: 50, implied: 50 }, netDebt: { value: 500, period: "FY26" } }),
  useSection: () => ({ data: st.fin, isFetching: false }),
}));
import { ReverseValuationPage } from "./ReverseValuation";

afterEach(cleanup);
const years = (n: number) => Array.from({ length: n }, (_, i) => `FY${20 + i}`);
const fin = (rev: number[], op: number[]) => ({ yearly: { pl: { unit: "Cr", period: "year", periods: years(rev.length), periodEnds: [], rows: { revenue: rev, operating_profit: op } } } });
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/reverse-valuation?sym=ABC"]}><ReverseValuationPage /></MemoryRouter></QueryClientProvider>);

describe("reverse valuation page", () => {
  it("shows the required growth, the miss scenarios and the grid for a loaded company, and re-solves for another mode", async () => {
    st.fin = fin([600, 700, 820, 950, 1100, 1250], [100, 125, 150, 175, 205, 240]);
    open();
    await waitFor(() => expect(screen.getByRole("heading", { name: /Result:/ }).textContent).toMatch(/Required revenue CAGR/));
    expect(screen.getByText(/revenue must grow/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Miss scenarios" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Two-way grid/ })).toBeTruthy();
    expect(document.querySelectorAll(".rv-heat tbody tr").length).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "Margin" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /Result:/ }).textContent).toMatch(/Required final EBITDA margin/));
    expect(screen.getByText(/margin must reach/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Implied return" }));
    await waitFor(() => expect(screen.getByText(/return implied by today's price/)).toBeTruthy());
  });
  it("says plainly when the company has no revenue and operating profit history", async () => {
    st.fin = { yearly: { pl: { unit: "Cr", period: "year", periods: [], periodEnds: [], rows: {} } } };
    open();
    expect(await screen.findByText(/cannot be built/)).toBeTruthy();
  });
});
