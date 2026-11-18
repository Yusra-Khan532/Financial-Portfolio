// @vitest-environment jsdom
// Task #183 part 3 (the 15 Nov pack 03): the ETF portfolio page on the same parts as the Equity and MF pages. The plan gate (Silver and up), the real plan on the
// badge, the dark list box and one tile per tab (each opens its tab), Key figures per tab, the numbered sections bar, the three tabs, Clear portfolio, the seven
// questions and the sources line. Figures: the new server code run on live public data of 18 Nov for the pack's seven ETFs (lib/__fixtures__/etfp-*.json).
import LIST from "../lib/__fixtures__/etfp-list.json";
import RISK from "../lib/__fixtures__/etfp-risk.json";
import INSIDE from "../lib/__fixtures__/etfp-inside.json";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const FX = (n: string): unknown => JSON.parse(JSON.stringify(({ list: LIST, risk: RISK, inside: INSIDE } as Record<string, unknown>)[n]));
const st = vi.hoisted(() => ({ plan: "gold", remove: vi.fn(async () => ({})), clear: vi.fn(async () => ({ removed: 7, undoSeconds: 10 })), undo: vi.fn(async () => ({ restored: 7 })), list: null as unknown }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: st.plan, has: (t: string) => ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[st.plan] >= ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[t], upgrade: vi.fn(), toast: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/etfPortfolio", async (orig) => {
  const m = await orig<typeof import("../lib/etfPortfolio")>();
  const mut = { mutateAsync: vi.fn(), isPending: false };
  return { ...m, useEtfPortfolio: (on: boolean) => ({ data: on ? st.list : undefined, isPending: false, isError: false }),
    useEtfRisk: () => ({ data: FX("risk"), isPending: false, isError: false }), useEtfInside: () => ({ data: FX("inside"), isPending: false, isError: false }),
    useEtfWrites: () => ({ add: mut, quantities: mut, preview: mut, commit: mut, clear: { mutateAsync: st.clear, isPending: false }, undoClear: { mutateAsync: st.undo, isPending: false }, remove: { mutateAsync: st.remove, isPending: false } }) };
});
import { EtfPortfolioPage } from "./EtfPortfolio";

afterEach(() => { cleanup(); localStorage.clear(); });
const open = (path = "/etf-portfolio") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}><MemoryRouter initialEntries={[path]}><EtfPortfolioPage /></MemoryRouter></QueryClientProvider>);
const tab = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));

describe("ETF portfolio: the top of the page (#183 part 3)", () => {
  it("Basic sees the plan gate, not the list", () => {
    st.plan = "basic"; st.list = FX("list");
    open();
    expect(document.querySelector(".eqt-grid")).toBeNull();
    expect(screen.getByText("Track your ETFs")).toBeTruthy();
  });
  it("shows the account's plan, the count against the plan, the links, and the search by name, symbol or ISIN", () => {
    st.plan = "gold"; st.list = FX("list");
    open();
    expect(document.querySelector(".mfp-plan")!.textContent).toBe("Gold");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ETF portfolio");
    expect(screen.getByText("7 ETFs · 15 on your plan")).toBeTruthy();
    expect(screen.getAllByRole("link").map((a) => a.textContent).filter((t) => /→$/.test(t || "")).slice(0, 4)).toEqual(["All my investments →", "MF portfolio →", "Equity portfolio →", "Compare ETFs →"]);
    expect(screen.getByPlaceholderText("Search an ETF by name, symbol or ISIN…")).toBeTruthy();
    expect(document.querySelector(".mfp-isinnote")!.textContent).toMatch(/^Each ETF is read by its ISIN; a row without one is matched on the NSE symbol/);
  });
  it("opens with the list box and three tiles; the Nifty 50 twice tag; each tile opens its tab", () => {
    st.plan = "gold"; st.list = FX("list");
    open();
    const box = document.querySelector(".mfp-listbox")!;
    expect(box.textContent).toMatch(/Your ETF list.*7 ETFs.*4 Indian shares · 1 gold · 1 shares abroad · 1 liquid\. Every ETF counts the same until you add quantities\.Add quantities/);
    const tiles = [...document.querySelectorAll(".eqt-tile")];
    expect(tiles.map((t) => t.querySelector(".eqt-k")!.firstChild!.textContent)).toEqual(["Your ETFs", "What's inside", "Risk analytics"]);
    expect(tiles[0].querySelector(".eqt-v")!.textContent).toBe("0.34% a year");
    expect(tiles[0].querySelector(".eqt-x")!.textContent).toBe("Average cost. MON100 closed 20.8% above its value; the other six within 0.2%");
    expect(tiles[1].querySelector(".eqt-v")!.textContent).toBe("6 indexesNIFTY 50 TWICE");
    expect(tiles[1].querySelector(".eqt-x")!.textContent).toMatch(/^The list moves like \d\.\d of 6 ETFs; NIFTYBEES and SBINIFTY50 hold the same 50 companies$/);
    expect(tiles[2].querySelector(".eqt-v")!.textContent).toBe("Lower · β 0.63");
    expect(tiles[2].querySelector(".eqt-x")!.textContent).toBe("Against the Nifty 500; swings 10.6% a year vs 14.6% over 3 years");
    fireEvent.keyDown(tiles[2], { key: "Enter" });
    expect(screen.getByRole("tab", { name: /Risk analytics/ }).getAttribute("aria-selected")).toBe("true");
  });
  it("puts Key figures and a numbered sections bar on each tab", () => {
    st.plan = "gold"; st.list = FX("list");
    open();
    const kf = () => [...document.querySelectorAll(".eqt-kf .eqt-card")].map((c) => `${c.querySelector(".eqt-k")!.textContent}: ${c.querySelector(".eqt-v")!.textContent}`);
    const chips = () => [...document.querySelectorAll(".eqt-bar .eqt-chip")].map((c) => c.textContent);
    expect(kf()).toEqual(["Same index twice: Nifty 50 × 2", "Far above its value: MON100 +20.8%", "Yearly cost: 0.34%"]);
    expect(chips()).toEqual(["1Your ETFs"]);
    tab(/What's inside/);
    expect(kf()[0]).toBe("Near-identical pair: 100.0% overlap");
    expect(kf()[1]).toMatch(/^Moves like: \d\.\d of 6$/);
    expect(kf()[2]).toBe("One file missing: HDFCSML250");
    expect(chips()).toEqual(["1What they own", "2Money in", "3Sectors inside", "4Move together", "5Shared stocks", "6Company sizes", "7Largest stocks"]);
    tab(/Risk analytics/);
    expect(kf().slice(0, 2)).toEqual(["Moves less than the market: β 0.63", "Most risk for its size: MON100 21%"]);
    expect(kf()[2]).toMatch(/^Low beta, big swings: GOLDBEES \d+\.\d%$/);
    expect(chips()).toEqual(["1At a glance", "2Beta build", "3Against the Nifty 500", "4If the Nifty 500 fell", "5Risk share", "6Each ETF"]);
  });
});

describe("Your ETFs, Clear portfolio, the questions and the foot (#183 part 3)", () => {
  it("lists each ETF with its ISIN, the TWICE tag, AMFI's expense ratio and the list average; Trading shows red at 1% or more with the NAV's date", () => {
    st.plan = "gold"; st.list = FX("list");
    open();
    const row = (s: string) => screen.getAllByRole("link", { name: s })[0].closest("tr")!;
    expect(row("NIFTYBEES").querySelector(".mfp-isin")!.textContent).toBe("INF204KB14I2");
    expect([...document.querySelectorAll(".etp-twice")].map((t) => t.closest("tr")!.querySelector(".mfp-fund")!.textContent)).toEqual(["HDFCSML250", "GOLDBEES", "LIQUIDCASE", "MID150BEES", "MON100", "NIFTYBEES", "SBINIFTY50"].filter((s) => /NIFTY/.test(s) && s !== "MID150BEES"));
    expect(row("GOLDBEES").textContent).toMatch(/0\.81%$/);
    expect(document.querySelector("tfoot")!.textContent).toMatch(/^List average.*0\.34%$/);
    expect(screen.getByText(/Expense ratios from AMFI's TER file/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/sample/i);
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));
    const mon = row("MON100");
    expect(mon.querySelector(".sp-red")!.textContent).toBe("+20.80%");
    expect(mon.textContent).toMatch(/NAV of 16 Nov/);
    expect(row("NIFTYBEES").querySelector(".sp-red")).toBeNull();
    expect(row("GOLDBEES").textContent).toMatch(/Needs index closes/);
  });
  it("sorts every heading both ways, groups by type, and words the liquid ETF by its type (growth here)", () => {
    st.plan = "gold"; st.list = FX("list");
    open();
    const order = () => [...document.querySelectorAll("tbody .mfp-fund")].map((a) => a.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Expense ratio" }));
    expect(order()[0]).toBe("NIFTYBEES");
    fireEvent.click(screen.getByRole("button", { name: /Expense ratio/ }));
    expect(order()[0]).toBe("GOLDBEES");
    expect(screen.getByText("The liquid ETF grows in price")).toBeTruthy();
    expect(screen.queryByText(/earns through payouts/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "By type" }));
    expect([...document.querySelectorAll(".mff-grow button")].map((b) => b.textContent!.split(" · ")[0])).toEqual(["Indian shares", "Gold", "Shares abroad", "Liquid"]);
  });
  it("removes one ETF, and Clear portfolio asks first, then offers Undo", async () => {
    st.plan = "gold"; st.list = FX("list");
    open();
    fireEvent.click(screen.getByRole("button", { name: "Remove MON100" }));
    expect(st.remove).toHaveBeenCalledWith("MON100");
    fireEvent.click(screen.getByRole("button", { name: "Clear portfolio" }));
    const dlg = screen.getByRole("dialog");
    expect(dlg.textContent).toMatch(/7 ETFs/);
    fireEvent.click(within(dlg).getByRole("button", { name: /Clear/ }));
    await screen.findByRole("button", { name: /Undo/ });
    expect(st.clear).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(st.undo).toHaveBeenCalled();
  });
  it("ends with the seven questions, what this means in short, and the sources line", () => {
    st.plan = "gold"; st.list = FX("list");
    open();
    expect(screen.getByText("Why is the beta against the Nifty 500 and not each ETF's own index?")).toBeTruthy();
    expect(screen.getByText("What this means, in short")).toBeTruthy();
    expect(document.querySelector(".mfs-short")!.textContent).toMatch(/NIFTYBEES and SBINIFTY50 hold the same 50 companies \(100\.0% overlap\); together they are 29% of the list\./);
    expect(document.querySelector(".mfp-foot")!.textContent).toMatch(/Information only, not investment advice\.$/);
  });
});
