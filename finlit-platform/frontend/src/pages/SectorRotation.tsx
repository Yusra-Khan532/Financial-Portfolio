// Sector Rotation (/sectors/rotation) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/08 and 09): the pack's header with The
// yardstick, a Simple view and a Full table view (?view=full). Every figure is the server's (GET /api/rotation); "Does Sector Pulse agree?" reads the Sector Pulse board
// (GET /api/sectors); your industries come from GET /api/sectors/membership. Describes how industries have done against the average group; never advice.
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useDocTitle } from "../lib/title";
import { useAuth } from "../lib/auth";
import { usePortfolio } from "../lib/portfolio";
import { ApiError, apiGet } from "../lib/api";
import { failureText, useRotationMap } from "../lib/rotation";
import { useSectorBoard, type GroupRow } from "../lib/sectors";
import { groupsN, short } from "../lib/pulsePack";
import { Blank } from "../components/sectors/Parts";
import { Tip } from "../components/sectors/pack/Common";
import { PackHead, type View } from "../components/sectors/pack/PulseHead";
import { RotationGuide, SectionsBar } from "../components/sectors/pack/Guide";
import { Words } from "../components/sectors/pack/PulseSimple";
import { AheadRot, ChangedRot, FourBoxes, MapRot, MayMoveRot, RankMovesRot, ROT_WORDS, TodayRot, YourRot } from "../components/rotation/pack/RotationSimple";
import { FullCardsRot, RankingRot, SixMonthRanks, TwelveWeeks } from "../components/rotation/pack/RotationTable";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/rotation-pack.css";
import { showQuery, type Show } from "../lib/sectors";
import { tw, useShow, useShowWords } from "../lib/groupWords";

const TITLE = "Sector Rotation";
const DESC = tw("Money moves from one industry to another over months. This page shows which industries are leading the market, which are falling behind, and which are changing places.");   // the page's search description
const HEAD_DESC = tw("Which industries lead the market, which lag, and which are changing places over the months.");   // the header's one line (founder, 22 Nov 2026)
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Yardstick({ n, show, groups }: { n: number; show: Show; groups: number | null }) {
  if (show === "sectors") return (                    // the Sectors view is measured against the SAME average as the Industries view (task #192, S1: "the same yardstick")
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

export function SectorRotationPage() {
  useDocTitle(TITLE, tw(DESC));
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "full" ? "full" : "simple";
  const setView = (v: View) => { const p = new URLSearchParams(params); if (v === "full") p.set("view", "full"); else p.delete("view"); setParams(p, { replace: true }); };
  const { show, setShow, ready, pending } = useShow();
  useShowWords(show);                                   // the words of every section below follow Show (task #192, S1)
  const q = useRotationMap(show, ready), bq = useSectorBoard(show, ready);
  const indRot = useRotationMap("industries", ready && show === "sectors");      // the yardstick's own count of groups
  const { user } = useAuth();
  const held = usePortfolio().holdings;
  const symbols = useMemo(() => [...new Set(held.map((x) => x.symbol.toUpperCase()))].sort(), [held]);
  const key = symbols.join(",");
  const mem = useQuery<{ groups: Record<string, { slug: string }> }, ApiError>({ queryKey: ["sectors", "membership", key, show], queryFn: () => apiGet(`/api/sectors/membership?symbols=${encodeURIComponent(key)}` + showQuery(show, false)), enabled: symbols.length > 0, staleTime: 3_600_000, retry: false });
  const { mine, shares, value } = useMemo(() => {
    const g = mem.data?.groups ?? {}, shares = new Map<string, string[]>(), value = new Map<string, number>();
    for (const [sym, x] of Object.entries(g)) { shares.set(x.slug, [...(shares.get(x.slug) ?? []), sym]); }
    for (const h of held) { const s = g[h.symbol.toUpperCase()]?.slug; if (s) value.set(s, (value.get(s) ?? 0) + (h.qty || 0) * (h.price || 0)); }
    return { mine: new Set(shares.keys()), shares, value };
  }, [mem.data, held]);
  const pulse = useMemo(() => new Map<string, GroupRow>((bq.data?.rows ?? []).map((r) => [r.slug, r])), [bq.data]);
  const m = q.data;
  const d = m?.date ? new Date(m.date + "T00:00:00Z") : null;
  const unranked = m?.rows.filter((r) => r.rank == null).map((r) => short(r.name)) ?? [];
  const nRanked = m?.rows.filter((r) => r.rank != null).length ?? 0;
  const meta = m ? <>Updated after the weekly close, {d ? `${WEEKDAY[d.getUTCDay()]} ${m.date_label ?? m.date}` : m.date} · {groupsN(nRanked)} ranked<Tip text={tw("Each week every group with enough history is ranked, 1 the strongest. An industry that is too new has a box but no rank yet.")} />{unranked.length > 0 && <> · {unranked.join(", ")} {unranked.length === 1 ? "is" : "are"} too small to rank</>}</> : null;
  const disclaimer = m ? tw(`Describes past prices of NSE industry groups against the average group; not a forecast and not a recommendation to buy, sell or hold any security. NSE daily data, equal-weighted industry groups, the same counted stocks as Sector Pulse. Data as of ${d ? `${WEEKDAY[d.getUTCDay()]} ${m.date_label ?? m.date}` : m.date}, after the close.`) : "";
  return (
    <div className="wrap sx sp rp" data-testid="sector-rotation">
      <PackHead page="rotation" title={TITLE} desc={tw(HEAD_DESC)} meta={meta} view={view} onView={setView} industries={m?.rows ?? []} show={show} onShow={setShow} findHint={show === "sectors" ? "A sector, e.g. Healthcare" : "An industry, e.g. Banks"} side={m ? <Yardstick n={m.rows.length} show={show} groups={indRot.data?.rows.length ?? null} /> : null} />
      {pending && show === "industries" && <p className="sp-note sp-pending">{pending}</p>}
      {(q.isLoading || !ready) && <div className="sx-skel sp-sec" role="status" aria-label="Loading the rotation readings" />}
      {q.isError && <div className="sp-sec"><Blank title={show === "sectors" ? "The Sectors view is not available right now" : "Sector Rotation is not available right now"} reason={failureText(q.error)}>
        <button type="button" className="btn" onClick={() => q.refetch()}>Try again</button>{show === "sectors" && <button type="button" className="btn" onClick={() => setShow("industries")}>Show industries</button>}</Blank></div>}
      {m && <RotationGuide ranked={nRanked} total={m.rows.length} />}
      {m && <SectionsBar items={view === "simple" ? [
        { id: "rp-today", label: "Today" }, { id: "rp-four", label: "Four boxes" }, { id: "rp-map", label: "Map" }, { id: "rp-ahead", label: "Who is ahead" }, { id: "rp-changed", label: "Changed box" },
        { id: "rp-next", label: "May change" }, { id: "rp-moves", label: "Rank moves" }, { id: "rp-yours", label: tw("Your industries") },
      ] : [
        { id: "rp-rank", label: "Ranking" }, { id: "rp-next", label: "May change" }, { id: "rp-six", label: "Six months of ranks" }, { id: "rp-twelve", label: "12-week change" },
      ]} />}
      {m && view === "simple" && (
        <>
          <TodayRot m={m} mine={mine} pulse={pulse} />
          <FourBoxes m={m} mine={mine} />
          <MapRot m={m} mine={mine} />
          <AheadRot m={m} />
          <ChangedRot m={m} mine={mine} pulse={pulse} />
          <MayMoveRot m={m} mine={mine} pulse={pulse} />
          <RankMovesRot m={m} mine={mine} />
          <YourRot m={m} mine={mine} shares={shares} value={value} pulse={pulse} signedIn={!!user} />
          <Words items={ROT_WORDS} />
        </>
      )}
      {m && view === "full" && (
        <>
          <FullCardsRot m={m} />
          <RankingRot m={m} mine={mine} pulse={pulse} />
          <MayMoveRot m={m} mine={mine} pulse={pulse} sub="Its newest weekly reading already sits in another box. If next week agrees, it moves." why={false} />
          <SixMonthRanks m={m} />
          <TwelveWeeks m={m} mine={mine} />
          <Words items={ROT_WORDS} />
        </>
      )}
      {m && <p className="sp-disclaimer">{disclaimer}</p>}
    </div>
  );
}
