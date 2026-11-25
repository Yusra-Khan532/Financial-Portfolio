// Task #266 "Sentimental analysis for 3 filings": inside Section 18 News and filings, the newest investor presentation, earnings call transcript and results
// filing from the list, each broken into points and scored 0 to 100 by the team's rule-based workflow (backend/finlit/docscore). Three separate cards,
// one per source: the document score and its colour, the themes, the key points with their scores; every point on demand with the rules that moved it.
// The page shows scores and their colours only (green 65–100, yellow 40–64, red 0–39), never a word such as positive, neutral or negative (the task's
// rule). Task #328 (developer file 27, C): the scoring rules (theme weights, how a score is made, the method PDF) stay off the page. Describes what the documents say; not advice.
import { useState } from "react";
import { BAND_RANGE, KINDS, useFilingScores, type Band, type DocKind, type FsDoc, type FsPoint } from "../lib/filingScores";
import { possessive } from "./DiscoverThemes";
import "../styles/filing-scores.css";
import { sectionNo } from "../lib/sectionNav";

const KIND_LINE: Record<DocKind, string> = { P: "Slides and their notes, split by slide, bullet and table row.", C: "What management said on the call; analysts' questions and the moderator are left out.",
  R: "The results, notes and auditor's report, split by line and paragraph." };
const day = (iso?: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

function Dot({ b, v, big }: { b: Band | null | undefined; v: number | null | undefined; big?: boolean }) {
  if (v == null || !b) return <span className="fs-dot none">–</span>;
  return <span className={`fs-dot b-${b}${big ? " big" : ""}`} aria-label={`${Math.round(v)} of 100, ${b} (${BAND_RANGE[b]})`}>{Math.round(v)}</span>;
}

function Scale({ v }: { v: number }) {
  return (
    <span className="fs-scale" aria-hidden="true"><i className="r" /><i className="y" /><i className="g" /><b style={{ left: `${Math.max(0, Math.min(100, v))}%` }} /></span>);
}

function PointRow({ p }: { p: FsPoint }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={"fs-pt" + (p.hard ? " hard" : "")}>
      <Dot b={p.band} v={p.score} />
      <div>
        <p className="fs-pt-t">{p.speaker ? <b>{p.speaker}: </b> : null}{p.text}</p>
        <p className="fs-pt-m">{p.themeName} · page {p.page}{p.hard ? " · a hard trigger: held at 25 or below" : ""} · <button type="button" className="fs-lnk" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide the rules" : "Why this score"}</button></p>
        {open && <p className="fs-pt-r">50 {p.rules ? `· ${p.rules}` : "· no rule fired"}</p>}
      </div>
    </li>);
}

function DocCard({ k, d }: { k: DocKind; d: FsDoc }) {
  const [all, setAll] = useState(false);
  const head = <><h4 className="fs-h">{d.name}</h4><p className="fs-sub">{KIND_LINE[k]}</p></>;
  if (d.status === "none") return <article className="fs-doc none">{head}<p className="fs-empty">No {d.name.toLowerCase()} in Section {sectionNo("news")} or in the company's stored filings of the last 400 days.</p></article>;
  const src = d.doc && <p className="fs-src">{day(d.doc.date)} · {d.doc.source === "section18" ? "from the list above" : "from the company's stored filings"} · <a href={d.doc.link} target="_blank" rel="noopener noreferrer">PDF ↗</a></p>;
  if (d.status === "reading") return <article className="fs-doc">{head}{src}<div className="fs-reading" aria-busy="true"><span className="skeleton" />Reading the file from the exchange. This takes up to a minute the first time.</div></article>;
  if (d.status === "unreadable") return <article className="fs-doc">{head}{src}<p className="fs-empty">{d.why}</p></article>;
  const themes = (d.themes ?? []).filter((t) => t.score != null).sort((a, b) => b.weight - a.weight);
  const c = d.counts!;
  return (
    <article className={`fs-doc b-${d.band}`}>
      {head}{src}
      <div className="fs-score"><Dot b={d.band} v={d.score} big /><div><Scale v={d.score!} /><p className="fs-meta">{c.scored} points scored of {c.found} found{d.pages && d.ofPages && d.pages < d.ofPages ? ` (pages for this document: ${d.pages} of the file's ${d.ofPages})` : ""} · confidence {d.confidence?.toLowerCase()}</p></div></div>
      {(d.capped || (d.hardTriggers ?? 0) > 0) && <p className="fs-flag">{d.hardTriggers} hard trigger{d.hardTriggers === 1 ? "" : "s"} in the text (such as going concern or default): the document score is held at 64 or below.</p>}
      {d.share && <p className="fs-share" aria-label={`Points: ${d.share.green}% green, ${d.share.yellow}% yellow, ${d.share.red}% red`}><span className="fs-bar"><i className="g" style={{ flex: d.share.green || 0.001 }} /><i className="y" style={{ flex: d.share.yellow || 0.001 }} /><i className="r" style={{ flex: d.share.red || 0.001 }} /></span>
        <small>Points: {d.share.green}% green · {d.share.yellow}% yellow · {d.share.red}% red{d.mixed ? " · widely spread scores" : ""}</small></p>}
      {/* task #328 (developer file 27, C): no theme weights and no "How the score is made": the site keeps scoring rules off its pages */}
      {themes.length > 0 && <details className="fs-det"><summary>By theme ({themes.length})</summary>
        <ul className="fs-th">{themes.map((t) => <li key={t.theme}><span>{t.name}<small> · {t.points} point{t.points === 1 ? "" : "s"}</small></span><Dot b={t.band} v={t.score} /></li>)}</ul></details>}
      {/* task #328 (developer file 27, change 8): the points behind a "Key points" drop-down; "Every point" moves inside it */}
      {(d.keyPoints?.length ?? 0) > 0 && <details className="fs-kp"><summary>Key points <span className="n">{d.keyPoints!.length}</span><span className="cv" aria-hidden="true">▾</span></summary>
        <ol className="fs-pts">{d.keyPoints!.map((p) => <PointRow key={p.id} p={p} />)}</ol>
        {(d.points?.length ?? 0) > (d.keyPoints?.length ?? 0) && <>
          <button type="button" className="fs-all" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Hide the points" : `Every point (${d.points!.length}${d.more ? `, first ${d.points!.length} of ${d.points!.length + d.more}` : ""})`}</button>
          {all && <ol className="fs-pts all">{d.points!.map((p) => <PointRow key={p.id} p={p} />)}</ol>}</>}
      </details>}
    </article>);
}

/** QA of 23 Nov (task #328): the summary names how many filings it really weighs; with no transcript it weighs two, not "all three". */
/** The note on the weights, only where it is true for the filings weighed. */
export const weighNote = (ks: DocKind[]) => (ks.length < 2 || !ks.includes("R") ? null
  : <small>{ks.includes("P") ? " (audited results carry the most, the presentation the least)" : " (audited results carry the most)"}</small>);
export const togetherLabel = (n: number): string => (n >= 3 ? "All three together" : n === 2 ? "Both available filings together" : "The one available filing");

export function FilingScores({ symbol, name }: { symbol: string; name: string }) {
  const q = useFilingScores(symbol);
  if (!symbol) return null;
  const d = q.data;
  return (
    <div className="card fs-card" id="filing-scores" aria-labelledby="fs-title">
      <div className="fs-top">
        <div><h3 id="fs-title" className="fs-title">The three filings, point by point</h3>
          <p className="fs-lede">{possessive(name)} newest investor presentation, earnings call transcript and results filing, each broken into short points and scored from 0 to 100 by fixed word rules (no AI).</p></div>
        <p className="fs-legend" aria-label="Score ranges"><span><i className="fs-sw b-green" aria-hidden="true" />65–100</span><span><i className="fs-sw b-yellow" aria-hidden="true" />40–64</span><span><i className="fs-sw b-red" aria-hidden="true" />0–39</span></p>
      </div>
      {q.isLoading ? <div className="skeleton" style={{ height: 220 }} aria-busy="true" aria-label="Loading the filing scores" />
        : q.isError || !d ? <p className="fs-empty">The filing scores could not be loaded just now. <button type="button" className="fs-lnk" onClick={() => q.refetch()}>Try again</button></p>
        : <>
          {d.company.score != null && <p className="fs-co"><Dot b={d.company.band} v={d.company.score} /> <span><b>{togetherLabel((["R", "C", "P"] as DocKind[]).filter((k) => d.company.weights[k]).length)}</b> · {(["R", "C", "P"] as DocKind[]).filter((k) => d.company.weights[k]).map((k) => `${d.docs[k].name.toLowerCase()} ${d.company.weights[k]}%`).join(" · ")}{weighNote((["R", "C", "P"] as DocKind[]).filter((k) => d.company.weights[k]))}</span></p>}
          <div className="fs-grid">{KINDS.map((k) => <DocCard key={k} k={k} d={d.docs[k]} />)}</div>
        </>}
      <p className="faint fs-foot">The scores read the words of the company's own documents; they are not a recommendation. Information only, not investment advice.</p>
    </div>);
}
