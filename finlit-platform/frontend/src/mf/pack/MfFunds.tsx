// Task #183 part 2 (MF portfolio, pack 02 §2 "Your funds"): the fund type strip, three things to know, the band filter (the API's label), and one table with
// four views: Overview (Health Score, a divider, the four Health parts in the server's words with the number under each, status with the category rank),
// Returns & costs, Risk (each fund against its own benchmark) and By fund type (groups that fold). Every heading sorts both ways. Describes; never advice.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import { Insights } from "../../portfolio/pack/EquityPack";
import type { Card } from "../../lib/pulsePack";
import { crores, pct1, rupees, typeOf, type Holding, type MfSpread } from "../../lib/mfPortfolio";
import { fundName, type FundRisk, type MfRisk } from "../../lib/mfPack";
import { GroupBand, HoldingHeads, HoldingRowCells, LotRows, LotToggle, TotalRow, holdingFigs, type LotsProps } from "../../portfolio/HoldingCells";
import { keyOf } from "../../lib/mfBook";

export type FundsView = "overview" | "returns" | "risk" | "type";
type Col = { k: string; label: string; help?: [string, string]; num?: boolean; get: (h: Holding, f?: FundRisk) => number | string | null };
const PARTS = [["performance", "Performance"], ["risk", "Risk"], ["cost", "Cost"], ["quality", "Quality"]] as const;
const TONE = (w: string | null | undefined) => (/strong|healthy/i.test(w || "") ? "g" : /average|fair/i.test(w || "") ? "m" : /weak|poor/i.test(w || "") ? "b" : "n");
const cap = (w: string | null | undefined) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "");
const STATUS = (s: string | null | undefined) => (s === "RATED" ? "Rated" : s === "PROVISIONAL" ? "Provisional" : s === "NOT RATED" ? "Not rated" : s === "NOT SCORED" ? "Not scored" : cap(s));
const b2 = (x: number | null | undefined) => (x == null ? "–" : x.toFixed(2));
const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const isIdcw = (h: Holding) => /idcw|dividend/i.test(h.option || "");
const shortHouse = (amc: string | null) => (amc || "").replace(/\s+mutual\s+fund$/i, "").replace(/^Jio BlackRock$/i, "Jio BlackRock");
const optShort = (o: string | null) => (o || "").replace(/ option$/i, "").replace(/^(growth|idcw).*$/i, (m) => (/^idcw/i.test(m) ? "IDCW" : "Growth"));

/** The fund type strip's groups (Equity / Hybrid / Debt / …), with each group's categories and share of the list. Exported for tests. */
export function typeStrip(hs: Holding[]) {
  const valued = hs.length > 0 && hs.every((h) => h.current != null && h.current > 0), tot = valued ? hs.reduce((a, h) => a + (h.current as number), 0) : hs.length;
  const m = new Map<string, { n: number; w: number; cats: Set<string> }>();
  for (const h of hs) { const t = typeOf(h.category); const g = m.get(t) ?? { n: 0, w: 0, cats: new Set<string>() }; g.n++; g.w += valued ? (h.current as number) : 1; g.cats.add(h.categoryLabel || "Other"); m.set(t, g); }
  const order = ["Equity", "Hybrid", "Debt", "Solution oriented", "Others"];
  return [...m].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([t, g]) => ({ type: t, n: g.n, share: Math.round((g.w / tot) * 100), cats: [...g.cats].sort() }));
}

/** Three things to know about the funds themselves: a theme held twice, how the scores read, and cost. Exported for tests. */
export function fundsInsights(hs: Holding[], sp: MfSpread | undefined): Card[] {
  const out: Card[] = [];
  const th = sp?.readings.theme;
  if (th?.theme && th.funds.length > 1) out.push({ kind: "watch", title: `${th.funds.length === 2 ? "Two" : th.funds.length} funds share one theme`, text: `${hs.filter((h) => th.funds.includes(h.code)).map((h) => fundName(h.name)).join(" and ")} both follow ${th.theme} companies, so they hold many of the same kind of stocks.` });
  const scored = hs.filter((h) => h.score.label);
  const byWord = new Map<string, number>(); scored.forEach((h) => byWord.set(cap(h.score.label), (byWord.get(cap(h.score.label)) ?? 0) + 1));
  const most = [...byWord].sort((a, b) => b[1] - a[1])[0];
  if (most) out.push({ kind: "insight", title: `${most[1] === 1 ? "One fund reads" : `${["No", "One", "Two", "Three", "Four", "Five", "Six"][most[1]] ?? most[1]} funds read`} ${most[0]}`, text: `Of your ${hs.length} funds, ${[...byWord].map(([w, n]) => `${n} ${w.toLowerCase()}`).join(", ")} on the Fund Health Score.` });
  const ter = hs.filter((h) => h.ter != null).sort((a, b) => (a.ter as number) - (b.ter as number));
  if (ter.length > 1) { const lo = ter[0], hi = ter[ter.length - 1];
    out.push({ kind: /liquid|overnight|money/i.test(lo.categoryLabel || "") ? "good" : "insight", title: /liquid|overnight|money/i.test(lo.categoryLabel || "") ? "Low cost where it matters least" : "Costs differ",
      text: `${fundName(lo.name)} costs ${lo.ter!.toFixed(2)}% a year and ${fundName(hi.name)} ${hi.ter!.toFixed(2)}%, the highest in your list.` }); }
  return out;
}

function Word({ w, n }: { w: string | null | undefined; n?: number | null }) {
  return <span className="mff-pw"><span className={"mff-chip " + TONE(w)}>{w || "–"}</span>{n != null && <small>{Math.round(n)}</small>}</span>;
}

/** `listLabel`: the server's word for the list's average score (its band function; the page never cuts the number itself). */
/** Task #235 (pack C1, C4, C5, C6): with `lots`, Overview shows each fund's money in three groups (What you paid · What it is worth now · Gain or loss: Units,
 *  Avg buy NAV, Invested · Latest NAV, Value now · ₹, %), each fund opens into its buys and sales (first in, first out within each platform; no Today:
 *  NAVs change once a day), and a total row sits at the foot. */
export function FundsTable({ hs, rk, sp, actions, listLabel, lots }: { hs: Holding[]; rk: MfRisk | undefined; sp: MfSpread | undefined; actions: (h: Holding) => ReactNode; listLabel: string | null; lots?: LotsProps }) {
  const [view, setView] = useState<FundsView>("overview"), [band, setBand] = useState<string>("All"), [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "name", dir: 1 });
  const [open, setOpen] = useState<Set<string>>(new Set(["Equity", "Hybrid", "Debt", "Solution oriented", "Others"]));
  const by = useMemo(() => new Map((rk?.funds ?? []).map((f) => [f.code, f])), [rk]);
  const theme = sp?.readings.theme, themeTag = (h: Holding) => (theme?.theme && theme.funds.length > 1 && theme.funds.includes(h.code) ? `${theme.theme} ×${theme.funds.length}` : null);
  const words = ["Strong", "Healthy", "Average", "Weak", "Poor"].filter((w) => w === "Healthy" || w === "Average" || w === "Weak" || hs.some((h) => cap(h.score.label) === w));
  const COLS: Record<FundsView, Col[]> = {
    overview: [{ k: "name", label: "Fund", get: (h) => fundName(h.name) }, { k: "type", label: "Type", get: (h) => h.categoryLabel },
      { k: "nav", label: "NAV", num: true, get: (h) => h.nav }, { k: "score", label: "Score", num: true, get: (h) => h.score.final },
      ...PARTS.map(([k, l]) => ({ k, label: l, num: true, get: (h: Holding) => h.score.parts?.[k] ?? null })), { k: "status", label: "Status", get: (h) => h.score.rank ? h.score.rank.rank / h.score.rank.of : null }],
    returns: [{ k: "name", label: "Fund", get: (h) => fundName(h.name) }, { k: "type", label: "Type", get: (h) => h.categoryLabel },
      { k: "r1y", label: "1 year", num: true, get: (h) => h.returns.r1y }, { k: "r3y", label: "3 years, a year", num: true, get: (h) => h.returns.r3y }, { k: "r5y", label: "5 years, a year", num: true, get: (h) => h.returns.r5y },
      { k: "ter", label: "Expense ratio", num: true, help: ["What the fund charges a year, as a share of the money in it (AMFI's TER file).", "Lower keeps more of the fund's return for you."], get: (h) => h.ter },
      { k: "aum", label: "Fund size", num: true, get: (h) => h.aum }],
    risk: [{ k: "name", label: "Fund", get: (h) => fundName(h.name) }, { k: "swing", label: "Swing a year · 3 yrs", num: true, get: (_h, f) => f?.swing ?? null },
      { k: "fall", label: "Worst fall · 3 yrs", num: true, get: (_h, f) => f?.worstFall ?? null },
      { k: "beta", label: "Beta against its benchmark · past year", num: true, help: ["How much the fund moved for every 1% its own category's benchmark moved, from weekly NAVs over the past year.", "1 moves with its benchmark, above 1 more, below 1 less; the tag names its range."], get: (_h, f) => f?.betaOwn ?? null },
      { k: "bench", label: "Benchmark", get: (_h, f) => f?.benchmark ?? null },
      { k: "risk", label: "Share of the risk", num: true, help: ["The fund's share of the list's weekly ups and downs over the past year; the shares add to 100%.", "Above its share of the list: it adds more than its size to how the list moves."], get: (_h, f) => f?.riskShare ?? null }],
    type: [],
  };
  if (lots) {   // task #235: the money columns replace NAV in Overview
    const f = (h: Holding) => holdingFigs(lots, keyOf(h.id));
    COLS.overview = [COLS.overview[0], COLS.overview[1], { k: "qty", label: "Units", num: true, get: (h) => f(h).a?.qty ?? null }, { k: "avg", label: "Avg buy NAV", num: true, get: (h) => f(h).a?.avg ?? null },
      { k: "invested", label: "Invested", num: true, get: (h) => f(h).a?.invested ?? null }, { k: "price", label: "Latest NAV", num: true, get: (h) => h.nav },
      { k: "now", label: "Value now", num: true, get: (h) => f(h).now }, { k: "gain", label: "₹", num: true, get: (h) => f(h).gain }, { k: "gainPct", label: "%", num: true, get: (h) => f(h).gainPct },
      ...COLS.overview.slice(3)];
  }
  const cols = COLS[view === "type" ? "overview" : view];
  const shown = hs.filter((h) => band === "All" || cap(h.score.label) === band);
  const col = cols.find((c) => c.k === sort.k) ?? cols[0];
  const rows = [...shown].sort((a, b) => { const x = col.get(a, by.get(a.code)), y = col.get(b, by.get(b.code));
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  const th = (c: Col, extraCls = "") => {
    const on = sort.k === c.k;
    return <th key={c.k} scope="col" className={(c.num ? "r " : "") + extraCls} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="mff-sort" onClick={() => setSort({ k: c.k, dir: on && sort.dir === 1 ? -1 : 1 })}>{c.label}{on ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>
      {c.help && <Tip text={c.help[0]} how={c.help[1]} />}</th>;
  };
  const fundCell = (h: Holding, buys = false) => (
    <th scope="row"><Link to={`/funds/${h.code}`} className="mfp-fund">{fundName(h.name) || `Scheme ${h.code}`}</Link>
      <small className="mfp-sub">{[shortHouse(h.amc), h.plan, optShort(h.option)].filter(Boolean).join(" · ")}{h.folio ? ` · folio ${h.folio}` : ""}</small>
      <small className="mfp-isin" title={h.isin ? "ISIN: names the exact plan and option" : h.isinWhy ?? undefined}>{h.isin ?? "No ISIN"}{buys && lots && <LotToggle p={lots} symbol={keyOf(h.id)} />}</small>{view === "overview" && actions(h)}</th>);
  const navCell = (h: Holding, cls = "r") => <td className={cls}>{h.nav == null ? "–" : <><b>{rupees(h.nav, true)}</b><small className="mfp-sub">{h.navDate ? shortDate(h.navDate) : ""}</small></>}</td>;
  const overviewRow = (h: Holding) => { const s = h.score; const row = (
    <tr key={h.id} className={TONE(s.label) === "b" ? "mff-weak" : undefined}>{fundCell(h, true)}
      <td>{h.categoryLabel || "–"}{themeTag(h) && <span className="mff-tag">{themeTag(h)}</span>}</td>
      {lots ? <HoldingRowCells p={lots} symbol={keyOf(h.id)} priceCell={navCell(h, "r x-c2 x-gs cg-h")} changeCell={null} /> : navCell(h)}
      <td className="mff-sc">{s.final == null ? <span className="sp-note" title={s.reason || undefined}>{STATUS(s.status) || "No score"}</span> : <span className="mff-score"><b className={"mff-num " + TONE(s.label)}>{Math.round(s.final)}</b> <span className={"mff-w " + TONE(s.label)}>{cap(s.label)}</span></span>}</td>
      {PARTS.map(([k], i) => <td key={k} className={"c" + (i === 0 ? " mff-div" : "")}>{s.parts ? <Word w={s.words?.[k] ?? null} n={s.parts[k]} /> : "–"}</td>)}
      <td className="mff-st">{s.status ? <span className={"mff-status " + (s.status === "RATED" ? "g" : "m")}>{STATUS(s.status)}</span> : "–"}
        {s.rank && <small className="mfp-sub">{s.rank.rank} of {s.rank.of} in category</small>}{s.inherited && <small className="mfp-sub">Growth plan's score</small>}</td>
      </tr>);
    return lots ? [row, lots.open.has(keyOf(h.id)) && <LotRows key={h.id + ":lots"} p={lots} symbol={keyOf(h.id)} lead={2} rest={6} />] : row; };
  const avg = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const listAvg = avg(hs.map((h) => h.score.final)), labelOf = () => listLabel;
  const risk = rk?.own?.list;
  const strip = typeStrip(hs);
  return (
    <Section id="mfp-funds" title="Your funds" help="Each fund in your list with its Fund Health Score and four Health parts, its returns and costs, and its risk against its own benchmark." how="Pick a view on the right; click a heading to sort, again to reverse. A tinted row reads Weak."
      sub={`${hs.length} ${hs.length === 1 ? "fund" : "funds"}. Click a column heading to sort.`}
      right={<div className="sp-view mff-views" role="group" aria-label="Table view">{([["overview", "Overview"], ["returns", "Returns & costs"], ["risk", "Risk"], ["type", "By fund type"]] as [FundsView, string][]).map(([k, l]) =>
        <button key={k} type="button" className={"sp-vbtn" + (view === k ? " on" : "")} aria-pressed={view === k} onClick={() => { setView(k); setSort({ k: "name", dir: 1 }); }}>{l}</button>)}</div>}>
      <div className="mff-strip">{strip.map((g) => <div key={g.type} className={"mff-g mff-" + g.type.toLowerCase().split(" ")[0]}><b>{g.type}</b> {g.n} · {g.share}%<small>{g.cats.join(" · ")}</small></div>)}</div>
      <Insights items={fundsInsights(hs, sp)} scope="mf.funds" />
      {view !== "type" && <div className="mff-bands" role="group" aria-label="Show funds by Health Score band">{["All", ...words].map((w) => {
        const n = w === "All" ? hs.length : hs.filter((h) => cap(h.score.label) === w).length;
        return <button key={w} type="button" className={"mff-band" + (band === w ? " on" : "")} aria-pressed={band === w} onClick={() => setBand(w)}>{w} {n}</button>; })}</div>}
      {view === "overview" && <Scroll label="your funds"><table className={"sp-tb mff-t kit-grid" + (lots ? " x-grp" : "")}>
        <thead><tr className="mff-groups">{lots ? <><th colSpan={2} /><GroupBand mf /></> : <th colSpan={3} />}<th className="mff-gh">Health Score</th><th colSpan={4} className="mff-gh mff-div">Health parts<Tip text="Each part of the Fund Health Score against funds in the same category: performance, risk, cost and quality." how="Strong, Fair or Weak, with the part's number under it. A strong Risk part means lower risk." /></th><th className="mff-gh">Score</th><th /></tr>
          {lots ? <tr>{cols.slice(0, 2).map((c) => th(c))}<HoldingHeads mf sortHead={(id, _l, cls) => th(cols.find((c) => c.k === id)!, cls)} />{th(cols[9], "mff-sc")}{cols.slice(10, 14).map((c, i) => th(c, "c" + (i === 0 ? " mff-div" : "")))}{th(cols[14])}</tr>
            : <tr>{cols.slice(0, 3).map((c) => th(c))}{th(cols[3], "mff-sc")}{cols.slice(4, 8).map((c, i) => th(c, "c" + (i === 0 ? " mff-div" : "")))}{th(cols[8])}</tr>}</thead>
        <tbody>{rows.map(overviewRow)}</tbody>
        <tfoot>{lots && <TotalRow p={lots} symbols={hs.map((h) => keyOf(h.id))} lead={2} rest={6} noun={["fund", "funds"]} />}<tr><th scope="row" colSpan={lots ? 9 : 3}>List average</th><td className="mff-sc">{listAvg == null ? "–" : <span className="mff-score"><b className={"mff-num " + TONE(labelOf())}>{Math.round(listAvg)}</b> <span className={"mff-w " + TONE(labelOf())}>{cap(labelOf())}</span></span>}</td>
          {PARTS.map(([k], i) => { const v = avg(hs.map((h) => h.score.parts?.[k])); return <td key={k} className={"c" + (i === 0 ? " mff-div" : "")}><b>{v == null ? "–" : Math.round(v)}</b></td>; })}<td /></tr></tfoot>
      </table></Scroll>}
      {view === "returns" && <Scroll label="returns and costs"><table className="sp-tb mff-t kit-grid"><thead><tr>{cols.map((c) => th(c))}</tr></thead>
        <tbody>{rows.map((h) => <tr key={h.id}>{fundCell(h)}<td>{h.categoryLabel || "–"}</td>
          {(["r1y", "r3y", "r5y"] as const).map((k) => <td key={k} className="r">{h.returns[k] == null ? <span className="pf-dash" title={h.returns.why || h.returns.partialWhy || undefined}>–</span> : pct1(h.returns[k])}</td>)}
          <td className="r">{h.ter == null ? <span className="pf-dash" title={h.terWhy || undefined}>–</span> : `${h.ter.toFixed(2)}%`}</td><td className="r">{h.aum == null ? <span className="pf-dash" title={h.aumWhy || undefined}>–</span> : crores(h.aum)}</td>
          </tr>)}</tbody></table></Scroll>}
      {view === "risk" && <Scroll label="risk of each fund"><table className="sp-tb mff-t kit-grid"><thead><tr>{cols.map((c) => th(c))}</tr></thead>
        <tbody>{rows.map((h) => { const f = by.get(h.code); return <tr key={h.id}>{fundCell(h)}
          <td className="r">{f?.swing == null ? "–" : `${f.swing.toFixed(1)}%`}</td><td className="r sp-red">{f?.worstFall == null ? "–" : `${f.worstFall < 0 ? "−" : ""}${Math.abs(f.worstFall).toFixed(1)}%`}</td>
          <td className="r">{f?.compared === false ? <span className="sp-note">Not compared</span> : f?.betaOwn == null ? <span className="sp-note">{f?.why ?? "Under a year"}</span> : <><b>{b2(f.betaOwn)}</b> {f.band && <span className={"mff-rd r-" + f.band.key}>{f.band.word}</span>}</>}</td>
          <td>{f?.benchmark ?? "–"}{f?.standIn && <span className="mff-tag stand" title={f.benchWhy ?? undefined}>Stand-in</span>}</td>
          <td className="r">{f?.riskShare == null ? "–" : `${f.riskShare.toFixed(1)}%`}</td></tr>; })}</tbody>
        <tfoot><tr><th scope="row">Your list</th><td className="r">{rk?.list.swing == null ? "–" : `${rk.list.swing.toFixed(1)}%`}</td><td className="r sp-red">{rk?.list.worstFall == null ? "–" : `−${Math.abs(rk.list.worstFall).toFixed(1)}%`}</td>
          <td className="r"><b>{b2(risk?.betaOwn)}</b> {risk?.betaOwnBand && <span className={"mff-rd r-" + risk.betaOwnBand.key}>{risk.betaOwnBand.word}</span>}</td><td>Each fund's own</td><td className="r">100%</td></tr>
          <tr><th scope="row">Nifty 500</th><td className="r">{rk?.bench.swing == null ? "–" : `${rk.bench.swing.toFixed(1)}%`}</td><td className="r sp-red">{rk?.bench.worstFall == null ? "–" : `−${Math.abs(rk.bench.worstFall).toFixed(1)}%`}</td><td className="r">1.00</td><td>–</td><td /></tr></tfoot></table></Scroll>}
      {view === "type" && <div className="mff-types"><div className="mff-oa"><button type="button" className="eq-oa" onClick={() => setOpen(open.size ? new Set() : new Set(strip.map((g) => g.type)))}>{open.size ? "Close all" : "Open all"}</button></div>
        <Scroll label="funds by type"><table className="sp-tb mff-t kit-grid"><thead><tr><th scope="col">Fund</th><th scope="col">Category</th><th scope="col" className="r">Health Score</th><th scope="col" className="r">Swing a year · 3 yrs</th></tr></thead>
          {strip.map((g) => { const its = hs.filter((h) => typeOf(h.category) === g.type), a = avg(its.map((h) => h.score.final)), sw = avg(its.map((h) => by.get(h.code)?.swing)), on = open.has(g.type);
            return <tbody key={g.type}><tr className="mff-grow"><th scope="rowgroup" colSpan={4}><button type="button" aria-expanded={on} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(g.type)) n.delete(g.type); else n.add(g.type); return n; })}>
              <b>{g.type}</b> · {g.n} {g.n === 1 ? "fund" : "funds"} · {g.share}% of the list · average health {a == null ? "–" : Math.round(a)} · average swing {sw == null ? "–" : `${sw.toFixed(1)}%`} <span aria-hidden="true">{on ? "▴" : "▾"}</span></button></th></tr>
              {on && its.map((h) => { const f = by.get(h.code); return <tr key={h.id}>{fundCell(h)}<td>{h.categoryLabel}</td><td className="r">{h.score.final == null ? "–" : Math.round(h.score.final)}</td><td className="r">{f?.swing == null ? "–" : `${f.swing.toFixed(1)}%`}</td></tr>; })}</tbody>; })}
        </table></Scroll></div>}
      <p className="sp-note">Health parts: Strong, Fair or Weak against funds in the same category. A strong Risk part means lower risk. "Provisional": under 3 years of NAVs, so the score is trusted in proportion.</p>
      {hs.some((h) => h.score.inherited) && <p className="sp-note">IDCW options carry the score of the Growth plan of the same fund.</p>}
      {view === "returns" && hs.some(isIdcw) && <p className="sp-note mfp-idcw" role="note">IDCW options show no 1, 3 or 5 year return: each payout lowers the NAV, so the change in NAV would understate what was earned. The fund's Growth plan shows the full return.</p>}
    </Section>
  );
}
