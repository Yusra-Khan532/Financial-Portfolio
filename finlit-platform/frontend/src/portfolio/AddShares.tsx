// Task #274 (the 20 Nov equity pack, change 1): the add box and the Add shares window.
//   The add box suggests while you type from EVERY listed company (the search index, NSE and BSE), with the ranking the site's Find uses (lib/companySearch.ts).
//   It replaces a native <datalist> of the 500 largest companies, which is why "Aarti" found nothing. Each suggestion: logo, name with the typed letters marked,
//   NSE symbol or BSE code, size, the latest close, "In your list" for a share already held, "close match" for a fuzzy hit. Opens after 2 characters; ↑ ↓,
//   Enter, Esc; no close-match work under 4 letters; a 90 ms pause before searching.
//   Add opens the window with the picked company, Add several opens it empty, Import ▾ opens it on Paste a list or Upload a broker file or CAS.
// The window uses the live dialog (acc-dlg). Classes: pfa- (scoped to this file). Describes; never advice.
import { useDialogFocus } from "../lib/useDialogFocus";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CoLogo } from "../components/CoLogo";
import { Icon } from "../lib/icons";
import { rankCompanies, type CompanyHit, type CompanyRow } from "../lib/companySearch";
import { DEFAULT_PF, type Holding } from "../lib/portfolio";
import "./add-shares.css";

export type CoInfo = { size: string | null; close: number | null };
const isBse = (s: string) => /^\d+$/.test(s);
export const codeLabel = (s: string) => (isBse(s) ? `BSE ${s}` : `NSE ${s}`);
const inr = (v: number) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The hits for a query: none under 2 characters; under 4 letters only clear matches (no close-match work), as the pack asks. */
export function suggest(index: readonly CompanyRow[], q: string, isin?: ReadonlyMap<string, string>, limit = 8): CompanyHit[] {
  const t = q.trim();
  if (t.length < 2) return [];
  const hits = rankCompanies(index, t, limit, [], isin);
  return t.replace(/\s+/g, "").length < 4 ? hits.filter((h) => h.rank >= 400) : hits;
}
/** The name with the typed words marked. */
function Marked({ name, q }: { name: string; q: string }) {
  const words = q.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (!words.length) return <>{name}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return <>{name.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

/** The combobox: an input with the suggestion list under it (rendered in a portal so a table or window never clips it). */
export function CompanyCombo({ index, isin, held, info, onPick, label, placeholder = "Add a share by name, symbol or ISIN", inputRef, value, onChange, autoFocus, onEnterEmpty }: {
  index: readonly CompanyRow[]; isin?: ReadonlyMap<string, string>; held: ReadonlySet<string>; info: (s: string) => CoInfo; onPick: (h: CompanyHit) => void;
  label: string; placeholder?: string; inputRef?: RefObject<HTMLInputElement | null>; value: string; onChange: (v: string) => void; autoFocus?: boolean;
  /** Enter with no suggestion highlighted (the add box's Add). */ onEnterEmpty?: () => void;
}) {
  const own = useRef<HTMLInputElement>(null), ref = inputRef ?? own, id = useId();
  const [q, setQ] = useState(""), [k, setK] = useState(0), [open, setOpen] = useState(false), [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => { const t = setTimeout(() => setQ(value), 90); return () => clearTimeout(t); }, [value]);   // a 90 ms pause before searching
  const hits = useMemo(() => suggest(index, q, isin), [index, q, isin]);
  const shown = open && value.trim().length >= 2 && q.trim().length >= 2;
  useLayoutEffect(() => {
    if (!shown) return;
    const place = () => { const r = ref.current?.getBoundingClientRect(); if (!r) return; const w = Math.min(Math.max(r.width + 40, 340), innerWidth - 24);
      setPos({ left: Math.max(12, Math.min(r.left - 8, innerWidth - w - 12)), top: r.bottom + 6, width: w }); };
    place(); addEventListener("resize", place); addEventListener("scroll", place, true);
    return () => { removeEventListener("resize", place); removeEventListener("scroll", place, true); };
  }, [shown, ref]);
  useEffect(() => setK(0), [q]);
  const pick = (h: CompanyHit) => { onPick(h); setOpen(false); };
  return <>
    <input ref={ref} className="pfa-q" value={value} autoFocus={autoFocus} autoComplete="off" maxLength={80} placeholder={placeholder} aria-label={label} role="combobox" aria-autocomplete="list"
      aria-expanded={shown} aria-controls={shown ? id : undefined} aria-activedescendant={shown && hits[k] ? `${id}-o${k}` : undefined}
      onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
      onKeyDown={(e) => {
        if (e.key === "Escape") { if (shown) { e.preventDefault(); e.stopPropagation(); setOpen(false); } return; }
        if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); setOpen(true); setK((x) => (x + 1) % hits.length); }
        else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); setK((x) => (x - 1 + hits.length) % hits.length); }
        else if (e.key === "Enter") { e.preventDefault(); const typedNow = suggest(index, value, isin); const h = shown && hits[k] ? hits[k] : typedNow[0]; if (h) pick(h); else onEnterEmpty?.(); }
      }} />
    {shown && pos && createPortal(<div className="pfa-sugg" id={id} role="listbox" aria-label="Companies" style={{ left: pos.left, top: pos.top, width: pos.width }}>
      {hits.length ? <>{hits.map((h, i) => { const inf = info(h.symbol);
        return <div key={h.symbol} id={`${id}-o${i}`} role="option" aria-selected={i === k} className="pfa-opt" onMouseDown={(e) => { e.preventDefault(); pick(h); }} onMouseEnter={() => setK(i)}>
          <CoLogo symbol={h.symbol} name={h.name} size={28} />
          <b><Marked name={h.name} q={q} />{held.has(h.symbol) && <span className="pfa-held">In your list</span>}</b>
          <small>{codeLabel(h.symbol)}{inf.size ? ` · ${inf.size}` : ""}{h.rank < 400 ? " · close match" : ""}</small>
          <span className="pfa-px">{inf.close != null ? inr(inf.close) : ""}{inf.close != null && <small>latest</small>}</span></div>; })}
        <div className="pfa-hint">↑ ↓ to move · Enter to add · Esc to close</div></>
        : <div className="pfa-empty">No listed company matches “{q.trim()}”. Check the spelling, or try the NSE symbol, BSE code or ISIN.</div>}
    </div>, document.body)}
  </>;
}

// ------------------------------------------------------------------------------------------------ the Add shares window
export type AddRow = { symbol: string | null; name: string; date: string; price: string; qty: string; pf: string };
export type AddTab = "search" | "paste" | "upload";
/** What the window saves (pure, tested): a row with a quantity is a buy (it fills the share's name-only line in that portfolio, as "+ Add a buy" does); a row
 *  without one follows the share by name, unless it is already in that portfolio. Nothing is saved for a row with no company. */
export function rowsToChanges(rows: AddRow[], holdings: Holding[], isinOf?: ReadonlyMap<string, string>) {
  const pfOf = (h: Holding) => h.pf ?? DEFAULT_PF;
  const adds: Omit<Holding, "id">[] = [], updates: { id: string; patch: Partial<Holding> }[] = [];
  const nameUsed = new Set<string>();
  let shares = 0, buys = 0;
  const seen = new Set(holdings.map((h) => `${h.symbol.toUpperCase()}|${pfOf(h)}`));
  for (const r of rows) {
    if (!r.symbol) continue;
    const sym = r.symbol.toUpperCase(), pf = r.pf || DEFAULT_PF, key = `${sym}|${pf}`, q = Number(r.qty), p = Number(r.price);
    const isin = isinOf?.get(sym) ?? holdings.find((h) => h.symbol.toUpperCase() === sym)?.isin;
    const base = { symbol: sym, ...(pf !== DEFAULT_PF ? { pf } : {}), ...(isin ? { isin } : {}) };
    const isNew = !seen.has(key);
    if (r.qty.trim() && Number.isFinite(q) && q > 0) {
      const buy = { ...base, qty: q, price: Number.isFinite(p) && p > 0 ? p : 0, date: r.date, owned: true as const };
      const name = holdings.find((h) => h.symbol.toUpperCase() === sym && pfOf(h) === pf && !h.owned && !nameUsed.has(h.id));
      if (name) { updates.push({ id: name.id, patch: buy }); nameUsed.add(name.id); } else adds.push(buy);
      buys++;
    } else if (isNew) adds.push({ ...base, qty: 1, price: 0 });
    if (isNew) { shares++; seen.add(key); }
  }
  return { adds, updates, shares, buys };
}
const today = () => new Date().toISOString().slice(0, 10);
const blank = (pf: string): AddRow => ({ symbol: null, name: "", date: today(), price: "", qty: "", pf });

export function AddSharesDialog({ tab: tab0, pre, index, isin, held, info, pfs, defaultPf, onClose, onSave, onUpload, uploadNote }: {
  tab: AddTab; pre: CompanyHit | null; index: readonly CompanyRow[]; isin?: ReadonlyMap<string, string>; held: ReadonlySet<string>; info: (s: string) => CoInfo;
  pfs: { id: string; name: string }[]; defaultPf: string; onClose: () => void; onSave: (rows: AddRow[]) => void; onUpload: () => void; uploadNote: ReactNode;
}) {
  const priceOf = (s: string) => { const c = info(s).close; return c != null ? c.toFixed(2) : ""; };
  const [tab, setTab] = useState<AddTab>(tab0);
  const [rows, setRows] = useState<AddRow[]>(() => [...(pre ? [{ ...blank(defaultPf), symbol: pre.symbol, name: pre.name, price: priceOf(pre.symbol) }] : []), blank(defaultPf)]);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [paste, setPaste] = useState(""), [found, setFound] = useState<{ line: string; hit: CompanyHit | null }[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useDialogFocus(box, onClose, { first: null, skipHandledEscape: true });   // task #292: once per opening; a price refresh no longer pulls the focus out to Add
  const set = (i: number, patch: Partial<AddRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const pickAt = (i: number, h: CompanyHit) => setRows((rs) => { const n = rs.map((r, j) => (j === i ? { ...r, symbol: h.symbol, name: h.name, price: priceOf(h.symbol) } : r)); return i === rs.length - 1 ? [...n, blank(defaultPf)] : n; });
  const n = rows.filter((r) => r.symbol).length;
  const findPaste = () => {
    const lines = paste.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    const out = lines.map((line) => ({ line, hit: rankCompanies(index, line, 1, [], isin)[0] ?? null }));
    setFound(out);
    const picked = out.filter((o) => o.hit).map((o) => ({ ...blank(defaultPf), symbol: o.hit!.symbol, name: o.hit!.name, price: priceOf(o.hit!.symbol) }));
    if (picked.length) setRows([...rows.filter((r) => r.symbol), ...picked, blank(defaultPf)]);
  };
  const max = today();
  return <div className="acc-dlg pfa-dlg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="acc-dlg-in pfa-wide" role="dialog" aria-modal="true" aria-labelledby="pfa-h" ref={box}>
      <div className="pfa-dh"><h2 id="pfa-h">Add shares</h2><button type="button" className="pfa-x" aria-label="Close" onClick={onClose}>×</button></div>
      <p className="acc-dlg-p">Pick each company, then the date, price and quantity if you want the figures to follow your money.</p>
      <div className="pfa-tabs" role="tablist" aria-label="How to add">{([["search", "Search and add"], ["paste", "Paste a list"], ["upload", "Upload a broker file or CAS"]] as [AddTab, string][]).map(([k, t]) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : undefined} onClick={() => setTab(k)}>{t}</button>))}</div>
      {tab === "search" && <>
        <div className="pfa-entw"><table className="pfa-ent">
          <thead><tr><th scope="col">Company</th><th scope="col">Date bought</th><th scope="col">Price (₹)</th><th scope="col">Quantity <small>optional</small></th><th scope="col">Portfolio</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>
            <td data-l="Company">{r.symbol ? <div className="pfa-picked"><CoLogo symbol={r.symbol} name={r.name} size={26} /><div><b>{r.name}</b>
              <small>{codeLabel(r.symbol)} · <button type="button" className="pfa-link" onClick={() => set(i, { symbol: null, name: "", price: "" })}>change</button></small>
              {held.has(r.symbol) && <small className="pfa-held2">Already in your list: this adds a buy</small>}</div></div>
              : <label className="pfa-cs"><Icon name="search" /><CompanyCombo index={index} isin={isin} held={held} info={info} label={`Company ${i + 1}`} placeholder="Name, symbol, BSE code or ISIN"
                  value={typed[i] ?? ""} onChange={(v) => setTyped((t) => ({ ...t, [i]: v }))} onPick={(h) => { setTyped((t) => ({ ...t, [i]: "" })); pickAt(i, h); }} autoFocus={i === rows.length - 1 && !rows.some((x) => x.symbol)} /></label>}</td>
            <td data-l="Date bought"><input className="pfa-in" type="date" max={max} value={r.date} aria-label={`Date bought, row ${i + 1}`} onChange={(e) => set(i, { date: e.target.value > max ? max : e.target.value })} /></td>
            <td data-l="Price (₹)"><input className="pfa-in" type="number" inputMode="decimal" min="0" step="any" placeholder="Price" value={r.price} aria-label={`Price paid, row ${i + 1}`} onChange={(e) => set(i, { price: e.target.value })} /></td>
            <td data-l="Quantity"><input className="pfa-in" type="number" inputMode="decimal" min="0" step="any" placeholder="Optional" value={r.qty} aria-label={`Quantity, row ${i + 1}`} onChange={(e) => set(i, { qty: e.target.value })} /></td>
            <td data-l="Portfolio"><select className="pfa-in" value={r.pf} aria-label={`Portfolio, row ${i + 1}`} onChange={(e) => set(i, { pf: e.target.value })}>{pfs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
            <td className="r"><button type="button" className="pfa-x" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => (rs.length === 1 ? [blank(defaultPf)] : rs.filter((_, j) => j !== i)))}>×</button></td>
          </tr>)}</tbody></table></div>
        <div className="pfa-row2"><button type="button" className="pfx-btn" onClick={() => setRows((rs) => [...rs, blank(defaultPf)])}>+ Add another share</button><span className="pfx-note">Suggestions come from every listed company, NSE and BSE.</span></div>
        <div className="acc-dlg-b pfa-df"><span className="pfx-note">Price fills in with the latest close; change it to what you paid. Leave the quantity blank to follow a share by name only.</span>
          <span className="pfa-btns"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="go" disabled={!n} onClick={() => onSave(rows)}>{n ? `Save ${plural(n, "share")} to portfolio` : "Save to portfolio"}</button></span></div>
      </>}
      {tab === "paste" && <>
        <label className="pfa-lab" htmlFor="pfa-paste">Paste names, symbols or ISINs, one a line or separated by commas</label>
        <textarea id="pfa-paste" className="pfa-in pfa-ta" rows={7} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"aarti pharma\nrelaince\n526433, TCS"} />
        {found && <div className="pfa-pout" role="status">{found.map((o, i) => <p key={i} className="pfx-note">“{o.line}” → {o.hit ? <><b>{o.hit.name}</b> {codeLabel(o.hit.symbol)}{o.hit.rank < 400 ? " · close match, please check" : ""}</> : <span className="pfa-no">no match</span>}</p>)}
          {found.some((o) => o.hit) && <button type="button" className="pfx-btn" onClick={() => setTab("search")}>Review {plural(found.filter((o) => o.hit).length, "share")} in the table</button>}</div>}
        <div className="acc-dlg-b pfa-df"><span className="pfx-note">Each line is matched with the same search as the box; a close match is shown for you to confirm.</span>
          <span className="pfa-btns"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="go" disabled={!paste.trim()} onClick={findPaste}>Find the shares</button></span></div>
      </>}
      {tab === "upload" && <>
        <div className="pfa-drop"><b>Upload your broker's holdings file, or a CAS</b><button type="button" className="pfx-btn" onClick={onUpload}>Choose a file</button>{uploadNote}</div>
        <div className="acc-dlg-b pfa-df"><span className="pfx-note">The file is read on your device; only the ISINs are sent, to be looked up.</span><span className="pfa-btns"><button type="button" onClick={onClose}>Close</button></span></div>
      </>}
    </div>
  </div>;
}
