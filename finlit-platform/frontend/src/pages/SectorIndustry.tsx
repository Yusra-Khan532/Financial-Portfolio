// An industry page (/sectors/:slug) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/07, Finance): the header with its
// state, box and rank, What is happening, Where it is in the cycle, A year of <industry>, Against other industries, the counted stocks and Not counted. Every figure is the
// server's (GET /api/sectors/:slug, /api/sectors/:slug/year, /api/rotation/:slug); "Add to watch" saves the industry for its weekly Sector Rotation alerts. Never advice.
import { Link, useParams, useSearchParams } from "react-router";
import { useDocTitle } from "../lib/title";
import { failureText, useSectorPage, type Show } from "../lib/sectors";
import { useIndustryYear } from "../lib/sectorExtra";
import { useRotationCard } from "../lib/rotation";
import { short } from "../lib/pulsePack";
import { Blank } from "../components/sectors/Parts";
import { AgainstInd, CycleInd, Happening, IndustryHead, NotCountedInd, StocksInd, YearInd } from "../components/sectors/pack/IndustryPack";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import { sq, tw, useShowWords } from "../lib/groupWords";

const DISCLAIMER = tw("Describes price data for NSE industries; not a recommendation to buy, sell or hold any security. Sources: NSE daily files and industry classification; company sizes by FinLit's rule (Large above ₹75,000 Cr, Mid ₹25,000–75,000 Cr, Small ₹10,000–25,000 Cr, Micro below ₹10,000 Cr). Prices adjusted for splits, bonuses and rights.");

export function SectorIndustryPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const show: Show = params.get("show") === "sectors" ? "sectors" : "industries";     // a sector page of the Sectors view (task #192)
  useShowWords(show);
  const q = useSectorPage(slug, show), yq = useIndustryYear(slug, show), rq = useRotationCard(slug, true, show);
  const p = q.data, y = yq.data, rot = rq.data && rq.data.reading !== false ? rq.data : undefined;
  useDocTitle(p ? short(p.name) : tw("Industry"), p ? tw(`${short(p.name)} on NSE: what its stocks are doing, where it is in the cycle, a year of readings and how it compares with the other industries.`) : undefined);
  return (
    <div className="wrap sx sp ip" data-testid="sector-industry">
      {q.isLoading && <div className="sx-skel sp-sec" role="status" aria-label={tw("Loading the industry")} />}
      {q.isError && <div className="sp-sec"><Blank title={q.error?.status === 404 ? tw("No such industry") : tw("This industry is not available right now")} reason={failureText(q.error)}><Link className="btn" to={"/sectors" + sq()}>Back to Sector Pulse</Link></Blank></div>}
      {p && (
        <>
          <IndustryHead p={p} rot={rot} />
          <Happening p={p} y={y} rot={rot} />
          <CycleInd p={p} />
          {y && y.dates.length > 1 && <YearInd p={p} y={y} />}
          {rot && <AgainstInd p={p} rot={rot} />}
          <StocksInd p={p} />
          <NotCountedInd p={p} />
          <p className="sp-disclaimer">{tw(DISCLAIMER)}</p>
        </>
      )}
    </div>
  );
}
