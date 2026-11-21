// @vitest-environment jsdom
// Task #260 (the 20 Nov Discover pack): real paths (/discover, /discover/themes/<slug>, ...), the filters in the query string, the four views strip, the theme
// page's boxes, sectors at three levels and the new industry page, the rev 4 filter box with linked NSE filters, the eleven columns, the company panel, the
// four shared sizes, Pulse and Rotation in the shared words with dates, the Gold locks (the two views on hidden readings locked too), the FAQ.
// Task #251 (the 19 Nov Discover pack, which replaces #245's layout): the Discovery page. README checks: it opens on Themes and each tab and detail page has
// its own link; Portfolio and Watchlist counts with every name that is not placed; ☆ adds to and removes from the watchlist and the panel follows; every i
// opens and closes (second click, outside click, Escape) and gives focus back; views, filters, chips, Clear all and paging agree with the count; the page's
// own words describe and never advise.
// Task #303: the same checks on the new frame (one line of figures, one tab bar for the six ways) and the dropdown toolbar (views, filters and columns in
// dropdowns); every intent is kept.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, BoardRow } from "../discovery/model";

const st = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null, plan: "gold", toast: [] as string[], pagesKept: true }));
const mk = (s: string, n: string, th: string, extra: Partial<BoardRow> = {}): BoardRow => ({ s, n, th, sec: [], st: "Operating", tone: 0.4, fc: 2, ev: {}, mac: "Industrials", sc: "Capital Goods",
  ind: "Aerospace & Defense", dd: "2026-11-05", pg: 30, grp: "aerospace-defense", ...extra });
const ROWS: BoardRow[] = [
  mk("BSHIELD", "Bharat Shield Ltd", "Defence & Aerospace", { ev: { order: 2 } }),
  mk("RADAR", "Radar Works Ltd", "Defence & Aerospace", { st: "Planned" }),
  mk("SOLARX", "Solar X Ltd", "Renewable Energy & Power", { mac: "Power", sc: "Power", ind: "Power", grp: null, ev: { capacity: 1 } }),
  mk("FORGE", "Forge Co Ltd", "Industrial Manufacturing & Capex", { ind: "Electrical Equipment", grp: null, ev: { order: 1, capacity: 1, rating: 1, management: 4 } }),
  mk("CHIPS", "Chips Ltd", "AI & GenAI", { mac: "Information Technology", sc: "Information Technology", ind: "IT - Services", grp: null }),
];
const T = (name: string, n: number, broad = false, label = name) => ({ name, label, short: label, broad, n, also: 1, news: { filings: 3, positive: 1, negative: 0 }, verify: ["Look for order values."], merged: [] as string[] });
const BOARD: Board = { updated: "2026-11-19T02:00:00", companies: 5, read: 9, days: 90, rows: ROWS,
  themes: [T("Industrial Manufacturing & Capex", 1, true, "Industrial manufacturing & capex"), T("Defence & Aerospace", 2), { ...T("Renewable Energy & Power", 1), merged: ["Renewable Power"] }, T("AI & GenAI", 1),
    T("Corporate Catalysts & Growth Signals", 0, true, "Corporate developments")],
  efil: { order: [1, 2, 3, 4, 5, 6].map((i) => ({ s: "BSHIELD", n: "Bharat Shield Ltd", d: `2026-11-1${i}`, e: "order", el: "Order win", t: i === 6 ? "Order worth Rs 400 crore for radar systems" : `Order ${i}`, l: null })) },
  thfil: { "Defence & Aerospace": [{ s: "BSHIELD", n: "Bharat Shield Ltd", d: "2026-11-17", e: "order", el: "Order win", t: "Order worth Rs 400 crore for radar systems", l: "https://nsearchives.nseindia.com/o.pdf" }] },
  events: ["order"], eventsTracked: ["order"], caution: "A keyword mention by itself is not proof of material business exposure.", method: "How it is built." };
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
    if (p.startsWith("/api/discovery/company?symbol=")) return { symbol: "BSHIELD", theme: "Defence & Aerospace", words: ["Defence orders", "Radar"],
      passages: [{ t: "We won radar orders worth Rs 400 crore.", kind: "sentence", names: true, page: st.pagesKept ? 7 : null }, { t: "Our plants run at full capacity.", kind: "sentence", names: false, page: st.pagesKept ? 9 : null }],
      document: { title: "Investor presentation", date: "2026-11-05", pages: 30, link: "https://nsearchives.nseindia.com/x.pdf", pagesKept: st.pagesKept },
      filings: [{ d: "2026-11-17", e: "order", el: "Order win", t: "Order worth Rs 400 crore for radar systems", l: "https://nsearchives.nseindia.com/o.pdf" }] };
    if (p.startsWith("/api/stocks/")) return { symbol: "X", state: "empty", code: "not_written", reason: "Not written yet.", disclaimer: "", compliance: "" };
    if (p === "/api/rotation") return { date: "2026-11-06", date_label: "6 Nov 2026", groups_ranked: 37, rows: [{ name: "Aerospace & Defense", slug: "aerospace-defense", kind: "industry", corner: "ahead_gaining",
      corner_name: "Ahead and gaining", weeks_in_corner: 2, rank: 13, ranked: 37 }] };
    if (p === "/api/sectors") return { date: "2026-11-06", rows: [{ slug: "aerospace-defense", name: "Aerospace & Defense", state: "Thrust CAP", state_code: "thrust_cap" }] };
    if (p.startsWith("/api/leadership/list")) return { available: false, reason: "hidden" };
    throw Object.assign(new Error("not stood in: " + p), { status: 503 });
  }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()),
  useUI: () => ({ plan: st.plan, has: (t: string) => (t === "gold" ? st.plan === "gold" : t === "silver" ? st.plan !== "basic" : true), toast: (m: string) => st.toast.push(m), upgrade: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: st.user }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { DiscoveryPage, DiscoveryRedirect } from "./Discovery";
import { portfolio } from "../lib/portfolio";
import { watch } from "../lib/watchlist";
import { filterRows, freshT, parseRoute, sortRows, joinRows, LENSES, readT, writeT, legacyPath, linkFilters, treeOf, toneWord, daysOld } from "../discovery/model";
import { faqForPath } from "../lib/pageFaqs";

let loc = "";
function Where() { const l = useLocation(); loc = l.pathname + l.search; return null; }
const show = async (path = "/discover") => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes><Route path="/discover/*" element={<><DiscoveryPage /><Where /></>} /><Route path="/discovery" element={<DiscoveryRedirect />} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("navigation", { name: "Discover views" });
};
const views = () => screen.getByRole("navigation", { name: "Discover views" });
/** Task #303: opens one of the toolbar's dropdowns by its button. */
const ddBtn = (name: RegExp | string) => screen.getAllByRole("button", { name }).find((b) => b.classList.contains("dbx-ddb"))!;
const dd = (name: RegExp | string) => { fireEvent.click(ddBtn(name)); return screen.getByRole("dialog"); };
const pickOpt = (btn: RegExp | string, opt: RegExp | string) => { const d = dd(btn); fireEvent.click(within(d).getByRole("option", { name: opt })); };
beforeEach(() => {
  st.user = { id: 1 }; st.plan = "gold"; st.toast = []; st.pagesKept = true;
  portfolio.replace?.({ holdings: [{ id: "a", symbol: "BSHIELD", qty: 1, price: 1, owned: true }, { id: "b", symbol: "NOTHERE", qty: 1, price: 1, owned: true }] } as never);
  watch.replace({ lists: [{ id: "main", name: "My watchlist", symbols: ["SOLARX"] }], meta: {} });
});
afterEach(() => { cleanup(); });

describe("#260: the page and its addresses", () => {
  it("opens on Themes; specific themes first, the broad groups last under 'Broad groups'; Renewable Power is said to be inside Renewable Energy & Power", async () => {
    await show();
    expect(views().querySelector("[aria-current=page]")!.textContent).toMatch(/^Themes/);
    const cards = [...document.querySelectorAll(".dsc-cd h3")].map((h) => h.textContent);
    expect(cards.slice(-1)).toEqual(["Industrial manufacturing & capex"]);
    expect(cards.indexOf("Industrial manufacturing & capex")).toBeGreaterThan(cards.indexOf("Defence & Aerospace"));
    expect(screen.getByRole("heading", { name: "Broad groups" })).toBeTruthy();
    expect(document.body.textContent).toMatch(/“Renewable Power” is shown inside “Renewable Energy & Power”/);
    expect(document.body.textContent).toMatch(/Corporate developments: no company has it as its main theme yet; 1 mentions it/);
  });
  it("§1 the head: eyebrow, Discover with a New tag, the as-of pill, the two FAQ links, the line of figures", async () => {
    await show();
    const h = document.querySelector(".dsc-head")!;
    expect(h.querySelector(".sp-eyebrow")!.textContent).toBe("Research · Find stocks");
    expect(h.querySelector("h1")!.textContent).toBe("Discover");
    expect(h.querySelector(".dsc-new")!.textContent).toBe("New");
    expect(h.querySelector(".xsh-date")!.textContent).toMatch(/^Presentations to 19 Nov 2026 · prices and scores: 19 Nov 2026 close$/);
    const links = [...h.querySelectorAll("a.xsh-link")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([["How is a company placed? →", "/discover#faq-discover-1"], ["Does Discover tell me what to buy? →", "/discover#faq-discover-7"]]);
    expect([...document.querySelectorAll(".dw-meta > span")].map((c) => c.textContent)).toEqual(["5 companies placedi", "4 themes", "Filings of the last 90 days"]);
  });
  it("§3 the views in one tab bar (task #303), each a real path; §14 every page has its own path and Back-able address", async () => {
    await show();
    const ways = [...views().querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(ways).toEqual([["Themes4", "/discover"], ["What changed8", "/discover/changes"], ["Sectors3", "/discover/sectors"], ["All companies5", "/discover/companies"],
      ["Earnings calls8", "/discover/calls"], ["Results filings7", "/discover/results"]]);
    fireEvent.click(within(views()).getByRole("link", { name: /Sectors/ }));
    expect(loc).toBe("/discover/sectors");
    cleanup(); await show("/discover/themes/defence-and-aerospace");
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Defence & Aerospace")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /Defence & Aerospace/ })).toBeTruthy();
    expect(document.querySelector(".dsc-mine")).toBeNull();                                // "Your names" hides on detail pages
    expect(within(dd(/^My names/)).getByRole("option", { name: /Bharat Shield/ })).toBeTruthy();   // task #303: "Yours here" is the My names dropdown
    cleanup(); await show("/discover/sectors/industrials");
    expect(screen.getByRole("heading", { level: 2, name: "Industrials" })).toBeTruthy();
    expect(document.querySelector(".dsc-kind")!.textContent).toBe("Macro sector · NSE");
    expect(screen.getByRole("heading", { name: "Sectors and industries" })).toBeTruthy();
    expect(document.querySelector(".dsc-secrow small")!.textContent).toBe("2 industries");
    expect(document.body.textContent).not.toMatch(/\b1 industries\b/);                   // found live: "1 industries"
    cleanup(); await show("/discover/sectors/industrials/capital-goods");
    expect(screen.getByRole("heading", { level: 2, name: "Capital Goods" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Industries in this sector" })).toBeTruthy();
    cleanup(); await show("/discover/industries/aerospace-and-defense");
    expect(screen.getByRole("heading", { level: 2, name: "Aerospace & Defense" })).toBeTruthy();
    expect([...screen.getByRole("navigation", { name: "Breadcrumb" }).querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Sectors", "Industrials", "Capital Goods"]);
    expect(screen.getByRole("heading", { name: "This industry today" })).toBeTruthy();
    expect(document.querySelector(".dsc-tb thead")!.textContent).not.toMatch(/Sector · industry/);   // hidden on industry pages
    cleanup(); await show("/discover/changes/order");
    expect(screen.getByRole("heading", { level: 2, name: "Order wins" })).toBeTruthy();
    expect(parseRoute("/discover/nothing", { themes: ["A"], macros: ["B"], sectors: [], industries: [] })).toEqual({ view: "themes" });
  });
  it("§14 the old /discovery#... addresses land on the same pages; the filters live in the query string", async () => {
    await show("/discovery");
    expect(loc).toBe("/discover");
    expect(legacyPath("#theme-ai-and-genai")).toBe("/discover/themes/ai-and-genai");
    expect(legacyPath("#change-order")).toBe("/discover/changes/order");
    expect(legacyPath("#sector-industrials")).toBe("/discover/sectors/industrials");
    expect(legacyPath("#all-companies")).toBe("/discover/companies");
    const t = { ...freshT("pr"), stage: "Operating", size: "mid", mac: "Industrials", lenses: ["high", "fresh"], sort: "r3m", dir: 1 as const, page: 2, per: 50 };
    const q = writeT(t, "pr");
    expect(q.toString()).toBe("stage=Operating&size=mid&mac=Industrials&v=high%2Cfresh&sort=r3m&dir=asc&page=3&per=50");
    expect(readT(q, "pr")).toEqual(t);
    expect(writeT(freshT("pr"), "pr").toString()).toBe("");                                 // a clean page has a clean address
    cleanup(); await show("/discover/companies?size=large");
    expect(document.querySelector(".dsc-cnt")!.textContent).toBe("1 of 5 companies");       // SOLARX, ₹1,20,000 Cr
  });
  it("§5 the theme page: five figures, How far along, Where these companies sit (switch, bars, a bar filters the table), What to check, Latest filings", async () => {
    await show("/discover/themes/defence-and-aerospace");
    expect([...document.querySelectorAll(".dsc-kpi .l")].map((x) => x.textContent)).toEqual(["Companies", "3-month mediani", "1-year mediani", "In a long-term uptrendi", "Filings, 90 daysi"]);
    expect(screen.getByRole("heading", { name: /How far along/ })).toBeTruthy();
    const where = screen.getByRole("heading", { name: /Where these companies sit/ }).parentElement!;
    expect([...within(where).getByRole("group", { name: "Level" }).querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Macro sector", "Sector", "Industry"]);
    expect(where.textContent).toMatch(/1 industry of NSE’s 59 on NSE’s classification\. Pick one to list its companies below\./);
    fireEvent.click(within(where).getByRole("button", { name: "Aerospace & Defense" }));
    expect(loc).toBe("/discover/themes/defence-and-aerospace?ind=Aerospace+%26+Defense");
    expect(dd(/^What to check/).textContent).toMatch(/A theme word or a filing alone is not proof of real business\. Check the figures, orders and status in the company’s own documents\./);
    expect(screen.getByRole("heading", { name: "Latest filings in this theme" }).closest("section")!.textContent).toMatch(/Bharat Shield Order worth Rs 400 crore for radar systems/);
    expect(document.querySelector(".dsc-tb thead")!.textContent).not.toMatch(/Theme · stage/);   // hidden on theme pages
  });
  it("§6 an event page lists three of its filings, then 'Show all N' (task #303, version 3)", async () => {
    await show("/discover/changes/order");
    const box = screen.getByRole("heading", { name: "Latest of these filings" }).closest("section")!;
    expect(box.querySelectorAll(":scope > ul.dw-fl > li").length).toBe(3);
    expect(box.querySelector("details summary")!.textContent).toMatch(/^Show all 6/);
  });
  it("§7 Sectors: Macro sectors | Sectors | Industries switch; the industries table with Rotation 'rank N of 37 · W wks' and Pulse in the shared words; the reading date and 'days old'", async () => {
    await show("/discover/sectors");
    const sw = screen.getByRole("group", { name: "Level" });
    expect([...sw.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Macro sectors 3", "Sectors 3", "Industries 4"]);
    fireEvent.click(within(sw).getByRole("button", { name: /Industries/ }));
    const row = [...document.querySelectorAll(".dsc-ind tbody tr")].find((r) => /Aerospace & Defense/.test(r.textContent || ""))!;
    expect(row.querySelector(".dsc-rc")!.textContent).toBe("↗Ahead and gaining");
    expect(row.textContent).toMatch(/rank 13 of 37 · 2 wks/);
    expect(row.querySelector(".sx-chip")!.textContent).toBe("Bouncing back"); expect(row.querySelector(".dsc-pn")!.textContent).toBe("after a crash");
    expect(document.body.textContent).not.toMatch(/Thrust|Washout|Confirmed|Fading/);
    expect(document.querySelector(".dsc-stale")!.textContent).toMatch(/^\d+ days old$/);  // the 6 Nov reading is more than a week old
    expect(document.body.textContent).toMatch(/Sector Rotation \(weekly\) and Sector Pulse \(daily\) readings of 6 Nov 2026\./);
  });
});

describe("#251/#260: your names", () => {
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
    await show("/discover/companies");
    fireEvent.click(screen.getByRole("button", { name: "Bharat Shield" }));
    const add = await screen.findByRole("button", { name: "☆ Add to watchlist" });
    fireEvent.click(add);
    expect(watch.has("BSHIELD")).toBe(true);
    expect(screen.getByRole("button", { name: "★ On your watchlist" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".dsc-minesum")!.textContent).toMatch(/2 of your 2 watchlist names/);
    expect((await screen.findByText(/“We won radar orders worth Rs 400 crore\.”/)).textContent).toMatch(/page 7/);
    fireEvent.click(screen.getByRole("button", { name: "★ On your watchlist" }));
    expect(watch.has("BSHIELD")).toBe(false);
  });
});

describe("task #273: &open=<symbol> opens that company's row on arrival", () => {
  it("the companies page with ?q=<name>&open=<symbol> lands with the row's details open", async () => {
    await show("/discover/companies?q=Bharat%20Shield&open=BSHIELD");
    expect(await screen.findByRole("button", { name: "☆ Add to watchlist" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Details for Bharat Shield Ltd" }).getAttribute("aria-expanded")).toBe("true");
  });
  it("an unknown symbol opens nothing", async () => {
    await show("/discover/companies?open=NOSUCH");
    expect(screen.queryByRole("button", { name: "☆ Add to watchlist" })).toBeNull();
  });
});

describe("#251/#260: i buttons", () => {
  it("opens; closes on a second click, a click outside and Escape; focus goes back to the button", async () => {
    await show();
    const ib = document.querySelector<HTMLButtonElement>(".dsc-mineh .dsc-ib")!;
    fireEvent.click(ib); expect(screen.getByRole("note").textContent).toMatch(/^Your portfolio and watchlist names that Discover has placed/);
    fireEvent.click(ib); expect(screen.queryByRole("note")).toBeNull(); expect(document.activeElement).toBe(ib);
    fireEvent.click(ib); fireEvent.mouseDown(document.body); expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(ib); act(() => { fireEvent.keyDown(document, { key: "Escape" }); }); expect(screen.queryByRole("note")).toBeNull(); expect(document.activeElement).toBe(ib);
  });
});

describe("#251/#260: the table", () => {
  it("views, filters, chips, Clear all and the count agree; Not rated where FinLit has no reading", async () => {
    await show("/discover/companies");
    const count = () => document.querySelector(".dsc-cnt")!.textContent;
    expect(count()).toBe("5 companies");
    const up = within(dd(/^Ready-made views/)).getByRole("checkbox", { name: /Long-term uptrend/ });
    expect(up.closest("label")!.textContent).toBe("Long-term uptrend2");                   // BSHIELD (Uptrend), FORGE (Strong uptrend)
    fireEvent.click(up); expect(count()).toBe("2 of 5 companies");
    fireEvent.keyDown(document, { key: "Escape" });
    pickOpt(/^Size/, /^Mid/);
    expect(count()).toBe("1 of 5 companies");                                               // BSHIELD, ₹40,000 Cr: Mid on the four shared sizes
    const chips = screen.getByRole("group", { name: "Filters on" });
    expect([...chips.querySelectorAll(".dbx-chip")].map((b) => b.textContent)).toEqual(["Size: Mid", "Long-term uptrend"]);
    fireEvent.click(within(chips).getByRole("button", { name: "Remove filter Size: Mid" })); expect(count()).toBe("2 of 5 companies");
    fireEvent.click(within(screen.getByRole("group", { name: "Filters on" })).getByRole("button", { name: "Clear all" })); expect(count()).toBe("5 companies");
    fireEvent.change(within(dd(/^More filters/)).getByRole("combobox", { name: "Long-term trend" }), { target: { value: "none" } });
    expect(count()).toBe("1 of 5 companies");
    expect(document.querySelector(".dsc-tb tbody")!.textContent).toMatch(/Solar X.*Not rated/);
    fireEvent.keyDown(document, { key: "Escape" });
    const lead = within(dd(/^Ready-made views/)).getByRole("checkbox", { name: /Leader in its peer group/ });
    expect(lead.hasAttribute("disabled")).toBe(true);                                         // peer labels not published: said, not zero
    expect(lead.closest("label")!.textContent).toBe("Leader in its peer groupNot published yet");
  });
  it("Silver: FinLit Prism and the trends read 'Gold', never 'Not rated'", async () => {
    st.plan = "silver"; await show("/discover/companies");
    expect(document.querySelector(".dsc-tb tbody")!.textContent).toMatch(/Gold/);
    expect((within(dd(/^More filters/)).getByRole("combobox", { name: "Long-term trend" }) as HTMLSelectElement).textContent).toBe("Part of Gold");
  });
  it("a plan without the trends never reads '0 of N in a long-term uptrend': the counts and the trend views say Gold (found on the live page, 19 Nov)", async () => {
    st.plan = "silver"; await show();
    const ups = () => [...document.querySelectorAll(".dsc-kv span, .dsc-kpi")].filter((e) => /long-term uptrend/i.test(e.textContent || "")).map((e) => e.textContent);
    expect(ups().length).toBeGreaterThan(0);
    ups().forEach((t) => { expect(t).not.toMatch(/\d+ of \d+/); expect(t).toMatch(/Gold/); });
    expect(screen.queryByRole("option", { name: "Share in an uptrend" })).toBeNull();
    cleanup(); await show("/discover/sectors");
    ups().forEach((t) => expect(t).toMatch(/Gold/));
    cleanup(); await show("/discover/companies");
    const vd = dd(/^Ready-made views/);
    for (const v of [/Long-term uptrend/, /Prism strong or healthy/]) {
      const b = within(vd).getByRole("checkbox", { name: v });
      expect(b.hasAttribute("disabled")).toBe(true); expect(b.closest("label")!.textContent).toMatch(/Gold$/);
    }
    cleanup(); st.plan = "gold"; await show();
    expect(ups().some((t) => /\d+ of \d+/.test(t || ""))).toBe(true);                       // Gold still sees the counts
  });
  it("sorting, paging and the rules behind the views", () => {
    const rows = joinRows(BOARD, UNI.rows as never, [], [], undefined);
    const S = { ...freshT("pr") };
    expect(sortRows(rows, S).map((r) => r.s)).toEqual(["BSHIELD", "FORGE", "CHIPS", "RADAR", "SOLARX"]);   // no Prism last
    expect(filterRows(rows, { ...S, lenses: ["high"] }, () => false).map((r) => r.s)).toEqual(["BSHIELD"]);
    expect(LENSES.map((l) => l.t)).toEqual(["New order or capacity filing", "Long-term uptrend", "Leader in its peer group", "Within 10% of its 52-week high", "Industry ahead and gaining", "Prism strong or healthy"]);
  });
});

describe("#260: the rev 4 filter box, the columns and the company panel", () => {
  it("task #303: the toolbar: search, Theme, Stage, Sector, Industry, Size, More filters, My names; Sector and Industry linked, 'Any industry in Industrials'", async () => {
    await show("/discover/companies");
    expect((screen.getByRole("searchbox", { name: "Search in this list" }) as HTMLInputElement).placeholder).toBe("Search a company in this list");
    expect([...screen.getByRole("group", { name: "Filters" }).querySelectorAll(".dbx-ddb .dbx-ddl")].map((b) => b.textContent))
      .toEqual(["Theme", "Stage", "Sector", "Industry", "Size", "More filters", "My names"]);
    expect(within(dd(/^Size/)).getAllByRole("option").map((o) => o.textContent)).toEqual(["Any size5", "Large · above ₹75,000 cr1", "Mid · ₹25,000–75,000 cr1",
      "Small · ₹10,000–25,000 cr0", "Micro · below ₹10,000 cr3"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect([...(within(dd(/^More filters/)).getByRole("combobox", { name: "Sector Rotation" }) as HTMLSelectElement).options].map((o) => o.text))
      .toEqual(["Any box", "↗ Ahead and gaining (2)", "→ Ahead but slowing (0)", "↑ Behind but gaining (0)", "↘ Behind and slipping (0)"]);
    fireEvent.keyDown(document, { key: "Escape" });
    pickOpt(/^Sector/, /^All of Industrials/);
    expect(loc).toBe("/discover/companies?mac=Industrials");
    expect(ddBtn(/^Sector/).className).toMatch(/\bon\b/);   // on = teal
    expect(within(dd(/^Industry/)).getAllByRole("option").map((o) => o.textContent)).toEqual(["Any industry in Industrials3", "Aerospace & Defense2", "Electrical Equipment1"]);
    fireEvent.click(screen.getByRole("option", { name: /^Electrical Equipment/ }));
    expect(loc).toBe("/discover/companies?mac=Industrials&sct=Capital+Goods&ind=Electrical+Equipment");   // an industry sets its sector and macro sector
    pickOpt(/^Sector/, /^All of Power/);
    expect(loc).toBe("/discover/companies?mac=Power");                                       // a new macro sector takes the sector and industry off
    const lead = within(dd(/^Ready-made views/)).getByRole("checkbox", { name: /Industry ahead and gaining/ });
    expect(lead.hasAttribute("disabled")).toBe(true);                                         // no company in this list: greyed, cannot be switched on
  });
  it("the linked rule: a choice that no longer fits is taken off with a message", () => {
    const tree = treeOf(joinRows(BOARD, UNI.rows as never, [], [], undefined));
    expect(linkFilters({ mac: "Power", sct: "Capital Goods", ind: "" }, tree)).toEqual({ mac: "Power", sct: "", ind: "", dropped: "Capital Goods was taken off: not inside your other choice." });
    expect(linkFilters({ mac: "Industrials", sct: "", ind: "Power" }, tree).ind).toBe("");
    expect(linkFilters({ mac: "Industrials", sct: "Capital Goods", ind: "Aerospace & Defense" }, tree).dropped).toBeNull();
  });
  it("twelve columns (task #303: Short-term trend after Prism); filings as two chips then a dashed '+N more' with the rest in its hover text; sizes on the shared scale", async () => {
    await show("/discover/companies");
    expect([...document.querySelectorAll(".dsc-tb thead th .dsc-sb")].map((b) => b.textContent)).toEqual(["Company", "Sector · industry", "Theme · stage", "Filings, 90 days", "Prism",
      "Short-term trend", "Long-term trend", "3 months", "1 year", "Below 52-wk high", "Market cap", "Industry: Rotation · Pulse"]);
    const forge = [...document.querySelectorAll(".dsc-tb tbody tr")].find((r) => /Forge Co/.test(r.textContent || ""))!;
    const chips = [...forge.querySelectorAll(".dsc-ev")].map((e) => e.textContent);
    expect(chips).toEqual(["1 order", "1 capacity", "+2 more"]);
    expect(forge.querySelector(".dsc-ev.more")!.getAttribute("title")).toBe("1 rating, 4 management");
    expect(forge.querySelector(".dsc-sz")!.textContent).toBe("Micro");                       // ₹8,000 Cr
    const bs = [...document.querySelectorAll(".dsc-tb tbody tr")].find((r) => /Bharat Shield/.test(r.textContent || ""))!;
    expect(bs.querySelector(".dsc-sz")!.textContent).toBe("Mid");                             // ₹40,000 Cr (was "Mid" on the old bands only by chance: 30,000–1,00,000)
    expect(bs.querySelector(".dsc-clsc")!.textContent).toBe("Capital GoodsAerospace & Defense");
    expect(bs.querySelector(".dsc-cnc")!.textContent).toBe("↗Ahead and gainingBouncing backafter a crash");   // the Pulse page's cell: "after a crash" under the chip
  });
  it("the company panel: the three path chips, the quote with its page, every other passage tagged, the words, tone in words, eight reading tiles, the PDF buttons", async () => {
    await show("/discover/companies");
    fireEvent.click(screen.getByRole("button", { name: "Bharat Shield" }));
    await screen.findByText(/“We won radar orders/);
    const px = document.querySelector(".dsc-px")!;
    expect([...px.querySelectorAll(".dsc-path a")].map((a) => [a.textContent, a.getAttribute("href")])).toEqual([["Macro sectorIndustrials", "/discover/sectors/industrials"],
      ["SectorCapital Goods", "/discover/sectors/industrials/capital-goods"], ["IndustryAerospace & Defense", "/discover/industries/aerospace-and-defense"]]);
    expect(px.querySelector(".dsc-pmore summary")!.textContent).toMatch(/^1 more passage from this presentation/);
    expect(px.querySelector(".dsc-pmore li em")!.textContent).toBe("Does not name the theme · page 9");
    expect([...px.querySelectorAll(".dsc-words .dsc-chip")].map((x) => x.textContent)).toEqual(["Defence orders", "Radar"]);
    expect(px.textContent).toMatch(/Tone of the presentation.*Positive\+0\.40 on −1 to \+1/);
    expect(within(px as HTMLElement).getByRole("link", { name: "Read the presentation ↗" }).getAttribute("href")).toBe("https://nsearchives.nseindia.com/x.pdf");
    expect(within(px as HTMLElement).getByRole("link", { name: "Open the filing ↗" }).getAttribute("href")).toBe("https://nsearchives.nseindia.com/o.pdf");
    expect([...px.querySelectorAll(".dsc-read .dsc-dt > span")].map((x) => x.textContent!.replace(/i$/, "").trim())).toEqual(["FinLit Prism", "Against peers", "Short term", "Long term", "P/E", "ROCE", "1 month", "1 year"]);
    expect(px.textContent).toMatch(/Prices and scores of the 19 Nov 2026 close/);
    expect(px.textContent).toMatch(/2 order wins/);                                         // filings in words
    expect(px.querySelector(".dsc-ind")!.textContent).toMatch(/rank 13 of 37 · 2 wks/);
    expect(px.textContent).not.toMatch(/Page numbers show once/);                       // pages kept: no note
  });
  it("a presentation read before its pages were kept says why its passages carry no page (found live, 20 Nov)", async () => {
    st.pagesKept = false; await show("/discover/companies");
    fireEvent.click(screen.getByRole("button", { name: "Bharat Shield" }));
    await screen.findByText(/“We won radar orders/);
    expect(document.querySelector(".dsc-px")!.textContent).toMatch(/Page numbers show once FinLit reads this presentation again and keeps its pages\./);
  });
  it("§11 without Gold: Prism, Short term and Long term are locked tiles with 'See plans →'", async () => {
    st.plan = "silver"; await show("/discover/companies");
    fireEvent.click(screen.getByRole("button", { name: "Bharat Shield" }));
    await screen.findByText(/“We won radar orders/);
    const lk = [...document.querySelectorAll(".dsc-read .dsc-lk")];
    expect(lk.map((x) => x.querySelector("span")!.textContent!.replace(/i$/, "").trim())).toEqual(["FinLit Prism", "Short term", "Long term"]);
    lk.forEach((x) => { expect(x.textContent).toMatch(/Part of Gold/); expect(x.querySelector("a")!.textContent).toBe("See plans →"); });
  });
  it("§12 tone words and reading age", () => {
    expect([0.6, 0.2, 0, -0.2, -0.6, -0.61].map(toneWord)).toEqual(["Very positive", "Positive", "Neutral", "Negative", "Very negative", "Very negative"]);
    expect(toneWord(-0.19)).toBe("Neutral");
    expect(daysOld("2026-11-06", new Date(2026, 10, 19))).toBe(13);
  });
  it("§15 the seven questions answer on every Discover path", () => {
    for (const p of ["/discover", "/discover/themes/x", "/discover/sectors/a/b", "/discover/industries/power"]) expect(faqForPath(p)!.id).toBe("discover");
    expect(faqForPath("/discover")!.items.map((x) => x.q)).toEqual(["How is a company placed in a theme?", "What does the stage mean?", "What are macro sectors, sectors and industries?",
      "What do Sector Rotation and Sector Pulse show here?", "How are company sizes set?", "Why is there no quote for some companies?", "Does Discover tell me what to buy?"]);
  });
});

describe("#251: words and styles", () => {
  it("FinLit's own text never advises; text is 12 px or more", () => {
    const dir = resolve(process.cwd(), "src/discovery");
    for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
      const src = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n")
        .replace(/target="_blank"|\.target\b|side !== "sell"|sell-off/g, "");      // code (a link target, an event's target, a stored sale row) and the pack's "sell-off" (past prices), not advice
      expect(src, f).not.toMatch(/\b(buy|sell|hold|avoid|target|signals|multibagger|top pick)\b/i);
    }
    const css = readFileSync(join(dir, "discover.css"), "utf8");
    expect(css).not.toMatch(/font(-size)?:[^;]*\b(10|11)(\.\d+)?px/);
  });
});
