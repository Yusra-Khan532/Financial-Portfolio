// @vitest-environment jsdom
// The outlook page: choosing "Build your own growth model" puts the sliders first (right under the model cards), then the charts; "Our model" shows no sliders.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, upgrade: vi.fn(), toast: vi.fn() }), TIER: { gold: { n: "Gold" }, silver: { n: "Silver" } } }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("../lib/demo", () => ({ DEMO: false }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</>, TierChip: () => null }));
vi.mock("../components/OutlookPicker", () => ({ OutlookPicker: () => <section aria-label="picker" /> }));
vi.mock("../components/PageHeader", () => ({ PageHeader: () => <header /> }));
vi.mock("../charts/OutlookChart", () => ({ OutlookChart: () => <div data-testid="chart" />, buildSeries: () => [] }));
vi.mock("../lib/outlook", async (orig) => ({ ...(await orig<typeof import("../lib/outlook")>()), useOutlook: () => ({ data: undefined, isLoading: true, isFetching: true, error: null }) }));
import { OutlookPage } from "./Outlook";

afterEach(cleanup);
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/outlook/RELIANCE"]}><Routes><Route path="/outlook/:symbol" element={<OutlookPage />} /></Routes></MemoryRouter></QueryClientProvider>);
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("outlook page, Build your own growth model", () => {
  // Task #147 (14 Nov 2026): "Build your own growth model" with the team's line, word for word, "in place of the content pre existing on the button".
  it("the second model card reads the team's title and line, the FinLit USP badge stays, and the old words are gone (task #147)", () => {
    open();
    const card = screen.getByRole("radio", { name: /Build your own growth model/ });
    expect(card.querySelector("b")!.textContent).toBe("Build your own growth modelFinLit USP");
    expect(card.querySelector("small")!.textContent).toBe("Take control of your growth assumptions. Customise company and sector CAGR inputs, experiment with margin trends, and evaluate how different assumptions impact future profit and revenue.");
    expect(document.body.textContent).not.toMatch(/Set your own model|Set the growth rate you expect for each input|Customise the weight of each input/);
  });
  it("shows no sliders with Our model", () => { open(); expect(screen.queryByRole("group", { name: /Expected growth rate of each input/ })).toBeNull(); expect(screen.queryByText(/Build your own growth model: assumptions/)).toBeNull(); });
  it("opens the sliders first: right after the model cards and before the charts and the detail tabs", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Build your own growth model/ }));
    const assume = screen.getByRole("heading", { name: /Build your own growth model: assumptions/ }).closest("section")!;
    const cards = screen.getByRole("radiogroup", { name: /Estimation model/ });
    const charts = document.querySelector(".ol-charts")!, tabs = screen.getByRole("tablist", { name: /Details of the estimate/ });
    expect(before(cards, assume)).toBe(true); expect(before(assume, charts)).toBe(true); expect(before(assume, tabs)).toBe(true);
    expect(assume.querySelectorAll('input[type="range"]').length).toBeGreaterThan(5);
    fireEvent.click(screen.getByRole("radio", { name: "Revenue estimate" }));
    expect(assume.querySelectorAll('input[type="range"]').length).toBe(6);                    // revenue has six inputs, profit seven
  });
  it("marks the chart the sliders drive, lets the other be picked with one click, and says nothing of the kind with Our model", () => {
    open();
    expect(screen.queryByText("The sliders change this chart")).toBeNull();
    expect(screen.queryByRole("button", { name: /Adjust this chart with the sliders/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Build your own growth model/ }));
    const rev = screen.getByRole("heading", { name: /Revenue: reported and estimate/ }).closest("section")!, prof = screen.getByRole("heading", { name: /Profit: reported and estimate/ }).closest("section")!;
    expect(prof.className).toContain("is-adjusting"); expect(rev.className).not.toContain("is-adjusting");          // Profit is the one the sliders drive at first
    expect(screen.getAllByText("The sliders change this chart").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /Adjust this chart with the sliders/ }));
    expect(rev.className).toContain("is-adjusting"); expect(prof.className).not.toContain("is-adjusting");
    expect(screen.getByRole("radio", { name: "Revenue estimate", checked: true })).toBeTruthy();                     // the sliders now belong to Revenue
  });
  it("the Revenue chart comes before the Profit chart, one above the other, in the same column", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Build your own growth model/ }));
    const charts = [...document.querySelectorAll(".ol-charts > section")].map((x) => x.querySelector("h2")?.textContent ?? "");
    expect(charts[0]).toMatch(/^Revenue/); expect(charts[1]).toMatch(/^Profit/);
  });
});
