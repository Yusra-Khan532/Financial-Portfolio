// Task #274 (the 20 Nov equity pack, change 18): the filters of Your shares in one row, in place of the Strong / Healthy / Average / Weak pills.
//   Prism · Size · Trend · Vs peers · Buys, each a menu of check boxes (several can be ticked) with how many shares each choice
//   would leave given the other filters. A set button turns dark and names its pick ("Prism: Weak", "Prism: 2 picked"). Under the row: "Showing 3 of 15",
//   one chip per choice with ×, the search text as a chip, and Clear filters. Esc closes a menu and returns to its button; on a phone it opens as a sheet.
// Pure filtering and counting (applyFilters, countFor) so the counts are tested without the page. Classes: pff-. Describes; never advice.
import { useEffect, useRef, useState } from "react";
import "./add-shares.css";

export type FilterKey = "prism" | "size" | "trend" | "peers" | "buys";
export type Picks = Partial<Record<FilterKey, string[]>>;
export type FilterDef = { key: FilterKey; label: string; choices: { v: string; note?: string; dot?: string }[] };
/** The five buttons. `scoreName` is "Prism" (the only company score since task #283); `bands` are its words. */
export function filterDefs(scoreName: string, bands: string[]): FilterDef[] {
  const BAND_NOTE: Record<string, string> = { Strong: "80–100", Healthy: "65–79", Average: "50–64", Weak: "below 50" };
  const BAND_DOT: Record<string, string> = { Strong: "#1f6b45", Healthy: "#3a7f5a", Average: "#8a5a0b", Weak: "#b4572f", Mixed: "#8a5a0b", Watch: "#b4572f" };
  return [
    { key: "prism", label: scoreName, choices: [...bands.map((b) => ({ v: b, note: scoreName === "Prism" ? BAND_NOTE[b] : undefined, dot: BAND_DOT[b] })), { v: "Not scored" }] },
    { key: "size", label: "Size", choices: [{ v: "Large", note: "above ₹75,000 Cr" }, { v: "Mid", note: "₹25,000–75,000 Cr" }, { v: "Small", note: "₹10,000–25,000 Cr" }, { v: "Micro", note: "below ₹10,000 Cr" }, { v: "Not known" }] },
    { key: "trend", label: "Trend", choices: [{ v: "Rising", note: "long term +20 or more" }, { v: "Flat", note: "long term −19 to +19" }, { v: "Falling", note: "long term −20 or less" }, { v: "Not rated" }] },
    { key: "peers", label: "Vs peers", choices: [{ v: "Leader" }, { v: "In line" }, { v: "Laggard" }, { v: "Not compared" }] },
    { key: "buys", label: "Buys", choices: [{ v: "With buys" }, { v: "No buys yet" }] },
  ];
}
/** The trend word of a long-term score: the table's own ±20 cut-offs. */
export const trendWord = (lt: number | null | undefined) => (lt == null ? "Not rated" : Math.round(lt) >= 20 ? "Rising" : Math.round(lt) <= -20 ? "Falling" : "Flat");
/** The word under a trend score in the table (task #274 change 13), on the same ±20 lines: Rising strongly +50 or more, Rising +20 to +49, Flat −19 to +19,
 *  Falling −20 to −49, Falling sharply −50 or less. */
export const trendScoreWord = (v: number) => { const r = Math.round(v); return r >= 50 ? "Rising strongly" : r >= 20 ? "Rising" : r > -20 ? "Flat" : r > -50 ? "Falling" : "Falling sharply"; };
export type Getters = Record<FilterKey, (symbol: string) => string>;
/** The symbols every set filter keeps: AND across buttons, OR inside one button. */
export function applyFilters(symbols: string[], picks: Picks, get: Getters, skip?: FilterKey): string[] {
  return symbols.filter((s) => (Object.keys(picks) as FilterKey[]).every((k) => k === skip || !picks[k]?.length || picks[k]!.includes(get[k](s))));
}
/** How many shares a choice would leave, given the other filters. */
export const countFor = (symbols: string[], picks: Picks, get: Getters, key: FilterKey, v: string) => applyFilters(symbols, picks, get, key).filter((s) => get[key](s) === v).length;

export function FilterRow({ defs, symbols, picks, get, onChange }: { defs: FilterDef[]; symbols: string[]; picks: Picks; get: Getters; onChange: (p: Picks) => void }) {
  const [open, setOpen] = useState<FilterKey | null>(null);
  const btns = useRef<Partial<Record<FilterKey, HTMLButtonElement | null>>>({}), menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btns.current[open]?.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); const k = open; setOpen(null); btns.current[k]?.focus(); } };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    setTimeout(() => menu.current?.querySelector<HTMLInputElement>("input")?.focus(), 0);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const toggle = (k: FilterKey, v: string) => { const cur = picks[k] ?? [], next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]; onChange({ ...picks, [k]: next }); };
  return <div className="pff-row" role="group" aria-label="Filters">{defs.map((d) => {
    const set = picks[d.key] ?? [], name = set.length === 0 ? d.label : set.length === 1 ? `${d.label}: ${set[0]}` : `${d.label}: ${set.length} picked`;
    return <span key={d.key} className="pff-w">
      <button ref={(el) => { btns.current[d.key] = el; }} type="button" className={"pff-b" + (set.length ? " on" : "")} aria-haspopup="true" aria-expanded={open === d.key} onClick={() => setOpen(open === d.key ? null : d.key)}>{name} <i aria-hidden="true">▾</i></button>
      {open === d.key && <div ref={menu} className="pff-menu" role="group" aria-label={d.label}>
        {d.choices.map((c) => { const n = countFor(symbols, picks, get, d.key, c.v), on = set.includes(c.v);
          return <label key={c.v} className={"pff-opt" + (n === 0 && !on ? " zero" : "")}><input type="checkbox" checked={on} onChange={() => toggle(d.key, c.v)} />
            {c.dot && <i className="pff-dot" style={{ background: c.dot }} aria-hidden="true" />}<span><b>{c.v}</b>{c.note && <small>{c.note}</small>}</span><em>{n}</em></label>; })}
        <button type="button" className="pff-done" onClick={() => { setOpen(null); btns.current[d.key]?.focus(); }}>Done</button>
      </div>}
    </span>; })}</div>;
}

/** "Showing 3 of 15", a chip per choice (and the search text, and a theme), and Clear filters. */
export function FilterChips({ defs, picks, q, shown, total, onChange, onClearQ, extra }: { defs: FilterDef[]; picks: Picks; q: string; shown: number; total: number; onChange: (p: Picks) => void; onClearQ: () => void;
  extra?: { label: string; onClear: () => void } | null }) {
  const chips = defs.flatMap((d) => (picks[d.key] ?? []).map((v) => ({ k: d.key, v, label: `${d.label}: ${v}` })));
  if (!chips.length && !q.trim() && !extra) return null;
  return <div className="pff-chips" role="group" aria-label="Filters on"><span className="pff-sh" aria-live="polite">Showing {shown} of {total}</span>
    {q.trim() && <button type="button" className="pff-chip" aria-label={`Remove search “${q.trim()}”`} onClick={onClearQ}>“{q.trim()}” ×</button>}
    {extra && <button type="button" className="pff-chip" aria-label={`Remove ${extra.label}`} onClick={extra.onClear}>{extra.label} ×</button>}
    {chips.map((c) => <button key={c.k + c.v} type="button" className="pff-chip" aria-label={`Remove ${c.label}`} onClick={() => onChange({ ...picks, [c.k]: (picks[c.k] ?? []).filter((x) => x !== c.v) })}>{c.label} ×</button>)}
    <button type="button" className="pff-clear" onClick={() => { onChange({}); onClearQ(); extra?.onClear(); }}>Clear filters</button></div>;
}
