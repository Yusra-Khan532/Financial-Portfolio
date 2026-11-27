// The Mutual Fund Score card of a fund's page: one plain line, ring, four pillars, status, rank and the data behind it, reasons, gaps and a link to
// the method (task #132: the line first, rank and data in one list, the breakdown as a table; no weights and no look-back lengths). Locked below the plan that has it.
import { Link } from "react-router";
import { Gate } from "../components/Gate";
import { Icon } from "../lib/icons";
import {
  FLAG_TEXT, MF_METHOD_URL, MF_SCORE_COMPLIANCE, scoreFootLine, MF_SCORE_NAME, PILLAR_HELP, SCORE_BANDS, bandOf, wordBand, builtOnText, etfMeasures, rankText, scoreSentence, scoreText, useFundScore,
  type FundScore, type ScoreLine,
} from "../lib/mfScore";
import { BAND_NAME, bandVar } from "../lib/scoreBands";
import { dateIN } from "../lib/format";
import { GROWTH_SCORE_LABEL, PLAN_SCORE_NOTE, scoreReason } from "../lib/mf";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { PartLine } from "./PartLine";
import { PEER_KIND_WORD, type CategoryMedian } from "../lib/mfScoreUp";
import { ScoreAlertButton } from "./ScoreAlertButton";
import { ScoreHistoryCard } from "./ScoreHistory";
import "../styles/mf.css";

const C = 2 * Math.PI * 52;
export function ScoreRing({ score, label, size = 132 }: { score: number | null; label: string | null; size?: number }) {
  const band = bandOf(score);
  const frac = score == null ? 0 : Math.max(0, Math.min(1, score / 100));
  return (
    <svg className="mfs-ring" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={score == null ? "No score" : `Score ${scoreText(score)} out of 100: ${label}`}>
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--s3)" strokeWidth="10" />
      {score != null && <circle cx="60" cy="60" r="52" fill="none" stroke={bandVar(band)} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${frac * C} ${C}`} transform="rotate(-90 60 60)" />}
      <text x="60" y="64" textAnchor="middle" className="mfs-n">{score == null ? "—" : scoreText(score)}</text>
      <text x="60" y="82" textAnchor="middle" className="mfs-u">{score == null ? "no score" : "out of 100"}</text>
    </svg>
  );
}

function Pillars({ s }: { s: FundScore }) {
  return (<>
    <ul className="mfs-pillars" aria-label="The four parts of the score, each out of 100 and in words">
      {s.pillars.map((p) => {
        const word = p.reading || "Not scored", band = wordBand(word), pts = p.points ?? null;
        // task #238: the part's own figure beside its word, and the bar drawn to that figure (a part with no figure keeps the word's width)
        const width = pts != null ? `${Math.max(0, Math.min(100, pts))}%` : band === "hi" ? "100%" : band === "mid" ? "62%" : band === "lo" ? "28%" : "0%";
        return (
          <li key={p.key} title={PILLAR_HELP[p.key]}>
            <span className="mfs-pn">{p.name}</span>
            <span className="mfs-bar" aria-hidden="true"><i style={{ width, background: bandVar(band) }} /></span>
            <b className={"mfs-pv b-" + band} aria-label={pts != null ? `${p.name}: ${scoreText(pts)} out of 100, ${word}` : undefined}>
              {pts != null && <span className="mfs-pnum">{scoreText(pts)}</span>}{word}{p.allNotApplicable && <sup title="None of this part's measures apply, so it counts as neutral.">F</sup>}
            </b>
            <PartLine part={p.key} />
          </li>);
      })}
    </ul>
  </>);
}

const ETF_ONLY = new Set(["ETF_LIQUIDITY", "ETF_PREMIUM"]);
function Lines({ title, items, kind }: { title: string; items: ScoreLine[]; kind: "good" | "watch" }) {
  if (!items.length) return null;
  return (
    <div className={"mfs-why " + kind}>
      <h4>{title}</h4>
      <ul>{items.map((i) => <li key={i.id}><Icon name={kind === "good" ? "check" : "alert"} /><span><b>{i.label}.</b> {i.text}{ETF_ONLY.has(i.id) && <em className="mfs-etftag">ETF measure</em>}</span></li>)}</ul>
    </div>
  );
}

/** What only an ETF has: how easily it trades on the exchange and how far its price sat from its NAV. When one of them is among the reasons above it is tagged there;
 *  this block carries the other one (or both) so that both are always visible, with their points, and a measure that could not be worked out says why. */
function EtfMeasures({ s }: { s: FundScore }) {
  const list = etfMeasures(s).filter((m) => m.tone === "neutral" || m.tone === "gap");
  if (!list.length) return null;
  return (
    <div className="mfs-etf" aria-label="Measures only exchange-traded funds have">
      <h4>How this ETF trades</h4>
      <ul>{list.map((m) => (
        <li key={m.id} className={"mfs-etfm " + m.tone}>
          <span className="mfs-etfn"><b>{m.label}</b>{m.points != null && <small>{Math.round(m.points)} of 100 points</small>}</span>
          <span>{m.text}</span>
        </li>))}</ul>
    </div>
  );
}

/** Rank, the share of the group it is above, the category median, who it is compared with and the data behind it, in one list beside the parts (task #132). */
function Facts({ s }: { s: FundScore & { categoryMedian?: CategoryMedian } }) {
  const med = s.categoryMedian, rows: [string, string][] = [];
  if (s.rank) rows.push(["Rank in its group", rankText(s.rank, s.family)]);
  if (s.rank?.percentile != null) rows.push(["Higher than", `${s.rank.percentile}% of the group`]);
  if (med?.final != null) rows.push(["Category median", `${scoreText(med.final)}${med.categoryLabel ? ` (${med.categoryLabel}, ${med.plan} plan)` : ""}`]);
  if (s.peers?.n) rows.push(["Compared with", `${s.peers.n} funds, ${PEER_KIND_WORD[s.peers.kind || ""] || s.peers.text || "similar funds"}`]);
  if (s.fundPlan === "Direct" || s.fundPlan === "Regular" || s.plan === "Direct" || s.plan === "Regular") rows.push(["Plans", PLAN_SCORE_NOTE]);   // task #281
  if (s.months) rows.push(["NAV history used", `${s.months} months`]);
  const built = builtOnText(s.filled);
  if (built) rows.push(["Built on real data", built.replace("Built on real data: ", "")]);
  if (!rows.length) return null;
  return <dl className="mfs-dl" aria-label="Rank and the data behind the score">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export function ScoreBody({ s }: { s: FundScore }) {
  const rated = s.final != null;
  const r = s.reasons;
  const band = bandOf(s.final);
  const line = rated ? scoreSentence(s) : null;
  return (
    <>
      {line && <p className="mfs-one">{line}</p>}
      {s.inherited && <p className="mf-note" role="note"><Icon name="info" /><span>{s.inherited.code ? GROWTH_SCORE_LABEL : "Inherited score"}: {s.inherited.why}{s.inherited.code ? <> <Link to={`/funds/${s.inherited.code}`}>{s.inherited.name}</Link></> : s.inherited.symbol ? <> <Link to={`/etfs/${s.inherited.symbol}`}>{s.inherited.name}</Link></> : null}</span></p>}
      <div className="mfs-top">
        <div className="mfs-ringbox">
          <ScoreRing score={s.final} label={s.label} />
          <div className="mfs-chips">
            {s.label && <span className={"mfs-label b-" + band}><i aria-hidden="true" />{s.label}</span>}
            <span className={"mfs-status " + (s.status || "").toLowerCase().replace(" ", "-")}>{s.status === "RATED" ? "Rated" : s.status === "PROVISIONAL" ? "Provisional" : s.status === "NOT RATED" ? "Not rated" : "Not scored"}</span>
          </div>
        </div>
        <div className="mfs-side">
          {rated ? <Pillars s={s} /> : <p className="mfs-nr" role="status"><b>{s.status === "NOT SCORED" ? "Not scored" : "Not rated"}:</b> {scoreReason(s.reason)}</p>}
        </div>
        {rated && <Facts s={s} />}
      </div>
      {s.group && !rated && <p className="mfs-grp"><b>{s.groupName}</b></p>}
      {rated && s.status === "PROVISIONAL" && s.reason && <p className="mfs-conf"><Icon name="info" /><span>{s.reason}.</span></p>}
      {s.cap && <p className="mf-note warn" role="note"><Icon name="alert" /><span>{s.cap} (the uncapped figure was {scoreText(s.rawFinal)}). A high return does not hide weak risk or weak foundations.</span></p>}
      {(s.flags || []).filter((f) => f === "NAV_BREAK" || f === "FROZEN_NAV" || f === "NEAR_IDENTICAL").map((f) => <p key={f} className="mf-note" role="note"><Icon name="info" /><span>{FLAG_TEXT[f]}</span></p>)}
      <div className="mfs-scale" aria-hidden="true">{SCORE_BANDS.map(([w, a, b]) => <span key={w} style={{ flex: b - a }}>{w}</span>)}</div>
      {rated && r && (
        <div className="mfs-reasons">
          <h3 className="mf-h4">Why this score</h3>
          <div className="mfs-cols"><Lines title="What lifts it" items={r.strengths} kind="good" /><Lines title="What to watch" items={r.watchouts} kind="watch" /></div>
          {r.strengths.length === 0 && r.watchouts.length === 0 && <p className="faint">No single measure stands out from the typical fund of this group.</p>}
          {(r.gaps.length > 0 || r.notApplicable.length > 0 || r.substitutions.length > 0) && (
            <details className="mfs-gaps"><summary>Gaps and notes ({r.gaps.length + r.substitutions.length})</summary>
              <ul>{r.gaps.map((g) => <li key={g.id}><b>{g.label}:</b> {g.text}. The group value was used.</li>)}
                {r.substitutions.map((g) => <li key={g.id}><b>{g.label}:</b> {g.text}.</li>)}
                {r.notApplicable.map((g) => <li key={g.id} className="faint"><b>{g.label}:</b> {g.text}.</li>)}</ul>
            </details>)}
        </div>)}
      {rated && s.kind === "etf" && <EtfMeasures s={s} />}
      <p className="faint mf-fine">{scoreFootLine(s.runDate ? dateIN(s.runDate) : null, s.peers?.kind, s.peers?.text)} · <Link to={s.method || MF_METHOD_URL}>What the score means</Link></p>
    </>
  );
}

const LOCK_POINTS = ["A 0 to 100 health score with four parts: Performance, Risk, Cost and Quality", "Rank among funds of the same category and plan", "The strongest points and the watch-outs, in plain words"];

/** One card for both: a mutual fund (`code`) or an exchange-traded fund (`kind="etf"` and its NSE `symbol`). */
export function FundScoreCard({ code = 0, kind = "mf", symbol = "" }: { code?: number; kind?: "mf" | "etf"; symbol?: string }) {
  const q = useFundScore(code, kind, symbol);
  const s = q.data;
  if (s?.notOffered) return null;   // an exchange-traded fund (also an ETF-category scheme opened as a fund): the score is not given, so no card
  return (
    <>
    <section className="card mf-card mfs-card" aria-label={MF_SCORE_NAME}>
      <div className="card-h"><h3><span className="ci"><Icon name="quality" /></span>{MF_SCORE_NAME}</h3><span className="s">Describes the past; not a forecast</span></div>
      {q.isLoading ? <div className="skeleton" style={{ height: 180 }} aria-busy="true" /> : q.isError || !s ? <p className="faint" role="status">The score is not available right now.</p>
        : s.locked ? (
          <Gate tier="gold" title={MF_SCORE_NAME} points={LOCK_POINTS}>
            <div className="mfs-top"><div className="mfs-ringbox"><ScoreRing score={null} label={null} /></div>
              <div className="mfs-side"><Pillars s={{ ...s, pillars: s.pillars }} /></div></div>
            <p className="faint mf-fine">{MF_SCORE_COMPLIANCE}</p>
          </Gate>)
          : <><ScoreBody s={s} />
            {s.final != null && <ScoreBreakdown s={s} />}
            {s.final != null && <ScoreAlertButton code={kind === "mf" ? s.inherited?.code ?? code : 0} symbol={kind === "etf" ? symbol : s.inherited?.symbol ?? ""} name={s.inherited?.name ?? "this fund"} />}</>}
    </section>
    {s && !s.locked && s.final != null && <ScoreHistoryCard code={kind === "mf" ? code : 0} kind={kind} symbol={symbol} />}
    </>
  );
}
export { BAND_NAME };
