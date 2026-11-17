// @vitest-environment jsdom
// Task #198: section 07 ("How sales, profit and cash have moved") has its own Consolidated / Standalone switch, with the same rules as section 06
// (task #190). Fixtures are ABB's live answers of 16-17 Nov 2026: consolidated accounts 4 years (FY12, FY13, FY25, FY26), standalone 8 (FY19..FY26).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cons from "./__fixtures__/abb-financials-consolidated.json";
import stand from "./__fixtures__/abb-financials-standalone.json";
import rCons from "./__fixtures__/abb-ratios-consolidated.json";
import rStand from "./__fixtures__/abb-ratios-standalone.json";
import type { Financials, Ratios } from "../lib/api";

vi.mock("../lib/auth", () => ({ useAuth: () => ({ showcase: [], user: null }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: "basic", has: () => true, upgrade: () => undefined, toast: () => undefined }), useThemeKey: () => "light" }));
import { TrendsSection } from "./Sections4";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let answer: (url: string) => Promise<Response> | Response;
let asked: string[];

beforeEach(() => {
  asked = [];
  try { sessionStorage.setItem("finlit.trends.mode", "a"); } catch { /* ignore */ }
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { asked.push(String(url)); return answer(String(url)); }));
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const open = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><TrendsSection f={stand as unknown as Financials} r={rStand as unknown as Ratios} /></MemoryRouter>
  </QueryClientProvider>);
const btn = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const consOnly = (url: string) => url.includes("/financials") && !url.includes("statement=") ? json(200, cons) : url.includes("/ratios") && !url.includes("statement=") ? json(200, rCons) : json(404, {});

describe("section 07: consolidated / standalone switch", () => {
  it("shows both buttons with the shown basis pressed and named in the subtitle; nothing extra is asked for", () => {
    answer = () => json(404, {});
    open();
    expect(screen.getByRole("group", { name: "Accounts: consolidated or standalone" })).toBeTruthy();
    expect(btn("Standalone").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/^Standalone accounts\. Quarter by quarter/)).toBeTruthy();
    expect(asked).toEqual([]);
    expect(document.body.textContent).not.toContain("FY12");
  });

  it("Consolidated asks for consolidated financials and ratios, draws nothing while they load, then shows consolidated figures in every tab", async () => {
    let release: () => void = () => {};
    answer = (url) => (url.includes("/financials") && !url.includes("statement=") ? new Promise((r) => { release = () => r(consOnly(url)); }) : consOnly(url));
    open();
    fireEvent.click(btn("Consolidated")); await settle();
    expect(asked.some((u) => /\/api\/stocks\/ABB\/financials$/.test(u))).toBe(true);
    expect(asked.some((u) => /\/api\/stocks\/ABB\/ratios$/.test(u))).toBe(true);
    expect(screen.getByText("Loading consolidated accounts…")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();                         // no standalone cards under the consolidated label
    release(); await settle();
    expect(screen.getByText(/^Consolidated accounts\. Quarter by quarter/)).toBeTruthy();
    // the annual cards read the consolidated years (FY12 exists only in ABB's consolidated accounts)
    expect(document.body.textContent).toContain("FY12");
    expect(screen.getByText("No consolidated figures for FY14 to FY24 in our data sources: neighbouring columns and the trend lines below skip those years.")).toBeTruthy();
    for (const t of ["Margins and investment", "Dividends", "Key metrics"]) { fireEvent.click(screen.getByRole("tab", { name: t })); expect(screen.getByRole("tab", { name: t }).getAttribute("aria-selected")).toBe("true"); }
    // back to standalone: at once, no new request
    const n = asked.length;
    fireEvent.click(btn("Standalone"));
    expect(screen.getByText(/^Standalone accounts\. Quarter by quarter/)).toBeTruthy();
    expect(asked.length).toBe(n);
  });

  it("a basis with no statements says so and its button stays greyed out with the reason", async () => {
    const nothing = { ...cons, yearly: { pl: { periods: [], rows: {} }, bs: { periods: [], rows: {} }, cf: { periods: [], rows: {} } }, quarterly: { pl: { periods: [], rows: {} } } };
    answer = (url) => (url.includes("/financials") ? json(200, nothing) : url.includes("/ratios") ? json(200, rCons) : json(404, {}));
    open();
    fireEvent.click(btn("Consolidated")); await settle();
    expect(screen.getByText(/Consolidated statements are not available for this company/)).toBeTruthy();
    fireEvent.click(btn("Standalone")); await settle();
    expect(btn("Consolidated").disabled).toBe(true);
    expect(btn("Consolidated").title).toContain("Not available for this company");
  });

  it("a failed load says why and keeps the way back; failed ratios leave only their charts out, with the reason", async () => {
    answer = (url) => (url.includes("/financials") ? json(503, { status: "build_failed" }) : json(404, {}));
    open();
    fireEvent.click(btn("Consolidated")); await settle();
    expect(screen.getByText(/Consolidated accounts could not be loaded right now \(the data provider did not answer\)/)).toBeTruthy();
    fireEvent.click(btn("Standalone"));
    expect(screen.getByRole("tablist")).toBeTruthy();
    cleanup();
    answer = (url) => (url.includes("/financials") && !url.includes("statement=") ? json(200, cons) : url.includes("/ratios") ? json(503, { status: "build_failed" }) : json(404, {}));
    open();
    fireEvent.click(btn("Consolidated")); await settle();
    expect(screen.getByText(/The consolidated ratios \(return on equity and capital, payout\) could not be loaded right now/)).toBeTruthy();
    expect(screen.getByText(/^Consolidated accounts\. Quarter by quarter/)).toBeTruthy();
  });
});
