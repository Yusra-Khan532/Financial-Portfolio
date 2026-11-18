// Full measure-by-measure breakdown of a score: pillars with every measure (your value, the category median, points, state and what it means, a coloured bar),
// the four parts against the category median as a four-row table (task #132: it was a radar chart), and a "Data gaps" box. Rendered inside the score card when
// the score is rated. Rank, peers, NAV history used and the category median score sit in the card's top list.
import { useState } from "react";
import { Icon } from "../lib/icons";
import { PILLARS, STATE_WORD, dataGaps, groupMetrics, stateLine, type CategoryMedian } from "../lib/mfScoreUp";
import { bandOf, scoreText, wordBand, type FundScore, type ScorePillar } from "../lib/mfScore";
import { bandVar } from "../lib/scoreBands";
import "../styles/mfup.css";

/** This fund's part: its figure out of 100 (task #238) and its word. */
function PartCell({ p }: { p: ScorePillar | undefined }) {
  const w = p?.reading || "Not scored";
  return <>{p?.points != null && <span className="mfs-pnum">{scoreText(p.points)}</span>}<b className={"b-" + wordBand(w)}>{w}</b></>;
}

const num = (v: number | null | undefined) => (v == null ? "—" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, ""));
type S = FundScore & { categoryMedian?: CategoryMedian };

export function ScoreBreakdown({ s }: { s: S }) {
  const [open, setOpen] = useState(false);
  if (s.final == null || !s.metrics?.length) return null;
  const groups = groupMetrics(s), gaps = dataGaps(s), med = s.categoryMedian;
  const word = (w: string | null | undefined) => <b className={"b-" + wordBand(w)}>{w || "Not scored"}</b>;
  return (
    <div className="mfu-bd" data-testid="score-breakdown">
      <h3 className="mf-h4">Score breakdown: this fund against the category median</h3>
      <div className="mfu-bdtop">
        <div className="tw"><table className="mfu-parts">
          <caption className="sr-only">The four parts of this fund's score, out of 100 and in words, beside the category median{med?.n ? ` of ${med.n} funds` : ""}</caption>
          <thead><tr><th scope="col">Part</th><th scope="col">This fund</th><th scope="col">{med ? `Category median${med.n ? ` (${med.n} funds)` : ""}` : "Category median"}</th></tr></thead>
          <tbody>{PILLARS.map(([k, name]) => (
            <tr key={k}><th scope="row">{name}</th><td><PartCell p={s.pillars.find((x) => x.key === k)} /></td><td>{med ? word(med[k]) : <span className="faint" title="The category median is not worked out for this group yet">—</span>}</td></tr>))}</tbody>
        </table></div>
        <div className="mfu-facts">
          <div className={"mfu-gaps" + (gaps.length ? " has" : "")} aria-label="Data gaps">
            <h4><Icon name={gaps.length ? "alert" : "check"} /> Data gaps</h4>
            {gaps.length === 0 ? <p>Every measure used the fund's own figures.</p> : (
              <><p>{gaps.filter((g) => g.state === "F").length} measure(s) used the group value because data was missing; {gaps.filter((g) => g.state === "S").length} used a stand-in figure.</p>
                <ul>{gaps.map((g) => <li key={g.id}><b>{g.label}</b> <em>{STATE_WORD[g.state]}</em>{g.whyText ? `: ${g.whyText}` : ""}</li>)}</ul></>)}
          </div>
        </div>
      </div>
      <button type="button" className="mf-linkbtn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide the measure-by-measure table" : "Show the measure-by-measure table"}</button>
      {open && (
        <div className="tw"><table className="mf-cmp mfu-tbl"><caption className="sr-only">Every measure behind the score, by part</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col" className="num">This fund</th><th scope="col" className="num">Peer median</th><th scope="col" className="num">Points</th><th scope="col">State</th></tr></thead>
          {groups.map((g) => (
            <tbody key={g.key}>
              <tr className="mfu-ph"><th scope="colgroup" colSpan={5}>{PILLARS.find(([k]) => k === g.key)![1]} <b className={"b-" + wordBand(g.word)}>{g.word || "Not scored"}</b></th></tr>
              {g.metrics.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.label}</th><td className="num">{num(m.own ?? m.value)}</td><td className="num">{num(m.peer)}</td>
                  <td className="num"><span className="mfu-pbar" aria-hidden="true"><i style={{ width: `${m.points ?? 0}%`, background: bandVar(bandOf(m.points)) }} /></span><span>{m.points == null ? "—" : m.points.toFixed(0)}</span></td>
                  <td><span className={"mfu-st st-" + m.state}>{STATE_WORD[m.state]}</span><small>{stateLine(m)}</small></td>
                </tr>))}
            </tbody>))}
        </table></div>)}
    </div>
  );
}
