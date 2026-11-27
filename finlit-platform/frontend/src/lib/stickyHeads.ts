// Developer file 47 (founder, 27 Nov 2026: "in tables the header should come down as we scroll down"). Every long table in the company report keeps its
// header row in view under the bars stuck at the top of the page (the site header and the section bar), until its last row leaves.
// CSS `position: sticky` cannot do this: each table sits in a box that scrolls sideways (overflow: auto), and a sticky cell sticks only inside that box.
// So one listener for the page moves each header row down with a transform while its table crosses the top, and puts it back after. Reads first, then writes.
// Styles: styles/report47.css (table.th-float).

/** A table needs a moving header only when it is long: at least this many rows. */
export const MIN_ROWS = 6;

/** The bars that stick at the top of the page: the site header, the phone's tools row under it, and the report's section bar. */
export const TOP_BARS = "header.top, .ma-hub, .secnav";
/** Where the bars stuck at the top end right now: the lowest bottom edge among them; 0 when none is stuck. A bar that has not reached the top yet
 *  (the section bar before the page scrolls past the company's header) starts lower down, so it does not count. */
export function stickyTop(doc: Document = document): number {
  let top = 0;
  for (const el of doc.querySelectorAll<HTMLElement>(TOP_BARS)) {
    const cs = getComputedStyle(el);
    if ((cs.position !== "sticky" && cs.position !== "fixed") || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top < 140 && r.bottom > top) top = r.bottom;
  }
  return top;
}

/** How far the header row moves down: none while the table's top is below the bars; never so far that it covers the last row (`keep` px). */
export function headShift(tableTop: number, tableH: number, headH: number, top: number, keep = 0): number {
  return Math.max(0, Math.min(top - tableTop, tableH - headH - keep));
}

/** The colour behind the header row: its own, else the first coloured box it sits in (a moving row must hide the rows it passes over). */
function bgOf(el: Element | null): string {
  for (let e = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor;
    if (c && c !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(c)) return c;
  }
  return "var(--s1)";
}

/** Starts the moving headers for the tables inside `root`; returns the function that stops them and puts every header back. */
export function installStickyHeads(root: HTMLElement, selector = "section.block table"): () => void {
  const moved = new Map<HTMLTableElement, HTMLElement[]>();   // a table whose header has moved, and the cells given position: relative for it
  let raf = 0;
  const reset = (t: HTMLTableElement) => {
    t.classList.remove("th-float"); t.style.removeProperty("--thy"); t.style.removeProperty("--thf-bg");
    for (const c of moved.get(t) ?? []) c.style.removeProperty("position");
    moved.delete(t);
  };
  const frame = () => {
    raf = 0;
    const top = stickyTop(root.ownerDocument), vh = root.ownerDocument.defaultView?.innerHeight ?? 0;
    const plan: [HTMLTableElement, number][] = [];
    for (const t of root.querySelectorAll<HTMLTableElement>(selector)) {
      const body = t.tBodies[0], head = t.tHead;
      if (!head || !body || body.rows.length < MIN_ROWS) { if (moved.has(t)) plan.push([t, 0]); continue; }
      const r = t.getBoundingClientRect(), hh = head.getBoundingClientRect().height;
      if (!r.height || !hh || r.bottom < top || r.top > vh) { if (moved.has(t)) plan.push([t, 0]); continue; }
      plan.push([t, headShift(r.top, r.height, hh, top, body.rows[body.rows.length - 1].getBoundingClientRect().height)]);
    }
    for (const [t, s] of plan) {
      if (s <= 0) { if (moved.has(t)) reset(t); continue; }
      if (!moved.has(t)) {
        const cells = [...t.tHead!.querySelectorAll<HTMLElement>("th, td")];
        const lift = cells.filter((c) => getComputedStyle(c).position === "static");   // a cell already sticky to the left keeps its own position
        lift.forEach((c) => { c.style.position = "relative"; });
        t.style.setProperty("--thf-bg", bgOf(cells[0] ?? t));
        t.classList.add("th-float");
        moved.set(t, lift);
      }
      t.style.setProperty("--thy", `${Math.round(s)}px`);
    }
  };
  const ask = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener("scroll", ask, { passive: true });
  addEventListener("resize", ask);
  ask();
  return () => {
    removeEventListener("scroll", ask); removeEventListener("resize", ask);
    if (raf) cancelAnimationFrame(raf);
    for (const t of [...moved.keys()]) reset(t);
  };
}
