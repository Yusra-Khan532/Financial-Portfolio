// @vitest-environment jsdom
// Task #130: /funds redesign. Category scores (word bands, "See these funds" button, one ELSS footnote), the compare bar, the order of the page's
// sections and the wording of the score screener card. Task #344: the six category cards became "Frequently visited funds", a row of names in the
// category box with an (i) that shows what the cards said; these tests follow them there.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const st = vi.hoisted(() => ({ plan: "gold" as "basic" | "gold", routes: {} as Record<string, unknown> }));
vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (path: string) => { const k = Object.keys(st.routes).find((r) => path.startsWith(r)); if (!k) throw new Error("no route " + path); return st.routes[k]; }),
}));
vi.mock("../lib/ui", () => ({
  useUI: () => ({ has: (t: string) => st.plan === "gold" || t === "basic", upgrade: vi.fn(), toast: vi.fn() }),
  TIER: { gold: { n: "Gold", tc: "--gold", ic: "star" }, silver: { n: "Silver", tc: "--silver", ic: "star" } },
}));
import { FrequentFunds } from "./Dashboard";
import { CompareBar } from "../pages/Funds";
import { rememberName } from "../lib/mf";
import { ELSS_FOOTNOTE } from "../lib/mfCategories";

const q = { tab: "equity", cats: null } as unknown as Parameters<typeof FrequentFunds>[0]["q"];
const wrap = (ui: React.ReactNode) => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>); };
beforeEach(() => { st.plan = "gold"; st.routes = { "/api/mf/scores/categories": { runDate: "2026-11-14", items: { "large-cap": { n: 30, median: 58.2, green: 3, orange: 20, red: 7 } } } }; });
afterEach(cleanup);

describe("frequently visited funds (task #344; the C-1 to C-4 card content behind the (i))", () => {
  const openInfo = () => fireEvent.click(screen.getByRole("button", { name: "What these funds are" }));
  it("one row of the six names; a name hands its category to the page and shows pressed when it is the one shown", () => {
    const onPick = vi.fn();
    wrap(<FrequentFunds q={{ ...q, cats: ["flexi-cap"] } as typeof q} onPick={onPick} onScore={() => {}} />);
    const row = screen.getByRole("group", { name: "Frequently visited funds" });
    const names = [...row.querySelectorAll("button.mf-freq-b")].map((b) => b.textContent);
    expect(names).toEqual(["ELSS (Tax Savings)", "Large-Cap Funds", "Flexi Cap Funds", "Small-Cap Funds", "Money Market Funds", "Corporate Bonds"]);
    expect(screen.getByRole("button", { name: "Flexi Cap Funds" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Large-Cap Funds" }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ key: "large-cap", tab: "equity" }));
    expect(screen.queryByText(ELSS_FOOTNOTE)).toBeNull();      // the details stay behind the (i) until asked for
  });
  it("the (i) shows what each is: its lines, the bands in words and one ELSS footnote", async () => {
    wrap(<FrequentFunds q={q} onPick={() => {}} onScore={() => {}} />);
    openInfo();
    expect(screen.getByText(/Established companies\. Usually swing less than smaller companies\./)).toBeTruthy();
    await screen.findByText(/Healthy or strong 10%/);
    expect(screen.getAllByText(ELSS_FOOTNOTE)).toHaveLength(1);
    const text = document.body.textContent || "";
    expect(text).not.toMatch(/\b(green|orange|red)\b/i);
    expect(text).not.toMatch(/\b(buy|sell|hold|best|avoid)\b/i);
  });
  it("'See these funds by Mutual Fund Score' (inside the (i)) hands the category to the page (Gold)", async () => {
    const onScore = vi.fn();
    wrap(<FrequentFunds q={q} onPick={() => {}} onScore={onScore} />);
    openInfo();
    fireEvent.click(await screen.findByRole("button", { name: /See these 30 funds by Mutual Fund Score/ }));
    expect(onScore).toHaveBeenCalledWith(expect.objectContaining({ key: "large-cap", tab: "equity" }));
  });
  it("below Gold: no score number and no request", async () => {
    st.plan = "basic"; st.routes = {};
    wrap(<FrequentFunds q={q} onPick={() => {}} onScore={() => {}} />);
    openInfo();
    await waitFor(() => expect(screen.getAllByText("Mutual Fund Score: part of the Gold plan").length).toBe(6));
    expect(screen.queryByText(/See these \d+ funds/)).toBeNull();
  });
});

describe("compare bar (C-9)", () => {
  it("is hidden with nothing ticked, asks for one more with one, and compares 2 to 4", () => {
    const { container, rerender } = render(<CompareBar tray={[]} onClear={() => {}} onOpen={() => {}} />);
    expect(container.textContent).toBe("");
    rememberName(101, "Alpha Flexi Cap Fund"); rememberName(102, "Beta Large Cap Fund");
    const onOpen = vi.fn();
    rerender(<CompareBar tray={[101]} onClear={() => {}} onOpen={onOpen} />);
    expect(screen.getByText("Tick one more fund to compare.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Compare 1 fund →" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<CompareBar tray={[101, 102]} onClear={() => {}} onOpen={onOpen} />);
    expect(screen.getByText("Alpha Flexi Cap Fund")).toBeTruthy();
    expect(screen.getByText("Beta Large Cap Fund")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Compare 2 funds →" }));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("page layout (C-5, C-6, C-12)", () => {
  const src = readFileSync(resolve(__dirname, "../pages/Funds.tsx"), "utf8");
  it("no separate category cards (task #344): the promo cards, then the picker carrying the frequently visited funds", () => {
    expect(src).not.toContain("<CategoryCards");
    const b = src.indexOf('to="/funds/insights"'), c = src.indexOf('to="/fund-score-screener"'), d = src.indexOf("<CategoryPicker");
    expect(b).toBeGreaterThan(0); expect(b).toBeLessThan(c); expect(c).toBeLessThan(d);
    expect(src.slice(d, src.indexOf("/>", d))).toContain("frequent={{ onPick:");
  });
  it("the score screener card has no plan tag and no download wording", () => {
    const card = src.slice(src.indexOf('to="/fund-score-screener"'), src.indexOf("<CategoryPicker"));
    expect(card).not.toMatch(/evi-badge|Gold|download|CSV/i);
  });
  it("the Gold sort is only asked for when the plan allows it", () => {
    expect(src).toMatch(/canScore \? \{ sort: "score"/);
  });
});
