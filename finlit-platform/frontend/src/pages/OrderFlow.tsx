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
import { BUCKETS, bucketOf, layout, type Bucket } from "../lib/flowboard";
import { flowMap } from "../lib/flowmap";
import { cr, headline, moneyFlow, type MoneyFlow, type MoneySector, type MoneyStock } from "../lib/money";
import { LabGate } from "./TradingLab";
import { ChartZoom } from "../components/ChartZoom";
import { OptionPulse } from "../components/lab/OptionPulse";
import { StockZones } from "../components/lab/StockZones";
import { RiskReadout } from "../components/lab/RiskReadout";
import { BucketPop, Candles, DirectionPop, SectorPop, StockPop, TipLayer, tiltHandlers, useTip } from "../components/lab/FlowTips";
import "../styles/portfolio-disc.css";
import "../styles/tradinglab.css";
import "../styles/orderflow.css";

export const FLOW_TABS = [
  { id: "depth", name: "Market depth", ready: true },
  { id: "board", name: "Flow board", ready: true },
  { id: "money", name: "Money Flow", ready: true },
  { id: "options", name: "Option Pulse", ready: true },
  { id: "zones", name: "Stock zones", ready: true },
  { id: "risk", name: "Risk read-out", ready: true },
  { id: "journal", name: "Trading journal", ready: false },
];

const DISCLAIMER = "Order Flow describes how F&O stocks are moving from exchange prices and futures open interest, worked out by fixed formulas and shown with a delay of a few minutes. It does not tell anyone to buy, sell or hold, it never places an order, and a build-up or a count of facts is not a forecast. Intraday and F&O trading carry a high risk of loss; most people who trade them lose money. Information only, not investment advice.";

// ------------------------------------------------------------------------------------------------------------------ charts

/** Pointer handlers that show a hover card (mouse and pen) and hide it on leave; touch keeps its tap behaviour. */
function useHover() {
  const tip = useTip();
  return (body: () => React.ReactNode) => ({
    onPointerMove: (e: React.PointerEvent) => tip.show(e, body()),
    onPointerLeave: () => tip.hide(),
  });
}

/** Every stock's change, lowest to highest, as one glowing curve: the area above zero in the rising colour, below in the falling colour. */
export function DepthCurve({ stocks, lines }: { stocks: FlowStock[]; lines?: FlowLines }) {
  const tip = useTip();
  const pts = useMemo(() => stocks.filter((s) => s.changePct != null).map((s) => ({ s: s.symbol, v: s.changePct as number, st: s })).sort((a, b) => a.v - b.v), [stocks]);
  const [hover, setHover] = useState<number | null>(null);
  if (pts.length < 2) return <p className="muted">Not enough stocks with a change yet.</p>;
  const W = 1000, H = 260, PAD = 14;
  const lo = Math.min(0, pts[0].v), hi = Math.max(0, pts[pts.length - 1].v), span = hi - lo || 1;
  const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + ((hi - v) / span) * (H - 2 * PAD);
  const y0 = y(0);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${y0.toFixed(1)}L${x(0).toFixed(1)},${y0.toFixed(1)}Z`;
  const firstUp = pts.findIndex((p) => p.v > 0);
  const down = firstUp < 0 ? pts.length : pts.filter((p) => p.v < 0).length, up = pts.filter((p) => p.v > 0).length;
  const step = span > 12 ? 4 : span > 6 ? 2 : span > 3 ? 1 : 0.5;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(2));
  const h = hover == null ? null : pts[hover];
  const at = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width * W - PAD) / (W - 2 * PAD) * (pts.length - 1));
    return Number.isFinite(i) ? Math.max(0, Math.min(pts.length - 1, i)) : 0;   // a chart with no width yet (still laying out) points at the first stock
  };
  return (
    <figure className="oflow-curve">
      <ChartZoom label="Market depth curve"><div className="oflow-curve-plot">
        <div className="oflow-yaxis" aria-hidden="true">{ticks.map((t) => <span key={t} style={{ top: `${(y(t) / H) * 100}%` }} className={t > 0 ? "gain" : t < 0 ? "loss" : ""}>{pct(t, step < 1 ? 1 : 0)}</span>)}</div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
          aria-label={`Change of ${pts.length} F&O stocks, lowest to highest: from ${pct(pts[0].v)} (${pts[0].s}) to ${pct(pts[pts.length - 1].v)} (${pts[pts.length - 1].s}).`}
          onPointerMove={(e) => { const i = at(e); setHover(i); if (lines) tip.show(e, <StockPop s={pts[i].st} lines={lines} />); }}
          onPointerLeave={() => { setHover(null); tip.hide(); }}>
          <defs>
            <clipPath id="oflow-above"><rect x="0" y="0" width={W} height={y0} /></clipPath>
            <clipPath id="oflow-below"><rect x="0" y={y0} width={W} height={H - y0} /></clipPath>
            <linearGradient id="oflow-g-up" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--gain)" stopOpacity="0.75" /><stop offset="1" stopColor="var(--gain)" stopOpacity="0.08" /></linearGradient>
            <linearGradient id="oflow-g-down" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="var(--loss)" stopOpacity="0.75" /><stop offset="1" stopColor="var(--loss)" stopOpacity="0.08" /></linearGradient>
          </defs>
          {ticks.map((t) => <line key={t} x1={PAD} x2={W - PAD} y1={y(t)} y2={y(t)} className={t === 0 ? "oflow-zero" : "oflow-grid"} vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill="url(#oflow-g-up)" clipPath="url(#oflow-above)" className="oflow-fade" />
          <path d={area} fill="url(#oflow-g-down)" clipPath="url(#oflow-below)" className="oflow-fade" />
          <path d={line} pathLength={1} className="oflow-curve-ln gain oflow-draw" clipPath="url(#oflow-above)" vectorEffect="non-scaling-stroke" />
          <path d={line} pathLength={1} className="oflow-curve-ln loss oflow-draw" clipPath="url(#oflow-below)" vectorEffect="non-scaling-stroke" />
          {firstUp > 0 && <line x1={x(firstUp)} x2={x(firstUp)} y1={PAD} y2={H - PAD} className="oflow-split" vectorEffect="non-scaling-stroke" />}
          {h && hover != null && <><line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} className="oflow-cross" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={y(h.v)} r="5" className={h.v >= 0 ? "oflow-dot gain" : "oflow-dot loss"} vectorEffect="non-scaling-stroke" /></>}
        </svg>
        {firstUp > 0 && <span className="oflow-cross-lbl" style={{ left: `${(x(firstUp) / W) * 100}%`, top: `${(y0 / H) * 100}%` }} aria-hidden="true">
          <b className="loss">← {down} falling</b><i /><b className="gain">{up} rising →</b></span>}
        {h && !lines && <div className="oflow-tip" style={{ left: `${(hover! / (pts.length - 1)) * 100}%` }}><b>{h.s}</b> <span className={tone(h.v)}>{pct(h.v)}</span></div>}
      </div></ChartZoom>
      <figcaption className="oflow-axis"><span className="loss">{pct(pts[0].v)} · {pts[0].s}</span><span className="muted">Each point is one stock, lowest change to highest. Point at the curve for its detail.</span><span className="gain">{pts[pts.length - 1].s} · {pct(pts[pts.length - 1].v)}</span></figcaption>
    </figure>
  );
}

const bandLabel = (b: FlowBand) => (b.from == null ? `below ${b.to}%` : b.to == null ? `above ${b.from}%` : `${b.from}% to ${b.to}%`);
const inBand = (b: FlowBand, v: number) => (b.from == null || v >= b.from) && (b.to == null || v < b.to);

function BandPop({ band, stocks }: { band: FlowBand; stocks: FlowStock[] }) {
  const g = stocks.filter((s) => s.changePct != null && inBand(band, s.changePct)).sort((a, b) => (b.changePct as number) - (a.changePct as number));
  return (
    <>
      <header className="oflow-pop-h"><div><b>Change {bandLabel(band)}</b><small>{band.count} stock{band.count === 1 ? "" : "s"}</small></div></header>
      {g.length > 0 && <div className="oflow-pop-movers one"><div>{g.slice(0, 8).map((s) => <p key={s.symbol}>{s.symbol}<span className="muted">{s.sector ?? ""}</span><span className={tone(s.changePct)}>{pct(s.changePct)}</span></p>)}
        {g.length > 8 && <small>and {g.length - 8} more</small>}</div></div>}
    </>
  );
}

/** How many stocks fall in each band of the day's change, as raised bars. */
export function Bands({ bands, stocks = [] }: { bands: FlowBand[]; stocks?: FlowStock[] }) {
  const hover = useHover();
  const max = Math.max(1, ...bands.map((b) => b.count));
  return (
    <ol className="oflow-bands" aria-label="Stocks by band of the day's change">{bands.map((b) => {
      const up = b.from != null && b.from >= 0;
      return (
        <li key={bandLabel(b)} title={`${b.count} stocks ${bandLabel(b)}`} {...hover(() => <BandPop band={b} stocks={stocks} />)}>
          <span className="oflow-bandn">{b.count}</span>
          <span className={`oflow-bar ${up ? "gain" : "loss"}`} style={{ height: `${Math.max(3, (b.count / max) * 100)}%` }} />
          <small>{b.from == null ? `<${b.to}` : b.to == null ? `>${b.from}` : `${b.from > 0 ? "+" : ""}${b.from}`}</small>
        </li>);
    })}</ol>
  );
}

/** The day's path of one stock (change % at each snapshot), with a soft area under it. */
export function Spark({ values, positive }: { values: (number | null)[] | undefined; positive: boolean }) {
  const v = (values ?? []).map((n, i) => [i, n] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (v.length < 2) return <span className="oflow-spark empty" aria-hidden="true" />;
  const n = (values ?? []).length - 1 || 1, lo = Math.min(0, ...v.map((p) => p[1])), hi = Math.max(0, ...v.map((p) => p[1])), sp = hi - lo || 1;
  const pts = v.map(([i, c]) => [(i / n) * 100, ((hi - c) / sp) * 36 + 2] as const);
  const d = pts.map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const z = ((hi / sp) * 36 + 2).toFixed(1);
  return (
    <svg className="oflow-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d}L${pts[pts.length - 1][0].toFixed(1)},${z}L${pts[0][0].toFixed(1)},${z}Z`} className={`oflow-spark-a ${positive ? "gain" : "loss"}`} />
      <line x1="0" x2="100" y1={z} y2={z} className="oflow-zero" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={positive ? "var(--gain)" : "var(--loss)"} strokeWidth="2" vectorEffect="non-scaling-stroke" className="oflow-spark-l" />
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
  const tip = useTip(), tilt = tiltHandlers();
  return (
    <article className={`card oflow-card oflow-3d ${s.direction >= 0 ? "up" : "down"}`} aria-labelledby={`oflow-c-${s.symbol}`}
      onPointerMove={(e) => { tilt.onPointerMove(e); tip.show(e, <StockPop s={s} lines={lines} />); }}
      onPointerLeave={(e) => { tilt.onPointerLeave(e); tip.hide(); }}>
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

/** A ring showing one build-up's share of all build-ups. */
function Ring({ share, tone: t }: { share: number; tone: "gain" | "loss" }) {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <svg className={`oflow-ring ${t}`} viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={r} className="oflow-ring-bg" />
      <circle cx="28" cy="28" r={r} className="oflow-ring-fg" strokeDasharray={`${(share * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 28 28)" />
      <text x="28" y="32" textAnchor="middle" className="oflow-ring-t">{Math.round(share * 100)}%</text>
    </svg>
  );
}

function BuildupTiles({ sum, stocks = [] }: { sum: FlowSummary; stocks?: FlowStock[] }) {
  const tip = useTip();
  const total = BUILDUP_ORDER.reduce((n, k) => n + sum.buildups[k], 0) || 1;
  return (
    <div className="oflow-bu" role="list" aria-label="Futures build-up across F&O stocks">{BUILDUP_ORDER.map((k) => {
      const tilt = tiltHandlers();
      return (
        <div role="listitem" key={k} className={`card oflow-bu-t oflow-3d ${BUILDUP[k].tone}`}
          onPointerMove={(e) => { tilt.onPointerMove(e); tip.show(e, <BucketPop bucket={k} stocks={stocks} />); }}
          onPointerLeave={(e) => { tilt.onPointerLeave(e); tip.hide(); }}>
          <div className="oflow-bu-top">
            <span className="oflow-bu-ic" aria-hidden="true"><Icon name={BUILDUP[k].tone === "gain" ? "growth" : "decline"} /></span>
            <Ring share={sum.buildups[k] / total} tone={BUILDUP[k].tone} />
          </div>
          <span className="oflow-bu-n">{sum.buildups[k]}</span>
          <b>{BUILDUP[k].name}</b>
          <span className="oflow-meter"><i style={{ width: `${(sum.buildups[k] / total) * 100}%` }} /></span>
          <small className="muted">{BUILDUP[k].what}</small>
        </div>);
    })}</div>
  );
}

function SectorBars({ sectors, active, onPick, stocks = [] }: { sectors: FlowSector[]; active: string | null; onPick: (s: string | null) => void; stocks?: FlowStock[] }) {
  const hover = useHover();
  const max = Math.max(0.5, ...sectors.map((s) => Math.abs(s.avgChangePct ?? 0)));
  return (
    <ul className="oflow-sec" aria-label="Sectors by average change">{sectors.map((s) => {
      const v = s.avgChangePct ?? 0, w = (Math.abs(v) / max) * 50;
      return (
        <li key={s.sector} {...hover(() => <SectorPop sector={s.sector} stocks={stocks} />)}>
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

/** One stock's feature card on the Flow board (the most facts lined up): big change, build-up, a ring of the facts, 15-minute candles with levels. */
function FeatureCard({ s, lines, onHot }: { s: FlowStock; lines: FlowLines; onHot: (sym: string | null) => void }) {
  const tip = useTip(), tilt = tiltHandlers();
  const b = s.buildup ? BUILDUP[s.buildup] : null, up = (s.changePct ?? 0) >= 0, pv = s.pivots;
  const r = 15, c = 2 * Math.PI * r, share = s.agreement.of ? s.agreement.score / s.agreement.of : 0;
  return (
    <article className={`card oflow-feat-c oflow-3d ${up ? "up" : "down"}`} aria-label={`${s.symbol}, one of the largest ${up ? "rises" : "falls"}`}
      onPointerMove={(e) => { tilt.onPointerMove(e); onHot(s.symbol); tip.show(e, <StockPop s={s} lines={lines} />); }}
      onPointerLeave={(e) => { tilt.onPointerLeave(e); onHot(null); tip.hide(); }}>
      <header>
        <div><h4 id={`oflow-f-${s.symbol}`}><Link to={`/stocks/${encodeURIComponent(s.symbol)}`}>{s.symbol}</Link></h4><small className="muted">{s.sector ?? s.name}</small></div>
        <svg className={`oflow-fring ${up ? "gain" : "loss"}`} viewBox="0 0 40 40" role="img" aria-label={`${s.agreement.score} of ${s.agreement.of} facts agree`}>
          <circle cx="20" cy="20" r={r} className="oflow-ring-bg" /><circle cx="20" cy="20" r={r} className="oflow-ring-fg" strokeDasharray={`${(share * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 20 20)" />
          <text x="20" y="24" textAnchor="middle" className="oflow-ring-t">{s.agreement.score}/{s.agreement.of}</text></svg>
      </header>
      <div className="oflow-feat-m">
        <div><span className={`oflow-pill ${b?.tone ?? ""}`}>{b ? b.name : "No build-up"}</span>
          <b className={`oflow-feat-p ${tone(s.changePct)}`}>{pct(s.changePct)}</b><small>{inr(s.price)} <span className={tone(s.change)}>{s.change == null ? "" : `${s.change > 0 ? "+" : ""}${s.change.toFixed(2)}`}</span></small></div>
        <Candles s={s} lines={lines} h={96} levels />
      </div>
      <dl className="oflow-feat-l">
        <div><dt>S1</dt><dd>{pv ? pv.s1.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</dd></div>
        <div><dt>Zone</dt><dd>{s.zone ? ZONE[s.zone].replace("Between ", "").replace(" and ", "–") : "—"}</dd></div>
        <div><dt>R1</dt><dd>{pv ? pv.r1.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</dd></div>
        <div><dt>OI</dt><dd>{pct(s.oiChangePct, 1)}</dd></div>
      </dl>
    </article>
  );
}

/** Every stock's line of the day ending in its tick of the tower (rising above, falling below), and from there to its own tile. Point at anything to
 *  light that stock's whole path and see its detail; choose a sector, a direction or a build-up to list its stocks. */
export function FlowBoard({ d }: { d: Ready }) {
  const narrow = useNarrow(720);
  const tip = useTip();
  const order = useMemo(() => d.summary.sectors.map((s) => s.sector), [d]);
  const board = useMemo(() => layout(d.stocks, d.lines, order), [d, order]);
  const [every, setEvery] = useState(false);
  const map = useMemo(() => flowMap(d.stocks, d.lines, { W: 1200, H: 1320, perSide: every ? 40 : 24 }), [d, every]);
  const [hot, setHot] = useState<Focus | null>(null);
  const [hotSym, setHotSym] = useState<string | null>(null);
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
  const litSym = (sym: string) => { const s = bySym.get(sym)!; return hotSym ? sym === hotSym : lit(s.sector || "Other", (s.changePct ?? 0) > 0, bucketOf(s)); };
  const state = (sym: string) => (hotSym || f ? (litSym(sym) ? " lit" : " dim") : "");
  const choose = (x: Focus) => { setPick(sameFocus(pick, x) ? null : x); setAll(false); };
  const act = (x: Focus, label: string) => ({
    role: "button", tabIndex: 0, "aria-label": label, "aria-pressed": sameFocus(pick, x),
    onMouseEnter: () => setHot(x), onMouseLeave: () => setHot(null), onFocus: () => setHot(x), onBlur: () => setHot(null),
    onClick: () => choose(x), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(x); } },
  });
  const stockHover = (sym: string) => ({
    onPointerMove: (e: React.PointerEvent) => { setHotSym(sym); tip.show(e, <StockPop s={bySym.get(sym)!} lines={d.lines} rank={rankOf(sym)} />); },
    onPointerLeave: () => { setHotSym(null); tip.hide(); },
  });
  const rankOf = (sym: string) => {   // where the stock stands by its change among the stocks moving its way
    const s = bySym.get(sym)!, upS = (s.changePct ?? 0) > 0;
    const side = d.stocks.filter((x) => x.changePct && ((x.changePct as number) > 0) === upS).sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number));
    return `#${side.findIndex((x) => x.symbol === sym) + 1} of ${side.length} ${upS ? "rising" : "falling"}`;
  };
  const chosen = pick ? d.stocks.filter((s) => s.changePct && (!pick.sector || (s.sector || "Other") === pick.sector) && (pick.up == null || ((s.changePct as number) > 0) === pick.up) && (!pick.bucket || bucketOf(s) === pick.bucket)) : [];
  const B = board, cut = B.W * 0.47, M = map;
  const avgOf = new Map(d.summary.sectors.map((x) => [x.sector, x.avgChangePct]));
  const feat = (up: boolean) => d.stocks.filter((s) => s.changePct && ((s.changePct as number) > 0) === up).sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number)).slice(0, 3);
  const bucketChips = (
    <div className="oflow-bchips" role="group" aria-label="Build-ups">{B.buckets.map((b) => (
      <button key={b.bucket} type="button" className={`oflow-bchip ${bucketTone(b.bucket)}`} aria-pressed={pick?.bucket === b.bucket} aria-label={`${BUCKET_NAME[b.bucket]}: ${b.count} stocks`}
        onClick={() => choose({ bucket: b.bucket })} onMouseEnter={() => setHot({ bucket: b.bucket })} onMouseLeave={() => setHot(null)}><b>{b.count}</b> {BUCKET_NAME[b.bucket]}</button>))}</div>
  );
  const sectorRows = (
    <ul className="oflow-srows" aria-label="Sectors and their build-ups">{B.sectors.map((s) => {
      const g = d.stocks.filter((x) => x.changePct && (x.sector || "Other") === s.sector), avg = avgOf.get(s.sector) ?? null;
      return (
        <li key={s.sector} onMouseEnter={() => setHot({ sector: s.sector })} onMouseLeave={() => { setHot(null); tip.hide(); }}
          onPointerMove={(e) => tip.show(e, <SectorPop sector={s.sector} stocks={d.stocks} />)}>
          <button type="button" aria-pressed={pick?.sector === s.sector} onClick={() => choose({ sector: s.sector })} aria-label={`${s.sector}: ${s.up} rising, ${s.down} falling`}>
            <span className="oflow-srow-n">{s.sector}</span>
            {!narrow && <span className={`oflow-srow-v ${tone(avg)}`}>{pct(avg)}</span>}
            <span className="oflow-srow-bar" aria-hidden="true">{BUCKETS.map((k) => { const c = g.filter((x) => bucketOf(x) === k).length; return c ? <i key={k} className={bucketTone(k)} style={{ flex: c }} title={`${BUCKET_NAME[k]}: ${c}`} /> : null; })}</span>
            <small><span className="gain">{s.up}↑</span> <span className="loss">{s.down}↓</span></small>
          </button></li>);
    })}</ul>
  );
  // the phone keeps the lines cropped at the direction bars (the full map needs a wide screen)
  const phoneLines = (
    <svg viewBox={`0 0 ${cut} ${B.H}`} className="oflow-board-svg crop" role="img" aria-label={`The day's line of ${B.lines.length} F&O stocks flowing into ${B.rising.count} rising and ${B.falling.count} falling.`}>
      <line x1="16" x2={B.W * 0.36} y1={B.zeroY} y2={B.zeroY} className="oflow-zero" />
      {B.times.map((t) => <text key={t.label} x={t.x} y={B.H - 2} className="oflow-t" textAnchor="middle">{t.label}</text>)}
      <g className="oflow-lines">{B.lines.map((l) => <path key={l.symbol} d={l.d} pathLength={1} className={`${l.up ? "gain" : "loss"}${f ? (lit(l.sector, l.up, bucketOf(bySym.get(l.symbol)!)) ? " lit" : " dim") : ""}`} />)}</g>
      {[{ r: B.rising, up: true, name: "Rising" }, { r: B.falling, up: false, name: "Falling" }].map(({ r, up, name }) => (
        <g key={name} className={`oflow-node ${up ? "gain" : "loss"}`} {...act({ up }, `${name}: ${r.count} stocks`)}><rect x={r.x - 3} y={r.y} width={r.w + 6} height={Math.max(4, r.h)} rx="9" /></g>))}
    </svg>
  );
  const mapSvg = (
    <svg viewBox={`0 0 ${M.W} ${M.H}`} className="oflow-board-svg oflow-map-svg" role="img"
      aria-label={`The day's line of ${M.lines.length} F&O stocks flowing into ${M.tower.up} rising and ${M.tower.down} falling, then into ${B.sectors.length} sectors and the futures build-ups.`}>
      <defs>
        <linearGradient id="oflow-tile-gain" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="color-mix(in srgb, var(--gain) 22%, var(--s1))" /><stop offset="1" stopColor="color-mix(in srgb, var(--gain) 8%, var(--s1))" /></linearGradient>
        <linearGradient id="oflow-tile-loss" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="color-mix(in srgb, var(--loss) 22%, var(--s1))" /><stop offset="1" stopColor="color-mix(in srgb, var(--loss) 8%, var(--s1))" /></linearGradient>
        <linearGradient id="oflow-tile-gain-big" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="color-mix(in srgb, var(--gain) 30%, var(--s1))" /><stop offset="1" stopColor="color-mix(in srgb, var(--gain) 10%, var(--s1))" /></linearGradient>
        <linearGradient id="oflow-tile-loss-big" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="color-mix(in srgb, var(--loss) 30%, var(--s1))" /><stop offset="1" stopColor="color-mix(in srgb, var(--loss) 10%, var(--s1))" /></linearGradient>
        <linearGradient id="oflow-tower-gain" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="color-mix(in srgb, var(--gain) 30%, transparent)" /><stop offset="1" stopColor="color-mix(in srgb, var(--gain) 6%, transparent)" /></linearGradient>
        <linearGradient id="oflow-tower-loss" x1="0" x2="0" y1="1" y2="0"><stop offset="0" stopColor="color-mix(in srgb, var(--loss) 30%, transparent)" /><stop offset="1" stopColor="color-mix(in srgb, var(--loss) 6%, transparent)" /></linearGradient>
      </defs>
      <g className="oflow-gridg" aria-hidden="true">
        {M.grid.map((t) => <g key={t.label}><line x1={50} x2={M.W * 0.34} y1={t.y} y2={t.y} className={t.label === "0%" || t.label === "0.0%" ? "oflow-zero" : "oflow-grid"} /><text x={8} y={t.y + 4} className="oflow-t">{t.label}</text></g>)}
        {M.times.map((t) => <g key={t.label}><line x1={t.x} x2={t.x} y1={14} y2={M.H - 18} className="oflow-grid v" /><text x={t.x} y={M.H - 3} className="oflow-t" textAnchor="middle">{t.label}</text></g>)}
      </g>
      <rect x={M.tower.x} y={M.tower.top} width={M.tower.w} height={M.tower.mid - M.tower.top} fill="url(#oflow-tower-gain)" className="oflow-tower" />
      <rect x={M.tower.x} y={M.split + 17} width={M.tower.w} height={M.tower.bottom - M.split - 17} fill="url(#oflow-tower-loss)" className="oflow-tower" />
      <g className="oflow-lines">{M.lines.map((l) => <path key={l.symbol} d={l.d} pathLength={1} className={`${l.up ? "gain" : "loss"}${state(l.symbol)}`} {...stockHover(l.symbol)}><title>{`${l.symbol} ${pct(bySym.get(l.symbol)!.changePct)}`}</title></path>)}</g>
      <g className="oflow-ticks">{M.ticks.map((t) => <rect key={t.symbol} x={M.tower.x} y={t.y - Math.max(0.6, (M.tower.mid - M.tower.top) / Math.max(1, M.tower.up) / 2 * 0.8)} width={t.len} height={Math.max(1.2, (M.tower.mid - M.tower.top) / Math.max(1, M.tower.up) * 0.8)} className={`${t.up ? "gain" : "loss"}${state(t.symbol)}`} {...stockHover(t.symbol)} />)}</g>
      <g className="oflow-links">{M.links.map((l) => <path key={l.symbol} d={l.d} className={`${l.up ? "gain" : "loss"}${state(l.symbol)}`} />)}</g>
      {[{ up: true, n: M.tower.up, y: M.tower.top - 2 }, { up: false, n: M.tower.down, y: M.tower.bottom + 16 }].map(({ up, n, y }) => (
        <g key={String(up)} className={`oflow-node oflow-tlbl ${up ? "gain" : "loss"}${f && !lit(undefined, up) ? " dim" : ""}`} {...act({ up }, `${up ? "Rising" : "Falling"}: ${n} stocks`)} {...{ onPointerMove: (e: React.PointerEvent) => tip.show(e, <DirectionPop up={up} stocks={d.stocks} />), onPointerLeave: () => tip.hide() }}>
          <text x={M.tower.x + M.tower.w / 2} y={y} textAnchor="middle" className="oflow-tlbl-t"><tspan className="n">{n}</tspan> {up ? "rising" : "falling"}</text>
        </g>))}
      <line x1={M.tower.x - 6} x2={M.W - 14} y1={M.split} y2={M.split} className="oflow-zero" />
      <g className="oflow-tiles">{M.tiles.map((t) => {
        const s = bySym.get(t.symbol)!, b = s.buildup ? BUILDUP[s.buildup] : null, pv = s.pivots;
        const go = () => window.location.assign(`/stocks/${encodeURIComponent(t.symbol)}`);
        const short = b ? ({ long_buildup: "Long BU", short_buildup: "Short BU", short_covering: "Covering", long_unwinding: "Unwinding" } as Record<string, string>)[s.buildup as string] : "—";
        const sym = (max: number) => (t.symbol.length > max ? t.symbol.slice(0, max - 1) + "…" : t.symbol);
        const fitChars = Math.max(3, Math.floor((t.w - 14) / 8.5));
        const r = 13, c = 2 * Math.PI * r, share = s.agreement.of ? s.agreement.score / s.agreement.of : 0;
        return (
          <g key={t.symbol} className={`oflow-tile ${t.up ? "gain" : "loss"}${t.big ? " big" : ""}${state(t.symbol)}`} role="link" tabIndex={0}
            aria-label={`${t.symbol} ${pct(s.changePct)}, ${b ? b.name : "no build-up"}, ${s.agreement.score} of ${s.agreement.of} facts`}
            onClick={go} onKeyDown={(e) => { if (e.key === "Enter") go(); }} {...stockHover(t.symbol)} onFocus={() => setHotSym(t.symbol)} onBlur={() => setHotSym(null)}>
            <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={t.big ? 10 : 5} fill={`url(#oflow-tile-${t.up ? "gain" : "loss"}${t.big ? "-big" : ""})`} className="oflow-tile-bg" />
            <rect x={t.x} y={t.y} width={t.big ? 4 : 3} height={t.h} className="oflow-tile-edge" />
            {t.big ? <>
              <text x={t.x + 14} y={t.y + 24} className="oflow-big-s">{sym(12)}</text>
              <text x={t.x + 14} y={t.y + 40} className="oflow-big-sec">{(s.sector ?? "").slice(0, 22)}</text>
              <g transform={`translate(${t.x + t.w - 22},${t.y + 22})`} className={`oflow-tring ${t.up ? "gain" : "loss"}`}><circle r={r} className="oflow-ring-bg" /><circle r={r} className="oflow-ring-fg" strokeDasharray={`${(share * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90)" />
                <text y="4" textAnchor="middle" className="oflow-ring-t">{s.agreement.score}/{s.agreement.of}</text></g>
              <text x={t.x + 14} y={t.y + 76} className={`oflow-big-p ${tone(s.changePct)}`}>{pct(s.changePct)}</text>
              <text x={t.x + 14} y={t.y + 96} className="oflow-big-px">{inr(s.price)} {s.change == null ? "" : `${s.change > 0 ? "+" : ""}${s.change.toFixed(2)}`}</text>
              <text x={t.x + 14} y={t.y + 114} className="oflow-big-bu">{b ? b.name : "No build-up"} · OI {pct(s.oiChangePct, 1)}</text>
              {t.h >= 196 ? <Candles s={s} lines={d.lines} h={140} at={{ x: t.x + 8, y: t.y + 122, w: t.w - 16, h: t.h - 150 }} /> : <Candles s={s} lines={d.lines} h={150} at={{ x: t.x + t.w * 0.54, y: t.y + 42, w: t.w * 0.46 - 8, h: t.h - 66 }} />}
              <text x={t.x + 14} y={t.y + t.h - 10} className="oflow-big-l">{pv ? `S1 ${pv.s1.toLocaleString("en-IN", { maximumFractionDigits: 1 })}   ·   R1 ${pv.r1.toLocaleString("en-IN", { maximumFractionDigits: 1 })}   ·   ${s.zone ? ZONE[s.zone] : ""}` : "Pivots not available"}</text>
            </> : t.h >= 42 && t.w >= 66 ? <>
              <text x={t.x + 7} y={t.y + 14} className="oflow-tile-s">{sym(fitChars)}</text>
              <text x={t.x + t.w - 5} y={t.y + 13} textAnchor="end" className="oflow-tile-r">{t.w >= 110 && t.symbol.length <= 8 ? String(t.rank).padStart(2, "0") : ""}</text>
              <text x={t.x + 7} y={t.y + 30} className={`oflow-tile-p ${tone(s.changePct)}`}>{pct(s.changePct)}</text>
              {t.h >= 70 && (() => {   // the day's path inside the box, between the figures and the build-up
                const v = (d.lines.change[t.symbol] ?? []).map((x, i) => [i, x] as const).filter((p): p is readonly [number, number] => p[1] != null);
                if (v.length < 2) return null;
                const T = Math.max(1, (d.lines.change[t.symbol] ?? []).length - 1), lo = Math.min(0, ...v.map((p) => p[1])), hi = Math.max(0, ...v.map((p) => p[1])), sp = hi - lo || 1;
                const top = t.y + 38, hh = t.h - 38 - 20, xx = (i: number) => t.x + 6 + (i / T) * (t.w - 12), yy = (c: number) => top + ((hi - c) / sp) * hh;
                const dd = v.map(([i, c], k) => `${k ? "L" : "M"}${xx(i).toFixed(1)},${yy(c).toFixed(1)}`).join("");
                return <g className="oflow-tile-path"><path d={`${dd}L${xx(v[v.length - 1][0]).toFixed(1)},${yy(0).toFixed(1)}L${xx(v[0][0]).toFixed(1)},${yy(0).toFixed(1)}Z`} className="a" /><path d={dd} className="l" /></g>;
              })()}
              {t.h >= 52 && <text x={t.x + 7} y={t.y + t.h - 7} className="oflow-tile-b">{short}</text>}
              {t.h >= 52 && t.w >= 110 && Array.from({ length: s.agreement.of }, (_, k) => <circle key={k} cx={t.x + t.w - 38 + k * 7} cy={t.y + t.h - 10} r="2.2" className={k < s.agreement.score ? "oflow-tile-dot on" : "oflow-tile-dot"} />)}
            </> : <>
              <text x={t.x + 6} y={t.y + Math.min(t.h / 2 + 4, 14)} className="oflow-tile-s sm">{sym(Math.max(3, Math.floor((t.w - 10) / 7)))}</text>
              {t.h >= 26 && <text x={t.x + 6} y={t.y + 25} className={`oflow-tile-p sm ${tone(s.changePct)}`}>{pct(s.changePct, 1)}</text>}
            </>}
          </g>);
      })}</g>
      {(M.more.up > 0 || M.more.down > 0) && <text x={M.W - 14} y={M.H - 1} textAnchor="end" className="oflow-t">Boxes: the {M.tiles.filter((t) => t.up).length} largest rises and {M.tiles.filter((t) => !t.up).length} largest falls, sized by the move; {M.more.up + M.more.down} more on the tower</text>}
    </svg>
  );
  return (
    <section className="card oflow-board" aria-labelledby="oflow-board-h">
      <div className="oflow-hero-h">
        <div><h2 id="oflow-board-h">Flow board</h2><p className="muted">{narrow ? "Tap" : "Point at"} any stock for its detail; choose a sector or build-up to list its stocks.</p></div>
      </div>
      {narrow ? <>
        <div className="oflow-dirs" role="group" aria-label="Direction">{[{ up: true, n: B.rising.count, name: "rising" }, { up: false, n: B.falling.count, name: "falling" }].map((x) => (
          <button key={x.name} type="button" className={`oflow-bchip ${x.up ? "gain" : "loss"}`} aria-pressed={pick?.up === x.up && !pick.sector && !pick.bucket} onClick={() => choose({ up: x.up })}><b>{x.n}</b> {x.name}</button>))}</div>
        {phoneLines}{sectorRows}{bucketChips}
        <section className="oflow-feat" aria-label="Largest moves">
          {[true, false].map((up) => <div key={String(up)} className="oflow-feat-g"><h4 className={`oflow-side ${up ? "gain" : "loss"}`}><Icon name={up ? "growth" : "decline"} /> {up ? "Largest rises" : "Largest falls"}</h4>
            <div className="oflow-feat-row">{feat(up).map((s) => <FeatureCard key={s.symbol} s={s} lines={d.lines} onHot={setHotSym} />)}</div></div>)}
        </section></>
        : <>{bucketChips}
          <div className="oflow-mapgrid">
            <aside className="oflow-msec" aria-label="Sectors">{sectorRows}</aside>
            <div className="oflow-mapmain"><ChartZoom label="Flow board"><div className="oflow-board-wrap">{mapSvg}</div></ChartZoom>
              <button type="button" className="chip oflow-every" aria-pressed={every} onClick={() => setEvery((v) => !v)}>{every ? "Show the 24 largest moves a side" : "Show 40 a side"}</button></div>
          </div>
</>}
      <div className="oflow-legend muted">
        <span><i className="sw gain" />Rising</span><span><i className="sw loss" />Falling</span>
        <span>Tiles: change, build-up, and a dot for each of five facts that agree with the move; the number is its rank by facts lined up</span>
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

// ------------------------------------------------------------------------------------------------------------------ money flow

function MoneyPop({ s }: { s: MoneyStock }) {
  const tot = s.in + s.out || 1;
  return (
    <>
      <header className="oflow-pop-h"><div><b>{s.symbol}</b><small>{s.sector}</small></div><div className="r"><b className={tone(s.net)}>{cr(s.net, true)}</b><small>net today</small></div></header>
      <div className="oflow-pop-split"><i className="gain" style={{ flex: s.in || 0.0001 }} /><i className="loss" style={{ flex: s.out || 0.0001 }} /></div>
      <dl className="oflow-pop-t">
        <div><dt>In</dt><dd className="gain">{cr(s.in)}</dd></div><div><dt>Out</dt><dd className="loss">{cr(s.out)}</dd></div>
        <div><dt>In share</dt><dd>{Math.round((s.in / tot) * 100)}%</dd></div><div><dt>Latest step</dt><dd className={tone(s.surge)}>{s.surge ? `${cr(s.surge, true)}/min` : "—"}</dd></div>
      </dl>
      <p className="oflow-pop-what">In: value traded while the price rose between two snapshots; out: while it fell. Every trade has a buyer and a seller, so this shows where traded value went with the moves, not who bought.</p>
    </>
  );
}

function SectorMoneyPop({ g }: { g: MoneySector }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{g.sector}</b><small>{g.stocks.length} F&O stocks</small></div><div className="r"><b className={tone(g.net)}>{cr(g.net, true)}</b><small>net today</small></div></header>
      <div className="oflow-pop-split"><i className="gain" style={{ flex: g.in || 0.0001 }} /><i className="loss" style={{ flex: g.out || 0.0001 }} /></div>
      <p className="oflow-pop-row"><span className="gain">In {cr(g.in)}</span><span className="loss">Out {cr(g.out)}</span></p>
      <div className="oflow-pop-movers">
        <div><small>Most in</small>{g.stocks.slice(0, 4).map((x) => <p key={x.symbol}>{x.symbol}<span className={tone(x.net)}>{cr(x.net, true)}</span></p>)}</div>
        <div><small>Most out</small>{[...g.stocks].reverse().slice(0, 4).map((x) => <p key={x.symbol}>{x.symbol}<span className={tone(x.net)}>{cr(x.net, true)}</span></p>)}</div>
      </div>
    </>
  );
}

/** Where money went today: each sector's net ₹ crore, the flow from the sectors into the day's inflow and outflow, and the stocks in each. */
export function MoneyFlowView() {
  const live = marketLive();
  const tip = useTip();
  const q = useQuery({ queryKey: ["lab-money"], queryFn: moneyFlow, refetchInterval: live ? 60_000 : false, retry: false });
  const [hot, setHot] = useState<string | null>(null);
  if (q.isPending) return <div className="skeleton" style={{ height: 420 }} aria-label="Loading Money Flow" />;
  if (q.isError) return <div className="formerr" role="alert">Money Flow could not be loaded right now. It refreshes by itself; reload in a minute.</div>;
  const m = q.data as MoneyFlow;
  if (!m.ready) return <div className="card oflow-wait" role="status"><span className="tlab-ic" aria-hidden="true"><Icon name="activity" /></span><div><h2>No Money Flow yet</h2><p className="muted">{m.reason}</p></div></div>;
  const hv = (body: () => React.ReactNode, key?: string) => ({ onPointerMove: (e: React.PointerEvent) => { if (key) setHot(key); tip.show(e, body()); }, onPointerLeave: () => { setHot(null); tip.hide(); } });
  const maxNet = Math.max(0.1, ...m.sectors.map((g) => Math.abs(g.net)));
  const ins = m.stocks.filter((x) => x.net > 0).slice(0, 8), outs = [...m.stocks].reverse().filter((x) => x.net < 0).slice(0, 8);
  const maxStock = Math.max(0.1, ...[...ins, ...outs].map((x) => Math.abs(x.net)));
  // the flow drawing: sectors on the left, ribbons into the INFLOW box (top) and the OUTFLOW box (bottom)
  const W = 640, H = 420, SX = 8, SW = 150, BX = 430, BW = 200;
  const gIn = m.sectors.filter((g) => g.net > 0), gOut = m.sectors.filter((g) => g.net < 0);
  const sumIn = gIn.reduce((a, g) => a + g.net, 0) || 1, sumOut = gOut.reduce((a, g) => a - g.net, 0) || 1;
  const boxIn = { y: 16, h: 160 }, boxOut = { y: 244, h: 160 };
  const rows = [...gIn, ...gOut], rowH = (H - 16) / Math.max(1, rows.length);
  let yi = boxIn.y, yo = boxOut.y;
  const ribbons = rows.map((g, i) => {
    const up = g.net > 0, y0 = 8 + i * rowH + rowH * 0.2, th = Math.max(2, (Math.abs(g.net) / (up ? sumIn : sumOut)) * (up ? boxIn.h : boxOut.h));
    const ty = up ? yi : yo; if (up) yi += th; else yo += th;
    const x0 = SX + SW, x1 = BX, cx = (x0 + x1) / 2, h0 = Math.min(rowH * 0.6, th);
    const d = `M${x0},${y0}C${cx},${y0} ${cx},${ty} ${x1},${ty}L${x1},${ty + th}C${cx},${ty + th} ${cx},${y0 + h0} ${x0},${y0 + h0}Z`;
    return { g, d, up, y0, h0 };
  });
  const lit = (sector: string) => !hot || hot === sector;
  return (
    <section className="card oflow-board oflow-money" aria-labelledby="oflow-money-h">
      <div className="oflow-hero-h">
        <div><h2 id="oflow-money-h">Money Flow</h2><p className="oflow-money-line">{headline(m)}</p>
          {m.surge && <p className={`oflow-surge ${tone(m.surge.surge)}`} {...hv(() => <MoneyPop s={m.surge!} />)}><span aria-hidden="true">⚡</span> Fastest now: <b>{m.surge.symbol}</b> {cr(m.surge.surge, true)} a minute over the latest {m.stepMinutes ?? 3} minutes</p>}</div>
        <div className="oflow-count" aria-label={`In ${cr(m.in)}, out ${cr(m.out)}`}>
          <span className="gain"><b>{cr(m.in)}</b>in</span><span className="loss"><b>{cr(m.out)}</b>out</span>
        </div>
      </div>
      <div className="oflow-money-grid">
        <ul className="oflow-mbars" aria-label="Net money by sector">{m.sectors.map((g) => {
          const w = (Math.abs(g.net) / maxNet) * 50;
          return (
            <li key={g.sector} className={lit(g.sector) ? "" : "dim"} {...hv(() => <SectorMoneyPop g={g} />, g.sector)}>
              <span className="n">{g.sector}</span>
              <span className="bar" aria-hidden="true"><i className={g.net >= 0 ? "gain" : "loss"} style={g.net >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} /></span>
              <span className={`v ${tone(g.net)}`}>{cr(g.net, true)}</span>
            </li>);
        })}</ul>
        <div className="oflow-mflow">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Money flow: ${gIn.length} sectors with more money in, ${gOut.length} with more out; in ${cr(m.in)}, out ${cr(m.out)}.`}>
            <defs>
              <linearGradient id="oflow-mf-gain" x1="0" x2="1"><stop offset="0" stopColor="var(--gain)" stopOpacity="0.25" /><stop offset="1" stopColor="var(--gain)" stopOpacity="0.65" /></linearGradient>
              <linearGradient id="oflow-mf-loss" x1="0" x2="1"><stop offset="0" stopColor="var(--loss)" stopOpacity="0.25" /><stop offset="1" stopColor="var(--loss)" stopOpacity="0.65" /></linearGradient>
            </defs>
            {ribbons.map((r) => <path key={r.g.sector} d={r.d} fill={`url(#oflow-mf-${r.up ? "gain" : "loss"})`} className={`oflow-mrib${lit(r.g.sector) ? (hot ? " lit" : "") : " dim"}`} {...hv(() => <SectorMoneyPop g={r.g} />, r.g.sector)} />)}
            {ribbons.map((r) => <g key={r.g.sector + "t"} className={`oflow-mnode ${r.up ? "gain" : "loss"}${lit(r.g.sector) ? "" : " dim"}`} {...hv(() => <SectorMoneyPop g={r.g} />, r.g.sector)}>
              <rect x={SX} y={r.y0} width={SW} height={Math.max(r.h0, 14)} rx="4" /><text x={SX + 6} y={r.y0 + Math.max(r.h0, 14) / 2 + 4}>{r.g.sector.length > 20 ? r.g.sector.slice(0, 19) + "…" : r.g.sector}</text></g>)}
            {[{ b: boxIn, up: true, v: m.in, label: "INFLOW" }, { b: boxOut, up: false, v: m.out, label: "OUTFLOW" }].map(({ b, up, v, label }) => (
              <g key={label} className={`oflow-mbox ${up ? "gain" : "loss"}`}>
                <rect x={BX} y={b.y} width={BW} height={b.h} rx="10" />
                <text x={BX + 14} y={b.y + 26} className="l">{label}</text>
                <text x={BX + 14} y={b.y + 62} className="v">{cr(v)}</text>
                <text x={BX + 14} y={b.y + 84} className="s">{up ? gIn.length : gOut.length} sectors · {(up ? m.stocks.filter((x) => x.net > 0) : m.stocks.filter((x) => x.net < 0)).length} stocks</text>
              </g>))}
          </svg>
        </div>
        <div className="oflow-mstocks">
          {[{ list: ins, up: true, h: "Most money in" }, { list: outs, up: false, h: "Most money out" }].map(({ list, up, h }) => (
            <div key={h}><h3 className={`oflow-side ${up ? "gain" : "loss"}`}><Icon name={up ? "growth" : "decline"} /> {h}</h3>
              <ol className="oflow-mlist" aria-label={h}>{list.map((x) => (
                <li key={x.symbol} {...hv(() => <MoneyPop s={x} />, x.sector)}>
                  <Link to={`/stocks/${encodeURIComponent(x.symbol)}`}>{x.symbol}</Link>
                  <span className="bar" aria-hidden="true"><i className={up ? "gain" : "loss"} style={{ width: `${(Math.abs(x.net) / maxStock) * 100}%` }} /></span>
                  <span className={`v ${tone(x.net)}`}>{cr(x.net, true)}</span>
                </li>))}{!list.length && <li className="muted">None yet.</li>}</ol></div>))}
        </div>
      </div>
      <details className="oflow-how"><summary>How Money Flow is worked out</summary><p className="muted oflow-method">Between two snapshots (every 3 minutes), the value a stock traded (new volume × the average of the two prices) counts as money in when its price rose and money out when it fell; a step with no move counts as neither. Summed over the day, in ₹ crore. Every trade has a buyer and a seller: this describes where traded value went with the moves, not who bought or sold. Source: exchange quotes through Dhan.</p></details>
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
        <div className="oflow-breadth" aria-hidden="true"><i className="gain" style={{ width: `${(sum.up / known) * 100}%` }}>{sum.up / known >= 0.12 && <span>{Math.round((sum.up / known) * 100)}%</span>}</i><i className="flat" style={{ width: `${(sum.flat / known) * 100}%` }} /><i className="loss" style={{ width: `${(sum.down / known) * 100}%` }}>{sum.down / known >= 0.12 && <span>{Math.round((sum.down / known) * 100)}%</span>}</i></div>
        <DepthCurve stocks={d.stocks} lines={d.lines} />
        <div className="oflow-bandwrap"><h3>Stocks by band of change</h3><Bands bands={sum.distribution} stocks={d.stocks} />
          <p className="muted oflow-median">Middle stock: <b className={tone(sum.medianChangePct)}>{pct(sum.medianChangePct)}</b></p></div>
      </section>

      <section aria-labelledby="oflow-bu-h" className="oflow-sec-wrap">
        <h2 id="oflow-bu-h" className="oflow-h">Futures build-up</h2>
        <p className="muted oflow-sub">Price change and open interest change of each stock's futures (current and next month) against the previous session.</p>
        <BuildupTiles sum={sum} stocks={d.stocks} />
      </section>

      <div className="oflow-two">
        <section aria-labelledby="oflow-sec-h" className="card oflow-secbox">
          <h2 id="oflow-sec-h" className="oflow-h">Sectors</h2>
          <p className="muted oflow-sub">Average change of the F&O stocks in each sector. Choose one to see only its stocks below.</p>
          <SectorBars sectors={sum.sectors} active={sector} onPick={setSector} stocks={d.stocks} />
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
  if (view === "options") return <TipLayer><OptionPulse /></TipLayer>;   // its own data (the option chain), not the Order Flow snapshot
  if (view === "zones") return <TipLayer><StockZones /></TipLayer>;       // its own data (5-minute candles of one stock)
  if (view === "risk") return <TipLayer><RiskReadout /></TipLayer>;       // its own data (stored daily closes of one stock and the Nifty 50)
  return <FlowSnapshotView view={view} />;
}

function FlowSnapshotView({ view }: { view: string }) {
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
    <TipLayer>
      <div className="oflow-stamp" role="status">
        <span className={`oflow-live ${live && d.tradeDay === today ? "on" : ""}`}><i aria-hidden="true" />{live && d.tradeDay === today ? "Live · every 3 minutes" : "Last session"}</span>
        <span className="muted">{day} · snapshot at {taken.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST · {d.summary.stocks} F&O stocks</span>
      </div>
      {d.notes.map((n) => <p key={n} className="oflow-note muted">{n}</p>)}
      {view === "board" ? <FlowBoard d={d} /> : view === "money" ? <MoneyFlowView /> : <Depth d={d} />}
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">Change against the previous close; open interest summed over the current and next futures contract against their previous close; VWAP is the day's average traded price; pivots are the classic floor pivots from the previous session's high, low and close. Facts: open interest rose with the move, price on the move's side of VWAP, price beyond R1 or S1, open interest changed 5% or more, price in the top or bottom quarter of the day's range. Source: exchange prices and open interest through Dhan, FinLit's daily prices.</p></details>
    </TipLayer>
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
        <p>Every NSE F&O stock, live in market hours.</p></div></section>
      <section className="sec" style={{ paddingTop: 16 }}><div className="wrap tlab oflow">
        {(!ready || q.isPending) && <div className="skeleton" style={{ height: 160 }} aria-label="Checking your access" />}
        {q.isError && <div className="formerr" role="alert">Your access could not be checked right now. Reload the page in a moment.</div>}
        {a && !a.access && <LabGate reason={a.reason === "sign_in" ? "sign_in" : "not_granted"} next="/lab/flow" />}
        {a?.access && <>
          <nav className="oflow-tabs" aria-label="Order Flow views">{FLOW_TABS.filter((t) => t.ready).map((t) =>
            <Link key={t.id} to={t.id === "depth" ? "/lab/flow" : `/lab/flow?view=${t.id}`} className="oflow-tab" aria-current={view === t.id ? "page" : undefined}>{t.name}</Link>)}</nav>
          <Flow view={view} />
        </>}
        <div className="pdisc tlab-disc" role="note" aria-labelledby="oflow-disc-h"><h2 id="oflow-disc-h">Disclaimer</h2><p>{DISCLAIMER}</p></div>
      </div></section>
    </>
  );
}
