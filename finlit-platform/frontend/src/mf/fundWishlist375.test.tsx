// @vitest-environment jsdom
// Task #375 (24 Nov 2026, the team): "add a wishlist button here and a person can add in their wishlist a MF or an ETF and they can see it from here".
// The star beside each scheme on the Mutual Funds page, the Wishlist tab beside "Chosen categories" and "Ready list", and the fund page's button.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_QUERY, parseQuery, queryToParams, type FundRow } from "../lib/mf";
import { toggleCode, WISH_MAX } from "../lib/fundWishlist";
import { UIProvider } from "../lib/ui";
import { FundTable } from "./FundTable";

vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()),
  useAuth: () => ({ ready: true, user: null, plan: "basic", limits: {}, isAdmin: false, seesAll: false, showcase: [], prismReportsPerDay: null, refresh: async () => {}, signOut: async () => {} }) }));

const src = (f: string) => readFileSync(resolve(process.cwd(), "src", f), "utf8");
const row = (code: number, name: string): FundRow => ({ code, name, amc: "SBI Mutual Fund", category: "Other Scheme - Other  ETFs", plan: "Unspecified", option: "Growth", optionClass: "Growth",
  nav: 273.42, navDate: "2026-11-24", change: null, active: true, r1y: -1.81, r5y: null, noReturns: null } as FundRow);

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const draw = (wish?: { has: (c: number) => boolean; toggle: (c: number, n: string) => void }) => render(
  <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><UIProvider>
    <FundTable rows={[row(1001, "SBI Nifty 50 ETF"), row(1002, "Parag Parikh Flexi Cap Fund")]} cols={[]} q={EMPTY_QUERY} onSort={() => {}} picked={[]} onPick={() => {}} wish={wish} />
  </UIProvider></QueryClientProvider></MemoryRouter>);

describe("task #375: the wishlist", () => {
  it("a scheme goes to the front, a second press takes it out, and at most 100 are kept", () => {
    expect(toggleCode([], 5)).toEqual([5]);
    expect(toggleCode([3, 4], 5)).toEqual([5, 3, 4]);                   // newest first
    expect(toggleCode([5, 3, 4], 3)).toEqual([5, 4]);                   // pressed again: out
    const full = Array.from({ length: WISH_MAX }, (_, i) => i + 1);
    expect(toggleCode(full, 999)).toHaveLength(WISH_MAX);
    expect(WISH_MAX).toBe(100);
  });
  it("each scheme row has a star that names the scheme and says whether it is kept; pressing it toggles that scheme (an ETF too)", () => {
    const toggle = vi.fn();
    draw({ has: (c) => c === 1002, toggle });
    const etf = screen.getByRole("button", { name: "Add SBI Nifty 50 ETF to your wishlist" });
    expect(etf.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Remove Parag Parikh Flexi Cap Fund from your wishlist" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(etf);
    expect(toggle).toHaveBeenCalledWith(1001, "SBI Nifty 50 ETF");
  });
  it("where the table is drawn without a wishlist (other pages), no star is added", () => {
    draw(undefined);
    expect(screen.queryByRole("button", { name: /wishlist/ })).toBeNull();
  });
  it("the Wishlist tab is a page address of its own (/funds?view=wish), beside Chosen categories and Ready list", () => {
    expect(parseQuery(new URLSearchParams("view=wish")).view).toBe("wish");
    expect(queryToParams({ ...EMPTY_QUERY, view: "wish" }).get("view")).toBe("wish");
    expect(parseQuery(new URLSearchParams("view=other")).view).toBe("");
    const page = src("pages/Funds.tsx");
    const seg = page.slice(page.indexOf('aria-label="Which schemes to show"'), page.indexOf("</div>", page.indexOf('aria-label="Which schemes to show"')));
    expect(seg.indexOf("Chosen categories")).toBeLessThan(seg.indexOf("Ready list"));
    expect(seg.indexOf("Ready list")).toBeLessThan(seg.indexOf("Wishlist"));
    expect(page).toMatch(/wish=\{wishProp\}/g);
    expect(page.match(/wish=\{wishProp\}/g)).toHaveLength(3);         // the Chosen categories, Ready list and Wishlist tables
    expect(page).toMatch(/Sign in to keep a wishlist: it is free/);
    expect(page).toMatch(/Add to wishlist/);                           // the scheme's own page
    expect(page).toMatch(/to=\{`\/login\?next=\$\{encodeURIComponent\("\/funds\?view=wish"\)\}`\}/);
  });
});
