// Trading Lab > Order Flow > Stock zones (docs/TRADING-LAB.md "Stock zones"): 5-minute candles of the latest two sessions of any F&O stock with
// the price areas worked out from them (backend finlit/lab/zones.py): order blocks, fair-value gaps, the previous day's high, low and close, the
// opening range, VWAP and floor pivots. Hover any candle, zone or level for the detail. Facts only, never a call.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../lib/api";
import { matchUnderlyings, type Underlyings } from "../../lib/options";
import { inr } from "../../lib/flow";
import { KIND, STATUS_NOTE, ZONE_RULE, between, nearest, zoneName, zonesLine, type Zone, type ZoneLevel, type Zones } from "../../lib/zones";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";

const getUnderlyings = () => apiGet<Underlyings>("/api/options/lab/underlyings");
const getZones = (s: string) => apiGet<Zones>(`/api/lab/zones/${encodeURIComponent(s)}`);
const QUICK = ["RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "SBIN", "TCS"];
const hm = (iso: string) => iso.slice(11, 16);
const dmy = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`);

function ZonePop({ z, last }: { z: Zone; last?: number }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{zoneName(z)}</b><small>{dmy(z.at)} {hm(z.at)} · 5-minute candles</small></div>
        <div className="r"><small>width</small><b>{((z.hi - z.lo) / z.lo * 100).toFixed(2)}%</b></div></header>
      <dl className="oflow-pop-t">
        <div><dt>From</dt><dd>{inr(z.lo)}</dd></div>
        <div><dt>To</dt><dd>{inr(z.hi)}</dd></div>
        <div><dt>Status</dt><dd>{z.status}</dd></div>
        <div><dt>Candles in it since</dt><dd>{z.touches}</dd></div>
        <div><dt>From the price</dt><dd className={(z.distancePct ?? 0) >= 0 ? "gain" : "loss"}>{pct(z.distancePct)}</dd></div>
        {z.moveAvg != null && <div><dt>Move after it</dt><dd>{z.moveAvg}× avg candle</dd></div>}
      </dl>
      <p className="muted zon-pop-note">{STATUS_NOTE[z.status]} {ZONE_RULE[z.kind]}{last != null ? ` Last price ${inr(last)}.` : ""}</p>
    </>
  );
}

function LevelPop({ l, last }: { l: ZoneLevel; last?: number }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{l.label}</b><small>{l.note}</small></div><div className="r"><small>level</small><b>{inr(l.price)}</b></div></header>
      {last != null && <p className="muted zon-pop-note">The last price is {pct((last - l.price) / l.price * 100)} from it.</p>}
    </>
  );
}

function CandlePop({ z, i }: { z: Zones; i: number }) {
  const k = z.candles!, up = k.c[i] >= k.o[i], vw = z.vwap?.[i];
  const inside = (z.zones ?? []).filter((x) => x.index <= i && k.l[i] <= x.hi && k.h[i] >= x.lo);
  return (
    <>
      <header className="oflow-pop-h"><div><b>{z.symbol} {hm(k.t[i])}</b><small>{dmy(k.t[i])} · 5 minutes</small></div>
        <div className="r"><small>close</small><b className={up ? "gain" : "loss"}>{inr(k.c[i])}</b></div></header>
      <dl className="oflow-pop-t">
        <div><dt>Open</dt><dd>{inr(k.o[i])}</dd></div><div><dt>High</dt><dd>{inr(k.h[i])}</dd></div>
        <div><dt>Low</dt><dd>{inr(k.l[i])}</dd></div><div><dt>Close</dt><dd>{inr(k.c[i])}</dd></div>
        <div><dt>Volume</dt><dd>{k.v[i].toLocaleString("en-IN")}</dd></div><div><dt>VWAP</dt><dd>{vw == null ? "—" : inr(vw)}</dd></div>
      </dl>
      {inside.length > 0 && <ul className="oflow-facts">{inside.map((x) => <li key={x.kind + x.index}>Traded inside the {zoneName(x).toLowerCase()} of {hm(x.at)}</li>)}</ul>}
    </>
  );
}

const GROUP_CLASS: Record<ZoneLevel["group"], string> = { previous: "prev", pivot: "piv", opening: "or", vwap: "vw" };

/** The candles with the zones as bands from where they formed to the right edge, and the levels as lines. */
export function ZoneChart({ z, show }: { z: Zones; show: { ob: boolean; fvg: boolean; levels: boolean } }) {
  const tip = useTip();
  const [hot, setHot] = useState<number | null>(null);
  const k = z.candles!, n = k.t.length;
  const W = 1000, H = 520, L = 8, R = 120, T = 12, B = 28;
  const zs = (z.zones ?? []).filter((x) => show[x.kind]);
  const lv = show.levels ? (z.levels ?? []) : [];
  const lo0 = Math.min(...k.l), hi0 = Math.max(...k.h), reach = (hi0 - lo0) * 0.25;
  const near = lv.filter((l) => l.price >= lo0 - reach && l.price <= hi0 + reach);   // far-off levels would squash the candles; the list shows all
  const vals = [...k.l, ...k.h, ...near.map((l) => l.price), ...zs.flatMap((x) => [x.lo, x.hi])];
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
  const y = (v: number) => T + ((hi - v) / sp) * (H - T - B);
  const cw = (W - L - R) / n, x = (i: number) => L + i * cw + cw / 2, bw = Math.max(1.5, cw * 0.66);
  const vw = (z.vwap ?? []).map((v, i) => (v == null ? null : [x(i), y(v)] as const));
  const vwD = vw.reduce((d, p, i) => (p ? d + `${d && vw[i - 1] ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}` : d), "");
  const dayStart = k.t.findIndex((t) => t.slice(0, 10) === z.session);
  // a candle catches the pointer only around its own high and low, so the zones and levels behind it can be pointed at too
  // the level labels on the right, spread apart so none overlaps
  const lab = [...near].sort((a, b) => b.price - a.price).map((l) => ({ l, y: y(l.price) }));
  for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 15) lab[i].y = lab[i - 1].y + 15;
  return (
    <svg className="zon-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${z.symbol}: ${n} candles of 5 minutes, ${zs.length} zones, ${near.length} levels`} onPointerLeave={() => { setHot(null); tip.hide(); }}>
      {dayStart > 0 && <g className="zon-day"><line x1={L + dayStart * cw} x2={L + dayStart * cw} y1={T} y2={H - B} />
        <text x={L + dayStart * cw + 6} y={H - 10}>{dmy(k.t[dayStart])}</text><text x={L + 6} y={H - 10}>{dmy(k.t[0])}</text></g>}
      {zs.map((q) => (
        <rect key={q.kind + q.index + q.side} className={`zon-band ${q.kind} ${q.side} ${q.status.replace(" ", "-")}`} x={L + q.index * cw} width={W - R - L - q.index * cw}
          y={y(q.hi)} height={Math.max(2, y(q.lo) - y(q.hi))} rx={2}
          onPointerMove={(e) => tip.show(e, <ZonePop z={q} last={z.last} />)} onPointerLeave={() => tip.hide()} />
      ))}
      {lab.map(({ l, y: ly }) => (
        <g key={l.key} className={`zon-lvl ${GROUP_CLASS[l.group]}`} onPointerMove={(e) => tip.show(e, <LevelPop l={l} last={z.last} />)} onPointerLeave={() => tip.hide()}>
          <line x1={L} x2={W - R} y1={y(l.price)} y2={y(l.price)} /><line className="hit" x1={L} x2={W} y1={y(l.price)} y2={y(l.price)} />
          <text x={W - R + 6} y={ly + 4}>{l.key} {l.price.toFixed(l.price >= 1000 ? 0 : 1)}</text>
        </g>
      ))}
      {vwD && <path className="zon-vwap" d={vwD} />}
      {k.t.map((t, i) => {
        const up = k.c[i] >= k.o[i], top = y(Math.max(k.o[i], k.c[i])), bot = y(Math.min(k.o[i], k.c[i]));
        return (
          <g key={t} className={`zon-k ${up ? "up" : "down"}${hot === i ? " hot" : ""}`}
            onPointerMove={(e) => { setHot(i); tip.show(e, <CandlePop z={z} i={i} />); }}>
            <rect className="hit" x={L + i * cw} width={cw} y={y(k.h[i]) - 6} height={y(k.l[i]) - y(k.h[i]) + 12} />
            <line x1={x(i)} x2={x(i)} y1={y(k.h[i])} y2={y(k.l[i])} />
            <rect className="body" x={x(i) - bw / 2} width={bw} y={top} height={Math.max(1, bot - top)} />
          </g>
        );
      })}
      {z.last != null && <g className="zon-last"><line x1={L} x2={W - R} y1={y(z.last)} y2={y(z.last)} />
        <rect x={W - R + 2} y={y(z.last) - 10} width={R - 4} height={20} rx={4} /><text x={W - R + 8} y={y(z.last) + 4}>{inr(z.last)}</text></g>}
    </svg>
  );
}

export function StockZones() {
  const [sym, setSym] = useState("RELIANCE");
  const [find, setFind] = useState("");
  const [show, setShow] = useState({ ob: true, fvg: true, levels: true });
  const tip = useTip();
  const und = useQuery({ queryKey: ["opul-und"], queryFn: getUnderlyings, retry: false, staleTime: 3600_000 });
  const q = useQuery({ queryKey: ["lab-zones", sym], queryFn: () => getZones(sym), retry: false,
    refetchInterval: (s) => (s.state.data?.phase === "open" ? 60_000 : false) });
  const matches = useMemo(() => (find.trim() && und.data ? matchUnderlyings(und.data.stocks, find, 8) : []), [find, und.data]);
  const z = q.data;
  const ok = !!z?.available && !!z.candles && z.candles.t.length > 1;
  const pick = (s: string) => { setSym(s); setFind(""); };
  const b = ok ? between(z!.levels, z!.last) : { above: null, below: null };
  return (
    <section className="card oflow-board zon" aria-labelledby="zon-h">
      <div className="oflow-hero-h"><div><h2 id="zon-h">Stock zones</h2>{ok && <p className="oflow-money-line">{zonesLine(z!)}</p>}</div></div>
      <div className="opul-pick">
        <div className="oflow-bchips" role="group" aria-label="Stocks">{QUICK.map((s) => (
          <button key={s} type="button" className="oflow-bchip" aria-pressed={sym === s} onClick={() => pick(s)}>{s}</button>))}</div>
        <div className="opul-find">
          <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Any F&O stock" aria-label="Find an F&O stock" />
          {matches.length > 0 && <ul className="opul-found" aria-label="Matching stocks">{matches.map((m) => (
            <li key={m.key}><button type="button" onClick={() => pick(m.key)}><b>{m.key}</b> <span className="muted">{m.name}</span></button></li>))}</ul>}
        </div>
        <div className="oflow-bchips" role="group" aria-label="Show on the chart">
          {(["ob", "fvg"] as const).map((kd) => <button key={kd} type="button" className={`oflow-bchip zon-t ${kd}`} aria-pressed={show[kd]} onClick={() => setShow({ ...show, [kd]: !show[kd] })}>{KIND[kd]}s</button>)}
          <button type="button" className="oflow-bchip" aria-pressed={show.levels} onClick={() => setShow({ ...show, levels: !show.levels })}>Levels</button>
        </div>
      </div>
      {q.isPending && <div className="skeleton" style={{ height: 440 }} aria-label="Loading the candles" />}
      {(q.isError || (z && !z.available)) && <div className="formerr" role="alert">{z?.detail || (q.error instanceof ApiError && q.error.body.detail) || `The candles for ${sym} could not be read right now. Try again in a minute.`}</div>}
      {ok && <div className="opul-grid">
        <div className="opul-main"><ChartZoom label={`${z!.symbol} zones`}><ZoneChart z={z!} show={show} /></ChartZoom>
          <p className="muted opul-legend"><i className="sw zon-ob" /> order block · <i className="sw zon-fvg" /> fair-value gap · faded: filled or broken · <i className="sw zon-vw" /> VWAP · lines: previous day, opening range, pivots</p></div>
        <aside className="opul-side">
          <dl className="opul-stats">
            <div><dt>Last</dt><dd>{inr(z!.last)}</dd></div>
            <div><dt>Change</dt><dd className={(z!.changePct ?? 0) >= 0 ? "gain" : "loss"}>{pct(z!.changePct)}</dd></div>
            <div><dt>Day high</dt><dd>{inr(z!.dayHigh)}</dd></div>
            <div><dt>Day low</dt><dd>{inr(z!.dayLow)}</dd></div>
            <div><dt>Level above</dt><dd>{b.above ? <>{b.above.key} <small>{inr(b.above.price)}</small></> : "—"}</dd></div>
            <div><dt>Level below</dt><dd>{b.below ? <>{b.below.key} <small>{inr(b.below.price)}</small></> : "—"}</dd></div>
          </dl>
          <div className="opul-movers"><h3>Nearest open zones</h3>
            {nearest(z!.zones).length ? <ol aria-label="Nearest open zones">{nearest(z!.zones).map((x) => (
              <li key={x.kind + x.index} className="zon-li" onPointerMove={(e) => tip.show(e, <ZonePop z={x} last={z!.last} />)} onPointerLeave={() => tip.hide()}>
                <b className={`zon-tag ${x.kind} ${x.side}`}>{x.kind === "ob" ? "OB" : "FVG"} {x.side === "up" ? "▲" : "▼"}</b>
                <span>{inr(x.lo)}–{inr(x.hi).replace("₹", "")}</span><small className={(x.distancePct ?? 0) >= 0 ? "gain" : "loss"}>{pct(x.distancePct)}</small></li>))}</ol>
              : <p className="muted">Every zone on the chart has been filled or broken.</p>}</div>
          <div className="opul-movers"><h3>Levels</h3>
            <ol aria-label="Levels">{(z!.levels ?? []).map((l) => (
              <li key={l.key} className="zon-li" onPointerMove={(e) => tip.show(e, <LevelPop l={l} last={z!.last} />)} onPointerLeave={() => tip.hide()}>
                <b>{l.key}</b><span>{inr(l.price)}</span><small className="muted">{l.label}</small></li>))}</ol></div>
          <p className="muted opul-asof">{z!.phase === "open" ? "Live" : "Last session"}{z!.asOf ? ` · as of ${hm(z!.asOf)} IST` : ""} · {z!.source}{z!.stale ? " · last good copy" : ""}</p>
        </aside>
      </div>}
      {ok && z!.stale && z!.detail && <p className="muted oflow-note">{z!.detail}</p>}
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">From 5-minute candles of the last five sessions; the chart shows the latest two. Order block: {ZONE_RULE.ob} Fair-value gap: {ZONE_RULE.fvg} Gaps narrower than 0.1% of the price are left out. Previous day: that session's high, low and last close. Opening range: the high and low of the first 15 minutes. VWAP: the volume-weighted average of each candle's (high + low + close) / 3 since the open. Pivots: P = (H + L + C) / 3 of the previous session, R1 = 2P − L, S1 = 2P − H, R2 = P + (H − L), S2 = P − (H − L). These describe where prices traded; they are not a forecast.</p></details>
    </section>
  );
}
