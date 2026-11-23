// Developer file 33: one account's figures on All my investments (lib/accountMoney), as the Equity, MF and ETF pages' own rows add up. Sample holdings only.
import { describe, expect, it } from "vitest";
import { accountFigs, accountSub, type AccountBooks } from "./accountMoney";
import { bookRows } from "./etfBook";
import { keyOf, mfRows } from "./mfBook";
import type { AllInvestments } from "./myInvest";
import type { MfPortfolio } from "./mfPortfolio";
import type { Holding } from "./portfolio";

const H = (id: string, symbol: string, pf: string, qty: number, price: number, extra: Partial<Holding> = {}): Holding => ({ id, symbol, pf, qty, price, owned: true, date: "2025-01-01", ...extra });
const all = { shares: [{ symbol: "TCS", price: 3000 }, { symbol: "INFY", price: 1500 }], etfs: [{ symbol: "NIFTYBEES", qty: 300, price: 280, chg1d: 0, invested: 75000 }, { symbol: "GOLDBEES", qty: 50, price: 60, chg1d: 0, invested: null }],
  funds: [{ units: 100, nav: 50, invested: 4000 }] } as unknown as AllInvestments;
const etfBook = { portfolios: [{ id: "a1", name: "Zerodha" }, { id: "a2", name: "Dhan" }], names: ["GOLDBEES"],
  lots: [{ id: "l1", symbol: "NIFTYBEES", pf: "a1", side: "buy" as const, qty: 200, price: 240, date: null }, { id: "l2", symbol: "NIFTYBEES", pf: "a2", side: "buy" as const, qty: 100, price: 270, date: null }] };
const books = (x: Partial<AccountBooks> = {}): AccountBooks => ({ all, hs: [H("t", "TCS", "z", 10, 2500), H("i", "INFY", "d", 20, 1400)], etfRows: bookRows(etfBook), mfRows: null, nav: () => null, etfAccounts: 2, mfAccounts: 1, ...x });

describe("one account's figures (accountFigs)", () => {
  it("adds the account's ETFs, from the ETF page's rows, to its shares", () => {
    const z = accountFigs({ eq: ["z"], mf: null, etf: "a1" }, books());
    // TCS 10 × 3000; NIFTYBEES 200 × 280; GOLDBEES is a name in the first account: counted, not valued
    expect(z).toMatchObject({ shares: 1, etfs: 2, funds: 0, n: 3, now: 30000 + 56000, valued: 2, priced: 2, invested: 25000 + 48000, unread: [] });
    expect(z.gainPct).toBeCloseTo(((86000 - 73000) / 73000) * 100, 6);
    const d = accountFigs({ eq: ["d"], mf: null, etf: "a2" }, books());
    expect(d).toMatchObject({ shares: 1, etfs: 1, now: 30000 + 28000, invested: 28000 + 27000 });
    expect(accountSub(z)).toBe("1 share · 2 ETFs"); expect(accountSub(d)).toBe("1 share · 1 ETF");
  });
  it("an account on the ETF page only; an ETF sold in full there is not counted", () => {
    const rows = [...bookRows(etfBook), H("s1", "NIFTYBEES", "a2", 100, 300, { side: "sell", date: undefined })];
    expect(accountFigs({ eq: [], mf: null, etf: "a2" }, books({ etfRows: rows }))).toMatchObject({ shares: 0, etfs: 0, n: 0, now: 0 });
    expect(accountSub(accountFigs({ eq: [], mf: null, etf: "a2" }, books({ etfRows: rows })))).toBe("nothing yet");
  });
  it("the ETF page's rows not read yet: one ETF account takes the all-accounts answer; with two, the row says so instead of leaving them out", () => {
    const one = accountFigs({ eq: ["z"], mf: null, etf: "a1" }, books({ etfRows: null, etfAccounts: 1 }));
    expect(one).toMatchObject({ etfs: 2, now: 30000 + 84000 + 3000, valued: 3, priced: 2 });
    expect(one.gainPct).toBeNull();                                                      // GOLDBEES has no buy price
    const two = accountFigs({ eq: ["z"], mf: null, etf: "a1" }, books({ etfRows: null }));
    expect(two).toMatchObject({ etfs: null, unread: ["etfs"], now: 30000 });
    expect(accountSub(two)).toBe("1 share · ETFs not read yet");
  });
  it("funds on two platforms, from the MF page's rows and NAVs", () => {
    const mf = { holdings: [
      { id: "h1", nav: 50, lines: [{ id: "x1", units: 60, invested: 2400, boughtOn: null, pf: "groww", side: "buy" }, { id: "x2", units: 40, invested: 1800, boughtOn: null, pf: "kuvera", side: "buy" }] },
      { id: "h2", nav: 20, lines: [] }] } as unknown as MfPortfolio;
    const navs = new Map([[keyOf("h1"), 50], [keyOf("h2"), 20]]);
    const b = books({ mfRows: mfRows(mf, "groww"), nav: (k) => navs.get(k) ?? null, mfAccounts: 2 });
    const g = accountFigs({ eq: [], mf: "groww", etf: null }, b), k = accountFigs({ eq: [], mf: "kuvera", etf: null }, b);
    expect(g).toMatchObject({ funds: 2, now: 3000, valued: 1, invested: 2400 });          // h2 is followed only: a name in the first platform
    expect(k).toMatchObject({ funds: 1, now: 2000, invested: 1800 });
    expect(accountSub(g)).toBe("2 funds");
    expect(accountSub(accountFigs({ eq: [], mf: "groww", etf: null }, books({ mfAccounts: 2 })))).toBe("funds not read yet");
  });
  it("shares sold in full are left out; a share with no price today is counted, not valued", () => {
    const hs = [H("t", "TCS", "z", 10, 2500), H("t2", "TCS", "z", 10, 2900, { side: "sell", date: "2025-06-01" }), H("w", "WIPRO", "z", 5, 400)];
    expect(accountFigs({ eq: ["z"], mf: null, etf: null }, books({ hs }))).toMatchObject({ shares: 1, now: 0, valued: 0, gainPct: null });
  });
});
