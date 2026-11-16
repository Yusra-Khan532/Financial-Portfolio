// @vitest-environment jsdom
// Task #184: the calculator is five tabs (Inputs & Scenarios, Valuation, Sensitivity, Charts, Export) instead of one long stack; Inputs & Scenarios opens
// first, a click shows only that tab's content, typed values and results carry across tabs, and a "How to use" dropdown sits beside the title.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/Info", () => ({ Info: ({ g }: { g?: { label: string } }) => (g ? <button type="button" aria-label={`What is ${g.label}?`}>i</button> : null) }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title, titleAside }: { title: string; titleAside?: React.ReactNode }) => <header><h1>{title}</h1>{titleAside}</header> }));
vi.mock("../components/ChartZoom", () => ({ ChartZoom: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: () => undefined }) }));
vi.mock("../components/SearchFilters", () => ({
  SearchFilters: () => null, FilterNote: () => null,
  useIndexFilter: () => ({ idx: { data: undefined }, search: () => [], facets: [], filter: {}, setFilter: () => undefined, count: 0, on: false, hidden: () => 0 }),
}));
vi.mock("../lib/api", () => ({ useSummary: () => ({ data: undefined }), useSection: () => ({ data: undefined }) }));
import { EpsCalculatorPage } from "./EpsCalculator";

afterEach(cleanup);
const open = (q = "?np=110&pd=0&sh=10&px=300&g=14") => render(<MemoryRouter initialEntries={["/eps-calculator" + q]}><EpsCalculatorPage /></MemoryRouter>);
const panel = (name: RegExp) => document.getElementById(screen.getByRole("tab", { name, hidden: true }).getAttribute("aria-controls") as string) as HTMLElement;
const kpi = (k: string) => [...document.querySelectorAll(".eps-kpis li")].find((li) => li.querySelector("span")?.textContent === k)?.querySelector("b")?.textContent;

describe("EPS calculator tabs (task #184)", () => {
  it("has the five tabs in order, opens on Inputs & Scenarios and shows only that tab's content (the old page showed every section at once)", () => {
    open();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["1Inputs & Scenarios", "2Valuation", "3Sensitivity", "4Charts", "5Export"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(panel(/Inputs/).hidden).toBe(false);
    for (const t of [/Valuation/, /Sensitivity/, /Charts/, /Export/]) expect(panel(t).hidden).toBe(true);
    // the inputs are visible; the later sections are not
    expect(screen.getByRole("heading", { name: /Company inputs/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Sensitivity/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Save, share and export/ })).toBeNull();
    expect(screen.getByRole("tablist").closest(".eps")).toBeTruthy();
  });

  it("a click shows that tab and hides the one before; each tab holds its own sections", () => {
    open();
    const where: [RegExp, RegExp[]][] = [
      [/Valuation/, [/EPS growth and PEG/, /P\/E and implied price/, /Future EPS & valuation/]],
      [/Sensitivity/, [/^Sensitivity$/]],
      [/Charts/, [/Year by year/, /Bear, Base and Bull/]],
      [/Export/, [/Save, share and export/]],
      [/Inputs/, [/Company inputs/, /EPS growth assumption/, /Calculated results/, /Start from a company/]],
    ];
    for (const [t, heads] of where) {
      fireEvent.click(screen.getByRole("tab", { name: t }));
      expect(screen.getByRole("tab", { name: t }).getAttribute("aria-selected")).toBe("true");
      expect(screen.getAllByRole("tab").filter((x) => x.getAttribute("aria-selected") === "true")).toHaveLength(1);
      for (const h of heads) expect(within(panel(t)).getByRole("heading", { name: h })).toBeTruthy();
      expect(document.querySelectorAll(".eps-panel:not([hidden])")).toHaveLength(1);
    }
  });

  it("keeps typed values and results the same across tabs, and the key-results strip follows every change", () => {
    open();
    expect([kpi("EPS"), kpi("P/E"), kpi("PEG"), kpi("5Y EPS")]).toEqual(["₹11.00", "27.27x", "1.95", "₹21.18"]);
    fireEvent.change((document.getElementById("eps-np") as HTMLInputElement), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("tab", { name: /Valuation/ }));
    expect(kpi("EPS")).toBe("₹15.00");
    expect((document.getElementById("eps-g") as HTMLInputElement).value).toBe("14");
    fireEvent.change(document.getElementById("eps-g") as HTMLInputElement, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("tab", { name: /Inputs/ }));
    expect(((document.getElementById("eps-np") as HTMLInputElement) as HTMLInputElement).value).toBe("150");
    expect((document.getElementById("eps-g5") as HTMLInputElement).value).toBe("20");
    expect(screen.getByRole("button", { name: "20%" }).getAttribute("aria-pressed")).toBe("true");
    expect(kpi("PEG")).toBe("1.00");
  });

  it("every blank in the strip says why", () => {
    open("?np=-20&pd=0&sh=10&px=300&g=14");
    expect(kpi("EPS")).toBe("−₹2.00");
    expect(kpi("P/E")).toBe("—Not meaningful");
    expect(kpi("5Y EPS")).toBe("—Not meaningful");
    fireEvent.click(screen.getByRole("tab", { name: /Sensitivity/ }));
    expect(within(panel(/Sensitivity/)).getByText(/EPS is zero or negative/)).toBeTruthy();
  });

  it("arrow keys move between tabs, the tab goes into the link, and a link opens on its tab", () => {
    open();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Inputs/ }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Valuation/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: /Valuation/ }), { key: "End" });
    expect(screen.getByRole("tab", { name: /Export/ }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    open("?np=110&sh=10&px=300&tab=charts");
    expect(screen.getByRole("tab", { name: /Charts/ }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    open("?tab=nonsense");
    expect(screen.getByRole("tab", { name: /Inputs/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("every tab has its (i)", () => {
    open();
    for (const t of ["Inputs & Scenarios", "Valuation", "Sensitivity", "Charts", "Export"]) expect(screen.getByRole("button", { name: `What is the ${t} tab?` })).toBeTruthy();
  });

  it("How to use sits with the title, is closed by default, opens four numbered steps and closes on a second click", () => {
    open();
    const btn = screen.getByRole("button", { name: /How to use/ });
    expect(btn.closest("header")?.querySelector("h1")?.textContent).toBe("P/E, EPS & PEG calculator");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    const list = document.getElementById(btn.getAttribute("aria-controls") as string) as HTMLElement;
    expect(list.hidden).toBe(true);
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(list.hidden).toBe(false);
    const steps = [...list.querySelectorAll("li")].map((li) => [li.querySelector(".eps-hn")?.textContent, li.querySelector("b")?.textContent, li.querySelector("b + span")?.textContent]);
    expect(steps).toEqual([
      ["1", "Enter company details", "Add net profit, preference dividends, share count and current share price. Choose Basic or Diluted EPS."],
      ["2", "Set your growth assumption", "Enter expected annual EPS growth or select a quick percentage to explore scenarios."],
      ["3", "Explore valuation and sensitivity", "Review EPS, P/E and PEG, compare valuation multiples and test different growth assumptions."],
      ["4", "Visualise and export", "Explore charts, compare Bear, Base and Bull scenarios, and download or share your results."],
    ]);
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(list.hidden).toBe(true);
  });

  it("the disclaimer stays outside the tabs, on every tab", () => {
    open();
    for (const t of [/Inputs/, /Charts/, /Export/]) {
      fireEvent.click(screen.getByRole("tab", { name: t }));
      expect(screen.getByText(/Information only, not investment advice\. Results are scenarios/).closest(".eps-panel")).toBeNull();
    }
  });
});
