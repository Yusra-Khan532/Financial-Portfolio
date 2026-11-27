// Task #408, Details block 1 ("Price · last 3 months"): the daily closes from the stored 6-month price section, cut to the last 3 months, with today's
// price as the last point when it is newer. A dotted line on the day the stock was added ("Added {d Mon}"), a dashed line at the member's target
// ("Your target ₹{x}"), and the high and low as faint gridlines with ₹ labels. Drawn at the box's own width (ResizeObserver). Colours from the page's tokens.
import { useEffect, useRef, useState } from "react";
import { dMon, rs0 } from "../lib/watchlistPack";

export type Series = { t?: string[]; c?: (number | null)[] } | null;

/** The points of the chart: the last 3 months of closes (from the newest close back), plus today's price when its day is newer. */
export function chartPoints(series: Series, quote: { px: number | null; asOf: string | null }): { t: string[]; c: number[] } {
  const t = series?.t ?? [], c = series?.c ?? [];
  const pts = t.map((d, i) => [d, c[i]] as const).filter((x): x is readonly [string, number] => x[1] != null);
  if (quote.px != null && quote.asOf) {
    const day = new Date(new Date(quote.asOf).getTime() + 330 * 60_000).toISOString().slice(0, 10);
    if (!pts.length || day > pts[pts.length - 1][0]) pts.push([day, quote.px]);
  }
  if (!pts.length) return { t: [], c: [] };
  const last = new Date(pts[pts.length - 1][0] + "T00:00:00Z");
  last.setUTCMonth(last.getUTCMonth() - 3);
  const from = last.toISOString().slice(0, 10);
  const cut = pts.filter((p) => p[0] >= from);
  return { t: cut.map((p) => p[0]), c: cut.map((p) => p[1]) };
}

export function PriceChart({ sym, series, px, asOf, addedDay, target }: { sym: string; series: Series; px: number | null; asOf: string | null; addedDay: string | null; target: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0), H = 186;
  useEffect(() => {
    const el = box.current; if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => es.forEach((e) => setW(Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const { t, c } = chartPoints(series, { px, asOf });
  const label = `${sym} closing price over the last 3 months, with the day you added it${target ? " and your target" : ""}`;
  let body = null;
  if (W > 0 && c.length > 1) {
    const pl = W < 420 ? 40 : 50, pr = W < 420 ? 6 : 10, pt = 18, pb = 22;
    const mn = Math.min(...c), mx = Math.max(...c);
    let lo = mn, hi = mx; if (target) { lo = Math.min(lo, target); hi = Math.max(hi, target); }
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const X = (i: number) => pl + ((W - pl - pr) * i) / (c.length - 1), Y = (v: number) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
    const d = c.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("");
    const ai = addedDay ? t.findIndex((x) => x >= addedDay) : -1;
    const li = c.length - 1;
    body = (<>
      <line className="gr" x1={pl} x2={W - pr} y1={Y(mx)} y2={Y(mx)} /><line className="gr" x1={pl} x2={W - pr} y1={Y(mn)} y2={Y(mn)} />
      <text x={pl - 6} y={Y(mx) + 4} textAnchor="end">{rs0(mx)}</text><text x={pl - 6} y={Y(mn) + 4} textAnchor="end">{rs0(mn)}</text>
      <path className="ar" d={`${d}L${X(li)} ${H - pb}L${X(0)} ${H - pb}Z`} /><path className="ln" d={d} />
      {ai >= 0 && <><line className="ad" x1={X(ai)} x2={X(ai)} y1={pt - 4} y2={H - pb} /><circle className="adc" cx={X(ai)} cy={Y(c[ai])} r={4} />
        <text className="adt" x={X(ai) > W / 2 ? X(ai) - 6 : X(ai) + 6} y={pt - 6} textAnchor={X(ai) > W / 2 ? "end" : "start"}>Added {dMon(addedDay)}</text></>}
      {target ? <><line className="tg" x1={pl} x2={W - pr} y1={Y(target)} y2={Y(target)} /><text className="tgt" x={pl + 4} y={Y(target) - 6}>Your target {rs0(target)}</text></> : null}
      <circle className="lst" cx={X(li)} cy={Y(c[li])} r={4} />
      <text x={pl} y={H - 4}>{dMon(t[0])}</text><text x={W - pr} y={H - 4} textAnchor="end">{dMon(t[li])}</text>
    </>);
  }
  return (
    <div className="wl-fig" data-fig={sym} ref={box}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${W || 1} ${H}`}>{body}</svg>
    </div>
  );
}
