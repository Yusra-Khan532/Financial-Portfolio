// Trading Lab > Order Flow > Global cues (docs/GLOBAL-MARKETS.md, step 1): what moved outside India that Indian markets react to. The international
// ETFs on NSE and India VIX (live), US yields and the Fed funds rate, the dollar index and currencies, crude oil, the rupee, from
// /api/lab/global (backend finlit/lab/global_cues.py). A hover card on every tile and every point of its line. Facts only, never a call.
import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../lib/api";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";

export type Cue = {
  key: string; label: string; unit: string; group: string; what: string; source: string; sourceUrl: string; value: number; prev: number | null;
  change: number | null; changePct: number | null; date?: string; prevDate?: string | null; asOf?: string | null; live?: boolean; symbol?: string;
  yearLow?: number; yearHigh?: number; dayLow?: number | null; dayHigh?: number | null; spark?: [string, number][];
};
export type GlobalCuesAnswer = { groups: { key: string; name: string; items: Cue[] }[]; asOf: string; notes: string[] };

const getCues = () => apiGet<GlobalCuesAnswer>("/api/lab/global");
const isRate = (c: Cue) => c.unit === "%" || c.unit === "% points";
const nf = (v: number, d: number) => v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const digits = (c: Cue) => (isRate(c) ? 2 : c.value >= 1000 ? 0 : c.value >= 100 ? 1 : c.value >= 10 ? 2 : 3);
export const valueText = (c: Cue, v = c.value) => (c.unit === "₹" ? `₹${nf(v, 2)}` : c.unit.startsWith("US$") ? "$" + nf(v, 2) : isRate(c) ? `${nf(v, 2)}%` : nf(v, digits(c)));
/** "+0.08 pts" for a rate, "+1.25%" for a price; "—" when the change is not known. */
export function changeText(c: Cue): string {
  if (c.change == null) return "—";
  const s = c.change > 0 ? "+" : c.change < 0 ? "−" : "";
  return isRate(c) ? `${s}${nf(Math.abs(c.change), 2)} pts` : c.changePct != null ? `${s}${nf(Math.abs(c.changePct), 2)}%` : `${s}${nf(Math.abs(c.change), digits(c))}`;
}
const tone = (c: Cue) => (c.change == null || c.change === 0 ? "" : c.change > 0 ? "gain" : "loss");
const day = (iso?: string | null) => (iso ? new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** The day in one sentence: the moves that matter most to India, as facts. */
export function cuesLine(a: GlobalCuesAnswer): string {
  const all = Object.fromEntries(a.groups.flatMap((g) => g.items).map((c) => [c.key, c]));
  const part = (k: string, name: string) => (all[k] ? `${name} ${valueText(all[k])} (${changeText(all[k])})` : null);
  return [part("us10y", "US 10-year"), part("dxy", "dollar index"), part("brent", "Brent"), part("mon100", "Nasdaq 100 ETF"), part("indiavix", "India VIX")]
    .filter(Boolean).join(" · ");
}

function CuePop({ c }: { c: Cue }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{c.label}</b><small>{c.live ? `Live · ${c.asOf ? c.asOf.slice(11, 16) + " IST" : "today"}` : `${day(c.date)} close`}</small></div>
        <div className="r"><small>{c.unit === "₹" || isRate(c) ? "" : c.unit}</small><b className={tone(c)}>{valueText(c)}</b></div></header>
      <dl className="oflow-pop-t">
        <div><dt>Change</dt><dd className={tone(c)}>{changeText(c)}</dd></div>
        <div><dt>{c.live ? "Previous close" : day(c.prevDate) || "Previous"}</dt><dd>{c.prev == null ? "—" : valueText(c, c.prev)}</dd></div>
        {c.yearLow != null && <div><dt>1-year low</dt><dd>{valueText(c, c.yearLow)}</dd></div>}
        {c.yearHigh != null && <div><dt>1-year high</dt><dd>{valueText(c, c.yearHigh)}</dd></div>}
        {c.dayLow != null && <div><dt>Day low</dt><dd>{valueText(c, c.dayLow)}</dd></div>}
        {c.dayHigh != null && <div><dt>Day high</dt><dd>{valueText(c, c.dayHigh)}</dd></div>}
      </dl>
      <p className="muted gcue-pop-note">{c.what} Source: {c.source}.</p>
    </>
  );
}

/** A small line of the last months with a dot you can point at. */
export function Spark({ c }: { c: Cue }) {
  const tip = useTip();
  const [hot, setHot] = useState<number | null>(null);
  const s = c.spark ?? [];
  if (s.length < 2) return null;
  const W = 240, H = 56, P = 3;
  const vs = s.map((p) => p[1]), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const x = (i: number) => P + (i / (s.length - 1)) * (W - 2 * P), y = (v: number) => P + ((hi - v) / sp) * (H - 2 * P);
  const d = s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const up = vs[vs.length - 1] >= vs[0];
  return (
    <svg className={`gcue-spark ${up ? "up" : "down"}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${c.label} from ${day(s[0][0])} to ${day(s[s.length - 1][0])}: ${valueText(c, vs[0])} to ${valueText(c, vs[vs.length - 1])}`}
      onPointerMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const i = Math.max(0, Math.min(s.length - 1, Math.round(((e.clientX - r.left) / (r.width || 1)) * (s.length - 1))));
        setHot(i);
        tip.show(e, <header className="oflow-pop-h"><div><b>{c.label}</b><small>{day(s[i][0])}</small></div><div className="r"><b>{valueText(c, s[i][1])}</b></div></header>);
      }}
      onPointerLeave={() => { setHot(null); tip.hide(); }}>
      <path className="a" d={`${d}L${x(s.length - 1).toFixed(1)},${H}L${x(0).toFixed(1)},${H}Z`} /><path className="l" d={d} />
      {hot != null && <circle cx={x(hot)} cy={y(s[hot][1])} r={3.5} />}
    </svg>
  );
}

function Tile({ c }: { c: Cue }) {
  const tip = useTip();
  const lo = c.live ? c.dayLow : c.yearLow, hi = c.live ? c.dayHigh : c.yearHigh;
  const at = lo != null && hi != null && hi > lo ? Math.max(0, Math.min(1, (c.value - lo) / (hi - lo))) : null;
  return (
    <article className={`gcue ${tone(c)}`} onPointerMove={(e) => { if (!(e.target as Element).closest?.(".gcue-spark")) tip.show(e, <CuePop c={c} />); }}
      onPointerLeave={() => tip.hide()} aria-label={`${c.label}: ${valueText(c)}, ${changeText(c)}`}>
      <header><b>{c.label}</b>{c.live && <span className="gcue-live"><i aria-hidden="true" />live</span>}</header>
      <div className="gcue-v"><span>{valueText(c)}</span><small className={tone(c)}>{changeText(c)}</small></div>
      {c.spark && c.spark.length > 1 ? <Spark c={c} /> : null}
      {at != null && <div className="gcue-range" title={c.live ? "Today's range" : "1-year range"}><i style={{ left: `${at * 100}%` }} />
        <small>{valueText(c, lo as number)}</small><small>{c.live ? "today" : "1 year"}</small><small>{valueText(c, hi as number)}</small></div>}
      <footer className="muted">{c.live ? (c.symbol ? `${c.symbol} · NSE` : "NSE") : `${day(c.date)} · ${c.source}`}</footer>
    </article>
  );
}

export function GlobalCues() {
  const q = useQuery({ queryKey: ["lab-global"], queryFn: getCues, retry: false, refetchInterval: 60_000 });
  const a = q.data;
  return (
    <section className="card oflow-board gcues" aria-labelledby="gcues-h">
      <div className="oflow-hero-h"><div><h2 id="gcues-h">Global cues</h2>{a && <p className="oflow-money-line">{cuesLine(a)}</p>}</div></div>
      {q.isPending && <div className="skeleton" style={{ height: 420 }} aria-label="Loading global cues" />}
      {q.isError && <div className="formerr" role="alert">{q.error instanceof ApiError && q.error.body.detail ? q.error.body.detail : "Global cues could not be read right now. Try again in a minute."}</div>}
      {a && a.groups.map((g) => (
        <section key={g.key} className="gcue-group" aria-label={g.name}>
          <h3>{g.name}</h3>
          <ChartZoom label={g.name}><div className="gcue-grid">{g.items.map((c) => <Tile key={c.key} c={c} />)}</div></ChartZoom>
        </section>
      ))}
      {a && a.notes.map((n) => <p key={n} className="muted oflow-note">{n}</p>)}
      <p className="muted gcue-more">Index levels (S&P 500, Nasdaq, Nikkei and others) are on <Link to="/markets">Markets today</Link>.</p>
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">The international ETFs are funds listed on NSE that hold foreign shares; their prices are in rupees, live in Indian market hours, so they move with their markets and with the rupee and can trade above or below the value of what they hold. US yields and the Fed funds rate (Federal Reserve H.15), the dollar index and the euro, yen and yuan (Federal Reserve H.10), and WTI and Brent crude (U.S. EIA) are daily values from FRED; the latest is usually the last US business day. A rate's change is in percentage points. USD/INR is the FBIL reference rate. These describe what moved; they are not a forecast.</p></details>
    </section>
  );
}
