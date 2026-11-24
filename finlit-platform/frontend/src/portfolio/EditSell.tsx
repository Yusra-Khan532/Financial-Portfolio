// Task #274 (the 20 Nov equity pack, change 3): Edit | Sell under each share, in place of the drop-down arrow and the buy rows it opened inside the table.
//   Edit: the share's buys (date, quantity, price, portfolio, cost, delete), + Add a buy, past sales (read only), a summary line and Remove from this portfolio
//   (asks to confirm). Sell: date sold (today), quantity (all by default; "You have 20"), price (latest close), portfolio, and a preview of which buys the sale
//   uses (first in, first out), the realised gain or loss (short or long term) and what is left; more than held says so and Save turns off.
// The rules stay as today (lib/ledger): first in, first out within each portfolio; the average buy price is worked out from what is left. Classes: pfe-.
import { useDialogFocus } from "../lib/useDialogFocus";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CoLogo } from "../components/CoLogo";
import { aggOf, pfOf, rowsOf, type BuyFig, type SaleFig } from "../lib/ledger";
import { DEFAULT_PF, type Holding } from "../lib/portfolio";
import type { LotsProps } from "./HoldingCells";
import { inr, qf, sinr, tone } from "./money";
import "./add-shares.css";

const today = () => new Date().toISOString().slice(0, 10);
const plural = (n: number, w: string) => `${qf(n)} ${w}${n === 1 ? "" : "s"}`;
const dfmt = (d?: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "no date");

/** The live dialog (acc-dlg) with focus kept inside, Esc to close and focus given back to the opener. */
function Win({ title, sub, logo, wide, onClose, children, first = "input, select, button.go" }: { title: ReactNode; sub?: ReactNode; logo?: ReactNode; wide?: boolean; onClose: () => void; children: ReactNode;
  /** task #292: what gets the focus when the dialog opens */ first?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useDialogFocus(box, onClose, { first });     // task #292: once per opening; typing no longer moves the cursor to Date bought
  return <div className="acc-dlg pfa-dlg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={"acc-dlg-in" + (wide ? " pfa-wide" : " pfe-mid")} role="dialog" aria-modal="true" aria-labelledby="pfe-h" ref={box}>
      <div className="pfa-dh"><h2 id="pfe-h" className="pfe-h">{logo}{title}</h2><button type="button" className="pfa-x" aria-label="Close" onClick={onClose}>×</button></div>
      {sub && <p className="acc-dlg-p">{sub}</p>}
      {children}
    </div>
  </div>;
}

// ------------------------------------------------------------------------------------------------ Edit
export function EditWindow({ p, symbol, title, name, onClose, onRemove }: { p: LotsProps; symbol: string; title: string; name: string; onClose: () => void; onRemove: (pf: string | "all") => void }) {
  const rows = rowsOf(p.holdings, symbol, p.cur), a = aggOf(p.holdings, symbol, p.cur);
  const buys = rows.filter((r) => !r.sale), sales = rows.filter((r) => r.sale);
  const target = p.cur !== "all" ? p.cur : a && a.pfs.length === 1 ? a.pfs[0] : p.goTo;
  const [confirm, setConfirm] = useState(false);
  // a share with no buys opens with one empty row (pack): the first "Add a buy" fills its name-only line
  const opened = useRef(false);
  useEffect(() => { if (!opened.current && !buys.length) { opened.current = true; p.add(symbol, target, "buy"); } }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const where = p.cur === "all" ? (p.nPortfolios > 1 ? "all your portfolios" : p.pfName(DEFAULT_PF)) : p.pfName(p.cur);
  const left = a?.qty ?? 0;
  const summary = a && a.nBuys ? `${plural(left, "share")} · ${a.avg != null ? `average ${inr(a.avg, 2)}` : "add the buy prices for an average"} · ${a.invested != null ? `invested ${inr(a.invested)}` : "invested not known yet"}` : "No buys yet.";
  if (confirm) return <Win key="remove" title={`Remove ${title}?`} onClose={() => setConfirm(false)}>
    <p className="acc-dlg-p">{name} leaves {where}, and its buys and sales there are deleted. You can add it again later.</p>
    <div className="acc-dlg-b"><button type="button" onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="go" onClick={() => { onRemove(p.cur); onClose(); }}>Remove</button></div>
  </Win>;
  return <Win key="edit" wide first={'input[aria-label^="Quantity"]'} title={<>Edit {title} <small>{name}</small></>} logo={<CoLogo symbol={symbol} name={name} size={30} />} onClose={onClose}
    sub="Each buy with its date, quantity and price. Changes are saved as you type.">
    <div className="pfa-entw"><table className="pfa-ent pfe-ent">
      <thead><tr><th scope="col">Date bought</th><th scope="col">Quantity</th><th scope="col">Price (₹)</th><th scope="col">Portfolio</th><th scope="col" className="r">Cost</th><th scope="col"><span className="sr-only">Delete</span></th></tr></thead>
      <tbody>{buys.map(({ row, fig }, i) => { const b = fig as BuyFig | null, sold = b && b.sold > 0;
        return <tr key={row.id}>
          <td data-l="Date bought"><input className="pfa-in" type="date" max={today()} value={row.date ?? ""} aria-label={`Date of buy ${i + 1} of ${title}`} onChange={(e) => p.edit(row.id, { date: e.target.value || undefined })} /></td>
          <td data-l="Quantity"><input className="pfa-in" type="number" inputMode="decimal" min="0" step="any" placeholder="Qty" defaultValue={row.qty > 0 ? row.qty : ""} aria-label={`Quantity in buy ${i + 1} of ${title}`}
            onChange={(e) => { const n = Number(e.target.value); p.edit(row.id, { qty: e.target.value.trim() === "" ? 0 : Number.isFinite(n) && n >= 0 ? n : row.qty }); }} />
            {sold && <small className="pfe-n">{qf(b!.left)} left · {qf(b!.sold)} sold</small>}</td>
          <td data-l="Price (₹)"><input className="pfa-in" type="number" inputMode="decimal" min="0" step="any" placeholder="Buy price" defaultValue={row.price > 0 ? row.price : ""} aria-label={`Buy price in buy ${i + 1} of ${title}`}
            onChange={(e) => { const n = Number(e.target.value); p.edit(row.id, { price: e.target.value.trim() === "" ? 0 : Number.isFinite(n) && n >= 0 ? n : row.price }); }} /></td>
          <td data-l="Portfolio">{p.pfName(pfOf(row))}</td>
          <td data-l="Cost" className="r">{row.qty > 0 && row.price > 0 ? inr(row.qty * row.price) : "–"}</td>
          <td className="r"><button type="button" className="pfa-x" aria-label={`Delete buy ${i + 1} of ${title}`} onClick={() => p.remove(row.id)}>×</button></td>
        </tr>; })}</tbody></table></div>
    <div className="pfa-row2"><button type="button" className="pfx-btn" onClick={() => p.add(symbol, target, "buy")}>+ Add a buy</button><span className="pfx-note">A sale uses up the earliest buys first (first in, first out). The average buy price is worked out from what is left.</span></div>
    {sales.length > 0 && <div className="pfe-sales"><p className="pfa-lab">Past sales</p><ul>{sales.map(({ row, fig }) => { const x = fig as SaleFig | null;
      return <li key={row.id}>{dfmt(row.date)} · {plural(row.qty, "share")} at {row.price > 0 ? inr(row.price, 2) : "no price"}{x?.gain != null && x.err == null ? <> · <b className={tone(x.gain)}>{sinr(x.gain)}</b> booked</> : null}</li>; })}</ul></div>}
    <p className="pfe-sum">{summary}</p>
    <div className="acc-dlg-b pfa-df"><button type="button" className="pfe-rm" onClick={() => setConfirm(true)}>Remove from {p.cur === "all" ? "your list" : "this portfolio"}</button>
      <span className="pfa-btns"><button type="button" className="go" onClick={onClose}>Done</button></span></div>
  </Win>;
}

// ------------------------------------------------------------------------------------------------ Sell
export type SalePlan = { from: { date?: string; qty: number; price: number }[]; err: number | null; cost: number | null; got: number | null; gain: number | null; shortGain: number; longGain: number; left: number };
/** What a sale would do (pure, tested): the buys it uses first in, first out, the realised gain or loss split by holding period (over 12 months is long term,
 *  as for listed shares), and what is left. It runs the site's own ledger on the list with the sale added, so the preview is what will be saved. */
export function planSale(holdings: Holding[], symbol: string, pf: string, sale: { date: string; qty: number; price: number }): SalePlan {
  const row: Holding = { id: "__preview", symbol, qty: sale.qty, price: sale.price, date: sale.date, owned: true, side: "sell", ...(pf !== DEFAULT_PF ? { pf } : {}) };
  const hs = [...holdings, row];
  const fig = rowsOf(hs, symbol, pf).find((r) => r.row.id === "__preview")?.fig as SaleFig | null | undefined;
  const byId = new Map(holdings.map((h) => [h.id, h]));
  const from = (fig?.from ?? []).map((f) => ({ date: f.date, qty: f.qty, price: byId.get(f.id)?.price ?? 0 }));
  const year = (d?: string) => { if (!d) return false; const t = new Date(sale.date + "T00:00:00"); t.setFullYear(t.getFullYear() - 1); return new Date(d + "T00:00:00") < t; };
  let shortGain = 0, longGain = 0;
  for (const f of from) { const g = (sale.price - f.price) * f.qty; if (year(f.date)) longGain += g; else shortGain += g; }
  const left = aggOf(hs, symbol, pf)?.qty ?? 0;
  return { from, err: fig?.err ?? null, cost: fig?.cost ?? null, got: fig?.got ?? null, gain: fig?.gain ?? null, shortGain, longGain, left };
}
export function SellWindow({ p, symbol, title, name, onClose, onSave }: {
  p: LotsProps; symbol: string; title: string; name: string; onClose: () => void; onSave: (sale: Omit<Holding, "id">) => void;
}) {
  const a = aggOf(p.holdings, symbol, p.cur);
  const pfs = useMemo(() => (a ? [...a.ledgers].filter((l) => (l.qty ?? 0) > 0).sort((x, y) => (y.qty ?? 0) - (x.qty ?? 0)).map((l) => l.pf) : []), [a]);
  const [pf, setPf] = useState(pfs[0] ?? (p.cur !== "all" ? p.cur : p.goTo)), held = aggOf(p.holdings, symbol, pf)?.qty ?? 0;
  const px = p.priceOf(symbol);
  const [date, setDate] = useState(today()), [qty, setQty] = useState(held ? String(held) : ""), [price, setPrice] = useState(px != null ? px.toFixed(2) : "");
  useEffect(() => { setQty(held ? String(held) : ""); }, [pf]);   // eslint-disable-line react-hooks/exhaustive-deps
  const q = Number(qty), pr = Number(price), ok = Number.isFinite(q) && q > 0, over = ok && q > held + 1e-9;
  const plan = ok && !over && Number.isFinite(pr) && pr > 0 ? planSale(p.holdings, symbol, pf, { date, qty: q, price: pr }) : null;
  return <Win title={`Record a sale of ${title}`} logo={<CoLogo symbol={symbol} name={name} size={30} />} onClose={onClose} sub={name}>
    <div className="pfe-grid">
      <label><span>Date sold</span><input className="pfa-in" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value > today() ? today() : e.target.value)} /></label>
      <label><span>Quantity <small>You have {qf(held)}</small></span><input className="pfa-in" type="number" inputMode="decimal" min="0" step="any" value={qty} aria-describedby={over ? "pfe-over" : undefined} onChange={(e) => setQty(e.target.value)} /></label>
      <label><span>Price (₹)</span><input className="pfa-in" type="number" inputMode="decimal" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      {pfs.length > 1 ? <label><span>Portfolio</span><select className="pfa-in" value={pf} onChange={(e) => setPf(e.target.value)}>{pfs.map((x) => <option key={x} value={x}>{p.pfName(x)}</option>)}</select></label>
        : <div className="pfe-pf"><span>Portfolio</span><b>{p.pfName(pf)}</b></div>}
    </div>
    {over && <p className="pfe-over" id="pfe-over" role="alert">More than you have: you can record up to {qf(held)}.</p>}
    {plan && <div className="pfe-prev" aria-live="polite">
      <p className="pfa-lab">What this sale does</p>
      <dl>
        <dt>Uses</dt><dd>{plan.from.map((f, i) => <span key={i}>{qf(f.qty)} from the buy of {dfmt(f.date)}{f.price > 0 ? ` at ${inr(f.price, 2)}` : ""}</span>)}<small>first in, first out</small></dd>
        <dt>Realised</dt><dd>{plan.gain == null ? "Add the buy prices to see it" : <><b className={tone(plan.gain)}>{sinr(plan.gain)}</b><small>{[plan.shortGain ? `short term ${sinr(plan.shortGain)}` : "", plan.longGain ? `long term ${sinr(plan.longGain)}` : ""].filter(Boolean).join(" · ")}</small></>}</dd>
        <dt>Left</dt><dd>{plural(plan.left, "share")}</dd>
      </dl></div>}
    <div className="acc-dlg-b pfa-df"><span className="pfx-note">Charges and taxes are not included.</span>
      <span className="pfa-btns"><button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="go" disabled={!plan} onClick={() => { onSave({ symbol, qty: q, price: pr, date, owned: true, side: "sell", ...(pf !== DEFAULT_PF ? { pf } : {}) }); onClose(); }}>Save the sale</button></span></div>
  </Win>;
}

/** "Edit | Record a sale" under a share's name. Sell is greyed out with no quantity ("Add a buy first"). */
export function EditSellLinks({ p, symbol, onEdit, onSell }: { p: LotsProps; symbol: string; onEdit: () => void; onSell: () => void }) {
  const a = aggOf(p.holdings, symbol, p.cur), canSell = !!a && (a.qty ?? 0) > 0;
  return <span className="pfe-links"><button type="button" onClick={onEdit} aria-label={`Edit ${symbol}: its buys`}>Edit</button><span aria-hidden="true">|</span>
    <button type="button" onClick={onSell} disabled={!canSell} title={canSell ? undefined : "Add a buy first"} aria-label={canSell ? `Record a sale of ${symbol}` : `Record a sale of ${symbol}: add a buy first`}>Record a sale</button></span>;   // task #385 (developer file 33): "Sell" becomes "Record a sale"
}
