// Sector Pulse, Simple view, exactly as the "FinLit final pages" pack draws it (13 Nov 2026, docs/design/finlit-final-pages/05-sector-pulse-simple.jpg): Today in one minute,
// the market's mood, how your industries are doing, the cycle, all industries by state, the industry map, momentum and strength side by side, standout stocks, which stocks
// are counted, too small for a reading and the words on the page. Every figure is the server's; the sentences are worked out in lib/pulsePack.ts. Describes, never advises.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../../lib/api";
import { CoLogo } from "../../CoLogo";
import { LockedBlock } from "../Parts";
import { useSectorHistory, type SectorHistory, type StateKey } from "../../../lib/sectorHistory";
import { useIndustryMap, type IndustryMap } from "../../../lib/sectorExtra";
import type { Board, GroupRow } from "../../../lib/sectors";
import {
  BOX, BOX_ORDER, COLOUR, MEANING, ORDER, WORD, belowHigh, dayMon, bouncedAgo, byState, headline, howStrong, isEarly, keyOf, matrix, matrixCards, meansForYou, newHigh, risingOf, short, statesAt, todayCards, yourCards, yourOrder,
  type Card, type Holding,
} from "../../../lib/pulsePack";
import { BoxChip, Cards, InsightCard, Scroll, Section, Spark, StateChip, Swatch, Tip } from "./Common";

const n0 = (v: number) => v.toLocaleString("en-IN");

// ------------------------------------------------------------------------------------------------ How to read this page
export function HowToRead() {
  return (
    <details className="sp-sec sp-fold">
      <summary><span><b className="sp-ft">How to read this page</b><small>Four steps, and a 3-minute guide</small></span><span className="sp-show">Show ▾</span></summary>
      <ol className="sp-steps">
        <li><b>Read the state.</b> The coloured state shows where an industry is in its cycle: sold off, bouncing back, rising together or losing steam.</li>
        <li><b>Count the stocks rising.</b> How many of its counted stocks are above their short, medium and longer trend. More stocks rising means the move is broad.</li>
        <li><b>Check the market.</b> The market backdrop at the top: an industry bounce means more when the whole market is in an uptrend.</li>
        <li><b>Open an industry.</b> A year of its readings, every bounce and when it faded, and how each of its stocks has done.</li>
      </ol>
      <Link className="sp-link" to="/learn/sector-signals">How to use Sector Pulse →</Link>
    </details>
  );
}

// ------------------------------------------------------------------------------------------------ Today in one minute
export function TodayMinute({ b, h }: { b: Board; h: SectorHistory | undefined }) {
  const rows = b.rows, now = statesAt(h, 0), week = statesAt(h, 1);
  const hd = headline(rows, now, week), cards = todayCards(rows);
  const squares = ORDER.flatMap((k) => rows.filter((r) => keyOf(r) === k).sort((a, c) => a.name.localeCompare(c.name)));
  const shown = ORDER.filter((k) => k !== "no_signal" || rows.some((r) => keyOf(r) === k));
  return (
    <section className="sp-sec" aria-labelledby="sp-today">
      <h2 id="sp-today">Today in one minute</h2>
      <p className="sp-sub">What changed in the industries, and what to keep an eye on.</p>
      <p className="sp-lead"><b>{hd.lead}</b>{hd.rest}</p>
      {hd.sub && <p className="sp-lead-sub">{hd.sub}</p>}
      <div className="sp-today">
        <div>
          <p className="sp-cap">All {rows.length} industries, one square each</p>
          <ul className="sp-squares" aria-label={`All ${rows.length} industries, coloured by their state`}>
            {squares.map((r) => <li key={r.slug}><Link to={`/sectors/${r.slug}`} style={{ background: COLOUR[keyOf(r)] }} title={`${short(r.name)}: ${WORD[keyOf(r)]}`} aria-label={`${short(r.name)}: ${WORD[keyOf(r)]}`} /></li>)}
          </ul>
          <table className="sp-stt">
            <thead><tr><th scope="col">State</th><th scope="col" className="r">Now</th><th scope="col" className="r">Vs last<br />week</th></tr></thead>
            <tbody>{shown.map((k) => {
              const v = rows.filter((r) => keyOf(r) === k).length, was = week?.[k], d = was == null ? null : v - was;
              return <tr key={k}><td><span className="sp-stn"><Swatch k={k} />{WORD[k]}<Tip text={MEANING[k]} label={`About “${WORD[k]}”`} /></span></td><td className="r sp-num">{v}</td>
                <td className={"r sp-chg" + (d == null || d === 0 ? "" : d > 0 ? " up" : " dn")}>{d == null ? "–" : d === 0 ? "no change" : `${d > 0 ? "▲" : "▼"}${Math.abs(d)}`}</td></tr>;
            })}</tbody>
          </table>
        </div>
        <div className="sp-cards sp-cards-2">{cards.map((c) => <InsightCard key={c.title} c={c} />)}</div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ The market's mood, day by day
const MOOD_ORDER: StateKey[] = ["crash", "bouncing", "rising", "no_signal", "losing", "sold_off"];     // bottom to top, as the pack stacks them
export function Mood({ h }: { h: SectorHistory }) {
  const n = h.dates.length, total = h.groups.length, W = 1000, H = 300, L = 30, R = 150, T = 8, B = 24;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R), y = (v: number) => T + (1 - v / total) * (H - T - B);
  const layers = useMemo(() => {
    const base = new Array(n).fill(0);
    return MOOD_ORDER.map((k) => {
      const lo = [...base], hi = base.map((b0, i) => b0 + (h.counts[k]?.[i] ?? 0));
      hi.forEach((v, i) => (base[i] = v));
      const top = hi.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
      const bot = lo.map((_v, i) => `L${x(n - 1 - i).toFixed(1)},${y(lo[n - 1 - i]).toFixed(1)}`).join("");
      return { k, d: top + bot + "Z", last: h.counts[k]?.[n - 1] ?? 0, mid: (lo[n - 1] + hi[n - 1]) / 2 };
    });
  }, [h]);   // eslint-disable-line react-hooks/exhaustive-deps
  const peak = h.counts.sold_off.reduce((best, v, i) => (v > h.counts.sold_off[best] ? i : best), 0);
  const now = statesAt(h, 0)!, week = statesAt(h, 1)!, bNow = now.crash + now.bouncing, bWeek = week.crash + week.bouncing;
  const months = h.dates.map((d, i) => ({ d, i })).filter(({ d }, i) => i === 0 || d.slice(5, 7) !== h.dates[i - 1].slice(5, 7));
  const cards: Card[] = [
    { kind: "insight", title: "How to read it", text: "A thick yellow band means most industries were being sold. Green growing up from the bottom means bounces are spreading." },
    { kind: bNow >= bWeek ? "good" : "watch", title: `${bNow} ${bNow === 1 ? "industry" : "industries"} bouncing now`, text: `A week earlier it was ${bWeek}.${h.counts.sold_off[n - 1] < h.counts.sold_off[peak] && bNow > bWeek ? ` The sell-off that peaked in ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+h.dates[peak].slice(5, 7) - 1]} is easing.` : ""}` },
    now.rising ? { kind: "good", title: "Blue is spreading", text: `${now.rising} ${now.rising === 1 ? "industry has" : "industries have"} most of ${now.rising === 1 ? "its" : "their"} stocks rising together.` }
      : { kind: "watch", title: "Blue is still missing", text: "No industry has most of its stocks rising together yet: bounces have not become broad rises." },
  ];
  const weeks = [...(h.weeks ?? [])].reverse();
  return (
    <Section id="sp-mood" hide title="The market's mood, day by day" help={`The market's mood. Every trading day each of the ${total} industries has one state. The chart stacks how many were in each state, so the colours always add up to ${total}. Hover a day to read it.`}
      sub={`All ${total} industries stacked: each colour is how many were in that state on the day. Read it like weather for the whole market.`}>
      <ul className="sp-lgd">{MOOD_ORDER.map((k) => <li key={k}><Swatch k={k} />{WORD[k]}</li>)}</ul>
      <div className="sp-chartw">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Industries in each state, ${dayMon(h.dates[0])} to ${dayMon(h.dates[n - 1])}. Today: ${MOOD_ORDER.filter((k) => now[k]).map((k) => `${now[k]} ${WORD[k].toLowerCase()}`).join(", ")}.`}>
          {layers.map((l) => <path key={l.k} d={l.d} fill={COLOUR[l.k]} />)}
          {[0, Math.round(total / 2), total].map((v) => <text key={v} className="sp-ax" x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text>)}
          {months.map(({ d, i }) => <text key={d} className="sp-ax" x={x(i)} y={H - 6} textAnchor="middle">{dayMon(d).split(" ")[1]}</text>)}
          <line className="sp-peak" x1={x(peak)} x2={x(peak)} y1={T} y2={H - B} />
          <text className="sp-ann" x={x(peak) + 6} y={T + 14}><tspan fontWeight="700">{h.counts.sold_off[peak]} of {total}</tspan> sold off · {dayMon(h.dates[peak])}</text>
          {layers.filter((l) => l.last > 0).map((l) => <text key={l.k} className="sp-ann" x={x(n - 1) + 10} y={y(l.mid) + 4}><tspan fontWeight="700">{l.last}</tspan> {l.k === "crash" ? "Bounce after crash" : WORD[l.k]}</text>)}
        </svg>
      </div>
      <Cards items={cards} />
      {weeks.length > 0 && (
        <details className="sp-more"><summary>See the count, week by week ▾</summary>
          <Scroll label="industries in each state, week by week"><table className="sp-tb">
            <thead><tr><th scope="col">Friday</th>{MOOD_ORDER.map((k) => <th key={k} scope="col" className="r">{k === "crash" ? "Bounce after a crash" : WORD[k]}</th>)}</tr></thead>
            <tbody>{weeks.map((w) => <tr key={w.date}><td>{dayMon(w.date)}</td>{MOOD_ORDER.map((k) => <td key={k} className="r">{w.counts[k] ? w.counts[k] : "·"}</td>)}</tr>)}</tbody>
          </table></Scroll>
          <p className="sp-note">How many of the {total} industries were in each state at each Friday's close, newest first.</p>
        </details>)}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ How your industries are doing
type Membership = { groups: Record<string, { slug: string; name: string }> };
export function YourIndustries({ b, h, symbols, signedIn }: { b: Board; h: SectorHistory | undefined; symbols: string[]; signedIn: boolean }) {
  const key = [...symbols].sort().join(",");
  const q = useQuery<Membership, ApiError>({ queryKey: ["sectors", "membership", key], queryFn: () => apiGet<Membership>(`/api/sectors/membership?symbols=${encodeURIComponent(key)}`), enabled: symbols.length > 0, staleTime: 3_600_000, retry: false });
  const held: Holding[] = symbols.flatMap((s) => (q.data?.groups[s] ? [{ symbol: s, slug: q.data.groups[s].slug }] : []));
  const mine = b.rows.filter((r) => held.some((x) => x.slug === r.slug)).sort(yourOrder);
  const spark = (slug: string) => h?.groups.find((g) => g.slug === slug)?.rising ?? [];
  return (
    <Section id="sp-yours" title="How your industries are doing" help="Your industries: the NSE industries of the shares in your portfolio. Each one's state today, how it compares with other industries (Sector Rotation) and how many of its stocks have been rising over 6 months."
      sub={mine.length ? `The ${mine.length} ${mine.length === 1 ? "industry" : "industries"} your ${held.length} ${held.length === 1 ? "share belongs" : "shares belong"} to: is each one rising or falling, and is it beating other industries?` : undefined}
      why="A share rarely swims against its whole industry for long. Knowing whether your industries are rising or falling tells you what your shares are up against.">
      {!symbols.length ? <p className="sp-empty">{signedIn ? <>Add the shares you own to <Link to="/portfolio">your portfolio</Link> and their industries appear here, each with its state and how it compares with the others.</> : <><Link to="/login">Sign in</Link> and add the shares you own: their industries appear here, each with its state and how it compares with the others.</>}</p>
        : q.isLoading ? <div className="sx-skel" style={{ height: 120 }} role="status" aria-label="Loading your industries" />
        : !mine.length ? <p className="sp-empty">None of your {symbols.length} shares is in an industry with a reading today: NSE has not given them an industry, or their industry has too few counted stocks.</p>
        : <>
          <Cards items={yourCards(b.rows, held)} />
          <Scroll label="your industries"><table className="sp-tb sp-yours">
            <thead><tr><th scope="col">Industry and your shares</th><th scope="col">Its state today<Tip text="The industry's state at the latest close: sold off, bouncing back, rising together or losing steam." /></th>
              <th scope="col">Against other industries<Tip text="Its Sector Rotation box and rank: how it has done against the average industry over recent months and weeks." /></th>
              <th scope="col">Stocks rising · last 6 months<Tip text="The line: out of every 100 of its counted stocks, how many were above their medium trend each day for 6 months. Dashed: half." /></th><th scope="col">What it means for you</th></tr></thead>
            <tbody>{mine.map((r) => {
              const m = meansForYou(r), syms = held.filter((x) => x.slug === r.slug).map((x) => x.symbol), up = risingOf(r);
              return (<tr key={r.slug}>
                <td><Link className="sp-ind" to={`/sectors/${r.slug}`}>{short(r.name)}</Link><div className="sp-mine">{syms.map((s) => <Link key={s} to={`/stocks/${s}`} className="sp-sym"><CoLogo symbol={s} size={18} inline />{s}</Link>)}</div></td>
                <td><StateChip k={keyOf(r)} help /></td>
                <td><BoxChip corner={r.rotation?.corner} help />{r.rotation?.rank != null && <small className="sp-rank">rank {r.rotation.rank} of {r.rotation.ranked}</small>}</td>
                <td><span className="sp-sparkc"><Spark values={spark(r.slug)} label={`${short(r.name)}: stocks rising over 6 months`} /><span className="sp-of"><b>{up ?? "–"} of {r.stocks_counted}</b><small>stocks rising</small></span></span></td>
                <td><span className={"sp-mean sp-" + m.tone}>{m.text}</span></td>
              </tr>);
            })}</tbody>
          </table></Scroll>
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
    <Section id="sp-cycle" hide title="The cycle industries move through" sub="Most industries go round these four stages. Many bounces fade before the next stage, so the cycle is a map, not a timetable.">
      <ol className="sp-cycle">{CYCLE.map((c, i) => (
        <li key={c.k} className={"sp-cyc sp-cyc-" + c.k}>
          <div className="sp-cyc-h"><StateChip k={c.k} help /><b className="sp-cyc-n">{count(c.k)}</b></div>
          <p>{c.line}</p><p className="sp-cyc-next"><b>What to watch next:</b> {c.next}</p>
          {i < CYCLE.length - 1 && <span className="sp-cyc-ar" aria-hidden="true">→</span>}
        </li>))}</ol>
      <p className="sp-note">From Losing steam an industry usually goes back to Sold off, or bounces again.</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ All industries, by state
function StateGroup({ k, rows, mine }: { k: StateKey; rows: GroupRow[]; mine: Set<string> }) {
  const bounce = k === "crash" || k === "bouncing";
  return (
    <div className={"sp-grp sp-grp-" + k}>
      <div className="sp-grp-h"><StateChip k={k} help /><p>{MEANING[k]}</p><b>{rows.length}</b></div>
      <table className="sp-tb sp-grp-t">
        <thead><tr><th scope="col">Industry</th><th scope="col">Stocks rising<Tip text="Out of the industry's counted stocks, how many are above their medium trend. The bar fills up as more of them rise; past halfway, most are rising." /></th>
          <th scope="col" className="r">{bounce ? "Bounced" : "Below 1-yr high"}<Tip text={bounce ? "When most of its stocks turned up together, in trading days." : "How far the industry (its stocks averaged equally) is below its highest point of the past year."} /></th></tr></thead>
        <tbody>{rows.map((r) => { const up = risingOf(r) ?? 0; return (
          <tr key={r.slug}><td><Link className="sp-ind" to={`/sectors/${r.slug}`}>{short(r.name)}</Link>{mine.has(r.slug) && <span className="sp-tag sp-yourtag">Yours</span>}{isEarly(r) && <span className="sp-tag sp-early">Early sign</span>}</td>
            <td><span className="sp-barw"><span className="sp-bar"><i style={{ width: `${Math.min(100, (r.breadth.above_20 ?? 0))}%`, background: COLOUR[k] }} /></span><b>{up} of {r.stocks_counted}</b></span></td>
            <td className="r">{bounce ? bouncedAgo(r) ?? "–" : belowHigh(r.index_vs_52w_high) ?? "–"}</td></tr>); })}</tbody>
      </table>
    </div>
  );
}
export function ByState({ b, mine }: { b: Board; mine: Set<string> }) {
  const g = byState(b.rows), left = g.filter((x) => x.key !== "sold_off" && x.key !== "no_signal"), right = g.filter((x) => x.key === "sold_off" || x.key === "no_signal");
  const fin = b.rows.find((r) => keyOf(r) === "crash" || keyOf(r) === "bouncing") ?? b.rows[0];
  const early = g.flatMap((x) => x.rows).filter(isEarly);          // in the group's own order (most stocks rising first)
  return (
    <Section id="sp-bystate" title={`All ${b.rows.length} industries, by state`} sub="Grouped by state. Inside each group, the freshest bounce or the most stocks rising comes first. Select an industry to open its page.">
      {fin && <div className="sp-howrow"><b>How to read a row:</b><span className="sp-howex">{short(fin.name)}<span className="sp-bar"><i style={{ width: `${fin.breadth.above_20}%`, background: COLOUR[keyOf(fin)] }} /></span><b>{risingOf(fin)} of {fin.stocks_counted}</b></span>
        <p>means {risingOf(fin)} of the {fin.stocks_counted} counted {short(fin.name).toLowerCase()} stocks are above their medium-term trend. The bar fills up as more of them rise; past halfway, most are rising.</p></div>}
      <div className="sp-two">
        <div>{left.map((x) => <StateGroup key={x.key} k={x.key} rows={x.rows} mine={mine} />)}</div>
        <div>{right.map((x) => <StateGroup key={x.key} k={x.key} rows={x.rows} mine={mine} />)}
          {early.length >= 2 && <InsightCard c={{ kind: "insight", title: `Why are ${short(early[0].name)} and ${short(early[1].name)} here, with so many stocks rising?`, text: "An industry moves to Bouncing back only when most of its stocks turn up together, quickly. Industries marked EARLY SIGN have been climbing slowly instead: most of their stocks are already above their short trend. Worth watching." }} />}
        </div>
      </div>
    </Section>
  );
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

export function IndustryMapPack({ m }: { m: IndustryMap }) {
  const W = 1000, H = 420, L = 56, R = 16, T = 10, B = 40, lo = -40;
  const x = (v: number) => L + (v / 100) * (W - L - R), y = (v: number) => T + (Math.max(lo, Math.min(0, v)) / lo) * (H - T - B);
  const near = m.rows.filter((r) => r.rising >= 50 && r.below_high > -15), far = m.rows.filter((r) => r.rising >= 50 && r.below_high <= -15), soldRising = m.rows.filter((r) => r.rising >= 50 && r.state === "sold_off");
  const keys = ORDER.filter((k) => k === "no_signal" || m.rows.some((r) => r.state === k));       // the pack's key always names No clear signal
  const cards: Card[] = [
    { kind: "good", title: `${near.length} industries rising and near their highs`, text: "Top-right corner: half or more of their stocks are rising and the typical stock is close to its 1-year high." },
    { kind: "insight", title: `${far.length} rising but still far below their highs`, text: "Bottom-right corner: most stocks have turned up, but the typical stock is still well under its 1-year high." },
    { kind: "watch", title: `${soldRising.length} still marked Sold off`, text: "Half or more of their stocks are rising, but the state has not changed yet; it changes more slowly than the count." },
  ];
  return (
    <Section id="sp-map" hide title="Industry map" help="Industry map. Each dot is one industry. Across: out of every 100 of its stocks, how many are rising. Down: how far its typical stock is below its 1-year high. The colour is its state today. The corners are a way to read the map, not a ranking."
      sub="Each dot is an industry. Right means more of its stocks are rising; lower means its typical stock is further below its 1-year high. Colour is its state.">
      <ul className="sp-lgd">{keys.map((k) => <li key={k}><Swatch k={k} />{WORD[k]}</li>)}</ul>
      <div className="sp-chartw">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" data-testid="map-chart" aria-label={`${m.rows.length} industries by stocks rising and distance below their 1-year high.`}>
          <rect className="sp-zone-up" x={x(50)} y={y(0)} width={x(100) - x(50)} height={y(-15) - y(0)} />
          <rect className="sp-zone-dn" x={x(0)} y={y(-15)} width={x(50) - x(0)} height={y(lo) - y(-15)} />
          {[0, 25, 50, 75, 100].map((v) => <g key={v}><line className={v === 50 ? "sp-mid" : "sp-grd"} x1={x(v)} x2={x(v)} y1={T} y2={H - B} /><text className="sp-ax" x={x(v)} y={H - B + 18} textAnchor="middle">{v}</text></g>)}
          {[0, -10, -20, -30, -40].map((v) => <g key={v}><line className="sp-grd" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="sp-ax" x={L - 8} y={y(v) + 4} textAnchor="end">{v}%</text></g>)}
          <text className="sp-zone-t up" x={x(100) - 8} y={y(0) + 18} textAnchor="end">Rising and near highs</text>
          <text className="sp-zone-t dn" x={x(0) + 8} y={y(lo) - 10}>Falling and far from highs</text>
          <text className="sp-axt" x={(L + W - R) / 2} y={H - 4} textAnchor="middle">Out of every 100 stocks, how many are rising now →</text>
          <text className="sp-axt" transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle">← Further below its 1-year high</text>
          {m.rows.map((r) => <circle key={r.slug} cx={x(r.rising)} cy={y(r.below_high)} r={7} fill={COLOUR[r.state]} stroke="#fff" strokeWidth={1.5}><title>{`${short(r.name)}: ${Math.round(r.rising)} of 100 rising, ${r.below_high.toFixed(1)}% below high, ${r.state_word}`}</title></circle>)}
          {placeLabels(m.rows.map((r) => ({ id: r.slug, text: short(r.name), cx: x(r.rising), cy: y(r.below_high) })), { left: L, right: W - R, top: T, bottom: H - B }).map((l) => <text key={l.id} className="sp-dotl" x={l.x} y={l.y} textAnchor={l.anchor}>{l.text}</text>)}
        </svg>
      </div>
      <p className="sp-note">Bottom right: industries that fell a long way and where most stocks have just turned up. Top right: strength already near its highs. Yellow dots on the right are industries still in the Sold off state although many of their stocks are now rising; the state changes more slowly than the count. Point at a dot for its name and numbers.</p>
      <Cards items={cards} />
      <details className="sp-more"><summary>Every industry on the map ({m.rows.length}) ▾</summary>
        <Scroll label="every industry on the map"><table className="sp-tb"><thead><tr><th scope="col">Industry</th><th scope="col">State</th><th scope="col" className="r">Stocks rising of 100</th><th scope="col" className="r">Below its 1-year high</th><th scope="col">Box</th></tr></thead>
          <tbody>{m.rows.map((r) => <tr key={r.slug}><td><Link to={`/sectors/${r.slug}`}>{short(r.name)}</Link></td><td>{r.state_word}</td><td className="r">{Math.round(r.rising)}</td><td className="r">{belowHigh(r.below_high)}</td><td>{r.corner ?? "–"}</td></tr>)}</tbody></table></Scroll>
      </details>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Momentum and strength, side by side
export function Momentum({ b, mine }: { b: Board; mine: Set<string> }) {
  const mx = matrix(b.rows), cards = matrixCards(b.rows), slugOf = (name: string) => b.rows.find((r) => r.name === name)?.slug ?? "";
  return (
    <Section id="sp-momentum" hide title="Momentum and strength, side by side" help="Rows: the state from Sector Pulse (are the industry's stocks turning up right now?). Columns: the box from Sector Rotation (has the industry been beating other industries?). An industry with no rotation box yet is left out."
      sub="Rows: are the industry's stocks turning up right now (Sector Pulse)? Columns: has the industry been beating other industries (Sector Rotation)?"
      why="A bounce in an industry that was already strong has more behind it than a bounce in one that keeps losing ground. Where both views agree, the picture is clearer.">
      <Cards items={cards} />
      <Scroll label="momentum and strength"><div className="sp-mx" style={{ gridTemplateColumns: `minmax(230px, auto) repeat(${BOX_ORDER.length}, minmax(150px, 1fr))` }}>
        <div className="sp-mx-c sp-mx-corner">Stocks turning up? ↓ · Beating other industries? →</div>
        {BOX_ORDER.map((c) => <div key={c} className={"sp-mx-c sp-mx-col sp-box-" + BOX[c].tone}><b aria-hidden="true">{BOX[c].arrow}</b> {BOX[c].word}<Tip text="A Sector Rotation box: how the industry has done against the average industry over recent months and weeks." /></div>)}
        {mx.states.map((k) => <>
          <div key={k} className="sp-mx-c sp-mx-row"><StateChip k={k} help /></div>
          {BOX_ORDER.map((c) => { const cell = mx.cells[k + ":" + c]; return (
            <div key={k + c} className={"sp-mx-c sp-mx-cell" + (cell.mark ? " sp-mx-" + cell.mark : "") + (cell.names.length ? "" : " sp-mx-none")}>
              {cell.mark && <p className="sp-mx-mark">{cell.mark === "strongest" ? "Strongest mix" : "Weakest mix"}</p>}
              {cell.names.length ? cell.names.map((nm, i) => <span key={nm}><Link to={`/sectors/${slugOf(nm)}`}>{short(nm)}</Link>{mine.has(slugOf(nm)) ? " ★" : ""}{i < cell.names.length - 1 ? ", " : ""}</span>) : "none"}
            </div>); })}
        </>)}
      </div></Scroll>
      {mine.size > 0 && <p className="sp-note">★ marks your industries.</p>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Standout stocks in weak industries
export function Standouts({ b }: { b: Board }) {
  const [all, setAll] = useState(false);
  const f = b.leader_flags;
  return (
    <Section id="sp-standouts" title="Standout stocks in weak industries" help="Standout stocks. Stocks at a new 1-year high while their industry is still well below its own high. They are holding up better than their neighbours."
      sub="Stocks at a new 1-year high while their own industry is still well below its high."
      why="When most of an industry is down, a stock that keeps making new highs is showing strength of its own. It is a place to start your research, not a signal to act on.">
      {f == null ? <LockedBlock plan="silver" title="The standout stocks are part of the Silver plan">The industry states and the stocks rising are open to everyone. Silver lists every stock at a new 1-year high inside a weak industry, with how far its industry is below its own high.</LockedBlock>
        : !f.length ? <p className="sp-empty">No stock is at a new 1-year high inside a weak industry today.</p>
        : <>
          <Scroll label="standout stocks"><table className="sp-tb sp-stand">
            <thead><tr><th scope="col">Stock</th><th scope="col">Its industry</th><th scope="col">How strong<Tip text="Strong: the industry is far below its own high, so the stock stands out the most. Early: the industry is a little less far below its high." /></th><th scope="col">New high</th><th scope="col">Its industry is</th></tr></thead>
            <tbody>{(all ? f : f.slice(0, 8)).map((x) => { const r = b.rows.find((g) => g.slug === x.group_slug), s = howStrong(x); return (
              <tr key={x.symbol + x.group_slug}><td><Link to={`/stocks/${x.symbol}`} className="sp-sym big"><CoLogo symbol={x.symbol} size={26} inline /><b>{x.symbol}</b></Link></td><td>{short(x.group)}</td>
                <td><span className="sp-chipw"><span className={"sp-chip " + (s === "Strong" ? "sp-st-bouncing" : "sp-st-sold_off")}>{s}</span><Tip text={s === "Strong" ? "Strong: its industry is far below its own 1-year high, so this stock stands out the most." : "Early: its industry is a little less far below its own 1-year high."} label={`About “${s}”`} /></span></td><td className="sp-good">{newHigh(x)}</td><td>{r?.index_vs_52w_high != null ? `${belowHigh(r.index_vs_52w_high)} its high` : "–"}</td></tr>); })}</tbody>
          </table></Scroll>
          {f.length > 8 && <button type="button" className="sp-morebtn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : `Show the other ${f.length - 8} standout stocks ▾`}</button>}
        </>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ Which stocks are counted · Too small for a reading
type SmallGroup = { slug: string; name: string; counted: number; listed: number | null; locked?: string; stocks: { symbol: string; name: string; ret_6m: number | null }[] | null };
function SmallList({ slug, name }: { slug: string; name: string }) {
  const q = useQuery<SmallGroup, ApiError>({ queryKey: ["sector-small", slug], queryFn: () => apiGet<SmallGroup>(`/api/sectors/small/${encodeURIComponent(slug)}`), staleTime: 300_000, retry: false });
  if (q.isLoading) return <span className="sp-nil">Loading…</span>;
  if (q.data?.locked) return <span className="sp-nil">The stocks are part of the Silver plan.</span>;
  if (!q.data?.stocks?.length) return <span className="sp-nil">No listed stock carries this group's name in the screener today.</span>;
  return <span className="sp-smalls" aria-label={`Stocks in ${name}`}>{q.data.stocks.map((s) => <Link key={s.symbol} to={`/stocks/${s.symbol}`} className="sp-sym"><CoLogo symbol={s.symbol} size={16} inline />{s.symbol}</Link>)}</span>;
}
export function CountedAndSmall({ b }: { b: Board }) {
  const u = b.universe, few = b.too_few_stocks ?? [], total = few.reduce((s, x) => s + x.stocks_counted, 0);
  const day = u ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(u.date + "T00:00:00Z").getUTCDay()]} ${dayMon(u.date)}` : "";
  return (
    <div className="sp-two sp-two-tight">
      {u && <Section id="sp-counted" title="Which stocks are counted" help="Only actively traded, established stocks are counted, so a few rarely traded names cannot swing the reading." sub="Only actively traded, established stocks, so a few rarely traded names cannot swing the reading.">
        <div className="sp-tiles">
          <div><small>NSE stocks with an industry</small><b>{n0(u.stocks_with_industry_traded)}</b><span>traded on {day}</span></div>
          <div><small>Actively traded and established</small><b>{n0(u.meet_rules)}</b><span>pass our checks</span></div>
          <div><small>Counted in an industry reading</small><b>{n0(u.counted_in_groups_with_reading)}</b><span>in the {b.rows.length} industries below</span></div>
        </div>
        <p className="sp-note">The list is reviewed once a month. Stocks left out still appear on each industry's page, marked "not counted".</p>
      </Section>}
      {few.length > 0 && <Section id="sp-small" title="Too small for a reading" sub={`${few.length} industries have too few counted stocks for a steady reading, ${total} stocks between them.`}>
        <details className="sp-more"><summary>Show the {few.length} industries ▾</summary>
          <ul className="sp-smalllist">{few.map((g) => <li key={g.slug}><details><summary><b>{g.name}</b> <small>{g.stocks_counted} stocks</small></summary><SmallList slug={g.slug} name={g.name} /></details></li>)}</ul>
        </details>
        {few.some((g) => g.name === "Diversified") && <p className="sp-note"><b>Diversified</b> is NSE's name for conglomerates, companies that run several unrelated businesses. It has nothing to do with diversifying your portfolio.</p>}
      </Section>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Words on this page
const WORDS: [string, string][] = [
  ["Sold off", "Most of this industry's stocks have fallen below their usual price level, and they have not turned up together yet. The industry is out of favour for now."],
  ["Bouncing back", "After a fall, most of the industry's stocks turned up together within a few days. It is the first sign of a recovery, and it can still fade."],
  ["Bouncing back after a crash", "The same broad bounce, but after a deep fall in which almost every stock in the industry hit a new low. Bounces after a crash can be sharp, and they can also fade."],
  ["Rising together", "Most of the industry's stocks are above their short, medium and longer-term price levels. The rise is broad, not carried by a few names."],
  ["Losing steam", "A bounce or a rise that is losing support: fewer of the industry's stocks are still going up."],
  ["Stocks rising", "Out of every 100 actively traded stocks in the industry, how many are trading above their medium trend. Above 50 means most of them are going up."],
  ["Short trend", "How many of the industry's stocks are above their average price of the last few weeks. It reacts first, so it moves a lot."],
  ["Medium trend", "How many are above their average price of roughly the last month. The main reading on this page."],
  ["Longer trend", "How many are above their average price of the last few months. It moves slowly and shows the bigger picture."],
  ["Below its 1-year high", "How far the industry (all its stocks averaged equally) is from its highest point of the past year. 0% means it is at the top."],
  ["Standout stocks", "Stocks at a new 1-year high while their industry is still well below its own high. They are holding up better than their neighbours."],
  ["Box (Sector Rotation)", "Each week every industry is compared with the average industry over the last few months and over recent weeks. The two answers put it in one of four boxes: Ahead and gaining, Ahead but slowing, Behind but gaining, Behind and slipping."],
  ["Market backdrop", "Whether the Nifty 50 is above or below its long-term average price. Above it, the market as a whole is in an uptrend."],
];
export function Words({ items = WORDS }: { items?: [string, string][] }) {
  return (
    <details className="sp-sec sp-fold">
      <summary><span><b className="sp-ft">Words on this page, in plain English</b></span><span className="sp-show">Show ▾</span></summary>
      <dl className="sp-words">{items.map(([t, d]) => <div key={t}><dt>{t}.</dt><dd>{d}</dd></div>)}</dl>
    </details>
  );
}

export function useMapData() { return useIndustryMap(); }
export function useHistory() { return useSectorHistory(); }
export { ORDER };
