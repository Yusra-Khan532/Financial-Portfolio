// @vitest-environment jsdom
// Task #426 (team, 27 Nov 2026): "the boxes are not aligned properly we can see the mismatch and when we slide left to see other columns then all boxes
// are going into each other". The frozen Scheme cell was display:flex, so it was not a table cell: shorter than its row (81px in a 117px row), its line
// above the others, and the sliding cells showed under it. It is a table cell again with its contents in .mf-namein; a stopped scheme's frozen cell
// stays solid (only its contents fade). The browser check (1440, 1150, 390, light and dark) measured every row's frozen cell at its row's height.
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_QUERY, type FundRow } from "../lib/mf";
import { UIProvider } from "../lib/ui";
import { FundTable } from "./FundTable";

vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()),
  useAuth: () => ({ ready: true, user: null, plan: "basic", limits: {}, isAdmin: false, seesAll: false, showcase: [], prismReportsPerDay: null, refresh: async () => {}, signOut: async () => {} }) }));

const css = readFileSync(resolve(process.cwd(), "src", "styles", "mf341.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const row = (code: number, active = true) => ({ code, name: `Fund ${code}`, amc: "HDFC Mutual Fund", category: "Equity Scheme - Flexi Cap Fund", plan: "Regular", option: "IDCW", optionClass: "IDCW",
  nav: 79.59, navDate: "2026-11-26", change: null, active, r1y: 5.68, noReturns: null }) as unknown as FundRow;

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("task #426: the frozen Scheme column lines up with its row and stays solid while the table slides", () => {
  it("the name cell holds one box (.mf-namein) with the tick, the star and the name", () => {
    const { container } = render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><UIProvider>
      <FundTable rows={[row(1), row(2, false)]} cols={["r1y"]} q={EMPTY_QUERY} onSort={() => {}} picked={[]} onPick={() => {}} wish={{ has: () => false, toggle: () => {} }} />
    </UIProvider></QueryClientProvider></MemoryRouter>);
    for (const th of container.querySelectorAll("tbody th.mf-name")) {
      expect(th.children).toHaveLength(1);
      const box = th.firstElementChild!;
      expect(box.className).toBe("mf-namein");
      expect(box.querySelector(".mf-rowacts input[type=checkbox]")).toBeTruthy();
      expect(box.querySelector(".mf-wish")).toBeTruthy();
      expect(box.querySelector(".mf-nm a")).toBeTruthy();
    }
  });
  it("on the Mutual funds list the name cell is a table cell (full row height) and the side-by-side layout is inside it", () => {
    expect(css).toMatch(/\.mf-list \.mf-table tbody th\.mf-name \{ display: table-cell; vertical-align: middle; background-color: var\(--s1\);/);
    expect(css).toMatch(/\.mf-list \.mf-table \.mf-namein \{ display: flex; align-items: flex-start; gap: 10px; min-width: 0; \}/);
  });
  it("a stopped scheme's frozen cell is not see-through: only its contents fade", () => {
    expect(css).toMatch(/\.mf-list \.mf-table tbody tr\.mf-stopped th\.mf-name \{ opacity: 1; \}/);
    expect(css).toMatch(/\.mf-list \.mf-table tbody tr\.mf-stopped th\.mf-name \.mf-namein \{ opacity: \.72; \}/);
  });
});
