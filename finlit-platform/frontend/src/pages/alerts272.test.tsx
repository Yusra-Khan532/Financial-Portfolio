// @vitest-environment jsdom
// Task #272 (Watchlists and Alerts, 20 Nov pack): the Alerts page's additions marked New. Two Quick alerts first (Order win / New capacity at my
// companies), "View all (14): the 12 of today plus these two"; Create alert › Applies to: One stock / A list, the list picker, the metric "A filing
// Discover sorts as…" with the eight kinds, How often: Each filing / One summary a day; a list alert's card; the bell's "Details in Discover".
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertRow } from "../lib/alerts";

const st = vi.hoisted(() => ({ mutate: vi.fn(), alerts: [] as unknown[] }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ has: () => true, toast: vi.fn(), upgrade: vi.fn(), plan: "gold" }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../lib/alerts", async (orig) => ({ ...(await orig<typeof import("../lib/alerts")>()),
  useAlerts: () => ({ alerts: st.alerts, limit: 300, loading: false, error: null, create: { mutate: st.mutate, isPending: false }, patch: { mutate: vi.fn() }, remove: { mutate: vi.fn() } }),
  useNotices: () => ({ items: [], unread: 0, markRead: vi.fn(), clear: vi.fn() }),
  useAlertLists: () => ({ lists: [{ ref: "equity", label: "Equity portfolio · All accounts", count: 6 }, { ref: "watch:main", label: "Watchlist · My watchlist", count: 4 },
    { ref: "mine", label: "Everything I own and watch (equity portfolio and watchlists)", count: 9 }], loading: false }) }));
import { AlertsPage } from "./Alerts";
import { describe as say, kindsText } from "../lib/alertCatalog";
import { noticeLabels } from "../lib/alerts";

beforeEach(() => { st.mutate.mockClear(); st.alerts = []; });
afterEach(cleanup);
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AlertsPage /></MemoryRouter></QueryClientProvider>);

describe("Alerts: the 20 Nov pack's additions (task #272)", () => {
  it("shows the two new Quick alerts first, marked New, then four of today's, and counts all fourteen", () => {
    open();
    const q = screen.getByRole("region", { name: "Quick alerts" });
    const tiles = within(q).getAllByRole("button").filter((b) => b.classList.contains("alx-q"));
    expect(tiles).toHaveLength(6);
    expect(tiles[0].textContent).toBe("NewOrder win at my companiesAny company in my equity portfolio or watchlists files an order win");
    expect(tiles[1].textContent).toBe("NewNew capacity at my companiesA new plant, line or capacity is filed");
    expect(tiles[2].textContent).toContain("Price target");
    expect(within(q).getByText("View all (14): the 12 of today plus these two.")).toBeTruthy();
    expect(within(q).getByRole("button", { name: /View all \(14\)/ })).toBeTruthy();
  });
  it("Order win at my companies opens Create alert on A list with the one kind, and saves one list alert", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Order win at my companies/ }));
    const dlg = screen.getByRole("dialog", { name: "Create alert" });
    expect(within(dlg).getByRole("button", { name: "A list", pressed: true })).toBeTruthy();
    expect((within(dlg).getByLabelText("List") as HTMLSelectElement).value).toBe("mine");
    const metric = within(dlg).getByLabelText("Metric") as HTMLSelectElement;
    expect(metric.disabled).toBe(true);
    expect(metric.selectedOptions[0].textContent).toBe("A filing Discover sorts as… (new)");
    const kinds = within(dlg).getByRole("group", { name: "Kinds of filing" });
    expect(within(kinds).getAllByRole("button").map((b) => b.textContent)).toEqual(["Order win", "Capacity", "Partnership", "Acquisition / merger", "Fund raising", "Credit rating", "Management", "Legal / regulatory"]);
    expect(within(kinds).getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toEqual(["Order win"]);
    expect(within(dlg).getByRole("button", { name: "Each filing", pressed: true })).toBeTruthy();
    expect(within(dlg).getByText(/A list alert counts as 1 of 300 however many companies the list holds\. It is checked on weekday evenings, once the day's filings are in, like every alert that is not on price\./)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "One summary a day" }));
    fireEvent.click(within(dlg).getByRole("button", { name: /Create alert/ }));
    expect(st.mutate).toHaveBeenCalledTimes(1);
    expect(st.mutate.mock.calls[0][0]).toMatchObject({ symbol: "", metric: "discover_filing", op: "event", value: null, list: "mine", kinds: ["order"], digest: true, repeat: "every" });
  });
  it("Create alert offers One stock or A list, and the list picker names each list with its companies", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Create alert/ }));
    const dlg = screen.getByRole("dialog", { name: "Create alert" });
    expect(within(dlg).getByRole("button", { name: "One stock", pressed: true })).toBeTruthy();
    expect(within(dlg).getByText("New")).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "A list" }));
    const sel = within(dlg).getByLabelText("List") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Equity portfolio · All accounts · 6 companies", "Watchlist · My watchlist · 4 companies",
      "Everything I own and watch (equity portfolio and watchlists) · 9 companies"]);
    expect(within(within(dlg).getByRole("group", { name: "Kinds of filing" })).getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toEqual(["Order win", "Capacity"]);
  });
  it("a list alert's card names the list and what it watches", () => {
    st.alerts = [{ id: "a1", symbol: "", metric: "discover_filing", label: "A filing Discover sorts as…", unit: "", op: "event", value: null, keyword: null, channels: ["app"], repeat: "every",
      status: "active", note: null, lastValue: 10, met: null, lastCheckedAt: null, lastFiredAt: null, firedCount: 0, createdAt: "2026-11-20T10:00:00Z", list: "watch:main", kinds: ["order", "capacity"], digest: false } as AlertRow];
    open();
    expect(screen.getByText("Watchlist · My watchlist")).toBeTruthy();
    expect(screen.getByText("A filing Discover sorts as order win or capacity")).toBeTruthy();
  });
});

describe("the words of a filing alert (task #272)", () => {
  it("says the kinds in plain words", () => {
    expect(kindsText(["order"])).toBe("order win");
    expect(kindsText(["order", "capacity", "fundraise"])).toBe("order win, capacity or fund raising");
    expect(kindsText(["order", "capacity", "partnership", "mna", "fundraise", "rating", "management", "legal"])).toBe("any of Discover's eight kinds");
    expect(say({ metric: "discover_filing", op: "event", value: null, kinds: ["management"], digest: true })).toBe("A filing Discover sorts as management (one summary a day)");
  });
  it("the bell's button says Details in Discover for one filing and See What changed for a summary", () => {
    expect(noticeLabels({ kind: "alert", title: "Order win · Welspun Corp", link: "/discover/changes/order?q=Welspun%20Corp" }).action).toBe("Details in Discover");
    expect(noticeLabels({ kind: "alert", title: "2 filings at your companies since 12 Nov", link: "/holdings#what-changed" }).action).toBe("See What changed");
    expect(noticeLabels({ kind: "alert", title: "RELIANCE – Price", link: "/stocks/RELIANCE" }).action).toBe("View stock");
  });
});
