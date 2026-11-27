// @vitest-environment jsdom
// Task #276: the shared portfolio parts on their own (the ETF page uses them first; the equity and MF pages reuse them): the filter counts, the money box's
// coverage line, the first-in-first-out sale preview, the views kept per user (and a browser that refuses storage), and the slim card of a hidden section.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFilters, choicesOf, type Facet } from "./FilterRow";
import { coverText } from "./TopMoney";
import { salePreview } from "./HoldingDialog";
import { ViewCards, useSeenViews } from "./ViewCards";
import { Section } from "./KitSection";
import type { Money } from "../../lib/ledger";

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
type R = { s: string; t: string; h: string };
const rows: R[] = [{ s: "GOLDBEES", t: "Gold", h: "Nippon India" }, { s: "MID150BEES", t: "Indian shares", h: "Nippon India" }, { s: "SILVERBEES", t: "Silver", h: "Nippon India" }, { s: "SMALL250", t: "Indian shares", h: "Mirae Asset" }];
const facets: Facet<R>[] = [{ key: "type", label: "Type", get: (r) => r.t, order: ["Indian shares", "Gold", "Silver"] }, { key: "house", label: "Fund house", get: (r) => r.h }];

describe("filters in one row", () => {
  it("each choice says how many it would leave, with the other filters as they are; any choice within a filter, every filter together", () => {
    expect(choicesOf(rows, facets, {}, "", (r) => r.s, "type")).toEqual([{ v: "Indian shares", n: 2 }, { v: "Gold", n: 1 }, { v: "Silver", n: 1 }]);
    expect(applyFilters(rows, facets, { type: ["Gold"] }, "", (r) => r.s).map((r) => r.s)).toEqual(["GOLDBEES"]);
    expect(applyFilters(rows, facets, { type: ["Gold", "Silver"] }, "", (r) => r.s)).toHaveLength(2);
    expect(choicesOf(rows, facets, { house: ["Mirae Asset"] }, "", (r) => r.s, "type")).toEqual([{ v: "Indian shares", n: 1 }, { v: "Gold", n: 0 }, { v: "Silver", n: 0 }]);
    expect(applyFilters(rows, facets, {}, "small", (r) => r.s).map((r) => r.s)).toEqual(["SMALL250"]);
  });
});

describe("the money box says what it covers", () => {
  const m = (o: Partial<Money>): Money => ({ n: 4, withQty: 0, full: 0, invested: 0, now: 0, gain: 0, today: 0, prev: 0, booked: 0, bookedOk: true, nSales: 0, bad: 0, missing: [], covered: [], noPrice: [], rate: [], rateOn: null, ...o });
  it("none, some, and all", () => {
    expect(coverText(m({ missing: ["B", "A", "C", "D"].map((symbol) => ({ symbol, what: "qty" as const })) }), [], ["ETF", "ETFs"]).rest).toBe("None of A, B, C and D has a quantity yet; they count in every reading but not in the money.");
    expect(coverText(m({ full: 2, missing: [{ symbol: "C", what: "qty" }, { symbol: "D", what: "price" }] }), [], ["ETF", "ETFs"])).toEqual({ full: false, head: "Money figures cover 2 of 4 ETFs.", rest: "C has no quantity yet; D has no buy price yet; they count in every reading but not in the money." });
    expect(coverText(m({ full: 4 }), [], ["ETF", "ETFs"]).full).toBe(true);
  });
});

describe("Sell previews the buys it uses", () => {
  it("first in, first out, and a sale larger than what was held", () => {
    const hs = [{ id: "a", symbol: "X", qty: 10, price: 100, date: "2025-01-01", owned: true, pf: "main" }, { id: "b", symbol: "X", qty: 10, price: 120, date: "2025-02-01", owned: true, pf: "main" }];
    const p = salePreview(hs, "X", "main", 12, 150, "2025-03-01");
    expect(p.held).toBe(20);
    expect(p.fig!.from.map((f) => [f.id, f.qty])).toEqual([["a", 10], ["b", 2]]);
    expect(p.fig!.gain).toBe(12 * 150 - (1000 + 240));
    expect(salePreview(hs, "X", "main", 30, 150, "2025-03-01").fig!.err).toBe(20);
  });
});

function Views({ who, view }: { who: string; view: string }) {
  const seen = useSeenViews("p", who, view);
  return <ViewCards score={<div />} view={view} onView={() => {}} seen={seen}
    cards={["a", "b", "c"].map((id) => ({ id, k: id.toUpperCase(), v: "v", x: "x", what: "w", color: "#000", tone: "good" as const }))} />;
}
describe("views seen, kept per user", () => {
  it("remembers the views each user opened, and still works when the browser refuses storage", () => {
    const r = render(<Views who="u1" view="a" />);
    r.rerender(<Views who="u1" view="b" />);
    expect(screen.getByText("2 of 3 opened · C still to see")).toBeTruthy();
    cleanup();
    render(<Views who="u2" view="a" />);
    expect(screen.getByText("1 of 3 opened · B and C still to see")).toBeTruthy();
    cleanup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<Views who="u3" view="c" />);
    expect(screen.getByText("1 of 3 opened · A and B still to see")).toBeTruthy();
  });
});

describe("hidden sections", () => {
  it("hide to a slim card with the title, Hidden · the subtitle, and Show ▾", () => {
    render(<Section id="s1" hide title="Key figures" sub="What sits inside.">body</Section>);
    fireEvent.click(screen.getByRole("button", { name: "Hide: Key figures" }));
    expect(document.querySelector(".ptk-hz")!.textContent).toBe("Key figuresHidden · What sits inside.Show ▾");
    expect(localStorage.getItem("finlit.hide.pack.s1")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Show: Key figures" }));
    expect(screen.getByText("body")).toBeTruthy();
  });
});
