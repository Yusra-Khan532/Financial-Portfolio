// Trading Lab > Order Flow > Stock radar (docs/TRADING-LAB.md "Stock radar"; MarketPulse ideas, item 5): the Flow board's five facts of one F&O
// stock drawn as a radar, each axis a 0-1 strength measured from the number behind the fact (lib/radar.ts), with the fact's ✓ / ✕ / ? on its
// label. Up to two more stocks can be laid over it, and the stocks with the most facts lined up each way are shown as small radars. It reads the
// same snapshot as the board (GET /api/lab/flow): no new route. Describes where each stock stands; never a call.
import { useMemo, useState } from "react";
import { BUILDUP, pct, tone, type FlowLines, type FlowStock } from "../../lib/flow";
import { AXIS_COUNT, FACT_RING, MARK, STATE_WORD, axisPoint, linedUp, matchStocks, outline, radarAxes, type RadarAxis } from "../../lib/radar";
import { ChartZoom } from "../ChartZoom";
import { StockPop, useTip } from "./FlowTips";

export const MAX_COMPARE = 2;
const SERIES = ["k0", "k1", "k2"] as const;   // the chosen stock, then the compared ones: colour, dash and marker shape all differ
const moveWord = (s: FlowStock) => (s.direction > 0 ? "rising" : s.direction < 0 ? "falling" : "flat");
const strength = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** The hover card of one axis: the fact, its state and its number for every stock on the chart, and what the scale means. */
export function AxisPop({ i, stocks }: { i: number; stocks: FlowStock[] }) {
  const all = stocks.map((s) => ({ s, a: radarAxes(s)[i] }));
  const head = all[0].a;
  return (
    <>
      <header className="oflow-pop-h"><div><b>{head.fact}</b><small>Axis {i + 1} of {AXIS_COUNT} · {head.short}</small></div></header>
      <ul className="srad-pop-list">{all.map(({ s, a }, k) => (
        <li key={s.symbol} className={`srad-pop-row ${SERIES[k]}`}>
          <p><i className={`srad-sw ${SERIES[k]}`} aria-hidden="true" /><b>{s.symbol}</b><span className={`srad-state is-${a.state}`}>{MARK[a.state]} {STATE_WORD[a.state]}</span></p>
          <p className="srad-pop-num">{a.number}</p>
          <p className="muted">Strength on this axis: {strength(a.value)}{k > 0 && a.fact !== head.fact ? ` · its fact: ${a.fact}` : ""}</p>
          {a.note && <p className="muted">{a.note}</p>}
        </li>))}</ul>
      <p className="oflow-pop-what">{head.scale}.{all.some(({ s }) => s.direction !== stocks[0].direction) ? " Each stock is measured along its own move." : ""}</p>
    </>
  );
}

/** One stock's radar (or several laid over each other). `stocks[0]` sets the axis labels; `small` draws a tile without labels. */
export function RadarChart({ stocks, small = false, hot, onHot }: { stocks: FlowStock[]; small?: boolean; hot?: number | null; onHot?: (i: number | null) => void }) {
  const tip = useTip();
  const W = small ? 160 : 600, H = small ? 150 : 440, cx = W / 2, cy = small ? 78 : 232, R = small ? 60 : 150;
  const axes = stocks.map(radarAxes), lead = axes[0];
  const ring = (v: number) => Array.from({ length: AXIS_COUNT }, (_, i) => axisPoint(i, AXIS_COUNT, v, cx, cy, R).map((n) => n.toFixed(1)).join(",")).join(" ");
  const label = stocks.map((s, k) => `${s.symbol} (${moveWord(s)}, ${s.agreement.score} of ${s.agreement.of} facts): ${axes[k].map((a) => `${a.short} ${strength(a.value)} ${STATE_WORD[a.state]}`).join("; ")}`).join(". ");
  const hover = (i: number) => small ? {} : {
    onPointerMove: (e: React.PointerEvent) => { onHot?.(i); tip.show(e, <AxisPop i={i} stocks={stocks} />); },
    onPointerLeave: () => { onHot?.(null); tip.hide(); },
  };
  return (
    <span className={`srad-plot${small ? " small" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Stock radar. ${label}`} className="srad-svg">
        {[0.25, 0.75, 1].map((v) => <polygon key={v} points={ring(v)} className="srad-ring" />)}
        <polygon points={ring(FACT_RING)} className="srad-ring is-fact" />
        {lead.map((a, i) => {
          const [x, y] = axisPoint(i, AXIS_COUNT, 1, cx, cy, R);
          return <line key={a.key} x1={cx} y1={cy} x2={x} y2={y} className={`srad-axis${hot === i ? " hot" : ""}`} />;
        })}
        {axes.map((ax, k) => {
          const o = outline(ax.map((a) => a.value), cx, cy, R);
          const tn = small ? (stocks[k].direction >= 0 ? " gain" : " loss") : "";
          return <path key={stocks[k].symbol} d={o.d} className={`srad-shape ${SERIES[k]}${tn}${o.closed ? " closed" : ""}`} />;
        })}
        {small && lead.map((a, i) => {   // a tile marks each known axis, so a stock with a blank neighbour still shows its other facts
          if (a.value == null) return null;
          const [x, y] = axisPoint(i, AXIS_COUNT, a.value, cx, cy, R);
          return <circle key={a.key} cx={x} cy={y} r="2.6" className={`srad-dot ${stocks[0].direction >= 0 ? "gain" : "loss"}`} />;
        })}
        {!small && axes.map((ax, k) => ax.map((a, i) => {
          if (a.value == null) { const [x, y] = axisPoint(i, AXIS_COUNT, 1.08, cx, cy, R); return <text key={`${k}-${i}`} x={x + (k - (stocks.length - 1) / 2) * 12} y={y + 4} textAnchor="middle" className={`srad-gap ${SERIES[k]}`}>?</text>; }
          const [x, y] = axisPoint(i, AXIS_COUNT, a.value, cx, cy, R);
          return k === 0 ? <circle key={`${k}-${i}`} cx={x} cy={y} r={hot === i ? 6.5 : 5} className={`srad-pt ${SERIES[k]}`} />
            : k === 1 ? <rect key={`${k}-${i}`} x={x - 4} y={y - 4} width="8" height="8" className={`srad-pt ${SERIES[k]}`} />
            : <path key={`${k}-${i}`} d={`M${x} ${y - 5.5}L${x + 5.5} ${y}L${x} ${y + 5.5}L${x - 5.5} ${y}Z`} className={`srad-pt ${SERIES[k]}`} />;
        }))}
        {!small && lead.map((a, i) => {   // a wedge around each axis catches the pointer, so the whole sector of the chart opens that axis's card
          const p0 = axisPoint(i - 0.5, AXIS_COUNT, 1.15, cx, cy, R), p1 = axisPoint(i, AXIS_COUNT, 1.15, cx, cy, R), p2 = axisPoint(i + 0.5, AXIS_COUNT, 1.15, cx, cy, R);
          return <path key={`hit-${a.key}`} d={`M${cx},${cy}L${p0.join(",")}L${p1.join(",")}L${p2.join(",")}Z`} className="srad-hit" data-axis={a.key} {...hover(i)} />;
        })}
      </svg>
      {!small && lead.map((a, i) => {   // labels in the page's own type, placed outside the rim, so they stay readable at phone width
        const ang = (i / AXIS_COUNT) * Math.PI * 2 - Math.PI / 2, [x, y] = axisPoint(i, AXIS_COUNT, 1.13, cx, cy, R);
        return (
          <span key={a.key} className={`srad-lbl is-${a.state}${hot === i ? " hot" : ""}`} data-axis={a.key} {...hover(i)}
            style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, transform: `translate(${(-50 + 50 * Math.cos(ang)).toFixed(0)}%, ${(-50 + 50 * Math.sin(ang)).toFixed(0)}%)` }}>
            <b><i aria-hidden="true">{MARK[a.state]}</i> {a.short}</b><small>{strength(a.value)}</small>
          </span>);
      })}
    </span>
  );
}

function Finder({ stocks, label, placeholder, onPick, disabled = false, skip = [] }: { stocks: FlowStock[]; label: string; placeholder: string; onPick: (s: string) => void; disabled?: boolean; skip?: string[] }) {
  const [find, setFind] = useState("");
  const matches = useMemo(() => matchStocks(stocks.filter((s) => !skip.includes(s.symbol)), find, 8), [stocks, find, skip]);
  return (
    <div className="opul-find">
      <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={placeholder} aria-label={label} disabled={disabled} />
      {matches.length > 0 && <ul className="opul-found" aria-label={`${label}: matching stocks`}>{matches.map((m) => (
        <li key={m.symbol}><button type="button" onClick={() => { onPick(m.symbol); setFind(""); }}><b>{m.symbol}</b> <span className="muted">{m.name}</span></button></li>))}</ul>}
    </div>
  );
}

function FactRows({ s, hot, onHot, stocks }: { s: FlowStock; hot: number | null; onHot: (i: number | null) => void; stocks: FlowStock[] }) {
  const tip = useTip();
  const axes: RadarAxis[] = radarAxes(s);
  return (
    <ol className="srad-facts" aria-label={`${s.symbol}: the five facts`}>{axes.map((a, i) => (
      <li key={a.key} className={`is-${a.state}${hot === i ? " hot" : ""}`} onPointerMove={(e) => { onHot(i); tip.show(e, <AxisPop i={i} stocks={stocks} />); }} onPointerLeave={() => { onHot(null); tip.hide(); }}>
        <span className={`srad-state is-${a.state}`} aria-label={STATE_WORD[a.state]}>{MARK[a.state]}</span>
        <div><b>{a.fact}</b><small>{a.number}</small></div>
        <span className="srad-bar" aria-hidden="true"><i style={{ width: `${Math.round((a.value ?? 0) * 100)}%` }} /></span>
        <small className="srad-pc">{strength(a.value)}</small>
      </li>))}</ol>
  );
}

export function StockRadar({ stocks, lines }: { stocks: FlowStock[]; lines: FlowLines }) {
  const tip = useTip();
  const moving = useMemo(() => stocks.filter((s) => s.direction !== 0), [stocks]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [hot, setHot] = useState<number | null>(null);
  const bySym = useMemo(() => new Map(stocks.map((s) => [s.symbol, s])), [stocks]);
  if (!stocks.length) return (
    <section className="card oflow-board srad" aria-labelledby="srad-h">
      <div className="oflow-hero-h"><div><h2 id="srad-h">Stock radar</h2></div></div>
      <p className="muted" role="status">The latest snapshot has no F&O stocks with a quote, so there is nothing to draw yet. It refreshes by itself every few minutes in market hours.</p>
    </section>
  );
  const sym = chosen && bySym.has(chosen) ? chosen : (moving[0] ?? stocks[0]).symbol;
  const s = bySym.get(sym)!;
  const others = compare.filter((c) => c !== sym && bySym.has(c)).map((c) => bySym.get(c)!);
  const shown = [s, ...others];
  const quick = [...linedUp(stocks, true, 3), ...linedUp(stocks, false, 3)];
  const pick = (x: string) => { setChosen(x); setCompare((c) => c.filter((y) => y !== x)); };
  const add = (x: string) => setCompare((c) => (c.includes(x) || x === sym || c.length >= MAX_COMPARE ? c : [...c, x]));
  const b = s.buildup ? BUILDUP[s.buildup] : null;
  const grid = (up: boolean) => linedUp(stocks, up, 4);
  return (
    <section className="card oflow-board srad" aria-labelledby="srad-h">
      <div className="oflow-hero-h"><div><h2 id="srad-h">Stock radar</h2>
        <p className="oflow-money-line">{s.symbol} · <span className={tone(s.changePct)}>{pct(s.changePct)}</span> · {moveWord(s)} · {s.agreement.score} of {s.agreement.of} facts lined up · {b ? b.name : "no build-up"}</p></div></div>
      <div className="opul-pick">
        <div className="oflow-bchips" role="group" aria-label="Stocks with the most facts lined up">{quick.map((q) => (
          <button key={q.symbol} type="button" className="oflow-bchip srad-chip" aria-pressed={sym === q.symbol} onClick={() => pick(q.symbol)}>{q.symbol}</button>))}</div>
        <Finder stocks={stocks} label="Find an F&O stock" placeholder="Any F&O stock" onPick={pick} />
      </div>
      <div className="opul-pick srad-cmp" role="group" aria-label="Compare">
        <span className="muted">Compare with up to {MAX_COMPARE} more:</span>
        {others.map((o, k) => (
          <span key={o.symbol} className="srad-tag"><i className={`srad-sw ${SERIES[k + 1]}`} aria-hidden="true" />{o.symbol}
            <button type="button" aria-label={`Remove ${o.symbol} from the comparison`} onClick={() => setCompare((c) => c.filter((y) => y !== o.symbol))}>×</button></span>))}
        <Finder stocks={stocks} label="Add a stock to compare" placeholder={others.length >= MAX_COMPARE ? "2 of 2 added" : "Add a stock"} onPick={add} disabled={others.length >= MAX_COMPARE} skip={[sym, ...others.map((o) => o.symbol)]} />
      </div>
      <div className="srad-grid">
        <div className="srad-box srad-main">
          <ChartZoom label={`${s.symbol} stock radar`}><RadarChart stocks={shown} hot={hot} onHot={setHot} /></ChartZoom>
          <p className="muted opul-legend">{shown.map((x, k) => <span key={x.symbol} className="srad-key"><i className={`srad-sw ${SERIES[k]}`} aria-hidden="true" />{x.symbol} ({moveWord(x)})</span>)}
            <span className="srad-key"><i className="srad-sw is-ring" aria-hidden="true" />dashed ring: where each fact begins</span></p>
        </div>
        <aside className="srad-side">
          <FactRows s={s} hot={hot} onHot={setHot} stocks={shown} />
          {s.direction === 0 && <p className="muted oflow-note">{s.symbol} moved neither way in this snapshot, so the facts are not counted and the radar is empty.</p>}
        </aside>
      </div>
      <div className="srad-box srad-multi-box">
      <h3 className="srad-h3">Most facts lined up, as radars</h3>
      <ChartZoom label="Most facts lined up, as radars"><div className="srad-multi">
        {[true, false].map((up) => (
          <div key={String(up)} className="srad-multi-row">
            <p className={`srad-multi-h ${up ? "gain" : "loss"}`}>{up ? "Rising" : "Falling"}</p>
            {grid(up).length ? <ul aria-label={up ? "Rising stocks with the most facts" : "Falling stocks with the most facts"}>{grid(up).map((x) => (
              <li key={x.symbol}><button type="button" className="srad-tile" aria-pressed={sym === x.symbol} onClick={() => pick(x.symbol)}
                onPointerMove={(e) => tip.show(e, <StockPop s={x} lines={lines} />)} onPointerLeave={() => tip.hide()}>
                <RadarChart stocks={[x]} small />
                <span className="srad-tile-t"><b>{x.symbol}</b><span className={tone(x.changePct)}>{pct(x.changePct)}</span><small>{x.agreement.score} of {x.agreement.of} facts</small></span>
              </button></li>))}</ul>
              : <p className="muted">No {up ? "rising" : "falling"} stock in this snapshot.</p>}
          </div>))}
      </div></ChartZoom>
      </div>
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">
        Each axis is one of the Flow board's five facts, measured along the stock's own move (up for a rising stock, down for a falling one) on a scale from the centre (0) to the rim (1). The dashed ring at the middle is where the fact begins: outside it the fact is met.
        New positions: 0.5 + OI change ÷ 10 (open interest down 5% at the centre, no change on the ring, up 5% at the rim).
        VWAP side: 0.5 + the gap from VWAP on the move's side ÷ 2 (1% on the other side at the centre, 1% on the move's side at the rim).
        Beyond R1 or S1: straight lines through the pivot levels; for a rise S1 is the centre, the pivot a quarter, R1 the ring and R2 the rim (mirrored for a fall).
        OI change 5%+: the size of the OI change ÷ 10 (5% on the ring, 10% or more at the rim).
        Range end: where the price sits in the day's range, low to high for a rise (high to low for a fall), with three quarters on the ring.
        The ✓, ✕ or ? on each label is the engine's own fact; ? means the number is not known yet. Open interest is summed over the current and next futures contract against their previous close. These describe where each stock traded; they say nothing about what comes next.</p></details>
    </section>
  );
}
