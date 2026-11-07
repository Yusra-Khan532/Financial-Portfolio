// One FinLit Prism report: the score with its four parts, every factor with its reading, the technical view, financial history with the key
// ratios, valuation against the benchmark, the notes and one boxed disclaimer. The method (weights, points, cut-offs, rules) stays on the server.
// NOT RATED never shows category scores. Layout lives in styles/prism-report.css (pzr-*).
import { Icon } from "../../lib/icons";
import { PRISM_NAME, PRISM_NOTE, incomeNote, incomeWord, notRatedReason, prismReview } from "../../lib/prism";
import { istTime, LabelChip, StatusChip, type ReportActions } from "./pzr/Hero";
import { CardTop } from "./pzr/CardTop";
export { reportRef } from "./pzr/CardTop";
import { FactorExplorer } from "./pzr/Factors";
import { Notes, Peers } from "./pzr/Health";
import { HistoryCharts, HistoryTables } from "./pzr/History";
import { Technical } from "./pzr/Technical";
import "../../styles/prism-technical.css";
import type { PrismReport } from "../../lib/prism";

export { istTime, LabelChip, StatusChip };
export type { ReportActions };

/** Placeholder with the report's own proportions, shown while the stored report loads. */
export function ReportSkeleton() {
  return (
    <div className="pzr-rep pzr-skel" aria-busy="true" aria-label="Loading the stored rating">
      <div className="skeleton pzr-sk-hero" /><div className="pzr-sk-parts">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div><div className="skeleton pzr-sk-wf" /><div className="skeleton pzr-sk-fx" />
    </div>
  );
}

/** The one boxed disclaimer at the end of every Prism report. */
export const PRISM_DISCLAIMER = "This report describes the company's financial health from its filings and market prices, with estimates where information is missing. The FinLit Prism score is calculated from many parameters, and not all of them are shown in this report. It is not an investment recommendation or a prediction of future returns.";

export function PrismReportView({ report, actions = {}, example = false }: { report: PrismReport; actions?: ReportActions; example?: boolean }) {
  const review = prismReview(report), legacy = "legacy" in review && review.legacy;
  const income = incomeWord(report.rating.group);
  return (
    <article className={"pzr-rep" + (example ? " pzr-example" : "")} aria-label={`${PRISM_NAME} report for ${report.company.name}`}>
      {example && <p className="pzr-example-b" role="note"><b>Example</b> A fictional company, to show the layout. Not a real rating.</p>}
      <CardTop report={report} actions={actions} example={example} />
      {report.rating.dataIntegrityStatus === "REVIEW REQUIRED" && (
        <div className="pzr-caution" role="note"><Icon name="alert" /><span><b>Data check: review required.</b> {notRatedReason(report.rating) ?? "Some inputs could not be fully verified"} (see the review notes below). The caution does not change the score; read the result with it in mind.</span></div>
      )}
      {legacy && (
        <div className="pzr-caution" role="note"><Icon name="info" /><span>This stored report predates the reader commentary. <button type="button" className="pzr-link pzr-noprint" onClick={actions.onRecalculate}>Recalculate</button> for the full review.</span></div>
      )}
      <FactorExplorer report={report} review={review} />
      <Technical report={report} onRecalculate={actions.onRecalculate} />
      <section className="pzr-sec" aria-labelledby="pzr-h-hist">
        <header className="pzr-sh"><h3 id="pzr-h-hist">Financial history</h3><p>From the company's filings, on the same statement basis as the score.</p></header>
        <HistoryCharts report={report} />
        {report.financialHistory && <HistoryTables history={report.financialHistory} income={income} note={incomeNote(report.rating.group)} benchmark={report.benchmark} />}
      </section>
      <Peers report={report} />
      <Notes report={report} notes={review.notes} />
      <footer className="pzr-foot">
        <div className="pzr-disc" role="note" aria-labelledby="pzr-disc-h"><h4 id="pzr-disc-h">Disclaimer</h4>
          <p>{PRISM_DISCLAIMER}</p><p className="pzr-disc-n">{PRISM_NOTE} Information only, not investment advice.</p></div>
      </footer>
    </article>
  );
}
