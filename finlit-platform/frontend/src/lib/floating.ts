/**
 * Placement for floating tips and popovers (InfoTip, ChartHelp, glossary pop).
 * Tries below, above, right, left of the anchor; keeps the box inside the viewport; prefers a side where it does
 * not cover another control (a button, link or field), and as a last resort takes the side with the least overlap.
 */
export type Placement = { left: number; top: number; side: "below" | "above" | "right" | "left"; maxH: number };

const EDGE = 8, GAP = 8;
const CONTROLS = "button, a[href], input, select, textarea, summary, [role=button], [role=tab]";

type Box = { left: number; top: number; right: number; bottom: number };
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** Total area of visible controls (other than the anchor and the box itself) the box would sit on. Controls inside `own` (the field the anchor explains)
 *  count `ownWeight` times, so the box keeps off the input it is about when another side is free. */
function coverage(box: Box, skip: Element[], own: Element | null = null, ownWeight = 1): number {
  let sum = 0;
  document.querySelectorAll(CONTROLS).forEach((el) => {
    if (skip.some((s) => s === el || s.contains(el) || el.contains(s))) return;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    sum += overlap(box, r) * (own && own.contains(el) ? ownWeight : 1);
  });
  return sum;
}

/** Options for placeFloating. `whole` (task #418): a side where the whole box fits always wins over a side where it would be cut to a scrolling strip, even
 *  when it sits on another control; `own` is the field the anchor explains, kept clear first. */
export type PlaceOpts = { whole?: boolean; own?: Element | null };
/** Task #418: the field an (i) explains: the label, or the calculator field (.dcx-f on DCF, .rv-f on Reverse valuation) round it. */
export const ownField = (anchor: Element): Element | null => anchor.closest(".dcx-f, .rv-f, label");

export function placeFloating(anchor: HTMLElement, pop: HTMLElement, opts: PlaceOpts = {}): Placement {
  const a = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const w = Math.min(pop.offsetWidth, vw - EDGE * 2), h = pop.offsetHeight;
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - w - EDGE));
  const clampY = (y: number, hh: number) => Math.max(EDGE, Math.min(y, vh - hh - EDGE));
  // Above or below, a box that explains a field lines up with the field's left edge (task #418), so it reads as part of that field; otherwise it is centred on the anchor.
  const cx = opts.own ? opts.own.getBoundingClientRect().left : a.left + a.width / 2 - w / 2, cy = a.top + a.height / 2;
  const room = { below: vh - a.bottom - GAP - EDGE, above: a.top - GAP - EDGE, right: vw - a.right - GAP - EDGE, left: a.left - GAP - EDGE };
  const cands = (["below", "above", "right", "left"] as const).map((side) => {
    const vertical = side === "below" || side === "above";
    const hh = vertical ? Math.min(h, Math.max(room[side], 120)) : Math.min(h, vh - EDGE * 2);
    const left = vertical ? clampX(cx) : side === "right" ? Math.min(a.right + GAP, vw - w - EDGE) : Math.max(EDGE, a.left - GAP - w);
    const top = side === "below" ? Math.min(a.bottom + GAP, vh - hh - EDGE) : side === "above" ? Math.max(EDGE, a.top - GAP - hh) : clampY(cy - hh / 2, hh);
    const box = { left, top, right: left + w, bottom: top + hh };
    const onAnchor = overlap(box, a) > 0 ? 1e7 : 0;                                  // a side with no room lands on the anchor itself
    const clipped = vertical ? Math.max(0, h - room[side]) : Math.max(0, w - room[side]);
    const squeezed = opts.whole                                                        // content that would be clipped; with `whole`, worse than covering any control
      ? (clipped + (vertical ? 0 : Math.max(0, h - (vh - EDGE * 2)))) * 1e5
      : clipped * 40;
    return { side, left, top, maxH: hh, cost: coverage(box, [anchor, pop], opts.own ?? null, opts.own ? 4 : 1) + onAnchor + squeezed };
  });
  cands.sort((x, y) => x.cost - y.cost);
  const best = cands[0];
  return { left: best.left, top: best.top, side: best.side, maxH: best.maxH };
}
