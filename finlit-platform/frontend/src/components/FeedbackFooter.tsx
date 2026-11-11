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
