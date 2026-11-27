// @vitest-environment jsdom
// Developer file 51: the industry in numbers, drawn (its states: the rows, too few companies, a failed load).
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../lib/screener";

const st = vi.hoisted(() => ({ rows: [] as unknown[], groups: {} as Record<string, { slug: string; name: string }>, fail: false }));
vi.mock("../lib/screener", async (orig) => ({ ...(await orig<typeof import("../lib/screener")>()), useUniverse: () => ({ data: { rows: st.rows, asOf: "2026-11-26", sample: false, prism: null }, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(async () => { if (st.fail) throw new Error("offline"); return { date: "2026-11-20", groups: st.groups }; }) }));
import { IndustryNumbers } from "./pack/IndustryNumbers";

afterEach(cleanup);
const g = { slug: "petroleum-products", name: "Petroleum Products", kind: "industry" as const, sector: "Oil Gas & Consumable Fuels", industries: ["Petroleum Products"] };
const row = (symbol: string, roe: number, pe: number, cap = 1000): Row => ({ symbol, name: symbol, roe, pe, pb: 1, roce: roe, operating_margin: 10, debt_to_equity: 0.3, sales_cagr: 10, profit_cagr: 9, dividend_yield: 1, market_cap: cap, nse_industry: "Petroleum Products" } as Row);
const draw = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IndustryNumbers symbol="ME" name="Reliance" g={g} /></QueryClientProvider>);

describe("The industry in numbers, drawn", () => {
  it("who makes up the industry, what stands out, then nine plain rows in four groups and the source line", async () => {
    st.fail = false; st.rows = [row("ME", 8.7, 22.6, 80_000), row("A", 22, 6, 9000), row("B", 25, 7, 6000), row("C", 20, 8, 3000), row("D", 30, 6.5, 2000), row("X", 1, 99, 1e7)];
    st.groups = Object.fromEntries(["ME", "A", "B", "C", "D"].map((s) => [s, { slug: "petroleum-products", name: "Petroleum Products" }]));
    const { container } = draw();
    await waitFor(() => expect(container.querySelectorAll(".in-row:not(.in-hd)")).toHaveLength(9));
    expect(container.querySelector(".in-part .in-txt")!.textContent).toMatch(/^Reliance is the largest of the 5 Petroleum Products companies, with 80% of the industry's market value; the next largest, A and B, have 9\.0% and 6\.0%\.$/);
    expect(container.querySelectorAll(".in-bar i")).toHaveLength(5);   // the four largest and "the other 1"
    expect([...container.querySelectorAll(".in-grp > .in-gt")].map((x) => x.textContent)).toEqual(["Valuation", "Returns and margin", "Growth over five years", "Debt"]);
    expect(container.querySelector(".in-stand li")!.textContent).toBe("Reliance is priced at more times its profit: 22.6×, against 7.0× for the typical company.");
    const pe = container.querySelectorAll(".in-row:not(.in-hd)")[0];
    expect(pe.querySelector(".in-what")!.textContent).toMatch(/^Price for each ₹1 of yearly profitP\/E/);
    expect(pe.querySelector(".in-sw b")!.textContent).toBe("Among the highest");
    expect(screen.getByText(/FinLit's screener figures of 26 Nov 2026 for the 5 NSE-listed Petroleum Products companies/)).toBeTruthy();
    expect(container.querySelector(".in-dot, .in-strip")).toBeNull();   // no dot strips any more
  });
  it("too few companies, and a failed load, each say why", async () => {
    st.fail = false; st.rows = [row("ME", 8, 20), row("A", 9, 9)]; st.groups = { ME: { slug: "petroleum-products", name: "x" }, A: { slug: "petroleum-products", name: "x" } };
    draw();
    await waitFor(() => expect(screen.getByText(/Too few Petroleum Products companies have screener figures for a comparison \(2\)/)).toBeTruthy());
    cleanup(); st.fail = true;
    draw();
    await waitFor(() => expect(screen.getByText(/The industry's figures could not be loaded/)).toBeTruthy(), { timeout: 5000 });   // the block retries once
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
