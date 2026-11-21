// @vitest-environment jsdom
// Task #274 (the 20 Nov equity pack, change 18): the filters of Your shares in one row, with chips. The pack's own check on its 15-share list.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FilterChips, FilterRow, applyFilters, countFor, filterDefs, trendWord, type Getters, type Picks } from "./ShareFilters";

afterEach(cleanup);
const SYMS = "INFY TECHM PERSISTENT RELIANCE GLENMARK YESBANK APOLLO SKYGOLD TIPSMUSIC ZENSARTECH CHENNPETRO AEROFLEX 526433 MARINE KINGFA".split(" ");
const WEAK = new Set(["APOLLO", "GLENMARK", "526433"]);
const SIZE: Record<string, string> = { INFY: "Large", TECHM: "Large", PERSISTENT: "Large", RELIANCE: "Large", GLENMARK: "Mid", YESBANK: "Mid", APOLLO: "Small", SKYGOLD: "Small", TIPSMUSIC: "Small",
  ZENSARTECH: "Small", CHENNPETRO: "Small", AEROFLEX: "Micro", "526433": "Micro", MARINE: "Micro", KINGFA: "Micro" };
const G: Getters = { prism: (s) => (WEAK.has(s) ? "Weak" : "Healthy"), size: (s) => SIZE[s], trend: (s) => (s === "INFY" ? "Rising" : "Flat"), peers: () => "Not compared", buys: (s) => (s === "TIPSMUSIC" ? "With buys" : "No buys yet") };
const defs = filterDefs("Prism", ["Strong", "Healthy", "Average", "Weak"]);

describe("applyFilters and countFor (the pack's check)", () => {
  it("Prism: Weak leaves APOLLO, GLENMARK and ASM Technologies; adding Size: Micro leaves ASM Technologies", () => {
    expect(applyFilters(SYMS, { prism: ["Weak"] }, G)).toEqual(["GLENMARK", "APOLLO", "526433"]);
    expect(applyFilters(SYMS, { prism: ["Weak"], size: ["Micro"] }, G)).toEqual(["526433"]);
  });
  it("several choices in one button are OR; counts follow the other filters", () => {
    expect(applyFilters(SYMS, { size: ["Mid", "Micro"] }, G)).toHaveLength(6);
    expect(countFor(SYMS, {}, G, "size", "Micro")).toBe(4);
    expect(countFor(SYMS, { prism: ["Weak"] }, G, "size", "Micro")).toBe(1);
    expect(countFor(SYMS, { prism: ["Weak"], size: ["Large"] }, G, "size", "Micro")).toBe(1);   // its own button is left out of its counts
  });
  it("the trend words use the table's ±20 cut-offs", () => {
    expect([25, 20, 19, -19, -20, null].map(trendWord)).toEqual(["Rising", "Rising", "Flat", "Flat", "Falling", "Not rated"]);
  });
});

function Harness() {
  const [picks, setPicks] = useState<Picks>({}), [q, setQ] = useState("");
  const shown = applyFilters(SYMS, picks, G);
  return <><FilterRow defs={defs} symbols={SYMS} picks={picks} get={G} onChange={setPicks} />
    <FilterChips defs={defs} picks={picks} q={q} shown={shown.length} total={SYMS.length} onChange={setPicks} onClearQ={() => setQ("")} /><output>{shown.join(",")}</output></>;
}
describe("the filter row", () => {
  it("a set button turns dark and names its pick; chips remove one choice each; Clear filters restores 15; Esc closes and returns to the button", () => {
    render(<Harness />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Prism ▾", "Size ▾", "Trend ▾", "Vs peers ▾", "Buys ▾"]);
    fireEvent.click(screen.getByRole("button", { name: /^Prism/ }));
    const menu = screen.getByRole("group", { name: "Prism" });
    expect(within(menu).getByText("Weak").closest("label")!.textContent).toMatch(/Weakbelow 503/);
    fireEvent.click(within(menu).getByRole("checkbox", { name: /Weak/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    const prism = screen.getByRole("button", { name: /^Prism: Weak/ });
    expect(prism.className).toMatch(/on/); expect(document.activeElement).toBe(prism);
    fireEvent.click(screen.getByRole("button", { name: /^Size/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "Size" })).getByRole("checkbox", { name: /Micro/ }));
    expect(document.querySelector("output")!.textContent).toBe("526433");
    expect(screen.getByText("Showing 1 of 15")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Size: Micro" }));
    expect(document.querySelector("output")!.textContent).toBe("GLENMARK,APOLLO,526433");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(document.querySelector("output")!.textContent!.split(",")).toHaveLength(15);
    expect(screen.queryByText(/Showing/)).toBeNull();
  });
});
