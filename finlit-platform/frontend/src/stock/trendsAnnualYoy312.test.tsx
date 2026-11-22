// @vitest-environment jsdom
// Task #312 (developer file 20, change 4): with the Quarterly switch on, the Annual cards of 07 Trends compared FY26 with FY22 (four periods back, the
// quarterly step): Reliance's free cash flow read "+558.5% YoY". An annual card's YoY is FY26 against FY25 whatever the switch says. Fixture: ABB's
// standalone accounts (free cash flow FY22 476.96, FY25 1,117.85, FY26 979.57 crore): YoY −12.4%, not +105.4%.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import stand from "./__fixtures__/abb-financials-standalone.json";
import rStand from "./__fixtures__/abb-ratios-standalone.json";
import type { Financials, Ratios } from "../lib/api";

vi.mock("../lib/auth", () => ({ useAuth: () => ({ showcase: [], user: null }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: "basic", has: () => true, upgrade: () => undefined, toast: () => undefined }), useThemeKey: () => "light" }));
import { TrendsSection } from "./Sections4";

beforeEach(() => {
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const show = (mode: "q" | "a") => {
  sessionStorage.setItem("finlit.trends.mode", mode);
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><TrendsSection f={stand as unknown as Financials} r={rStand as unknown as Ratios} /></MemoryRouter></QueryClientProvider>);
  return screen.getByRole("heading", { name: /Free cash flow/ }).closest("article, .tr-card, div")!.parentElement!.textContent!;
};

describe("task #312: an annual Trends card compares with the year before, in both views", () => {
  it("Quarterly view: free cash flow −12.4% YoY (FY26 against FY25), not +105.4% (against FY22)", () => {
    const t = show("q");
    expect(t).toContain("−12.4% YoY");
    expect(t).not.toContain("105.4%");
  });
  it("Annual view: the same figure", () => {
    expect(show("a")).toContain("−12.4% YoY");
  });
  it("the Momentum scale's labels stay on one line", () => {
    const css = readFileSync(join(__dirname, "..", "styles", "stock2.css"), "utf8");
    expect(css).toMatch(/\.spc-bar em \{ overflow-wrap: normal; white-space: nowrap;/);
  });
});
