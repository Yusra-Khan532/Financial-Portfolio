// @vitest-environment jsdom
// Company report, Ownership, tab "Bulk & block deals": a dot per deal at its price on the year's closes (a card on hover), deals in other terms (a split or
// bonus since) listed but not drawn, a twin counted once, short selling, and the link to every deal in the share.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "../../lib/deals";

const D = (o: Partial<Deal>): Deal => ({ id: 1, exchange: "NSE", kind: "block", day: "2026-11-27", symbol: "IGIL", name: "IGI", client: "SBI MUTUAL FUND", clientKey: "SBI MUTUAL FUND",
  side: "buy", qty: 6000000, price: 371.25, valueCr: 222.75, remarks: null, alsoBlock: false, alsoBulk: true, source: "nse-archive", pctEquity: 1.5, dayClose: 372, closeNow: 400,
  closeAt: null, sinceDealPct: 7.74, sinceNote: null, ...o });
const ROWS = [D({}), D({ id: 2, kind: "bulk", alsoBlock: true, alsoBulk: false }), D({ id: 3, side: "sell", day: "2026-06-02", price: 700, dayClose: 350, valueCr: 70, client: "OLD HOLDER", clientKey: "OLD HOLDER" }),
  D({ id: 4, kind: "short", side: null, client: null, clientKey: null, price: null, valueCr: null, qty: 125000, dayClose: null })];
vi.mock("../../lib/deals", async (orig) => ({ ...(await orig<typeof import("../../lib/deals")>()),
  useStockDeals: () => ({ isLoading: false, isError: false, data: { symbol: "IGIL", rows: ROWS, trades: 2, buyCr: 222.75, sellCr: 70, netCr: 152.75, latestClose: 400, latestCloseAt: null, since: null, note: "",
    coverage: { first_day: "2026-01-02", last_day: "2026-11-27", exchanges: ["NSE"], byKind: {}, lastUpdated: null, historyDone: true } } }) }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()),
  usePrice: () => ({ data: { series: { t: ["2025-12-01", "2026-06-02", "2026-11-27"], c: [300, 350, 372], v: [], ema50: [], ema200: [] } } }) }));
import { drawable, OwnDeals } from "./OwnDeals";

afterEach(cleanup);

describe("Ownership tab: bulk & block deals", () => {
  it("draws only the deals in the chart's terms; the bulk twin of a block deal and short sales are not dots", () => {
    const { on, off } = drawable(ROWS, "2025-12-01", "2026-11-27");
    expect(on.map((r) => r.id)).toEqual([1]);
    expect(off.map((r) => r.id)).toEqual([3]);                      // 700 against our close of 350: a 1:1 bonus or a split since
  });
  it("the totals, a dot with its card, the note on the deal not drawn, short selling and the link", () => {
    const { container } = render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><OwnDeals symbol="IGIL" /></MemoryRouter></QueryClientProvider>);
    expect(container.textContent).toContain("2 bulk and block trades in IGIL: ₹223 Cr bought, ₹70.00 Cr sold, net +₹153 Cr.");
    const dots = container.querySelectorAll("circle.bbd-dot");
    expect(dots.length).toBe(1);
    fireEvent.mouseEnter(dots[0]);
    expect(container.querySelector(".bbd-tip")?.textContent).toContain("Bought 60,00,000 at ₹371.25");
    expect(container.textContent).toContain("1 older deal is not drawn: a split or bonus since");
    expect(container.textContent).toContain("Short selling reported on 1 day");
    expect(screen.getByRole("link", { name: "Every deal in IGIL →" }).getAttribute("href")).toBe("/ipo?view=deals&q=IGIL&period=1y");
    expect(container.textContent).toContain("Sign in to get an alert on new deals in IGIL.");           // a visitor: the follow button asks to sign in
  });
});
