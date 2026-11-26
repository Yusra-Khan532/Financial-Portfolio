// Glossary popovers: an (i) button next to any metric explains what it is, how to read it and the formula.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { placeFloating } from "../lib/floating";
import type { Glossary } from "../lib/api";

type PopState = { g: Glossary; anchor: HTMLElement } | null;
const Ctx = createContext<(g: Glossary | null, anchor?: HTMLElement) => void>(() => {});

export function InfoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PopState>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Task #204: leaving the (i) used to close the popover at once, so the pointer could never reach it to scroll a long explanation. Now a close waits a
  // moment and is cancelled while the pointer is over the popover; it closes when the pointer leaves the popover too.
  const leave = useRef(0), over = useRef(false);
  const show = useCallback((g: Glossary | null, anchor?: HTMLElement) => {
    window.clearTimeout(leave.current);
    if (g && anchor) { setState({ g, anchor }); return; }
    leave.current = window.setTimeout(() => { if (!over.current) setState(null); }, 160);
  }, []);
  const enter = () => { over.current = true; window.clearTimeout(leave.current); };
  const exit = () => { over.current = false; show(null); };
  useEffect(() => () => window.clearTimeout(leave.current), []);
  useEffect(() => { if (!state) over.current = false; }, [state]);

  useEffect(() => {
    if (!state || !ref.current) return;
    const pl = placeFloating(state.anchor, ref.current);
    ref.current.style.left = pl.left + "px"; ref.current.style.top = pl.top + "px"; ref.current.style.maxHeight = pl.maxH + "px"; ref.current.style.overflowY = "auto"; ref.current.style.overscrollBehavior = "contain";   // the wheel scrolls the popover, not the page behind it
  }, [state]);
  useEffect(() => {
    const close = () => { window.clearTimeout(leave.current); setState(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    addEventListener("scroll", close, { passive: true });
    addEventListener("keydown", key);
    return () => { removeEventListener("scroll", close); removeEventListener("keydown", key); };
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
  // Task #396: on a phone a tap opened the note and the browser's emulated "mouse leave" right after it closed it again, so a tap never showed it.
  // A touch press now keeps it open; it closes on a tap elsewhere (blur), on scroll and on Esc, as before.
  const touch = useRef(false);
  if (!g || !g.what) return null;
  return (
    <button className="info" aria-label={`What is ${g.label}?`}
      onPointerDown={(e) => { touch.current = e.pointerType === "touch"; }}
      onMouseEnter={(e) => show(g, e.currentTarget)} onMouseLeave={() => { if (!touch.current) show(null); }}
      onFocus={(e) => show(g, e.currentTarget)} onBlur={() => show(null)}
      onClick={(e) => { e.stopPropagation(); show(g, e.currentTarget); }}>i</button>
  );
}
