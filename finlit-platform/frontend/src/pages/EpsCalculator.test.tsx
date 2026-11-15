// @vitest-environment jsdom
// Task #155: the top of the EPS & P/E calculator is company inputs + a 5-year EPS growth assumption, four results (EPS, P/E, PEG,
// implied 5-year EPS) and two scenario tables; the old "Growth, PEG and the reverse question" part is gone.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/Info", () => ({ Info: () => null }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../components/ChartZoom", () => ({ ChartZoom: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: () => undefined }) }));
vi.mock("../components/SearchFilters", () => ({
  SearchFilters: () => null, FilterNote: () => null,
  useIndexFilter: () => ({ idx: { data: undefined }, search: () => [], facets: [], filter: {}, setFilter: () => undefined, count: 0, on: false, hidden: () => 0 }),
}));
vi.mock("../lib/api", () => ({ useSummary: () => ({ data: undefined }), useSection: () => ({ data: undefined }) }));
import { EpsCalculatorPage } from "./EpsCalculator";

afterEach(cleanup);
// the founder's example: net profit 110, no preference dividends, 10 crore shares, price 300, 14% growth
const open = (q = "?np=110&pd=0&sh=10&px=300&g=14") => render(<MemoryRouter initialEntries={["/eps-calculator" + q]}><EpsCalculatorPage /></MemoryRouter>);
const tile = (name: RegExp) => screen.getByText(name, { selector: ".eps-tile span" }).closest(".eps-tile") as HTMLElement;
const rows = (h: string) => [...(screen.getByRole("heading", { name: new RegExp(h) }).closest("section") as HTMLElement).querySelectorAll("tbody tr")].map((r) => [...r.children].map((c) => c.textContent?.trim()));

describe("EPS calculator top part (task #155)", () => {
  it("shows the inputs, the growth assumption and EPS, P/E, PEG and implied 5-year EPS with their working", () => {
    open();
    expect(screen.getByRole("heading", { name: /Company inputs/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /EPS growth assumption/ })).toBeTruthy();
    expect(within(tile(/^EPS/)).getByText("₹11.00")).toBeTruthy();
    expect(tile(/^EPS/).textContent).toContain("(110.00 − 0.00) ÷ 10.00");
    expect(within(tile(/P\/E ratio/)).getByText("27.27x")).toBeTruthy();
    expect(tile(/P\/E ratio/).textContent).toContain("Price ÷ EPS (300.00 ÷ 11.00)");
    expect(within(tile(/PEG ratio/)).getByText("1.95")).toBeTruthy();
    expect(tile(/PEG ratio/).textContent).toContain("27.27 ÷ 14");
    expect(within(tile(/Implied 5Y EPS/)).getByText("₹21.18")).toBeTruthy();
  });

  it("builds the growth/PEG table from the quick picks plus the user's own rate, and the P/E/price table around today's P/E", () => {
    open();
    expect(rows("EPS growth and PEG")).toEqual([
      ["5%", "14.04", "5.45x"], ["10%", "17.72", "2.73x"], ["14% (Base)", "21.18", "1.95x"], ["15%", "22.12", "1.82x"], ["20%", "27.37", "1.36x"], ["25%", "33.57", "1.09x"],
    ]);
    expect(rows("P/E and implied price")).toEqual([
      ["15.00x", "165.00", "−45.00%"], ["20.00x", "220.00", "−26.67%"], ["25.00x", "275.00", "−8.33%"], ["27.27x (Current)", "300.00", "—"], ["30.00x", "330.00", "+10.00%"], ["35.00x", "385.00", "+28.33%"],
    ]);
  });

  it("a quick pick sets the growth, which is also the Base growth further down, and every figure follows", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "20%" }));
    expect((screen.getByLabelText(/Expected EPS growth/) as HTMLInputElement).value).toBe("20");
    expect((screen.getByLabelText(/Annual EPS growth/) as HTMLInputElement).value).toBe("20");
    expect(within(tile(/PEG ratio/)).getByText("1.36")).toBeTruthy();
    expect(screen.getByRole("button", { name: "20%" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("explains every blank: a loss makes P/E, PEG, implied EPS and both tables not meaningful", () => {
    open("?np=-20&pd=0&sh=10&px=300&g=14");
    expect(within(tile(/^EPS/)).getByText("−₹2.00")).toBeTruthy();
    expect(tile(/P\/E ratio/).textContent).toContain("Not meaningful");
    expect(tile(/PEG ratio/).textContent).toContain("Needs a meaningful P/E.");
    expect(tile(/Implied 5Y EPS/).textContent).toContain("EPS is zero or negative");
    expect(screen.getAllByText(/growth rates and P\/E multiples do not describe a price/)).toHaveLength(2);
  });

  it("the reverse-question part (target price to work backwards) is removed", () => {
    open("?np=110&pd=0&sh=10&px=300&g=14&tp=500");
    expect(screen.queryByText(/Growth, PEG and the reverse question/)).toBeNull();
    expect(screen.queryByLabelText(/Target price/)).toBeNull();
    expect(screen.queryByText(/EPS growth needed a year/)).toBeNull();
    expect(screen.getByRole("heading", { name: /3\. Future EPS & valuation/ })).toBeTruthy();
  });
});
