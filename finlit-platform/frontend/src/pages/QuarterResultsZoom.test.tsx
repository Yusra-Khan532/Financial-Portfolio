// @vitest-environment jsdom
// Latest results page: ONE enlarge arrow on the results panel (22 Nov 2026). The page had its own arrow (task #9) and the site's shared table arrow
// (TableZoom, inside HScroll) side by side, both enlarging the table. Now only the shared arrow is there, and it opens the table WITH the pager, so every page
// of the list can be read enlarged. Also here: the pager above and below the table, rows per page, and the folded "How to read this table" note.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QParams, QResp, QRow } from "../lib/qresults";

const st = vi.hoisted(() => ({ resp: null as unknown, params: [] as unknown[] }));
vi.mock("../lib/qresults", async (orig) => ({
  ...(await orig<typeof import("../lib/qresults")>()),
  useQuarterResults: (p: unknown) => { st.params.push(p); return { data: st.resp, error: null, isError: false, isLoading: false, isFetching: false }; },
}));
vi.mock("../lib/ui", () => ({ useUI: () => ({ plan: "silver", upgrade: vi.fn(), toast: vi.fn() }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/ChartHelp", () => ({ ChartHelp: () => null }));
import { CompaniesView, READ_NOTE } from "./QuarterResults";

const summary = { companies: 10, declared: 10, due: 0, awaiting: 0, withNumbers: 8, flagged: 0, medianRevenueYoY: 1, medianProfitYoY: 1, profitUpShare: 50, marginUpShare: 50, nRevenue: 8, nProfit: 8, nMargin: 8 };
const mk = (i: number): QRow => ({ date: "2026-11-21", symbol: "S" + i, name: "Sample " + i + " Ltd", sector: "IT", marketCap: 1, cap: "Large", indices: [], confirmed: true, periodEnd: "2026-09-30", loadedPeriodEnd: null, status: "declared", awaiting: false,
  hasNumbers: true, locked: false, revenue: 100, revenueYoY: 12, revenueQoQ: -3, operatingProfit: 20, opYoY: 5, opQoQ: 1, opYoYWhy: null, opQoQWhy: null, opm: 20, netProfit: 10, profitYoY: 30, profitQoQ: 4, npm: 10, npmChange: 0, eps: 1, gap: 0,
  flagged: false, loss: false, price: 87.6, high52: 100, low52: 60, ath: null, athDate: null, below52: 12.4, belowAth: null, above52Low: 46, stale52: false, staleAth: false } as QRow);
const resp = (total: number, n = Math.min(total, 50)): QResp => ({
  plan: "silver", locked: false, today: "2026-11-22", quarter: { key: "2026-09", label: "Jul to Sep 2026", fiscal: "Q2 FY27", periodEnd: "2026-09-30", from: "2026-10-01", to: "2026-12-31" }, quarters: [],
  total, offset: 0, limit: 50, summary, totals: summary, rows: Array.from({ length: n }, (_, i) => mk(i)), days: [{ date: "2026-11-21", n }], facets: { sectors: [], indices: [] },
  distribution: { total, sectors: [{ name: "IT", n: total }], caps: [{ name: "Large", n: total }] },
} as QResp);

beforeEach(() => { st.resp = resp(5313); st.params = []; document.body.style.overflow = ""; vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);
const show = () => render(<MemoryRouter initialEntries={["/results/quarter"]}><Routes><Route path="/results/quarter" element={<CompaniesView />} /></Routes></MemoryRouter>);
const panel = () => document.querySelector("section.qr-card") as HTMLElement;
const last = () => st.params.filter((p) => "offset" in (p as object)).at(-1) as QParams;

describe("one enlarge arrow on the results panel", () => {
  it("has the shared table arrow and no second, page-own arrow", () => {
    show();
    expect(panel().querySelector(".qr-zoom")).toBeNull();
    expect(document.querySelector(".qr-backdrop")).toBeNull();
    const arrows = within(panel()).getAllByRole("button", { name: /^Enlarge/ });
    expect(arrows.map((b) => b.getAttribute("aria-label"))).toEqual(["Enlarge table: Results table"]);
  });
  it("opens the table with its pager in the enlarged view, and closes with Esc", () => {
    show();
    fireEvent.click(within(panel()).getByRole("button", { name: "Enlarge table: Results table" }));
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByRole("table")).toBeTruthy();
    expect(within(dlg).getAllByRole("navigation", { name: /Pages of the results table/ })).toHaveLength(2);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("every company can be reached", () => {
  it("shows where the reader is above the table as well as below it, with page numbers", () => {
    show();
    const navs = screen.getAllByRole("navigation", { name: /Pages of the results table/ });
    expect(navs).toHaveLength(2);
    const top = document.querySelector(".qr-pg-top") as HTMLElement;
    expect(top.compareDocumentPosition(panel().querySelector("table")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(top.textContent).toContain("Showing 1–50 of 5,313 companies");
    expect(within(navs[0]).getAllByRole("button").map((b) => b.textContent)).toEqual(["‹ Previous", "1", "2", "3", "107", "Next ›"]);
    expect(within(navs[0]).getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe("page");
    expect(within(navs[0]).getByRole("button", { name: "Previous page" })).toHaveProperty("disabled", true);
  });
  it("goes to any page, and to the last one, then scrolls to the table, not to the top of the page", () => {
    show();
    const nav = screen.getAllByRole("navigation", { name: /Pages of the results table/ })[0];
    fireEvent.click(within(nav).getByRole("button", { name: "Page 107" }));
    expect(last()).toMatchObject({ offset: 5300, limit: 50 });
    fireEvent.click(within(screen.getAllByRole("navigation", { name: /Pages of the results table/ })[1]).getByRole("button", { name: "Previous page" }));
    expect(last()).toMatchObject({ offset: 5250 });
  });
  it("shows 100 rows a page when asked (the server's most), from the first page", () => {
    show();
    fireEvent.click(within(screen.getAllByRole("navigation", { name: /Pages of the results table/ })[0]).getByRole("button", { name: "Next page" }));
    expect(last()).toMatchObject({ offset: 50, limit: 50 });
    fireEvent.change(screen.getByRole("combobox", { name: "Rows per page" }), { target: { value: "100" } });
    expect(last()).toMatchObject({ offset: 0, limit: 100 });
    expect([...screen.getByRole("combobox", { name: "Rows per page" }).querySelectorAll("option")].map((o) => o.value)).toEqual(["50", "100"]);
  });
  it("shows no pager when every company fits on one page", () => {
    st.resp = resp(12);
    show();
    expect(screen.queryByRole("navigation", { name: /Pages of the results table/ })).toBeNull();
  });
});

describe("the note under the table is folded", () => {
  it("is closed when the page opens, holds the same words, and keeps the disclaimer and the calendar link in sight", () => {
    show();
    const fold = panel().querySelector("details.qr-how") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(fold.querySelector("summary")!.textContent).toContain("How to read this table");
    expect(fold.textContent).toContain("Growth is against the same quarter last year (YoY) and the quarter before (QoQ)");
    expect(fold.textContent).toContain("Distance below a high is a fact about the price, not a view on it.");
    expect(READ_NOTE.map(([t]) => t)).toEqual(["Growth (YoY and QoQ)", "Operating profit and OPM", "Dates", "Price position"]);
    const foot = panel().querySelector(".qr-read > .qr-foot") as HTMLElement;
    expect(foot.textContent).toContain("Not investment advice.");
    expect(within(foot).getByRole("link", { name: "Results calendar" }).getAttribute("href")).toBe("/results");
    expect(panel().querySelectorAll("p.qr-foot")).toHaveLength(1);
  });
});
