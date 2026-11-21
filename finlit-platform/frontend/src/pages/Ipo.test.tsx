// @vitest-environment jsdom
// IPO calendar: sections by status, cards and detail drawer show only the facts that are in the data, listing-day arithmetic, compliance wording.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ipo } from "../lib/ipo";
import { listingMove, timeline } from "../lib/ipo";

const st = vi.hoisted(() => ({ data: [] as unknown[], gmp: undefined as unknown, board: "" }));
vi.mock("../lib/ipo", async (orig) => ({ ...(await orig<typeof import("../lib/ipo")>()), useIpos: () => ({ data: st.data, isLoading: false, isError: false }),
  useGmpRecord: (b: string) => { st.board = b; return { data: st.gmp, isLoading: false, isError: false }; } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/ChartHelp", () => ({ ChartHelp: () => null }));
import { IpoPage } from "./Ipo";

const mk = (o: Partial<Ipo>): Ipo => ({ id: 1, name: "Acme Ltd", symbol: null, kind: "mainboard", sector: null, status: "upcoming", openDate: "2026-11-03", closeDate: "2026-11-05", listingDate: null, priceLow: null, priceHigh: null, lotSize: null, issueSizeCr: null, listingPrice: null, note: null, link: null, ...o });
const bare = mk({ id: 1, name: "Bare Co", status: "upcoming" });
const rich = mk({ id: 2, name: "Rich Co", status: "open", sector: "Foods", symbol: "RICH", priceLow: 95, priceHigh: 100, lotSize: 150, issueSizeCr: 600, updatedAt: "2026-10-29T10:00:00+00:00", source: "FinEdge",
  details: { exchange: ["NSE", "BSE"], registrar: "Link Intime", leadManagers: ["Axis Capital"], subscription: { qib: 12.5, retail: 3.2, overall: 6.1 }, allotmentDate: "2026-11-06", refundDate: "2026-11-09", freshIssueCr: 400, ofsCr: 200, promoterPrePct: 80, promoterPostPct: 60, objectives: ["Repay borrowings"], docs: { rhp: "https://example.org/rhp.pdf" } } });
const listed = mk({ id: 3, name: "Listed Co", status: "listed", openDate: "2026-10-01", closeDate: "2026-10-05", listingDate: "2026-10-09", priceLow: 90, priceHigh: 100, lotSize: 100, listingPrice: 112.5, source: "FinEdge" });
beforeEach(() => { st.data = [bare, rich, listed]; st.gmp = undefined; });
afterEach(cleanup);

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

describe("IpoPage", () => {
  it("groups issues into status sections and hides absent facts", () => {
    render(<IpoPage />, { wrapper: MemoryRouter });
    for (const n of ["Open now", "Upcoming", "Listed"]) expect(screen.getAllByRole("region", { name: n }).length).toBe(1);
    expect(screen.queryByRole("region", { name: "Closed" })).toBeNull();
    const card = screen.getByRole("heading", { name: "Bare Co" }).closest("article")!;
    expect(within(card).queryByText("Price band")).toBeNull();
    expect(within(card).queryByText("Lot size")).toBeNull();
    expect(card.textContent).not.toMatch(/—|N\/A/);
    const rc = screen.getByRole("heading", { name: "Rich Co" }).closest("article")!;
    expect(within(rc).getByText("₹15,000")).toBeTruthy();
    expect(within(rc).getByText("6.10x")).toBeTruthy();
    expect(screen.getByText(/Source: FinEdge/)).toBeTruthy();
    expect(screen.getByText(/Data as of 29 Oct 2026/)).toBeTruthy();
  });
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
  });
  it("drawer without optional fields has no empty rows", () => {
    render(<IpoPage />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("button", { name: "Details: Bare Co" }));
    const dr = screen.getByRole("dialog");
    for (const t of ["Subscription", "Issue breakdown", "Promoter holding", "Lead managers", "Documents", "Minimum investment", "Allotment"]) expect(within(dr).queryByText(t)).toBeNull();
    expect(dr.textContent).not.toMatch(/—|N\/A/);
    expect(within(dr).getByText("Key dates")).toBeTruthy();
  });
  it("listed issue shows the listing price against the issue price with both figures", () => {
    render(<IpoPage />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("button", { name: "Details: Listed Co" }));
    const dr = screen.getByRole("dialog");
    expect(within(dr).getByText("Listing-day performance")).toBeTruthy();
    expect(dr.textContent).toContain("₹112.50 − ₹100 = ₹12.50, which is +12.50% of ₹100");
    expect(dr.textContent).toContain("Listing price ₹112.50 compared with the upper end of the price band ₹100");
    expect(within(dr).getByText("Listing price compared with the issue price; not a return on any investment.")).toBeTruthy();
  });
  it("uses no advice wording", () => {
    const { container } = render(<IpoPage />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("button", { name: "Details: Listed Co" }));
    expect(document.body.textContent || container.textContent).not.toMatch(/\b(buy|sell|apply|subscribe|good listing|recommend|gain)\b/i);
  });
});


// "What GMP said vs what actually listed": the record behind it is InvestorGain's (backend finlit/ipogmp.py); the section only draws it.
const pt = (name: string, gmpPct: number, listingPct: number, verdict: "beat" | "short" | "band", extra = {}) => ({ id: name.length, name, symbol: null, board: "mainboard", issuePrice: 100, gmp: gmpPct,
  gmpPct, listingPrice: 100 + listingPct, listingPct, listingDate: "2026-11-03", subscription: 10, issueSizeCr: 200, verdict, url: "https://www.investorgain.com/gmp/" + name + "/1/", ...extra });
const GMP = { board: "mainboard", source: { name: "InvestorGain", url: "https://www.investorgain.com/" }, updatedAt: null, note: "",
  items: [pt("bls", 46, 65.33, "beat"), pt("sfc", 4.7, 7.61, "band"), pt("far", 300, 20, "short")],
  summary: { count: 3, beat: 1, short: 1, band: 1, bandPts: 5, directionRight: 3, medianGap: 19.3, fit: { slope: 1.03, intercept: 2 } } };

describe("What GMP said vs what actually listed", () => {
  it("draws every listed issue, writes the count in words, credits InvestorGain and calls GMP unofficial", () => {
    st.gmp = GMP;
    render(<IpoPage />, { wrapper: MemoryRouter });
    const sec = screen.getByRole("heading", { name: /What GMP said vs what actually listed/ }).closest("section") as HTMLElement;
    expect(sec.querySelectorAll("circle")).toHaveLength(3);
    expect(sec.textContent).toContain("Of 3 issues, 1 listed within 5 points of what the GMP said, 1 listed higher and 1 lower. The typical gap was 19.3 points.");
    expect(sec.textContent).toContain("1 off the scale (hollow, at the edge)");
    expect(sec.textContent).toContain("Actual trend · slope 1.03");
    expect(within(sec).getByRole("link", { name: "InvestorGain" }).getAttribute("href")).toBe("https://www.investorgain.com/");
    expect(sec.textContent).toMatch(/unofficial/);
    expect(sec.textContent).not.toMatch(/\b(buy|sell|hold|should|best|target)\b/i);
    expect(st.board).toBe("all");                                   // every issue by default, as other platforms show it
    fireEvent.click(within(sec).getByRole("button", { name: "SME" }));
    expect(st.board).toBe("sme");
  });
  it("has a table view with the same figures", () => {
    st.gmp = GMP;
    render(<IpoPage />, { wrapper: MemoryRouter });
    const sec = screen.getByRole("heading", { name: /What GMP said vs what actually listed/ }).closest("section") as HTMLElement;
    fireEvent.click(within(sec).getByRole("button", { name: "Show as table" }));
    const rows = within(sec).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[1].textContent).toContain("46.0%"); expect(rows[1].textContent).toContain("65.3%"); expect(rows[1].textContent).toContain("Beat the call");
  });
  it("says so when there is no record yet", () => {
    st.gmp = { ...GMP, items: [], summary: { ...GMP.summary, count: 0 } };
    render(<IpoPage />, { wrapper: MemoryRouter });
    expect(screen.getByText(/No listed issues with a GMP on record yet\./)).toBeTruthy();
  });
  it("shows a card beside the dot under the pointer, and a dot opens the IPO report", () => {
    st.gmp = GMP;
    render(<IpoPage />, { wrapper: MemoryRouter });
    const sec = screen.getByRole("heading", { name: /What GMP said vs what actually listed/ }).closest("section") as HTMLElement;
    const dot = within(sec).getAllByRole("link").find((e) => e.tagName.toLowerCase() === "circle" && /^bls/.test(e.getAttribute("aria-label") || "")) as Element;
    fireEvent.mouseEnter(dot);
    const tip = sec.querySelector(".ipo-gmp-tip") as HTMLElement;
    expect(tip.textContent).toContain("GMP (unofficial)"); expect(tip.textContent).toContain("Listing day"); expect(tip.textContent).toContain("+65.3%");
    expect(tip.style.left).not.toBe("");
  });
});
