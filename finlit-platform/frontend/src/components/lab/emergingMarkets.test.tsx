// @vitest-environment jsdom
// Trading Lab > Order Flow (Global) > Emerging markets: India beside sixteen economies from a real load (World Bank, Yahoo) of 27 Nov 2026: India's
// place in one line, growth against inflation, a sortable table, a card on every country; facts only.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { EmergingMarkets, emLine, type Em } from "./EmergingMarkets";
import SAMPLE from "./__fixtures__/em.json";

const E = SAMPLE as unknown as Em;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => json(E))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><EmergingMarkets /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };

describe("Emerging markets", () => {
  it("says India's place in one line", () => {
    expect(emLine(E)).toMatch(/^India's GDP grew 7\.6% in 2025, the 2nd fastest of 17 · inflation \d+\.\d% · Nifty 50 [+−]\d+\.\d% over a year$/);
  });
  it("draws every country, India in gold, and sorts the table", async () => {
    wrap(); await settle();
    expect(document.querySelectorAll(".em-dot").length).toBeGreaterThan(10);
    expect(document.querySelector(".em-dot.india text")?.textContent).toBe("IND");
    const first = () => within(screen.getByRole("table", { name: "Emerging markets side by side" })).getAllByRole("row")[1].textContent;
    expect(first()).toMatch(/^(Vietnam|India|Philippines|Egypt)/);                 // sorted by GDP growth first
    fireEvent.click(screen.getByRole("button", { name: "GDP per person" }));
    expect(first()).not.toMatch(/^India/);
    expect(screen.getByRole("button", { name: "GDP per person" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("pointing at a country shows all its figures", async () => {
    wrap(); await settle();
    point(document.querySelector(".em-dot.india")!);
    const pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("India")).toBeTruthy(); expect(pop.textContent).toContain("GDP growth (2025)"); expect(pop.textContent).toContain("Nifty 50");
  });
});
