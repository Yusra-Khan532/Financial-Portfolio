// @vitest-environment jsdom
// Developer file 33 (founder, 23 Nov 2026: "please check in All my investments, Your portfolios (right side box): ETFs not included in the calculation").
// Each row under Your portfolios is one account across the three pages (the same name on the Equity, MF and ETF pages). Its value counted the account's
// shares, and its funds or ETFs only when it was the only account of that kind; with two ETF accounts no row had its ETFs, while All accounts did.
// Two faults beside it: the rows took share prices from the picked account's answer (picking one account emptied the others), and the sticky account
// menu read "-1 holdings" for every account not picked. Sample shares, ETFs and amounts (myinvest/sample-qty.json).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QTY from "../myinvest/sample-qty.json";

type Answer = { shares: { symbol: string }[]; etfs: { symbol: string; qty: number | null; invested?: number | null }[]; funds: unknown[]; counts: Record<string, number> };
const st = vi.hoisted(() => ({ bodies: [] as { shares?: { symbol: string }[]; etfPf?: string; mfPf?: string }[], etfBook: null as unknown, mfBook: { portfolios: [{ id: "groww", name: "Groww" }] } as unknown }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  // the server's answer for one account holds only that account's shares and ETFs (myinvest/api.py: shares as sent, ETFs of etfPf)
  apiSend: vi.fn(async (_m: string, p: string, body: { shares: { symbol: string }[]; etfPf?: string; mfPf?: string }) => {
    if (p !== "/api/me/all-investments") return {};
    st.bodies.push(body);
    const a = structuredClone(QTY) as unknown as Answer, sent = new Set(body.shares.map((s) => s.symbol));
    a.shares = a.shares.filter((s) => sent.has(s.symbol));
    const units: Record<string, Record<string, number>> = { up: { NIFTYBEES: 200, MON100: 40 }, dhan: { NIFTYBEES: 100, GOLDBEES: 400 } };
    const cost: Record<string, Record<string, number>> = { up: { NIFTYBEES: 50000, MON100: 11200 }, dhan: { NIFTYBEES: 26000, GOLDBEES: 36000 } };
    if (body.etfPf && body.etfPf !== "all") a.etfs = body.etfPf === "none" ? [] : a.etfs.filter((e) => units[body.etfPf!][e.symbol]).map((e) => ({ ...e, qty: units[body.etfPf!][e.symbol], invested: cost[body.etfPf!][e.symbol] }));
    else a.etfs.forEach((e) => { e.invested = (cost.up[e.symbol] ?? 0) + (cost.dhan[e.symbol] ?? 0); });
    if (body.mfPf === "none") a.funds = [];
    a.counts = { shares: a.shares.length, funds: a.funds.length, etfs: a.etfs.length };
    return a;
  }),
  apiGet: vi.fn(async (p: string) => (p === "/api/me/mf-portfolio/book" ? structuredClone(st.mfBook) : p === "/api/me/etf-portfolio/book" ? structuredClone(st.etfBook) : {})) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, upgrade: vi.fn(), toast: vi.fn() }), TIER: { silver: { name: "Silver" }, gold: { name: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { portfolio } from "../lib/portfolio";
import { rupees } from "../lib/myInvest";
import { MyInvestmentsPage } from "./MyInvestments";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = vi.fn();
const mount = (path = "/my-investments") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><MyInvestmentsPage /></MemoryRouter></QueryClientProvider>);
const L = (id: string, symbol: string, pf: string, qty: number, price: number) => ({ symbol, qty, price, date: "2025-01-01", owned: true as const, pf, id });
const lot = (id: string, symbol: string, pf: string, qty: number, price: number) => ({ id, symbol, pf, side: "buy", qty, price, date: "2025-02-01" });
// the sample answer's closes: HDFCBANK 1712.4, INFY 1489, RELIANCE 1402.5, KPITTECH 1260.3, DIXON 16120, TITAN 3390; NIFTYBEES 286.6, GOLDBEES 111.9, MON100 302.4
const DHAN_SHARES = 40 * 1712.4 + 30 * 1489 + 4 * 16120 + 12 * 3390, DHAN_ETFS = 100 * 286.6 + 400 * 111.9;
const UP_SHARES = 25 * 1402.5 + 60 * 1260.3, UP_ETFS = 200 * 286.6 + 40 * 302.4;
const row = (name: string) => screen.getAllByRole("radio").find((r) => r.querySelector("b")?.textContent === name)!;

beforeEach(() => {
  st.bodies = []; localStorage.clear(); portfolio.reset();
  portfolio.replace({ holdings: [L("h", "HDFCBANK", "dhan", 40, 1500), L("i", "INFY", "dhan", 30, 1400), L("r", "RELIANCE", "up", 25, 1300), L("k", "KPITTECH", "up", 60, 0),
    L("d", "DIXON", "dhan", 4, 15000), L("t", "TITAN", "dhan", 12, 3000)], portfolios: [{ id: "dhan", name: "Dhan" }, { id: "up", name: "Upstox" }] });
  st.etfBook = { portfolios: [{ id: "up", name: "Upstox" }, { id: "dhan", name: "dhan" }], names: [],
    lots: [lot("e1", "NIFTYBEES", "up", 200, 250), lot("e2", "MON100", "up", 40, 280), lot("e3", "NIFTYBEES", "dhan", 100, 260), lot("e4", "GOLDBEES", "dhan", 400, 90)] };
});
afterEach(() => { cleanup(); Object.defineProperty(window, "scrollY", { value: 0, configurable: true }); });

describe("Your portfolios: each account with its ETFs (two ETF accounts)", () => {
  it("each row adds the account's ETFs, from its own buys, to its shares; the rows add up to All accounts", async () => {
    mount(); await screen.findByText("Where your money sits");
    await waitFor(() => expect(row("Dhan").textContent).toContain("4 shares · 2 ETFs"));
    expect(row("Dhan").textContent).toContain(rupees(DHAN_SHARES + DHAN_ETFS));
    // gain on what was paid: shares 60,000 + 42,000 + 60,000 + 36,000; ETFs 100 × 260 + 400 × 90
    const dhanPaid = 198000 + 62000;
    expect(row("Dhan").textContent).toContain(`+${(((DHAN_SHARES + DHAN_ETFS - dhanPaid) / dhanPaid) * 100).toFixed(1)}%`);
    expect(row("Upstox").textContent).toContain("2 shares · 2 ETFs");
    expect(row("Upstox").textContent).toContain(rupees(UP_SHARES + UP_ETFS));
    expect(row("Upstox").querySelector(".x-up, .x-dn")).toBeNull();                            // KPITTECH has no buy price: no gain shown
    const funds = 820.5 * 88.4 + 410.2 * 760.1 + 150 * 196.3;                                  // Groww is the only MF platform: the page's funds are its
    expect(row("Groww").textContent).toContain(rupees(funds));
    expect(row("All accounts").textContent).toContain(rupees(DHAN_SHARES + DHAN_ETFS + UP_SHARES + UP_ETFS + funds));
  });
  it("picking one account keeps every other row and All accounts as they were", async () => {
    mount(); await screen.findByText("Where your money sits");
    await waitFor(() => expect(row("Dhan").textContent).toContain(rupees(DHAN_SHARES + DHAN_ETFS)));
    const before = ["All accounts", "Dhan", "Upstox", "Groww"].map((n) => row(n).textContent);
    fireEvent.click(row("Upstox"));
    await waitFor(() => expect(st.bodies.at(-1)).toMatchObject({ etfPf: "up", mfPf: "none" }));
    await waitFor(() => expect(row("Upstox").getAttribute("aria-checked")).toBe("true"));
    await waitFor(() => expect(["All accounts", "Dhan", "Upstox", "Groww"].map((n) => row(n).textContent)).toEqual(before));
    // the money box on the left is the picked account's: its shares and its ETFs
    expect(screen.getByRole("region", { name: "All your investments" }).textContent).toContain(rupees(UP_SHARES + UP_ETFS));
  });
  it("the sticky account menu gives every account its holdings and value (it read \"-1 holdings\")", async () => {
    mount(); await screen.findByText("Where your money sits");
    await waitFor(() => expect(row("Dhan").textContent).toContain(rupees(DHAN_SHARES + DHAN_ETFS)));
    Object.defineProperty(window, "scrollY", { value: 400, configurable: true }); fireEvent.scroll(window);   // the bar sticks: its switch shows
    const sw = await waitFor(() => { const b = document.querySelector<HTMLButtonElement>(".x-sw-p"); if (!b) throw new Error("no switch yet"); return b; });
    fireEvent.click(sw);
    const menu = await screen.findByRole("menu", { name: "Portfolio" });
    const items = Object.fromEntries(within(menu).getAllByRole("menuitemradio").map((b) => [b.querySelector("b")!.textContent, b.querySelector("small")!.textContent]));
    expect(Object.values(items).join(" | ")).not.toMatch(/-1 /);
    expect(items.Dhan).toMatch(/^6 holdings · ₹2\.92 L · \+[\d.]+%$/);                       // 4 shares and 2 ETFs, as under Your portfolios
    expect(items.Upstox).toMatch(/^4 holdings · ₹1\.80 L$/);                                      // KPITTECH has no buy price: no gain
    expect(items.Groww).toMatch(/^3 holdings · ₹4\.14 L/);
  });
  it("an account on the ETF page only, and ETFs with no buys (names) counted, not valued", async () => {
    st.etfBook = { portfolios: [{ id: "up", name: "Upstox" }, { id: "dhan", name: "Dhan" }, { id: "z1", name: "Zerodha" }], names: ["GOLDBEES"],
      lots: [lot("e1", "NIFTYBEES", "up", 200, 250), lot("e2", "MON100", "z1", 40, 280), lot("e3", "NIFTYBEES", "dhan", 100, 260)] };
    mount(); await screen.findByText("Where your money sits");
    await waitFor(() => expect(row("Zerodha").textContent).toContain("1 ETF"));
    expect(row("Zerodha").textContent).toContain(rupees(40 * 302.4));
    expect(row("Upstox").textContent).toContain("2 shares · 2 ETFs");                            // GOLDBEES, a name only, sits in the first account
    expect(row("Upstox").textContent).toContain(rupees(UP_SHARES + 200 * 286.6));
  });
});
