// Trading Lab > Order Flow > Time Machine (docs/TRADING-LAB.md "Time Machine"): a member's plan (stock, date, start time, start price, lower and
// upper level, flat-by time) replayed 10,000 times on the stock's own past 5-minute bars (backend finlit/lab/timemachine.py), plus the same rule
// on every past session. The form checks the server's rules as you type; the answer shows which level came first, the fan of prices, where the
// replays stood at the flat-by time and every past session. Describe-only: it counts how the stock moved in the past.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getRsi } from "../../lib/rsi";
import {
  NOTE, OUTCOMES, OUTCOME_SHORT, checkPlan, day, failure, istToday, n0, nextWeekday, outcomeLine, pastLine, pc, px, runPlan, sampleLine, tick, toBody,
  type Field, type Outcome, type PastRow, type PlanForm, type TmResult,
} from "../../lib/timemachine";
import { useTip } from "./FlowTips";
import { usePhone } from "./RsiHeatmap";
import { ChartZoom } from "../ChartZoom";

const FIELDS: { k: Field; label: string; type: string; step?: string; hint?: string }[] = [
  { k: "symbol", label: "Stock", type: "text" },
  { k: "date", label: "Date", type: "date" },
  { k: "start", label: "Start time", type: "time", step: "300", hint: "09:15 when left empty" },
  { k: "price", label: "Start price (₹)", type: "number", step: "0.05" },
  { k: "lower", label: "Lower level (₹)", type: "number", step: "0.05" },
  { k: "upper", label: "Upper level (₹)", type: "number", step: "0.05" },
  { k: "flatBy", label: "Flat by", type: "time", step: "300" },
];

function PlanFormView({ onRun, busy, serverField, serverText }: { onRun: (f: PlanForm) => void; busy: boolean; serverField?: Field; serverText?: string }) {
  const today = istToday();
  const rsi = useQuery({ queryKey: ["lab-rsi"], queryFn: getRsi, retry: false, staleTime: 5 * 60_000 });
  const stocks = useMemo(() => (rsi.data?.ready ? rsi.data.stocks : []), [rsi.data]);
  const symbols = useMemo(() => new Set(stocks.map((s) => s.sym)), [stocks]);
  const [f, setF] = useState<PlanForm>({ symbol: "", date: nextWeekday(today), start: "09:15", flatBy: "15:15", price: "", lower: "", upper: "" });
  const [seen, setSeen] = useState<Set<Field>>(new Set());
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState<PlanForm | null>(null);
  const errs = checkPlan(f, today, symbols);
  const set = (k: Field, v: string) => setF((o) => {
    const n = { ...o, [k]: v };
    if (k === "symbol") {                       // a stock from the list: its latest price as the start price, levels 1% either side (when still empty)
      const s = stocks.find((x) => x.sym === v.trim().toUpperCase());
      if (s?.price && !o.price) Object.assign(n, { price: String(tick(s.price)), lower: String(tick(s.price * 0.99)), upper: String(tick(s.price * 1.01)) });
    }
    return n;
  });
  const msg = (k: Field) => (sent === f && serverField === k ? serverText : (tried || seen.has(k)) ? errs[k] : undefined);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errs).length) return;
    setSent(f);
    onRun(f);
  };
  return (
    <form className="tm-form" onSubmit={submit} noValidate aria-label="Time Machine plan">
      <datalist id="tm-stocks">{stocks.map((s) => <option key={s.sym} value={s.sym}>{s.name}</option>)}</datalist>
      {FIELDS.map(({ k, label, type, step, hint }) => {
        const m = msg(k);
        return (
          <label key={k} className="tm-f">
            <span className="tm-f-l">{label}</span>
            <input className="ui-input tm-in" name={k} type={type} step={step} value={f[k]} inputMode={type === "number" ? "decimal" : undefined}
              list={k === "symbol" ? "tm-stocks" : undefined} autoComplete="off" placeholder={k === "symbol" ? "RELIANCE" : undefined}
              aria-invalid={m ? true : undefined} aria-describedby={m ? `tm-e-${k}` : undefined}
              onChange={(e) => set(k, k === "symbol" ? e.target.value.toUpperCase() : e.target.value)} onBlur={() => setSeen((o) => new Set(o).add(k))} />
            {m ? <span id={`tm-e-${k}`} className="tm-err" role="alert">{m}</span> : hint ? <span className="tm-hint muted">{hint}</span> : null}
          </label>);
      })}
      <div className="tm-go">
        <button type="submit" className="ui-btn ui-btn--primary tm-run" disabled={busy}>{busy ? "Replaying…" : "Replay 10,000 times"}</button>
        {f.price && Number(f.price) > 0 && !errs.lower && !errs.upper && f.lower && f.upper &&
          <span className="muted tm-gaps">Lower {pc((tick(Number(f.lower)) / tick(Number(f.price)) - 1) * 100)} · upper {pc((tick(Number(f.upper)) / tick(Number(f.price)) - 1) * 100)} from the start price</span>}
      </div>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------------------------ the outcome bar

function OutcomePop({ r, k }: { r: TmResult; k: Outcome }) {
  const n = r.outcomes[k], med = k === "upper" ? r.medianBars.upper : k === "lower" ? r.medianBars.lower : null;
  return (
    <>
      <header className="oflow-pop-h"><div><b>{r.text.labels[k]}</b><small>{r.plan.symbol} · {r.plan.start} to {r.plan.flatBy}</small></div>
        <div className="r"><small>replays</small><b>{n0(n)}</b></div></header>
      <p className="tm-pop-p">{((n / r.sample.replays) * 100).toFixed(1)}% of {n0(r.sample.replays)} replays{med != null ? `; the middle replay reached it after ${med} bars (${med * r.sample.barMinutes} minutes)` : ""}.</p>
      <p className="muted tm-pop-p">Past sessions: {pastLine(r, k)}.</p>
    </>
  );
}

function OutcomeBar({ r }: { r: TmResult }) {
  const tip = useTip();
  const total = r.sample.replays;
  return (
    <div className="tm-outcomes">
      <div className="tm-obar" data-chart="tm-outcomes" role="group" aria-label={OUTCOMES.map((k) => outcomeLine(r, k)).join("; ")}>
        {OUTCOMES.filter((k) => r.outcomes[k] > 0).map((k) => (
          <span key={k} className={`tm-seg o-${k}`} style={{ flexGrow: r.outcomes[k], flexBasis: `${(r.outcomes[k] / total) * 100}%` }}
            aria-label={outcomeLine(r, k)} onPointerMove={(e) => tip.show(e, <OutcomePop r={r} k={k} />)} onPointerLeave={() => tip.hide()}>
            {r.outcomes[k] / total >= 0.08 ? `${Math.round((r.outcomes[k] / total) * 100)}%` : ""}
          </span>))}
      </div>
      <ul className="tm-olist">{OUTCOMES.map((k) => <li key={k}><i className={`tm-sw o-${k}`} aria-hidden="true" /><span>{outcomeLine(r, k)}</span></li>)}</ul>
      {r.medianBars.any != null && <p className="muted tm-med">Where a level was reached, the middle replay reached it after {r.medianBars.any} bars ({r.medianBars.any * r.sample.barMinutes} minutes).</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ the fan

const BASE_W = 640, H = 280, PL = 70, PR = 14, PT = 14, PB = 30;

/** The drawing's width in CSS pixels (the box it sits in), so the SVG draws 1:1 and its labels keep the type scale at every width. */
function useBoxWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(BASE_W);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => { const n = Math.round(es[0].contentRect.width); if (n > 200) setW((o) => (Math.abs(o - n) > 1 ? n : o)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function scale(lo: number, hi: number) {
  const pad = (hi - lo || hi * 0.01 || 1) * 0.06;
  const a = lo - pad, b = hi + pad;
  return { y: (v: number) => PT + ((b - v) / (b - a)) * (H - PT - PB), a, b };
}

function FanPop({ r, i }: { r: TmResult; i: number }) {
  const f = r.fan;
  const rows: [string, number][] = [["95th", f.p95[i]], ["75th", f.p75[i]], ["Middle (50th)", f.p50[i]], ["25th", f.p25[i]], ["5th", f.p5[i]]];
  return (
    <>
      <header className="oflow-pop-h"><div><b>{f.times[i]}</b><small>{i === 0 ? "the start" : `after ${i} bar${i === 1 ? "" : "s"} of 5 minutes`}</small></div>
        <div className="r"><small>start</small><b>{px(r.plan.price)}</b></div></header>
      <dl className="oflow-pop-t one">{rows.map(([k, v]) => <div key={k}><dt>{k} percentile</dt><dd>{px(v)} <span className="muted">({pc((v / r.plan.price - 1) * 100)})</span></dd></div>)}</dl>
      <p className="muted tm-pop-p">Of {n0(r.sample.replays)} replays, 90% stood inside the outer band and 50% inside the inner band at {f.times[i]}.</p>
    </>
  );
}

export function Fan({ r }: { r: TmResult }) {
  const tip = useTip();
  const [box, W] = useBoxWidth();
  const [at, setAt] = useState<number | null>(null);
  const f = r.fan, n = f.times.length;
  const { y, a, b } = scale(Math.min(...f.p5, r.plan.lower), Math.max(...f.p95, r.plan.upper));
  const x = (i: number) => PL + (n > 1 ? (i / (n - 1)) * (W - PL - PR) : 0);
  const line = (v: number[]) => v.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const band = (top: number[], bot: number[]) => `${line(top)}${bot.map((_, j) => { const i = bot.length - 1 - j; return `L${x(i).toFixed(1)},${y(bot[i]).toFixed(1)}`; }).join("")}Z`;
  const step = Math.max(1, Math.ceil((n - 1) / Math.max(2, Math.floor((W - PL - PR) / 70))));
  const ticks = Array.from({ length: 5 }, (_, k) => a + ((b - a) * (k + 0.5)) / 5);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const vx = box.width ? ((e.clientX - box.left) / box.width) * W : PL;
    const i = Math.max(0, Math.min(n - 1, Math.round(((vx - PL) / (W - PL - PR)) * (n - 1))));
    setAt(i);
    tip.show(e, <FanPop r={r} i={i} />);
  };
  const lv: [string, number, string][] = [["Upper", r.plan.upper, "u"], ["Start", r.plan.price, "p"], ["Lower", r.plan.lower, "l"]];
  return (
    <div className="tm-chart tm-fanwrap" ref={box}>
      <svg className="tm-fan" viewBox={`0 0 ${W} ${H}`} role="img" data-chart="tm-fan"
        aria-label={`${n0(r.sample.replays)} replays of ${r.plan.symbol} from ${f.times[0]} to ${f.times[n - 1]}: at ${f.times[n - 1]} the middle replay stood at ${px(f.p50[n - 1])}, 90% between ${px(f.p5[n - 1])} and ${px(f.p95[n - 1])}`}
        onPointerMove={pick} onPointerLeave={() => { setAt(null); tip.hide(); }}>
        {ticks.map((t) => <g key={t} className="tm-grid"><line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} /><text x={PL - 6} y={y(t) + 4} textAnchor="end">{px(t)}</text></g>)}
        <path className="tm-band outer" d={band(f.p95, f.p5)} />
        <path className="tm-band inner" d={band(f.p75, f.p25)} />
        <path className="tm-mid" d={line(f.p50)} />
        {lv.map(([k, v, c]) => <g key={k} className={`tm-lvl ${c}`}><line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} /><text x={W - PR - 4} y={y(v) - 4} textAnchor="end">{k} {px(v)}</text></g>)}
        {f.times.map((t, i) => (i % step === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= step / 2) ? <text key={t} className="tm-tx" x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{t}</text> : null)}
        {at != null && <line className="tm-guide" x1={x(at)} x2={x(at)} y1={PT} y2={H - PB} />}
      </svg>
      <p className="muted tm-legend"><span><i className="tm-sw tm-sw-bo" />5th to 95th percentile</span><span><i className="tm-sw tm-sw-bi" />25th to 75th</span><span><i className="tm-sw tm-sw-mid" />middle replay</span><span><i className="tm-sw tm-sw-dash" />start price and levels</span></p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ the histogram

export function Histogram({ r }: { r: TmResult }) {
  const tip = useTip();
  const [box, W] = useBoxWidth();
  const { edges, counts } = r.histogram;
  const top = Math.max(1, ...counts), lo = edges[0], hi = edges[edges.length - 1], span = hi - lo || 1;
  const HH = 210, PBt = 28, bw = (W - PL - PR) / counts.length;
  const xv = (v: number) => PL + ((v - lo) / span) * (W - PL - PR);
  const lv: [string, number, string][] = ([["Lower", r.plan.lower, "l"], ["Start", r.plan.price, "p"], ["Upper", r.plan.upper, "u"]] as [string, number, string][]).filter(([, v]) => v >= lo && v <= hi);
  return (
    <div className="tm-chart" ref={box}>
      <svg className="tm-hist" viewBox={`0 0 ${W} ${HH}`} role="img" data-chart="tm-hist"
        aria-label={`Price at ${r.plan.flatBy} in ${n0(r.sample.replays)} replays, ${px(lo)} to ${px(hi)}; the middle replay ${px(r.histogram.median)}`}>
        <line className="tm-axis" x1={PL} x2={W - PR} y1={HH - PBt} y2={HH - PBt} />
        {counts.map((c, i) => {
          const a = edges[i], b = edges[i + 1], mid = (a + b) / 2, h = (c / top) * (HH - PBt - 16);
          const side = mid < r.plan.price ? "loss" : mid > r.plan.price ? "gain" : "flat";
          return <rect key={i} className={`tm-bin ${side}`} x={PL + i * bw + 0.5} width={Math.max(1, bw - 1)} y={HH - PBt - h} height={Math.max(c ? 1 : 0, h)}
            onPointerMove={(e) => tip.show(e, <><header className="oflow-pop-h"><div><b>{px(a)} to {px(b)}</b><small>price at {r.plan.flatBy}</small></div><div className="r"><small>replays</small><b>{n0(c)}</b></div></header>
              <p className="tm-pop-p">{((c / r.sample.replays) * 100).toFixed(1)}% of {n0(r.sample.replays)} replays; {pc((mid / r.plan.price - 1) * 100)} from the start price.</p></>)}
            onPointerLeave={() => tip.hide()} />;
        })}
        {lv.map(([k, v, c]) => <g key={k} className={`tm-lvl ${c}`}><line x1={xv(v)} x2={xv(v)} y1={8} y2={HH - PBt} /><text x={xv(v) + 4} y={16}>{k}</text></g>)}
        <text className="tm-tx" x={PL} y={HH - 8}>{px(lo)}</text><text className="tm-tx" x={W - PR} y={HH - 8} textAnchor="end">{px(hi)}</text>
      </svg>
      <p className="muted tm-legend">Where each replay stood at {r.plan.flatBy}, whether or not it reached a level first. Middle replay {px(r.histogram.median)}.</p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ every past session

function RowPop({ row, r }: { row: PastRow; r: TmResult }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{day(row.date)}</b><small>{r.plan.symbol} · {r.plan.start} to {r.plan.flatBy}</small></div>
        <div className="r"><small>at {r.plan.flatBy}</small><b className={row.changePct > 0 ? "gain" : row.changePct < 0 ? "loss" : ""}>{pc(row.changePct)}</b></div></header>
      <dl className="oflow-pop-t one">
        <div><dt>Open at {r.plan.start}</dt><dd>{px(row.start)}</dd></div>
        <div><dt>Lower level</dt><dd>{px(row.lower)} ({pc(r.plan.lowerPct)})</dd></div>
        <div><dt>Upper level</dt><dd>{px(row.upper)} ({pc(r.plan.upperPct)})</dd></div>
        <div><dt>First reached</dt><dd>{r.text.labels[row.outcome]}{row.touchAt ? ` at ${row.touchAt}` : ""}</dd></div>
        <div><dt>At {r.plan.flatBy}</dt><dd>{px(row.end)}</dd></div>
        <div><dt>Bars stored</dt><dd>{row.bars} of 75</dd></div>
      </dl>
    </>
  );
}

function Past({ r, phone }: { r: TmResult; phone: boolean }) {
  const tip = useTip();
  const rows = [...r.past.rows].reverse();         // newest first
  const hover = (row: PastRow) => ({ onPointerMove: (e: React.PointerEvent) => tip.show(e, <RowPop row={row} r={r} />), onPointerLeave: () => tip.hide() });
  return (
    <div className="tm-chart tm-past" data-chart="tm-past">
      <ul className="tm-ptot">{OUTCOMES.map((k) => <li key={k}><i className={`tm-sw o-${k}`} aria-hidden="true" />{pastLine(r, k)}</li>)}</ul>
      {phone
        ? <ul className="tm-cards" aria-label="Every past session">{rows.map((row) => (
          <li key={row.date} className="tm-card" {...hover(row)}>
            <div className="tm-card-h"><b>{day(row.date)}</b><span className={`tm-tag o-${row.outcome}`}>{OUTCOME_SHORT[row.outcome]}</span></div>
            <p className="muted">{row.touchAt ? `at ${row.touchAt} · ` : ""}open {px(row.start)} · at {r.plan.flatBy} <b className={row.changePct > 0 ? "gain" : row.changePct < 0 ? "loss" : ""}>{pc(row.changePct)}</b></p>
          </li>))}</ul>
        : <table className="tm-table">
          <thead><tr><th scope="col">Session</th><th scope="col">Open at {r.plan.start}</th><th scope="col">Lower</th><th scope="col">Upper</th><th scope="col">First reached</th><th scope="col">At</th><th scope="col">Change at {r.plan.flatBy}</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.date} {...hover(row)}>
              <th scope="row">{day(row.date)}</th><td>{px(row.start)}</td><td>{px(row.lower)}</td><td>{px(row.upper)}</td>
              <td><span className={`tm-tag o-${row.outcome}`}>{OUTCOME_SHORT[row.outcome]}</span></td><td>{row.touchAt ?? "—"}</td>
              <td className={row.changePct > 0 ? "gain" : row.changePct < 0 ? "loss" : ""}>{pc(row.changePct)}</td>
            </tr>))}</tbody>
        </table>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ the tab

function Result({ r, phone }: { r: TmResult; phone: boolean }) {
  return (
    <div className="tm-result" aria-labelledby="tm-res-h">
      <h3 id="tm-res-h" className="tm-h3">{r.plan.symbol}{r.name && r.name !== r.plan.symbol ? ` · ${r.name}` : ""}: {day(r.plan.date)}, {r.plan.start} to {r.plan.flatBy}</h3>
      <p className="muted tm-sample" role="status">{sampleLine(r)}{r.cached ? " · the same answer as an earlier run of this plan" : ""}</p>
      <p className="muted tm-plan">Start {px(r.plan.price)} · lower {px(r.plan.lower)} ({pc(r.plan.lowerPct)}) · upper {px(r.plan.upper)} ({pc(r.plan.upperPct)})</p>
      <OutcomeBar r={r} />
      <div className="tm-block"><div className="tm-block-h"><h3 className="tm-h3">Replays bar by bar</h3><p className="muted">The price after each 5-minute bar, across {n0(r.sample.replays)} replays.</p></div>
        <ChartZoom label="Time Machine replays"><Fan r={r} /></ChartZoom></div>
      <div className="tm-block"><div className="tm-block-h"><h3 className="tm-h3">Price at {r.plan.flatBy}</h3><p className="muted">How many replays ended in each price range.</p></div>
        <ChartZoom label="Time Machine price at the flat-by time"><Histogram r={r} /></ChartZoom></div>
      <div className="tm-block"><div className="tm-block-h"><h3 className="tm-h3">Every past session</h3><p className="muted">The same rule on each of the {r.past.totals.sessions} sessions, from that session's open at {r.plan.start}, with the levels at the same % gaps.</p></div>
        <ChartZoom label="Time Machine past sessions" kind="table"><Past r={r} phone={phone} /></ChartZoom></div>
    </div>
  );
}

export function TimeMachine() {
  const phone = usePhone();
  const m = useMutation({ mutationFn: (f: PlanForm) => runPlan(toBody(f)) });
  const fail = m.error ? failure(m.error) : null;
  const d = m.data;
  return (
    <section className="card oflow-board tm" aria-labelledby="tm-h">
      <div className="oflow-hero-h"><div><h2 id="tm-h">Time Machine</h2>
        <p className="muted oflow-sub">Type a plan for one F&O stock and see how it would have gone: 10,000 replays of the rest of the session from the stock's own past 5-minute bars, and the same rule on every past session. {NOTE}</p></div></div>
      <PlanFormView onRun={(f) => m.mutate(f)} busy={m.isPending} serverField={fail?.field} serverText={fail?.text} />
      {fail && !FIELDS.some((x) => x.k === fail.field) && <div className="formerr" role="alert">{fail.text}</div>}
      {m.isPending && <div className="skeleton" style={{ height: 320 }} aria-label="Working out the replays" />}
      {d?.status === "no_history" && <div className="oflow-wait tm-wait" role="status"><h3 className="tm-h3">Not enough past sessions yet</h3><p className="muted">{d.detail}</p></div>}
      {d?.status === "ok" && !m.isPending && <Result r={d} phone={phone} />}
      <details className="oflow-how"><summary>How it is worked out</summary>
        <p className="muted oflow-method">{d?.status === "ok" ? d.text.method : "Each replay walks the 5-minute bars from the start time to the flat-by time in blocks of 30 minutes, each block copied from one past session picked at random at the same time of day; the past sessions are the latest 60 before the chosen date with at least 70 of their 75 bars."} {NOTE}</p></details>
    </section>
  );
}
