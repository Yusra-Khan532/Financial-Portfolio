// Block 5, FII / DII flows: the two latest-session tiles (value 24px), 30 sessions of small net bars (buying above the line, selling below) and the
// 30-session totals; the long charts live on the full page.
import { Link } from "react-router";
import { dateIN } from "../../lib/format";
import { useFlows, type FlowDay, type Streak } from "../../lib/flows";
import { ageLabel, diiState, inr } from "../../lib/flowsMath";
import { Card, Rows } from "./parts";

const cls = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");
const arrow = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "▲ " : "▼ ");
const streak = (s: Streak | null) => (!s || s.side === "flat" || !s.days ? "No streak" : `${s.days} day${s.days === 1 ? "" : "s"} of ${s.side === "buying" ? "buying" : "selling"}`);

const day = (iso: string) => dateIN(iso, { day: "numeric", month: "short" });
const crore = (v: number | null | undefined) => (v == null ? "no figure" : inr(v));

/** One row of bars (FII or DII): one bar per session, its height the net flow against the largest of the period. */
function BarRow({ label, days, pick, max }: { label: string; days: FlowDay[]; pick: (d: FlowDay) => number | null | undefined; max: number }) {
  const vals = days.map((d) => ({ d: d.d, v: pick(d) }));
  const nums = vals.filter((x): x is { d: string; v: number } => typeof x.v === "number");
  if (!nums.length) return null;
  const lo = nums.reduce((a, b) => (b.v < a.v ? b : a)), hi = nums.reduce((a, b) => (b.v > a.v ? b : a));
  return (
    <div className="dsh-fbars-row">
      <span className="lab">{label}</span>
      <div className="bars" role="img" aria-label={`${label} net, last ${days.length} sessions: lowest ${inr(lo.v)} on ${day(lo.d)}, highest ${inr(hi.v)} on ${day(hi.d)}.`}>
        {vals.map((x) => {
          const h = typeof x.v === "number" ? Math.max(1, Math.round((Math.abs(x.v) / max) * 100)) : 0;
          return <span className="b" key={x.d} title={`${day(x.d)}: ${crore(x.v)}`}><span className="top">{x.v != null && x.v > 0 && <i style={{ height: `${h}%` }} />}</span><span className="bot">{x.v != null && x.v < 0 && <i style={{ height: `${h}%` }} />}</span></span>;
        })}
      </div>
    </div>
  );
}

export function FlowsBars({ days, n = 30 }: { days: FlowDay[]; n?: number }) {
  const last = days.slice(-n);
  if (!last.length) return null;
  const max = Math.max(1, ...last.flatMap((d) => [Math.abs(d.fii?.net ?? 0), Math.abs(d.dii?.net ?? 0)]));
  return (
    <div className="dsh-fbars">
      <p className="dsh-lh first">Last {last.length} sessions, net a day</p>
      <BarRow label="FII" days={last} pick={(d) => d.fii?.net} max={max} />
      <BarRow label="DII" days={last} pick={(d) => d.dii?.net} max={max} />
      <div className="dsh-fbars-x" aria-hidden="true"><span /><span>{day(last[0].d)}</span><span>{day(last[last.length - 1].d)}</span></div>
    </div>
  );
}

export function Flows() {
  const q = useFlows(), f = q.data;
  const l = f?.latest;
  return (
    <Card id="flows" title="FII / DII flows" sub={l && f ? `${dateIN(l.d)} · ${ageLabel(l.d, f.today)}` : undefined}>
      {q.isLoading ? <Rows n={2} h={78} /> : q.isError || !f || !l ? <p className="dsh-note">FII / DII figures are not available right now. They load after each trading day.</p> : <>
        <div className="dsh-tiles2">
          <div className="dsh-big"><span>FII / FPI net</span><b className={cls(l.fii.net)}>{arrow(l.fii.net)}{inr(l.fii.net)}</b><small>{streak(f.streaks.fii)}</small></div>
          <div className="dsh-big"><span>DII net</span>{l.dii?.net != null ? <><b className={cls(l.dii.net)}>{arrow(l.dii.net)}{inr(l.dii.net)}</b><small>{streak(f.streaks.dii)}</small></> : <><b>—</b><small>{diiState(f) === "none" ? "Not published by a permitted source" : "Not published for this day"}</small></>}</div>
        </div>
        <FlowsBars days={f.days} />
        <p className="dsh-line">Last {f.last30.days} sessions: FII <b className={cls(f.last30.fii)}>{inr(f.last30.fii)}</b>{f.last30.dii != null && <> · DII <b className={cls(f.last30.dii)}>{inr(f.last30.dii)}</b></>}</p>
        <Link className="dsh-link foot" to="/fii-dii">Full FII/DII data, charts and history →</Link>
      </>}
    </Card>
  );
}
