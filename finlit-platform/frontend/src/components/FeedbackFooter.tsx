// A quiet "tell us what to improve" block at the bottom of every report and dashboard page (task #67). It opens the full feedback page.
import { Link } from "react-router";
import { Icon } from "../lib/icons";

export function FeedbackFooter({ what = "report" }: { what?: "report" | "dashboard" }) {
  return (
    <aside className="fbf" aria-label="Feedback">
      <span className="fbf-i" aria-hidden="true"><Icon name="chat" /></span>
      <div><b>{what === "dashboard" ? "How is your dashboard working for you?" : "Was this report useful?"}</b><p>Tell us what is missing, unclear or wrong. It takes 3 to 5 minutes and goes only to the FinLit team.</p></div>
      <Link className="btn primary" to="/feedback">Open the feedback page <Icon name="arrow" /></Link>
    </aside>
  );
}

/** Which pages get the block (task #67): every page of every report, and every page of the dashboard area. One place decides, so a new report page gets it without any edit. */
const REPORTS = [/^\/stocks\/[^/]+/, /^\/prism\/[^/]+/, /^\/premium(\/|$)/, /^\/outlook\/[^/]+/, /^\/research\/stress-lab\/[^/]+/, /^\/dcf(\/|$)/, /^\/compare(\/|$)/, /^\/funds\/(?!screener|compare|insights)[^/]+$/, /^\/diversification(\/|$)/];
const DASHBOARD = /^\/(dashboard|portfolio|watchlist|mf-portfolio)(\/|$)/;
export const feedbackKind = (path: string): "report" | "dashboard" | null => (DASHBOARD.test(path) ? "dashboard" : REPORTS.some((r) => r.test(path)) ? "report" : null);
export function FeedbackFooterFor({ path }: { path: string }) { const k = feedbackKind(path); return k ? <div className="wrap"><FeedbackFooter what={k} /></div> : null; }
