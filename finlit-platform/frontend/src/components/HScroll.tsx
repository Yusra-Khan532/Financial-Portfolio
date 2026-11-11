import { useEffect, useRef, useState, type ReactNode } from "react";
import { TableZoom } from "./TableZoom";

/** A wide table's scroll box with its own controls: ◀ ▶ buttons and a slider, shown only when the table is wider than the space,
 *  so it can be moved sideways without a mouse wheel or trackpad. The slider and the table stay in step both ways. */
/** Pinned header (task #64): while the table's own header has scrolled up out of view, a copy of it stays under the site bar, with the same column widths, following the
 *  table sideways. A click on the copy is passed to the real header (so sorting works). CSS `position: sticky` cannot do this inside a box that scrolls sideways. */
function usePinnedHead(box: React.RefObject<HTMLDivElement | null>, on: boolean) {
  useEffect(() => {
    const el = box.current;
    if (!on || !el || typeof window === "undefined") return;
    const bar = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--bar-h"), 10) || 64;
    const pin = document.createElement("div");
    pin.className = "pin-head"; pin.setAttribute("aria-hidden", "true"); pin.hidden = true;
    document.body.appendChild(pin);
    let shown = false;
    const build = (table: HTMLTableElement, head: HTMLElement) => {
      const t = document.createElement("table"); t.className = table.className;
      const th = head.cloneNode(true) as HTMLElement;
      const real = head.querySelectorAll("th"), fake = th.querySelectorAll("th");
      real.forEach((c, i) => { const w = c.getBoundingClientRect().width; fake[i].style.width = fake[i].style.minWidth = fake[i].style.maxWidth = `${w}px`; fake[i].style.boxSizing = "border-box"; fake[i].removeAttribute("id"); });
      t.style.cssText = `table-layout:fixed;width:${table.getBoundingClientRect().width}px;margin:0`; t.appendChild(th);
      pin.replaceChildren(t);
    };
    const update = () => {
      const table = el.querySelector("table") as HTMLTableElement | null, head = table?.tHead;
      if (!table || !head) { pin.hidden = true; return; }
      const hr = head.getBoundingClientRect(), tr = table.getBoundingClientRect(), box0 = el.getBoundingClientRect();
      const want = hr.top < bar && tr.bottom > bar + hr.height + 24;
      if (!want) { if (shown) { pin.hidden = true; shown = false; } return; }
      if (!shown) { build(table, head); shown = true; }
      pin.hidden = false;
      pin.style.cssText = `position:fixed;top:${bar}px;left:${box0.left}px;width:${box0.width}px;overflow:hidden;z-index:30`;
      (pin.firstElementChild as HTMLElement).style.marginLeft = `${-el.scrollLeft}px`;
    };
    const click = (e: MouseEvent) => {
      const th = (e.target as HTMLElement).closest("th"); if (!th) return;
      const i = Array.from(th.parentElement!.children).indexOf(th), row = Array.from(pin.querySelectorAll("tr")).indexOf(th.parentElement as HTMLTableRowElement);
      const real = el.querySelector("table")?.tHead?.rows[row]?.cells[i]; (real?.querySelector("button, a") as HTMLElement | null)?.click();
    };
    pin.addEventListener("click", click);
    window.addEventListener("scroll", update, { passive: true }); window.addEventListener("resize", update); el.addEventListener("scroll", update, { passive: true });
    update();
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); el.removeEventListener("scroll", update); pin.removeEventListener("click", click); pin.remove(); };
  }, [box, on]);
}

export function HScroll({ children, className = "", label = "table", pinHead = false }: { children: ReactNode; className?: string; label?: string; pinHead?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(0), [pos, setPos] = useState(0);
  usePinnedHead(box, pinHead);
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
