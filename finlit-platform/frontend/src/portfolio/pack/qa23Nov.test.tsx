// @vitest-environment jsdom
// QA pass of 23 Nov 2026 (owner's list, items 14–20): the equity portfolio, the watchlist, the dashboard and the More menu.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { topTiles } from "../../lib/equityTop";
import { peerSentence, type Share } from "../../lib/equityPack";
import { TrendSection } from "./EquityPack";
import { AlertSummary } from "../../components/Notifications";
import type { TrendRead } from "../../lib/mfPortfolio";
import type { Notice } from "../../lib/alerts";

vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }), useAuthMaybe: () => null }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => ({ data: undefined, isLoading: true })) }));
afterEach(cleanup);
const sh = (symbol: string, prism: number | null, label: "leader" | "laggard" | null = null): Share => ({ symbol, industry: "Banks", size: "Large", chg: 0, prism, prismWord: null,
  valuation: 50, risk: 50, st: 10, lt: 20, below52: 5, m1: 1, peer: label ? { label, raw: null, rank: 1, of: 10, group: "Banks", vs: 0, bench: "peer average", direction: null } : null, notCompared: null } as Share);
const PAGE = { score: { score: 62, band: "Average" }, market: { eq: { beta: 1, vol: 15, vol_nifty: 14 } } };
const SPREAD = { industries: 3, sizes: 2, macro: 2, sectors: 3 };

describe("item 18: zero reads 'None of …', never 'No of …'", () => {
  it("list voice: 'None of the 7 lead their peers, and two lag.'", () => {
    const xs = [sh("A", 60, "laggard"), sh("B", 60, "laggard"), ...["C", "D", "E", "F", "G"].map((s) => sh(s, 60))];
    expect(peerSentence(xs, "list")).toBe("None of the 7 lead their peers, and two lag.");
  });
  it("own voice: 'None of your 45 shares lead …', and no lag reads 'none lag'", () => {
    const xs = Array.from({ length: 45 }, (_, i) => sh("S" + i, 60, i < 3 ? "laggard" : null));
    expect(peerSentence(xs)).toBe("None of your 45 shares lead their peers, and three lag.");
    expect(peerSentence([sh("A", 60, "leader"), sh("B", 60)])).toBe("One of your 2 shares leads its peers and none lag.");
  });
});

describe("item 14: while the scores load, the Portfolio tile says so", () => {
  it("'Loading scores…', not 'Not scored' or '45 not scored'", () => {
    const xs = Array.from({ length: 45 }, (_, i) => sh("S" + i, null));
    const [p] = topTiles(xs, PAGE as never, "prism", SPREAD, null, true);
    expect(p.v).toBe("Loading scores…");
    expect(p.sub).not.toMatch(/not scored/);
    expect(topTiles(xs, PAGE as never, "prism", SPREAD, null, false)[0].v).toBe("Not scored");   // once loaded, a real blank says so
  });
});

describe("item 16: the Portfolio tile says it is the average FinLit Prism of the shares", () => {
  it("names what it averages, so it reads apart from the six-part portfolio score", () => {
    const [p] = topTiles([sh("A", 70), sh("B", 64)], PAGE as never, "prism", SPREAD);
    expect(p.v).toBe("Healthy · 67");
    expect(p.sub).toMatch(/^Average FinLit Prism of your shares: /);
  });
});

describe("item 19: In between uses the page's own Prism for each share (the table's figure)", () => {
  it("RELIANCE reads 'Prism 58' from the page's 57.86, not the trend answer's separate copy", () => {
    const t = { n: 2, rated: 2, coverage: 1, grid: {}, breadth: { up: 0, down: 0 }, direction: { improving: 0, weakening: 0, steady: 0 },
      business: { strong_up: { n: 0, share: 0, symbols: [] }, strong_down: { n: 0, share: 0, symbols: [] }, weak_up: { n: 0, share: 0, symbols: [] }, weak_down: { n: 0, share: 0, symbols: [] } },
      average: null, between: 1, betweenList: { n: 1, share: 0.5, items: [{ symbol: "RELIANCE", prism: 58.6, flat: false }] }, words: { longTerm: "", shortAgainstLong: "", businessAndPrice: "" } } as TrendRead;
    render(<MemoryRouter><TrendSection t={t} shares={[sh("RELIANCE", 57.86), sh("TCS", 70)]} voice="list" /></MemoryRouter>);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Prism 58");
    expect(text).not.toContain("Prism 59");
  });
});

describe("item 15: several alerts at once are one card", () => {
  it("'3 alerts triggered', the first two names and 'and 1 more', Open my alerts and a dismiss button", () => {
    const n = (id: number, title: string): Notice => ({ id, alertId: null, symbol: null, kind: "alert", title, body: "", link: "/stocks/X", push: false, read: false, createdAt: new Date().toISOString() });
    const onOpen = vi.fn(), onClose = vi.fn();
    render(<MemoryRouter><AlertSummary items={[n(1, "TCS – price above 2,400"), n(2, "INFY – RSI below 30"), n(3, "SBIN – volume 3×")]} onOpen={onOpen} onClose={onClose} /></MemoryRouter>);
    expect(screen.getByText("3 alerts triggered")).toBeTruthy();
    expect(screen.getByText("TCS – price above 2,400; INFY – RSI below 30 and 1 more")).toBeTruthy();
    screen.getByRole("button", { name: /Open my alerts/ }).click(); expect(onOpen).toHaveBeenCalled();
    screen.getByRole("button", { name: "Dismiss" }).click(); expect(onClose).toHaveBeenCalled();
  });
});

describe("item 20: a menu row keeps room for its (i)", () => {
  it("the row's link keeps 40px on the right even inside a titled group (.ddm .ddg a sets 10px)", () => {
    const css = readFileSync(resolve(__dirname, "../../styles/tools.css"), "utf8");
    expect(css).toMatch(/\.ddm \.ddg \.ddr > a \{ padding-right: 40px; \}/);
    expect(css).toMatch(/\.ddr > a b \{ white-space: normal;/);   // a long label wraps inside the row
  });
});

describe("item 2's note: the dashboard says 'held' only for a share with a quantity", () => {
  it("a share with buys reads 'held'; a name with no buys reads 'in portfolio'", async () => {
    const { buildInv, stockLists } = await import("../../components/dashboard/MyStocks");
    const followed = [{ symbol: "SAMBHV", name: "Sambhv Steel" }, { symbol: "TCS", name: "TCS Ltd" }];
    const lists = stockLists(followed, new Set(), new Set(["SAMBHV", "TCS"]));
    const inv = buildInv(lists, followed, [], [], new Map(), new Map(), new Map([["TCS", 10]]));
    const sub = (s: string) => inv.all.find((r) => r.symbol === s)!.sub;
    expect(sub("TCS")).toBe("TCS Ltd · held");
    expect(sub("SAMBHV")).toBe("Sambhv Steel · in portfolio");
  });
});
