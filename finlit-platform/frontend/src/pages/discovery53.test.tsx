// @vitest-environment jsdom
// Developer file 53 (founder, 27 Nov 2026, 7:36 pm: "in the tables present in the Discover page we need to add proper segregation/separation, and see if
// everything makes sense"): the company table's columns in named groups with a divider where each group starts, alternate rows shaded; the Sectors grid's
// groups (the largest themes, the broad groups, the total) and an "Other themes" column so every row adds up to All (Industrials' cells summed to 271 of
// its 277); What changed's record with its dates once, not six times.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, BoardRow } from "../discovery/model";

const mk = (s: string, th: string, mac: string, extra: Partial<BoardRow> = {}): BoardRow => ({ s, n: s + " Ltd", th, sec: [], st: "Operating", tone: 0.4, fc: 1, ev: {}, mac, sc: mac,
  ind: mac, dd: "2026-11-05", pg: 30, grp: null, ...extra });
// thirteen specific themes (so three are not among the ten largest) and the two broad groups
const SPEC = Array.from({ length: 13 }, (_, i) => `Theme ${String.fromCharCode(65 + i)}`);
const ROWS: BoardRow[] = [
  ...SPEC.flatMap((t, i) => Array.from({ length: 13 - i }, (_, j) => mk(`${t.slice(-1)}${j}`, t, j % 2 ? "Industrials" : "Power"))),
  mk("BRD1", "Broad One", "Industrials"), mk("BRD2", "Broad Two", "Power"), mk("DIV1", "Theme M", "Diversified"), mk("DIV2", "Theme L", "Diversified"),
];
const T = (name: string, broad = false) => ({ name, label: name + " (full)", short: name, broad, n: 0, also: 0, news: { filings: 0, positive: 0, negative: 0 }, verify: [], merged: [] as string[] });
const BOARD: Board = { updated: "2026-11-19T02:00:00", companies: ROWS.length, read: ROWS.length, days: 90, rows: ROWS, themes: [...SPEC.map((t) => T(t)), T("Broad One", true), T("Broad Two", true)],
  efil: {}, thfil: {}, events: ["order"], eventsTracked: ["order"], caution: "A keyword mention by itself is not proof.", method: "How it is built." };
const UNI = { rows: ROWS.map((r, i) => ({ symbol: r.s, name: r.n, prism_final: 50 + (i % 40), prism_label: "AVERAGE", prism_lt: "Uptrend", prism_st: "Uptrend", ret_3m: 1, market_cap: 1000 + i })), as_of: "2026-11-19" };
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (p: string) => {
    if (p === "/api/discovery/board") return JSON.parse(JSON.stringify(BOARD));
    if (p === "/api/screener/universe") return JSON.parse(JSON.stringify(UNI));
    throw Object.assign(new Error("not stood in: " + p), { status: 503 });
  }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()),
  useUI: () => ({ plan: "gold", has: () => true, toast: () => undefined, upgrade: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: 7 } }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { DiscoveryPage } from "./Discovery";
import { COL_GROUPS, groupSpans, groupStarts } from "../discovery/CompanyTable";

const show = async (path: string) => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes><Route path="/discover/*" element={<DiscoveryPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("navigation", { name: "Discover views" });
};
const css = () => readFileSync(join(__dirname, "..", "discovery", "discover.css"), "utf8");
const ALL = ["co", "cls", "th", "ev", "pr", "st", "lt", "r3m", "r1y", "hi", "mc", "cn"];
beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });
afterEach(() => { cleanup(); });

describe("developer file 53: the company table's column groups", () => {
  it("six groups in the columns' order; a hidden column shortens its group, a group with none goes; the company's column draws no divider", () => {
    expect(groupSpans(ALL)).toEqual([{ g: "co", n: 1 }, { g: "where", n: 2 }, { g: "filed", n: 1 }, { g: "read", n: 3 }, { g: "price", n: 4 }, { g: "ind", n: 1 }]);
    expect(Object.values(COL_GROUPS)).toEqual(["", "Where it is placed", "Filings", "FinLit's reading", "Price and size", "Its industry"]);
    expect([...groupStarts(ALL)]).toEqual(["cls", "ev", "pr", "r3m", "cn"]);
    const some = ALL.filter((k) => k !== "ev" && k !== "r3m" && k !== "cls");
    expect(groupSpans(some)).toEqual([{ g: "co", n: 1 }, { g: "where", n: 1 }, { g: "read", n: 3 }, { g: "price", n: 3 }, { g: "ind", n: 1 }]);
    expect([...groupStarts(some)]).toEqual(["th", "pr", "r1y", "cn"]);
  });
  it("the header: a group row over the column names, its spans covering every column; the divider down the header and every row; alternate rows marked", async () => {
    await show("/discover/companies");
    const grp = document.querySelector(".dsc-tb thead tr.dsc-grp")!, names = document.querySelector(".dsc-tb thead tr.dsc-cols")!;
    const gth = [...grp.querySelectorAll("th")];
    expect(gth.map((t) => t.textContent)).toEqual(["", "Where it is placed", "Filings", "FinLit's reading", "Price and size", "Its industry"]);
    expect(gth.every((t) => t.getAttribute("scope") === "colgroup")).toBe(true);
    expect(gth.reduce((a, t) => a + Number(t.getAttribute("colspan")), 0)).toBe(names.querySelectorAll("th").length);
    const gsCols = [...names.querySelectorAll("th")].map((t, i) => (t.classList.contains("dsc-gs") ? i : -1)).filter((i) => i >= 0);
    expect(gsCols).toEqual([1, 3, 4, 7, 11]);
    const rows = [...document.querySelectorAll(".dsc-tb tbody tr[data-dsc-row]")];
    rows.forEach((r) => expect([...r.children].map((c, i) => (c.classList.contains("dsc-gs") ? i : -1)).filter((i) => i >= 0)).toEqual(gsCols));
    expect(rows.map((r) => r.classList.contains("dsc-z"))).toEqual(rows.map((_, i) => i % 2 === 1));
  });
  it("hiding a column moves its group's divider to the next column and shortens the group's span; the Columns menu names the groups", async () => {
    await show("/discover/companies");
    const d = (fireEvent.click(screen.getAllByRole("button", { name: /^Columns/ }).find((b) => b.classList.contains("dbx-ddb"))!), screen.getByRole("dialog"));
    expect([...d.querySelectorAll(".dbx-cg")].map((p) => p.textContent)).toEqual(["Where it is placed", "Filings", "FinLit's reading", "Price and size", "Its industry"]);
    fireEvent.click(within(d).getByRole("checkbox", { name: "3 months" }));
    const g = [...document.querySelectorAll(".dsc-tb thead tr.dsc-grp th")].find((t) => t.textContent === "Price and size")!;
    expect(g.getAttribute("colspan")).toBe("3");
    const names = [...document.querySelectorAll(".dsc-tb thead tr.dsc-cols th")];
    expect(names.find((t) => t.textContent!.startsWith("1 year"))!.classList.contains("dsc-gs")).toBe(true);
  });
  it("styles: the column names pinned under the group row at its measured height; the dividers; full-strength row lines; shaded and pointed rows", () => {
    const c = css();
    expect(c).toContain(".dsc-stick thead tr.dsc-cols th { top: var(--hr1, 26px); }");
    expect(c).toContain(".dsc-tw th.dsc-gs, .dsc-tw td.dsc-gs { border-left: 1px solid var(--border-strong); }");
    expect(c).toContain(".dsc-tb tbody td { border-bottom-color: var(--border); }");
    expect(c).toMatch(/\.dsc-tb tbody tr\.dsc-z > td, \.dsc-tb tbody tr\.dsc-z > td\.co \{ background: color-mix\(in srgb, var\(--s2\) 50%, var\(--s1\)\); \}/);
    expect(c).toMatch(/\.dsc-tb tbody tr\.dsc-open > td, \.dsc-tb tbody tr\.dsc-open > td\.co \{ background: var\(--s2\); \}/);   // after the shading, so an open row keeps its colour
    expect(c.indexOf(".dsc-tb tbody tr.dsc-open > td, .dsc-tb tbody tr.dsc-open > td.co")).toBeGreaterThan(c.indexOf(".dsc-tb tbody tr.dsc-z > td"));
    // a group's name stays in view beside the pinned first column while the table scrolls sideways; the grid's names start at their first column
    expect(c).toContain(".dsc-tw thead tr.dsc-grp th > span { position: sticky; left: calc(var(--c1w, 0px) + 8px); display: inline-block; }");
    expect(c).toContain(".dsc-map thead tr.dsc-grp th { text-align: left !important; padding-left: 8px !important; }");
    expect(readFileSync(join(__dirname, "..", "discovery", "CompanyTable.tsx"), "utf8")).toContain('el.style.setProperty("--c1w", `${(c1 as HTMLElement).offsetWidth}px`)');
  });
  it("the new classes are Discover's own: the bare 'gs' is the site search's pop-up (position: fixed), which first pulled the group cells out of the table", () => {
    const src = ["CompanyTable.tsx", "Views.tsx"].map((f) => readFileSync(join(__dirname, "..", "discovery", f), "utf8")).join("\n");
    expect(src).not.toMatch(/className=\{?["'`][^"'`]*(?<![\w-])gs(?![\w-])/);
    expect(src).not.toMatch(/["'`](gs|z)["'`]/);                                              // no bare "gs" or "z" anywhere, as a ternary's result either
    const search = readFileSync(join(__dirname, "..", "styles", "search.css"), "utf8");
    expect(search).toMatch(/^\.gs \{/m);                                                    // still there, so the guard above matters
  });
});

describe("developer file 53: the Sectors grid", () => {
  it("groups over the columns: the ten largest themes then 'Other themes', the broad groups, the total; dividers where each starts", async () => {
    await show("/discover/sectors");
    const map = document.querySelector(".dsc-map")!;
    const grp = [...map.querySelectorAll("thead tr.dsc-grp th")];
    expect(grp.map((t) => [t.textContent, t.getAttribute("colspan")])).toEqual([["", null], ["The 10 largest themes, then the rest", "11"], ["Broad groups", "2"], ["", null]]);
    const names = [...map.querySelectorAll("thead tr.dsc-cols th")];
    expect(names.map((t) => t.textContent)).toEqual(["Macro sector", ...SPEC.slice(0, 10), "Other themes", "Broad One", "Broad Two", "All"]);
    expect(names.map((t, i) => (t.classList.contains("dsc-gs") ? i : -1)).filter((i) => i >= 0)).toEqual([1, 12, 14]);
    expect(names[11].getAttribute("title")).toBe("Every other theme: Theme K (full), Theme L (full), Theme M (full)");
  });
  it("every row adds up to All, in companies and in % (the hidden themes were not counted anywhere); Diversified, all in hidden themes, is no longer blank", async () => {
    await show("/discover/sectors");
    const rows = [...document.querySelectorAll(".dsc-map tbody tr")];
    expect(rows.map((r) => r.querySelector("th")!.textContent)).toEqual(expect.arrayContaining(["Industrials", "Power", "Diversified"]));
    const sum = (r: Element) => [...r.querySelectorAll("td:not(.tot)")].reduce((a, td) => a + (parseInt(td.textContent || "", 10) || 0), 0);
    rows.forEach((r) => expect(sum(r)).toBe(Number(r.querySelector("td.tot")!.textContent)));
    const div = rows.find((r) => r.querySelector("th")!.textContent === "Diversified")!;
    expect(div.querySelector("td.oth")!.textContent).toBe("2");
    expect(div.querySelectorAll(".dw-hc")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /^% of the macro sector/ }));
    expect(div.querySelector("td.oth")!.textContent).toBe("100%");
  });
});

describe("developer file 53: the industries tables", () => {
  it("three named groups over the column names, a divider where each starts, in the header and in every row (the Industries list and a macro sector page)", async () => {
    for (const path of ["/discover/sectors", "/discover/sectors/industrials"]) {
      cleanup(); await show(path);
      if (path === "/discover/sectors") fireEvent.click(screen.getByRole("button", { name: /^Industries/ }));
      const t = document.querySelector("table.dsc-ind")!;
      expect([...t.querySelectorAll("thead tr.dsc-grp th")].map((x) => [x.textContent, x.getAttribute("colspan")])).toEqual([["", null], ["Its companies in Discover", "2"], ["Their price moves", "2"], ["The industry's readings", "2"]]);
      const at = (r: Element) => [...r.children].map((c, i) => (c.classList.contains("dsc-gs") ? i : -1)).filter((i) => i >= 0);
      expect(at(t.querySelector("thead tr.dsc-cols")!)).toEqual([1, 3, 5]);
      const body = [...t.querySelectorAll("tbody tr")];
      expect(body.length).toBeGreaterThan(0);
      body.forEach((r) => expect(at(r)).toEqual([1, 3, 5]));
    }
  });
});

describe("developer file 53: What changed's record", () => {
  it("the four dates once, in one row, and the groups in one line under it (the six rows repeated the same dates)", async () => {
    await show("/discover/changes");
    const t = document.querySelector(".dsc-rec")!;
    expect([...t.querySelectorAll("thead th")].map((x) => x.textContent)).toEqual(["Figures", "1 month later", "3 months", "6 months", "12 months"]);
    expect(t.querySelectorAll("tbody tr")).toHaveLength(1);
    const foot = t.closest(".dw-accb")!.querySelector(".dsc-foot")!.textContent!;
    expect(foot).toMatch(/^Shown for each group \(Order wins, Capacity and commissioning, .*, and each theme\), each against the Nifty 500 over the same days\.$/);
  });
});
