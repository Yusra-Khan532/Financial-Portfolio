// Task #277 (All my investments pack of 20 Nov 2026, change 19; the Equity file §19): "What changed at the companies you own", under Step 4 (after Key
// figures). The companies: held directly, or 0.1% or more of everything through funds and ETFs (server: myinvest/calc.changes_list, kept for the alert).
// A switch: Everything · Direct · Through funds and ETFs · Watchlists. The line under each name is how it is held, as Step 4 shows it ("D F E 2.36% of
// everything"). The block itself (eight tiles, one row per company and kind, New since the last visit, Filing ↗, Details in Discover ↗, Alert me with the
// eight kinds, how often and notify via; one alert for the whole list counts as 1 of 300) is the shared one from Watchlists (task #272).
import { useMemo, useState } from "react";
import { WhatChanged, type ListTab } from "../components/changes/WhatChanged";
import { pctOf, type AllInvestments, type Company } from "../lib/myInvest";
import { useWatchlist } from "../lib/watchlist";
import { coLabel } from "../lib/mi391";
import { I } from "./parts";

export const THROUGH_MIN = 0.1;
type Pick = "all" | "direct" | "through" | "watch";

/** The same rule as the server, for an answer that does not carry the list (an older server or the demo). */
export function changesOf(d: AllInvestments): { direct: string[]; through: string[] } {
  if (d.changes) return d.changes;
  const ok = d.companies.filter((c) => c.symbol && !c.abroad);
  return { direct: ok.filter((c) => c.direct > 0).map((c) => c.symbol!), through: ok.filter((c) => c.direct === 0 && c.all >= THROUGH_MIN).map((c) => c.symbol!) };
}

const WORD = { D: "Direct", F: "Through a fund", E: "Through an ETF" } as const;
/** "D F E · 2.36% of everything"; a watchlist company you do not own says so. */
export function HeldLine({ c }: { c: Company | undefined }) {
  if (!c) return <>On your watchlist · not owned</>;
  return (<span className="mi7-wch" aria-label={`${c.held.map((m) => WORD[m as keyof typeof WORD]).join(", ")}; ${pctOf(c.all, 2)} of everything`}>
    <span className="mi-held" aria-hidden="true">{(["D", "F", "E"] as const).map((m) => <i key={m} className={c.held.includes(m) ? "on m" + m : ""}>{m}</i>)}</span>
    <span aria-hidden="true">{pctOf(c.all, 2)} of everything</span></span>);
}

/** QA of 21 Nov (item 7): what the "through" count counts. "52 of the 391 companies held only through funds and ETFs are 0.1% or more of everything; the 339
 *  smaller ones are left out here." */
export function smallLine(d: AllInvestments, ch: { through: string[] }): string | undefined {
  const only = d.companies.filter((c) => c.symbol && !c.abroad && c.direct === 0).length;
  if (only <= ch.through.length) return undefined;
  return `${ch.through.length} of the ${only} companies held only through funds and ETFs are ${THROUGH_MIN}% or more of everything; the ${only - ch.through.length} smaller ones are left out here.`;
}

export function InvestChanges({ d }: { d: AllInvestments }) {
  const ch = changesOf(d), wl = useWatchlist();
  const [pick, setPick] = useState<Pick>("all");
  const bySym = useMemo(() => new Map(d.companies.filter((c) => c.symbol).map((c) => [c.symbol!, c])), [d.companies]);
  const watch = useMemo(() => [...new Set(wl.lists.flatMap((l) => l.symbols))], [wl.lists]);
  const sets: Record<Pick, { symbols: string[]; label: string; ref: string; name: string }> = {
    all: { symbols: [...ch.direct, ...ch.through], label: "Everything", ref: "invest", name: "All my investments" },
    direct: { symbols: ch.direct, label: "Direct", ref: "equity", name: "your equity portfolio" },
    through: { symbols: ch.through, label: "Through funds and ETFs, 0.1% or more", ref: "invest:through", name: "All my investments (through funds and ETFs)" },
    watch: { symbols: watch, label: "Watchlists", ref: "watch", name: "your watchlists" },
  };
  const tabs: ListTab[] = (Object.keys(sets) as Pick[]).map((k) => ({ id: k, label: sets[k].label, count: sets[k].symbols.length }));
  const s = sets[pick];
  return (
    <div className="mi7-wc">
      <WhatChanged symbols={s.symbols} listName={s.name} listRef={s.ref} page="myinvest" lists={tabs} activeList={pick} onPickList={(id) => setPick(id as Pick)}
        title="What changed at the companies you own" nameOf={(x) => bySym.get(x)?.name} sub={(x) => <HeldLine c={bySym.get(x)} />}
        foot={smallLine(d, ch)} newTab
        /* task #391 (developer file 41 v4, A2): labelled as the other stops, so the sections read Step 1 to 7 */
        eyebrow={<p className="mi-eyebrow mi41-step">Step 5</p>}
        /* task #391 (developer file 35, Sections 4): tiles count updates, rows count filings, short company names, a closed "Not in Discover yet" list
           and the line on what an update is (the Equity page's block since task #385) */
        plain shortName={(x, n) => coLabel({ symbol: x, name: bySym.get(x)?.name ?? (n && n !== x ? n : null) })}
        help={<I k="what changed at the companies you own" what="Exchange filings from the last 90 days for the companies you own directly, and the larger ones you own through funds and ETFs, grouped by kind. From Discover."
          read="An update is one kind of news from one company; a row may bundle several filings, and then says how many." />} />
    </div>);
}
