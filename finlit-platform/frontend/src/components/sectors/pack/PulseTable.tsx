// Sector Pulse, Full table view, as the "FinLit final pages" pack draws it (13 Nov 2026, docs/design/finlit-final-pages/06-sector-pulse-full-table.jpg): three cards, then
// "Every industry, every number": filters, Download CSV, the 6-month chart key, one row per industry grouped by state, and each row opens to its stocks (Silver), best 6 months
// first, with two insights. Every figure is the server's. Describes, never advises.
import { Fragment, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Hideable } from "../../Hideable";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet, useSearchIndex } from "../../../lib/api";
import { capBucket } from "../../../lib/capBuckets";
import { CoLogo } from "../../CoLogo";
import { LockedBlock } from "../Parts";
import type { Board, GroupRow, IndustryPage, RankedStock } from "../../../lib/sectors";
import type { SectorHistory, StateKey } from "../../../lib/sectorHistory";
import { COLOUR, MEANING, ORDER, WORD, bounceIndex, bouncedShort, byState, dayMon, fridayCards, fridays, howStrong, inTableFilter, isEarly, keyOf, risingOf, short, standoutCounts, statesAt, tableCards, toCsv, type Card, type TableFilter } from "../../../lib/pulsePack";
import { BoxChip, Cards, InsightCard, Scroll, Spark, StateChip, Swatch, Tip } from "./Common";

const pct0 = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v)}%`);
const signed = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);

function download(rows: GroupRow[], date: string) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `sector-pulse-${date}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function PulseTable({ b, h, mine }: { b: Board; h: SectorHistory | undefined; mine: Set<string> }) {
  const [f, setF] = useState<TableFilter>("all"), [open, setOpen] = useState<string | null>(null);
  const week = statesAt(h, 1);
  const groups = useMemo(() => byState(b.rows.filter((r) => inTableFilter(r, f, mine))), [b.rows, f, mine]);
  const n = (x: TableFilter) => b.rows.filter((r) => inTableFilter(r, x, mine)).length;
  const filters: [TableFilter, string][] = [["all", `All ${b.rows.length}`], ["bounce", `Bouncing back · ${n("bounce")}`], ["sold_off", `Sold off · ${n("sold_off")}`], ["losing", `Losing steam · ${n("losing")}`],
    ...(b.leader_flags != null ? [["standouts", `With standout stocks · ${n("standouts")}`] as [TableFilter, string]] : []), ...(mine.size ? [["yours", `Your industries · ${n("yours")}`] as [TableFilter, string]] : [])];
  const hist = (slug: string) => h?.groups.find((g) => g.slug === slug);
  return (
    <>
      <Cards items={tableCards(b.rows, week)} />
      <section className="sp-sec" aria-labelledby="sp-every">
        <div className="sp-sec-h"><div><h2 id="sp-every">Every industry, every number</h2><p className="sp-sub">Grouped by state. Click any industry to see the stocks inside it, best 6-month performers first.</p></div>
          <button type="button" className="sp-dl" onClick={() => download(b.rows, b.date)}>Download CSV</button></div>
        <div className="sp-filters" role="group" aria-label="Show">{filters.map(([k, label]) => <button key={k} type="button" className={"sp-fbtn" + (f === k ? " on" : "")} aria-pressed={f === k} onClick={() => setF(k)}>{label}</button>)}</div>
        <div className="sp-ckey"><span><b>How to read the 6-month chart:</b> the <b>line</b> is the share of its stocks rising each day (dashed = half); the <b>shading</b> is its state that day; ▲ marks its last bounce.</span>
          {(["sold_off", "bouncing", "crash", "rising", "losing", "no_signal"] as StateKey[]).map((k) => <span key={k} className="sp-keyi"><Swatch k={k} />{WORD[k]}</span>)}</div>
        <Scroll label="every industry, every number"><table className="sp-tb sp-full">
          <thead>
            <tr className="sp-full-g"><th colSpan={2} /><th colSpan={3} className="sp-g-trend">Above their trend<Tip text="Out of the industry's counted stocks, the share above their short (about 2 weeks), medium (about a month) and longer (about 3 months) average price." /></th>
              <th colSpan={2} className="sp-g-fall">Depth of fall<Tip text="How deep the fall was. Below high: how far the industry's typical stock is below its 1-year high. Held up: at the industry's last low, the share of stocks that stayed above their earlier low. A low figure (in red) means almost every stock fell to a new low: a crash." /></th>
              <th colSpan={2} /><th colSpan={2} className="sp-g-vs">Vs other industries<Tip text="The Sector Rotation box and rank: how the industry has done against the average industry over recent months and weeks." /></th></tr>
            <tr><th scope="col">Industry</th><th scope="col">Last 6 months<Tip text="The line: out of every 100 of its counted stocks, how many were above their medium trend each day. The shading: its state that day." /></th>
              <th scope="col" className="r">Short</th><th scope="col" className="r">Medium</th><th scope="col" className="r">Longer</th><th scope="col" className="r">Below high</th><th scope="col" className="r">Held up</th>
              <th scope="col">Bounced<Tip text="When most of its stocks last turned up together, in trading days, and whether that bounce came after a crash or a sell-off." /></th><th scope="col" className="r">Standouts<Tip text="How many of its stocks are at a new 1-year high while the industry is still well below its own high." /></th>
              <th scope="col">Box</th><th scope="col" className="r">Rank</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => <Fragment key={g.key}>
              <tr className={"sp-gh sp-gh-" + g.key}><td colSpan={11}><StateChip k={g.key} help /><b>{g.rows.length} {g.rows.length === 1 ? "industry" : "industries"}</b><span>{MEANING[g.key]}</span></td></tr>
              {g.rows.map((r) => { const hh = hist(r.slug), isOpen = open === r.slug; return (<Fragment key={r.slug}>
                <tr className={"sp-row" + (isOpen ? " on" : "")}>
                  <td><button type="button" className="sp-exp" aria-expanded={isOpen} aria-controls={"sp-x-" + r.slug} onClick={() => setOpen(isOpen ? null : r.slug)}><span aria-hidden="true">{isOpen ? "▼" : "▶"}</span>
                    <span><b>{short(r.name)}</b>{mine.has(r.slug) && <em className="sp-yours"> · Yours</em>}<small>{r.stocks_counted} stocks</small></span></button></td>
                  <td>{hh?.rising ? <Spark values={hh.rising} states={hh.states} mark={h ? bounceIndex(h.dates, r) : null} label={`${short(r.name)}: stocks rising over 6 months`} w={150} h={40} /> : <span className="sp-nil">–</span>}</td>
                  <td className="r">{pct0(r.breadth.above_9)}</td><td className="r">{pct0(r.breadth.above_20)}</td><td className="r">{pct0(r.breadth.above_50)}</td>
                  <td className="r">{r.index_vs_52w_high == null ? "–" : `${Math.abs(r.index_vs_52w_high).toFixed(1)}%`}</td>
                  <td className={"r" + (r.held_up != null && r.held_up < 20 ? " sp-red" : "")}>{r.held_up == null ? "–" : `${Math.round(r.held_up)}%`}</td>
                  <td>{bouncedShort(r) ?? "–"}</td><td className="r">{r.leader_flags == null ? <span className="sp-nil" title="Standout stocks are part of the Silver plan">Silver</span> : r.leader_flags || "–"}</td>
                  <td><BoxChip corner={r.rotation?.corner} /></td><td className="r">{r.rotation?.rank ?? "–"}</td>
                </tr>
                {isOpen && <tr className="sp-xrow"><td colSpan={11} id={"sp-x-" + r.slug}><Opened r={r} rising={hh?.rising ?? []} /></td></tr>}
              </Fragment>); })}
            </Fragment>)}
            {!groups.length && <tr><td colSpan={11}>No industry matches this filter today.</td></tr>}
          </tbody>
        </table></Scroll>
        <p className="sp-note">Red in "Held up" means very few stocks held above their earlier low: a crash.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ the sections under the full table
type Small = { slug: string; name: string; counted: number; listed: number | null; locked?: string; note?: string | null; stocks: { symbol: string; name: string; ret_6m: number | null }[] | null };
function SmallRow({ g }: { g: { name: string; slug: string; stocks_counted: number } }) {
  const [open, setOpen] = useState(false);
  const q = useQuery<Small, ApiError>({ queryKey: ["sector-small", g.slug], queryFn: () => apiGet<Small>(`/api/sectors/small/${encodeURIComponent(g.slug)}`), staleTime: 300_000, retry: false });
  const listed = q.data?.listed;
  return (
    <li><details onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary><span className="sp-chev" aria-hidden="true">{open ? "▼" : "▶"}</span><b>{g.name === "Diversified" ? "Diversified (conglomerates)" : g.name}</b>{g.name === "Diversified" && <Tip text="Diversified is NSE's name for conglomerates, companies that run several unrelated businesses. It has nothing to do with diversifying your portfolio." />}
        <small>{g.stocks_counted} counted{q.data?.note && q.data.stocks?.length ? ` · ${q.data.stocks.length} largest shown` : listed != null ? ` · ${listed} listed` : ""}</small></summary>
      {open && (q.isLoading ? <span className="sp-nil">Loading…</span> : q.data?.locked ? <span className="sp-nil">The stocks are part of the Silver plan.</span>
        : !q.data?.stocks?.length ? <span className="sp-nil">No listed stock carries this group's name in the screener today.</span>
        : <span className="sp-smalls">{q.data.stocks.map((x) => <Link key={x.symbol} to={`/stocks/${x.symbol}`} className="sp-sym"><CoLogo symbol={x.symbol} size={16} inline />{x.symbol}{x.ret_6m != null && <small className={x.ret_6m >= 0 ? "sp-good" : "sp-red"}> {signed(x.ret_6m)}</small>}</Link>)}{q.data.note && <span className="sp-nil sp-smallnote">{q.data.note}</span>}</span>)}
    </details></li>);
}
export function TooSmallFull({ b }: { b: Board }) {
  const few = b.too_few_stocks ?? [];
  if (!few.length) return null;
  return (
    <section className="sp-sec" aria-labelledby="sp-small-f">
      <h2 id="sp-small-f">Too small for a reading</h2>
      <p className="sp-sub">{few.length} industries have too few actively traded stocks for a steady reading.</p>
      <p className="sp-why"><b>Why it matters</b> With only a handful of stocks, one share moving can flip the whole industry's state. Open any of them to see its stocks; we just do not give the industry a state.</p>
      <ul className="sp-smallrows">{few.map((g) => <SmallRow key={g.slug} g={g} />)}</ul>
    </section>
  );
}
export function StandoutsFull({ b }: { b: Board }) {
  const [all, setAll] = useState(false);
  const f = b.leader_flags;
  if (f == null) return <section className="sp-sec"><h2>Standout stocks</h2><LockedBlock plan="silver" title="The standout stocks are part of the Silver plan">Silver lists every stock at a new 1-year high inside a weak industry.</LockedBlock></section>;
  const c = standoutCounts(f), shown = all ? f : f.slice(0, 24);
  return (
    <section className="sp-sec" aria-labelledby="sp-stand-f">
      <h2 id="sp-stand-f">Standout stocks · {f.length}<Tip text="Standout stocks. Stocks at a new 1-year high while their industry is still well below its own high. They are holding up better than their neighbours." /></h2>
      <p className="sp-sub">Stocks at a 1-year high while their industry is still well below its own high.</p>
      <div className="sp-two sp-two-tight">
        <div className="sp-sumc sp-good-bg"><b>Strong · {c.strong}</b><Tip text="Strong standout. The stock is at a 1-year high while its industry is still far below its own high. It stands out the most." /><p>Industry far below its high, so the stock stands out the most.</p></div>
        <div className="sp-sumc sp-watch-bg"><b>Early · {c.early}</b><Tip text="Early standout. The stock is at a 1-year high while its industry is somewhat below its own high." /><p>Industry somewhat below its high.</p></div>
      </div>
      <p className="sp-why"><b>Why it matters</b> These are the stocks holding up best inside weak industries: a research list, not a recommendation.</p>
      <ul className="sp-standlist">{shown.map((x) => { const s = howStrong(x); return <li key={x.symbol + x.group_slug}><Link to={`/stocks/${x.symbol}`}><b>{x.symbol}</b></Link> <span>{short(x.group)}</span><span className={"sp-q " + (s === "Strong" ? "sp-standout" : "sp-early-q")}>{s}</span></li>; })}</ul>
      {f.length > 24 && <button type="button" className="sp-morebtn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : `Show the other ${f.length - 24} ▾`}</button>}
    </section>
  );
}
/** The pack's Friday squares, drawn as one picture that grows with the page (pack 06: 20 x 16 squares, 22 apart, names right-aligned at 210, the date every fourth Friday counted back from today). */
const FX = 221, FS = 22, FR = 18, FT = 27;
export function SixMonths({ h }: { h: SectorHistory }) {
  const nav = useNavigate();
  const fr = fridays(h), cards = fridayCards(h), cols = fr.ends.length, W = FX + cols * FS + 8, H = FT + fr.rows.length * FR + 6;
  const go = (e: React.MouseEvent | React.KeyboardEvent, slug: string) => { e.preventDefault(); nav(`/sectors/${slug}`); };
  return (
    <Hideable id="pack.sp-six" title="Six months of every industry">
    <section className="sp-sec" aria-labelledby="sp-six">
      <div className="sp-sec-h"><div><h2 id="sp-six">Six months of every industry<Tip text="Each industry's state at every Friday close for six months: one row per industry, one square per Friday. The outlined column is the latest close." /></h2>
        <p className="sp-sub">One row per industry, one square per Friday. The outlined column is today. Rows are sorted by today's state.</p></div></div>
      <ul className="sp-lgd">{(["crash", "bouncing", "rising", "losing", "sold_off", "no_signal"] as StateKey[]).map((k) => <li key={k}><Swatch k={k} />{WORD[k]}</li>)}</ul>
      <Scroll label="six months of every industry"><svg className="sp-fri" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Each of ${fr.rows.length} industries' state at ${cols} Friday closes, from ${cols ? dayMon(h.dates[fr.ends[0]]) : ""} to ${cols ? dayMon(h.dates[fr.ends[cols - 1]]) : ""}`}>
        {fr.ends.map((i, j) => (cols - 1 - j) % 4 === 0 && <text key={i} x={FX + j * FS + 10} y={18} className="sp-fri-d" textAnchor="middle">{dayMon(h.dates[i])}</text>)}
        {fr.rows.map((r, k) => { const y = FT + k * FR; return (<g key={r.slug}>
          <a href={`/sectors/${r.slug}`} onClick={(e) => go(e, r.slug)}><text x={210} y={y + 12} className="sp-fri-n" textAnchor="end">{short(r.name)}</text></a>
          {r.states.map((s, j) => <rect key={j} x={FX + j * FS} y={y} width={20} height={16} rx={3} fill={s ? COLOUR[s] : "transparent"}><title>{`${short(r.name)}, ${dayMon(h.dates[fr.ends[j]])}: ${s ? WORD[s] : "no reading"}`}</title></rect>)}
        </g>); })}
        {cols > 0 && <rect x={FX + (cols - 1) * FS - 1} y={FT - 3} width={22} height={fr.rows.length * FR + 4} rx={4} fill="none" className="sp-fri-now" />}
      </svg></Scroll>
      <p className="sp-note">Long yellow runs are industries sold off for months; a fresh green square at the right end is a bounce that has just started.</p>
      <Cards items={cards} />
      {h.changed_this_week?.length > 0 && <details className="sp-more"><summary>What changed this week ({h.changed_this_week.length} industries) ▾</summary>
        <ul className="sp-changed">{h.changed_this_week.map((c) => <li key={c.slug}><Link to={`/sectors/${c.slug}`}>{short(c.name)}</Link>: {c.last} → <b>{c.now}</b></li>)}</ul></details>}
    </section>
    </Hideable>
  );
}

/** One industry opened: two insights, its 6-month line and its stocks, best 6 months first (the top 10 and the bottom 5, the middle on its own page). */
function Opened({ r, rising }: { r: GroupRow; rising: (number | null)[] }) {
  const q = useQuery<IndustryPage, ApiError>({ queryKey: ["sector", r.slug], queryFn: () => apiGet<IndustryPage>(`/api/sectors/${encodeURIComponent(r.slug)}`), staleTime: 300_000, retry: false });
  const idx = useSearchIndex(true);
  const cap = (sym: string) => { const rows = (idx.data?.rows ?? []) as unknown[][], mc = (idx.data as { mc?: (number | null)[] } | undefined)?.mc; const i = rows.findIndex((x) => x[0] === sym); return i >= 0 && mc ? capBucket(mc[i] ?? null)?.label.replace(" cap", "") ?? "–" : "–"; };
  const k = keyOf(r), up9 = risingOf(r, "above_9"), up20 = risingOf(r), up50 = risingOf(r, "above_50"), nm = short(r.name), lc = nm.toLowerCase();
  const t = r.last_thrust, when = t ? (t.sessions_ago === 0 ? "today" : `${t.sessions_ago} trading ${t.sessions_ago === 1 ? "day" : "days"} ago`) : "";
  const first: Card = k === "crash" || k === "bouncing"
    ? { kind: "good", title: `${nm} bounced${k === "crash" ? " after a crash" : ""}, ${when}`, text: `${up9} of the ${r.stocks_counted} counted ${lc} stocks are above their short trend and ${up20} above their medium trend. Only ${up50} are above the longer trend so far.` }
    : k === "sold_off" ? { kind: isEarly(r) ? "insight" : "watch", title: isEarly(r) ? `${nm} is sold off, but most of its stocks are rising again` : `${nm} is sold off`, text: `${up9} of the ${r.stocks_counted} counted ${lc} stocks are above their short trend, ${up20} above their medium trend and ${up50} above the longer trend.` }
    : { kind: k === "losing" ? "warning" : "good", title: `${nm} is ${WORD[k].toLowerCase()}`, text: `${up9} of the ${r.stocks_counted} counted ${lc} stocks are above their short trend, ${up20} above their medium trend and ${up50} above the longer trend.` };
  const stocks: RankedStock[] = (q.data?.stocks as RankedStock[] | null) ?? [];
  const top = stocks.slice(0, 3), flagged = stocks.filter((s) => s.leader_flag).length;
  const second: Card | null = top.length === 3 && top.every((s) => s.return_6m_pct != null)
    ? { kind: "insight", title: "The leaders of the last 6 months", text: `${top.map((s) => s.symbol).join(", ").replace(/, ([^,]*)$/, " and $1")} are up ${Math.min(...top.map((s) => s.return_6m_pct!)).toFixed(0)}% to ${Math.max(...top.map((s) => s.return_6m_pct!)).toFixed(0)}% in 6 months.${flagged ? ` ${flagged} ${lc} ${flagged === 1 ? "stock is a standout" : "stocks are standouts"}.` : ""}` } : null;
  const shown = stocks.length > 15 ? [...stocks.slice(0, 10), null, ...stocks.slice(-5)] : stocks;
  return (
    <div className="sp-open">
      <div className="sp-cards" style={{ ["--cols" as string]: second ? 2 : 1 }}><InsightCard c={first} />{second && <InsightCard c={second} />}</div>
      <p className="sp-open-line"><b>Stocks rising (medium trend), last 6 months</b><Spark values={rising} label={`${nm}: stocks rising over 6 months`} w={260} h={34} /><small>dashed line = half the stocks</small><Link to={`/sectors/${r.slug}`} className="sp-link">Open the {nm} page →</Link></p>
      {q.isLoading ? <div className="sx-skel" style={{ height: 80 }} role="status" aria-label={`Loading the stocks of ${nm}`} />
        : q.data?.stocks == null ? <LockedBlock plan="silver" title="The stocks of each industry are part of the Silver plan">The states and the stocks rising are open to everyone. Silver lists every counted stock, best 6 months first, with where it falls inside its industry.</LockedBlock>
        : <div className="sp-stocks"><table className="sp-tb">
          <thead><tr><th scope="col">Rank<Tip text="Its place among the industry's counted stocks by 6-month return, best first." /></th><th scope="col">Stock</th><th scope="col">Size<Tip text="FinLit's size scale: Large above ₹50,000 Cr, Mid ₹10,000–50,000 Cr, Small below ₹10,000 Cr." /></th>
            <th scope="col" className="r">6 months<Tip text="The share price change over the last 6 months." /></th><th scope="col">In its industry<Tip text="Inside its industry. Where the stock's 6-month return falls among the industry's counted stocks. Top quarter: the best 25%. Bottom quarter: the weakest 25%." /></th>
            <th scope="col">Vs peers<Tip text="Leader, In line, Laggard. Each share's price over the last 12 months is compared with similar companies and with its sector index. Leader: among the strongest of its group and ahead of the index. Laggard: among the weakest and behind it. It describes the past, not the future. A dash means the stock is not in a FinLit peer group." /></th>
            <th scope="col">Standout<Tip text="At a new 1-year high while its industry is still well below its own high." /></th></tr></thead>
          <tbody>{shown.map((s, i) => s == null ? <tr key="mid" className="sp-mid-row"><td colSpan={7}>… {stocks.length - 15} more in the middle: open the industry page to see all {stocks.length} …</td></tr> : (
            <tr key={s.symbol}><td>{s.rank_6m ?? i + 1}</td><td><Link to={`/stocks/${s.symbol}`} className="sp-sym"><CoLogo symbol={s.symbol} name={s.name} size={20} inline /><b>{s.symbol}</b> <span className="sp-coname">{s.name}</span></Link></td>
              <td>{cap(s.symbol)}</td><td className={"r " + ((s.return_6m_pct ?? 0) >= 0 ? "sp-good" : "sp-red")}>{signed(s.return_6m_pct)}</td>
              <td>{s.quarter_name ? <span className={"sp-q sp-q" + (s.quarter ?? 0)}>{s.quarter_name}</span> : "–"}</td>
              <td>{s.peer_label ? <span className={"sp-q sp-peer-" + s.peer_label.toLowerCase().replace(/\s+/g, "")}>{s.peer_label}</span> : q.data?.locked?.peer_label ? <span className="sp-nil" title="Part of the Gold plan">Gold</span> : "–"}</td>
              <td>{s.leader_flag ? <span className="sp-q sp-standout">Standout</span> : ""}</td></tr>))}</tbody>
        </table></div>}
    </div>
  );
}
export { ORDER };
