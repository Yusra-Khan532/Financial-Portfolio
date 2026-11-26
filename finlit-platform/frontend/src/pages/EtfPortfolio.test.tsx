// @vitest-environment jsdom
// Task #276 (ETF portfolio, the 20 Nov pack; earlier #183 part 3): the page on the shared portfolio parts, with the live figures of 20 Nov for the pack's four
// ETFs (GOLDBEES, MID150BEES, SILVERBEES, SMALL250; lib/__fixtures__/etf276-*.json, built from the mockup, with the server's number fixes 2-5 applied).
// One test block per change of the pack: 1 add box, 2 compact top, 16 score and views, 11 view bar, 18 filters, 3 Edit | Sell, 8 ETF column, 9 Key figures,
// 5 company chips, 19 What changed; then the risk windows (fixes 4, 5), the plan gate, hidden sections, the questions, the disclaimer and the sources line.
import LIST from "../lib/__fixtures__/etf276-list.json";
import RISK from "../lib/__fixtures__/etf276-risk.json";
import INSIDE from "../lib/__fixtures__/etf276-inside.json";
import CHANGES from "../lib/__fixtures__/etf276-changes.json";
import SEARCH from "../lib/__fixtures__/etf276-search.json";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FX = (n: string): unknown => JSON.parse(JSON.stringify(({ list: LIST, risk: RISK, inside: INSIDE } as Record<string, unknown>)[n]));
const st = vi.hoisted(() => ({ plan: "gold", user: { id: "u1" } as { id: string } | null, book: null as unknown, put: [] as unknown[], add: vi.fn(async (b: { symbol: string }) => ({ symbol: b.symbol, merged: false })),
  remove: vi.fn(async () => ({})), clear: vi.fn(async () => ({ removed: 4, undoSeconds: 10 })), undo: vi.fn(async () => ({ restored: 4 })), list: null as unknown }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: st.plan, has: (t: string) => ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[st.plan] >= ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[t], upgrade: vi.fn(), toast: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: st.user }) }));
const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (path: string) => {
    if (path.startsWith("/api/me/etf-portfolio/book")) return JSON.parse(JSON.stringify(st.book ?? { portfolios: [], lots: [], names: [] }));
    if (path.startsWith("/api/discovery/changes")) return JSON.parse(JSON.stringify(CHANGES));
    if (path.startsWith("/api/alerts")) return { alerts: [], limit: 300 };
    if (path.startsWith("/api/etf?")) {   // the public ETF search: every word must match the symbol, name, fund house, kind or ISIN
      const q = new URLSearchParams(path.split("?")[1]).get("q") ?? "", hits = SEARCH.items.filter((e) => words(q).every((w) => `${e.symbol} ${e.name} ${e.fundHouse} ${e.categoryLabel} ${e.isin}`.toLowerCase().includes(w)));
      return { items: hits, total: hits.length, universe: SEARCH.universe, offset: 0, limit: 8, excluded: 0, categories: [], groups: [], asOf: null, updatedAt: null, source: "", disclaimer: "" };
    }
    return {};
  }),
  apiSend: vi.fn(async (_m: string, p: string, b: unknown) => { if (p.startsWith("/api/visits/")) return { previous: "2026-11-12T10:00:00Z" }; st.put.push(b); return { status: "saved" }; }) }));
vi.mock("../lib/etfPortfolio", async (orig) => {
  const m = await orig<typeof import("../lib/etfPortfolio")>();
  const mut = { mutateAsync: vi.fn(), isPending: false };
  return { ...m, useEtfPortfolio: (on: boolean) => ({ data: on ? st.list : undefined, isPending: false, isError: false }),
    useEtfRisk: () => ({ data: FX("risk"), isPending: false, isError: false }), useEtfInside: () => ({ data: FX("inside"), isPending: false, isError: false }),
    useEtfWrites: () => ({ add: { mutateAsync: st.add, isPending: false }, quantities: mut, preview: mut, commit: mut, clear: { mutateAsync: st.clear, isPending: false }, undoClear: { mutateAsync: st.undo, isPending: false }, remove: { mutateAsync: st.remove, isPending: false } }) };
});
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;   // the pinned tables (HScroll) measure themselves
import { EtfPortfolioPage, etfSteps } from "./EtfPortfolio";

beforeEach(() => { st.plan = "gold"; st.user = { id: "u1" }; st.book = null; st.put = []; st.list = FX("list"); st.add.mockClear(); });
afterEach(() => { cleanup(); localStorage.clear(); });
const open = async (path = "/etf-portfolio") => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}><MemoryRouter initialEntries={[path]}><EtfPortfolioPage /></MemoryRouter></QueryClientProvider>);
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  if (!path.includes("view=") && !/step=(?!all)/.test(path)) await waitFor(() => expect(document.querySelector("td.x-qty")).toBeTruthy());   // the saved buys are read
};
const text = (sel: string) => document.querySelector(sel)?.textContent ?? "";
const row = (sym: string) => screen.getAllByRole("link", { name: sym }).find((a) => a.closest("tbody"))!.closest("tr")!;
const L = (id: string, symbol: string, pf: string, date: string, qty: number, price: number, side: "buy" | "sell" = "buy") => ({ id, symbol, pf, side, qty, price, date });

describe("the plan gate", () => {
  it("Basic sees the plan gate, not the list", () => {
    st.plan = "basic";
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><EtfPortfolioPage /></MemoryRouter></QueryClientProvider>);
    expect(document.querySelector(".px-strip")).toBeNull();
    expect(screen.getByText("Track your ETFs")).toBeTruthy();
  });
  it("Silver sees the page with its own plan on the badge", async () => {
    st.plan = "silver";
    await open();
    expect(text(".ptk-plan")).toBe("Silver");
    expect(document.querySelector(".px-strip")).toBeTruthy();
  });
});

describe("1 Add box: suggestions while you type, by symbol, name, fund house, index or ISIN; Add several", () => {
  it("finds an ETF by the index it follows and by its ISIN, and adds the one picked", async () => {
    await open();
    const box = screen.getByRole("combobox", { name: "Add an ETF by name, symbol or ISIN" });
    fireEvent.change(box, { target: { value: "Midcap 150" } });
    const list = await screen.findByRole("listbox", { name: "ETFs found" });
    await waitFor(() => expect(within(list).getAllByRole("option").map((o) => o.querySelector("b")!.textContent)).toEqual(["MID150BEES", "MID150", "MOMIDMTM", "MIDCAPETF"]));
    expect(within(list).getAllByRole("option")[0].textContent).toMatch(/Nippon India ETF Nifty Midcap 150 · Midcap.*Nippon India · INF204KB1V68/);
    fireEvent.change(box, { target: { value: "INF769K01PQ4" } });
    await waitFor(() => expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.querySelector("b")!.textContent)).toEqual(["SMALL250"]));
    expect(within(screen.getByRole("listbox")).getByRole("option").textContent).toMatch(/ISIN match/);
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option"));
    await waitFor(() => expect(st.add).toHaveBeenCalledWith({ symbol: "SMALL250" }));
  });
  it("finds by fund house, says when nothing matches, and Add several resolves each row then adds it with its buy", async () => {
    await open();
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "Mirae" } });
    await waitFor(() => expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.querySelector("b")!.textContent)).toEqual(["SMALL250", "MIDCAPETF"]));
    fireEvent.change(box, { target: { value: "zzzz" } });
    await screen.findByText(/No ETF matches “zzzz”/);
    fireEvent.click(screen.getByRole("button", { name: "Add several" }));
    const dlg = screen.getByRole("dialog", { name: "Add several ETFs" });
    fireEvent.change(within(dlg).getByLabelText("Row 1: symbol, name or ISIN"), { target: { value: "NIFTYBEES" } });
    fireEvent.change(within(dlg).getByLabelText("Row 1: quantity"), { target: { value: "10" } });
    fireEvent.change(within(dlg).getByLabelText("Row 2: symbol, name or ISIN"), { target: { value: "nothing like this" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Add ETFs" }));
    await within(dlg).findByText(/One row was not found: “nothing like this”/);
    expect(st.add).not.toHaveBeenCalled();
    fireEvent.change(within(dlg).getByLabelText("Row 2: symbol, name or ISIN"), { target: { value: "" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Add ETFs" }));
    await waitFor(() => expect(st.add).toHaveBeenCalledWith({ symbol: "NIFTYBEES" }));
  });
});

describe("2 Compact top: the money box says what it covers; Your portfolios beside it", () => {
  it("the title row, and a money box that covers 0 of 4 ETFs with Add quantities", async () => {
    await open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ETF portfolio");
    expect(text(".ptk-asof")).toBe("Prices at close · 19 Nov");
    expect(text(".ptk-cov p")).toBe("Money figures cover 0 of 4 ETFs. None of GOLDBEES, MID150BEES, SILVERBEES and SMALL250 has a quantity yet; they count in every reading but not in the money. Add quantities");
    expect(text(".ptk-big")).toBe("—value now");
    expect([...document.querySelectorAll(".ptk-plist [role=radio] b")].map((b) => b.textContent)).toEqual(["All accounts", "My ETFs"]);
    fireEvent.click(screen.getByRole("button", { name: "Add quantities" }));
    expect(screen.getByRole("dialog", { name: "Edit GOLDBEES" })).toBeTruthy();
  });
  it("turns into a green line once every ETF has its buys; the three largest portfolios, then N more ▾", async () => {
    const pfs = ["a", "b", "c", "d"].map((id) => ({ id, name: `Account ${id.toUpperCase()}` }));
    st.book = { portfolios: pfs, names: [], lots: [L("1", "GOLDBEES", "a", "2025-01-01", 10, 80), L("2", "MID150BEES", "b", "2025-01-01", 10, 200), L("3", "SILVERBEES", "c", "2025-01-01", 10, 90), L("4", "SMALL250", "d", "2025-11-10", 100, 16)] };
    await open();
    expect(text(".ptk-covok")).toBe("✓Money figures cover all 4 ETFs. Every one has its buys and buy prices.");
    expect(document.querySelector(".ptk-cov")).toBeNull();
    expect(document.querySelectorAll(".ptk-plist [role=radio]")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "1 more ▾" }));
    expect(document.querySelectorAll(".ptk-plist [role=radio]")).toHaveLength(5);
  });
  it("the ⋯ menu holds the other pages, Add quantities and Clear portfolio (asks first, then offers Undo)", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "More: other pages, quantities and Clear portfolio" }));
    expect(screen.getByRole("menuitem", { name: "All my investments →" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear portfolio" }));
    const dlg = screen.getByRole("dialog");
    expect(dlg.textContent).toMatch(/4 ETFs/);
    fireEvent.click(within(dlg).getByRole("button", { name: /Clear/ }));
    await screen.findByRole("button", { name: /Undo/ });
    expect(st.clear).toHaveBeenCalled();
  });
});

// task #390 (developer file 34, Top 2–5): the dark cost card and the coloured view cards became four calm crowned cards; "You are here" / "Open →"
describe("16 Score and views: What your ETFs cost, then the three views (task #390: calm cards)", () => {
  it("the cost card lists each ETF's expense ratio; the open view says You are here, the others Open →", async () => {
    await open();
    expect(text(".px-cost .px-v")).toBe("0.50% a year");
    expect([...document.querySelectorAll(".px-cb li")].map((l) => l.textContent)).toEqual(["GOLDBEES0.81%", "SILVERBEES0.58%", "SMALL2500.33%", "MID150BEES0.28%"]);
    expect(text(".px-cost .px-x")).toBe("About ₹500 a year on ₹1 lakh. AMFI, 31 Oct.");
    const cards = [...document.querySelectorAll("button.px-vw")];
    expect(cards.map((t) => t.querySelector(".px-k")!.firstChild!.textContent)).toEqual(["Your ETFs", "What's inside", "Risk analytics"]);
    expect(cards.map((t) => t.querySelector(".px-k em")!.textContent)).toEqual(["You are here", "Open →", "Open →"]);
    expect(cards.map((t) => t.querySelector(".px-v")!.textContent)).toEqual(["4 ETFs", "About 400 companies", "Lower · moves 0.54×"]);
    expect(cards.map((t) => t.querySelector(".px-x")!.textContent)).toEqual(["SILVERBEES trades 0.48% below its value", "Through 2 share ETFs · 4 sizes · 12 macro sectors", "Swings 17.0% a year; the Nifty 500 14.4%"]);
    expect(document.body.textContent).not.toMatch(/seen three ways|Not opened yet|β/);
  });
  it("a card opens its view from anywhere on it; a Next view card ends each view", async () => {
    await open();
    fireEvent.click(document.querySelectorAll("button.px-vw")[1].querySelector(".px-x")!);
    expect(document.querySelectorAll("button.px-vw")[1].getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Next view\s*Risk analytics/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Next view\s*Risk analytics/ }));
    expect(document.querySelectorAll("button.px-vw")[2].getAttribute("aria-pressed")).toBe("true");
  });
});

describe("11 View bar (Bar B)", () => {
  it("the picker, the views, All sections, then the open view's numbered steps (one section per step)", async () => {
    await open();
    const bar = screen.getByRole("navigation", { name: "Views and sections" });
    expect(within(bar).getByRole("button", { name: "Portfolio: All accounts. Switch portfolio" })).toBeTruthy();
    expect(within(bar).queryAllByRole("button", { name: /\(not opened yet\)/ })).toHaveLength(0);
    await waitFor(() => expect([...bar.querySelectorAll(".eqt-chip")].map((c) => c.textContent)).toEqual(["1Your ETFs", "2What changed2 new", "3In short"]));
    fireEvent.click(within(bar).getByRole("button", { name: "All sections" }));
    expect(within(bar).getByRole("button", { name: "All sections" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("each view has its steps; Key figures sit in step 1; In short in every view", () => {
    const s = etfSteps(0);
    expect(s.etfs.steps.map((x) => x.label)).toEqual(["Your ETFs", "What changed", "In short"]);
    expect(s.inside.steps.map((x) => x.label)).toEqual(["What they own", "Money in", "Sectors in each", "Move together", "Shared stocks", "Company sizes", "Largest stocks", "In short"]);
    expect(s.risk.steps.map((x) => x.label)).toEqual(["At a glance", "Beta build", "Against the Nifty 500", "If the market fell", "Risk share", "Each ETF", "In short"]);
  });
});

describe("18 Filters in one row: Find an ETF · Type ▾ · Fund house ▾ · Columns", () => {
  it("Type: Gold leaves 1 of 4; each choice says how many it leaves; the set button turns dark and names the pick; a chip with ×; Clear filters", async () => {
    await open();
    const typeBtn = screen.getByRole("button", { name: /^Type: All/ });
    fireEvent.click(typeBtn);
    const menu = screen.getByRole("group", { name: "Type: choose one or more" });
    expect([...menu.querySelectorAll("[role=menuitemcheckbox]")].map((b) => b.textContent)).toEqual(["Indian shares2 ETFs", "Gold1 ETF", "Silver1 ETF"]);
    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: /Gold/ }));
    expect(text(".ptk-count")).toBe("Showing 1 of 4 ETFs");
    expect([...document.querySelectorAll("tbody .mfp-fund")].map((a) => a.textContent)).toEqual(["GOLDBEES"]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Type: choose one or more" })).toBeNull();
    const set = screen.getByRole("button", { name: /^Type: Gold/ });
    expect(set.className).toMatch(/\bset\b/);
    fireEvent.click(screen.getByRole("button", { name: "Remove Type: Gold" }));
    expect(text(".ptk-count")).toBe("4 ETFs");
    fireEvent.change(screen.getByRole("searchbox", { name: "Find an ETF in your list" }), { target: { value: "smallcap" } });
    expect([...document.querySelectorAll("tbody .mfp-fund")].map((a) => a.textContent)).toEqual(["SMALL250"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(document.querySelectorAll("tbody .mfp-fund")).toHaveLength(4);
  });
  it("Fund house counts within the other filter; Columns switch the table", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /^Fund house: All/ }));
    expect([...screen.getByRole("group", { name: "Fund house: choose one or more" }).querySelectorAll("[role=menuitemcheckbox]")].map((b) => b.textContent)).toEqual(["Mirae Asset1 ETF", "Nippon India3 ETFs"]);
    fireEvent.click(within(screen.getByRole("group", { name: "Columns" })).getByRole("button", { name: "Trading" }));
    expect(row("SILVERBEES").textContent).toMatch(/−0\.48%/);
  });
});

describe("8 ETF column and Tracks · type; 3 Edit | Sell", () => {
  it("the ETF column has the symbol, name, ISIN and Edit | Sell; Tracks · type names the index and the type", async () => {
    await open();
    const heads = [...document.querySelectorAll("table.x-grp thead tr:last-child th")].map((t) => t.textContent!.replace(/[▲▼]/g, "").trim());
    expect(heads.slice(0, 3)).toEqual(["ETF", "Tracks · type", "Qty"]);
    const mid = row("MID150BEES");
    expect(mid.querySelector("th")!.textContent).toBe("MID150BEESNippon India ETF Nifty Midcap 150INF204KB1V68Edit|Record a sale");   // task #390 (E1)
    expect(mid.querySelector(".etp-tracks")!.textContent).toBe("Nifty Midcap 150Indian shares");
    expect(row("GOLDBEES").querySelector(".etp-tracks")!.textContent).toBe("GoldCommodity");
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });
  it("Sell is greyed out with no quantity; Edit lists the buys with + Add a buy and Remove from this portfolio", async () => {
    await open();
    const sell = screen.getByRole("button", { name: "Record a sale of GOLDBEES: add a buy first" });
    expect(sell.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(sell);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit GOLDBEES" }));
    const dlg = screen.getByRole("dialog", { name: "Edit GOLDBEES" });
    expect(dlg.className).toBe("acc-dlg");
    vi.useFakeTimers();
    fireEvent.change(within(dlg).getByLabelText("Quantity in buy 1 of GOLDBEES"), { target: { value: "50" } });
    fireEvent.change(within(dlg).getByLabelText("Average buy price in buy 1 of GOLDBEES"), { target: { value: "80" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "+ Add a buy" }));
    expect(within(dlg).getAllByLabelText(/^Quantity in buy \d of GOLDBEES$/)).toHaveLength(2);
    fireEvent.click(within(dlg).getByRole("button", { name: "Save" }));
    await act(async () => { vi.advanceTimersByTime(1000); });
    vi.useRealTimers();
    expect((st.put.at(-1) as { lots: { symbol: string; qty: number; price: number }[] }).lots).toEqual([expect.objectContaining({ symbol: "GOLDBEES", qty: 50, price: 80 })]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Record a sale of GOLDBEES" }).getAttribute("aria-disabled")).toBe("false"));
    fireEvent.click(screen.getByRole("button", { name: "Edit GOLDBEES" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from this portfolio" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(st.remove).toHaveBeenCalledWith("GOLDBEES"));
  });
  it("Sell previews which buys it uses, first in, first out, with the booked gain", async () => {
    st.book = { portfolios: [], names: [], lots: [L("b1", "MID150BEES", "main", "2025-01-10", 10, 200), L("b2", "MID150BEES", "main", "2025-06-10", 10, 220)] };
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Record a sale of MID150BEES" }));
    const dlg = screen.getByRole("dialog", { name: "Record a sale of MID150BEES" });
    fireEvent.change(within(dlg).getByLabelText("Quantity of MID150BEES sold"), { target: { value: "15" } });
    fireEvent.change(within(dlg).getByLabelText("price at the sale of MID150BEES"), { target: { value: "240" } });
    expect([...dlg.querySelectorAll(".ptk-fifo li")].map((l) => l.textContent)).toEqual(["10 from the buy of 10 Jan 2025 at ₹200.00", "5 from the buy of 10 Jun 2025 at ₹220.00"]);
    expect(dlg.querySelector(".ptk-fifo")!.textContent).toMatch(/Booked gain or loss: \+₹500 on a cost of ₹3,100\./);
    fireEvent.change(within(dlg).getByLabelText("Quantity of MID150BEES sold"), { target: { value: "25" } });
    expect(dlg.querySelector(".ptk-fifo")!.textContent).toMatch(/Only 20 were held on that date/);
  });
});

describe("9 Key figures under the main section of each view; 5 company chips", () => {
  // task #390 reopened (developer file 39 v4, A2): Key figures arrives closed on every visit; each test opens it as a member would
  const openKf = () => fireEvent.click(screen.getByRole("button", { name: "Show: Key figures" }));
  // task #390 (E6, K1–K10): each card asks a question and answers with one big figure and its line
  const kf = () => [...document.querySelectorAll(".ptk-kf-c")].map((c) => `${c.querySelector(".ptk-kf-q .t")!.textContent} ${c.querySelector(".ptk-kf-big > b")!.textContent} ${c.querySelector(".ptk-kf-big strong")!.textContent}`);
  it("Your ETFs: cost, price against value (labelled by sign), the past year; each card with a bar, what it rests on and a link", async () => {
    await open();
    openKf();
    expect(kf()).toEqual(["What do your ETFs cost a year? 0.50% a year on average: about ₹500 on ₹1 lakh", "Which ETF trades furthest from its value? 0.48% SILVERBEES traded below its value on 19 Nov, the furthest of the four",
      "How did they do over the past year? +3.10% on average over the past year, price only"]);
    const cards = [...document.querySelectorAll(".ptk-kf-c")];
    expect(cards.map((c) => c.querySelector(".ptk-kf-go")!.textContent)).toEqual(["Sort by cost →", "Open the Trading columns →", "Sort by 1 year →"]);
    expect(cards[0].querySelector(".ptk-kf-f")).toBeNull();   // the method line sits behind the card's i (E6b)
    expect(cards.map((c) => c.querySelector(".ptk-kf-q .sp-i")!.getAttribute("aria-label"))).toEqual(["About “What do your ETFs cost a year?”", "About “Which ETF trades furthest from its value?”", "About “How did they do over the past year?”"]);
    expect(cards[1].querySelectorAll(".ptk-kf-rows li")).toHaveLength(4);
    fireEvent.click(cards[0].querySelector(".ptk-kf-go")!);
    expect([...document.querySelectorAll("tbody .mfp-fund")].map((a) => a.textContent)[0]).toBe("GOLDBEES");   // sorted by cost, highest first
    fireEvent.click(cards[1].querySelector(".ptk-kf-go")!);
    expect(screen.getByRole("button", { name: "Trading" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });   // the link's jump to the table runs after a short pause
  });
  it("What's inside: silver shows as silver (fix 2) in the key figure and in What your money is in; company chips open the company report", async () => {
    await open("/etf-portfolio?view=inside&step=all");
    openKf();
    expect(kf()).toEqual(["What does your money hold? 50% Indian shares. Gold 24.6%, silver 25%, debt and cash under 1%", "Where is most of your money underneath? 11.3% of your list is in Financial Services, just ahead of Consumer Discretionary at 11.0%",
      "How big are the companies underneath? 22.8% of your list is in mid-sized companies"]);
    expect([...document.querySelectorAll(".ptk-kf-leg")][0].textContent).toBe("Indian shares 50%Gold 24.6%Silver 25%Debt and cash 0.4%");
    expect(text(".etp-keys")).toMatch(/Silver 25%/);
    expect(text(".etp-keys")).not.toMatch(/Overnight lending and debt 2\d%/);
    expect(document.querySelector(".mfm-fbars")!.textContent).toMatch(/SILVERBEESSilver 99%/);
    // task #390 (file 34, I2): the chip shows the company's short name; it still opens the company report
    const chip = [...document.querySelectorAll<HTMLAnchorElement>("a.ptk-chipl")].find((a) => a.getAttribute("href") === "/stocks/FEDERALBNK")!;
    expect(chip.textContent).toBe("The Federal Bank");
    expect(chip.getAttribute("href")).toBe("/stocks/FEDERALBNK");
  });
  it("Risk: beta with its window, where the swings come from, how much it swings with the index's window", async () => {
    await open("/etf-portfolio?view=risk");
    openKf();
    expect(kf()).toEqual(["How much does your list move with the market? 0.54× it has moved about 5% when the Nifty 500 moved 10%", "Which ETF brings the most swing? 54% of the swings come from SILVERBEES, 25% of the list",
      "How much does it swing in a year? 17.0% in a typical year, against 14.4% for the Nifty 500"]);
    expect(document.querySelectorAll(".ptk-kf-f")).toHaveLength(0);
  });
  it("a Key figures card with nothing to say is skipped, and the section hides to a slim card with Hidden · its subtitle and Show ▾", async () => {
    const l = FX("list") as { items: { premium: number | null }[] }; l.items.forEach((e) => { e.premium = null; }); st.list = l;
    await open();
    openKf();
    expect(kf().map((k) => k.split("?")[0])).toEqual(["What do your ETFs cost a year", "How did they do over the past year"]);
    fireEvent.click(screen.getByRole("button", { name: "Hide: Key figures" }));
    const slim = document.querySelector(".ptk-hz")!;
    expect(slim.textContent).toBe("Key figuresHidden · What your 4 ETFs add up to, from the table above and the sections below.Show ▾");
    fireEvent.click(within(slim as HTMLElement).getByRole("button", { name: "Show: Key figures" }));
    expect(document.querySelectorAll(".ptk-kf-c")).toHaveLength(2);
  });
});

describe("19 What changed at the companies inside your ETFs", () => {
  it("lists the two order wins with their ETF and weight; Details opens Discover; Alert me opens the form", async () => {
    await open("/etf-portfolio?step=wc");
    const sec = await waitFor(() => { const s = document.getElementById("what-changed"); expect(s?.querySelector(".wc-rows")).toBeTruthy(); return s!; });
    expect(sec.querySelector("h2")!.firstChild!.textContent).toBe("What changed at the companies inside your ETFs");
    expect(sec.querySelector(".wp-sub")!.textContent).toBe("From Discover: companies that make up 0.3% or more of your ETFs and filed one of these in the last 90 days. GOLDBEES and SILVERBEES hold no companies.");
    expect(sec.querySelector(".wc-ln")!.textContent).toMatch(/^Inside your ETFs · \d+ companies$/);
    const tile = within(sec).getByRole("button", { name: /Order wins/ });
    expect(tile.textContent).toBe("Order wins2updates");   // task #390 (E7a): the count says what it counts
    expect(sec.textContent).toMatch(/An update is one kind of news from one company\. Some bundle several filings; the row then says how many\./);
    const rows = [...sec.querySelectorAll(".wc-rows li")].slice(0, 2);
    expect(rows.map((r) => r.querySelector(".wc-cow")!.textContent)).toEqual(["Welspun Corp0.36% of your ETFs · SMALL250", "GE Vernova T&D India0.33% of your ETFs · MID150BEES"]);
    expect(rows.map((r) => r.querySelector(".wc-k")!.textContent)).toEqual(["Order win · 3 filings", "Order win"]);   // E8a
    expect(rows.map((r) => r.querySelector(".wc-t")!.textContent!.replace(/New$/, ""))).toEqual(["3 order wins in 90 days · the subjects are in Discover", "1 order win in 90 days · the subjects are in Discover"]);
    expect(within(rows[0] as HTMLElement).getByRole("link", { name: "Details in Discover ↗" }).getAttribute("href")).toBe("/discover/changes/order?q=Welspun%20Corp");
    expect(within(rows[1] as HTMLElement).getByRole("link", { name: "Details in Discover ↗" }).getAttribute("href")).toBe("/discover/changes/order?q=GE%20Vernova%20T%26D%20India");
    expect(sec.querySelector(".wc-st")!.textContent).toBe("2 new since your last visit on 12 Nov");
    expect(sec.querySelector("details summary")!.textContent).toMatch(/^Not in Discover yet · 2/);   // E10: a closed list
    expect((sec.querySelector("details") as HTMLDetailsElement).open).toBe(false);
    expect([...sec.querySelectorAll(".wc-note")].at(-1)!.textContent).toMatch(/^MID150BEES and SMALL250 hold about 400 companies between them; smaller holdings than 0\.3% of your ETFs are left out here/);
    fireEvent.click(within(sec).getByRole("button", { name: "Alert me" }));
    expect(within(sec).getByRole("form", { name: "Tell me when a company in the companies inside your ETFs files" })).toBeTruthy();
  });
});

describe("Risk: the window of every beta and index figure (fixes 4, 5) and the level sentence (fix 3)", () => {
  it("prints 'vs Nifty 500 · weekly · past year' under each beta and the index's window beside its swing", async () => {
    await open("/etf-portfolio?view=risk&step=all");
    expect(text(".etp-level")).toBe("A little higher than the Nifty 500, because three of your four ETFs swing more than it.");
    expect(document.querySelector(".eqr-tiles")!.textContent).toMatch(/Nifty 500: 14\.4% \(3 yrs, daily\)/);
    const each = document.querySelector(".eqr-each")!;
    expect([...each.querySelectorAll(".etp-win")].map((w) => w.textContent)).toEqual(Array(4).fill("vs Nifty 500 · weekly · past year"));
    expect(document.body.textContent).not.toMatch(/1\.04/);   // the 3-year daily beta (betaDaily3y) is not shown
  });
  it("the Your ETFs table's Risk columns print the window under each beta and the list's", async () => {
    await open();
    fireEvent.click(within(screen.getByRole("group", { name: "Columns" })).getByRole("button", { name: "Risk" }));
    expect([...document.querySelectorAll(".mff-t .etp-win")].map((w) => w.textContent)).toEqual(Array(5).fill("vs Nifty 500 · weekly · past year"));
  });
});

describe("the end of the page", () => {
  it("ends with What this means in short, the questions, the disclaimer and the sources line", async () => {
    await open("/etf-portfolio?step=all");
    expect(screen.getByText("What this means, in short")).toBeTruthy();
    expect(screen.getByText("Why is the beta against the Nifty 500 and not each ETF's own index?")).toBeTruthy();
    expect(screen.getAllByText("Disclaimer").length).toBeGreaterThan(0);
    expect(text(".mfp-foot")).toMatch(/Information only, not investment advice\.$/);
    expect(document.body.textContent).not.toMatch(/\b(buy now|you should|best ETF|target price)\b/i);
  });
});
