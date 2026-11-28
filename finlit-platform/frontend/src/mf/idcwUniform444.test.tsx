// @vitest-environment jsdom
// Task #444 (team, 28 Nov 2026): "as you can see in image 1 and image 2 the boxes have different colour for different filter chosen so uniformity in
// this aspect is still missing". With Option = Growth the 1, 3 and 5-year cells were bold figures on a tinted cell; with Option = IDCW the same cells
// (the Growth option's return, task #281) were italic, underlined and on a plain cell, because the tint read the row's own (empty) figure. Now both
// look the same: same tint, weight and colour; only a small "G" (named on hover and to screen readers) says whose return an IDCW row shows.
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_QUERY, GROWTH_RETURNS_LABEL, type ColId, type FundRow } from "../lib/mf";
import { UIProvider } from "../lib/ui";
import { FundTable } from "./FundTable";

vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()),
  useAuth: () => ({ ready: true, user: null, plan: "basic", limits: {}, isAdmin: false, seesAll: false, showcase: [], prismReportsPerDay: null, refresh: async () => {}, signOut: async () => {} }) }));

const css = readFileSync(resolve(process.cwd(), "src", "styles/mf341.css"), "utf8");
const G = { code: 120000, name: "Aditya Birla Sun Life ELSS Tax Saver Fund", r1y: 1.92, r3y: 12.19, r5y: 9.02, retDate: "2026-11-26", label: GROWTH_RETURNS_LABEL };
const growth = { code: 120000, name: "Aditya Birla Sun Life ELSS Tax Saver Fund", amc: "Aditya Birla Sun Life Mutual Fund", category: "Equity Scheme - ELSS", plan: "Regular", option: "Growth",
  optionClass: "Growth", nav: 64.19, navDate: "2026-11-26", change: 0.2, active: true, r1y: 1.92, r3y: 12.19, r5y: 9.02, sip3y: 7.6, sip5y: 11.2, aum: 14476, aumKind: "q", aumAsOf: "2026-09-30",
  ter: 1.7, noReturns: null } as unknown as FundRow;
const idcw = { ...growth, code: 120001, option: "IDCW", optionClass: "IDCW", nav: 196.93, r1y: null, r3y: null, r5y: null, sip3y: null, sip5y: null, noReturns: "idcw", growthReturns: G } as unknown as FundRow;
const COLS: ColId[] = ["nav", "r1y", "r3y", "r5y"];

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const draw = (rows: FundRow[]) => render(
  <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><UIProvider>
    <FundTable rows={rows} cols={COLS} q={EMPTY_QUERY} onSort={() => {}} picked={[]} onPick={() => {}} />
  </UIProvider></QueryClientProvider></MemoryRouter>);
const cells = (c: HTMLElement, i: number) => ["r1y", "r3y", "r5y"].map((k) => c.querySelectorAll("tbody tr")[i].querySelector<HTMLElement>(`td.mf-c-${k}`)!);

describe("task #444: an IDCW row's return cells look like a Growth row's", () => {
  it("the IDCW row's 1, 3 and 5-year cells are tinted exactly like the Growth row's (same figures, same tint)", () => {
    const { container } = draw([growth, idcw]);
    const [g, d] = [cells(container, 0), cells(container, 1)];
    for (let k = 0; k < 3; k++) {
      expect(d[k].classList.contains("mf-tinted"), d[k].outerHTML).toBe(true);
      expect(d[k].getAttribute("style")).toBe(g[k].getAttribute("style"));
      expect(d[k].querySelector(".pos")).not.toBeNull();   // the same colour rule as a Growth figure
    }
  });
  it("an IDCW-only list (Option = IDCW) is tinted too: the scale counts the figures shown", () => {
    const { container } = draw([idcw]);
    for (const td of cells(container, 0)) expect(td.classList.contains("mf-tinted")).toBe(true);
  });
  it("no separate style: no italics or underline on the figure; a small muted G, hidden from screen readers that hear the full label instead", () => {
    expect(css).not.toMatch(/\.mf-grf > span:first-child \{ font-style: italic/);
    expect(css).toMatch(/\.mf-list \.mf-table td \.mf-gmark \{ font-size: var\(--fs-12\); font-weight: 600; line-height: 1; color: var\(--muted\);/);
    const { container } = draw([idcw]);
    const m = container.querySelector("td.mf-c-r1y .mf-gmark")!;
    expect(m.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("td.mf-c-r1y .sr-only")!.textContent).toContain(GROWTH_RETURNS_LABEL);
    expect(container.querySelector("td.mf-c-r1y .mf-grf")!.getAttribute("title")).toContain(GROWTH_RETURNS_LABEL);
  });
});
