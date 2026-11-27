// Developer file 47 (founder, 27 Nov 2026: "13 and 14 both show peers and some things repeat; make sure nothing repeats; remove the Risk tab"): this is now
// 14 Industry, the one place for the industry. Its "Against peers" tab repeated 13 Peers (the 12-month ranking, where all the peers sit, the same company
// cards), so it is gone; its one view of its own, "What if you had owned the group leader?", moved to 13 (LeaderWhatIf, exported). The Risk tab is gone: Prism
// Risk is on the Prism card at the top and its other figures are in the header and 03. The summary no longer counts the peers (13 does).
// "Where <company> stands" (final pages pack, board 17): its industry, its peers and its risk, one question per tab (its own price chart left in developer
// file 43: 03 Price & technicals draws it, with the trends, the 1-year high and the returns). It replaces the report's
// "Where its industry stands" (Sector & peers) and "Where this stock stands among its peers" (Leadership) sections. Every figure is the server's: the stock's sector
// reading, its industry page, Sector Rotation, the peer reading and its history, the price and Prism; the words come from lib/standsPack. Describes; never advice.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { LockedBlock } from "../../components/sectors/Parts";
import { BoxChip, Cards, StateChip, Tip } from "../../components/sectors/pack/Common";
import { STATE_HELP, WORD, keyOf, short } from "../../lib/pulsePack";
import { BOX_HELP } from "../../lib/rotationPack";
import { failureText, useSectorPage, useStockSector, type IndustryPage, type RankedStock } from "../../lib/sectors";
import { useRotationCard } from "../../lib/rotation";
import { useLeadershipHistory } from "../../lib/leadership";
import { capBucket } from "../../lib/capBuckets";
import { trendAlignment } from "../../lib/prismTechnical";
import { sectionNo } from "../../lib/sectionNav";
import { revealAndScroll } from "../../components/PhoneFold";
import { usePlanModel, usePlanPrism } from "../../lib/planScore";
import { headline, industryCards, ordinal, rotationLine } from "../../lib/standsPack";
import "../../styles/sectors-pack.css";
import "../../styles/industry-pack.css";
import { median, shortList, stripDots } from "../../lib/standsList";
import { DropChev } from "../../components/DropChev";
import "./stands.css";
import { KnowButton } from "../../portfolio/pack/Round388";
import "../../portfolio/pack/eq385.css";   // the pop-up's quiet card list (scoped .eq; the pop-up carries the class)
import type { Card } from "../../lib/pulsePack";
import { SectionHead } from "../Sections";
import { coTitle, shortLabel } from "../../lib/companyLabel";
import { IndustryNumbers } from "./IndustryNumbers";

const sp = (x: number | null | undefined, dp = 1, unit = "%") => (x == null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(dp)}${unit}`);
const size = (cr: number | null | undefined) => capBucket(cr ?? null)?.label.replace(" cap", "") ?? "–";

export function WhereStands({ symbol, name }: { symbol: string; name: string }) {
  const short1 = name.replace(/\s+(industries|limited|ltd\.?|corporation|corp\.?|company)\b.*$/i, "").trim() || name;
  const secQ = useStockSector(symbol), sec = secQ.data ?? null;
  const g = sec?.group ?? null, locked = !!sec?.locked?.stock;
  const page = useSectorPage(g?.slug ?? "").data ?? null;   // null while loading or without an industry
  const rot = useRotationCard(g?.slug ?? "", !!g).data;
  const model = usePlanModel();
  const pm = usePlanPrism(useMemo(() => [symbol], [symbol]), model)[symbol];
  const prism = pm && pm !== "error" ? pm : null;
  const ind = g ? short(g.name) : null, key = g ? keyOf(g) : null;
  const align = prism ? trendAlignment(prism.shortTerm?.score, prism.longTerm?.score)?.label ?? null : null;
  const h = headline(short1, ind, key ? WORD[key] : null, sec, rot, null);   // developer file 47: the peers' rank is 13's, not repeated here
  const sixRank = sec?.rank_6m != null && sec.ranked_6m ? `${ordinal(sec.rank_6m)} of ${sec.ranked_6m}` : null;
  return (
    <section className="block sp ws" aria-label={`${short1}'s industry`} data-testid="where-stands">
      <SectionHead id="sector" no="Industry" icon="layers" tier="gold" sub={ind ? `${ind} against the other industries, and where ${short1} ranks inside it.` : `Its industry against the others, and where ${short1} ranks inside it.`} />
      <div className="sp-sec ws-head">
        {h && <p className="ws-lead"><b>{h.lead}</b>{h.rest}</p>}
        <div className="ws-strip ws-reads">
          {key && <div className="ws-pill">Industry now <StateChip k={key} /><Tip text={STATE_HELP[key]} label="About the industry's state" /></div>}
          {rot?.corner && rot.corner !== "middle" && <div className="ws-pill">Against other industries <BoxChip corner={rot.corner} /><Tip text={BOX_HELP[rot.corner]} label={`About “${rot.corner_name}”`} /></div>}
          {sixRank && !locked && <div className="ws-pill">Inside its industry <b className={"ws-q q" + (sec?.quarter ?? 0)}>{sixRank}</b></div>}
          {/* developer file 43: the chart tab is gone (03 Price & technicals draws the price), so this reading points there */}
          {align && <div className="ws-pill">Its own chart <b className="ws-own">{align}</b><a className="ws-go" href="#price" onClick={toPrice}>{sectionNo("price")} Price &amp; technicals ↑</a></div>}
        </div>
      </div>
      <div id="ws-panel">
        {secQ.isError && <p className="sp-note" role="status" data-testid="sector-blank">{failureText(secQ.error)}</p>}
        {!secQ.isError && (!g ? <p className="sp-note">{sec?.note ?? "NSE has not given this stock an industry yet, so there is no industry reading to show."}</p> : <IndustryTab name={short1} symbol={symbol} sec={sec!} locked={locked} page={page} rot={rot} />)}
      </div>
      <p className="sp-note ws-foot">Describes past prices and breadth; not a recommendation. Information only, not investment advice.</p>
    </section>
  );
}

/** Developer file 43: the "Its own chart" reading's link to 03 Price & technicals; on a phone it opens that section's row first, as the section bar does. */
const toPrice = (e: React.MouseEvent) => { e.preventDefault(); revealAndScroll(document.getElementById("price"), (x) => x.scrollIntoView({ behavior: "smooth", block: "start" })); };

/** Developer file 43 (founder, 27 Nov 2026: "the three boxes, can we add them as 3 dots like we did in the equity portfolio page, to reduce the length of the
 *  page"): a tab's notes as the equity portfolio shows its things to know: a pill with one dot a note in its kind's colour ("●●● 3 things to know") at the
 *  top right of the tab, opening the notes in a pop-up (the same cards, closed until pressed, Open all and ×). The row of boxes took about 150 px a tab. */
function Know({ items, scope }: { items: Card[]; scope: string }) {
  if (!items.length) return null;
  return <div className="ws-know"><KnowButton items={items} scope={scope} inline /></div>;
}

// ------------------------------------------------------------------------------------------------ Its industry
function IndustryTab({ name, symbol, sec, locked, page, rot }: { name: string; symbol: string; sec: NonNullable<ReturnType<typeof useStockSector>["data"]>; locked: boolean; page: IndustryPage | null; rot: ReturnType<typeof useRotationCard>["data"] }) {
  const g = sec.group!, k = keyOf(g), ind = short(g.name);
  const f = page ?? g;   // the industry page is open to every plan and carries the breadth figures; the stock's own sector answer leaves them out below Gold
  const hist = page?.history, ser = hist ? hist.above_20.slice(-126) : [];
  const W = 420, H = 60, xs = ser.map((_, i) => 4 + (i / Math.max(1, ser.length - 1)) * (W - 8)), y = (v: number) => H - 4 - (v / 100) * (H - 8);
  const d = ser.map((v, i) => (v == null ? "" : `${i && ser[i - 1] != null ? "L" : "M"}${xs[i].toFixed(1)},${y(v).toFixed(1)}`)).join("");
  const stocks = (page?.stocks ?? null) as RankedStock[] | null, max = stocks ? Math.max(1, ...stocks.map((x) => Math.abs(x.return_6m_pct ?? 0))) : 1;
  const row = (lab: string, help: string, v: string) => <div className="ws-row"><span>{lab}<Tip text={help} label={`About “${lab}”`} /></span><b>{v}</b></div>;
  return (<>
    <Know scope="ws-industry" items={locked ? [] : industryCards(name, ind, sec, page, rot, k)} />
    <div className="ws-two">
      <div className="sp-sec ws-box">
        <p className="ws-cap">Sector Pulse · the last few days</p>
        <p className="ws-chiprow"><StateChip k={k} /><Tip text={STATE_HELP[k]} label="About the industry's state" /></p>
        {page?.summary && <p className="ws-txt">{page.summary}</p>}
        {d && <><svg viewBox={`0 0 ${W} ${H}`} className="ws-spark" role="img" aria-label={`Stocks above their medium trend over 6 months, now ${Math.round(ser[ser.length - 1] ?? 0)} of 100`}><line x1="4" x2={W - 4} y1={y(50)} y2={y(50)} className="ws-mid" /><path d={`${d}L${W - 4},${H}L4,${H}Z`} className="ws-area" /><path d={d} className="ws-line" fill="none" /></svg>
          <small className="ws-small">Stocks above their medium trend, out of 100, last 6 months · dashed line = 50</small></>}
        {row("Stocks above their short trend", "Short trend. How many of the industry's stocks are above their average price of the last few weeks. It reacts first, so it moves a lot.", f.breadth?.above_9 == null ? "–" : `${Math.round(f.breadth.above_9)} of 100`)}
        {row("Industry below its 1-year high", "Below its 1-year high. How far the industry (all its stocks averaged equally) is from its highest point of the past year. 0% means it is at the top.", f.index_vs_52w_high == null ? "–" : `${Math.abs(f.index_vs_52w_high).toFixed(1)}%`)}
        {row("Stocks that held up at the last low", "Held up at the low. When the industry last made a low, how many of its stocks did NOT make a new low with it. A low number means the fall hit almost everyone, which is what a crash looks like.", f.held_up == null ? (f.higher_low_note ? "–" : "No recent low") : `${Math.round(f.held_up)} of 100`)}
        {row("Stocks counted", "Stocks counted. Only actively traded, established stocks are counted, so a few rarely traded names cannot swing the reading.", f.stocks_counted == null ? "–" : `${f.stocks_counted} of ${f.stocks_listed}`)}
        <Link className="sp-link" to={`/sectors/${g.slug}`}>Open the {ind} page →</Link>
      </div>
      <div className="sp-sec ws-box">
        <p className="ws-cap">Sector Rotation · the last few months</p>
        {rot && rot.corner && rot.corner !== "middle" ? <>
          <p className="ws-chiprow"><BoxChip corner={rot.corner} /><Tip text={BOX_HELP[rot.corner]} label={`About “${rot.corner_name}”`} /></p>
          <p className="ws-txt">{rotationLine(ind, rot)}</p>
          {row("Rank", `Rank. The industry's place among the ${rot.ranked ?? "ranked"} ranked industries this week, by how it has done against the average industry. 1 is the strongest.`, rot.rank == null ? "Not ranked yet" : `${rot.rank} of ${rot.ranked}${rot.rank_change_1w ? ` ${rot.rank_change_1w > 0 ? "▲" : "▼"}${Math.abs(rot.rank_change_1w)}` : ""}`)}
          {row("6 months, against the average industry", "6 months. How many percentage points better (+) or worse (−) the industry did than the average industry over the last six months.", sp(rot.strength_pts, 1, " pts"))}
          {row("Last month, against the average", "1 month. How many percentage points better (+) or worse (−) the industry's stocks did than the average industry over the last month.", sp(rot.change_pts, 1, " pts"))}
          {row("Weeks in this box", "Weeks in this box. How long the industry has stayed in its current box. Long stays show a steady trend.", String(rot.weeks_in_corner))}
          {rot.this_week_reading_name && rot.this_week_reading_name !== rot.corner_name && <Cards items={[{ kind: "watch", title: "May change box next week", text: `This week's reading is ${rot.this_week_reading_name}. The box changes only if the next weekly reading agrees.` }]} />}
          <Link className="sp-link" to="/sector-rotation">Open Sector Rotation →</Link>
        </> : <p className="sp-note">{rot?.note ?? "No rotation reading for this industry yet: it has too few counted stocks, or this week's files are not in."}</p>}
      </div>
    </div>
    {/* developer file 51 (founder, 27 Nov 2026: "can we add something more to industry analysis?"): the company against its industry's median company on
        nine measures from the screener figures, open to every plan as the Screener is */}
    <IndustryNumbers symbol={symbol} name={name} g={g} />
    {locked ? <LockedBlock plan="gold" title="Where the stock ranks inside its industry is part of the Gold plan">Open to everyone: the industry's state and its place against other industries. Gold adds this stock's 6-month rank among its industry's counted stocks.</LockedBlock>
      : <div className="sp-sec">
        <h3 className="ws-h3">Inside its industry: 6-month return<Tip text={`Inside its industry. Where ${name}'s 6-month return falls among the actively traded stocks of its NSE industry.`} /></h3>
        {stocks ? <IndustryList stocks={stocks} symbol={symbol} name={name} ind={ind} max={max} /> : null}
          {!stocks && (sec.in_group === false ? <p className="sp-note">{sec.note ?? `${name} is not counted in its industry's breadth, so it has no rank inside it.`}</p> : <p className="sp-note">The industry's stock list is loading.</p>)}
      </div>}
  </>);
}

/** "Inside its industry: 6-month return" (task #222, 19 Nov pack B2; developer file 43, founder 27 Nov 2026: "reduce the size, use a drop-down or whatever
 *  suits"). The industry's stocks are one strip of dots by 6-month return: the company ringed and named above its dot, 0% as a solid line, the median as a
 *  dashed one, the lowest and the highest named under the ends; pointing at or tapping a dot names that stock in the label instead. The ranked list (rank
 *  numbers, bars, the short list for more than 15 stocks from lib/standsList.ts and "Show all N") opens under "All N stocks, ranked". Collapsing "Show all"
 *  scrolls back to the box when its top has left the screen. For 12 stocks the block is about 150 px, down from about 400. */
/** The strip's width in px: two dots closer than a dot's width (13 px) take separate lanes, and a phone's strip is a third of a desktop's. */
function useStripWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [w, setW] = useState(900), ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect(); ro.current = null;
    if (!el) return;
    setW(Math.max(200, Math.round(el.getBoundingClientRect().width) || 900));
    if (typeof ResizeObserver === "undefined") return;
    ro.current = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.current.observe(el);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, w];
}

export function IndustryList({ stocks, symbol, name, ind, max }: { stocks: RankedStock[]; symbol: string; name: string; ind: string; max: number }) {
  const [all, setAll] = useState(false), [hot, setHot] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const n = stocks.length, meI = stocks.findIndex((x) => x.symbol === symbol), me = meI >= 0 ? stocks[meI] : null, med = median(stocks.map((x) => x.return_6m_pct));
  const items = shortList(n, meI, all);
  const toggle = () => { const on = !all; setAll(on); if (!on && box.current && box.current.getBoundingClientRect().top < 0) box.current.scrollIntoView({ block: "start" }); };
  const [trackRef, tw] = useStripWidth();
  const dense = n > 40;   // a large industry draws smaller dots (8 px), so more fit side by side
  const strip = useMemo(() => stripDots(stocks.map((x) => x.return_6m_pct), ((dense ? 9 : 13) / tw) * 100, 6), [stocks, tw, dense]);
  const lanes = Math.max(1, ...strip.dots.map((d) => (d ? d.lane + 1 : 1)));
  const shown = hot ?? (meI >= 0 ? meI : null), cur = shown != null ? stocks[shown] : null, curD = shown != null ? strip.dots[shown] : null;
  const end = (k: number, word: string) => { const x = stocks[k]; return x && x.return_6m_pct != null && k !== meI ? <span>{word} {shortLabel(x)} <b className={x.return_6m_pct >= 0 ? "sp-good" : "sp-red"}>{sp(x.return_6m_pct)}</b></span> : <span />; };
  return (<div ref={box}>
    <p className="sp-sub">One dot per counted {ind} stock; the solid line is 0%. Tap a dot for its name.</p>
    <p className="ws-sum">{me ? <><b>{symbol} {ordinal(meI + 1)} of {n}</b> · {sp(me.return_6m_pct)} </> : null}{med != null && <span>{me ? "· " : ""}<i className="ws6-medk" aria-hidden="true" />industry median {sp(med)}</span>}</p>
    <div className={"ws6" + (dense ? " dense" : "")} role="group" aria-label={`6-month returns of the ${n} counted ${ind} stocks, from ${sp(stocks[n - 1]?.return_6m_pct)} to ${sp(stocks[0]?.return_6m_pct)}${me ? `; ${name} ${sp(me.return_6m_pct)}, ${ordinal(meI + 1)}` : ""}`}>
      <p className="ws6-lab" aria-live="polite">{cur && curD && <span className={hot != null && hot !== meI ? "hot" : ""} style={{ left: `${curD.pos}%`, transform: `translateX(${curD.pos < 30 ? "-6px" : curD.pos > 70 ? "calc(6px - 100%)" : "-50%"})` }}>
        {cur.symbol === symbol ? symbol : shortLabel(cur)} <b>{sp(cur.return_6m_pct)}</b> <small>{ordinal((shown as number) + 1)} of {n}</small></span>}</p>
      <div className="ws6-track" ref={trackRef} style={{ height: 14 + lanes * (dense ? 9 : 12) }} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHot(null); }}>
        <i className="ws6-zero" style={{ left: `${strip.at(0)}%` }} />
        {med != null && <i className="ws6-med" style={{ left: `${strip.at(med)}%` }} />}
        {strip.dots.map((d) => { if (!d) return null; const x = stocks[d.i], v = x.return_6m_pct as number;
          return <button key={x.symbol} type="button" className={"ws6-dot " + (v >= 0 ? "pos" : "neg") + (x.symbol === symbol ? " me" : "") + (hot === d.i ? " on" : "")} style={{ left: `${d.pos}%`, bottom: 7 + d.lane * (dense ? 9 : 12) }}
            aria-label={`${d.i + 1}. ${shortLabel(x)} ${sp(v)}`} title={`${d.i + 1}. ${coTitle(x)} ${sp(v)}`}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") setHot(d.i); }} onFocus={() => setHot(d.i)} onBlur={() => setHot(null)} onClick={() => setHot(d.i)} />; })}
      </div>
      <p className="ws6-ends">{end(n - 1, "Lowest")}{end(0, "Highest")}</p>
    </div>
    <details className="xdd notes ws6-dd"><summary>All {n} stocks, ranked<DropChev /></summary>
      <ol className={"ws-bars" + (n > 15 ? " long" : "") + (all ? " all" : "")}>{items.map((it, j) => {
        if (it.kind === "gap") return <li key={"gap" + j} className="rk-gap" aria-hidden="true">{it.n} more</li>;
        const x = stocks[it.i], v = x.return_6m_pct ?? 0, mine = x.symbol === symbol;
        return <li key={x.symbol} className={mine ? "me" : ""}><span className="ws-rk">{it.i + 1}</span><Link to={`/stocks/${x.symbol}`} title={coTitle(x)}>{shortLabel(x)}</Link><span className="ws-axis"><i className={v >= 0 ? "pos" : "neg"} style={{ width: `${(Math.abs(v) / max) * 50}%` }} /></span><b className={v >= 0 ? "sp-good" : "sp-red"}>{sp(x.return_6m_pct)}</b></li>;
      })}</ol>
      {n > 15 && <button type="button" className="ws-all" aria-expanded={all} onClick={toggle}>{all ? "Show fewer" : `Show all ${n}`}</button>}
    </details>
  </div>);
}

// ------------------------------------------------------------------------------------------------ the group leader (shown in 13 Peers)
/** "What if you had owned the group leader?": ₹1 lakh in the company and in the group's leader a year ago (developer file 47: in 13 Peers, beside the ranking). */
export function LeaderWhatIf({ symbol, name, leader, leaderName, leaderCap, myCap }: { symbol: string; name: string; leader: string; leaderName: string; leaderCap: number | null; myCap: number | null }) {
  const a = useLeadershipHistory(symbol).data, b = useLeadershipHistory(leader).data;
  const sa = a?.series, sb = b?.series;
  if (!sa || !sb) return <div className="sp-sec"><h3 className="ws-h3">What if you had owned the group leader?</h3><p className="sp-note">{a && b ? "One of the two companies has too little price history for this." : "Loading the two price lines…"}</p></div>;
  const by = new Map(sb.dates.map((d, i) => [d, sb.stock[i]]));
  const pts = sa.dates.map((d, i) => [d, sa.stock[i], by.get(d) ?? null] as const).filter((x) => x[1] != null && x[2] != null).slice(-53);
  if (pts.length < 10) return <div className="sp-sec"><h3 className="ws-h3">What if you had owned the group leader?</h3><p className="sp-note">The two companies share too few weeks of prices for this.</p></div>;
  const m = pts.map(([, x]) => (x as number) / (pts[0][1] as number) * 100), l = pts.map(([, , x]) => (x as number) / (pts[0][2] as number) * 100);
  const lo = Math.min(...m, ...l), hi = Math.max(...m, ...l), W = 420, H = 150, X = (i: number) => 30 + (i / (pts.length - 1)) * (W - 40), Y = (v: number) => 8 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 24);
  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const lakh = (v: number) => "₹" + Math.round(v * 1000).toLocaleString("en-IN");
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <div className="sp-sec">
      <h3 className="ws-h3">What if you had owned the group leader?<Tip text="Hindsight: it shows the past, not what will happen next." /></h3>
      <p className="sp-sub">Both lines start at 100 {pts.length >= 52 ? "a year ago" : `${pts.length} weeks ago`}.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="ws-wi" role="img" aria-label={`₹1 lakh in ${symbol} is now ${lakh(m[m.length - 1])}; in ${leader}, ${lakh(l[l.length - 1])}`}>
        {ticks.map((t) => <g key={t}><line x1="30" x2={W - 10} y1={Y(t)} y2={Y(t)} className="ws-grid" /><text x="2" y={Y(t) + 4} className="ws-tick">{Math.round(t)}</text></g>)}
        <line x1="30" x2={W - 10} y1={Y(100)} y2={Y(100)} className="ws-mid" />
        <path d={line(l)} className="ws-ll" fill="none" /><path d={line(m)} className="ws-ml" fill="none" />
      </svg>
      {/* developer file 47: green or red by whether the amount is above or below the ₹1 lakh it started at (it was red for this company and green for the leader whatever they did) */}
      <div className="ws-wv"><span>₹1 lakh in {symbol}<b className={m[m.length - 1] >= 100 ? "sp-good" : "sp-red"}>{lakh(m[m.length - 1])}</b></span><span>₹1 lakh in {leader}<b className={l[l.length - 1] >= 100 ? "sp-good" : "sp-red"}>{lakh(l[l.length - 1])}</b></span></div>
      {leaderCap != null && myCap != null && leaderCap * 5 < myCap && <Cards items={[{ kind: "watch", title: "Not a like-for-like swap", text: `${leaderName} is a ${size(leaderCap).toLowerCase()} company worth about ₹${Math.round(leaderCap).toLocaleString("en-IN")} Cr; ${name} is worth about ₹${Math.round(myCap).toLocaleString("en-IN")} Cr. Small companies can rise faster, and fall faster.` }]} />}
    </div>
  );
}

