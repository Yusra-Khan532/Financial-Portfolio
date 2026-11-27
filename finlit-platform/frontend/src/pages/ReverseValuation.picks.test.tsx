// @vitest-environment jsdom
// Task #182: Reverse valuation gets the quick picks and "Last searched" companies that profit and revenue forecasting has. A company joins the list once its
// figures load; a chip loads that company.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, upgrade: vi.fn(), toast: vi.fn() }), TIER: { gold: { n: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</>, TierChip: () => null }));
vi.mock("../components/PageHeader", () => ({ PageHeader: () => <header /> }));
vi.mock("../components/CoLogo", () => ({ CoLogo: () => null }));
vi.mock("../components/SearchFilters", () => ({
  SearchFilters: () => null, FilterNote: () => null,
  useIndexFilter: () => ({ idx: { data: {} }, search: () => [], facets: [], filter: {}, setFilter: () => {}, count: 0, on: false, hidden: () => 0 }),
}));
vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  apiGet: async (path: string) => { const s = decodeURIComponent(path.split("/").pop()!); st.asked.push(s); return { symbol: s, name: s === "TCS" ? "Tata Consultancy Services Ltd" : s + " Ltd", sector: "IT", price: 100, priceAsOf: "2026-11-10", marketCap: 5000, shares: { diluted: 50, implied: 50 }, netDebt: { value: 500, period: "FY26" } }; },
  useSection: () => ({ data: null, isFetching: false }),
}));
import { ReverseValuationPage } from "./ReverseValuation";
import { readRvRecent } from "../lib/rvPick";

beforeEach(() => { localStorage.clear(); st.asked = []; });
afterEach(cleanup);
const open = (q = "") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/reverse-valuation" + q]}><ReverseValuationPage /></MemoryRouter></QueryClientProvider>);

describe("Reverse valuation quick picks and last searched (task #182)", () => {
  it("offers the forecasting page's five quick picks; a pick loads that company and joins Last searched", async () => {
    open();
    const picks = within(screen.getByRole("list", { name: "Quick picks" })).getAllByRole("button");
    expect(picks.map((b) => b.textContent)).toEqual(["Reliance", "TCS", "HDFC Bank", "Infosys", "ICICI Bank"]);
    expect(screen.queryByRole("list", { name: "Last searched" })).toBeNull();   // nothing opened yet
    fireEvent.click(picks[1]);
    await waitFor(() => expect(st.asked).toContain("TCS"));
    await waitFor(() => expect(readRvRecent()[0]).toEqual({ symbol: "TCS", name: "Tata Consultancy Services Ltd" }));
    expect(within(screen.getByRole("list", { name: "Quick picks" })).getByRole("button", { name: /TCS/ }).getAttribute("aria-pressed")).toBe("true");
  });
  it("lists the companies last opened here, newest first, leaving out the one open now", async () => {
    localStorage.setItem("finlit.reverse.recent", JSON.stringify([{ symbol: "ITC", name: "ITC Ltd" }, { symbol: "WIPRO", name: "Wipro Ltd" }]));
    open("?sym=ITC");
    await waitFor(() => expect(st.asked).toContain("ITC"));
    const last = within(screen.getByRole("list", { name: "Last searched" })).getAllByRole("button");
    expect(last.map((b) => b.textContent)).toEqual(["Wipro LtdWIPRO"]);
    fireEvent.click(last[0]);
    await waitFor(() => expect(st.asked).toContain("WIPRO"));
  });
  it("a broken stored list is ignored", () => {
    localStorage.setItem("finlit.reverse.recent", "{not json");
    expect(readRvRecent()).toEqual([]);
  });
});
