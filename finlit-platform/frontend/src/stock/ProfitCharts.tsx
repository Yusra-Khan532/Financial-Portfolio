// Developer file 42 (founder, 26 Nov 2026): "Profit and loss in charts" revamped. The figures come from plBridge (every step adds up).
//  * ProfitBridge: revenue to net profit as rows (each step's name, its bar, its amount and its share of ₹100 of revenue). Revenue and the
//    operating costs are far larger than every later step, so their bars are cut short (≈) and the scale is set by the steps after them;
//    the old chart drew everything on one scale, so interest, depreciation and tax were slivers. Rows never squeeze a name on a phone.
//  * HundredChart: each year's ₹100 of income, with the operating costs' part cut short (≈) so the parts after it (interest, depreciation,
//    tax and the profit left) are drawn on a scale that can be read. A line above lists every part of the year in focus.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MINUS, cr, nf } from "../lib/format";
import { hundred, runs, type BridgeStep, type PlRows } from "./plBridge";
import "../styles/profit.css";

const crf = (v: number) => (v < 0 ? MINUS : "") + (Math.abs(v) >= 1000 ? cr(Math.abs(v)) : nf(Math.abs(v), 0));
const rs = (v: number) => "₹" + nf(v, 1);

/** Colours of the parts: the profit in the gain colour, the costs after operating costs in shades of the loss colour, and the operating costs
 *  (the bulk of every ₹100, cut short) in a quiet neutral, so the eye goes to the parts drawn to scale. */
export const PART_COLOR: Record<string, string> = {
  opcost: "var(--s3)", fin: "color-mix(in srgb, var(--loss) 88%, var(--s1))", dep: "color-mix(in srgb, var(--loss) 64%, var(--s1))",
  ex: "color-mix(in srgb, var(--loss) 30%, var(--s1))", other: "color-mix(in srgb, var(--loss) 30%, var(--s1))", tax: "color-mix(in srgb, var(--loss) 44%, var(--s1))",
  adj: "color-mix(in srgb, var(--loss) 26%, var(--s1))", np: "var(--gain)",
};

/** The scale of the bridge: set by the steps from operating profit on; revenue and the operating costs run past it and are cut. */
export function bridgeScale(steps: BridgeStep[]) {
  const r = runs(steps), opAt = steps.findIndex((s) => s.key === "op"), rev = steps[0].value;
  const later = r.slice(Math.max(0, opAt)).flatMap((b) => [b.from, b.to]);
  let lo = Math.min(0, ...later), hi = Math.max(0, ...later) * 1.12;
  const cut = rev > hi * 1.6;                     // when revenue is not much larger, everything is drawn on one scale
  if (!cut) { lo = Math.min(0, ...r.flatMap((b) => [b.from, b.to])); hi = Math.max(...r.flatMap((b) => [b.from, b.to])); }
  const at = (x: number) => ((Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo || 1)) * 100;
  return { r, at, cut, past: (x: number) => cut && x > hi };
}

export function ProfitBridge({ steps, year }: { steps: BridgeStep[]; year: string }) {
  const rev = steps[0].value, { r, at, past } = bridgeScale(steps);
  return (
    <div className="plb" role="table" aria-label={`From ${year} revenue to net profit, ₹ crore`}>
      <div className="plb-r plb-hd" role="row"><span role="columnheader">Step</span><span role="columnheader" aria-hidden="true" /><span role="columnheader">₹ Crore</span><span role="columnheader">Per ₹100<span className="plb-x">&nbsp;of revenue</span></span></div>
      {steps.map((s, i) => {
        const b = r[i], a = at(Math.min(b.from, b.to)), z = at(Math.max(b.from, b.to)), cut = past(Math.max(b.from, b.to));
        const kind = s.total ? "t" : s.value >= 0 ? "up" : "down", per = rev ? (Math.abs(s.value) / rev) * 100 : null;
        const say = `${s.label}: ${s.total ? "" : s.value >= 0 ? "adds " : "takes away "}₹${crf(Math.abs(s.value))} crore${per != null ? `, ₹${nf(per, 1)} of every ₹100 of revenue` : ""}`;
        return (
          <div className={"plb-r" + (s.total ? " tot" : "")} role="row" key={s.key} title={say}>
            <span className="plb-l" role="rowheader">{s.label}</span>
            <span className="plb-lane" role="cell" aria-hidden="true">
              {i > 0 && <i className="plb-link" style={{ left: `${at(r[i - 1].to)}%` }} />}
              <b className={`plb-bar ${kind}${cut ? " cut" : ""}`} style={{ left: `${a}%`, width: `${Math.max(0.6, z - a)}%` }} />
            </span>
            <span className={"plb-v" + (s.total ? "" : s.value >= 0 ? " pos" : " neg")} role="cell">{s.total ? "" : s.value >= 0 ? "+" : ""}{crf(s.value)}</span>
            <span className="plb-p" role="cell">{per == null ? "—" : rs(per)}</span>
          </div>
        );
      })}
    </div>
  );
}

const LOWER = ["np", "tax", "adj", "other", "ex", "dep", "fin"];        // drawn from the bottom up; the operating costs sit on top
export function HundredChart({ periods, rows }: { periods: string[]; rows: PlRows }) {
  const box = useRef<HTMLDivElement>(null), [w, setW] = useState(0), [hv, setHv] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el); setW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const cols = useMemo(() => periods.map((p, i) => ({ p, h: hundred(rows, i) })).filter((c): c is { p: string; h: NonNullable<ReturnType<typeof hundred>> } => !!c.h), [periods, rows]);
  if (!cols.length) return <p className="muted">The figures for this split are not available.</p>;
  const val = (c: (typeof cols)[number], k: string) => c.h.parts.find((x) => x.key === k)?.value ?? 0;
  const rest = (c: (typeof cols)[number]) => LOWER.reduce((a, k) => a + val(c, k), 0);
  const top = Math.max(5, Math.ceil(Math.max(...cols.map(rest)) / 5) * 5);
  const H = 290, pl = 46, pr = 8, pt = 10, capH = 40, brk = 16, plb = 26, lt = pt + capH + brk, lb = H - plb, lh = lb - lt;
  const W = Math.max(w, 280), n = cols.length, step = (W - pl - pr) / n, bw = Math.min(52, step * 0.58), X = (i: number) => pl + (i + 0.5) * step;
  const Y = (x: number) => lb - (x / top) * lh, ticks = Array.from({ length: top / 5 + 1 }, (_, k) => k * 5).filter((t, _, a) => a.length <= 6 || t % 10 === 0);
  const focus = hv ?? n - 1, fc = cols[focus];
  return (
    <div className="p100" ref={box}>
      <div className="p100-read" aria-live="polite"><b>{fc.p}</b>{fc.h.parts.map((x) => <span key={x.key}><i style={{ background: PART_COLOR[x.key] }} />{x.label} <em>{rs(x.value)}</em></span>)}{fc.h.loss > 0 && <span className="neg">Net loss <em>{rs(fc.h.loss)}</em></span>}</div>
      {w > 0 && <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Where each ₹100 of income goes, ${cols[0].p} to ${cols[n - 1].p}: ` + cols.map((c) => `${c.p} net profit ₹${nf(val(c, "np"), 1)}, operating costs ₹${nf(val(c, "opcost"), 1)}`).join("; ")} onMouseLeave={() => setHv(null)}>
        {ticks.map((t) => <g key={t}><line x1={pl} x2={W - pr} y1={Y(t)} y2={Y(t)} stroke="var(--border)" strokeDasharray={t ? "3 5" : undefined} /><text x={pl - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="var(--faint)" fontFamily="var(--mono)">₹{t}</text></g>)}
        <text x={pl - 8} y={pt + 9} textAnchor="end" fontSize="11" fill="var(--faint)" fontFamily="var(--mono)">₹100</text>
        <path d={`M${pl - 30},${pt + capH + 5} l8,-4 l8,8 l8,-8 l6,3`} fill="none" stroke="var(--faint)" strokeWidth="1.2" />
        {cols.map((c, i) => {
          let y0 = lb; const x = X(i);
          const parts = LOWER.map((k) => { const v = val(c, k); const y1 = Y(Math.min(top, (lb - y0) / lh * top + v)); const seg = { k, v, y: y1, h: y0 - y1 }; y0 = y1; return seg; }).filter((s) => s.v > 0);
          const np = parts.find((s) => s.k === "np");
          return (
            <g key={c.p} opacity={hv == null || hv === i ? 1 : 0.5} onMouseEnter={() => setHv(i)}>
              <rect x={x - bw / 2} y={pt} width={bw} height={Math.max(0, y0 - pt)} fill={PART_COLOR.opcost} stroke="var(--border-strong)" strokeWidth="1" />
              <polygon points={`${x - bw / 2 - 1},${pt + capH + 4} ${x + bw / 2 + 1},${pt + capH - 2} ${x + bw / 2 + 1},${pt + capH + 6} ${x - bw / 2 - 1},${pt + capH + 12}`} fill="var(--s1)" />
              {step >= 30 && <text x={x} y={pt + 25} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text)" fontFamily="var(--mono)">{nf(val(c, "opcost"), 1)}</text>}
              {parts.map((s) => <rect key={s.k} x={x - bw / 2} y={s.y} width={bw} height={Math.max(0.5, s.h)} fill={PART_COLOR[s.k]} />)}
              {np && np.h >= 15 && bw >= 26 && <text x={x} y={np.y + np.h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--s1)" fontFamily="var(--mono)">{nf(np.v, 1)}</text>}
              {c.h.loss > 0 && <text x={x} y={lb - 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--loss)">loss</text>}
              <text x={x} y={H - 6} textAnchor="middle" fontSize="11" fill={hv === i ? "var(--text)" : "var(--faint)"}>{c.p}</text>
              <rect x={x - step / 2} y={pt} width={step} height={H - pt} fill="transparent" />
            </g>
          );
        })}
      </svg>}
      {!w && <div style={{ height: H } as CSSProperties} />}
    </div>
  );
}
