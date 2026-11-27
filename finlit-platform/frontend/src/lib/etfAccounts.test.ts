// Developer file 32 (founder, 23 Nov 2026: "when I have uploaded the portfolio file for the first time the ETFs in it go to the ETF portfolio but when I
// add the second portfolio the ETFs in it are not going to the ETFs page"). The Equity import hands its ETF lines to the ETF portfolio. Until this file
// every import went to the ETF book's first account and the list's units were replaced by the file's ("replace"), so a second portfolio's file
//   - left an ETF both files hold at the first file's units (the book's buy stayed, and the next book save put them back), losing the second's units;
//   - put a new ETF in the first account, as if the first portfolio held it;
//   - or, with only ETFs already there, wrote the second file's units over the first's in the list (100 -> 40) while the book still said 100.
// Now each Equity portfolio's ETFs go to the ETF book's account that matches it (made there when there is none), and each ETF's units are every
// account's buys added up (the server's own rule). Sample ETFs and amounts only.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Lot = { id: string; symbol: string; pf: string; side: "buy" | "sell"; qty: number; price: number | null; date: string | null; legacy?: boolean };
type Acc = { id: string; name: string; broker?: string; created?: string };
// A stand-in for the ETF portfolio's server that follows its rules (backend/finlit/etfportfolio api.py and book.py): import-commit adds new ETFs with
// their units and, with "skip", leaves ETFs already in the list; GET /book gives the stored buys plus a quantity-only line for an ETF with units and no
// buys (in the first account); PUT /book replaces the book and sets each ETF's units to its open units across every account.
const srv = vi.hoisted(() => ({
  list: new Map<string, number | null>(), lots: [] as Lot[], accounts: [] as Acc[], calls: [] as { method: string; path: string; body?: unknown }[],
  known: new Set(["NIFTYBEES", "GOLDBEES", "HDFCMID150", "SMPLFANG"]),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()),
  apiGet: vi.fn(async (path: string) => {
    srv.calls.push({ method: "GET", path });
    const withLots = new Set(srv.lots.map((l) => l.symbol)), first = srv.accounts[0]?.id ?? "main";
    const legacy = [...srv.list].filter(([s, q]) => !withLots.has(s) && q != null).map(([s, q]) => ({ id: `was-${s}`, symbol: s, pf: first, side: "buy" as const, qty: q as number, price: 0, date: null, legacy: true }));
    return { portfolios: srv.accounts.map((a) => ({ ...a })), lots: [...srv.lots.map((l) => ({ ...l })), ...legacy], names: [...srv.list].filter(([, q]) => q == null).map(([s]) => s) };
  }),
  apiSend: vi.fn(async (method: string, path: string, body: any) => {
    srv.calls.push({ method, path, body });
    if (path.endsWith("/import-preview")) return { rows: body.rows.map((r: { row: number; symbol?: string; qty?: string }, i: number) => {
      const s = String(r.symbol ?? "").toUpperCase();
      return srv.known.has(s) ? { i, row: r.row, status: "matched", etf: { symbol: s, name: s }, qty: Number(r.qty), existing: srv.list.has(s) } : { i, row: r.row, status: "not_found" };
    }), capacity: { limit: 15, used: srv.list.size, room: 15 - srv.list.size } };
    if (path.endsWith("/import-commit")) {
      let added = 0, replaced = 0, skipped = 0;
      for (const x of body.items as { symbol: string; qty: number }[]) {
        if (!srv.list.has(x.symbol)) { srv.list.set(x.symbol, x.qty); added++; } else if (body.existing === "replace") { srv.list.set(x.symbol, x.qty); replaced++; } else skipped++;
      }
      return { added, replaced, skipped };
    }
    if (method === "PUT" && path.endsWith("/book")) {
      const ids = new Set((body.portfolios as Acc[]).map((a) => a.id));
      for (const l of body.lots as Lot[]) {
        if (!(l.qty > 0) || !(l.price == null || l.price > 0) || !/^[A-Za-z0-9_-]{1,40}$/.test(l.id) || (!ids.has(l.pf) && l.pf !== "main")) throw new Error("422 " + JSON.stringify(l));
        if ("legacy" in l) throw new Error("422 legacy is not a field of a buy");
      }
      for (const a of body.portfolios as Acc[]) if (!/^[a-z0-9]{1,16}$/.test(a.id) || !a.name || a.name.length > 40 || (a.broker?.length ?? 0) > 40) throw new Error("422 " + JSON.stringify(a));
      if (new Set((body.portfolios as Acc[]).map((a) => a.name.trim().toLowerCase())).size !== body.portfolios.length) throw new Error("422 duplicate_portfolio");
      const before = new Set(srv.lots.map((l) => l.symbol));
      srv.accounts = body.portfolios; srv.lots = body.lots;
      const units = new Map<string, number>();
      for (const l of srv.lots) units.set(l.symbol, (units.get(l.symbol) ?? 0) + (l.side === "sell" ? -l.qty : l.qty));
      units.forEach((q, s) => { if (q > 0) srv.list.set(s, q); else srv.list.delete(s); });
      before.forEach((s) => { if (!units.has(s) && srv.list.has(s)) srv.list.set(s, null); });
      return { status: "saved" };
    }
    return {};
  }) }));
import { addBookBuys, sendAllFunds } from "./importEtf";
import { bookAfterImport, etfAccountFor, etfAccountMessage } from "./importFunds";

const lot = (id: string, symbol: string, qty: number, price: number | null, pf = "main", extra: Partial<Lot> = {}): Lot => ({ id, symbol, pf, side: "buy", qty, price, date: null, ...extra });
const units = (lots: Lot[], sym: string) => lots.filter((l) => l.symbol === sym).reduce((a, l) => a + (l.side === "sell" ? -l.qty : l.qty), 0);
const first = { id: "main", name: "First account", broker: "Zerodha" }, second = { id: "p2", name: "Second account", broker: "Dhan" };
const TODAY = "2026-11-23";

describe("the ETF book's account for an Equity portfolio (etfAccountFor)", () => {
  it("the Equity page's first portfolio goes to the book's first account, as before (with no accounts yet: the page's \"My ETFs\")", () => {
    expect(etfAccountFor([], first, "First account", TODAY)).toEqual({ pf: "main", name: "My ETFs", portfolios: [], created: false, full: false });
    expect(etfAccountFor([{ id: "zz", name: "Zerodha" }], first, "First account", TODAY)).toMatchObject({ pf: "zz", name: "Zerodha", created: false });
  });
  it("a second portfolio gets an account of its own, named and with the broker as on the Equity page; the book's first buys keep theirs", () => {
    expect(etfAccountFor([], second, "First account", TODAY)).toEqual({ pf: "p2", name: "Second account", created: true, full: false,
      portfolios: [{ id: "main", name: "First account", created: TODAY }, { id: "p2", name: "Second account", broker: "Dhan", created: TODAY }] });
  });
  it("finds the account again by the portfolio's id, or by its name (an account the member made on the ETF page), whatever the case", () => {
    const accs = [{ id: "main", name: "First account" }, { id: "p2", name: "Second account" }, { id: "k9", name: "dhan" }];
    expect(etfAccountFor(accs, second, "First account", TODAY)).toMatchObject({ pf: "p2", created: false, portfolios: accs });
    expect(etfAccountFor(accs, { id: "q7", name: "Dhan" }, "First account", TODAY)).toMatchObject({ pf: "k9", name: "dhan", created: false });
  });
  it("keeps names and ids the server takes: a name already used gets a number, an id that does not fit is made one that does", () => {
    expect(etfAccountFor([], { id: "p2", name: "My portfolio" }, "My portfolio", TODAY).portfolios.map((a) => a.name)).toEqual(["My portfolio", "My portfolio (2)"]);
    expect(etfAccountFor([{ id: "a", name: "A" }], { id: "P-2x", name: "B" }, "", TODAY).pf).toBe("p2x");
    const r = etfAccountFor([{ id: "p2", name: "A" }], { id: "p2", name: "B" }, "", TODAY);               // same id, another name: found by id
    expect(r).toMatchObject({ pf: "p2", created: false });
    const long = etfAccountFor([{ id: "a", name: "A" }], { id: "p3", name: "x".repeat(60), broker: "y".repeat(60) }, "", TODAY).portfolios[1];
    expect([long.name.length, long.broker?.length]).toEqual([40, 40]);
  });
  it("a book with 10 accounts, the most it takes, gets the buys in its first account and says so", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: "a" + i, name: "Account " + i }));
    expect(etfAccountFor(ten, second, "", TODAY)).toEqual({ pf: "a0", name: "Account 0", portfolios: ten, created: false, full: true });
  });
});

describe("the book after an import into one account (bookAfterImport)", () => {
  const book = [lot("impA", "NIFTYBEES", 100, 250), lot("impB", "GOLDBEES", 50, 60)];
  it("a second account's file: an ETF both hold adds its units in that account, a new ETF goes there; the first account is not touched", () => {
    let n = 0;
    const r = bookAfterImport(book, [{ symbol: "NIFTYBEES", qty: 40, price: 260 }, { symbol: "HDFCMID150", qty: 25, price: 180 }], "p2", () => "imp" + ++n);
    expect([r.added, r.joined, r.fixed, r.kept, r.same, r.twins]).toEqual([["HDFCMID150"], ["NIFTYBEES"], [], [], [], []]);
    expect(r.lots).toEqual([...book, lot("imp1", "NIFTYBEES", 40, 260, "p2"), lot("imp2", "HDFCMID150", 25, 180, "p2")]);
    expect([units(r.lots, "NIFTYBEES"), units(r.lots, "GOLDBEES"), units(r.lots, "HDFCMID150")]).toEqual([140, 50, 25]);   // as the server adds them up
  });
  it("the same file again changes nothing; a newer statement of that account updates only its own import buy", () => {
    const two = [...book, lot("impC", "NIFTYBEES", 40, 260, "p2")];
    const again = bookAfterImport(two, [{ symbol: "NIFTYBEES", qty: 40, price: 260 }], "p2", () => "x");
    expect([again.same, again.fixed, again.lots]).toEqual([["NIFTYBEES"], [], two]);
    const newer = bookAfterImport(two, [{ symbol: "NIFTYBEES", qty: 45, price: 262 }], "p2", () => "x");
    expect(newer.fixed).toEqual(["NIFTYBEES"]);
    expect(newer.lots.map((l) => [l.id, l.pf, l.qty, l.price])).toEqual([["impA", "main", 100, 250], ["impB", "main", 50, 60], ["impC", "p2", 45, 262]]);
  });
  it("a buy the member typed in that account is kept; a file with no price keeps the account's price", () => {
    const own = [...book, lot("k1", "NIFTYBEES", 30, 255, "p2")];
    expect(bookAfterImport(own, [{ symbol: "NIFTYBEES", qty: 40, price: 260 }], "p2", () => "x")).toMatchObject({ kept: ["NIFTYBEES"], lots: own });
    const r = bookAfterImport([lot("impD", "GOLDBEES", 10, 61, "p2")], [{ symbol: "GOLDBEES", qty: 12, price: 0 }], "p2", () => "x");
    expect(r.lots).toEqual([lot("impD", "GOLDBEES", 12, 61, "p2")]);
  });
  it("a quantity-only line (units from before buys existed) stays counted when another account joins, and is replaced by its own account's file", () => {
    const legacy = [lot("was-NIFTYBEES", "NIFTYBEES", 100, 0, "main", { legacy: true })];
    const other = bookAfterImport(legacy, [{ symbol: "NIFTYBEES", qty: 40, price: 0 }], "p2", () => "imp9");
    expect(other.joined).toEqual(["NIFTYBEES"]);
    expect(other.lots).toEqual([lot("was-NIFTYBEES", "NIFTYBEES", 100, null, "main"), lot("imp9", "NIFTYBEES", 40, null, "p2")]);
    expect(units(other.lots, "NIFTYBEES")).toBe(140);
    const same = bookAfterImport(legacy, [{ symbol: "NIFTYBEES", qty: 110, price: 251 }], "main", () => "imp8");
    expect([same.fixed, same.lots]).toEqual([["NIFTYBEES"], [lot("imp8", "NIFTYBEES", 110, 251, "main")]]);
  });
  it("names an ETF whose import buy in another account has the same units: an import from before may have put this file's there (it is not moved)", () => {
    const wrong = [lot("impA", "NIFTYBEES", 100, 250), lot("impE", "HDFCMID150", 25, 180)];
    const r = bookAfterImport(wrong, [{ symbol: "NIFTYBEES", qty: 40, price: 260 }, { symbol: "HDFCMID150", qty: 25, price: 180 }], "p2", () => "imp" + Math.random().toString(36).slice(2, 6));
    expect(r.twins).toEqual([{ symbol: "HDFCMID150", pf: "main" }]);
    expect(r.lots.filter((l) => l.pf === "main")).toEqual(wrong);
    const typed = bookAfterImport([lot("k2", "HDFCMID150", 25, 180)], [{ symbol: "HDFCMID150", qty: 25, price: 180 }], "p2", () => "x");
    expect(typed.twins).toEqual([]);                                                                       // a buy the member typed is theirs
    const qtyOnly = bookAfterImport([lot("was-HDFCMID150", "HDFCMID150", 25, 0, "main", { legacy: true })], [{ symbol: "HDFCMID150", qty: 25, price: 180 }], "p2", () => "x");
    expect(qtyOnly.twins).toEqual([{ symbol: "HDFCMID150", pf: "main" }]);
  });
  it("a trade history goes to its own account whole, beside another account's buys", () => {
    const r = bookAfterImport(book, [{ symbol: "NIFTYBEES", qty: 100, price: 250, date: "2025-04-10" }, { symbol: "NIFTYBEES", qty: 40, price: 275, date: "2025-10-01", side: "sell" }], "p2", () => "t" + Math.random().toString(36).slice(2, 6));
    expect(r.joined).toEqual(["NIFTYBEES"]); expect(r.twins).toEqual([]);
    expect(r.lots.filter((l) => l.pf === "p2").map((l) => [l.side, l.qty, l.price, l.date])).toEqual([["buy", 100, 250, "2025-04-10"], ["sell", 40, 275, "2025-10-01"]]);
    expect(units(r.lots, "NIFTYBEES")).toBe(160);
  });
});

describe("what the member is told (etfAccountMessage)", () => {
  const base = { created: false, full: false, fresh: [] as string[], joined: [] as string[], fixed: [] as string[], kept: [] as string[], priced: 0, fromRate: 0, traded: 0 };
  it("names the account and what happened to each ETF", () => {
    expect(etfAccountMessage({ ...base, account: "Second account", created: true, fresh: ["HDFCMID150"], joined: ["NIFTYBEES"], priced: 2 }))
      .toBe('2 ETFs went to your ETF portfolio, account "Second account" (made there to match this portfolio): HDFCMID150 is new to it; NIFTYBEES was already there from another account and now has this account\'s units too. 2 have the file\'s average buy price.');
    expect(etfAccountMessage({ ...base, account: "Second account", same: ["NIFTYBEES", "HDFCMID150"] }))
      .toBe('2 ETFs went to your ETF portfolio, account "Second account": NIFTYBEES and HDFCMID150 were already in this account with the file\'s units and buy price, so nothing changed.');
    expect(etfAccountMessage({ ...base, account: "Account 0", full: true, fixed: ["GOLDBEES"], kept: ["NIFTYBEES"], unpriced: 1 }))
      .toBe('2 ETFs went to your ETF portfolio, account "Account 0" (its first account: it already has 10, the most it takes): GOLDBEES in this account was updated to the file\'s units and buy price; NIFTYBEES already has buys of its own in this account, so it was not changed. One has no buy price in the file: add it under Edit on the ETF portfolio.');
    expect(etfAccountMessage({ ...base, account: "Second account", joined: ["HDFCMID150"], priced: 1, twins: [{ symbol: "HDFCMID150", account: "First account" }] }))
      .toMatch(/HDFCMID150 is also in account "First account" with the same units\. Imports used to put every portfolio's ETFs in the first account, so that buy may be this file's from an earlier import: if so, delete it there under Edit\.$/);
    expect(etfAccountMessage({ ...base, account: "X" })).toBe("");
  });
});

describe("two Equity portfolios, one after the other, into the ETF portfolio (importEtf, against a stand-in server)", () => {
  beforeEach(() => { srv.list.clear(); srv.lots = []; srv.accounts = []; srv.calls = []; });
  const file1 = [{ input: "NIFTYBEES", symbol: "NIFTYBEES", qty: 100, avg: 250 }, { input: "GOLDBEES", symbol: "GOLDBEES", qty: 50, avg: 60 }];
  const file2 = [{ input: "NIFTYBEES", symbol: "NIFTYBEES", qty: 40, avg: 260 }, { input: "HDFCMID150", symbol: "HDFCMID150", qty: 25, avg: 180 }];
  const acct1 = { ...first, mainName: "First account" }, acct2 = { ...second, mainName: "First account" };
  it("the second portfolio's ETFs reach the ETF page: its own account, its units added, nothing of the first's changed", async () => {
    const one = await sendAllFunds(file1, acct1);
    expect(one.msg).toBe('2 ETFs went to your ETF portfolio, account "My ETFs": NIFTYBEES and GOLDBEES are new to it. 2 have the file\'s average buy price.');
    expect([...srv.list]).toEqual([["NIFTYBEES", 100], ["GOLDBEES", 50]]);
    const two = await sendAllFunds(file2, acct2);
    expect([one.pf, two.pf]).toEqual(["main", "p2"]);                                       // the note's link opens that account on the ETF page
    expect(two.msg).toBe('2 ETFs went to your ETF portfolio, account "Second account" (made there to match this portfolio): HDFCMID150 is new to it; NIFTYBEES was already there from another account and now has this account\'s units too. 2 have the file\'s average buy price.');
    expect(Object.fromEntries(srv.list)).toEqual({ NIFTYBEES: 140, GOLDBEES: 50, HDFCMID150: 25 });
    expect(srv.accounts).toEqual([{ id: "main", name: "First account", created: expect.any(String) }, { id: "p2", name: "Second account", broker: "Dhan", created: expect.any(String) }]);
    expect(srv.lots.map((l) => [l.symbol, l.pf, l.qty, l.price])).toEqual([["NIFTYBEES", "main", 100, 250], ["GOLDBEES", "main", 50, 60], ["HDFCMID150", "p2", 25, 180], ["NIFTYBEES", "p2", 40, 260]]);
    expect(srv.calls.find((c) => c.path.endsWith("/import-commit") && JSON.stringify(c.body).includes("HDFCMID150"))?.body).toMatchObject({ existing: "skip" });
    // the same second file again: nothing is added twice, and the book is not sent
    srv.calls = [];
    const again = await sendAllFunds(file2, acct2);
    expect(again.msg).toBe('2 ETFs went to your ETF portfolio, account "Second account": NIFTYBEES and HDFCMID150 were already in this account with the file\'s units and buy price, so nothing changed.');
    expect(srv.calls.some((c) => c.method === "PUT")).toBe(false);
    expect(Object.fromEntries(srv.list)).toEqual({ NIFTYBEES: 140, GOLDBEES: 50, HDFCMID150: 25 });
    // and the first file again: the first account stays as it is
    expect((await sendAllFunds(file1, acct1)).msg).toMatch(/account "First account": NIFTYBEES and GOLDBEES were already in this account/);
  });
  it("a second file with only ETFs the first holds: their units add up (they were written over, 100 -> 40, with the book still at 100)", async () => {
    await sendAllFunds(file1, acct1);
    const two = await sendAllFunds([{ input: "NIFTYBEES", symbol: "NIFTYBEES", qty: 40, avg: 260 }, { input: "GOLDBEES", symbol: "GOLDBEES", qty: 30 }], acct2);
    expect(Object.fromEntries(srv.list)).toEqual({ NIFTYBEES: 140, GOLDBEES: 80 });
    expect(two.msg).toMatch(/^2 ETFs went to your ETF portfolio, account "Second account" \(made there to match this portfolio\): NIFTYBEES and GOLDBEES were already there from another account and now have this account's units too\. One has the file's average buy price\. One has no buy price in the file: add it under Edit on the ETF portfolio\.$/);
  });
  it("ETFs stored before buys existed (units only) keep their units when a second account comes", async () => {
    srv.list.set("NIFTYBEES", 100);
    await addBookBuys([{ symbol: "NIFTYBEES", qty: 40, price: 260 }], acct2);
    expect(srv.list.get("NIFTYBEES")).toBe(140);
    expect(srv.lots.map((l) => [l.id, l.pf, l.qty, l.price])).toEqual([["was-NIFTYBEES", "main", 100, null], [expect.stringMatching(/^imp/), "p2", 40, 260]]);
  });
  it("a third portfolio gets its own account too; the first portfolio's file, if it comes later, still goes to the first account", async () => {
    await sendAllFunds(file2, acct2);
    expect(srv.accounts.map((a) => [a.id, a.name])).toEqual([["main", "First account"], ["p2", "Second account"]]);
    await sendAllFunds([{ input: "GOLDBEES", symbol: "GOLDBEES", qty: 5, avg: 62 }], { id: "x7k2m9qa", name: "Third", mainName: "First account" });
    await sendAllFunds(file1, acct1);
    expect(srv.accounts.map((a) => [a.id, a.name])).toEqual([["main", "First account"], ["p2", "Second account"], ["x7k2m9qa", "Third"]]);
    expect(Object.fromEntries(srv.list)).toEqual({ NIFTYBEES: 140, HDFCMID150: 25, GOLDBEES: 55 });
    expect(srv.lots.filter((l) => l.pf === "main").map((l) => [l.symbol, l.qty])).toEqual([["NIFTYBEES", 100], ["GOLDBEES", 50]]);
  });
});
