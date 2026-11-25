import { useEffect, useRef, useState, type ReactNode } from "react";

/** Mounts a heavy report section only when it is close to the screen (or when asked to open everything,
 *  for example by a section-menu jump). Keeps the long company page fast to open and to scroll. Without
 *  IntersectionObserver (old browsers, tests) it renders at once, so nothing is ever missing. */
/** Task #328 (developer file 27, C): each section's usual height, so the placeholder before it opens is about as tall as the section and the scroll bar
 *  does not jump (the page measured 17,291 px on load and 34,114 px once every section had opened). Measured on Reliance and HDFC Bank, 22 Nov 2026,
 *  with every section open: [wide screens of 1180 px and more, narrower ones]. Developer file 41: Financials holds the old Chart lab's statement charts
 *  (Reliance, 25 Nov 2026: 3,308 and 3,381 px), and Economy and sector, now near the end, waits too (the live Reliance section, 938 px at 1,024 px). */
export const USUAL_HEIGHT: Record<string, [number, number]> = {
  quarter: [1950, 2370], financials: [3310, 3380], trends: [1020, 1760], ratios: [1700, 1970], ownership: [1225, 1360], peers: [1900, 2000],
  sector: [1190, 1320], segments: [800, 820], dividends: [980, 1170], macro: [860, 940], news: [1590, 2280], community: [280, 280],
};
export const usualHeight = (id: string, width = typeof window === "undefined" ? 1440 : window.innerWidth): number | undefined => {
  const h = USUAL_HEIGHT[id];
  return h ? h[width >= 1180 ? 0 : 1] : undefined;
};

export function Defer({ children, all, onShow, height = 700 }: { children: ReactNode; all: boolean; onShow: () => void; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (on || all) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [on, all]);
  const show = on || all;
  useEffect(() => { if (show) onShow(); }, [show]);   // eslint-disable-line react-hooks/exhaustive-deps
  return show ? <>{children}</> : <div ref={ref} style={{ minHeight: height }} aria-hidden="true" />;
}
