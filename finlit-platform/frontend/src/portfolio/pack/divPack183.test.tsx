// @vitest-environment jsdom
// Task #183 W7 (Equity portfolio, Diversification analytics, D50–D71): the sub-tabs (opened by a jump too), the Macro sector · Sector switch, the cell reader,
// the group filter, the share grid's order and cross-sector switch, and the Where it sits grid's totals.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { DivSubTabs, ShareGrid, WhereSitsGrid, divKeys, type DivInput } from "./DivPack";
import type { PageObject } from "../types";

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(cleanup);

const order = ["A", "B", "C", "D", "E"];
const corr = [[1, 0.8, 0.3, 0.1, 0.6], [0.8, 1, 0.4, 0.2, 0.5], [0.3, 0.4, 1, 0.2, 0.1], [0.1, 0.2, 0.2, 1, 0], [0.6, 0.5, 0.1, 0, 1]];
const L: Record<string, [string, string, string]> = { A: ["Industrials", "Capital Goods", "Industrial Products"], B: ["Industrials", "Capital Goods", "Electrical Equipment"], C: ["Industrials", "Construction", "Construction"],
  D: ["Information Technology", "Information Technology", "IT - Software"], E: ["Utilities", "Power", "Power"] };
const page = { order, corr, groups: [{ members: ["A", "B", "E"], avg_corr: 0.63, letter: "A" }], avg_with_rest: { A: 0.45, B: 0.48, C: 0.25, D: 0.13, E: 0.3 },
  score: { score: 70, band: "Fairly spread", comovement: 72, sector_spread: 66, effective_stocks: 2.9, effective_sectors: 2.4 } } as unknown as PageObject;
const d: DivInput = { page, symbols: order, levelOf: (s, l) => L[s][l === "macro" ? 0 : l === "sector" ? 1 : 2], sizeOf: (s) => ({ A: "Small", B: "Small", C: "Mid", D: "Large", E: null } as const)[s as "A"],
  band: (s) => (s === "D" ? "b" : "g"), gold: true, nameOf: (s) => `${s} Ltd` };
const view = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("the three sub-tabs (D54)", () => {
  it("open on click and on a jump to their section (Key figures, the sections bar)", () => {
    view(<DivSubTabs d={d} />);
    expect(screen.getAllByRole("tab").map((t) => t.querySelector("b")!.textContent)).toEqual(["How sectors move together", "How stocks move together", "Large, mid, small and micro"]);
    expect(screen.getByRole("heading", { name: /Do your macro sectors move together\?/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /How stocks move together/ }));
    expect(screen.getByRole("heading", { name: /How stocks move together/ })).toBeTruthy();
    act(() => { window.dispatchEvent(new CustomEvent("eq-jump", { detail: "eq-sizes" })); });
    expect(screen.getByRole("heading", { name: /Do large, mid, small and micro companies move together\?/ })).toBeTruthy();
  });
  it("switches the sector panel between Macro sector and Sector, and reads a tapped cell (D56, D59)", () => {
    view(<DivSubTabs d={d} />);
    fireEvent.click(screen.getByRole("button", { name: "Industrials and Utilities: 0.40, partly linked" }));
    expect(screen.getByText(/Industrials · Utilities: 0.40/).closest("p")!.textContent).toMatch(/Across 3 pairs of shares, they are partly linked/)   // task #385: file 33's correlation words;
    fireEvent.click(screen.getByRole("button", { name: "Sector · 4" }));
    expect(screen.getByRole("heading", { name: /Do your sectors move together\?/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capital Goods and Capital Goods: 0.80, closely linked" })).toBeTruthy();
  });
  it("filters the stock groups: all, crossing sectors, one sector (D61, D62)", () => {
    view(<DivSubTabs d={d} />);
    fireEvent.click(screen.getByRole("tab", { name: /How stocks move together/ }));
    expect(screen.getByText("Industrials + Utilities")).toBeTruthy(); expect(screen.getByText("Crosses sectors", { selector: ".eqd-xb" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "One sector" }));
    expect(screen.queryByText("Industrials + Utilities")).toBeNull(); expect(screen.getByText("No group sits inside one sector.")).toBeTruthy();
  });
});

describe("share by share (D67–D69)", () => {
  it("orders by sector, by how they move or by Rest, hides same-sector pairs on request, and reads a share", () => {
    view(<ShareGrid d={d} />);
    const names = () => Array.from(document.querySelectorAll(".eqd-sheat tbody th")).map((t) => t.textContent);
    expect(names()).toEqual(["A", "B", "C", "D", "E"]);
    fireEvent.click(screen.getByRole("button", { name: "Most independent first" }));   // task #385: the order buttons say what they do
    expect(names()).toEqual(["D", "C", "E", "A", "B"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Only pairs across sectors/ }));
    expect(screen.queryByRole("button", { name: "A and B: 0.80, closely linked" })).toBeNull(); expect(screen.getByRole("button", { name: "A and E: 0.60, closely linked" })).toBeTruthy();
    fireEvent.click(within(document.querySelector(".eqd-sheat tbody")!).getByRole("button", { name: "D" }));
    const read = document.querySelector(".eqv-rc1")!.textContent!;   // task #385: the full-width reading panel
    expect(read).toMatch(/D · Information Technology/); expect(read).toMatch(/0\.13Barely linked with the rest/);
  });
});

describe("where it sits (D52, D53)", () => {
  it("shows a chip per share with its band, darker cells, the row share and a 100% total", () => {
    view(<WhereSitsGrid d={d} />);
    const rows = Array.from(document.querySelectorAll(".eqd-ws tbody tr"));
    expect(rows.map((r) => r.querySelector("th")!.firstChild!.textContent)).toEqual(["Industrials", "Information Technology", "Utilities"]);   // task #385: a note under each name
    expect(rows[0].querySelector(".eqd-of")!.textContent).toBe("60.0%3 shares");
    expect(document.querySelector(".eqd-ws tfoot")!.textContent).toMatch(/100%$/);
    expect(rows[1].querySelector(".eqd-chip i")!.className).toBe("b-b");
    expect(screen.getByText(/No size band yet for E/)).toBeTruthy();
  });
  it("names three key figures", () => {
    expect(divKeys(d).map((c) => c.k)).toEqual(["Concentration", "Hidden packs", "Moves like"]);
  });
});
