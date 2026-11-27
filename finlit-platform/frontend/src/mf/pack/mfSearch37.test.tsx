// @vitest-environment jsdom
// Developer file 37 (23 Nov 2026): typing "quant" in the MF portfolio's add box showed 8 funds (quant PSU, BFSI, Gilt ...) and never quant Small Cap.
// Now the boxes ask GET /api/mf/search (one row per fund, the larger fund first among equal matches) and show every fund it returns, saying when more match.
// Sample fund names and sizes only.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let TOTAL = 35;
vi.mock("../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../lib/api")>()),
  apiGet: vi.fn(async (path: string) => { calls.push(path); const n = Math.min(30, TOTAL); return { q: "quant", total: TOTAL, items: FUNDS.slice(0, n) }; }),
}));
import { AddBox } from "../../portfolio/kit/AddBox";
import { FundGroupSearch, SEARCH_FUNDS, moreLine, useFundGroupResults } from "./MfAdd";

// as the server answers "quant": the larger fund first; each fund with four plans and options
const NAMES = ["quant Small Cap Fund", "quant ELSS Tax Saver Fund", "quant Mid Cap Fund", "quant Flexi Cap Fund", "quant Large Cap Fund", "Quant Value Fund", "quant Liquid Fund",
  "quant PSU Fund", "Quant Focused Fund", "quant BFSI Fund", "quant Teck Fund", "quant Gilt Fund"];
const FUNDS = Array.from({ length: 35 }, (_, i) => {
  const name = NAMES[i] ?? `quant Sample Fund ${i + 1}`;
  return { key: `quant mutual fund|${name.toLowerCase()}`, name, amc: "quant Mutual Fund", category: "Equity Scheme - Sample", aum: 30000 - i * 500,
    variants: [["Direct", "Growth"], ["Regular", "Growth"], ["Direct", "IDCW"], ["Regular", "IDCW"]].map(([plan, option], j) => ({ code: 900000 + i * 10 + j, name, amc: "quant Mutual Fund", category: "Equity Scheme - Sample", plan, option, active: true, navDate: "2026-11-21" })) };
});

afterEach(() => { cleanup(); calls.length = 0; TOTAL = 35; });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const box = () => <AddBox placeholder="Add a fund by name or ISIN" noun={["fund", "funds"]} useResults={useFundGroupResults} onAdd={() => undefined} resolve={async () => null} onSeveral={() => undefined} />;

describe("the MF portfolio's add box (developer file 37)", () => {
  it("typed 'quant': quant Small Cap first, every fund the search gives (not 8), and how many more match", async () => {
    wrap(box());
    const input = screen.getByRole("combobox");
    fireEvent.focus(input); fireEvent.change(input, { target: { value: "quant" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(30));
    expect(calls[0]).toBe(`/api/mf/search?q=quant&limit=${SEARCH_FUNDS}`);
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")[0].textContent).toBe("quant Small Cap Fundquant Mutual Fund · Sample4 plans and options: Regular or Direct · Growth or IDCW");
    expect(within(list).getAllByRole("option").map((o) => o.querySelector("b")!.textContent).slice(0, 5)).toEqual(NAMES.slice(0, 5));
    expect(list.textContent).toContain("30 of 35 funds shown · keep typing to narrow");
  });
  it("when every match is shown, no 'keep typing' line", async () => {
    TOTAL = 12;
    wrap(box());
    const input = screen.getByRole("combobox");
    fireEvent.focus(input); fireEvent.change(input, { target: { value: "quant" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(12));
    expect(screen.getByRole("listbox").textContent).not.toContain("keep typing");
  });
});

describe("Add several's search (FundGroupSearch)", () => {
  it("shows every fund the search gives and says when more match", async () => {
    wrap(<FundGroupSearch onPick={() => undefined} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Search a mutual fund/ }), { target: { value: "quant" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(30));
    expect(screen.getAllByRole("option")[0].textContent).toMatch(/^quant Small Cap Fund/);
    expect(screen.getByRole("listbox").textContent).toContain("30 of 35 funds shown · keep typing to narrow");
  });
  it("the line reads the counts", () => {
    expect(moreLine(30, 35)).toBe("30 of 35 funds shown · keep typing to narrow");
    expect(moreLine(12, 12)).toBe("");
  });
});
