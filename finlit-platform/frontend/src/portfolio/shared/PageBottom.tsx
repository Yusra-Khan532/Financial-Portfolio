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
import { PortfolioDisclaimer } from "../../components/PortfolioDisclaimer";
import { VisitFold, useVisitFold } from "./VisitFold";

export type BottomKind = Parameters<typeof PortfolioDisclaimer>[0]["kind"];

export function PageBottom({ kind, sources }: { kind: BottomKind; sources: ReactNode }) {
  const [faq, setFaq] = useVisitFold("pgb-faq");
  const { hash } = useLocation();
  useEffect(() => { if (hash.startsWith("#faq")) setFaq(true); }, [hash, setFaq]);
  return (
    <div className="pgb">
      <PageFaqs fold={{ open: faq, onOpen: setFaq }} />
      <VisitFold id="pgb-disc" className="pgb-disc" title={<b className="sp-ft">Disclaimer</b>} line="What this page is, and is not"><PortfolioDisclaimer kind={kind} /></VisitFold>
      <p className="mfp-foot pgb-src">{sources}</p>
    </div>
  );
}
