// Task #438 (developer pack of 28 Nov 2026, "All my investments · Sort by any column"): every table on /my-investments sorts by any column heading.
// First click sorts (direction by the column's type), the second reverses, the third goes back to FinLit's own order; Reset in the sort line does too.
// One column at a time, ties keep FinLit's order, blanks always last. Remembered per table for the browser session (sessionStorage "finlit-mi-sort"),
// never in the URL. The pack's vanilla script moved rows in the DOM; here the same rules sort the data before "Show all" slices it (the pack's
// external mode, spec 6B), so filters, search and "Show all" work on the sorted list and React keeps the rows. Neutral wording only.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "../styles/sort438.css";

export type SortType = "text" | "num" | "prism" | "size" | "peer" | "held";
export type Dir = "asc" | "desc";
export type SortState = { key: string; dir: Dir } | null;
/** A heading. `get` returns the raw value from the data (a number, a name, a size or peer label, the held letters); null or "" is blank. */
export type Col<T> = { key: string; label: ReactNode; text: string; type: SortType; get: (row: T) => unknown; r?: boolean } | { key: string; type: "none"; label?: ReactNode; ariaLabel?: string; r?: boolean };

export const STORE = "finlit-mi-sort";
export const LABELS: Record<SortType, [string, string]> = {
  text: ["A to Z", "Z to A"],
  num: ["high to low", "low to high"],
  prism: ["highest score first", "lowest score first"],
  size: ["large to micro", "micro to large"],
  peer: ["leaders first", "laggards first"],
  held: ["most ways first", "fewest ways first"],
};
const SIZE = ["large", "mid", "small", "micro"];          // "Listed abroad", "Not sized" are blank
const PEER = ["leader", "in line", "laggard"];            // "Not compared", "Not on your list" are blank

/** "₹2.50 L" → 250000 · "₹1.50 Cr" → 15000000 · "−₹12.40 L" → −1240000 · "+2.1%" → 2.1 · "—" → null. */
export function parseNumber(text: unknown): number | null {
  if (text == null) return null;
  const m = String(text).replace(/ /g, " ").match(/([+−-])?\s*₹?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(Cr|L|K)(?![A-Za-z]))?/);
  if (!m) return null;
  let v = parseFloat(m[2].replace(/,/g, ""));
  if (Number.isNaN(v)) return null;
  if (m[3] === "Cr") v *= 1e7; else if (m[3] === "L") v *= 1e5; else if (m[3] === "K") v *= 1e3;
  return m[1] === "−" || m[1] === "-" ? -v : v;
}
const rank = (list: string[], t: unknown) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const i = list.findIndex((x) => s === x || s.startsWith(x + " "));
  return i < 0 ? null : -i;   // 0 = first of the list, stored negative so "high to low" puts it first
};
/** Ways held × 10, then D > F > E: D+E before D alone before E alone. Nothing ticked is blank. */
export function heldValue(letters: unknown): number | null {
  const l = String(letters ?? "").toUpperCase(), d = l.includes("D"), f = l.includes("F"), e = l.includes("E");
  const ways = +d + +f + +e;
  return ways ? ways * 10 + (d ? 4 : 0) + (f ? 2 : 0) + (e ? 1 : 0) : null;
}
/** Raw value from the data → the value compared. */
export function valueOf(type: SortType, raw: unknown): number | string | null {
  if (raw == null || raw === "" || raw === "—") return null;
  if (type === "text") return String(raw);
  if (type === "size") return rank(SIZE, raw);
  if (type === "peer") return rank(PEER, raw);
  if (type === "held") return heldValue(Array.isArray(raw) ? raw.join("") : raw);
  return typeof raw === "number" ? (Number.isNaN(raw) ? null : raw) : parseNumber(raw);
}
export const firstDir = (t: SortType): Dir => (t === "text" ? "asc" : "desc");
/** Blanks always last, either way. */
export function compareValues(a: number | string | null, b: number | string | null, type: SortType, dir: Dir) {
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1;
  const x = type === "text" ? String(a).localeCompare(String(b), "en", { sensitivity: "base", numeric: true }) : (a as number) - (b as number);
  return dir === "asc" ? x : -x;
}
/** Stable: ties keep FinLit's order (the order the rows came in). */
export function sortData<T>(items: readonly T[], get: (r: T) => unknown, type: SortType, dir: Dir): T[] {
  return items.map((it, i) => ({ it, i, v: valueOf(type, get(it)) })).sort((a, b) => compareValues(a.v, b.v, type, dir) || a.i - b.i).map((o) => o.it);
}
/** Sort → reverse → FinLit's order; another heading starts fresh. */
export function nextState(s: SortState, key: string, type: SortType): SortState {
  const f = firstDir(type);
  if (!s || s.key !== key) return { key, dir: f };
  return s.dir === f ? { key, dir: f === "asc" ? "desc" : "asc" } : null;
}
export const labelFor = (type: SortType, dir: Dir) => LABELS[type][dir === firstDir(type) ? 0 : 1];

function readStore(): Record<string, SortState> {
  try { return JSON.parse(sessionStorage.getItem(STORE) || "{}") ?? {}; } catch { return {}; }
}
function writeStore(id: string, s: SortState) {
  try { const all = readStore(); if (s) all[id] = s; else delete all[id]; if (Object.keys(all).length) sessionStorage.setItem(STORE, JSON.stringify(all)); else sessionStorage.removeItem(STORE); } catch { /* blocked storage: sorting still works, it just isn't remembered */ }
}

type Sortable<T> = Extract<Col<T>, { get: unknown }>;
export type TableSort<T> = { id: string; cols: Col<T>[]; state: SortState; col: Sortable<T> | null; click: (key: string) => void; reset: () => void; sort: (rows: readonly T[]) => T[]; said: string; colIndex: number };

/** One table's sort. `id` names the table in the remembered sorts; a remembered column that is not on the table any more is ignored. */
export function useTableSort<T>(id: string, cols: Col<T>[]): TableSort<T> {
  const [state, setState] = useState<SortState>(() => readStore()[id] ?? null);
  const [said, setSaid] = useState("");
  const col = (state && (cols.find((c) => c.key === state.key && c.type !== "none") as Sortable<T> | undefined)) || null;
  const live = col ? state : null;
  const set = (s: SortState) => {
    setState(s); writeStore(id, s);
    const c = s && (cols.find((x) => x.key === s.key) as Sortable<T>);
    setSaid(c && s ? `Sorted by ${c.text}, ${labelFor(c.type, s.dir)}` : "Back to FinLit’s order");
  };
  return {
    id, cols, state: live, col, said,
    colIndex: col ? cols.indexOf(col) : -1,
    click: (key) => { const c = cols.find((x) => x.key === key); if (c && c.type !== "none") set(nextState(live, key, c.type)); },
    reset: () => set(null),
    sort: (rows) => (col && live ? sortData(rows, col.get, col.type, live.dir) : [...rows]),
  };
}

const AR = {
  none: <svg viewBox="0 0 12 14" width="12" height="14" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6 1 10 5.5H2z" /><path d="M6 13 2 8.5h8z" /></svg>,
  asc: <svg viewBox="0 0 12 14" width="12" height="14" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6 2 10.5 7.5h-9z" /><rect x="5" y="7" width="2" height="5" rx="1" /></svg>,
  desc: <svg viewBox="0 0 12 14" width="12" height="14" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6 12 1.5 6.5h9z" /><rect x="5" y="2" width="2" height="5" rx="1" /></svg>,
};

/** The heading row: each data heading's words inside a real button with the arrow pair; "(Open its tab)" and other empty headings stay as they were. */
export function SortHead<T>({ s }: { s: TableSort<T> }) {
  return (
    <thead><tr>{s.cols.map((c) => {
      if (c.type === "none") return <th key={c.key} scope="col" className={c.r ? "r" : undefined} aria-label={c.ariaLabel}>{c.label}</th>;
      const d = s.state?.key === c.key ? s.state.dir : null;
      const title = d ? `Sorted ${labelFor(c.type, d)}. Press to ${d === firstDir(c.type) ? "reverse" : "go back to FinLit’s order"}.` : `Sort by ${c.text}, ${labelFor(c.type, firstDir(c.type))}`;
      return (
        <th key={c.key} scope="col" className={(c.r ? "r " : "") + "fl-sortable" + (c.r ? " fl-r" : "")} aria-sort={d === "asc" ? "ascending" : d === "desc" ? "descending" : "none"}>
          <button type="button" className="fl-sort" title={title} onClick={() => s.click(c.key)}><span className="fl-sort-t">{c.label}</span><span className="fl-sort-ar">{d ? AR[d] : AR.none}</span></button>
        </th>);
    })}</tr></thead>
  );
}

/** The line above the table: the hint when unsorted, the chip with Reset when sorted, and the polite announcement. */
export function SortBar<T>({ s }: { s: TableSort<T> }) {
  return (
    <div className="fl-sortbar">
      {s.col && s.state
        ? <><span className="fl-sort-on"><span>Sorted by <b>{s.col.text}</b>, {labelFor(s.col.type, s.state.dir)}</span><button type="button" className="fl-sort-reset" onClick={s.reset}>Reset</button></span><span className="fl-sort-hint">Click the heading again to reverse.</span></>
        : <span className="fl-sort-idle"><svg viewBox="0 0 12 14" width="10" height="12" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6 1 10 5.5H2z" /><path d="M6 13 2 8.5h8z" /></svg> Click any heading to sort this table.</span>}
      <span className="fl-sr" aria-live="polite">{s.said}</span>
    </div>
  );
}
/** The table's attribute that tints the sorted column's cells (1-based, as nth-child counts). */
export const sortedCol = <T,>(s: TableSort<T>) => (s.colIndex >= 0 ? { "data-fl-col": s.colIndex + 1 } : {});

// ------------------------------------------------------------------------------------------------ the Held key and letter tooltips (spec 02)
export type HeldWays = { held: readonly ("D" | "F" | "E")[]; direct: number; funds: number; etfs: number; via: readonly string[] };
const pctTxt = (v: number, fmt: (v: number) => string) => (v ? ` · ${fmt(v)}` : "");
/** What each letter's tooltip and the box's aria-label say; fund and ETF names from the row's own lists. */
export function heldTips(c: HeldWays, fundNames: readonly string[], etfNames: readonly string[], fmt: (v: number) => string) {
  const on = { D: c.held.includes("D"), F: c.held.includes("F"), E: c.held.includes("E") };
  let funds = c.via.filter((v) => fundNames.includes(v)).join(", "), etfs = c.via.filter((v) => etfNames.includes(v)).join(", ");
  if (!funds && !etfs && c.via.length) { const v = c.via.join(" · "); if (on.E && !on.F) etfs = v; else if (on.F && !on.E) funds = v; else if (on.E && on.F) etfs = funds = v; }
  const tip = {
    D: on.D ? <><b>Held directly</b>, in your Equity portfolio{pctTxt(c.direct, fmt)}</> : <>Not held directly</>,
    F: on.F ? <><b>Held through your mutual funds</b>{funds ? `: ${funds}` : ""}{pctTxt(c.funds, fmt)}</> : <>Not held through your mutual funds</>,
    E: on.E ? <><b>Held through your ETFs</b>{etfs ? `: ${etfs}` : ""}{pctTxt(c.etfs, fmt)}</> : <>Not held through your ETFs</>,
  };
  const ways = [on.D && "directly", on.F && "through mutual funds" + (funds ? ` (${funds})` : ""), on.E && "through ETFs" + (etfs ? ` (${etfs})` : "")].filter(Boolean);
  return { tip, label: ways.length ? "Held " + ways.join(", ") : "Not held" };
}

/** The key line just above the Every company table's sort line. Same .mi-held boxes as the table, so the site's own colours. */
export function HeldKey() {
  return (
    <div className="fl-held-key">
      <b>Held</b>
      <span><span className="mi-held"><i className="on mD">D</i></span>directly, in your Equity portfolio</span>
      <span><span className="mi-held"><i className="on mF">F</i></span>through your mutual funds</span>
      <span><span className="mi-held"><i className="on mE">E</i></span>through your ETFs</span>
      <span className="fl-held-note">Pale letter: not held that way. Point at or tap a letter to see which ETF or fund.</span>
    </div>
  );
}

/** One floating tooltip (#fl-held-tip, position fixed) so the scrolling table never clips it: hover shows it, a tap shows it for 2.5 s, it hides when the
 *  pointer leaves or the page scrolls. A scroll listener exists only while it shows. Spread `handlers` on the table. */
export function useHeldTip() {
  const [tip, setTip] = useState<{ node: ReactNode; el: HTMLElement } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null), timer = useRef(0), tapped = useRef(false);   // a tap keeps it 2.5 s: touch screens send a mouseout right after the tap
  const letter = (e: React.SyntheticEvent) => (e.target as HTMLElement).closest?.<HTMLElement>(".mi-held i[data-tip]") ?? null;
  const nodes = useRef(new WeakMap<HTMLElement, ReactNode>());
  const show = (el: HTMLElement) => { const n = nodes.current.get(el); if (n != null) { setPos(null); setTip({ node: n, el }); } };
  const hide = () => { window.clearTimeout(timer.current); tapped.current = false; setTip(null); };
  useEffect(() => {
    if (!tip) return;
    const t = box.current;
    if (t) {
      const r = tip.el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
      const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      let y = r.top - h - 8; if (y < 8) y = r.bottom + 8;
      setPos((p) => (p && p.x === x && p.y === y ? p : { x, y }));
    }
    const on = () => hide();
    window.addEventListener("scroll", on, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", on, { capture: true });
  }, [tip]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    /** the ref callback for each letter: registers what its tooltip says */
    reg: (node: ReactNode) => (el: HTMLElement | null) => { if (el) nodes.current.set(el, node); },
    handlers: {
      onMouseOver: (e: React.MouseEvent) => { const i = letter(e); if (i) show(i); },
      onMouseOut: (e: React.MouseEvent) => { if (letter(e) && !tapped.current) hide(); },
      onClick: (e: React.MouseEvent) => { const i = letter(e); if (!i) return; show(i); window.clearTimeout(timer.current); tapped.current = true; timer.current = window.setTimeout(hide, 2500); },
    },
    el: tip ? createPortal(<div ref={box} id="fl-held-tip" role="tooltip" className={pos ? "fl-on" : ""} style={pos ? { left: pos.x, top: pos.y } : { left: -9999, top: 0 }}>{tip.node}</div>, document.body) : null,
  };
}
