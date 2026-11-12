// The four "Find stocks" pages as tabs (task #64, handover 11 Nov): Stock screener · Basic stock screener (Silver) · Advanced stock screener (Gold) · Query builder.
// Each page is its own plan, so there is no Basic | Advanced switch on a page: the tabs move between the pages.
import { Link, useLocation } from "react-router";
import "../../styles/presets.css";

const TABS: { to: string; label: string; plan?: "SILVER" | "GOLD" | "FREE" }[] = [
  { to: "/screener", label: "Stock screener" },
  { to: "/score-screener", label: "Basic stock screener", plan: "SILVER" },
  { to: "/advanced-score-screener", label: "Advanced stock screener", plan: "GOLD" },
  { to: "/query-builder", label: "Query builder", plan: "FREE" },
];

/** `bare`: no "Find stocks" label of its own, for a page whose head already says it (the Stock screener, file 04). */
export function FindStocksTabs({ bare = false }: { bare?: boolean }) {
  const { pathname } = useLocation();
  return (
    <nav className={"fst" + (bare ? " fst-bare" : "")} aria-label="Find stocks">
      {!bare && <span className="fst-k">Find stocks</span>}
      {TABS.map((t) => {
        const on = pathname === t.to || pathname === t.to + "/";
        return <Link key={t.to} to={t.to} className={"fst-t" + (on ? " on" : "")} aria-current={on ? "page" : undefined}>{t.label}{t.plan && <i className={"fst-p " + t.plan.toLowerCase()}>{t.plan}</i>}</Link>;
      })}
    </nav>
  );
}
