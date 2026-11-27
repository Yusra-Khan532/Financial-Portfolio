// @vitest-environment jsdom
// Task #296 (the 21 Nov Discover filters pack): the calls and results bucket pages get the filter card every Discover list has (views, search, Only my
// names, About the company without Stage, Where it sits · NSE linked) and a row of their own (Keyword with counts, Keywords named, Tone of its wording,
// Filed); chips with Clear all, "N of M companies", Sort by, pages instead of "Show 25 more"; the keyword buttons set the Keyword filter and the keyword is
// marked on each card; each card names where the company sits; the choices live in the address. The header counts come from the bucket's own answer.
// On theme and event pages the "Latest …" panel follows the table's filters. Pure rules: discovery/bucket.ts.
// Task #303: the same filters, address keys and counts in the dropdown toolbar of developer file 13 (Keyword · Sector · Industry · Size · More filters with
// the quick views and the call's own filters · My names), the chips, and Sort as a dropdown; each check keeps its intent.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Board, SrcCompany } from "../discovery/model";
import { bucketRows, filterBucket, freshB, passBucket, sortBucket, feedFor } from "../discovery/bucket";
import { freshT } from "../discovery/model";

const GUIDE = "Call: Management Guidance & Outlook";
const KW = ["Forward guidance", "Strong pipeline", "Guidance cut / lowered outlook"];
const co = (symbol: string, company: string, keywords: string[], extra: Partial<SrcCompany> = {}): SrcCompany => ({ symbol, company, score: 5, distinct: keywords.length, mentions: keywords.length * 2,
  keywords, evidence: ["We expect 20% growth in FY27."], verify: [], document: { title: "Transcript", date: "2026-11-18", link: null, pages: 3 }, tone: { score: 0.4, label: "Positive" }, ...extra });
const LIST: SrcCompany[] = [
  co("SUZLON", "Suzlon Energy Ltd", ["Forward guidance", "Strong pipeline"]),
  co("INFY", "Infosys Ltd", ["Forward guidance", "Guidance cut / lowered outlook", "Strong pipeline"], { evidence: [], tone: { score: 0.1, label: "Mixed" }, document: { title: "T", date: "2026-08-01", link: null, pages: 2 } }),
  co("HDFCBANK", "HDFC Bank Ltd", ["Forward guidance"]),
];
const UNI = [
  { symbol: "SUZLON", cls_macro: "Industrials", cls_sector: "Capital Goods", cls_industry: "Electrical Equipment", market_cap: 60000, prism_final: 72, prism_label: "HEALTHY", prism_lt: "Uptrend" },
  { symbol: "INFY", cls_macro: "Information Technology", cls_sector: "Information Technology", cls_industry: "IT - Software", market_cap: 600000, prism_final: 61, prism_label: "AVERAGE", prism_lt: "Sideways" },
  { symbol: "HDFCBANK", cls_macro: "Financial Services", cls_sector: "Financial Services", cls_industry: "Banks", market_cap: 1200000, prism_final: 80, prism_label: "STRONG", prism_lt: "Uptrend" },
];
const ROT = { date: "2026-11-14", rows: [{ slug: "capital-goods", name: "Capital Goods", industries: ["Electrical Equipment"], corner: "ahead_gaining", corner_name: "Ahead and gaining" }] };
const bucket = (companies: number, withEvidence: number, list?: SrcCompany[]) => ({ name: GUIDE, label: "Management Guidance & Outlook", keywords: KW, companies, withEvidence,
  verify: ["Check whether guidance is numeric and time-bound."], reason: null, ...(list ? { list } : { preview: ["Suzlon Energy Ltd"] }) });
const CALLS = (b: unknown) => ({ source: "calls", label: "Earnings calls", document: "call transcript", days: 400, read: 3, statuses: {}, companies: 3, updated: "2026-11-21T11:00:00",
  newest: "2026-11-18", caution: "A keyword mention by itself is not proof.", method: "m", buckets: [b] });
const BOARD: Board = { updated: "2026-11-19T02:00:00", companies: 2, read: 2, days: 90, events: ["order"], eventsTracked: ["order"], caution: "c", method: "m",
  rows: [
    { s: "ACME", n: "Acme Ltd", th: "Solar", sec: [], st: "Operating", tone: 0.3, fc: 2, ev: { order: 2 }, mac: "Industrials", sc: "Capital Goods", ind: "Electrical Equipment", dd: "2026-11-01", pg: 20, grp: null },
    { s: "BETA", n: "Beta Ltd", th: "Solar", sec: [], st: "Planned", tone: 0.1, fc: 1, ev: { order: 1 }, mac: "Energy", sc: "Oil Gas", ind: "Refineries", dd: "2026-11-01", pg: 10, grp: null },
  ],
  themes: [{ name: "Solar", label: "Solar", short: "Solar", broad: false, n: 2, also: 0, news: { filings: 3, positive: 1, negative: 0 }, verify: [], merged: [] }],
  efil: { order: [{ s: "ACME", n: "Acme Ltd", d: "2026-11-10", e: "order", el: "Order", t: "Order from NTPC", l: null }, { s: "BETA", n: "Beta Ltd", d: "2026-11-09", e: "order", el: "Order", t: "Order from IOC", l: null }] },
  thfil: { Solar: [{ s: "BETA", n: "Beta Ltd", d: "2026-11-09", e: "order", el: "Order", t: "Order from IOC", l: null }] } };

vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (p: string) => {
    if (p === "/api/discovery/board") return JSON.parse(JSON.stringify(BOARD));
    if (p === "/api/discovery/sources?source=calls") return CALLS(bucket(2, 1));                       // the landing summary: built earlier, older counts
    if (p === `/api/discovery/sources?source=calls&bucket=${encodeURIComponent(GUIDE)}`) return CALLS(bucket(3, 2, JSON.parse(JSON.stringify(LIST))));
    if (p === "/api/screener/universe") return { rows: UNI, as_of: "2026-11-20" };
    if (p === "/api/rotation") return ROT;
    if (p === "/api/discovery/feed?event=order") return { days: 90, total: 3, filings: [...BOARD.efil.order, { s: "ACME", n: "Acme Ltd", d: "2026-09-01", e: "order", el: "Order", t: "Order from BHEL", l: null }] };
    if (p === "/api/discovery/feed?theme=Solar") return { days: 90, total: 1, filings: BOARD.thfil!.Solar };
    throw Object.assign(new Error("not stood in: " + p), { status: 503 });
  }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()),
  useUI: () => ({ plan: "gold", has: () => true, toast: () => undefined, upgrade: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { DiscoveryPage } from "./Discovery";

let loc = "";
function Where() { const l = useLocation(); loc = l.pathname + l.search; return null; }
const show = async (path: string) => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes><Route path="/discover/*" element={<><DiscoveryPage /><Where /></>} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("navigation", { name: "Discover views" });
};
const cards = () => [...document.querySelectorAll("[data-src-co]")].map((e) => e.getAttribute("data-src-co"));
const ready = () => screen.findAllByRole("row", { name: (_n, el) => el.hasAttribute("data-src-co") });
const ddBtn = (name: RegExp | string) => screen.getAllByRole("button", { name }).find((b) => b.classList.contains("dbx-ddb"))!;
const dd = (name: RegExp | string) => { fireEvent.click(ddBtn(name)); return screen.getByRole("dialog"); };
const pickOpt = (btn: RegExp | string, opt: RegExp | string) => { const d = dd(btn); fireEvent.click(within(d).getByRole("option", { name: opt })); };
const esc = () => fireEvent.keyDown(document, { key: "Escape" });
const PAGE = "/discover/calls/management-guidance-and-outlook";
afterEach(() => { cleanup(); });

describe("#296: filters on the calls and results bucket pages", () => {
  it("the header counts come from the bucket's own answer, so they match the list", async () => {
    await show(PAGE);
    await ready();
    expect([...document.querySelectorAll(".dbx-stats > span")].map((x) => x.textContent)).toEqual(["3 companies", "2 quote a figure", "3 keywords", "Transcripts filed 1 Aug 2026 – 18 Nov 2026"]);
    expect(document.querySelector(".dsc-cnt")!.textContent).toBe("3 companies");
  });

  it("the toolbar: the quick views (one of the bucket's own), the call's own filters, About the company without Stage, Sector and Industry; pages, no Show more", async () => {
    await show(PAGE);
    await ready();
    expect([...screen.getByRole("group", { name: "Filters" }).querySelectorAll(".dbx-ddl")].map((b) => b.textContent)).toEqual(["Keyword", "Sector", "Industry", "Size", "More filters", "My names"]);
    expect(within(dd(/^Keyword/)).getAllByRole("option").map((o) => o.textContent)).toEqual(["Any keyword3", "Forward guidance3", "Strong pipeline2", "Guidance cut / lowered outlook1"]);
    esc();
    const more = dd(/^More filters/);
    expect(within(more).getAllByRole("checkbox").map((b) => b.closest("label")!.textContent)).toEqual(["Quotes a sentence with a figure2", "Long-term uptrend2", "Industry ahead and gaining1", "Prism strong or healthy2"]);
    expect([...more.querySelectorAll("h4")].map((h) => h.textContent)).toEqual(["Quick views", "In the call", "About the company"]);
    expect(within(more).getByRole("radiogroup", { name: "Keywords named" })).toBeTruthy();
    expect(within(more).getByRole("radiogroup", { name: "Filed" })).toBeTruthy();
    expect([...(within(more).getByRole("combobox", { name: "Tone of its wording" }) as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Any tone", "Positive (2)", "Mixed (1)"]);
    for (const n of ["Long-term trend", "FinLit Prism", "Sector Rotation"]) expect(within(more).getByRole("combobox", { name: n })).toBeTruthy();
    esc();
    expect(screen.queryByRole("button", { name: /^Stage/ })).toBeNull();
    expect(ddBtn(/^Best match/)).toBeTruthy();                                             // Sort, as a dropdown
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /more of/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Next →" })).toBeTruthy();
  });

  it("each row says where the company sits; the Keyword filter narrows the list, marks the keyword, and the choice is in the address", async () => {
    await show(PAGE);
    await ready();
    expect(document.querySelector('[data-src-co="SUZLON"] .dbx-sub')!.textContent).toBe("SUZLON · Electrical Equipment");
    fireEvent.click(screen.getByRole("button", { name: "Show details for Suzlon Energy" }));
    expect([...document.querySelectorAll(".dbx-facts dd")].map((d) => d.textContent)).toEqual(["Capital Goods › Electrical Equipment", "Mid", "Uptrend", "Healthy · 72"]);
    pickOpt(/^Keyword/, /^Strong pipeline/);
    expect(cards()).toEqual(["SUZLON", "INFY"]);
    expect(loc).toBe(PAGE + "?kw=Strong+pipeline");
    expect(document.querySelector('[data-src-co="SUZLON"] .dbx-kt .hit')!.textContent).toBe("Strong pipeline");
    expect(document.querySelector(".dbx-kw.hit")!.textContent).toBe("Strong pipeline");     // marked in the open row's keywords too
    expect(document.querySelector(".dsc-cnt")!.textContent).toBe("2 of 3 companies");
    expect(within(screen.getByRole("group", { name: "Filters on" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Keyword: Strong pipeline", "Clear all"]);
    pickOpt(/^Keyword/, /^Any keyword/);                                                     // "Any keyword" clears it
    expect(cards()).toHaveLength(3);
  });

  it("sector, industry and the call's own filters narrow the list; a new macro sector takes the sector off; Clear all", async () => {
    await show(PAGE + "?mac=Industrials&sct=Capital+Goods&ind=Electrical+Equipment&kw=Strong+pipeline");
    await ready();
    expect(cards()).toEqual(["SUZLON"]);
    expect(ddBtn(/^Sector/).querySelector(".dbx-ddv")!.textContent).toBe("Capital Goods");
    pickOpt(/^Sector/, /^All of Financial Services/);
    expect(loc).toBe(PAGE + "?mac=Financial+Services&kw=Strong+pipeline");
    expect(cards()).toEqual([]);
    expect(document.body.textContent).toMatch(/No company matches these filters\./);
    fireEvent.click(within(screen.getByRole("group", { name: "Filters on" })).getByRole("button", { name: "Clear all" }));
    expect(cards()).toHaveLength(3);
    expect(loc).toBe(PAGE);
    fireEvent.change(within(dd(/^More filters/)).getByRole("combobox", { name: "Tone of its wording" }), { target: { value: "Mixed" } });
    expect(cards()).toEqual(["INFY"]);
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Tone of its wording" }), { target: { value: "" } });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Keywords named" })).getByRole("radio", { name: /^3\+/ }));
    expect(cards()).toEqual(["INFY"]);
  });

  it("Sort: newest filing first and company name; the quick views", async () => {
    await show(PAGE + "?sort=co");
    await ready();
    expect(cards()).toEqual(["HDFCBANK", "INFY", "SUZLON"]);
    pickOpt(/^Company name/, "Largest market value");
    expect(cards()).toEqual(["HDFCBANK", "INFY", "SUZLON"]);
    pickOpt(/^Largest market value/, "Best match");
    const more = dd(/^More filters/);
    fireEvent.click(within(more).getByRole("checkbox", { name: /^Quotes a sentence with a figure/ }));
    expect(cards()).toEqual(["SUZLON", "HDFCBANK"]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("checkbox", { name: /^Industry ahead and gaining/ }));
    expect(cards()).toEqual(["SUZLON"]);
  });
});

describe("#296: the Latest panels of theme and event pages follow the filters", () => {
  it("an event page: only the filings of companies in the filters, and a line when none is left", async () => {
    await show("/discover/changes/order");
    const panel = () => screen.getByRole("heading", { name: "Latest of these filings" }).closest("section")!;
    expect(panel().textContent).toMatch(/Order from NTPC/);
    expect(panel().textContent).toMatch(/Order from IOC/);
    pickOpt(/^Sector/, /^All of Industrials/);
    expect(panel().textContent).toMatch(/Order from NTPC/);
    expect(panel().textContent).not.toMatch(/Order from IOC/);
    expect(await within(panel()).findByText(/Order from BHEL/)).toBeTruthy();      // the 90 days' feed, read once a filter is on, beyond the board's newest 12
  });
  it("a theme page: a filter that leaves none of the feed's companies says so", async () => {
    await show("/discover/themes/solar?mac=Industrials");
    const panel = screen.getByRole("heading", { name: "Latest filings in this theme" }).closest("section")!;
    expect(panel.textContent).toMatch(/No filing from a company in your filters\./);
  });
});

describe("#296: the pure rules", () => {
  const uni = new Map(UNI.map((u) => [u.symbol, u as never]));
  const rows = bucketRows(LIST, uni, ROT.rows as never, new Date("2026-11-21T10:00:00"));
  it("joins sector, size, Prism, the Rotation box and the age of the filing", () => {
    expect(rows.map((r) => [r.s, r.sct, r.sz, r.pl, r.pr, r.cc, r.age])).toEqual([
      ["SUZLON", "Capital Goods", "mid", "Healthy", 72, "ahead_gaining", 3], ["INFY", "Information Technology", "large", "Average", 61, null, 112], ["HDFCBANK", "Financial Services", "large", "Strong", 80, null, 3]]);
  });
  it("the call's filters: keyword, keywords named, tone and filed", () => {
    const f = (p: Partial<ReturnType<typeof freshB>>) => rows.filter((r) => passBucket(r, { ...freshB(), ...p })).map((r) => r.s);
    expect(f({ kw: "Strong pipeline" })).toEqual(["SUZLON", "INFY"]);
    expect(f({ named: "2" })).toEqual(["SUZLON", "INFY"]);
    expect(f({ tone: "Mixed" })).toEqual(["INFY"]);
    expect(f({ filed: "d7" })).toEqual(["SUZLON", "HDFCBANK"]);
    expect(f({ filed: "old" })).toEqual(["INFY"]);
    expect(filterBucket(rows, { ...freshT("best"), mac: "Industrials" }, freshB(), () => false).map((r) => r.s)).toEqual(["SUZLON"]);
    expect(sortBucket(rows, "named").map((r) => r.s)).toEqual(["INFY", "SUZLON", "HDFCBANK"]);
    expect(sortBucket(rows, "newest").map((r) => r.s)).toEqual(["SUZLON", "HDFCBANK", "INFY"]);
  });
  it("a feed is cut only when a filter is on", () => {
    const feed = [{ s: "A" }, { s: "B" }];
    expect(feedFor(feed, null)).toEqual(feed);
    expect(feedFor(feed, new Set(["B"]))).toEqual([{ s: "B" }]);
  });
  it("task #303: the one tab bar replaces the Explore Discover boxes; it sticks under the site header and scrolls sideways when it does not fit", () => {
    const css = readFileSync(join(__dirname, "..", "discovery", "discover.css"), "utf8");
    expect(css).toMatch(/\.dw-tabsbox \{ position: sticky; top: var\(--dw-top, 64px\);/);
    expect(css).toMatch(/\.dw-tabs \{[^}]*overflow-x: auto;/);
    expect(css).not.toMatch(/\.dsc-ways?\b/);                                              // the old strips are gone
  });
});
