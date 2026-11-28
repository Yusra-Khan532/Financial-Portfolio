// Sector Pulse, Simple view, exactly as the "FinLit final pages" pack draws it (13 Nov 2026, docs/design/finlit-final-pages/05-sector-pulse-simple.jpg): Today in one minute,
// the market's mood, how your industries are doing, the cycle, all industries by state, the industry map, momentum and strength side by side, standout stocks, which stocks
// are counted, too small for a reading and the words on the page. Every figure is the server's; the sentences are worked out in lib/pulsePack.ts. Describes, never advises.
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../../lib/api";
import { CoLogo } from "../../CoLogo";
import { LockedBlock } from "../Parts";
import { useSectorHistory, type SectorHistory, type StateKey } from "../../../lib/sectorHistory";
import { useIndustryMap } from "../../../lib/sectorExtra";
import type { Board, CornerCode, GroupRow } from "../../../lib/sectors";
import {
  BOX, BOX_ORDER, COLOUR, MEANING, ORDER, WORD, allChip, allSectors, groupsN, groupsSplit, sectorsIn, belowHigh, dayMon, bouncedAgo, byState, headline, isEarly, keyOf, matrix, matrixCards, meansForYou, risingOf, short, statesAt, todayThree, yourCards, yourOrder,
  type Holding,
} from "../../../lib/pulsePack";
import { Wallet, BoxChip, Cards, InsideLine, QuietList, Scroll, Section, Spark, StateChip, Swatch, Tip, useAccount, useShowAll } from "./Common";
import { coTitle, shortLabel } from "../../../lib/companyLabel";
import { SxFold } from "./PulseLayout";
import { MySectorsAlert, YourShort, usePeerLabels } from "./YourSectors";
import type { HeldShare } from "../../../lib/yourSectors";
import { AlertBell } from "./SectorAlert";
import { StandoutTable } from "./StandoutTable";
import { HoverCard, useHover } from "./PulseMap";
import { useWatchlist } from "../../../lib/watchlist";
import { gl, sq, tw, wordsShow } from "../../../lib/groupWords";

const n0 = (v: number) => v.toLocaleString("en-IN");

// ------------------------------------------------------------------------------------------------ Today in one minute
/** Task #448 (02 §1.3, fix 2): "the Nifty 50 is just 50 large companies, 7.3% above their 200-day average. Across all 1,235 stocks, only 48 in 100 are rising."
 *  Only when the Nifty 50 is above its 200-day average and more than half the groups are Sold off or Losing steam. The rising figure is every group's stocks above
 *  their medium trend, weighted by the stocks each group counts. */
export function marketUpLine(b: Board): string | null {
  const m = b.market, rows = b.rows;
  if (!m || m.above_200d !== true || m.pct_vs_200d == null || !rows.length) return null;
  const weak = rows.filter((r) => keyOf(r) === "sold_off" || keyOf(r) === "losing").length;
  if (weak * 2 <= rows.length) return null;
  const counted = rows.reduce((t, r) => t + (r.stocks_counted || 0), 0);
  const rising = rows.reduce((t, r) => t + ((r.breadth?.above_20 ?? 0) / 100) * (r.stocks_counted || 0), 0);
  if (!counted) return null;
  return `the Nifty 50 is just 50 large companies, ${m.pct_vs_200d.toFixed(1)}% above their 200-day average. Across all ${counted.toLocaleString("en-IN")} stocks, only ${Math.round((rising / counted) * 100)} in 100 are rising.`;
}
export const TODAY_HELP = "Today in one minute. What changed at the latest close: how many groups are in each state now and a week ago, one square per group, and the few things worth knowing.";
export function TodayMinute({ b, h, mine = new Set<string>(), noShares = false, signedIn = false, forYou, onLabels }: { b: Board; h: SectorHistory | undefined; mine?: Set<string>;
  /** task #448 (02 §1.5, fix 9): no shares and no watchlist: one row after the squares and tiles */ noShares?: boolean; signedIn?: boolean;
  /** task #448 (02 §1.2): For you this week, under the first-visit line */ forYou?: React.ReactNode; /** opens "What the labels mean" from the ⋯ menu */ onLabels?: () => void }) {
  const [newHere, setNewHere] = useState(() => { try { return localStorage.getItem("finlit-pulse-newhere") !== "closed"; } catch { return true; } });
  const box = useRef<HTMLDivElement>(null), hv = useHover(box), hovered = hv.h ? b.rows.find((r) => r.slug === hv.h!.slug) : undefined;
  // task #333 (file 30, polish 5): the squares run across the top, the counts are tiles in one row (number, state, change on last week), and three callouts sit in
  // one row under them; the headline's first sentence is a coloured chip (fix 2)
  const rows = b.rows, now = statesAt(h, 0), week = statesAt(h, 1);
  const hd = headline(rows, now, week, sectorsIn(b)), cards = todayThree(rows), upLine = marketUpLine(b);
  const squares = ORDER.flatMap((k) => rows.filter((r) => keyOf(r) === k).sort((a, c) => a.name.localeCompare(c.name)));
  const shown = ORDER.filter((k) => k !== "no_signal" || rows.some((r) => keyOf(r) === k));
  return (
    <section className="sp-sec" aria-labelledby="sx-today">
      <h2 id="sx-today">Today in one minute<Tip text={TODAY_HELP} label="About “Today in one minute”" /></h2>
      <p className="sp-sub">{tw("What changed in the industries, and what to keep an eye on.")}</p>
      {/* task #448 (02 §1.1, fixes 1 and 4): the two pages cover different spans; closed with ×, it stays closed in this browser */}
      {newHere && <p className="sx-newhere" data-testid="new-here"><span><b>New here?</b> Sector Pulse covers the last few weeks; <Link to={`/sectors/rotation${wordsShow() === "sectors" ? "?show=sectors" : "?show=industries"}`}>Sector Rotation</Link> covers 6 months. So {tw("an industry")} can read differently on each. {onLabels && <button type="button" className="sx-tlink" onClick={onLabels}>What the labels mean</button>}</span>
        <button type="button" className="sx-x" aria-label="Close: New here?" onClick={() => { setNewHere(false); try { localStorage.setItem("finlit-pulse-newhere", "closed"); } catch { /* private window: closed for this view only */ } }}>×</button></p>}
      {forYou}
      {/* task #448 (02 §1.3): the headline and its detail line read as one box, tinted by the headline's kind; fix 2: when the Nifty 50 is above its 200-day
          average but more than half the groups are Sold off or Losing steam, one more line says so, with the share of all counted stocks rising */}
      <div className={"sx-hlbox sx-hlbox-" + hd.tone}>
        <p className="sp-lead"><b className={"sx-hl sx-hl-" + hd.tone}>{hd.lead}</b>{tw(hd.rest)}</p>
        {hd.sub && <p className="sp-lead-sub">{tw(hd.sub)}</p>}
        {upLine && <p className="sp-lead-sub sx-upline"><b>Yet the market is up:</b> {upLine}</p>}
      </div>
      <div className="sx-today" ref={box} onMouseLeave={hv.hide}>
        <p className="sp-cap">{rows.every((r) => r.kind === "sector") ? allSectors(rows.length, sectorsIn(b)) : `All ${groupsSplit(rows)}`}, one square each</p>
        <ul className="sp-squares" aria-label={`${allSectors(rows.length, sectorsIn(b))}, coloured by their state`}>
          {squares.map((r) => <li key={r.slug}><Link to={gl(r.slug)} style={{ background: COLOUR[keyOf(r)] }} aria-label={`${short(r.name)}: ${WORD[keyOf(r)]}`}
            onMouseEnter={(e) => hv.show(r.slug, e.currentTarget)} onFocus={(e) => hv.show(r.slug, e.currentTarget)} onBlur={hv.hide} /></li>)}
        </ul>
        {hovered && hv.h && <HoverCard r={hovered} mine={mine.has(hovered.slug)} at={hv.h} />}
        <ul className="sx-tiles" style={{ ["--n" as string]: shown.length }} aria-label="How many are in each state, and the change on last week">{shown.map((k) => {
          const v = rows.filter((r) => keyOf(r) === k).length, was = week?.[k], d = was == null ? null : v - was;
          return <li key={k} className="sx-tile"><b>{v}</b><span className="sx-tile-k"><Swatch k={k} />{WORD[k]}<Tip text={MEANING[k]} label={`About “${WORD[k]}”`} /></span>
            <small>{d == null ? "–" : d === 0 ? "same as last week" : `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} than last week`}</small></li>;
        })}</ul>
      </div>
      {noShares && <div className="sx-noshares" data-testid="no-shares"><p><b>See where your own shares sit.</b> {tw("Add them and both pages show your industries first.")}</p>
        <Link className="sx-go" to={signedIn ? "/portfolio" : "/login?next=/portfolio"}>Add my shares</Link><Link className="sx-go2" to="/watchlists">Start a watchlist</Link></div>}
      <QuietList items={cards} />{/* task #448 (01 §4): on Today, things to know are one quiet list */}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ How your industries are doing
type Membership = { groups: Record<string, { slug: string; name: string }> };
type Src = "hold" | "watch" | "both";
/** The share pills of one row: at most three show, "+N" opens the rest; watchlist shares have a dashed outline (task #333, polish 1 and 9: symbol only). */
function Pills({ syms }: { syms: { symbol: string; wl: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? syms : syms.slice(0, 3);
  return (
    <div className="sp-mine">{shown.map((x) => <Link key={x.symbol} to={`/stocks/${x.symbol}`} className={"sp-sym" + (x.wl ? " sx-wl" : "")} title={x.wl ? `${x.symbol} (watchlist)` : x.symbol}>{x.symbol}</Link>)}
      {syms.length > 3 && <button type="button" className="sx-pmore" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "fewer" : `+${syms.length - 3}`}</button>}</div>
  );
}
export function YourIndustries({ b, h, symbols, signedIn, heldShares = [] }: { b: Board; h: SectorHistory | undefined; symbols: string[]; signedIn: boolean;
  /** task #448 (06): the member's shares with quantity, last close and group, for value */ heldShares?: HeldShare[] }) {
  // task #333 (file 30, addition 6): the switch My portfolio · My watchlist · Both; every row shown; a bell in its own last column (addition 5); no shares and no
  // watchlist: "Your sectors will show here"
  const wl = useWatchlist();
  const watchSyms = useMemo(() => [...new Set(wl.lists.flatMap((l) => l.symbols.map((x) => x.toUpperCase())))], [wl]);
  const [src, setSrc] = useState<Src>(() => (symbols.length ? "hold" : "watch"));
  const cur = src === "hold" && !symbols.length && watchSyms.length ? "watch" : src;
  const all = useMemo(() => [...new Set([...symbols, ...watchSyms])].sort(), [symbols, watchSyms]);
  const key = all.join(",");
  const q = useQuery<Membership, ApiError>({ queryKey: ["sectors", "membership", key, wordsShow()], queryFn: () => apiGet<Membership>(`/api/sectors/membership?symbols=${encodeURIComponent(key)}` + sq(false)), enabled: all.length > 0, staleTime: 3_600_000, retry: false });
  const pick = cur === "hold" ? symbols : cur === "watch" ? watchSyms : all;
  const own = new Set(symbols);
  const held: Holding[] = pick.flatMap((s) => (q.data?.groups[s] ? [{ symbol: s, slug: q.data.groups[s].slug }] : []));
  const mine = b.rows.filter((r) => held.some((x) => x.slug === r.slug)).sort(yourOrder);
  const spark = (slug: string) => h?.groups.find((g) => g.slug === slug)?.rising ?? [];
  const portfolioHeld: Holding[] = symbols.flatMap((s) => (q.data?.groups[s] ? [{ symbol: s, slug: q.data.groups[s].slug }] : []));
  const empty = !symbols.length && !watchSyms.length;
  // task #448 (02 §2): the short grouped view first, the table one press away; Count by on My portfolio only (Value by default)
  const [by, setBy] = useState<"value" | "count">("value"), [table, setTable] = useState(false), [allRows, setAllRows] = useState(false);
  const count = cur === "hold" ? by : "count";
  const bySym = new Map(heldShares.map((x) => [x.symbol, x]));
  const srcShares: HeldShare[] = pick.map((sym) => ({ symbol: sym, qty: cur === "watch" ? 0 : bySym.get(sym)?.qty ?? 0, price: bySym.get(sym)?.price ?? null, slug: q.data?.groups[sym]?.slug ?? null }));
  const labels = usePeerLabels(mine.map((r) => r.slug));
  const wlOnly = new Set(watchSyms.filter((x) => !own.has(x)));
  const inGroups = srcShares.filter((x) => x.slug && mine.some((r) => r.slug === x.slug)).length;
  const sharesWord = cur === "watch" ? "watchlist shares" : "shares";
  const sharesLine = !mine.length ? undefined : inGroups === pick.length
    ? tw(`${mine.length} ${mine.length === 1 ? "industry holds" : "industries hold"} your ${pick.length} ${pick.length === 1 ? sharesWord.replace("shares", "share") : sharesWord}.`)
    : tw(`${mine.length} ${mine.length === 1 ? "industry holds" : "industries hold"} ${inGroups} of your ${pick.length} ${sharesWord} (${pick.length - inGroups} ${pick.length - inGroups === 1 ? "has" : "have"} no NSE industry).`);
  const tableRows = allRows ? mine : mine.slice(0, 8);
  return (
    <Section id="sx-yours" title={tw("How your industries are doing")} help={tw("Your industries: the NSE industries of the shares in your portfolio or on your watchlist. Each one's state today, how it compares with other industries (Sector Rotation) and how many of its stocks have been rising over 6 months.")}
      sub={sharesLine} right={mine.length ? <MySectorsAlert count={mine.length} /> : undefined}
      why={tw("A share rarely swims against its whole industry for long. Knowing whether your industries are rising or falling tells you what your shares are up against.")}>
      {empty ? (
        <div className="sx-empty" data-testid="your-empty"><b>{tw("Your industries will show here")}</b>
          <p>{tw("Add the shares you hold, or build a watchlist, and this box shows which of your industries are rising, falling, leading or lagging.")}</p>
          <p><Link className="sx-go" to={signedIn ? "/portfolio" : "/login?next=/portfolio"}>Add my shares</Link><Link className="sx-go2" to="/watchlists">Open my watchlist</Link></p></div>
      ) : <>
        <div className="sx-src" role="group" aria-label="Which shares"><span>{tw("Industries of")}</span>
          <button type="button" aria-pressed={cur === "hold"} onClick={() => setSrc("hold")}>My portfolio <small>{symbols.length} {symbols.length === 1 ? "share" : "shares"}</small></button>
          <button type="button" aria-pressed={cur === "watch"} onClick={() => setSrc("watch")}>My watchlist <small>{watchSyms.length} {watchSyms.length === 1 ? "share" : "shares"}</small></button>
          <button type="button" aria-pressed={cur === "both"} onClick={() => setSrc("both")}>Both</button>
          {cur === "hold" && <span className="sx-countby" role="group" aria-label="Count by"><span>Count by<Tip label="About “Count by”" text="Value weighs each share by what you hold in it (quantity × last close). Number of shares counts every share once, whatever its size." /></span>
            <button type="button" aria-pressed={by === "value"} onClick={() => setBy("value")}>Value</button><button type="button" aria-pressed={by === "count"} onClick={() => setBy("count")}>Number of shares</button></span>}</div>
        {q.isLoading ? <div className="sx-skel" style={{ height: 120 }} role="status" aria-label={tw("Loading your industries")} />
          : !pick.length ? <p className="sp-empty">{cur === "hold" ? "Your portfolio has no shares yet." : "Your watchlist has no shares yet."}</p>
          : !mine.length ? <p className="sp-empty">None of these {pick.length} {tw("shares is in an industry with a reading today: NSE has not given them an industry, or their industry has too few counted stocks.")}</p>
          : <>
            {cur === "hold" && <Cards items={yourCards(b.rows, portfolioHeld).slice(0, 1)} />}{/* the callout is about the portfolio, so it shows only on My portfolio */}
            {!table && <YourShort b={b} h={h} held={srcShares} by={count} labels={labels} labelOf={(k) => WORD[k]} wlSet={wlOnly} />}
            <p className="sx-tbl-toggle"><button type="button" className="sx-tlink" aria-expanded={table} onClick={() => setTable(!table)}>{table ? "Back to the short view ▴" : "See every column, as a table ▾"}</button></p>
            {table && <><Scroll label={tw("your industries")}><table className="sp-tb sp-yours">
              <thead><tr><th scope="col">{tw("Industry and your shares")}</th><th scope="col">Its state today<Tip label="About “Its state today”" text={tw("The industry's state at the latest close: sold off, bouncing back, rising together or losing steam.")} /></th>
                <th scope="col">{tw("Against other industries")}<Tip label={`About “${tw("Against other industries")}”`} text="Its Sector Rotation box and rank: how it has done against the average group over 6 months and over the last month." /></th>
                <th scope="col">Stocks rising · last 6 months<Tip label="About “Stocks rising · last 6 months”" text="The line: out of every 100 of its counted stocks, how many were above their medium trend each day for 6 months. Dashed: half." /></th><th scope="col">What it means for you</th>
                <th scope="col" className="sx-alh">Alert</th></tr></thead>
              <tbody>{tableRows.map((r) => {
                const m = meansForYou(r), syms = held.filter((x) => x.slug === r.slug).map((x) => ({ symbol: x.symbol, wl: !own.has(x.symbol) })), up = risingOf(r);
                return (<tr key={r.slug}>
                  <td><Link className="sp-ind" to={gl(r.slug)}>{short(r.name)}</Link><Pills syms={syms} /></td>
                  <td><StateChip k={keyOf(r)} /></td>
                  <td><BoxChip corner={r.rotation?.corner} />{r.rotation?.rank != null && <small className="sp-rank">rank {r.rotation.rank} of {r.rotation.ranked}</small>}</td>
                  <td><span className="sp-sparkc"><Spark values={spark(r.slug)} label={`${short(r.name)}: stocks rising over 6 months`} /><span className="sp-of"><b>{up ?? "–"} of {r.stocks_counted}</b><small>stocks rising</small></span></span></td>
                  <td><span className={"sp-mean sp-" + m.tone}>{m.text}</span></td>
                  <td className="sx-alc"><AlertBell slug={r.slug} name={short(r.name)} compact /></td>
                </tr>);
              })}</tbody>
            </table></Scroll>
            {mine.length > 8 && <button type="button" className="sp-showall" aria-expanded={allRows} onClick={() => setAllRows(!allRows)}>{allRows ? "Show fewer ▴" : tw(`Show all ${mine.length} industries ▾`)}</button>}</>}
          </>}
      </>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ The cycle industries move through
const CYCLE: { k: StateKey; line: string; next: string }[] = [
  { k: "sold_off", line: "Most stocks have fallen; no bounce yet.", next: "Most stocks turning up together." },
  { k: "bouncing", line: "Most stocks turned up together after a fall. Includes Bouncing back after a crash.", next: "Whether the bounce holds for weeks." },
  { k: "rising", line: "Most stocks are above their short, medium and longer trend.", next: "Fewer stocks keeping up." },
  { k: "losing", line: "A bounce or rise is losing support.", next: "A new sell-off, or a fresh bounce." },
];
export function Cycle({ b }: { b: Board }) {
  const count = (k: StateKey) => b.rows.filter((r) => keyOf(r) === k || (k === "bouncing" && keyOf(r) === "crash")).length;
  return (
    <Section id="sp-cycle" title={tw("The cycle industries move through")} help={tw("The cycle. Most industries go round four stages: sold off, bouncing back, rising together and losing steam. The number on each stage is how many groups sit in it today.")} sub={tw("Most industries go round these four stages. Many bounces fade before the next stage, so the cycle is a map, not a timetable.")}>
      <ol className="sp-cycle">{CYCLE.map((c, i) => (
        <li key={c.k} className={"sp-cyc sp-cyc-" + c.k}>
          <div className="sp-cyc-h"><StateChip k={c.k} help /><b className="sp-cyc-n">{count(c.k)}</b></div>
          <p>{c.line}</p><p className="sp-cyc-next"><b>What to watch next:</b> {c.next}</p>
          {i < CYCLE.length - 1 && <span className="sp-cyc-ar" aria-hidden="true">→</span>}
        </li>))}</ol>
      <p className="sp-note">{tw("From Losing steam an industry usually goes back to Sold off, or bounces again.")}</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ All industries, by state
function StateGroup({ k, rows: all, mine, every }: { k: StateKey; rows: GroupRow[]; mine: Set<string>; every?: boolean }) {
  const bounce = k === "crash" || k === "bouncing", { shown, button } = useShowAll(all, 5), rows = every ? all : shown;   // a filter that is on shows every matching row
  return (
    <div className={"sp-grp sp-grp-" + k}>
      <div className="sp-grp-h"><StateChip k={k} help /><p>{MEANING[k]}</p><b>{all.length}</b></div>
      <table className="sp-tb sp-grp-t sx-incards">
        <thead><tr><th scope="col">{tw("Industry")}</th><th scope="col">Stocks rising<Tip label="About “Stocks rising”" text={tw("Out of the industry's counted stocks, how many are above their medium trend. The bar fills up as more of them rise; past halfway, most are rising.")} /></th>
          <th scope="col" className="r">{bounce ? "Bounced" : "Below 1-yr high"}<Tip label={`About “${bounce ? "Bounced" : "Below 1-yr high"}”`} text={bounce ? "When most of its stocks turned up together, in trading days." : tw("How far the industry (its stocks averaged equally) is below its highest point of the past year.")} /></th></tr></thead>
        <tbody>{rows.map((r) => { const up = risingOf(r) ?? 0; return (
          <tr key={r.slug} className={mine.has(r.slug) ? "sx-mine" : undefined}><td><Link className="sp-ind" to={gl(r.slug)}>{short(r.name)}</Link>{mine.has(r.slug) && <>{"\u2060"}<Wallet /></>}{isEarly(r) && <span className="sp-tag sp-early">Early sign</span>}</td>
            <td data-label="Stocks rising"><span className="sp-barw"><span className="sp-bar"><i style={{ width: `${Math.min(100, (r.breadth.above_20 ?? 0))}%`, background: COLOUR[k] }} /></span><b>{up} of {r.stocks_counted}</b></span></td>
            <td className="r" data-label={bounce ? "Bounced" : "Below 1-yr high"}>{bounce ? bouncedAgo(r) ?? "–" : belowHigh(r.index_vs_52w_high) ?? "–"}</td></tr>); })}</tbody>
      </table>
      {!every && button}
    </div>
  );
}
export function ByState({ b, mine }: { b: Board; mine: Set<string> }) {
  // task #448 (02 §3 By state): a lead sentence above the state tabs; one state at a time, opening on the largest; Show All · My sectors on the tabs' row; How to
  // read a row folded into a title-row button; the early-sign note is a thing to know (a pill in the title row)
  const [only, setOnly] = useState(false), [how, setHow] = useState(false);
  const g = byState(b.rows.filter((r) => !only || mine.has(r.slug)));
  const all = byState(b.rows);
  const fin = b.rows.find((r) => keyOf(r) === "crash" || keyOf(r) === "bouncing") ?? b.rows[0];
  const early = g.flatMap((x) => x.rows).filter(isEarly);          // in the group's own order (most stocks rising first)
  const order = [...g.filter((x) => x.key !== "sold_off" && x.key !== "no_signal"), ...g.filter((x) => x.key === "sold_off" || x.key === "no_signal")];
  const biggest = [...g].sort((a, c) => c.rows.length - a.rows.length)[0]?.key;
  const [tab, setTab] = useState<StateKey | null>(null);
  const cur = tab && g.some((x) => x.key === tab) ? tab : biggest;
  const ns = tw("industries"), lead = stateLead(all, ns);
  return (
    <Section id="sp-bystate" title={`${allSectors(b.rows.length, sectorsIn(b))}, by state`} help="All groups, by state. Every group with a reading, grouped by its state today. Inside each state the freshest bounce or the most stocks rising comes first; the bar is how many of its counted stocks are above their medium trend." sub={tw("Grouped by state. Inside each industry, the freshest bounce or the most stocks rising comes first. Select an industry to open its page.")}
      right={fin ? <button type="button" className="sx-whyb" aria-expanded={how} aria-controls="sp-howrow" onClick={() => setHow(!how)}>How to read a row {how ? "▴" : "▾"}</button> : undefined}>
      {how && fin && <div className="sp-howrow" id="sp-howrow"><b>How to read a row:</b><span className="sp-howex">{short(fin.name)}<span className="sp-bar"><i style={{ width: `${fin.breadth.above_20}%`, background: COLOUR[keyOf(fin)] }} /></span><b>{risingOf(fin)} of {fin.stocks_counted}</b></span>
        <p>means {risingOf(fin)} of the {fin.stocks_counted} counted {short(fin.name).toLowerCase()} stocks are above their medium-term trend. The bar fills up as more of them rise; past halfway, most are rising.</p></div>}
      {lead && <p className="sx-yr-lead"><b>{lead.b}</b>{lead.rest}</p>}
      <div className="sx-stabrow">
        <div className="sx-fl sx-stabs" role="group" aria-label="State">{order.map((x) => <button key={x.key} type="button" aria-pressed={cur === x.key} onClick={() => setTab(x.key)}><i className="sx-dot" style={{ background: COLOUR[x.key] }} aria-hidden="true" />{WORD[x.key]} <small>{x.rows.length}</small></button>)}</div>
        {mine.size > 0 && <div className="sx-fl" role="group" aria-label="Show"><span>Show</span>
          <button type="button" aria-pressed={!only} onClick={() => setOnly(false)}>{allChip(b.rows.length)}</button>
          <button type="button" aria-pressed={only} onClick={() => setOnly(true)}><Wallet small />{tw("My industries")} <small>{b.rows.filter((r) => mine.has(r.slug)).length}</small></button></div>}
      </div>
      {g.filter((x) => x.key === cur).map((x) => <StateGroup key={x.key} k={x.key} rows={x.rows} mine={mine} every={only} />)}
      {early.length >= 2 && <Cards items={[{ kind: "insight", title: `Why are ${short(early[0].name)} and ${short(early[1].name)} here, with so many stocks rising?`, text: tw("An industry moves to Bouncing back only when most of its stocks turn up together, quickly. Industries marked EARLY SIGN have been climbing slowly instead: most of their stocks are already above their short trend. Worth watching.") }]} />}
    </Section>
  );
}
/** "16 sectors are sold off. 2 are bouncing back after a crash and 1 is losing steam." (05 §7), the largest state first. */
export function stateLead(groups: { key: StateKey; rows: unknown[] }[], ns: string): { b: string; rest: string } | null {
  const list = groups.filter((x) => x.rows.length).sort((a, c) => c.rows.length - a.rows.length);
  if (!list.length) return null;
  const word = (k: StateKey) => (k === "no_signal" ? "show no clear signal" : WORD[k].toLowerCase());
  const [h, ...t] = list, one = ns.replace(/ies$/, "y").replace(/s$/, "");
  const bits = t.map((x) => `${x.rows.length} ${x.rows.length === 1 ? (x.key === "no_signal" ? "shows" : "is") : (x.key === "no_signal" ? "show" : "are")} ${x.key === "no_signal" ? "no clear signal" : WORD[x.key].toLowerCase()}`);
  return { b: `${h.rows.length} ${h.rows.length === 1 ? one : ns} ${h.rows.length === 1 ? (h.key === "no_signal" ? "shows" : "is") : (h.key === "no_signal" ? "show" : "are")} ${h.key === "no_signal" ? "no clear signal" : word(h.key)}.`,
    rest: bits.length ? ` ${bits.length > 1 ? bits.slice(0, -1).join(", ") + " and " + bits[bits.length - 1] : bits[0]}.` : "" };
}

// ------------------------------------------------------------------------------------------------ Industry map
type LabelIn = { id: string; text: string; cx: number; cy: number };
/** Names beside the dots, as many as fit: each tries the right, then the left, then above and below its dot, and is left out (the dot keeps its tooltip and the list below
 *  names it) when every place would cover another name or a dot. Wider dots first, so the crowded middle does not crowd out the edges. */
export function placeLabels(dots: LabelIn[], box: { left: number; right: number; top: number; bottom: number }, cw = 6.4, lh = 14) {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = dots.map((d) => ({ x0: d.cx - 8, x1: d.cx + 8, y0: d.cy - 8, y1: d.cy + 8 }));
  const hit = (b: { x0: number; x1: number; y0: number; y1: number }) => b.x0 < box.left || b.x1 > box.right || b.y0 < box.top || b.y1 > box.bottom || placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  const out: { id: string; text: string; x: number; y: number; anchor: "start" | "end" | "middle" }[] = [];
  for (const d of [...dots].sort((a, b) => Math.abs(b.cx - (box.left + box.right) / 2) - Math.abs(a.cx - (box.left + box.right) / 2))) {
    const w = d.text.length * cw;
    const tries: [number, number, "start" | "end" | "middle"][] = [[d.cx + 11, d.cy + 4, "start"], [d.cx - 11, d.cy + 4, "end"], [d.cx, d.cy - 12, "middle"], [d.cx, d.cy + 20, "middle"]];
    for (const [tx, ty, a] of tries) {
      const x0 = a === "start" ? tx : a === "end" ? tx - w : tx - w / 2, b = { x0, x1: x0 + w, y0: ty - lh + 3, y1: ty + 3 };
      if (!hit(b)) { placed.push(b); out.push({ id: d.id, text: d.text, x: tx, y: ty, anchor: a }); break; }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ Momentum and strength, side by side
/** Task #448 (02 §4 Against other sectors): which list a sector falls in. Strong: rising together or bouncing back, and Ahead on Sector Rotation; weak: sold off or
 *  losing steam, and Behind; every other sector with a box reads differently on each page. A sector with no box yet is left out. */
export type MxList = "strong" | "mixed" | "weak";
export function mxList(r: GroupRow): MxList | null {
  const c = r.rotation?.corner;
  if (!c || c === "middle") return null;
  const k = keyOf(r), ahead = c === "ahead_gaining" || c === "ahead_slowing";
  if ((k === "rising" || k === "bouncing" || k === "crash") && ahead) return "strong";
  if ((k === "sold_off" || k === "losing") && !ahead) return "weak";
  return "mixed";
}
/** The group a sector shares with others in its list: "Sold off · Behind and slipping", or "Ahead over 6 months, sold off now". */
export function mxGroup(r: GroupRow, list: MxList): string {
  const c = r.rotation!.corner as Exclude<CornerCode, "middle">, k = keyOf(r);
  if (list !== "mixed") return `${WORD[k]} · ${BOX[c].word}`;
  return `${c.startsWith("ahead") ? "Ahead" : "Behind"} over 6 months, ${k === "no_signal" ? "with no clear signal" : WORD[k].toLowerCase()} now`;
}
const MX_OPEN = new Set<string>();   // the groups opened, kept while the member stays on the page
const MX_CARDS: { k: MxList; title: string; line: string; tone: string }[] = [
  { k: "strong", title: "Strong on both pages", line: "Its stocks are turning up now, and it has beaten other sectors over 6 months.", tone: "good" },
  { k: "mixed", title: "The two pages disagree", line: "Strong on one page, weak on the other.", tone: "watch" },
  { k: "weak", title: "Weak on both pages", line: "Most of its stocks are not rising, and it has trailed other sectors over 6 months.", tone: "bad" },
];
export function Momentum({ b, mine }: { b: Board; mine: Set<string> }) {
  const [view, setView] = useState<"lists" | "grid">("lists"), [, bump] = useState(0);
  const ns = tw("industries"), withBox = b.rows.filter((r) => mxList(r));
  const of = (k: MxList) => withBox.filter((r) => mxList(r) === k).sort((a, c) => (a.rotation?.rank ?? 99) - (c.rotation?.rank ?? 99));
  const strong = of("strong"), weak = of("weak"), mixed = of("mixed");
  const yoursWeak = weak.filter((r) => mine.has(r.slug)).length;
  const lead = { b: strong.length ? `${strong.length} ${strong.length === 1 ? tw("industry is") : `${ns} are`} strong on both pages.` : tw("No industry is strong on both pages."),
    rest: ` ${weak.length} ${weak.length === 1 ? tw("industry is") : `${ns} are`} weak on both${weak.length && mine.size ? ` (${yoursWeak === weak.length ? (weak.length === 1 ? "it is yours" : "all of them yours") : `${yoursWeak} of them yours`})` : ""}, and ${mixed.length} read${mixed.length === 1 ? "s" : ""} differently on each.` };
  const toggle = (id: string) => { if (MX_OPEN.has(id)) MX_OPEN.delete(id); else MX_OPEN.add(id); bump((x) => x + 1); };
  return (
    <Section id="sp-momentum" title="Momentum and strength, side by side" help={tw("Each industry on both pages: is its state on Sector Pulse strong (rising together or bouncing back) or weak (sold off or losing steam), and is its box on Sector Rotation ahead of or behind the average group over 6 months? An industry with no box yet is left out.")}
      sub={<>{tw("Each industry, on both pages. Are its stocks turning up now (Sector Pulse)? Has it beaten other industries over 6 months (Sector Rotation)?")}{mine.size > 0 && <> <span className="sx-nowrap"><Wallet spoken /> marks {tw("your industries")}.</span></>}</>}
      why={tw("A bounce in an industry that was already strong has more behind it than a bounce in one that keeps losing ground. Where both views agree, the picture is clearer.")}>
      <Cards items={matrixCards(b.rows).slice(0, 1)} />{/* task #333: one thing to know, now a pill in the title row */}
      <p className="sx-yr-lead"><b>{lead.b}</b>{lead.rest}</p>
      <div className="sx-fl" role="group" aria-label="Show as"><span>Show as</span>
        <button type="button" aria-pressed={view === "lists"} onClick={() => setView("lists")}>Three lists</button><button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>Grid</button></div>
      {view === "grid" ? <MomentumGrid b={b} mine={mine} /> : (
        <div className="sx-mx3">{MX_CARDS.map((card) => {
          const rows = of(card.k), groups = new Map<string, GroupRow[]>();
          for (const r of rows) { const g = mxGroup(r, card.k); groups.set(g, [...(groups.get(g) ?? []), r]); }
          return (
            <section key={card.k} className={"sx-mx3-card sx-mx3-" + card.tone} aria-labelledby={`sx-mx3-${card.k}`}>
              <h3 id={`sx-mx3-${card.k}`} className="sx-mx3-t">{card.title} <span className="sx-cnt">{rows.length}</span></h3>
              <p className="sx-mx3-line">{card.line.replace("sectors", ns)}</p>
              {!rows.length ? <p className="sp-empty">None right now.</p> : [...groups.entries()].map(([g, list]) => {
                const id = `${card.k}:${g}`, open = MX_OPEN.has(id), m = list.filter((r) => mine.has(r.slug)).length;
                const tip = m === 0 ? "" : m === list.length ? (list.length === 1 ? tw("Includes your industry") : tw("Includes only your industries")) : tw(`Includes ${m} of your ${m === 1 ? "industry" : "industries"}`);
                return (
                  <div key={g} className="sx-dd">
                    <button type="button" className="sx-dd-h" aria-expanded={open} aria-controls={`sx-dd-${card.k}-${slugify(g)}`} onClick={() => toggle(id)}>
                      <span className="sx-dd-w">{g}</span>{m > 0 && <Wallet title={tip} />}<span className="sx-cnt">{list.length}</span><span className="sx-dd-ar" aria-hidden="true">▾</span></button>
                    {open && <ul id={`sx-dd-${card.k}-${slugify(g)}`} className="sx-dd-l">{list.map((r) => <li key={r.slug}><Link className="sx-l-row" to={gl(r.slug)}><span>{short(r.name)}</span>{mine.has(r.slug) && <Wallet />}<span className="sx-l-ar" aria-hidden="true">›</span></Link></li>)}</ul>}
                  </div>);
              })}
            </section>);
        })}</div>)}
    </Section>
  );
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
/** The site's grid, as it was (Show as: Grid). */
function MomentumGrid({ b, mine }: { b: Board; mine: Set<string> }) {
  const mx = matrix(b.rows), slugOf = (name: string) => b.rows.find((r) => r.name === name)?.slug ?? "";
  return (
    <>
      <Scroll label="momentum and strength"><div className="sp-mx sx-mx">
        <div className="sp-mx-c sp-mx-corner">{tw("Stocks turning up? ↓ · Beating other industries? →")}</div>
        {BOX_ORDER.map((c) => <div key={c} className={"sp-mx-c sp-mx-col sp-box-" + BOX[c].tone}><b aria-hidden="true">{BOX[c].arrow}</b> {BOX[c].word}<Tip label={`About “${BOX[c].word}”`} text={tw("A Sector Rotation box: how the industry has done against the average group over 6 months and over the last month.")} /></div>)}
        {mx.states.map((k) => <>
          <div key={k} className="sp-mx-c sp-mx-row"><StateChip k={k} help /></div>
          {BOX_ORDER.map((c) => { const cell = mx.cells[k + ":" + c]; return (
            <div key={k + c} data-label={BOX[c].word} className={"sp-mx-c sp-mx-cell" + (cell.mark ? " sp-mx-" + cell.mark : "") + (cell.names.length ? "" : " sp-mx-none")}>
              {cell.mark && <p className="sp-mx-mark">{cell.mark === "strongest" ? "Strongest mix" : "Weakest mix"}</p>}
              {/* task #333 (second pass 5): each name is its own chip, the member's own bold with a gold edge, and the cell says how many it holds */}
              {cell.names.length ? <><b className="sx-mxn" aria-label={`${cell.names.length} in this cell`}>{cell.names.length}</b>
                <ul className="sx-mxl">{cell.names.map((nm) => <li key={nm}><Link to={gl(slugOf(nm))}>{short(nm)}</Link>{mine.has(slugOf(nm)) && <Wallet />}</li>)}</ul></> : "none"}
            </div>); })}
        </>)}
      </div></Scroll>
      {mine.size > 0 && <p className="sp-note"><Wallet spoken /> marks {tw("your industries")}. The number is how many are in the cell.</p>}{/* task #448 (04 §1): the wallet, not bold with a gold edge */}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ Standout stocks in weak industries
export function Standouts({ b, mine = new Set<string>() }: { b: Board; mine?: Set<string> }) {
  const every = b.leader_flags;   // task #333 (polish 7): All · Strong · Early · In my sectors; task #448: every column sorts (StandoutTable)
  return (
    <Section id="sp-standouts" title={tw("Standout stocks in weak industries")} help={tw("Standout stocks. Stocks at a new 1-year high while their industry is still well below its own high. They are holding up better than their neighbours.")}
      sub={tw("Stocks at a new 1-year high while their own industry is still well below its high.")}
      why={tw("When most of an industry is down, a stock that keeps making new highs is showing strength of its own. It is a place to start your research, not a signal to act on.")}>
      {every == null ? <LockedBlock plan="silver" name="Platinum" title="The standout stocks are part of the Platinum plan">{tw("The industry states and the stocks rising are open to everyone. Platinum lists every stock at a new 1-year high inside a weak industry, with how far its industry is below its own high.")}</LockedBlock>
        : !every.length ? <p className="sp-empty">{tw("No stock is at a new 1-year high inside a weak industry today.")}</p>
        : <StandoutTable b={b} mine={mine} first={8} />}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Which stocks are counted · Too small for a reading
type SmallGroup = { slug: string; name: string; counted: number; listed: number | null; locked?: string; stocks: { symbol: string; name: string; ret_6m: number | null }[] | null };
function SmallList({ slug, name }: { slug: string; name: string }) {
  const q = useQuery<SmallGroup, ApiError>({ queryKey: ["sector-small", slug, wordsShow()], queryFn: () => apiGet<SmallGroup>(`/api/sectors/small/${encodeURIComponent(slug)}` + sq()), staleTime: 300_000, retry: false });
  if (q.isLoading) return <span className="sp-nil">Loading…</span>;
  if (q.data?.locked) return <span className="sp-nil">The stocks are part of the Platinum plan.</span>;
  if (!q.data?.stocks?.length) return <span className="sp-nil">No listed stock carries this group's name in the screener today.</span>;
  return <span className="sp-smalls" aria-label={`Stocks in ${name}`}>{q.data.stocks.map((s) => <Link key={s.symbol} to={`/stocks/${s.symbol}`} className="sp-sym" title={coTitle(s)}><CoLogo symbol={s.symbol} size={16} inline />{shortLabel(s)}</Link>)}</span>;
}
export function CountedAndSmall({ b }: { b: Board }) {
  const u = b.universe, few = b.too_few_stocks ?? [], total = few.reduce((s, x) => s + x.stocks_counted, 0), acc = useAccount(b);
  const day = u ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(u.date + "T00:00:00Z").getUTCDay()]} ${dayMon(u.date)}` : "";
  return (
    <div className="sp-two sp-two-tight">
      {u && <Section id="sp-counted" title="Which stocks are counted" help="Only actively traded, established stocks are counted, so a few rarely traded names cannot swing the reading." sub="Only actively traded, established stocks, so a few rarely traded names cannot swing the reading.">
        <div className="sp-tiles">
          <div><small>{tw("NSE stocks with an industry")}</small><b>{n0(u.stocks_with_industry_traded)}</b><span>traded on {day}</span></div>
          <div><small>Actively traded and established</small><b>{n0(u.meet_rules)}</b><span>pass our checks</span></div>
          <div><small>{tw("Counted in an industry reading")}</small><b>{n0(u.counted_in_groups_with_reading)}</b><span>in the {groupsN(b.rows.length)} below</span></div>
        </div>
        <p className="sp-note">{tw("The list is reviewed once a month. Stocks left out still appear on each industry's page, marked \"not counted\".")}</p>
      </Section>}
      {few.length > 0 && <Section id="sp-small" title="Too small for a reading" help="Too small for a reading. Groups with too few actively traded stocks for a steady reading: one share moving could flip the whole state. Their stocks still appear on their own pages." sub={`${groupsSplit(few)} have too few counted stocks for a steady reading, ${total} stocks between them.`}>
        <details className="sp-more"><summary>Show the {groupsN(few.length)} ▾</summary>
          <ul className="sp-smalllist">{few.map((g) => <li key={g.slug}><details><summary><b>{short(g.name)}</b> <small>{g.stocks_counted} stocks</small>{g.kind === "sector" && <InsideLine list={acc?.inside[g.slug]} />}</summary><SmallList slug={g.slug} name={g.name} /></details></li>)}</ul>
        </details>
        {acc && <p className="sp-note" data-testid="all-59">{acc.line}</p>}
        {few.some((g) => g.name === "Diversified") && <p className="sp-note"><b>Diversified</b> is NSE's name for conglomerates, companies that run several unrelated businesses. It has nothing to do with diversifying your portfolio.</p>}
      </Section>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Words on this page
const WORDS: [string, string][] = [
  ["Sold off", tw("Most of this industry's stocks have fallen below their usual price level, and they have not turned up together yet. The industry is out of favour for now.")],
  ["Bouncing back", tw("After a fall, most of the industry's stocks turned up together within a few days. It is the first sign of a recovery, and it can still fade.")],
  ["Bouncing back after a crash", tw("The same broad bounce, but after a deep fall in which almost every stock in the industry hit a new low. Bounces after a crash can be sharp, and they can also fade.")],
  ["Rising together", tw("Most of the industry's stocks are above their short, medium and longer-term price levels. The rise is broad, not carried by a few names.")],
  ["Losing steam", tw("A bounce or a rise that is losing support: fewer of the industry's stocks are still going up.")],
  ["Stocks rising", tw("Out of every 100 actively traded stocks in the industry, how many are trading above their medium trend. Above 50 means most of them are going up.")],
  ["Short trend", tw("How many of the industry's stocks are above their average price of the last few weeks. It reacts first, so it moves a lot.")],
  ["Medium trend", "How many are above their average price of roughly the last month. The main reading on this page."],
  ["Longer trend", "How many are above their average price over about the last two and a half months. It moves slowly and shows the bigger picture."],
  ["Below its 1-year high", tw("How far the industry (all its stocks averaged equally) is from its highest point of the past year. 0% means it is at the top.")],
  ["Standout stocks", tw("Stocks at a new 1-year high while their industry is still well below its own high. They are holding up better than their neighbours.")],
  ["Box (Sector Rotation)", tw("Each week every industry is compared with the average group over 6 months and over the last month. The two answers put it in one of four boxes: Ahead and gaining, Ahead but slowing, Behind but gaining, Behind and slipping.")],
  ["Market backdrop", "Whether the Nifty 50 is above or below its long-term average price. Above it, the market as a whole is in an uptrend."],
];
/** Task #448 (01 §3): the words alone, for the ⋯ menu's "Words on this page" panel. */
export const WordsList = ({ items = WORDS }: { items?: [string, string][] }) => <dl className="sp-words">{items.map(([t, d]) => <div key={t}><dt>{tw(t)}.</dt><dd>{tw(d)}</dd></div>)}</dl>;
export function Words({ items = WORDS, line }: { items?: [string, string][]; line?: string }) {
  // task #333 (file 30): on the new Sector Pulse it is a closed row with its one line ("Words explained" in the section bar)
  if (line) return <SxFold id="sx-words" title="Words on this page" line={line}><dl className="sp-words">{items.map(([t, d]) => <div key={t}><dt>{tw(t)}.</dt><dd>{tw(d)}</dd></div>)}</dl></SxFold>;
  return (
    <details className="sp-sec sp-fold">
      <summary><span><b className="sp-ft">Words on this page, in plain English</b></span><span className="sp-show">Show ▾</span></summary>
      <dl className="sp-words">{items.map(([t, d]) => <div key={t}><dt>{tw(t)}.</dt><dd>{tw(d)}</dd></div>)}</dl>
    </details>
  );
}

export function useMapData() { return useIndustryMap(); }
export function useHistory() { return useSectorHistory(); }
export { ORDER };
