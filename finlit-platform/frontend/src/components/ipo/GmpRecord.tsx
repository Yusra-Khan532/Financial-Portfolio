// "What GMP said vs what actually listed" on the IPO calendar (task #307, developer file 17 v2): closed until opened, after the timeline and before Listed.
// Every listed IPO with the last grey market premium (GMP) InvestorGain recorded before listing, against the listing price, both as a percent of the issue
// price. Three views: By GMP range (default), Every issue (the scatter) and Table; filters by board, year listed, issue size and subscription, each option
// with its count. The ranges, categories and filters are worked out here from /api/ipos/gmp-record?board=all (lib/ipoCalendar.ts).
// GMP is an informal, unofficial grey-market price, shown as InvestorGain recorded it. Describes the past; not a forecast and not advice.
// Task #329 (developer file 29): on the one IPOs page, "See the N →" opens the second view (All IPOs since 2020) with that GMP range selected
// (`onSee`); a link to an IPO report carries the view it was opened from, so the report's back link returns there.
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { dateFormat, MINUS, nf } from "../../lib/format";
import { useGmpRecord, type GmpPoint, type Ipo } from "../../lib/ipo";
import { GF0, GR, GS, GV, GY, GZ, gCat, gPass, gRange, gTally, isCap, share, shortName, type GBoard, type GCat, type GFilters, type GRangeKey } from "../../lib/ipoCalendar";
import { Dd, Ico, OptList } from "../../discovery/Toolbar";
import { ChartZoom } from "../ChartZoom";
import "../../styles/ipo-gmp.css";

const CAL = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
export type GView = "range" | "dots" | "table";
export type GState = GFilters & { view: GView; zoom: "most" | "all"; shown: number; hl: GRangeKey | "" };
export const GSTATE0: GState = { ...GF0, view: "range", zoom: "most", shown: 50, hl: "" };

const pct = (v: number | null | undefined, d = 1) => (v == null ? MINUS : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), d)}%`);
const pts = (v: number | null) => (v == null ? "—" : `${v > 0.05 ? "+" : v < -0.05 ? MINUS : ""}${nf(Math.abs(v), 1)} pts`);
const tone = (v: number) => (v > 0 ? "up" : v < 0 ? "down" : "");
const day = (iso: string | null) => (iso ? dateFormat({ day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00")) : MINUS);
const rup = (v: number) => "₹" + nf(v, v % 1 ? 2 : 0);
const C: Record<GCat, string> = { beat: "var(--gv-beat)", short: "var(--gv-short)", band: "var(--gv-band)", cap: "var(--gv-cap)" };
const pl = (n: number, one: string, many: string) => `${nf(n, 0)} ${n === 1 ? one : many}`;

/** The width of the section's body, followed as it changes: the chart is drawn for it (300–1100 px) with a matching viewBox. */
function useWidth() {
  const [w, setW] = useState(0), ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect(); ro.current = null;
    if (!el) return;
    const read = () => setW(el.getBoundingClientRect().width || 0); read();
    if (typeof ResizeObserver !== "undefined") { ro.current = new ResizeObserver(read); ro.current.observe(el); }
  }, []);
  return [ref, w] as const;
}

/** The summary line; it follows the filters. */
export function leadText(t: ReturnType<typeof gTally>) {
  if (!t.n) return "No listed issue matches these filters.";
  return `Of ${nf(t.n, 0)} issues, ${nf(t.band, 0)} (${share(t.band, t.n)}) listed within 5 points of what the GMP said, ${nf(t.beat, 0)} higher and ${nf(t.short, 0)} lower.`
    + (t.cap ? ` ${nf(t.cap, 0)} SME ${t.cap === 1 ? "issue" : "issues"} with a GMP above 85% opened at the +90% cap.` : "")
    + (t.abs != null ? ` The typical gap was ${nf(t.abs, 1)} points.` : "");
}

export function GmpRecord({ ipos, s, set, open, setOpen, onSee }: { ipos: Ipo[]; s: GState; set: (p: Partial<GState>) => void; open: boolean; setOpen: (o: boolean) => void;
  onSee?: (k: GRangeKey) => void }) {
  const q = useGmpRecord("all"), d = q.data;
  const all = useMemo(() => d?.items ?? [], [d]);
  const items = useMemo(() => all.filter((e) => gPass(e, s)).sort((a, b) => (b.listingDate || "").localeCompare(a.listingDate || "")), [all, s]);
  const base = useMemo(() => all.filter((e) => gPass(e, s, "range")), [all, s]);
  const T = useMemo(() => gTally(s.view === "range" ? base : items), [s.view, base, items]);
  const cnt = (k: keyof GFilters, v: string) => all.filter((e) => gPass(e, { ...s, [k]: v } as GFilters, "range")).length;
  const lab = (k: "year" | "size" | "sub", opts: [string, string][], d0: string) => (s[k] !== d0 ? opts.find((o) => o[0] === s[k])?.[1] ?? "" : "");
  const chips: [keyof GFilters, string][] = [];
  if (s.year !== "all") chips.push(["year", "Listed: " + lab("year", GY, "all")]);
  if (s.size !== "any") chips.push(["size", lab("size", GZ, "any")]);
  if (s.sub !== "any") chips.push(["sub", lab("sub", GS, "any")]);
  if (s.range && s.view !== "range") chips.push(["range", "GMP said " + GR.find((r) => r[0] === s.range)?.[1]]);
  const unset = (k: keyof GFilters | "all") => set(k === "all" ? { year: "all", size: "any", sub: "any", range: "", shown: 50 } : { [k]: GF0[k], shown: 50 } as Partial<GState>);
  const current = ipos.filter((e) => e.status !== "listed" && e.details?.gmp && (s.board === "all" || e.kind === s.board));
  const lead = d ? leadText(T) : "";
  const pop = (k: "year" | "size" | "sub", title: string, opts: [string, string][]) => (close: () => void) =>
    <OptList title={title} items={opts.map(([v, t]) => ({ v, t, c: cnt(k, v), sel: s[k] === v }))} onPick={(v) => { set({ [k]: v, shown: 50 } as Partial<GState>); close(); }} />;
  return (
    <details className="dw-acc p4-acc ipo-gmp" id="p4-gmp" open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) setOpen(o); }}>
      <summary className="dw-acch"><span className="dw-acct">What GMP said vs what actually listed</span>{lead ? <span className="dw-accs">{lead}</span> : null}<i className="dw-accc" aria-hidden="true">▾</i></summary>
      {open && <div className="dw-accb">
        <p className="muted ipo-gmp-sub">The last grey market premium (GMP) recorded before each listing, against the price the share listed at. Both are a percent of the issue price.</p>
        {q.isLoading && <div className="skeleton" style={{ height: 300 }} role="status" aria-label="Loading the GMP record" />}
        {q.isError && <p className="formerr">The GMP record could not be loaded. Please try again shortly.</p>}
        {d && !all.length && <p className="muted">No listed issues with a GMP on record yet.</p>}
        {d && all.length > 0 && <>
          <div className="p4-gf">
            <div className="seg" role="group" aria-label="Board">{([["all", "All"], ["mainboard", "Mainboard"], ["sme", "SME"]] as [GBoard, string][]).map(([k, t]) =>
              <button key={k} type="button" aria-pressed={s.board === k} onClick={() => set({ board: k, shown: 50 })}>{t}</button>)}</div>
            <div className="dbx-dds">
              <Dd label="Listed" value={lab("year", GY, "all")} icon={CAL} title="Listed in">{pop("year", "Listed in", GY)}</Dd>
              <Dd label="Issue size" value={lab("size", GZ, "any")}>{pop("size", "Issue size", GZ)}</Dd>
              <Dd label="Subscription" value={lab("sub", GS, "any")} title="Times subscribed">{pop("sub", "Times subscribed", GS)}</Dd>
            </div>
            <div className="seg p4-gvw" role="group" aria-label="View">{([["range", "By GMP range"], ["dots", "Every issue"], ["table", "Table"]] as [GView, string][]).map(([k, t]) =>
              <button key={k} type="button" aria-pressed={s.view === k} onClick={() => set({ view: k, shown: 50 })}>{t}</button>)}</div>
          </div>
          {chips.length > 0 && <div className="dbx-chips p4-gch" role="group" aria-label="GMP filters on">{chips.map(([k, t]) =>
            <button key={k} type="button" className="dbx-chip" aria-label={`Remove filter ${t}`} onClick={() => unset(k)}>{t}{Ico.x}</button>)}
            <button type="button" className="dbx-lk" onClick={() => unset("all")}>Clear these</button></div>}
          <p className="ipo-gmp-lead">{T.n ? <>Of {nf(T.n, 0)} issues, <b>{nf(T.band, 0)}</b> ({share(T.band, T.n)}) listed within 5 points of what the GMP said, <b className="g-hi">{nf(T.beat, 0)}</b> higher and <b className="g-lo">{nf(T.short, 0)}</b> lower.
            {T.cap ? ` ${nf(T.cap, 0)} SME ${T.cap === 1 ? "issue" : "issues"} with a GMP above 85% opened at the +90% cap.` : ""}{T.abs != null ? ` The typical gap was ${nf(T.abs, 1)} points.` : ""}</> : "No listed issue matches these filters."}</p>
          {s.view === "range" && <ByRange base={base} cap={T.cap > 0} current={current} hl={s.hl} onSee={(k) => (onSee ? onSee(k) : set({ view: "table", range: k, hl: "", shown: 50 }))} />}
          {s.view === "table" && <GTable items={items} shown={s.shown} more={() => set({ shown: s.shown + 50 })} />}
          {s.view === "dots" && <Dots items={items} board={s.board} zoom={s.zoom} setZoom={(z) => set({ zoom: z })} cap={T.cap > 0} />}
          <p className="muted ipo-gmp-foot">GMP from <a href={d.source.url} target="_blank" rel="noopener noreferrer">{d.source.name}</a>: an informal, unofficial price from the grey market, not an exchange figure. Listing price as the exchange set it on listing day. Describes the past; not a forecast or advice.</p>
        </>}
      </div>}
    </details>
  );
}

function Key({ cats }: { cats: GCat[] }) {
  return <div className="p4-gkey">{cats.map((c) => <span key={c}><i className={"s-" + c} />{GV[c]}</span>)}</div>;
}

/** By GMP range: one row per range of what the GMP said, a 100% bar of how the listings compared, the share within 5 points and the median gap. */
function ByRange({ base, cap, current, hl, onSee }: { base: GmpPoint[]; cap: boolean; current: Ipo[]; hl: string; onSee: (k: GRangeKey) => void }) {
  return <>
    <Key cats={(["short", "band", "beat"] as GCat[]).concat(cap ? ["cap"] : [])} />
    <div className="p4-gr" role="table" aria-label="How close the listing came to the GMP, by what the GMP said">
      {GR.map(([k, label]) => {
        const L = base.filter((e) => gRange(e.gmpPct) === k), t = gTally(L), now = current.filter((e) => gRange(e.details!.gmp!.pct) === k), few = t.n > 0 && t.n < 10;
        const seg = (c: GCat) => { const w = t.n ? (t[c] / t.n) * 100 : 0; return w ? <i key={c} className={"s-" + c} style={{ width: `${w.toFixed(2)}%` }} title={`${GV[c]}: ${nf(t[c], 0)} of ${nf(t.n, 0)} (${share(t[c], t.n)})`}>{w >= 11 ? share(t[c], t.n) : ""}</i> : null; };
        return (
          <div key={k} className={"p4-grr" + (few ? " thin" : "") + (hl === k ? " hl" : "")} role="row" data-grow={k}>
            <span className="p4-grl" role="rowheader"><b>{label}</b><small>{t.n ? pl(t.n, "issue", "issues") : "no issues"}{few ? " · few" : ""}</small></span>
            <span className="p4-grb" role="cell">{t.n ? <span className="p4-gbar">{seg("short")}{seg("band")}{seg("beat")}{seg("cap")}</span> : <span className="p4-gbar empty" />}
              {now.length > 0 && <span className="p4-gnow">Current issues at this GMP: {now.map((e, i) => <span key={e.id}>{i ? " · " : ""}<b>{shortName(e.name)}</b> {pct(e.details!.gmp!.pct)}</span>)}</span>}</span>
            <span className="r p4-grw" role="cell"><b>{share(t.band, t.n)}</b><small>within 5 pts</small></span>
            <span className="r p4-grg" role="cell"><b>{pts(t.gap)}</b><small>median gap</small></span>
            <span className="r p4-grx" role="cell">{t.n ? <button type="button" className="p4-lk" onClick={() => onSee(k)}>See the {nf(t.n, 0)} →</button> : null}</span>
          </div>);
      })}
    </div>
    <p className="muted p4-gnote">Read across: of the issues whose last GMP was in that range, the share that listed lower than the GMP, within 5 points of it, or higher. <b>Median gap</b> = listing minus GMP, in points of the issue price. A GMP of 0% means no premium was quoted. Both NSE and BSE cap an SME issue's opening price at +90% of the issue price, so an SME issue with a GMP above that could not list at its GMP.</p>
  </>;
}

/** Table: the filtered issues, newest listing first, 50 at a time. */
/** Where a link to an IPO report was followed from (the report's back link returns there). */
function useFrom() {
  const l = useLocation();
  return useMemo(() => ({ from: l.pathname + l.search }), [l.pathname, l.search]);
}

function GTable({ items, shown, more }: { items: GmpPoint[]; shown: number; more: () => void }) {
  const from = useFrom();
  return <>
    <div className="ipo-gmp-tw p4-gtw"><table className="ipo-gmp-t p4-gt"><caption className="sr-only">Listed issues: what the GMP said, the listing price against the issue price and the gap</caption>
      <thead><tr><th scope="col">Issue</th><th scope="col">Listed</th><th scope="col" className="r">GMP said</th><th scope="col" className="r">Listed vs issue</th><th scope="col" className="r">Gap</th><th scope="col" className="r">Subscribed</th><th scope="col">Result</th></tr></thead>
      <tbody>{items.slice(0, shown).map((e) => { const c = gCat(e); return (
        <tr key={e.url}><th scope="row"><Link to={`/ipo/${e.id}`} state={from}>{e.name}</Link><small>{e.board === "sme" ? "SME" : "Mainboard"}</small></th><td>{day(e.listingDate)}</td>
          <td className="r">{pct(e.gmpPct)}</td><td className={"r " + tone(e.listingPct)}>{pct(e.listingPct)}</td><td className="r">{pts(e.listingPct - e.gmpPct)}</td>
          <td className="r">{e.subscription != null ? nf(e.subscription, 2) + "x" : MINUS}</td>
          <td><span className={"p4-gv-t g-" + c}>{GV[c]}</span>{isCap(e) && c !== "cap" ? <small>opened at the +90% cap</small> : null}</td></tr>); })}</tbody></table></div>
    {items.length > shown && <div className="ia-more"><button type="button" className="ia-btn" onClick={more}>Show {nf(Math.min(50, items.length - shown), 0)} more</button><span className="muted">Showing {nf(shown, 0)} of {nf(items.length, 0)}</span></div>}
  </>;
}

type Frame = { W: number; H: number; L: number; R: number; T: number; B: number; X0: number; X1: number; Y0: number; Y1: number; sx: (v: number) => number; sy: (v: number) => number };
function frameFor(width: number, most: boolean): Frame {
  const W = Math.round(Math.max(300, Math.min(1100, width || 720))), H = W < 520 ? Math.round(W * 0.95) : 420, L = W < 520 ? 40 : 52, R = 12, T = 24, B = 40;
  const X0 = most ? -10 : -30, X1 = most ? 50 : 150, Y0 = most ? -40 : -50, Y1 = most ? 100 : 150;
  const sx = (x: number) => L + ((Math.max(X0, Math.min(X1, x)) - X0) / (X1 - X0)) * (W - L - R);
  const sy = (y: number) => T + (1 - (Math.max(Y0, Math.min(Y1, y)) - Y0) / (Y1 - Y0)) * (H - T - B);
  return { W, H, L, R, T, B, X0, X1, Y0, Y1, sx, sy };
}
const ticks = (a: number, b: number, s: number) => { const o: number[] = []; for (let t = Math.ceil(a / s) * s; t <= b; t += s) o.push(t); return o; };

/** The dots: drawn once per data, frame and zoom; hovering never redraws them (the tip and the ring are updated on their own). */
const DotLayer = memo(function DotLayer({ items, f, onHover, onPick }: { items: GmpPoint[]; f: Frame; onHover: (e: GmpPoint | null, touch: boolean) => void; onPick: (e: GmpPoint) => void }) {
  const mx = Math.max(1, ...items.map((e) => e.issueSizeCr ?? 0)), rr = (e: GmpPoint) => (f.W < 520 ? 2.5 : 3) + (f.W < 520 ? 6 : 9) * Math.sqrt((e.issueSizeCr ?? 0) / mx);
  const off = (e: GmpPoint) => e.gmpPct < f.X0 || e.gmpPct > f.X1 || e.listingPct < f.Y0 || e.listingPct > f.Y1;
  const sorted = [...items].sort((a, b) => (b.issueSizeCr ?? 0) - (a.issueSizeCr ?? 0));      // big dots first, so small ones stay on top
  const touch = { v: false };
  return <>{sorted.map((e) => {
    const o = off(e), c = gCat(e), ring = isCap(e) && c !== "cap";
    return <circle key={e.url} cx={f.sx(e.gmpPct).toFixed(1)} cy={f.sy(e.listingPct).toFixed(1)} r={rr(e).toFixed(1)} fill={o ? "none" : C[c]} stroke={ring ? "var(--gv-cap)" : C[c]} strokeWidth={o || ring ? 1.6 : 0.6}
      className="g-dot" data-gdot={e.id} tabIndex={0} role="link" aria-label={`${e.name}: GMP said ${pct(e.gmpPct)}, listed ${pct(e.listingPct)}. Open the IPO report`}
      onPointerDown={(ev) => { touch.v = ev.pointerType === "touch"; }} onMouseEnter={() => { if (!touch.v) onHover(e, false); }} onFocus={() => onHover(e, false)}
      onClick={() => { if (touch.v) { onHover(e, true); touch.v = false; } else onPick(e); }} onKeyDown={(ev) => { if (ev.key === "Enter") onPick(e); }} />;
  })}</>;
});

/** Every issue: the scatter, zoomed to most issues by default, with the ±5-point band, the "exactly right" line and the SME opening cap. */
function Dots({ items, board, zoom, setZoom, cap }: { items: GmpPoint[]; board: GBoard; zoom: "most" | "all"; setZoom: (z: "most" | "all") => void; cap: boolean }) {
  const nav = useNavigate(), from = useFrom();
  const [box, width] = useWidth();
  const [tip, setTip] = useState<{ e: GmpPoint; pinned: boolean } | null>(null);
  const f = useMemo(() => frameFor(width, zoom === "most"), [width, zoom]);
  const offN = items.filter((e) => e.gmpPct < f.X0 || e.gmpPct > f.X1 || e.listingPct < f.Y0 || e.listingPct > f.Y1).length;
  const onHover = useCallback((e: GmpPoint | null, pinned: boolean) => setTip(e ? { e, pinned } : null), []);
  const onPick = useCallback((e: GmpPoint) => nav(`/ipo/${e.id}`, { state: from }), [nav, from]);
  const showCap = board !== "mainboard" && f.Y1 >= 90;
  const bx0 = f.X0, bx1 = Math.min(f.X1, f.Y1 - 5), most = zoom === "most";
  const e = tip?.e, c = e ? gCat(e) : null;
  return <>
    <div className="p4-gzr"><div className="seg" role="group" aria-label="Zoom">{([["most", "Most issues (GMP up to 50%)"], ["all", "All"]] as const).map(([k, t]) =>
      <button key={k} type="button" aria-pressed={zoom === k} onClick={() => { setZoom(k); setTip(null); }}>{t}</button>)}</div>
      {offN > 0 && <span className="muted">{pl(offN, "issue lies", "issues lie")} outside this view, drawn hollow at the edge</span>}</div>
    <ChartZoom label="What GMP said vs what actually listed: every issue">
    <div className="ipo-gmp-chart p4-gmpc" ref={box}>
      {<svg viewBox={`0 0 ${f.W} ${f.H}`} width={f.W} role="img" aria-label={`${nf(items.length, 0)} listed issues: what the GMP said against the listing price`} onMouseLeave={() => { if (!tip?.pinned) setTip(null); }}>
        <polygon className="g-band" points={`${f.sx(bx0)},${f.sy(bx0 + 5)} ${f.sx(bx1)},${f.sy(bx1 + 5)} ${f.sx(bx1)},${f.sy(bx1 - 5)} ${f.sx(bx0)},${f.sy(bx0 - 5)}`} />
        {ticks(f.Y0, f.Y1, most ? 20 : 50).map((t) => <g key={"y" + t}><line x1={f.L} x2={f.W - f.R} y1={f.sy(t)} y2={f.sy(t)} className="g-grid" /><text x={f.L - 8} y={f.sy(t) + 4} className="g-tick" textAnchor="end">{t}%</text></g>)}
        {ticks(f.X0, f.X1, most ? 10 : 50).map((t) => <text key={"x" + t} x={f.sx(t)} y={f.H - f.B + 18} className="g-tick" textAnchor="middle">{t}%</text>)}
        <text x={(f.L + f.W - f.R) / 2} y={f.H - 4} className="g-axis" textAnchor="middle">What GMP said →</text>
        <text x={4} y={12} className="g-axis">↑ Listing price vs issue price</text>
        <line x1={f.sx(bx0)} y1={f.sy(bx0)} x2={f.sx(Math.min(f.X1, f.Y1))} y2={f.sy(Math.min(f.X1, f.Y1))} className="g-exact" />
        {showCap && <><line x1={f.L} x2={f.W - f.R} y1={f.sy(90)} y2={f.sy(90)} className="g-capl" /><text x={f.W - f.R - 4} y={f.sy(90) - 5} className="g-capt" textAnchor="end">SME opening cap, +90%</text></>}
        <g className={"g-dots" + (e ? " dim" : "")}><DotLayer items={items} f={f} onHover={onHover} onPick={onPick} /></g>
        {e && <circle className="g-dot on" cx={f.sx(e.gmpPct)} cy={f.sy(e.listingPct)} r={6} fill="none" stroke="var(--text)" strokeWidth={1.6} pointerEvents="none" aria-hidden="true" />}
      </svg>}
      {e && c && (() => {
        const px = (f.sx(e.gmpPct) / f.W) * 100, py = (f.sy(e.listingPct) / f.H) * 100, narrow = f.W < 520;
        const cls = narrow ? (py > 50 ? " n up" : " n down") : px > 55 ? " l" : "";
        const style = narrow ? { left: "50%", top: `${py}%` } : { left: `${px}%`, top: `${Math.max(12, Math.min(88, py))}%` };
        return (
          <div className={"ipo-gmp-tip" + cls + (tip?.pinned ? " pin" : "")} id="p4-gtip" role="status" style={style}>
            <b>{e.name}</b>
            <dl>
              <div><dt>GMP (unofficial)</dt><dd>{pct(e.gmpPct)}<small>₹{nf(e.gmp, e.gmp % 1 ? 2 : 0)}</small></dd></div>
              <div><dt>Listed at</dt><dd className={tone(e.listingPct)}>{pct(e.listingPct)}<small>{rup(e.listingPrice)}</small></dd></div>
              {e.day1ClosePct != null && e.day1Close != null && <div><dt>Day-1 close</dt><dd className={tone(e.day1ClosePct)}>{pct(e.day1ClosePct)}<small>{rup(e.day1Close)}</small></dd></div>}
            </dl>
            <span className="ipo-gmp-tm">{[e.listingDate ? day(e.listingDate) : null, e.board === "sme" ? "SME" : "Mainboard", e.subscription != null ? `${nf(e.subscription, 2)}x subscribed` : null].filter(Boolean).join(" · ")}</span>
            <span className={"p4-gv-t g-" + c}>{GV[c]} · {pts(e.listingPct - e.gmpPct)}{isCap(e) && c !== "cap" ? " · opened at the +90% cap" : ""}</span>
            {tip?.pinned ? <Link className="p4-tipa" to={`/ipo/${e.id}`} state={from}>Open the IPO report →</Link> : <small className="p4-tiph">Select the dot to open its report</small>}
          </div>);
      })()}
    </div>
    </ChartZoom>
    <div className="ipo-gmp-key p4-gkey2">{(["short", "band", "beat", "cap"] as GCat[]).filter((k) => k !== "cap" || cap).map((k) => <span key={k}><i style={{ background: C[k] }} />{GV[k]}</span>)}
      <span><i className="g-bandk" />The band: within 5 points</span><span><i className="k-exact" />GMP exactly right</span>{showCap && <span><i className="g-capk" />Ring: opened at the +90% cap</span>}</div>
    <p className="muted ipo-gmp-foot">Dot size = issue size · select a dot for its IPO report.</p>
  </>;
}
