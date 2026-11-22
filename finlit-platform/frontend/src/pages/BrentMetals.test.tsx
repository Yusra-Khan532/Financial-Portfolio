// @vitest-environment jsdom
// Brent crude (U.S. EIA) and monthly copper, aluminium, natural gas (World Bank) on the India macro page, and the Brent card on the Commodities page.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Macro } from "../lib/macro";

const st = vi.hoisted(() => ({ macro: null as unknown, cm: null as unknown }));
vi.mock("../lib/macro", async (orig) => ({ ...(await orig<typeof import("../lib/macro")>()), useMacro: () => ({ data: st.macro, isLoading: false, isError: false, error: null }) }));
vi.mock("../lib/commodities", async (orig) => ({ ...(await orig<typeof import("../lib/commodities")>()), useCommodities: () => ({ data: st.cm, isLoading: false, isError: false, error: null }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "basic" }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/MacroSectorImpact", () => ({ MacroSectorImpact: () => null }));
import { MacroPage } from "./Macro";

const pts = (n: number, base: number): [string, number][] => Array.from({ length: n }, (_, i) => [new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), base + i]);
const macro = (over: Partial<Macro> = {}): Macro => ({
  updatedAt: "2026-11-05T00:00:00Z", today: "2026-11-05", cards: [], insights: [], targetWatch: { target: 4, band: [2, 6], quarters: [], streak: 0, side: null, lastQuarter: null, rule: "" },
  series: {}, cpiDivisions: [], rates: null, reserves: null, decisions: [], coverage: [], runs: {}, issues: [], sources: [], disclaimer: "Information only.", ...over,
});
const brentCard = { key: "brent_d", label: "Brent crude, daily", value: 102, unit: "US$/bbl", date: "2026-11-03", period: "3 Nov 2026", prev: 100.5, prevPeriod: "2 Nov 2026", change: 1.5, changeUnit: "US$/bbl",
  yearAgo: null, source: "U.S. EIA", sourceUrl: null, what: null, spark: pts(10, 100) as [string, number][], lag: "U.S. EIA daily price, published 1-2 business days after the trading day" };
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(cleanup);

const renderMacro = () => render(<MemoryRouter><MacroPage /></MemoryRouter>);

describe("India macro page", () => {
  it("shows Brent with its price, date, source and the publication lag", () => {
    st.macro = macro({ cards: [brentCard as never] });
    renderMacro();
    const card = screen.getByRole("button", { name: /Brent crude, daily: US\$ 102\.00/ });
    expect(card.textContent).toContain("U.S. EIA");
    expect(card.textContent).toContain("3 Nov 2026");
    expect(card.textContent).toContain("published 1-2 business days");
  });
  it("says why there is no Brent or metal price instead of leaving a gap", () => {
    st.macro = macro({ brent: { status: "nokey", reason: "Brent: source key not set" }, metals: { copper_m: { label: "Copper, monthly", reason: "Not loaded yet: the macro job downloads the World Bank price file each night." } } });
    renderMacro();
    expect(screen.getByText("Brent: source key not set")).toBeTruthy();
    expect(screen.getByText(/Not loaded yet: the macro job downloads the World Bank/)).toBeTruthy();
  });
  it("offers Brent, copper and aluminium, and gas history tabs", () => {
    st.macro = macro({ cards: [brentCard as never] });
    renderMacro();
    for (const t of ["Brent crude", "Copper and aluminium", "Natural gas"]) expect(screen.getByRole("tab", { name: t })).toBeTruthy();
  });
});

// Task #317: the Commodity prices page is off the site (its old address goes to India economy); its tests went with it.
