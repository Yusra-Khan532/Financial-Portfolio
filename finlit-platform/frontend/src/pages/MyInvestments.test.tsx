// @vitest-environment jsdom
// Task #137 (the team's pack "finlit-08-all-my-investments-14nov"): the All my investments page, one test per point of the pack's "Done when" list and its sections.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AllInvestments } from "../lib/myInvest";

const st = vi.hoisted(() => ({ plan: "gold" as "basic" | "silver" | "gold", body: null as unknown, answer: null as unknown }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiSend: vi.fn(async (_m: string, _p: string, body: unknown) => { st.body = body; return st.answer; }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: (p: string) => (p === "silver" ? st.plan !== "basic" : p === "gold" ? st.plan === "gold" : true), upgrade: vi.fn(), toast: vi.fn() }), TIER: { silver: { name: "Silver" }, gold: { name: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children, title }: { children: React.ReactNode; title: string }) => (st.plan === "basic" ? <div data-testid="gate">{title}</div> : <>{children}</>) }));
import { portfolio } from "../lib/portfolio";
import { MyInvestmentsPage } from "./MyInvestments";
import { segRows, rupees } from "../lib/myInvest";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const ANSWER = (o: Partial<AllInvestments> = {}): AllInvestments => ({
  plan: "gold", byValue: true, total: 1420000, chg1y: 4.5,
  parts: { shares: { count: 2, valued: true, value: 680000, share: 48, chg1y: 7.9, largest: { name: "Tips Music", symbol: "TIPSMUSIC" }, score: 65, scoreModel: "prism", peers: { lead: 1, lag: 1, shown: true } },
    funds: { count: 1, valued: true, value: 740000, share: 52, chg1y: 2.1, largest: { name: "Parag Parikh Flexi Cap", code: 1 }, score: 52, scoreWord: "Average", scoreLocked: false, overlap: null },
    etfs: { count: 0, soon: true, why: "The ETF portfolio is coming. Once you can keep a list of your ETFs, they are counted here too." } },
  mix: { equity: 86, debt: 8, cash: 3, other: 3 },
  companies: [
    { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banks", direct: 4.2, funds: 1.9, etfs: 0, all: 6.1, twice: true, ways: 2, via: [1], peer: "In line" },
    { symbol: "TIPSMUSIC", name: "Tips Music", sector: "Entertainment", direct: 4.4, funds: 0, etfs: 0, all: 4.4, twice: false, ways: 1, via: [], peer: null },
    { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banks", direct: 0, funds: 1.7, etfs: 0, all: 1.7, twice: false, ways: 1, via: [1], peer: "Leader" },
  ], heldTwice: 1, peersShown: true,
  sectors: [{ sector: "Banks", mine: 27, bench: 25 }, { sector: "Entertainment", mine: 6, bench: 1 }],
  risk: { swing: 12.6, benchSwing: 14.3, worstFall: -16.2, benchWorstFall: -18.8, beta: 0.86, fallsTaken: 79, weeks: 156, worstWeek: -3.1, benchWorstWeek: -4.6, level: "A little lower", vs: "the Nifty 500",
    parts: [{ part: "shares", money: 48, swings: 68 }, { part: "funds", money: 52, swings: 32 }], lines: ["Shares are 48% of your money but 68% of the ups and downs."], grain: "weekly", years: 3 },
  riskWhy: null, insights: [{ id: "sector", title: "Banks is 27% of everything", text: "Counted through your funds, Banks is 27% of all you hold, against 25% of the Nifty 500." }],
  holdingsAsOf: "2026-10-31", unknown: [], noHoldings: [], disclaimer: "Describes your shares and mutual funds. Mutual fund investments are subject to market risks; read all scheme-related documents carefully. Information only, not investment advice.", ...o,
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><MyInvestmentsPage /></MemoryRouter></QueryClientProvider>);
beforeEach(() => { st.plan = "gold"; st.answer = ANSWER(); portfolio.reset(); portfolio.add({ symbol: "HDFCBANK", qty: 10, price: 0 }); portfolio.add({ symbol: "TIPSMUSIC", qty: 0, price: 0 }); });
afterEach(cleanup);

describe("task #137: All my investments", () => {
  it("reads the Equity portfolio list from its own store (symbol and quantity only) and says nothing is sent to a broker", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect(st.body).toEqual({ shares: [{ symbol: "HDFCBANK", qty: 10 }, { symbol: "TIPSMUSIC", qty: null }] });     // a list change on its own page changes this request
    expect(screen.getByRole("heading", { level: 1, name: "All my investments" })).toBeTruthy();
    expect(document.body.textContent).toMatch(/2 shares · 1 mutual fund · ETFs coming · nothing is sent to a broker/);
    for (const name of [/Equity portfolio/, /MF portfolio/]) expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
  });
  it("Where your money sits: the total, its 1-year change, the stacked bar and each part; ETFs said to be coming", async () => {
    mount(); await screen.findByText("Where your money sits");
    const card = screen.getByRole("region", { name: "Where your money sits" });
    expect(card.textContent).toMatch(/₹14\.2 lakh\+4\.5% over the last year/);
    expect(card.textContent).toMatch(/Shares · 48%₹6\.8 lakh · 2 shares · \+7\.9% a year/);
    expect(card.textContent).toMatch(/ETFs · coming/);
  });
  it("without quantities the page says it is counting each holding the same", async () => {
    st.answer = ANSWER({ byValue: false, total: null, parts: { ...ANSWER().parts, shares: { ...ANSWER().parts.shares, valued: false, value: null } } });
    mount(); await screen.findByText("Where your money sits");
    expect(document.body.textContent).toMatch(/Counting each holding the same until quantities are added/);
    expect(document.body.textContent).toMatch(/each part counts the same, and so does each holding without a quantity/);
    expect(screen.getByRole("link", { name: /Add quantities to see your money/ })).toBeTruthy();
  });
  it("the five tiles: asset mix, biggest company split, held twice, health by plan, risk level", async () => {
    mount(); await screen.findByText("Where your money sits");
    const tiles = [...document.querySelectorAll(".mi-tile")].map((t) => t.textContent);
    expect(tiles).toHaveLength(5);
    expect(tiles[0]).toMatch(/Asset mix86% shares.*debt and cash 11%, counting what sits inside each fund/);
    expect(tiles[1]).toMatch(/Biggest companyHDFC Bank 6\.1%4\.2% direct, 1\.9% through funds/);
    expect(tiles[2]).toMatch(/Held twice1 company/);
    expect(tiles[3]).toMatch(/Health65 · 52Shares: FinLit Prism 65, Healthy\. Funds: FundPulse 52, Average/);
    expect(tiles[4]).toMatch(/Risk levelA little lowerthan the Nifty 500/);
  });
  it("Silver sees FinLit IQ and a lock on the funds' FundPulse; Basic sees the plan gate", async () => {
    st.plan = "silver"; st.answer = ANSWER({ plan: "silver", parts: { ...ANSWER().parts, shares: { ...ANSWER().parts.shares, score: 66, scoreModel: "iq" }, funds: { ...ANSWER().parts.funds, score: null, scoreLocked: true } } });
    mount(); await screen.findByText("Where your money sits");
    const health = [...document.querySelectorAll(".mi-tile")][3].textContent!;
    expect(health).toMatch(/Shares: FinLit IQ 66, Healthy\. Funds: FundPulse comes with Gold/);
    expect(document.body.textContent).not.toMatch(/FinLit Prism \d/);
    cleanup(); st.plan = "basic"; mount();
    expect(screen.getByTestId("gate").textContent).toMatch(/See all your investments together/);
  });
  it("Overview: three part cards (the ETF card says coming) and the insight cards", async () => {
    mount(); await screen.findByText("Where your money sits");
    const shares = screen.getByRole("region", { name: "Shares" });
    expect(shares.textContent).toMatch(/Over 1 year\+7\.9%.*FinLit Prism, average65 · Healthy.*Against peers1 lead · 1 lag.*LargestTips Music/);
    expect(within(screen.getByRole("region", { name: "Mutual funds" })).getByRole("link", { name: /Open the MF portfolio/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "ETFs" }).textContent).toMatch(/Coming.*The ETF portfolio is coming/);
    expect(document.querySelector(".mi-in")!.textContent).toMatch(/Watch outBanks is 27% of everything/);
  });
  it("Look-through: every company once, with Direct + Through funds + Through ETFs = All together, a segment filter and sectors against the Nifty 500", async () => {
    mount(); await screen.findByText("Where your money sits");
    fireEvent.click(screen.getByRole("tab", { name: /Look-through/ }));
    const t = screen.getByRole("table");
    const row = within(t).getByRole("row", { name: /HDFC Bank/ });
    expect([...row.querySelectorAll("td")].map((c) => c.textContent)).toEqual(["4.2%", "1.9%", "—", "6.1%", "In line"]);
    for (const c of ANSWER().companies) expect(Math.abs(c.direct + c.funds + c.etfs - c.all)).toBeLessThan(1e-9);
    fireEvent.click(screen.getByRole("button", { name: "Held twice" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);          // header + HDFC Bank
    fireEvent.click(screen.getByRole("button", { name: "Only through funds and ETFs" }));
    expect(within(screen.getByRole("table")).getByRole("row", { name: /ICICI Bank/ })).toBeTruthy();
    expect(segRows(ANSWER().companies, "through").map((c) => c.symbol)).toEqual(["ICICIBANK"]);
    expect(document.body.textContent).toMatch(/Holdings inside funds can have changed since the fund house published its file/);
    expect(screen.getByRole("heading", { name: "Sectors, counted through everything" })).toBeTruthy();
    expect(document.querySelector(".mi-sectors")!.textContent).toMatch(/Banks.*27%.*Nifty 500.*25%/);
  });
  it("Risk: swing, worst fall, beta ('moved 8.6% for a 10% market move'), falls taken, and where the swings come from", async () => {
    mount(); await screen.findByText("Where your money sits");
    fireEvent.click(screen.getByRole("tab", { name: /Risk/ }));
    const rk = document.querySelector(".mi-rks")!.textContent!;
    expect(rk).toMatch(/Swing a year12\.6%Nifty 500: 14\.3%/); expect(rk).toMatch(/Worst fall−16\.2%Nifty 500: −18\.8%/);
    expect(rk).toMatch(/Beta0\.86moved 8\.6% for a 10% market move/); expect(rk).toMatch(/Falls taken79%of the Nifty 500's down weeks/);
    expect(document.body.textContent).toMatch(/It describes the past; it is not a forecast/);
    expect(document.body.textContent).toMatch(/Shares are 48% of your money but 68% of the ups and downs\./);
  });
  it("six questions, the disclaimer and the AMFI line; no advice words", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect([...document.querySelectorAll(".mi-faq summary")].map((s) => s.textContent)).toEqual(["Where do the numbers come from?", "Why do I need quantities?", "How are funds and ETFs looked through?",
      "What does my plan show here?", "Why is a company counted three times?", "Is anything sent to my broker?"]);
    const text = document.body.textContent || "";
    expect(text).toMatch(/subject to market risks/); expect(text).toMatch(/not investment advice/i);
    expect(text).not.toMatch(/\b(buy|sell|accumulate|avoid|recommended|best|target)\b/i);
    expect(rupees(61400)).toBe("₹61,400"); expect(rupees(14200000)).toBe("₹1.42 crore");
  });
  it("an empty account is told where to add holdings", async () => {
    st.answer = ANSWER({ parts: { ...ANSWER().parts, shares: { ...ANSWER().parts.shares, count: 0 }, funds: { ...ANSWER().parts.funds, count: 0 } } });
    mount();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Nothing to read yet" })).toBeTruthy());
  });
});
