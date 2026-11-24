import { useEffect, useRef, useState, type ReactNode } from "react";
import { TableZoom } from "./TableZoom";
import "../styles/frozen.css";

/** A wide table's scroll box with its own controls: ◀ ▶ buttons and a slider, shown only when the table is wider than the space,
 *  so it can be moved sideways without a mouse wheel or trackpad. The slider and the table stay in step both ways. */
/** `controls={false}`: no ◀ ▶ buttons and no slider (the Stock screener, task #64 S-5): the box scrolls with the trackpad or its own scrollbar, and the frozen
 *  first column gets a soft shadow on its edge while there is more to the right (`has-more`). */
/** `pinBelow`: a CSS selector of a sticky bar; the column names stay under it while the page scrolls past the table (task #64, B-1 / V-1). A header inside a
 *  sideways-scrolling box cannot use position: sticky against the page, so it is moved with a transform; the box keeps no inner vertical scroll. */
export function HScroll({ children, className = "", label = "table", tall = false, controls = true, pinBelow, barBottom = false, pinCells = false, zoom = true }: { children: ReactNode; className?: string; label?: string; tall?: boolean; controls?: boolean; pinBelow?: string;
  /** task #385 (Equity, developer file 33): false leaves out the floating enlarge arrow (the page puts its own Enlarge in the tools row) */ zoom?: boolean;
  /** task #274: move each header cell rather than the header group (Chromium draws a moved table header group with the rows faintly showing through) */ pinCells?: boolean;
  /** task #274 (Equity, change 11): the sideways scrollbar sits at the bottom of the screen while the table is on screen */ barBottom?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(0), [pos, setPos] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setMax(Math.max(0, el.scrollWidth - el.clientWidth)); setPos(el.scrollLeft); setScrolled(el.scrollLeft > 1);
      const rows = el.querySelector("table")?.tHead?.rows;     // a table with two header rows (the group names above the columns): the second row sticks under the first
      el.style.setProperty("--hr1", rows && rows.length > 1 ? `${rows[0].offsetHeight}px` : "0px");
      el.style.setProperty("--hr2", rows && rows.length > 2 ? `${rows[1].offsetHeight}px` : "0px");   // task #258 (SHARED §5): a third header row sticks under the real height of the first two
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    const head1 = el.querySelector("table")?.tHead?.rows[0];   // SHARED §5: re-measure when the first header row itself changes height (fonts, wrapping)
    if (head1) ro.observe(head1);
    if (typeof document !== "undefined" && document.fonts?.ready) document.fonts.ready.then(measure).catch(() => undefined);
    // task #259 (pack 03 §1: "when the table re-renders"): a new set of columns replaces the header row; watch the new one and measure again
    const mo = new MutationObserver(() => { const r = el.querySelector("table")?.tHead?.rows?.[0]; if (r) ro.observe(r); measure(); });
    const head = el.querySelector("table")?.tHead;
    if (head) mo.observe(head, { childList: true, subtree: true });
    const onScroll = () => { setPos(el.scrollLeft); setScrolled(el.scrollLeft > 1); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { ro.disconnect(); mo.disconnect(); el.removeEventListener("scroll", onScroll); };
  }, []);
  useEffect(() => {
    if (!pinBelow) return;
    let raf = 0;
    const place = () => {
      raf = 0;
      const el = box.current, head = el?.querySelector("table")?.tHead;
      if (!el || !head) return;
      const bar = document.querySelector(pinBelow);
      const top = bar ? bar.getBoundingClientRect().bottom : 0;
      const r = el.getBoundingClientRect(), hh = head.getBoundingClientRect().height;
      const d = Math.max(0, Math.min(top - r.top, r.height - hh));
      if (pinCells) head.style.setProperty("--pin", `${d}px`); else head.style.transform = d > 0 ? `translateY(${d}px)` : "";
      head.classList.toggle("is-pinned", d > 0);
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(place); };
    window.addEventListener("scroll", ask, { passive: true }); window.addEventListener("resize", ask);
    // task #274: the bar it pins under can change height without a scroll (the Equity filter row grows when it sticks); follow it
    const target = document.querySelector(pinBelow), ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(ask) : null; if (target) ro?.observe(target); ro?.observe(document.body);   // content above that loads late moves the table without a scroll
    place();
    return () => { window.removeEventListener("scroll", ask); window.removeEventListener("resize", ask); ro?.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [pinBelow, pinCells]);
  const go = (to: number) => box.current?.scrollTo({ left: Math.max(0, Math.min(max, to)), behavior: "smooth" });
  const step = () => Math.max(160, (box.current?.clientWidth || 600) * 0.6);
  const bar = (
    controls && max > 4 && (
        <div className="hs-bar" role="group" aria-label={`Scroll the ${label} sideways`}>
          <button type="button" className="hs-btn" aria-label="Scroll left" disabled={pos <= 1} onClick={() => go(pos - step())}>◀</button>
          <span className="hs-end" aria-hidden="true">First column</span>
          <input type="range" className="hs-range" min={0} max={max} value={Math.min(pos, max)} aria-label={`Position in the ${label}`} aria-valuetext={`Scrolled ${Math.round((Math.min(pos, max) / max) * 100)} percent of the way across the ${label}`} title="Drag to move the table sideways"
            onChange={(e) => { const v = Number(e.target.value); if (box.current) box.current.scrollLeft = v; setPos(v); }} />
          <span className="hs-end" aria-hidden="true">Last column</span>
          <output className="hs-now" aria-hidden="true">{Math.round((Math.min(pos, max) / max) * 100)}%</output>
          <button type="button" className="hs-btn" aria-label="Scroll right" disabled={pos >= max - 1} onClick={() => go(pos + step())}>▶</button>
        </div>
      )
  );
  const inner = (<>
      {!barBottom && bar}
      <div ref={box} className={"tw " + className + (tall ? " tw-tall" : "") + (pinBelow ? " tw-pin" : "") + (scrolled ? " is-scrolled" : "") + (max > 4 && pos < max - 1 ? " has-more" : "")}>{children}</div>
      {barBottom && <div className="hs-bottom">{bar}</div>}
    </>);
  return zoom ? <TableZoom label={label.charAt(0).toUpperCase() + label.slice(1)}>{inner}</TableZoom> : inner;
}
