// Peer and benchmark panel, and the notes at the end of the report: review notes, the data checks recorded while loading and how to read it.
import { useState, type ReactNode } from "react";
import { dateIN, nf } from "../../../lib/format";
import { isRated, type BenchmarkDetail, type PrismReport } from "../../../lib/prism";
import { peerRows, type PeerRow } from "../../../lib/prismReport";
import { ChartTable, ShowTable } from "../PrismCharts";

/** A section that opens and closes; its content stays in the page so a printout always includes it. */
export function Collapse({ title, count, children, defaultOpen = false, id }: { title: string; count?: number; children: ReactNode; defaultOpen?: boolean; id: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={"pzr-col" + (open ? " open" : "")}>
      <h3><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span>{title}{count != null && <small> ({count})</small>}</span><i className="pzr-chev" aria-hidden="true" /></button></h3>
      <div id={id} className="pzr-col-b" hidden={!open}>{children}</div>
    </div>
  );
}

/* ---- benchmark words (scope and provider disclosed) */
const RATIO: Record<string, string> = { pe: "P/E", pb: "P/B", ev_ebitda: "EV/EBITDA" };
export function benchmarkLine(key: string, b: BenchmarkDetail) {
  const ratio = RATIO[key.replace(/^(industry_median_|own_5y_median_)/, "")] || key;
  const scope = b.scope === "sector" ? "Sector" : b.scope === "own history" ? "Own five-year" : "Industry";
  const what = `${scope} ${ratio} ${b.method === "reported benchmark" ? "benchmark" : "median"}`;
  const value = b.value == null ? "not available" : `${nf(b.value, 2)}×`;
  const cover = b.positiveCount != null && b.universeCount != null ? ` From ${b.positiveCount} positive multiples; ${b.observedCount ?? "—"} of ${b.universeCount} peer records available${b.partial ? " (partial coverage, not a complete-industry median)" : ""}.` : "";
  const extra = b.scope === "sector" ? " The provider does not specify its statement basis, valuation date or aggregation method." : "";
  return { what, value, src: `${b.provider}${b.method ? `, ${b.method}` : ""}${b.asOf ? `, as of ${dateIN(b.asOf)}` : ""}.`, more: cover + extra };
}

function PeerBlock({ row }: { row: PeerRow }) {
  const max = Math.max(row.company ?? 0, row.benchmark ?? 0, row.own ?? 0) * 1.12 || 1;
  const pos = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const diff = row.company != null && row.benchmark ? ((row.company - row.benchmark) / row.benchmark) * 100 : null;
  const l = row.detail ? benchmarkLine(`industry_median_${row.key}`, row.detail) : null;
  const sentence = row.company != null && row.benchmark != null
    ? `${row.label}: the company is at ${nf(row.company, 2)}× against a benchmark of ${nf(row.benchmark, 2)}×, ${nf(Math.abs(diff ?? 0), 0)}% ${diff != null && diff < 0 ? "below" : "above"} it.`
    : `${row.label}: ${row.company != null ? `the company is at ${nf(row.company, 2)}×; no benchmark is available.` : `benchmark ${nf(row.benchmark!, 2)}×; no company multiple is available.`}`;
  return (
    <li className="pzr-peer">
      <div className="pzr-peer-h"><b>{row.label}</b><span>{diff == null ? "" : `${nf(Math.abs(diff), 0)}% ${diff < 0 ? "below" : "above"} the benchmark`}</span></div>
      <div className="pzr-peer-bars" role="img" aria-label={sentence} style={{ "--bm": row.benchmark == null ? 0 : Math.min(1, row.benchmark / max) } as React.CSSProperties}>
        {([["Company", row.company, "co"], ["Benchmark", row.benchmark, "bm"], ["Own 5-year median", row.own, "own"]] as const).filter(([, v]) => v != null).map(([n, v, c]) => (
          <div key={n} className={"pzr-peer-r " + c}><span>{n}</span><i><b style={{ width: pos(v!) }} /></i><em>{nf(v!, 2)}×</em></div>
        ))}
        {row.benchmark != null && <u aria-hidden="true" />}
      </div>
      {l ? <p className="pzr-small"><b>{l.what} {l.value}.</b> Source: {l.src}{l.more}</p> : <p className="pzr-small">No verified benchmark for this multiple; the model uses a group estimate where it needs one.</p>}
    </li>
  );
}

export function Peers({ report }: { report: PrismReport }) {
  const rows = peerRows(report), [table, setTable] = useState(false);
  const extra = Object.entries(report.benchmark?.metrics || {}).filter(([k]) => !rows.some((r) => k === `industry_median_${r.key}`));
  return (
    <section className="pzr-sec" aria-labelledby="pzr-h-peer">
      <header className="pzr-sh"><h3 id="pzr-h-peer">Valuation against the benchmark</h3><p>Price multiples of the company next to the benchmark used in the Valuation part. The line marks the benchmark.</p></header>
      {rows.length ? <ul className="pzr-peers">{rows.map((r) => <PeerBlock key={r.key} row={r} />)}</ul>
        : <p className="pzr-empty">No verified industry or sector valuation benchmarks were available; the valuation factors that need one use group estimates.</p>}
      {extra.length > 0 && <ul className="pzr-bm">{extra.map(([k, b]) => { const l = benchmarkLine(k, b); return <li key={k}><b>{l.what} {l.value}</b><span className="pzr-small">Source: {l.src}{l.more}</span></li>; })}</ul>}
      {report.benchmark?.note && <p className="pzr-small">{report.benchmark.note}</p>}
      <p className="pzr-small">Own-history comparisons use the company's own multiples over up to five years; the comparison behind each valuation factor is listed with the factor.</p>
      {rows.length > 0 && <><div className="pzr-cfoot"><span /><ShowTable on={table} set={setTable} /></div>
        {table && <ChartTable caption="Company multiple, benchmark and own five-year median" head={["Multiple", "Company", "Benchmark", "Own 5-year median"]} rows={rows.map((r) => [r.label, r.company == null ? "—" : `${nf(r.company, 2)}×`, r.benchmark == null ? "—" : `${nf(r.benchmark, 2)}×`, r.own == null ? "—" : `${nf(r.own, 2)}×`])} />}</>}
    </section>
  );
}

/** How to read the report, in words: what the score, the labels and the readings mean. The method itself stays on the server. */
export const HOW_TO_READ = [
  "The score runs from 0 to 100. Labels, best to worst: Strong, Healthy, Average, Weak, Poor.",
  "Each part reads its factors against companies in the same industry group. Higher is better for all four; a high Risk score means lower risk.",
  "Each factor's reading runs from Very strong to Very weak.",
  "Not rated: too much of the data is missing, or there is too little income history. Provisional: part of the data is missing, and the label is held back.",
  "A missing input may be estimated from industry figures. Estimates are always marked and never shown as strengths or concerns.",
  "A recent loss, or weak growth or quality, can limit a part's score.",
];

/** The notes at the end of the report: what the review recorded, what the loader recorded, and how to read the report. */
export function Notes({ report, notes }: { report: PrismReport; notes: string[] }) {
  return (
    <section className="pzr-sec" aria-labelledby="pzr-h-notes">
      <header className="pzr-sh"><h3 id="pzr-h-notes">Notes</h3><p>Review notes, data checks and how to read this report.</p></header>
      <div className="pzr-cols">
        {notes.length > 0 && <Collapse id="pzr-notes" title="Review notes" count={notes.length}><ul className="pzr-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Collapse>}
        {report.warnings.length > 0 && <Collapse id="pzr-warn" title="Data checks recorded while loading" count={report.warnings.length}><p className="pzr-small">What the data loader recorded while preparing this calculation, as recorded.</p><ul className="pzr-notes">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Collapse>}
        <Collapse id="pzr-how" title="How to read this report"><ul className="pzr-notes">{HOW_TO_READ.map((r) => <li key={r}>{r}</li>)}</ul>
          {!isRated(report.rating) && <p className="pzr-small">This company is not rated, so no part scores are shown.</p>}</Collapse>
      </div>
    </section>
  );
}
