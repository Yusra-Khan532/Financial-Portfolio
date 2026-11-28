// Sector Pulse (/sectors) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/05 and 06): the pack's header with the Market
// backdrop, a Simple view and a Full table view (in the address: ?view=full). Every number is the server's (GET /api/sectors, /api/sector-history, /api/sector-map); what a
// plan does not include arrives null with its reason and is said in words. Describes price and breadth data; never advice. Styles: styles/sectors-pack.css.
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useDocTitle } from "../lib/title";
import { allSectors, groupsN, groupsParen, groupsSplit, sectorsIn } from "../lib/pulsePack";
import { PulseGuide } from "../components/sectors/pack/Guide";
import { PhoneFold } from "../components/PhoneFold";
import { SxBox, SxFold, SxNav } from "../components/sectors/pack/PulseLayout";
import { InsideSector, PriceVsResults, WhatNext } from "../components/sectors/pack/PulseChecks";
import { MoodWeeks, SectorMap } from "../components/sectors/pack/PulseMap";
import { useAuth } from "../lib/auth";
import { usePortfolio } from "../lib/portfolio";
import { failureText, useSectorBoard } from "../lib/sectors";
import { useSectorHistory } from "../lib/sectorHistory";
import { useIndustryMap } from "../lib/sectorExtra";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../lib/api";
import { Blank } from "../components/sectors/Parts";
import { Tip, WhyFold, useFirstVisit } from "../components/sectors/pack/Common";
import { Backdrop, PackHead, type View } from "../components/sectors/pack/PulseHead";
import { ByState, CountedAndSmall, Cycle, Momentum, Standouts, TodayMinute, Words, YourIndustries } from "../components/sectors/pack/PulseSimple";
import { FullCards, PulseTable, SixMonths, StandoutsFull, TooSmallFull } from "../components/sectors/pack/PulseTable";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/sector-pages.css";
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
  const firstVisit = useFirstVisit("sector-pulse");   // task #333 (fix 3): "Why it matters" opens on a member's first visit, closed after
  const d = b?.date ? new Date(b.date + "T00:00:00Z") : null;
  // task #310 F (05-phone.md, fix 6): a closed section's one line carries its live figure where the section already has it
  const foldLine = useMemo(() => {
    const flags = b?.leader_flags, u = b?.universe, few = b?.too_few_stocks ?? [];
    return {
      standouts: flags == null ? tw("Stocks at a new 1-year high while their industry is well below its own")
        : !flags.length ? tw("No stock is at a new 1-year high inside a weak industry today")
        : tw(`${flags.length.toLocaleString("en-IN")} ${flags.length === 1 ? "stock" : "stocks"} at a new 1-year high while their industry is well below its own`),
      counted: u ? tw(`${u.counted_in_groups_with_reading.toLocaleString("en-IN")} stocks counted · ${groupsN(few.length)} too small for a reading`)
        : "Which stocks are counted, and the groups too small for a reading",
    };
  }, [b]);
  const meta = b ? <>Updated every weekend, to the close of {d ? `${WEEKDAY[d.getUTCDay()]} ${b.date_label ?? b.date}` : b.date} · {b.universe ? b.universe.counted_in_groups_with_reading.toLocaleString("en-IN") : b.stocks_counted.toLocaleString("en-IN")} actively traded stocks<Tip text="Only actively traded, established stocks are counted, so a few rarely traded names cannot swing the reading. The list is reviewed once a month." /> · {show === "sectors" && b.rows.length && b.rows.every((r) => r.kind === "sector") ? `NSE's ${sectorsIn(b)} sectors: ${b.rows.length} with a reading, ${sectorsIn(b) - b.rows.length} too small for one` : `${groupsSplit(b.rows)}, as NSE groups them`}<Tip text={show === "sectors" ? "Each group is one of NSE's 22 sectors, read with all its industries together. A sector with too few actively traded stocks for a steady reading is listed under Too small." : "Each group is an NSE industry with enough actively traded stocks for a steady reading; small industries of the same NSE sector are read together as one sector group."} /></> : null;
  const n = b?.rows.length ?? 0, sectorsView = show === "sectors";
  const allLabel = sectorsView ? allSectors(n, sectorsIn(b)) : `All ${n} groups`;   // task #436: "19 of the 22 sectors"          // final check 2: the Industries view's 38 are 33 industries and 5 sector groups
  return (
    <div className={"wrap sx sp sx-new" + (view === "full" ? " sx-full" : "")} data-testid="sector-pulse">
      <PackHead page="pulse" title={TITLE} desc={tw(HEAD_DESC)} meta={meta} view={view} onView={setView} industries={b?.rows ?? []} show={show} onShow={setShow}
        side={b ? <Backdrop pct={b.market?.pct_vs_200d ?? null} above={b.market?.above_200d ?? null} /> : null} />
      {pending && show === "industries" && <p className="sp-note sp-pending">{pending}</p>}
      {(q.isLoading || !ready) && <div className="sx-skel sp-sec" role="status" aria-label="Loading the sector readings" />}
      {q.isError && <div className="sp-sec"><Blank title={show === "sectors" ? "The Sectors view is not available right now" : "Sector Pulse is not available right now"} reason={failureText(q.error)}>
        <button type="button" className="btn" onClick={() => q.refetch()}>Try again</button>{show === "sectors" && <button type="button" className="btn" onClick={() => setShow("industries")}>Show industries</button>}</Blank></div>}
      {b && <PulseGuide stocks={b.universe?.counted_in_groups_with_reading ?? b.stocks_counted} groups={groupsParen(b.rows)} />}
      {/* task #333 (file 30): the section bar, frozen under the site header, every stop with its real name (Simple); the Full table has its own frozen box bar */}
      {b && view === "simple" && <SxNav items={[
        { id: "sx-today", label: "Today" }, { id: "sx-yours", label: tw("Your industries") }, { id: "sx-all", label: allLabel }, { id: "sx-chk", label: "Price checks" }, { id: "sx-inside", label: tw("Inside an industry") },
        { id: "sx-standouts", label: "Standout stocks" }, { id: "sx-counted", label: "Stocks counted" }, { id: "sx-words", label: "Words explained" },
      ]} />}
      {b && view === "simple" && (
        <WhyFold.Provider value={firstVisit}>
          <TodayMinute b={b} h={h} mine={mine} />
          <YourIndustries b={b} h={h} symbols={symbols} signedIn={!!user} />
          {/* task #333 follow-up: on a phone (860 px and under) the sections after the second start closed, as task #310 fix 6 had them; the section bar opens one */}
          <PhoneFold page="sectors" id="all" title={allLabel} line="By state · Map · Over time">
          <SxBox id="sx-all" store="finlit-sx-box-all" param="tab" label={allLabel} sub="3 ways to look · press one" tabs={[
            { key: "state", label: "By state", content: <ByState b={b} mine={mine} /> },
            { key: "map", label: "Map", content: mq.data ? <SectorMap m={mq.data} b={b} mine={mine} /> : <div className="sp-sec"><p className="sp-empty">{mq.isLoading ? "Loading the map…" : tw("The map is not available right now.")}</p></div> },
            { key: "time", label: "Over time", content: h ? <MoodWeeks h={h} /> : <div className="sp-sec"><p className="sp-empty">{hq.isLoading ? "Loading the history…" : "The history is not available right now."}</p></div> },
          ]} />
          </PhoneFold>
          <PhoneFold page="sectors" id="chk" title="Three checks on the price picture" line={tw("Against other industries · Against results · What happened next")}>
          <SxBox id="sx-chk" store="finlit-sx-box-chk" label="Three checks on the price picture" sub="press one" tabs={[
            { key: "others", label: tw("Against other industries"), content: <Momentum b={b} mine={mine} /> },
            { key: "results", label: "Against results", isNew: true, content: <PriceVsResults b={b} mine={mine} /> },
            { key: "next", label: "What happened next", isNew: true, content: <div><Cycle b={b} /><WhatNext /></div> },
          ]} />
          </PhoneFold>
          <PhoneFold page="sectors" id="inside" title={tw("Inside an industry")} line={tw("Its 12 strongest stocks, with FinLit Prism")}>
          <InsideSector b={b} mine={mine} symbols={symbols} />
          </PhoneFold>
          <SxFold id="sx-standouts" title={tw("Standout stocks in weak industries")} line={foldLine.standouts}><Standouts b={b} mine={mine} /></SxFold>
          <SxFold id="sx-counted" title="Which stocks are counted, and what is too small for a reading" line={foldLine.counted}><CountedAndSmall b={b} /></SxFold>
          <Words line="Every term on this page, in plain English." />
        </WhyFold.Provider>
      )}
      {b && view === "full" && (
        <WhyFold.Provider value={firstVisit}>
          {/* task #333 (file 30, Full table): two callouts, then one box with a switch (its bar is the frozen one), then the closed row "Too small for a reading" */}
          <FullCards b={b} h={h} />
          <SxBox id="sx-full" store="finlit-sx-box-full" label={allLabel} sub="3 ways to look · press one" tabs={[
            { key: "every", label: "Every number", content: <PulseTable b={b} h={h} mine={mine} /> },
            ...(h ? [{ key: "six", label: "Six months, week by week", content: <SixMonths h={h} /> }] : []),
            { key: "standouts", label: `Standout stocks${b.leader_flags ? ` (${b.leader_flags.length})` : ""}`, content: <StandoutsFull b={b} /> },
          ]} />
          {(b.too_few_stocks ?? []).length > 0 && <SxFold id="sx-small-f" title="Too small for a reading" line={tw(`${groupsSplit(b.too_few_stocks ?? [])} have too few actively traded stocks for a steady reading.`)}><TooSmallFull b={b} inFold /></SxFold>}
          <Words line="Every term on this page, in plain English." />
        </WhyFold.Provider>
      )}
      {b && <p className="sp-disclaimer">{tw(DISCLAIMER)}</p>}
    </div>
  );
}
