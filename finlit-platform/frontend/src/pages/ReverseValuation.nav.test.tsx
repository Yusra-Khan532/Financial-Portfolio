// @vitest-environment jsdom
// Task #188: a bar of seven section buttons under the header, above the company search. Each scrolls to its section (nothing is hidden or moved), has an (i)
// explaining it, and the section in view is marked. A button whose section is not on the page yet is greyed out and says why.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ fin: null as unknown }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, upgrade: vi.fn(), toast: vi.fn() }), TIER: { gold: { n: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</>, TierChip: () => null }));
vi.mock("../components/PageHeader", () => ({ PageHeader: () => <header /> }));
vi.mock("../components/Info", () => ({ Info: ({ g }: { g?: { label: string; what: string; note?: string } }) => (g ? <button type="button" className="info" aria-label={`What is ${g.label}?`} data-what={g.what} data-note={g.note ?? ""}>i</button> : null) }));
vi.mock("../components/SearchFilters", () => ({
  SearchFilters: () => null, FilterNote: () => null,
  useIndexFilter: () => ({ idx: { data: {} }, search: () => [], facets: [], filter: {}, setFilter: () => {}, count: 0, on: false, hidden: () => 0 }),
}));
vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  apiGet: async () => ({ symbol: "ABC", name: "ABC Ltd", sector: "IT", price: 100, priceAsOf: "2026-11-10", marketCap: 5000, shares: { diluted: 50, implied: 50 }, netDebt: { value: 500, period: "FY26" } }),
  useSection: () => ({ data: st.fin, isFetching: false }),
}));
import { ReverseValuationPage } from "./ReverseValuation";

afterEach(cleanup);
const years = (n: number) => Array.from({ length: n }, (_, i) => `FY${20 + i}`);

const fin = (rev: number[], op: number[]) => ({ yearly: { pl: { unit: "Cr", period: "year", periods: years(rev.length), periodEnds: [], rows: { revenue: rev, operating_profit: op } } } });
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/reverse-valuation?sym=ABC"]}><ReverseValuationPage /></MemoryRouter></QueryClientProvider>);
const NAMES = ["Assumptions", "Required Growth", "Miss Scenarios", "Price Drivers", "Weighted Outcome", "Sensitivity Grid", "Save & Export"];
const btn = (n: string) => [...document.querySelectorAll<HTMLButtonElement>(".rv-sn .rv-snb")].find((b) => b.getAttribute("aria-label") === n) as HTMLButtonElement;
const good = () => fin([600, 700, 820, 950, 1100, 1250], [100, 125, 150, 175, 205, 240]);

describe("reverse valuation section bar (task #188)", () => {
  it("has the seven buttons, in order, between the header and the company search (the page had no such bar)", async () => {
    st.fin = good(); open();
    await waitFor(() => expect(screen.getByRole("heading", { name: /Result:/ })).toBeTruthy());
    const nav = screen.getByRole("navigation", { name: "Sections of this page" });
    expect([...nav.querySelectorAll(".rv-snb")].map((b) => b.querySelector(".rv-snl")?.textContent)).toEqual(NAMES);
    const search = document.querySelector(".rv-co") as HTMLElement;
    expect(nav.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // the bar comes before the search
  });

  it("every button has its (i) with what the section is for", async () => {
    st.fin = good(); open();
    await waitFor(() => expect(btn("Assumptions")).toBeTruthy());
    for (const n of NAMES) {
      const i = screen.getByRole("button", { name: `What is ${n}?` });
      expect(i.closest(".rv-sni")?.querySelector(".rv-snb")?.getAttribute("aria-label")).toBe(n);
      expect((i.getAttribute("data-what") ?? "").length).toBeGreaterThan(40);
    }
  });

  it("a click scrolls to that section and marks it, and hides, replaces or changes nothing", async () => {
    st.fin = good(); open();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Miss scenarios" })).toBeTruthy());
    const before = document.querySelector(".rv")!.innerHTML.replace(/<nav[\s\S]*?<\/nav>/, "");
    const spy = vi.fn(); window.scrollTo = spy as unknown as typeof window.scrollTo;
    const targets: Record<string, string> = { "Assumptions": ".rv-as", "Required Growth": ".rv-res", "Miss Scenarios": ".rv-miss", "Price Drivers": ".rv-torn", "Weighted Outcome": ".rv-ev", "Sensitivity Grid": ".rv-gr", "Save & Export": ".rv-dr" };
    for (const n of NAMES) {
      expect(document.querySelector(".rv " + targets[n])).toBeTruthy();
      expect(btn(n).getAttribute("data-target")).toBe(".rv " + targets[n]);
      fireEvent.click(btn(n));
      expect(btn(n).getAttribute("aria-current")).toBe("true");
      expect(document.querySelectorAll(".rv-sn [aria-current=true]")).toHaveLength(1);
    }
    expect(spy).toHaveBeenCalledTimes(NAMES.length);
    expect(spy.mock.calls[0][0]).toMatchObject({ behavior: "smooth" });
    expect(document.querySelector(".rv")!.innerHTML.replace(/<nav[\s\S]*?<\/nav>/, "")).toBe(before);
  });

  it("before a company is chosen every button is greyed out and says why", async () => {
    st.fin = null;
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/reverse-valuation"]}><ReverseValuationPage /></MemoryRouter></QueryClientProvider>);
    for (const n of NAMES) { expect(btn(n).getAttribute("aria-disabled")).toBe("true"); expect(btn(n).title).toBe("Choose a company first."); }
    const spy = vi.fn(); window.scrollTo = spy as unknown as typeof window.scrollTo;
    fireEvent.click(btn("Miss Scenarios"));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("reverse valuation section bar fits a laptop (QA 27 Nov)", () => {
  it("every button has a short label beside its full one, and the full name stays its accessible name", async () => {
    const NAMES_SHORT = ["Inputs", "Required", "Misses", "Drivers", "Weighted", "Grid", "Export"];
    const SRC = (await import("node:fs")).readFileSync((await import("node:path")).join(__dirname, "ReverseValuation.tsx"), "utf8");
    for (const sh of NAMES_SHORT) expect(SRC).toContain(`short: "${sh}"`);
    expect(SRC).toMatch(/aria-label=\{n\.label\}/);
    expect(SRC).toMatch(/data-fit=\{fit\}/);
  });
});
