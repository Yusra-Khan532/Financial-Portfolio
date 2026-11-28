// Task #448 (developer file 42, 03 §4): a long table's header row stays in view just under whatever is stuck at the top of the page (the site header,
// the step bar, a box's own tab bar). The table sits in a sideways-scrolling box, where `position: sticky` cannot reach the page, so the real <thead>
// is moved down with a transform while the table passes under the bars: its widths, sort state, columns and opened rows are the header's own, and
// sideways scrolling moves it with the body. A header of a list opened inside the table (data-inner) takes over while that list passes.
import { useEffect, type RefObject } from "react";

/** The bottom edge of what is stuck at the top of the page now: fixed or sticky bars whose top sits near the top of the window. */
export function stuckBottom(): number {
  let low = 0;
  for (const el of document.querySelectorAll<HTMLElement>("header, .sx-stepbar, .sx-full .sx-bar, [data-stuck]")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top < 160 && r.bottom > low && r.bottom < window.innerHeight / 2) low = r.bottom;
  }
  return low;
}

/** How far a header must move down so it sits just under `top`, kept inside its table (0 when the table's head is still in view). */
export function pinOffset(headTop: number, headHeight: number, tableBottom: number, top: number): number {
  if (headTop >= top) return 0;
  return Math.max(0, Math.min(top - headTop, tableBottom - headTop - headHeight));
}

export function usePinnedHead(table: RefObject<HTMLTableElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const t = table.current;
    if (!t || typeof window === "undefined") return;
    let raf = 0;
    const place = () => {
      raf = 0;
      const top = stuckBottom();
      const heads = [...t.querySelectorAll<HTMLTableSectionElement>("thead")];
      const own = heads.find((x) => x.closest("table") === t);
      const band = own ? own.getBoundingClientRect().height : 0;
      let innerOn = false;
      for (const h of heads.filter((x) => x !== own)) {                      // an opened list takes over while it passes the pinned band
        h.style.transform = "";
        const box = h.closest("table")!.getBoundingClientRect(), hr = h.getBoundingClientRect();
        const passing = box.top < top + band && box.bottom > top + hr.height;
        const off = passing ? Math.max(0, Math.min(top - hr.top, box.bottom - hr.top - hr.height)) : 0;
        h.style.transform = off ? `translateY(${off}px)` : "";
        h.classList.toggle("sx-pinned", passing);
        if (passing) innerOn = true;
      }
      if (!own) return;
      own.style.transform = "";
      const hr = own.getBoundingClientRect(), off = pinOffset(hr.top, hr.height, t.getBoundingClientRect().bottom, top);
      own.style.transform = off ? `translateY(${off}px)` : "";
      own.classList.toggle("sx-pinned", off > 0);
      own.style.visibility = innerOn && off > 0 ? "hidden" : "";
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(place); };
    place();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => { window.removeEventListener("scroll", ask); window.removeEventListener("resize", ask); if (raf) cancelAnimationFrame(raf);
      t.querySelectorAll<HTMLTableSectionElement>("thead").forEach((h) => { h.style.transform = ""; h.style.visibility = ""; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, ...deps]);
}
