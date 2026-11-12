import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, LineStyle, createChart, type Time } from "lightweight-charts";
import { usePrice } from "../../lib/api";
import { useThemeKey } from "../../lib/ui";
import { CoLogo } from "../CoLogo";
import type { Draw, PanelRow } from "./ChartPanel";
import "../../styles/chartpanel.css";

/** The Charts view of a screen: nine cards a page, each with a 6-month daily chart (loaded when it scrolls into view), the pattern drawn when the screen found one, and its facts
 *  in one line. A card opens the same chart panel as a table row. */
export type CardRow = PanelRow & { price?: number | null; change?: number | null };

function MiniChart({ symbol, draw }: { symbol: string; draw?: Draw }) {
  const host = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const theme = useThemeKey();
  const q = usePrice(symbol, "6M", seen);
  const s = q.data?.series;
  useEffect(() => {
    const el = host.current;
    if (!el || !s?.t?.length) return;
    const css = (v: string, fb: string) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb; } catch { return fb; } };
    const up = css("--gain", "#16a34a"), down = css("--loss", "#dc2626");
    const c = createChart(el, { height: 150, autoSize: true, layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "transparent", attributionLogo: false }, grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false }, timeScale: { visible: false }, handleScroll: false, handleScale: false, crosshair: { vertLine: { visible: false }, horzLine: { visible: false } } });
    const k = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
    k.setData(s.t.map((t, i) => ({ time: t as Time, open: s.o?.[i] ?? s.c[i], high: s.h?.[i] ?? s.c[i], low: s.l?.[i] ?? s.c[i], close: s.c[i] })).filter((b) => b.close != null) as never);
    if (draw?.level != null) k.createPriceLine({ price: draw.level, color: "#b8892b", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    if (draw?.box) { k.createPriceLine({ price: draw.box.high, color: "#6366f1", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" }); k.createPriceLine({ price: draw.box.low, color: "#6366f1", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" }); }
    c.timeScale().fitContent();
    return () => c.remove();
  }, [s, draw, theme]);
  return <div ref={host} className="cc-chart" aria-hidden="true">{seen && q.isLoading && <small>Loading…</small>}{seen && !q.isLoading && !s?.t?.length && <small>No chart yet</small>}</div>;
}

export function ChartCards({ rows, onOpen }: { rows: (CardRow & { facts?: [string, string | null][]; draw?: Draw; industry?: string | null })[]; onOpen: (r: CardRow) => void }) {
  return (
    <ul className="cc-grid" aria-label="Charts">
      {rows.map((r) => (
        <li key={r.symbol}>
          <button type="button" className="cc-card" onClick={() => onOpen(r)} aria-label={`Open the ${r.name || r.symbol} chart`}>
            <span className="cc-h"><CoLogo symbol={r.symbol} name={r.name} size={24} /><span><b>{r.symbol}</b><small>{r.name}</small></span></span>
            <MiniChart symbol={r.symbol} draw={r.draw} />
            <span className="cc-f">{r.facts?.filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(" · ") || r.sector || ""}</span>
          </button>
        </li>))}
    </ul>);
}
