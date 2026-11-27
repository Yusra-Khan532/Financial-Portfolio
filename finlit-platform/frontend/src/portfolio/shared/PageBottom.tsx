// Task #388 (developer file 38, E1; SHARED.md SP11): one bottom for the portfolio pages, built once so the ETF, MF and All my investments pages can use it
// too (developer files 39–41; today only the Equity portfolio does). In this order, full column width, 18 px apart, both folds closed on arrival:
//   1. "Questions about this page · N": the shared Questions box (section#faq.pfq) in its folded form (details.pfq-fold.pfq-card) at every width; open,
//      it lists the page's questions as before. A #faq or #faq-<set>-<n> address opens it.
//   2. "Disclaimer · What this page is, and is not": the site's fold (details.sp-sec.sp-fold), the page's disclaimer text unchanged inside.
//   3. The sources line (small, centred), with the page's own text.
// Classes: pgb- (shared.css). Describes; never advice.
import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { PageFaqs } from "../../components/PageFaqs";
import type { PageFaq } from "../../content/pageFaqs";
import { PortfolioDisclaimer } from "../../components/PortfolioDisclaimer";
import { VisitFold, useVisitFold } from "./VisitFold";

export type BottomKind = Exclude<Parameters<typeof PortfolioDisclaimer>[0]["kind"], "all">;

/** Task #391 (developer file 41 v4, E2), optional and only for All my investments: `faq` the page's own questions (it has no set in the address list),
 *  `disclaimer` its own disclaimer paragraphs (no `kind`). Without them the bottom is exactly as before. */
export function PageBottom({ kind, sources, faq: own, disclaimer }: { kind?: BottomKind; sources: ReactNode; faq?: PageFaq; disclaimer?: ReactNode }) {
  const [faq, setFaq] = useVisitFold("pgb-faq");
  const { hash } = useLocation();
  useEffect(() => { if (hash.startsWith("#faq")) setFaq(true); }, [hash, setFaq]);
  return (
    <div className="pgb">
      <PageFaqs fold={{ open: faq, onOpen: setFaq }} faq={own} />
      <VisitFold id="pgb-disc" className="pgb-disc" title={<b className="sp-ft">Disclaimer</b>} line="What this page is, and is not">{disclaimer !== undefined ? <PortfolioDisclaimer kind="all">{disclaimer}</PortfolioDisclaimer> : <PortfolioDisclaimer kind={kind} />}</VisitFold>
      <p className="mfp-foot pgb-src">{sources}</p>
    </div>
  );
}
