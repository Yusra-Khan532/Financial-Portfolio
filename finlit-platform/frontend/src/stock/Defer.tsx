import { useEffect, useRef, useState, type ReactNode } from "react";

/** Mounts a heavy report section only when it is close to the screen (or when asked to open everything,
 *  for example by a section-menu jump). Keeps the long company page fast to open and to scroll. Without
 *  IntersectionObserver (old browsers, tests) it renders at once, so nothing is ever missing. */
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
