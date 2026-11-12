// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomRatioBuilder, ratioSentence } from "./CustomRatio";
import { ratioRange, toBody, type CustomRatio, type GroupInfo, type MetricInfo } from "../../lib/proscreen";

afterEach(cleanup);
const m = (key: string, label: string, over: Partial<MetricInfo> = {}): MetricInfo => ({ key, label, unit: "Cr", better: "none", tier: "basic", say: "", digits: 2, locked: false, stats: null, ...over });
const groups: GroupInfo[] = [{ id: "g", label: "Financials", tier: "basic", metrics: [m("ocf", "Operating cash flow"), m("np", "Net profit"), m("gold", "Gold only", { locked: true }), m("flag", "A flag", { unit: "flag" })] }];
const byKey = new Map(groups[0].metrics.map((x) => [x.key, x]));

describe("custom ratio builder", () => {
  it("adds a ratio from two figures and a condition, and refuses the same figure twice or a missing value", () => {
    const onChange = vi.fn();
    render(<CustomRatioBuilder groups={groups} byKey={byKey} ratios={[]} onChange={onChange} ask={() => {}} />);
    expect(screen.queryByRole("option", { name: /A flag/ })).toBeNull();                       // a yes/no figure cannot be divided
    fireEvent.change(screen.getByLabelText("Numerator"), { target: { value: "ocf" } });
    fireEvent.change(screen.getByLabelText("Denominator"), { target: { value: "ocf" } });
    fireEvent.click(screen.getByRole("button", { name: /Add another ratio/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/same figure/);
    fireEvent.change(screen.getByLabelText("Denominator"), { target: { value: "np" } });
    fireEvent.click(screen.getByRole("button", { name: /Add another ratio/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/value to compare/);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Run screener/ }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "r0", num: "ocf", den: "np", op: "gt", a: 1.5 })]);
  });
  it("shows the formula as you choose, the applied criteria as chips, and saves, lists, loads and deletes named ratios", () => {
    const onChange = vi.fn(), onSaved = vi.fn(), r: CustomRatio = { id: "r0", name: "Cash conversion", num: "ocf", den: "np", op: "gt", a: 1.5 };
    const { rerender } = render(<CustomRatioBuilder groups={groups} byKey={byKey} ratios={[r]} onChange={onChange} ask={() => {}} saved={[]} onSaved={onSaved} />);
    expect(screen.getByText("Applied criteria (1)")).toBeTruthy();
    expect(screen.getByText("Cash conversion > 1.5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Cash conversion" }));
    expect(onChange).toHaveBeenCalledWith([]);
    fireEvent.change(screen.getByLabelText("Numerator"), { target: { value: "ocf" } });
    fireEvent.change(screen.getByLabelText("Denominator"), { target: { value: "np" } });
    expect(screen.getByText("Formula preview").parentElement!.textContent).toMatch(/Operating cash flow ÷ Net profit/);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1.2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save ratio" }));
    expect(screen.getByRole("alert").textContent).toMatch(/name/);                                // a saved ratio needs a name
    fireEvent.change(screen.getByPlaceholderText(/Cash conversion ratio/), { target: { value: "Cash conv" } });
    fireEvent.click(screen.getByRole("button", { name: "Save ratio" }));
    expect(onSaved).toHaveBeenCalledWith([expect.objectContaining({ name: "Cash conv", num: "ocf", den: "np", op: "gt", a: 1.2 })]);
    rerender(<CustomRatioBuilder groups={groups} byKey={byKey} ratios={[]} onChange={onChange} ask={() => {}} saved={[{ name: "Cash conv", num: "ocf", den: "np", op: "gt", a: 1.2 }]} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Saved ratios (1)" }));
    fireEvent.click(screen.getByRole("button", { name: /^Cash conv\s*Cash conv:/ }));
    expect((screen.getByLabelText("Numerator") as HTMLSelectElement).value).toBe("ocf");
    expect((screen.getByLabelText("Value") as HTMLInputElement).value).toBe("1.2");
  });
  it("describes a ratio in words and sends it to the server as a range", () => {
    const r: CustomRatio = { id: "r0", name: "Cash conversion", num: "ocf", den: "np", op: "between", a: 2, b: 1 };
    expect(ratioSentence(r, byKey)).toBe("Cash conversion: Operating cash flow ÷ Net profit between 1 and 2");
    expect(ratioRange(r)).toEqual({ min: 1, max: 2 });
    const body = toBody({ ranges: {}, sectors: [], industries: [], indices: [], caps: [], bands: [] }, { key: "market_cap", dir: "desc" }, [], "", 0, 50, [r]);
    expect(body.ratios).toEqual([{ id: "r0", num: "ocf", den: "np", min: 1, max: 2 }]);
    expect(toBody({ ranges: {}, sectors: [], industries: [], indices: [], caps: [], bands: [] }, { key: "market_cap", dir: "desc" }, [], "", 0, 50)).not.toHaveProperty("ratios");
  });
  it("says in a sentence what the condition means and offers examples only for figures that are there (task #97)", () => {
    const g: GroupInfo[] = [{ id: "g", label: "Size", tier: "basic", metrics: [m("net_profit", "Net profit"), m("total_assets", "Total assets"), m("revenue", "Sales")] }];
    render(<CustomRatioBuilder groups={g} byKey={new Map(g[0].metrics.map((x) => [x.key, x]))} ratios={[]} onChange={() => {}} ask={() => {}} />);
    expect(screen.getByText("Pick the two figures first.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Profit on assets" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enterprise value vs market cap" })).toBeNull();              // enterprise value is not in this list
    fireEvent.click(screen.getByRole("button", { name: "Profit on assets" }));
    expect((screen.getByLabelText("Numerator") as HTMLSelectElement).value).toBe("net_profit");
    expect((screen.getByLabelText("Denominator") as HTMLSelectElement).value).toBe("total_assets");
    expect(screen.getByText("Companies whose ratio is above 0.05 pass.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "between" } });
    expect(screen.getByText("Enter both ends of the range.")).toBeTruthy();
  });
});
