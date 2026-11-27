import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { useAuthMaybe } from "../lib/auth";
import { apiGet, type SearchIndex } from "../lib/api";
import { GoLiveMarkup } from "../landing/GoLiveMarkup";
import { initGoLive } from "../landing/golive";
import "../styles/human-home.css";
import "../styles/explore-tools.css";
import "../styles/prism-showcase.css";
import "../styles/mf-showcase.css";
import "../landing/golive.css";

/** On a phone (mobile-app.css shows it under 860px only): the landing's first doors. A member sees "Continue to your dashboard" first; everyone sees
 *  the three places people start most (Markets today, a company, the screener). Owner, 25 Nov 2026: open on the landing, go on from there. */
function PhoneDoors() {
  const user = useAuthMaybe()?.user;
  return (
    <div className="ma-doors">
      {user && <Link to="/dashboard" className="ma-door ma-door--me"><span className="ma-door-i"><Icon name="table" /></span><span className="ma-door-t"><b>Continue to your dashboard</b><small>{user.name ? `Welcome back, ${user.name.split(" ")[0]}` : "Welcome back"}: your stocks, alerts and portfolio</small></span><Icon name="arrow" /></Link>}
      <nav className="ma-door-row" aria-label="Start here">
        <Link to="/markets" className="ma-door-s"><Icon name="activity" /><span>Markets today</span></Link>
        <Link to="/research" className="ma-door-s"><Icon name="search" /><span>Find a company</span></Link>
        <Link to="/screener" className="ma-door-s"><Icon name="table" /><span>Screener</span></Link>
      </nav>
    </div>
  );
}

type QuoteRows = { fields: string[]; rows: (string | number | null)[][] };

/** Task #407: the landing page from the team's go-live pack (finlit-landing-golive-26nov.zip, 26 Nov 2026): hero with a company check and the product
 *  tour, "Six areas. 40 tools.", FinLit Scores (Prism and Mutual Fund Score), "Where would you like to begin?", the plans and the closing line. The
 *  markup is in landing/GoLiveMarkup.tsx; its interactive parts are run by landing/golive.js on the site's own data. */
export function Home() {
  useDocTitle("Research deeper. Invest with clarity.", "Explore statistical scoring models, customizable analytical tools, comprehensive company reports, sector insights and much more for every listed Indian company, all in one platform. Information only, not investment advice.");
  const navigate = useNavigate();
  const qc = useQueryClient();
  // the tour for the theme the page opens in, so only one recording loads (the pack: the dark recording on the light page, the light one on the dark)
  const [tour] = useState(() => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
    ? { src: "/landing/finlit-tour-light-720p.mp4", poster: "/landing/golive/tour-poster.jpg" }
    : { src: "/landing/finlit-tour-dark-720p.mp4", poster: "/landing/golive/tour-dark-poster.jpg" }));
  useEffect(() => initGoLive({
    navigate: (to: string) => { void navigate(to); },
    // the same cached list as the header search (lib/api useSearchIndex)
    searchIndex: () => qc.fetchQuery({ queryKey: ["search-index"], queryFn: () => apiGet<SearchIndex>("/api/stocks/search-index"), staleTime: 3_600_000 }),
    quote: async (symbol: string) => {
      const q = await apiGet<QuoteRows>(`/api/search/quotes?symbols=${encodeURIComponent(symbol)}`);
      const row = q.rows.find((r) => r[q.fields.indexOf("symbol")] === symbol);
      if (!row) return null;
      const at = (f: string) => row[q.fields.indexOf(f)];
      return { price: (at("price") as number | null) ?? null, changePct: (at("changePct") as number | null) ?? null, priceDate: (at("priceDate") as string | null) ?? null };
    },
  }), [navigate, qc]);
  return <GoLiveMarkup doors={<PhoneDoors />} tour={tour} />;
}
