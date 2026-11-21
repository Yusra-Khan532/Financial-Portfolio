// Task #292 (portfolio focus pack of 21 Nov 2026): a dialog's focus handling runs ONCE, when it opens. The dialogs had an effect with [onClose] in its
// dependencies; the pages pass an inline onClose (a new function on every render), so each key typed into Quantity or Price re-rendered the page, re-ran
// the effect and moved the cursor to the first field (Date bought of buy 1), where the next keys were saved ("changes are saved as you type").
// Here the newest onClose is read through a ref, so a re-render never moves the focus. Escape closes, Tab stays inside, and the focus goes back to the
// button that opened the dialog when it closes.
import { useEffect, useRef, type RefObject } from "react";

export type DialogFocusOptions = {
  /** what gets the focus when the dialog opens (a selector inside the dialog); null: leave it where it is */
  first?: string | null;
  /** keep Tab inside the dialog (default true) */
  trap?: boolean;
  /** give the focus back to the opener when the dialog closes (default true) */
  restore?: boolean;
  /** leave an Escape another control already handled (a menu inside the dialog) */
  skipHandledEscape?: boolean;
};

export function useDialogFocus(box: RefObject<HTMLElement | null>, onClose: () => void, opts: DialogFocusOptions = {}) {
  const close = useRef(onClose);
  close.current = onClose;                       // always the newest, without re-running the effect below
  const o = useRef(opts);
  useEffect(() => {
    const { first = "input, select, button.go", trap = true, restore = true, skipHandledEscape = false } = o.current;
    const opener = document.activeElement as HTMLElement | null;
    // the first field can arrive a frame later (a dialog that adds its first empty row as it opens): try for two frames, then the first field there is
    let raf = 0, tries = 0;
    const focusFirst = () => {
      if (!first || !box.current) return;
      const el = box.current.querySelector<HTMLElement>(first) ?? (tries >= 2 ? box.current.querySelector<HTMLElement>("input, select, button.go, button") : null);
      if (el) el.focus();
      else if (tries++ < 2) raf = requestAnimationFrame(focusFirst);
    };
    focusFirst();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (skipHandledEscape && e.defaultPrevented) return;
        e.preventDefault(); close.current(); return;
      }
      if (!trap || e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>("button, input, select, textarea")].filter((x) => !x.hasAttribute("disabled"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("keydown", key); if (restore) opener?.focus?.(); };
  }, [box]);                                     // once per opening (the box ref never changes)
}
