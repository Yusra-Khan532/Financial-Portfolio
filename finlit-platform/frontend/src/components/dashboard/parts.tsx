// Small shared pieces of the refreshed dashboard: the one card style, loading placeholders, hooks for width and phone size.
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { CARD_NAME, CardMenu, ExpandButton, InCardCtx, XCtx, useDashUi, useDx, useExpand, useExpanded, usePane } from "./dx";

/** The one card every block uses: serif title, 13px subtitle, optional right-hand control. Placeholders (not "no data" text) belong in `children` while a call is pending.
 *  Task #316: every card has the expand button (its expanded view) and the ⋯ menu (open the full page, hide this card). Hidden cards are kept on the account
 *  (prefs.dashUi.hidden) and come back from "N cards hidden · Show" in the section bar. */
export function Card({ id, title, sub, right, children, className = "", hideId, menu = true, page }: { id: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; /** the ⋯ menu's full page, when it is not the usual one */ page?: { to: string; label: string };
  /** the id the Hide choice is kept under (a merged card hides as one) */ hideId?: string; /** false for a card shown inside another card */ menu?: boolean }) {
  const dx = useDx();
  const label = typeof title === "string" ? title : CARD_NAME[id] ?? id;
  const inside = useContext(InCardCtx), shownX = useExpanded();
  const pane = usePane();
  const x = useExpand(label, !pane && !inside);
  const hid = hideId ?? id;
  if (pane) return (   // a pane of a merged card: its heading comes from the card's switch (and from data-label in the expanded view)
    <div className={"dx-pane " + className + " dx-gl-" + id} data-pane="glance" data-label={pane.label(id)} hidden={pane.active !== id} role="group" aria-label={pane.label(id)}>
      {sub ? <p className="dsh-sub dx-pane-sub">{sub}</p> : null}{children}
    </div>
  );
  if (dx?.hidden.has(hid)) return null;
  const tools = dx && menu && !inside ? <><ExpandButton title={label} onClick={x.expand} btnRef={x.btnRef} /><CardMenu id={id} title={label} page={page} onHide={() => dx.hide(hid)} /></> : null;
  return (
    <>
      {x.open && <div className="dx-hold" style={{ height: x.hold ?? undefined }} aria-hidden="true" />}
      <section ref={x.panelRef} className={"dsh-card " + className + (x.open ? " dx-xp" : "")} aria-labelledby={`dsh-${id}`} {...(x.open ? { role: "dialog", "aria-modal": true } : {})} data-card={id}>
        {x.bar}
        <div className="dsh-ch"><div><h2 id={`dsh-${id}`}>{title}</h2>{sub ? <p className="dsh-sub">{sub}</p> : null}</div><div className="dsh-chr">{right}{tools}</div></div>
        <InCardCtx.Provider value={true}><XCtx.Provider value={x.open || shownX}>{children}</XCtx.Provider></InCardCtx.Provider>
      </section>
      {x.backdrop}
    </>
  );
}

/** Grey blocks the size of the content they stand for. */
export const Rows = ({ n = 3, h = 44 }: { n?: number; h?: number }) => <div className="dsh-sk" aria-busy="true" aria-label="Loading">{Array.from({ length: n }, (_, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>;

/** A segmented control (chips 36px; 44px on phones). */
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return <div className="dsh-seg" role="group" aria-label={label}>{options.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

/** Width of an element that may mount later than its component (a chart behind a loading state): a callback ref, so the observer attaches whenever it appears. */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [w, setW] = useState(900);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect(); ro.current = null;
    if (!el) return;
    setW(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    if (typeof ResizeObserver === "undefined") return;
    ro.current = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.current.observe(el);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, w];
}

/** True under 760px (the phone layout: three tabs, shorter lists). */
export function useIsPhone(): boolean {
  const q = "(max-width: 759px)";
  const [p, setP] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(q), f = () => setP(m.matches);
    f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f);
  }, []);
  return p;
}

export const tone = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.005 ? "" : v > 0 ? "up" : "down");

/** "Market" (every company) or "My stocks" for the results and filings blocks. Task #316: one "From" choice for the whole Results and news section, kept on the account. */
export type Scope = "market" | "mine";
export function useScope(_id: string, hasStocks: boolean): [Scope, (s: Scope) => void] {
  const [ui, set] = useDashUi();
  return [hasStocks ? ui.who : "market", (s: Scope) => set({ who: s })];
}

/** The first `limit` items of a list, with a toggle for the rest. `resetKey` (a tab, say) closes the list again when it changes. */
export function useShowMore<T>(items: readonly T[], limit = 5, resetKey?: unknown) {
  const [own, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [resetKey]);
  const xp = useExpanded();   // folded lists are open in the expanded view (task #316)
  const open = own || xp;
  const extra = xp ? 0 : Math.max(0, items.length - limit);
  return { visible: open || extra === 0 ? items : items.slice(0, limit), extra, open, toggle: () => setOpen((v) => !v) };
}
export type ShowMore = ReturnType<typeof useShowMore>;

/** "Show 2 more stocks" (or, given `total`, "Show all 18 investments", task #195) / "Show fewer" under a list; nothing when nothing is hidden. */
export function ShowMoreButton({ more, noun, plural, controls, total }: { more: Pick<ShowMore, "extra" | "open" | "toggle">; noun: string; plural?: string; controls?: string; total?: number }) {
  if (!more.extra) return null;
  const label = more.open ? "Show fewer" : total != null ? `Show all ${total} ${total === 1 ? noun : plural ?? noun + "s"}` : `Show ${more.extra} more ${more.extra === 1 ? noun : plural ?? noun + "s"}`;
  return (
    <button type="button" className="dsh-more" aria-expanded={more.open} aria-controls={controls} onClick={more.toggle}>
      <span>{label}</span>
      <svg className={more.open ? "up" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );
}
