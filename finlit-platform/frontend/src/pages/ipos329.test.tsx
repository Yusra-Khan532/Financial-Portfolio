// @vitest-environment jsdom
// Task #329 (developer file 29, 23 Nov 2026): IPOs, one page in place of the IPO calendar and All IPOs. Rules 1 to 7 of the pack, one by one: the
// address (/ipo?view=now|all, the tab changes it without a reload), /ipo/all redirecting with its parameters, which view opens, "All N since 2020 →"
// opening the second view with Status = Listed, each view keeping its state, the one side-menu entry, Download CSV in the All view only; plus the
// restored links ("See the N →", "See the breakdown by GMP range →", "How close GMP came ↓") and the Listed table's sorting.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ipo } from "../lib/ipo";
import type { IpoRow } from "../lib/ipoHistory";

const st = vi.hoisted(() => ({ data: [] as unknown[], gmp: undefined as unknown }));
const HIST = vi.hoisted(() => ({ items: [] as unknown[], asOf: "2026-10-20", updatedAt: null, note: "",
  sources: { issue: { name: "InvestorGain", url: "https://www.investorgain.com/", what: "" }, nse: { name: "NSE", url: null, what: "" }, prices: { name: "NSE", url: null, what: "" } } }));
vi.mock("../lib/deals", async (orig) => ({ ...(await orig<typeof import("../lib/deals")>()), useIpoDeals: () => ({ data: undefined, isLoading: true, isError: false }) }));
vi.mock("../lib/ipo", async (orig) => ({ ...(await orig<typeof import("../lib/ipo")>()), useIpos: () => ({ data: st.data, isLoading: false, isError: false }),
  useGmpRecord: () => ({ data: st.gmp, isLoading: false, isError: false }) }));
vi.mock("../lib/ipoHistory", async (orig) => ({ ...(await orig<typeof import("../lib/ipoHistory")>()), useIpoHistory: () => ({ data: HIST, isLoading: false, isError: false }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/ChartHelp", () => ({ ChartHelp: () => null }));
vi.mock("../components/CalendarSync", () => ({ CalendarSync: () => null }));
import { IpoPage } from "./Ipo";
import { IpoAllRedirect } from "./IpoHistory";
import { sortListed } from "../lib/ipoCalendar";
import { sortRows } from "../lib/ipoHistory";
import { SECTIONS } from "../lib/nav";

const mk = (o: Partial<Ipo>): Ipo => ({ id: 1, name: "Acme Ltd", symbol: null, kind: "mainboard", sector: null, status: "upcoming", openDate: "2026-11-03", closeDate: "2026-11-05", listingDate: null,
  priceLow: null, priceHigh: 100, lotSize: null, issueSizeCr: null, listingPrice: null, note: null, link: null, ...o });
const row = (o: Partial<IpoRow>): IpoRow => ({ id: 1, name: "A Ltd", symbol: "A", nse: "A", bse: null, board: "mainboard", sector: "Chemicals", exchanges: ["NSE"], kind: "Book built", status: "listed",
  openDate: "2026-10-01", closeDate: "2026-10-03", listingDate: "2026-10-08", priceLow: 95, priceHigh: 100, issuePrice: 100, lotSize: 100, minAmount: 10000, issueSizeCr: 100, freshCr: 100, ofsCr: null,
  subscription: 10, subQib: null, subNii: null, subRetail: null, gmp: 5, gmpPct: 5, listingPrice: 110, listingPct: 10, listingClose: null, listingClosePct: null, lastClose: null, lastDay: null,
  sinceIpoPct: null, adjustedBy: null, companyPage: false, verdict: "band", ...o } as IpoRow);
const pt = (name: string, gmpPct: number, listingPct: number) => ({ id: name.length, name, symbol: null, board: "mainboard", issuePrice: 100, gmp: gmpPct, gmpPct, listingPrice: 100 + listingPct,
  listingPct, listingDate: "2026-10-08", subscription: 10, issueSizeCr: 200, verdict: "band", url: "https://www.investorgain.com/gmp/" + name + "/1/" });
const GMP = { board: "all", source: { name: "InvestorGain", url: "https://www.investorgain.com/" }, updatedAt: null, note: "", items: [pt("alpha", 4, 6), pt("beta", 30, 20), pt("gamma", 30, 45)],
  summary: { count: 3, beat: 1, short: 1, band: 1, bandPts: 5, directionRight: 2, medianGap: 2, fit: null } };

const listedA = mk({ id: 3, name: "Alpha Listed Ltd", status: "listed", openDate: "2026-10-01", closeDate: "2026-10-03", listingDate: "2026-10-08", priceHigh: 100, listingPrice: 120, issueSizeCr: 50,
  details: { subscription: { overall: 3 }, gmp: { rupees: 4, pct: 4, source: "InvestorGain" } } });
const listedB = mk({ id: 4, name: "Beta Listed Ltd", status: "listed", openDate: "2026-10-05", closeDate: "2026-10-07", listingDate: "2026-10-12", priceHigh: 200, listingPrice: 190, issueSizeCr: null,
  details: { subscription: { overall: 30 } } });
const open = mk({ id: 2, name: "Open Co", status: "open", openDate: "2026-10-19", closeDate: "2026-10-22", details: { gmp: { rupees: 30, pct: 30, source: "InvestorGain" } } });

const Where = () => { const l = useLocation(); return <output data-testid="at">{l.pathname + l.search}</output>; };
const page = (url = "/ipo") => render(<MemoryRouter initialEntries={[url]}><Routes>
  <Route path="/ipo" element={<><IpoPage /><Where /></>} /><Route path="/ipo/all" element={<IpoAllRedirect />} /></Routes></MemoryRouter>);
const at = () => screen.getByTestId("at").textContent;
const tab = (n: RegExp) => screen.getByRole("tab", { name: n });
const panel = (k: string) => document.querySelector(`[data-ct-panel="${k}"]`) as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T12:00:00"));
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  st.data = [open, listedA, listedB]; st.gmp = GMP;
  HIST.items = [row({ id: 11, name: "Older One", gmpPct: 30, listingDate: "2025-01-10" }), row({ id: 12, name: "Older Two", gmpPct: 4 }), row({ id: 13, name: "Open Co", status: "open", listingDate: null, gmpPct: 30 }),
    ...Array.from({ length: 60 }, (_, i) => row({ id: 100 + i, name: `Filler ${i}`, gmpPct: null, listingDate: "2024-01-01" }))];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("rules 1-3: the address, the redirect, which view opens", () => {
  it("one route for the page; /ipo/all is a redirect; issue pages unchanged", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).toContain('<Route path="ipo" element={<IpoPage />} />');
    expect(app).toContain('<Route path="ipo/all" element={<IpoAllRedirect />} />');
    expect(app).toContain('<Route path="ipo/:id" element={<IpoReportPage />} />');
    expect(app).not.toContain("IpoHistoryPage");
  });
  it("/ipo/all lands on /ipo?view=all with its parameters, on the second view", () => {
    page("/ipo/all?board=sme&year=2026");
    expect(at()).toBe("/ipo?view=all&board=sme&year=2026");
    expect(tab(/All IPOs since 2020/).getAttribute("aria-selected")).toBe("true");
    expect(within(panel("all")).getAllByRole("button", { name: /^Remove filter/ }).map((b) => b.textContent)).toEqual(["Board: SME", "Year: 2026"]);
  });
  it("no view in the address: Open and upcoming; view=all: All IPOs since 2020", () => {
    page("/ipo");
    expect(tab(/Open and upcoming/).getAttribute("aria-selected")).toBe("true");
    expect(panel("now").hidden).toBe(false); expect(panel("all").hidden).toBe(true);
    cleanup(); page("/ipo?view=all");
    expect(panel("now").hidden).toBe(true); expect(panel("all").hidden).toBe(false);
  });
  it("the bar: '3 views · press one to switch' (Bulk & block deals added as the third), the numbered views with their counts, 'Showing: …'", () => {
    page();
    const bar = document.querySelector(".ctabs") as HTMLElement;
    expect(bar.querySelector(".ctabs-h")!.textContent).toBe("⇆3 viewsSee 2 more→")   // developer file 46: See N more stands in for the hint until each view was opened; Bulk & block deals is the third view
    expect(within(bar).getAllByRole("tab").map((t) => t.textContent)).toEqual(["1Open and upcoming1", "2All IPOs since 202063", "3Bulk & block deals"]);
    expect(bar.querySelector(".ct-aside")!.textContent).toBe("Showing: Open, upcoming, about to list, and listed in the last 30 days");
    fireEvent.click(tab(/All IPOs since 2020/));
    expect(bar.querySelector(".ct-aside")!.textContent).toBe("Showing: Every mainboard and SME issue: listing, subscription, GMP and return since");
  });
});

describe("rule 5: switching views changes the address and keeps each view's state", () => {
  it("the tab changes the URL; filters, sort and rows loaded stay in each view", () => {
    page();
    fireEvent.change(within(panel("now")).getByRole("searchbox", { name: "Search IPOs" }), { target: { value: "beta" } });
    fireEvent.click(within(panel("now")).getByRole("button", { name: /^Issue size/ }));
    fireEvent.click(tab(/All IPOs since 2020/));
    expect(at()).toBe("/ipo?view=all");
    fireEvent.click(within(panel("all")).getAllByRole("button", { name: /Issue price/ })[0]);
    expect(at()).toBe("/ipo?view=all&sort=issuePrice");
    fireEvent.click(within(panel("all")).getByRole("button", { name: /^Show 13 more/ }));
    fireEvent.click(tab(/Open and upcoming/));
    expect(at()).toBe("/ipo?view=now&sort=issuePrice");                                     // the second view's sort stays in the address
    expect((within(panel("now")).getByRole("searchbox", { name: "Search IPOs" }) as HTMLInputElement).value).toBe("beta");
    expect(panel("now").querySelector(".p4-lt th[aria-sort=descending]")!.textContent).toBe("Issue size ▼");
    fireEvent.click(tab(/All IPOs since 2020/));
    expect(panel("all").querySelectorAll(".ia-t tbody tr")).toHaveLength(63);                    // the 50 more loaded are still there
  });
  it("each view comes back where it was left", () => {
    page();
    const to = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    act(() => { Object.defineProperty(window, "scrollY", { value: 900, configurable: true }); window.dispatchEvent(new Event("scroll")); });
    fireEvent.click(tab(/All IPOs since 2020/));
    act(() => { Object.defineProperty(window, "scrollY", { value: 2400, configurable: true }); window.dispatchEvent(new Event("scroll")); });
    to.mockClear();
    fireEvent.click(tab(/Open and upcoming/));
    expect(to).toHaveBeenLastCalledWith({ top: 900 });
    fireEvent.click(tab(/All IPOs since 2020/));
    expect(to).toHaveBeenLastCalledWith({ top: 2400 });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});

describe("the links between the views", () => {
  it("rule 4: 'All N since 2020 →' in the Listed heading opens the second view with Status = Listed", () => {
    page();
    const sec = screen.getByRole("region", { name: "Listed in the last 30 days" });
    fireEvent.click(within(sec).getByRole("button", { name: "All 63 since 2020 →" }));
    expect(at()).toBe("/ipo?status=listed&view=all");
    expect(tab(/All IPOs since 2020/).getAttribute("aria-selected")).toBe("true");
    expect(within(panel("all")).getAllByRole("button", { name: /^Remove filter/ }).map((b) => b.textContent)).toEqual(["Status: Listed"]);
  });
  it("'See the N →' opens the second view with that GMP range selected", () => {
    page();
    act(() => { const d = document.querySelector("#p4-gmp") as HTMLDetailsElement; d.open = true; d.dispatchEvent(new Event("toggle")); });
    const r = document.querySelector('.p4-grr[data-grow="r25"]') as HTMLElement;
    fireEvent.click(within(r).getByRole("button", { name: "See the 2 →" }));
    expect(at()).toBe("/ipo?status=listed&gmp=r25&view=all");
    expect(within(panel("all")).getAllByRole("button", { name: /^Remove filter/ }).map((b) => b.textContent)).toEqual(["Status: Listed", "GMP said: 25–50%"]);
    expect([...panel("all").querySelectorAll(".ia-t tbody th a")].map((a) => a.textContent)).toEqual(["Older One"]);
  });
  it("'How close GMP came ↓' opens the block on By GMP range; 'See the breakdown by GMP range →' in the second view opens it in the first", () => {
    page();
    act(() => { fireEvent.click(within(panel("now")).getByRole("button", { name: "How close GMP came ↓" })); });
    expect((document.querySelector("#p4-gmp") as HTMLDetailsElement).open).toBe(true);
    expect(document.querySelector(".p4-grr.hl")!.getAttribute("data-grow")).toBe("r25");
    act(() => { const d = document.querySelector("#p4-gmp") as HTMLDetailsElement; d.open = false; d.dispatchEvent(new Event("toggle")); });
    fireEvent.click(tab(/All IPOs since 2020/));
    const strip = panel("all").querySelector(".mg-strip") as HTMLElement;
    expect(strip.textContent).toContain("What GMP said vs what actually listed. Of 3 issues, 1 (33%) listed within 5 points of what the GMP said");
    expect(strip.compareDocumentPosition(panel("all").querySelector(".ia-foot")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // then the footnote
    fireEvent.click(within(strip).getByRole("button", { name: "See the breakdown by GMP range →" }));
    expect(at()).toBe("/ipo?view=now");
    expect((document.querySelector("#p4-gmp") as HTMLDetailsElement).open).toBe(true);
    expect(within(document.querySelector("#p4-gmp") as HTMLElement).getByRole("button", { name: "By GMP range" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("links to an issue page carry the view they were opened from (the issue page's back link)", () => {
    page("/ipo?view=all");
    expect(document.querySelector('a[href="/ipo/11"]')).toBeTruthy();
    cleanup();
    st.data = [{ ...listedA, recordId: 77 }];
    let state: unknown;
    const Probe = () => { state = useLocation().state; return null; };
    render(<MemoryRouter initialEntries={["/ipo?view=now"]}><Routes><Route path="/ipo" element={<IpoPage />} /><Route path="/ipo/:id" element={<Probe />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("link", { name: "Alpha Listed" }));
    expect(state).toEqual({ from: "/ipo?view=now" });
  });
});

describe("rule 7 and the header", () => {
  it("Download CSV is in the All view only; the title is IPOs; no back link and no cross links between the old pages", () => {
    page();
    expect(within(panel("all")).getByRole("button", { name: "Download CSV", hidden: true })).toBeTruthy();
    expect(within(panel("now")).queryByRole("button", { name: "Download CSV" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("IPOs");
    expect(document.body.textContent).not.toMatch(/← IPO calendar|in All IPOs →|IPO calendar/);
    expect(document.querySelectorAll('a[href="/ipo/all"]')).toHaveLength(0);
  });
});

describe("sorting (developer files 28 and 29)", () => {
  it("Listed in the last 30 days: the seven columns sort; figures high to low first, text A to Z first, blanks last", () => {
    page();
    const sec = screen.getByRole("region", { name: "Listed in the last 30 days" });
    const names = () => [...sec.querySelectorAll("tbody th a, tbody th")].map((e) => e.firstChild!.textContent).filter((v, i, a) => a.indexOf(v) === i);
    expect([...sec.querySelectorAll("thead th[aria-sort]")].map((t) => t.textContent!.replace(/ [▲▼]$/, ""))).toEqual(["Company", "Listed", "Issue price", "Issue size", "Subscribed", "GMP said", "At listing"]);
    expect(names()).toEqual(["Beta Listed", "Alpha Listed"]);                                    // newest listing first
    fireEvent.click(within(sec).getByRole("button", { name: "Company" }));
    expect(names()).toEqual(["Alpha Listed", "Beta Listed"]);
    expect(sec.querySelector("th[aria-sort=ascending]")!.textContent).toBe("Company ▲");
    fireEvent.click(within(sec).getByRole("button", { name: "Issue size" }));
    expect(names()).toEqual(["Alpha Listed", "Beta Listed"]);                                    // a blank goes last
    fireEvent.click(within(sec).getByRole("button", { name: "Issue size ▼" }));
    expect(names()).toEqual(["Alpha Listed", "Beta Listed"]);                                    // ... whichever way
    fireEvent.click(within(sec).getByRole("button", { name: "Subscribed" }));
    expect(names()).toEqual(["Beta Listed", "Alpha Listed"]);
    fireEvent.click(within(sec).getByRole("button", { name: "At listing" }));
    expect(names()).toEqual(["Alpha Listed", "Beta Listed"]);
  });
  it("status rows (Upcoming, Open now, Closed) stay on top when sorted by Listed, either way", () => {
    const rows = [listedA, listedB, mk({ id: 9, name: "Up Co", status: "upcoming", openDate: "2026-11-01", closeDate: "2026-11-03" }), mk({ id: 8, name: "Shut Co", status: "closed" })];
    expect(sortListed(rows, "date", "desc").map((r) => r.id).slice(0, 2).sort()).toEqual([8, 9]);
    expect(sortListed(rows, "date", "asc").map((r) => r.id)).toEqual([...sortListed(rows, "date", "asc").map((r) => r.id).slice(0, 2), 3, 4]);
    const all = [row({ id: 1, listingDate: "2026-10-01" }), row({ id: 2, status: "upcoming", listingDate: null, openDate: "2026-11-01" }), row({ id: 3, listingDate: "2026-10-09" }),
      row({ id: 4, status: "closed", listingDate: null, openDate: "2026-10-15" })];
    expect(sortRows(all, "date", "desc").map((r) => r.id)).toEqual([2, 4, 3, 1]);
    expect(sortRows(all, "date", "asc").map((r) => r.id).slice(0, 2).sort()).toEqual([2, 4]);
    expect(sortRows(all, "date", "asc").map((r) => r.id).slice(2)).toEqual([1, 3]);
  });
});

describe("found while checking: Not listed", () => {
  it("a calendar issue 15 days or more past its close with no listing date is in the All view as Not listed, with no report link; the counts follow", () => {
    st.data = [open, listedA, listedB, mk({ id: 50, name: "ACME UNIVERSAL SAFEZONE9 LIMITED", status: "not_listed", kind: "sme", openDate: "2026-09-26", closeDate: "2026-09-30", priceLow: 65, priceHigh: 71, issueSizeCr: 26 }),
      mk({ id: 51, name: "Matched Co", status: "not_listed", openDate: "2026-09-01", closeDate: "2026-09-03", recordId: 11 })];   // already in the IPO record: not added twice
    page("/ipo?view=all&status=not_listed");
    expect(tab(/All IPOs since 2020/).textContent).toBe("2All IPOs since 202064");
    expect(tab(/Open and upcoming/).textContent).toBe("1Open and upcoming1");
    expect([...document.querySelectorAll(".dw-kpis.p4-kpis > div")].map((d) => d.textContent)[2]).toBe("Closed, listing soon0");
    const rows = [...panel("all").querySelectorAll(".ia-t tbody tr")];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Acme Universal Safezone9"); expect(rows[0].textContent).toContain("Not listed"); expect(rows[0].textContent).toContain("₹65–71");
    expect(rows[0].querySelector("a")).toBeNull();
    expect(within(panel("all")).getAllByRole("button", { name: /^Remove filter/ }).map((b) => b.textContent)).toEqual(["Status: Not listed"]);
    expect(panel("now").textContent).not.toContain("Acme Universal");
  });
});

describe("rule 6: the side menu", () => {
  it("one entry, IPOs, in place of IPO calendar and All IPOs; it stays lit on an issue page", () => {
    const items = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.items));
    expect(items.filter((i) => i.to.startsWith("/ipo"))).toEqual([expect.objectContaining({ to: "/ipo", label: "IPOs" })]);
    expect(items.find((i) => i.to === "/ipo")!.end).toBeFalsy();
    expect(items.some((i) => /IPO calendar|All IPOs/.test(i.label))).toBe(false);
  });
});
