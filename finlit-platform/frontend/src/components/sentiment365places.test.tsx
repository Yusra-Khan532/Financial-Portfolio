// @vitest-environment jsdom
// Task #365, the places still without a chip: section 18's "Latest in each group" cards, the Documents page and the shared "What changed" block
// (Holdings, MF and ETF portfolios, Watchlists, All my investments). An item that is not scored shows no chip, never a 0.
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./CoLogo", () => ({ CoLogo: () => null }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null, plan: "free", limits: null, seesAll: false }) }));
import raw from "../lib/__fixtures__/events-TDPOWERSYS-19nov.json";
import type { Events } from "../lib/api";
import type { FeedItem } from "../lib/feed";
import { rowsOf, type Changes } from "../lib/whatChanged";
import { NewsSection } from "../stock/NewsSection";
import { DocumentsPage } from "../pages/Documents";
import { WhatChanged } from "./changes/WhatChanged";

afterEach(cleanup);
const wrap = (qc: QueryClient, el: ReactNode) => render(<QueryClientProvider client={qc}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);

describe("task #365: the chip in every place news and filings show", () => {
  it("section 18: each 'Latest in each group' card carries its filing's score", () => {
    const ev = raw as unknown as Events;
    const qc = new QueryClient();
    qc.setQueryData(["feed-sentiment", "TDPOWERSYS"], { items: ev.announcements.map((a, i) => ({ date: a.date, link: a.link, title: "x", score: i % 2 ? -0.62 : 0.3, band: i % 2 ? "clearly_negative" : "positive" })) });
    const { container } = wrap(qc, <NewsSection e={ev} name="TD Power Systems Ltd" symbol="TDPOWERSYS" />);
    const cards = [...container.querySelectorAll(".nf-hl .nf-h")];
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) expect(c.querySelector(".snt")?.className).toMatch(/^snt snt-(positive|clearly_negative)$/);
  });
  it("section 18: a card whose filing is not scored shows no chip", () => {
    const qc = new QueryClient();
    qc.setQueryData(["feed-sentiment", "TDPOWERSYS"], { items: [] });
    const { container } = wrap(qc, <NewsSection e={raw as unknown as Events} name="TD Power Systems Ltd" symbol="TDPOWERSYS" />);
    expect(container.querySelectorAll(".nf-hl .nf-h").length).toBeGreaterThan(0);
    expect(container.querySelector(".nf-hl .snt")).toBeNull();
  });
  it("/documents: each row shows the feed's sentiment; an unscored one none", () => {
    const item = (id: number, title: string, sentiment: FeedItem["sentiment"]): FeedItem => ({ id, kind: "document", title, symbol: "RELIANCE", company: "Reliance Industries",
      source: "NSE", link: "https://nsearchives.nseindia.com/d.pdf", date: "2026-11-20", category: "Annual Report", period: null, summary: null, auto: true, sentiment });
    const qc = new QueryClient();
    qc.setQueryData(["feed", "document", "", "", 150, false, "", "", false, false, "", 0, false, ""], [item(1, "Annual Report 2025-26", { score: 0.55, band: "clearly_positive" }), item(2, "Investor presentation Q2", null)]);
    qc.setQueryData(["feed", "result", "", "", 100, false, "", "", false, false, "", 0, false, ""], []);
    const { container } = wrap(qc, <DocumentsPage />);
    const cards = [...container.querySelectorAll(".doc-c")];
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".doc-th .snt")!.textContent).toBe("+0.55Clearly positive");
    expect(cards[1].querySelector(".snt")).toBeNull();
  });
  it("What changed: each row carries its newest filing's score; null gives no chip", () => {
    const data: Changes = { days: 90, events: [], notPlaced: [], companies: [{ s: "AAA", n: "Alpha Gears Ltd", ev: {
      order: { n: 2, d: "2026-11-20", t: "Order worth Rs 450 crore", l: null, dates: ["2026-11-20", "2026-11-01"], snt: { score: 0.73, band: "clearly_positive" } },
      rating: { n: 1, d: "2026-11-18", t: "Credit rating revised", l: null, dates: ["2026-11-18"], snt: null } } }] };
    expect(rowsOf(data, null).map((r) => r.snt?.band ?? null)).toEqual(["clearly_positive", null]);
    const qc = new QueryClient();
    qc.setQueryData(["discovery", "changes", "AAA"], data);
    const { container } = wrap(qc, <WhatChanged symbols={["AAA"]} listName="my watchlist" listRef="watch:main" page="watchlists" />);
    const rows = [...container.querySelectorAll(".wc-rows li")];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".wc-t .snt")!.textContent).toBe("+0.73Clearly positive");
    expect(rows[0].querySelector(".wc-tt")!.textContent).toBe("Order worth Rs 450 crore");
    expect(rows[1].querySelector(".snt")).toBeNull();
  });
});
