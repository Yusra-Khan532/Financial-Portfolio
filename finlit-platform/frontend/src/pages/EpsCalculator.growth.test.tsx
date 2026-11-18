// @vitest-environment jsdom
// Task #205: "What your growth assumption tells you" sits under the results tiles, collapsed by default; it opens to four rows (EPS, P/E, PEG, Implied 5Y EPS)
// that say whether growth moves each one, which way, by how much against the previous rate, and why, and it follows every change.
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
import { act } from "react";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const open = (q = "?np=110&pd=0&sh=10&px=300&g=10") => render(<MemoryRouter initialEntries={["/eps-calculator" + q]}><EpsCalculatorPage /></MemoryRouter>);
const rowOf = (m: string) => [...document.querySelectorAll(".eps-gtr")].find((li) => li.querySelector(".eps-gtm b")?.textContent === m) as HTMLElement;

describe("What your growth assumption tells you (task #205)", () => {
  it("sits right under the results tiles, collapsed by default", () => {
    open();
    const btn = screen.getByRole("button", { name: /What your growth assumption tells you/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect((document.getElementById("eps-gt-p") as HTMLElement).hidden).toBe(true);
    expect(document.querySelector(".eps-res")?.nextElementSibling?.classList.contains("eps-gt")).toBe(true);
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect((document.getElementById("eps-gt-p") as HTMLElement).hidden).toBe(false);
    expect([...document.querySelectorAll(".eps-gtm b")].map((b) => b.textContent)).toEqual(["EPS", "P/E ratio", "PEG ratio", "Implied 5Y EPS"]);
    expect(rowOf("EPS").textContent).toMatch(/Not affected by growth/);
    expect(rowOf("PEG ratio").textContent).toMatch(/Moves with growth/);
    fireEvent.click(btn);
    expect((document.getElementById("eps-gt-p") as HTMLElement).hidden).toBe(true);
  });

  it("a quick pick updates it at once against the previous rate", () => {
    vi.useFakeTimers();
    open();
    fireEvent.click(screen.getByRole("button", { name: /What your growth assumption tells you/ }));
    // EPS 11, P/E 27.27x: at 10% PEG 2.73
    expect(within(rowOf("PEG ratio")).getByText("2.73")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Quick pick growth" })).getByRole("button", { name: "20%" }));
    expect(rowOf("PEG ratio").dataset.dir).toBe("down");
    expect(rowOf("PEG ratio").textContent).toMatch(/2\.73 → 1\.36/);
    expect(rowOf("Implied 5Y EPS").dataset.dir).toBe("up");
    expect(rowOf("EPS").dataset.dir).toBe("same");
    expect(rowOf("P/E ratio").dataset.dir).toBe("same");
    expect(document.querySelector(".eps-gth")?.textContent).toMatch(/raised from 10% to 20%: 2 of 4 results change/);
    // once it settles, the next change compares with 20%
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.click(within(screen.getByRole("group", { name: "Quick pick growth" })).getByRole("button", { name: "5%" }));
    expect(document.querySelector(".eps-gth")?.textContent).toMatch(/lowered from 20% to 5%/);
    expect(rowOf("PEG ratio").dataset.dir).toBe("up");
  });

  it("changing the company inputs updates the values too", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /What your growth assumption tells you/ }));
    fireEvent.change(screen.getByLabelText(/Current share price/), { target: { value: "550" } });
    expect(rowOf("P/E ratio").textContent).toMatch(/50\.00x/);
    expect(rowOf("PEG ratio").textContent).toMatch(/5\.00/);
  });
});
