// @vitest-environment jsdom
// Watchlists as the "FinLit final pages" pack draws it (board 16): the header with the lists, five tiles, My watchlist grouped Against peers with the
// insight cards and the table (company, industry, price, P/E, ROE, size, the plan's score, against peers, target, your note), Price and business disagree,
// Tell me when a label changes and the page's questions. Kept at the founder's request: row actions, list management, compare and sorting.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../lib/screener";
import type { ListLead } from "../lib/watchlistPack";

const R = (symbol: string, name: string, sector: string, overall: number, band: string, change: number, over: Partial<Row> = {}): Row => ({
  symbol, name, sector, overall, band, price: 100, market_cap: 6000, pe: 20, pb: 3, roe: 15, roce: 18, dividend_yield: 1, debt_to_equity: 0.2, sales_cagr: 8, profit_cagr: 9, operating_margin: 20,
  change_pct: change, return_1m: 1, return_1y: 10, pillar_quality: 60, pillar_growth: 60, pillar_profitability: 60, pillar_balance: 60, pillar_technical: 60, ...over,
} as unknown as Row);
const lead = (rank: number, fr: number, rel52: number): ListLead => ({ available: true, label: "leader", rank, ranked: 20, group: "Auto Parts: OEM", sector: "Nifty Auto", sectorKind: "index", rel52, fundamentalRank: fr, fundamentalOf: 20, fundamentalNote: "below_peers" });
const st = vi.hoisted(() => ({ rows: [] as unknown[], toast: vi.fn(), gold: true, leads: null as unknown }));
vi.mock("../lib/screener", async (orig) => ({ ...(await orig<typeof import("../lib/screener")>()), useUniverse: () => ({ data: { rows: st.rows, sample: false, asOf: "2026-11-06" }, isLoading: false, isError: false, refetch: () => undefined }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ has: (t: string) => t !== "gold" || st.gold, toast: st.toast, upgrade: vi.fn(), plan: st.gold ? "gold" : "silver" }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("../lib/planScore", async (orig) => ({ ...(await orig<typeof import("../lib/planScore")>()), usePlanModel: () => (st.gold ? "prism" : "iq") }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), useQuotesFor: () => ({ data: { rows: [] }, isLoading: false }) }));
vi.mock("../lib/indices", async (orig) => ({ ...(await orig<typeof import("../lib/indices")>()), useIndices: () => ({ data: { asOf: "2026-11-06", live: false, marketOpen: false, items: [], key: [] } }) }));
vi.mock("../lib/leadership", async (orig) => ({ ...(await orig<typeof import("../lib/leadership")>()), useLeadershipList: () => ({ data: st.leads, isLoading: false }) }));
vi.mock("../components/PageFaqs", () => ({ PageFaqs: () => <section aria-label="Questions about this page" /> }));
vi.mock("../components/AlertComposer", () => ({ AlertButton: ({ symbol, className }: { symbol: string; className?: string }) => <button className={className} aria-label={`Create an alert for ${symbol}`} /> }));
import { WatchlistPage } from "./Watchlist";
import { watch } from "../lib/watchlist";

const PACK = ["WHEELS", "SSWL", "LOTUSDEV"];
beforeEach(() => {
  localStorage.clear();
  watch.reset();
  st.gold = false;
  st.rows = [
    R("WHEELS", "Wheels India Ltd", "Auto Components & Equipments", 73, "healthy", -3.49, { price: 2321, pe: 30, roe: 12.9, market_cap: 6235, prism_final: 77, prism_label: "STRONG", prism_status: "RATED" } as Partial<Row>),
    R("SSWL", "Steel Strips Wheels Ltd", "Auto Components & Equipments", 70, "healthy", 1.48, { price: 538.9, pe: 28.8, roe: 14.8, market_cap: 8475, prism_final: 64, prism_label: "AVERAGE", prism_status: "RATED" } as Partial<Row>),
    R("LOTUSDEV", "Sri Lotus Developers & Realty Ltd", "Realty", 69, "healthy", -0.09, { price: 233.5, pe: 39, roe: 12.4, market_cap: 11412 } as Partial<Row>),
  ];
  st.leads = { available: true, asOf: "2026-11-06", rows: { WHEELS: lead(2, 16, 1.524679), SSWL: lead(3, 18, 1.424434), LOTUSDEV: { available: false, reason: "history", text: "Under a year of prices" } } };
  st.toast.mockClear();
});
afterEach(cleanup);
const open = () => { for (const s of PACK) watch.add(s); return render(<MemoryRouter><WatchlistPage /></MemoryRouter>); };
const table = () => screen.getByRole("table", { name: /your stocks/i });
const rowOf = (sym: string) => within(table()).getByRole("link", { name: new RegExp("^" + sym) }).closest("tr") as HTMLElement;

describe("Watchlists, as the pack draws it", () => {
  it("has the header, the lists and Add a stock", () => {
    open();
    expect(screen.getByRole("heading", { level: 1, name: "Watchlists" })).toBeTruthy();
    expect(screen.getByText("SILVER")).toBeTruthy();
    expect(screen.getByText("The companies you are keeping an eye on: how they are doing, how they compare with their peers, and what to look at next.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "My watchlist · 3", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ New list" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Add a stock to this list")).toBeTruthy();
  });
  it("shows the five tiles with the pack's words from the real figures", () => {
    open();
    const tile = (k: string) => screen.getByText(k, { selector: ".wp-tile > span" }).parentElement as HTMLElement;
    expect(tile("Stocks").textContent).toBe("Stocks32 small · 1 mid company");
    expect(tile("On Friday").textContent).toBe("On Friday1 up · 2 downWHEELS −3.5%, LOTUSDEV −0.1%, SSWL +1.5%");
    expect(tile("Average FinLit IQ").textContent).toBe("Average FinLit IQ71All three Healthy");
    expect(within(tile("Against peers")).getByText("2 lead")).toBeTruthy();
    expect(within(tile("Against peers")).getByText("1 not compared (under a year of prices)")).toBeTruthy();
    expect(within(tile("Against peers")).getByRole("button", { name: "About Against peers" })).toBeTruthy();
    expect(tile("Concentration").textContent).toBe("Concentration67%in one industry: auto components & equipments");
  });
  it("groups the table Against peers, with the cards over it and the pack's columns", () => {
    open();
    expect(screen.getByRole("heading", { name: "My watchlist" })).toBeTruthy();
    expect(screen.getByText("Grouped by how each stock did against its peers over 12 months.")).toBeTruthy();
    for (const g of ["Against peers", "Industry", "Size"]) expect(within(screen.getByRole("group", { name: "Group by" })).getByRole("button", { name: g })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Group by" })).getByRole("button", { name: "Download" })).toBeTruthy();
    expect(screen.getByText("Price leads, the business lags")).toBeTruthy();
    expect(screen.getByText("Two of three stocks in one industry")).toBeTruthy();
    expect(screen.getByText("LOTUSDEV has under a year of prices")).toBeTruthy();
    const heads = within(table().querySelector("thead") as HTMLElement).getAllByRole("columnheader").map((h) => h.textContent?.replace(/i$/, "").trim());
    expect(heads).toEqual(["Company", "Industry", "Price", "P/E", "ROE", "Size", "FinLit IQ", "Against peers", "Target", "Your note", "Actions"]);
    for (const k of ["P/E", "ROE", "Size", "FinLit IQ", "Against peers", "Target"]) expect(within(table()).getByRole("button", { name: `About ${k}` })).toBeTruthy();
    const groupRows = within(table()).getAllByRole("columnheader").filter((h) => h.getAttribute("scope") === "colgroup").map((h) => h.textContent);
    expect(groupRows).toEqual(["Leaders2 stocks", "Not compared1 stock"]);
    const w = rowOf("WHEELS");
    for (const t of ["Auto Components & Equipments", "₹2,321.00", "−3.49%", "30.0×", "12.9%", "Small", "73", "Healthy", "Leader", "2 of 20 Auto Parts: OEM"]) expect(within(w).getByText(t)).toBeTruthy();
    expect(within(rowOf("LOTUSDEV")).getByText("Not compared")).toBeTruthy();
    expect(within(rowOf("LOTUSDEV")).getByText("Under a year of prices")).toBeTruthy();
    expect(within(rowOf("LOTUSDEV")).getByText("Mid")).toBeTruthy();
    // within Leaders, the peer rank orders the rows (2nd, then 3rd)
    expect(within(table()).getAllByRole("link").map((a) => a.querySelector("b")?.textContent)).toEqual(["WHEELS", "SSWL", "LOTUSDEV"]);
  });
  it("Gold sees FinLit Prism in the same places (task #100), never the FinLit IQ", () => {
    st.gold = true; open();
    expect(within(table()).getByRole("columnheader", { name: /FinLit Prism/ })).toBeTruthy();
    expect(within(table()).queryByRole("columnheader", { name: /FinLit IQ/ })).toBeNull();
    expect(within(rowOf("WHEELS")).getByText("77")).toBeTruthy();
    expect(screen.getByText("Average FinLit Prism")).toBeTruthy();
    expect(within(rowOf("LOTUSDEV")).getByText("Not rated yet")).toBeTruthy();
  });
  it("shows Price and business disagree with each stock's two ranks and the gap to its sector index", () => {
    open();
    const sec = screen.getByRole("heading", { name: /Price and business disagree/ }).closest("section") as HTMLElement;
    expect(within(sec).getByText("The peer tag is about the share price. The business score ranks the company's results and balance sheet within the same group.")).toBeTruthy();
    expect(within(sec).getByText("When the price is far ahead of the business, the market may be expecting a lot. It is a prompt to read the report, not a call to act.")).toBeTruthy();
    expect(within(sec).getByText("2 of 20")).toBeTruthy(); expect(within(sec).getByText("16 of 20")).toBeTruthy();
    expect(within(sec).getByText("3 of 20")).toBeTruthy(); expect(within(sec).getByText("18 of 20")).toBeTruthy();
    expect(within(sec).getByText("Price +152.5 pts vs Nifty Auto over 12 months.")).toBeTruthy();
    expect(within(sec).getByText("Price +142.4 pts vs Nifty Auto over 12 months.")).toBeTruthy();
  });
  it("saves the label-change alert with the list, and can switch it off", () => {
    open();
    const sec = screen.getByRole("heading", { name: "Tell me when a label changes" }).closest("section") as HTMLElement;
    expect(within(sec).getByText("An alert when a stock on this list becomes a Leader, In line or a Laggard, sent after the weekly check.")).toBeTruthy();
    expect(within(sec).getByRole("button", { name: "Any change", pressed: true })).toBeTruthy();
    fireEvent.click(within(sec).getByRole("button", { name: "Only to Laggard" }));
    fireEvent.click(within(sec).getByRole("button", { name: "Set alert for this list" }));
    expect(watch.get().lists[0].labelAlert).toBe("laggard");
    expect(within(sec).getByRole("status").textContent).toMatch(/On for this list: only to laggard, sent after the weekly check/);
    fireEvent.click(within(sec).getByRole("button", { name: "Switch off" }));
    expect(watch.get().lists[0].labelAlert).toBeUndefined();
  });
  it("keeps the in simple words line and places the page's questions", () => {
    open();
    expect(screen.getByText(/lists, notes and targets are saved in this browser\. Targets are your own reminders, not predictions; FinLit does not tell you when to buy or sell\./)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Questions about this page" })).toBeTruthy();
  });
  it("says so when the weekly peer check is not available, instead of inventing labels", () => {
    st.leads = { available: false, reason: "pending" }; open();
    expect(screen.getByText("The weekly peer check is not available yet")).toBeTruthy();
    expect(within(rowOf("WHEELS")).getByText("Not checked")).toBeTruthy();
    expect(screen.queryByText("Price leads, the business lags")).toBeNull();
  });
});

describe("what the founder asked to keep", () => {
  it("row actions: target, note, alert, compare and remove", () => {
    open();
    fireEvent.change(within(rowOf("SSWL")).getByLabelText("SSWL target price in rupees"), { target: { value: "600" } });
    expect(within(rowOf("SSWL")).getByText(/% away/)).toBeTruthy();
    fireEvent.change(within(rowOf("SSWL")).getByLabelText("SSWL note"), { target: { value: "wheels for EVs" } });
    expect((within(rowOf("SSWL")).getByLabelText("SSWL note") as HTMLTextAreaElement).value).toBe("wheels for EVs");
    expect(within(rowOf("SSWL")).getByRole("button", { name: "Create an alert for SSWL" })).toBeTruthy();
    fireEvent.click(within(rowOf("SSWL")).getByLabelText("Select SSWL to compare")); fireEvent.click(within(rowOf("WHEELS")).getByLabelText("Select WHEELS to compare"));
    expect(screen.getByRole("button", { name: "Compare selected" })).toBeTruthy();
    fireEvent.click(within(rowOf("SSWL")).getByRole("button", { name: "Remove SSWL from this list" }));
    expect(within(table()).queryByRole("link", { name: /^SSWL/ })).toBeNull();
  });
  it("sorting by a column, and the other Group by buttons", () => {
    open();
    fireEvent.click(within(table()).getByRole("button", { name: "Price" }));   // highest first, within each group
    expect(within(table()).getAllByRole("link").map((a) => a.querySelector("b")?.textContent)).toEqual(["WHEELS", "SSWL", "LOTUSDEV"]);
    fireEvent.click(within(table()).getByRole("button", { name: "Price" }));
    expect(within(table()).getAllByRole("link").map((a) => a.querySelector("b")?.textContent)).toEqual(["SSWL", "WHEELS", "LOTUSDEV"]);
    fireEvent.click(within(screen.getByRole("group", { name: "Group by" })).getByRole("button", { name: "Size" }));
    expect(screen.getByText("Grouped by company size: Large, Mid and Small.")).toBeTruthy();
    expect(within(table()).getAllByRole("columnheader").filter((h) => h.getAttribute("scope") === "colgroup").map((h) => h.textContent)).toEqual(["Mid1 stock", "Small2 stocks"]);
  });
  it("list management: a new list, rename and delete", () => {
    st.gold = true; open();
    fireEvent.click(screen.getByRole("button", { name: "+ New list" }));
    fireEvent.change(screen.getByLabelText("New list name"), { target: { value: "Banks" } });
    fireEvent.keyDown(screen.getByLabelText("New list name"), { key: "Enter" });
    expect(screen.getByRole("button", { name: "Banks · 0", pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rename “Banks”" }));
    fireEvent.change(screen.getByLabelText("List name"), { target: { value: "Lenders" } });
    fireEvent.blur(screen.getByLabelText("List name"));
    expect(screen.getByRole("button", { name: "Lenders · 0" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete this list" }));
    expect(screen.queryByRole("button", { name: /Lenders/ })).toBeNull();
  });
});
