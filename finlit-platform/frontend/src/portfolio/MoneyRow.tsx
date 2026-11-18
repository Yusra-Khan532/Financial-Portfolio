// Task #235 (the 18 Nov portfolios pack, B7, B11, B14): the "Your money" row above Key figures (Invested, Value now, Gain or loss, Today, and Booked gain
// when the portfolio has sales), the missing-figures note with "Add it now", and the Sold list under the table. Sums: lib/ledger. Describes; never advice.
import { useState } from "react";
import { ledgerOf, pfOf, soldInFull, type Money } from "../lib/ledger";
import type { Holding } from "../lib/portfolio";
import { dfmt, dshort, inr, pct, qf, sinr, tone } from "./money";
import "./holdings-kit.css";

export function MoneyRow({ t, onAdd, noun = ["share", "shares"], today = true, nameOf = (s: string) => s }: { t: Money; onAdd: (symbol: string, what: "qty" | "price") => void; noun?: [string, string]; today?: boolean; nameOf?: (symbol: string) => string }) {
  if (!t.n && !t.nSales) return null;
  const na = t.missing.filter((m) => m.what === "price").map((m) => m.symbol), nq = t.missing.filter((m) => m.what === "qty").map((m) => m.symbol);
  const list = (xs: string[]) => xs.slice(0, 3).map(nameOf).join(", ") + (xs.length > 3 ? ` and ${xs.length - 3} more` : "");
  const parts = [nq.length ? `the buys of ${list(nq)}` : "", na.length ? `the buy price for ${list(na)}` : ""].filter(Boolean);
  return <>
    <div className="xm-row" aria-label="Your money">
      <div className="xm"><p className="xm-k">Invested</p><p className="xm-v">{t.full ? inr(t.invested) : "—"}</p><p className="xm-x">{t.full < t.n ? `${t.full} of ${t.n} ${noun[1]} have a buy price` : "What you paid for what you hold"}</p></div>
      <div className="xm"><p className="xm-k">Value now</p><p className="xm-v">{t.withQty ? inr(t.now) : "—"}</p><p className="xm-x">Quantity × latest price</p></div>
      <div className="xm"><p className="xm-k">Gain or loss</p><p className="xm-v">{t.full ? <span className={tone(t.gain)}>{sinr(t.gain)}</span> : "—"}</p>
        <p className="xm-x">{t.full && t.invested ? <><span className={tone(t.gain)}>{pct((t.gain / t.invested) * 100)}</span> on what you invested</> : "Value now − invested"}</p></div>
      {today && <div className="xm"><p className="xm-k">Today</p><p className="xm-v">{t.withQty ? <span className={tone(t.today)}>{sinr(t.today)}</span> : "—"}</p>
        <p className="xm-x">{t.withQty && t.prev ? <><span className={tone(t.today)}>{pct((t.today / t.prev) * 100, 2)}</span> since the previous close</> : "Since the previous close"}</p></div>}
      {(t.nSales > 0 || t.bad > 0) && <div className="xm"><p className="xm-k">Booked gain</p><p className="xm-v">{t.nSales && t.bookedOk ? <span className={tone(t.booked)}>{sinr(t.booked)}</span> : "—"}</p>
        <p className="xm-x">{[t.nSales ? (t.bookedOk ? `From ${t.nSales} ${t.nSales === 1 ? "sale" : "sales"}, first in, first out` : "Add the missing prices to work it out") : "",
          ].filter(Boolean).join(" · ")}{t.bad > 0 && <span className="x-dn">{t.nSales ? " · " : ""}{t.bad} {t.bad === 1 ? "sale is" : "sales are"} larger than what was held</span>}</p></div>}
    </div>
    {t.missing.length > 0 && t.n > 0 && <p className="x-miss" role="status"><b>{t.full} of {t.n}</b> {noun[1]} have quantities and buy prices. Add {parts.join(" and ")} to count {t.missing.length === 1 ? "it" : "them"} in Invested and Gain.{" "}
      <button type="button" onClick={() => onAdd(t.missing[0].symbol, t.missing[0].what)}>Add it now</button></p>}
  </>;
}

type SoldItem = { pf: string; symbol: string; buys: number; sales: number; bq: number; bc: number | null; sq: number; sg: number | null; booked: number | null; d0: string; d1: string; ledger: ReturnType<typeof ledgerOf> };
/** Every share sold in full in a portfolio (pack B14), newest sale first. pf "all": each portfolio on its own (sold in Dhan, held in Upstox: Sold for Dhan). */
export function soldOf(hs: Holding[], pf: string | "all"): SoldItem[] {
  const keys = [...new Set(hs.filter((h) => pf === "all" || pfOf(h) === pf).map((h) => `${pfOf(h)}|${h.symbol.toUpperCase()}`))];
  const out: SoldItem[] = [];
  for (const k of keys) {
    const [p, s] = k.split("|"), l = ledgerOf(hs, s, p);
    if (!soldInFull(l)) continue;
    const S = l.sales.filter((x) => x.err == null), bOk = l.buys.every((b) => b.row.price > 0), sOk = S.every((x) => x.got != null);
    out.push({ pf: p, symbol: s, buys: l.buys.length, sales: S.length, bq: l.buys.reduce((a, b) => a + b.row.qty, 0), bc: bOk ? l.buys.reduce((a, b) => a + b.row.qty * b.row.price, 0) : null,
      sq: S.reduce((a, x) => a + x.row.qty, 0), sg: sOk ? S.reduce((a, x) => a + (x.got ?? 0), 0) : null, booked: l.bookedOk ? l.booked : null,
      d0: l.buys.map((b) => b.row.date ?? "").filter(Boolean).sort()[0] ?? "", d1: S.map((x) => x.row.date ?? "").filter(Boolean).sort().pop() ?? "", ledger: l });
  }
  return out.sort((a, b) => (b.d1 > a.d1 ? 1 : b.d1 < a.d1 ? -1 : 0));
}

export function SoldList({ items, all, pfName, onRemoveSale, noun = ["share", "shares"] }: { items: SoldItem[]; all: boolean; pfName: (id: string) => string; onRemoveSale: (id: string, symbol: string) => void; noun?: [string, string] }) {
  const [open, setOpen] = useState(false), [more, setMore] = useState<Set<string>>(new Set());
  if (!items.length) return null;
  const ok = items.every((x) => x.booked != null), tot = items.reduce((a, x) => a + (x.booked ?? 0), 0);
  return (
    <section className="x-sold" aria-label="Sold in full" id="pf-sold">
      <button type="button" className="x-sold-t" aria-expanded={open} aria-controls="x-sold-b" onClick={() => setOpen(!open)}>
        <span className="x-sold-k">Sold</span><b>{items.length} {items.length === 1 ? noun[0] : noun[1]} sold in full</b>
        <span className="x-sold-s">{ok ? <><span className={tone(tot)}>{sinr(tot)}</span> booked</> : "booked gain needs prices"} · first in, first out</span><i aria-hidden="true">▾</i></button>
      {open && <div id="x-sold-b" className="x-sold-b"><div className="x-sold-w"><table className="x-sold-tb">
        <thead><tr><th scope="col">{noun[0].charAt(0).toUpperCase() + noun[0].slice(1)}</th>{all && <th scope="col">Account</th>}<th scope="col" className="r">Bought</th><th scope="col" className="r">Sold for</th>
          <th scope="col" className="r">Booked</th><th scope="col" className="r">%</th><th scope="col">Held</th><th scope="col"><span className="sr-only">Buys and sales</span></th></tr></thead>
        <tbody>{items.map((x) => { const k = `${x.pf}:${x.symbol}`, op = more.has(k);
          return [<tr key={k}><td><b>{x.symbol}</b><small>{x.buys} {x.buys === 1 ? "buy" : "buys"} · {x.sales} {x.sales === 1 ? "sale" : "sales"}</small></td>
            {all && <td data-l="Account"><span className="acc-tag">{pfName(x.pf)}</span></td>}
            <td className="r" data-l="Bought">{inr(x.bc)}<small>{qf(x.bq)} bought</small></td><td className="r" data-l="Sold for">{inr(x.sg)}<small>{qf(x.sq)} sold</small></td>
            <td className="r" data-l="Booked"><b className={tone(x.booked)}>{sinr(x.booked)}</b></td>
            <td className="r" data-l="Booked %">{x.booked != null && x.bc ? <span className={"x-pp " + tone(x.booked)}>{pct((x.booked / x.bc) * 100)}</span> : "—"}</td>
            <td data-l="Held">{dshort(x.d0)} → {dshort(x.d1)}</td>
            <td className="r"><button type="button" className="x-sold-more" aria-expanded={op} onClick={() => setMore((m) => { const n = new Set(m); if (n.has(k)) n.delete(k); else n.add(k); return n; })}>Buys and sales <i aria-hidden="true">▾</i></button></td></tr>,
            op && <tr key={k + ":d"} className="x-sold-d"><td colSpan={all ? 8 : 7}><ul>{[...x.ledger.buys.map((b) => ({ d: b.row.date ?? "", k: 0, b, s: null })), ...x.ledger.sales.filter((s) => s.err == null).map((s) => ({ d: s.row.date ?? "", k: 1, b: null, s }))]
              .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.k - b.k)).map((e) => e.b
                ? <li key={e.b.row.id}><span className="x-sold-ek">Bought</span>{dfmt(e.b.row.date)} · {qf(e.b.row.qty)} at {e.b.row.price > 0 ? inr(e.b.row.price, 2) : "—"}{e.b.row.price > 0 ? ` · ${inr(e.b.row.qty * e.b.row.price)}` : ""}</li>
                : <li key={e.s!.row.id} className="s"><span className="x-sold-ek">Sold</span>{dfmt(e.s!.row.date)} · {qf(e.s!.row.qty)} at {e.s!.row.price > 0 ? inr(e.s!.row.price, 2) : "—"}{e.s!.got != null ? ` · ${inr(e.s!.got)}` : ""}
                  {" · "}<span className="x-sold-ff">first in, first out: {e.s!.from.map((f) => `${qf(f.qty)} from ${dshort(f.date)}`).join(", ")}</span>
                  {e.s!.gain != null && <> · <b className={tone(e.s!.gain)}>{sinr(e.s!.gain)} booked</b></>}
                  <button type="button" className="x-sold-x" aria-label={`Remove this sale of ${x.symbol}`} onClick={() => onRemoveSale(e.s!.row.id, x.symbol)}>×</button></li>)}</ul></td></tr>]; })}</tbody>
      </table></div><p className="x-sold-n">A {noun[0]} sold in full leaves Your {noun[1]}, the scores and the analytics. Its booked gain stays in the Booked gain box. Remove a sale to bring it back.</p></div>}
    </section>
  );
}
