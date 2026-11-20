// Task #277 (All my investments pack of 20 Nov 2026, change 18; the Equity file §18 for the filter row, §11 for the row that stays up inside the table):
// Step 4's four "Show" buttons become one row: Find a company · Held ▾ · Size ▾ · FinLit Prism (FinLit IQ on Silver) ▾ · Against peers ▾, across every
// company on the list. Several choices can be ticked; each says how many companies it would leave given the other filters; a set button turns dark and names
// the pick ("Held: More than one way", "Size: 2 picked"); under the row "Showing n of N", one chip per choice with ×, and Clear filters. Esc closes a menu
// and returns focus to its button; on a phone a menu opens as a bottom sheet. While the table is scrolled, the row stays up under the site header with the
// portfolio and views (`lead`) and Sections ▾ (the open view's sections, "You are here", All sections). Styles: styles/mi7.css (mi7-f*).
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Company } from "../lib/myInvest";

export type EveryFilter = { q: string; held: string[]; size: string[]; prism: string[]; peer: string[] };
export const NO_FILTER: EveryFilter = { q: "", held: [], size: [], prism: [], peer: [] };
type FacetKey = "held" | "size" | "prism" | "peer";
export const HELD = ["More than one way", "Only direct", "Only through funds and ETFs"] as const;
const PRISM_WORDS = ["Strong", "Healthy", "Average", "Weak", "Poor"], IQ_WORDS = ["Strong", "Healthy", "Mixed", "Watch"];
export const NO_READING = "No reading";

/** What a company is under each filter. The three Held choices never overlap, so they add up to every company (QA of 21 Nov, item 4): "Only through funds
 *  and ETFs" is one fund or one ETF; a company held through a fund and an ETF is "More than one way". */
export function valuesOf(c: Company, k: FacetKey): string[] {
  if (k === "held") return ([c.held.length > 1 ? HELD[0] : null, c.held.length === 1 && c.held[0] === "D" ? HELD[1] : null, c.held.length === 1 && c.held[0] !== "D" ? HELD[2] : null] as (string | null)[]).filter((x): x is string => !!x);
  if (k === "size") return [c.abroad || !c.size ? "Not sized" : c.size];
  if (k === "prism") return [c.abroad || !c.label ? NO_READING : c.label];
  return [c.peer];
}
const FACETS: FacetKey[] = ["held", "size", "prism", "peer"];
const matchesQ = (c: Company, q: string) => { const s = q.trim().toLowerCase(); return !s || (c.symbol ?? "").toLowerCase().includes(s) || c.name.toLowerCase().includes(s); };
/** The companies left by the filters (OR inside a filter, AND across them); `skip` leaves one filter out, for that filter's own counts. */
export function filterCompanies(rows: Company[], f: EveryFilter, skip?: FacetKey): Company[] {
  return rows.filter((c) => matchesQ(c, f.q) && FACETS.every((k) => k === skip || !f[k].length || valuesOf(c, k).some((v) => f[k].includes(v))));
}
export function choicesOf(k: FacetKey, plan: "gold" | "silver", rows: Company[]): string[] {
  if (k === "held") return [...HELD];
  if (k === "size") return ["Large", "Mid", "Small", "Micro", "Not sized"];
  if (k === "prism") { const base = plan === "gold" ? PRISM_WORDS : IQ_WORDS; const extra = [...new Set(rows.map((c) => c.label).filter((x): x is string => !!x && !base.includes(x)))]; return [...base, ...extra, NO_READING]; }
  return ["Leader", "In line", "Laggard", "Not compared", "Not on your list"];
}
export const countFilters = (f: EveryFilter) => FACETS.reduce((a, k) => a + f[k].length, 0) + (f.q.trim() ? 1 : 0);

function Facet({ k, title, rows, f, set, plan }: { k: FacetKey; title: string; rows: Company[]; f: EveryFilter; set: (f: EveryFilter) => void; plan: "gold" | "silver" }) {
  const [open, setOpen] = useState(false), btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", out);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", out); };
  }, [open]);
  const picked = f[k], base = filterCompanies(rows, f, k);
  const label = picked.length === 0 ? <><span>{title}</span><span className="mi7-fv0">: All</span></> : <><span>{title}</span>: {picked.length === 1 ? picked[0] : `${picked.length} picked`}</>;
  const flip = (v: string) => set({ ...f, [k]: picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v] });
  return (
    <span className="mi7-fw">
      <button ref={btn} type="button" className={"mi7-fb" + (picked.length ? " on" : "")} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}
        aria-label={`${title}: ${picked.length === 0 ? "All" : picked.length === 1 ? picked[0] : `${picked.length} picked`}`}>{label} <i aria-hidden="true">▾</i></button>
      {open && <><span className="mi7-fback" aria-hidden="true" />
        <div ref={box} className="mi7-fm" role="group" aria-label={title}>
          <p className="mi7-fmh">{title}</p>
          {choicesOf(k, plan, rows).map((v) => { const n = base.filter((c) => valuesOf(c, k).includes(v)).length, on = picked.includes(v), off = !n && !on;
            return <label key={v} className={off ? "off" : ""}><input type="checkbox" checked={on} disabled={off} onChange={() => flip(v)} /><span>{v}</span><small>{n}</small></label>; })}
          <div className="mi7-fmf"><button type="button" className="mi7-lnk" disabled={!picked.length} onClick={() => set({ ...f, [k]: [] })}>Clear</button><button type="button" className="btn" onClick={() => { setOpen(false); btn.current?.focus(); }}>Done</button></div>
        </div></>}
    </span>);
}

/** The filter row, with the sticky band it becomes while the table is scrolled; `lead` (portfolio and views) and `sections` show only while it is stuck. */
export function FilterRow({ rows, f, set, plan, lead, sections }: { rows: Company[]; f: EveryFilter; set: (f: EveryFilter) => void; plan: "gold" | "silver"; lead?: ReactNode; sections?: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null), row = useRef<HTMLDivElement>(null), [stuck, setStuck] = useState(false), [findOpen, setFindOpen] = useState(false);
  const [past, setPast] = useState(false), [cols, setCols] = useState<{ t: string; l: number; w: number; r: boolean }[]>([]);
  useEffect(() => {
    // the row is up (stuck under the site header) once the line just above it has scrolled past it
    let t = 0;
    const on = () => { cancelAnimationFrame(t); t = requestAnimationFrame(() => {
      const a = sentinel.current?.getBoundingClientRect(), b = row.current?.getBoundingClientRect();
      const up = !!a && !!b && a.bottom + 14 < b.top;   /* in place the row sits 10px under the line; stuck, it stays put while the line moves up */
      setStuck(up);
      // QA of 21 Nov (item 6): the table this row filters (the next .mi-co in its section). Once its last rows have gone under the row, the row steps away
      // (it had stayed over the "Show all" button and the footnote); while it is up over the table it carries the table's column names, lined up with
      // the columns (the table's own header had scrolled under it).
      const tbl = row.current?.closest("section")?.querySelector<HTMLTableElement>("table.mi-co") ?? null, tr = tbl?.getBoundingClientRect();
      setPast(!!up && !!b && !!tr && tr.bottom < b.bottom + 48);
      const head = tbl?.tHead?.rows[0];
      if (up && b && tr && head && tr.top < b.bottom) {
        const box = tbl!.parentElement!.getBoundingClientRect();
        setCols([...head.cells].map((c) => { const r = c.getBoundingClientRect(); return { t: (c.textContent || "").trim(), l: Math.round(Math.max(r.left, box.left) - b.left), w: Math.round(Math.min(r.right, box.right) - Math.max(r.left, box.left)), r: getComputedStyle(c).textAlign === "right" }; }).filter((c) => c.w > 8));
      } else setCols([]);
    }); };
    on(); addEventListener("scroll", on, { passive: true }); addEventListener("resize", on); document.addEventListener("scroll", on, { passive: true, capture: true });   // capture: the table's own sideways scroll
    return () => { cancelAnimationFrame(t); removeEventListener("scroll", on); removeEventListener("resize", on); document.removeEventListener("scroll", on, { capture: true }); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("mi7-rowup", stuck && !past); return () => document.documentElement.classList.remove("mi7-rowup"); }, [stuck, past]);   // the view bar comes back once the row has stepped away   // the view bar slides up while the row is up
  const shown = filterCompanies(rows, f).length, n = countFilters(f);
  const modelWord = plan === "gold" ? "FinLit Prism" : "FinLit IQ";
  const find = <input className="mi7-find" type="search" placeholder="Find a company" aria-label="Find a company you own" value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} />;
  return (<>
    <div ref={sentinel} className="mi7-sent" aria-hidden="true" />
    <div ref={row} className={"mi7-frow sw-host" + (stuck ? " stuck x-sw-on" : "") + (past ? " past" : "")} role="group" aria-label="Filter companies">
      {stuck && lead}
      {stuck && sections}
      {stuck && !findOpen && !f.q ? <button type="button" className="mi7-fmag" aria-label="Find a company" onClick={() => setFindOpen(true)}>⌕</button> : find}
      <Facet k="held" title="Held" rows={rows} f={f} set={set} plan={plan} />
      <Facet k="size" title="Size" rows={rows} f={f} set={set} plan={plan} />
      <Facet k="prism" title={modelWord} rows={rows} f={f} set={set} plan={plan} />
      <Facet k="peer" title="Against peers" rows={rows} f={f} set={set} plan={plan} />
      <span className="mi7-fcount" aria-live="polite">{n ? `Showing ${shown} of ${rows.length}` : `${rows.length} companies`}</span>
      {stuck && cols.length > 0 && <div className="mi7-fcols" aria-hidden="true">{cols.map((c, i) => <span key={i} style={{ left: c.l, width: c.w, textAlign: c.r ? "right" : "left" }}>{c.t}</span>)}</div>}
    </div>
    {n > 0 && <div className="mi7-chips" role="group" aria-label="Filters on">
      {f.q.trim() && <span className="mi7-chip">“{f.q.trim()}”<button type="button" aria-label={`Remove “${f.q.trim()}”`} onClick={() => set({ ...f, q: "" })}>×</button></span>}
      {FACETS.flatMap((k) => f[k].map((v) => <span key={k + v} className="mi7-chip">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => set({ ...f, [k]: f[k].filter((x) => x !== v) })}>×</button></span>))}
      <button type="button" className="mi7-lnk" onClick={() => set(NO_FILTER)}>Clear filters</button>
    </div>}
  </>);
}

/** Sections ▾ in the stuck row: the open view's sections with their numbers, "You are here", and All sections. */
export function SectionsMenu({ items, here, go, all }: { items: { id: string; n: number; label: string }[]; here: string; go: (id: string) => void; all: () => void }) {
  const [open, setOpen] = useState(false), btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", out);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", out); };
  }, [open]);
  return (
    <span className="mi7-fw">
      <button ref={btn} type="button" className="mi7-fb" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>Sections <i aria-hidden="true">▾</i></button>
      {open && <><span className="mi7-fback" aria-hidden="true" /><div ref={box} className="mi7-fm mi7-secm" role="group" aria-label="Sections">
        {items.map((s) => <button key={s.id} type="button" aria-current={s.id === here ? "location" : undefined} onClick={() => { setOpen(false); go(s.id); }}><b>{s.n || "·"}</b> {s.label}{s.id === here && <small>You are here</small>}</button>)}
        <button type="button" className="mi7-secall" onClick={() => { setOpen(false); all(); }}>All sections</button>
      </div></>}
    </span>);
}
