// @vitest-environment jsdom
// Task #398 (team brief "Reverse valuation: complete UI/UX redesign", 26 Nov): the redesigned sections. Information marks on the financial terms; the Miss
// scenarios table with the scenario's name over its change and five figure columns; the price drivers with "Biggest" in words and a detail per row; the
// weighted outcome as three editable cases, a prominent result and a plain check when the chances do not add to 100 (nothing is changed for the user); the
// sensitivity grid's legend and a tapped cell's detail; Save & export with feedback; How it works / Why use it? / Methodology at the end.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InfoProvider } from "../components/Info";

const st = vi.hoisted(() => ({ fin: null as unknown }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, upgrade: vi.fn(), toast: vi.fn() }), TIER: { gold: { n: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</>, TierChip: () => null }));
vi.mock("../components/PageHeader", () => ({ PageHeader: () => <header /> }));
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
st.fin = { yearly: { pl: { unit: "Cr", period: "year", periods: years(6), periodEnds: [], rows: { revenue: [600, 700, 820, 950, 1100, 1250], operating_profit: [100, 125, 150, 175, 205, 240] } } } };
const open = async () => {
  render(<QueryClientProvider client={new QueryClient()}><InfoProvider><MemoryRouter initialEntries={["/reverse-valuation?sym=ABC"]}><ReverseValuationPage /></MemoryRouter></InfoProvider></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Miss scenarios" })).toBeTruthy());
};

describe("reverse valuation redesign (#398)", () => {
  it("puts an information mark beside every financial term the brief names", async () => {
    await open();
    for (const t of ["Revenue CAGR", "EBITDA margin", "Exit multiple", "Implied return", "Required revenue CAGR", "Growth miss", "Margin miss", "Multiple compression", "Rate shock",
      "Years to recover", "Weighted outcome", "Sensitivity grid", "Base case: assumptions hold", "A miss", "A severe miss", "Enterprise value", "Intrinsic value"])
      expect(screen.getAllByRole("button", { name: `What is ${t}?` }).length, t).toBeGreaterThan(0);
  });

  it("shows each scenario's name with its change under it, in five columns, with a family marker", async () => {
    await open();
    const t = document.querySelector(".rv-miss table") as HTMLTableElement;
    expect([...t.querySelectorAll("thead th")].map((h) => (h.querySelector(".rv-th")?.firstChild ?? h).textContent?.trim())).toEqual(["Scenario", "Value per share", "Against today", "Implied return", "Years to recover"]);
    expect(screen.queryByRole("columnheader", { name: /Change in assumption/ })).toBeNull();
    const first = t.querySelector("tbody tr th") as HTMLElement;
    expect(first.querySelector(".rv-sn2 b")?.textContent).toMatch(/^Growth miss/);
    expect(first.querySelector(".rv-sn2 small")?.textContent).toMatch(/Revenue CAGR ↓ to .*\(−2\.0 pp\)/);
    const marks = [...t.querySelectorAll("tbody .rv-mk")].map((m) => m.className.replace("rv-mk ", ""));
    expect(marks.slice(0, 3)).toEqual(["dn", "dn", "dn"]);              // growth: red
    expect(marks.slice(3, 6)).toEqual(["wn", "wn", "wn"]);              // margin: amber
    expect(marks.slice(6, 9)).toEqual(["dn", "dn", "dn"]);              // multiple compression: red
    expect(marks.slice(9, 11)).toEqual(["wn", "wn"]);                   // rate shock: amber
    expect(marks.slice(11)).toEqual(["dn2", "dn2"]);                    // combined: the stronger warning
    expect(t.closest(".tw")?.classList.contains("rv-mt")).toBe(true);   // scrolls inside its own box
  });

  it("names the biggest price driver in words and gives each driver's before, after, value and impact", async () => {
    await open();
    const rows = [...document.querySelectorAll(".rv-tor li")];
    expect(rows).toHaveLength(4);
    expect(rows[0].querySelector(".rv-big1")?.textContent).toBe("Biggest");
    expect(rows.slice(1).every((r) => !r.querySelector(".rv-big1"))).toBe(true);
    for (const r of rows) expect(r.querySelector(".rv-td")?.textContent).toMatch(/at your assumptions\. Changed: .+\. Value per share ₹[\d,]+, [−+][\d.]+% against today's ₹100\./);
    expect(document.querySelector(".rv-base")?.textContent).toMatch(/^Baseline: the value at your assumptions, ₹100\.00 a share/);
  });

  it("keeps the three chances editable, says plainly when they do not add to 100, and never changes them", async () => {
    await open();
    const ev = document.querySelector(".rv-ev") as HTMLElement;
    const inputs = within(ev).getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(["50", "30", "20"]);
    expect(ev.querySelector(".rv-tot")?.textContent).toBe("Total 100% ✓");
    expect(ev.querySelector(".rv-evl")?.textContent).toBe("Weighted value per share");
    expect(ev.querySelector(".rv-evr > b")?.textContent).toMatch(/^₹\d+/);
    expect(ev.querySelector(".rv-evr small")?.textContent).toMatch(/^50% × ₹100 \+ 30% × ₹\d+ \+ 20% × ₹\d+\./);
    expect(within(ev).queryByRole("alert")).toBeNull();
    fireEvent.change(inputs[0], { target: { value: "40" } });
    expect((within(ev).getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe("40");
    expect(ev.querySelector(".rv-tot")?.textContent).toBe("Total 90%");
    expect(within(ev).getByRole("alert").textContent).toMatch(/^The chances add to 90%, not 100%\. Set them so they add to 100%\./);
    expect(within(ev).getByRole("alert").textContent).toMatch(/none of your numbers is changed/);
  });

  it("gives the grid a legend and a tapped cell's detail", async () => {
    await open();
    expect(screen.getByRole("heading", { name: /Sensitivity grid: value per share/ })).toBeTruthy();
    expect(document.querySelector(".rv-lg")?.textContent).toMatch(/Below price.*Above price.*Solid outline: the combination the price needs.*Dashed outline: where the value first reaches today's price/);
    const td = document.querySelectorAll(".rv-heat tbody tr")[1].querySelectorAll("td")[2] as HTMLElement;
    expect(td.getAttribute("title")).toMatch(/^Growth [\d.]+%, margin [\d.]+%: ₹[\d,]+ a share, [−+][\d.]+% against today's price$/);
    fireEvent.click(td);
    expect(document.querySelector(".rv-cell")?.textContent).toMatch(/^Growth [\d.]+% and margin [\d.]+%: ₹[\d,]+ a share, [−+][\d.]+% against today's ₹100\.$/);
    expect(td.classList.contains("sel")).toBe(true);
    expect(document.querySelector(".rv-heat td.mid")).toBeTruthy();
  });

  it("makes Save & export one primary and one secondary action, and moves How it works to the end of the page", async () => {
    await open();
    const dr = document.querySelector(".rv-dr") as HTMLElement;
    const [dl, cp] = within(dr).getAllByRole("button");
    expect(dl.textContent?.trim()).toBe("Download working CSV");
    expect(dl.classList.contains("primary")).toBe(true);
    expect(cp.textContent?.trim()).toBe("Copy a link to this view");
    expect(dr.querySelector("details summary")?.textContent).toBe("Every assumption, its source and the date");
    const about = screen.getByRole("heading", { name: "About this tool" }).closest("section") as HTMLElement;
    expect(within(about).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["How it works", "Why use it?", "Methodology"]);
    expect(document.querySelector(".rv-tools .rv-info")).toBeNull();
    expect(document.querySelector(".rv-own-d summary")?.textContent).toBe("Try your own scenarioSet your own change to each assumption");
    expect((document.querySelector(".rv-own-d") as HTMLDetailsElement).open).toBe(false);
  });
});
