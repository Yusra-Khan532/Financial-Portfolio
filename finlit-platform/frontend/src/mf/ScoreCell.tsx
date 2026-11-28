// Mutual Fund Score cell of a table row (funds list, ETF list): the number with its colour band and label; a lock below Gold; the specific reason where there is no score.
import { useRef } from "react";
import { useInfoPop } from "../components/Info";
import { Icon } from "../lib/icons";
import "../styles/task374.css";   // task #374: the "i" on a missing score
import { GROWTH_SCORE_LABEL, PLAN_SCORE_NOTE } from "../lib/mf";
import { bandOf, partTip, scoreText, wordBand, type ScoreItem } from "../lib/mfScore";
import "../styles/mf.css";
import "../styles/task358.css";   // task #358: the four parts in the score cell
import "../styles/task371.css";   // task #371: a bigger score and parts; each part names itself on hover, focus or tap (task #378: its figure too, below the letters)

/** Task #374 (team, 24 Nov 2026): a missing score shows an "i"; hovering, focusing or tapping it names why, in the team's words first ("Missing data from
 *  AMFI", or for an ETF "Scoring not available"), then the specific reason. */
export const missingScoreHead = (etf: boolean) => (etf ? "Scoring not available" : "Missing data from AMFI");
export const missingScoreTip = (etf: boolean, reason: string) => `${missingScoreHead(etf)}. ${reason}`;

/** Task #440 (team, 28 Nov 2026: "'i' box is getting hidden inside the columns"): the explanation was a CSS box drawn inside the score's table cell. A
 *  stopped scheme's cells are faded with opacity (mf.css, mfscreen.css), and opacity makes every cell its own layer, so the next cells (NAV, returns) and
 *  the frozen Scheme column were painted over the box, the box was faded too, and on a phone the table's sideways-scroll box cut it off. The i now opens
 *  the site's shared explanation popover (components/Info.tsx: drawn once at the page's top level, fixed, placed whole inside the window by
 *  lib/floating.ts), so no cell, column or scroll box can cover or cut it. Hover, keyboard focus and a tap open it, as for every other i; Escape closes it;
 *  a tap keeps it open until a tap outside it (task #398). */
function NoScoreI({ head, reason }: { head: string; reason: string }) {
  const show = useInfoPop();
  const touch = useRef(false);
  const g = { key: "mf-noscore", label: head, what: reason };
  return <button type="button" className="mf-na-i" data-tip={`${head}. ${reason}`} aria-label={`No score. ${head}. ${reason}`}
    onPointerDown={(e) => { touch.current = e.pointerType === "touch"; }}
    onMouseEnter={(e) => show(g, e.currentTarget)} onMouseLeave={() => show(null)} onFocus={(e) => show(g, e.currentTarget)} onBlur={() => show(null)}
    onClick={(e) => { e.stopPropagation(); show(g, e.currentTarget, touch.current); }}>i</button>;
}
export const isEtfCategory = (category?: string | null) => /\bETFs?\b/i.test(category ?? "");

export function ScoreCell({ item, locked, why, loading = false, etf = false, bare = false }: { item?: ScoreItem; locked: boolean; why: string; loading?: boolean; etf?: boolean;
  /** task #430 (the Mutual funds list): the figure only, no words under it ("Average", "Growth option's score", "provisional", "not rated"); the words stay
   *  in the cell's hover text and are read out to screen readers. The four part letters stay (the team asked for them, tasks #358 and #378). */ bare?: boolean }) {
  if (locked) return <span className="mf-na" title="The Mutual Fund Score is part of the Gold plan."><Icon name="lock" /><span className="sr-only">Locked: Gold plan</span></span>;
  if (loading && !item) return <span className="mf-na" aria-busy="true"><span className="sr-only">Loading</span>…</span>;
  if (!item || item.final == null) { const isEtf = etf || !!item?.symbol;
    return <span className="mf-na mf-na-x"><span aria-hidden="true">—</span>{item?.status === "NOT RATED" && (bare ? <span className="sr-only">not rated</span> : <small>not rated</small>)}
      <NoScoreI head={missingScoreHead(isEtf)} reason={item?.reason || why} /></span>; }
  const band = bandOf(item.final);
  const inh = item.inherited;   // task #281: an IDCW row shows its same-plan Growth option's score, labelled as that option's
  return <span className="mfs-cell" title={`${inh ? `${GROWTH_SCORE_LABEL} (${inh.name}). ${inh.why} ` : ""}${item.label}${item.status === "PROVISIONAL" ? ", provisional" : ""}. ${PLAN_SCORE_NOTE} Describes the past; not a recommendation.`}>
    <b className={"mfs-pv b-" + band}>{scoreText(item.final)}</b>
    {bare ? <span className="sr-only">{item.label}{item.status === "PROVISIONAL" ? ", provisional" : ""}{inh ? `, ${GROWTH_SCORE_LABEL}` : ""}</span>
      : <><small>{item.label}{item.status === "PROVISIONAL" ? " · provisional" : ""}</small>{inh && <small className="mfs-inh">{GROWTH_SCORE_LABEL}</small>}</>}
    <Parts parts={item.pillars} scores={item.pillarScores} /></span>;
}

/** Task #358 (team, 23 Nov 2026): the four parts inside the score cell (no extra column): P R C Q, each coloured by its word (Strong, Fair, Weak).
 *  Task #378 (team, 25 Nov 2026: "still the scores are not seen"): each letter names its part, its own figure out of 100 and its word ("Performance
 *  42.0 / 100 · Weak") on hover, focus or tap and for screen readers; the box opens BELOW the letters so the total score and its word stay in view.
 *  Gold only, like the score itself. */
const PARTS: { key: string; letter: string; name: string }[] = [
  { key: "performance", letter: "P", name: "Performance" }, { key: "risk", letter: "R", name: "Risk" }, { key: "cost", letter: "C", name: "Cost" }, { key: "quality", letter: "Q", name: "Quality" },
];
export function Parts({ parts, scores }: { parts?: Record<string, string | null> | null; scores?: Record<string, number | null> | null }) {
  if (!parts || !PARTS.some((p) => parts[p.key])) return null;
  const tips = PARTS.map((p) => partTip(p.name, parts[p.key], scores?.[p.key]));
  // the box shows the same words on two lines, the figure on its own ("Performance · Weak" / "42.0 / 100"), so it never breaks inside "42.0 / 100"
  const tipLines = (t: string) => { const m = /^(\S+) ([\d.]+ \/ 100) · (.+)$/.exec(t); return m ? `${m[1]} · ${m[3]}\n${m[2]}` : t; };
  // title="" keeps the whole cell's long tooltip from stacking on top; focusable, so a keyboard or a tap on a phone shows the box too.
  return (
    <span className="mfs-parts mfs-tip-below" role="group" aria-label={`The four parts. ${tips.join("; ")}.`}>
      {PARTS.map((p, i) => <i key={p.key} className={"mfs-part b-" + wordBand(parts[p.key])} tabIndex={0} title="" data-tip={tipLines(tips[i])} aria-label={tips[i]}>{p.letter}</i>)}
    </span>);
}

/** A small band-coloured chip with the score next to a fund's name (Gold only: with no score, or below Gold, nothing is drawn and no value is in the page). */
export function ScoreChip({ item }: { item?: Pick<ScoreItem, "final" | "label" | "status" | "inherited"> }) {
  if (!item || item.final == null) return null;
  const band = bandOf(item.final);
  return <span className={"mfs-chip b-" + band} title={`${item.inherited ? GROWTH_SCORE_LABEL : "Mutual Fund Score"} ${scoreText(item.final)}: ${item.label}${item.status === "PROVISIONAL" ? ", provisional" : ""}. ${PLAN_SCORE_NOTE} Describes the past; not a recommendation.`}>{Math.round(item.final)}<span className="sr-only"> {item.label}</span></span>;
}
