// @vitest-environment jsdom
// Task #136: the ETF portfolio page. The plan gate (Silver and up), the "Twice" tag, the three column sets, equal weights until quantities are added,
// the tiles linking to their tab, the questions above the disclaimer, and remove. Figures from the live-data fixture (lib/__fixtures__/etfp-*.json).
import LIST from "../lib/__fixtures__/etfp-list.json";
import RISK from "../lib/__fixtures__/etfp-risk.json";
import INSIDE from "../lib/__fixtures__/etfp-inside.json";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const FX = (n: string): unknown => JSON.parse(JSON.stringify(({ list: LIST, risk: RISK, inside: INSIDE } as Record<string, unknown>)[n]));
const st = vi.hoisted(() => ({ plan: "silver", remove: vi.fn(async () => ({})), list: null as unknown }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: st.plan, has: (t: string) => ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[st.plan] >= ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[t], upgrade: vi.fn(), toast: vi.fn() }) }));
vi.mock("../components/CoLogo", () => ({ CoLogo: () => null }));
vi.mock("../lib/etfPortfolio", async (orig) => {
  const m = await orig<typeof import("../lib/etfPortfolio")>();
  const mut = { mutateAsync: vi.fn(), isPending: false };
  return { ...m, useEtfPortfolio: (on: boolean) => ({ data: on ? st.list : undefined, isPending: false, isError: false }),
    useEtfRisk: () => ({ data: FX("risk"), isPending: false, isError: false }), useEtfInside: () => ({ data: FX("inside"), isPending: false, isError: false }),
    useEtfWrites: () => ({ add: mut, quantities: mut, clear: mut, preview: mut, commit: mut, remove: { mutateAsync: st.remove, isPending: false } }) };
});
import { EtfPortfolioPage } from "./EtfPortfolio";

afterEach(cleanup);
const open = (path = "/etf-portfolio") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}><MemoryRouter initialEntries={[path]}><EtfPortfolioPage /></MemoryRouter></QueryClientProvider>);
const heads = () => [...document.querySelectorAll(".efp-tb thead th")].map((t) => t.firstChild?.textContent);   // the heading words, without the help button

describe("ETF portfolio (#136)", () => {
  it("Basic sees the plan gate, not the list", () => {
    st.plan = "basic"; st.list = FX("list");
    open();
    expect(document.querySelector(".mfp-tiles")).toBeNull();
    expect(screen.getByText("Track your ETFs")).toBeTruthy();
  });
  it("Silver: header, count against the plan, five tiles, the Twice tag on both Nifty 50 ETFs", () => {
    st.plan = "silver"; st.list = FX("list");
    open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ETF portfolio");
    expect(screen.getByText("5 ETFs · 15 on your plan")).toBeTruthy();
    expect(screen.getAllByRole("link").map((a) => a.textContent).filter((t) => /→$/.test(t || "")).slice(0, 4)).toEqual(["All my investments →", "MF portfolio →", "Equity portfolio →", "Compare ETFs →"]);
    expect(document.querySelectorAll(".mfp-tile")).toHaveLength(5);
    const twice = [...document.querySelectorAll(".efp-tb tbody tr")].filter((r) => r.querySelector(".efp-twice")).map((r) => r.querySelector(".efp-sym")?.textContent);
    expect(twice).toEqual(["NIFTYBEES", "SBINIFTY50"]);
    expect(screen.getByText("Nifty 50 twice")).toBeTruthy();
    expect(screen.getByText(/Each ETF counts the same until you add quantities\./)).toBeTruthy();
  });
  it("the three column sets, each with its note", () => {
    st.plan = "silver"; st.list = FX("list");
    open();
    expect(heads().slice(2, 7)).toEqual(["Price", "1 day", "1 year", "5 years", "Expense ratio"]);
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));
    expect(heads().slice(2, 5)).toEqual(["Price vs NAV", "Traded a day", "Tracking difference, 1 year"]);
    expect(screen.getByText(/Traded a day is the average value traded over 20 sessions/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Risk" }));
    expect(heads().slice(2, 6)).toEqual(["Swing a year", "Worst fall, 3 years", "Beta", "Falls taken"]);
    expect(screen.getByText("From daily prices over 3 years. Beta and falls taken are against the Nifty 500.")).toBeTruthy();
    expect(document.querySelector(".efp-tb")!.textContent).toContain("−27%");                 // a minus sign, not a hyphen
  });
  it("a tile opens its tab; the questions sit above the disclaimer", () => {
    st.plan = "silver"; st.list = FX("list");
    open();
    fireEvent.click(screen.getByRole("button", { name: "See risk analytics →" }));
    expect(screen.getByRole("tab", { name: /Risk analytics/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Risk level: lower than the Nifty 500/)).toBeTruthy();
    const faq = document.querySelector(".pfq-in")!, disc = document.querySelector(".pdisc")!;
    expect(faq.compareDocumentPosition(disc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(faq as HTMLElement).getAllByRole("button").filter((b) => b.classList.contains("pfq-q"))).toHaveLength(6);
  });
  it("what's inside shows the mix, the overlap and the largest stocks", () => {
    st.plan = "silver"; st.list = FX("list");
    open("/etf-portfolio?view=inside");
    expect(document.querySelector(".efp-legend")!.textContent).toBe("Indian shares 40%Shares abroad 20%Gold 20%Debt or overnight lending 20%");
    expect(screen.getByText("NIFTYBEES and SBINIFTY50: 100% the same companies")).toBeTruthy();
    expect(screen.getAllByText("Not compared: listed abroad").length).toBeGreaterThan(0);
  });
  it("✕ removes that ETF", () => {
    st.plan = "silver"; st.list = FX("list");
    open();
    fireEvent.click(screen.getByRole("button", { name: "Remove Motilal Oswal Nasdaq 100 ETF" }));
    expect(st.remove).toHaveBeenCalledWith("MON100");
  });
});
