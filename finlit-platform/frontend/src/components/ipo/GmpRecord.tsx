// "What GMP said vs what actually listed" on the IPO calendar: every listed IPO with the last grey market premium (GMP) InvestorGain recorded before
// listing, against the listing price, both as a percent of the issue price. GMP is an informal, unofficial grey-market price, shown as InvestorGain
// recorded it, with their name and a link. Describes the past; not a forecast and not advice.
import { useCallback, useMemo, useRef, useState } from "react";
import { ChartHelp } from "../ChartHelp";
import { ChartZoom } from "../ChartZoom";
import { MINUS, nf } from "../../lib/format";
import { useGmpRecord, type GmpPoint, type GmpRecord as Rec } from "../../lib/ipo";
import "../../styles/ipo-gmp.css";

const X0 = -20, Y0 = -50;                                     // the scale's floor, in percent; the top fits the data (points beyond it sit hollow at the edge)
const up50 = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.ceil(v / 50) * 50));
const ticks = (a: number, b: number) => Array.from({ length: Math.floor((b - Math.ceil(a / 50) * 50) / 50) + 1 }, (_, i) => Math.ceil(a / 50) * 50 + i * 50);

/** The chart's frame for the width it has: a wide, shorter frame on a desktop; a squarer one with tighter margins on a phone. */
function frame(width: number) {
  const W = Math.max(300, Math.min(760, Math.round(width || 720))), narrow = W < 520;
  return { W, H: narrow ? Math.round(W * 0.95) : 400, L: narrow ? 40 : 52, R: 12, T: 24, B: 40 };
}

/** The width of an element, followed as it changes (a callback ref, since the chart mounts only once the data is in). */
function useWidth() {
  const [w, setW] = useState(720), ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect(); ro.current = null;
    if (!el) return;
    const read = () => setW(el.getBoundingClientRect().width || 720); read();
    if (typeof ResizeObserver !== "undefined") { ro.current = new ResizeObserver(read); ro.current.observe(el); }
  }, []);
  return [ref, w] as const;
}

const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const pc = (v: number) => `${v < 0 ? MINUS : ""}${nf(Math.abs(v), 1)}%`;
const COLOUR: Record<GmpPoint["verdict"], string> = { beat: "var(--gain)", short: "var(--loss)", band: "var(--muted)" };
const WORD: Record<GmpPoint["verdict"], string> = { beat: "Beat the call", short: "Fell short", band: "Within the band" };
const BOARDS = [["all", "All"], ["mainboard", "Mainboard"], ["sme", "SME"]] as const;

export function GmpRecord() {
  const [board, setBoard] = useState<Rec["board"]>("mainboard");
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<GmpPoint | null>(null);
  const q = useGmpRecord(board), d = q.data;
  const [box, width] = useWidth();
  const items = useMemo(() => d?.items ?? [], [d]);
  const maxSize = useMemo(() => Math.max(1, ...items.map((p) => p.issueSizeCr ?? 0)), [items]);
  const X1 = up50(Math.max(0, ...items.map((p) => p.gmpPct)), 50, 150), Y1 = up50(Math.max(0, ...items.map((p) => p.listingPct)), 100, 250);
  const { W, H, L, R, T, B } = frame(width);
  const sx = (v: number) => L + ((Math.max(X0, Math.min(X1, v)) - X0) / (X1 - X0)) * (W - L - R);
  const sy = (v: number) => T + (1 - (Math.max(Y0, Math.min(Y1, v)) - Y0) / (Y1 - Y0)) * (H - T - B);
  const r = (p: GmpPoint) => (W < 520 ? 2.5 : 3) + (W < 520 ? 6 : 9) * Math.sqrt((p.issueSizeCr ?? 0) / maxSize);
  const off = (p: GmpPoint) => p.gmpPct < X0 || p.gmpPct > X1 || p.listingPct < Y0 || p.listingPct > Y1;
  const drawn = useMemo(() => [...items].sort((a, b) => (b.issueSizeCr ?? 0) - (a.issueSizeCr ?? 0)), [items]);   // big dots first, so small ones stay on top
  const s = d?.summary, f = s?.fit;
  const offCount = items.filter(off).length;
  const ticksX = ticks(0, X1), ticksY = ticks(Y0, Y1);
  const exactTo = Math.min(X1, Y1);
  // The trend line, cut where it leaves the frame (clamping its ends instead would bend it)
  const fitX = f && f.slope > 0 ? [Math.max(X0, (Y0 - f.intercept) / f.slope), Math.min(X1, (Y1 - f.intercept) / f.slope)] : f ? [X0, X1] : null;
  return (
    <section className="card ipo-gmp" aria-labelledby="ipo-gmp-h">
      <div className="card-h">
        <h3 id="ipo-gmp-h">What GMP said vs what actually listed<ChartHelp id="ipo-gmp" /></h3>
        <div className="seg" role="group" aria-label="Board">{BOARDS.map(([k, l]) => <button key={k} type="button" aria-pressed={board === k} onClick={() => setBoard(k)}>{l}</button>)}</div>
      </div>
      <p className="muted ipo-gmp-sub">The last grey market premium (GMP) recorded before each listing, against the price the share listed at. Both are a percent of the issue price.</p>
      {q.isLoading && <div className="skeleton" style={{ height: 300 }} role="status" aria-label="Loading the GMP record" />}
      {q.isError && <p className="formerr">The GMP record could not be loaded. Please try again shortly.</p>}
      {d && !d.items.length && <p className="muted">No listed issues with a GMP on record yet{board === "all" ? "" : ` for ${board === "sme" ? "SME" : "mainboard"} issues`}.</p>}
      {d && s && d.items.length > 0 && <>
        <p className="ipo-gmp-lead">Of {nf(s.count, 0)} issues, <b>{nf(s.band, 0)}</b> listed within {s.bandPts} points of what the GMP said, <b className="up">{nf(s.beat, 0)}</b> listed higher and <b className="down">{nf(s.short, 0)}</b> lower.{s.medianGap != null && <> The typical gap was {nf(s.medianGap, 1)} points.</>}</p>
        {!table ? (
          <ChartZoom label="What GMP said vs what actually listed">
            <div className="ipo-gmp-chart" ref={box}>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.count} listed issues: what the GMP said against the actual listing gain`} onMouseLeave={() => setHover(null)}>
                {ticksY.map((v) => <g key={"y" + v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="g-grid" /><text x={L - 8} y={sy(v) + 4} className="g-tick" textAnchor="end">{v}%</text></g>)}
                {ticksX.map((v) => <text key={"x" + v} x={sx(v)} y={H - B + 18} className="g-tick" textAnchor="middle">{v}%</text>)}
                <text x={(L + W - R) / 2} y={H - 4} className="g-axis" textAnchor="middle">What GMP said →</text>
                <text x={4} y={12} className="g-axis" textAnchor="start">↑ Actual listing gain</text>
                <line x1={sx(X0)} y1={sy(X0)} x2={sx(exactTo)} y2={sy(exactTo)} className="g-exact" />
                {fitX && f && <line x1={sx(fitX[0])} y1={sy(f.intercept + f.slope * fitX[0])} x2={sx(fitX[1])} y2={sy(f.intercept + f.slope * fitX[1])} className="g-fit" />}
                {drawn.map((p) => { const o = off(p); return (
                  <circle key={p.url} cx={sx(p.gmpPct)} cy={sy(p.listingPct)} r={r(p)} fill={o ? "none" : COLOUR[p.verdict]} stroke={COLOUR[p.verdict]} strokeWidth={o ? 1.6 : 0.6}
                    className={"g-dot" + (hover === p ? " on" : "")} onMouseEnter={() => setHover(p)} onFocus={() => setHover(p)} tabIndex={0}
                    aria-label={`${p.name}: GMP said ${pc(p.gmpPct)}, listed ${pc(p.listingPct)}`} />); })}
              </svg>
              {hover && <div className="ipo-gmp-tip" role="status"><b>{hover.name}</b>{hover.listingDate && <span>Listed {day(hover.listingDate)} · {hover.board === "sme" ? "SME" : "Mainboard"}</span>}
                <span>GMP said {pc(hover.gmpPct)} (₹{nf(hover.gmp, hover.gmp % 1 ? 1 : 0)} on ₹{nf(hover.issuePrice, 0)})</span><span>Listed at ₹{nf(hover.listingPrice, 2)}: {pc(hover.listingPct)}</span>
                {hover.subscription != null && <span>Subscribed {nf(hover.subscription, 2)}x</span>}<span className={"v " + hover.verdict}>{WORD[hover.verdict]}</span></div>}
            </div>
          </ChartZoom>
        ) : (
          <div className="ipo-gmp-tw"><table className="ipo-gmp-t"><caption className="sr-only">Listed issues: what the GMP said and the actual listing gain</caption>
            <thead><tr><th scope="col">Issue</th><th scope="col">Listed</th><th scope="col" className="r">GMP said</th><th scope="col" className="r">Listing gain</th><th scope="col" className="r">Subscribed</th><th scope="col">Result</th></tr></thead>
            <tbody>{d.items.map((p) => <tr key={p.url}><th scope="row">{p.name}<small>{p.board === "sme" ? "SME" : "Mainboard"}</small></th><td>{p.listingDate ? day(p.listingDate) : MINUS}</td><td className="r">{pc(p.gmpPct)}</td><td className={"r" + (p.listingPct > 0 ? " up" : p.listingPct < 0 ? " down" : "")}>{pc(p.listingPct)}</td><td className="r">{p.subscription == null ? MINUS : nf(p.subscription, 2) + "x"}</td><td>{WORD[p.verdict]}</td></tr>)}</tbody></table></div>
        )}
        <div className="ipo-gmp-key">
          {!table && <>{(["beat", "short", "band"] as const).map((v) => <span key={v}><i style={{ background: COLOUR[v] }} />{WORD[v]}</span>)}
          <span><i className="k-exact" />GMP exactly right</span>{f && <span><i className="k-fit" />Actual trend · slope {nf(f.slope, 2)}</span>}</>}
          <button type="button" className="ipo-gmp-tbtn" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Show as chart" : "Show as table"}</button>
        </div>
        <p className="muted ipo-gmp-foot">{table ? "" : "Dot size = issue size · "}{nf(s.count, 0)} issues{!table && offCount ? ` · ${offCount} off the scale (hollow, at the edge)` : ""}. GMP from <a href={d.source.url} target="_blank" rel="noopener noreferrer">{d.source.name}</a>: an informal, unofficial price from the grey market, not an exchange figure. Listing price as the exchange set it on listing day. Describes the past; not a forecast or advice.</p>
      </>}
    </section>
  );
}
