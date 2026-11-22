import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Task #310 part E (the 22 Nov pack, 05-phone.md, fix 6): on a phone a long page opens on tap. Under 860px each wrapped section is a closed row showing
 *  its name and one line of summary; a tap opens it, and opening one does not close the others. Which sections are open is remembered for the session
 *  (sessionStorage, per page). From 861px up nothing changes: the section is drawn as it always was, with no wrapper.
 *  A jump to something inside a closed section (the section bar, a "see section" link) opens it first: dispatch REVEAL on the target (revealFold). */
export const PHONE_Q = "(max-width: 860px)";
export const REVEAL = "finlit:reveal";
/** A long list on a phone shows this many rows, then a Show all button (05-phone.md, fix 6). */
export const PHONE_ROWS = 5;

/** Opens the closed section that holds `el`, if any; the caller then scrolls once it is drawn. */
export const revealFold = (el: Element | null) => { el?.dispatchEvent(new CustomEvent(REVEAL, { bubbles: true })); };
/** Where a section is on screen: its closed row while it is closed (its own heading is hidden then and has no position), otherwise itself.
 *  The section bars read this to mark the section in view. */
export const foldAnchor = <T extends Element>(el: T | null): Element | null => el?.closest(".pfold:not(.is-open)")?.querySelector(".pfold-row") ?? el;
/** A section bar's jump: open the closed section that holds the target, then scroll to it once it is drawn. */
export const revealAndScroll = (el: Element | null, scroll: (el: Element) => void) => {
  if (!el) return;
  const shut = !!el.closest(".pfold:not(.is-open)");
  revealFold(el);
  if (shut) requestAnimationFrame(() => requestAnimationFrame(() => scroll(el))); else scroll(el);
};

export function useIsPhone(): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(PHONE_Q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(PHONE_Q), f = () => setOn(m.matches);
    f(); m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return on;
}

const KEY = (page: string) => "finlit:fold:" + page;
const readOpen = (page: string): string[] => { try { const v = JSON.parse(sessionStorage.getItem(KEY(page)) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
const writeOpen = (page: string, id: string, open: boolean) => {
  try { const cur = new Set(readOpen(page)); if (open) cur.add(id); else cur.delete(id); sessionStorage.setItem(KEY(page), JSON.stringify([...cur])); } catch { /* private window: the choice lasts for this view only */ }
};

export function PhoneFold({ page, id, title, line, startOpen = false, children }: { page: string; id: string; title: string; line: string; startOpen?: boolean; children: ReactNode }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(() => startOpen || readOpen(page).includes(id));
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();
  const set = (v: boolean) => { setOpen(v); writeOpen(page, id, v); };
  useEffect(() => {
    const el = box.current; if (!el) return;
    const r = () => { if (!open) set(true); };
    el.addEventListener(REVEAL, r);
    return () => el.removeEventListener(REVEAL, r);
  });   // eslint-disable-line react-hooks/exhaustive-deps
  if (!phone) return <>{children}</>;
  return (
    <div ref={box} className={"pfold" + (open ? " is-open" : "")} data-fold={id}>
      <button type="button" className="pfold-row" aria-expanded={open} aria-controls={uid} onClick={() => set(!open)}>
        <span className="pfold-t"><b>{title}</b><small>{line}</small></span><span className="pfold-i" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div id={uid} className="pfold-b" hidden={!open}>{children}</div>
    </div>
  );
}
