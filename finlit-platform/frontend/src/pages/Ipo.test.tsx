// @vitest-environment jsdom
// IPO calendar: sections by status, cards and detail drawer show only the facts that are in the data, listing-day arithmetic, compliance wording.
// Task #329: the calendar is now the first view (Open and upcoming) of the one IPOs page; the Listed table holds the last 30 days only, its seven columns
// sort, and "See the N →" opens the second view (the new page's own rules: pages/ipos329.test.tsx).
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ipo } from "../lib/ipo";
import { listingMove, timeline } from "../lib/ipo";

const st = vi.hoisted(() => ({ data: [] as unknown[], gmp: undefined as unknown, board: "" }));
const HIST = vi.hoisted(() => ({ items: [] as unknown[], asOf: "2026-10-20", updatedAt: null, note: "",
  sources: { issue: { name: "InvestorGain", url: "https://www.investorgain.com/", what: "" }, nse: { name: "NSE", url: null, what: "" }, prices: { name: "NSE", url: null, what: "" } } }));
vi.mock("../lib/deals", async (orig) => ({ ...(await orig<typeof import("../lib/deals")>()), useIpoDeals: () => ({ data: undefined, isLoading: true, isError: false }) }));
vi.mock("../lib/ipo", async (orig) => ({ ...(await orig<typeof import("../lib/ipo")>()), useIpos: () => ({ data: st.data, isLoading: false, isError: false }),
  useGmpRecord: (b: string) => { st.board = b; return { data: st.gmp, isLoading: false, isError: false }; } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../lib/ipoHistory", async (orig) => ({ ...(await orig<typeof import("../lib/ipoHistory")>()), useIpoHistory: () => ({ data: HIST, isLoading: false, isError: false }) }));
vi.mock("../components/ChartHelp", () => ({ ChartHelp: () => null }));
import { IpoPage } from "./Ipo";

const mk = (o: Partial<Ipo>): Ipo => ({ id: 1, name: "Acme Ltd", symbol: null, kind: "mainboard", sector: null, status: "upcoming", openDate: "2026-11-03", closeDate: "2026-11-05", listingDate: null, priceLow: null, priceHigh: null, lotSize: null, issueSizeCr: null, listingPrice: null, note: null, link: null, ...o });
const bare = mk({ id: 1, name: "Bare Co", status: "upcoming" });
const rich = mk({ id: 2, name: "Rich Co", status: "open", sector: "Foods", symbol: "RICH", priceLow: 95, priceHigh: 100, lotSize: 150, issueSizeCr: 600, updatedAt: "2026-10-29T10:00:00+00:00", source: "FinEdge",
  details: { exchange: ["NSE", "BSE"], registrar: "Link Intime", leadManagers: ["Axis Capital"], subscription: { qib: 12.5, retail: 3.2, overall: 6.1 }, allotmentDate: "2026-11-06", refundDate: "2026-11-09", freshIssueCr: 400, ofsCr: 200, promoterPrePct: 80, promoterPostPct: 60, objectives: ["Repay borrowings"], docs: { rhp: "https://example.org/rhp.pdf" } } });
const listed = mk({ id: 3, name: "Listed Co", status: "listed", openDate: "2026-10-01", closeDate: "2026-10-05", listingDate: "2026-10-09", priceLow: 90, priceHigh: 100, lotSize: 100, listingPrice: 112.5, source: "FinEdge" });
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T12:00:00")); st.data = [bare, rich, listed]; st.gmp = undefined; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("helpers", () => {
  it("listing move is arithmetic on the two prices, against the stated issue price when sent", () => {
    expect(listingMove(listed)).toMatchObject({ issue: 100, listing: 112.5, rupees: 12.5, pct: 12.5, basis: "upper end of the price band" });
    expect(listingMove({ ...listed, details: { issuePrice: 95 } })?.basis).toBe("issue price");
    expect(listingMove(bare)).toBeNull();
  });
  it("timeline keeps only dates that exist, in order", () => {
    expect(timeline(rich).map((s) => s.key)).toEqual(["open", "close", "allot", "refund"]);
    expect(timeline(bare).map((s) => s.key)).toEqual(["open", "close"]);
  });
});

describe("IpoPage, the compact layout (task #307, developer file 17 v2)", () => {
  it("drawer with every optional fact", () => {
    render(<IpoPage />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("button", { name: "Details: Rich Co" }));
    const dr = screen.getByRole("dialog");
    for (const t of ["Link Intime", "Axis Capital", "Qualified institutional buyers", "12.50x", "Fresh issue", "Offer for sale", "Before the issue", "Repay borrowings", "Allotment", "Refunds", "NSE, BSE"]) expect(within(dr).getAllByText(new RegExp(t)).length).toBeGreaterThan(0);
    expect(dr.textContent).toContain("150 shares (one lot) × ₹100 (upper end of the price band) = ₹15,000");
    expect(within(dr).getByRole("link", { name: /Red herring prospectus/ }).getAttribute("href")).toBe("https://example.org/rhp.pdf");
    expect(within(dr).queryByText("Listing-day performance")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });  it("drawer without optional fields has no empty rows", () => {
    render(<IpoPage />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("button", { name: "Details: Bare Co" }));
    const dr = screen.getByRole("dialog");
    for (const t of ["Subscription", "Issue breakdown", "Promoter holding", "Lead managers", "Documents", "Minimum investment", "Allotment"]) expect(within(dr).queryByText(t)).toBeNull();
    expect(dr.textContent).not.toMatch(/—|N\/A/);
    expect(within(dr).getByText("Key dates")).toBeTruthy();
  });  it("listed issue shows the listing price against the issue price with both figures", () => {
    render(<IpoPage />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("button", { name: "Details: Listed Co" }));
    const dr = screen.getByRole("dialog");
    expect(within(dr).getByText("Listing-day performance")).toBeTruthy();
    expect(dr.textContent).toContain("₹112.50 − ₹100 = ₹12.50, which is +12.50% of ₹100");
    expect(dr.textContent).toContain("Listing price ₹112.50 compared with the upper end of the price band ₹100");
    expect(within(dr).getByText("Listing price compared with the issue price; not a return on any investment.")).toBeTruthy();
  });  it("one KPI strip of five cells, Closed, listing soon among them", () => {
    st.data = [bare, rich, listed, mk({ id: 4, name: "Shut Co", status: "closed" })];
    render(<IpoPage />, { wrapper: MemoryRouter });
    const k = [...document.querySelectorAll(".dw-kpis.p4-kpis > div")].map((d) => d.textContent);
    expect(k).toEqual(["Open now1", "Upcoming1", "Closed, listing soon1", "Listed in the last 30 days1", "Avg listing vs issue, 30 days+12.5%"]);
  });
  it("order: Open now → Upcoming → Closed, listing soon → Next seven weeks → the GMP section → Listed → the as-of line", () => {
    st.data = [bare, rich, listed, mk({ id: 4, name: "Shut Co", status: "closed" })]; st.gmp = GMP;
    render(<IpoPage />, { wrapper: MemoryRouter });
    const order = [screen.getByRole("region", { name: "Open now" }), screen.getByRole("region", { name: "Upcoming" }), screen.getByRole("region", { name: "Closed, listing soon" }),
      screen.getByText("Next seven weeks").closest("section")!, document.querySelector("#p4-gmp")!, screen.getByRole("region", { name: "Listed in the last 30 days" }), document.querySelector(".ipo-asof")!];
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("region", { name: "Open now" }).textContent).toContain("apply until the closing date");
    expect(screen.getByRole("region", { name: "Closed, listing soon" }).textContent).toContain("allotment and listing dates in each card");
  });
  it("cards: the same fields in a fixed order; a field with no value shows a grey —; title case; Details → and Full report ↗", () => {
    st.data = [bare, { ...rich, name: "RICH FOODS LIMITED", recordId: 9 }];
    render(<IpoPage />, { wrapper: MemoryRouter });
    const fields = (a: Element) => [...a.querySelectorAll("dt")].map((d) => d.textContent);
    const want = ["Opens", "Closes", "Lists", "Price band", "Lot size", "Minimum investment", "Issue size", "Times subscribed", "Latest GMP (unofficial)"];
    const b = screen.getByRole("heading", { name: "Bare Co" }).closest("article")!, r = screen.getByRole("heading", { name: "Rich Foods Limited" }).closest("article")!;
    expect(fields(b)).toEqual(want); expect(fields(r)).toEqual(want);
    expect([...b.querySelectorAll(".na dd")].map((d) => d.textContent)).toEqual(["—", "—", "—", "—", "—", "—", "—"]);
    expect(within(r).getByText("₹15,000")).toBeTruthy(); expect(within(r).getByText("6.10x")).toBeTruthy();
    expect(within(r).getByRole("button", { name: "Details: Rich Foods Limited" }).textContent).toBe("Details →");
    expect(within(r).getByRole("link", { name: "Full IPO report: Rich Foods Limited" }).textContent).toBe("Full report ↗");
  });
  it("Listed in the last 30 days: a table, newest first, a link to the second view; the company name links to the IPO report", () => {
    const old = mk({ id: 5, name: "OLD LISTING LIMITED", status: "listed", openDate: "2026-08-01", closeDate: "2026-08-05", listingDate: "2026-08-10", priceHigh: 50, listingPrice: 40, recordId: 77 });
    st.data = [bare, rich, { ...listed, recordId: 12, sector: "Foods", issueSizeCr: 22.98, details: { subscription: { overall: 12.79 }, gmp: { rupees: 5, pct: 5, source: "InvestorGain" } } }, old];
    render(<IpoPage />, { wrapper: MemoryRouter });
    const sec = screen.getByRole("region", { name: "Listed in the last 30 days" });
    expect(sec.querySelector("h2 span")!.textContent).toBe("1"); expect(sec.querySelector("h2 small")!.textContent).toBe("All 0 since 2020 →");
    expect([...sec.querySelectorAll("thead th")].map((t) => t.textContent)).toEqual(["Company", "Listed ▼", "Issue price", "Issue size", "Subscribed", "GMP said", "At listing", "Details"]);
    const rows = within(sec).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);                                                   // only the issue listed in the last 30 days
    expect(rows[0].textContent).toContain("Listed Co"); expect(rows[0].textContent).toContain("Mainboard · Foods"); expect(rows[0].textContent).toContain("9 Oct 2026");
    expect(rows[0].textContent).toContain("₹22.98 Cr"); expect(rows[0].textContent).toContain("12.79x"); expect(rows[0].textContent).toContain("+5.0%"); expect(rows[0].textContent).toContain("+12.5%₹112.50");
    expect(within(rows[0]).getByRole("link", { name: "Listed Co" }).getAttribute("href")).toBe("/ipo/12");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Details: Listed Co" }));
    expect(within(screen.getByRole("dialog")).getByText("Listing-day performance")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(sec).queryByRole("link", { name: /in All IPOs/ })).toBeNull();                 // the cross link to the old second page went
  });
  it("a search keeps the Listed table to the last 30 days (all 147 are in the second view)", () => {
    const many = Array.from({ length: 30 }, (_, i) => mk({ id: 100 + i, name: `Older ${i}`, status: "listed", openDate: "2026-06-01", closeDate: "2026-06-03", listingDate: `2026-07-${String(1 + i).padStart(2, "0")}` }));
    st.data = [bare, rich, listed, ...many];
    render(<IpoPage />, { wrapper: MemoryRouter });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search IPOs" }), { target: { value: "older 1" } });
    let sec = screen.getByRole("region", { name: "Listed in the last 30 days" });
    expect(within(sec).queryAllByRole("row")).toHaveLength(0);
    expect(sec.textContent).toContain("No listing in the last 30 days matches these filters.");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search IPOs" }), { target: { value: "listed" } });
    sec = screen.getByRole("region", { name: "Listed in the last 30 days" });
    expect(within(sec).getAllByRole("row")).toHaveLength(2);
    expect(within(sec).queryByRole("button", { name: /^Show \d+ more/ })).toBeNull();
    expect(screen.getByRole("group", { name: "Filters on" }).textContent).toContain("listed");
  });
  it("task #329 (found while checking): the first view has no Status filter, only search and Board; a Not listed issue is in none of its groups", () => {
    st.data = [bare, rich, listed, mk({ id: 7, name: "Stale Co", status: "not_listed", openDate: "2026-09-01", closeDate: "2026-09-03" })];
    render(<IpoPage />, { wrapper: MemoryRouter });
    const now = document.querySelector('[data-ct-panel="now"]') as HTMLElement;
    expect([...now.querySelectorAll(".p4-tools .dbx-ddl")].map((e) => e.textContent)).toEqual(["Board"]);
    expect(within(now).queryByRole("button", { name: /^Status/ })).toBeNull();
    expect(now.textContent).not.toContain("Stale Co");
    expect([...document.querySelectorAll(".dw-kpis.p4-kpis > div")].map((d) => d.textContent)[2]).toBe("Closed, listing soon0");
    fireEvent.click(screen.getByRole("button", { name: /^Board/ }));
    expect([...screen.getByRole("dialog", { name: "Board" }).querySelectorAll(".dbx-opt")].map((o) => o.textContent)).toEqual(["All boards3", "Mainboard3", "SME0"]);
  });
  it("uses no advice wording", () => {
    render(<IpoPage />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("button", { name: "Details: Listed Co" }));
    expect(document.body.textContent).not.toMatch(/\b(buy|sell|subscribe now|good listing|recommend)\b/i);
  });
});

// "What GMP said vs what actually listed": the record behind it is InvestorGain's (backend finlit/ipogmp.py); the section works out ranges and categories.
const pt = (name: string, gmpPct: number, listingPct: number, extra = {}) => ({ id: name.length, name, symbol: null, board: "mainboard", issuePrice: 100, gmp: gmpPct,
  gmpPct, listingPrice: 100 + listingPct, listingPct, listingDate: "2026-11-03", subscription: 10, issueSizeCr: 200, verdict: "band", url: "https://www.investorgain.com/gmp/" + name + "/1/", ...extra });
const GMP = { board: "all", source: { name: "InvestorGain", url: "https://www.investorgain.com/" }, updatedAt: null, note: "",
  items: [pt("bls", 46, 65.33), pt("sfc", 4.7, 7.61), pt("far", 300, 20), pt("zed", 0, -2), pt("capd", 110, 90, { board: "sme" }), pt("ring", 40, 90.2, { board: "sme" })],
  summary: { count: 6, beat: 2, short: 1, band: 2, bandPts: 5, directionRight: 3, medianGap: 19.3, fit: { slope: 1.03, intercept: 2 } } };
const gmpSec = () => document.querySelector("#p4-gmp") as HTMLDetailsElement;
// jsdom does not open a <details> on a click of its summary; the browser does, then fires "toggle" (which the section listens to)
const openGmp = () => { act(() => { const d = gmpSec(); fireEvent.click(d.querySelector("summary")!); d.open = true; d.dispatchEvent(new Event("toggle")); }); };

describe("What GMP said vs what actually listed (task #307)", () => {
  it("is closed until opened, after the timeline and before Listed, with its one-line summary", () => {
    st.gmp = GMP;
    render(<IpoPage />, { wrapper: MemoryRouter });
    expect(gmpSec().open).toBe(false);
    expect(gmpSec().querySelector(".dw-accs")!.textContent).toBe("Of 6 issues, 2 (33%) listed within 5 points of what the GMP said, 2 higher and 1 lower. 1 SME issue with a GMP above 85% opened at the +90% cap. The typical gap was 19.7 points.");
    expect(gmpSec().querySelector(".p4-gr")).toBeNull();
    openGmp();
    expect(gmpSec().open).toBe(true);
    expect(within(gmpSec()).getByRole("link", { name: "InvestorGain" }).getAttribute("href")).toBe("https://www.investorgain.com/");
    expect(gmpSec().textContent).toMatch(/unofficial/); expect(gmpSec().textContent).toContain("Describes the past; not a forecast or advice.");
  });
  it("By GMP range (default): a row per range with its 100% bar, within 5 pts, median gap, 'See the N →' (opening the second view); few ranges marked; current issues under their range", () => {
    st.gmp = GMP; st.data = [bare, { ...rich, details: { ...rich.details, gmp: { rupees: 30, pct: 30, source: "InvestorGain" } } }, listed];
    render(<IpoPage />, { wrapper: MemoryRouter }); openGmp();
    const rows = [...gmpSec().querySelectorAll(".p4-grr")];
    expect(rows.map((r) => r.querySelector(".p4-grl b")!.textContent)).toEqual(["Below 0%", "0%", "0–10%", "10–25%", "25–50%", "50–90%", "90% and above"]);
    const r25 = gmpSec().querySelector('.p4-grr[data-grow="r25"]')!;
    expect(r25.classList.contains("thin")).toBe(true); expect(r25.textContent).toContain("2 issues · few");
    expect(r25.textContent).toContain("Current issues at this GMP: Rich Co +30.0%");
    expect(r25.querySelector(".p4-grw")!.textContent).toBe("0%within 5 pts");
    expect(gmpSec().querySelector('.p4-grr[data-grow="r90"] .s-cap')).toBeTruthy();
    fireEvent.click(within(r25 as HTMLElement).getByRole("button", { name: "See the 2 →" }));
    expect(screen.getByRole("tab", { name: /All IPOs since 2020/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("button", { name: /^Remove filter/ }).map((b) => b.textContent)).toEqual(["Status: Listed", "GMP said: 25–50%"]);
  });
  it("Table: Issue · Listed · GMP said · Listed vs issue · Gap (pts) · Subscribed · Result; the cap and the ring", () => {
    st.gmp = GMP;
    render(<IpoPage />, { wrapper: MemoryRouter }); openGmp();
    fireEvent.click(within(gmpSec()).getByRole("button", { name: "Table" }));
    expect([...gmpSec().querySelectorAll("thead th")].map((t) => t.textContent)).toEqual(["Issue", "Listed", "GMP said", "Listed vs issue", "Gap", "Subscribed", "Result"]);
    const row = (n: string) => within(gmpSec()).getAllByRole("row").find((r) => r.textContent!.startsWith(n))!;
    expect(row("bls").textContent).toContain("+19.3 pts"); expect(row("bls").textContent).toContain("Listed higher");
    expect(row("capd").textContent).toContain("Opened at the +90% cap");
    expect(row("ring").textContent).toContain("Listed higher"); expect(row("ring").textContent).toContain("opened at the +90% cap");
  });
  it("Every issue: zoomed to most issues, the ±5-point band, no fit line, the SME cap line, hollow dots outside the zoom, the tip with the result and the gap", () => {
    st.gmp = GMP;
    render(<IpoPage />, { wrapper: MemoryRouter }); openGmp();
    fireEvent.click(within(gmpSec()).getByRole("button", { name: "Every issue" }));
    expect(within(gmpSec()).getByRole("button", { name: "Most issues (GMP up to 50%)" }).getAttribute("aria-pressed")).toBe("true");
    expect(gmpSec().querySelector(".g-band")).toBeTruthy(); expect(gmpSec().querySelector(".g-fit")).toBeNull(); expect(gmpSec().querySelector(".g-capl")).toBeTruthy();
    expect(gmpSec().textContent).toContain("2 issues lie outside this view, drawn hollow at the edge");
    const dots = [...gmpSec().querySelectorAll(".g-dots circle")];
    expect(dots).toHaveLength(6);
    expect(dots.filter((c) => c.getAttribute("fill") === "none")).toHaveLength(2);
    expect(dots.find((c) => /^ring/.test(c.getAttribute("aria-label")!))!.getAttribute("stroke")).toBe("var(--gv-cap)");
    fireEvent.mouseEnter(dots.find((c) => /^sfc/.test(c.getAttribute("aria-label")!))!);
    expect(gmpSec().querySelector("#p4-gtip")!.textContent).toContain("Within 5 points · +2.9 pts");
    fireEvent.click(within(gmpSec().querySelector(".p4-gzr")! as HTMLElement).getByRole("button", { name: "All" }));
    expect(gmpSec().textContent).toContain("1 issue lies outside this view");               // a GMP of 300% is beyond even "All" (up to 150%)
  });
  it("filters: every option shows its count; chips with Clear these; the toolbar's Board sets the section's Board", () => {
    st.gmp = GMP;
    render(<IpoPage />, { wrapper: MemoryRouter }); openGmp();
    fireEvent.click(within(gmpSec()).getByRole("button", { name: /^Subscription/ }));
    expect([...screen.getByRole("dialog", { name: "Times subscribed" }).querySelectorAll(".dbx-opt")].map((o) => o.textContent)).toEqual(["Any subscription6", "Under 10x0", "10x – 50x6", "50x – 100x0", "Above 100x0"]);
    fireEvent.click(screen.getByRole("option", { name: /10x – 50x/ }));
    expect(gmpSec().querySelector(".p4-gch")!.textContent).toBe("10x – 50xClear these");
    fireEvent.click(screen.getByRole("button", { name: /^Board/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Board" })).getByRole("option", { name: /SME/ }));
    expect(within(gmpSec().querySelector(".p4-gf .seg")! as HTMLElement).getByRole("button", { name: "SME" }).getAttribute("aria-pressed")).toBe("true");
    expect(gmpSec().querySelector(".ipo-gmp-lead")!.textContent).toContain("Of 2 issues");
  });
  it("a card's 'How close GMP came ↓' opens the section on By GMP range, sets the issue's board and highlights its range", () => {
    st.gmp = GMP; st.data = [{ ...rich, kind: "sme", details: { ...rich.details, gmp: { rupees: 30, pct: 30, source: "InvestorGain" } } }, listed];
    render(<IpoPage />, { wrapper: MemoryRouter });
    act(() => { fireEvent.click(screen.getByRole("button", { name: "How close GMP came ↓" })); });
    expect(gmpSec().open).toBe(true);
    expect(within(gmpSec()).getByRole("button", { name: "By GMP range" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(gmpSec().querySelector(".p4-gf .seg")! as HTMLElement).getByRole("button", { name: "SME" }).getAttribute("aria-pressed")).toBe("true");
    expect(gmpSec().querySelector(".p4-grr.hl")!.getAttribute("data-grow")).toBe("r25");
  });
  it("says so when there is no record yet", () => {
    st.gmp = { ...GMP, items: [], summary: { ...GMP.summary, count: 0 } };
    render(<IpoPage />, { wrapper: MemoryRouter }); openGmp();
    expect(screen.getByText(/No listed issues with a GMP on record yet\./)).toBeTruthy();
  });
});
