// Developer file 33 (founder, 23 Nov 2026: "All my investments, Your portfolios (right side box): ETFs not included in the calculation"). One account on All
// my investments is one name across the three portfolio pages (task #235: Dhan on the Equity page and Dhan on the ETF page are one account). Its figures
// are the sum of what each page says of it:
//   - shares: its Equity portfolios' buys, first in, first out (lib/ledger), at the latest close;
//   - ETFs and funds: its account on the ETF page and its platform on the MF page, worked out from that page's own rows with that page's own rule
//     (lib/ledger moneyOf, as each page's Your portfolios box does), so a row here is the Equity page's row plus the ETF page's plus the MF page's.
// Until this file an account's ETFs and funds were counted only when it was the only account of that kind, so with two ETF accounts no account had its
// ETFs, while All accounts had them all. A kind whose rows could not be read is named (`unread`), never left out in silence. Information only.
import { aggOf, moneyOf } from "./ledger";
import type { AllInvestments } from "./myInvest";
import { DEFAULT_PF, type Holding } from "./portfolio";

/** One account: its Equity portfolios (one or more of the same name), its MF platform and its ETF account (null: none on that page). */
export type AccountRef = { eq: string[]; mf: string | null; etf: string | null };
/** What the figures are worked out from. `all`: the all-accounts answer (its closes, NAVs, and the funds and ETFs when one account holds them all);
 *  `etfRows` / `mfRows`: the ETF and MF pages' rows (lib/etfBook bookRows, lib/mfBook mfRows), null while not read; `nav`: a fund's NAV by its row key. */
export type AccountBooks = { all: AllInvestments | undefined; hs: Holding[]; etfRows: Holding[] | null; mfRows: Holding[] | null; nav: (key: string) => number | null;
  etfAccounts: number; mfAccounts: number };
/** shares / funds / etfs: how many the account holds (null: not read); n: all of them; now: value now of those with a quantity and a price (`valued`);
 *  invested: what those with a buy price cost (`priced`); gainPct only when every valued holding has its buy price. */
export type AccountFigs = { shares: number; funds: number | null; etfs: number | null; n: number; now: number; valued: number; priced: number; invested: number;
  gainPct: number | null; unread: ("funds" | "etfs")[] };

export function accountFigs(a: AccountRef, b: AccountBooks): AccountFigs {
  const f: AccountFigs = { shares: 0, funds: a.mf ? null : 0, etfs: a.etf ? null : 0, n: 0, now: 0, valued: 0, priced: 0, invested: 0, gainPct: null, unread: [] };
  // shares: the account's own buys, at the all-accounts answer's close (the answer for a picked account holds only that account's shares)
  const mine = b.hs.filter((h) => a.eq.includes(h.pf ?? DEFAULT_PF));
  for (const s of new Set(mine.map((h) => h.symbol.toUpperCase()))) {
    const g = aggOf(mine, s, "all"), px = b.all?.shares.find((x) => x.symbol === s)?.price ?? null;
    if (g && g.qty === 0 && g.nBuys > 0) continue;                                       // sold in full
    f.shares++;
    if (g?.qty && px) { f.now += g.qty * px; f.valued++; if (g.invested != null) { f.invested += g.invested; f.priced++; } }
  }
  const etfPx = new Map((b.all?.etfs ?? []).map((e) => [e.symbol.toUpperCase(), e.price])), etfChg = new Map((b.all?.etfs ?? []).map((e) => [e.symbol.toUpperCase(), e.chg1d]));
  const kind = (k: "funds" | "etfs", id: string | null, rows: Holding[] | null, price: (s: string) => number | null | undefined, change: (s: string) => number | null | undefined, accounts: number) => {
    if (!id) return;
    if (rows) {                                                                          // the page's own rows and rule
      const m = moneyOf(rows, id, price, change);
      f[k] = m.n; f.now += m.now; f.valued += m.withQty; f.invested += m.invested; f.priced += m.full; return;
    }
    if (accounts === 1 && b.all) {                                                       // the only account of its kind: the all-accounts answer is its own
      const xs = k === "etfs" ? b.all.etfs.map((e) => ({ now: e.qty && e.price ? e.qty * e.price : null, inv: e.invested ?? null }))
        : b.all.funds.map((x) => ({ now: x.units && x.nav ? x.units * x.nav : null, inv: x.invested ?? null }));
      f[k] = xs.length;
      for (const x of xs) if (x.now != null) { f.now += x.now; f.valued++; if (x.inv != null) { f.invested += x.inv; f.priced++; } }
      return;
    }
    f.unread.push(k);
  };
  kind("etfs", a.etf, b.etfRows, (s) => etfPx.get(s.toUpperCase()) ?? null, (s) => etfChg.get(s.toUpperCase()) ?? null, b.etfAccounts);
  kind("funds", a.mf, b.mfRows, b.nav, () => null, b.mfAccounts);
  f.n = f.shares + (f.funds ?? 0) + (f.etfs ?? 0);
  f.gainPct = f.priced && f.priced === f.valued && f.invested ? ((f.now - f.invested) / f.invested) * 100 : null;
  return f;
}

/** The line under an account's name: "71 shares · 2 ETFs"; a kind not read yet is named as such ("ETFs not read yet"). */
export function accountSub(f: AccountFigs): string {
  const one = (n: number | null, w: [string, string], k: "funds" | "etfs" | null) => (n == null ? (k && f.unread.includes(k) ? `${w[1]} not read yet` : "") : n ? `${n} ${n === 1 ? w[0] : w[1]}` : "");
  return [one(f.shares, ["share", "shares"], null), one(f.funds, ["fund", "funds"], "funds"), one(f.etfs, ["ETF", "ETFs"], "etfs")].filter(Boolean).join(" · ") || "nothing yet";
}
