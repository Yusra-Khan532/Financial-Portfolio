// Task #315: "Word of the Day" in the site header (the team's picture 1): a green button with a book icon, and a gold dot until today's word is
// opened. It opens the panel of picture 2 (WordOfDayPanel), which loads the glossary only when it opens. Free on every plan and for visitors.
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { buttonClass } from "./ui";
import { Icon } from "../lib/icons";
import { usePrefs } from "../lib/prefs";
import { istDate, markWordSeen } from "../lib/wordOfDay";
import "../styles/word-of-day.css";

const Panel = lazy(() => import("./WordOfDayPanel"));

/** The India date, refreshed each minute, so the dot comes back at midnight IST on a page left open. */
function useIstDate() {
  const [d, setD] = useState(() => istDate());
  useEffect(() => { const t = window.setInterval(() => setD(istDate()), 60_000); return () => clearInterval(t); }, []);
  return d;
}

/** Where the book goes: 0 the words, 1 the book alone, 2 the book with the row tightened (as on a phone: 40px, 2px gaps, spacers closed),
 *  3 out of the row and first in the "More" menu. Only a page with the seven menus can reach 3, in the band just above 1180px where they come
 *  back; the row is then exactly as it is without the book, so the book never adds overflow that the page did not have. */
export type WodLevel = 0 | 1 | 2 | 3;

// The "More" menu reads whether the book is in it, and opens the panel through this event.
let inMenu = false;
const menuSubs = new Set<() => void>();
const setInMenu = (v: boolean) => { if (inMenu !== v) { inMenu = v; menuSubs.forEach((f) => f()); } };
export const useWodInMenu = () => useSyncExternalStore((f) => { menuSubs.add(f); return () => { menuSubs.delete(f); }; }, () => inMenu, () => false);
export const OPEN_WOD = "finlit:open-wod";

/** Measured, not guessed: after each render the row is checked, and while the book pushes it past its edge, cuts the search words short or
 *  squeezes a neighbour, it steps one level on. A new window width, page or sign-in starts again from the words. Layout effects run before
 *  paint, so the steps never show. */
function useLevel(btn: React.RefObject<HTMLButtonElement | null>, resetKey: string): WodLevel {
  const [level, setLevel] = useState<WodLevel>(0);
  const [width, setWidth] = useState(0);
  const [, setTick] = useState(0);
  const wrapRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const wrap = btn.current?.parentElement;
    wrapRef.current = wrap ?? null;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { setWidth(wrap.clientWidth); setTick((n) => n + 1); });
    ro.observe(wrap);
    wrap.querySelectorAll<HTMLElement>(":scope > .grow, :scope > .search").forEach((e) => ro.observe(e));
    document.fonts?.ready.then(() => setWidth(-1)).catch(() => undefined);   // the words' width changes once the web font is in
    return () => ro.disconnect();
  }, [btn, resetKey]);
  useLayoutEffect(() => { setLevel(0); }, [width, resetKey]);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined" || level === 3) return;
    if (matchMedia("(max-width: 860px)").matches) { if (level !== 0) setLevel(0); return; }   // a phone (task #310 part E: under 860px): the style sheet does it (word-of-day.css, phone310.css)
    const grows = [...wrap.querySelectorAll<HTMLElement>(":scope > .grow")];   // one spacer, or two on a tool page (task #310 D: the search centred between them)
    const free = grows.reduce((n, g) => n + g.offsetWidth - (parseFloat(getComputedStyle(g).minWidth) || 0), 0);
    // The search box stretches into spare room (flex 0 1 280px): what it holds beyond its own words is room too, and words cut short mean too little.
    const search = wrap.querySelector<HTMLElement>(":scope > .search"), t = search?.querySelector<HTMLElement>(".t");
    const shown = !!(search && t && t.offsetWidth > 0);
    const cut = shown && t!.scrollWidth > t!.clientWidth + 1;
    const slack = shown ? Math.max(0, search!.getBoundingClientRect().right - t!.getBoundingClientRect().left - t!.scrollWidth - (parseFloat(getComputedStyle(search!).paddingRight) || 0)) : 0;
    const tight = wrap.scrollWidth > wrap.clientWidth + 1 || cut || (free < 1 && slack < 1);
    const max: WodLevel = wrap.querySelector(":scope > .topnav") ? 3 : 2;   // only a page with the "More" menu can take the book out of the row
    if (tight && level < max) setLevel((level + 1) as WodLevel);
  });
  useEffect(() => { setInMenu(level === 3); }, [level]);
  useEffect(() => () => setInMenu(false), []);
  return level;
}

export function WordOfDayButton({ resetKey = "" }: { resetKey?: string }) {
  const p = usePrefs();
  const today = useIstDate();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const loc = useLocation();
  const level = useLevel(btn, resetKey + "|" + loc.pathname);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => { const o = () => { markWordSeen(); setOpen(true); }; addEventListener(OPEN_WOD, o); return () => removeEventListener(OPEN_WOD, o); }, []);
  const fresh = p.wordSeen !== today;
  const close = () => { setOpen(false); if (btn.current && !btn.current.classList.contains("is-menu")) btn.current.focus(); };   // out of the row: focus stays where the menu left it
  const cls = ["wod-top", level >= 1 && "is-compact", level >= 2 && "is-tight", level === 3 && "is-menu"].filter(Boolean).join(" ");
  return (
    <>
      <button ref={btn} type="button" className={buttonClass("primary", "md", cls)} aria-label="Word of the Day" title={level ? "Word of the Day" : undefined}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (open) { close(); return; } markWordSeen(); setOpen(true); }}>
        <Icon name="book" /><span className="wod-top-t">Word of the Day</span>{fresh && <i className="wod-dot" aria-hidden="true" data-testid="wod-dot" />}
      </button>
      {open && <Suspense fallback={null}><Panel anchor={btn} onClose={close} /></Suspense>}
    </>
  );
}

/** The "More" menu's first item while the book is out of the row (level 3): the same panel. */
export function WordOfDayMenuItem({ onPick }: { onPick: () => void }) {
  const p = usePrefs();
  const fresh = p.wordSeen !== useIstDate();
  return (
    <div className="ddr wod-mi">
      <button type="button" role="menuitem" aria-haspopup="dialog" onClick={() => { onPick(); dispatchEvent(new Event(OPEN_WOD)); }}>
        <span className="ddi"><Icon name="book" /></span><span><b>Word of the Day{fresh && <em className="wod-mi-new">New today</em>}</b></span>
      </button>
    </div>
  );
}
