// Trading Lab > Order Flow > Option Pulse > OI Flow (docs/TRADING-LAB.md, MarketPulse idea 2): how fast call and put open interest changes,
// strike by strike, from snapshots of the index's nearest-expiry chain every 3 minutes in market hours (backend finlit/lab/oiflow.py).
// Facts only: "call OI +2.1 L at 25,000 in 15 minutes", never what it means for the price.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { compact, strikeText } from "../../lib/options";
import { WINDOW_NAME, flowLine, getOIFlow, heatMax, windowNote, type FlowStrike, type FlowWindow, type OIFlow as Flow } from "../../lib/oiflow";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";

const signed = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${compact(v)}`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");
const WINDOWS: FlowWindow[] = ["m15", "m60", "day"];

function StrikeFlowPop({ r, f }: { r: FlowStrike; f: Flow }) {
  const line = (name: string, v: number | null) => <div><dt>{name}</dt><dd className={tone(v)}>{signed(v)}</dd></div>;
  return (
    <>
      <header className="oflow-pop-h"><div><b>{f.underlying} {strikeText(r.strike)}</b><small>{r.atm ? "At the money · " : ""}expiry {f.expiry} · as of {f.asOf} IST</small></div></header>
      <div className="opul-pop2">
        {(["pe", "ce"] as const).map((s) => (
          <div key={s}><b>{s === "pe" ? "Put" : "Call"} OI {compact(r[s].oi)}</b>
            <dl className="oflow-pop-t one">{line("15 minutes", r[s].m15)}{line("1 hour", r[s].m60)}{line("Today", r[s].day)}</dl></div>))}
      </div>
      <p className="muted">A rise means positions were opened at this strike; a fall, that positions were closed. It does not say who opened them or why.</p>
    </>
  );
}

/** Put change to the left of each strike, call change to the right; solid when OI was added, outlined when it left. */
function FlowBars({ f, w }: { f: Flow; w: FlowWindow }) {
  const tip = useTip();
  const rows = f.strikes ?? [];
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.ce[w] ?? 0), Math.abs(r.pe[w] ?? 0)]));
  const RH = 22, W = 1000, MID = 500, LBL = 46, half = MID - LBL - 64, H = rows.length * RH + 26;
  const y = (i: number) => 18 + i * RH;
  const bar = (v: number | null, left: boolean, i: number) => {
    if (v == null || v === 0) return null;
    const len = (Math.abs(v) / max) * half, x0 = left ? MID - LBL - len : MID + LBL;
    return (
      <g className={`oiflw-bar ${left ? "pe" : "ce"} ${v > 0 ? "add" : "gone"}`}>
        <rect x={x0} y={y(i) + 4} width={Math.max(1, len)} height={RH - 8} rx="3" />
        <text x={left ? x0 - 6 : x0 + len + 6} y={y(i) + RH / 2 + 4} textAnchor={left ? "end" : "start"} className="opul-v">{signed(v)}</text>
      </g>
    );
  };
  return (
    <svg className="opul-ladder oiflw-bars" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${f.underlying} OI change by strike, ${WINDOW_NAME[w].toLowerCase()}: puts on the left, calls on the right`}>
      <text x={MID - LBL - 8} y={11} textAnchor="end" className="opul-head pe">PUT OI CHANGE</text>
      <text x={MID + LBL + 8} y={11} className="opul-head ce">CALL OI CHANGE</text>
      {rows.map((r, i) => (
        <g key={r.strike} className={`opul-row${r.atm ? " atm" : ""}`} onPointerMove={(e) => tip.show(e, <StrikeFlowPop r={r} f={f} />)} onPointerLeave={() => tip.hide()}>
          <rect x="0" y={y(i)} width={W} height={RH} className="hit" />
          {bar(r.pe[w], true, i)}{bar(r.ce[w], false, i)}
          <rect x={MID - LBL + 2} y={y(i) + 3} width={(LBL - 2) * 2} height={RH - 6} rx="5" className="opul-k" />
          <text x={MID} y={y(i) + RH / 2 + 4} textAnchor="middle" className="opul-kt">{strikeText(r.strike)}</text>
        </g>))}
    </svg>
  );
}

/** Strike by time: the change in OI between one snapshot and the next (green added, red closed, stronger for larger). */
function Heat({ f, side }: { f: Flow; side: "ce" | "pe" }) {
  const tip = useTip();
  const h = f.heat;
  if (!h || h.times.length === 0) return <p className="muted">The heat map starts with the second snapshot of the session.</p>;
  const rows = h[side], max = heatMax(rows), n = h.times.length;
  const LBL = 56, CW = Math.max(8, Math.min(26, 640 / n)), RH = 16, W = LBL + n * CW, H = h.strikes.length * RH + 18;
  const every = Math.max(1, Math.ceil(n / 8));
  return (
    <svg className="oiflw-heat" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${f.underlying} ${side === "pe" ? "put" : "call"} OI change between snapshots, strike by time, ${h.times[0]} to ${h.times[n - 1]}`}>
      {h.strikes.map((k, i) => (
        <g key={k}>
          <text x={LBL - 6} y={i * RH + RH - 4} textAnchor="end" className="oiflw-ht">{strikeText(k)}</text>
          {rows[i].map((v, j) => {
            const a = v == null ? 0 : Math.min(1, Math.abs(v) / max);
            return <rect key={j} x={LBL + j * CW} y={i * RH} width={CW - 1} height={RH - 1} rx="2"
              className={`oiflw-cell ${v == null ? "na" : v >= 0 ? "add" : "gone"}`} style={{ opacity: v == null ? 1 : 0.18 + 0.82 * a }}
              onPointerMove={(e) => tip.show(e, <><header className="oflow-pop-h"><div><b>{f.underlying} {strikeText(k)} {side === "pe" ? "put" : "call"}</b><small>{j ? h.times[j - 1] : "previous snapshot"} → {h.times[j]} IST</small></div>
                <div className="r"><small>OI change</small><b className={tone(v)}>{signed(v)}</b></div></header></>)}
              onPointerLeave={() => tip.hide()} />;
          })}
        </g>))}
      {h.times.map((t, j) => (j % every === 0 ? <text key={t} x={LBL + j * CW + CW / 2} y={H - 3} textAnchor="middle" className="oiflw-ht">{t}</text> : null))}
    </svg>
  );
}

export function OIFlow({ u }: { u: string }) {
  const [w, setW] = useState<FlowWindow>("m15");
  const [side, setSide] = useState<"ce" | "pe">("ce");
  const q = useQuery({ queryKey: ["oiflow", u], queryFn: () => getOIFlow(u), retry: false,
    refetchInterval: (s) => (s.state.data?.marketOpen ? 60_000 : false) });
  const f = q.data;
  return (
    <section className="oiflw" aria-labelledby="oiflw-h">
      <div className="oiflw-head">
        <div><h3 id="oiflw-h">OI Flow</h3>{f?.available && <p className="oflow-money-line">{flowLine(f, w, compact)}</p>}</div>
        <div className="oflow-bchips" role="group" aria-label="OI change over">{WINDOWS.map((k) => (
          <button key={k} type="button" className="oflow-bchip" aria-pressed={w === k} onClick={() => setW(k)}>{WINDOW_NAME[k]}</button>))}</div>
      </div>
      {q.isPending && <div className="skeleton" style={{ height: 300 }} aria-label="Loading OI Flow" />}
      {q.isError && <div className="formerr" role="alert">OI Flow could not be read right now. It refreshes by itself; try again in a minute.</div>}
      {f && !f.available && <p className="muted oflow-note">{f.detail}</p>}
      {f?.available && <>
        <p className="muted oiflw-meta">{f.today ? (f.marketOpen ? "Live" : "Today") : `Last session (${f.session})`} · expiry {f.expiry} · {f.snapshots} snapshots from {f.firstAt} to {f.asOf} IST · {windowNote(f, w)}</p>
        <div className="oiflw-grid">
          <div className="oiflw-main"><ChartZoom label={`${f.underlying} OI Flow by strike`}><FlowBars f={f} w={w} /></ChartZoom>
            <p className="muted opul-legend"><i className="sw pe" /> put · <i className="sw ce" /> call · solid: OI added · outlined: OI closed</p></div>
          <aside className="oiflw-side">
            {(["ce", "pe"] as const).map((s) => (
              <div key={s} className="opul-movers">
                <h3 className={s}>{s === "pe" ? "Puts" : "Calls"}, last 15 minutes</h3>
                <ol aria-label={`${s === "pe" ? "Put" : "Call"} strikes with the largest OI added and closed in 15 minutes`}>
                  {f.movers?.[s].build.map((m) => <li key={"b" + m.strike}><b>{strikeText(m.strike)}</b><span className="gain">{signed(m.change)}</span><small className="muted">added</small></li>)}
                  {f.movers?.[s].unwind.map((m) => <li key={"u" + m.strike}><b>{strikeText(m.strike)}</b><span className="loss">{signed(m.change)}</span><small className="muted">closed</small></li>)}
                  {!f.movers?.[s].build.length && !f.movers?.[s].unwind.length && <li className="muted">{f.gapMinutes?.m15 == null ? "Needs 15 minutes of snapshots." : "No change in 15 minutes."}</li>}
                </ol>
              </div>))}
          </aside>
        </div>
        <div className="oiflw-heatbox">
          <div className="oiflw-head"><h3>Change between snapshots</h3>
            <div className="oflow-bchips" role="group" aria-label="Heat map side">{(["ce", "pe"] as const).map((s) => (
              <button key={s} type="button" className="oflow-bchip" aria-pressed={side === s} onClick={() => setSide(s)}>{s === "ce" ? "Calls" : "Puts"}</button>))}</div></div>
          <ChartZoom label={`${f.underlying} OI change heat map`}><Heat f={f} side={side} /></ChartZoom>
        </div>
      </>}
      <details className="oflow-how"><summary>How OI Flow is worked out</summary><p className="muted oflow-method">Every 3 minutes in market hours the site reads the index's nearest-expiry option chain (the same chain, cache and Dhan pacing as Option Pulse) and keeps each strike's call and put open interest near the money. The change over 15 minutes or 1 hour is OI now minus OI in the latest snapshot at least that long ago (the real gap is shown); today's change is against the previous close. A rise in OI means new positions were opened at that strike, a fall that positions were closed; it does not say who opened them or why, and it is not a forecast.</p></details>
    </section>
  );
}
