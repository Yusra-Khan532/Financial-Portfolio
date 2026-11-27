// Trading Lab > Order Flow > Setup scanner (docs/TRADING-LAB.md "Setup scanner"): each weekday evening the job lab-scanner checks every NSE
// stock's latest daily bar against the Strategy backtest's 23 fixed rules (market-lab, MIT; finlit/lab/scanner.py). The tab lists, per rule,
// the stocks whose latest bar matches the rule's conditions, with the rule's past results on each stock. Every rule is shown in its own list
// order, rows in rule order then by symbol: nothing is ranked by any result, and nothing here says what to do.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { titleOf } from "../../lib/companyLabel";
import { inr } from "../../lib/flow";
import { rr, tone } from "../../lib/backtest";
import {
  ALL, NOTE, NO_SECTOR, applyFilters, backtestLink, count, dmy, perRule, rowsOf, sectorsOf, since, times,
  type Filters, type Match, type Row, type Scan, type ScanRule,
} from "../../lib/scanner";
import { useTip } from "./FlowTips";
import { usePhone } from "./StrategyBacktest";
import { ChartZoom } from "../ChartZoom";
import "../../styles/backtest.css";
import "../../styles/scanner.css";

const getScan = () => apiGet<Scan>("/api/lab/scanner");
const FIRST = 15;

// ------------------------------------------------------------------------------------------------------------------ small chart
/** The stock's last 40 closes with the rule's lower exit level dashed across (the scale always includes it). */
export function Spark({ m, w = 104, h = 30, big = false }: { m: Match; w?: number; h?: number; big?: boolean }) {
  const pts = m.spark.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <span className="muted lsc-nospark">no chart</span>;
  const vals = pts.map((p) => p[1]).concat(m.lower != null ? [m.lower] : []);
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1, n = m.spark.length - 1 || 1, pad = 3;
  const x = (i: number) => pad + (i / n) * (w - 2 * pad), y = (v: number) => pad + ((hi - v) / sp) * (h - 2 * pad);
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  const up = last[1] >= pts[0][1];
  return (
    <svg className={`lsc-spark${big ? " big" : ""}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" data-chart="lsc-spark"
      aria-label={`${m.symbol}: last ${pts.length} closes, ${inr(pts[0][1])} to ${inr(last[1])}${m.lower != null ? `; lower exit level ${inr(m.lower)}` : ""}`}>
      {m.lower != null && <line className="lsc-lower" x1={pad} x2={w - pad} y1={y(m.lower)} y2={y(m.lower)} />}
      <path className={`lsc-line ${up ? "gain" : "loss"}`} d={d} />
      <circle className="lsc-last" cx={x(last[0])} cy={y(last[1])} r={big ? 3 : 2.2} />
    </svg>
  );
}

// ------------------------------------------------------------------------------------------------------------------ hover cards
function PastText({ m, few }: { m: Match; few: number }) {
  const p = m.past;
  if (!p.trades) return <span className="muted">No closed trades in the backtest{p.running ? " (one still running)" : ""}</span>;
  return <><span className="lsc-pl">{p.trades} trades · {p.winRate == null ? "—" : `${p.winRate.toFixed(1)}%`} win rate</span> <span className="lsc-pl"><span className={tone(p.avgR)}>{rr(p.avgR)}</span> average</span>{p.trades < few ? <small className="bt-few">fewer than {few} trades</small> : null}</>;
}

function MatchPop({ r, s }: { r: Row; s: Scan }) {
  const t = since(r, s.previousDate);
  const few = s.fewTrades ?? 30;
  return (
    <>
      <header className="oflow-pop-h"><div><b>{titleOf(r)}</b><small>{r.name}{r.fno ? " · F&O" : ""}</small></div>
        <div className="r"><small>close {dmy(r.day)}</small><b>{inr(r.close)}</b></div></header>
      <p className="oflow-pop-what"><b>{r.rule.name}</b> (rule {r.order + 1} of 23): {r.rule.trigger}</p>
      <Spark m={r} w={240} h={64} big />
      <dl className="oflow-pop-g">
        <div><dt>Lower exit level</dt><dd>{inr(r.lower)}</dd></div>
        <div><dt>Distance under the close</dt><dd>{r.distPct == null ? "—" : `${r.distPct.toFixed(2)}%`}</dd></div>
        <div><dt>Volume</dt><dd>{count(r.volume)}</dd></div>
        <div><dt>50-session average</dt><dd>{count(r.volAvg)} <small>({times(r.volRatio)})</small></dd></div>
        <div><dt>Sector</dt><dd>{r.sector ?? NO_SECTOR}</dd></div>
        <div><dt>Today</dt><dd>{t.label}</dd></div>
      </dl>
      <p className="oflow-pop-what"><b>This rule's past results on {r.symbol}</b> ({s.exitName ?? "Trailing 3 ATR"} exit, net of costs): <PastText m={r} few={few} /></p>
      <p className="oflow-pop-what muted">{t.title}</p>
      {r.flags.map((f) => <p key={f} className="oflow-pop-what lsc-flag-t">{s.flags[f]}</p>)}
    </>
  );
}

function RulePop({ rule, i, n, fresh, previous }: { rule: ScanRule; i: number; n: number; fresh: number; previous?: string | null }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{rule.name}</b><small>Rule {i + 1} of 23 · {rule.kind}</small></div>
        <div className="r"><small>matches</small><b>{n}</b></div></header>
      <p className="oflow-pop-what"><b>Trigger:</b> {rule.trigger}</p>
      <p className="oflow-pop-what"><b>Lower exit level:</b> {rule.lowerRule}</p>
      {!rule.available ? <p className="oflow-pop-what lsc-flag-t">{rule.note}</p> :
        <p className="oflow-pop-what">{previous ? `${fresh} of ${n} new today (not matching on ${dmy(previous)}).` : "No earlier session is stored to compare with yet."}</p>}
    </>
  );
}

// ------------------------------------------------------------------------------------------------------------------ summary row
function Summary({ s, rows, chosen, choose }: { s: Scan; rows: Row[]; chosen: string; choose: (id: string) => void }) {
  const tip = useTip();
  const per = perRule(s, rows);
  const max = Math.max(1, ...per.map((p) => p.count));
  return (
    <ChartZoom label="Matches per rule">
      <div className="lsc-sum">
        <h3 className="lsc-h3">Matches per rule <small className="muted">all 23 rules, in their list order · {dmy(s.barsDate)} close</small></h3>
        <ol className="lsc-bars" aria-label="Matches per rule" data-chart="lsc-rules">{per.map(({ rule, count: n, fresh }, i) => (
          <li key={rule.id}>
            <button type="button" className="lsc-bar" aria-pressed={chosen === rule.id} aria-label={`${rule.name}: ${n} ${n === 1 ? "stock" : "stocks"}${rule.available ? "" : " (not checked)"}`}
              onClick={() => choose(chosen === rule.id ? "" : rule.id)}
              onPointerMove={(e) => tip.show(e, <RulePop rule={rule} i={i} n={n} fresh={fresh} previous={s.previousDate} />)} onPointerLeave={() => tip.hide()}>
              <span className="lsc-bar-i muted">{i + 1}</span>
              <span className="lsc-bar-n">{rule.name}</span>
              <span className="lsc-bar-t" aria-hidden="true"><i style={{ width: `${(n / max) * 100}%` }} />{fresh > 0 && <i className="new" style={{ width: `${(fresh / max) * 100}%` }} />}</span>
              <b className="lsc-bar-c">{rule.available ? n : "—"}</b>
            </button>
          </li>))}</ol>
        <p className="muted bt-small"><i className="lsc-sw" /> matches · <i className="lsc-sw new" /> of them new today. Choose a rule to list only its stocks; again to show all.</p>
      </div>
    </ChartZoom>
  );
}

// ------------------------------------------------------------------------------------------------------------------ results
function Since({ r, s }: { r: Row; s: Scan }) {
  const t = since(r, s.previousDate);
  return <span className={`lsc-since ${t.tone}`} title={t.title}>{t.label}{t.tone === "also" && (r.streak ?? 0) > 2 ? <small>{r.streak} sessions in a row</small> : null}</span>;
}

function Flags({ r, s }: { r: Row; s: Scan }) {
  return r.flags.length ? <small className="lsc-flag" title={r.flags.map((f) => s.flags[f]).join(" ")}>{r.flags.includes("big_move") ? "big one-day move" : r.flags.includes("wide_risk") ? "lower level over 25% away" : "lower level not usable"}</small> : null;
}

function Table({ rows, s }: { rows: Row[]; s: Scan }) {
  const tip = useTip();
  const few = s.fewTrades ?? 30;
  return (
    <ChartZoom label="Stocks matching the rules" kind="table">
      <div className="bt-tablewrap lsc-tablewrap">
        <table className="bt-table lsc-table">
          <caption className="sr-only">Stocks whose latest daily bar matches a rule's conditions, in the rules' list order and then by symbol</caption>
          <thead><tr>
            <th scope="col">Stock</th><th scope="col">Rule · trigger</th><th scope="col" className="num">Close</th>
            <th scope="col" className="num">Lower exit level</th><th scope="col" className="num">Volume vs avg</th><th scope="col">Sector</th>
            <th scope="col">Past results (this stock)</th><th scope="col">Today</th><th scope="col">Last 40 closes</th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.rule.id + r.symbol} onPointerMove={(e) => tip.show(e, <MatchPop r={r} s={s} />)} onPointerLeave={() => tip.hide()}>
              <th scope="row"><Link className="lsc-stock" to={backtestLink(r.symbol, r.rule.id)} aria-label={`${r.symbol}: ${r.rule.name} in the Strategy backtest`}>{r.symbol}</Link>
                <small className="muted">{r.name}{r.fno ? <span className="lsc-fno">F&O</span> : null}</small></th>
              <td className="lsc-rule">{r.rule.name}<small className="muted">rule {r.order + 1} · trigger {dmy(r.day)}</small></td>
              <td className="num">{inr(r.close)}</td>
              <td className="num">{inr(r.lower)}<small>{r.distPct == null ? "—" : `${r.distPct.toFixed(2)}% under`}</small><Flags r={r} s={s} /></td>
              <td className="num">{times(r.volRatio)}<small>{count(r.volume)} shares</small></td>
              <td className="lsc-sector">{r.sector ?? <span className="muted">{NO_SECTOR}</span>}</td>
              <td className="lsc-past"><PastText m={r} few={few} /></td>
              <td><Since r={r} s={s} /></td>
              <td><Spark m={r} /></td>
            </tr>))}</tbody>
        </table>
      </div>
    </ChartZoom>
  );
}

function Cards({ rows, s }: { rows: Row[]; s: Scan }) {
  const few = s.fewTrades ?? 30;
  return (
    <ChartZoom label="Stocks matching the rules" kind="table">
      <ol className="lsc-cards" aria-label="Stocks matching the rules">{rows.map((r) => (
        <li key={r.rule.id + r.symbol}><article className="lsc-card" aria-label={`${r.symbol}, ${r.rule.name}`}>
          <header><div><h3>{r.symbol}{r.fno ? <span className="lsc-fno">F&O</span> : null}</h3><small className="muted">{r.name}</small></div><Since r={r} s={s} /></header>
          <p className="lsc-card-rule">{r.rule.name} <small className="muted">rule {r.order + 1} · trigger {dmy(r.day)}</small></p>
          <Spark m={r} w={300} h={44} />
          <dl className="bt-card-g">
            <div><dt>Close</dt><dd>{inr(r.close)}</dd></div>
            <div><dt>Lower exit level</dt><dd>{inr(r.lower)}<small>{r.distPct == null ? "—" : `${r.distPct.toFixed(2)}% under`}</small></dd></div>
            <div><dt>Volume vs average</dt><dd>{times(r.volRatio)}<small>{count(r.volume)} shares</small></dd></div>
            <div><dt>Sector</dt><dd className="lsc-dd-s">{r.sector ?? NO_SECTOR}</dd></div>
            <div className="wide"><dt>Past results on this stock</dt><dd className="lsc-dd-s"><PastText m={r} few={few} /></dd></div>
          </dl>
          {r.flags.map((f) => <p key={f} className="lsc-flag-t">{s.flags[f]}</p>)}
          <Link className="btn sm lsc-open" to={backtestLink(r.symbol, r.rule.id)}>Open in Strategy backtest</Link>
        </article></li>))}</ol>
    </ChartZoom>
  );
}

// ------------------------------------------------------------------------------------------------------------------ tab
function Coverage({ s }: { s: Scan }) {
  const k = s.skipped ?? { tooShort: 0, stale: 0, noData: 0, failed: 0 };
  const parts = [`${count(k.tooShort)} with fewer than ${s.minBars ?? 400} sessions of daily prices`, `${count(k.stale)} with no candle on ${dmy(s.barsDate)}`];
  if (k.noData) parts.push(`${count(k.noData)} with no stored prices`);
  if (k.failed) parts.push(`${count(k.failed)} whose prices could not be read`);
  const at = s.scannedAt ? new Date(s.scannedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
  return (
    <p className="muted bt-small lsc-cov">Universe: {count(s.universe)} NSE stocks with stored daily candles ({count(s.fno)} F&O), scanned {at} IST in {s.seconds ?? "—"} s.
      {" "}Checked {count(s.checked)}; skipped {parts.join(", ")}.{!s.nifty ? " Nifty 50's closes could not be read, so rule 23 was not checked." : ""}</p>
  );
}

export function SetupScanner() {
  const phone = usePhone();
  const q = useQuery({ queryKey: ["lab-scanner"], queryFn: getScan, retry: false, staleTime: 300_000 });
  const [f, setF] = useState<Filters>(ALL);
  const [all, setAll] = useState(false);
  const s = q.data && Array.isArray(q.data.rules) ? q.data : undefined;   // a malformed answer shows nothing rather than breaking the page
  const rows = useMemo(() => (s ? rowsOf(s) : []), [s]);
  const sectors = useMemo(() => sectorsOf(rows), [rows]);
  const shown = useMemo(() => applyFilters(rows, f), [rows, f]);
  useEffect(() => setAll(false), [f]);
  const list = all ? shown : shown.slice(0, FIRST);
  const set = (p: Partial<Filters>) => setF((o) => ({ ...o, ...p }));
  const ruleName = s?.rules.find((r) => r.id === f.rule)?.name;
  return (
    <section className="card oflow-board lab-bt lab-sc" aria-labelledby="lsc-h">
      <div className="oflow-hero-h"><div><h2 id="lsc-h">Setup scanner</h2>
        <p className="oflow-money-line">{s?.ready ? `${dmy(s.barsDate)} close · ${count(s.universe)} NSE stocks · ${rows.length} matches across the 23 rules` : "Each weekday evening: the NSE stocks whose latest daily bar matches each of the 23 fixed rules"}</p></div></div>
      <p className="bt-note" role="note">{NOTE}</p>
      {q.isPending && <div className="skeleton" style={{ height: 420 }} aria-label="Loading the latest scan" />}
      {q.isError && <div className="formerr" role="alert">The latest scan could not be loaded right now. Try again in a minute.</div>}
      {s && !s.ready && <div className="oflow-wait lsc-empty" role="status"><div><h3 className="lsc-h3">No scan yet</h3><p className="muted">{s.detail}</p></div></div>}
      {s?.ready && <>
        {s.stoppedEarly && s.stoppedNote && <p className="bt-warn" role="note">{s.stoppedNote}</p>}
        <Coverage s={s} />
        <Summary s={s} rows={rows} chosen={f.rule} choose={(id) => set({ rule: id })} />
        <div className="lsc-filters" role="group" aria-label="Filters">
          <label>Rule <select value={f.rule} onChange={(e) => set({ rule: e.target.value })} aria-label="Rule">
            <option value="">All 23 rules</option>{s.rules.map((r, i) => <option key={r.id} value={r.id}>{i + 1}. {r.name} ({r.count})</option>)}</select></label>
          <label>Sector <select value={f.sector} onChange={(e) => set({ sector: e.target.value })} aria-label="Sector">
            <option value="">All sectors</option>{sectors.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
          <div className="oflow-bchips" role="group" aria-label="Show">
            <button type="button" className="oflow-bchip" aria-pressed={f.fresh} disabled={!s.previousDate} title={s.previousDate ? `Not matching the same rule on ${dmy(s.previousDate)}` : "No earlier session is stored to compare with yet"}
              onClick={() => set({ fresh: !f.fresh })}>New today</button>
            <button type="button" className="oflow-bchip" aria-pressed={f.fno} onClick={() => set({ fno: !f.fno })}>F&O only</button>
          </div>
          {(f.rule || f.sector || f.fresh || f.fno) && <button type="button" className="btn sm" onClick={() => setF(ALL)}>Clear filters</button>}
        </div>
        <p className="muted bt-small" role="status">{shown.length} {shown.length === 1 ? "match" : "matches"}{ruleName ? ` for ${ruleName}` : ""}{f.sector ? ` in ${f.sector}` : ""}{f.fresh ? ", new today" : ""}{f.fno ? ", F&O stocks" : ""}; in the rules' list order, then by symbol. Choose a stock to open it in the Strategy backtest for that rule.</p>
        {shown.length === 0 ? <p className="lsc-none">{rows.length === 0 ? `No stock's latest bar matched any of the 23 rules on ${dmy(s.barsDate)}.` : "No match with these filters."}</p>
          : phone ? <Cards rows={list} s={s} /> : <Table rows={list} s={s} />}
        {!all && shown.length > FIRST && <button type="button" className="btn sm bt-more" onClick={() => setAll(true)}>Show {shown.length - FIRST} more</button>}
      </>}
      <details className="oflow-how"><summary>How it is worked out</summary>
        <div className="oflow-method bt-method">
          <p>Each weekday evening, once the session's daily candles are stored (from 19:40 IST, after the candle jobs; again the next morning if that session's candles came in late), every NSE stock with stored daily candles is checked: F&O stocks first, then the rest. A stock is listed under a rule when the rule's trigger fires on its latest daily bar, using that bar and the bars before it only. The rules, their triggers and their lower exit levels are the Strategy backtest's own (market-lab's 23 swing rules), on the same joined daily series the backtest uses.</p>
          <p>Lower exit level: the rule's own level at the trigger; distance is how far it sits under the latest close. Volume vs average: the latest session's volume divided by the average of the 50 sessions before it (exchange volumes only). Past results on this stock: that rule's closed trades in the Strategy backtest on the same stock, with its default exit ({s?.exitName ?? "Trailing 3 ATR"}), net of the stated delivery costs; fewer than 30 trades is a small sample and is said so. New today: the stock did not match the same rule on the previous stored session; Also yesterday: it did. The last 20 sessions are kept.</p>
          <p>Skipped and counted: a stock with fewer than 400 sessions of daily prices (the backtest's own minimum), and a stock with no candle on the latest session (suspended, or not loaded yet). If a scan ever reaches its time limit, it says how many stocks it reached; the rest are missing from every list that night.</p>
          <p>Rules: <a href="https://github.com/heysanjeevv/market-lab" target="_blank" rel="noopener noreferrer">market-lab</a> (MIT licence, © 2026 Market Lab contributors), re-implemented on FinLit's stored prices. Source: daily candles from the exchange (NSE, through Dhan) and the report's price series; no live quote. {NOTE}</p>
        </div>
      </details>
    </section>
  );
}
