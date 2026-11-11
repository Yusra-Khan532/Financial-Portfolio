// A small tooltip that follows the pointer (task #77): `bind(text)` goes on any element, `node` is rendered once by the component. It also opens on keyboard focus and closes on Escape.
import { useEffect, useState, type FocusEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type Tip = { x: number; y: number; text: string };

export function useHoverTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    if (!tip) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setTip(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [tip]);
  /** Props for the element a tip belongs to. A null text gives no tip. */
  const bind = (text: string | null | undefined) => text == null ? {} : {
    onMouseMove: (e: MouseEvent) => setTip({ x: e.clientX, y: e.clientY, text }),
    onMouseLeave: () => setTip(null),
    onFocus: (e: FocusEvent<Element>) => { const r = (e.currentTarget as Element).getBoundingClientRect(); setTip({ x: r.left + r.width / 2, y: r.top, text }); },
    onBlur: () => setTip(null),
  };
  const node = tip && typeof document !== "undefined" ? createPortal(
    <div className="hv-tip" role="tooltip" style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 250), top: tip.y + 18 }}>{tip.text}</div>, document.body) : null;
  return { bind, node };
}
