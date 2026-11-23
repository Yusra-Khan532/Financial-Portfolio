// @vitest-environment jsdom
// Task #333 part C (developer file 30, additions 1 to 3): the fixed "Read together" sentences, the results groups behind a sector, the What happened next cards and the
// Inside a sector table (12 strongest by 6-month return, 5 then Show all 12, stored Prism scores, filters).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Board, GroupRow } from "../../../lib/sectors";

const st = vi.hoisted(() => ({ page: null as unknown, next: null as unknown }));
vi.mock("../../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../../lib/api")>()), apiGet: vi.fn((url: string) => url.startsWith("/api/sector-next") ? Promise.resolve(st.next) : new Promise(() => {})) }));
vi.mock("../../../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../../../lib/sectors")>()), useSectorPage: () => ({ data: st.page, isLoading: false }) }));
vi.mock("../../../lib/prismScores", async (orig) => ({ ...(await orig<typeof import("../../../lib/prismScores")>()), usePrismScores: (syms: string[]) => Object.fromEntries(syms.map((s, i) => [s, { rated: true, final: 80 - i * 7, label: i < 2 ? "Strong" : i < 4 ? "Healthy" : "Weak", status: "RATED", parts: null, shortTerm: { score: 30, word: "Uptrend" }, longTerm: { score: 60, word: "Strong uptrend" } }])) }));
vi.mock("../../../lib/ui", () => ({ useUI: () => ({ plan: "gold" }) }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("../../../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [{ id: "m", name: "w", symbols: [] }], meta: {} }) }));
import { InsideSector, WhatNext, readTogether, resultsFor, weeksWord } from "./PulseChecks";

afterEach(cleanup);
const row = (o: Partial<GroupRow>) => ({ name: "Power", slug: "power", kind: "sector", industries: [], state_code: "washout", breadth: { above_9: 50, above_20: 60, above_50: 40 }, stocks_counted: 20, ...o } as GroupRow);
const wrap = (el: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);

describe("Read together: one fixed sentence from the price side and the results (file 30, addition 3)", () => {
  const g = (vsMarket: "Ahead" | "Behind" | "In line") => ({ name: "x" + Math.random(), companies: 10, declared: 10, vsMarket });
  it("covers the six cases of the file's table", () => {
    expect(readTogether("weak", [g("Ahead"), g("Ahead"), g("Behind")])!.text).toBe("Price is weak while results are ahead of the market.");
    expect(readTogether("weak", [g("Behind")])!.text).toBe("Price and results are both behind.");
    expect(readTogether("strong", [g("Ahead")])!.text).toBe("Price and results are both ahead.");
    expect(readTogether("strong", [g("Behind"), g("Behind")])!.text).toBe("Price is strong while results are behind the market.");
    expect(readTogether("weak", [g("Ahead"), g("Behind")])!.text).toBe("Results are mixed across its industries.");
    expect(readTogether("strong", [g("In line")])!.text).toBe("Results are in line with the market.");
    expect(readTogether("strong", [{ name: "y", companies: 1, declared: 0, vsMarket: null }])).toBeNull();
    for (const s of ["weak", "strong"] as const) for (const set of [[g("Ahead")], [g("Behind")]]) expect(readTogether(s, set)!.text).not.toMatch(/\b(buy|sell|hold|avoid|should)\b/i);
  });
  it("in the Sectors view: its industries with their own results group, largest first, up to three, then 'Other <sector>' for the smaller ones read together", () => {
    const r = row({ name: "Services", slug: "services", industries: ["Engineering Services", "Transport Services", "Transport Infrastructure", "Commercial Services & Supplies", "Public Services"] });
    const all = [{ name: "Transport Services", companies: 40, declared: 40 }, { name: "Commercial Services & Supplies", companies: 90, declared: 90 }, { name: "Transport Infrastructure", companies: 30, declared: 30 },
      { name: "Engineering Services", companies: 12, declared: 12 }, { name: "Services", companies: 9, declared: 9 }, { name: "Banks", companies: 40, declared: 40 }];
    const x = resultsFor(r, all, true);
    expect(x.shown.map((s) => s.label)).toEqual(["Commercial Services & Supplies", "Transport Services", "Transport Infrastructure"]);
    expect(x.more).toBe(2);
    const y = resultsFor(row({ name: "Power", industries: ["Power"] }), [{ name: "Power", companies: 70, declared: 70 }], false);
    expect(y.shown.map((s) => s.label)).toEqual(["Power"]);
  });
  it("says '1 week', never '1 weeks'", () => {
    expect(weeksWord(1)).toBe("1 week"); expect(weeksWord(3.5)).toBe("3½ weeks"); expect(weeksWord(null)).toBe("–");
  });
});

describe("What happened next (addition 1)", () => {
  it("draws one card per state with three figures and where it went next; a card holding groups today says how many", async () => {
    st.next = { window_from: "2025-11-21", window_to: "2026-11-20", groups: 18, rows: [
      { state: "washout", entered: 70, ended: 55, next: [{ state: "fading", n: 17 }, { state: "thrust_c", n: 12 }], typical_weeks: 2, now: 15 },
      { state: "confirmed", entered: 27, ended: 27, next: [{ state: "washout", n: 14 }], typical_weeks: 1, now: 0 }] };
    wrap(<WhatNext />);
    await waitFor(() => expect(document.querySelectorAll(".sx-nxc")).toHaveLength(2));
    const [sold, rising] = [...document.querySelectorAll(".sx-nxc")];
    expect(sold.className).toContain("sx-nxnow"); expect(sold.textContent).toContain("15 in it now");
    expect(sold.textContent).toContain("Times entered70"); expect(sold.textContent).toContain("Typical stay2 weeks");
    expect(rising.textContent).toContain("Typical stay1 week"); expect(rising.className).not.toContain("sx-nxnow");
    expect(document.body.textContent).toContain("Counted at every weekly close from 21 Nov 2025 to 20 Nov 2026, 18 industries. It shows what did happen, not what will.");
    expect(document.body.textContent).not.toMatch(/chance|likely|will (rise|fall)/i);
  });
});

describe("Inside a sector (addition 2)", () => {
  it("opens on the member's first group, lists the 12 strongest by 6-month return (5, then Show all 12), with Prism and the trend words, and filters", () => {
    const stocks = Array.from({ length: 15 }, (_, i) => ({ symbol: "S" + i, name: "Stock " + i, return_6m_pct: 60 - i * 5, rank_6m: i + 1, peer_label: i % 3 === 0 ? "Leader" : i % 3 === 1 ? "In line" : "Laggard" }));
    st.page = { stocks };
    const b = { rows: [row({ name: "Realty", slug: "realty" }), row({ name: "Power", slug: "power", stocks_counted: 15 })] } as unknown as Board;
    wrap(<InsideSector b={b} mine={new Set(["power"])} symbols={["S1"]} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("power");
    expect(document.body.textContent).toContain("A list to start research from, not a recommendation.");
    expect(document.body.textContent).toContain("15 counted stocks · 5 Leaders · 5 In line · 5 Laggards");
    const body = () => [...document.querySelectorAll(".sx-t tbody tr")];
    expect(body()).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show all 12 ▾" }));
    expect(body()).toHaveLength(12);
    expect(body()[0].textContent).toContain("+60.0%"); expect(body()[0].textContent).toContain("Strong 80"); expect(body()[0].textContent).toContain("Strong uptrend");
    expect(body()[1].className).toContain("sx-mine");                          // the member's own share
    const show = screen.getByRole("group", { name: "Show" });
    fireEvent.click(within(show).getByRole("button", { name: "Leaders" }));
    expect(body().every((r) => r.textContent!.includes("Leader"))).toBe(true);
    fireEvent.click(within(show).getByRole("button", { name: "Prism: Healthy or Strong" }));
    expect(body()).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Alert me about Power" })).toBeTruthy();
  });
});
