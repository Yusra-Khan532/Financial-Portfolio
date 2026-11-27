import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, LineSeries, LineStyle, createChart, type Time } from "lightweight-charts";
import { useThemeKey } from "../../lib/ui";
import { nf, MINUS } from "../../lib/format";
import type { ScreenSeries } from "../../lib/presets";
import { CoLogo } from "../CoLogo";
import type { Draw, PanelRow } from "./ChartPanel";
import "../../styles/chartpanel.css";
import { coTitle, subLine, titleOf } from "../../lib/companyLabel";

/** The Charts view of a screen (task #325, developer file 25, section 1 row 4): 12 cards a page, 2, 3 or 4 a row, 3 or 6 months, each with price, day change,
 *  Prism, 3-month return, long-term trend and the screen's own figure, and the pattern drawn when the screen found one. The prices of a page come in one
 *  call (useScreenPrices); a company with none says the chart is being prepared. A card opens the same chart panel as a table row. */
export type CardRow = PanelRow & { price?: number | null; change?: number | null; prism?: number | null; ret3m?: number | null; lt?: string | null; figure?: [string, React.ReactNode] | null };

const css = (v: string, fb: string) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb; } catch { return fb; } };

export function MiniChart({ series, draw, height = 150, line = false }: { series: ScreenSeries | null | undefined; draw?: Draw; height?: number; line?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const theme = useThemeKey();
  useEffect(() => {
    const el = host.current;
    if (!el || !series?.t?.length) return;
    const up = css("--gain", "#16a34a"), down = css("--loss", "#dc2626"), gold = css("--gold", "#b8892b");
    const c = createChart(el, { height, autoSize: true, layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "transparent", attributionLogo: false }, grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false }, timeScale: { visible: false }, handleScroll: false, handleScale: false, crosshair: { vertLine: { visible: false }, horzLine: { visible: false } } });
    if (line) {
      const ln = c.addSeries(LineSeries, { color: series.c[series.c.length - 1] >= series.c[0] ? up : down, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      ln.setData(series.t.map((t, i) => ({ time: t as Time, value: series.c[i] })).filter((b) => b.value != null) as never);
    } else {
      const k = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
      k.setData(series.t.map((t, i) => ({ time: t as Time, open: series.o?.[i] ?? series.c[i], high: series.h?.[i] ?? series.c[i], low: series.l?.[i] ?? series.c[i], close: series.c[i] })).filter((b) => b.close != null) as never);
      if (draw?.level != null) k.createPriceLine({ price: draw.level, color: gold, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      if (draw?.box) { k.createPriceLine({ price: draw.box.high, color: "#6366f1", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" }); k.createPriceLine({ price: draw.box.low, color: "#6366f1", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" }); }
    }
    c.timeScale().fitContent();
    return () => c.remove();
  }, [series, draw, theme, height, line]);
  return <div ref={host} className={line ? "cc-spark" : "cc-chart"} aria-hidden="true" />;
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 1)}%`;

export function ChartCards({ rows, series, loading, onOpen, perRow = 3 }: { rows: CardRow[]; series: Record<string, ScreenSeries | null> | undefined; loading: boolean; onOpen: (r: CardRow) => void; perRow?: 2 | 3 | 4 }) {
  return (
    <ul className={"cc-grid cc-cols-" + perRow} aria-label="Charts">
      {rows.map((r) => {
        const s = series?.[r.symbol];
        return (
          <li key={r.symbol}>
            <button type="button" className="cc-card" onClick={() => onOpen(r)} aria-label={`Open the ${r.name || r.symbol} chart`}>
              <span className="cc-h"><CoLogo symbol={r.symbol} name={r.name} size={24} /><span><b title={coTitle(r)}>{titleOf(r)}</b><small>{subLine(r, r.name)}</small></span></span>
              <span className="cc-p"><b>{r.price != null ? `₹${nf(r.price, 2)}` : MINUS}</b>{r.change != null && <span className={r.change >= 0 ? "up" : "down"}>{signed(r.change)}</span>}</span>
              {s ? <MiniChart series={s} draw={r.draw} /> : <div className="cc-chart" aria-hidden="true"><small>{loading ? "Loading…" : "Chart is being prepared"}</small></div>}
              <span className="cc-fx">
                {r.prism != null && <span><small>Prism</small>{nf(r.prism, 0)}</span>}
                {r.ret3m != null && <span><small>3 months</small>{signed(r.ret3m)}</span>}
                {r.lt && <span><small>Long term</small>{r.lt}</span>}
                {r.figure && <span><small>{r.figure[0]}</small>{r.figure[1]}</span>}
              </span>
            </button>
          </li>);
      })}
    </ul>);
}
