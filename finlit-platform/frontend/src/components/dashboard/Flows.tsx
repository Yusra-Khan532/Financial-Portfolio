// Block 5, FII / DII flows, as the final pages pack draws it (04): the two latest-session tiles, one chart of the last 30 sessions with an FII bar (blue) and a DII
// bar (gold) for each day (buying above the line, selling below), the 30-session totals and a card on what the flows have been doing; the long charts live on the full page.
import { Link } from "react-router";
import { dateIN } from "../../lib/format";
import { useFlows, type FlowDay, type Streak } from "../../lib/flows";
import { ageLabel, diiState, inr } from "../../lib/flowsMath";
import { Card, Rows } from "./parts";
import { flowsCard } from "../../lib/dashPack";
import { Cards, Tip } from "../sectors/pack/Common";

const cls = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");
const arrow = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "▲ " : "▼ ");
const streak = (s: Streak | null) => (!s || s.side === "flat" || !s.days ? "No streak" : `${s.days} day${s.days === 1 ? "" : "s"} of ${s.side === "buying" ? "buying" : "selling"}`);

const day = (iso: string) => dateIN(iso, { day: "numeric", month: "short" });
const crore = (v: number | null | undefined) => (v == null ? "no figure" : inr(v));

/** The pack's chart: per session an FII bar and a DII bar side by side, above the line for buying and below for selling. */
export function PairBars({ days, n = 30 }: { days: FlowDay[]; n?: number }) {
  const last = days.slice(-n);
  if (!last.length) return null;
  const max = Math.max(1, ...last.flatMap((d) => [Math.abs(d.fii?.net ?? 0), Math.abs(d.dii?.net ?? 0)]));
  const W = 600, H = 150, mid = H / 2, step = W / last.length, bw = Math.max(2, step * 0.36), y = (v: number) => (Math.abs(v) / max) * (mid - 6);
  const sum = (k: "fii" | "dii") => last.reduce((a, d) => a + ((k === "fii" ? d.fii?.net : d.dii?.net) ?? 0), 0);
  return (
    <div className="dsh-pbars">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`FII and DII net flows, last ${last.length} sessions from ${day(last[0].d)} to ${day(last[last.length - 1].d)}: FII ${inr(sum("fii"))}, DII ${inr(sum("dii"))} in all.`}>
        <line x1={0} x2={W} y1={mid} y2={mid} className="z" />
        {last.map((d, i) => { const x = i * step + step / 2, f = d.fii?.net, g = d.dii?.net; return (
          <g key={d.d}><title>{`${day(d.d)}: FII ${crore(f)}, DII ${crore(g)}`}</title>
            {typeof f === "number" && <rect x={x - bw - 0.5} y={f >= 0 ? mid - y(f) : mid} width={bw} height={Math.max(1, y(f))} className="fii" />}
            {typeof g === "number" && <rect x={x + 0.5} y={g >= 0 ? mid - y(g) : mid} width={bw} height={Math.max(1, y(g))} className="dii" />}</g>); })}
      </svg>
      <div className="dsh-fbars-x" aria-hidden="true"><span>{day(last[0].d)}</span><span>{day(last[last.length - 1].d)}</span></div>
      <p className="dsh-plg"><span><i className="fii" />FII</span><span><i className="dii" />DII</span></p>
    </div>
  );
}

export function Flows() {
  const q = useFlows(), f = q.data;
  const l = f?.latest;
  return (
    <Card id="flows" title={<>FII / DII flows<Tip text="FII and DII. Foreign institutional investors (FII) and domestic institutions such as mutual funds and insurers (DII). Net means buying minus selling." label="About “FII / DII flows”" /></>}
      sub={l && f ? `${dateIN(l.d)} · ${ageLabel(l.d, f.today)} · net buying (+) or selling (−), ₹ crore` : undefined}>
      {q.isLoading ? <Rows n={2} h={78} /> : q.isError || !f || !l ? <p className="dsh-note">FII / DII figures are not available right now. They load after each trading day.</p> : <>
        <div className="dsh-tiles2">
          <div className="dsh-big"><span>FII / FPI net</span><b className={cls(l.fii.net)}>{arrow(l.fii.net)}{inr(l.fii.net)}</b><small>{streak(f.streaks.fii)}</small></div>
          <div className="dsh-big"><span>DII net</span>{l.dii?.net != null ? <><b className={cls(l.dii.net)}>{arrow(l.dii.net)}{inr(l.dii.net)}</b><small>{streak(f.streaks.dii)}</small></> : <><b>—</b><small>{diiState(f) === "none" ? "Not published by a permitted source" : "Not published for this day"}</small></>}</div>
        </div>
        <PairBars days={f.days} />
        <p className="dsh-line">Last {f.last30.days} sessions: FII <b className={cls(f.last30.fii)}>{inr(f.last30.fii)}</b>{f.last30.dii != null && <> · DII <b className={cls(f.last30.dii)}>{inr(f.last30.dii)}</b></>}</p>
        {(() => { const c = flowsCard(f); return c ? <div className="sp dsh-cards dsh-cards-after"><Cards items={[c]} /></div> : null; })()}
        <Link className="dsh-link foot" to="/fii-dii">Full FII/DII data, charts and history →</Link>
      </>}
    </Card>
  );
}
