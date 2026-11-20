// Mutual Fund Score cell of a table row (funds list, ETF list): the number with its colour band and label; a lock below Gold; the specific reason where there is no score.
import { Icon } from "../lib/icons";
import { GROWTH_SCORE_LABEL, PLAN_SCORE_NOTE } from "../lib/mf";
import { bandOf, scoreText, type ScoreItem } from "../lib/mfScore";
import "../styles/mf.css";

export function ScoreCell({ item, locked, why, loading = false }: { item?: ScoreItem; locked: boolean; why: string; loading?: boolean }) {
  if (locked) return <span className="mf-na" title="The Mutual Fund Score is part of the Gold plan."><Icon name="lock" /><span className="sr-only">Locked: Gold plan</span></span>;
  if (loading && !item) return <span className="mf-na" aria-busy="true"><span className="sr-only">Loading</span>…</span>;
  if (!item || item.final == null) return <span className="mf-na" title={item?.reason || why} aria-label={`No score. ${item?.reason || why}`}>—{item?.status === "NOT RATED" && <small>not rated</small>}</span>;
  const band = bandOf(item.final);
  const inh = item.inherited;   // task #281: an IDCW row shows its same-plan Growth option's score, labelled as that option's
  return <span className="mfs-cell" title={`${inh ? `${GROWTH_SCORE_LABEL} (${inh.name}). ${inh.why} ` : ""}${item.label}${item.status === "PROVISIONAL" ? ", provisional" : ""}. ${PLAN_SCORE_NOTE} Describes the past; not a recommendation.`}>
    <b className={"mfs-pv b-" + band}>{scoreText(item.final)}</b><small>{item.label}{item.status === "PROVISIONAL" ? " · provisional" : ""}</small>{inh && <small className="mfs-inh">{GROWTH_SCORE_LABEL}</small>}</span>;
}

/** A small band-coloured chip with the score next to a fund's name (Gold only: with no score, or below Gold, nothing is drawn and no value is in the page). */
export function ScoreChip({ item }: { item?: Pick<ScoreItem, "final" | "label" | "status" | "inherited"> }) {
  if (!item || item.final == null) return null;
  const band = bandOf(item.final);
  return <span className={"mfs-chip b-" + band} title={`${item.inherited ? GROWTH_SCORE_LABEL : "Mutual Fund Score"} ${scoreText(item.final)}: ${item.label}${item.status === "PROVISIONAL" ? ", provisional" : ""}. ${PLAN_SCORE_NOTE} Describes the past; not a recommendation.`}>{Math.round(item.final)}<span className="sr-only"> {item.label}</span></span>;
}
