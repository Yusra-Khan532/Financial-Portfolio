// All tools (docs/MOBILE-APP.md): every tool by group, from lib/nav.ts, so a tool added to the menus appears here too. The Discover tab's last chip and
// the end of the Tools button's list on a phone; a plain page on a computer. Gold tools carry their tag and stay visible (they open their unlock card).
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { TOOL_GROUPS } from "../lib/mobileNav";
import { isNew, offeredTo } from "../lib/nav";
import { useIsGold } from "../lib/planGate";
import { useDocTitle } from "../lib/title";
import "../styles/all-tools.css";

export function AllToolsPage() {
  useDocTitle("All tools", "Every FinLit screener, company report, chart and calculator, by what it is for.");
  const gold = useIsGold();
  return (
    <div className="atl wrap">
      <div className="atl-h"><h1 className="ui-title">All tools</h1><p>Every screener, report, chart and calculator on FinLit, by what it is for.</p></div>
      {TOOL_GROUPS.map((g) => (
        <section key={g.title} className="atl-g" aria-label={g.title}>
          <h2>{g.title}</h2>
          <div className="atl-grid">
            {g.items.filter(offeredTo(gold)).map((it) => (
              <Link key={it.to} to={it.to} className="atl-t">
                <span className="atl-i"><Icon name={it.icon} /></span><b>{it.label}</b>
                {it.gold ? <em className="atl-tag gold">Gold</em> : isNew(it) ? <em className="atl-tag new">New</em> : null}
              </Link>
            ))}
          </div>
        </section>
      ))}
      <p className="atl-disc">Information only, not investment advice. FinLit describes companies and markets; it does not recommend.</p>
    </div>
  );
}
export default AllToolsPage;
