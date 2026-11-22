// @vitest-environment jsdom
// Task #309 (News & filings, developer file 19 v2): the page reads exchange news AND results filings (kind=news,result, filings only); FinLit topic
// chips with their counts for the dates chosen (a topic with none is hidden; picking one clears the category); the exchange category under each
// headline (left out when it equals the topic; Results in gold); the headline rule; the Date dropdown defaults to Last 7 days; "Show more"
// continues by the last item's date and id; the empty state; My names (portfolio and watchlists) with Portfolio / Watchlist tags.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedItem } from "../lib/feed";

const st = vi.hoisted(() => ({ total: 3, asked: [] as string[], items: [] as FeedItem[], more: [] as FeedItem[], wl: [] as string[], held: [] as string[] }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header> }));
vi.mock("../components/CoLogo", () => ({ CoLogo: () => <span className="logo" /> }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [{ id: "a", name: "A", symbols: st.wl }], meta: {} }) }));
vi.mock("../lib/portfolio", () => ({ usePortfolio: () => ({ holdings: st.held.map((s, i) => ({ id: String(i), symbol: s, qty: 1, price: 1 })) }) }));

const it_ = (o: Partial<FeedItem>): FeedItem => ({ id: 1, kind: "news", title: "x", symbol: "ACME", company: "Acme Ltd", source: "Exchange filing", link: "https://nsearchives.nseindia.com/a.pdf",
  date: "2026-11-21", category: "General Updates", period: null, summary: null, auto: true, topic: "other", ...o });
const COUNTS = { from: "2026-11-14", to: "2026-11-21", total: 3, topics: [["results", "Results", 1], ["orders", "Orders & contracts", 2]],
  categories: [["Bagging/Receiving of orders/contracts", 1], ["General Updates", 1], ["Integrated Filing- Financial", 1]], days: [["2026-11-21", 2], ["2026-11-20", 1]] };

beforeEach(() => {
  st.asked = []; st.wl = []; st.held = []; st.total = 3;
  st.items = [
    it_({ id: 30, title: "General Updates: Jupiter Wagons Limited has informed the Exchange that it secures repeat order worth INR 128 crore", symbol: "JWL", company: "JUPITER WAGONS LIMITED", topic: "orders" }),
    it_({ id: 29, kind: "result", title: "Integrated Filing - Financials", symbol: "PRICOLLTD", company: "Pricol Limited", category: "Integrated Filing- Financial", topic: "results" }),
    it_({ id: 28, title: "Bagging of order", symbol: "GRSE", company: "Garden Reach Shipbuilders & Engineers Ltd", category: "Orders & contracts", topic: "orders", date: "2026-11-20" }),
  ];
  st.more = [it_({ id: 5, title: "Older filing", date: "2026-11-15", topic: "orders" })];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    st.asked.push(u);
    if (u.includes("/api/feed/counts")) return new Response(JSON.stringify(u.includes("symbol=") && !u.includes("symbol=JWL") ? { ...COUNTS, total: 0 } : { ...COUNTS, total: st.total }));
    if (u.includes("/api/feed")) return new Response(JSON.stringify({ items: u.includes("before_id=") ? st.more : u.includes("topic=deals") ? [] : st.items.concat(Array.from({ length: 57 }, (_, i) => it_({ id: 27 - i, date: "2026-11-20", title: `Filler ${i}` }))) }));
    return new Response("{}");
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function page() {
  const { NewsPage } = await import("./News");
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NewsPage /></MemoryRouter></QueryClientProvider>);
  await screen.findByText(/Jupiter Wagons/);
}

describe("#309 News & filings", () => {
  it("reads exchange news and results filings together, filings only, for the last 7 days; the counts come from /api/feed/counts", async () => {
    await page();
    const list = st.asked.find((u) => u.startsWith("/api/feed?"))!;
    expect(list).toMatch(/kind=news,result/);
    expect(list).toMatch(/filed=true/);
    expect(list).toMatch(/from_date=\d{4}-\d\d-\d\d&to_date=\d{4}-\d\d-\d\d/);
    expect(st.asked.some((u) => u.startsWith("/api/feed/counts?kind=news,result") && u.includes("filed=true"))).toBe(true);
    expect(screen.getByRole("button", { name: /Last 7 days/ })).toBeTruthy();   // the default, shown as the Date button's label
  });

  it("shows a topic chip per FinLit topic with its count, hides topics with none, and the count line uses the total", async () => {
    await page();
    const chips = within(screen.getByRole("group", { name: "Topics" }));
    expect(chips.getByRole("button", { name: /^All\s*3$/ })).toBeTruthy();
    expect(chips.getByRole("button", { name: /^Results\s*1$/ })).toBeTruthy();
    expect(chips.getByRole("button", { name: /^Orders & contracts\s*2$/ })).toBeTruthy();
    expect(chips.queryByRole("button", { name: /Deals & tie-ups/ })).toBeNull();
    expect(document.querySelector(".dbx-cnt")!.textContent).toMatch(/^3 filings · 20 Nov – 21 Nov 2026$/);
  });

  it("each row: the company's short name, the headline without the repeated parts, the topic (Results in gold), the exchange category unless it equals the topic", async () => {
    await page();
    const jwl = screen.getByText(/secures repeat order/).closest("li")!;
    expect(jwl.querySelector(".p4-nb p")!.textContent).toBe("Jupiter Wagons It secures repeat order worth INR 128 crore");
    expect(jwl.querySelector(".p4-tp")!.textContent).toBe("Orders & contracts");
    expect(jwl.querySelector(".p4-cat")!.textContent).toBe("General Updates");
    const pricol = screen.getByText(/Integrated Filing - Financials/).closest("li")!;
    expect(pricol.querySelector(".p4-tp.t-results")!.textContent).toBe("Results");
    const grse = screen.getByText(/Bagging of order/).closest("li")!;
    expect(grse.querySelector(".p4-cat")).toBeNull();   // the category equals the topic: shown once
  });

  it("picking a topic asks for it and clears the category; an empty result says what to try", async () => {
    await page();
    fireEvent.click(within(screen.getByRole("group", { name: "Topics" })).getByRole("button", { name: /^Orders & contracts/ }));
    await waitFor(() => expect(st.asked.some((u) => u.startsWith("/api/feed?") && u.includes("topic=orders"))).toBe(true));
    expect(st.asked.filter((u) => u.startsWith("/api/feed?") && u.includes("topic=orders")).every((u) => !u.includes("category="))).toBe(true);
  });

  it("“Show more” continues from the last item's date and id", async () => {
    st.total = 61;
    await page();
    const more = await screen.findByRole("button", { name: /^Show \d+ more$/ });
    fireEvent.click(more);
    await waitFor(() => expect(st.asked.some((u) => /before=2026-11-20&before_id=-29/.test(u))).toBe(true));
    await screen.findByText(/Older filing/);
  });

  it("My names: portfolio and watchlist companies, tagged on their rows", async () => {
    st.held = ["PRICOLLTD"]; st.wl = ["JWL"];
    await page();
    expect(screen.getByText(/Integrated Filing - Financials/).closest("li")!.querySelector(".dsc-tag.pf")!.textContent).toBe("Portfolio");
    expect(screen.getByText(/secures repeat order/).closest("li")!.querySelector(".dsc-tag.wl")!.textContent).toBe("Watchlist");
  });

  it("the disclaimer stays and no advice words appear", async () => {
    await page();
    expect(document.body.textContent).toMatch(/Information only, not investment advice\./);
    expect(document.body.textContent).not.toMatch(/\b(buy|sell|hold|target price|best)\b/i);
  });
});
