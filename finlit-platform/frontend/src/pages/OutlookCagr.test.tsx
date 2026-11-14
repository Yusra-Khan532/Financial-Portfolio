// @vitest-environment jsdom
// Task #146: on "Build your own growth model" each slider is that input's own expected growth rate (CAGR %), set on its own: not a weight, no total of 100.
// Every slider starts at the company's figure; moving one changes that one only, and only the moved rates are sent (the model's weights combine them).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: () => true, upgrade: vi.fn(), toast: vi.fn() }), TIER: { gold: { n: "Gold" }, silver: { n: "Silver" } } }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("../lib/demo", () => ({ DEMO: false }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</>, TierChip: () => null }));
vi.mock("../components/OutlookPicker", () => ({ OutlookPicker: () => <section aria-label="picker" /> }));
vi.mock("../components/PageHeader", () => ({ PageHeader: () => <header /> }));
vi.mock("../charts/OutlookChart", () => ({ OutlookChart: () => <div data-testid="chart" />, buildSeries: () => [] }));
const calls: unknown[] = [];
const figures: Record<string, Record<string, number | null>> = {
  profit: { co_1y: 18.4, co_3y: 12.1, co_5y: 9.6, sec_1y: 11, sec_3y: 8.2, sec_5y: 7.5, margin: null },
  revenue: { co_1y: 15.2, co_3y: 13.3, co_5y: 11.9, sec_1y: 9.4, sec_3y: 8.8, sec_5y: 8.1 },
};
vi.mock("../lib/outlook", async (orig) => {
  const real = await orig<typeof import("../lib/outlook")>();
  return { ...real, useOutlook: (_s: string, kind: "profit" | "revenue", horizon: string, values: unknown) => {
    calls.push({ kind, horizon, values });
    const rows = Object.entries(figures[kind]).map(([key, v]) => ({ key, label: real.PARAM_LABELS[kind][key], who: key.startsWith("sec") ? "sector" : "company", weightPct: 10, effectiveWeightPct: 10,
      valuePct: v, rawPct: v, capped: false, contributionPts: v == null ? null : v / 10, status: v == null ? "unavailable" : "ok", method: "x", reason: v == null ? "Not available" : null, detail: null }));
    const data = { symbol: "HDFCBANK", statement: "consolidated", kind, mode: values ? "custom" : "model", name: "HDFC Bank", isLender: true, asOf: { yearly: "FY26" }, reportGeneratedAt: null,
      weights: {}, defaultWeights: {}, adjustedYears: [], horizon: { key: horizon, years: 1, label: "Short-term", span: "1 year" }, history: { unit: "Rs crore", points: [] },
      rate: { ratePct: values ? 20 : 14.5, rows, unavailable: [], weightLeftPct: 100 }, forecast: { available: false, reason: "x", base: null, years: [], rule: "" }, inputCapPct: 50, minPeers: 5, disclaimer: "d" };
    return { data, isLoading: false, isFetching: false, error: null };
  } };
});
import { OutlookPage } from "./Outlook";

afterEach(cleanup);
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/outlook/HDFCBANK"]}><Routes><Route path="/outlook/:symbol" element={<OutlookPage />} /></Routes></MemoryRouter></QueryClientProvider>);
const sliders = () => within(screen.getByRole("group", { name: /Expected growth rate of each input/ })).getAllByRole("slider") as HTMLInputElement[];

describe("Build your own growth model: each input's own growth rate (task #146)", () => {
  it("is a growth rate from -50% to +50% a year per input, starting at the company's figure, with no 100% total anywhere", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Build your own growth model/ }));
    const s = sliders();
    expect(s.length).toBe(7);
    expect(s.map((x) => [x.min, x.max, x.step])).toEqual(Array(7).fill(["-50", "50", "0.1"]));
    expect(s[0].value).toBe("18.4"); expect(s[1].value).toBe("12.1");
    const box = screen.getByRole("heading", { name: /Build your own growth model: assumptions/ }).closest("section")!;
    expect(box.textContent).toContain("Company figure +18.4%"); expect(box.textContent).toContain("counts 35%");
    expect(box.textContent).toContain("No company figure; move it to use your own");       // margin has no figure: the slider says why
    expect(s[6].closest(".ol-sl")!.querySelector("output")!.textContent).toBe("—");            // and shows a dash, not a 0.0% that looks like a real figure
    expect(box.textContent).not.toMatch(/total stays 100|Total 100/);
    expect(box.textContent).toContain("it is not a weight and nothing has to add up to 100%");
  });
  it("moving one slider changes that one only, and only the moved rate is asked for", async () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Build your own growth model/ }));
    const before = sliders().map((x) => x.value);
    fireEvent.change(sliders()[1], { target: { value: "30" } });
    const after = sliders().map((x) => x.value);
    expect(after[1]).toBe("30");
    expect(after.filter((_, i) => i !== 1)).toEqual(before.filter((_, i) => i !== 1));          // no other slider moved
    expect(screen.getByText("+30.0%").className).toContain("is-mine");
    await new Promise((r) => setTimeout(r, 450));                                                 // the request waits for the sliders to stop
    expect(calls.some((c) => JSON.stringify(c) === JSON.stringify({ kind: "profit", horizon: "short", values: { co_3y: 30 } }))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reset to the company's figures" }));
    expect(sliders()[1].value).toBe("12.1");
  });
  it("works the same for revenue, with its six inputs", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Build your own growth model/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Revenue estimate" }));
    const s = sliders();
    expect(s.length).toBe(6); expect(s[0].value).toBe("15.2");
    fireEvent.change(s[3], { target: { value: "-12" } });
    expect(sliders()[3].value).toBe("-12"); expect(sliders()[0].value).toBe("15.2");
  });
});
