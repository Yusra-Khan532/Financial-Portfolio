// @vitest-environment jsdom
// Task #235 phase 3a (the 18 Nov portfolios pack, C2, C4, C5, C6): the ETF portfolio by demat account. The accounts bar and "ETFs you add or upload go to",
// the money columns in three groups with each ETF's buys and sales (first in, first out within each account) and the total row, the money tiles, the Sold
// list, "Add quantities and buy prices", the view tabs with icons, the Analysing bar, and the saved book (PUT /book). The ETF figures are the stored
// fixtures of task #183; the book is stood in for.
import LIST from "../lib/__fixtures__/etfp-list.json";
import RISK from "../lib/__fixtures__/etfp-risk.json";
import INSIDE from "../lib/__fixtures__/etfp-inside.json";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const FX = (n: string): unknown => JSON.parse(JSON.stringify(({ list: LIST, risk: RISK, inside: INSIDE } as Record<string, unknown>)[n]));
const st = vi.hoisted(() => ({ book: null as unknown, put: [] as unknown[], asked: [] as string[] }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: "gold", has: () => true, toast: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async () => JSON.parse(JSON.stringify(st.book))), apiSend: vi.fn(async (_m: string, _p: string, b: unknown) => { st.put.push(b); return { status: "saved" }; }) }));
vi.mock("../lib/etfPortfolio", async (orig) => {
  const m = await orig<typeof import("../lib/etfPortfolio")>();
  const mut = { mutateAsync: vi.fn(), isPending: false };
  return { ...m, useEtfPortfolio: (on: boolean, pf = "all") => { if (on) st.asked.push(pf); return { data: on ? FX("list") : undefined, isPending: false, isError: false }; },
    useEtfRisk: () => ({ data: FX("risk"), isPending: false, isError: false }), useEtfInside: () => ({ data: FX("inside"), isPending: false, isError: false }),
    useEtfWrites: () => ({ add: mut, quantities: mut, preview: mut, commit: mut, clear: mut, undoClear: mut, remove: mut }) };
});
import { EtfPortfolioPage } from "./EtfPortfolio";

afterEach(() => { cleanup(); localStorage.clear(); st.put = []; st.asked = []; });
const ACCS = [{ id: "dhan", name: "Dhan", broker: "Dhan" }, { id: "upstox", name: "Upstox", broker: "Upstox" }];
const L = (id: string, symbol: string, pf: string, date: string | null, qty: number, price: number, side: "buy" | "sell" = "buy") => ({ id, symbol, pf, side, qty, price, date });
const BOOK = { portfolios: ACCS, names: [], lots: [L("n1", "NIFTYBEES", "dhan", "2025-01-10", 100, 250), L("n2", "NIFTYBEES", "dhan", "2025-06-10", 50, 270),
  L("n3", "NIFTYBEES", "dhan", "2025-08-01", 120, 280, "sell"), L("g1", "GOLDBEES", "upstox", "2025-03-01", 200, 60), L("m1", "MON100", "upstox", "2025-02-01", 10, 200),
  L("m2", "MON100", "upstox", "2025-09-01", 10, 260, "sell")] };
const open = async (path = "/etf-portfolio") => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}><MemoryRouter initialEntries={[path]}><EtfPortfolioPage /></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(document.querySelector(".x-lotbtn")).toBeTruthy()); };

describe("ETF accounts, buys and sales (pack C2, C5, C6)", () => {
  it("the accounts bar lists All accounts, Dhan and Upstox with count, value and gain; one account reads its own ETFs", async () => {
    st.book = BOOK;
    await open();
    expect([...document.querySelectorAll(".acc-t")].map((t) => t.querySelector("b")!.textContent)).toEqual(["All accounts", "Dhan", "Upstox"]);
    expect(document.querySelector('.acc-t[data-acc="dhan"] small')!.textContent).toBe("5 ETFs · ₹8,688 · +7.3%");   // NIFTYBEES: 30 left of the 270 buy = 8,100; 30 × 289.6; and the four ETFs with no buys yet
    expect(screen.getByLabelText("ETFs you add or upload go to")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Upstox/ }));
    expect(st.asked).toContain("upstox");
  });
  it("Returns & cost shows the three money groups; an ETF opens into its buys and sales, first in, first out; a total row sits at the foot", async () => {
    st.book = BOOK;
    await open();
    expect([...document.querySelectorAll("table.x-grp th.x-g")].map((t) => t.textContent)).toEqual(["What you paid", "What it is worth now", "Gain or loss"]);
    const heads = [...document.querySelectorAll("table.x-grp thead tr:last-child th")].map((t) => t.textContent!.replace(/[▲▼]/g, "").trim());
    expect(heads).toEqual(["ETF", "Tracks", "Qty", "Avg buy price", "Invested", "Price", "1 day", "Value now", "₹", "%", "1 year", "3 years", "5 years", "Expense ratioi"]);   // "i": the column's ⓘ
    const btn = screen.getByRole("button", { name: "Show the 2 buys · 1 sale of NIFTYBEES" });
    expect(btn.textContent).toMatch(/^30/);
    fireEvent.click(btn);
    const rows = [...document.querySelectorAll('tr.x-lot[data-lsym="NIFTYBEES"]')].map((r) => r.textContent);
    expect(rows[0]).toMatch(/all sold/); expect(rows[1]).toMatch(/30 left · 20 sold/); expect(rows[2]).toMatch(/FIFO: 2 buys/);
    expect(document.querySelector("tr.x-tot")!.textContent).toMatch(/^Total · 6 ETFs in 2 portfolios₹20,100/);   // NIFTYBEES 8,100 + GOLDBEES 12,000; four ETFs have no buys yet
    expect(screen.getByLabelText("Your money").textContent).toMatch(/Booked gain\+₹3,800/);   // NIFTYBEES 33,600 − (100 × 250 + 20 × 270) = 3,200; MON100 600
  });
  it("an ETF sold in full moves to the Sold list; Add quantities and buy prices opens the first ETF without a quantity", async () => {
    st.book = BOOK;
    await open();
    expect(document.querySelector(".x-sold-t")!.textContent).toMatch(/1 ETF sold in full.*\+₹600 booked/);
    fireEvent.click(screen.getAllByRole("button", { name: "Add quantities and buy prices" })[0]);
    await waitFor(() => expect(document.querySelector('tr.x-lot[data-lsym="SBINIFTY50"]')).toBeTruthy());   // the first ETF in the list with no buys
  });
  it("the view tabs have a colour and icon; What's inside and Risk carry the Analysing bar; a change is saved as the whole book", async () => {
    st.book = BOOK;
    await open();
    expect(screen.getAllByRole("tab").filter((t) => t.closest(".xv-tabs")).map((t) => t.querySelector("b")!.textContent)).toEqual(["Your ETFs", "What's inside", "Risk analytics"]);
    fireEvent.click(screen.getByRole("tab", { name: /What's inside/ }));
    expect(screen.getByRole("group", { name: "Portfolio being analysed" }).textContent).toMatch(/^AnalysingAll accountsDhanUpstox/);
    fireEvent.click(screen.getByRole("tab", { name: /Your ETFs/ }));
    fireEvent.click(screen.getByRole("button", { name: /of NIFTYBEES$/ }));
    vi.useFakeTimers();
    fireEvent.change(screen.getAllByLabelText("Quantity in this buy of NIFTYBEES")[0], { target: { value: "110" } });
    await act(async () => { vi.advanceTimersByTime(1000); });
    vi.useRealTimers();
    const sent = st.put.at(-1) as { portfolios: unknown[]; lots: { id: string; qty: number; price: number | null }[] };
    expect(sent.portfolios).toEqual(ACCS);
    expect(sent.lots.find((l) => l.id === "n1")).toMatchObject({ qty: 110, price: 250 });
    expect(sent.lots).toHaveLength(6);
  });
});
