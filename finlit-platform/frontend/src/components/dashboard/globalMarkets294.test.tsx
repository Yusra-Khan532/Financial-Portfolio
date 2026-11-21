// @vitest-environment jsdom
// Task #294 ("we need to make this on dashboard"): the Global markets card: a world view and US, Europe and Asia indices, gold, crude, the rupee and the
// US 10-year yield with 1-day, 1-week and 1-month moves; a row without data says why.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WIDGETS } from "../../lib/prefs";

const DATA = {
  asOfIst: "16:46", summary: { open: 2, markets: 7, indices: 4, down: 4, up: 0 }, disclaimer: "Information only, not investment advice.", sources: "FRED (St. Louis Fed); Twelve Data where connected",
  home: { city: "Mumbai", lat: 19.08, lon: 72.88, open: true },
  rows: [
    { key: "sp500", label: "S&P 500", group: "US", unit: "pts", source: "FRED", last: 7175.83, asOf: "2026-11-19", d1: -2.02, w1: -5.49, m1: -6.96, line: [["2026-10-20", 7700], ["2026-11-19", 7175.83]], why: null, place: { city: "New York", lat: 40.71, lon: -74.01, open: false } },
    { key: "ftse", label: "FTSE 100", group: "Europe", unit: "pts", source: "Twelve Data", last: null, asOf: null, d1: null, w1: null, m1: null, line: [], why: "Not connected yet: this series comes from Twelve Data, whose key is not set on the server.", place: { city: "London", lat: 51.51, lon: -0.13, open: true } },
    { key: "nikkei", label: "Nikkei 225", group: "Asia", unit: "pts", source: "FRED", last: 56436.65, asOf: "2026-11-20", d1: -5.06, w1: -7.7, m1: -12.67, line: [["2026-10-21", 64600], ["2026-11-20", 56436.65]], why: null, place: { city: "Tokyo", lat: 35.68, lon: 139.69, open: false } },
    { key: "brent", label: "Brent crude", group: "Commodities", unit: "US$/bbl", source: "FRED", last: 92.94, asOf: "2026-11-17", d1: 0.04, w1: 3.08, m1: -22.12, line: [["2026-10-17", 119], ["2026-11-17", 92.94]], why: null, place: null },
    { key: "usdinr", label: "Rupee per US dollar", group: "Currency and yields", unit: "₹", source: "FRED", last: 94.7, asOf: "2026-11-21", d1: 0.11, w1: 0.48, m1: -0.8, line: [], why: null, place: null },
    { key: "us10y", label: "US 10-year yield", group: "Currency and yields", unit: "%", source: "FRED", last: 5.04, asOf: "2026-11-19", d1: -0.03, w1: -0.06, m1: -0.08, line: [["2026-10-20", 5.12], ["2026-11-19", 5.04]], why: null, place: null },
  ],
};
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), apiGet: async () => DATA }));
import { GlobalMarkets, move } from "./GlobalMarkets";

afterEach(cleanup);
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GlobalMarkets /></QueryClientProvider>);

describe("task #294: Global markets on the dashboard", () => {
  it("is a dashboard block in The market step, on every plan", () => {
    const w = WIDGETS.find((x) => x.id === "globalmarkets")!;
    expect(w.label).toBe("Global markets"); expect(w.step).toBe(3); expect(w.min).toBe("basic");
  });
  it("draws the summary, the world view and a table by group with 1D, 1W, 1M and a 1-month line; a row without data says why", async () => {
    open();
    await screen.findByRole("heading", { name: /Global markets/ });
    await screen.findByText("Nikkei 225");
    expect(document.querySelector(".gm-now")!.textContent).toBe("16:46 IST · 2 of 7 open · 4 overseas indices: 4 down");
    expect(document.querySelector(".gm-globe")).toBeTruthy();
    expect(document.querySelector(".gm-globe path.gm-land")!.getAttribute("d")!.length).toBeGreaterThan(1000);     // the world's land is drawn
    expect([...document.querySelectorAll(".gm-gh th")].map((h) => h.textContent)).toEqual(["US", "Europe", "Asia", "Commodities", "Currency and yields"]);   // task #298: one table, bold continent headings
    const table = () => within(document.querySelector("table.gm-t") as HTMLElement);
    const row = (name: string) => table().getByText(name).closest("tr")!.textContent;
    expect(row("S&P 500")).toMatch(/New York · closed · 19 Nov.*7,175\.83.*−2\.02%.*−5\.49%.*−6\.96%/);
    expect(row("FTSE 100")).toMatch(/London · open.*−.*−.*−.*−/);                                        // task #298: an empty row says so once per continent, below it
    expect(document.querySelector('tbody[data-group="Europe"] .gm-why')!.textContent).toBe("No figures for these markets yet: this series comes from Twelve Data, whose key is not set on the server.");
    expect(row("Brent crude")).toMatch(/\$92\.94.*\+0\.04%.*\+3\.08%.*−22\.12%/);
    expect(row("Rupee per US dollar")).toMatch(/₹94\.70/);
    expect(row("US 10-year yield")).toMatch(/5\.04%.*−0\.03 pts.*−0\.06 pts/);               // a yield moves in percentage points
    expect(within(table().getByText("S&P 500").closest("tr")!).getByRole("img").getAttribute("aria-label")).toMatch(/^1 month: 2026-10-20/);
    expect(document.body.textContent).toMatch(/not investment advice/);
  });
  it("formats moves with a real minus", () => {
    expect(move(-2.02, "pts")).toBe("−2.02%"); expect(move(0.5, "%")).toBe("+0.50 pts"); expect(move(null, "pts")).toBe("−");
  });
});

describe("task #298: no white space under the globe; pointing at a continent shows it on the globe", () => {
  it("puts the globe beside a tile per continent, above one table whose columns line up", async () => {
    open();
    await screen.findByText("Nikkei 225");
    const top = document.querySelector(".gm-top")!;
    expect(top.querySelector(".gm-globe")).toBeTruthy();
    expect([...top.querySelectorAll(".gm-rg b")].map((b) => b.textContent)).toEqual(["US", "Europe", "Asia", "Commodities", "Currency and yields"]);
    expect(document.querySelectorAll("table.gm-t")).toHaveLength(1);                                         // one table, one header row
    expect(document.querySelectorAll("table.gm-t thead tr")).toHaveLength(1);
    expect(top.querySelector('[data-group="US"] .gm-rv')!.textContent).toBe("−2.02%");
    expect(top.querySelector('[data-group="Europe"] .gm-rv')!.textContent).toBe("No data yet");
  });
  it("turns the globe to a continent and lifts its markets when its tile or its rows are pointed at", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));     // less motion: the globe turns at once
    // jsdom has no PointerEvent: a stand-in that carries pointerType, so a mouse and a touch can be told apart
    vi.stubGlobal("PointerEvent", class extends MouseEvent { pointerType: string; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerType = i.pointerType ?? ""; } });
    open();
    await screen.findByText("Nikkei 225");
    const globe = () => document.querySelector(".gm-globe")!;
    expect(globe().querySelector('[data-city="New York"]')).toBeNull();                                      // India first: New York is on the far side
    fireEvent.pointerEnter(document.querySelector('.gm-rg[data-group="US"]')!, { pointerType: "mouse" });
    expect(globe().classList.contains("gm-focus")).toBe(true);
    expect(globe().querySelector('[data-city="New York"]')!.classList.contains("on")).toBe(true);           // turned to the US, its pin lifted
    expect(globe().getAttribute("aria-label")).toMatch(/turned to US/);
    fireEvent.pointerLeave(document.querySelector('.gm-rg[data-group="US"]')!, { pointerType: "mouse" });
    expect(globe().classList.contains("gm-focus")).toBe(false);
    fireEvent.pointerEnter(within(document.querySelector("table.gm-t") as HTMLElement).getByText("Nikkei 225").closest("tr")!, { pointerType: "mouse" });                                      // a row: that one market
    expect(globe().querySelector('[data-city="Tokyo"]')!.classList.contains("on")).toBe(true);
    expect(within(document.querySelector("table.gm-t") as HTMLElement).getByText("Nikkei 225").closest("tr")!.classList.contains("on")).toBe(true);
    fireEvent.click(document.querySelector('.gm-rg[data-group="Europe"]')!);                                 // a tap on a phone: its click sets the focus
    fireEvent.pointerLeave(document.querySelector('.gm-rg[data-group="Europe"]')!, { pointerType: "touch" });   // and the leave a touch screen sends does not undo it
    expect(globe().querySelector('[data-city="London"]')!.classList.contains("on")).toBe(true);
    vi.unstubAllGlobals();
  });
});
