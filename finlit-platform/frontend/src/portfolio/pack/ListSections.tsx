// Task #323 (developer file 22): the equity portfolio's sections for the open watchlist, W1 to W5. The equity page's own components, given the list's
// symbols and the list's wording (voice "list": the companies are watched, not owned). There are no quantities, so every figure counts each company once.
// Same reads as the equity page (POST /api/portfolio/overview and /trend, the leadership feed, Discover's themes); nothing new on the server.
// Plans as on the equity page: Key figures' trend and valuation, W3, W4 and W5 are FinLit Prism (Gold); a Silver member sees the Gold lock.
// The sections sit in `.pfx.sp.eq.eq-embed`, which gives them the `.eq` tokens without a box. Describes; never advice.
import { useMemo, useState } from "react";
import { HideSlim } from "../../components/Hideable";
import { useBoard } from "../../discovery/model";
import { shortLabel } from "../../lib/companyLabel";
import { shareOf } from "../../lib/equityShares";
import type { Share } from "../../lib/equityPack";
import { portfolioAnswers } from "../../lib/keyAnswers";
import { useOverview } from "../../lib/portfolioOverview";
import type { Row } from "../../lib/screener";
import type { ListLeadFeed } from "../../lib/watchlistPack";
import { usePortfolioTrend } from "../usePortfolioTrend";
import { YourThemes, themeView } from "./EqThemes";
import { GoldLock, LeadersSection, PeersSection, TrendSection } from "./EquityPack";
import { KeyAnswers } from "./KeyAnswers";
import "../pf.css";
import "./equity-pack.css";

export function useListEquity(symbols: string[], rows: Row[], feed: ListLeadFeed | undefined, on: boolean, gold: boolean) {
  const ov = useOverview(symbols, on);
  const tr = usePortfolioTrend(symbols, on && gold);
  const board = useBoard();
  const by = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);
  const byOv = useMemo(() => new Map((ov.data?.holdings ?? []).map((h) => [h.symbol, h])), [ov.data]);
  const shares: Share[] = useMemo(() => symbols.map((s) => shareOf(s, by.get(s)?.name, byOv.get(s), by.get(s), feed)), [symbols, by, byOv, feed]);
  const themes = useMemo(() => (board.data ? themeView(board.data, rows, symbols) : null), [board.data, rows, symbols]);
  return { shares, tr, themes, gold, label: (x: string) => { const y = shares.find((z) => z.symbol === x); return y ? shortLabel(y) : x; } };
}
type ListEq = ReturnType<typeof useListEquity>;

/** W1 · Key figures: closed when the page opens (components/Hideable CLOSED_BY_DEFAULT), like the equity page's. */
export function ListKeyFigures({ eq, listName }: { eq: ListEq; listName: string }) {
  const n = eq.shares.length;
  return (
    <HideSlim.Provider value>
      <div className="pfx sp eq eq-embed">
        <KeyAnswers id="wl-keys" sub={`What the ${n} ${n === 1 ? "company" : "companies"} on ${listName} add up to, from the list above and the sections below.`}
          items={portfolioAnswers(eq.shares, eq.gold, (s) => shortLabel(s), "list")} shares={eq.shares} />
      </div>
    </HideSlim.Provider>);
}

/** W2 to W5: Themes on this list, the trend, against their peers, and the weakest against their group leader. */
export function ListSections({ eq, onShow }: { eq: ListEq; onShow?: (theme: string) => void }) {
  const [, setList] = useState<"shares" | "watch">("watch");
  const n = eq.shares.length;
  return (
    <HideSlim.Provider value>
      <div className="pfx sp eq eq-embed">
        <YourThemes v={eq.themes} list="watch" onList={setList} voice="list" theme={null} label={eq.label} onShow={onShow} showLabel="Show them in the list"
          counts={{ shares: { placed: 0, total: 0 }, watch: { placed: eq.themes?.placed ?? 0, total: n } }} />
        {eq.gold ? <>
          {eq.tr.data?.trend ? <TrendSection t={eq.tr.data.trend} shares={eq.shares} voice="list" />
            : <section className="sp-sec" aria-labelledby="eq-trend"><h2 id="eq-trend">Short- and long-term trend</h2><p className="sp-note">{eq.tr.isError ? "The trend readings could not be loaded. Try again in a moment." : "Loading the trend readings…"}</p></section>}
          <PeersSection shares={eq.shares} voice="list" />
          <LeadersSection shares={eq.shares} voice="list" />
        </> : <>
          <GoldLock id="eq-trend" title="Short- and long-term trend" text="Where each company's short-term trend sits against its long-term one, from FinLit Prism's technical view." />
          <GoldLock id="eq-peers" title="Against their peers" text="Whether each company on the list leads or lags similar companies over 12 months." />
          <GoldLock id="eq-leaders" title="The weakest on this list against their group leader" text="The laggards on this list against the #1 share of their peer group over 12 months." />
        </>}
      </div>
    </HideSlim.Provider>);
}
