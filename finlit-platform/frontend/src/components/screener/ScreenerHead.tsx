// Task #243 (screeners update pack v4, 18 Nov 2026), section H: the three screener pages use the site's standard page header (`header.sp-head`, as on
// Sector Pulse and Results) in place of the old tab strip and head card:
//   eyebrow "Research · Find stocks" · the serif title with its tier pill (Gold on Advanced, none on the Stock screener) · the page's
//   description · three small plain boxes, one per screener, the current one filled · a head bar with the date chip, "How … works →" where the page has it,
//   and "Which screener should I use? →", which opens that question in the page's "Questions about this page".
// Task #283: the Basic stock screener is retired with its score, so every plan sees the same three boxes.
// Styles: styles/screeners243.css (xsh-), on the pack tokens of styles/sectors-pack.css. Describes the pages; never advice.
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { offeredTo } from "../../lib/nav";
import { useIsGold } from "../../lib/planGate";
import { faqForPath } from "../../lib/pageFaqs";
import { tabClass } from "../ui";
import { faqAnchor } from "../PageFaqs";
import { TierChip } from "../Gate";
import type { Plan } from "../../lib/ui";
import "../../styles/sectors-pack.css";
import "../../styles/screeners243.css";

export const SCREENERS: { to: string; label: string }[] = [
  { to: "/screener", label: "Stock screener" },
  { to: "/advanced-score-screener", label: "Advanced stock screener" },
  { to: "/query-builder", label: "Query builder" },
];
export const WHICH_Q = "Which screener should I use?";

/** Each page's description, shown in its header (pack H.3), in one line (founder, 22 Nov 2026). The open-screen view shows the same one. */
export const ADVANCED_DESC = "Every company's Prism score, its four health parts and two trend views: filter, sort, compare.";
export const STOCK_DESC = "Filter every listed company by size, valuation, growth, debt, ownership and price trend.";

/** The anchor of "Which screener should I use?" in this page's questions, or null when the page has no such question. */
export function whichAnchor(path: string): string | null {
  const set = faqForPath(path);
  const i = set ? set.items.findIndex((it) => it.q === WHICH_Q) : -1;
  return set && i >= 0 ? faqAnchor(set.id, i) : null;
}

/** The plain screener boxes (pack H, v2): the page name only, no icons, tier tags or colours. Task #310: the shared tabs (ui-tabs / ui-tab); the current page is
 *  marked aria-current="page", which gives it the one selected look. */
export function ScreenerBoxes() {
  const { pathname } = useLocation();
  const gold = useIsGold();
  return (
    <nav className="ui-tabs xsh-nav" aria-label="Screeners">
      {SCREENERS.filter(offeredTo(gold)).map((t) => {
        const on = pathname === t.to || pathname === t.to + "/";
        return <Link key={t.to} to={t.to} className={tabClass("xsh-box")} aria-current={on ? "page" : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}

export function ScreenerHead({ title, tier, desc, date, how, children }: {
  title: string; tier?: Plan | null; desc: ReactNode;
  /** The page's data date in words, for the chip in the head bar. */ date?: string | null;
  /** "How FinLit Prism works" and the like: opens the page's explainer, as today. */ how?: { label: string; open: () => void } | null;
  children?: ReactNode;
}) {
  const { pathname, search } = useLocation();
  const anchor = whichAnchor(pathname);
  return (
    <header className="sp sp-head xsh card" aria-labelledby="xsh-h1">
      <p className="sp-eyebrow">Research · Find stocks</p>
      <div className="xsh-h1"><h1 id="xsh-h1" className="ui-title">{title}</h1>{tier && tier !== "basic" ? <TierChip tier={tier} /> : null}</div>
      <p className="sp-desc">{desc}</p>
      <ScreenerBoxes />
      <div className="sp-head-bar xsh-bar">
        {date && <span className="xsh-date"><i aria-hidden="true" />{date}</span>}
        {how && <button type="button" className="sp-link xsh-link" onClick={how.open}>{how.label} →</button>}
        {anchor && <Link className="sp-link xsh-link" to={{ pathname, search, hash: anchor }}>{WHICH_Q} →</Link>}
        {children}
      </div>
    </header>
  );
}
