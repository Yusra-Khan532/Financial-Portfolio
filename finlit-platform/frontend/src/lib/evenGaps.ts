// Task #448 (developer file 42, 03 §1): the same gap between every pair of columns. Each column is as wide as its widest content on one line; the room
// left over is shared out as one equal gap (half on each side of a cell, 16 px at the table's edges), up to 128 px, and what is left after that goes to the
// name column. A tight table uses a 28 px gap (8 or more columns) or 36 px (fewer) and lets names and sentences wrap. Worked out before the browser paints
// (a mutation observer runs at the end of the task that changed the table), so nothing jumps. Phone cards (620 px and below) are left alone.
// Styles: styles/pulse448.css (.sx-even, .sx-measure).
import { useEffect, type RefObject } from "react";

export const MAX_GAP = 128, EDGE = 16;
/** The gap for a table: `room` is the box's width, `natural` the sum of the columns' one-line widths, `n` the number of columns. */
export function evenGap(room: number, natural: number, n: number): { gap: number; tight: boolean } {
  if (n < 2) return { gap: 0, tight: false };
  const free = room - natural - 2 * EDGE, gap = free / (n - 1);
  if (gap >= 20) return { gap: Math.min(MAX_GAP, Math.floor(gap)), tight: false };   // everything fits on one line with at least 20 px between columns
  return { gap: n >= 8 ? 28 : 36, tight: true };
}

function headRow(t: HTMLTableElement): HTMLTableCellElement[] {
  const rows = [...(t.tHead?.rows ?? [])];
  const last = rows[rows.length - 1];
  return last ? [...last.cells].filter((c) => c.getBoundingClientRect().width > 0) : [];
}

export function evenTable(t: HTMLTableElement) {
  const box = t.parentElement;
  if (!box || t.closest(".sp-xrow")) return;                                  // an opened list follows its row's table
  if (window.matchMedia?.("(max-width: 620px)").matches && t.classList.contains("sx-incards")) { t.classList.remove("sx-even"); return; }
  const cells = headRow(t);
  if (cells.length < 2) return;
  cells.forEach((c) => c.classList.toggle("sx-nb", /^\d/.test((c.textContent ?? "").trim())));   // "6 months", "26 weeks": a header starting with a number never breaks
  t.classList.add("sx-measure");
  cells.forEach((c) => { c.style.width = ""; });
  const widths = cells.map((c) => c.getBoundingClientRect().width), natural = widths.reduce((a, b) => a + b, 0);
  t.classList.remove("sx-measure");
  const room = box.clientWidth, n = cells.length;
  let { gap, tight } = evenGap(room, natural, n);
  t.classList.add("sx-even");
  t.classList.toggle("sx-tight", tight);
  t.style.setProperty("--sx-gap", `${gap}px`);
  if (!tight) {
    // every column at its one-line width; the room left after the gaps (above 128 px) goes to the last column, so the browser shares nothing out
    const left = Math.max(0, room - natural - 2 * EDGE - gap * (n - 1));
    const border = getComputedStyle(cells[0]).boxSizing === "border-box";     // the site sizes cells border-box: the width then includes the padding
    const to = getComputedStyle(cells[n - 1]).textAlign === "right" ? 0 : n - 1;   // a text last column takes the rest; under a number column it goes to the name (03 §1.3)
    cells.forEach((c, k) => {
      const pad = border ? (k === 0 ? EDGE : gap / 2) + (k === n - 1 ? EDGE : gap / 2) : 0;
      c.style.width = `${Math.ceil(widths[k] + pad) + (k === to ? Math.floor(left) : 0)}px`;
    });
  } else {
    // 03 §1.4-5: names and sentences wrap, headers take two lines, the gap goes down to 20 px; if it still cannot fit, it scrolls at 24 px
    if (t.scrollWidth > box.clientWidth + 1) { gap = 20; t.style.setProperty("--sx-gap", "20px"); }
    if (t.scrollWidth > box.clientWidth + 1) { gap = 24; t.style.setProperty("--sx-gap", "24px"); t.classList.add("sx-scrolls"); } else t.classList.remove("sx-scrolls");
  }
}

/** Keeps every `table.sp-tb` inside `root` evenly spaced as its rows and the window change. */
export function useEvenGaps(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof MutationObserver === "undefined" || /jsdom/i.test(navigator.userAgent)) return;
    let queued = false;
    const pass = () => { queued = false; el.querySelectorAll<HTMLTableElement>("table.sp-tb").forEach(evenTable); };
    const ask = () => { if (!queued) { queued = true; queueMicrotask(pass); } };
    const mo = new MutationObserver(ask);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(ask) : null;
    ro?.observe(el);
    document.fonts?.ready.then(ask).catch(() => undefined);
    pass();
    return () => { mo.disconnect(); ro?.disconnect(); };
  }, [root]);
}
