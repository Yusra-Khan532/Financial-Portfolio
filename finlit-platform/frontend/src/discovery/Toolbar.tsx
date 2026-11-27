// Task #303 (developer file 15, the whole Discover section; developer file 13, the compact toolbar): the dropdown buttons every Discover list uses in place of
// the old filter card. One button per filter (Theme, Stage, Sector, Industry, Size, More filters, My names), each opening a small panel with its choices
// and how many companies each leaves; Ready-made views, Sort and Columns on the count line; the filters that are on as chips with Clear all. On a phone the
// panels open from the bottom of the screen (discover.css, .dbx-pop). Only one panel is open at a time; Escape or a click outside closes it and gives focus
// back to its button. Class names: .dbx- (developer file 13) and .dw- (developer file 15).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ARROW, BANDS, CORNERS, SIZES, STAGES, TRENDS, type TState } from "./model";
import type { CompanySize } from "../lib/companySize";

// ------------------------------------------------------------------------------------------------ icons (stroke, currentColor)
const sv = (d: ReactNode, w = 2) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
export const Ico = {
  search: sv(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  tune: sv(<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>),
  star: sv(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />),
  check: sv(<path d="m5 12 5 5 9-10" />, 2.6),
  cols: sv(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>),
  list: sv(<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />),
  ext: sv(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />),
  x: sv(<path d="M6 6l12 12M18 6 6 18" />, 2.4),
};
const Chev = () => <svg className="dbx-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
const nf = (n: number) => n.toLocaleString("en-IN");

// ------------------------------------------------------------------------------------------------ one dropdown
/** Only one panel is open on the page. */
let closeOpenDd: (() => void) | null = null;
export function Dd({ label, value, icon, badge, title, wide, right, cls, popCls, children }: {
  label: string; value?: string; icon?: ReactNode; badge?: string | number | null; title?: string; wide?: boolean; right?: boolean; cls?: string; popCls?: string;
  /** the panel; `close` shuts it (focus back to the button) */ children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null), pop = useRef<HTMLDivElement>(null);
  const shut = (focus: boolean) => { setOpen(false); if (closeOpenDd === closer) closeOpenDd = null; if (focus) btn.current?.focus(); };
  const closer = () => shut(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); shut(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const opts = [...(pop.current?.querySelectorAll<HTMLButtonElement>(".dbx-opt:not(:disabled)") ?? [])];
      if (!opts.length) return;
      e.preventDefault();
      const i = opts.indexOf(document.activeElement as HTMLButtonElement);
      opts[e.key === "ArrowDown" ? Math.min(opts.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
    };
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) shut(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // keep the panel inside the screen on a laptop (on a phone it is fixed to the bottom)
  useLayoutEffect(() => {
    const p = pop.current; if (!open || !p || typeof getComputedStyle === "undefined") return;
    p.style.removeProperty("--dx");
    if (getComputedStyle(p).position === "fixed") return;
    const r = p.getBoundingClientRect(), W = document.documentElement.clientWidth;
    if (!W || !r.width) return;
    if (r.right > W - 12) p.style.setProperty("--dx", `${Math.round(W - 12 - r.right)}px`);
    else if (r.left < 12) p.style.setProperty("--dx", `${Math.round(12 - r.left)}px`);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const p = pop.current;
    (p?.querySelector<HTMLElement>("input[type=search]") ?? p?.querySelector<HTMLElement>('[aria-selected="true"]') ?? p?.querySelector<HTMLElement>("input, button.dbx-opt, select"))?.focus({ preventScroll: true });
  }, [open]);
  const toggle = () => { if (open) { shut(true); return; } closeOpenDd?.(); closeOpenDd = closer; setOpen(true); };
  return <div className={"dbx-dd" + (cls ? " " + cls : "")} ref={box}>
    <button ref={btn} type="button" className={"dbx-ddb" + (value ? " on" : "")} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
      {icon}<span className="dbx-ddl">{label}</span>{value ? <span className="dbx-ddv">{value}</span> : null}{badge ? <span className="dbx-badge">{badge}</span> : null}<Chev /></button>
    {open && <div ref={pop} className={"dbx-pop" + (wide ? " wide" : "") + (right ? " right" : "") + (popCls ? " " + popCls : "")} role="dialog" aria-label={title ?? label}>
      <div className="dbx-ph"><span>{title ?? label}</span><button type="button" className="dbx-x" aria-label="Close" onClick={() => shut(true)}>{Ico.x}</button></div>
      {children(() => shut(true))}
    </div>}
  </div>;
}

/** One choice of a list panel; a `head` is a group title. */
export type Opt = { v: string; t: string; c?: number | null; sel?: boolean; head?: boolean; all?: boolean; g?: string };
/** The list inside a panel: options with their counts, a tick on the one chosen, group titles; `search` adds a box that narrows it. */
export function OptList({ title, items, onPick, search }: { title: string; items: Opt[]; onPick: (v: string) => void; search?: boolean }) {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  let body = items.filter((it) => it.head || !s || it.t.toLowerCase().includes(s) || (it.g ?? "").toLowerCase().includes(s));
  body = body.filter((it, i) => !it.head || (body[i + 1] && !body[i + 1].head));
  return <>
    {search && <label className="dbx-ps">{Ico.search}<input type="search" placeholder={`Search ${title.toLowerCase()}`} aria-label={`Search ${title.toLowerCase()}`} value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} /></label>}
    <div className="dbx-ol" role="listbox" aria-label={title}>{body.length ? body.map((it, i) => it.head
      ? <div key={"h" + i + it.t} className="dbx-og" role="presentation">{it.t}</div>
      : <button key={it.v + i} type="button" role="option" className={"dbx-opt" + (it.all ? " all" : "")} aria-selected={!!it.sel} data-zero={it.c === 0 && !it.sel ? "" : undefined} onClick={() => onPick(it.v)}>
        <span className="dbx-ot">{it.t}</span>{it.c != null ? <span className="dbx-oc">{nf(it.c)}</span> : null}{it.sel ? <span className="dbx-ok">{Ico.check}</span> : null}</button>)
      : <p className="dbx-none">Nothing matches.</p>}</div>
  </>;
}

/** A switch row (a ready-made view, a column, "Only my names"). `note` stands in for the count when the switch cannot be used (Gold, not published). */
export function Sw({ label, on, n, note, disabled, big, onChange }: { label: ReactNode; on: boolean; n?: number | null; note?: string; disabled?: boolean; big?: boolean; onChange: (on: boolean) => void }) {
  return <label className={"dbx-sw" + (big ? " big" : "")}>
    <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span className="dbx-swt">{label}</span>{note ? <span className="dbx-sc">{note}</span> : n != null ? <span className="dbx-sc">{nf(n)}</span> : null}</label>;
}

/** The panel footer: "Clear these" and "Show N companies" (which closes the panel). */
export function PopFoot({ n, clear, close }: { n: number; clear: () => void; close: () => void }) {
  return <div className="dbx-pf"><button type="button" className="dbx-lk" onClick={clear}>Clear these</button>
    <button type="button" className="dbx-done" onClick={close}>Show {nf(n)} {n === 1 ? "company" : "companies"}</button></div>;
}

/** A labelled select inside More filters, each choice with its count. */
export function FSel({ label, value, any, opts, count, onChange, locked }: { label: string; value: string; any: string; opts: [string, string][]; count?: (v: string) => number;
  onChange: (v: string) => void; locked?: boolean }) {
  return <label className="dbx-f"><span>{label}</span>
    <select aria-label={label} value={locked ? "" : value} data-on={value && !locked ? "" : undefined} disabled={locked} onChange={(e) => onChange(e.target.value)}>
      {locked ? <option value="">Part of Gold</option> : <><option value="">{any}</option>{opts.map(([v, t]) => <option key={v} value={v}>{count ? `${t} (${nf(count(v))})` : t}</option>)}</>}
    </select></label>;
}

/** A row of segments (keywords named, filed) with the count each leaves. */
export function Seg({ label, value, opts, count, onChange }: { label: string; value: string; opts: [string, string][]; count: (v: string) => number; onChange: (v: string) => void }) {
  return <div className="dbx-f"><span>{label}</span><div className="dbx-seg" role="radiogroup" aria-label={label}>{opts.map(([v, t]) => (
    <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(value === v && v ? "" : v)}>{t}{v ? <span className="dbx-sc">{nf(count(v))}</span> : null}</button>))}</div></div>;
}

/** The filters that are on, as chips, with Clear all. */
export function Chips({ chips, unset }: { chips: [string, string][]; unset: (k: string) => void }) {
  if (!chips.length) return null;
  return <div className="dbx-chips" role="group" aria-label="Filters on">{chips.map(([k, t]) => (
    <button key={k} type="button" className="dbx-chip" aria-label={`Remove filter ${t}`} onClick={() => unset(k)}>{t}{Ico.x}</button>))}
    <button type="button" className="dbx-lk" onClick={() => unset("all")}>Clear all</button></div>;
}

/** The search box of a list. */
export function Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <label className="dbx-q">{Ico.search}<input type="search" placeholder="Search a company in this list" aria-label="Search in this list" value={value} autoComplete="off" onChange={(e) => onChange(e.target.value)} /></label>;
}

// ------------------------------------------------------------------------------------------------ the shared lists
type Nse = { mac: string | null; sct: string | null; ind: string | null };
const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter((x): x is string => !!x))].sort((x, y) => x.localeCompare(y));
/** Sector: "Any sector", then each macro sector with "All of …" and its sectors. `cnt` counts the list with a patch of the three NSE keys. */
export function sectorItems(rows: Nse[], S: Pick<TState, "mac" | "sct">, cnt: (p: Partial<TState>) => number): Opt[] {
  const items: Opt[] = [{ v: "", t: "Any sector", c: cnt({ mac: "", sct: "", ind: "" }), sel: !S.mac && !S.sct }];
  for (const m of uniq(rows.map((r) => r.mac))) {
    items.push({ v: "", t: m, head: true }, { v: "mac:" + m, t: `All of ${m}`, g: m, c: cnt({ mac: m, sct: "", ind: "" }), sel: S.mac === m && !S.sct, all: true });
    for (const s of uniq(rows.filter((r) => r.mac === m).map((r) => r.sct))) items.push({ v: "sct:" + s, t: s, g: m, c: cnt({ mac: m, sct: s, ind: "" }), sel: S.sct === s });
  }
  return items;
}
export function pickSector(v: string, rows: Nse[]): Partial<TState> {
  if (!v) return { mac: "", sct: "", ind: "", page: 0 };
  if (v.startsWith("mac:")) return { mac: v.slice(4), sct: "", ind: "", page: 0 };
  const s = v.slice(4), r = rows.find((x) => x.sct === s);
  return { mac: r?.mac ?? "", sct: s, ind: "", page: 0 };
}
/** Industry: the industries inside the chosen macro sector or sector, under their sector. */
export function industryItems(rows: Nse[], S: Pick<TState, "mac" | "sct" | "ind">, cnt: (p: Partial<TState>) => number): Opt[] {
  const inn = rows.filter((r) => (!S.mac || r.mac === S.mac) && (!S.sct || r.sct === S.sct));
  const items: Opt[] = [{ v: "", t: S.sct ? `Any industry in ${S.sct}` : S.mac ? `Any industry in ${S.mac}` : "Any industry", c: cnt({ ind: "" }), sel: !S.ind }];
  for (const s of uniq(inn.map((r) => r.sct))) {
    if (!S.sct) items.push({ v: "", t: s, head: true });
    for (const i of uniq(inn.filter((r) => r.sct === s).map((r) => r.ind))) items.push({ v: i, t: i, g: s, c: cnt({ ind: i }), sel: S.ind === i });
  }
  return items;
}
export function pickIndustry(v: string, rows: Nse[]): Partial<TState> {
  if (!v) return { ind: "", page: 0 };
  const r = rows.find((x) => x.ind === v);
  return { ind: v, sct: r?.sct ?? "", mac: r?.mac ?? "", page: 0 };
}
const SIZE_LONG: Record<CompanySize, string> = { large: "Large · above ₹75,000 cr", mid: "Mid · ₹25,000–75,000 cr", small: "Small · ₹10,000–25,000 cr", micro: "Micro · below ₹10,000 cr" };
export const sizeItems = (S: Pick<TState, "size">, cnt: (p: Partial<TState>) => number): Opt[] =>
  [{ v: "", t: "Any size", c: cnt({ size: "" }), sel: !S.size }, ...(Object.keys(SIZE_LONG) as CompanySize[]).map((k) => ({ v: k, t: SIZE_LONG[k], c: cnt({ size: k }), sel: S.size === k }))];
export const stageItems = (S: Pick<TState, "stage">, cnt: (p: Partial<TState>) => number): Opt[] =>
  [{ v: "", t: "Any stage", c: cnt({ stage: "" }), sel: !S.stage }, ...STAGES.map((s) => ({ v: s, t: s, c: cnt({ stage: s }), sel: S.stage === s }))];

/** More filters' "About the company": long-term trend, FinLit Prism (both Gold) and the Sector Rotation box. */
export function AboutCompany({ S, set, cnt, prismOpen }: { S: TState; set: (p: Partial<TState>) => void; cnt: (p: Partial<TState>) => number; prismOpen: boolean }) {
  return <>
    <FSel label="Long-term trend" value={S.lt} any="Any trend" locked={!prismOpen} opts={[...TRENDS.map((t) => [t, t] as [string, string]), ["none", "Not rated"]]} count={(v) => cnt({ lt: v })} onChange={(v) => set({ lt: v, page: 0 })} />
    <FSel label="FinLit Prism" value={S.pr} any="Any rating" locked={!prismOpen} opts={BANDS.map((t) => [t, t] as [string, string])} count={(v) => cnt({ pr: v })} onChange={(v) => set({ pr: v, page: 0 })} />
    <FSel label="Sector Rotation" value={S.cn} any="Any box" opts={(Object.keys(CORNERS) as (keyof typeof CORNERS)[]).map((k) => [k, `${ARROW[k]} ${CORNERS[k]}`] as [string, string])} count={(v) => cnt({ cn: v })} onChange={(v) => set({ cn: v, page: 0 })} />
  </>;
}

/** The chips of the shared filters, in the words of the filters. */
export function sharedChips(S: TState, themeLabel?: (t: string) => string): [string, string][] {
  const chips: [string, string][] = [];
  if (S.cell) chips.push(["cell", "Theme: " + (themeLabel?.(S.cell) ?? S.cell)]);
  const lab: Record<string, string> = { stage: "Stage", size: "Size", lt: "Long-term trend", pr: "Prism", mac: "Macro sector", sct: "Sector", ind: "Industry", cn: "Sector Rotation" };
  (["stage", "size", "lt", "pr", "mac", "sct", "ind", "cn"] as const).forEach((k) => {
    if (!S[k]) return;
    if (k === "mac" && S.sct) return;                        // the sector names its macro sector
    const v = k === "size" ? SIZES[S[k] as CompanySize] ?? S[k] : k === "cn" ? `${ARROW[S[k] as keyof typeof ARROW] ?? ""} ${CORNERS[S[k] as keyof typeof CORNERS] ?? S[k]}` : S[k] === "none" ? "Not rated" : S[k];
    chips.push([k, `${lab[k]}: ${v}`]);
  });
  if (S.mine) chips.push(["mine", "Only my names"]);
  if (S.q) chips.push(["q", `“${S.q}”`]);
  return chips;
}
/** What a chip's ✕ takes off. */
export function unsetShared(k: string, S: TState): Partial<TState> | null {
  if (k.startsWith("lens:")) return { lenses: S.lenses.filter((x) => x !== k.slice(5)), page: 0 };
  if (k === "mine") return { mine: false, page: 0 };
  if (k === "cell") return { cell: null, page: 0 };
  if (k === "mac" || k === "sct") return { mac: "", sct: "", ind: "", page: 0 };
  if (["q", "stage", "size", "lt", "pr", "ind", "cn"].includes(k)) return { [k]: "", page: 0 } as Partial<TState>;
  return null;
}
