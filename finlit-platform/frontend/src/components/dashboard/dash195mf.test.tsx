// @vitest-environment jsdom
// Task #195: "Your mutual funds at a glance" draws the shared Prism ring with one arc per fund, each filled to its FundPulse (29 / 100 POOR with one fund),
// and the link to the MF portfolio sits at the bottom; "Your ETFs at a glance" is a one-line strip with an empty ring until ETFs are added.
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const fund = (code: number, score: number, label: string) => ({ id: "f" + code, code, name: `Fund ${code} - Direct Growth`, weight: null, returns: { r1y: 12.7 }, score: { final: score, label, locked: false, parts: null, reason: null } });
let holdings = [fund(101, 29, "Poor")];
let etfCount = 0;
vi.mock("../../lib/ui", async (orig) => ({ ...(await orig<typeof import("../../lib/ui")>()), useUI: () => ({ has: () => true, plan: "gold" }) }));
vi.mock("../../lib/mfPortfolio", () => ({
  useMfPortfolio: () => ({ isLoading: false, isError: false, data: { count: holdings.length, dataDate: "2026-11-15", holdings, summary: { score: { value: holdings.length === 1 ? 29 : 58, label: holdings.length === 1 ? "Poor" : "Average", locked: false } } } }),
  useMfSpread: () => ({ isLoading: false, data: null }),
}));
// task #223 (D2): the ETF portfolio of 17 Nov from the pack: two share ETFs, gold and silver, equal weights until quantities are in
const TYPE: Record<string, { key: string; word: string }> = { equity: { key: "indian", word: "Indian shares" }, gold: { key: "gold", word: "Gold" }, silver: { key: "silver", word: "Silver" } };
const ETF = (symbol: string, assetClass: string, key: string, ter: number, premium: number) => ({ symbol, name: symbol + " ETF", gone: false, assetClass, type: TYPE[assetClass], tracks: { key, label: key, basis: "index" },
  twice: false, qty: null, weight: 25, price: 100, changePct: 0.1, priceDate: "2026-11-17", ret1y: 5, premium, navDate: "2026-11-17", ter: { value: ter } });
const ETFS = [ETF("MID150BEES", "equity", "nifty-midcap-150", 0.21, -0.13), ETF("SMALL250", "equity", "nifty-smallcap-250", 0.35, 0.07), ETF("GOLDBEES", "gold", "gold", 0.79, 0.03), ETF("SILVERBEES", "silver", "silver", 0.65, -0.07)];
vi.mock("../../lib/etfPortfolio", () => ({
  useEtfPortfolio: () => ({ data: { count: etfCount, items: ETFS.slice(0, etfCount), basis: "equal", repeats: [], asOf: "2026-11-17" }, isLoading: false, isError: false }),
  useEtfRisk: () => ({ data: { list: { swing: 25.3, level: { word: "Higher", vs: "Nifty 500", because: "because three of your four ETFs swing more than it" }, why: null }, bench: { name: "Nifty 500", swing: 14.3 } }, isLoading: false, isError: false }),
}));

const { FundsGlance, EtfsGlance } = await import("./FundsGlance");
const show = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>).container;
afterEach(cleanup);

describe("Your mutual funds at a glance on the Prism ring", () => {
  it("one fund: one arc filled to its score, 29 / 100 POOR, the link at the bottom", () => {
    holdings = [fund(101, 29, "Poor")];
    const c = show(<FundsGlance />);
    expect(c.querySelectorAll(".srg-fill")).toHaveLength(1);
    expect([...c.querySelectorAll(".srg text")].map((t) => t.textContent)).toEqual(["29", "/ 100", "POOR"]);
    const card = c.querySelector("section.dsh-card")!;
    expect(card.lastElementChild!.textContent).toBe("Open the MF portfolio →");
  });
  it("three funds: three arcs, each in its own band colour", () => {
    holdings = [fund(1, 82, "Strong"), fund(2, 55, "Average"), fund(3, 30, "Poor")];
    const c = show(<FundsGlance />);
    const arcs = [...c.querySelectorAll(".srg-fill")].map((p) => (p.parentElement as HTMLElement).style.getPropertyValue("--pc"));
    expect(arcs).toEqual(["var(--band-hi)", "var(--band-mid)", "var(--band-lo)"]);
  });
});

describe("Your ETFs at a glance (task #223, D2)", () => {
  it("no ETFs: the short strip with the link to add them, and no empty score ring", () => {
    etfCount = 0;
    const c = show(<EtfsGlance />);
    const strip = c.querySelector("section.dsh-strip1")!;
    expect(strip.querySelector(".srg")).toBeNull();
    expect(strip.querySelector("h2")!.textContent).toBe("Your ETFs at a glance");
    expect(strip.querySelector("a")!.textContent).toBe("Add your ETFs on the ETF portfolio page →");
    expect(strip.querySelector("a")!.getAttribute("href")).toBe("/etf-portfolio");
  });
  it("with ETFs: a full card with the ETF page's figures, no empty ring and no placeholder sentence", () => {
    etfCount = 4;
    const c = show(<EtfsGlance />);
    const card = c.querySelector("section.dsh-eg")!;
    expect(card).toBeTruthy(); expect(c.querySelector(".dsh-strip1")).toBeNull(); expect(card.querySelector(".srg")).toBeNull();
    expect(card.textContent).not.toMatch(/have no score of their own yet|No ETFs added yet/);
    expect(card.querySelector(".dsh-sub")?.textContent ?? card.textContent).toContain("4 ETFs · NSE closes of 17 Nov · from your ETF portfolio");
    expect(card.querySelector(".dsh-pg-ringw")!.getAttribute("aria-label")).toBe("What your 4 ETFs track: 2 Indian shares · 1 gold · 1 silver");
    expect([...card.querySelectorAll(".dsh-pg-legend span")].map((x) => x.textContent)).toEqual(["2 Indian shares", "1 gold", "1 silver"]);
    expect(card.querySelector(".eg-risk .eg-hi")!.textContent).toBe("Higher");
    expect(card.querySelector(".eg-risk")!.textContent).toBe("Higher than the Nifty 500, because three of your four ETFs swing more than it");
    const kv = Object.fromEntries([...card.querySelectorAll(".eg-kv div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]));
    expect(kv).toEqual({ "Yearly cost": "0.50% a year · about ₹500 on ₹1 lakh", "Price against NAV": "Close to NAV · 4 of 4 closed within 0.2%", "Swing a year": "25.3% · Nifty 500 14.3%", "What they follow": "4 indexes" });
    expect([...card.querySelectorAll("a")].pop()!.getAttribute("href")).toBe("/etf-portfolio");
  });
});
