// @vitest-environment jsdom
// The Custom ratio drawer (task #64, Part 3, CR-1 to CR-6).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupInfo, MetricInfo } from "../../lib/proscreen";

const api = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), apiGet: vi.fn(async (path: string) => {
  api.calls.push(path);
  const pct = path.includes("show=pct"), k = pct ? 100 : 1;
  if (path.includes("num=net_profit") && path.includes("den=total_assets"))      // 14 Nov N-4 / N-5: a wide spread that crosses zero, as in the team's screenshot
    return { have: 6, total: 6, p2: -857, p5: -40, p25: 0.9, p50: 1.2, p75: 2.5, p95: 12.5, p98: 30, hist30: Array.from({ length: 30 }, (_, i) => (i === 0 ? 3 : i > 22 ? 5 : 0)), scale: "symlog", symC: 1,
      values: [-900, -857, 0.9, 1.2, 2.5, 30], example: null };
  return { have: 6, total: 8, p2: 0.01 * k, p5: 0.02 * k, p25: 0.03 * k, p50: 0.05 * k, p75: 0.1 * k, p95: 0.2 * k, p98: 0.3 * k, hist30: Array.from({ length: 30 }, (_, i) => i % 5), scale: "linear",
    values: [0.01, 0.03, 0.05, 0.08, 0.12, 0.3].map((x) => x * k), example: { symbol: "AAA", name: "Alpha Ltd", num: 100, den: 2000, value: 0.05 * k } };
}) }));
import { RatioDrawer } from "./RatioDrawer";

const M = (key: string, label: string, unit: string, family: MetricInfo["family"], o: Partial<MetricInfo> = {}): MetricInfo =>
  ({ key, label, unit, family, ratioable: true, better: "none", tier: "basic", say: "", digits: 1, locked: false, hidden: false, variants: null, stats: null, ...o } as unknown as MetricInfo);
const groups: GroupInfo[] = [
  { id: "size", label: "Size & price", tier: "basic", metrics: [M("market_cap", "Market cap", "Cr", "cr"), M("price", "Share price", "Rs", "per_share"), M("total_assets", "Total assets", "Cr", "cr"), M("net_profit", "Net profit (latest year)", "Cr", "cr")] },
  { id: "health", label: "Financial health", tier: "basic", metrics: [M("cash", "Cash and equivalents", "Cr", "cr"), M("cash_to_debt", "Cash to debt", "x", null)] },
  { id: "profitability", label: "Profitability", tier: "basic", metrics: [M("roa", "Return on assets", "%", null)] },
  { id: "flags", label: "Red flags", tier: "basic", metrics: [M("pledge_flag", "Promoter pledge", "flag", null, { ratioable: false })] },
  { id: "model", label: "FinLit IQ", tier: "silver", metrics: [M("overall", "FinLit IQ", "pts", null, { ratioable: false })] },
];
const byKey = new Map(groups.flatMap((g) => g.metrics).map((m) => [m.key, m]));
afterEach(() => { cleanup(); api.calls = []; });
const open = (p: Partial<Parameters<typeof RatioDrawer>[0]> = {}) => {
  const props = { groups, byKey, ratiosOn: 0, firstSymbols: ["AAA"], countWith: vi.fn(async () => 11), currentTotal: 38, onAdd: vi.fn(), onSave: vi.fn(), onUseFilter: vi.fn(), onClose: vi.fn(), ...p };
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RatioDrawer {...props} /></QueryClientProvider>);
  return props;
};
const opts = () => [...document.querySelectorAll(".rd-opt span:first-child")].map((e) => e.textContent);

describe("Custom ratio drawer", () => {
  it("CR-2 (14 Nov N-1): every figure listed at once, no tick box: Amounts first, then Ratios, percentages and counts; the count line; search filters both parts; never a FinLit IQ, Prism figure or yes-or-no filter", () => {
    open();
    expect(opts()).toEqual(["Market cap", "Share price", "Total assets", "Net profit (latest year)", "Cash and equivalents", "Cash to debt", "Return on assets"]);
    expect(screen.queryByRole("checkbox")).toBeNull(); expect(screen.queryByRole("button", { name: "Show them" })).toBeNull();
    const parts = [...document.querySelectorAll(".rd-part .rd-ph b")].map((e) => e.textContent);
    expect(parts).toEqual(["Amounts · 5", "Ratios, percentages and counts · 2"]);
    expect(document.querySelector(".rd-cnt")!.textContent).toBe("All 7 figures are listed: 5 amounts first, then 2 ratios, percentages and counts. Scroll, or search.");
    expect(document.querySelectorAll(".rd-opt").length).toBe(7);                                  // the count line matches the rows
    expect([...document.querySelectorAll(".rd-opt .rd-tag")].map((e) => e.textContent)).toEqual(["₹ Cr", "₹ per share", "₹ Cr", "₹ Cr", "₹ Cr", "×", "%"]);    // N-8: a unit tag on every row
    fireEvent.change(screen.getByPlaceholderText(/Search figures/), { target: { value: "cash" } });
    expect(opts()).toEqual(["Cash and equivalents", "Cash to debt"]);                             // both parts at once
    expect(document.querySelector(".rd-cnt")!.textContent).toBe("2 of 7 figures match: 1 amount, 1 other.");
    fireEvent.change(screen.getByPlaceholderText(/Search figures/), { target: { value: "" } });
    expect(opts()).not.toContain("FinLit IQ"); expect(opts()).not.toContain("Promoter pledge");
  });

  it("14 Nov N-3: the opening line, four examples, and all four step titles from the start with 2 to 4 greyed until both figures are picked", () => {
    const groups2 = [...groups, { id: "more", label: "More", tier: "basic" as const, metrics: [M("borrowings", "Total borrowings", "Cr", "cr"), M("op_profit", "Operating profit", "Cr", "cr"), M("turnover20_cr", "Daily trading value", "Cr", "cr")] }];
    open({ groups: groups2, byKey: new Map(groups2.flatMap((g) => g.metrics).map((m) => [m.key, m])) });
    expect(screen.getByText("Divide one company figure by another. The result becomes a column in the table, and a filter too if you set a condition.")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Examples" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cash to market cap", "Borrowings to market cap", "Net profit to operating profit", "Daily trading to market cap"]);
    expect([...document.querySelectorAll(".rd-sec h3")].map((h) => h.textContent)).toEqual(["1 Pick two figures", "2 Check what it gives", "3 Set a condition", "4 Name it"]);
    expect(document.querySelectorAll(".rd-sec.is-wait").length).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Cash to market cap" }));
    expect(document.querySelectorAll(".rd-sec.is-wait").length).toBe(0);
    expect((screen.getByLabelText("Ratio name") as HTMLInputElement).value).toBe("Cash to market cap");
  });

  it("CR-2/CR-5: after Top the list moves to Bottom and greys the top figure; the name follows the figures until one is typed", async () => {
    open();
    fireEvent.click(within(document.querySelector(".rd-list") as HTMLElement).getByRole("button", { name: /Cash and equivalents/ }));
    expect((within(document.querySelector(".rd-list") as HTMLElement).getByRole("button", { name: /Cash and equivalents/ }) as HTMLButtonElement).disabled).toBe(true);   // greyed in the Bottom list
    fireEvent.click(within(document.querySelector(".rd-list") as HTMLElement).getByRole("button", { name: /^Market cap/ }));
    const name = screen.getByLabelText("Ratio name") as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe("Cash and equivalents to market cap"));
    fireEvent.click(screen.getByRole("button", { name: /^Bottom/ })); fireEvent.click(within(document.querySelector(".rd-list") as HTMLElement).getByRole("button", { name: /^Total assets/ }));
    await waitFor(() => expect(name.value).toBe("Cash and equivalents to total assets"));
    fireEvent.change(name, { target: { value: "My cash ratio" } });
    fireEvent.click(screen.getByRole("button", { name: /^Bottom/ })); fireEvent.click(within(document.querySelector(".rd-list") as HTMLElement).getByRole("button", { name: /^Market cap/ }));
    expect(name.value).toBe("My cash ratio");
  });

  it("CR-3: Share price ÷ Total assets shows the amber unit note; Net profit ÷ Total assets says close to Return on assets and its link opens that filter", async () => {
    const p = open({ start: { name: "", num: "price", den: "total_assets", op: "gt", show: "times" } });
    expect(await screen.findByText(/different units \(₹ per share and ₹ Cr\)/)).toBeTruthy();
    cleanup();
    const q = open({ start: { name: "", num: "net_profit", den: "total_assets", op: "gt", show: "times" } });
    fireEvent.click(await screen.findByRole("button", { name: "Use Return on assets instead" }));
    expect(q.onUseFilter).toHaveBeenCalledWith(expect.objectContaining({ key: "roa" }));
    void p;
  });

  it("CR-3/CR-4: starts on % for two amounts with a middle under 1, on Above the middle; a worked example; switching to × shows 0.05; live counts", async () => {
    open({ start: { name: "", num: "cash", den: "market_cap", op: "gt" } });
    await waitFor(() => expect(screen.getByRole("radio", { name: "A percentage (%)" }).getAttribute("aria-checked")).toBe("true"));
    const box = screen.getByLabelText("At least") as HTMLInputElement;
    await waitFor(() => expect(box.value).toBe("5"));
    await waitFor(() => expect(screen.getByText(/For example, Alpha Ltd/).textContent).toMatch(/= 5%/));
    expect(screen.getByText(/Most companies: 2% to 20%/).textContent)        // 14 Nov N-6: p5 to p95, not the quarter marks the presets use
    expect(screen.getByText(/Most companies: 2% to 20%/).textContent).toMatch(/6 of 8 have both figures\. The other 2 are missing one, or the bottom figure is zero or less/);
    expect(document.querySelector(".rd-count")!.textContent).toMatch(/^4 of 8 companies pass this ratio\./);
    await waitFor(() => expect(document.querySelector(".rd-count")!.textContent).toMatch(/With your other filters, 11 of the 38 left\./));
    fireEvent.change(box, { target: { value: "10" } });
    expect(document.querySelector(".rd-count")!.textContent).toMatch(/^2 of 8/);          // typing updates the count without a click
    fireEvent.click(screen.getByRole("radio", { name: "Times (×)" }));
    expect(box.value).toBe("0.1");
    expect(within(document.querySelector(".rd-chart")!).getByText(/middle/)).toBeTruthy();
  });

  it("CR-6: no Run button; Add is off with the reason when there is no value, and at 3 ratios; Add hands the ratio over", async () => {
    const p = open({ start: { name: "", num: "cash", den: "market_cap", op: "gt", show: "pct" } });
    expect(screen.queryByRole("button", { name: /Run screener/ })).toBeNull();
    const add = await screen.findByRole("button", { name: "Add to filters" });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("At least"), { target: { value: "" } });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Enter a value, pick a preset, or choose No condition.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "No condition, just the column" }));
    fireEvent.click(screen.getByRole("button", { name: "Add the column" }));
    expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ num: "cash", den: "market_cap", op: "none", show: "pct", name: "Cash and equivalents to market cap" }));
    cleanup();
    open({ ratiosOn: 3, start: { name: "", num: "cash", den: "market_cap", op: "none" } });
    expect(screen.getByText("You have 3 ratios on, the most at one time. Remove one to add another.")).toBeTruthy();
  });

  it("CR-1: Esc closes an open figure list first, then the drawer", () => {
    const p = open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector(".rd-list")).toBeNull(); expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(p.onClose).toHaveBeenCalled();
  });
  it("14 Nov N-4 / N-5 / N-6: the chart's labels keep their sign, a wide spread across zero is on a log scale with the extremes in the end bars, and Most companies is p5 to p95", async () => {
    open({ start: { name: "", num: "net_profit", den: "total_assets", op: "gt", show: "pct" } });
    const cap = await waitFor(() => { const c = document.querySelector(".rd-chart figcaption"); if (!c) throw new Error("no chart"); return c; });
    expect(cap.textContent).toContain("−857% or less"); expect(cap.textContent).toContain("30% or more"); expect(cap.textContent).toContain("log scale");
    expect(screen.getByText(/Most companies: −40% to 12.5%/)).toBeTruthy();
    expect(document.querySelectorAll(".rd-chart rect").length).toBe(30);
  });
});
