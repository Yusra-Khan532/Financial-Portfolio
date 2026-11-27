// @vitest-environment jsdom
// Task #275, change 1: the add box gives one suggestion per fund; plan and option are picked after; Add several opens a table.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; body?: unknown }[] = [];
vi.mock("../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../lib/api")>()),
  // developer file 37: the boxes ask GET /api/mf/search, which answers one row per fund (live schemes only), grouped as the server's fund_groups does
  apiGet: vi.fn(async (path: string) => { calls.push({ path }); return path.startsWith("/api/mf/search") ? searchAnswer(ROWS) : { items: ROWS }; }),
  apiSend: vi.fn(async (_m: string, path: string, body: unknown) => { calls.push({ path, body }); return { id: "h1", merged: false }; }),
}));
import { AddSeveralDialog, FundGroupSearch, PlanOptionDialog, buyOf, catName, groupFunds, optionsFor, variantOf, variantsLine } from "./MfAdd";
import type { FundHit } from "./MfAdd";

// the live search rows of 20 Nov for "parag parikh liquid" (8 rows, one fund), plus a second fund and a stopped scheme
const ppl = (code: number, plan: string, option: string): FundHit => ({ code, name: "Parag Parikh Liquid Fund", amc: "PPFAS Mutual Fund", category: "Liquid Fund", plan, option, active: true, navDate: "2026-11-19" });
const ROWS: FundHit[] = [ppl(143260, "Regular", "Growth"), ppl(143261, "Regular", "Monthly IDCW Payout"), ppl(143262, "Direct", "Monthly IDCW Payout"), ppl(143263, "Direct", "Daily Reinvestment of IDCW"),
  ppl(143264, "Regular", "Daily Reinvestment of IDCW"), ppl(143265, "Direct", "Weekly Reinvestment of IDCW"), ppl(143266, "Regular", "Weekly Reinvestment of IDCW"), ppl(143269, "Direct", "Growth"),
  { code: 122639, name: "Parag Parikh Flexi Cap Fund", amc: "PPFAS Mutual Fund", category: "Flexi Cap Fund", plan: "Direct", option: "Growth", active: true, navDate: "2026-11-19" },
  { code: 122640, name: "Parag Parikh Flexi Cap Fund", amc: "PPFAS Mutual Fund", category: "Flexi Cap Fund", plan: "Regular", option: "Growth", active: true, navDate: "2026-11-19" },
  { code: 100001, name: "Parag Parikh Flexi Cap Fund", amc: "PPFAS Mutual Fund", category: "Flexi Cap Fund", plan: "Regular", option: "Bonus", active: false, navDate: "2019-01-01" }];

function searchAnswer(rows: FundHit[]) {
  const by = new Map<string, { key: string; name: string; amc: string; category: string | null; aum: number | null; variants: FundHit[] }>();
  for (const r of rows.filter((x) => x.active)) {
    const key = `${r.amc.toLowerCase()}|${r.name.toLowerCase()}`;
    if (!by.has(key)) by.set(key, { key, name: r.name, amc: r.amc, category: r.category ?? null, aum: null, variants: [] });
    by.get(key)!.variants.push(r);
  }
  return { q: "", total: by.size, items: [...by.values()] };
}
afterEach(() => { cleanup(); calls.length = 0; });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("grouping the search rows (change 1)", () => {
  it("gives one row per fund, with its plans and options summed up", () => {
    const g = groupFunds(ROWS);
    expect(g.map((x) => x.name)).toEqual(["Parag Parikh Liquid Fund", "Parag Parikh Flexi Cap Fund"]);
    expect(variantsLine(g[0])).toBe("8 plans and options: Regular or Direct · Growth or IDCW");
    expect(g[0].options[0]).toBe("Growth");
    expect(g[1].variants.map((v) => v.code)).toEqual([122639, 122640]);       // the stopped Bonus scheme is dropped: the fund has live ones
    expect(variantsLine(g[1])).toBe("2 plans and options: Regular or Direct · Growth");
  });
  it("names the category without AMFI's scheme class, as the mockup does", () => {
    expect(catName("Debt Scheme - Liquid Fund")).toBe("Liquid Fund");
    expect(catName("Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage")).toBe("Dynamic Asset Allocation or Balanced Advantage");
    expect(catName("Other Scheme - Index Funds")).toBe("Index Funds");
    expect(catName("Liquid Fund")).toBe("Liquid Fund");
    expect(catName(null)).toBe("");
  });
  it("finds the scheme for a plan and option, and only offers options the plan has", () => {
    const g = groupFunds(ROWS)[0];
    expect(variantOf(g, "Direct", "Growth")!.code).toBe(143269);
    expect(optionsFor(g, "Direct")).toEqual(["Growth", "Monthly IDCW Payout", "Daily Reinvestment of IDCW", "Weekly Reinvestment of IDCW"]);
  });
  it("reads the optional buy: all empty follows; a NAV or date needs the quantity", () => {
    expect(buyOf("", "", "")).toEqual({ ok: true, lot: null });
    expect(buyOf("50", "32.15", "2026-03-01")).toEqual({ ok: true, lot: { units: "50", avgCost: "32.15", boughtOn: "2026-03-01" } });
    expect(buyOf("", "32", "")).toMatchObject({ ok: false, why: /quantity too/ });
    expect(buyOf("abc", "", "")).toMatchObject({ ok: false, why: /Quantity/ });
  });
});

describe("the box, the plan and option step, Add several", () => {
  it("lists one row per fund in the box, from the per-fund search (developer file 37)", async () => {
    const pick = vi.fn();
    wrap(<FundGroupSearch onPick={pick} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Search a mutual fund/ }), { target: { value: "parag" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    expect(calls[0].path).toBe("/api/mf/search?q=parag&limit=30");
    expect(screen.getAllByRole("option")[0].textContent).toBe("Parag Parikh Liquid FundPPFAS Mutual Fund · Liquid Fund8 plans and options: Regular or Direct · Growth or IDCW");
    fireEvent.click(screen.getAllByRole("option")[0].querySelector("button")!);
    expect(pick.mock.calls[0][0].variants).toHaveLength(8);
  });
  it("adds the chosen plan and option; empty boxes follow the fund", async () => {
    const done = vi.fn();
    wrap(<PlanOptionDialog g={groupFunds(ROWS)[0]} onClose={() => undefined} onDone={done} />);
    expect(screen.getByRole("heading", { name: "Add Parag Parikh Liquid Fund" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Regular" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Growth" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Direct" }));
    fireEvent.click(screen.getByRole("radio", { name: "Weekly Reinvestment of IDCW" }));
    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith("Parag Parikh Liquid Fund (Direct, Weekly Reinvestment of IDCW) added."));
    expect(calls.at(-1)).toEqual({ path: "/api/me/mf-portfolio", body: { code: 143265, follow: true } });
  });
  it("sends the quantity and buy NAV when given, and refuses a NAV without a quantity", async () => {
    wrap(<PlanOptionDialog g={groupFunds(ROWS)[0]} onClose={() => undefined} onDone={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Average buy NAV/), { target: { value: "1450" } });
    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Enter the quantity too/);
    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add fund" }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ path: "/api/me/mf-portfolio", body: { code: 143260, units: "12.5", avgCost: "1450" } }));
  });
  it("Add several: a table, one fund a row with plan, option and units, added together", async () => {
    const done = vi.fn();
    wrap(<AddSeveralDialog onClose={() => undefined} onDone={done} room={10} />);
    expect(screen.getAllByRole("row")).toHaveLength(6);                 // header + 5 rows
    fireEvent.change(screen.getByRole("textbox", { name: "Fund for row 1" }), { target: { value: "parag" } });
    await waitFor(() => expect(within(screen.getByRole("listbox")).getAllByRole("option").length).toBeGreaterThan(0));
    fireEvent.click(within(screen.getByRole("listbox")).getAllByRole("option")[1].querySelector("button")!);        // Flexi Cap
    fireEvent.change(screen.getByRole("combobox", { name: "Plan for row 1" }), { target: { value: "Direct" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Units for row 1" }), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Add 1 fund" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith("1 fund added."));
    expect(calls.at(-1)).toEqual({ path: "/api/me/mf-portfolio", body: { code: 122639, units: "40" } });
  });
  it("Add several says when the list has no room", async () => {
    wrap(<AddSeveralDialog onClose={() => undefined} onDone={() => undefined} room={0} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Fund for row 1" }), { target: { value: "parag" } });
    await waitFor(() => expect(within(screen.getByRole("listbox")).getAllByRole("option").length).toBeGreaterThan(0));
    fireEvent.click(within(screen.getByRole("listbox")).getAllByRole("option")[0].querySelector("button")!);
    fireEvent.click(screen.getByRole("button", { name: "Add 1 fund" }));
    expect(screen.getByRole("alert").textContent).toBe("Your list has room for 0 more funds; remove 1 row.");
  });
});
