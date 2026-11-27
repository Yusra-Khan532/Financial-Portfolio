import { useEffect, useRef, useState } from "react";
import { useThemeKey } from "../lib/ui";
import { useZoomHeight } from "../components/ChartZoom";

/** Measures the container, then calls `draw(svg, width)` whenever data, width or theme change.
 *  Charts read CSS variables at draw time, so a theme switch simply redraws.
 *  `fill` (task #167) is the height the enlarged (full screen) view has room for, or null in the page: a chart drawn at a fixed height takes
 *  Math.max(its own height, fill) so it fills the screen instead of leaving the lower part empty. */
export function useChart(draw: (svg: SVGSVGElement, width: number, first: boolean, fill: number | null) => void, deps: unknown[]) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(0);
  const drawn = useRef(false);
  const theme = useThemeKey();
  const [, fill] = useZoomHeight<SVGSVGElement>(0, svg);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => {
      const nw = Math.round(e.contentRect.width);
      setW((old) => (Math.abs(old - nw) > 1 ? nw : old));
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svg.current || w < 40) return;
    svg.current.innerHTML = "";
    const first = !drawn.current;
    drawn.current = true;
    draw(svg.current, w, first, fill > 0 ? fill : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, theme, fill, ...deps]);

  return { wrap, svg };
}
