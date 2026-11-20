// Task #265 (20 Nov 2026, the team: "i button doesnt work until clicked", the Discover filters' i buttons): the site's own i (components/Info.tsx)
// opens on hover and on keyboard focus, but the i buttons built for the Discover page, the screens and the company header's Discover themes opened only
// on a click. This hook gives them the same behaviour: a mouse over the i (or the keyboard reaching it) opens its note; leaving closes it after a
// moment unless the pointer is over the note (so a long note can be read and scrolled); a click or a tap pins the note open; a second click closes it.
import { useEffect, useRef } from "react";
import type { FocusEvent, PointerEvent } from "react";

export const CLOSE_DELAY = 160;
const keyboardFocus = (el: HTMLElement) => { try { return el.matches(":focus-visible"); } catch { return false; } };

export function useHoverOpen(open: boolean, doOpen: () => void, doClose: () => void) {
  const timer = useRef(0), pinned = useRef(false), hovered = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (!open) { pinned.current = false; hovered.current = false; } }, [open]);
  const cancel = () => window.clearTimeout(timer.current);
  const later = () => { cancel(); timer.current = window.setTimeout(() => { if (!pinned.current) doClose(); }, CLOSE_DELAY); };
  const show = () => { cancel(); if (!open) { hovered.current = true; doOpen(); } };
  return {
    /** On the i button. */
    trigger: {
      onPointerEnter: (e: PointerEvent) => { if (e.pointerType === "mouse") show(); },
      onPointerLeave: (e: PointerEvent) => { if (e.pointerType === "mouse" && !pinned.current) later(); },
      onFocus: (e: FocusEvent<HTMLElement>) => { if (keyboardFocus(e.currentTarget)) show(); },   // the keyboard, not a click
      onBlur: () => { if (!pinned.current) later(); },
    },
    /** On the note: the pointer may move into it without closing it. */
    note: {
      onPointerEnter: cancel,
      onPointerLeave: (e: PointerEvent) => { if (e.pointerType === "mouse" && !pinned.current) later(); },
    },
    /** The i's click: a note the hover (or the keyboard) opened is pinned open; otherwise `toggle` runs (open, or close a pinned one). */
    click: (toggle: () => void) => {
      cancel();
      if (open && hovered.current && !pinned.current) { pinned.current = true; hovered.current = false; return; }
      if (!open) pinned.current = true;          // opened by a click or a tap: it stays until a second click, Escape or a click outside
      toggle();
    },
  };
}
