// An industry page (/sectors/:slug) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/07, Finance): the header with its
// state, box and rank, What is happening, Where it is in the cycle, A year of <industry>, Against other industries, the counted stocks and Not counted. Every figure is the
// server's (GET /api/sectors/:slug, /api/sectors/:slug/year, /api/rotation/:slug); "Add to watch" saves the industry for its weekly Sector Rotation alerts. Never advice.
import { Link, useParams } from "react-router";
import { useDocTitle } from "../lib/title";
import { failureText, useSectorPage } from "../lib/sectors";
import { useIndustryYear } from "../lib/sectorExtra";
import { useRotationCard } from "../lib/rotation";
import { short } from "../lib/pulsePack";
import { Blank } from "../components/sectors/Parts";
import { AgainstInd, CycleInd, Happening, IndustryHead, NotCountedInd, StocksInd, YearInd } from "../components/sectors/pack/IndustryPack";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";

const DISCLAIMER = "Describes price data for NSE industries; not a recommendation to buy, sell or hold any security. Sources: NSE daily files and industry classification; company sizes by FinLit's rule (Large above ₹50,000 Cr, Mid ₹10,000–50,000 Cr, Small below ₹10,000 Cr). Prices adjusted for splits, bonuses and rights.";

export function SectorIndustryPage() {
  const { slug = "" } = useParams();
  const q = useSectorPage(slug), yq = useIndustryYear(slug), rq = useRotationCard(slug, true);
  const p = q.data, y = yq.data, rot = rq.data && rq.data.reading !== false ? rq.data : undefined;
  useDocTitle(p ? short(p.name) : "Industry", p ? `${short(p.name)} on NSE: what its stocks are doing, where it is in the cycle, a year of readings and how it compares with the other industries.` : undefined);
  return (
    <div className="wrap sx sp ip" data-testid="sector-industry">
      {q.isLoading && <div className="sx-skel sp-sec" role="status" aria-label="Loading the industry" />}
      {q.isError && <div className="sp-sec"><Blank title={q.error?.status === 404 ? "No such industry" : "This industry is not available right now"} reason={failureText(q.error)}><Link className="btn" to="/sectors">Back to Sector Pulse</Link></Blank></div>}
      {p && (
        <>
          <IndustryHead p={p} rot={rot} />
          <Happening p={p} y={y} rot={rot} />
          <CycleInd p={p} />
          {y && y.dates.length > 1 && <YearInd p={p} y={y} />}
          {rot && <AgainstInd p={p} rot={rot} />}
          <StocksInd p={p} />
          <NotCountedInd p={p} />
          <p className="sp-disclaimer">{DISCLAIMER}</p>
        </>
      )}
    </div>
  );
}
