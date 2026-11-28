// Sector Pulse (/sectors) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/05 and 06): the pack's header with the Market
// backdrop, a Simple view and a Full table view (in the address: ?view=full). Every number is the server's (GET /api/sectors, /api/sector-history, /api/sector-map); what a
// plan does not include arrives null with its reason and is said in words. Describes price and breadth data; never advice. Styles: styles/sectors-pack.css.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useDocTitle } from "../lib/title";
import { allSectors, groupsParen, groupsSplit, sectorsLine } from "../lib/pulsePack";
import { PulseGuide } from "../components/sectors/pack/Guide";
import { SxBox } from "../components/sectors/pack/PulseLayout";
import { Steps } from "../components/sectors/pack/Steps";
import { useWatchlist } from "../lib/watchlist";
import { ForYouCard, usePeerLabels } from "../components/sectors/pack/YourSectors";
import type { HeldShare } from "../lib/yourSectors";
import { quoteMap } from "../lib/globalSearch";
import { WORD } from "../lib/pulsePack";
import { InsideSector, PriceVsResults, WhatNext } from "../components/sectors/pack/PulseChecks";
import { MoodWeeks, SectorMap } from "../components/sectors/pack/PulseMap";
import { useAuth } from "../lib/auth";
import { usePortfolio } from "../lib/portfolio";
import { failureText, useSectorBoard } from "../lib/sectors";
import { useSectorHistory } from "../lib/sectorHistory";
import { useIndustryMap } from "../lib/sectorExtra";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet, useSearchQuotes } from "../lib/api";
import { Blank } from "../components/sectors/Parts";
import { Tip, TtkMode, Wallet, WhyFold, useFirstVisit } from "../components/sectors/pack/Common";
import { BackdropLine, PackHead, type View } from "../components/sectors/pack/PulseHead";
import { MoreMenu, type MoreItem } from "../components/sectors/pack/MoreMenu";
import { LabelsCard } from "../components/sectors/pack/LabelsCard";
import { useTaxonomyIndex } from "../lib/taxonomy";
import { ByState, CountedAndSmall, Cycle, Momentum, Standouts, TodayMinute, WordsList, YourIndustries } from "../components/sectors/pack/PulseSimple";
import { FullCards, PulseTable, SixMonths, StandoutsFull, TooSmallFull } from "../components/sectors/pack/PulseTable";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/sector-pages.css";
import "../styles/pulse448.css";
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
  const symbols = useMemo(() => [...new Set(held.filter((x) => x.owned !== false).map((x) => x.symbol.toUpperCase()))], [held]);   // task #448 (06): shares the member holds
  const key = [...symbols].sort().join(",");
  const mem = useQuery<{ groups: Record<string, { slug: string }> }, ApiError>({ queryKey: ["sectors", "membership", key, show], queryFn: () => apiGet(`/api/sectors/membership?symbols=${encodeURIComponent(key)}` + showQuery(show, false)), enabled: symbols.length > 0, staleTime: 3_600_000, retry: false });
  const mine = useMemo(() => new Set(Object.values(mem.data?.groups ?? {}).map((g) => g.slug)), [mem.data]);
  // task #448 (06): each held share once, with its quantity across lots, its last close (quantity × last close is its value) and its group (none: no NSE sector)
  const quotes = useSearchQuotes(symbols.length > 0);
  const heldShares: HeldShare[] = useMemo(() => {
    const qm = quoteMap(quotes.data), qty = new Map<string, number>();
    for (const x of held) if (x.owned !== false && x.side !== "sell") qty.set(x.symbol.toUpperCase(), (qty.get(x.symbol.toUpperCase()) ?? 0) + (x.qty || 0));
    return symbols.map((sym) => ({ symbol: sym, qty: qty.get(sym) ?? 0, price: qm.get(sym)?.price ?? null, slug: mem.data?.groups[sym]?.slug ?? null }));
  }, [symbols, held, quotes.data, mem.data]);
  const peerLabels = usePeerLabels([...mine]);
  const b = q.data, h = hq.data;
  const tax = useTaxonomyIndex();
  const wl = useWatchlist();
  const watchSyms = useMemo(() => [...new Set(wl.lists.flatMap((l) => l.symbols.map((x) => x.toUpperCase())))], [wl]);
  const [askMenu, setAskMenu] = useState<string | null>(null);   // the first-visit line opens "What the labels mean" (02 §1)
  const firstVisit = useFirstVisit("sector-pulse");   // task #333 (fix 3): "Why it matters" opens on a member's first visit, closed after
  const d = b?.date ? new Date(b.date + "T00:00:00Z") : null;
  // task #310 F (05-phone.md, fix 6): a closed section's one line carries its live figure where the section already has it
  const foldLine = useMemo(() => {
    const flags = b?.leader_flags;
    return {
      standouts: flags == null ? tw("Stocks at a new 1-year high while their industry is well below its own")
        : !flags.length ? tw("No stock is at a new 1-year high inside a weak industry today")
        : tw(`${flags.length.toLocaleString("en-IN")} ${flags.length === 1 ? "stock" : "stocks"} at a new 1-year high while their industry is well below its own`),
    };
  }, [b]);
  // task #448 (developer file 42, 01 §2): the facts as lines; a fact after an i starts its own line. The Market backdrop side box is one line with its i; the
  // wallet key shows only when the member holds shares. Built from the current view's data on every render, so a switch reads as a fresh load.
  const few = b?.too_few_stocks ?? [], nseInd = tax.data?.industries.length ?? null;
  const meta = b ? <>
    <p className="sx-ml">Updated every weekend, to the close of {d ? `${WEEKDAY[d.getUTCDay()]} ${b.date_label ?? b.date}` : b.date} · {b.universe ? b.universe.counted_in_groups_with_reading.toLocaleString("en-IN") : b.stocks_counted.toLocaleString("en-IN")} actively traded stocks<Tip text="Only actively traded, established stocks are counted, so a few rarely traded names cannot swing the reading. The list is reviewed once a month." label="About “actively traded stocks”" /></p>
    {show === "sectors"
      ? <p className="sx-ml">{sectorsLine(b)}<Tip text="Each group is one of NSE's 22 sectors, read with all its industries together. A sector with too few actively traded stocks for a steady reading is listed under Too small." label="About “NSE sectors”" /></p>
      : <p className="sx-ml">{nseInd != null ? `${nseInd} NSE industries, read as ${b.rows.length} groups` : `${b.rows.length} groups`}<Tip label="About “NSE industries”" text={`NSE sorts listed companies into ${nseInd ?? "its"} industries. Many have only a few liquid stocks, so their reading would swing on one or two names. An industry with enough stocks is read on its own (${b.rows.filter((r) => r.kind !== "sector").length} of them). In ${b.rows.filter((r) => r.kind === "sector").length} sectors, the industries too small to read alone are read together under the sector's name, for example Telecom - Services and Telecom - Equipment as Telecommunication. That gives ${b.rows.length} groups with a reading; ${few.length} ${few.length === 1 ? "group is" : "groups are"} still too small for one.`} /></p>}
    <BackdropLine pct={b.market?.pct_vs_200d ?? null} above={b.market?.above_200d ?? null} />
    {symbols.length > 0 && <p className="sx-ml sx-walkey"><Wallet spoken /> marks {show === "sectors" ? "a sector" : "an industry"} or a stock you hold shares in</p>}
  </> : null;
  const n = b?.rows.length ?? 0, sectorsView = show === "sectors";
  const allLabel = sectorsView ? allSectors(n) : `All ${n} groups`;   // task #448 (05 §1): "All sectors", never "All 19"; the Industries view's 38 groups
  const noun = sectorsView ? "sector" : "industry";
  // 01 §1: no shares and no watchlist leaves "Your …" out of the bar; the dots: Your … when one of the member's groups changed state, All … when any did
  const hasYours = symbols.length > 0 || watchSyms.length > 0;
  const changed = h?.changed_this_week ?? [];
  const anyChanged = changed.length > 0, yoursChanged = changed.some((g) => mine.has(g.slug));
  // task #448 (01 §3): the reference blocks that sat on the page open from the ⋯ menu, over the page
  const menuItems: MoreItem[] = b ? [
    { key: "guide", label: "How to read and use this page", content: <PulseGuide inPanel stocks={b.universe?.counted_in_groups_with_reading ?? b.stocks_counted} groups={groupsParen(b.rows)} /> },
    { key: "labels", label: "What the labels mean", content: <LabelsCard n={noun} held={symbols.length > 0} /> },
    ...(view === "simple" ? [{ key: "counted", label: "Which stocks are counted", content: <CountedAndSmall b={b} /> }]
      : (b.too_few_stocks ?? []).length ? [{ key: "small", label: "Too small for a reading", content: <><p className="sp-sub">{tw(`${groupsSplit(b.too_few_stocks ?? [])} have too few actively traded stocks for a steady reading.`)}</p><TooSmallFull b={b} inFold /></> }] : []),
    { key: "words", label: "Words on this page", content: <WordsList /> },
  ] : [];
  return (
    <div className={"wrap sx sp sx-new" + (view === "full" ? " sx-full" : "")} data-testid="sector-pulse">
      <PackHead page="pulse" title={TITLE} desc={tw(HEAD_DESC)} meta={meta} view={view} onView={setView} industries={b?.rows ?? []} show={show} onShow={setShow}
        side={null} more={b ? <MoreMenu ask={askMenu} onAsked={() => setAskMenu(null)} items={menuItems} /> : null} />
      {pending && show === "industries" && <p className="sp-note sp-pending">{pending}</p>}
      {(q.isLoading || !ready) && <div className="sx-skel sp-sec" role="status" aria-label="Loading the sector readings" />}
      {q.isError && <div className="sp-sec"><Blank title={show === "sectors" ? "The Sectors view is not available right now" : "Sector Pulse is not available right now"} reason={failureText(q.error)}>
        <button type="button" className="btn" onClick={() => q.refetch()}>Try again</button>{show === "sectors" && <button type="button" className="btn" onClick={() => setShow("industries")}>Show industries</button>}</Blank></div>}
      {/* task #448 (developer file 42, 01 §1): the step bar replaces "On this page"; one section at a time, or All sections */}
      {b && view === "simple" && (
        <TtkMode.Provider value="pill"><WhyFold.Provider value={firstVisit}>
          <Steps page="sp" view={show} date={b.date} quick={hasYours ? 2 : 1} steps={[
            { key: "today", label: "Today", line: tw("What changed in the industries, and what to keep an eye on."), dot: true, content: <TodayMinute b={b} h={h} mine={mine} noShares={!hasYours} signedIn={!!user} onLabels={() => setAskMenu("labels")} forYou={symbols.length > 0 ? <ForYouCard b={b} h={h} held={heldShares} labels={peerLabels} labelOf={(k) => WORD[k]} /> : null} /> },
            ...(hasYours ? [{ key: "yours", label: tw("Your industries"), line: tw("How your industries are doing"), dot: yoursChanged, content: <YourIndustries b={b} h={h} symbols={symbols} signedIn={!!user} heldShares={heldShares} /> }] : []),
            { key: "all", label: sectorsView ? "All sectors" : "All groups", line: "By state · Map · Over time", dot: anyChanged, content: (
              <SxBox id="sx-all" store="finlit-sx-box-all" param="tab" label={allLabel} sub="3 ways to look · press one" tabs={[
                { key: "state", label: "By state", content: <ByState b={b} mine={mine} /> },
                { key: "map", label: "Map", content: mq.data ? <SectorMap m={mq.data} b={b} mine={mine} /> : <div className="sp-sec"><p className="sp-empty">{mq.isLoading ? "Loading the map…" : tw("The map is not available right now.")}</p></div> },
                { key: "time", label: "Over time", content: h ? <MoodWeeks h={h} /> : <div className="sp-sec"><p className="sp-empty">{hq.isLoading ? "Loading the history…" : "The history is not available right now."}</p></div> },
              ]} />) },
            { key: "chk", label: "Price checks", line: tw("Against other industries · Against results · What happened next"), content: (
              <SxBox id="sx-chk" store="finlit-sx-box-chk" label="Three checks on the price picture" sub="press one" tabs={[
                { key: "others", label: tw("Against other industries"), content: <Momentum b={b} mine={mine} /> },
                { key: "results", label: "Against results", isNew: true, content: <PriceVsResults b={b} mine={mine} /> },
                { key: "next", label: "What happened next", isNew: true, content: <div><Cycle b={b} /><WhatNext /></div> },
              ]} />) },
            { key: "inside", label: tw("Inside an industry"), line: tw("Its 12 strongest stocks, with FinLit Prism"), content: <InsideSector b={b} mine={mine} symbols={symbols} /> },
            { key: "standouts", label: "Standout stocks", line: foldLine.standouts, content: <Standouts b={b} mine={mine} /> },
          ]} />
        </WhyFold.Provider></TtkMode.Provider>
      )}
      {b && view === "full" && (
        <TtkMode.Provider value="pill"><WhyFold.Provider value={firstVisit}>
          {/* task #333 (file 30, Full table): two callouts, then one box with a switch (its bar is the frozen one), then the closed row "Too small for a reading" */}
          <SxBox id="sx-full" store="finlit-sx-box-full" label={allLabel} sub="3 ways to look · press one" ttk={<FullCards b={b} h={h} />} tabs={[
            { key: "every", label: "Every number", content: <PulseTable b={b} h={h} mine={mine} /> },
            ...(h ? [{ key: "six", label: "Six months, week by week", content: <SixMonths h={h} /> }] : []),
            { key: "standouts", label: `Standout stocks${b.leader_flags ? ` (${b.leader_flags.length})` : ""}`, content: <StandoutsFull b={b} /> },
          ]} />
        </WhyFold.Provider></TtkMode.Provider>
      )}
      {b && <p className="sp-disclaimer">{tw(DISCLAIMER)}</p>}
    </div>
  );
}
