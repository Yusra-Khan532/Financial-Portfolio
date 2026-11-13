// Sector Rotation (/sectors/rotation) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/08 and 09): the pack's header with The
// yardstick, a Simple view and a Full table view (?view=full). Every figure is the server's (GET /api/rotation); "Does Sector Pulse agree?" reads the Sector Pulse board
// (GET /api/sectors); your industries come from GET /api/sectors/membership. Describes how industries have done against the average industry; never advice.
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useDocTitle } from "../lib/title";
import { useAuth } from "../lib/auth";
import { usePortfolio } from "../lib/portfolio";
import { ApiError, apiGet } from "../lib/api";
import { failureText, useRotationMap } from "../lib/rotation";
import { useSectorBoard, type GroupRow } from "../lib/sectors";
import { short } from "../lib/pulsePack";
import { Blank } from "../components/sectors/Parts";
import { Tip } from "../components/sectors/pack/Common";
import { PackHead, type View } from "../components/sectors/pack/PulseHead";
import { Words } from "../components/sectors/pack/PulseSimple";
import { AheadRot, ChangedRot, FourBoxes, HowToReadRot, MapRot, MayMoveRot, RankMovesRot, ROT_WORDS, TodayRot, YourRot } from "../components/rotation/pack/RotationSimple";
import { FullCardsRot, RankingRot, SixMonthRanks, TwelveWeeks } from "../components/rotation/pack/RotationTable";
import "../styles/sectors.css";
import "../styles/sectors-pack.css";
import "../styles/rotation-pack.css";

const TITLE = "Sector Rotation";
const DESC = "Money moves from one industry to another over months. This page shows which industries are leading the market, which are falling behind, and which are changing places.";
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Yardstick({ n }: { n: number }) {
  return (
    <aside className="sp-side rp-yard" aria-label="The yardstick">
      <p className="sp-side-k">The yardstick<Tip text="The yardstick. Every industry is measured against the average industry: all the industries counted equally, so a large industry does not count for more than a small one." /></p>
      <p className="rp-yard-t">The average industry</p>
      <p className="sp-side-x">All {n} industries counted equally. Every figure on this page says how far an industry is ahead of (+) or behind (−) this average.</p>
    </aside>
  );
}

export function SectorRotationPage() {
  useDocTitle(TITLE, DESC);
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "full" ? "full" : "simple";
  const setView = (v: View) => { const p = new URLSearchParams(params); if (v === "full") p.set("view", "full"); else p.delete("view"); setParams(p, { replace: true }); };
  const q = useRotationMap(), bq = useSectorBoard();
  const { user } = useAuth();
  const held = usePortfolio().holdings;
  const symbols = useMemo(() => [...new Set(held.map((x) => x.symbol.toUpperCase()))].sort(), [held]);
  const key = symbols.join(",");
  const mem = useQuery<{ groups: Record<string, { slug: string }> }, ApiError>({ queryKey: ["sectors", "membership", key], queryFn: () => apiGet(`/api/sectors/membership?symbols=${encodeURIComponent(key)}`), enabled: symbols.length > 0, staleTime: 3_600_000, retry: false });
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
  const meta = m ? <>Updated after the weekly close, {d ? `${WEEKDAY[d.getUTCDay()]} ${m.date_label ?? m.date}` : m.date} · {nRanked} ranked industries<Tip text="Each week every industry with enough history is ranked, 1 the strongest. An industry that is too new has a box but no rank yet." />{unranked.length > 0 && <> · {unranked.join(", ")} {unranked.length === 1 ? "is" : "are"} too small to rank</>}</> : null;
  const disclaimer = m ? `Describes past prices of NSE industry groups against the average industry; not a forecast and not a recommendation to buy, sell or hold any security. NSE daily data, equal-weighted industry groups, the same counted stocks as Sector Pulse. Data as of ${d ? `${WEEKDAY[d.getUTCDay()]} ${m.date_label ?? m.date}` : m.date}, after the close.` : "";
  return (
    <div className="wrap sx sp rp" data-testid="sector-rotation">
      <PackHead page="rotation" title={TITLE} desc={DESC} meta={meta} view={view} onView={setView} industries={m?.rows ?? []} findHint="An industry, e.g. Banks" side={m ? <Yardstick n={m.rows.length} /> : null} />
      {q.isLoading && <div className="sx-skel sp-sec" role="status" aria-label="Loading the rotation readings" />}
      {q.isError && <div className="sp-sec"><Blank title="Sector Rotation is not available right now" reason={failureText(q.error)}><button type="button" className="btn" onClick={() => q.refetch()}>Try again</button></Blank></div>}
      {m && <HowToReadRot m={m} />}
      {m && view === "simple" && (
        <>
          <TodayRot m={m} mine={mine} pulse={pulse} />
          <YourRot m={m} mine={mine} shares={shares} value={value} pulse={pulse} signedIn={!!user} />
          <MapRot m={m} mine={mine} />
          <AheadRot m={m} />
          <ChangedRot m={m} mine={mine} pulse={pulse} />
          <MayMoveRot m={m} mine={mine} pulse={pulse} />
          <RankMovesRot m={m} mine={mine} />
          <FourBoxes m={m} mine={mine} />
          <Words items={ROT_WORDS} />
        </>
      )}
      {m && view === "full" && (
        <>
          <FullCardsRot m={m} />
          <RankingRot m={m} mine={mine} pulse={pulse} />
          <SixMonthRanks m={m} />
          <TwelveWeeks m={m} mine={mine} />
          <MayMoveRot m={m} mine={mine} pulse={pulse} sub="Its newest weekly reading already sits in another box. If next week agrees, it moves." why={false} />
          <Words items={ROT_WORDS} />
        </>
      )}
      {m && <p className="sp-disclaimer">{disclaimer}</p>}
    </div>
  );
}
