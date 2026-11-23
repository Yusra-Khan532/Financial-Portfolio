// Sector Rotation (/sectors/rotation), developer file 31 (task #332, 23 Nov 2026): the shorter page with six additions. Simple view: the header, How to read (one
// line), the section bar, Today in one minute, Your sectors, three boxes with a switch (All N · What changed · Ranking checks), Inside a sector and Words. Full
// table view: two callouts and one box (Ranking · Six months of ranks · 12-week change · May change next week). ?show=sectors|industries, ?view=full and &tab= (box
// 1's open tab); each box remembers its tab for the member. Every figure is the server's (GET /api/rotation, /api/sectors, /api/sectors/membership,
// /api/results/quarter?view=industries, /api/sectors/<slug>, /api/prism/scores). Describes how industries have done against the average group; never advice.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useDocTitle } from "../lib/title";
import { useAuth } from "../lib/auth";
import { usePortfolio } from "../lib/portfolio";
import { useWatchlist } from "../lib/watchlist";
import { ApiError, apiGet } from "../lib/api";
import { failureText, useRotationMap } from "../lib/rotation";
import { useSectorBoard, type GroupRow } from "../lib/sectors";
import { short } from "../lib/pulsePack";
import { fullCards, gw, mayMoveRows, movedRows } from "../lib/rotationPack";
import { BOX_TABS, firstVisit, mineOf, openTab, readTab, saveTab, type BoxId, type MemberShares } from "../lib/rotation332";
import { TabGroup } from "../components/TabGroup";
import { AlertBell } from "../components/sectors/pack/SectorAlert";
import { Blank } from "../components/sectors/Parts";
import { Cards, Tip } from "../components/sectors/pack/Common";
import { PackHead, type View } from "../components/sectors/pack/PulseHead";
import { RotationGuide } from "../components/sectors/pack/Guide";
import { Words } from "../components/sectors/pack/PulseSimple";
import { AheadRot, ChangedRot, FourBoxes, MapRot, MayMoveRot, RankMovesRot, ROT_WORDS } from "../components/rotation/pack/RotationSimple";
import { RankingRot, SixMonthRanks, TwelveWeeks } from "../components/rotation/pack/RotationTable";
import { Inside, PriceResults, RotNav, TodayNew, WhatNextCards, YourNew, hoverCard } from "../components/rotation/pack/Rotation332";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/rotation-pack.css";
import "../styles/sector-pages.css";
import "../styles/rotation-332.css";
import { showQuery, type Show } from "../lib/sectors";
import { tw, useShow, useShowWords } from "../lib/groupWords";

const TITLE = "Sector Rotation";
const DESC = tw("Money moves from one industry to another over months. This page shows which industries are leading the market, which are falling behind, and which are changing places.");   // the page's search description
const HEAD_DESC = tw("Which industries lead the market, which lag, and which are changing places over the months.");   // the header's one line (founder, 22 Nov 2026)
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The yardstick (fault 2, confirmed in the code): both views measure against the Industries view's average group (finlit_technicals/batch.py write_level_files passes
 *  the industry rotation's benchmark to the Sectors view), so the box and the guide both say "all N industry groups counted equally". */
function Yardstick({ n, show, groups }: { n: number; show: Show; groups: number | null }) {
  if (show === "sectors") return (
    <aside className="sp-side rp-yard" aria-label="The yardstick">
      <p className="sp-side-k">The yardstick<Tip text="The yardstick. The same as in the Industries view: the average group, all the industry groups counted equally. Each sector is measured against it, so a sector's figures and an industry's figures can be compared directly." /></p>
      <p className="rp-yard-t">The average group</p>
      <p className="sp-side-x">{groups != null ? `All ${groups} industry groups counted equally, as in the Industries view.` : "The industry groups counted equally, as in the Industries view."} Every figure on this page says how far a sector is ahead of (+) or behind (−) this average.</p>
    </aside>
  );
  return (
    <aside className="sp-side rp-yard" aria-label="The yardstick">
      <p className="sp-side-k">The yardstick<Tip text="The yardstick. Every group (an NSE industry, or a sector group of small industries) is measured against the average group: all the groups counted equally, so a large one does not count for more than a small one." /></p>
      <p className="rp-yard-t">The average group</p>
      <p className="sp-side-x">All {n} groups counted equally. Every figure on this page says how far an industry is ahead of (+) or behind (−) this average.</p>
    </aside>
  );
}

/** One box's open tab: the address for box 1 (&tab=), the member's last tab for each box, tab 1 on a first visit. */
function useBoxTab(box: BoxId, params: URLSearchParams, setParams: (p: URLSearchParams, o?: { replace?: boolean }) => void) {
  const [tab, setTab] = useState(() => openTab(box, params.get("tab"), readTab(box)));
  const pick = (t: string) => {
    setTab(t); saveTab(box, t);
    if (box === "all") { const p = new URLSearchParams(params); if (t === BOX_TABS.all[0]) p.delete("tab"); else p.set("tab", t); setParams(p, { replace: true }); }
  };
  return [tab, pick] as const;
}

export function SectorRotationPage() {
  useDocTitle(TITLE, tw(DESC));
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "full" ? "full" : "simple";
  const setView = (v: View) => { const p = new URLSearchParams(params); if (v === "full") p.set("view", "full"); else p.delete("view"); setParams(p, { replace: true }); };
  const { show, setShow, ready, pending } = useShow();
  useShowWords(show);
  const sectors = show === "sectors";
  const q = useRotationMap(show, ready), bq = useSectorBoard(show, ready);
  const indRot = useRotationMap("industries", ready && sectors);      // the yardstick's own count of industry groups
  const { user } = useAuth();
  const held = usePortfolio().holdings, wl = useWatchlist();
  const heldSyms = useMemo(() => [...new Set(held.map((x) => x.symbol.toUpperCase()))].sort(), [held]);
  const watchSyms = useMemo(() => [...new Set(wl.lists.flatMap((l) => l.symbols.map((s) => s.toUpperCase())))].sort(), [wl]);
  const key = [...new Set([...heldSyms, ...watchSyms])].sort().join(",");
  const mem = useQuery<{ groups: Record<string, { slug: string }> }, ApiError>({ queryKey: ["sectors", "membership", key, show], queryFn: () => apiGet(`/api/sectors/membership?symbols=${encodeURIComponent(key)}` + showQuery(show, false)), enabled: key.length > 0, staleTime: 3_600_000, retry: false });
  const ms: MemberShares = useMemo(() => {
    const g = mem.data?.groups ?? {}, hm = new Map<string, string[]>(), wm = new Map<string, string[]>();
    const add = (m: Map<string, string[]>, sym: string) => { const s = g[sym]?.slug; if (s) m.set(s, [...(m.get(s) ?? []), sym]); };
    heldSyms.forEach((s) => add(hm, s)); watchSyms.forEach((s) => add(wm, s));
    return { held: hm, watched: wm };
  }, [mem.data, heldSyms, watchSyms]);
  const mine = useMemo(() => mineOf(ms), [ms]);
  const watchedOnly = useMemo(() => new Set([...ms.watched.keys()].filter((s) => !ms.held.has(s))), [ms]);
  const pulse = useMemo(() => new Map<string, GroupRow>((bq.data?.rows ?? []).map((r) => [r.slug, r])), [bq.data]);
  const [whyOpen] = useState(firstVisit);
  const [allTab, setAllTab] = useBoxTab("all", params, setParams), [chgTab, setChgTab] = useBoxTab("chg", params, setParams);
  const [chkTab, setChkTab] = useBoxTab("chk", params, setParams), [fullTab, setFullTab] = useBoxTab("full", params, setParams);
  const m = q.data;
  useEffect(() => { document.documentElement.style.setProperty("--pzn-stick", "70px"); }, []);
  const d = m?.date ? new Date(m.date + "T00:00:00Z") : null;
  const unranked = m?.rows.filter((r) => r.rank == null).map((r) => short(r.name)) ?? [];
  const nRanked = m?.rows.filter((r) => r.rank != null).length ?? 0;
  // fault 3 (37 ranked, 38 in boxes): the data is right to give such a group a box (its 6-month and 1-month readings exist) and no rank (a rank compares a full year,
  // which it does not have yet), so the header says why it has a box and no rank
  const meta = m ? <>Updated after the weekly close, {d ? `${WEEKDAY[d.getUTCDay()]} ${m.date_label ?? m.date}` : m.date} · {gw(nRanked)} ranked<Tip text={tw("Each week every industry with a full year of readings is ranked, 1 the strongest. One with less has a box (it has the 6-month and 1-month readings) but no rank yet.")} />
    {unranked.length > 0 && <> · {unranked.join(", ")} {unranked.length === 1 ? "has" : "have"} a box but no rank yet: a rank needs a full year of readings</>}</> : null;
  const disclaimer = m ? tw(`Describes past prices of NSE industry groups against the average group; not a forecast and not a recommendation to buy, sell or hold any security. NSE daily data, equal-weighted industry groups, the same counted stocks as Sector Pulse. Data as of ${d ? `${WEEKDAY[d.getUTCDay()]} ${m.date_label ?? m.date}` : m.date}, after the close.`) : "";
  const allName = m ? (sectors ? `All ${m.rows.length} sectors` : `All ${m.rows.length} groups`) : "All";
  const hover = m ? hoverCard(m, pulse, mine, watchedOnly) : undefined;
  const bell = (r: { slug: string; name: string }) => <AlertBell slug={r.slug} name={short(r.name)} compact />;
  return (
    <div className="wrap sx sp rp sx-new" data-testid="sector-rotation">
      <PackHead page="rotation" title={TITLE} desc={tw(HEAD_DESC)} meta={meta} view={view} onView={setView} industries={m?.rows ?? []} show={show} onShow={setShow} findHint={sectors ? "A sector, e.g. Healthcare" : "An industry, e.g. Banks"} side={m ? <Yardstick n={m.rows.length} show={show} groups={indRot.data?.rows.length ?? null} /> : null} />
      {pending && show === "industries" && <p className="sp-note sp-pending">{pending}</p>}
      {(q.isLoading || !ready) && <div className="sx-skel sp-sec" role="status" aria-label="Loading the rotation readings" />}
      {q.isError && <div className="sp-sec"><Blank title={sectors ? "The Sectors view is not available right now" : "Sector Rotation is not available right now"} reason={failureText(q.error)}>
        <button type="button" className="btn" onClick={() => q.refetch()}>Try again</button>{sectors && <button type="button" className="btn" onClick={() => setShow("industries")}>Show industries</button>}</Blank></div>}
      {m && <RotationGuide ranked={nRanked} yardstick={sectors ? indRot.data?.rows.length ?? null : m.rows.length} sectors={sectors} />}
      {m && view === "simple" && <>
        <RotNav items={[{ id: "sx-today", label: "Today" }, { id: "sx-yours", label: sectors ? "Your sectors" : "Your groups" }, { id: "sx-all", label: allName }, { id: "sx-chg", label: "What changed" },
          { id: "sx-chk", label: "Ranking checks" }, { id: "sx-inside", label: sectors ? "Inside a sector" : "Inside an industry" }, { id: "sx-words", label: "Words explained" }]} />
        <TodayNew m={m} mine={mine} pulse={pulse} />
        <YourNew m={m} ms={ms} pulse={pulse} signedIn={!!user} sectors={sectors} whyOpen={whyOpen} />
        <div className="sx-box" data-box="all" id="sx-all">
          <TabGroup className="sx-bar" title={allName} noun="ways to look" hint="press one" label={allName} next={false} value={allTab} onChange={setAllTab} views={[
            { key: "four", label: "Four boxes", content: <FourBoxes m={m} mine={mine} /> },
            { key: "map", label: "Map", content: <MapRot m={m} mine={mine} pulse={pulse} watched={watchedOnly} cards={1} hover={hover} /> },
            { key: "ahead", label: "Who is ahead", content: <AheadRot m={m} cards={2} /> },
            { key: "moves", label: "Rank moves", content: <RankMovesRot m={m} mine={mine} cards={1} /> },
          ]} />
        </div>
        <div className="sx-box" data-box="chg" id="sx-chg">
          <TabGroup className="sx-bar" title="What changed" noun="tabs" hint="this week and next · press one" label="What changed" next={false} value={chgTab} onChange={setChgTab} views={[
            { key: "changed", label: "Changed this week", note: String(movedRows(m).length), content: <ChangedRot m={m} mine={mine} pulse={pulse} /> },
            { key: "next", label: "May change next week", note: String(mayMoveRows(m).length), content: <MayMoveRot m={m} mine={mine} pulse={pulse} why={false} /> },
          ]} />
        </div>
        <div className="sx-box" data-box="chk" id="sx-chk">
          <TabGroup className="sx-bar" title="Two checks on the ranking" noun="checks" hint="press one" label="Two checks on the ranking" next={false} value={chkTab} onChange={setChkTab} views={[
            { key: "results", label: "Against results", chip: "new", content: <PriceResults m={m} mine={mine} sectors={sectors} /> },
            { key: "next", label: "What happened next", chip: "new", content: <WhatNextCards m={m} sectors={sectors} /> },
          ]} />
        </div>
        <Inside m={m} held={[...ms.held.keys()]} watched={[...ms.watched.keys()]} mine={mine} pulse={pulse} sectors={sectors} syms={new Set(heldSyms)} />
        <div id="sx-words"><Words items={ROT_WORDS} /></div>
      </>}
      {m && view === "full" && <>
        <Cards items={fullCards(m).slice(0, 2)} />
        <div className="sx-box sx-box-full" data-box="full" id="sx-full">
          <TabGroup className="sx-bar sx-bar-stick" title={sectors ? `All ${m.rows.length} sectors, every number` : `All ${m.rows.length} groups, every number`} noun="tables" hint="press one" label="Full table" next={false} value={fullTab} onChange={setFullTab} views={[
            { key: "ranking", label: "Ranking", content: <RankingRot m={m} mine={mine} pulse={pulse} bell={bell} /> },
            { key: "six", label: "Six months of ranks", content: <SixMonthRanks m={m} /> },
            { key: "twelve", label: "12-week change", content: <TwelveWeeks m={m} mine={mine} /> },
            { key: "next", label: "May change next week", note: String(mayMoveRows(m).length), content: <MayMoveRot m={m} mine={mine} pulse={pulse} sub="Its newest weekly reading already sits in another box. If next week agrees, it moves." why={false} /> },
          ]} />
        </div>
        <div id="sx-words"><Words items={ROT_WORDS} /></div>
      </>}
      {m && <p className="sp-disclaimer">{disclaimer}</p>}
    </div>
  );
}
