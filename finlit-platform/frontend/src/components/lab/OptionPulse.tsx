// Trading Lab > Order Flow > Option Pulse (founder, 26 Nov 2026, from the second reference video): put and call open interest strike by strike
// for an index or an F&O stock, today's change in it, where the largest put and call OI sit, PCR and max pain. Read from the site's own option
// chain (backend finlit/options.py, /api/options/lab/*: same chain, cache and Dhan pacing as the Gold option chain, behind Lab access).
// Facts only: "most call OI at 750", never "750 will cap the price".
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { BUILDUP, around, compact, matchUnderlyings, price, signedNum, strikeText, type Chain, type Expiries, type Row, type Side, type Underlyings } from "../../lib/options";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";

const getUnderlyings = () => apiGet<Underlyings>("/api/options/lab/underlyings");
const getExpiries = (u: string) => apiGet<Expiries>(`/api/options/lab/expiries?u=${encodeURIComponent(u)}`);
const getChain = (u: string, e: string) => apiGet<Chain>(`/api/options/lab/chain?u=${encodeURIComponent(u)}&expiry=${encodeURIComponent(e)}`);

const QUICK = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];
const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** The strike with the largest OI on one side (null when no strike has OI on that side). */
export function largest(rows: Row[], side: "ce" | "pe"): Row | null {
  let best: Row | null = null;
  for (const r of rows) { const v = r[side]?.oi; if (v != null && v > 0 && (best == null || v > (best[side]?.oi ?? 0))) best = r; }
  return best;
}

/** The day in one plain sentence (describe, never advise). */
export function pulseLine(c: Chain): string {
  const put = largest(c.rows, "pe"), call = largest(c.rows, "ce");
  const parts = [
    c.spot != null ? `${c.underlying.key} at ${price(c.spot)}` : c.underlying.key,
    put ? `most put OI at ${strikeText(put.strike)}` : null,
    call ? `most call OI at ${strikeText(call.strike)}` : null,
    c.summary.pcrOi != null ? `PCR ${c.summary.pcrOi.toFixed(2)}` : null,
    c.summary.maxPain ? `max pain ${strikeText(c.summary.maxPain.strike)}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function SideFacts({ s, name }: { s: Side | null; name: string }) {
  if (!s) return <div><b>{name}</b><p className="muted">Not listed at this strike.</p></div>;
  const b = s.buildup ? BUILDUP[s.buildup] : null;
  return (
    <div>
      <b>{name}</b>
      <dl className="oflow-pop-t one">
        <div><dt>OI</dt><dd>{compact(s.oi)}</dd></div>
        <div><dt>OI change</dt><dd className={s.oiChange == null ? "" : s.oiChange >= 0 ? "gain" : "loss"}>{s.oiChange == null ? "—" : `${s.oiChange > 0 ? "+" : ""}${compact(s.oiChange)}`}{s.oiChangePct != null ? ` (${signedNum(s.oiChangePct, 1)}%)` : ""}</dd></div>
        <div><dt>Price</dt><dd>{price(s.ltp)} <span className={s.changePct == null ? "" : s.changePct >= 0 ? "gain" : "loss"}>{s.changePct == null ? "" : `${signedNum(s.changePct, 1)}%`}</span></dd></div>
        <div><dt>IV</dt><dd>{s.iv == null ? "—" : `${s.iv.toFixed(1)}%`}</dd></div>
        <div><dt>Volume</dt><dd>{compact(s.volume)}</dd></div>
        <div><dt>Build-up</dt><dd>{b ? b.label : "—"}</dd></div>
      </dl>
    </div>
  );
}

function StrikePop({ r, c }: { r: Row; c: Chain }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{c.underlying.key} {strikeText(r.strike)}</b><small>{r.atm ? "At the money · " : ""}expiry {day(c.expiry)}</small></div>
        <div className="r"><small>spot</small><b>{price(c.spot)}</b></div></header>
      <div className="opul-pop2"><SideFacts s={r.pe} name="Put" /><SideFacts s={r.ce} name="Call" /></div>
    </>
  );
}

/** Puts to the left and calls to the right of each strike: the bar is today's OI, the bright part the OI added today (outlined: OI that left). */
function Ladder({ c, rows }: { c: Chain; rows: Row[] }) {
  const tip = useTip();
  const [hot, setHot] = useState<number | null>(null);
  const max = Math.max(1, ...rows.flatMap((r) => [r.ce?.oi ?? 0, r.pe?.oi ?? 0, (r.ce?.prevOi ?? 0), (r.pe?.prevOi ?? 0)]));
  const put = largest(rows, "pe"), call = largest(rows, "ce"), mp = c.summary.maxPain?.strike ?? null;
  const RH = 24, W = 1000, MID = 500, LBL = 46, H = rows.length * RH + 30, half = MID - LBL - 70;
  const y = (i: number) => 20 + i * RH;
  // the spot between the two strikes around it
  let spotY: number | null = null;
  if (c.spot != null && rows.length > 1) {
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i].strike, b = rows[i + 1].strike;
      if (c.spot >= a && c.spot <= b) { spotY = y(i) + RH / 2 + ((c.spot - a) / (b - a || 1)) * RH; break; }
    }
  }
  const bar = (s: Side | null, left: boolean, i: number) => {
    if (!s || s.oi == null) return null;
    const w = (s.oi / max) * half, prev = s.prevOi != null ? (s.prevOi / max) * half : null;
    const x0 = left ? MID - LBL - w : MID + LBL, cls = left ? "pe" : "ce";
    const added = s.oiChange != null && s.oiChange > 0 && prev != null ? w - prev : 0;
    const gone = s.oiChange != null && s.oiChange < 0 && prev != null ? prev - w : 0;
    return (
      <g className={`opul-bar ${cls}`}>
        <rect x={x0} y={y(i) + 4} width={Math.max(1, w)} height={RH - 8} rx="3" className="base" />
        {added > 0.5 && <rect x={left ? x0 : x0 + w - added} y={y(i) + 4} width={added} height={RH - 8} rx="3" className="add" />}
        {gone > 0.5 && <rect x={left ? x0 - gone : x0 + w} y={y(i) + 4} width={gone} height={RH - 8} rx="3" className="gone" />}
        <text x={left ? x0 - (gone || 0) - 6 : x0 + w + (gone || 0) + 6} y={y(i) + RH / 2 + 4} textAnchor={left ? "end" : "start"} className="opul-v">{compact(s.oi)}</text>
      </g>
    );
  };
  return (
    <svg className="opul-ladder" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Open interest by strike for ${c.underlying.key}, expiry ${day(c.expiry)}: puts on the left, calls on the right${put ? `; most put OI at ${strikeText(put.strike)}` : ""}${call ? `; most call OI at ${strikeText(call.strike)}` : ""}.`}>
      <text x={MID - LBL - 8} y={12} textAnchor="end" className="opul-head pe">PUT OI</text>
      <text x={MID + LBL + 8} y={12} className="opul-head ce">CALL OI</text>
      {rows.map((r, i) => (
        <g key={r.strike} className={`opul-row${r.atm ? " atm" : ""}${hot != null && hot !== r.strike ? " dim" : ""}`}
          onPointerMove={(e) => { setHot(r.strike); tip.show(e, <StrikePop r={r} c={c} />); }} onPointerLeave={() => { setHot(null); tip.hide(); }}>
          <rect x="0" y={y(i)} width={W} height={RH} className="hit" />
          {bar(r.pe, true, i)}{bar(r.ce, false, i)}
          <rect x={MID - LBL + 2} y={y(i) + 3} width={(LBL - 2) * 2} height={RH - 6} rx="5" className="opul-k" />
          <text x={MID} y={y(i) + RH / 2 + 4} textAnchor="middle" className="opul-kt">{strikeText(r.strike)}</text>
          {put?.strike === r.strike && <rect x={MID - LBL - ((r.pe?.oi ?? 0) / max) * half - 3} y={y(i) + 2} width={((r.pe?.oi ?? 0) / max) * half + 3} height={RH - 4} rx="4" className="opul-max pe"><title>Most put OI</title></rect>}
          {call?.strike === r.strike && <rect x={MID + LBL} y={y(i) + 2} width={((r.ce?.oi ?? 0) / max) * half + 3} height={RH - 4} rx="4" className="opul-max ce"><title>Most call OI</title></rect>}
          {mp === r.strike && <circle cx={MID + LBL - 6} cy={y(i) + RH / 2} r="4" className="opul-mpdot"><title>Max pain</title></circle>}
        </g>))}
      {spotY != null && <g className="opul-spot"><line x1="0" x2={W} y1={spotY} y2={spotY} /><text x={W - 4} y={spotY - 4} textAnchor="end">spot {price(c.spot)}</text></g>}
    </svg>
  );
}

function MaxPainCurve({ c }: { c: Chain }) {
  const pts = c.maxPainCurve;
  if (pts.length < 3) return null;
  const W = 300, H = 90, lo = Math.min(...pts.map((p) => p.payout)), hi = Math.max(...pts.map((p) => p.payout)), sp = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W, y = (v: number) => 6 + ((hi - v) / sp) * (H - 20);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.payout).toFixed(1)}`).join("");
  const k = pts.findIndex((p) => p.strike === c.summary.maxPain?.strike);
  return (
    <svg className="opul-mpc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Max pain curve: lowest at ${c.summary.maxPain ? strikeText(c.summary.maxPain.strike) : "—"}`}>
      <path d={d} className="l" />
      {k >= 0 && <circle cx={x(k)} cy={y(pts[k].payout)} r="4" className="dot" />}
      <text x="0" y={H - 2} className="t">{strikeText(pts[0].strike)}</text><text x={W} y={H - 2} textAnchor="end" className="t">{strikeText(pts[pts.length - 1].strike)}</text>
    </svg>
  );
}

export function OptionPulse() {
  const [u, setU] = useState("NIFTY");
  const [find, setFind] = useState("");
  const [exp, setExp] = useState<string | null>(null);
  const [span, setSpan] = useState(12);
  const und = useQuery({ queryKey: ["opul-und"], queryFn: getUnderlyings, retry: false, staleTime: 3600_000 });
  const ex = useQuery({ queryKey: ["opul-exp", u], queryFn: () => getExpiries(u), retry: false });
  const expiry = exp && ex.data?.expiries.includes(exp) ? exp : ex.data?.expiries[0] ?? null;
  const ch = useQuery({ queryKey: ["opul-chain", u, expiry], queryFn: () => getChain(u, expiry as string), enabled: !!expiry, retry: false,
    refetchInterval: (q) => (q.state.data?.marketOpen ? Math.max(30, q.state.data.refreshSeconds) * 1000 : false) });
  const matches = useMemo(() => (find.trim() && und.data ? matchUnderlyings(und.data.stocks, find, 8) : []), [find, und.data]);
  const c = ch.data;
  const rows = c ? around(c.rows, c.atm, span) : [];
  const t = c?.summary.totals;
  const movers = (side: "ce" | "pe") => (c ? [...c.rows].filter((r) => r[side]?.oiChange).sort((a, b) => Math.abs(b[side]!.oiChange!) - Math.abs(a[side]!.oiChange!)).slice(0, 5) : []);
  return (
    <section className="card oflow-board opul" aria-labelledby="opul-h">
      <div className="oflow-hero-h"><div><h2 id="opul-h">Option Pulse</h2>{c && <p className="oflow-money-line">{pulseLine(c)}</p>}</div></div>
      <div className="opul-pick">
        <div className="oflow-bchips" role="group" aria-label="Indices">{QUICK.map((k) => (
          <button key={k} type="button" className="oflow-bchip" aria-pressed={u === k} onClick={() => { setU(k); setExp(null); setFind(""); }}>{k}</button>))}</div>
        <div className="opul-find">
          <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Any F&O stock" aria-label="Find an F&O stock" />
          {matches.length > 0 && <ul className="opul-found" aria-label="Matching stocks">{matches.map((m) => (
            <li key={m.key}><button type="button" onClick={() => { setU(m.key); setExp(null); setFind(""); }}><b>{m.key}</b> <span className="muted">{m.name}</span></button></li>))}</ul>}
        </div>
        {ex.data && <label className="opul-exp">Expiry <select value={expiry ?? ""} onChange={(e) => setExp(e.target.value)}>{ex.data.expiries.map((e) => <option key={e} value={e}>{day(e)}</option>)}</select></label>}
        <label className="opul-exp">Strikes <select value={span} onChange={(e) => setSpan(Number(e.target.value))}>{[8, 12, 20, 0].map((n) => <option key={n} value={n}>{n ? `${n} each side` : "all"}</option>)}</select></label>
      </div>
      {(ex.isError || ch.isError) && <div className="formerr" role="alert">The option chain could not be read right now. It refreshes by itself; try again in a minute.</div>}
      {(ex.isPending || (ch.isPending && !!expiry)) && <div className="skeleton" style={{ height: 420 }} aria-label="Loading the option chain" />}
      {c && <div className="opul-grid">
        <div className="opul-main"><ChartZoom label="Option Pulse ladder"><Ladder c={c} rows={rows} /></ChartZoom>
          <p className="muted opul-legend"><i className="sw pe" /> put OI · <i className="sw ce" /> call OI · bright: added today · dashed: left today · gold outline: the most OI on each side · <i className="sw mp" /> max pain</p></div>
        <aside className="opul-side">
          <dl className="opul-stats">
            <div><dt>PCR (OI)</dt><dd>{c.summary.pcrOi?.toFixed(2) ?? "—"}</dd></div>
            <div><dt>PCR (volume)</dt><dd>{c.summary.pcrVolume?.toFixed(2) ?? "—"}</dd></div>
            <div><dt>Max pain</dt><dd>{c.summary.maxPain ? strikeText(c.summary.maxPain.strike) : "—"}</dd></div>
            <div><dt>Days to expiry</dt><dd>{c.daysToExpiry}</dd></div>
            <div><dt>Put OI</dt><dd className="pe">{compact(t?.pe.oi)} <small>{t?.pe.oiChange != null ? `${t.pe.oiChange >= 0 ? "+" : ""}${compact(t.pe.oiChange)}` : ""}</small></dd></div>
            <div><dt>Call OI</dt><dd className="ce">{compact(t?.ce.oi)} <small>{t?.ce.oiChange != null ? `${t.ce.oiChange >= 0 ? "+" : ""}${compact(t.ce.oiChange)}` : ""}</small></dd></div>
          </dl>
          {(["pe", "ce"] as const).map((sd) => (
            <div key={sd} className="opul-movers"><h3 className={sd}>{sd === "pe" ? "Largest put OI changes" : "Largest call OI changes"}</h3>
              <ol aria-label={sd === "pe" ? "Largest put OI changes" : "Largest call OI changes"}>{movers(sd).map((r) => {
                const s = r[sd]!; const b = s.buildup ? BUILDUP[s.buildup] : null;
                return <li key={r.strike}><b>{strikeText(r.strike)}</b><span className={s.oiChange! >= 0 ? "gain" : "loss"}>{s.oiChange! > 0 ? "+" : ""}{compact(s.oiChange)}</span><small className="muted">{b ? b.label : ""}</small></li>;
              })}</ol></div>))}
          <div className="opul-movers"><h3>Max pain by settlement price</h3><ChartZoom label="Max pain by settlement price"><MaxPainCurve c={c} /></ChartZoom></div>
          <p className="muted opul-asof">{c.marketOpen ? "Live" : "Last session"} · as of {new Date(c.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST{c.lotSize ? ` · lot ${c.lotSize}` : ""}</p>
        </aside>
      </div>}
      {c && c.notes.map((n) => <p key={n} className="muted oflow-note">{n}</p>)}
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">From Dhan's option chain for the chosen expiry. OI change is today's open interest against the previous session's. PCR (OI) is total put OI divided by total call OI. Max pain is the settlement price at which option buyers would receive the least, on today's OI. Build-up per side: price and OI both up is long build-up, price down and OI up short build-up, price up and OI down short covering, both down long unwinding. Where OI is largest describes where open positions are concentrated; it is not a forecast.</p></details>
    </section>
  );
}
