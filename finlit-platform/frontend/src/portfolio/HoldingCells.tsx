// Task #235 (the 18 Nov portfolios pack, B7, B9, B11): the Equity table's holding columns in three groups (WHAT YOU PAID · WHAT IT IS WORTH NOW · GAIN OR
// LOSS), each holding's buys and sales as rows under it (first in, first out within each portfolio), and the total row. The sums are lib/ledger's; this
// file draws them. Charges, taxes and dividends are not included. Describes; never advice.
import { useEffect, useRef, type ReactNode } from "react";
import { MINUS } from "../lib/format";
import { aggOf, moneyOf, pfOf, rowsOf, type Agg, type BuyFig, type SaleFig } from "../lib/ledger";
import type { Holding } from "../lib/portfolio";
import { dfmt, dshort, inr, pct, qf, sinr, tone } from "./money";
import "./holdings-kit.css";
export { inr, pct, qf, sinr, tone };

export type LotsProps = {
  holdings: Holding[]; cur: string | "all"; pfName: (id: string) => string; nPortfolios: number;
  priceOf: (s: string) => number | null | undefined; changeOf: (s: string) => number | null | undefined;
  add: (symbol: string, pf: string, side: "buy" | "sell") => void; edit: (id: string, patch: Partial<Pick<Holding, "qty" | "price" | "date">>) => void; remove: (id: string) => void;
  /** the portfolio a new row goes to in All accounts when the share is in two (pack B9: the "go to" account; B11: the one holding more) */
  goTo: string;
  open: Set<string>; onOpen: (symbol: string, open: boolean) => void; focus: { symbol: string; what: "qty" | "price" } | null;
};
export const HOLD_COLS = 8;    // Qty · Avg buy price · Invested · Latest price · Today · Value now · ₹ · %


/** The band row and the column names of the holding groups (they follow Share and Size). */
export function HoldingHeads({ sortHead }: { sortHead: (id: string, label: string, cls: string) => ReactNode }) {
  return <>{sortHead("qty", "Qty", "r x-c1 x-gs cg-h")}{sortHead("avg", "Avg buy price", "r x-c1 cg-h")}{sortHead("invested", "Invested", "r x-c1 cg-h")}
    {sortHead("price", "Latest price", "r x-c2 x-gs cg-h")}{sortHead("change", "Today", "r x-c2 cg-h")}{sortHead("now", "Value now", "r x-c2 cg-h")}
    {sortHead("gain", "₹", "r x-c3 x-gs cg-h")}{sortHead("gainPct", "%", "r x-c3 cg-h")}</>;
}
export const GroupBand = () => <><th colSpan={3} className="x-g x-g1 cg-h">What you paid</th><th colSpan={3} className="x-g x-g2 cg-h">What it is worth now</th><th colSpan={2} className="x-g x-g3 cg-h">Gain or loss</th></>;

/** A holding's figures for sorting and for its row. */
export function holdingFigs(p: LotsProps, symbol: string) {
  const a = aggOf(p.holdings, symbol, p.cur), px = p.priceOf(symbol), ch = p.changeOf(symbol);
  const now = a?.qty != null && px != null ? a.qty * px : null, gain = now != null && a?.invested != null ? now - a.invested : null;
  return { a, px, ch, now, gain, gainPct: gain != null && a?.invested ? (gain / a.invested) * 100 : null, today: now != null && ch != null ? now - now / (1 + ch / 100) : null };
}

/** The holding's eight cells (pack B7, B9, B11). */
export function HoldingRowCells({ p, symbol, priceCell, changeCell }: { p: LotsProps; symbol: string; priceCell: ReactNode; changeCell: ReactNode }) {
  const f = holdingFigs(p, symbol), a = f.a, on = p.open.has(symbol);
  if (!a) return <><td className="x-c1 x-gs cg-h" /><td className="x-c1 cg-h" /><td className="x-c1 cg-h" />{priceCell}{changeCell}<td className="x-c2 cg-h" /><td className="x-c3 x-gs cg-h" /><td className="x-c3 cg-h" /></>;
  const lbl = `${a.nBuys} ${a.nBuys === 1 ? "buy" : "buys"}${a.nSales + a.bad ? ` · ${a.nSales + a.bad} ${a.nSales + a.bad === 1 ? "sale" : "sales"}` : ""}`;
  const booked = a.nSales && a.bookedOk ? <small className={"x-bkd " + tone(a.booked)}>{sinr(a.booked)} booked</small> : null;
  const priceMissing = a.ledgers.some((l) => l.buys.some((b) => b.left > 0 && !(b.row.price > 0)));
  return <>
    <td className="r x-qty x-c1 x-gs cg-h"><button type="button" className={"x-lotbtn" + (a.bad ? " bad" : "")} aria-expanded={on} aria-controls={`lots-${symbol}`} aria-label={`${on ? "Hide" : "Show"} the ${lbl} of ${symbol}`} onClick={() => p.onOpen(symbol, !on)}>
      <b>{a.qty == null ? MINUS : qf(a.qty)}</b><small>{a.nBuys ? lbl : "Add buys"}<i aria-hidden="true">▾</i></small></button></td>
    <td className="r x-avg x-c1 cg-h">{a.qty === 0 ? <span className="x-ro"><b>{MINUS}</b><small>all sold</small></span>
      : a.avg != null ? <span className="x-ro"><b>{inr(a.avg, 2)}</b><small>{a.nSales ? "average of what is left" : `average of ${a.nBuys}`}</small></span>
      : a.nBuys ? <button type="button" className="x-need-b" onClick={() => p.onOpen(symbol, true)} title={priceMissing ? "A buy has no price yet" : undefined}>add a buy price</button>
      : <button type="button" className="x-need-b" onClick={() => { p.add(symbol, p.cur === "all" ? (a.pfs[0] ?? p.goTo) : p.cur, "buy"); p.onOpen(symbol, true); }}>add a buy</button>}</td>
    <td className="r x-inv x-c1 cg-h">{a.qty === 0 || a.qty == null ? MINUS : a.invested == null ? <span className="x-need">add buy price</span> : inr(a.invested)}</td>
    {priceCell}{changeCell}
    <td className="r x-now x-c2 cg-h">{f.now == null ? MINUS : inr(f.now)}</td>
    <td className="r x-gl x-c3 x-gs cg-h">{f.gain == null ? (booked ?? MINUS) : <><b className={tone(f.gain)}>{sinr(f.gain)}</b>{booked}</>}</td>
    <td className="r x-glp x-c3 cg-h">{f.gainPct == null ? MINUS : <span className={"x-pp " + tone(f.gainPct)}>{pct(f.gainPct)}</span>}</td>
  </>;
}

function NumBox({ value, label, placeholder, onSave, autoFocus, cls }: { value: number; label: string; placeholder: string; onSave: (v: number) => void; autoFocus?: boolean; cls?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return <input ref={ref} className={cls} type="number" inputMode="decimal" min="0" step="any" placeholder={placeholder} aria-label={label} defaultValue={value > 0 ? value : ""}
    onChange={(e) => { const n = Number(e.target.value); if (e.target.value.trim() === "") onSave(0); else if (Number.isFinite(n) && n >= 0 && n <= 1_000_000_000) onSave(n); }} />;
}

/** The buy and sale rows under a holding, then the "+ Add a buy · − Add a sale" row (pack B9, B11). `lead` = the columns before the holding groups; `rest` after. */
export function LotRows({ p, symbol, lead, rest }: { p: LotsProps; symbol: string; lead: number; rest: number }) {
  const rows = rowsOf(p.holdings, symbol, p.cur), px = p.priceOf(symbol), ch = p.changeOf(symbol) ?? 0;
  const a = aggOf(p.holdings, symbol, p.cur) as Agg | null;
  const target = p.cur !== "all" ? p.cur : a && a.pfs.length === 1 ? a.pfs[0] : p.goTo;
  const sellTo = p.cur !== "all" ? p.cur : a ? [...a.ledgers].sort((x, y) => (y.qty ?? 0) - (x.qty ?? 0))[0]?.pf ?? p.goTo : p.goTo;
  const lastDraft = rows.filter((r) => !(r.row.qty > 0)).pop()?.row.id;
  return <>{rows.map(({ row, sale, fig }) => {
    const S = sale, wd = S ? "sale" : "buy", b = fig as BuyFig | null, x = fig as SaleFig | null;
    const left = !S && b ? b.left : row.qty, done = !S && b && b.sold > 0 && left <= 1e-9;
    let note = "", title = "";
    if (S && x) { note = x.err != null ? `only ${qf(x.err)} held then` : x.from.length === 1 ? `FIFO: buy of ${dshort(x.from[0].date)}` : x.from.length ? `FIFO: ${x.from.length} buys` : "";
      title = x.from.length ? `First in, first out: ${x.from.map((f) => `${qf(f.qty)} from the buy of ${dfmt(f.date)}`).join("; ")}` : ""; }
    else if (b && b.sold > 0) { note = left > 1e-9 ? `${qf(left)} left · ${qf(b.sold)} sold` : "all sold"; title = `Sold first in, first out: ${b.by.map((f) => `${qf(f.qty)} on ${dfmt(f.date)}`).join("; ")}`; }
    const inv = !S && row.qty > 0 && !done ? (row.price > 0 ? left * row.price : null) : null, now = !S && row.qty > 0 && !done && px != null ? left * px : null;
    const gl = inv != null && now != null ? now - inv : null, day = now != null ? now - now / (1 + ch / 100) : null;
    return <tr key={row.id} data-lsym={symbol} id={row.id === rows[0]?.row.id ? `lots-${symbol}` : undefined} className={"x-lot" + (S ? " x-sell" : "") + (done ? " x-done" : "") + (S && x?.err != null ? " x-err" : "")}>
      <td className="pfx-name" colSpan={lead}><div className="x-lot-h"><span className="x-lot-k">{S ? "Sold" : "Bought"}</span>
        {p.cur === "all" && p.nPortfolios > 1 && <span className="acc-tag">{p.pfName(pfOf(row))}</span>}
        <button type="button" className="x-lot-x" aria-label={`Remove this ${wd} of ${symbol}`} onClick={() => p.remove(row.id)}>×</button>
        <input type="date" value={row.date ?? ""} max={new Date().toISOString().slice(0, 10)} aria-label={`Date of this ${wd} of ${symbol}`} onChange={(e) => p.edit(row.id, { date: e.target.value || undefined })} /></div></td>
      <td className="r l-qty x-c1 x-gs cg-h"><NumBox value={row.qty} label={`Quantity ${S ? "sold in this sale" : "in this buy"} of ${symbol}`} placeholder="Qty" onSave={(v) => p.edit(row.id, { qty: v })}
        autoFocus={row.id === lastDraft || (p.focus?.symbol === symbol && p.focus.what === "qty" && row.id === rows[0]?.row.id)} />
        {note && <small className="x-lot-n" title={title || undefined} aria-live="polite">{note}</small>}</td>
      <td className="r l-avg x-c1 cg-h"><span className={"x-pin" + (row.price > 0 ? "" : " need")}><span aria-hidden="true">₹</span>
        <NumBox value={row.price} label={`${S ? "Sell price in this sale" : "Buy price in this buy"} of ${symbol}`} placeholder={S ? "Sell price" : "Buy price"} onSave={(v) => p.edit(row.id, { price: v })}
          autoFocus={p.focus?.symbol === symbol && p.focus.what === "price" && row.id === rows.find((r) => !r.sale && !(r.row.price > 0))?.row.id} /></span></td>
      {S ? <>
        <td className="r l-inv x-c1 cg-h">{!x || x.err != null || !(row.qty > 0) ? MINUS : x.cost != null ? <>{inr(x.cost)}<small>cost, first in first out</small></> : <span className="x-need">add buy price</span>}</td>
        <td className="x-c2 x-gs cg-h" /><td className="x-c2 cg-h" />
        <td className="r l-now x-c2 cg-h">{!x || x.err != null || !(row.qty > 0) ? MINUS : x.got != null ? <>{inr(x.got)}<small>sold for</small></> : <span className="x-need">add sell price</span>}</td>
        <td className="r l-gl x-c3 x-gs cg-h">{x?.gain == null || x.err != null ? MINUS : <><b className={tone(x.gain)}>{sinr(x.gain)}</b><small>booked</small></>}</td>
        <td className="r l-glp x-c3 cg-h">{x?.gain == null || x.err != null || !x.cost ? MINUS : <span className={"x-pp " + tone(x.gain)}>{pct((x.gain / x.cost) * 100)}</span>}</td>
      </> : <>
        <td className="r l-inv x-c1 cg-h">{done || !(row.qty > 0) ? MINUS : inv == null ? <span className="x-need">add price</span> : inr(inv)}</td>
        <td className="x-c2 x-gs cg-h" />
        <td className="r l-day x-c2 cg-h">{day == null ? (done ? "" : MINUS) : <span className={"x-day " + tone(day)} title="This buy's gain or loss today">{sinr(day)}</span>}</td>
        <td className="r l-now x-c2 cg-h">{now == null ? MINUS : inr(now)}</td>
        <td className="r l-gl x-c3 x-gs cg-h">{gl == null ? MINUS : <b className={tone(gl)}>{sinr(gl)}</b>}</td>
        <td className="r l-glp x-c3 cg-h">{gl == null || !inv ? MINUS : <span className={"x-pp " + tone(gl)}>{pct((gl / inv) * 100)}</span>}</td>
      </>}
      {rest > 0 && <td colSpan={rest} className="cg-s" />}
    </tr>; })}
    <tr className="x-lotadd" data-lsym={symbol}><td colSpan={lead + HOLD_COLS + rest}><div className="x-lotadd-in">
      <button type="button" className="x-lotadd-b" onClick={() => p.add(symbol, target, "buy")}>+ Add a buy</button>
      <button type="button" className="x-lotadd-b x-selladd-b" onClick={() => p.add(symbol, sellTo, "sell")}>− Add a sale</button>
      <span>A sale uses up the earliest buys first (first in, first out). The average buy price is worked out from what is left.</span></div></td></tr>
  </>;
}

/** The total row (pack B7, B11): "Total · N shares in M portfolios", then Invested, Value now, ₹ and % (booked under the gain). */
export function TotalRow({ p, symbols, lead, rest, noun = ["share", "shares"] }: { p: LotsProps; symbols: string[]; lead: number; rest: number; noun?: [string, string] }) {
  const hs = p.holdings.filter((h) => symbols.includes(h.symbol.toUpperCase()) || symbols.includes(h.symbol));
  const t = moneyOf(hs, p.cur, p.priceOf, p.changeOf);
  if (!t.n) return null;
  const where = p.cur === "all" ? (p.nPortfolios > 1 ? ` in ${p.nPortfolios} portfolios` : "") : ` in ${p.pfName(p.cur)}`;
  return <tr className="x-tot"><th scope="row" colSpan={lead + 2}>Total<span className="x-tot-n"> · {t.n} {t.n === 1 ? noun[0] : noun[1]}{where}</span></th>
    <td className="r x-inv x-c1 cg-h">{t.full ? <>{inr(t.invested)}{t.full < t.n && <small>{t.full} of {t.n} {noun[1]}</small>}</> : MINUS}</td>
    <td className="x-c2 x-gs cg-h" /><td className="r x-c2 cg-h">{t.withQty ? <span className={tone(t.today)}>{sinr(t.today)}</span> : MINUS}</td>
    <td className="r x-now x-c2 cg-h">{t.withQty ? inr(t.now) : MINUS}</td>
    <td className="r x-gl x-c3 x-gs cg-h">{t.full ? <b className={tone(t.gain)}>{sinr(t.gain)}</b> : MINUS}{t.nSales > 0 && t.bookedOk && <small className={"x-bkd " + tone(t.booked)}>{sinr(t.booked)} booked</small>}</td>
    <td className="r x-glp x-c3 cg-h">{t.full && t.invested ? <span className={"x-pp " + tone(t.gain)}>{pct((t.gain / t.invested) * 100)}</span> : MINUS}</td>
    {rest > 0 && <td colSpan={rest} className="cg-s" />}</tr>;
}
