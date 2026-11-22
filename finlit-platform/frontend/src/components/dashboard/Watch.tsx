// Task #316 (dashboard file 22): one card, "Watchlist today", for the three watchlist blocks (Watchlist movers, Worth a second look, Watchlist by band). The Prism band
// bar runs across the top with four count boxes; under it the movers in two columns beside Worth a second look, with one line saying what qualifies a stock.
// Each part keeps its own plan gate and its Customise switch; while the stocks load it shows placeholders, not the empty state. The day's move is the same figure as
// in "Your investments today" (the live quote; the screener's figure only when no quote is held). Descriptive only.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { PRISM_BANDS, prismBandOf, rowScore, type PrismBand } from "../../lib/planScore";
import { useQuotesFor } from "../../lib/api";
import { quoteMap } from "../../lib/globalSearch";
import { RANK, type Plan } from "../../lib/ui";
import type { Row } from "../../lib/screener";
import { Card, Rows } from "./parts";
import { Locked, Movers, SecondLook } from "./Legacy";

/** Healthy takes the green of the Healthy score pill (the live bar drew it near black, --v-healthy). */
export const BAND_COLOUR: Record<PrismBand, string> = { strong: "var(--v-strong)", healthy: "var(--dx-healthy)", average: "var(--v-mixed)", weak: "var(--v-weak)" };

export function WatchBand({ items }: { items: Row[] }) {
  const counts = PRISM_BANDS.map((b) => ({ ...b, n: items.filter((r) => prismBandOf(rowScore(r)) === b.key).length }));
  const total = counts.reduce((a, c) => a + c.n, 0);
  if (!total) return <p className="dsh-note">No stock you follow has a FinLit Prism score yet, so the band bar is empty.</p>;
  return (
    <div className="dx-wl-band">
      <div className="breadth big" role="img" aria-label={"Watchlist by band: " + counts.map((c) => `${c.word} ${c.n}`).join(", ")}>{counts.filter((c) => c.n).map((c) => <i key={c.key} style={{ flex: c.n, background: BAND_COLOUR[c.key] }} />)}</div>
      <ul className="bandk">{counts.map((c) => <li key={c.key}><i style={{ background: BAND_COLOUR[c.key] }} /><span><span className="dx-bn">{c.word}</span> <small>Prism {c.rule}</small></span><b>{c.n}</b></li>)}</ul>
    </div>
  );
}

type Part = "movers" | "second" | "buckets";
export function WatchToday({ items, loading, parts, plan }: { items: Row[]; loading: boolean;
  /** each part's plan when it is switched on in Customise (null when off) */ parts: Record<Part, Plan | null>; plan: Plan }) {
  const q = useQuotesFor(items.map((r) => r.symbol)), qm = quoteMap(q.data);
  // one figure for the day's move: the quote "Your investments today" shows
  const priced = items.map((r) => { const c = qm.get(r.symbol)?.chg; return c != null ? { ...r, change_pct: c } : r; });
  const gate = (k: Part, label: string, el: ReactNode) => RANK[plan] < RANK[parts[k]!] ? <Locked tier={parts[k]!} label={label} /> : el;
  const wait = loading || (items.length > 0 && q.isLoading);
  return (
    <Card id="watch" title="Watchlist today" className="dx-watch" sub={!wait && items.length ? `${items.length} ${items.length === 1 ? "stock" : "stocks"} you follow` : undefined}>
      {wait ? <Rows n={4} h={36} /> : !items.length ? (
        <div className="dsh-empty"><b>No stocks yet</b><p>Add stocks to a watchlist to see how they moved today, how they split across the FinLit Prism bands and which have a high Valuation part.</p><Link className="dsh-btn" to="/watchlist">Open watchlist</Link></div>
      ) : <>
        {parts.buckets && gate("buckets", "Watchlist by band", <WatchBand items={items} />)}
        <div className="dx-wl-grid">
          {parts.movers && <div className="dx-col" data-v="mov"><h3 className="dx-colh">Movers</h3>{gate("movers", "Watchlist movers", <Movers items={priced} />)}</div>}
          {parts.second && <div className="dx-col" data-v="sl"><h3 className="dx-colh">Worth a second look</h3>{gate("second", "Worth a second look", <><SecondLook items={items} />
            <p className="dsh-sub">Listed: a Strong or Healthy FinLit Prism score (65 or more) with a Prism Valuation part of 65 or more.</p></>)}</div>}
        </div>
      </>}
    </Card>
  );
}
