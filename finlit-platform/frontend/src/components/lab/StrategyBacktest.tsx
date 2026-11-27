// Trading Lab > Order Flow > Strategy backtest (docs/TRADING-LAB.md "Strategy backtest"): market-lab's 23 fixed swing rules (MIT,
// github.com/heysanjeevv/market-lab) run on one stock's stored daily prices by the backend (finlit/lab/backtest.py). Every rule is shown, in its
// own list order, with its number of trades; results are net of the stated costs unless gross is chosen. Facts of past prices only.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../lib/api";
import { matchUnderlyings, type Underlyings } from "../../lib/options";
import { inr } from "../../lib/flow";
import { HOW, LIST_ORDER, NOTE, dmy, equity, pc, pctOf, resultOf, rr, sortRules, tone, type Backtest, type Basis, type Rule, type Sort, type SortKey, type Trade } from "../../lib/backtest";
import { useTip } from "./FlowTips";
import { ChartZoom, useZoomHeight } from "../ChartZoom";
import "../../styles/backtest.css";

const getUnderlyings = () => apiGet<Underlyings>("/api/options/lab/underlyings");
const getBacktest = (s: string, exit: string) => apiGet<Backtest>(`/api/lab/backtest/${encodeURIComponent(s)}?exit=${encodeURIComponent(exit)}`);
const QUICK = ["RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "SBIN", "TCS"];
const FIRST = 15;
const SYMBOL = /^[A-Z0-9&_.-]{1,24}$/;
/** A deep link (/lab/flow?view=backtest&symbol=…&rule=…, from the Setup scanner): the stock and rule it names, when they are well formed. */
const linked = (p: URLSearchParams) => {
  const sym = (p.get("symbol") ?? "").trim().toUpperCase(), rule = p.get("rule") ?? "";
  return { sym: SYMBOL.test(sym) ? sym : "", rule: /^[a-z0-9]{1,24}$/.test(rule) ? rule : "" };
};

export function usePhone() {
  const q = "(max-width: 560px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const f = () => setOn(m.matches);
    f();
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return on;
}

/** The width of a box in CSS pixels (900 until it is measured, and where ResizeObserver is missing). */
function useWidth(ref: React.RefObject<HTMLDivElement | null>, fallback = 900) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const x = Math.floor(el.clientWidth); if (x > 0) setW(x); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// ------------------------------------------------------------------------------------------------------------------ hover cards
function TradePop({ t, b, rule }: { t: Trade; b: Basis; rule: string }) {
  const r = resultOf(t, b);
  return (
    <>
      <header className="oflow-pop-h"><div><b>{rule}</b><small>Trigger {dmy(t.trigger)} · {t.days} sessions</small></div>
        <div className="r"><small>{b === "net" ? "net" : "gross"}</small><b className={tone(r)}>{rr(r)}</b></div></header>
      <dl className="oflow-pop-g">
        <div><dt>Entry ({dmy(t.entry)})</dt><dd>{inr(t.entryPrice)}</dd></div>
        <div><dt>Exit ({dmy(t.exit)})</dt><dd>{inr(t.exitPrice)}</dd></div>
        <div><dt>Lower exit level</dt><dd>{inr(t.lower)}</dd></div>
        <div><dt>Upper exit level</dt><dd>{t.upper == null ? "none" : inr(t.upper)}</dd></div>
        <div><dt>Initial risk (1R)</dt><dd>{inr(t.entryPrice - t.lower)} <small>({t.riskPct.toFixed(2)}%)</small></dd></div>
        <div><dt>Result</dt><dd className={tone(r)}>{pc(pctOf(t, b))}</dd></div>
      </dl>
      <p className="oflow-pop-what">{HOW[t.how]}.</p>
    </>
  );
}

function RulePop({ r, b, i }: { r: Rule; b: Basis; i: number }) {
  const f = r[b];
  return (
    <>
      <header className="oflow-pop-h"><div><b>{r.name}</b><small>Rule {i + 1} of 23 · {r.kind}</small></div>
        <div className="r"><small>trades</small><b>{f.trades}</b></div></header>
      <p className="oflow-pop-what"><b>Trigger:</b> {r.trigger}</p>
      <p className="oflow-pop-what"><b>Entry:</b> {r.entry} <b>Lower exit level:</b> {r.lower}</p>
      {f.trades > 0 && <dl className="oflow-pop-g">
        <div><dt>Win rate</dt><dd>{f.winRate}%</dd></div><div><dt>Average</dt><dd className={tone(f.avgR)}>{rr(f.avgR)}</dd></div>
        <div><dt>Longest losing run</dt><dd>{f.worstRun.count}</dd></div><div><dt>Deepest drawdown</dt><dd>{rr(-f.drawdown.r)}</dd></div>
      </dl>}
      {f.few && <p className="oflow-pop-what bt-few-t">Fewer than 30 trades: a small sample.</p>}
    </>
  );
}

function BarPop({ d, i, trade, rule }: { d: Backtest; i: number; trade: Trade | null; rule: string }) {
  const p = d.prices;
  return (
    <>
      <header className="oflow-pop-h"><div><b>{d.symbol} {dmy(p.t[i])}</b><small>Daily candle</small></div>
        <div className="r"><small>close</small><b>{inr(p.c[i])}</b></div></header>
      <dl className="oflow-pop-g">
        <div><dt>Open</dt><dd>{inr(p.o[i])}</dd></div><div><dt>High</dt><dd>{inr(p.h[i])}</dd></div>
        <div><dt>Low</dt><dd>{inr(p.l[i])}</dd></div><div><dt>Close</dt><dd>{inr(p.c[i])}</dd></div>
      </dl>
      <p className="oflow-pop-what">{trade ? `Inside a ${rule} trade: entry ${dmy(trade.entry)} at ${inr(trade.entryPrice)}, exit ${dmy(trade.exit)}.` : `No ${rule} trade open on this day.`}</p>
    </>
  );
}

// ------------------------------------------------------------------------------------------------------------------ charts
function useIndex(d: Backtest) {
  return useMemo(() => new Map(d.prices.t.map((t, i) => [t, i])), [d.prices.t]);
}

/** The running total of R, trade by trade, on the price chart's time axis; the deepest drawdown shaded with its dates. */
export function EquityChart({ d, r, b, phone }: { d: Backtest; r: Rule; b: Basis; phone: boolean }) {
  const tip = useTip();
  const box = useRef<HTMLDivElement>(null);
  const [, h] = useZoomHeight(phone ? 180 : 220, box);
  const w = useWidth(box);
  const at = useIndex(d);
  const pts = equity(r.trades, b);
  const n = d.prices.t.length;
  const L = phone ? 54 : 58, R = 12, T = 12, B = 26;
  const ix = (iso: string) => at.get(iso) ?? 0;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (w - L - R);
  const vals = pts.map((p) => p.r);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), sp = hi - lo || 1;
  const y = (v: number) => T + ((hi - v) / sp) * (h - T - B);
  const dd = r[b].drawdown;
  let path = "";
  pts.forEach((p, k) => { const X = x(ix(p.d)).toFixed(1), Y = y(p.r).toFixed(1); path += k ? `H${X}V${Y}` : `M${X},${Y}`; });
  const yearTicks = useMemo(() => {
    const out: { i: number; y: string }[] = [];
    let last = "";
    d.prices.t.forEach((t, i) => { const yy = t.slice(0, 4); if (yy !== last) { out.push({ i, y: yy }); last = yy; } });
    return out.slice(1);
  }, [d.prices.t]);
  return (
    <div className="bt-plot" ref={box}>
      <svg className="bt-eq" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" data-chart="bt-equity"
        aria-label={`${r.name}: running total of ${b === "net" ? "net" : "gross"} R over ${r[b].trades} trades, ending at ${rr(r[b].totalR)}`}
        onPointerLeave={() => tip.hide()}>
        {yearTicks.map((k) => <g key={k.y} className="bt-grid"><line x1={x(k.i)} x2={x(k.i)} y1={T} y2={h - B} /><text x={x(k.i) + 3} y={h - 8}>{k.y}</text></g>)}
        {dd.r > 0 && dd.from && dd.to && <rect className="bt-dd" x={x(ix(dd.from))} width={Math.max(2, x(ix(dd.to)) - x(ix(dd.from)))} y={T} height={h - T - B}>
          <title>Deepest drawdown {rr(-dd.r)}, {dmy(dd.from)} – {dmy(dd.to)}</title></rect>}
        <line className="bt-zero" x1={L} x2={w - R} y1={y(0)} y2={y(0)} />
        {[hi, 0, lo].filter((v, k, a) => a.indexOf(v) === k).map((v) => <text key={v} className="bt-ylab" x={L - 6} y={y(v) + 4} textAnchor="end">{rr(v, false).replace(" R", "R")}</text>)}
        {path && <path className="bt-eq-line" d={path} />}
        {pts.filter((p) => p.t).map((p) => {
          const t = p.t!, v = resultOf(t, b);
          return <circle key={t.entry} className={`bt-eq-dot ${tone(v)}`} cx={x(ix(p.d))} cy={y(p.r)} r={phone ? 4 : 3.5}
            onPointerMove={(e) => tip.show(e, <TradePop t={t} b={b} rule={r.name} />)} onPointerLeave={() => tip.hide()} />;
        })}
        {!pts.length && <text className="bt-empty" x={w / 2} y={h / 2} textAnchor="middle">No closed trades for this rule and exit.</text>}
      </svg>
    </div>
  );
}

/** Daily closes for the whole coverage, with each past trade drawn from its entry (triangle) to its exit (circle). */
export function PriceChart({ d, r, b, phone }: { d: Backtest; r: Rule; b: Basis; phone: boolean }) {
  const tip = useTip();
  const box = useRef<HTMLDivElement>(null);
  const [, h] = useZoomHeight(phone ? 240 : 320, box);
  const w = useWidth(box);
  const at = useIndex(d);
  const p = d.prices, n = p.t.length;
  const L = phone ? 50 : 62, R = 12, T = 12, B = 26;
  const vals = [...p.l, ...p.h].filter((v) => v > 0);
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (w - L - R);
  const y = (v: number) => T + ((hi - v) / sp) * (h - T - B);
  const step = Math.max(1, Math.floor(n / Math.max(200, w)));
  let line = "";
  for (let i = 0; i < n; i += step) line += `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.c[i]).toFixed(1)}`;
  line += `L${x(n - 1).toFixed(1)},${y(p.c[n - 1]).toFixed(1)}`;
  const tested = at.get(d.coverage.testedFrom) ?? 0;
  const ticks = [hi, (hi + lo) / 2, lo];
  const open = (i: number) => r.trades.find((t) => (at.get(t.entry) ?? -1) <= i && i <= (at.get(t.exit) ?? -1)) ?? null;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) * (w / (rect.width || w)) - L) / ((w - L - R) / Math.max(1, n - 1)));
    if (i < 0 || i >= n) return;
    tip.show(e, <BarPop d={d} i={i} trade={open(i)} rule={r.name} />);
  };
  const tri = (cx: number, cy: number, s: number) => `M${cx},${cy - s}L${cx + s},${cy + s * 0.8}L${cx - s},${cy + s * 0.8}Z`;
  return (
    <div className="bt-plot" ref={box}>
      <svg className="bt-px" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" data-chart="bt-price"
        aria-label={`${d.symbol} daily closes ${dmy(p.t[0])} – ${dmy(p.t[n - 1])} with ${r.trades.length} past ${r.name} trades marked`}
        onPointerMove={onMove} onPointerLeave={() => tip.hide()}>
        {tested > 0 && <g className="bt-warm"><rect x={L} width={Math.max(0, x(tested) - L)} y={T} height={h - T - B} /><text x={L + 4} y={T + 14}>warm-up</text></g>}
        {ticks.map((v) => <g key={v} className="bt-grid"><line x1={L} x2={w - R} y1={y(v)} y2={y(v)} /><text className="bt-ylab" x={L - 6} y={y(v) + 4} textAnchor="end">{v >= 1000 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(1)}</text></g>)}
        <text className="bt-xlab" x={L} y={h - 8}>{dmy(p.t[0])}</text>
        <text className="bt-xlab" x={w - R} y={h - 8} textAnchor="end">{dmy(p.t[n - 1])}</text>
        <path className="bt-px-line" d={line} />
        {r.trades.map((t) => {
          const i0 = at.get(t.entry) ?? 0, i1 = at.get(t.exit) ?? 0, v = resultOf(t, b), cls = tone(v) || "flat";
          const show = (e: React.PointerEvent) => { e.stopPropagation(); tip.show(e, <TradePop t={t} b={b} rule={r.name} />); };
          return (
            <g key={t.entry} className={`bt-trade ${cls}`}>
              <line x1={x(i0)} y1={y(t.entryPrice)} x2={x(i1)} y2={y(t.exitPrice)} />
              <path className="bt-in" d={tri(x(i0), y(t.entryPrice), phone ? 6 : 5)} onPointerMove={show} onPointerLeave={() => tip.hide()}><title>Entry {dmy(t.entry)} at {inr(t.entryPrice)}</title></path>
              <circle className="bt-out" cx={x(i1)} cy={y(t.exitPrice)} r={phone ? 5 : 4} onPointerMove={show} onPointerLeave={() => tip.hide()}><title>Exit {dmy(t.exit)} at {inr(t.exitPrice)}, {rr(v)}</title></circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ table and cards
const COLS: { key: SortKey; label: string; num: boolean }[] = [
  { key: "order", label: "#", num: true }, { key: "name", label: "Rule", num: false }, { key: "trades", label: "Trades", num: true },
  { key: "winRate", label: "Win rate", num: true }, { key: "avgR", label: "Average R", num: true }, { key: "medianR", label: "Median R", num: true },
  { key: "totalR", label: "Total R", num: true }, { key: "worstRun", label: "Longest losing run", num: true }, { key: "drawdown", label: "Deepest drawdown", num: true },
];

function Few({ f }: { f: Rule["net"] }) {
  return f.few ? <small className="bt-few">{f.trades === 0 ? "no trades" : "fewer than 30 trades"}</small> : null;
}

function Cells({ r, b }: { r: Rule; b: Basis }) {
  const f = r[b];
  if (!r.available) return <td colSpan={7} className="muted bt-na">Not tested: {r.note}</td>;
  if (!r.exitApplies) return <td colSpan={7} className="muted bt-na">This exit is for the three mean-reversion rules only.</td>;
  return (
    <>
      <td className="num">{f.trades}<Few f={f} /></td>
      <td className="num">{f.winRate == null ? "—" : `${f.winRate.toFixed(1)}%`}</td>
      <td className={`num ${tone(f.avgR)}`}>{rr(f.avgR)}</td>
      <td className={`num ${tone(f.medianR)}`}>{rr(f.medianR)}</td>
      <td className={`num ${tone(f.trades ? f.totalR : null)}`}>{f.trades ? rr(f.totalR) : "—"}</td>
      <td className="num">{f.trades ? <>{f.worstRun.count}{f.worstRun.count > 0 && <small>{dmy(f.worstRun.from)} – {dmy(f.worstRun.to)}</small>}</> : "—"}</td>
      <td className="num">{f.trades ? <>{rr(-f.drawdown.r)}{f.drawdown.r > 0 && <small>{dmy(f.drawdown.from)} – {dmy(f.drawdown.to)}</small>}</> : "—"}</td>
    </>
  );
}

function RuleTable({ rows, all, b, sort, setSort, chosen, choose }: { rows: Rule[]; all: Rule[]; b: Basis; sort: Sort; setSort: (s: Sort) => void; chosen: string; choose: (id: string) => void }) {
  const tip = useTip();
  const click = (k: SortKey) => {
    if (k === "order") return setSort(LIST_ORDER);
    if (sort.key === k) return setSort({ key: k, dir: sort.dir === "asc" ? "desc" : "asc" });
    setSort({ key: k, dir: k === "name" ? "asc" : "desc" });
  };
  return (
    <ChartZoom label="All 23 rules" kind="table">
      <div className="bt-tablewrap">
        <table className="bt-table">
          <caption className="sr-only">All 23 rules with their {b === "net" ? "net" : "gross"} results; choose a column to sort, # for the list order</caption>
          <thead><tr>{COLS.map((c) => (
            <th key={c.key} scope="col" className={c.num ? "num" : ""} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
              <button type="button" className="bt-sort" onClick={() => click(c.key)}>{c.label}<i aria-hidden="true">{sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</i></button>
            </th>))}</tr></thead>
          <tbody>{rows.map((r) => {
            const i = all.indexOf(r);
            return (
              <tr key={r.id} onPointerMove={(e) => tip.show(e, <RulePop r={r} b={b} i={i} />)} onPointerLeave={() => tip.hide()}>
                <td className="num muted">{i + 1}</td>
                <th scope="row"><button type="button" className="bt-pick" aria-pressed={chosen === r.id} onClick={() => choose(r.id)}>{r.name}</button>
                  <small className="muted">{r.kind}</small></th>
                <Cells r={r} b={b} />
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </ChartZoom>
  );
}

function RuleCards({ rows, all, b, chosen, choose }: { rows: Rule[]; all: Rule[]; b: Basis; chosen: string; choose: (id: string) => void }) {
  return (
    <ol className="bt-cards" aria-label="All 23 rules">{rows.map((r) => {
      const f = r[b], i = all.indexOf(r);
      return (
        <li key={r.id}><article className="bt-card" aria-label={r.name}>
          <header><span className="muted">{i + 1}</span><h3>{r.name}</h3>
            <button type="button" className="bt-pick" aria-pressed={chosen === r.id} onClick={() => choose(r.id)}>{chosen === r.id ? "On the charts" : "Show on the charts"}</button></header>
          {!r.available ? <p className="muted">Not tested: {r.note}</p> : !r.exitApplies ? <p className="muted">This exit is for the three mean-reversion rules only.</p> :
            <dl className="bt-card-g">
              <div><dt>Trades</dt><dd>{f.trades}<Few f={f} /></dd></div>
              <div><dt>Win rate</dt><dd>{f.winRate == null ? "—" : `${f.winRate.toFixed(1)}%`}</dd></div>
              <div><dt>Average R</dt><dd className={tone(f.avgR)}>{rr(f.avgR)}</dd></div>
              <div><dt>Median R</dt><dd className={tone(f.medianR)}>{rr(f.medianR)}</dd></div>
              <div><dt>Total R</dt><dd className={tone(f.trades ? f.totalR : null)}>{f.trades ? rr(f.totalR) : "—"}</dd></div>
              <div className="wide"><dt>Longest losing run</dt><dd>{f.trades ? f.worstRun.count : "—"}{f.worstRun.count > 0 && <small>{dmy(f.worstRun.from)} – {dmy(f.worstRun.to)}</small>}</dd></div>
              <div className="wide"><dt>Deepest drawdown</dt><dd>{f.trades ? rr(-f.drawdown.r) : "—"}{f.drawdown.r > 0 && <small>{dmy(f.drawdown.from)} – {dmy(f.drawdown.to)}</small>}</dd></div>
            </dl>}
        </article></li>
      );
    })}</ol>
  );
}

// ------------------------------------------------------------------------------------------------------------------ chosen rule
function Triggers({ r, b }: { r: Rule; b: Basis }) {
  const tip = useTip();
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [r.id]);
  const list = [...r.trades].reverse();
  const shown = all ? list : list.slice(0, FIRST);
  return (
    <div className="bt-sigs">
      <h3>Past triggers <small className="muted">({r.trades.length}, newest first)</small></h3>
      {list.length ? <ol aria-label={`Past ${r.name} triggers`}>{shown.map((t) => {
        const v = resultOf(t, b);
        return (
          <li key={t.entry} className="bt-sig" onPointerMove={(e) => tip.show(e, <TradePop t={t} b={b} rule={r.name} />)} onPointerLeave={() => tip.hide()}>
            <span className="d"><b>{dmy(t.trigger)}</b><small className="muted">trigger</small></span>
            <span><b>{inr(t.entryPrice)}</b><small className="muted">entry {dmy(t.entry)}</small></span>
            <span><b>{inr(t.exitPrice)}</b><small className="muted">exit {dmy(t.exit)} · {t.days} sessions</small></span>
            <span className={`r ${tone(v)}`}><b>{rr(v)}</b><small>{pc(pctOf(t, b))}</small></span>
            <small className="muted how">{HOW[t.how]}</small>
          </li>
        );
      })}</ol> : <p className="muted">No closed trades for this rule and exit.</p>}
      {!all && list.length > FIRST && <button type="button" className="btn sm bt-more" onClick={() => setAll(true)}>Show {list.length - FIRST} more</button>}
      {r.running > 0 && <p className="muted bt-small">{r.running} trade{r.running > 1 ? "s" : ""} still running at the last bar {r.running > 1 ? "are" : "is"} left out of the figures.</p>}
    </div>
  );
}

function Chosen({ d, r, b, phone }: { d: Backtest; r: Rule; b: Basis; phone: boolean }) {
  const ex = d.exits.find((e) => e.id === d.exit);
  const f = r[b];
  return (
    <section className="bt-chosen" aria-labelledby="bt-chosen-h">
      <h3 id="bt-chosen-h">{r.name} <small className="muted">rule {d.rules.indexOf(r) + 1} of 23 · {r.kind}</small></h3>
      <dl className="bt-def">
        <div><dt>Trigger (at a session's close)</dt><dd>{r.trigger}</dd></div>
        <div><dt>Entry</dt><dd>{r.entry}</dd></div>
        <div><dt>Lower exit level (set at the trigger)</dt><dd>{r.lower}</dd></div>
        <div><dt>Exit: {ex?.name}</dt><dd>{ex?.rule} Every session the lower exit level is checked first; an open under it fills at the open.</dd></div>
        <div><dt>Result in R</dt><dd>R is the initial risk: entry minus the lower exit level. A trade's result in R is its gain or loss divided by that risk{b === "net" ? `, after ${d.costs.roundTripPct.toFixed(3)}% round-trip costs` : ", before costs"}.</dd></div>
      </dl>
      {r.available && r.exitApplies && f.few && <p className="bt-warn" role="note">{f.trades === 0 ? "No trades: this rule did not trigger here with this exit." : `Fewer than 30 trades (${f.trades}): a small sample; one or two trades can swing every figure.`}</p>}
      {r.available && r.exitApplies && <div className="bt-charts">
        <div><h4 className="bt-h4">Running total in R</h4><ChartZoom label={`${r.name}: running total in R`}><EquityChart d={d} r={r} b={b} phone={phone} /></ChartZoom>
          <p className="muted bt-small"><i className="sw dd" /> shaded: the deepest drawdown{f.drawdown.r > 0 ? `, ${rr(-f.drawdown.r)} from ${dmy(f.drawdown.from)} to ${dmy(f.drawdown.to)}` : ""}.</p></div>
        <div><h4 className="bt-h4">Past triggers on the daily chart</h4><ChartZoom label={`${d.symbol}: past ${r.name} triggers`}><PriceChart d={d} r={r} b={b} phone={phone} /></ChartZoom>
          <p className="muted bt-small"><i className="sw tri" /> entry · <i className="sw dot gain" /> exit with a gain · <i className="sw dot loss" /> exit with a loss · shaded at the start: the warm-up sessions, not tested.</p></div>
      </div>}
      {r.available && r.exitApplies && <Triggers r={r} b={b} />}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------------------ tab
export function StrategyBacktest() {
  const phone = usePhone();
  const [params] = useSearchParams();
  const link = linked(params);
  const [sym, setSym] = useState(link.sym || "RELIANCE");
  const [find, setFind] = useState("");
  const [exit, setExit] = useState("trail3");
  const [b, setB] = useState<Basis>("net");
  const [sort, setSort] = useState<Sort>(LIST_ORDER);
  const [chosen, setChosen] = useState(link.rule);
  useEffect(() => { if (link.sym) setSym(link.sym); if (link.rule) setChosen(link.rule); }, [link.sym, link.rule]);   // a new link while the tab is open
  const und = useQuery({ queryKey: ["opul-und"], queryFn: getUnderlyings, retry: false, staleTime: 3600_000 });
  const q = useQuery({ queryKey: ["lab-backtest", sym, exit], queryFn: () => getBacktest(sym, exit), retry: false, staleTime: 600_000 });
  const matches = useMemo(() => (find.trim() && und.data ? matchUnderlyings(und.data.stocks, find, 8) : []), [find, und.data]);
  const d = q.data && Array.isArray(q.data.rules) && q.data.prices?.t?.length ? q.data : undefined;   // a malformed answer shows nothing rather than breaking the page
  const rows = useMemo(() => (d ? sortRules(d.rules, b, sort) : []), [d, b, sort]);
  const rule = d ? d.rules.find((r) => r.id === chosen) ?? d.rules[0] : null;
  const pick = (s: string) => { setSym(s); setFind(""); };
  const sortLabel = (s: Sort) => (s.key === "order" ? "List order" : s.key === "name" ? `Rule name (${s.dir === "asc" ? "A to Z" : "Z to A"})` : `${COLS.find((c) => c.key === s.key)?.label} (${s.dir === "asc" ? "low to high" : "high to low"})`);
  return (
    <section className="card oflow-board lab-bt" aria-labelledby="bt-h">
      <div className="oflow-hero-h"><div><h2 id="bt-h">Strategy backtest</h2>
        <p className="oflow-money-line">{d ? `${d.symbol} · ${d.coverage.text}` : "market-lab's 23 fixed swing rules on one stock's daily prices"}</p></div></div>
      <p className="bt-note" role="note">{NOTE}</p>
      <div className="opul-pick">
        <div className="oflow-bchips" role="group" aria-label="Stocks">{QUICK.map((s) => (
          <button key={s} type="button" className="oflow-bchip" aria-pressed={sym === s} onClick={() => pick(s)}>{s}</button>))}</div>
        <div className="opul-find">
          <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Any F&O stock" aria-label="Find a stock" />
          {matches.length > 0 && <ul className="opul-found" aria-label="Matching stocks">{matches.map((m) => (
            <li key={m.key}><button type="button" onClick={() => pick(m.key)}><b>{m.key}</b> <span className="muted">{m.name}</span></button></li>))}</ul>}
        </div>
      </div>
      <div className="bt-controls">
        <div className="oflow-bchips" role="group" aria-label="Exit">{(d?.exits ?? []).map((e) => (
          <button key={e.id} type="button" className="oflow-bchip" aria-pressed={exit === e.id} title={e.rule} onClick={() => setExit(e.id)}>{e.name}</button>))}</div>
        <div className="oflow-bchips" role="group" aria-label="Costs">
          <button type="button" className="oflow-bchip" aria-pressed={b === "net"} onClick={() => setB("net")}>Net of costs</button>
          <button type="button" className="oflow-bchip" aria-pressed={b === "gross"} onClick={() => setB("gross")}>Gross (before costs)</button>
        </div>
      </div>
      {q.isPending && <div className="skeleton" style={{ height: 420 }} aria-label="Working out the backtest" />}
      {q.isError && <div className="formerr" role="alert">{(q.error instanceof ApiError && q.error.body.detail) || `The backtest for ${sym} could not be worked out right now. Try again in a minute.`}</div>}
      {d && rule && <>
        <p className="muted bt-small">{b === "net" ? `Net of ${d.costs.roundTripPct.toFixed(3)}% round-trip costs (${d.costs.entryPct.toFixed(3)}% when a trade opens, ${d.costs.exitPct.toFixed(3)}% when it closes).` : "Gross: before costs."} Exit for every rule: {d.exits.find((e) => e.id === d.exit)?.name}. All 23 rules, {sort.key === "order" ? "in their list order" : `sorted by ${sortLabel(sort).toLowerCase()}`}; every figure counts closed trades only.{d.coverage.source ? ` ${d.coverage.source}` : ""}</p>
        {phone ? <>
          <label className="bt-sortsel">Order <select value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [k, dir] = e.target.value.split(":"); setSort({ key: k as SortKey, dir: dir as Sort["dir"] }); }} aria-label="Order of the rules">
            <option value="order:asc">List order</option>
            {COLS.filter((c) => c.key !== "order").flatMap((c) => (["desc", "asc"] as const).map((dir) => <option key={c.key + dir} value={`${c.key}:${dir}`}>{sortLabel({ key: c.key, dir })}</option>))}
          </select></label>
          <RuleCards rows={rows} all={d.rules} b={b} chosen={rule.id} choose={setChosen} />
        </> : <RuleTable rows={rows} all={d.rules} b={b} sort={sort} setSort={setSort} chosen={rule.id} choose={setChosen} />}
        <Chosen d={d} r={rule} b={b} phone={phone} />
        <details className="oflow-how"><summary>How it is worked out</summary>
          <div className="oflow-method bt-method">
            <p>Each rule's trigger uses only the sessions up to and including its trigger session; the trade starts at the next session's open. The lower exit level is fixed at the trigger; R, the initial risk, is entry minus that level. Each session the lower exit level is checked first (an open under it fills at the open), then the upper exit level of the 2R and 3R exits, then the exit rule. One trade at a time per rule: a trigger while a trade is running is ignored. A trade still running at the last stored session is left out. Trades with a risk above 25% of the entry, or near a one-day move above 35% (a split or a bad print), are skipped. The first 260 sessions only warm the indicators up.</p>
            <p>Win rate: the share of closed trades with a result above 0 R. Longest losing run: the most trades in a row at 0 R or below, with the first entry and last exit dates. Deepest drawdown: the largest fall of the running total of R from its high, with the dates of that high and of the low.</p>
            <p>Costs: {d.costs.text}</p>
            <table className="bt-costs"><caption>Costs as a % of the trade's value</caption><thead><tr><th scope="col">When the trade opens</th><th scope="col" className="num">%</th><th scope="col">When it closes</th><th scope="col" className="num">%</th></tr></thead>
              <tbody>{Array.from({ length: Math.max(d.costs.parts.entry.length, d.costs.parts.exit.length) }, (_, i) => (
                <tr key={i}><td>{d.costs.parts.entry[i]?.name ?? ""}</td><td className="num">{d.costs.parts.entry[i] ? d.costs.parts.entry[i].pct.toFixed(4) : ""}</td>
                  <td>{d.costs.parts.exit[i]?.name ?? ""}</td><td className="num">{d.costs.parts.exit[i] ? d.costs.parts.exit[i].pct.toFixed(4) : ""}</td></tr>))}
                <tr className="tot"><td>Total</td><td className="num">{d.costs.entryPct.toFixed(4)}</td><td>Total</td><td className="num">{d.costs.exitPct.toFixed(4)}</td></tr></tbody></table>
            <p>Data: {d.coverage.text} {d.coverage.source ?? ""} Volume rules use only the exchange's own volumes.</p>
            <p>Rules, indicators, exits and costs: <a href="https://github.com/heysanjeevv/market-lab" target="_blank" rel="noopener noreferrer">market-lab</a> (MIT licence, © 2026 Market Lab contributors), re-implemented on FinLit's prices; each rule names its source function ({rule.source}). {NOTE}</p>
          </div>
        </details>
      </>}
    </section>
  );
}
