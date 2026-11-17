// Tools row: Stress Lab (task #195, dashboard pack 15 Nov 2026: the half-width, mostly empty teaser is now one of four tool cards). The Stress Lab nightly run does not
// cover the member's stocks yet, so the card says so in one line instead of listing "Not covered yet" for each; nothing is estimated. Descriptive only.
import { Link } from "react-router";
import type { Followed } from "./MyStocks";

export function Stress({ followed, loading }: { followed: Followed[]; loading: boolean }) {
  const n = followed.length;
  return (
    <section className="dsh-card dsh-tool" aria-labelledby="dsh-stress">
      <span className="dsh-new">New</span>
      <h2 id="dsh-stress">Stress Lab</h2>
      <p className="dsh-p">How crude, rupee, inflation and rate shocks would move a company's earnings.{" "}
        {loading ? "" : n === 1 ? "Your stock is not in the nightly run yet." : n ? `None of your ${n} stocks is in the nightly run yet.` : "Follow stocks to see them here once the nightly run covers them."}</p>
      <Link className="dsh-link foot" to="/research/stress-lab">Open Stress Lab →</Link>
    </section>
  );
}
