// Developer file 35: the ETF page's own import into one account, with "Keep what I have" or "Use the file's quantities". The import sent "replace" to the
// list, and the book saved right after put each ETF's units back to its buys', so "Use the file's quantities" did nothing for an ETF with buys. Now the
// units are set in the book, in the account the file goes into. Sample ETFs and amounts.
import { describe, expect, it } from "vitest";
import { fileIntoAccount, fileMessage } from "./etfBook";
import { aggOf } from "./ledger";
import type { Holding } from "./portfolio";

const H = (id: string, symbol: string, pf: string, qty: number, price: number, extra: Partial<Holding> = {}): Holding => ({ id, symbol, pf, qty, price, owned: true, date: "2024-05-02", ...extra });
const own = [H("a1", "NIFTYBEES", "main", 100, 250), H("a2", "GOLDBEES", "main", 50, 60), H("a3", "BANKBEES", "main", 10, 480), H("a4", "BANKBEES", "main", 10, 520, { date: "2024-08-01" }),
  H("b1", "NIFTYBEES", "p2", 40, 270), H("was-SILVERBEES", "SILVERBEES", "main", 30, 0)];
const file = [{ symbol: "NIFTYBEES", qty: 140, avg: 255 }, { symbol: "GOLDBEES", qty: 30 }, { symbol: "BANKBEES", qty: 25, avg: 500 }, { symbol: "HDFCMID150", qty: 700, avg: 20 },
  { symbol: "SILVERBEES", qty: 45 }];
const apply = (rows: Holding[], r: ReturnType<typeof fileIntoAccount>) => [...rows.map((h) => ({ ...h, ...(r.updates.find((u) => u.id === h.id)?.patch ?? {}) })), ...r.adds.map((a, i) => ({ ...a, id: "n" + i }))];

describe("a broker file into one ETF account (fileIntoAccount)", () => {
  it("\"Use the file's quantities\": one buy takes the file's units, in this account only; several buys are left and named", () => {
    const r = fileIntoAccount(own, file, "main", true);
    expect([r.added, r.set, r.same, r.kept, r.several]).toEqual([["HDFCMID150"], ["NIFTYBEES", "GOLDBEES", "SILVERBEES"], [], [], ["BANKBEES"]]);
    expect(r.updates).toEqual([
      { id: "a1", symbol: "NIFTYBEES", patch: { qty: 140, price: 255 } },                   // the file's average buy price
      { id: "a2", symbol: "GOLDBEES", patch: { qty: 30, price: 60 } },                      // fewer units, no price in the file: what is left of the same buy
      { id: "was-SILVERBEES", symbol: "SILVERBEES", patch: { qty: 45, price: 0 } }]);       // more units, no price in the file: the extra's cost is not known
    const after = apply(own, r);
    expect([aggOf(after, "NIFTYBEES", "main")?.qty, aggOf(after, "NIFTYBEES", "p2")?.qty, aggOf(after, "GOLDBEES", "main")?.qty, aggOf(after, "BANKBEES", "main")?.qty]).toEqual([140, 40, 30, 20]);
    expect(aggOf(after, "GOLDBEES", "main")?.invested).toBe(1800);
  });
  it("\"Keep what I have\": ETFs with buys here are kept; one with buys only in another account gets its buy here", () => {
    const r = fileIntoAccount(own, file, "main", false);
    expect([r.added, r.set, r.kept, r.several, r.updates]).toEqual([["HDFCMID150"], [], ["NIFTYBEES", "GOLDBEES", "BANKBEES", "SILVERBEES"], [], []]);
    const p2 = fileIntoAccount(own, [{ symbol: "GOLDBEES", qty: 30 }], "p2", true);
    expect([p2.added, p2.adds]).toEqual([["GOLDBEES"], [{ symbol: "GOLDBEES", qty: 30, price: 0, owned: true, pf: "p2" }]]);
  });
  it("the same file again changes nothing; a sale in the account keeps it as it is; a line with no units is left out", () => {
    const r = fileIntoAccount(own, [{ symbol: "NIFTYBEES", qty: 100, avg: 250 }, { symbol: "GOLDBEES", qty: null }], "main", true);
    expect([r.same, r.updates, r.adds]).toEqual([["NIFTYBEES"], [], []]);
    const sold = [...own, H("s1", "GOLDBEES", "main", 10, 70, { side: "sell", date: "2024-09-01" })];
    expect(fileIntoAccount(sold, [{ symbol: "GOLDBEES", qty: 30 }], "main", true).several).toEqual(["GOLDBEES"]);
  });
});

describe("the line after the import (fileMessage)", () => {
  it("says what happened to each ETF, in the account's name", () => {
    const r = fileIntoAccount(own, file, "main", true);
    expect(fileMessage("First account", r, { priced: ["NIFTYBEES", "HDFCMID150"], unpricedSet: ["SILVERBEES"] })).toBe("Imported into First account: 1 added; units set to the file's for NIFTYBEES, GOLDBEES and SILVERBEES (SILVERBEES: no buy price in the file for the extra units; add it under Edit); BANKBEES has several buys or a sale in this account, so its units were not set: change them under Edit. The file's average buy price went to NIFTYBEES and HDFCMID150.");
    expect(fileMessage("First account", fileIntoAccount(own, file.slice(0, 2), "main", false))).toBe("Imported into First account: NIFTYBEES and GOLDBEES kept as you have them.");
    expect(fileMessage("Second account", { added: [], set: [], same: ["NIFTYBEES"], kept: [], several: [] }, { traded: 1 })).toBe("Imported into Second account: 1 added; NIFTYBEES already has the file's units.");
    expect(fileMessage("X", { added: [], set: [], same: [], kept: [], several: [] })).toBe("Nothing to import into X.");
  });
});
