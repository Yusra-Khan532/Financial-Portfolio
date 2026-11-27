// @vitest-environment jsdom
// Task #190: section 06 of the company report has its own Consolidated / Standalone switch. Fixtures are ABB's live answers of 16 Nov 2026
// (consolidated: 4 years FY12..FY26; standalone: 8 years FY19..FY26), the company of the team's screenshot.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cons from "./__fixtures__/abb-financials-consolidated.json";
import stand from "./__fixtures__/abb-financials-standalone.json";
import type { Financials } from "../lib/api";

vi.mock("../lib/auth", () => ({ useAuth: () => ({ showcase: [], user: null }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: "basic", has: () => true, upgrade: () => undefined, toast: () => undefined }), useThemeKey: () => "light" }));
import { FinancialsSection } from "./Sections";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let answer: (url: string) => Promise<Response> | Response;
let asked: string[];

beforeEach(() => {
  asked = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { asked.push(String(url)); return answer(String(url)); }));
  // jsdom has no ResizeObserver (the chart and the scrolling table use it)
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.matchMedia = window.matchMedia || ((() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const open = (page: Financials) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><FinancialsSection f={page} /></MemoryRouter>
  </QueryClientProvider>);
const heads = () => screen.getAllByRole("columnheader").map((h) => h.textContent);
const btn = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

describe("section 06: consolidated / standalone switch", () => {
  it("shows both buttons, the shown basis pressed, and names it in the subtitle", () => {
    answer = () => json(404, {});
    open(stand as unknown as Financials);
    expect(screen.getByRole("group", { name: "Accounts: consolidated or standalone" })).toBeTruthy();
    expect(btn("Standalone").getAttribute("aria-pressed")).toBe("true");
    expect(btn("Consolidated").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/^Standalone, ₹ crore/)).toBeTruthy();
    expect(heads()).toContain("FY19");
    expect(asked).toEqual([]);                                   // nothing extra is asked for until a button is pressed
  });

  it("Consolidated asks for consolidated accounts and shows them everywhere in the section, never the old numbers while loading", async () => {
    let release: () => void = () => {};
    answer = (url) => (url.includes("/financials") && !url.includes("statement=") ? new Promise((r) => { release = () => r(json(200, cons)); }) : json(404, {}));
    open(stand as unknown as Financials);
    fireEvent.click(btn("Consolidated"));
    await settle();
    expect(asked.some((u) => /\/api\/stocks\/ABB\/financials$/.test(u))).toBe(true);   // the consolidated basis (no statement=standalone)
    expect(screen.getByText("Loading consolidated accounts…")).toBeTruthy();
    expect(screen.queryAllByRole("columnheader")).toEqual([]);                          // no standalone table under the consolidated label
    release(); await settle();
    expect(screen.getByText(/^Consolidated, ₹ crore/)).toBeTruthy();
    expect(heads()).toContain("FY12");
    expect(heads()).not.toContain("FY19");
    // balance sheet, cash flow and quarterly all follow the chosen basis
    fireEvent.click(btn("Quarterly")); expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(2);
    fireEvent.click(screen.getByRole("tab", { name: /Balance sheet/ })); expect(heads()).not.toContain("FY19");   // task #216: the statement switch is a tab group
    fireEvent.click(screen.getByRole("tab", { name: /Cash flow/ })); expect(heads()).not.toContain("FY19");
    // back to standalone: shown at once, no new request
    const before = asked.length;
    fireEvent.click(btn("Standalone"));
    expect(screen.getByText(/^Standalone, ₹ crore/)).toBeTruthy();
    expect(asked.length).toBe(before);
  });

  it("a basis with no statements says so, and its button stays greyed out with the reason", async () => {
    const nothing = { ...cons, yearly: { pl: { periods: [], rows: {} }, bs: { periods: [], rows: {} }, cf: { periods: [], rows: {} } }, quarterly: { pl: { periods: [], rows: {} } } };
    answer = (url) => (url.includes("/financials") ? json(200, nothing) : json(404, {}));
    open(stand as unknown as Financials);
    fireEvent.click(btn("Consolidated")); await settle();
    expect(screen.getByText(/Consolidated statements are not available for this company/)).toBeTruthy();
    fireEvent.click(btn("Standalone")); await settle();
    expect(btn("Consolidated").disabled).toBe(true);
    expect(btn("Consolidated").title).toContain("Not available for this company");
    expect(heads()).toContain("FY19");
  });

  it("a failed load says why and keeps the way back", async () => {
    answer = (url) => (url.includes("/financials") ? json(503, { status: "build_failed" }) : json(404, {}));
    open(stand as unknown as Financials);
    fireEvent.click(btn("Consolidated")); await settle();
    expect(screen.getByText(/Consolidated accounts could not be loaded right now/)).toBeTruthy();
    fireEvent.click(btn("Standalone"));
    expect(heads()).toContain("FY19");
  });
});

describe("missing years between the shown ones are named (task #190 upgrade)", () => {
  it("names a gap of one year and of several years, and nothing for consecutive years", async () => {
    const { yearGaps } = await import("./Sections");
    expect(yearGaps(["FY12", "FY13", "FY25", "FY26"])).toEqual(["FY14 to FY24"]);
    expect(yearGaps(["FY20", "FY22", "FY23"])).toEqual(["FY21"]);
    expect(yearGaps(["FY19", "FY20", "FY21"])).toEqual([]);
    expect(yearGaps(["Jun 2025", "Sep 2025"])).toEqual([]);
  });
  it("ABB's consolidated accounts say FY14 to FY24 are missing", async () => {
    answer = (url) => (url.includes("/financials") && !url.includes("statement=") ? json(200, cons) : json(404, {}));
    open(stand as unknown as Financials);
    expect(screen.queryByText(/No .* figures for/)).toBeNull();          // standalone FY19..FY26 is consecutive
    fireEvent.click(btn("Consolidated")); await settle();
    expect(screen.getByText("No consolidated figures for FY14 to FY24 in our data sources: the columns on either side are not consecutive years.")).toBeTruthy();
  });
});
