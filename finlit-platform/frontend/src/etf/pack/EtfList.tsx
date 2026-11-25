// Task #183 part 3 (ETF portfolio, pack 03 §2 "Your ETFs tab"): the type strip (Indian shares / Gold / Shares abroad / Liquid, with symbols), three things to
// know, and one table with four views: Returns & cost (price, 1 day, 1, 3 and 5 years, expense ratio from AMFI; a list-average row), Trading (price vs NAV, red
// at 1% or more; traded a day over 20 sessions; tracking difference; fund house), Risk (swing and worst fall over 3 years; beta against the Nifty 500 with its
// reading, explained, share of the risk; a row for the list) and By type (groups that fold). ETF and Tracks always show, with a TWICE tag when two ETFs share an
// index; every heading sorts both ways. Task #276 (20 Nov pack): the view, the sort and the rows (after Find and the filters) come from the page, which draws the
// filter row above the table (FilterRow); the ETF column holds the symbol, name, ISIN and Edit | Sell (the dialogs replace Remove and the buys drop-down);
// "Tracks · type" names the index and the type; every beta prints its window. Task #390 PR A (developer file 34, Your ETFs E2–E4, F6, IB1): every column sorts
// on click and again to reverse, a dash last both ways; the heading row stays under the section bar while the table scrolls (FrozenTable, thead.px-pin);
// above 27 ETFs 25 rows show, then "Show all N ETFs ▾"; one label per heading with aria-sort, and each column's i has its own label. Describes; never advice.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Tip } from "../../components/sectors/pack/Common";
import { FrozenTable, ShowAll, andList, capRows, type CapRule } from "../../portfolio/shared";
import { Section } from "../../portfolio/kit/KitSection";
import { betaWindowText } from "../../lib/etfKeyFigs";
import { Insights } from "../../portfolio/pack/EquityPack";
import type { Card } from "../../lib/pulsePack";
import type { EtfPortfolio, EtfRisk, EtfRow } from "../../lib/etfPortfolio";
import { byType } from "../../lib/etfTop";
import { GroupBand, HoldingHeads, HoldingRowCells, TotalRow, holdingFigs, type LotsProps } from "../../portfolio/HoldingCells";

export type EtfView = "returns" | "trading" | "risk" | "type";
type Risk = EtfRisk["etfs"][number];
type Col = { k: string; label: string; help?: [string, string]; num?: boolean; get: (e: EtfRow, r?: Risk) => number | string | null };
const sp = (x: number | null | undefined, d = 2) => (x == null ? null : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}%`);
const pc = (x: number | null | undefined, d = 1) => (x == null ? "–" : `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}%`);
const b2 = (x: number | null | undefined) => (x == null ? "–" : x.toFixed(2));
const rupee = (v: number | null | undefined) => (v == null ? "–" : "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const cr = (v: number | null | undefined) => (v == null ? null : (v / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
const shortDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const house = (h: string | null | undefined) => (h || "").replace(/\s+mutual\s+fund$/i, "");
const Dash = ({ why }: { why?: string | null }) => <span className="pf-dash" title={why || undefined} aria-label={why ? `Not shown. ${why}` : "Not available"} tabIndex={why ? 0 : undefined}>–</span>;
const Ret = ({ v, why }: { v: number | null | undefined; why?: string | null }) => (v == null ? <Dash why={why} /> : <span className={v > 0 ? "sp-good" : v < 0 ? "sp-red" : ""}>{sp(v)}</span>);
const avg = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/** Three things to know about the ETFs themselves: the same index twice, a price far from its NAV, and how the liquid ETF earns (by its type). Exported for tests. */
export function etfsInsights(d: EtfPortfolio): Card[] {
  const xs = d.items.filter((e) => !e.gone), out: Card[] = [];
  for (const r of d.repeats) out.push({ kind: "watch", title: `${r.symbols.length === 2 ? "Two" : r.symbols.length} ETFs follow the ${r.label}`,
    text: `${andList(r.symbols)} track the same index, so they hold the same companies. The second adds no spread; what differs is the fund house, the cost and how much trades.` });
  const far = xs.filter((e) => e.premium != null && Math.abs(e.premium) >= 1).sort((a, b) => Math.abs(b.premium as number) - Math.abs(a.premium as number));
  for (const e of far.slice(0, 1)) out.push({ kind: "warning", title: `${e.symbol} trades well ${(e.premium as number) > 0 ? "above" : "below"} its NAV`,
    text: `It closed ${Math.abs(e.premium as number).toFixed(1)}% ${(e.premium as number) > 0 ? "above" : "below"} the value of what it holds${e.navBehind && e.navDate ? `, against the NAV of ${shortDay(e.navDate)} (the NAV is published a day behind the price)` : ""}. When demand runs ahead of new units being made, the price can sit well away from the NAV.` });
  for (const e of xs.filter((x) => x.type?.key === "liquid").slice(0, 1)) out.push(e.type?.payout
    ? { kind: "insight", title: "The liquid ETF earns through payouts", text: `${e.symbol}'s price barely moves: it pays out what it earns, so its price return says little about what it earned.` }
    : { kind: "insight", title: "The liquid ETF grows in price", text: `${e.symbol} keeps what it earns in its price${e.ret1y != null ? `, which rose ${pc(e.ret1y)} in the year` : ""}: a growth liquid ETF, not one that pays out.` });
  return out;
}

/** Task #235 (pack C2, C4, C5, C6): with `lots`, Returns & cost shows each ETF's money in three groups (What you paid · What it is worth now · Gain or loss),
 *  each ETF opens into its buys and sales (first in, first out within each account), and a total row sits at the foot. */
export type Sort = { k: string; dir: 1 | -1 };
/** The second line of "Tracks · type": the ETF's type, or "Commodity" for gold and silver (whose index is the metal itself). */
export const typeLine = (e: EtfRow) => (e.type?.key === "gold" || e.type?.key === "silver" ? "Commodity" : e.type?.word ?? "Indian shares");
export const VIEWS: [EtfView, string][] = [["returns", "Returns & cost"], ["trading", "Trading"], ["risk", "Risk"], ["type", "By type"]];
/** Task #390 (E4, B1): above 27 ETFs, 25 rows show (a list is capped at K only above K + 2, so the button never hides one or two rows). */
export const CAP_ETFS: CapRule = { over: 27, keep: 25 };
/** The table's frame: the heading row follows the page down under the section bar, or the table's own filter row once it takes the bar's place (E3). */
function Frame({ label, children }: { label: string; children: ReactNode }) {
  return <FrozenTable label={label} pinBelow=".ptk-frow.stuck, .ptk-bar:not(.away)" className="mff-frz">{children}</FrozenTable>;
}

export function EtfsTable({ d, rk, rows, lots, view, sort, setSort, tools, actions, gone: goneAct }: {
  d: EtfPortfolio; rk: EtfRisk | undefined; rows: EtfRow[]; lots?: LotsProps; view: EtfView; sort: Sort; setSort: (s: Sort) => void; tools: ReactNode;
  /** Edit | Sell under each ETF */ actions: (e: EtfRow) => ReactNode; /** the Remove button of an ETF no longer in the data */ gone: (e: EtfRow) => ReactNode;
}) {
  const groups = byType({ ...d, items: rows }), [open, setOpen] = useState<Set<string>>(() => new Set(byType(d).map((g) => g.key))), [capOpen, setCapOpen] = useState(false);
  const by = useMemo(() => new Map((rk?.etfs ?? []).map((r) => [r.symbol, r])), [rk]);
  const xs = rows, gone = d.items.filter((e) => e.gone);
  const base: Col[] = [{ k: "name", label: "ETF", get: (e) => e.symbol }, { k: "tracks", label: "Tracks · type", get: (e) => e.tracks.label }];
  const COLS: Record<Exclude<EtfView, "type">, Col[]> = {
    returns: [...base, { k: "price", label: "Price", num: true, get: (e) => e.price ?? null }, { k: "d1", label: "1 day", num: true, get: (e) => e.changePct ?? null },
      { k: "r1", label: "1 year", num: true, get: (e) => e.ret1y ?? null }, { k: "r3", label: "3 years", num: true, get: (e) => e.ret3y ?? null }, { k: "r5", label: "5 years", num: true, get: (e) => e.ret5y ?? null },
      { k: "ter", label: "Expense ratio", num: true, help: ["What the ETF charges a year, as a share of the money in it, from AMFI's TER file.", "Lower keeps more of the index's return for you."], get: (e) => e.ter?.value ?? null }],
    trading: [...base, { k: "prem", label: "Price vs NAV", num: true, help: ["How far the last NSE close sat above (+) or below (−) the ETF's NAV for the same day.", "1% or more either way is shown in red: buyers paid well more, or less, than the holdings were worth."], get: (e) => e.premium ?? null },
      { k: "tv", label: "Traded a day ₹ Cr", num: true, help: ["The average value traded on the NSE each day over the last 20 sessions.", "Higher is easier to buy and sell near the NAV."], get: (e) => e.avgTurnover ?? null },
      { k: "td", label: "Tracking difference", num: true, help: ["The ETF's price return over the past year less its index's return, in percentage points.", "Costs and cash held usually make it a little below 0. Blank where the index's daily levels are not on file."], get: (e) => e.tracking?.value ?? null },
      { k: "house", label: "Fund house", get: (e) => house(e.fundHouse) }],
    risk: [...base, { k: "swing", label: "Swing a year", num: true, get: (_e, r) => r?.swing ?? null }, { k: "fall", label: "Worst fall", num: true, get: (_e, r) => r?.worstFall ?? null },
      { k: "beta", label: "Beta", num: true, help: ["How much the ETF moved for every 1% the Nifty 500 moved, weekly prices over the past year.", "1 moves with the Indian market, above 1 more, below 1 less; the tag names its range."], get: (_e, r) => r?.betaPast ?? null },
      { k: "ex", label: "Explained", num: true, help: ["How much of the ETF's weekly moves the Nifty 500 explains (R²), past year.", "Under a fifth: the ETF moves on another asset, so its beta says little."], get: (_e, r) => r?.explained ?? null },
      { k: "risk", label: "Of the risk", num: true, help: ["The ETF's share of the list's weekly ups and downs over the past year; the shares add to 100%.", "Above its share of the list: it adds more than its size to how the list moves."], get: (_e, r) => r?.riskShare ?? null }],
  };
  if (lots) {   // task #235: the money columns replace Price and 1 day in Returns & cost
    const f = (e: EtfRow) => holdingFigs(lots, e.symbol);
    COLS.returns = [...base, { k: "qty", label: "Qty", num: true, get: (e) => f(e).a?.qty ?? null }, { k: "avg", label: "Avg buy price", num: true, get: (e) => f(e).a?.avg ?? null },
      { k: "invested", label: "Invested", num: true, get: (e) => f(e).a?.invested ?? null }, { k: "price", label: "Price", num: true, get: (e) => e.price ?? null },
      { k: "change", label: "1 day", num: true, get: (e) => e.changePct ?? null }, { k: "now", label: "Value now", num: true, get: (e) => f(e).now },
      { k: "gain", label: "₹", num: true, get: (e) => f(e).gain }, { k: "gainPct", label: "%", num: true, get: (e) => f(e).gainPct },
      ...COLS.returns.slice(4)];
  }
  const cols = COLS[view === "type" ? "returns" : view];
  const col = cols.find((c) => c.k === sort.k) ?? cols[0];
  const sorted = (es: EtfRow[]) => [...es].sort((a, b) => { const x = col.get(a, by.get(a.symbol)), y = col.get(b, by.get(b.symbol));
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });   // a dash (null) sorts last both ways
  const capped = capRows(sorted(xs), CAP_ETFS, capOpen), shownRows = capped.shown;
  const more = capped.capped ? <ShowAll n={xs.length} noun="ETF" open={capOpen} onToggle={() => setCapOpen(!capOpen)} className="mff-more" /> : null;
  const th = (c: Col) => { const on = sort.k === c.k;
    return <th key={c.k} scope="col" className={c.num ? "r" : undefined} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="mff-sort" onClick={() => setSort({ k: c.k, dir: on && sort.dir === 1 ? -1 : 1 })}>{c.label}{on ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>{c.help && <Tip text={c.help[0]} how={c.help[1]} label={`About “${c.label}”`} />}</th>; };
  const etfCell = (e: EtfRow) => (<>
    <th scope="row"><span className="x-nl"><Link to={`/etfs/${encodeURIComponent(e.symbol)}`} className="mfp-fund">{e.symbol}</Link></span><small className="mfp-sub">{e.name}</small>
      <small className="mfp-isin" title="ISIN: names the exact ETF">{e.isin ?? "No ISIN"}</small>{actions(e)}</th>
    <td className="etp-tracks">{e.tracks.label ?? "–"}{e.twice && <span className="mff-tag etp-twice" title="Two ETFs in your list follow this index">TWICE</span>}<small className="mfp-sub">{typeLine(e)}</small></td></>);
  const sortHead = (id: string, _label: string, cls: string) => { const c = cols.find((x) => x.k === id)!, on = sort.k === id;
    return <th key={id} scope="col" className={cls} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="mff-sort" onClick={() => setSort({ k: id, dir: on && sort.dir === 1 ? -1 : 1 })}>{c.label}{on ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button></th>; };
  const rets = (e: EtfRow) => <><td className="r"><Ret v={e.ret1y} why={e.ret1yWhy} /></td><td className="r"><Ret v={e.ret3y} why={e.ret3yWhy} /></td><td className="r"><Ret v={e.ret5y} why={e.ret5yWhy} /></td>
    <td className="r">{e.ter?.value == null ? <Dash why={e.ter?.why} /> : `${e.ter.value.toFixed(2)}%`}</td></>;
  const retRow = (e: EtfRow) => lots ? <tr key={e.symbol}>{etfCell(e)}<HoldingRowCells p={lots} symbol={e.symbol} priceCell={<td className="r x-c2 x-gs cg-h"><b>{rupee(e.price)}</b></td>}
      changeCell={<td className="r x-c2 cg-h"><Ret v={e.changePct} /></td>} />{rets(e)}</tr>
    : <tr key={e.symbol}>{etfCell(e)}<td className="r"><b>{rupee(e.price)}</b></td><td className="r"><Ret v={e.changePct} /></td>
    <td className="r"><Ret v={e.ret1y} why={e.ret1yWhy} /></td><td className="r"><Ret v={e.ret3y} why={e.ret3yWhy} /></td><td className="r"><Ret v={e.ret5y} why={e.ret5yWhy} /></td>
    <td className="r">{e.ter?.value == null ? <Dash why={e.ter?.why} /> : `${e.ter.value.toFixed(2)}%`}</td></tr>;
  const own = rk?.own?.list;
  return (
    <Section id="etp-etfs" title="Your ETFs" help="Each ETF in your list: what it tracks, its price returns and cost, how it trades against its NAV, and its risk against the Nifty 500." how="Pick a view on the right; click a heading to sort, again to reverse. A TWICE tag: two ETFs follow the same index."
      sub={`${d.count} ${d.count === 1 ? "ETF" : "ETFs"} · ${d.limit} on your plan.${d.asOf ? ` Prices of ${new Date(d.asOf + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.` : ""} Click a column heading to sort.`}>
      <div id="etp-zone">
      {tools}
      {!xs.length && <p className="sp-note" role="status">No ETF in your list matches the search and filters. Clear filters to see all {d.count}.</p>}
      {view === "returns" && lots && <Frame label="returns and cost"><table className="sp-tb mff-t kit-grid x-grp">
        <thead><tr className="mff-groups"><th colSpan={2} /><GroupBand /><th colSpan={3} className="mff-gh mff-div">Price returns, total</th><th className="mff-gh">Cost</th></tr>
          <tr>{cols.slice(0, 2).map(th)}<HoldingHeads sortHead={sortHead} price="Price" today="1 day" />{cols.slice(10).map(th)}</tr></thead>
        <tbody>{shownRows.map(retRow)}</tbody>
        <tfoot><TotalRow p={lots} symbols={xs.map((e) => e.symbol)} lead={2} rest={4} noun={["ETF", "ETFs"]} />
          <tr><th scope="row" colSpan={6}>List average</th><td className="r"><Ret v={avg(xs.map((e) => e.changePct))} /></td><td colSpan={3} /><td className="r"><Ret v={avg(xs.map((e) => e.ret1y))} /></td><td /><td />
          <td className="r">{(() => { const v = avg(xs.map((e) => e.ter?.value)); return v == null ? "–" : `${v.toFixed(2)}%`; })()}</td></tr></tfoot></table></Frame>}
      {view === "returns" && !lots && <Frame label="returns and cost"><table className="sp-tb mff-t kit-grid">
        <thead><tr className="mff-groups"><th colSpan={2} /><th className="mff-gh">Price</th><th colSpan={4} className="mff-gh mff-div">Price returns, total</th><th className="mff-gh">Cost</th></tr><tr>{cols.map(th)}</tr></thead>
        <tbody>{shownRows.map(retRow)}</tbody>
        <tfoot><tr><th scope="row" colSpan={3}>List average</th><td className="r"><Ret v={avg(xs.map((e) => e.changePct))} /></td><td className="r"><Ret v={avg(xs.map((e) => e.ret1y))} /></td><td /><td />
          <td className="r">{(() => { const v = avg(xs.map((e) => e.ter?.value)); return v == null ? "–" : `${v.toFixed(2)}%`; })()}</td></tr></tfoot></table></Frame>}
      {view === "trading" && <Frame label="trading"><table className="sp-tb mff-t kit-grid">
        <thead><tr className="mff-groups"><th colSpan={2} /><th colSpan={2} className="mff-gh">{d.asOf ? `On ${shortDay(d.asOf)}` : "Last close"}</th><th colSpan={2} className="mff-gh mff-div">How well it follows</th></tr><tr>{cols.map(th)}</tr></thead>
        <tbody>{shownRows.map((e) => <tr key={e.symbol}>{etfCell(e)}
          <td className="r">{e.premium == null ? <Dash why={e.premiumWhy} /> : <><b className={Math.abs(e.premium) >= 1 ? "sp-red" : undefined}>{sp(e.premium)}</b>{e.navBehind && e.navDate && <small className="mfp-sub">NAV of {shortDay(e.navDate)}</small>}</>}</td>
          <td className="r">{cr(e.avgTurnover) == null ? <Dash why={e.avgTurnoverWhy} /> : <><b>{cr(e.avgTurnover)}</b><small className="mfp-sub">20 sessions</small></>}</td>
          <td className="r">{e.tracking?.value == null ? <span className="sp-note" title={e.tracking?.why || undefined}>{/nothing to measure|no daily level/i.test(e.tracking?.why || "") ? "Needs index closes" : "–"}</span> : sp(e.tracking.value)}</td>
          <td>{house(e.fundHouse) || "–"}</td></tr>)}</tbody></table></Frame>}
      {view === "risk" && <Frame label="risk of each ETF"><table className="sp-tb mff-t kit-grid">
        <thead><tr className="mff-groups"><th colSpan={2} /><th colSpan={2} className="mff-gh">3 years</th><th colSpan={2} className="mff-gh mff-div">Against the Nifty 500, 1 year</th><th className="mff-gh">Share</th></tr><tr>{cols.map(th)}</tr></thead>
        <tbody>{shownRows.map((e) => { const r = by.get(e.symbol); return <tr key={e.symbol}>{etfCell(e)}
          <td className="r">{pc(r?.swing)}</td><td className="r sp-red">{r?.worstFall == null ? "–" : pc(r.worstFall)}{r?.years != null && r.years < 2.95 && r.from ? <small className="mfp-sub">since {new Date(r.from + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</small> : null}</td>
          <td className="r">{r?.compared === false ? <span className="sp-note">Not compared</span> : r?.betaPast == null ? <span className="sp-note">{r?.betaWhy ?? "Under a year"}</span> : <><b>{b2(r.betaPast)}</b> {r.band && <span className={"mff-rd r-" + r.band.key}>{r.band.word}</span>}<small className="mfp-sub etp-win">{betaWindowText(r.betaWindow)}</small></>}</td>
          <td className="r">{r?.explained == null ? "–" : `${r.explained}%`}</td><td className="r">{r?.riskShare == null ? "–" : `${r.riskShare.toFixed(1)}%`}</td></tr>; })}</tbody>
        <tfoot><tr><th scope="row" colSpan={2}>Your list</th><td className="r">{pc(rk?.list.swing)}<small className="mfp-sub">3 years</small></td><td className="r sp-red">{pc(rk?.list.worstFall)}<small className="mfp-sub">3 years</small></td>
          <td className="r"><b>{b2(own?.beta500 ?? own?.betaOwn)}</b> {(own?.beta500Band ?? own?.betaOwnBand) && <span className={"mff-rd r-" + (own?.beta500Band ?? own?.betaOwnBand)!.key}>{(own?.beta500Band ?? own?.betaOwnBand)!.word}</span>}<small className="mfp-sub etp-win">{betaWindowText(rk?.etfs.find((x) => x.betaWindow)?.betaWindow)}</small></td><td /><td className="r">100%</td></tr></tfoot></table></Frame>}
      {view === "type" && <div className="mff-types"><div className="mff-oa"><button type="button" className="eq-oa" onClick={() => setOpen(open.size ? new Set() : new Set(groups.map((g) => g.key)))}>{open.size ? "Close all" : "Open all"}</button></div>
        <Frame label="ETFs by type"><table className={"sp-tb mff-t kit-grid" + (lots ? " x-grp" : "")}><thead>{lots ? <tr>{cols.slice(0, 2).map(th)}<HoldingHeads sortHead={sortHead} price="Price" today="1 day" />{cols.slice(10).map(th)}</tr> : <tr>{cols.map(th)}</tr>}</thead>
          {groups.map((g) => { const on = open.has(g.key), a = avg(g.etfs.map((e) => e.ret1y));
            return <tbody key={g.key}><tr className="mff-grow"><th scope="rowgroup" colSpan={cols.length}><button type="button" aria-expanded={on} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>
              <b>{g.word}</b> · {g.n} {g.n === 1 ? "ETF" : "ETFs"} · {Math.round(g.share)}% of the list · average 1 year {a == null ? "–" : sp(a, 1)} <span aria-hidden="true">{on ? "▴" : "▾"}</span></button></th></tr>
              {on && sorted(g.etfs).map(retRow)}</tbody>; })}
        </table></Frame></div>}
      {view !== "type" && more}
      </div>
      <Insights items={etfsInsights(d)} scope="etf.list" />
      {gone.length > 0 && <p className="sp-note">No longer in our data: {gone.map((e) => <span key={e.symbol}>{e.symbol} {goneAct(e)} </span>)}</p>}
      <p className="sp-note">Price returns to the last close; 3 and 5 years are the total change, not a yearly rate. Dividends are not included. Expense ratios from AMFI's TER file{xs.some((e) => e.ter?.value == null) ? "; a dash names its reason" : ""}.</p>
    </Section>
  );
}
