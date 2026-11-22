// Sector Pulse (/sectors) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/05 and 06): the pack's header with the Market
// backdrop, a Simple view and a Full table view (in the address: ?view=full). Every number is the server's (GET /api/sectors, /api/sector-history, /api/sector-map); what a
// plan does not include arrives null with its reason and is said in words. Describes price and breadth data; never advice. Styles: styles/sectors-pack.css.
import { PhoneFold } from "../components/PhoneFold";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useDocTitle } from "../lib/title";
import { groupsParen, groupsSplit } from "../lib/pulsePack";
import { PulseGuide, SectionsBar } from "../components/sectors/pack/Guide";
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
import { ByState, CountedAndSmall, Cycle, IndustryMapPack, Momentum, Mood, Standouts, TodayMinute, Words, YourIndustries } from "../components/sectors/pack/PulseSimple";
import { PulseTable, SixMonths, StandoutsFull, TooSmallFull } from "../components/sectors/pack/PulseTable";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import { showQuery } from "../lib/sectors";
import { tw, useShow, useShowWords } from "../lib/groupWords";

const TITLE = "Sector Pulse";
const DESC = tw("Which industries are being sold, which are bouncing back, and which are rising together? Every weekend we look at how many stocks in each industry were going up at Friday's close.");   // the page's search description
const HEAD_DESC = tw("Which industries are being sold, bouncing back or rising together, as of each Friday's close.");   // the header's one line (founder, 22 Nov 2026)
const DISCLAIMER = tw("Describes price data for NSE industries; not a recommendation to buy, sell or hold any security. Sources: NSE daily files and industry classification; company sizes by FinLit's rule (Large above ₹75,000 Cr, Mid ₹25,000–75,000 Cr, Small ₹10,000–25,000 Cr, Micro below ₹10,000 Cr). Prices adjusted for splits, bonuses and rights.");
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SectorPulsePage() {
  useDocTitle(TITLE, tw(DESC));
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "full" ? "full" : "simple";
  const setView = (v: View) => { const p = new URLSearchParams(params); if (v === "full") p.set("view", "full"); else p.delete("view"); setParams(p, { replace: true }); };
  const { show, setShow, ready, pending } = useShow();
  useShowWords(show);                                   // the words of every section below follow Show (task #192, S1)
  const q = useSectorBoard(show, ready), hq = useSectorHistory(show, ready), mq = useIndustryMap(show, ready);
  const { user } = useAuth();
  const held = usePortfolio().holdings;
  const symbols = useMemo(() => [...new Set(held.map((x) => x.symbol.toUpperCase()))], [held]);
  const key = [...symbols].sort().join(",");
  const mem = useQuery<{ groups: Record<string, { slug: string }> }, ApiError>({ queryKey: ["sectors", "membership", key, show], queryFn: () => apiGet(`/api/sectors/membership?symbols=${encodeURIComponent(key)}` + showQuery(show, false)), enabled: symbols.length > 0, staleTime: 3_600_000, retry: false });
  const mine = useMemo(() => new Set(Object.values(mem.data?.groups ?? {}).map((g) => g.slug)), [mem.data]);
  const b = q.data, h = hq.data;
  const d = b?.date ? new Date(b.date + "T00:00:00Z") : null;
  const meta = b ? <>Updated every weekend, to the close of {d ? `${WEEKDAY[d.getUTCDay()]} ${b.date_label ?? b.date}` : b.date} · {b.universe ? b.universe.counted_in_groups_with_reading.toLocaleString("en-IN") : b.stocks_counted.toLocaleString("en-IN")} actively traded stocks<Tip text="Only actively traded, established stocks are counted, so a few rarely traded names cannot swing the reading. The list is reviewed once a month." /> · {groupsSplit(b.rows)}, as NSE groups them<Tip text={show === "sectors" ? "Each group is one of NSE's 22 sectors, read with all its industries together. A sector with too few actively traded stocks for a steady reading is listed under Too small." : "Each group is an NSE industry with enough actively traded stocks for a steady reading; small industries of the same NSE sector are read together as one sector group."} /></> : null;
  return (
    <div className="wrap sx sp" data-testid="sector-pulse">
      <PackHead page="pulse" title={TITLE} desc={tw(HEAD_DESC)} meta={meta} view={view} onView={setView} industries={b?.rows ?? []} show={show} onShow={setShow}
        side={b ? <Backdrop pct={b.market?.pct_vs_200d ?? null} above={b.market?.above_200d ?? null} /> : null} />
      {pending && show === "industries" && <p className="sp-note sp-pending">{pending}</p>}
      {(q.isLoading || !ready) && <div className="sx-skel sp-sec" role="status" aria-label="Loading the sector readings" />}
      {q.isError && <div className="sp-sec"><Blank title={show === "sectors" ? "The Sectors view is not available right now" : "Sector Pulse is not available right now"} reason={failureText(q.error)}>
        <button type="button" className="btn" onClick={() => q.refetch()}>Try again</button>{show === "sectors" && <button type="button" className="btn" onClick={() => setShow("industries")}>Show industries</button>}</Blank></div>}
      {b && <PulseGuide stocks={b.universe?.counted_in_groups_with_reading ?? b.stocks_counted} groups={groupsParen(b.rows)} />}
      {b && <SectionsBar items={view === "simple" ? [
        { id: "sp-today", label: "Today" }, { id: "sp-cycle", label: "The cycle" }, { id: "sp-bystate", label: "By state" }, ...(mq.data ? [{ id: "sp-map", label: "Map" }] : []),
        ...(h ? [{ id: "sp-mood", label: "Market mood" }] : []), { id: "sp-momentum", label: "Momentum × strength" }, { id: "sp-yours", label: tw("Your industries") },
        { id: "sp-standouts", label: "Standout stocks" }, { id: b.universe ? "sp-counted" : "sp-small", label: "Counted / Too small" },
      ] : [
        { id: "sp-every", label: "Every number" }, ...(h ? [{ id: "sp-six", label: "Six months" }] : []), { id: "sp-stand-f", label: "Standout stocks" }, ...((b.too_few_stocks ?? []).length ? [{ id: "sp-small-f", label: "Too small" }] : []),
      ]} />}
      {b && view === "simple" && (
        <>
          <TodayMinute b={b} h={h} />
          <Cycle b={b} />
          {/* task #310 part E (05-phone.md, fix 6): on a phone the sections after the second start closed (name and one line); desktop unchanged */}
          <PhoneFold page="sectors" id="bystate" title="By state" line="Every group with a reading, grouped by its state today"><ByState b={b} mine={mine} /></PhoneFold>
          {mq.data && <PhoneFold page="sectors" id="map" title={tw("Industry map")} line={tw("Each industry as a dot: how many of its stocks are rising, and how far it is below its 1-year high")}><IndustryMapPack m={mq.data} /></PhoneFold>}
          {h && <PhoneFold page="sectors" id="mood" title="Market mood" line="How many groups were in each state, day by day"><Mood h={h} /></PhoneFold>}
          <PhoneFold page="sectors" id="momentum" title="Momentum × strength" line="The Sector Pulse state beside the Sector Rotation box"><Momentum b={b} mine={mine} /></PhoneFold>
          <PhoneFold page="sectors" id="yours" title={tw("Your industries")} line={tw("The industries of the shares in your portfolio, and how each is doing")}><YourIndustries b={b} h={h} symbols={symbols} signedIn={!!user} /></PhoneFold>
          <PhoneFold page="sectors" id="standouts" title="Standout stocks" line={tw("Stocks at a new 1-year high while their industry is well below its own")}><Standouts b={b} /></PhoneFold>
          <PhoneFold page="sectors" id="counted" title="Counted / Too small" line="Which stocks are counted, and the groups too small for a reading"><CountedAndSmall b={b} /></PhoneFold>
          <Words />
        </>
      )}
      {b && view === "full" && (
        <>
          <PulseTable b={b} h={h} mine={mine} />
          {h && <SixMonths h={h} />}
          <StandoutsFull b={b} />
          <TooSmallFull b={b} />
          <Words />
        </>
      )}
      {b && <p className="sp-disclaimer">{tw(DISCLAIMER)}</p>}
    </div>
  );
}
