// Task #315: "Word of the Day" in the site header (the team's picture 1): a green button with a book icon, and a gold dot until today's word is
// opened. It opens the panel of picture 2 (WordOfDayPanel), which loads the glossary only when it opens. Free on every plan and for visitors.
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** The header row is full at most desktop widths (the menus, Ask FinLit AI, search, theme, the bell, the account, and the admin's controls).
 *  The words "Word of the Day" show while they fit; when they would push the row past its edge, the button keeps only its book icon (as on a
 *  phone), and the words come back once there is room again. Measured, not guessed, so it holds for visitors, members and admins alike. */
function useFits(btn: React.RefObject<HTMLButtonElement | null>) {
  const [compact, setCompact] = useState(false);
  const full = useRef(0);
  useLayoutEffect(() => {
    const b = btn.current, wrap = b?.parentElement;
    if (!b || !wrap || typeof ResizeObserver === "undefined") return;
    const grows = [...wrap.querySelectorAll<HTMLElement>(":scope > .grow")];   // one spacer, or two on a tool page (task #310 D: the search centred between them)
    const search = wrap.querySelector<HTMLElement>(":scope > .search");
    const check = () => {
      if (matchMedia("(max-width: 759px)").matches) { setCompact(false); return; }   // a phone: icon only by the style sheet
      const free = grows.reduce((n, g) => n + g.offsetWidth - (parseFloat(getComputedStyle(g).minWidth) || 0), 0);
      // The search box stretches into spare room (flex 0 1 280px): what it holds beyond its own words is room too, and words cut short mean too little.
      const t = search?.querySelector<HTMLElement>(".t");
      const shown = !!(search && t && t.offsetWidth > 0);
      const cut = shown && t!.scrollWidth > t!.clientWidth + 1;
      const slack = shown ? Math.max(0, search!.getBoundingClientRect().right - t!.getBoundingClientRect().left - t!.scrollWidth - (parseFloat(getComputedStyle(search!).paddingRight) || 0)) : 0;
      setCompact((c) => {
        if (!c) { full.current = b.offsetWidth; return wrap.scrollWidth > wrap.clientWidth + 1 || cut || (free < 1 && slack < 1); }
        return free + slack < Math.max(0, full.current - b.offsetWidth) + 12;   // back to the words only with room to spare, so it never flickers
      });
    };
    const ro = new ResizeObserver(check);
    ro.observe(wrap); grows.forEach((g) => ro.observe(g)); if (search) ro.observe(search);
    check();
    return () => ro.disconnect();
  }, [btn]);
  return compact;
}

export function WordOfDayButton() {
  const p = usePrefs();
  const today = useIstDate();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const compact = useFits(btn);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  const fresh = p.wordSeen !== today;
  const close = () => { setOpen(false); btn.current?.focus(); };
  return (
    <>
      <button ref={btn} type="button" className={buttonClass("primary", "md", compact ? "wod-top is-compact" : "wod-top")} aria-label="Word of the Day" title={compact ? "Word of the Day" : undefined}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (open) { close(); return; } markWordSeen(); setOpen(true); }}>
        <Icon name="book" /><span className="wod-top-t">Word of the Day</span>{fresh && <i className="wod-dot" aria-hidden="true" data-testid="wod-dot" />}
      </button>
      {open && <Suspense fallback={null}><Panel anchor={btn} onClose={close} /></Suspense>}
    </>
  );
}
