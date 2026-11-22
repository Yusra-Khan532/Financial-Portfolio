// Task #310 part D (04-navigation.md, "Page tabs"): sibling pages as the shared tabs (ui-tabs / ui-tab), directly under the title block and left-aligned.
// The current page is marked aria-current="page", which gives it the one selected look (--ui-on-bg / --ui-on-fg in ui.css). The sets live in lib/nav.ts.
import { NavLink } from "react-router";
import { SIBLINGS } from "../lib/nav";
import { tabClass } from "./ui";

export function PageTabs({ set, keep = "", className }: { set: keyof typeof SIBLINGS; /** a query string the links carry (Sector pages keep ?show=) */ keep?: string; className?: string }) {
  const s = SIBLINGS[set];
  return (
    <nav className={"ui-tabs page-tabs" + (className ? " " + className : "")} aria-label={s.label}>
      {s.items.map((it) => <NavLink key={it.to} to={it.to + keep} end className={tabClass()}>{it.label}</NavLink>)}
    </nav>
  );
}
