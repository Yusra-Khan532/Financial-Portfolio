// Task #316 (dashboard file 22, 22 Nov 2026): the pieces the shorter dashboard is built from.
// - Dd: one dropdown, in the shape of the live Showing picker: aria-haspopup="listbox", role="option" items, Enter or Space opens it, arrow keys, Home and End
//   move, Enter or a click picks, Escape closes it and focus returns to its button. A dropdown on a phone and buttons on a wide screen read one state.
// - The card menu (⋯): open the full page, hide this card. Hidden cards come back from "N cards hidden · Show" in the section bar.
// - The expanded view: the card itself becomes the panel (fixed over a dimmed page), so a choice made in it is still set on the page after closing; a box of the
//   card's height holds its place. Escape closes it (an open dropdown first), a press outside closes it, focus starts on Close and returns to the expand
//   button, Tab stays inside. On a phone the panel fills the screen. Descriptive only.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { prefs, usePrefs, type DashUi } from "../../lib/prefs";

/* ------------------------------------------------------------------ the dashboard's saved choices */
export function useDashUi(): [DashUi, (patch: Partial<DashUi>) => void] {
  const p = usePrefs();
  const set = useCallback((patch: Partial<DashUi>) => prefs.set({ dashUi: { ...prefs.get().dashUi, ...patch } }), []);
  return [p.dashUi, set];
}

/** The page each card's ⋯ menu opens, as the live card's own footer link names it. */
export const FULL_PAGE: Record<string, { to: string; label: string }> = {
  mystocks: { to: "/my-investments", label: "Open All my investments →" },
  watch: { to: "/watchlist", label: "Open watchlist →" },
  glance: { to: "/my-investments", label: "Open All my investments →" },
  sectors: { to: "/sectors", label: "Open Sector Pulse →" },
  flows: { to: "/fii-dii", label: "Full FII/DII data →" },
  resultstoday: { to: "/results", label: "Results calendar →" },
  ipos: { to: "/ipo", label: "IPO calendar →" },
  filings: { to: "/news", label: "All news and filings →" },
  results: { to: "/results/quarter", label: "See all quarter results →" },
};

/* ------------------------------------------------------------------ hidden cards and the card that is expanded */
type Dx = { hidden: ReadonlySet<string>; hide: (id: string) => void; restore: () => void };
const DxCtx = createContext<Dx | null>(null);
/** Older dashboards kept Hide per panel in this browser (finlit.hide.dashboard.<id>); those choices join the saved list once. */
const OLD_HIDE = ["sectors", "flows", "heatmap"];
export function DxProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useDashUi();
  useEffect(() => {
    try {
      const old = OLD_HIDE.filter((id) => localStorage.getItem(`finlit.hide.dashboard.${id}`) === "1");
      if (old.length) { setUi({ hidden: [...new Set([...prefs.get().dashUi.hidden, ...old])] }); old.forEach((id) => localStorage.removeItem(`finlit.hide.dashboard.${id}`)); }
    } catch { /* private window */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const v = useMemo<Dx>(() => ({ hidden: new Set(ui.hidden), hide: (id) => setUi({ hidden: [...new Set([...prefs.get().dashUi.hidden, id])] }), restore: () => setUi({ hidden: [] }) }), [ui.hidden, setUi]);
  return <DxCtx.Provider value={v}>{children}</DxCtx.Provider>;
}
export const useDx = () => useContext(DxCtx);

/** Inside one card that holds several (Your portfolios at a glance): each inner card is a pane, shown when chosen (all of them in the expanded view). */
export type Pane = { active: string; label: (id: string) => string };
export const PaneCtx = createContext<Pane | null>(null);
export const usePane = () => useContext(PaneCtx);

/** True inside a card shown in its expanded view: the card then shows everything (all regions, every tile, the readings open). */
export const XCtx = createContext(false);
export const useExpanded = () => useContext(XCtx);
/** The card a block draws is a few levels below the block's own component (GlobalMarkets renders its Card), so the expanded state lives in a slot around the
 *  block: the block reads it with useExpanded(), and its Card opens and closes it. */
type Slot = { open: boolean; setOpen: (v: boolean) => void };
const SlotCtx = createContext<Slot | null>(null);
export function XSlot({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const v = useMemo(() => ({ open, setOpen }), [open]);
  return <SlotCtx.Provider value={v}><XCtx.Provider value={open}>{children}</XCtx.Provider></SlotCtx.Provider>;
}
/** True for a card drawn inside another card (it has no tools of its own). */
export const InCardCtx = createContext(false);
/** A card's name for its expand button, menu and expanded view, when its title is not plain text. */
export const CARD_NAME: Record<string, string> = { flows: "FII / DII flows", snapshot: "Market snapshot", portfolio: "Your equity at a glance", mfglance: "Your mutual funds at a glance", globalmarkets: "Global markets", heatmap: "Index heatmap" };

/* ------------------------------------------------------------------ icons */
const Chev = () => <svg className="dx-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" /></svg>;
const ExpandIc = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" /></svg>;
const Dots = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;

/** Close a popup on a press outside it. */
function useOutside(open: boolean, box: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: Event) => { if (!box.current?.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [open, box, close]);
}
/** Keep a popup on screen: it opens to the left of its button when the right edge would be cut. */
function useOnScreen(open: boolean, list: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const m = list.current; if (!open || !m) return;
    m.style.left = ""; m.style.right = "";
    const r = m.getBoundingClientRect();
    if (r.right > innerWidth - 8) { m.style.left = "auto"; m.style.right = "0"; }
    const r2 = m.getBoundingClientRect();
    if (r2.left < 8) { m.style.right = "auto"; m.style.left = `${8 - (m.parentElement?.getBoundingClientRect().left ?? 0)}px`; }
  }, [open, list]);
}

/* ------------------------------------------------------------------ the dropdown */
export type DdOption<T extends string> = { v: T; label: string; small?: ReactNode; href?: string };
export function Dd<T extends string>({ k, value, options, onChange, label, className = "", shown }: {
  /** the word before the choice ("Sort", "Region") */ k: string; value: T; options: readonly DdOption<T>[]; onChange: (v: T) => void;
  /** accessible name; by default "<k>: <choice>" */ label?: string; className?: string; /** the button's text, when it differs from the chosen option's */ shown?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null);
  const id = "dx-dd-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const cur = options.find((o) => o.v === value);
  const close = useCallback((focus = false) => { setOpen(false); if (focus) btn.current?.focus({ preventScroll: true }); }, []);
  useOutside(open, box, close);
  useOnScreen(open, list);
  useEffect(() => { if (open) (list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>("[role=option]"))?.focus({ preventScroll: true }); }, [open]);
  const pick = (o: DdOption<T>) => { close(true); if (!o.href) onChange(o.v); };
  const keys = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])], i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1); else if (e.key === "ArrowUp") go(i - 1); else if (e.key === "Home") go(0); else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close();
    else if ((e.key === "Enter" || e.key === " ") && i >= 0) { e.preventDefault(); items[i].click(); }
  };
  return (
    <div className={"dx-dd " + className} ref={box}>
      <button ref={btn} type="button" className="dx-dd-b" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={label ?? `${k}: ${shown ?? cur?.label ?? ""}`}
        onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); close(true); } }}>
        <span className="dx-dd-k">{k}</span><b>{shown ?? cur?.label ?? ""}</b><Chev />
      </button>
      {open && <ul ref={list} className="dx-dd-m" id={id} role="listbox" aria-label={k} onKeyDown={keys}>
        {options.map((o) => o.href
          ? <li key={o.v} role="option" aria-selected={false} tabIndex={-1} className="dx-dd-a" onClick={() => close()}><Link to={o.href} tabIndex={-1}><span>{o.label}</span>{o.small ? <small>{o.small}</small> : null}</Link></li>
          : <li key={o.v} role="option" aria-selected={o.v === value} tabIndex={-1} onClick={() => pick(o)}><span>{o.label}</span>{o.small ? <small>{o.small}</small> : null}</li>)}
      </ul>}
    </div>
  );
}

/** Buttons on a wide screen and a dropdown on a phone, for the same choice (the pack's rule: a dropdown when the choices do not fit one row on a phone). */
export function SegDd<T extends string>({ k, value, options, onChange, label, segClass = "" }: { k: string; value: T; options: readonly DdOption<T>[]; onChange: (v: T) => void; label: string; segClass?: string }) {
  return <>
    <div className={"dsh-seg dx-only-l " + segClass} role="group" aria-label={label}>{options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}{typeof o.small === "number" ? <> <span className="n">{o.small}</span></> : null}</button>)}</div>
    <Dd k={k} value={value} options={options} onChange={onChange} className="dx-only-s dx-wide" label={`${label}: ${options.find((o) => o.v === value)?.label ?? ""}`} />
  </>;
}

/* ------------------------------------------------------------------ the card menu */
export function CardMenu({ id, title, onHide, page: own }: { id: string; title: string; onHide?: () => void; page?: { to: string; label: string } }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null);
  const close = useCallback((focus = false) => { setOpen(false); if (focus) btn.current?.focus({ preventScroll: true }); }, []);
  useOutside(open, box, close);
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true }); }, [open]);
  const page = own ?? FULL_PAGE[id];
  const keys = (e: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])], i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close();
  };
  if (!page && !onHide) return null;
  return (
    <div className="dx-mn dx-xc" ref={box}>
      <button ref={btn} type="button" className="dx-mn-b" aria-haspopup="menu" aria-expanded={open} aria-label={`More for ${title}`} onClick={() => setOpen(!open)}><Dots /></button>
      {open && <ul ref={list} className="dx-mn-m" role="menu" aria-label={`More for ${title}`} onKeyDown={keys}>
        {page && <li role="none"><Link role="menuitem" to={page.to} onClick={() => close()}>{page.label}</Link></li>}
        {onHide && <li role="none"><button role="menuitem" type="button" onClick={() => { close(); onHide(); }}>Hide this card</button></li>}
      </ul>}
    </div>
  );
}

/* ------------------------------------------------------------------ the expanded view */
const FOCUSABLE = 'button:not([disabled]), a[href], summary, select, input, [tabindex="0"]';
/** The expanded view of one card. `open` adds the dimmed page behind the card and the Close bar; the card itself (its `<section>`) is the panel. */
export function useExpand(title: string, ownSlot = true): { open: boolean; expand: () => void; close: () => void; hold: number | null; panelRef: React.RefObject<HTMLElement | null>; btnRef: React.RefObject<HTMLButtonElement | null>; bar: ReactNode; backdrop: ReactNode } {
  const ctxSlot = useContext(SlotCtx), slot = ownSlot ? ctxSlot : null;   // a card inside another card never takes the slot
  const [own, setOwn] = useState(false), [hold, setHold] = useState<number | null>(null);
  const open = slot ? slot.open : own, setOpen = slot ? slot.setOpen : setOwn;
  const panelRef = useRef<HTMLElement>(null), btnRef = useRef<HTMLButtonElement>(null), closeRef = useRef<HTMLButtonElement>(null), scroll = useRef(0);
  const expand = () => { setHold(panelRef.current?.offsetHeight ?? null); scroll.current = scrollY; setOpen(true); };
  const close = useCallback(() => { setOpen(false); setHold(null); requestAnimationFrame(() => { if (Math.abs(scrollY - scroll.current) > 1) scrollTo({ top: scroll.current }); btnRef.current?.focus({ preventScroll: true }); }); }, []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    // A page wrapper with its own z-index (the site's content column is z-index 1) would keep the panel under the site header: lift those wrappers while open.
    const lifted: [HTMLElement, string][] = [];
    for (let el = panelRef.current?.parentElement ?? null; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.zIndex !== "auto" && cs.position !== "static") { lifted.push([el, el.style.zIndex]); el.style.zIndex = "300"; }
    }
    closeRef.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (e.defaultPrevented) return; e.preventDefault(); close(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === closeRef.current);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (!panelRef.current.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
      else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; lifted.forEach(([el, z]) => { el.style.zIndex = z; }); document.removeEventListener("keydown", key); };
  }, [open, close]);
  const bar = open ? <div className="dx-x-bar"><span>Expanded view · {title}</span><button ref={closeRef} type="button" className="dx-x-c" onClick={close}>Close <span aria-hidden="true">✕</span></button></div> : null;
  const backdrop = open ? <div className="dx-x" aria-hidden="true" onClick={close} /> : null;   // beside the card, so both share one stacking context
  return { open, expand, close, hold, panelRef, btnRef, bar, backdrop };
}
export function ExpandButton({ title, onClick, btnRef }: { title: string; onClick: () => void; btnRef: React.RefObject<HTMLButtonElement | null> }) {
  return <button ref={btnRef} type="button" className="dx-xb dx-xc" aria-label={`Expand: ${title}`} title="Expanded view" onClick={onClick}><ExpandIc /></button>;
}
