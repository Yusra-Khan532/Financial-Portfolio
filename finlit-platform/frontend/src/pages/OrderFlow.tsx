// Trading Lab > Order Flow (founder, 26 Nov 2026; docs/TRADING-LAB.md "Order Flow"). Step 2: Market depth, how every NSE F&O stock is moving
// right now, from the engine's snapshot (finlit/lab/flow.py, every 3 minutes in market hours). Facts only: change, futures open interest and
// its build-up, VWAP, pivot zone and how many of five facts agree. No picks, plans or calls here (those belong to the Signals desk).
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { Icon } from "../lib/icons";
import { labAccess } from "../lib/lab";
import { useDocTitle } from "../lib/title";
import {
  BUILDUP, BUILDUP_ORDER, FACTS, ZONE, flowSnapshot, inr, marketLive, pct, tone,
  type FlowBand, type FlowLines, type FlowSector, type FlowSnapshot, type FlowStock, type FlowSummary,
} from "../lib/flow";
import { BUCKETS, bucketOf, layout, ribbonPath, type Bucket } from "../lib/flowboard";
import { LabGate } from "./TradingLab";
import "../styles/portfolio-disc.css";
import "../styles/tradinglab.css";
import "../styles/orderflow.css";

export const FLOW_TABS = [
  { id: "depth", name: "Market depth", ready: true },
  { id: "board", name: "Flow board", ready: true },
  { id: "zones", name: "Stock zones", ready: false },
  { id: "journal", name: "Trading journal", ready: false },
];

const DISCLAIMER = "Order Flow describes how F&O stocks are moving from exchange prices and futures open interest, worked out by fixed formulas and shown with a delay of a few minutes. It does not tell anyone to buy, sell or hold, it never places an order, and a build-up or a count of facts is not a forecast. Intraday and F&O trading carry a high risk of loss; most people who trade them lose money. Information only, not investment advice.";

// ------------------------------------------------------------------------------------------------------------------ charts

/** Every stock's change, lowest to highest, as one curve: the area above zero in the rising colour, below in the falling colour. */
export function DepthCurve({ stocks }: { stocks: FlowStock[] }) {
  const pts = useMemo(() => stocks.filter((s) => s.changePct != null).map((s) => ({ s: s.symbol, v: s.changePct as number })).sort((a, b) => a.v - b.v), [stocks]);
  const [hover, setHover] = useState<number | null>(null);
  if (pts.length < 2) return <p className="muted">Not enough stocks with a change yet.</p>;
  const W = 1000, H = 240, PAD = 12;
  const lo = Math.min(0, pts[0].v), hi = Math.max(0, pts[pts.length - 1].v), span = hi - lo || 1;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + ((hi - v) / span) * (H - 2 * PAD);
  const y0 = y(0);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${y0.toFixed(1)}L${x(0).toFixed(1)},${y0.toFixed(1)}Z`;
  const firstUp = pts.findIndex((p) => p.v > 0);
  const h = hover == null ? null : pts[hover];
  return (
    <figure className="oflow-curve">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Change of ${pts.length} F&O stocks, lowest to highest: from ${pct(pts[0].v)} (${pts[0].s}) to ${pct(pts[pts.length - 1].v)} (${pts[pts.length - 1].s}).`}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width * W - PAD) / (W - 2 * PAD) * (pts.length - 1)); setHover(Math.max(0, Math.min(pts.length - 1, i))); }}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <clipPath id="oflow-above"><rect x="0" y="0" width={W} height={y0} /></clipPath>
          <clipPath id="oflow-below"><rect x="0" y={y0} width={W} height={H - y0} /></clipPath>
          <linearGradient id="oflow-g-up" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--gain)" stopOpacity="0.55" /><stop offset="1" stopColor="var(--gain)" stopOpacity="0.06" /></linearGradient>
          <linearGradient id="oflow-g-down" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="var(--loss)" stopOpacity="0.55" /><stop offset="1" stopColor="var(--loss)" stopOpacity="0.06" /></linearGradient>
        </defs>
        <path d={area} fill="url(#oflow-g-up)" clipPath="url(#oflow-above)" />
        <path d={area} fill="url(#oflow-g-down)" clipPath="url(#oflow-below)" />
        <path d={line} fill="none" stroke="var(--gain)" strokeWidth="2.2" clipPath="url(#oflow-above)" vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke="var(--loss)" strokeWidth="2.2" clipPath="url(#oflow-below)" vectorEffect="non-scaling-stroke" />
        <line x1={PAD} x2={W - PAD} y1={y0} y2={y0} className="oflow-zero" vectorEffect="non-scaling-stroke" />
        {firstUp > 0 && <line x1={x(firstUp)} x2={x(firstUp)} y1={PAD} y2={H - PAD} className="oflow-split" vectorEffect="non-scaling-stroke" />}
        {h && hover != null && <><line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} className="oflow-cross" vectorEffect="non-scaling-stroke" />
          <circle cx={x(hover)} cy={y(h.v)} r="4.5" className={h.v >= 0 ? "oflow-dot gain" : "oflow-dot loss"} vectorEffect="non-scaling-stroke" /></>}
      </svg>
      {h && <div className="oflow-tip" style={{ left: `${(hover! / (pts.length - 1)) * 100}%` }}><b>{h.s}</b> <span className={tone(h.v)}>{pct(h.v)}</span></div>}
      <figcaption className="oflow-axis"><span className="loss">{pct(pts[0].v)} · {pts[0].s}</span><span className="muted">Each point is one stock, lowest change to highest</span><span className="gain">{pts[pts.length - 1].s} · {pct(pts[pts.length - 1].v)}</span></figcaption>
    </figure>
  );
}

const bandLabel = (b: FlowBand) => (b.from == null ? `below ${b.to}%` : b.to == null ? `above ${b.from}%` : `${b.from}% to ${b.to}%`);

/** How many stocks fall in each band of the day's change. */
export function Bands({ bands }: { bands: FlowBand[] }) {
  const max = Math.max(1, ...bands.map((b) => b.count));
  return (
    <ol className="oflow-bands" aria-label="Stocks by band of the day's change">{bands.map((b) => {
      const up = b.from != null && b.from >= 0;
      return (
        <li key={bandLabel(b)} title={`${b.count} stocks ${bandLabel(b)}`}>
          <span className="oflow-bandn">{b.count}</span>
          <span className={`oflow-bar ${up ? "gain" : "loss"}`} style={{ height: `${Math.max(3, (b.count / max) * 100)}%` }} />
          <small>{b.from == null ? `<${b.to}` : b.to == null ? `>${b.from}` : `${b.from > 0 ? "+" : ""}${b.from}`}</small>
        </li>);
    })}</ol>
  );
}

/** The day's path of one stock (change % at each snapshot). */
export function Spark({ values, positive }: { values: (number | null)[] | undefined; positive: boolean }) {
  const v = (values ?? []).map((n, i) => [i, n] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (v.length < 2) return <span className="oflow-spark empty" aria-hidden="true" />;
  const n = (values ?? []).length - 1 || 1, lo = Math.min(0, ...v.map((p) => p[1])), hi = Math.max(0, ...v.map((p) => p[1])), sp = hi - lo || 1;
  const d = v.map(([i, c], k) => `${k ? "L" : "M"}${((i / n) * 100).toFixed(1)},${(((hi - c) / sp) * 36 + 2).toFixed(1)}`).join("");
  return (
    <svg className="oflow-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="100" y1={((hi / sp) * 36 + 2).toFixed(1)} y2={((hi / sp) * 36 + 2).toFixed(1)} className="oflow-zero" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={positive ? "var(--gain)" : "var(--loss)"} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Dots({ s }: { s: FlowStock }) {
  const up = s.direction >= 0;
  const list = FACTS.map((f) => ({ text: up ? f.up : f.down, v: s.agreement.facts[f.key] }));
  const label = `${s.agreement.score} of ${s.agreement.of} facts agree: ${list.map((f) => `${f.text} — ${f.v == null ? "unknown" : f.v ? "yes" : "no"}`).join("; ")}`;
  return (
    <span className="oflow-dots" title={label} aria-label={label} role="img">
      {list.map((f, i) => <i key={i} className={f.v ? (up ? "on gain" : "on loss") : f.v == null ? "unk" : ""} />)}
    </span>
  );
}

export function StockCard({ s, lines }: { s: FlowStock; lines: FlowLines }) {
  const b = s.buildup ? BUILDUP[s.buildup] : null;
  return (
    <article className="card oflow-card" aria-labelledby={`oflow-c-${s.symbol}`}>
      <header>
        <div><h3 id={`oflow-c-${s.symbol}`}><Link to={`/stocks/${encodeURIComponent(s.symbol)}`}>{s.symbol}</Link></h3><small className="muted">{s.name}{s.sector ? ` · ${s.sector}` : ""}</small></div>
        <div className="oflow-px"><b>{inr(s.price)}</b><span className={`oflow-chg ${tone(s.changePct)}`}>{pct(s.changePct)}</span></div>
      </header>
      <Spark values={lines.change[s.symbol]} positive={(s.changePct ?? 0) >= 0} />
      <div className="oflow-tags">
        {b ? <span className={`oflow-pill ${b.tone}`} title={b.what}>{b.short}</span> : <span className="oflow-pill" title={s.notes.find((n) => n.startsWith("oi:"))?.slice(4) ?? "Open interest and price did not both move"}>No build-up</span>}
        <Dots s={s} />
      </div>
      <dl className="oflow-facts">
        <div><dt>OI change</dt><dd title="Open interest change against the previous close: more or fewer open positions, not a direction">{pct(s.oiChangePct)}</dd></div>
        <div><dt>vs VWAP</dt><dd className={tone(s.vwapGapPct)}>{s.vwap == null ? "—" : `${pct(s.vwapGapPct)}`}</dd></div>
        <div><dt>Zone</dt><dd>{s.zone ? ZONE[s.zone] : "—"}</dd></div>
      </dl>
    </article>
  );
}

function BuildupTiles({ sum }: { sum: FlowSummary }) {
  const total = BUILDUP_ORDER.reduce((n, k) => n + sum.buildups[k], 0) || 1;
  return (
    <div className="oflow-bu" role="list" aria-label="Futures build-up across F&O stocks">{BUILDUP_ORDER.map((k) => (
      <div role="listitem" key={k} className={`card oflow-bu-t ${BUILDUP[k].tone}`}>
        <span className="oflow-bu-n">{sum.buildups[k]}</span>
        <b>{BUILDUP[k].name}</b>
        <span className="oflow-meter"><i style={{ width: `${(sum.buildups[k] / total) * 100}%` }} /></span>
        <small className="muted">{BUILDUP[k].what}</small>
      </div>))}</div>
  );
}

function SectorBars({ sectors, active, onPick }: { sectors: FlowSector[]; active: string | null; onPick: (s: string | null) => void }) {
  const max = Math.max(0.5, ...sectors.map((s) => Math.abs(s.avgChangePct ?? 0)));
  return (
    <ul className="oflow-sec" aria-label="Sectors by average change">{sectors.map((s) => {
      const v = s.avgChangePct ?? 0, w = (Math.abs(v) / max) * 50;
      return (
        <li key={s.sector}>
          <button type="button" aria-pressed={active === s.sector} onClick={() => onPick(active === s.sector ? null : s.sector)}
            aria-label={`${s.sector}: average ${pct(s.avgChangePct)}, ${s.up} rising, ${s.down} falling of ${s.stocks}`}>
            <span className="oflow-sec-n">{s.sector}</span>
            <span className="oflow-sec-bar" aria-hidden="true"><i className={v >= 0 ? "gain" : "loss"} style={v >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} /></span>
            <span className={`oflow-sec-v ${tone(s.avgChangePct)}`}>{pct(s.avgChangePct)}</span>
            <small className="muted oflow-sec-c"><span className="gain">{s.up}↑</span> <span className="loss">{s.down}↓</span></small>
          </button>
        </li>);
    })}</ul>
  );
}

// ------------------------------------------------------------------------------------------------------------------ flow board

type Ready = Extract<FlowSnapshot, { ready: true }>;
type Focus = { sector?: string; bucket?: Bucket; up?: boolean };
const BUCKET_NAME: Record<Bucket, string> = { ...Object.fromEntries(Object.entries(BUILDUP).map(([k, v]) => [k, v.name])), none: "No build-up" } as Record<Bucket, string>;
const bucketTone = (b: Bucket) => (b === "none" ? "flat" : BUILDUP[b].tone);
const sameFocus = (a: Focus | null, b: Focus) => !!a && a.sector === b.sector && a.bucket === b.bucket && a.up === b.up;

function useNarrow(px: number) {
  const q = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setNarrow(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, [q]);
  return narrow;
}

const describeFocus = (f: Focus) => [f.up == null ? null : f.up ? "Rising" : "Falling", f.sector, f.bucket ? BUCKET_NAME[f.bucket] : null].filter(Boolean).join(" · ");

/** Every stock's line flowing into Rising or Falling, then into its sector, then into its futures build-up. Hover lights one path; a click lists its stocks. */
export function FlowBoard({ d }: { d: Ready }) {
  const narrow = useNarrow(720);
  const order = useMemo(() => d.summary.sectors.map((s) => s.sector), [d]);
  const board = useMemo(() => layout(d.stocks, d.lines, order), [d, order]);
  const [hot, setHot] = useState<Focus | null>(null);
  const [pick, setPick] = useState<Focus | null>(null);
  const [all, setAll] = useState(false);
  const bySym = useMemo(() => new Map(d.stocks.map((s) => [s.symbol, s])), [d]);
  const combos = useMemo(() => new Set(d.stocks.filter((s) => s.changePct).map((s) => `${s.sector || "Other"}|${(s.changePct as number) > 0}|${bucketOf(s)}`)), [d]);
  const f = hot ?? pick;
  const has = (sector: string | undefined, up: boolean | undefined, bucket: Bucket | undefined) =>
    [...combos].some((c) => { const [cs, cu, cb] = c.split("|"); return (!sector || cs === sector) && (up == null || cu === String(up)) && (!bucket || cb === bucket); });
  const lit = (sector?: string, up?: boolean, bucket?: Bucket) => !f || (
    (!f.sector || !sector || f.sector === sector) && (f.up == null || up == null || f.up === up) && (!f.bucket || !bucket || f.bucket === bucket)
    && has(sector ?? f.sector, up ?? f.up, bucket ?? f.bucket));
  const choose = (x: Focus) => { setPick(sameFocus(pick, x) ? null : x); setAll(false); };
  const act = (x: Focus, label: string) => ({
    role: "button", tabIndex: 0, "aria-label": label, "aria-pressed": sameFocus(pick, x),
    onMouseEnter: () => setHot(x), onMouseLeave: () => setHot(null), onFocus: () => setHot(x), onBlur: () => setHot(null),
    onClick: () => choose(x), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(x); } },
  });
  const chosen = pick ? d.stocks.filter((s) => s.changePct && (!pick.sector || (s.sector || "Other") === pick.sector) && (pick.up == null || ((s.changePct as number) > 0) === pick.up) && (!pick.bucket || bucketOf(s) === pick.bucket)) : [];
  const B = board, cut = B.W * 0.47;
  const linesSvg = (crop: boolean) => (
    <svg viewBox={`0 0 ${crop ? cut : B.W} ${B.H}`} className={`oflow-board-svg${crop ? " crop" : ""}`} role="img" aria-label={`The day's line of ${B.lines.length} F&O stocks flowing into ${B.rising.count} rising and ${B.falling.count} falling${crop ? "" : `, then into ${B.sectors.length} sectors and the futures build-ups`}.`}>
      <line x1="16" x2={B.W * 0.36} y1={B.zeroY} y2={B.zeroY} className="oflow-zero" />
      {B.times.map((t) => <text key={t.label} x={t.x} y={B.H - 2} className="oflow-t" textAnchor="middle">{t.label}</text>)}
      <g className="oflow-lines">{B.lines.map((l) => {
        const s = bySym.get(l.symbol)!;
        const on = lit(l.sector, l.up, bucketOf(s));
        return <path key={l.symbol} d={l.d} className={`${l.up ? "gain" : "loss"}${f ? (on ? " lit" : " dim") : ""}`}><title>{`${l.symbol} ${pct(s.changePct)}`}</title></path>;
      })}</g>
      {[{ r: B.rising, up: true, name: "Rising" }, { r: B.falling, up: false, name: "Falling" }].map(({ r, up, name }) => (
        <g key={name} className={`oflow-node ${up ? "gain" : "loss"}${f && !lit(undefined, up) ? " dim" : ""}`} {...act({ up }, `${name}: ${r.count} stocks`)}>
          <rect x={r.x} y={r.y} width={r.w} height={Math.max(2, r.h)} />
          {!crop && <text x={r.x + r.w / 2} y={up ? r.y - 8 : r.y + r.h + 18} textAnchor="middle" className="oflow-node-t"><tspan className="n">{r.count}</tspan> {name.toLowerCase()}</text>}
        </g>))}
      {!crop && <>
        <g className="oflow-ribbons">{B.ribbons.map((r) => (
          <path key={r.key} d={ribbonPath(r)} className={`${r.up ? "gain" : "loss"}${f ? (lit(r.sector, r.up, r.bucket) ? " lit" : " dim") : ""}`}><title>{`${r.sector}${r.bucket ? ` → ${BUCKET_NAME[r.bucket]}` : ""}: ${r.count} ${r.up ? "rising" : "falling"}`}</title></path>))}</g>
        {B.sectors.map((s) => (
          <g key={s.sector} className={`oflow-sbox${f && !lit(s.sector) ? " dim" : ""}${pick?.sector === s.sector ? " on" : ""}`} {...act({ sector: s.sector }, `${s.sector}: ${s.up} rising, ${s.down} falling`)}>
            <rect x={s.x} y={s.y} width={s.w} height={s.up * B.unit} className="gain" />
            <rect x={s.x} y={s.y + s.up * B.unit} width={s.w} height={s.down * B.unit} className="loss" />
            <rect x={s.x} y={s.y} width={s.w} height={s.h} className="frame" />
            {s.h >= 15 && <text x={s.x + 8} y={s.y + (s.h >= 30 ? s.h / 2 - 2 : s.h / 2 + 4)} className="oflow-sbox-t">{s.sector.length > 22 ? s.sector.slice(0, 21) + "…" : s.sector}</text>}
            {s.h >= 30 && <text x={s.x + 8} y={s.y + s.h / 2 + 13} className="oflow-sbox-c"><tspan className="gain">{s.up}↑</tspan> <tspan className="loss">{s.down}↓</tspan></text>}
            <title>{`${s.sector}: ${s.up} rising, ${s.down} falling`}</title>
          </g>))}
        {B.buckets.map((b) => (
          <g key={b.bucket} className={`oflow-bbox ${bucketTone(b.bucket)}${f && !lit(undefined, undefined, b.bucket) ? " dim" : ""}${pick?.bucket === b.bucket ? " on" : ""}`} {...act({ bucket: b.bucket }, `${BUCKET_NAME[b.bucket]}: ${b.count} stocks`)}>
            <rect x={b.x} y={b.y} width={b.w} height={Math.max(2, b.h)} />
            <text x={b.x + 10} y={b.y + Math.max(2, b.h) / 2 + 5} className="oflow-bbox-t"><tspan className="n">{b.count}</tspan> {BUCKET_NAME[b.bucket]}</text>
          </g>))}
      </>}
    </svg>
  );
  const sectorRows = (
    <ul className="oflow-srows" aria-label="Sectors and their build-ups">{B.sectors.map((s) => {
      const g = d.stocks.filter((x) => x.changePct && (x.sector || "Other") === s.sector);
      return (
        <li key={s.sector}><button type="button" aria-pressed={pick?.sector === s.sector} onClick={() => choose({ sector: s.sector })} aria-label={`${s.sector}: ${s.up} rising, ${s.down} falling`}>
          <span className="oflow-srow-n">{s.sector}</span>
          <span className="oflow-srow-bar" aria-hidden="true">{BUCKETS.map((k) => { const c = g.filter((x) => bucketOf(x) === k).length; return c ? <i key={k} className={bucketTone(k)} style={{ flex: c }} title={`${BUCKET_NAME[k]}: ${c}`} /> : null; })}</span>
          <small><span className="gain">{s.up}↑</span> <span className="loss">{s.down}↓</span></small>
        </button></li>);
    })}</ul>
  );
  return (
    <section className="card oflow-board" aria-labelledby="oflow-board-h">
      <div className="oflow-hero-h">
        <div><h2 id="oflow-board-h">Flow board</h2><p className="muted">Each stock's line of the day flows into rising or falling, then its sector, then its futures build-up. {narrow ? "Tap" : "Point at or choose"} a part to follow it.</p></div>
      </div>
      {narrow ? <>
        <div className="oflow-dirs" role="group" aria-label="Direction">{[{ up: true, n: B.rising.count, name: "rising" }, { up: false, n: B.falling.count, name: "falling" }].map((x) => (
          <button key={x.name} type="button" className={`oflow-bchip ${x.up ? "gain" : "loss"}`} aria-pressed={pick?.up === x.up && !pick.sector && !pick.bucket} onClick={() => choose({ up: x.up })}><b>{x.n}</b> {x.name}</button>))}</div>
        {linesSvg(true)}{sectorRows}
        <div className="oflow-bchips" role="group" aria-label="Build-ups">{B.buckets.map((b) => (
          <button key={b.bucket} type="button" className={`oflow-bchip ${bucketTone(b.bucket)}`} aria-pressed={pick?.bucket === b.bucket} onClick={() => choose({ bucket: b.bucket })}><b>{b.count}</b> {BUCKET_NAME[b.bucket]}</button>))}</div></>
        : <div className="oflow-board-wrap">{linesSvg(false)}
          <div className="oflow-cols muted" aria-hidden="true"><span style={{ left: "1.5%" }}>Line of the day</span><span style={{ left: "41%" }}>Direction</span><span style={{ left: "58%" }}>Sector</span><span style={{ left: "86%" }}>Futures build-up</span></div></div>}
      <div className="oflow-legend muted">
        <span><i className="sw gain" />Rising</span><span><i className="sw loss" />Falling</span>
        {BUCKETS.map((b) => <span key={b} title={b === "none" ? "Price and open interest did not both move, or the open interest change is not known yet" : BUILDUP[b].what}><i className={`sw ${bucketTone(b)}`} />{BUCKET_NAME[b]}</span>)}
      </div>
      <div className="oflow-pick" aria-live="polite">
        {pick ? <>
          <div className="oflow-top-h"><h3 className="oflow-side">{describeFocus(pick)}: {chosen.length} stock{chosen.length === 1 ? "" : "s"}</h3>
            <button type="button" className="chip" onClick={() => setPick(null)}>Clear ✕</button></div>
          <div className="oflow-cards">{(all ? chosen : chosen.slice(0, 12)).map((s) => <StockCard key={s.symbol} s={s} lines={d.lines} />)}</div>
          {chosen.length > 12 && !all && <button type="button" className="btn oflow-more" onClick={() => setAll(true)}>Show all {chosen.length}</button>}
        </> : <p className="muted">Choose a direction, a sector or a build-up to list its stocks, in the order of how many facts line up.</p>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------------ market depth

function Depth({ d }: { d: Ready }) {
  const [sector, setSector] = useState<string | null>(null);
  const sum = d.summary;
  const known = sum.up + sum.down + sum.flat || 1;
  const stocks = sector ? d.stocks.filter((s) => (s.sector || "Other") === sector) : d.stocks;
  const rising = stocks.filter((s) => s.direction > 0).slice(0, 6), falling = stocks.filter((s) => s.direction < 0).slice(0, 6);
  return (
    <>
      <section className="card oflow-hero" aria-labelledby="oflow-depth-h">
        <div className="oflow-hero-h">
          <div><h2 id="oflow-depth-h">Market depth</h2><p className="muted">Where every F&O stock stands against its previous close.</p></div>
          <div className="oflow-count" aria-label={`${sum.up} rising, ${sum.down} falling`}>
            <span className="gain"><b>{sum.up}</b>rising</span><span className="loss"><b>{sum.down}</b>falling</span>
          </div>
        </div>
        <div className="oflow-breadth" aria-hidden="true"><i className="gain" style={{ width: `${(sum.up / known) * 100}%` }} /><i className="flat" style={{ width: `${(sum.flat / known) * 100}%` }} /><i className="loss" style={{ width: `${(sum.down / known) * 100}%` }} /></div>
        <DepthCurve stocks={d.stocks} />
        <div className="oflow-bandwrap"><h3>Stocks by band of change</h3><Bands bands={sum.distribution} />
          <p className="muted oflow-median">Middle stock: <b className={tone(sum.medianChangePct)}>{pct(sum.medianChangePct)}</b></p></div>
      </section>

      <section aria-labelledby="oflow-bu-h" className="oflow-sec-wrap">
        <h2 id="oflow-bu-h" className="oflow-h">Futures build-up</h2>
        <p className="muted oflow-sub">Price change and open interest change of each stock's futures (current and next month) against the previous session.</p>
        <BuildupTiles sum={sum} />
      </section>

      <div className="oflow-two">
        <section aria-labelledby="oflow-sec-h" className="card oflow-secbox">
          <h2 id="oflow-sec-h" className="oflow-h">Sectors</h2>
          <p className="muted oflow-sub">Average change of the F&O stocks in each sector. Choose one to see only its stocks below.</p>
          <SectorBars sectors={sum.sectors} active={sector} onPick={setSector} />
        </section>
        <section aria-labelledby="oflow-top-h" className="oflow-top">
          <div className="oflow-top-h"><h2 id="oflow-top-h" className="oflow-h">Most facts lined up</h2>{sector && <button type="button" className="chip" onClick={() => setSector(null)}>{sector} ✕</button>}</div>
          <p className="muted oflow-sub">Ordered by how many of five facts point the same way as the move, then by the size of the open interest change. A count of facts, not a forecast.</p>
          <h3 className="oflow-side gain"><Icon name="growth" /> Rising</h3>
          <div className="oflow-cards">{rising.length ? rising.map((s) => <StockCard key={s.symbol} s={s} lines={d.lines} />) : <p className="muted">No rising stock{sector ? " in this sector" : ""}.</p>}</div>
          <h3 className="oflow-side loss"><Icon name="decline" /> Falling</h3>
          <div className="oflow-cards">{falling.length ? falling.map((s) => <StockCard key={s.symbol} s={s} lines={d.lines} />) : <p className="muted">No falling stock{sector ? " in this sector" : ""}.</p>}</div>
        </section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------------------------ page

function Flow({ view }: { view: string }) {
  const live = marketLive();
  const q = useQuery({ queryKey: ["lab-flow"], queryFn: flowSnapshot, refetchInterval: live ? 60_000 : false, retry: false });
  if (q.isPending) return <div className="skeleton" style={{ height: 420 }} aria-label="Loading the latest snapshot" />;
  if (q.isError) return <div className="formerr" role="alert">The snapshot could not be loaded right now. It refreshes by itself; reload in a minute.</div>;
  const d = q.data;
  if (!d.ready) return <div className="card oflow-wait" role="status"><span className="tlab-ic" aria-hidden="true"><Icon name="activity" /></span><div><h2>No snapshot yet</h2><p className="muted">{d.reason}</p></div></div>;
  const taken = new Date(d.takenAt);
  const today = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60_000).toISOString().slice(0, 10);
  const day = new Date(d.tradeDay + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return (
    <>
      <div className="oflow-stamp" role="status">
        <span className={`oflow-live ${live && d.tradeDay === today ? "on" : ""}`}><i aria-hidden="true" />{live && d.tradeDay === today ? "Live · every 3 minutes" : "Last session"}</span>
        <span className="muted">{day} · snapshot at {taken.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST · {d.summary.stocks} F&O stocks</span>
      </div>
      {d.notes.map((n) => <p key={n} className="oflow-note muted">{n}</p>)}
      {view === "board" ? <FlowBoard d={d} /> : <Depth d={d} />}
      <p className="muted oflow-method">How it is worked out: change against the previous close; open interest summed over the current and next futures contract against their previous close; VWAP is the day's average traded price; pivots are the classic floor pivots from the previous session's high, low and close. Facts: open interest rose with the move, price on the move's side of VWAP, price beyond R1 or S1, open interest changed 5% or more, price in the top or bottom quarter of the day's range. Source: exchange prices and open interest through Dhan, FinLit's daily prices.</p>
    </>
  );
}

export function OrderFlowPage() {
  useDocTitle("Order Flow · Trading Lab", "How every NSE F&O stock is moving: market depth, the flow board, futures build-up, sectors and the stocks with the most facts lined up. Not investment advice.");
  const { user, ready } = useAuth();
  const q = useQuery({ queryKey: ["lab-access", user?.id ?? ""], queryFn: labAccess, enabled: ready, retry: false });
  const [params] = useSearchParams();
  const view = FLOW_TABS.find((t) => t.ready && t.id === params.get("view"))?.id ?? "depth";
  const a = q.data;
  return (
    <>
      <section className="pagehead"><div className="aurora" style={{ opacity: 0.6 }} /><div className="wrap">
        <div className="eyebrow"><Link to="/lab">Trading Lab</Link></div>
        <h1 className="ui-title">Order Flow</h1>
        <p>How every NSE F&O stock is moving, from prices and futures open interest, refreshed every few minutes in market hours.</p></div></section>
      <section className="sec" style={{ paddingTop: 16 }}><div className="wrap tlab oflow">
        {(!ready || q.isPending) && <div className="skeleton" style={{ height: 160 }} aria-label="Checking your access" />}
        {q.isError && <div className="formerr" role="alert">Your access could not be checked right now. Reload the page in a moment.</div>}
        {a && !a.access && <LabGate reason={a.reason === "sign_in" ? "sign_in" : "not_granted"} next="/lab/flow" />}
        {a?.access && <>
          <nav className="oflow-tabs" aria-label="Order Flow views">{FLOW_TABS.map((t) => t.ready
            ? <Link key={t.id} to={t.id === "depth" ? "/lab/flow" : `/lab/flow?view=${t.id}`} className="oflow-tab" aria-current={view === t.id ? "page" : undefined}>{t.name}</Link>
            : <span key={t.id} className="oflow-tab" aria-disabled="true" title="Being built">{t.name}<small>Soon</small></span>)}</nav>
          <Flow view={view} />
        </>}
        <div className="pdisc tlab-disc" role="note" aria-labelledby="oflow-disc-h"><h2 id="oflow-disc-h">Disclaimer</h2><p>{DISCLAIMER}</p></div>
      </div></section>
    </>
  );
}
