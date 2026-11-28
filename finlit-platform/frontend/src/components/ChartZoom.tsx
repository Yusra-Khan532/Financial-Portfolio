import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../lib/focusTrap";

/** One enlarge arrow for every real chart.
 *  <ChartZoom label="Revenue">…chart…</ChartZoom> puts a 36px arrow (44px tap area on phones) in the top-right corner of the card that holds the chart (see findBox), or of the chart itself when its card holds several.
 *  It opens the same chart, not a copy, in a full-viewport dialog: the chart's own state (range toggles, hover, selection) carries over and the chart redraws at the big size.
 *  Esc, the Restore button and a click on the dimmed page all close it, and focus returns to the arrow.
 *  Charts nested inside another ChartZoom (a card that already has the arrow) render as plain children, so one chart never gets two arrows. */
type Zoom = { inside: boolean; zoomed: boolean };
const Ctx = createContext<Zoom>({ inside: false, zoomed: false });

/** True while the chart is drawn in the enlarged dialog (charts with a fixed height can grow). */
export const useChartZoomed = () => useContext(Ctx).zoomed;

/** For a chart drawn at a fixed pixel height (task #167: in the enlarged dialog such charts kept their small height, leaving the lower half of the
 *  screen empty). Put `ref` on the box that holds the drawing (the svg's own wrapper) and draw at the returned height: `base` in the page; in the
 *  dialog, the room the dialog has left once the chart's title, buttons, legend and notes are counted, so the chart fills the screen. Never smaller than `base`.
 *  It watches the box itself rather than the zoom context, so it also works for a chart that renders its own <ChartZoom> around it. */
export function useZoomHeight<T extends Element = HTMLDivElement>(base: number, target?: React.RefObject<T | null>): [React.RefObject<T | null>, number] {
  const own = useRef<T>(null), ref = target ?? own;   // a chart that already keeps a ref on its svg passes it here
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let watched: HTMLElement | null = null;
    const fit = () => {
      const body = el.closest<HTMLElement>(".cz-body"), host = body?.querySelector<HTMLElement>(".cz-host");
      if (body !== watched) { if (watched) ro.unobserve(watched); watched = body ?? null; if (body) ro.observe(body); }
      if (!body || !host) { setH(0); return; }   // back in the page
      const zoom = parseFloat(getComputedStyle(host).getPropertyValue("zoom")) || 1;   // the dialog's own +/− zoom scales the host
      const others = (host.getBoundingClientRect().height - el.getBoundingClientRect().height) / zoom;   // everything in the dialog but the drawing
      const room = Math.floor(body.clientHeight / zoom - others - 8);
      setH((o) => (Math.abs(o - room) > 2 ? room : o));
    };
    const ro = new ResizeObserver(fit);   // the box changes size when the chart moves into the dialog and back
    ro.observe(el);
    // a drawing that keeps its size in the dialog (a ring of fixed width) never resizes itself, so the host it moves with is watched too
    const host = el.closest(".cz-host"); if (host) ro.observe(host);
    return () => ro.disconnect();
  }, [ref]);
  return [ref, h > base ? h : base];
}

/** For a chart that is handed its pixel width by its page: put `ref` on a full-width box around the chart and draw at `width`.
 *  In the page it is `base`; in the enlarged dialog it is the dialog's width, so the chart redraws at the big size. */
export function useZoomWidth(base: number): [React.RefObject<HTMLDivElement | null>, number] {
  const zoomed = useChartZoomed();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!zoomed || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const n = Math.round(el.getBoundingClientRect().width); setW((o) => (Math.abs(o - n) > 1 ? n : o)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoomed]);
  return [ref, zoomed && w > 280 ? w : base];
}

/** The shared enlarge / restore glyph (also used by the chart builder). */
export function ZoomGlyph({ zoomed = false }: { zoomed?: boolean }) {
  return <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{zoomed
    ? <><polyline points="6,2 6,6 2,6" /><polyline points="10,14 10,10 14,10" /><line x1="6" y1="6" x2="2" y2="2" /><line x1="10" y1="10" x2="14" y2="14" /></>
    : <><polyline points="10,2 14,2 14,6" /><polyline points="6,14 2,14 2,10" /><line x1="14" y1="2" x2="9.5" y2="6.5" /><line x1="2" y1="14" x2="6.5" y2="9.5" /></>}</svg>;
}

/** The box the arrow belongs to: the nearest card-like ancestor (a border or a filled background) that holds this one chart and no other.
 *  The arrow goes to that box's top-right corner, level with its title, so it sits in the same place on every card.
 *  A card with several charts has no single corner, so each chart gets the block that holds it and its own title (the widest ancestor that holds only this chart and little else). */
function findBox(el: HTMLElement): HTMLElement | null {
  let ceil: HTMLElement | null = null;
  for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    if (a.hasAttribute("data-ct-panel")) return null;   // a chart inside a tab group's panel keeps the arrow in its own corner: a box around the group has the tab bar in its corner (task #216)
    const cs = getComputedStyle(a);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderRightWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) > 0 && cs.borderTopStyle !== "none";
    const fill = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
    if (!border && !fill) continue;
    if (a.querySelectorAll(".cz").length === 1) return a;
    ceil = a;
    break;
  }
  const h = el.getBoundingClientRect().height;
  let block: HTMLElement | null = null;
  for (let a = el.parentElement; a && a !== ceil && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    if (a.querySelectorAll(".cz").length !== 1 || a.getBoundingClientRect().height > h + 300) break;
    block = a;
  }
  return block;
}

/** What counts as a chart: a labelled picture (role="img"), a marked bar or heat-map list (data-chart), an SVG that is not an icon, or a canvas. */
const DRAWN = '[role="img"], [data-chart], svg[viewBox]:not([aria-hidden="true"]), canvas';

const subscribeNone = () => () => {};

let locks = 0, savedOverflow = "";
function lockScroll(): () => void {
  if (locks++ === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  return () => { if (--locks === 0) document.body.style.overflow = savedOverflow; };
}

/** Developer file 49 (founder, 27 Nov 2026: "make sure to check everything"): the enlarged view sits at the end of the page, outside the section its
 *  chart or table came from, so every style the company report scopes to its section (section.block …, .ow …, .vh …) missed it: the ratio key lost its
 *  swatches, the shareholding charts showed plain grey buttons, the peer cards and the valuation history's side figures lost their layout, and legend
 *  swatches changed colour. The view now holds the chart inside empty copies of its own ancestors up to its report section: the same tags and classes, no
 *  ids or other attributes, drawn as display: contents (chartzoom.css), so the same rules match and nothing extra is drawn. Outside a report section
 *  (every other page) nothing is copied and the view is as before. */
export function scopeChain(from: HTMLElement | null): { outer: HTMLElement; inner: HTMLElement } | null {
  const sec = from?.closest<HTMLElement>("section.block");
  if (!from || !sec) return null;
  const up: HTMLElement[] = [];
  for (let a: HTMLElement | null = from; a; a = a === sec ? null : a.parentElement) up.push(a);
  let outer: HTMLElement | null = null, inner: HTMLElement | null = null;
  for (const a of up.reverse()) {
    const c = document.createElement(/^(SECTION|ARTICLE|DIV|UL|OL|LI|ASIDE|FIGURE)$/.test(a.tagName) ? a.tagName.toLowerCase() : "div");   // never a link, button or closed details
    if (typeof a.className === "string" && a.className) c.className = a.className;
    c.setAttribute("data-cz-scope", "");
    if (inner) inner.appendChild(c); else outer = c;
    inner = c;
  }
  return outer && inner ? { outer, inner } : null;
}

/** The scale steps of the enlarged view (task #87): 50% to 300%, 100% is the size the page draws it at. */
export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export const zoomStep = (z: number, dir: 1 | -1): number => {
  const i = ZOOM_STEPS.findIndex((x) => Math.abs(x - z) < 0.001);
  const at = i < 0 ? ZOOM_STEPS.findIndex((x) => x >= z) : i;
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, (at < 0 ? ZOOM_STEPS.length - 1 : at) + dir))];
};

/** kind="table" says "table" where the chart wording would be wrong (the arrow's label, the dialog's Restore button). */
export function ChartZoom({ label, children, className = "", kind = "chart" }: { label: string; children: ReactNode; className?: string; kind?: "chart" | "table" }) {
  const parent = useContext(Ctx);
  if (parent.inside) return <>{children}</>;
  return <Zoomable label={label} className={className} kind={kind}>{children}</Zoomable>;
}

function Zoomable({ label, children, className, kind }: { label: string; children: ReactNode; className: string; kind: "chart" | "table" }) {
  const [open, setOpen] = useState(false);
  const [z, setZ] = useState(1);   // the scale in the enlarged view; starts at 100% each time it opens
  const server = useSyncExternalStore(subscribeNone, () => false, () => true);   // true while rendering to a string: no portals there
  const host = useMemo(() => { if (typeof document === "undefined") return null; const d = document.createElement("div"); d.className = "cz-host"; return d; }, []);
  const root = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ t: number; r: number; strip: boolean } | null>(null);   // where the box's top-right corner is, measured from this chart's top-right
  const slot = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), dlg = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  const tid = useId();
  const close = useCallback(() => setOpen(false), []);
  const openIt = () => { setZ(1); setOpen(true); };

  // One live copy of the chart: its DOM moves between the card and the dialog, so its React state is never lost. In the company report it goes into
  // copies of its own ancestors (scopeChain), so the report's section-scoped styles still reach it.
  useLayoutEffect(() => {
    if (!host) return;
    if (open && body.current) {
      const chain = scopeChain(slot.current);
      if (chain) { body.current.appendChild(chain.outer); chain.inner.appendChild(host); }
      else if (host.parentNode !== body.current) body.current.appendChild(host);
    } else if (!open && slot.current && host.parentNode !== slot.current) slot.current.appendChild(host);
  }, [open, host]);
  useEffect(() => () => { host?.remove(); }, [host]);

  // The arrow shows only while there is a drawn chart inside: a loading skeleton or a "not available" note has nothing to enlarge.
  const [has, setHas] = useState(false);
  useLayoutEffect(() => {
    if (!host) return;
    const look = () => setHas(!!host.querySelector(DRAWN));
    look();
    if (typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(look);
    mo.observe(host, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [host]);

  // Task #391 (developer file 41 v4, E4): a box that changes without a resize (a fold opening: the box around the chart is another element once it is
  // open) asks every arrow inside it to find its box again with a "cz-refit" event on that box; nothing sends it on other pages, so they are as before.
  const [refit, setRefit] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const again = () => setRefit((n) => n + 1);
    window.addEventListener("cz-refit", again);
    return () => window.removeEventListener("cz-refit", again);
  }, []);
  // Put the arrow in the corner of the card that holds the chart, and keep it there as the card or the page is resized.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof getComputedStyle === "undefined") return;
    const box = findBox(el);
    if (!box) { setAt(null); return; }
    const kids = Array.from(box.children) as HTMLElement[];
    const head = kids.length > 1 && !kids[0].contains(el) && !kids[0].classList.contains("cz") ? kids[0] : null;   // a title row above the chart: keep it clear of the arrow
    head?.setAttribute("data-cz-head", "");
    const place = () => {
      const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      const t = Math.round(b.top - a.top), r = Math.round(a.right - b.right);
      // No title row above the chart, or the chart itself reaches into the corner (a chart beside the title): leave a strip of its own for the arrow.
      const strip = !head || (a.top - b.top < 52 && b.right - a.right < 52);
      setAt((o) => (o && o.t === t && o.r === r && o.strip === strip ? o : { t, r, strip }));
    };
    place();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    ro?.observe(el); ro?.observe(box);
    window.addEventListener("resize", place);
    return () => { ro?.disconnect(); window.removeEventListener("resize", place); head?.removeAttribute("data-cz-head"); };
  }, [has, refit]);

  useEffect(() => {
    if (!open) return;
    const unlock = lockScroll();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); setZ((v) => zoomStep(v, 1)); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); setZ((v) => zoomStep(v, -1)); }
      else if (e.key === "0") { e.preventDefault(); setZ(1); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); unlock(); };
  }, [open, close]);
  useFocusTrap(dlg, open);

  if (server || !host) return <div className={"cz " + (kind === "table" ? "cz-table " : "") + className}><div className="cz-slot"><div className="cz-host">{children}</div></div></div>;
  return (
    <div ref={root} className={"cz " + (kind === "table" ? "cz-table " : "") + className + (at ? (at.strip ? " cz-boxed cz-strip" : " cz-boxed") : "")}>
      <Ctx.Provider value={{ inside: true, zoomed: open }}>
        <div className="cz-slot" ref={slot} />
        {createPortal(children, host)}
      </Ctx.Provider>
      {(has || open) && <button ref={btn} type="button" className={"cz-btn" + (at ? " cz-at-box" : "")} style={at ? ({ "--cz-dt": `${at.t}px`, "--cz-dr": `${at.r}px` } as React.CSSProperties) : undefined} aria-label={`Enlarge ${kind}: ${label}`} aria-haspopup="dialog" aria-expanded={open} title={`Enlarge ${kind}`} onClick={openIt}><ZoomGlyph /></button>}
      {open && createPortal(
        <>
          <div className="cz-scrim" onClick={close} aria-hidden="true" />
          <div className="cz-modal" role="dialog" aria-modal="true" aria-labelledby={tid} tabIndex={-1} ref={dlg}>
            <div className="cz-bar">
              <h2 id={tid} className="cz-title">{label}</h2>
              <div className="cz-zoom" role="group" aria-label={`Zoom the ${kind}`}>
                <button type="button" className="cz-zb" aria-label="Zoom out" title="Zoom out (-)" disabled={z <= ZOOM_STEPS[0]} onClick={() => setZ((v) => zoomStep(v, -1))}>−</button>
                <output className="cz-zv" aria-live="polite">{Math.round(z * 100)}%</output>
                <button type="button" className="cz-zb" aria-label="Zoom in" title="Zoom in (+)" disabled={z >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => setZ((v) => zoomStep(v, 1))}>+</button>
                <button type="button" className="cz-zb cz-zr" aria-label="Reset zoom to 100%" title="Reset (0)" disabled={z === 1} onClick={() => setZ(1)}>Reset</button>
              </div>
              <button type="button" className="cz-btn cz-restore" aria-label={`Close enlarged ${kind}: ${label}`} title="Close (Esc)" onClick={close}><ZoomGlyph zoomed /><span>Close</span></button>
            </div>
            <div className="cz-body" ref={body} style={{ "--cz-z": z } as React.CSSProperties} />
          </div>
        </>, document.body)}
    </div>
  );
}
