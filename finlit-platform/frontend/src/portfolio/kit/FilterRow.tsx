// Task #276 (shared portfolio parts, §18 "Filters in one row"): Find · one button per filter with a multi-choice menu (each choice shows how many it would
// leave) · Columns. A set button turns dark and names the pick; "Showing n of N", one chip per choice with ×, and Clear filters. Esc closes a menu; on a
// phone the menu is a bottom sheet. Inside the long table the row sticks under the header in place of the view bar (`stuck`), with `lead` (the picker, the
// views and Sections ▾) first, the Columns folded into a select and Find folded to a magnifier.
import { useEffect, useRef, useState, type ReactNode } from "react";
import "../holdings-kit.css";
import "./kit.css";

export type Facet<R> = { key: string; label: string; get: (r: R) => string | null | undefined; order?: string[] };
export type Picks = Record<string, string[]>;

/** The rows left by the search and the picks: any choice within a filter, every filter together. */
export function applyFilters<R>(rows: R[], facets: Facet<R>[], picks: Picks, q: string, text: (r: R) => string): R[] {
  const s = q.trim().toLowerCase();
  return rows.filter((r) => (!s || text(r).toLowerCase().includes(s)) && facets.every((f) => !(picks[f.key]?.length) || picks[f.key].includes(f.get(r) ?? "")));
}
/** Each choice of a filter, and how many rows it would leave with the search and the other filters as they are. */
export function choicesOf<R>(rows: R[], facets: Facet<R>[], picks: Picks, q: string, text: (r: R) => string, key: string) {
  const f = facets.find((x) => x.key === key)!, others = { ...picks, [key]: [] };
  const base = applyFilters(rows, facets, others, q, text), vals = [...new Set(rows.map((r) => f.get(r)).filter((v): v is string => !!v))];
  const ord = (v: string) => { const i = f.order?.indexOf(v) ?? -1; return i < 0 ? 999 : i; };
  return vals.sort((a, b) => ord(a) - ord(b) || a.localeCompare(b)).map((v) => ({ v, n: base.filter((r) => f.get(r) === v).length }));
}

const MAG = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;

export function FilterRow<R>({ rows, facets, picks, setPicks, q, setQ, text, find, noun, cols, col, setCol, stuck, lead, shown }: {
  rows: R[]; facets: Facet<R>[]; picks: Picks; setPicks: (p: Picks) => void; q: string; setQ: (q: string) => void; text: (r: R) => string;
  find: string; noun: [string, string]; cols: [string, string][]; col: string; setCol: (c: string) => void; stuck?: boolean; lead?: ReactNode; shown: number;
}) {
  const [open, setOpen] = useState<string | null>(null), [findOpen, setFindOpen] = useState(false), wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { const k = open; setOpen(null); wrap.current?.querySelector<HTMLButtonElement>(`[data-facet="${k}"]`)?.focus(); } };
    const click = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".ptk-fw")) setOpen(null); };
    addEventListener("keydown", key); document.addEventListener("mousedown", click);
    return () => { removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, [open]);
  const flip = (k: string, v: string) => { const cur = picks[k] ?? []; setPicks({ ...picks, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }); };
  const chips = facets.flatMap((f) => (picks[f.key] ?? []).map((v) => ({ k: f.key, label: f.label, v })));
  const any = chips.length > 0 || q.trim() !== "";
  const nw = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`;
  const findBox = <input className="pfx-search ptk-find" type="search" placeholder={find} aria-label={`${find} in your list`} value={q} onChange={(e) => setQ(e.target.value)} />;
  return (
    <div ref={wrap} className={"ptk-frow sw-host" + (stuck ? " stuck" : "")}>
      <div className="ptk-ftools" role="group" aria-label="Find, filter and columns">
        {stuck && lead && <span className="x-sw ptk-lead">{lead}</span>}
        {stuck && <label className="ptk-tsel"><span className="sr-only">Columns</span><select aria-label="Columns" value={col} onChange={(e) => setCol(e.target.value)}>{cols.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
        {stuck && !findOpen && !q ? <button type="button" className="ptk-mag" aria-label={find} onClick={() => setFindOpen(true)}>{MAG}</button> : <span className="ptk-findw"><i aria-hidden="true">{MAG}</i>{findBox}</span>}
        <span className="ptk-fsep" aria-hidden="true" />
        <div className="ptk-filt" role="group" aria-label="Filter">{facets.map((f) => {
          const sel = picks[f.key] ?? [], on = open === f.key, ch = on ? choicesOf(rows, facets, picks, q, text, f.key) : [];
          return <span key={f.key} className="ptk-fw">
            <button type="button" className={"ptk-fb" + (sel.length ? " set" : "")} data-facet={f.key} aria-haspopup="true" aria-expanded={on} aria-label={`${f.label}: ${sel.length ? sel.join(", ") : "All"}`} onClick={() => setOpen(on ? null : f.key)}>
              <span>{f.label}</span><span className="ptk-fv">: {sel.length ? sel[0] + (sel.length > 1 ? ` +${sel.length - 1}` : "") : "All"}</span><i aria-hidden="true">▾</i></button>
            {on && <><span className="ptk-scrim" aria-hidden="true" onClick={() => setOpen(null)} />
              <div className="ptk-fm" role="group" aria-label={`${f.label}: choose one or more`}>
                <p className="ptk-fm-k">{f.label}</p>
                {ch.map((c) => <button key={c.v} type="button" role="menuitemcheckbox" aria-checked={sel.includes(c.v)} onClick={() => flip(f.key, c.v)}>
                  <i className="ptk-box" aria-hidden="true">{sel.includes(c.v) ? "✓" : ""}</i><span><b>{c.v}</b><small>{nw(c.n)}</small></span></button>)}
                <div className="ptk-fm-b">{sel.length > 0 && <button type="button" className="ptk-link" onClick={() => setPicks({ ...picks, [f.key]: [] })}>Clear</button>}<button type="button" className="ptk-fm-done" onClick={() => setOpen(null)}>Done</button></div>
              </div></>}
          </span>; })}</div>
        {!stuck && <div className="x-cols ptk-cols" role="group" aria-label="Columns"><span>Columns:</span>{cols.map(([k, l]) => <button key={k} type="button" aria-pressed={col === k} onClick={() => setCol(k)}>{l}</button>)}</div>}
        <span className="ptk-count" aria-live="polite">{any ? `Showing ${shown} of ${nw(rows.length)}` : nw(rows.length)}</span>
      </div>
      {any && <div className="ptk-chips" aria-label="Filters set">
        {q.trim() && <button type="button" className="ptk-chip" aria-label={`Remove the search “${q}”`} onClick={() => setQ("")}>“{q.trim()}” <i aria-hidden="true">×</i></button>}
        {chips.map((c) => <button key={c.k + c.v} type="button" className="ptk-chip" aria-label={`Remove ${c.label}: ${c.v}`} onClick={() => flip(c.k, c.v)}>{c.v} <i aria-hidden="true">×</i></button>)}
        <button type="button" className="ptk-link ptk-clear" onClick={() => { setPicks({}); setQ(""); }}>Clear filters</button></div>}
    </div>
  );
}
