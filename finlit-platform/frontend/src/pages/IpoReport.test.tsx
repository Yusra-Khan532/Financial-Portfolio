// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IpoHistory, IpoRecord, IpoRow } from "../lib/ipoHistory";

const base: IpoRow = {
  id: 1849, name: "BLS Polymers", symbol: "BLSPOLY", nse: "BLSPOLY", bse: "545011", board: "mainboard", sector: "Specialty Chemicals", exchanges: ["BSE", "NSE"], kind: "Book built",
  status: "listed", openDate: "2026-10-27", closeDate: "2026-10-29", listingDate: "2026-11-03", priceLow: 142, priceHigh: 150, issuePrice: 150, lotSize: 100, minAmount: 15000,
  issueSizeCr: 255, freshCr: 255, ofsCr: null, subscription: 241.22, subQib: 200.25, subNii: 559.2, subRetail: 128.36, gmp: 69, gmpPct: 46, listingPrice: 248, listingPct: 65.33,
  listingClose: 255.5, listingClosePct: 70.33, lastClose: 231, lastDay: "2026-11-20", sinceIpoPct: 54, adjustedBy: null, companyPage: true, verdict: "beat",
};
const sources = { issue: { name: "InvestorGain", url: "https://www.investorgain.com/", what: "" }, nse: { name: "NSE", url: null, what: "" }, prices: { name: "FinLit daily prices", url: null, what: "" } };
const rec: IpoRecord = {
  ...base, url: "https://www.investorgain.com/gmp/bls-polymers-ipo/1849/", isin: "INE0ZCQ01019", updatedAt: "2026-11-21T10:00:00+05:30", sources, note: "",
  gmpHistory: [{ t: "2026-10-19T09:37:01.000Z", gmp: 18 }, { t: "2026-10-30T09:00:00.000Z", gmp: 74 }, { t: "2026-11-03T09:02:01.000Z", gmp: 69 }],
  nseBook: { total: 241.22, categories: [{ key: "qib", label: "Qualified institutions", offered: 3400000, bid: 1, times: 200.25 }, { key: "nii", label: "Non-institutional investors", offered: 2550000, bid: 1, times: 559.2 }, { key: "retail", label: "Retail investors", offered: 5950000, bid: 1, times: 128.36 }],
    demand: [{ price: "142", lakhShares: 16.23 }, { price: "150", lakhShares: 21848.175 }, { price: "Cut-off", lakhShares: 6880.726 }] },
  detail: {
    company: { fullName: "BLS Polymers Ltd.", incorporated: "1991", city: "Delhi", sector: "Specialty Chemicals", website: "https://www.blspolymers.com/", promoters: ["Vinod Aggarwal"] },
    issue: { kind: "Book built", board: "Mainboard", exchanges: ["BSE", "NSE"], faceValue: 10, priceLow: 142, priceHigh: 150, issuePrice: 150, lotSize: 100, minAmount: 15000, retailMaxShares: 1400,
      sniiMinShares: 1400, sniiMinAmount: 210000, bniiMinShares: 6700, bniiMinAmount: 1005000, totalShares: 17000000, freshShares: 17000000, ofsShares: null, totalCr: 255, freshCr: 255, ofsCr: null,
      preIssueShares: 45031834, postIssueShares: 62031834, promoterPre: 98.53, promoterPost: 71.53, marketCapCr: 930.48, pe: 25, postPe: 22.73, eps: 6, epsPost: 6.6, withdrawn: false },
    reservation: { total: 17000000, rows: [{ key: "anchor", label: "Anchor investors", shares: 5100000, pct: 30 }, { key: "qib", label: "Qualified institutions (excl. anchor)", shares: 3400000, pct: 20 },
      { key: "nii", label: "Non-institutional investors", shares: 2550000, pct: 15 }, { key: "retail", label: "Retail investors", shares: 5950000, pct: 35, maxAllottees: 59500 }] },
    timetable: { anchorBid: "2026-10-26", open: "2026-10-27", close: "2026-10-29", allotment: "2026-10-30", refunds: "2026-11-02", credit: "2026-11-02", listing: "2026-11-03", anchorLockin30: "2026-11-28", anchorLockin90: null },
    documents: { drhp: "https://nsearchives.nseindia.com/x.pdf", rhp: "https://www.sebi.gov.in/x-rhp.html", prospectus: null, anchorList: null },
    people: { registrar: "Kfin Technologies Ltd.", allotmentUrl: "https://ipostatus.kfintech.com/", leadManagers: ["Unistone Capital Pvt.Ltd."] },
    kpis: [{ asOf: "2026-03-31", roe: 33.17, roce: 29.51, debtEquity: 0.56, ronw: 28.45, patMargin: 7.73, ebitdaMargin: 13.33, nav: 21.08, priceToBook: 7.12 }],
    financials: { basis: "Restated Consolidated", unit: "₹ crore", periods: ["2026-03-31", "2025-03-31"], rows: [{ label: "Total Income", values: [354.41, 336.7] }, { label: "Profit After Tax", values: [27.01, 21.14] }] },
    objects: [{ label: "Funding working capital requirements", amountCr: 89.5 }], expenses: null,
    anchors: { count: 7, shares: 5100000, amountCr: 76.5, investors: [{ name: "PINE OAK GLOBAL FUND", shares: 666700, amountCr: 10 }] },
  },
};
const st = { rec: rec as IpoRecord | undefined };
vi.mock("../lib/ipoHistory", async (orig) => ({ ...(await orig<typeof import("../lib/ipoHistory")>()),
  useIpoRecord: () => ({ data: st.rec, isLoading: false, isError: !st.rec }),
  useIpoHistory: () => ({ data: { items: [base], asOf: "2026-11-21", updatedAt: null, sources, note: "" } as IpoHistory, isLoading: false, isError: false }) }));
vi.mock("../lib/ipo", async (orig) => ({ ...(await orig<typeof import("../lib/ipo")>()), useGmpRecord: () => ({ data: undefined, isLoading: false, isError: false }) }));
import { backTo, inWords, IpoReportPage } from "./IpoReport";
import { IpoAllRedirect, IpoAllView } from "./IpoHistory";

const Where = () => { const l = useLocation(); return <output data-testid="at">{l.pathname + l.search}</output>; };
const at = (path: string, state?: unknown) => render(<MemoryRouter initialEntries={[{ pathname: path.split("?")[0], search: path.includes("?") ? "?" + path.split("?")[1] : "", state }]}>
  <Routes><Route path="/ipo" element={<><IpoAllView /><Where /></>} /><Route path="/ipo/all" element={<IpoAllRedirect />} /><Route path="/ipo/:id" element={<IpoReportPage />} /></Routes></MemoryRouter>);
afterEach(() => { cleanup(); st.rec = rec; });
const ADVICE = /\b(buy|sell|apply|subscribe|recommend|should|good listing|best|gain)\b/i;

describe("the IPO report", () => {
  it("tells the issue in words from its own figures", () => {
    const w = inWords(rec).join(" ");
    expect(w).toContain("BLS Polymers Ltd. raised money through a book-built mainboard IPO of ₹255 Cr, priced at ₹150.");
    expect(w).toContain("The whole issue was new money for the company");
    expect(w).toContain("Bidding ran from 27 Oct 2026 to 29 Oct 2026, in lots of 100 shares (₹15,000 for one lot).");
    expect(w).toContain("subscribed 241.22x overall: qualified institutions 200.25x, non-institutional investors 559.20x, retail investors 128.36x.");
    expect(w).toContain("It listed on 3 Nov 2026 at ₹248, 65.3% above the issue price; the first day closed at ₹255.50, 70.3% above the issue price.");
    expect(inWords({ ...rec, day1: { open: 248, high: 285, low: 225, close: 268.8, source: "NSE" }, listingClose: 268.8, listingClosePct: 79.2 }).join(" "))
      .toContain("It listed on 3 Nov 2026 at ₹248, 65.3% above the issue price; through the first day it traded between ₹225 and ₹285 and closed at ₹268.80, 79.2% above the issue price.");
    expect(w).toContain("the listing price came in 19.3 points higher.");
    expect(w).toContain("98.53% of the company before the issue and 71.53% after it.");
    expect(w).not.toMatch(ADVICE);
  });

  it("shows every section and names its sources", () => {
    at("/ipo/1849");
    for (const h of ["The issue, in words", "Timetable", "Subscription", "How the issue was reserved", "Grey market premium, day by day", "Issue details", "Offer documents", "Figures from the offer document", "Financials (restated consolidated)", "What the money is for", "Anchor investors"])
      expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Red herring prospectus (RHP)" }).getAttribute("href")).toBe("https://www.sebi.gov.in/x-rhp.html");
    expect(screen.getByRole("link", { name: "Company page →" }).getAttribute("href")).toBe("/stocks/BLSPOLY");
    expect(document.body.textContent).toContain("Source: NSE, the consolidated book");
    expect(document.body.textContent).toMatch(/informal, unofficial price/);
    expect(document.body.textContent).not.toMatch(ADVICE);
  });

  it("names NSE's figure when its book counts more than the overall subscription, and groups thin prices", async () => {
    st.rec = { ...rec, nseBook: { ...rec.nseBook!, total: 22.19, categories: [...rec.nseBook!.categories, { key: "employee", label: "Employees", offered: 1, bid: 1, times: 2.93 }] } };
    at("/ipo/1849");
    expect(document.body.textContent).toContain("Subscribed 241.22x overall. NSE's consolidated book, which also counts the employee portion, gives 22.19x.");
    const { groupDemand } = await import("../components/ipo/ReportCharts");
    const wide = [...Array.from({ length: 50 }, (_, i) => ({ price: String(1065 + i), lakhShares: 0.05 })), { price: "1115", lakhShares: 40244 }, { price: "Cut-off", lakhShares: 3571 }];
    const g = groupDemand(wide);
    expect(g.map((d) => d.price)).toEqual(["1115", "₹1065–1114, 50 other prices", "Cut-off"]);
    expect(g[1].lakhShares).toBeCloseTo(2.5, 6);
    expect(groupDemand(rec.nseBook!.demand).map((d) => d.price)).toEqual(["142", "150", "Cut-off"]);      // a short band is shown whole
  });

  it("leaves out what it does not have", () => {
    st.rec = { ...rec, nseBook: null, gmpHistory: [], companyPage: false, detail: { ...rec.detail!, financials: null, anchors: null, objects: null, kpis: [] } };
    at("/ipo/1849");
    expect(screen.queryByRole("heading", { name: /Financials/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Anchor investors" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Company page →" })).toBeNull();
    expect(document.body.textContent).toContain("The split by investor category is added once the exchange's book is read.");
  });

  it("says so for an IPO not in the records", () => {
    st.rec = undefined;
    at("/ipo/99");
    expect(screen.getByText("This IPO is not in our records.")).toBeTruthy();
  });
});

describe("the all-IPOs view of the IPOs page (task #329)", () => {
  it("/ipo/all opens /ipo?view=all, keeping its parameters", () => {
    at("/ipo/all?board=mainboard&sort=listingPct");
    expect(screen.getByTestId("at").textContent).toBe("/ipo?view=all&board=mainboard&sort=listingPct");
    expect(screen.getAllByRole("link", { name: "BLS Polymers" })[0].getAttribute("href")).toBe("/ipo/1849");
  });
  it("the report's back link returns to the view the member came from", () => {
    expect(backTo({ from: "/ipo?view=all&board=sme" })).toEqual({ to: "/ipo?view=all&board=sme", label: "IPOs: All IPOs since 2020" });
    expect(backTo({ from: "/ipo" })).toEqual({ to: "/ipo", label: "IPOs: Open and upcoming" });
    expect(backTo({ from: "/ipo?view=now" }).label).toBe("IPOs: Open and upcoming");
    expect(backTo(null)).toEqual({ to: "/ipo?view=all", label: "IPOs: All IPOs since 2020" });          // opened directly: the list of every IPO
    expect(backTo({ from: "https://elsewhere.example/ipo" }).to).toBe("/ipo?view=all");                  // only an address on this page
    at("/ipo/1849", { from: "/ipo?view=now" });
    expect(screen.getByRole("link", { name: "← IPOs: Open and upcoming" }).getAttribute("href")).toBe("/ipo?view=now");
  });
  it("lists the issue, links to its report and uses no advice words", () => {
    at("/ipo?view=all");
    expect(screen.getAllByRole("link", { name: "BLS Polymers" })[0].getAttribute("href")).toBe("/ipo/1849");
    expect(document.body.textContent).toContain("+65.3%");
    expect(document.body.textContent).not.toMatch(ADVICE);
  });
});
