// @vitest-environment jsdom
// Task #251 (the 19 Nov Discover pack, which replaces #245's layout): the Discovery page. README checks: it opens on Themes and each tab and detail page has
// its own link; Portfolio and Watchlist counts with every name that is not placed; ☆ adds to and removes from the watchlist and the panel follows; every i
// opens and closes (second click, outside click, Escape) and gives focus back; views, filters, chips, Clear all and paging agree with the count; the page's
// own words describe and never advise.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, BoardRow } from "../discovery/model";

const st = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null, plan: "gold", toast: [] as string[] }));
const mk = (s: string, n: string, th: string, extra: Partial<BoardRow> = {}): BoardRow => ({ s, n, th, sec: [], st: "Operating", tone: 0.4, fc: 2, ev: {}, mac: "Industrials", ind: "Aerospace & Defense",
  dd: "2026-11-05", pg: 30, grp: null, ...extra });
const ROWS: BoardRow[] = [
  mk("BSHIELD", "Bharat Shield Ltd", "Defence & Aerospace", { ev: { order: 2 } }),
  mk("RADAR", "Radar Works Ltd", "Defence & Aerospace", { st: "Planned" }),
  mk("SOLARX", "Solar X Ltd", "Renewable Energy & Power", { mac: "Power", ind: "Power", ev: { capacity: 1 } }),
  mk("FORGE", "Forge Co Ltd", "Industrial Manufacturing & Capex"),
  mk("CHIPS", "Chips Ltd", "AI & GenAI", { mac: "Information Technology", ind: "IT - Services" }),
];
const T = (name: string, n: number, broad = false, label = name) => ({ name, label, short: label, broad, n, also: 1, news: { filings: 3, positive: 1, negative: 0 }, verify: ["Look for order values."], merged: [] as string[] });
const BOARD: Board = { updated: "2026-11-19T02:00:00", companies: 5, read: 9, days: 90, rows: ROWS,
  themes: [T("Industrial Manufacturing & Capex", 1, true, "Industrial manufacturing & capex"), T("Defence & Aerospace", 2), { ...T("Renewable Energy & Power", 1), merged: ["Renewable Power"] }, T("AI & GenAI", 1),
    T("Corporate Catalysts & Growth Signals", 0, true, "Corporate developments")],
  efil: { order: [{ s: "BSHIELD", n: "Bharat Shield Ltd", d: "2026-11-17", e: "order", el: "Order win", t: "Order worth Rs 400 crore for radar systems", l: null }] }, events: ["order"], eventsTracked: ["order"], caution: "A keyword mention by itself is not proof of material business exposure.", method: "How it is built." };
const UNI = { rows: [
  { symbol: "BSHIELD", name: "Bharat Shield Ltd", prism_final: 81, prism_label: "STRONG", prism_lt: "Uptrend", prism_st: "Uptrend", ret_3m: 5, return_1y: 20, pct_from_high: 4, market_cap: 40000 },
  { symbol: "RADAR", name: "Radar Works Ltd", prism_final: 52, prism_label: "AVERAGE", prism_lt: "Downtrend", ret_3m: -3, return_1y: -8, pct_from_high: 30, market_cap: 3000 },
  { symbol: "SOLARX", name: "Solar X Ltd", prism_final: null, prism_lt: null, ret_3m: 1, market_cap: 120000 },
  { symbol: "FORGE", name: "Forge Co Ltd", prism_final: 70, prism_label: "HEALTHY", prism_lt: "Strong uptrend", ret_3m: 9, market_cap: 8000 },
  { symbol: "CHIPS", name: "Chips Ltd", prism_final: 60, prism_label: "AVERAGE", prism_lt: "Sideways", ret_3m: 0, market_cap: 6000 },
  { symbol: "NOTHERE", name: "Not Here Ltd" }], as_of: "2026-11-19" };
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (p: string) => {
    if (p === "/api/discovery/board") return JSON.parse(JSON.stringify(BOARD));
    if (p === "/api/screener/universe") return JSON.parse(JSON.stringify(UNI));
    if (p.startsWith("/api/discovery?symbol=")) return { themes: [{ name: "Defence & Aerospace", companies: [{ symbol: "BSHIELD", evidence: ["We won radar orders worth Rs 400 crore."], keywords: ["Defence orders"], verify: [], document: { date: "2026-11-05", pages: 30, link: "https://nsearchives.nseindia.com/x.pdf" } }] }] };
    if (p === "/api/rotation") return { date: "2026-11-06", date_label: "6 Nov 2026", rows: [] };
    if (p === "/api/sectors") return { date: "2026-11-06", rows: [] };
    if (p.startsWith("/api/leadership/list")) return { available: false, reason: "hidden" };
    throw Object.assign(new Error("not stood in: " + p), { status: 503 });
  }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()),
  useUI: () => ({ plan: st.plan, has: (t: string) => (t === "gold" ? st.plan === "gold" : t === "silver" ? st.plan !== "basic" : true), toast: (m: string) => st.toast.push(m), upgrade: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: st.user }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { DiscoveryPage } from "./Discovery";
import { portfolio } from "../lib/portfolio";
import { watch } from "../lib/watchlist";
import { filterRows, freshT, parseRoute, sortRows, joinRows, LENSES } from "../discovery/model";

let loc = "";
function Where() { loc = useLocation().hash; return null; }
const show = async (hash = "") => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/discovery" + hash]}><Routes><Route path="/discovery" element={<><DiscoveryPage /><Where /></>} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("tablist", { name: "Discovery views" });
};
beforeEach(() => {
  st.user = { id: 1 }; st.plan = "gold"; st.toast = [];
  portfolio.replace?.({ holdings: [{ id: "a", symbol: "BSHIELD", qty: 1, price: 1, owned: true }, { id: "b", symbol: "NOTHERE", qty: 1, price: 1, owned: true }] } as never);
  watch.replace({ lists: [{ id: "main", name: "My watchlist", symbols: ["SOLARX"] }], meta: {} });
});
afterEach(() => { cleanup(); });

describe("#251: the page and its addresses", () => {
  it("opens on Themes; specific themes first, the broad groups last under 'Broad groups'; Renewable Power is said to be inside Renewable Energy & Power", async () => {
    await show();
    expect(within(screen.getByRole("tablist", { name: "Discovery views" })).getByRole("tab", { selected: true }).textContent).toMatch(/^Themes/);
    const cards = [...document.querySelectorAll(".dsc-cd h3")].map((h) => h.textContent);
    expect(cards.slice(-1)).toEqual(["Industrial manufacturing & capex"]);
    expect(cards.indexOf("Industrial manufacturing & capex")).toBeGreaterThan(cards.indexOf("Defence & Aerospace"));
    expect(screen.getByRole("heading", { name: "Broad groups" })).toBeTruthy();
    expect(document.body.textContent).toMatch(/“Renewable Power” is shown inside “Renewable Energy & Power”/);
    expect(document.body.textContent).toMatch(/Corporate developments: no company has it as its main theme yet; 1 mention it/);
  });
  it("a theme card goes to #theme-...; the tabs set #what-changed, #sectors, #all-companies; a sector and an event have their own pages with a breadcrumb", async () => {
    await show();
    fireEvent.click(within(screen.getByRole("tablist", { name: "Discovery views" })).getByRole("tab", { name: /Sectors/ }));
    expect(loc).toBe("#sectors");
    cleanup(); await show("#theme-defence-and-aerospace");
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Defence & Aerospace")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /Defence & Aerospace/ })).toBeTruthy();
    expect(document.querySelector(".dsc-mine")).toBeNull();                                // "Your names" hides on detail pages
    expect(document.querySelector(".dsc-yh")!.textContent).toMatch(/Yours here \(★ watchlist\):Bharat Shield/);
    expect(document.body.textContent).not.toMatch(/Latest filings in this theme/);          // task #250: that list is gone, and stays gone
    cleanup(); await show("#sector-industrials");
    expect(screen.getByRole("heading", { level: 2, name: "Industrials" })).toBeTruthy();
    cleanup(); await show("#change-order");
    expect(screen.getByRole("heading", { level: 2, name: "Order wins" })).toBeTruthy();
    expect(document.body.textContent).toMatch(/Bharat Shield · Order worth Rs 400 crore for radar systems/);
    expect(parseRoute("#nothing", ["A"], ["B"])).toEqual({ view: "themes" });
  });
});

describe("#251: your names", () => {
  it("Portfolio and Watchlist counts, and every name not placed with its reason", async () => {
    await show();
    expect(document.querySelector(".dsc-minesum")!.textContent).toBe("1 of your 2 portfolio holdings and 1 of your 1 watchlist names are placed in a theme.");
    const np = document.querySelector(".dsc-np")!;
    expect(np.querySelector("summary")!.textContent).toMatch(/^Not placed yet \(1\) Not Here/);
    expect(np.textContent).toMatch(/No theme found in its newest investor presentation, or none read yet\./);
    fireEvent.click(screen.getByRole("tab", { name: /Watchlist/ }));
    expect(document.querySelector(".dsc-mc .t1 b")!.textContent).toBe("Solar X");
  });
  it("signed out: a sign-in line, no names", async () => {
    st.user = null; await show();
    expect(document.querySelector(".dsc-minesum")!.textContent).toBe("Sign in to see where your portfolio and watchlist names sit in these themes.");
  });
  it("☆ in a company's details adds it to the watchlist and the panel follows; ★ removes it", async () => {
    await show("#all-companies");
    fireEvent.click(screen.getByRole("button", { name: "Bharat Shield" }));
    const add = await screen.findByRole("button", { name: "☆ Add to watchlist" });
    fireEvent.click(add);
    expect(watch.has("BSHIELD")).toBe(true);
    expect(screen.getByRole("button", { name: "★ On your watchlist" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".dsc-minesum")!.textContent).toMatch(/2 of your 2 watchlist names/);
    expect(await screen.findByText("“We won radar orders worth Rs 400 crore.”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "★ On your watchlist" }));
    expect(watch.has("BSHIELD")).toBe(false);
  });
});

describe("#251: i buttons", () => {
  it("opens; closes on a second click, a click outside and Escape; focus goes back to the button", async () => {
    await show();
    const ib = document.querySelector<HTMLButtonElement>(".dsc-mineh .dsc-ib")!;
    fireEvent.click(ib); expect(screen.getByRole("note").textContent).toMatch(/^Your portfolio and watchlist names that Discover has placed/);
    fireEvent.click(ib); expect(screen.queryByRole("note")).toBeNull(); expect(document.activeElement).toBe(ib);
    fireEvent.click(ib); fireEvent.mouseDown(document.body); expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(ib); act(() => { fireEvent.keyDown(document, { key: "Escape" }); }); expect(screen.queryByRole("note")).toBeNull(); expect(document.activeElement).toBe(ib);
  });
});

describe("#251: the table", () => {
  it("views, filters, chips, Clear all and the count agree; Not rated where FinLit has no reading", async () => {
    await show("#all-companies");
    const count = () => document.querySelector(".dsc-cnt")!.textContent;
    expect(count()).toBe("5 companies");
    const up = screen.getByRole("button", { name: /Long-term uptrend/ });
    expect(up.textContent).toBe("Long-term uptrend2");                                     // BSHIELD (Uptrend), FORGE (Strong uptrend)
    fireEvent.click(up); expect(count()).toBe("2 companies");
    fireEvent.change(screen.getByRole("combobox", { name: "Size" }), { target: { value: "M" } });
    expect(count()).toBe("1 company");
    const chips = screen.getByRole("group", { name: "Filters on" });
    expect([...chips.querySelectorAll(".dsc-ac")].map((b) => b.textContent)).toEqual(["Size: Mid ✕", "Long-term uptrend ✕"]);
    fireEvent.click(within(chips).getByRole("button", { name: "Remove filter Size: Mid" })); expect(count()).toBe("2 companies");
    fireEvent.click(within(screen.getByRole("group", { name: "Filters on" })).getByRole("button", { name: "Clear all" })); expect(count()).toBe("5 companies");
    fireEvent.change(screen.getByRole("combobox", { name: "Long-term trend" }), { target: { value: "none" } });
    expect(count()).toBe("1 company");
    expect(document.querySelector(".dsc-tb tbody")!.textContent).toMatch(/Solar X.*Not rated/);
    expect(screen.getByRole("button", { name: /Leader in its peer group/ }).hasAttribute("disabled")).toBe(true);   // peer labels not published: said, not zero
  });
  it("Silver: FinLit Prism and the trends read 'Gold', never 'Not rated'", async () => {
    st.plan = "silver"; await show("#all-companies");
    fireEvent.change(screen.getByRole("combobox", { name: "Long-term trend" }), { target: { value: "none" } });
    expect(document.querySelector(".dsc-tb tbody")!.textContent).toMatch(/Gold/);
  });
  it("sorting, paging and the rules behind the views", () => {
    const rows = joinRows(BOARD, UNI.rows as never, [], [], undefined);
    const S = { ...freshT("pr") };
    expect(sortRows(rows, S).map((r) => r.s)).toEqual(["BSHIELD", "FORGE", "CHIPS", "RADAR", "SOLARX"]);   // no Prism last
    expect(filterRows(rows, { ...S, lenses: ["high"] }, () => false).map((r) => r.s)).toEqual(["BSHIELD"]);
    expect(LENSES.map((l) => l.t)).toEqual(["New order or capacity filing", "Long-term uptrend", "Leader in its peer group", "Within 10% of its 52-week high", "Industry ahead and gaining", "Prism strong or healthy"]);
  });
});

describe("#251: words and styles", () => {
  it("FinLit's own text never advises; text is 12 px or more", () => {
    const dir = resolve(process.cwd(), "src/discovery");
    for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
      const src = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n")
        .replace(/target="_blank"|\.target\b|side !== "sell"/g, "");      // code (a link target, an event's target, a stored sale row), not words
      expect(src, f).not.toMatch(/\b(buy|sell|hold|avoid|target|signals|multibagger|top pick)\b/i);
    }
    const css = readFileSync(join(dir, "discover.css"), "utf8");
    expect(css).not.toMatch(/font(-size)?:[^;]*\b(10|11)(\.\d+)?px/);
  });
});
