// @vitest-environment jsdom
// The DCF calculator's assumption fields and company bar. Task #396 (DCF UI/UX pack): every slider is gone; each assumption is a number box that takes
// any value (large, decimal, negative) exactly as typed, with optional preset chips; the chosen company shows in the search field with "Selected" and ×;
// the company's financial details open on demand; loaded figures carry their source; Reset asks before it replaces typed figures.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../components/Info", () => ({ Info: () => null }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), has: () => true }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { id: "1" } }) }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header> }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../charts/With3D", () => ({ With3D: () => null }));
vi.mock("../components/SearchFilters", () => ({
  useIndexFilter: () => ({ idx: { data: {} }, search: (q: string) => (q ? [["RELIANCE", "Reliance Industries Ltd"], ["TCS", "Tata Consultancy Services Ltd"]] : []) }),
}));
const RIL = { symbol: "RELIANCE", name: "Reliance Industries Ltd", sector: "Refining & Marketing", statement: "consolidated", isBank: false, price: 1373.9, priceAsOf: "2026-11-25T15:30:00", marketCap: 1859235.48,
  shares: { diluted: 1353.25, period: "FY26", implied: 1353.25 },
  fcf: { history: [{ period: "FY26", fcf: 69197, operating: 198000, capex: 128803 }], latest: { period: "FY26", fcf: 69197 }, avg3: 54065.67, avg5: null, cagr3: null, cagr5: null },
  netDebt: { value: 228444, borrowings: 450000, cash: 221556, investments: 250000, period: "FY26" }, notes: ["A note about these figures."] };
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: (u: string) => (u.includes("/api/dcf/company/RELIANCE") ? Promise.resolve(RIL) : Promise.resolve({ scenarios: [], max: 50 })) }));
import { AssumField, DcfPage, PriceScale, grouped, priceNote } from "./Dcf";

afterEach(cleanup);
const PRE = [{ value: 5, name: "Conservative" }, { value: 10, name: "Moderate" }, { value: 15, name: "Aggressive" }];
function Harness(p: { start: string; unit?: string; error?: string; presets?: typeof PRE }) {
  const [v, setV] = useState(p.start);
  return <AssumField id="t" label="Discount rate" value={v} onChange={setV} unit={p.unit} error={p.error} presets={p.presets} />;
}
const box = () => screen.getByRole("textbox", { name: /Discount rate/ }) as HTMLInputElement;
const pressed = () => screen.queryAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);

describe("DCF assumption field (task #396: no slider)", () => {
  it("is a number box only: no slider, decimal keyboard, the unit shown beside it", () => {
    const { container } = render(<Harness start="12" unit="%" />);
    expect(container.querySelector("input[type=range]")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(box().getAttribute("inputmode")).toBe("decimal");
    expect(container.querySelector(".dcx-u")?.textContent).toBe("%");
  });
  it("takes any value exactly as typed: very large, decimal, negative, half-typed or empty; nothing is capped or rewritten", () => {
    render(<Harness start="12" />);
    box().focus();
    for (const v of ["987654321012", "12.375", "-25.5", "2.", "", "1e6"]) { fireEvent.change(box(), { target: { value: v } }); expect(box().value).toBe(v); }
  });
  it("pack D: shows thousand separators (Indian grouping) when not being edited, the plain number while typing; the value itself is never rounded", () => {
    render(<Harness start="1859235.48" />);
    expect(box().value).toBe("18,59,235.48");
    fireEvent.focus(box());
    expect(box().value).toBe("1859235.48");
    fireEvent.change(box(), { target: { value: "-228444" } });
    fireEvent.blur(box());
    expect(box().value).toBe("-2,28,444");
    expect([grouped("12.5"), grouped("2."), grouped(""), grouped("1e6"), grouped("1234567890123456789")]).toEqual(["12.5", "2.", "", "1e6", "1234567890123456789"]);
  });
  it("an error is shown under the field, the field turns red, and the box is flagged", () => {
    const { container } = render(<Harness start="12" error="Enter a number." />);
    expect(screen.getByText("Enter a number.")).toBeTruthy();
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(".dcx-f")?.classList.contains("err")).toBe(true);
  });
  it("pack #4: a preset chip lights up only while the value equals it; a chip sets the value; the box stays free to type", () => {
    render(<Harness start="10" unit="%" presets={PRE} />);
    expect(pressed()).toEqual(["10%"]);
    fireEvent.change(box(), { target: { value: "12.5" } });
    expect(pressed()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Aggressive, 15%" }));
    expect(box().value).toBe("15"); expect(pressed()).toEqual(["15%"]);
    fireEvent.change(box(), { target: { value: "37.25" } });
    expect(box().value).toBe("37.25");
  });
  it("typing keeps the same input element and the cursor in it (the field is never redrawn)", () => {
    render(<Harness start="12" />);
    const el = box(); el.focus();
    for (const v of ["1", "13", "13."]) fireEvent.change(el, { target: { value: v } });
    expect(box()).toBe(el);
    expect(document.activeElement).toBe(el);
  });
});

describe("the result card's words and scale", () => {
  it("pack #6: describes the gap without a verdict, and says what it means in one line", () => {
    expect(priceNote(100, 57.98)).toEqual({ above: true, head: "Price above value", by: "by 72.5% on these assumptions", line: "Today's price is higher than the value these assumptions give." });
    expect(priceNote(50, 57.98).head).toBe("Price below value");
    expect(priceNote(50, 57.98).line).toMatch(/lower than the value/);
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

const openPage = (path = "/dcf") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><DcfPage /></MemoryRouter></QueryClientProvider>);
const val = (id: string) => (document.getElementById("dcf-" + id) as HTMLInputElement).value.replace(/,/g, "");   // the box groups thousands when not being edited

describe("the DCF page (task #396)", () => {
  it("has no slider anywhere, and every assumption of the pack is an editable number box", () => {
    const { container } = openPage();
    expect(container.querySelectorAll("input[type=range]").length).toBe(0);
    for (const id of ["fcf0", "g1", "g2", "gT", "r", "mos", "marketCap", "price", "netDebt", "shares"]) expect(document.getElementById("dcf-" + id)?.tagName).toBe("INPUT");
    fireEvent.click(screen.getByRole("radio", { name: "Exit multiple" }));
    expect(document.getElementById("dcf-exitMultiple")?.tagName).toBe("INPUT");
  });
  it("a chosen company shows in the search field (not the placeholder), with Selected and ×; its details are closed until asked for", async () => {
    openPage();
    const search = screen.getByPlaceholderText("Company name or NSE symbol");
    fireEvent.change(search, { target: { value: "rel" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(val("fcf0")).toBe("69197"));
    expect(screen.queryByPlaceholderText("Company name or NSE symbol")).toBeNull();
    expect(screen.getByRole("button", { name: /Reliance Industries Ltd \(RELIANCE\) selected/ }).textContent).toMatch(/Selected/);
    expect(screen.getByRole("button", { name: "Clear Reliance Industries Ltd" })).toBeTruthy();
    expect(screen.getByText("5 of 5 figures loaded")).toBeTruthy();
    const more = screen.getByRole("button", { name: "View company financial details" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".dcx-codet")).toBeNull();
    fireEvent.click(more);
    expect(document.querySelector(".dcx-codet")?.textContent).toMatch(/Net debt \(FY26\)/);
    expect(document.querySelector(".dcx-codet")?.textContent).toMatch(/A note about these figures/);
    fireEvent.click(screen.getByRole("button", { name: "Hide company financial details" }));
    expect(document.querySelector(".dcx-codet")).toBeNull();
    expect(val("fcf0")).toBe("69197");   // opening and closing the details resets nothing
  });
  it("the search moves through the matches with the arrow keys and picks the highlighted one", async () => {
    openPage();
    const search = screen.getByPlaceholderText("Company name or NSE symbol");
    fireEvent.change(search, { target: { value: "t" } });
    const opts = () => within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.getAttribute("aria-selected"));
    expect(opts()).toEqual(["true", "false"]);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(opts()).toEqual(["false", "true"]);
    expect(search.getAttribute("aria-activedescendant")).toBe("dcx-hit-1");
    fireEvent.keyDown(search, { key: "ArrowUp" });
    expect(opts()).toEqual(["true", "false"]);
  });
  it("loaded figures carry their source; a figure typed over says Edited; × puts the example figures back and keeps the assumptions", async () => {
    openPage();
    fireEvent.change(screen.getByPlaceholderText("Company name or NSE symbol"), { target: { value: "rel" } });
    fireEvent.click(screen.getByRole("button", { name: /Reliance Industries Ltd/ }));
    await waitFor(() => expect(val("netDebt")).toBe("228444"));
    const tag = (id: string) => document.querySelector(`[data-k="${id}"] .dcx-src`)?.textContent;
    expect([tag("fcf0"), tag("netDebt"), tag("shares"), tag("price")]).toEqual(["FY26", "FY26", "FY26", "25 Nov"]);
    expect(tag("g1")).toBeUndefined();                                                   // an assumption, not a company figure
    fireEvent.change(document.getElementById("dcf-netDebt")!, { target: { value: "-5000" } });
    expect(tag("netDebt")).toBe("Edited");
    fireEvent.change(document.getElementById("dcf-g1")!, { target: { value: "13.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear Reliance Industries Ltd" }));
    expect([val("fcf0"), val("price"), val("netDebt")]).toEqual(["100", "100", "1000"]);
    expect(val("g1")).toBe("13.5");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText("Company name or NSE symbol")));
  });
  it("Reset asks first when typed figures would be lost, and restores the company's figures without dropping the company", async () => {
    openPage();
    fireEvent.change(screen.getByPlaceholderText("Company name or NSE symbol"), { target: { value: "rel" } });
    fireEvent.click(screen.getByRole("button", { name: /Reliance Industries Ltd/ }));
    await waitFor(() => expect(val("fcf0")).toBe("69197"));
    fireEvent.change(document.getElementById("dcf-fcf0")!, { target: { value: "70000" } });
    fireEvent.change(document.getElementById("dcf-r")!, { target: { value: "13.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/Reliance Industries Ltd's figures/);
    expect(val("r")).toBe("13.25");                                                     // nothing changed yet
    fireEvent.click(screen.getByRole("button", { name: "Keep my figures" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Reset" }).find((b) => b.closest("[role=alertdialog]"))!);
    expect([val("fcf0"), val("r"), val("price")]).toEqual(["69197", "12", "1373.9"]);
    expect(screen.getByRole("button", { name: /Reliance Industries Ltd \(RELIANCE\) selected/ })).toBeTruthy();
  });
  it("the page reads: intrinsic value first with its 'not a forecast' line, the breakdown with its signs, then the methodology card", () => {
    openPage();
    expect(document.querySelector(".dcx-ivs")?.textContent).toBe("Estimated from your assumptions · not a forecast of the share price");
    expect([...document.querySelectorAll(".dcx-bridge .op")].map((e) => e.textContent)).toEqual(["", "+", "", "=", "−", "=", "÷", "="]);
    expect(screen.getByRole("heading", { name: "Methodology and important notes" })).toBeTruthy();
    expect(document.querySelector("details.dcx-dsc")?.textContent).toMatch(/not a forecast of the future share price/);
  });
  it("task #412: the methodology card is a drop-down, closed at first; its title row opens and closes it, remembered per member", async () => {
    localStorage.clear();
    openPage();
    const card = document.querySelector("details.dcx-meth") as HTMLDetailsElement;
    expect(card).toBeTruthy();
    expect(card.open).toBe(false);
    const row = card.querySelector(":scope > summary") as HTMLElement;
    expect(row.querySelector("h2")?.textContent).toBe("Methodology and important notes");
    expect(row.querySelector(".dcx-mtg")?.textContent).toBe("Show");
    fireEvent.click(row);
    await waitFor(() => expect(card.querySelector(".dcx-mtg")?.textContent).toBe("Hide"));
    expect(card.open).toBe(true);
    expect(localStorage.getItem("finlit.dcf.meth.1")).toBe("open");
    expect(card.textContent).toMatch(/Gordon growth/);                                  // every note is still there, unchanged
    fireEvent.click(row);
    await waitFor(() => expect(card.open).toBe(false));
    expect(localStorage.getItem("finlit.dcf.meth.1")).toBe("closed");
    cleanup(); localStorage.setItem("finlit.dcf.meth.1", "open");
    openPage();
    expect((document.querySelector("details.dcx-meth") as HTMLDetailsElement).open).toBe(true);
    expect(localStorage.getItem("finlit.dcf.intro.1")).toBeNull();                      // its own key: the intro card is not moved with it
  });
});

describe("the page layout (tasks #302 and #396)", () => {
  const src = readFileSync(join(process.cwd(), "src/pages/Dcf.tsx"), "utf8");
  it("has the four assumption groups, the five working tabs, the summary strip and no section bar or Filters button", () => {
    for (const h of ["Cash flow and growth", "Discount rate and margin of safety", "Price and balance sheet", "Terminal value method"]) expect(src).toContain(`<legend>${h}</legend>`);
    for (const t of ["How it is built", "Year by year", "Sensitivity", "Bear, base, bull", "Reverse DCF"]) expect(src).toContain(`"${t}"`);
    expect(src).toContain("dcx-mini");
    expect(src).not.toMatch(/SectionNav|SearchFilters variant|data-snav/);
    expect(src).not.toMatch(/type="range"|SliderField/);
  });
  it("every table of the working resets the site's first-column rules (pack #8); assumptions about a third of the width, 12px gap; no slider styles", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/dcf-redesign.css"), "utf8");
    for (const t of ["dcx-bridge", "dcx-t"]) expect(css).toMatch(new RegExp(`\\.${t} th,\\.${t} td\\{[^}]*position:static!important[^}]*border-radius:0!important`));
    expect(css).toMatch(/\.dcx-hm th,\.dcx-hm td\{[^}]*position:static!important/);
    expect(css).toMatch(/@media \(max-width:860px\)\{\s*\.dcx-ws\{grid-template-columns:1fr\}/);
    expect(css).toMatch(/\.dcx-ws\{display:grid;grid-template-columns:minmax\(320px,34%\) minmax\(0,1fr\);gap:12px/);
    expect(css).not.toMatch(/\.dcx-rng/);
  });
  it("task #416: the bear, base, bull boxes and the plain figures are centred together, outweighing dcf.css's top-left cells", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/dcf-redesign.css"), "utf8");
    const old = readFileSync(join(process.cwd(), "src/styles/dcf.css"), "utf8");
    // the cause: dcf.css loads after this file in the build, and its cell rule has the same weight as .dcx-t's, so it pinned every cell top-left
    expect(old).toMatch(/\.dcf th, \.dcf td \{[^}]*text-align: left; vertical-align: top;/);
    // the fix is one class heavier (.dcx .dcx-sc) and only for this table: every cell centred both ways, headers included
    expect(css).toMatch(/\.dcx \.dcx-sc th,\.dcx \.dcx-sc td\{text-align:center;vertical-align:middle\}/);
    expect(css).toMatch(/\.dcx \.dcx-sc thead th\{vertical-align:middle\}/);
    expect(css).toMatch(/\.dcx \.dcx-sc input\{text-align:center;vertical-align:middle\}/);   // the typed figure sits in the middle of its box
    expect(css).toMatch(/\.dcx \.dcx-sc \.lk\{width:auto;padding:0\}/);                      // the base row's figures centre on the same line as the boxes
    expect(css).toMatch(/\.dcx \.dcx-sc tfoot th\{text-align:left\}/);                       // the "Weighted value" label spans five columns and stays a row label
    expect(css).not.toMatch(/\.dcx \.dcx-t th/);                                             // the other tables of the working are not touched
    const page = readFileSync(join(process.cwd(), "src/pages/Dcf.tsx"), "utf8");
    expect(page).toContain('<div className="wrap dcf dcx">');                                 // the .dcx scope the rules hang from
    expect(page).toContain('<table className="dcx-t dcx-sc">');
  });
});
