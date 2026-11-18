// MF portfolio "Add units" (task #183, pack 02 §1 Header). Until units are added every fund counts the same; once added, every figure is weighted by value.
// One row per fund: the name, its NAV, a Units box and the value as you type, with a running total. The funds are saved together or not at all (a list with
// some funds valued and some not cannot be weighted): the message says how many boxes are still empty. A fund bought in several purchases keeps them; it is
// shown, not changed here. Escape, ✕ or a click outside closes the dialog; focus starts in the first box. Descriptive only.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { nf } from "../../lib/format";
import { useMfWrites, type Holding } from "../../lib/mfPortfolio";
import { fundName } from "../../lib/mfPack";
import "../../components/clearportfolio.css";

const numOf = (s: string) => { const v = Number(s.replace(/,/g, "").trim()); return s.trim() && Number.isFinite(v) && v > 0 ? v : null; };

/** Which rows can be saved, and why not: every box filled (or every box empty, which changes nothing). Exported for tests. */
export function unitsCheck(rows: { v: string; locked: boolean }[]): { ready: boolean; empty: number } {
  const open = rows.filter((r) => !r.locked), filled = open.filter((r) => numOf(r.v) != null).length;
  return { ready: filled > 0 && filled === open.length, empty: open.length - filled };
}

export function UnitsDialog({ hs, onClose, onDone }: { hs: Holding[]; onClose: () => void; onDone: (msg: string) => void }) {
  const w = useMfWrites(), id = useId(), first = useRef<HTMLInputElement>(null);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(hs.map((h) => [h.id, h.units != null && h.units > 0 ? String(h.units) : ""])));
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { first.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  const rows = useMemo(() => hs.map((h) => ({ h, v: v[h.id] ?? "", locked: (h.lines ?? h.lots).length > 1 })), [hs, v]);
  const total = rows.reduce((a, r) => a + (r.locked ? (r.h.current ?? 0) : (numOf(r.v) ?? 0) * (r.h.nav ?? 0)), 0);
  const chk = unitsCheck(rows);
  const save = async () => {
    if (!chk.ready) { setErr(chk.empty ? `Add units for every fund (${chk.empty} ${chk.empty === 1 ? "box is" : "boxes are"} empty), or leave them all empty: every fund then counts the same.` : "Add units for at least one fund."); return; }
    setBusy(true); setErr("");
    try {
      for (const r of rows) {
        if (r.locked) continue;
        const lot = r.h.lots[0];
        await w.update.mutateAsync({ id: r.h.id, folio: r.h.folio, lots: [{ units: String(numOf(r.v)), invested: lot?.invested != null ? String(lot.invested) : undefined, boughtOn: lot?.boughtOn ?? undefined, ...(r.h.lines?.[0] ? { pf: r.h.lines[0].pf } : {}) }] });
      }
      onDone("Units saved: every figure on this page is now weighted by value."); onClose();
    } catch (x) { setErr(x instanceof Error && x.message ? x.message : "The units could not be saved. Try again in a moment."); }
    finally { setBusy(false); }
  };
  return (
    <div className="cpf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cpf-dlg mfu-dlg" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>Add units</h2>
        <p>Until units are added, every fund counts the same. With units, the list, the mix and the risk figures follow your money.</p>
        <table className="mfu-t"><thead><tr><th scope="col">Fund</th><th scope="col" className="r">NAV</th><th scope="col" className="r">Units</th><th scope="col" className="r">Value</th></tr></thead>
          <tbody>{rows.map((r, i) => {
            const q = numOf(r.v);
            return <tr key={r.h.id}><th scope="row">{fundName(r.h.name) || `Scheme ${r.h.code}`}{r.locked && <small>{(r.h.lines ?? r.h.lots).length} buys and sales: kept as they are</small>}</th>
              <td className="r">{r.h.nav != null ? `₹${nf(r.h.nav, 2)}` : "–"}</td>
              <td className="r">{r.locked ? nf(r.h.units ?? 0, 3) : <input ref={i === 0 ? first : undefined} inputMode="decimal" aria-label={`Units of ${fundName(r.h.name) || r.h.code}`} value={r.v} onChange={(e) => setV((x) => ({ ...x, [r.h.id]: e.target.value }))} />}</td>
              <td className="r">{r.locked ? (r.h.current != null ? `₹${nf(r.h.current, 0)}` : "–") : q != null && r.h.nav != null ? `₹${nf(q * r.h.nav, 0)}` : "–"}</td></tr>;
          })}</tbody>
          <tfoot><tr><th scope="row" colSpan={3}>Total</th><td className="r">₹{nf(total, 0)}</td></tr></tfoot></table>
        {err && <p className="cpf-err" role="alert">{err}</p>}
        <div className="cpf-row"><button type="button" className="cpf-keep" onClick={onClose}>Cancel</button><button type="button" className="cpf-go mfu-go" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save units"}</button></div>
      </div>
    </div>
  );
}
