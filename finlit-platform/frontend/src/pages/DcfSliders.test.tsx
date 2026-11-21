// @vitest-environment jsdom
// The DCF calculator's assumption fields (task #302 redesign): the number box and the slider are one value, the range widens for a bigger number, nothing
// is lost while typing, presets light up only when the value equals them, and the page itself keeps the cursor in a field while the result follows.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../components/Info", () => ({ Info: () => null }));
import { PriceScale, SliderField, priceNote } from "./Dcf";

afterEach(cleanup);
const PRE = [{ value: 5, name: "Conservative" }, { value: 10, name: "Moderate" }, { value: 15, name: "Aggressive" }];
function Harness(p: { start: string; min: number; max: number; step?: number; unit?: string; error?: string; presets?: typeof PRE }) {
  const [v, setV] = useState(p.start);
  return <SliderField id="t" label="Discount rate" value={v} onChange={setV} unit={p.unit} min={p.min} max={p.max} step={p.step} error={p.error} presets={p.presets} />;
}
const slider = () => screen.getByRole("slider", { name: "Discount rate, slider" }) as HTMLInputElement;
const box = () => screen.getByRole("textbox", { name: /Discount rate/ }) as HTMLInputElement;
const pressed = () => screen.queryAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);

describe("DCF SliderField", () => {
  it("moving the slider writes the number into the box, rounded to the step", () => {
    render(<Harness start="12" min={1} max={30} step={0.25} unit="%" />);
    fireEvent.change(slider(), { target: { value: "13.75" } });
    expect(box().value).toBe("13.75");
    fireEvent.change(slider(), { target: { value: "14.0000001" } });
    expect(box().value).toBe("14");
  });
  it("typing a number moves the slider, and a half-typed or empty box leaves the slider at the start without losing the text", () => {
    render(<Harness start="12" min={1} max={30} step={0.25} />);
    fireEvent.change(box(), { target: { value: "20" } });
    expect(slider().value).toBe("20");
    fireEvent.change(box(), { target: { value: "2." } });
    expect(box().value).toBe("2.");
    fireEvent.change(box(), { target: { value: "" } });
    expect(box().value).toBe("");
    expect(Number(slider().value)).toBe(1);
  });
  it("a typed or loaded number beyond the range widens the slider instead of being cut off", () => {
    render(<Harness start="12500" min={0} max={1000} />);
    expect(Number(slider().max)).toBeGreaterThanOrEqual(12500);
    expect(Number(slider().value)).toBe(12500);
    fireEvent.change(box(), { target: { value: "-30" } });
    expect(Number(slider().min)).toBeLessThanOrEqual(-30);
  });
  it("an error is shown under the field, the field turns red, and the box is flagged", () => {
    const { container } = render(<Harness start="12" min={1} max={30} error="Enter a number." />);
    expect(screen.getByText("Enter a number.")).toBeTruthy();
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(".dcx-f")?.classList.contains("err")).toBe(true);
  });
  it("pack #4: a preset chip lights up only while the value equals it; a chip sets the value; any other value lights none", () => {
    render(<Harness start="10" min={-10} max={50} step={0.5} unit="%" presets={PRE} />);
    expect(pressed()).toEqual(["10%"]);
    fireEvent.change(box(), { target: { value: "12" } });
    expect(pressed()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Aggressive, 15%" }));
    expect(box().value).toBe("15"); expect(pressed()).toEqual(["15%"]);
    fireEvent.change(slider(), { target: { value: "5" } });
    expect(pressed()).toEqual(["5%"]);
  });
  it("typing keeps the same input element and the cursor in it (the field is never redrawn)", () => {
    render(<Harness start="12" min={1} max={30} />);
    const el = box(); el.focus();
    for (const v of ["1", "13", "13."]) fireEvent.change(el, { target: { value: v } });
    expect(box()).toBe(el);
    expect(document.activeElement).toBe(el);
  });
});

describe("the result card's words and scale", () => {
  it("pack #6: describes the gap without a verdict", () => {
    expect(priceNote(100, 57.98)).toEqual({ above: true, head: "Price above value", by: "by 72.5% on these assumptions" });
    expect(priceNote(50, 57.98).head).toBe("Price below value");
    const src = readFileSync(join(process.cwd(), "src/pages/Dcf.tsx"), "utf8");
    expect(src).not.toMatch(/overvalued|undervalued|fairly valued|STATUS_PILL/i);
  });
  it("the price scale puts the safety price, the value and the price on one bar, in order", () => {
    const { container } = render(<PriceScale safety={46.38} value={57.98} price={100} />);
    const left = (k: string) => parseFloat((container.querySelector(`.dcx-mk.${k}`) as HTMLElement).style.left);
    expect(left("mos")).toBeLessThan(left("val")); expect(left("val")).toBeLessThan(left("pxm"));
    expect(container.querySelector(".dcx-scale")?.getAttribute("aria-label")).toBe("Safety price ₹46.38, estimated value ₹57.98, current price ₹100.00");
    act(() => undefined);
  });
});

describe("the page layout (task #302)", () => {
  const src = readFileSync(join(process.cwd(), "src/pages/Dcf.tsx"), "utf8");
  it("has the four assumption groups, the five working tabs, the summary strip and no section bar or Filters button", () => {
    for (const h of ["Cash flow and growth", "Discount rate and margin of safety", "Price and balance sheet", "Method"]) expect(src).toContain(`<legend>${h}</legend>`);
    for (const t of ["How it is built", "Year by year", "Sensitivity", "Bear, base, bull", "Reverse DCF"]) expect(src).toContain(`"${t}"`);
    expect(src).toContain("dcx-mini");
    expect(src).not.toMatch(/SectionNav|SearchFilters variant|data-snav/);
    expect(src).toMatch(/id="mos"[^>]*min=\{0\} max=\{80\}/);
  });
  it("every table of the working resets the site's first-column rules (pack #8)", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/dcf-redesign.css"), "utf8");
    for (const t of ["dcx-bridge", "dcx-t"]) expect(css).toMatch(new RegExp(`\\.${t} th,\\.${t} td\\{[^}]*position:static!important[^}]*border-radius:0!important`));
    expect(css).toMatch(/\.dcx-hm th,\.dcx-hm td\{[^}]*position:static!important/);
    expect(css).toMatch(/@media \(max-width:860px\)\{\s*\.dcx-ws\{grid-template-columns:1fr\}/);
  });
});
