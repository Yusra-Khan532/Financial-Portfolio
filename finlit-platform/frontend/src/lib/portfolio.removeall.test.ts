// @vitest-environment jsdom
// "Remove all" on the Equity portfolio (task #127): the list empties and is saved to the account like any change; Undo puts back exactly what was there.
import { describe, expect, it, vi } from "vitest";
import { portfolio } from "./portfolio";

describe("portfolio.clear and portfolio.restore", () => {
  it("clear empties the list, saves it to the account, and returns what was there; restore puts it back and saves it too", () => {
    const saved: number[] = []; portfolio.onSave((s) => saved.push(s.holdings.length));
    portfolio.replace({ holdings: [] });
    portfolio.addMany([{ symbol: "tcs", qty: 5, price: 0, owned: true }, { symbol: "INFY", qty: 1, price: 0 }]);
    const ids = portfolio.get().holdings.map((h) => h.id);
    const before = portfolio.clear();
    expect(portfolio.get().holdings).toEqual([]);
    expect(before.holdings.map((h) => h.id)).toEqual(ids);
    expect(JSON.parse(localStorage.getItem("finlit-portfolio-v1") || "{}").holdings).toEqual([]);
    portfolio.restore(before);
    expect(portfolio.get().holdings.map((h) => [h.id, h.symbol, h.qty, h.owned])).toEqual([[ids[0], "TCS", 5, true], [ids[1], "INFY", 1, undefined]]);
    expect(saved.slice(-2)).toEqual([0, 2]);                                         // both changes go to the account (Silver and Gold)
    portfolio.onSave(null);
  });
  it("clear on an empty list is harmless", () => { portfolio.replace({ holdings: [] }); expect(portfolio.clear().holdings).toEqual([]); expect(portfolio.get().holdings).toEqual([]); });
  it("restore is not a copy that changes with the old object", () => { const b = { holdings: [{ id: "x", symbol: "A", qty: 1, price: 0 }] }; portfolio.restore(b); b.holdings.pop(); expect(portfolio.get().holdings).toHaveLength(1); });
});
