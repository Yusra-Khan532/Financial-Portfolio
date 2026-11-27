// Glossary popovers: an (i) button next to any metric explains what it is, how to read it and the formula.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ownField, placeFloating } from "../lib/floating";
import type { Glossary } from "../lib/api";

type PopState = { g: Glossary; anchor: HTMLElement } | null;
/** Task #418: the width a long explanation opens at when it would not fit whole beside its (i) at the usual 310px. */
const WIDE = "min(440px, calc(100vw - 32px))";
const Ctx = createContext<(g: Glossary | null, anchor?: HTMLElement, touch?: boolean) => void>(() => {});

export function InfoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PopState>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Task #204: leaving the (i) used to close the popover at once, so the pointer could never reach it to scroll a long explanation. Now a close waits a
  // moment and is cancelled while the pointer is over the popover; it closes when the pointer leaves the popover too.
  const leave = useRef(0), over = useRef(false);
  // Task #398: on a phone a tap opens the explanation and the browser then fires a made-up "mouse leave" and blur, which closed it a moment later. A popover
  // opened by a touch now stays until a tap outside it (or Escape, or a scroll); hover and keyboard behave as before.
  const touched = useRef(false), anchorRef = useRef<HTMLElement | null>(null);
  const show = useCallback((g: Glossary | null, anchor?: HTMLElement, touch?: boolean) => {
    window.clearTimeout(leave.current);
    if (g && anchor) { touched.current = !!touch || (touched.current && anchorRef.current === anchor); anchorRef.current = anchor; setState({ g, anchor }); return; }
    if (touched.current) return;
    leave.current = window.setTimeout(() => { if (!over.current) setState(null); }, 160);
  }, []);
  const enter = () => { over.current = true; window.clearTimeout(leave.current); };
  const exit = () => { over.current = false; show(null); };
  useEffect(() => () => window.clearTimeout(leave.current), []);
  useEffect(() => { if (!state) over.current = false; }, [state]);

  // Task #418: the explanation opens as one whole block, never a short strip with its own scrollbar. The box is measured at its natural size (the last
  // popover's height cap and width are cleared first), then put on a side where all of it fits, keeping off the field it explains; if no side fits at the
  // usual width, it opens wider (so shorter) and is placed again. Only a box taller than the whole window still scrolls inside.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!state || !el) return;
    el.style.maxHeight = ""; el.style.width = "";
    const opts = { whole: true, own: ownField(state.anchor) };
    let pl = placeFloating(state.anchor, el, opts);
    if (pl.maxH < el.offsetHeight - 1 && document.documentElement.clientWidth >= 560) { el.style.width = WIDE; pl = placeFloating(state.anchor, el, opts); }
    el.style.left = pl.left + "px"; el.style.top = pl.top + "px"; el.style.maxHeight = pl.maxH + "px"; el.style.overflowY = "auto"; el.style.overscrollBehavior = "contain";   // the wheel scrolls the popover, not the page behind it
  }, [state]);
  useEffect(() => {
    const close = () => { window.clearTimeout(leave.current); touched.current = false; setState(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const outside = (e: PointerEvent) => { const t = e.target as Node | null; if (touched.current && t && !ref.current?.contains(t) && !anchorRef.current?.contains(t)) close(); };
    addEventListener("scroll", close, { passive: true });
    addEventListener("keydown", key);
    addEventListener("pointerdown", outside, true);
    return () => { removeEventListener("scroll", close); removeEventListener("keydown", key); removeEventListener("pointerdown", outside, true); };
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pop" role="tooltip" ref={ref} hidden={!state} onMouseEnter={enter} onMouseLeave={exit}>
        {state && (<>
          <b>{capFirst(state.g.label)}</b>{state.g.what}
          {state.g.lines && <ul className="pop-lines">{state.g.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          {state.g.read && <div className="hr">{state.g.read}</div>}
          {state.g.formula && <div className="fx">{state.g.formula}</div>}
          {state.g.note && <div className="hr">{state.g.note}</div>}
        </>)}
      </div>
    </Ctx.Provider>
  );
}

/** Task #234: an i button's heading starts with a capital letter ("The Sensitivity tab"). A label may be written to read inside a sentence, as the
 *  button's spoken name "What is the Sensitivity tab?" does, so only the heading is capitalised. */
export const capFirst = (s: string | null | undefined) => (s ? s.charAt(0).toLocaleUpperCase("en-IN") + s.slice(1) : "");

/** Show (or, with null, hide) the shared explanation popover next to any element: for triggers that are not the (i) button, such as a table figure. */
export const useInfoPop = () => useContext(Ctx);

export function Info({ g }: { g?: Glossary | null }) {
  const show = useContext(Ctx);
  const touch = useRef(false);   // task #398: the press that led to this click was a finger, so the popover stays open until a tap outside it
  if (!g || !g.what) return null;
  return (
    <button className="info" aria-label={`What is ${g.label}?`} onPointerDown={(e) => { touch.current = e.pointerType === "touch"; }}
      onMouseEnter={(e) => show(g, e.currentTarget)} onMouseLeave={() => show(null)}
      onFocus={(e) => show(g, e.currentTarget)} onBlur={() => show(null)}
      onClick={(e) => { e.stopPropagation(); show(g, e.currentTarget, touch.current); }}>i</button>
  );
}
