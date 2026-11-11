import { useEffect, useRef, useState, type ReactNode } from "react";
import { TableZoom } from "./TableZoom";

/** A wide table's scroll box with its own controls: ◀ ▶ buttons and a slider, shown only when the table is wider than the space,
 *  so it can be moved sideways without a mouse wheel or trackpad. The slider and the table stay in step both ways. */
export function HScroll({ children, className = "", label = "table" }: { children: ReactNode; className?: string; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(0), [pos, setPos] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => { setMax(Math.max(0, el.scrollWidth - el.clientWidth)); setPos(el.scrollLeft); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    const onScroll = () => setPos(el.scrollLeft);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", onScroll); };
  }, []);
  const go = (to: number) => box.current?.scrollTo({ left: Math.max(0, Math.min(max, to)), behavior: "smooth" });
  const step = () => Math.max(160, (box.current?.clientWidth || 600) * 0.6);
  return (
    <TableZoom label={label.charAt(0).toUpperCase() + label.slice(1)}>
      {max > 4 && (
        <div className="hs-bar" role="group" aria-label={`Scroll the ${label} sideways`}>
          <button type="button" className="hs-btn" aria-label="Scroll left" disabled={pos <= 1} onClick={() => go(pos - step())}>◀</button>
          <span className="hs-end" aria-hidden="true">First column</span>
          <input type="range" className="hs-range" min={0} max={max} value={Math.min(pos, max)} aria-label={`Position in the ${label}`} aria-valuetext={`Scrolled ${Math.round((Math.min(pos, max) / max) * 100)} percent of the way across the ${label}`} title="Drag to move the table sideways"
            onChange={(e) => { const v = Number(e.target.value); if (box.current) box.current.scrollLeft = v; setPos(v); }} />
          <span className="hs-end" aria-hidden="true">Last column</span>
          <output className="hs-now" aria-hidden="true">{Math.round((Math.min(pos, max) / max) * 100)}%</output>
          <button type="button" className="hs-btn" aria-label="Scroll right" disabled={pos >= max - 1} onClick={() => go(pos + step())}>▶</button>
        </div>
      )}
      <div ref={box} className={"tw " + className}>{children}</div>
    </TableZoom>
  );
}
