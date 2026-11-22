/** ETFs in an equity statement go to the ETF portfolio (22 Nov 2026, round 2).
 *  A demat statement lists ETFs (ISIN INF...) in the same table as company shares. The equity page does not score them, and live today they were
 *  listed as "Not added". Now the import dialog shows them in their own list, "N ETFs -> your ETF portfolio", and Add sends them there with the
 *  ETF portfolio page's own import (EtfPortfolio chunk, `un`):
 *    POST /api/me/etf-portfolio/import-preview  { rows: [{ row, isin, name, qty }] }
 *         -> { rows: [{ i, status: matched|duplicate|ignored|not_found|invalid, etf?: { symbol, name }, qty, existing }], capacity: { limit, used, room } }
 *    POST /api/me/etf-portfolio/import-commit   { items: [{ symbol, qty }], existing: "replace" }  -> { added, replaced, skipped }
 *  and, when the member chose the statement's Rate as the buy price, one buy per ETF in the ETF book (PUT /api/me/etf-portfolio/book, the store's
 *  `add({ symbol, qty, price, owned: true, pf })`), only for an ETF that has no buys there yet, so nothing is counted twice.
 *  Mutual fund units held in demat are INF too, but are not ETFs: the preview answers not_found, and they are listed as not added.
 *  A broker's holdings report has symbols and no ISINs (Upstox: Symbol / Qty. / Avg. price): its lines that name no listed company are tried as ETFs
 *  by symbol (`fundsFromMissing`), and an ETF with an average buy price in the file gets that price, whatever the Rate option says (round 3). */
import { dayLabel } from "./holdingsColumns";
import type { Trade } from "./tradeColumns";

/** trades (developer file 31): the line's buys and sales from a tradebook; qty and avg are then what is left of them, first in, first out */
export type FundLine = { isin?: string; symbol?: string; input: string; qty?: number; avg?: number; rate?: number; rateOn?: string; trades?: Trade[] };
/** `i`: the row's place in the request, from 0 (the server's `enumerate`); `row`: the number we gave it (`etfPreviewRows`: place + 1). */
export type EtfPreviewRow = { i: number; row?: number; status: "matched" | "duplicate" | "ignored" | "not_found" | "invalid"; etf?: { symbol: string; name?: string }; qty?: number | string | null; existing?: boolean };
export type EtfPreview = { rows: EtfPreviewRow[]; capacity: { limit: number; used: number; room: number } };

/** The rows for import-preview: one per fund line, numbered from 1 (the ETF page's own `b()` gives { row, isin, symbol?, name?, qty? }). */
export function etfPreviewRows(funds: FundLine[]): { row: number; isin?: string; symbol?: string; name: string; qty?: string }[] {
  return funds.map((f, i) => ({ row: i + 1, ...(f.isin ? { isin: f.isin } : {}), ...(f.symbol && !f.isin ? { symbol: f.symbol } : {}), name: f.input, ...(f.qty != null && f.qty > 0 ? { qty: String(f.qty) } : {}) }));
}

/** A spreadsheet's lines that named no listed company (the matcher's `missing`), with their amounts: tried as ETFs by symbol. */
export function fundsFromMissing(missing: string[], entries: { name: string; isin?: string; qty?: number; avg?: number; rate?: number; rateOn?: string; trades?: Trade[] }[]): FundLine[] {
  const by = new Map(entries.map((e) => [e.name.trim().toUpperCase(), e]));
  return missing.map((m): FundLine => {
    const e = by.get(m.trim().toUpperCase());
    return { input: m, ...(e?.isin ? { isin: e.isin } : /^[A-Z0-9&_.-]{2,20}$/i.test(m.trim()) ? { symbol: m.trim().toUpperCase() } : {}),
      ...(e?.qty != null ? { qty: e.qty } : {}), ...(e?.avg != null ? { avg: e.avg } : {}), ...(e?.rate != null ? { rate: e.rate, ...(e.rateOn ? { rateOn: e.rateOn } : {}) } : {}),
      ...(e?.trades?.length ? { trades: e.trades } : {}) };
  }).filter((f) => f.isin || f.symbol);
}

/** What the dialog shows for each fund line, from the preview: an ETF to add, one already there (its units are set), or a line not added and why. */
export type EtfPlan = {
  add: { symbol: string; name: string; qty: number; avg?: number; rate?: number; rateOn?: string; line: FundLine }[];
  have: { symbol: string; name: string; qty: number; avg?: number; rate?: number; rateOn?: string; line: FundLine }[];
  notAdded: { line: FundLine; why: string }[];
  room: number; limit: number; used: number;
  over: number;                                  // new ETFs beyond the plan's room: the last ones are left unticked
};
const WHY: Record<string, string> = {
  not_found: "not an ETF FinLit lists (mutual fund units? add them on the MF portfolio page)",
  invalid: "its line could not be read",
  duplicate: "repeated in the statement",
  ignored: "a company share, not an ETF",
};
export function etfPlan(funds: FundLine[], pv: EtfPreview): EtfPlan {
  const out: EtfPlan = { add: [], have: [], notAdded: [], room: pv.capacity.room, limit: pv.capacity.limit, used: pv.capacity.used, over: 0 };
  pv.rows.forEach((r) => {
    // the line this answer is about: by the row number we sent (place + 1), else by its place. Until 22 Nov 2026 this read funds[i - 1] with the
    // server's i counted from 0, so from the second ETF on each one took the line before it: its name, and its average buy price in the book.
    const line = r.row != null && r.row >= 1 ? funds[r.row - 1] : funds[r.i];
    if (!line) return;
    if (r.status !== "matched" || !r.etf) { out.notAdded.push({ line, why: WHY[r.status] ?? "not added" }); return; }
    const qty = Number(r.qty ?? line.qty);
    if (!(qty > 0)) { out.notAdded.push({ line, why: "no units in the statement" }); return; }
    const x = { symbol: r.etf.symbol, name: r.etf.name ?? line.input, qty, ...(line.avg ? { avg: line.avg } : {}), ...(line.rate ? { rate: line.rate, ...(line.rateOn ? { rateOn: line.rateOn } : {}) } : {}), line };
    (r.existing ? out.have : out.add).push(x);
  });
  out.over = Math.max(0, out.add.length - out.room);
  return out;
}

/** The body for import-commit: the ticked ETFs and their units. "replace": an ETF already there takes the statement's units, as shares do. */
/** Developer file 32: "skip", not "replace". An ETF already in the list keeps its units here; the book saved next records this account's buy, and the server
 *  sets each ETF's units from every account's buys. "replace" made a second account's file overwrite the first account's units (100 -> 40), and the next
 *  book save put them back, so the second account's units were never kept. */
export function etfCommit(plan: EtfPlan, ticked: Set<string>): { items: { symbol: string; qty: number }[]; existing: "skip" } {
  return { items: [...plan.add, ...plan.have].filter((x) => ticked.has(x.symbol)).map((x) => ({ symbol: x.symbol, qty: x.qty })), existing: "skip" };
}

// ------------------------------------------------------------------------------------------------ developer file 32: the ETF book's account for an import

export type EtfAccount = { id: string; name: string; broker?: string; created?: string };
/** The Equity portfolio a file was imported into (its id, name and broker). */
export type EqAccount = { id: string; name: string; broker?: string };
const ACC_ID = /^[a-z0-9]{1,16}$/, MAX_ACCOUNTS = 10;

/** The ETF book's account for an Equity portfolio's ETFs (the book's accounts are its own list, `etf_books.portfolios`):
 *   1. the account with the Equity portfolio's id (made by an earlier import), else 2. the one with its name (made by the member on the ETF page);
 *   3. the Equity page's first portfolio ("main") goes to the book's first account, as every import did before;
 *   4. else a new account with the portfolio's name and broker. A book with no accounts yet holds its buys in "main" (the page calls it "My ETFs"):
 *      that becomes an account of its own first, named as the Equity page's first portfolio (`mainName`), so those buys keep theirs.
 *  A book with 10 accounts (the most it takes) gets the buys in its first account, and `full` says so. */
export function etfAccountFor(portfolios: EtfAccount[], eq: EqAccount, mainName = "My ETFs", today = new Date().toISOString().slice(0, 10)):
  { pf: string; name: string; portfolios: EtfAccount[]; created: boolean; full: boolean } {
  const first = portfolios[0] ?? { id: "main", name: "My ETFs" };
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const hit = portfolios.find((a) => a.id === eq.id) ?? portfolios.find((a) => same(a.name, eq.name));
  if (hit) return { pf: hit.id, name: hit.name, portfolios, created: false, full: false };
  if (eq.id === "main") return { pf: first.id, name: first.name, portfolios, created: false, full: false };
  if (portfolios.length >= MAX_ACCOUNTS) return { pf: first.id, name: first.name, portfolios, created: false, full: true };
  const list = portfolios.length ? [...portfolios] : [{ id: "main", name: (mainName || "My ETFs").slice(0, 40), created: today }];
  let name = eq.name.trim().slice(0, 40) || "Account", k = 2;
  while (list.some((a) => same(a.name, name))) name = `${eq.name.trim().slice(0, 34)} (${k++})`;
  let id = ACC_ID.test(eq.id) ? eq.id : eq.id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "a" + Math.random().toString(36).slice(2, 9);
  while (list.some((a) => a.id === id)) id = ("a" + Math.random().toString(36).slice(2, 9)).slice(0, 16);
  const made: EtfAccount = { id, name, ...(eq.broker ? { broker: eq.broker.slice(0, 40) } : {}), created: today };
  return { pf: id, name, portfolios: [...list, made], created: true, full: false };
}

/** The buys to put in the ETF book: one per ticked ETF with no buys yet (`hasBuys`), at the file's average buy price, or else at the Rate when the
 *  member chose the Rate as the buy price (dated by the Rate's date). */
export function etfBuys(plan: EtfPlan, ticked: Set<string>, rateAsBuy: boolean, hasBuys: (symbol: string) => boolean, pf = "main"):
  { symbol: string; qty: number; price: number; owned: true; pf: string; date?: string; side?: "sell" }[] {
  // developer file 31: an ETF from a tradebook brings each of its buys and sales, dated, in place of one buy at the average
  const traded = [...plan.add, ...plan.have].filter((x) => ticked.has(x.symbol) && !hasBuys(x.symbol) && x.line.trades?.length);
  const fromTrades = traded.flatMap((x) => x.line.trades!.map((t) => ({ symbol: x.symbol, qty: t.qty, price: t.price ?? 0, owned: true as const, pf, ...(t.date ? { date: t.date } : {}), ...(t.side === "sell" ? { side: "sell" as const } : {}) })));
  return [...fromTrades, ...[...plan.add, ...plan.have]
    // developer file 32: every ticked ETF gets its buy, with no price when the file has none: the book now carries each account's units
    .filter((x) => !x.line.trades?.length && ticked.has(x.symbol) && !hasBuys(x.symbol) && x.qty > 0)
    .map((x) => x.avg != null && x.avg > 0
      ? { symbol: x.symbol, qty: x.qty, price: x.avg, owned: true as const, pf }
      : rateAsBuy && x.rate != null && x.rate > 0 ? { symbol: x.symbol, qty: x.qty, price: x.rate, owned: true as const, pf, ...(x.rateOn ? { date: x.rateOn } : {}) }
      : { symbol: x.symbol, qty: x.qty, price: 0, owned: true as const, pf })];
}

type Lot = { id: string; symbol: string; pf: string; side: "buy" | "sell"; qty: number; price: number | null; date: string | null; legacy?: boolean };
/** The ETF book after an import's buys in one account (`pf`; PUT /book takes the whole book). Developer file 32: each account is worked out on its own.
 *  The server then sets each ETF's units to its open units across every account, so a second account's units add to the first's.
 *   - An ETF with no buys in this account gets the file's buys there (`added`), whatever other accounts hold of it.
 *   - An ETF whose only buy in this account is one an earlier import made (id "imp…") takes the file's quantity and price (`updated`): the same account's
 *     newer statement. (Until 22 Nov 2026 the import gave each ETF after the first the line before's price; this also puts the right one in.)
 *   - An ETF with buys of its own in this account (typed on the page, or a history) keeps them (`kept`): a statement never replaces a history.
 *   - A quantity-only line ("legacy": an ETF stored before buys existed, read as a buy in the first account) is replaced by the file's buy when that is
 *     the same account, and kept as a buy of its own when another account's buy comes, so its units still count.
 *  A trade history (developer file 31) is added only where the account has none, and never updates a buy.
 *  `twins`: ETFs joined here whose buy in another account, made by an import (or a quantity-only line), has the same units (and the same buy price when
 *  both have one). Until this file every import put every portfolio's ETFs in the first account, so that buy may be this file's own from then: it is
 *  not moved or deleted (that would be a guess), and the message names it so the member can check. */
export function bookAfterImport(lots: Lot[], buys: { symbol: string; qty: number; price: number; date?: string; side?: "sell" }[], pf: string, newId: () => string,
  /** ETFs the import's commit has just put in the list: the book shows their units as a quantity-only line, which is the commit's own, not an account's */
  fresh: ReadonlySet<string> = new Set()):
  { lots: Lot[]; added: string[]; joined: string[]; fixed: string[]; kept: string[]; same: string[]; twins: { symbol: string; pf: string }[] } {
  const real = lots.filter((l) => !l.legacy), legacy = lots.filter((l) => l.legacy);
  const out: Lot[] = real.map((l) => ({ ...l, price: l.price != null && l.price > 0 ? l.price : null }));
  // added: in no account before; joined: held in another account, now in this one too; fixed: this account's earlier import (or its quantity-only line)
  // taken to the file's units and price; kept: this account's own buys, left as they are
  // same: this account's earlier import with the file's units and price already (the same file again): nothing to change
  const added: string[] = [], joined: string[] = [], fixed: string[] = [], kept: string[] = [], same: string[] = [], twins: { symbol: string; pf: string }[] = [];
  const syms = [...new Set(buys.map((b) => b.symbol))];
  for (const sym of syms) {
    const mine = buys.filter((b) => b.symbol === sym), here = real.filter((l) => l.symbol === sym && l.pf === pf);
    const old = fresh.has(sym) ? undefined : legacy.find((l) => l.symbol === sym);
    if (!here.length) {
      if (old && old.pf !== pf) out.push({ ...old, id: old.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40), price: null, legacy: undefined });   // another account's units stay counted
      for (const x of mine) out.push({ id: newId(), symbol: sym, pf, side: x.side === "sell" ? "sell" : "buy", qty: x.qty, price: x.price > 0 ? x.price : null, date: x.date ?? null });
      (old && old.pf === pf ? fixed : real.some((l) => l.symbol === sym) || old ? joined : added).push(sym);
      const one = mine.length === 1 && mine[0].side !== "sell" ? mine[0] : null;
      const twin = one && [...real.filter((l) => l.symbol === sym && l.pf !== pf && l.side === "buy" && l.id.startsWith("imp")), ...(old && old.pf !== pf ? [old] : [])]
        .find((l) => Math.abs(l.qty - one.qty) < 1e-6 && (l.legacy || !(l.price != null && l.price > 0) || !(one.price > 0) || Math.abs(l.price - one.price) < 0.005));
      if (twin) twins.push({ symbol: sym, pf: twin.pf });
      continue;
    }
    const only = here.length === 1 ? here[0] : null, x = mine.length === 1 && mine[0].side !== "sell" ? mine[0] : null;
    if (only && x && only.id.startsWith("imp") && only.side === "buy") {
      const price = x.price > 0 ? x.price : only.price;
      if (Math.abs(only.qty - x.qty) >= 1e-6 || (price != null && (only.price == null || Math.abs(only.price - price) >= 0.005))) {
        const k = out.findIndex((l) => l.id === only.id);
        out[k] = { ...out[k], qty: x.qty, price };
        fixed.push(sym);
      } else same.push(sym);
      continue;
    }
    kept.push(sym);
  }
  return { lots: out.map(({ legacy: _l, ...l }) => l), added, joined, fixed, kept, same, twins };
}

/** The line after an import's ETFs went on (developer file 32): which account of the ETF portfolio they went to, and what happened to each. */
export function etfAccountMessage(r: { account: string; created: boolean; full: boolean; fresh: string[]; joined: string[]; fixed: string[]; kept: string[]; same?: string[]; priced: number; fromRate: number; traded: number; unpriced?: number; rateOn?: string | null;
  twins?: { symbol: string; account: string }[] }): string {
  const list = (xs: string[]) => (xs.length <= 3 ? (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`) : `${xs.slice(0, 3).join(", ")} and ${xs.length - 3} more`);
  const same = r.same ?? [], n = r.fresh.length + r.joined.length + r.fixed.length + r.kept.length + same.length;
  if (!n) return "";
  const parts = [
    r.fresh.length ? `${list(r.fresh)} ${r.fresh.length === 1 ? "is" : "are"} new to it` : "",
    r.joined.length ? `${list(r.joined)} ${r.joined.length === 1 ? "was" : "were"} already there from another account and now ${r.joined.length === 1 ? "has" : "have"} this account's units too` : "",
    r.fixed.length ? `${list(r.fixed)} in this account ${r.fixed.length === 1 ? "was" : "were"} updated to the file's units and buy price` : "",
    r.kept.length ? `${list(r.kept)} already ${r.kept.length === 1 ? "has" : "have"} buys of ${r.kept.length === 1 ? "its" : "their"} own in this account, so ${r.kept.length === 1 ? "it was" : "they were"} not changed` : "",
    same.length ? `${list(same)} ${same.length === 1 ? "was" : "were"} already in this account with the file's units and buy price, so nothing changed` : "",
  ].filter(Boolean);
  const on = dayLabel(r.rateOn ?? null), avg = r.priced - r.fromRate - r.traded;
  return `${n} ${n === 1 ? "ETF went" : "ETFs went"} to your ETF portfolio, account "${r.account}"${r.created ? " (made there to match this portfolio)" : r.full ? " (its first account: it already has 10, the most it takes)" : ""}: ${parts.join("; ")}.`
    + (avg > 0 ? ` ${avg === 1 ? "One has" : `${avg} have`} the file's average buy price.` : "")
    + (r.fromRate ? ` ${r.fromRate === 1 ? "One has" : `${r.fromRate} have`} the statement's Rate${on ? ` of ${on}` : ""} as the buy price.` : "")
    + (r.traded ? ` ${r.traded === 1 ? "One comes" : `${r.traded} come`} with ${r.traded === 1 ? "its" : "their"} buys and sales from the file, dated.` : "")
    + (r.unpriced ? ` ${r.unpriced === 1 ? "One has" : `${r.unpriced} have`} no buy price in the file: add ${r.unpriced === 1 ? "it" : "them"} under Edit on the ETF portfolio.` : "")
    + [...new Set((r.twins ?? []).map((t) => t.account))].map((acc) => { const xs = (r.twins ?? []).filter((t) => t.account === acc).map((t) => t.symbol), one = xs.length === 1;
      return ` ${list(xs)} ${one ? "is" : "are"} also in account "${acc}" with the same units. Imports used to put every portfolio's ETFs in the first account, so ${one ? "that buy" : "those buys"} may be this file's from an earlier import: if so, delete ${one ? "it" : "them"} there under Edit.`; }).join("");
}
