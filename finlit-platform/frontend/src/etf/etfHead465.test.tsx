// @vitest-environment jsdom
// Task #465 (team, 28 Nov 2026), ETFs: "make this ui correction why is it overlapping". With a filter on, Reset all broke over two lines
// and Hide filters was cut off at the Filters box's edge. Hide filters now stays on the title row and Reset all takes its own row.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EtfList as ListOut } from "../lib/etf";

vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
const LIST: ListOut = { items: [], total: 0, universe: 366, hotCount: 0, offset: 0, limit: 40, excluded: 0, categories: [], groups: [{ key: "equity", label: "Equity", count: 266 }], asOf: "2026-11-27", updatedAt: "2026-11-27T17:00:00Z", source: "AMFI", disclaimer: "Information only." };
vi.mock("../lib/etf", async (orig) => ({ ...(await orig<typeof import("../lib/etf")>()), useEtfList: () => ({ data: LIST, isLoading: false, isError: false, isFetching: false, refetch: () => undefined }) }));
import { EtfListPage } from "./List";

const css = readFileSync(join(__dirname, "../styles/task465.css"), "utf8");
const src = readFileSync(join(__dirname, "List.tsx"), "utf8");
afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* jsdom */ } });
const open = (q: string) => render(<MemoryRouter initialEntries={[`/etfs${q}`]}><EtfListPage /></MemoryRouter>);

describe("task #465: the Filters header fits the panel", () => {
  it("with a filter on: Filters, 1 on, Hide filters, then Reset all (the order the eye and the Tab key follow)", () => {
    open("?asset=equity");
    const head = document.querySelector(".etf-side-h")!;
    expect([...head.children].map((e) => e.textContent!.trim())).toEqual(["Filters", "1 on", "Hide filters", "Reset all"]);
  });
  it("with no filter on there is no Reset all and no second row", () => {
    open("");
    const head = document.querySelector(".etf-side-h")!;
    expect([...head.children].map((e) => e.textContent!.trim())).toEqual(["Filters", "Hide filters"]);
    expect(css).toMatch(/\.etf-side-h:has\(\.etf-resetl\)::after\s*\{[^}]*flex-basis: 100%/);
  });
  it("nothing in the header breaks inside itself; Reset all goes to its own row; the CSS is loaded and scoped to the ETF list", () => {
    expect(css).toMatch(/\.etf-side-h\s*\{[^}]*flex-wrap: wrap/);
    expect(css).toMatch(/\.etf-side-h > \*\s*\{[^}]*white-space: nowrap[^}]*flex-shrink: 0/);
    expect(css).toMatch(/\.etf-resetl\s*\{[^}]*order: 3/);
    for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.trim()).filter(Boolean)) expect(rule.startsWith(".etf-list ")).toBe(true);
    expect(src).toContain('import "../styles/task465.css";');
  });
});
