// Sector Pulse (/sectors) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/05 and 06): the pack's header with the Market
// backdrop, a Simple view and a Full table view (in the address: ?view=full). Every number is the server's (GET /api/sectors, /api/sector-history, /api/sector-map); what a
// plan does not include arrives null with its reason and is said in words. Describes price and breadth data; never advice. Styles: styles/sectors-pack.css.
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useDocTitle } from "../lib/title";
import { useAuth } from "../lib/auth";
import { usePortfolio } from "../lib/portfolio";
import { failureText, useSectorBoard } from "../lib/sectors";
import { useSectorHistory } from "../lib/sectorHistory";
import { useIndustryMap } from "../lib/sectorExtra";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../lib/api";
import { Blank } from "../components/sectors/Parts";
import { Tip } from "../components/sectors/pack/Common";
import { Backdrop, PackHead, type View } from "../components/sectors/pack/PulseHead";
import { ByState, CountedAndSmall, Cycle, HowToRead, IndustryMapPack, Momentum, Mood, Standouts, TodayMinute, Words, YourIndustries } from "../components/sectors/pack/PulseSimple";
import { PulseTable, SixMonths, StandoutsFull, TooSmallFull } from "../components/sectors/pack/PulseTable";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";

const TITLE = "Sector Pulse";
const DESC = "Which industries are being sold, which are bouncing back, and which are rising together? Every evening we look at how many stocks in each industry are going up.";
const DISCLAIMER = "Describes price data for NSE industries; not a recommendation to buy, sell or hold any security. Sources: NSE daily files and industry classification; company sizes by FinLit's rule (Large above ₹50,000 Cr, Mid ₹10,000–50,000 Cr, Small below ₹10,000 Cr). Prices adjusted for splits, bonuses and rights.";
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SectorPulsePage() {
  useDocTitle(TITLE, DESC);
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "full" ? "full" : "simple";
  const setView = (v: View) => { const p = new URLSearchParams(params); if (v === "full") p.set("view", "full"); else p.delete("view"); setParams(p, { replace: true }); };
  const q = useSectorBoard(), hq = useSectorHistory(), mq = useIndustryMap();
  const { user } = useAuth();
  const held = usePortfolio().holdings;
  const symbols = useMemo(() => [...new Set(held.map((x) => x.symbol.toUpperCase()))], [held]);
  const key = [...symbols].sort().join(",");
  const mem = useQuery<{ groups: Record<string, { slug: string }> }, ApiError>({ queryKey: ["sectors", "membership", key], queryFn: () => apiGet(`/api/sectors/membership?symbols=${encodeURIComponent(key)}`), enabled: symbols.length > 0, staleTime: 3_600_000, retry: false });
  const mine = useMemo(() => new Set(Object.values(mem.data?.groups ?? {}).map((g) => g.slug)), [mem.data]);
  const b = q.data, h = hq.data;
  const d = b?.date ? new Date(b.date + "T00:00:00Z") : null;
  const meta = b ? <>After the close, {d ? `${WEEKDAY[d.getUTCDay()]} ${b.date_label ?? b.date}` : b.date} · {b.universe ? b.universe.counted_in_groups_with_reading.toLocaleString("en-IN") : b.stocks_counted.toLocaleString("en-IN")} actively traded stocks<Tip text="Only actively traded, established stocks are counted, so a few rarely traded names cannot swing the reading. The list is reviewed once a month." /> · {b.rows.length} industries, as NSE groups them</> : null;
  return (
    <div className="wrap sx sp" data-testid="sector-pulse">
      <PackHead page="pulse" title={TITLE} desc={DESC} meta={meta} view={view} onView={setView} industries={b?.rows ?? []}
        side={b ? <Backdrop pct={b.market?.pct_vs_200d ?? null} above={b.market?.above_200d ?? null} /> : null} />
      {q.isLoading && <div className="sx-skel sp-sec" role="status" aria-label="Loading the sector readings" />}
      {q.isError && <div className="sp-sec"><Blank title="Sector Pulse is not available right now" reason={failureText(q.error)}><button type="button" className="btn" onClick={() => q.refetch()}>Try again</button></Blank></div>}
      {b && view === "simple" && (
        <>
          <HowToRead />
          <TodayMinute b={b} h={h} />
          {h && <Mood h={h} />}
          <YourIndustries b={b} h={h} symbols={symbols} signedIn={!!user} />
          <Cycle b={b} />
          <ByState b={b} mine={mine} />
          {mq.data && <IndustryMapPack m={mq.data} />}
          <Momentum b={b} mine={mine} />
          <Standouts b={b} />
          <CountedAndSmall b={b} />
          <Words />
        </>
      )}
      {b && view === "full" && (
        <>
          <PulseTable b={b} h={h} mine={mine} />
          <TooSmallFull b={b} />
          <StandoutsFull b={b} />
          {h && <SixMonths h={h} />}
          <Words />
        </>
      )}
      {b && <p className="sp-disclaimer">{DISCLAIMER}</p>}
    </div>
  );
}
