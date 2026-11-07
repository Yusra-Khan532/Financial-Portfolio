// The top of a Prism report: the same two cards the company page shows ("Fundamental analysis" with the four weighted parts, and "Technical analysis"
// with the short- and long-term views), drawn by the same components (stock/PrismCardView) so the two pages can never drift apart. Above them, the company's name and its status words.
import { Link } from "react-router";
import { Icon } from "../../../lib/icons";
import { useAuth } from "../../../lib/auth";
import { PRISM_NAME, inputsLine, notRatedLede, statementWord, type PrismReport } from "../../../lib/prism";
import { parseTechnical } from "../../../lib/prismTechnical";
import { FundamentalSection, TechnicalSection } from "../../../stock/PrismCardView";
import { partsOf } from "../../../stock/PrismCompare";
import { STATUS, prismSummary, type PrismLatest } from "../../../stock/PrismCard";
import { LabelChip, StatusChip, istTime, type ReportActions } from "./Hero";
import "../../../styles/prism-compare.css";
import "../../../styles/prism-card.css";
import "../../../styles/prism-report.css";

const STATUS_NOTE: Record<PrismReport["rating"]["status"], string> = {
  RATED: "Enough of the data was available for a full rating.",
  PROVISIONAL: "Some data is missing or the record is short, so this is a first view and is shown at most as Healthy.",
  "NOT RATED": "The overall rating is withheld.",
};

const PLAN_WORD: Record<string, string> = { basic: "Basic member", silver: "Silver member", gold: "Gold member", bronze: "Bronze member" };
/** A short, stable reference for one calculation: FL-<first four letters of the symbol>-<day and month>-<four characters of its id>. */
export function reportRef(report: Pick<PrismReport, "id" | "company" | "createdAt">): string {
  const d = new Date(report.createdAt), dm = Number.isNaN(d.getTime()) ? "0000" : `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const sym = report.company.symbol.replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase();
  return `FL-${sym}-${dm}-${String(report.id).replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()}`;
}
/** The session, or null outside the auth provider (a static render or a preview). useAuth always reads the context before it can throw, so the hook order never changes. */
function useViewer(): ReturnType<typeof useAuth> | null {
  try { return useAuth(); } catch { return null; }
}
/** "Prepared for Pranjal · Gold member · Report FL-RELI-0611-7Q2K · for personal use" under the header. Nothing for a visitor. */
export function Viewer({ report }: { report: PrismReport }) {
  const auth = useViewer(), user = auth?.user, plan = auth?.plan ?? "basic";
  if (!user) return null;
  const who = user.name?.trim() || user.email.split("@")[0];
  return <p className="pzr-viewer">Prepared for <b>{who}</b> · {user.role === "admin" ? "Administrator" : PLAN_WORD[plan] ?? "Member"} · Report <b>{reportRef(report)}</b> · for personal use</p>;
}

export function CardTop({ report, actions, example = false }: { report: PrismReport; actions: ReportActions; example?: boolean }) {
  const r = report.rating, rep = report as unknown as PrismLatest;
  const { parts } = partsOf(r as unknown as PrismLatest["rating"]);
  const inp = inputsLine(r);
  return (
    <section className="pzr-cardtop" aria-label={`${PRISM_NAME} rating of ${report.company.name}`}>
      <header className="pzr-ct-h">
        <div>
          <h2>{report.company.name}</h2>
          <p className="pzr-ct-sub"><b>{report.company.symbol}</b> · {statementWord(report.statementType)} statements · Calculated {istTime(report.completedAt || report.createdAt)}</p>
          {!example && <Viewer report={report} />}
        </div>
        <div className="pzr-ct-chips"><StatusChip status={r.status} />{r.status !== "NOT RATED" && <LabelChip label={r.label} />}
          {actions.onRecalculate && <button type="button" className="btn" onClick={actions.onRecalculate} disabled={actions.recalculating}><Icon name="refresh" />{actions.recalculating ? "Recalculating…" : "Recalculate"}</button>}</div>
      </header>
      <div className="pcx-body" role="group" aria-label={prismSummary(r as unknown as PrismLatest["rating"])}>
        <FundamentalSection r={r as unknown as PrismLatest["rating"]} parts={parts}>
          <div className="dk-words">
            <div className="dk-chips"><span className={"pz-status " + r.status.toLowerCase().replace(" ", "-")}>{STATUS[r.status as PrismLatest["rating"]["status"]]}</span></div>
            {r.status !== "RATED" && <p className={"dk-note" + (r.status === "NOT RATED" ? " why" : "")}>{r.status === "NOT RATED" ? notRatedLede(r) : STATUS_NOTE[r.status]}</p>}
            <p className={"dk-cov" + (inp.ok ? "" : " held")}><Icon name={inp.ok ? "check" : "info"} />{inp.text}{inp.note ? <span className="dk-cov-n"> · {inp.note}</span> : null} · <Link to="/glossary#coverage-prism">what this means</Link></p>
          </div>
        </FundamentalSection>
        <TechnicalSection a={parseTechnical(report.technicalAssessment)} report={rep} onRecalculate={actions.onRecalculate} busy={actions.recalculating} />
      </div>
    </section>
  );
}
