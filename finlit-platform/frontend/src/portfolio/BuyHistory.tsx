// Task #217: the dropdown under each share of the Equity portfolio with its buy history (screenshot 2 of the task): one row per buy (# · Date · Qty · Price ·
// Total value, then what it is worth today and its gain or loss), a totals row (total qty and the average price), "Add a buy", and Edit / Remove on each buy.
// The sums are lib/buyHistory's. Describes; never advice.
import { useState } from "react";
import { MINUS } from "../lib/format";
import { buyFrom, pnlOf, totalsOf, type Buy } from "../lib/buyHistory";
import "./buy-history.css";

const inr = (v: number, d = 2) => v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
const signed = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${inr(Math.abs(v), d)}`;
const tone = (v: number | null) => (v == null || v === 0 ? undefined : v > 0 ? "bh-up" : "bh-down");

type Form = { date: string; qty: string; price: string };
const empty: Form = { date: "", qty: "", price: "" };

function BuyForm({ symbol, init, label, onSave, onCancel }: { symbol: string; init: Form; label: string; onSave: (b: Omit<Buy, "id">) => void; onCancel?: () => void }) {
  const [f, setF] = useState<Form>(init), [err, setErr] = useState("");
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="bh-form" onSubmit={(e) => { e.preventDefault(); try { onSave(buyFrom(symbol, f)); setF(empty); setErr(""); } catch (x) { setErr((x as Error).message); } }}>
      <label>Date<input type="date" value={f.date} max={new Date().toISOString().slice(0, 10)} onChange={set("date")} /></label>
      <label>Quantity<input inputMode="decimal" value={f.qty} onChange={set("qty")} placeholder="Shares" maxLength={14} required /></label>
      <label>Price<input inputMode="decimal" value={f.price} onChange={set("price")} placeholder="₹ each" maxLength={14} /></label>
      <button type="submit" className="bh-btn bh-go">{label}</button>
      {onCancel && <button type="button" className="bh-btn" onClick={onCancel}>Cancel</button>}
      {err && <p className="bh-err" role="alert">{err}</p>}
    </form>
  );
}

export function BuyHistory({ symbol, buys, price, onAdd, onEdit, onRemove }: {
  symbol: string; buys: Buy[]; price: number | null; onAdd: (b: Omit<Buy, "id">) => void; onEdit: (id: string, b: Omit<Buy, "id">) => void; onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const t = totalsOf(buys), all = pnlOf(t, price);
  return (
    <div className="bh" id={`bh-${symbol}`} role="region" aria-label={`Buy history of ${symbol}`}>
      {buys.length ? <div className="bh-scroll"><table className="bh-t">
        <thead><tr><th scope="col">#</th><th scope="col">Date</th><th scope="col" className="r">Qty</th><th scope="col" className="r">Price</th><th scope="col" className="r">Total value</th>
          <th scope="col" className="r">Value today</th><th scope="col" className="r">P&amp;L</th><th scope="col"><span className="sr-only">Change or remove</span></th></tr></thead>
        <tbody>{buys.map((b, i) => editing === b.id ? <tr key={b.id} className="bh-editrow"><td>{i + 1}</td><td colSpan={7}>
          <BuyForm symbol={symbol} label="Save" init={{ date: b.date ?? "", qty: String(b.qty), price: b.price ? String(b.price) : "" }} onSave={(x) => { onEdit(b.id, x); setEditing(null); }} onCancel={() => setEditing(null)} /></td></tr> : (() => {
          const v = b.price > 0 && price != null ? b.qty * price : null, pl = v != null ? v - b.qty * b.price : null;
          return <tr key={b.id}><td>{i + 1}</td><td>{b.date ? day(b.date) : <span className="bh-mute" title="No date was entered for this buy.">Date not given</span>}</td><td className="r">{inr(b.qty, b.qty % 1 ? 2 : 0)}</td>
            <td className="r">{b.price > 0 ? inr(b.price) : <span className="bh-mute" title="No price was entered for this buy, so it is left out of the average.">Not given</span>}</td>
            <td className="r">{b.price > 0 ? inr(b.qty * b.price) : MINUS}</td><td className="r">{v == null ? MINUS : inr(v)}</td>
            <td className={"r " + (tone(pl) ?? "")}>{pl == null ? MINUS : <>{signed(pl)}<small>{signed((pl / (b.qty * b.price)) * 100)}%</small></>}</td>
            <td className="bh-acts"><button type="button" className="bh-link" aria-label={`Change buy ${i + 1} of ${symbol}`} onClick={() => setEditing(b.id)}>Edit</button>
              <button type="button" className="bh-link" aria-label={`Remove buy ${i + 1} of ${symbol}`} onClick={() => onRemove(b.id)}>Remove</button></td></tr>; })())}</tbody>
        <tfoot><tr><th scope="row" colSpan={2}>Total qty {inr(t.qty, t.qty % 1 ? 2 : 0)} · Avg price</th><td className="r"><b>{inr(t.qty, t.qty % 1 ? 2 : 0)}</b></td>
          <td className="r"><b>{t.avg == null ? MINUS : inr(t.avg)}</b></td><td className="r"><b>{t.invested == null ? MINUS : inr(t.invested)}</b></td>
          <td className="r"><b>{all.value == null ? MINUS : inr(all.value)}</b></td><td className={"r " + (tone(all.pnl) ?? "")}><b>{all.pnl == null ? MINUS : signed(all.pnl)}</b>{all.pct != null && <small>{signed(all.pct)}%</small>}</td><td /></tr></tfoot>
      </table></div> : <p className="bh-none">No buys yet for {symbol}. Add each buy with its date, quantity and price to see the total quantity and the average price.</p>}
      <div className="bh-add"><p className="bh-cap">Add a buy</p><BuyForm symbol={symbol} init={empty} label="Add buy" onSave={onAdd} /></div>
      <p className="bh-note">Average price = total invested ÷ total quantity across all buys.{t.unpriced ? ` ${t.unpriced === 1 ? "One buy has" : `${t.unpriced} buys have`} no price, so ${t.unpriced === 1 ? "it is" : "they are"} counted in the quantity but left out of the average.` : ""}{price == null ? " No price today yet, so the value today is not shown." : ""} Information only, not investment advice.</p>
    </div>
  );
}
