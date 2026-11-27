// Task #276 (shared portfolio parts, §3 "Edit | Sell"): under each holding, in the live dialog (acc-dlg). Edit lists the buys (quantity, average buy price,
// bought on) with + Add a buy and "Remove from this portfolio"; Sell previews which buys the sale uses (first in, first out, lib/ledger) and the booked gain;
// Sell is greyed out while there is no quantity. Charges, taxes and dividends are not included. Describes; never advice.
import { useEffect, useMemo, useState } from "react";
import type { Holding } from "../../lib/portfolio";
import { ledgerOf, pfOf } from "../../lib/ledger";
import { dfmt, inr, qf, sinr, tone } from "../money";
import "../holdings-kit.css";
import "./kit.css";

export type Ops = { add: (h: Omit<Holding, "id">) => void; update: (id: string, h: Partial<Holding>) => void; remove: (id: string) => void };
export type PfOpt = { id: string; name: string };

/** "Edit | Sell" under a holding's name. Sell is greyed out (still focusable, with the reason) until there is a quantity to sell. */
export function EditSell({ name, held, onEdit, onSell, sell = "Sell" }: { name: string; held: number; onEdit: () => void; onSell: () => void;
  /** task #389 (developer file 32, Your funds 1): the MF page's button reads "Record a sale" (it records a sale made elsewhere; FinLit places no orders) */ sell?: string }) {
  return <span className="ptk-es"><button type="button" onClick={onEdit} aria-label={`Edit ${name}`}>Edit</button><i aria-hidden="true">|</i>
    <button type="button" aria-disabled={held <= 0} title={held <= 0 ? "Add a buy first" : undefined} aria-label={sell === "Sell" ? (held <= 0 ? `Sell ${name}: add a buy first` : `Sell ${name}`) : held <= 0 ? `${sell} of ${name}: add a buy first` : `${sell} of ${name}`} onClick={() => { if (held > 0) onSell(); }}>{sell}</button></span>;
}

function useEsc(onClose: () => void) { useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]); }
const today = () => new Date().toISOString().slice(0, 10);
type Draft = { id?: string; qty: string; price: string; date: string };
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

function PfSelect({ pfs, value, onChange, id }: { pfs: PfOpt[]; value: string; onChange: (v: string) => void; id: string }) {
  if (pfs.length < 2) return null;
  return <p className="ptk-dlg-pf"><label htmlFor={id}>Portfolio</label><select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{pfs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></p>;
}

export function EditDialog({ symbol, holdings, pfs, pf0, ops, onRemove, onClose, newRow, noun = "holding", name, priceWord = "price" }: {
  noun?: string; symbol: string; /** task #275: the name shown (the MF page's key is a holding id); the symbol by default */ name?: string; /** "price", or "NAV" for funds */ priceWord?: string; holdings: Holding[]; pfs: PfOpt[]; pf0: string; ops: Ops; onRemove: (pf: string) => void; onClose: () => void; newRow?: boolean;
}) {
  useEsc(onClose);
  const nm = name ?? symbol;
  const [pf, setPf] = useState(pf0), [err, setErr] = useState(""), [rm, setRm] = useState(false);
  const mine = (p: string) => holdings.filter((h) => h.symbol.toUpperCase() === symbol.toUpperCase() && h.owned && pfOf(h) === p);
  const start = (p: string): Draft[] => { const b = mine(p).filter((h) => h.side !== "sell" && h.qty > 0).map((h) => ({ id: h.id, qty: String(h.qty), price: h.price > 0 ? String(h.price) : "", date: h.date ?? "" }));
    return b.length && !newRow ? b : [...b, { qty: "", price: "", date: "" }]; };
  const [rows, setRows] = useState<Draft[]>(() => start(pf0));
  useEffect(() => { setRows(start(pf)); }, [pf]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sales = mine(pf).filter((h) => h.side === "sell" && h.qty > 0);
  const set = (i: number, k: keyof Draft, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = () => {
    const bad = rows.findIndex((r) => (r.qty && !(num(r.qty) > 0)) || (r.price && !(num(r.price) > 0)) || (r.price && !r.qty));
    if (bad >= 0) { setErr(`Buy ${bad + 1}: the quantity must be above 0, and a price needs a quantity.`); return; }
    const keep = new Set(rows.filter((r) => r.id).map((r) => r.id));
    for (const h of mine(pf).filter((h) => h.side !== "sell" && h.qty > 0)) if (!keep.has(h.id)) ops.remove(h.id);
    for (const r of rows) {
      const patch = { qty: num(r.qty), price: num(r.price), ...(r.date ? { date: r.date } : { date: undefined }) };
      if (r.id) { if (patch.qty > 0) ops.update(r.id, patch); else ops.remove(r.id); }
      else if (patch.qty > 0) ops.add({ symbol, ...patch, owned: true, pf });
    }
    onClose();
  };
  return (
    <div className="acc-dlg" role="dialog" aria-modal="true" aria-labelledby="ptk-ed-h" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acc-dlg-in ptk-dlg">
        <h2 id="ptk-ed-h">Edit {nm}</h2>
        <p className="acc-dlg-p">Your buys of this {noun}. Add one for each purchase, or one line with the total quantity and the average {priceWord}.</p>
        <PfSelect pfs={pfs} value={pf} onChange={setPf} id="ptk-ed-pf" />
        <div className="ptk-buys">
          {rows.map((r, i) => <div key={r.id ?? "n" + i} className="ptk-buy">
            <label className="ptk-fld"><span>Quantity<small>optional</small></span><input inputMode="decimal" placeholder="e.g. 50" aria-label={`Quantity in buy ${i + 1} of ${nm}`} value={r.qty} onChange={(e) => set(i, "qty", e.target.value)} autoFocus={i === rows.length - 1} /></label>
            <label className="ptk-fld"><span>Average buy {priceWord}<small>optional</small></span><span className="ptk-rs"><i aria-hidden="true">₹</i><input inputMode="decimal" aria-label={`Average buy ${priceWord} in buy ${i + 1} of ${nm}`} value={r.price} onChange={(e) => set(i, "price", e.target.value)} /></span></label>
            <label className="ptk-fld ptk-fd"><span>Bought on<small>optional</small></span><input type="date" max={today()} aria-label={`Date of buy ${i + 1} of ${nm}`} value={r.date} onChange={(e) => set(i, "date", e.target.value)} /></label>
            <button type="button" className="ptk-x" aria-label={`Remove buy ${i + 1} of ${nm}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>×</button>
          </div>)}
        </div>
        <button type="button" className="ptk-link" onClick={() => setRows((rs) => [...rs, { qty: "", price: "", date: "" }])}>+ Add a buy</button>
        {sales.length > 0 && <div className="ptk-sales"><p className="ptk-k">Sales</p><ul>{sales.map((s) => <li key={s.id}>{s.date ? dfmt(s.date) : "No date"} · {qf(s.qty)} at {s.price > 0 ? inr(s.price, 2) : "—"}
          <button type="button" className="ptk-x" aria-label={`Remove this sale of ${nm}`} onClick={() => ops.remove(s.id)}>×</button></li>)}</ul></div>}
        {err && <p className="ptk-err" role="alert">{err}</p>}
        {rm ? <div className="acc-confirm" role="alertdialog" aria-label={`Remove ${nm}`}><span>Remove {nm} and its buys and sales from {pfs.find((p) => p.id === pf)?.name ?? "this portfolio"}? Nothing changes at your broker.</span>
          <button type="button" className="go del" onClick={() => { onRemove(pf); onClose(); }} autoFocus>Remove</button><button type="button" onClick={() => setRm(false)}>Cancel</button></div>
          : <p className="ptk-rmrow"><button type="button" className="ptk-link ptk-danger" onClick={() => setRm(true)}>Remove from this portfolio</button></p>}
        <div className="acc-dlg-b"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="go" onClick={save}>Save</button></div>
      </div>
    </div>
  );
}

/** What a sale would use, first in, first out, before it is saved. Exported for tests. */
export function salePreview(hs: Holding[], symbol: string, pf: string, qty: number, price: number, date: string) {
  const before = ledgerOf(hs, symbol, pf);
  if (!(qty > 0)) return { held: before.qty ?? 0, fig: null };
  const tmp: Holding = { id: "__preview", symbol, qty, price, date: date || undefined, owned: true, pf, side: "sell" };
  const l = ledgerOf([...hs, tmp], symbol, pf);
  return { held: before.qty ?? 0, fig: l.sales.find((s) => s.row.id === "__preview") ?? null, buys: l.buys };
}

export function SellDialog({ symbol, holdings, pfs, pf0, ops, onClose, price, name, priceWord = "price", record = false }: { symbol: string; holdings: Holding[]; pfs: PfOpt[]; pf0: string; ops: Ops; onClose: () => void; price?: number | null;
  /** task #275: the name shown, and "NAV" for funds */ name?: string; priceWord?: string;
  /** task #389 (developer file 32, Your funds 1): "Record a sale of …", the NAV "at the sale" (no "Sell" wording; FinLit places no orders) */ record?: boolean }) {
  useEsc(onClose);
  const nm = name ?? symbol;
  const held = (p: string) => ledgerOf(holdings, symbol, p).qty ?? 0;
  const opts = pfs.filter((p) => held(p.id) > 0);
  const [pf, setPf] = useState(opts.some((p) => p.id === pf0) ? pf0 : opts[0]?.id ?? pf0), [qty, setQty] = useState(""), [px, setPx] = useState(price ? String(price) : ""), [err, setErr] = useState("");
  // a buy without a date counts after every dated row (lib/ledger), so while one is open the sale starts undated too, and is counted after it
  const undated = (p: string) => ledgerOf(holdings, symbol, p).buys.some((b) => b.left > 0 && !b.row.date);
  const [date, setDate] = useState(() => (undated(pf0) ? "" : today()));
  const pv = useMemo(() => salePreview(holdings, symbol, pf, num(qty), num(px), date), [holdings, symbol, pf, qty, px, date]);
  const buy = (id: string) => pv.buys?.find((b) => b.row.id === id)?.row;
  const save = () => {
    if (!(num(qty) > 0)) { setErr("Type how many were sold."); return; }
    if (pv.fig?.err != null) { setErr(`Only ${qf(pv.fig.err)} were held on that date.`); return; }
    if (px && !(num(px) > 0)) { setErr("The sell price must be above 0."); return; }
    ops.add({ symbol, qty: num(qty), price: num(px), date: date || undefined, owned: true, pf, side: "sell" });
    onClose();
  };
  return (
    <div className="acc-dlg" role="dialog" aria-modal="true" aria-labelledby="ptk-sl-h" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acc-dlg-in ptk-dlg">
        <h2 id="ptk-sl-h">{record ? `Record a sale of ${nm}` : `Sell ${nm}`}</h2>
        <p className="acc-dlg-p">Record a sale you made at your broker. It uses up the earliest buys first (first in, first out); what is left stays in the list. {qf(held(pf))} held{pfs.length > 1 ? ` in ${pfs.find((p) => p.id === pf)?.name}` : ""}.</p>
        <PfSelect pfs={opts} value={pf} onChange={setPf} id="ptk-sl-pf" />
        <div className="ptk-buy three">
          <label className="ptk-fld"><span>Quantity sold</span><input inputMode="decimal" placeholder={`up to ${qf(held(pf))}`} aria-label={`Quantity of ${nm} sold`} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></label>
          <label className="ptk-fld"><span>{record ? `${priceWord} at the sale` : `Sell ${priceWord}`}</span><span className="ptk-rs"><i aria-hidden="true">₹</i><input inputMode="decimal" aria-label={record ? `${priceWord} at the sale of ${nm}` : `Sell ${priceWord} of ${nm}`} value={px} onChange={(e) => setPx(e.target.value)} /></span></label>
          <label className="ptk-fld ptk-fd"><span>Sold on</span><input type="date" max={today()} aria-label={`Date of the sale of ${nm}`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        {undated(pf) && !date && <p className="ptk-note">A buy has no date, so the sale is counted after it. Add the dates in Edit to place the sale on its day.</p>}
        <div className="ptk-fifo" aria-live="polite">
          {!pv.fig ? <p>Type a quantity to see which buys it uses.</p>
            : pv.fig.err != null ? <p className="ptk-err">Only {qf(pv.fig.err)} were held on that date, so this sale cannot be counted.</p>
            : <><p className="ptk-k">This sale uses, first in, first out</p>
              <ul>{pv.fig.from.map((f) => { const b = buy(f.id); return <li key={f.id}>{qf(f.qty)} from the buy of {f.date ? dfmt(f.date) : "no date"}{b && b.price > 0 ? ` at ${inr(b.price, 2)}` : " (no buy price yet)"}</li>; })}</ul>
              <p>{pv.fig.gain != null ? <>Booked gain or loss: <b className={tone(pv.fig.gain)}>{sinr(pv.fig.gain)}</b> on a cost of {inr(pv.fig.cost)}.</> : "The booked gain shows once the sale and the buys it uses have prices."}</p></>}
        </div>
        {err && <p className="ptk-err" role="alert">{err}</p>}
        <div className="acc-dlg-b"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="go" onClick={save}>Save the sale</button></div>
      </div>
    </div>
  );
}
