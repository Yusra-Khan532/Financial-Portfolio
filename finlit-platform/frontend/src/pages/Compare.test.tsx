// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../lib/screener";

const st = vi.hoisted(() => ({ plan: "gold" as "basic" | "silver" | "gold", rows: [] as unknown[], upgrade: vi.fn(), go: vi.fn() }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: st.plan, upgrade: st.upgrade, has: (t: string) => t === "basic" || (t === "silver" && st.plan !== "basic") || (t === "gold" && st.plan === "gold") }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/screener", async (orig) => ({ ...(await orig<typeof import("../lib/screener")>()), useUniverse: () => ({ data: { rows: st.rows, sample: true }, isLoading: false, isError: false }) }));
vi.mock("react-router", async (orig) => ({ ...(await orig<typeof import("react-router")>()), useNavigate: () => st.go }));
import { Compare } from "./Compare";

const base = { sector: "Energy", price: 100, change_pct: 1, market_cap: 1000, pe: 10, roe: 12, debt_to_equity: 0.5, overall: 66, band: "healthy", pillar_quality: 60, pillar_growth: 50, pillar_profitability: 55, pillar_balance: 70, pillar_technical: 40 };
const row = (sym: string, prism: number | null): Row => ({ ...base, symbol: sym, name: sym + " Ltd", prism_final: prism, prism_label: prism == null ? null : prism >= 65 ? "HEALTHY" : "AVERAGE", prism_status: prism == null ? null : "RATED", prism_state: prism == null ? "none" : "stored", prism_fundamental: prism, prism_valuation: prism, prism_quality: prism, prism_risk: prism } as unknown as Row);
const view = () => render(<MemoryRouter initialEntries={["/compare?c=AAA,BBB"]}><Compare /></MemoryRouter>);

beforeEach(() => { st.rows = [row("AAA", 71), row("BBB", null), row("CCC", 55)]; });
afterEach(cleanup);

describe("Compare: one score per plan (tasks #13, #100)", () => {
  it("Gold sees FinLit Prism only: no model toggle, no FinLit IQ card and no pillar card (task #100)", () => {
    st.plan = "gold"; const { container } = view();
    expect(screen.queryByRole("button", { name: "FinLit IQ" })).toBeNull();
    expect(container.querySelectorAll(".cc-prism")).toHaveLength(2);
    expect(container.querySelectorAll(".cc-s:not(.cc-prism)")).toHaveLength(0);
    expect(container.textContent).toContain("The FinLit Prism parts");
    expect(container.textContent).not.toContain("The five FinLit pillars");
  });
  it("a company with no stored Prism rating says so instead of a number", () => {
    st.plan = "gold"; const { container } = view();
    const cards = [...container.querySelectorAll(".cc-prism")].map((c) => c.textContent);
    expect(cards[0]).toContain("71"); expect(cards[1]).toContain("Not rated yet");
  });
  it("Silver sees only FinLit IQ: no model toggle and no Prism anywhere", () => {
    st.plan = "silver"; const { container } = view();
    expect(screen.queryByRole("button", { name: "FinLit Prism" })).toBeNull();
    expect(container.querySelectorAll(".cmp-models")).toHaveLength(0);
    expect(container.querySelector(".cmp-cards")!.textContent).not.toContain("FinLit Prism");   // (the page header names Prism as a link, so only the comparison is checked)
    expect(container.textContent).not.toContain("The FinLit Prism parts");
    expect(container.querySelector(".cmp-cards")!.textContent).toContain("FinLit IQ");
  });
});


describe("Compare: the Stress test tab (task 79, SL-7)", () => {
  beforeEach(() => { st.upgrade.mockClear(); st.go.mockClear(); });
  it("is a tab beside the others, after Technical and before Build your own", () => {
    st.plan = "gold"; view();
    const names = screen.getAllByRole("tab").map((x) => x.textContent);
    expect(names).toEqual(["Overview", "Financials", "Spider", "Valuation", "Quality & Risk", "Growth", "Technical", "Stress test", "Build your own"]);
  });
  it("opens the Gold compare view of Stress Lab for the two companies picked, for Gold", () => {
    st.plan = "gold"; view();
    fireEvent.click(screen.getByRole("tab", { name: "Stress test" }));
    expect(st.go).toHaveBeenCalledWith("/research/stress-lab/AAA?with=BBB#compare");
  });
  it("Silver and Basic see a lock on the tab and are told what Gold adds, and nothing opens", () => {
    for (const plan of ["silver", "basic"] as const) {
      st.plan = plan; st.upgrade.mockClear(); const { unmount } = view();
      expect(screen.getByRole("tab", { name: "Stress test" }).querySelector("svg")).toBeTruthy();
      fireEvent.click(screen.getByRole("tab", { name: "Stress test" }));
      expect(st.upgrade).toHaveBeenCalledWith("gold", expect.stringMatching(/Gold/)); expect(st.go).not.toHaveBeenCalled();
      unmount();
    }
  });
});
