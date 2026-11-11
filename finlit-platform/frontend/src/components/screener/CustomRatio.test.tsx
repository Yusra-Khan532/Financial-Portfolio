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
    fireEvent.click(screen.getByRole("button", { name: /Add ratio/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/same figure/);
    fireEvent.change(screen.getByLabelText("Denominator"), { target: { value: "np" } });
    fireEvent.click(screen.getByRole("button", { name: /Add ratio/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/value to compare/);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Add ratio/ }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "r0", num: "ocf", den: "np", op: "gt", a: 1.5 })]);
  });
  it("describes a ratio in words and sends it to the server as a range", () => {
    const r: CustomRatio = { id: "r0", name: "Cash conversion", num: "ocf", den: "np", op: "between", a: 2, b: 1 };
    expect(ratioSentence(r, byKey)).toBe("Cash conversion: Operating cash flow ÷ Net profit between 1 and 2");
    expect(ratioRange(r)).toEqual({ min: 1, max: 2 });
    const body = toBody({ ranges: {}, sectors: [], industries: [], indices: [], caps: [], bands: [] }, { key: "market_cap", dir: "desc" }, [], "", 0, 50, [r]);
    expect(body.ratios).toEqual([{ id: "r0", num: "ocf", den: "np", min: 1, max: 2 }]);
    expect(toBody({ ranges: {}, sectors: [], industries: [], indices: [], caps: [], bands: [] }, { key: "market_cap", dir: "desc" }, [], "", 0, 50)).not.toHaveProperty("ratios");
  });
});
