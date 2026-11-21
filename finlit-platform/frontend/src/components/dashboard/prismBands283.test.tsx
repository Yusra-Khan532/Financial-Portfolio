// @vitest-environment jsdom
// Task #283: FinLit Prism's words (Strong 80+, Healthy 65 to 79, Average 50 to 64, Weak below 50) are the only band words for companies: "Watchlist by band" and
// "Worth a second look" on the dashboard read FinLit Prism, never the retired score's Mixed or Watch.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../../lib/screener";

const st = vi.hoisted(() => ({ model: "prism" as "prism" | null }));
vi.mock("../../lib/planScore", async (orig) => ({ ...(await orig<typeof import("../../lib/planScore")>()), usePlanModel: () => st.model }));
import { Buckets, SecondLook, secondLook } from "./Legacy";
import { PRISM_BANDS, prismBandOf } from "../../lib/planScore";
import { WIDGETS } from "../../lib/prefs";
import { PLAN_FOR_PRISM } from "../../lib/planGates";

afterEach(() => { cleanup(); st.model = "prism"; });
const row = (symbol: string, prism: number | null, valuation: number | null, extra: Partial<Row> = {}) =>
  ({ symbol, name: symbol + " Ltd", sector: null, overall: 40, band: "watch", prism_final: prism, prism_label: null, prism_valuation: valuation, ...extra } as unknown as Row);

describe("FinLit Prism's four bands", () => {
  it("are Strong, Healthy, Average and Weak at 80, 65 and 50", () => {
    expect(PRISM_BANDS.map((b) => b.word)).toEqual(["Strong", "Healthy", "Average", "Weak"]);
    expect([92, 80, 79.9, 65, 64.96, 50, 49.9, 12, null].map(prismBandOf)).toEqual(["strong", "strong", "healthy", "healthy", "healthy", "average", "weak", "weak", null]);
  });
});

describe("Watchlist by band", () => {
  it("counts the watchlist in FinLit Prism's bands and never uses Mixed or Watch", () => {
    render(<MemoryRouter><Buckets items={[row("A", 85, 50), row("B", 70, 50), row("C", 66, 50), row("D", 55, 50), row("E", 20, 50), row("F", null, null)]} /></MemoryRouter>);
    const keys = [...document.querySelectorAll(".bandk li")].map((li) => li.textContent);
    expect(keys).toEqual(["Strong · Prism 80 or more1", "Healthy · Prism 65 to 792", "Average · Prism 50 to 641", "Weak · Prism below 501"]);
    expect(document.body.textContent).not.toMatch(/Mixed|Watch\b|\bIQ\b/);
  });
  it("is a FinLit Prism tile in Customise", () => {
    expect(WIDGETS.find((w) => w.id === "buckets")!.min).toBe(PLAN_FOR_PRISM);
  });
});

describe("Worth a second look", () => {
  it("lists Strong or Healthy FinLit Prism companies whose Valuation part is 65 or more, highest Valuation first", () => {
    expect(secondLook(row("A", 82, 70))).toBe("FinLit Prism 82, Strong · Valuation part 70");
    expect(secondLook(row("B", 64, 90))).toBeNull();          // Average: not listed
    expect(secondLook(row("C", 70, 60))).toBeNull();          // Valuation part below 65
    render(<MemoryRouter><SecondLook items={[row("A", 82, 70), row("B", 66, 88), row("C", 40, 95)]} /></MemoryRouter>);
    expect([...document.querySelectorAll(".sl li a")].map((a) => a.getAttribute("href"))).toEqual(["/stocks/B", "/stocks/A"]);
    expect(screen.getByText("Prism Healthy")).toBeTruthy(); expect(screen.getByText("Prism Strong")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Mixed|Watch\b|\bIQ\b/);
  });
  it("lists nothing on a plan without FinLit Prism, and the tile opens on that plan only", () => {
    st.model = null;
    render(<MemoryRouter><SecondLook items={[row("A", 82, 70)]} /></MemoryRouter>);
    expect(document.querySelectorAll(".sl li")).toHaveLength(0);
    expect(WIDGETS.find((w) => w.id === "second")!.min).toBe(PLAN_FOR_PRISM);
  });
});
