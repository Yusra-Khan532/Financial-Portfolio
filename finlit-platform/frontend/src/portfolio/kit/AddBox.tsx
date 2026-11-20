// Task #276 (shared portfolio parts, change 1 "Add box"): the title row's add box. Suggestions while you type (arrow keys, Enter, Esc), each with what it
// matched; Add takes the highlighted one; Add several opens a dialog with one row per holding (name, symbol or ISIN, and if wanted the quantity and average
// buy price), or a list pasted from a spreadsheet. The page supplies the search and what adding does.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "../holdings-kit.css";
import "./kit.css";

export type Sugg = { id: string; title: string; sub: string; line?: string; why?: string };
export type Results = { items: Sugg[]; loading: boolean; error: boolean; total?: number | null };
export type SeveralRow = { text: string; qty: string; price: string };
export type Resolved = { row: SeveralRow; hit: Sugg | null };

const MAG = <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;

export function AddBox({ placeholder, useResults, onAdd, full, fullWhy, resolve, onSeveral, menus, noun }: {
  placeholder: string; useResults: (q: string) => Results; onAdd: (s: Sugg) => Promise<void> | void; full?: boolean; fullWhy?: string;
  resolve: (text: string) => Promise<Sugg | null>; onSeveral: (rows: Resolved[]) => Promise<void> | void; menus?: ReactNode; noun: [string, string];
}) {
  const [q, setQ] = useState(""), [hi, setHi] = useState(0), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [sev, setSev] = useState(false);
  const r = useResults(q.trim().length >= 2 ? q.trim() : ""), lid = "ptk-sug-" + useId().replace(/[^\w-]/g, "");
  const items = q.trim().length >= 2 ? r.items : [];
  useEffect(() => { setHi(0); }, [q]);
  const add = async (s: Sugg | undefined) => {
    setMsg("");
    if (!s) { setMsg(q.trim().length < 2 ? `Type at least two letters of a name, symbol or ISIN.` : `No ${noun[0]} matches “${q.trim()}”.`); return; }
    if (full) { setMsg(fullWhy ?? "Your plan's list is full."); return; }
    setBusy(true); try { await onAdd(s); setQ(""); setOpen(false); } catch (e) { setMsg(e instanceof Error ? e.message : "It could not be added. Please try again."); } finally { setBusy(false); }
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(items.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Escape") { setOpen(false); }
  };
  const show = open && q.trim().length >= 2;
  return (
    <section className="ptk-addc" aria-label={`Add ${noun[1]}`}>
      <form className="ptk-add" onSubmit={(e) => { e.preventDefault(); add(items[hi]); }}>
        <label className="ptk-input"><span className="sr-only">{placeholder}</span>{MAG}
          <input type="text" autoComplete="off" placeholder={placeholder} role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={lid}
            aria-activedescendant={show && items[hi] ? `${lid}-${hi}` : undefined} value={q} maxLength={60}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setMsg(""); }} onKeyDown={key} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} /></label>
        <button className="ptk-solid" type="submit" disabled={busy} title={full ? fullWhy : undefined}>{busy ? "Adding…" : "Add"}</button>
        <button className="ptk-btn" type="button" onClick={() => setSev(true)}>Add several</button>
        {menus}
        {show && <ul className="ptk-sug" id={lid} role="listbox" aria-label={`${noun[1]} found`} aria-busy={r.loading}>
          {r.error && <li className="none" role="presentation">The search is not available right now. Please try again in a minute.</li>}
          {!r.error && !r.loading && !items.length && <li className="none" role="presentation">No {noun[0]} matches “{q.trim()}”. Try its NSE symbol, ISIN, fund house or the index it follows.</li>}
          {items.map((s, i) => <li key={s.id} id={`${lid}-${i}`} role="option" aria-selected={i === hi} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => add(s)}>
            <b>{s.title}</b><small>{s.sub}</small>{s.line && <small>{s.line}</small>}{s.why && <em>{s.why}</em>}</li>)}
          {r.total != null && items.length > 0 && <li className="none foot" role="presentation">{items.length} of {r.total} {r.total === 1 ? noun[0] : noun[1]} shown · keep typing to narrow</li>}
        </ul>}
      </form>
      {msg && <p className="ptk-err" role="alert">{msg}</p>}
      {sev && <Several noun={noun} resolve={resolve} onClose={() => setSev(false)} onDone={async (x) => { await onSeveral(x); setSev(false); }} />}
    </section>
  );
}

function Several({ noun, resolve, onClose, onDone }: { noun: [string, string]; resolve: (t: string) => Promise<Sugg | null>; onClose: () => void; onDone: (rows: Resolved[]) => Promise<void> }) {
  const blank = (): SeveralRow => ({ text: "", qty: "", price: "" });
  const [rows, setRows] = useState<SeveralRow[]>(() => Array.from({ length: 5 }, blank)), [res, setRes] = useState<(Sugg | null | undefined)[]>([]), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const set = (i: number, k: keyof SeveralRow, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; addEventListener("keydown", key); return () => removeEventListener("keydown", key); }, [onClose]);
  const paste = (i: number, e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData("text"); if (!/[\t\n]/.test(t)) return;
    e.preventDefault();
    const lines = t.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim())).filter((l) => l[0]);
    setRows((rs) => { const out = [...rs]; lines.forEach((l, j) => { out[i + j] = { text: l[0] ?? "", qty: (l[1] ?? "").replace(/,/g, ""), price: (l[2] ?? "").replace(/[₹,]/g, "") }; }); return out.map((r) => r ?? blank()); });
  };
  const go = async () => {
    setErr(""); const want = rows.map((r, i) => [r, i] as const).filter(([r]) => r.text.trim());
    if (!want.length) { setErr(`Type at least one ${noun[0]}.`); return; }
    const bad = want.find(([r]) => (r.qty && !(Number(r.qty) > 0)) || (r.price && !(Number(r.price) > 0)));
    if (bad) { setErr(`Row ${bad[1] + 1}: the quantity and price must be numbers above 0.`); return; }
    setBusy(true);
    try {
      const hits = await Promise.all(want.map(([r]) => resolve(r.text.trim()).catch(() => null)));
      const next: (Sugg | null | undefined)[] = []; want.forEach(([, i], j) => { next[i] = hits[j]; }); setRes(next);
      const miss = want.filter((_, j) => !hits[j]);
      if (miss.length) { setErr(`${miss.length === 1 ? "One row was" : `${miss.length} rows were`} not found: ${miss.map(([r]) => `“${r.text.trim()}”`).join(", ")}. Fix ${miss.length === 1 ? "it" : "them"} or clear the row, then try again.`); return; }
      await onDone(want.map(([r], j) => ({ row: r, hit: hits[j] })));
    } catch (e) { setErr(e instanceof Error ? e.message : "They could not be added. Please try again."); } finally { setBusy(false); }
  };
  return (
    <div className="acc-dlg" role="dialog" aria-modal="true" aria-labelledby="ptk-sev-h" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acc-dlg-in ptk-dlg ptk-sev">
        <h2 id="ptk-sev-h">Add several {noun[1]}</h2>
        <p className="acc-dlg-p">One row for each {noun[0]}: a name, symbol or ISIN, and if you like the quantity and average buy price. Or paste a list from a spreadsheet.</p>
        <div className="ptk-sev-g" role="group" aria-label={`${noun[1]} to add`}>
          <span className="ptk-k">{noun[0].toUpperCase()} symbol, name or ISIN</span><span className="ptk-k">Quantity</span><span className="ptk-k">Avg buy price</span>
          {rows.map((r, i) => <div key={i} className="ptk-sev-r">
            <input aria-label={`Row ${i + 1}: symbol, name or ISIN`} placeholder={i === 0 ? "e.g. NIFTYBEES" : ""} value={r.text} onChange={(e) => set(i, "text", e.target.value)} onPaste={(e) => paste(i, e)} />
            <input aria-label={`Row ${i + 1}: quantity`} inputMode="decimal" value={r.qty} onChange={(e) => set(i, "qty", e.target.value)} />
            <input aria-label={`Row ${i + 1}: average buy price`} inputMode="decimal" value={r.price} onChange={(e) => set(i, "price", e.target.value)} />
            {res[i] !== undefined && r.text.trim() && <small className={res[i] ? "ok" : "bad"}>{res[i] ? `Found: ${res[i]!.title} · ${res[i]!.sub}` : "Not found"}</small>}
          </div>)}
        </div>
        <button type="button" className="ptk-link" onClick={() => setRows((rs) => [...rs, ...Array.from({ length: 5 }, blank)])}>+ More rows</button>
        {err && <p className="ptk-err" role="alert">{err}</p>}
        <div className="acc-dlg-b"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="go" disabled={busy} onClick={go}>{busy ? "Adding…" : `Add ${noun[1]}`}</button></div>
      </div>
    </div>
  );
}

/** A small menu button for the title row (Import ▾, ⋯). */
export function MenuButton({ label, aria, children, className = "ptk-btn", keep }: { label: ReactNode; aria: string; children: (close: () => void) => ReactNode; className?: string;
  /** keep the items mounted while shut (an item that opens its own dialog, such as Clear portfolio, keeps it open) */ keep?: boolean }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }, click = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener("keydown", key); document.addEventListener("mousedown", click); return () => { removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, [open]);
  return <span className="ptk-mw" ref={box}><button type="button" className={className} aria-haspopup="menu" aria-expanded={open} aria-label={aria} onClick={() => setOpen(!open)}>{label}</button>
    {(open || keep) && <div className={"ptk-menu" + (open ? "" : " shut")} role="menu" aria-hidden={!open || undefined}>{children(() => setOpen(false))}</div>}</span>;
}
