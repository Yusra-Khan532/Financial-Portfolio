// @vitest-environment jsdom
// Trading Lab > Order Flow (Global) > US companies: the board of companies from their SEC filings (the route's answer built by backend
// lab/companies.py from a trimmed real load of 27 Nov 2026: Apple, JPMorgan Chase, Walmart, Visa, Intel). Tiles sized by revenue and coloured by its
// change, a company's figures with their fiscal period and filing, "—" with the reason where a filing has no figure, a card on every mark.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { UsCompanies, boardLine, fyLabel, growthFill, missingWhy, qLabel, slots, treemap, usd, yearBefore, type Companies } from "./UsCompanies";
import SAMPLE from "./__fixtures__/companies.json";

const C = SAMPLE as unknown as Extract<Companies, { ready: true }>;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
beforeEach(() => { urls.length = 0; vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); return json(C); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (at = "/lab/flow?view=companies&m=global") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter initialEntries={[at]}><TipLayer><UsCompanies /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };
const tile = (name: RegExp) => screen.getByRole("button", { name });

describe("US companies, the pieces", () => {
  it("writes US dollars the way the Global pages do, and each period from its end date", () => {
    expect(usd(182_447_000_000)).toBe("$182.4 bn"); expect(usd(4_424_900_000_000)).toBe("$4.42 tn"); expect(usd(-1_234_000_000)).toBe("−$1.23 bn");
    expect(usd(256_000_000)).toBe("$256 mn"); expect(usd(null)).toBe("—");
    expect(fyLabel("2025-12-31")).toBe("FY ended 31 Dec 2025"); expect(qLabel("2026-06-27")).toBe("quarter ended 27 Jun 2026");
  });
  it("a change on the year before only when that period is filed", () => {
    expect(yearBefore([["2024-12-31", 100], ["2025-12-31", 110]], "2025-12-31")).toBe(10);
    expect(yearBefore([["2023-12-31", 100], ["2025-12-31", 110]], "2025-12-31")).toBeNull();
  });
  it("a missing quarter is an empty slot, never closed up", () => {
    expect(slots(["2025-03-31", "2025-06-30", "2025-12-31"], 91)).toEqual(["2025-03-31", "2025-06-30", null, "2025-12-31"]);
  });
  it("tiles take space in proportion to revenue and fill the board", () => {
    const r = treemap([{ item: "a", value: 600 }, { item: "b", value: 300 }, { item: "c", value: 100 }], { x: 0, y: 0, w: 1000, h: 500 });
    const area = (k: string) => { const t = r.find((x) => x.item === k)!; return t.w * t.h; };
    expect(r).toHaveLength(3);
    expect(area("a") / 500_000).toBeCloseTo(0.6, 5); expect(area("c") / 500_000).toBeCloseTo(0.1, 5);
    expect(r.every((t) => t.x >= -1e-9 && t.y >= -1e-9 && t.x + t.w <= 1000 + 1e-6 && t.y + t.h <= 500 + 1e-6)).toBe(true);
  });
  it("colour from tokens only: green for growth, red for a fall, neutral with nothing to compare", () => {
    expect(growthFill(12).background).toMatch(/^color-mix\(in srgb, var\(--gain\) \d+%, var\(--s2\)\)$/);
    expect(growthFill(-30).background).toBe("color-mix(in srgb, var(--loss) 80%, var(--s2))");
    expect(growthFill(null).background).toBe("var(--s2)");
  });
  it("banks have no operating income line, and the reason says so", () => {
    expect(missingWhy("operatingIncome", C.details.JPM)).toContain("Banks and other financial companies do not report an operating income total");
  });
});

describe("US companies, the page", () => {
  it("reads the Lab's companies route and draws a tile per company in its sector", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/companies"))).toBe(true);
    expect(document.querySelectorAll(".usco-tile")).toHaveLength(C.companies.length);
    expect(screen.getByRole("region", { name: "Financials" })).toBeTruthy();
    expect(document.body.textContent).toContain(boardLine(C));
  });
  it("JPMorgan Chase first (the founder's example), with its period and filing on every figure; operating income — with the reason", async () => {
    wrap(); await settle();
    expect(tile(/^JPMorgan Chase/).getAttribute("aria-pressed")).toBe("true");
    const co = screen.getByRole("region", { name: /JPMorgan Chase/ });
    expect(co.querySelector("#usco-co-h")?.textContent).toContain("JPMorgan Chase");
    expect(co.textContent).toContain("JPMORGAN CHASE & CO");
    const kpis = co.querySelectorAll(".usco-kpi");
    expect(kpis).toHaveLength(6);
    kpis.forEach((k) => { expect(k.textContent).toContain("FY ended 31 Dec 2025"); expect(k.textContent).toContain("SEC filing (10-K)"); });
    const op = [...kpis].find((k) => k.textContent?.startsWith("Operating income"))!;
    expect(op.querySelector("dd")?.textContent).toBe("—");
    point(op);
    expect(screen.getByRole("tooltip").textContent).toContain("Banks and other financial companies do not report an operating income total");
  });
  it("choosing a tile shows that company; the liabilities a filing does not total are marked derived", async () => {
    wrap(); await settle();
    fireEvent.click(tile(/^Walmart/)); await settle();
    expect(tile(/^Walmart/).getAttribute("aria-pressed")).toBe("true");
    expect(tile(/^JPMorgan Chase/).getAttribute("aria-pressed")).toBe("false");
    const bs = screen.getByRole("list", { name: /Walmart: balance sheet/ });
    const liab = within(bs).getAllByRole("listitem").find((li) => li.textContent?.startsWith("Total liabilities"))!;
    expect(liab.textContent).toContain("derived");
    point(liab);
    expect(screen.getByRole("tooltip").textContent).toContain("total assets less shareholders' equity");
  });
  it("ten years of revenue with net income, and the last nine quarters with a derived fourth quarter, each with a card", async () => {
    wrap("/lab/flow?view=companies&m=global&co=AAPL"); await settle();
    const [years, quarters] = screen.getAllByRole("img").filter((s) => s.classList.contains("usco-chart"));
    expect(years.querySelectorAll(".usco-bar")).toHaveLength(10);
    expect(years.querySelector(".ni")?.getAttribute("d")).toMatch(/^M/);
    expect(quarters.querySelectorAll(".usco-bar")).toHaveLength(9);
    const dv = quarters.querySelectorAll(".usco-bar.dv");
    expect(dv.length).toBeGreaterThan(0);
    point(dv[dv.length - 1]);
    const pop = screen.getByRole("tooltip").textContent ?? "";
    expect(pop).toContain("derived: the year (10-K) less its three quarters (10-Q)"); expect(pop).toContain("quarter ended");
    point(years.querySelectorAll(".usco-bar")[9]);
    expect(screen.getByRole("tooltip").textContent).toContain("SEC filing (10-K)");
  });
  it("pointing at a tile shows its figures", async () => {
    wrap(); await settle();
    point(tile(/^Apple/));
    const pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("Apple")).toBeTruthy(); expect(pop.textContent).toContain("SEC filing (10-K)");
  });
  it("says when the first load has not run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ready: false, reason: "The companies' SEC filings load once a week; the first load has not run yet." })));
    wrap(); await settle();
    expect(document.body.textContent).toContain("the first load has not run yet");
  });
  it("describes, never advises: neither the page nor its source uses advice or forecast words", async () => {
    wrap(); await settle();
    const BANNED = /\b(buy|sell|hold|target|best|top pick|recommended|forecast|likely|will rise|will fall|bullish|bearish|signal)s?\b/i;
    expect(document.body.textContent ?? "").not.toMatch(BANNED);
    const src = readFileSync(join(process.cwd(), "src/components/lab/UsCompanies.tsx"), "utf8");
    const strings = src.match(/"[^"\n]*"|`[^`\n]*`|>[^<>{}\n]+</g) ?? [];
    expect(strings.filter((t) => BANNED.test(t))).toEqual([]);
  });
});
