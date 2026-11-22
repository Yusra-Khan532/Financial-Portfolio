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

export type FundLine = { isin?: string; symbol?: string; input: string; qty?: number; avg?: number; rate?: number; rateOn?: string };
/** `i`: the row's place in the request, from 0 (the server's `enumerate`); `row`: the number we gave it (`etfPreviewRows`: place + 1). */
export type EtfPreviewRow = { i: number; row?: number; status: "matched" | "duplicate" | "ignored" | "not_found" | "invalid"; etf?: { symbol: string; name?: string }; qty?: number | string | null; existing?: boolean };
export type EtfPreview = { rows: EtfPreviewRow[]; capacity: { limit: number; used: number; room: number } };

/** The rows for import-preview: one per fund line, numbered from 1 (the ETF page's own `b()` gives { row, isin, symbol?, name?, qty? }). */
export function etfPreviewRows(funds: FundLine[]): { row: number; isin?: string; symbol?: string; name: string; qty?: string }[] {
  return funds.map((f, i) => ({ row: i + 1, ...(f.isin ? { isin: f.isin } : {}), ...(f.symbol && !f.isin ? { symbol: f.symbol } : {}), name: f.input, ...(f.qty != null && f.qty > 0 ? { qty: String(f.qty) } : {}) }));
}

/** A spreadsheet's lines that named no listed company (the matcher's `missing`), with their amounts: tried as ETFs by symbol. */
export function fundsFromMissing(missing: string[], entries: { name: string; isin?: string; qty?: number; avg?: number; rate?: number; rateOn?: string }[]): FundLine[] {
  const by = new Map(entries.map((e) => [e.name.trim().toUpperCase(), e]));
  return missing.map((m): FundLine => {
    const e = by.get(m.trim().toUpperCase());
    return { input: m, ...(e?.isin ? { isin: e.isin } : /^[A-Z0-9&_.-]{2,20}$/i.test(m.trim()) ? { symbol: m.trim().toUpperCase() } : {}),
      ...(e?.qty != null ? { qty: e.qty } : {}), ...(e?.avg != null ? { avg: e.avg } : {}), ...(e?.rate != null ? { rate: e.rate, ...(e.rateOn ? { rateOn: e.rateOn } : {}) } : {}) };
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
export function etfCommit(plan: EtfPlan, ticked: Set<string>): { items: { symbol: string; qty: number }[]; existing: "replace" } {
  return { items: [...plan.add, ...plan.have].filter((x) => ticked.has(x.symbol)).map((x) => ({ symbol: x.symbol, qty: x.qty })), existing: "replace" };
}

/** The buys to put in the ETF book: one per ticked ETF with no buys yet (`hasBuys`), at the file's average buy price, or else at the Rate when the
 *  member chose the Rate as the buy price (dated by the Rate's date). */
export function etfBuys(plan: EtfPlan, ticked: Set<string>, rateAsBuy: boolean, hasBuys: (symbol: string) => boolean, pf = "main"):
  { symbol: string; qty: number; price: number; owned: true; pf: string; date?: string }[] {
  return [...plan.add, ...plan.have]
    .filter((x) => ticked.has(x.symbol) && !hasBuys(x.symbol) && ((x.avg != null && x.avg > 0) || (rateAsBuy && x.rate != null && x.rate > 0)))
    .map((x) => x.avg != null && x.avg > 0
      ? { symbol: x.symbol, qty: x.qty, price: x.avg, owned: true as const, pf }
      : { symbol: x.symbol, qty: x.qty, price: x.rate as number, owned: true as const, pf, ...(x.rateOn ? { date: x.rateOn } : {}) });
}

type Lot = { id: string; symbol: string; pf: string; side: "buy" | "sell"; qty: number; price: number | null; date: string | null; legacy?: boolean };
/** The ETF book after an import's buys (PUT /book takes the whole book). An ETF with no buys gets the file's buy; one with buys keeps them, except a single
 *  buy that an earlier import made (id "imp…", the same quantity) at another price: until 22 Nov 2026 the equity page's import gave each ETF after the first
 *  the line before's average price (`etfPlan`), and importing the file again puts the right one in. A quantity-only line ("legacy") is left as it is. */
export function bookAfterImport(lots: Lot[], buys: { symbol: string; qty: number; price: number; date?: string }[], pf: string, newId: () => string):
  { lots: Lot[]; added: string[]; fixed: string[] } {
  const real = lots.filter((l) => !l.legacy);
  const of = (sym: string) => real.filter((l) => l.symbol === sym);
  const added: string[] = [], fixed: string[] = [];
  const out = real.map((l) => ({ ...l, price: l.price != null && l.price > 0 ? l.price : null }));
  for (const x of buys) {
    const mine = of(x.symbol);
    if (!mine.length) { out.push({ id: newId(), symbol: x.symbol, pf, side: "buy", qty: x.qty, price: x.price, date: x.date ?? null }); added.push(x.symbol); continue; }
    const only = mine.length === 1 ? mine[0] : null;
    if (only && only.id.startsWith("imp") && only.side === "buy" && Math.abs(only.qty - x.qty) < 1e-6 && only.price != null && Math.abs(only.price - x.price) >= 0.005) {
      const k = out.findIndex((l) => l.id === only.id);
      out[k] = { ...out[k], price: x.price };
      fixed.push(x.symbol);
    }
  }
  return { lots: out, added, fixed };
}

/** The line after Add: "8 ETFs went to your ETF portfolio: 6 added, units set for NIFTYBEES and BANKBEES." */
export function etfMessage(res: { added: number; replaced?: number; skipped?: number }, have: string[], buys = 0, rateOn?: string | null): string {
  const n = res.added + (res.replaced ?? 0);
  if (!n) return "";
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const parts = [res.added ? `${res.added} added` : "", res.replaced ? `units set for ${have.length && have.length === res.replaced ? list(have) : `${res.replaced} already there`}` : ""].filter(Boolean);
  const on = dayLabel(rateOn ?? null);
  return `${n} ${n === 1 ? "ETF went" : "ETFs went"} to your ETF portfolio: ${parts.join(", ")}.${buys ? ` ${buys === n ? "Each has" : `${buys} have`} the statement's Rate${on ? ` of ${on}` : ""} as ${buys === 1 ? "its" : "their"} buy price.` : ""}`;
}
