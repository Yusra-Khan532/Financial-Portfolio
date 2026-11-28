// @vitest-environment jsdom
// Task #303 (developer file 15, the whole Discover section, version 3): one tab bar for the six ways (same links and paths), the names card only on the
// landing views, the Columns chooser kept per member, the Short-term trend column, Ready-made views / Sort / Columns as dropdowns on the count line, What to
// check as a dropdown on a theme page, the latest filings three then "Show all", the briefs and record sections closed until opened and kept open while
// the page redraws, the map's six steps, and the record's dates in local time (they read one day early in India).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, BoardRow, Filing } from "../discovery/model";

const st = vi.hoisted(() => {
  process.env.TZ = "Asia/Kolkata";                    // the record's dates are checked in India's time zone (UTC+5:30), where the bug showed
  return { plan: "gold" };
});
const mk = (s: string, n: string, th: string, extra: Partial<BoardRow> = {}): BoardRow => ({ s, n, th, sec: [], st: "Operating", tone: 0.4, fc: 2, ev: {}, mac: "Industrials", sc: "Capital Goods",
  ind: "Aerospace & Defense", dd: "2026-11-05", pg: 30, grp: "aerospace-defense", ...extra });
const ROWS: BoardRow[] = [
  mk("BSHIELD", "Bharat Shield Ltd", "Defence & Aerospace", { ev: { order: 2 } }),
  mk("RADAR", "Radar Works Ltd", "Defence & Aerospace", { st: "Planned" }),
  mk("SOLARX", "Solar X Ltd", "Renewable Energy & Power", { mac: "Power", sc: "Power", ind: "Power", grp: null, ev: { capacity: 1 } }),
  mk("FORGE", "Forge Co Ltd", "Defence & Aerospace", { ind: "Electrical Equipment", grp: null, ev: { order: 1 } }),
];
const T = (name: string, n: number) => ({ name, label: name, short: name, broad: false, n, also: 0, news: { filings: 5, positive: 1, negative: 0 },
  verify: ["Look for order values and delivery dates.", "Check the share of defence revenue."], merged: [] as string[] });
const fil = (i: number): Filing => ({ s: "BSHIELD", n: "Bharat Shield Ltd", d: `2026-11-1${i}`, e: "order", el: "Order win", t: `Order number ${i}`, l: i === 1 ? "https://nsearchives.nseindia.com/o.pdf" : null });
const FEED = [1, 2, 3, 4, 5].map(fil);
const BOARD: Board = { updated: "2026-11-19T02:00:00", companies: 4, read: 4, days: 90, rows: ROWS, themes: [T("Defence & Aerospace", 3), T("Renewable Energy & Power", 1)],
  efil: { order: FEED }, thfil: { "Defence & Aerospace": FEED }, events: ["order"], eventsTracked: ["order"], caution: "A keyword mention by itself is not proof.", method: "How it is built." };
const UNI = { rows: [
  { symbol: "BSHIELD", name: "Bharat Shield Ltd", prism_final: 81, prism_label: "STRONG", prism_lt: "Uptrend", prism_st: "Uptrend", ret_3m: 5, market_cap: 40000 },
  { symbol: "RADAR", name: "Radar Works Ltd", prism_final: 52, prism_label: "AVERAGE", prism_lt: "Downtrend", prism_st: "Downtrend", ret_3m: -3, market_cap: 3000 },
  { symbol: "SOLARX", name: "Solar X Ltd", prism_final: null, prism_lt: null, prism_st: null, ret_3m: 1, market_cap: 120000 },
  { symbol: "FORGE", name: "Forge Co Ltd", prism_final: 70, prism_label: "HEALTHY", prism_lt: "Strong uptrend", prism_st: "Strong uptrend", ret_3m: 9, market_cap: 8000 }], as_of: "2026-11-19" };
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (p: string) => {
    if (p === "/api/discovery/board") return JSON.parse(JSON.stringify(BOARD));
    if (p === "/api/screener/universe") return JSON.parse(JSON.stringify(UNI));
    if (p.startsWith("/api/discovery/feed")) return { days: 90, total: 5, filings: FEED };
    if (p.startsWith("/api/discovery/company?symbol=")) return { symbol: "BSHIELD", theme: "Defence & Aerospace", words: ["Radar"],
      passages: [{ t: "We won radar orders.", kind: "sentence", names: true, page: 7 }, { t: "Plants run full.", kind: "sentence", names: false, page: 9 }],
      document: { title: "IP", date: "2026-11-05", pages: 30, link: null, pagesKept: true }, filings: [] };
    if (p === "/api/rotation") return { date: "2026-11-14", rows: [{ name: "Aerospace & Defense", slug: "aerospace-defense", kind: "industry", corner: "ahead_gaining", corner_name: "Ahead and gaining", rank: 3, ranked: 37 }] };
    throw Object.assign(new Error("not stood in: " + p), { status: 503 });
  }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()),
  useUI: () => ({ plan: st.plan, has: (t: string) => (t === "gold" ? st.plan === "gold" : true), toast: () => undefined, upgrade: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: 7 } }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { DiscoveryPage } from "./Discovery";
import { addMonthsLocal, fmtLocal, RECORD_FROM } from "../discovery/model";
import { heatStep } from "../discovery/Views";
import { colsKey } from "../discovery/ctx";

let loc = "";
function Where() { const l = useLocation(); loc = l.pathname + l.search; return null; }
const show = async (path = "/discover") => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes><Route path="/discover/*" element={<><DiscoveryPage /><Where /></>} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("navigation", { name: "Discover views" });
};
const tabs = () => screen.getByRole("navigation", { name: "Discover views" });
const ddBtn = (name: RegExp | string) => screen.getAllByRole("button", { name }).find((b) => b.classList.contains("dbx-ddb"))!;
const dd = (name: RegExp | string) => { fireEvent.click(ddBtn(name)); return screen.getByRole("dialog"); };
const heads = () => [...document.querySelectorAll(".dsc-tb thead th .dsc-sb")].map((b) => b.textContent);
const order = () => [...document.querySelectorAll(".dsc-tb tbody tr[data-dsc-row]")].map((r) => r.getAttribute("data-dsc-row"));
beforeEach(() => { st.plan = "gold"; try { localStorage.clear(); } catch { /* none */ } });
afterEach(() => { cleanup(); });

describe("#303: the frame", () => {
  it("one tab bar: five links on the same paths, the right tab marked on every route, a divider before Earnings calls (founder, 25 Nov 2026: Results filings is gone)", async () => {
    await show("/discover");
    const links = [...tabs().querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/discover", "/discover/changes", "/discover/sectors", "/discover/companies", "/discover/calls"]);
    expect(tabs().querySelector(".dw-tsep")).toBeTruthy();
    expect(tabs().closest(".dw-tabsbox")).toBeTruthy();
    expect(document.querySelectorAll(".dsc-ways, .dsc-way")).toHaveLength(0);            // the two "Explore Discover" strips are gone
    fireEvent.click(within(tabs()).getByRole("link", { name: /^All companies/ }));
    expect(loc).toBe("/discover/companies");
    expect(tabs().querySelector("[data-on]")!.textContent).toMatch(/^All companies/);
    const on = async (path: string, tab: RegExp) => { cleanup(); await show(path); expect(tabs().querySelector("[data-on]")!.textContent).toMatch(tab); };
    await on("/discover/themes/defence-and-aerospace", /^Themes/);
    expect(tabs().querySelector("[aria-current=page]")).toBeNull();                        // a theme page is inside Themes, not Themes itself
    await on("/discover/changes/order", /^What changed/);
    await on("/discover/industries/power", /^Sectors/);
    await on("/discover/sectors/industrials/capital-goods", /^Sectors/);
  });
  it("one line of figures with the i on 'companies placed' and the finder; --dw-top is set for the sticky bar; the names card only on landing views", async () => {
    await show("/discover");
    expect(document.querySelector(".dw-meta")!.textContent).toBe("4 companies placedi2 themesFilings of the last 90 days");
    expect(document.querySelector('.dw-meta .dsc-ib[data-i="placed"]')).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Find a company in Discover" })).toBeTruthy();
    expect((document.querySelector(".dsc-page") as HTMLElement).style.getPropertyValue("--dw-top")).toMatch(/^\d+px$/);
    expect(document.querySelector(".dsc-mine")).toBeTruthy();
    for (const p of ["/discover/changes", "/discover/sectors", "/discover/companies"]) { cleanup(); await show(p); expect(document.querySelector(".dsc-mine"), p).toBeTruthy(); }
    for (const p of ["/discover/themes/defence-and-aerospace", "/discover/changes/order", "/discover/industries/power"]) { cleanup(); await show(p); expect(document.querySelector(".dsc-mine"), p).toBeNull(); }
  });
  it("the finder opens the company's theme page with its row open", async () => {
    await show("/discover");
    fireEvent.change(screen.getByRole("combobox", { name: "Find a company in Discover" }), { target: { value: "forge" } });
    fireEvent.click(screen.getByRole("option", { name: /Forge Co/ }));
    expect(loc).toBe("/discover/themes/defence-and-aerospace?q=Forge+Co+Ltd");
    expect(screen.getByRole("button", { name: "Details for Forge Co Ltd" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("#303: the company table", () => {
  it("Short-term trend shows after Prism, in the five words, sorts as the long-term trend does, and has its i", async () => {
    await show("/discover/companies");
    expect(heads().slice(4, 7)).toEqual(["Prism", "Short term", "Long term"]);             // developer file 53: short names under "FinLit's reading"
    const col = heads().indexOf("Short term");
    const cell = (s: string) => document.querySelector(`tr[data-dsc-row="${s}"]`)!.children[col].textContent;
    expect(cell("FORGE")).toBe("Strong uptrend"); expect(cell("RADAR")).toBe("Downtrend"); expect(cell("SOLARX")).toBe("Not rated");
    fireEvent.click(document.querySelectorAll<HTMLButtonElement>(".dsc-tb thead .dsc-sb")[col]);
    expect(loc).toBe("/discover/companies?sort=st");
    expect(order()).toEqual(["FORGE", "BSHIELD", "RADAR", "SOLARX"]);                      // not rated last
    fireEvent.click(document.querySelectorAll<HTMLButtonElement>(".dsc-tb thead .dsc-sb")[col]);
    expect(order()).toEqual(["RADAR", "BSHIELD", "FORGE", "SOLARX"]);
    const ib = document.querySelector<HTMLButtonElement>('.dsc-tb thead .dsc-ib[data-i="st"]')!;
    fireEvent.click(ib);
    expect(screen.getByRole("note").textContent).toMatch(/^Short-term trend of the price over the recent weeks \(about 5 to 20 trading sessions\), from FinLit’s technical score, in the same five words as the long-term trend/);
  });
  it("without Gold the short-term trend reads 'Gold', never 'Not rated'", async () => {
    st.plan = "silver";
    UNI.rows.forEach((r) => { (r as { prism_st: string | null }).prism_st = null; });
    try {
      await show("/discover/companies");
      const col = heads().indexOf("Short term");
      expect(document.querySelector('tr[data-dsc-row="FORGE"]')!.children[col].textContent).toBe("Gold");
    } finally { UNI.rows[0].prism_st = "Uptrend"; UNI.rows[1].prism_st = "Downtrend"; UNI.rows[3].prism_st = "Strong uptrend"; }
  });
  it("the Sort dropdown sets the sort with its own direction", async () => {
    await show("/discover/companies");
    const d = dd(/^FinLit Prism/);
    expect(within(d).getAllByRole("option").map((o) => o.textContent)).toEqual(["FinLit Prism", "Most filings, 90 days", "Short-term trend", "Long-term trend", "3-month move",
      "1-year move", "Nearest its 52-week high", "Largest company", "Sector Rotation box", "Company A–Z"]);
    fireEvent.click(within(d).getByRole("option", { name: "Company A–Z" }));
    expect(loc).toBe("/discover/companies?sort=co");
    expect(order()).toEqual(["BSHIELD", "FORGE", "RADAR", "SOLARX"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("the Columns chooser: Company always on; the choice is kept for this member and sticks across lists", async () => {
    await show("/discover/companies");
    const d = dd(/^Columns/);
    expect(within(d).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Sector · industry", "Theme · stage", "Filings, 90 days", "Prism",
      "Short-term trend", "Long-term trend", "3 months", "1 year", "Below 52-wk high", "Market cap", "Industry: Rotation · Pulse"]);
    expect(d.textContent).toMatch(/Company is always shown\. Your choice is kept for every Discover list\./);
    fireEvent.click(within(d).getByRole("checkbox", { name: "Market cap" }));
    fireEvent.click(within(d).getByRole("checkbox", { name: "Filings, 90 days" }));
    expect(heads()).not.toContain("Market cap"); expect(heads()).not.toContain("Filings, 90 days"); expect(heads()[0]).toBe("Company");
    expect(localStorage.getItem(colsKey(7))!.split(",")).not.toContain("mc");
    expect(ddBtn(/^Columns/).querySelector(".dbx-ddv")!.textContent).toBe("10");           // Company and nine of the eleven
    cleanup(); await show("/discover/themes/defence-and-aerospace");                         // another list, a new visit: the choice stays
    expect(heads()).not.toContain("Market cap"); expect(heads()).toContain("Short term");
    fireEvent.click(within(dd(/^Columns/)).getByRole("checkbox", { name: "Market cap" }));
    expect(heads()).toContain("Market cap");
  });
  it("Ready-made views: a dropdown on the count line with a switch and count per view, the i text, a badge, chips, Clear these and Show N", async () => {
    await show("/discover/companies");
    const d = dd(/^Ready-made views/);
    expect(within(d).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["New order or capacity filing3", "Long-term uptrend2",
      "Leader in its peer groupNot published yet", "Within 10% of its 52-week high0", "Industry ahead and gaining2", "Prism strong or healthy2"]);
    expect(d.textContent).toMatch(/Ready-made views are filters you can switch on together\./);
    fireEvent.click(within(d).getByRole("checkbox", { name: /^New order or capacity filing/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: /^Industry ahead and gaining/ }));
    expect(loc).toBe("/discover/companies?v=fresh%2Cahead");
    expect(ddBtn(/^Ready-made views/).querySelector(".dbx-badge")!.textContent).toBe("2");
    expect([...document.querySelectorAll(".dbx-chip")].map((c) => c.textContent)).toEqual(["New order or capacity filing", "Industry ahead and gaining"]);
    const show1 = within(screen.getByRole("dialog")).getByRole("button", { name: "Show 1 company" });   // BSHIELD: an order and its industry ahead and gaining
    fireEvent.click(show1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".dsc-cnt")!.textContent).toBe("1 of 4 companies");
    fireEvent.click(within(dd(/^Ready-made views/)).getByRole("button", { name: "Clear these" }));
    expect(loc).toBe("/discover/companies");
  });
});

describe("#303: theme and event pages", () => {
  it("What to check is a dropdown between 'Companies ↓' and 'Follow this theme', closed until opened, with the i note and the caution", async () => {
    await show("/discover/themes/defence-and-aerospace");
    const bar = document.querySelector(".dsc-dha")!;
    expect([...bar.querySelectorAll(":scope > button, :scope > .dbx-dd > button")].map((b) => b.textContent!.trim())).toEqual(["Companies ↓", "What to check", "☆ Follow this theme"]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("heading", { name: /^What to check/ })).toBeNull();          // no longer a panel
    const d = dd(/^What to check/);
    expect(within(d).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Look for order values and delivery dates.", "Check the share of defence revenue."]);
    expect(d.textContent).toMatch(/Questions to answer from the company’s own documents before taking a theme mention at face value\./);
    expect(d.textContent).toMatch(/A theme word or a filing alone is not proof of real business\./);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(ddBtn(/^What to check/));
  });
  it("latest filings run full width: three lines (date · kind · company and headline · open), then 'Show all N'; the same on an event page", async () => {
    for (const [p, h] of [["/discover/themes/defence-and-aerospace", "Latest filings in this theme"], ["/discover/changes/order", "Latest of these filings"]]) {
      cleanup(); await show(p);
      const box = screen.getByRole("heading", { name: h }).closest("section")!;
      expect(box.className).toMatch(/dw-feed/);
      const lis = box.querySelectorAll(":scope > ul.dw-fl > li");
      expect(lis).toHaveLength(3);
      expect([...lis[0].children].map((c) => c.className)).toEqual(["dw-fd", "dw-fe", "dw-ft", ""]);
      expect(lis[0].querySelector(".dw-ft")!.textContent).toBe("Bharat Shield Order number 1");
      expect(within(lis[0] as HTMLElement).getByRole("link", { name: /Open the filing/ }).getAttribute("href")).toBe("https://nsearchives.nseindia.com/o.pdf");
      expect(box.querySelector("details.dw-fmore summary")!.textContent).toMatch(/^Show all 5/);
      expect(box.querySelector(".dw-fn")!.textContent).toBe("5 newest");
    }
  });
  it("an open 'Show all' stays open while the list below is filtered", async () => {
    await show("/discover/themes/defence-and-aerospace");
    const det = document.querySelector<HTMLDetailsElement>("details.dw-fmore")!;
    det.open = true;
    fireEvent.click(within(dd(/^Stage/)).getByRole("option", { name: /^Operating/ }));
    expect(loc).toBe("/discover/themes/defence-and-aerospace?stage=Operating");
    expect(document.querySelector<HTMLDetailsElement>("details.dw-fmore")!.open).toBe(true);
  });
});

describe("#303: What changed", () => {
  it("From company briefs and the record are dropdowns, closed until opened; they stay open while the page redraws", async () => {
    await show("/discover/changes");
    const acc = [...document.querySelectorAll<HTMLDetailsElement>("details.dw-acc")];
    expect(acc.map((d) => d.querySelector("summary")!.textContent)).toEqual([
      "From company briefsiFrom briefs2 groups · no brief published yet▾",
      "How each group has done since companies joined itiStarts on launchFirst figures from 19 Dec 2026▾"]);
    acc.forEach((d) => expect(d.open).toBe(false));
    acc.forEach((d) => { d.open = true; });
    fireEvent.click(screen.getByRole("tab", { name: /Watchlist/ }));                     // the page redraws
    fireEvent.click(screen.getByRole("tab", { name: /Portfolio/ }));
    expect([...document.querySelectorAll<HTMLDetailsElement>("details.dw-acc")].map((d) => d.open)).toEqual([true, true]);
    expect(acc[0].querySelectorAll(".dsc-cd.dashed")).toHaveLength(2);                   // both brief cards are still inside
  });
  it("the record's dates read in local time: 19 Nov + 1 month is 19 Dec in India (it read 18 Dec)", async () => {
    expect(new Date().getTimezoneOffset()).toBe(-330);                                    // the test runs in IST
    const old = (() => { const d = new Date(RECORD_FROM + "T00:00:00"); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); })();
    expect(old).toBe("2026-12-18");                                                       // the old way, one day early here
    expect(fmtLocal(addMonthsLocal(RECORD_FROM, 1))).toBe("19 Dec 2026");
    expect([3, 6, 12].map((m) => fmtLocal(addMonthsLocal(RECORD_FROM, m)))).toEqual(["19 Feb 2027", "19 May 2027", "19 Nov 2027"]);
    await show("/discover/changes");
    // developer file 53: the four dates are one row (they were the same in each of the six groups' rows)
    expect(document.querySelectorAll(".dsc-rec tbody tr")).toHaveLength(1);
    const row = document.querySelector(".dsc-rec tbody tr")!;
    expect(row.querySelector("th")!.textContent).toBe("First shown on");
    expect([...row.querySelectorAll("td")].map((t) => t.textContent)).toEqual(["19 Dec 2026", "19 Feb 2027", "19 May 2027", "19 Nov 2027"]);
  });
  it("the record table's and the stage table's first column are not shaded or pinned by the site-wide td:first-child rule", () => {
    const css = readFileSync(join(__dirname, "..", "discovery", "discover.css"), "utf8");
    expect(css).toMatch(/\.dsc-stg td:first-child, \.dsc-rec td:first-child \{ background: none; position: static; \}/);
  });
});

describe("#303: the map", () => {
  it("six steps by count (1–2, 3–5, 6–10, 11–25, 26–60, more) and by % (below 5 … above 50)", () => {
    expect([1, 2, 3, 5, 6, 10, 11, 25, 26, 60, 61, 300].map((v) => heatStep(v, "n"))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect([1, 5, 6, 10, 11, 20, 21, 35, 36, 50, 51, 100].map((v) => heatStep(v, "p"))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
  it("each number carries its step, a key sits by the switch, and the text is dark on the light steps and light on the two darkest (dark on the bright steps in dark mode)", async () => {
    await show("/discover/sectors");
    const cells = [...document.querySelectorAll<HTMLButtonElement>(".dsc-map .dw-hc")];
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((b) => { expect(b.getAttribute("data-l")).toBe(String(heatStep(Number(b.textContent), "n"))); expect(b.getAttribute("style")).toBeNull(); });
    expect([...document.querySelectorAll(".dw-heatk i")].map((i) => i.getAttribute("data-l"))).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(document.querySelector(".dw-heatk")!.textContent).toBe("FewerMore");
    fireEvent.click(screen.getByRole("button", { name: /^% of the macro sector/ }));
    [...document.querySelectorAll<HTMLButtonElement>(".dsc-map .dw-hc")].forEach((b) => expect(b.getAttribute("data-l")).toBe(String(heatStep(parseInt(b.textContent!, 10), "p"))));
    const css = readFileSync(join(__dirname, "..", "discovery", "discover.css"), "utf8");
    expect(css).toMatch(/\.dsc-map td \.dw-hc \{[^}]*color: var\(--text\);/);              // steps 1–3: the page's text colour
    expect(css).toMatch(/\.dsc-map td \.dw-hc\[data-l="4"\] \{ color: var\(--dw-on4\); \}/);
    expect(css).toMatch(/\.dsc-map td \.dw-hc\[data-l="5"\], \.dsc-map td \.dw-hc\[data-l="6"\] \{ color: var\(--dw-heat-on\); \}/);
    expect(css).toMatch(/\.dsc-page \{ --dw-heat: var\(--dsc-teal\); --dw-heat-on: #fff; --dw-on4: var\(--text\); \}/);   // light: white on the two darkest
    expect(css).toMatch(/:root\[data-theme="dark"\] \.dsc-page \{ --dw-heat-on: #04181b; --dw-on4: #04181b; \}/);       // dark: dark text on the bright teal
    expect(css).toMatch(/font: 600 var\(--fs-13\)\/1 var\(--sans\)/);                                // 13 px semibold numbers
    for (let l = 1; l <= 6; l++) expect(css).toContain(`.dw-hc[data-l="${l}"], .dw-heatk i[data-l="${l}"]`);
  });
});
