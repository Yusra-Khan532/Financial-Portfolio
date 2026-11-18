// @vitest-environment jsdom
// Task #235 phase 3c (the 18 Nov portfolios pack, C3, C4, C5, C6): All my investments by account and by value with gain. The accounts come from the three
// portfolio pages by name (Upstox on the Equity page and on the ETF page is one account); picking one sends that account's shares, MF platform and ETF
// account; the hero, Step 1 and In short show value now, invested and gain; the missing-figures note names what has no buy price; the fall is the Equity
// page's picture weighted by value; the FAQ explains how gain is worked out. The answer is the stored sample (myinvest/sample-qty.json).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QTY from "../myinvest/sample-qty.json";

const st = vi.hoisted(() => ({ bodies: [] as unknown[], answer: null as unknown }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiSend: vi.fn(async (_m: string, p: string, body: unknown) => { if (p === "/api/me/all-investments") { st.bodies.push(body); return structuredClone(st.answer); } return {}; }),
  apiGet: vi.fn(async (p: string) => (p === "/api/me/mf-portfolio/book" ? { portfolios: [{ id: "groww", name: "Groww" }] } : p === "/api/me/etf-portfolio/book" ? { portfolios: [{ id: "up", name: "Upstox" }] } : {})) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, upgrade: vi.fn(), toast: vi.fn() }), TIER: { silver: { name: "Silver" }, gold: { name: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { portfolio } from "../lib/portfolio";
import { MyInvestmentsPage } from "./MyInvestments";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = vi.fn();
const answer = () => { const a = structuredClone(QTY) as Record<string, unknown> & { funds: { invested?: number | null }[]; etfs: { invested?: number | null }[] };
  a.funds.forEach((f, i) => { f.invested = [60000, 250000, null][i]; }); a.etfs.forEach((e, i) => { e.invested = [80000, 40000, 11000][i]; }); return a; };
const mount = (path = "/my-investments") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><MyInvestmentsPage /></MemoryRouter></QueryClientProvider>);
const L = (id: string, symbol: string, pf: string, qty: number, price: number) => ({ symbol, qty, price, date: "2025-01-01", owned: true as const, pf, id });

beforeEach(() => {
  st.answer = answer(); st.bodies = []; localStorage.clear(); portfolio.reset();
  portfolio.replace({ holdings: [L("h", "HDFCBANK", "dhan", 40, 1500), L("i", "INFY", "dhan", 30, 1400), L("r", "RELIANCE", "up", 25, 1300), L("k", "KPITTECH", "up", 60, 0),
    L("d", "DIXON", "dhan", 4, 15000), L("t", "TITAN", "dhan", 12, 3000)], portfolios: [{ id: "dhan", name: "Dhan" }, { id: "up", name: "Upstox" }] });
});
afterEach(cleanup);

describe("All my investments by account and by value (pack C3)", () => {
  it("lists the accounts of the three pages by name; Upstox on the Equity and ETF pages is one account", async () => {
    mount(); await screen.findByText("Where your money sits");
    await waitFor(() => expect([...document.querySelectorAll(".acc-t b")].map((b) => b.textContent)).toEqual(["All accounts", "Dhan", "Upstox", "Groww"]));
    expect(document.querySelector(".acc-add")).toBeNull();                      // accounts are added on their portfolio pages
    fireEvent.click(screen.getByRole("tab", { name: /Upstox/ }));
    await waitFor(() => expect(st.bodies.at(-1)).toEqual({ shares: [{ symbol: "RELIANCE", qty: 25 }, { symbol: "KPITTECH", qty: 60 }], mfPf: "none", etfPf: "up" }));
    fireEvent.click(screen.getByRole("tab", { name: /Groww/ }));
    await waitFor(() => expect(st.bodies.at(-1)).toEqual({ shares: [], mfPf: "groww", etfPf: "none" }));
  });
  it("the hero, Step 1 and In short show value now, invested and gain; the note names the holdings without a buy price", async () => {
    mount(); await screen.findByText("Where your money sits");
    // shares: 40 × 1500 + 30 × 1400 + 25 × 1300 + 4 × 15000 + 12 × 3000 = 2,30,500 (KPITTECH has no buy price); funds 3,10,000 (one unknown); ETFs 1,31,000
    const hero = document.querySelector(".mi-dark-l")!.textContent!;
    expect(hero).toMatch(/^Value now\. \+₹[\d.,]+ L? ?\(\+[\d.]+%\) on ₹6\.72 L invested, 10 of 12 holdings with a buy price\./);
    const head = [...document.querySelectorAll(".mi-tb thead th")].slice(0, 5).map((t) => t.textContent);
    expect(head).toEqual(["Kind", "Holdings", "Invested", "Value now", "Gain / loss"]);
    expect(document.querySelector(".x-miss")!.textContent).toBe("10 of 12 holdings have a quantity and a buy price. Add the buy price for KPITTECH, HDFC Mid-Cap Opportunities on its portfolio page to count it in Invested and Gain.");
    expect(document.querySelector(".mi-count")!.textContent).toBe("6 shares · 3 mutual funds · 3 ETFs · buy prices for 10 of 12");
    expect(document.querySelector(".mi-short")!.textContent).toMatch(/By value now: shares 37%, mutual funds 47%, ETFs 16%\. \+₹[\d.,]+ L? ?\(\+[\d.]+%\) on ₹6\.72 L invested; buy prices for 10 of 12\./);
  });
  it("Step 6 shows the fall as the Equity page's picture, by value, with each kind's share of the money and the Nifty 500's worst fall", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect(screen.getByRole("heading", { name: /If the Nifty 500 fell 10%/ })).toBeTruthy();
    expect(document.querySelector(".fx-big b")!.textContent).toBe("−9.1%");                   // beta together 0.91
    expect([...document.querySelectorAll(".fx-size button")].map((b) => b.textContent)[2]).toBe("17.3%the Nifty 500’s worst in 3 years");
    expect([...document.querySelectorAll(".fx-c.part small")].map((x) => x.textContent)).toEqual(["37% of the money", "47% of the money", "16% of the money"]);
    expect(screen.getByText("How is profit or loss worked out?")).toBeTruthy();
  });
});
