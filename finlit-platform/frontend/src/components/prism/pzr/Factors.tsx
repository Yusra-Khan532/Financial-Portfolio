// Factor explorer: every factor of every part with its value, its reading (Very strong to Very weak), a bar of fixed length per reading, an
// input-state badge in words and the comparison behind it. The exact points stay on the server. Filter chips and a reading sort apply to all
// parts; on a phone each row becomes a stacked card.
import { useMemo, useState } from "react";
import {
  READING_FILL, READING_WORD, STANDING_WORD, factorDetail, factorValue, isRated, partInfo, partsOf, readingOf, reviewItem, score1, standing,
  type PartKey, type PrismMetric, type PrismReport, type PrismReview, type ReviewPart,
} from "../../../lib/prism";
import { BADGE_WORD, FILTER_WORD, filterFactors, partVar, sortFactors, type FactorFilter, type FactorSort } from "../../../lib/prismReport";

const FILTERS: FactorFilter[] = ["all", "strengths", "concerns", "estimated"];
const SORTS: [FactorSort, string][] = [["model", "Model order"], ["high", "Strongest first"], ["low", "Weakest first"]];

/** One bar per factor, filled to a fixed length for its reading (never to its exact points). */
function ReadingBar({ row }: { row: PrismMetric }) {
  const r = readingOf(row);
  return (
    <span className={"pzr-pb " + standing(row)} aria-hidden="true">
      <span className="pzr-pb-t"><i style={{ width: `${r == null ? 0 : READING_FILL[r]}%` }} /></span>
    </span>
  );
}

/** The lines under a factor's name: each said once (a line that only repeats another, or is contained in it, is dropped). */
export function noteLines(texts: (string | null | undefined)[]): string[] {
  const norm = (t: string) => t.trim().replace(/\.$/, "").toLowerCase();
  return texts.filter((t): t is string => !!t && !!t.trim()).reduce<string[]>((acc, t) => {
    if (acc.some((a) => norm(a).includes(norm(t)))) return acc;
    return [...acc.filter((a) => !norm(t).includes(norm(a))), t.trim()];
  }, []);
}

function Row({ row, review, part, group }: { row: PrismMetric; review: PrismReview; part: PartKey; group: string }) {
  const item = reviewItem(review, part, row.metric), st = standing(row), detail = factorDetail(row, group), reading = readingOf(row);
  const lines = noteLines([item?.summary, detail, item?.comparisonText]);
  return (
    <li className={"pzr-fr " + st} id={`pzr-f-${row.metric}`}>
      <span className="pzr-fr-n"><b>{item?.label || row.label}</b>
        {lines.map((t) => <small key={t}>{t}</small>)}</span>
      <span className="pzr-fr-v" data-l="Value">{row.value == null && item ? item.valueText : factorValue(row)}</span>
      <span className="pzr-fr-b" data-l="Position"><ReadingBar row={row} /></span>
      <span className="pzr-fr-p" data-l="Reading">{reading == null ? <span className="pzr-rd none">—</span> : <span className={"pzr-rd " + reading}>{READING_WORD[reading]}</span>}</span>
      <span className="pzr-fr-s" data-l="Status">
        <span className={"pzr-badge s" + row.status}><i aria-hidden="true" />{BADGE_WORD[row.status]}</span>
        <span className={"pzr-sw " + st}><i aria-hidden="true" />{STANDING_WORD[st]}</span>
      </span>
    </li>
  );
}

function PartSection({ part, index, report, review, filter, sort }: { part: ReviewPart; index: number; report: PrismReport; review: PrismReview; filter: FactorFilter; sort: FactorSort }) {
  const { rating } = report, rated = isRated(rating);
  const all = rating.metrics.filter((m) => m.part === part.key);
  const rows = useMemo(() => sortFactors(filterFactors(all, filter), sort), [all, filter, sort]);
  const score = rated ? part.score ?? rating.parts[part.key] ?? null : null;
  return (
    <section id={`pzr-part-${part.key}`} tabIndex={-1} className="pzr-fp" aria-labelledby={`pzr-fh-${part.key}`} style={{ "--c": partVar(part.key, index) } as React.CSSProperties}>
      <header className="pzr-fp-h">
        <span className="pzr-fp-sw" aria-hidden="true" />
        <div><h4 id={`pzr-fh-${part.key}`}>{partInfo(part.key).name}</h4><p>{partInfo(part.key).what}</p></div>
        <p className="pzr-fp-s">{score == null ? <small>Not rated</small> : <>{score1(score)}<small> / 100</small></>}</p>
      </header>
      {rated && part.notes?.map((n, i) => <p key={i} className="pzr-fnote">{n}</p>)}
      {rows.length ? (
        <>
          <div className="pzr-fr-head" aria-hidden="true"><span>Factor</span><span>Value</span><span>Position</span><span>Reading</span><span>Status</span></div>
          <ul className="pzr-fl" aria-label={`${partInfo(part.key).name} factors`}>{rows.map((r) => <Row key={r.metric} row={r} review={review} part={part.key} group={rating.group} />)}</ul>
        </>
      ) : <p className="pzr-empty">{all.length ? `No ${FILTER_WORD[filter].toLowerCase()} in this part.` : "No factors are listed for this part."}</p>}
    </section>
  );
}

export function FactorExplorer({ report, review }: { report: PrismReport; review: PrismReview }) {
  const [filter, setFilter] = useState<FactorFilter>("all"), [sort, setSort] = useState<FactorSort>("model");
  const metrics = report.rating.metrics;
  const order = partsOf(report.rating);
  const parts = order.map((k) => review.parts.find((p) => p.key === k) ?? { key: k, name: partInfo(k).name, score: report.rating.parts[k] ?? null, notes: [], pros: [], cons: [], mixed: [], unavailable: [] });
  const count = (f: FactorFilter) => filterFactors(metrics, f).length;
  return (
    <section className="pzr-sec" aria-labelledby="pzr-h-fx">
      <header className="pzr-sh"><h3 id="pzr-h-fx">Every factor</h3>
        <p className="pzr-wide">Each factor is read against companies in the same industry group, from Very strong to Very weak. Strong and Very strong count as strengths, Weak and Very weak as concerns, and estimated factors as neither. A higher Risk score means lower risk.</p></header>
      <div className="pzr-tools pzr-noprint">
        <div className="pzr-chipsrow" role="group" aria-label="Filter factors">
          {FILTERS.map((f) => <button key={f} type="button" className={"pzr-chip" + (filter === f ? " on" : "")} aria-pressed={filter === f} onClick={() => setFilter(f)}>{FILTER_WORD[f]} <small>{count(f)}</small></button>)}
        </div>
        <label className="pzr-sortl">Sort by<select value={sort} onChange={(e) => setSort(e.target.value as FactorSort)}>{SORTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      </div>
      <div className="pzr-fps">{parts.map((p, i) => <PartSection key={p.key} part={p} index={i} report={report} review={review} filter={filter} sort={sort} />)}</div>
    </section>
  );
}
