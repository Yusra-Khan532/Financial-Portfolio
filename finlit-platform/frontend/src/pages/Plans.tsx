// Task #410 (owner, 27 Nov 2026): /plans shows the plans on sale exactly as the landing page does, from the same data (landing/goliveData.js: PLANS,
// COMBINED) through the same table code (landing/golive.js): every plan, price, tool, part and limit, the combined plan, the add-ons and "About these
// plans", with one plan at a time on a phone. Nothing on this page is a copied number. Payments are not live yet, so the buttons say what happens today:
// a visitor creates a free account; a member asks for a plan from the account page and the team switches it on.
import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { planName } from "../lib/planNames";
import { planOffers, rupees } from "../lib/planOffer";
import { useDocTitle } from "../lib/title";
import { GoLiveCompare } from "../landing/GoLiveMarkup";
import { initGoLive } from "../landing/golive";
import "../landing/golive.css";
import "../styles/plans410.css";

/** The page's description for search engines and link previews, from the plan data. Exported for tests. */
export function plansDescription(): string {
  const paid = planOffers().filter((o) => o.yearly);
  return `FinLit plans: Free to start. ${paid.map((o) => `${o.name} ${rupees(o.yearly)} a year`).join(", ")}. Prices before GST. Payments are not live yet. Information only, not investment advice.`;
}

export function PlansPage() {
  useDocTitle("Plans and prices", plansDescription());
  const navigate = useNavigate();
  const { user, planKey } = useAuth();
  // the landing page's plan table, filled from the same data; the company check and the recordings are not on this page, so their parts do nothing
  useEffect(() => initGoLive({
    navigate: (to: string) => { void navigate(to); },
    searchIndex: () => Promise.resolve({ rows: [] }),
    quote: () => Promise.resolve(null),
  }), [navigate]);
  return (
    <div className="pl410">
      <GoLiveCompare heading={<><h1 className="ui-title ui-title--marketing" id="plans-title">Plans and prices. <em>Start free.</em></h1>
        <p className="pl410-lede">Free to start; Mutual Fund + ETF and Equity Portfolio open one area each; Gold and Platinum open everything.</p></>} />
      <section className="sec pl410-now" aria-label="Your plan">
        <div className="wrap">
          {user
            ? <p><b>Your plan: {planName(planKey)}.</b> Payments are not live yet: <Link to="/account/plan">ask for a plan from your account</Link> and the FinLit team switches it on and confirms by email.</p>
            : <p><b>Start on Free, no card needed.</b> Payments are not live yet: <Link to="/login?mode=signup">create a free account</Link>, then ask for a plan from your account; the FinLit team switches it on and confirms by email.</p>}
          <p className="pl410-fine">Prices are yearly and before GST; the monthly figure is the yearly price spread over 12 months. Features and limits can change. Information only, not investment advice.</p>
        </div>
      </section>
    </div>
  );
}
