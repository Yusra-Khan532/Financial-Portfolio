// @vitest-environment jsdom
// Task #156: "give deselect button if i select any company below search bar" and "change name of calculator to pe, eps and peg calculator".
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn() }) }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header> }));
vi.mock("../components/SearchFilters", () => ({
  SearchFilters: () => null, FilterNote: () => null,
  useIndexFilter: () => ({ idx: { data: {} }, search: (q: string) => (q ? [["RELIANCE", "Reliance Industries Ltd"]] : []), facets: [], filter: {}, setFilter: () => {}, count: 0, on: false, hidden: () => 0 }),
}));
const SUMMARY = { meta: { symbol: "RELIANCE", statement: "consolidated" }, profile: { name: "Reliance Industries Ltd" }, quote: { price: 1339.6, asOf: "2026-11-13" } };
const FIN = { meta: { symbol: "RELIANCE" }, yearly: { pl: { periods: ["FY26"], periodEnds: ["2026-03-31"], rows: { net_profit: [80775], diluted_shares_cr: [1353.2], eps: [59.69] } } } };
vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  useSummary: (s: string, on: boolean) => ({ data: on && s ? SUMMARY : undefined, isFetching: false, isError: false }),
  useSection: (s: string, _k: string, on: boolean) => ({ data: on && s ? FIN : undefined, isFetching: false, isError: false }),
}));
import { EpsCalculatorPage } from "./EpsCalculator";

afterEach(cleanup);
const open = (path = "/eps-calculator") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><EpsCalculatorPage /></MemoryRouter></QueryClientProvider>);
const val = (id: string) => (document.getElementById("eps-" + id) as HTMLInputElement).value;

describe("P/E, EPS & PEG calculator (#156)", () => {
  it("is named P/E, EPS & PEG calculator, in the heading and in the browser tab", () => {
    open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("P/E, EPS & PEG calculator");
    expect(document.title).toMatch(/^P\/E, EPS & PEG calculator/);
  });
  it("shows no Deselect until a company is chosen", () => {
    open();
    expect(screen.queryByRole("button", { name: /^Deselect/ })).toBeNull();
  });
  it("a chosen company can be deselected from right below the search bar: its figures go, the scenario typed stays", async () => {
    open();
    const search = screen.getByPlaceholderText("Company name or NSE symbol");
    fireEvent.change(search, { target: { value: "Reliance" } });
    fireEvent.click(screen.getByRole("button", { name: /Reliance Industries Ltd/ }));
    await waitFor(() => expect(val("np")).toBe("80775"));
    expect(val("px")).toBe("1339.6");
    fireEvent.change(document.getElementById("eps-g")!, { target: { value: "15" } });        // the person's own growth assumption
    const btn = screen.getByRole("button", { name: "Deselect Reliance Industries Ltd" });
    const row = search.closest(".dcf-co-row")!;
    expect(row.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();  // below the search bar
    expect(btn.closest(".eps-chosen")!.previousElementSibling).toBe(row);                         // directly below it
    fireEvent.click(btn);
    expect(screen.queryByRole("button", { name: /^Deselect/ })).toBeNull();
    expect(document.querySelector(".dcf-src")).toBeNull();                                      // the company's source lines go
    expect([val("np"), val("px")]).toEqual(["100", "300"]);                                     // back to the starting example
    expect(val("g")).toBe("15");                                                                // the scenario stays
    expect(document.activeElement).toBe(search);                                                // ready for the next company
  });
});
