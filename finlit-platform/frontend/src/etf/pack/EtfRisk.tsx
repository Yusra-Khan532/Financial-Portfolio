// Task #183 part 3 (ETF portfolio, pack 03 §4 "Risk analytics", rebuilt with the beta block of equity and MF): 1 At a glance (against the Nifty 500) →
// 2 How your list's beta is built (by type, then Reading a beta and the three figures: your list, without the liquid ETF, Indian share ETFs only) → 3 Each ETF
// against the Nifty 500 ("Different asset" where it explains under a fifth) → 4 Share of the list vs share of the risk → 5 If the market fell 10% → 6 Each ETF's
// risk. Every ETF is measured against the Nifty 500: an index ETF's beta against its own index is about 1 by design (COMMON-RULES 8). The figures are the
// server's (/api/me/etf-portfolio/risk); the beta ranges are the owner's table. The Equity page's eqr- styles are shared. Describes; never advice.
// Task #390 PR B (developer file 34, Risk analytics view and Update 25 Nov rows 3, 4, 5, 7): the six range names in one pass from their keys (Much less
// sensitive … Very high; the server's keys and words unchanged), "Moves with the Nifty 500" and "0.58×" for the beta words, "points", the "Without the
// liquid ETF" box only on a list that holds one, the labels on the scale (RiskPack BetaScale), six range boxes of one size with "+N more" (an ETF version of
// the MF page's boxes on the same Popup and mf-risk389.css), "ETF" / "Nifty 500" lines and an Overall column, every risk table sorts (words by rank) and
// stops at 10 rows above 12, the 10% fall stops at the 10 deepest above 12 ETFs, real minus signs, lists as "A, B and C".
import { useMemo, useState } from "react";
import { Scroll, Tip } from "../../components/sectors/pack/Common";
import { Section } from "../../portfolio/kit/KitSection";
import { Insights } from "../../portfolio/pack/EquityPack";
import { MarketFall } from "../../portfolio/pack/MarketFall";
import { Step } from "../../portfolio/pack/EqSteps385";
import { BetaScale, Popup, type Pin } from "../../portfolio/pack/RiskPack";
import { OVERALL_RANK, overallOf } from "../../portfolio/pack/risk385";
import { BETA_RANGE_WORD, MINUS, ShowAll, SortHead, andList, betaRangeWord, capRows, countOf, movesAsMuch, useSort, type CapRule, type SortCol } from "../../portfolio/shared";
import { RANGE_EDGES, type RangeKey } from "../../lib/eqRisk";
import type { Card } from "../../lib/pulsePack";
import type { Band, EtfPortfolio, EtfRisk, Inside } from "../../lib/etfPortfolio";
import { live } from "../../lib/etfTop";
import { benchText, benchWindow, betaWindowText, swingCheck } from "../../lib/etfKeyFigs";
import type { ReactNode } from "react";
import "../../portfolio/pack/risk-pack.css";
import "../../mf/pack/mf-risk389.css";
import "./etf390.css";

type R = EtfRisk["etfs"][number];
/** A beta with two decimals and a real minus ("−0.04"). */
const b2 = (v: number | null | undefined) => (v == null ? "–" : `${v < 0 ? MINUS : ""}${Math.abs(v).toFixed(2)}`);
const sp = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(d)}%`);
const pc = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v < 0 ? MINUS : ""}${Math.abs(v).toFixed(d)}%`);
const MAX = 2.5, at = (b: number) => `${(Math.max(0, Math.min(MAX, b)) / MAX) * 100}%`;
/** A range's name, from its key (file 34, R1 and fault 8: one pass, never a chain of renames; the server still sends "Defensive" for the key "defensive"). */
export const bandWord = (band: Band | null | undefined) => (band ? betaRangeWord(band.key, band.word) : "");
const Chip = ({ band }: { band: Band | null | undefined }) => (band ? <span className={"eqr-chip mfr-chip r-" + band.key}><i aria-hidden="true" />{bandWord(band)}</span> : null);
const BAR = ["#1f6b6b", "#b8892f", "#2E7D57", "#8fa8a6", "#B4362B", "#6b5ea8"];
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const num = (n: number) => NUM[n] ?? String(n);
const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const TYPE_ORDER = ["indian", "gold", "silver", "abroad", "debt", "liquid"];
const TYPE_LINE: Record<string, string> = { gold: "moves on the gold price", silver: "moves on the silver price", abroad: "moves on markets abroad", debt: "moves on interest rates", liquid: "overnight rate, counts as 0" };
type P = { rk: EtfRisk; d: EtfPortfolio; ins?: Inside; value?: { now: number; name?: string } | null };
/** File 34 (R6b, Build these too 4 and 5): above 12 rows, 10 show, then "Show all N ETFs". */
export const RISK_CAP: CapRule = { over: 12, keep: 10 };
/** The liquid ETFs (not compared: they follow no share index). File 34, fault 2: the liquid box and its words only when the list holds one. */
export const liquidOf = (rk: EtfRisk) => rk.etfs.filter((e) => e.compared === false);

/** The ETFs grouped by type for the beta build: count, average beta (within the type, weighted by the list), share of the list, what it adds. Exported for tests. */
export function byType(rk: EtfRisk) {
  const m = new Map<string, R[]>();
  for (const e of rk.etfs) { const t = e.type?.key ?? "indian"; m.set(t, [...(m.get(t) ?? []), e]); }
  return [...m].sort((a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0])).map(([key, es]) => {
    const share = es.reduce((a, e) => a + e.weight, 0), ok = es.filter((e) => e.betaPast != null);
    const avg = ok.length === es.length && share ? ok.reduce((a, e) => a + (e.betaPast as number) * e.weight, 0) / share : null;
    return { key, word: es[0].type?.word ?? "Indian shares", n: es.length, avg: avg == null ? null : Math.round(avg * 100) / 100, share, adds: avg == null ? null : Math.round(((avg * share) / 100) * 100) / 100, etfs: es };
  });
}

/** The sum card's line with real minus signs: "0.59 − 0.01 + 0.00" (file 34, Update row 5), never "+ -0.01". */
export function sumLine(adds: (number | null)[]): string {
  return adds.map((a, i) => (a == null ? (i ? ` + –` : "–") : i === 0 ? b2(a) : a < 0 ? ` ${MINUS} ${Math.abs(a).toFixed(2)}` : ` + ${a.toFixed(2)}`)).join("");
}

export function riskLede(rk: EtfRisk) {
  const b = rk.own?.list.beta500 ?? rk.own?.list.betaOwn;
  if (b == null) return null;
  const lead = b < 0.9 ? "Your list moves less than the Indian market." : b > 1.1 ? "Your list moves more than the Indian market." : "Your list moves about with the Indian market.";
  return { lead, rest: `It has moved ${b2(b)}% for every 1% move in the Nifty 500${rk.list.swing != null && rk.bench.swing != null ? `, and over 3 years it has swung ${rk.list.swing.toFixed(1)}% in a typical year against ${rk.bench.swing.toFixed(1)}% for the Nifty 500 (${benchWindow(rk.bench)})` : ""}.` };
}

export function glanceTiles(rk: EtfRisk) {
  const l = rk.list, b = rk.bench, o = rk.own?.list, liq = liquidOf(rk).length > 0, beta = o?.beta500 ?? o?.betaOwn;
  const ratio = l.swing != null && b.swing ? l.swing / b.swing : null;
  return [
    { k: "Typical swing in a year · 3 yrs", v: pc(l.swing), vs: benchText(b), sub: ratio == null ? "Not enough prices." : ratio < 0.85 ? "A calmer ride than the index." : ratio > 1.15 ? "A bumpier ride than the index." : "About as bumpy as the index.",
      help: "How much the list's value has moved up and down in a typical year, from daily prices over 3 years.", how: "Higher is a bumpier ride. Set it beside the Nifty 500's." },
    { k: "Worst fall from a high · 3 yrs", v: sp(l.worstFall), vs: `Nifty 500: ${sp(b.worstFall)}`, sub: l.worstFall == null || b.worstFall == null ? "Not enough prices." : l.worstFall > b.worstFall / 2 ? "Less than half as deep." : l.worstFall > b.worstFall ? "Shallower than the index." : "Deeper than the index.",
      help: "The largest drop of the list from a high to a later low, over 3 years of daily prices.", how: "A larger minus figure is a deeper fall." },
    { k: "In the 10 worst weeks · past year", v: sp(o?.worst10.list), vs: `Nifty 500: ${sp(o?.worst10.nifty500)}`, sub: o?.worst10.list == null || o.worst10.nifty500 == null ? "Not enough prices." : o.worst10.list > o.worst10.nifty500 + 0.3 ? "Falls less when the market falls." : o.worst10.list < o.worst10.nifty500 - 0.3 ? "Falls more when the market falls." : "Falls about as much as the market.",
      help: "The list's average weekly change in the Nifty 500's 10 worst weeks of the past year.", how: "Above the Nifty 500's figure: the list fell less in those weeks." },
    // file 34 (R2a, W11): "Beta, Nifty 500" reads "Moves with the Nifty 500", the figure "0.58×"
    { k: "Moves with the Nifty 500", v: beta == null ? "–" : `${b2(beta)}×`, vs: "market: 1.00×", sub: beta == null ? "Not enough prices." : `${beta < 0.9 ? "Moves less than the market." : beta > 1.1 ? "Moves more than the market." : "Moves about with the market."} ${betaWindowText(rk.etfs.find((e) => e.betaWindow)?.betaWindow)}.`,
      help: `How much the list has moved when the Nifty 500 moved: each ETF against the Nifty 500 over the past year of weekly prices, the ETFs combined by their share of the list${liq ? ", liquid ETFs as 0" : ""}.`, how: "1.00× moves with the Indian market; above 1 more, below 1 less." },
  ];
}

function glanceCards(rk: EtfRisk): Card[] {
  const out: Card[] = [];
  if (rk.list.swing != null && rk.bench.swing != null) out.push(rk.list.swing < rk.bench.swing ? { kind: "good", title: "Calmer than the market", text: `The list swings ${rk.list.swing.toFixed(1)}% a year against ${rk.bench.swing.toFixed(1)}% for the Nifty 500.` }
    : { kind: "watch", title: "Bumpier than the market", text: `The list swings ${rk.list.swing.toFixed(1)}% a year against ${rk.bench.swing.toFixed(1)}% for the Nifty 500.` });
  const most = [...rk.etfs].filter((e) => e.riskShare != null).sort((a, b) => (b.riskShare as number) - (a.riskShare as number))[0];
  if (most) out.push({ kind: "watch", title: `${most.symbol} carries the most risk`, text: `${pc(most.riskShare, 0)} of the list's ups and downs, from ${pc(most.weight, 0)} of the list.` });
  const ind = rk.etfs.filter((e) => e.type?.key === "indian" && e.explained != null);
  if (ind.length) out.push({ kind: "insight", title: "The share ETFs move with the market", text: `The Nifty 500 explains ${Math.min(...ind.map((e) => e.explained as number))}% to ${Math.max(...ind.map((e) => e.explained as number))}% of the weekly moves of the ${num(ind.length)} Indian share ${ind.length === 1 ? "ETF" : "ETFs"}.` });
  return out;
}

// ------------------------------------------------------------------------------------------------ 1 At a glance
export function GlanceSection({ rk }: { rk: EtfRisk }) {
  const lede = riskLede(rk), to = rk.own?.to ?? rk.bench.to;
  return (
    <Section id="etp-glance" hide title="Risk at a glance" help="Four figures, each against the Nifty 500: the swing and the worst fall over 3 years of daily prices, the 10 worst weeks of the past year, and how much the list moves with the Nifty 500." how="Each figure sits beside the Nifty 500's; the line under it says whether the list has been calmer or bumpier."
      sub={`${rk.basis === "value" ? "ETFs weighted by the value of your quantities" : "Each ETF counts the same until quantities are added"} · swing and worst fall: 3 years of daily prices; beta and weekly figures: the past year, to ${day(to)}.`}>
      {lede && <p className="eqr-lede"><b>{lede.lead}</b> {lede.rest}</p>}
      {rk.list.level && <p className="sp-note etp-level"><b>{rk.list.level.word}</b> than {rk.list.level.vs}{rk.list.level.because ? `, ${rk.list.level.because}` : ""}.</p>}
      {swingCheck(rk).over && <p className="sp-note" role="status">Data to check: the list's swing ({pc(rk.list.swing)}) is above the {pc(swingCheck(rk).cap)} average of its ETFs' swings, which a mix of them cannot be.</p>}
      {rk.list.why && <p className="sp-note">{rk.list.why}</p>}
      <div className="eqr-tiles">{glanceTiles(rk).map((t) => <div key={t.k} className="eqr-tile"><p className="sp-cap">{t.k}<Tip text={t.help} how={t.how} label={`About “${t.k}”`} /></p><p className="eqr-v"><b>{t.v}</b><small>{t.vs}</small></p><p className="eqr-sub">{t.sub}</p></div>)}</div>
      <Insights items={glanceCards(rk)} scope="etf.glance" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2 Beta build + Reading a beta + three figures
/** The five steps. Step 5 says how the list is weighted, from the server's basis (file 34, W22 and Build these too 6). Exported for tests. */
export function buildSteps(rk: EtfRisk): [string, string][] {
  const groups = byType(rk);
  return [["Sort by type", groups.map((g) => g.word.toLowerCase()).join(", ").replace(/^./, (c) => c.toUpperCase())], ["One benchmark", "The Nifty 500 for every ETF"], ["Beta for each ETF", "Weekly prices, one year"],
    ["Average by type", "One beta for each type"], ["Weight by the list", rk.basis === "value" ? "By what you hold now" : "By count now; by money once quantities are in"]];
}
type Range = { key: RangeKey; lo: number; hi: number; who: R[] };
const rangeText = (x: { key: RangeKey; lo: number; hi: number }) => (x.key === "less" ? `below ${x.hi.toFixed(2)}` : x.key === "very_high" ? `above ${x.lo.toFixed(2)}` : `${x.lo.toFixed(2)} – ${x.hi.toFixed(2)}`);
export const RANGE_SHOW = 3;

/** File 34, Update row 4 (R5): six boxes of one size whatever their counts: chip, range, count, room for 3 ETFs (names left-aligned, two lines at most, then
 *  "…"), and one line kept for "+N more", which opens every ETF of that range in a pop-up (tapping a name places it on the scale and closes the pop-up). An
 *  empty range says "None of your ETFs". The second description line is gone. The MF page's boxes (MfRangeBoxes) are keyed by fund code; this one by symbol,
 *  with the ETF's type badge, on the same Popup and CSS. */
export function EtfRangeBoxes({ ranges, total, pin, onPin }: { ranges: Range[]; total: number; pin: string | null; onPin: (sym: string) => void }) {
  const [pop, setPop] = useState<string | null>(null);
  const item = (e: R, close = false) => <li key={e.symbol}><span className={"etp-badge etp-b-" + e.type?.key} title={e.type?.word}>{e.type?.badge}</span>
    <button type="button" className="eqr-nm mfr-nm" aria-pressed={pin === e.symbol} title={e.symbol} onClick={() => { onPin(e.symbol); if (close) setPop(null); }}><span>{e.symbol}</span></button><b>{b2(e.betaPast)}</b></li>;
  return <div className="eqr-ranges mfr-ranges">{ranges.map((x) => {
    const word = BETA_RANGE_WORD[x.key], pct = total ? Math.round((x.who.length / total) * 100) : 0, head = `${word} · ${countOf(x.who.length, "ETF")} · ${pct}%`;
    return <div key={x.key} className={"eqr-range r-" + x.key}><Chip band={{ key: x.key, word }} />
      <p className="eqr-mute">{rangeText(x)}</p>
      <p className="eqr-n"><b>{x.who.length}</b> {x.who.length === 1 ? "ETF" : "ETFs"} · {pct}%</p>
      <ul id={"etp-rg-" + x.key}>{x.who.length ? x.who.slice(0, RANGE_SHOW).map((e) => item(e)) : <li className="mfr-none">None of your ETFs</li>}</ul>
      <div className="mfr-foot">{x.who.length > RANGE_SHOW && <span className="mfr-mw"><button type="button" className="mfr-more" aria-haspopup="dialog" aria-expanded={pop === x.key} onClick={() => setPop(pop === x.key ? null : x.key)}>+{x.who.length - RANGE_SHOW} more</button>
        {pop === x.key && <Popup title={head} onClose={() => setPop(null)}><ul className="eqb-popl">{x.who.map((e) => item(e, true))}</ul></Popup>}</span>}</div>
    </div>; })}</div>;
}

export function BuildSection({ rk, d }: P) {
  const groups = byType(rk), o = rk.own?.list, [pin, setPin] = useState<string | null>(null);
  const compared = rk.etfs.filter((e) => e.betaPast != null && e.compared !== false), picked = pin ? rk.etfs.find((e) => e.symbol === pin) : null;
  const ind = rk.etfs.filter((e) => e.type?.key === "indian"), little = rk.etfs.filter((e) => e.differentAsset), liq = liquidOf(rk);
  const tracks = (sym: string) => live(d).find((e) => e.symbol === sym)?.tracks.label;
  // file 34, Update row 3: each figure is a label on the scale itself: "0.58 Your list" (filled), "0.99 Indian share ETFs" (outlined), a tapped ETF (dashed)
  const pins: Pin[] = [...(o?.betaOwn != null ? [{ k: "Your list", short: "Your list", b: o.betaOwn, band: o.betaOwnBand ?? null, list: true }] : []),
    ...(o?.betaIndian != null && ind.length ? [{ k: "Indian share ETFs", short: "Indian share ETFs", b: o.betaIndian, band: o.betaIndianBand ?? null }] : []),
    ...(picked?.betaPast != null ? [{ k: picked.symbol, short: picked.symbol, b: picked.betaPast, band: picked.band ?? null, pick: true }] : [])];
  const ranges: Range[] = RANGE_EDGES.map(([k, lo, hi]) => ({ key: k, lo, hi, who: compared.filter((e) => e.band?.key === k).sort((a, b) => (b.betaPast as number) - (a.betaPast as number)) }));
  const fig = [{ k: "beta of your list against the Nifty 500", v: b2(o?.betaOwn) }, { k: "its usual move when the Nifty 500 moves 10%", v: o?.betaOwn != null ? `about ${(o.betaOwn * 10).toFixed(1)}%` : "–" },
    { k: `average of the ${num(ind.length)} Indian share ${ind.length === 1 ? "ETF" : "ETFs"}`, v: b2(o?.betaIndian) },
    { k: `ETFs the Nifty 500 explains little of${little.length ? `: ${andList(little.map((e) => e.type?.word.toLowerCase() ?? e.symbol))}` : ""}`, v: `${little.length} of ${compared.length}` }];
  const cards: Card[] = [];
  const calmBig = rk.etfs.filter((e) => e.differentAsset && e.swing != null && e.betaPast != null && e.betaPast < 0.3 && e.swing > 10)[0];
  if (calmBig) cards.push({ kind: "watch", title: "A low beta is not a calm ride", text: `${calmBig.symbol} has a beta of ${b2(calmBig.betaPast)} but has swung ${calmBig.swing!.toFixed(1)}% a year over 3 years: it moves on its own market, not the Nifty 500's.` });
  const ab = rk.etfs.find((e) => e.type?.key === "abroad" && e.betaPast != null);
  if (ab) cards.push({ kind: "insight", title: "Shares abroad follow their own market", text: `${ab.symbol} reads ${b2(ab.betaPast)} against the Nifty 500, and the Nifty 500 explains ${ab.explained ?? "–"}% of its weekly moves.` });
  if (rk.basis !== "value") cards.push({ kind: "insight", title: "Weights follow your money later", text: "Each ETF counts the same until quantities are added; then each type's part follows the money in it." });
  return (
    <Section id="etp-build" hide title="How your list's beta is built" help={`Each ETF against the Nifty 500 over the past year of weekly prices; the types are then combined by their share of the list${liq.length ? ", liquid ETFs as 0" : ""}.`} how="Each type card adds its part; the parts add up to the list's figure in the sum card."
      sub="An index ETF copies its own index, so its beta against that index is about 1 by design. What tells you something is how each ETF moves with the wider Indian market, the Nifty 500.">
      <ol className="eqr-steps">{buildSteps(rk).map(([t, x], i) => <li key={t}><span>{i + 1}</span><b>{t}</b><small>{x}</small></li>)}</ol>
      <div className="eqr-cards">{groups.map((g) => (
        <div key={g.key} className="eqr-card"><p className="sp-cap">{g.word} · {g.n}</p><p className="eqr-mute">{g.key === "indian" ? [...new Set(g.etfs.map((e) => tracks(e.symbol)).filter(Boolean))].join(", ") : TYPE_LINE[g.key] ?? ""}</p>
          <div className="eqr-strip" role="img" aria-label={`${g.word}: ${g.etfs.map((e) => `${e.symbol} ${b2(e.betaPast)}`).join(", ")}`}>{g.etfs.filter((e) => e.betaPast != null).map((e) => <i key={e.symbol} style={{ left: at(e.betaPast as number) }} title={`${e.symbol} ${b2(e.betaPast)}`} />)}{g.avg != null && <b style={{ left: at(g.avg) }} />}<span style={{ left: at(1) }} /></div>
          <p className="eqr-axis"><span>0</span><span style={{ left: at(1) }}>1.0</span><span>2.5</span></p>
          {/* file 34, Update row 5: "Average beta 0.75" reads "Moves, on average 0.75×"; "Adds to the list's beta" reads "Adds to the list's figure" */}
          <dl><div><dt>Moves, on average</dt><dd>{g.key === "liquid" ? "counts as 0" : g.avg == null ? "–" : `${b2(g.avg)}×`}</dd></div><div><dt>Share of the list</dt><dd>× {Math.round(g.share)}%</dd></div><div><dt>Adds to the list's figure</dt><dd><b>{b2(g.adds)}</b></dd></div></dl></div>))}
        <div className="eqr-card eqr-sum"><p className="sp-cap">Your list</p><p className="eqr-mute">against the Nifty 500</p><p className="eqr-big">{b2(o?.betaOwn)}</p><Chip band={o?.betaOwnBand} /><p className="eqr-mute">{sumLine(groups.map((g) => g.adds))} = {b2(o?.betaOwn)}</p></div>
      </div>
      <div className="eqr-stack" role="img" aria-label={`The list's figure by type: ${groups.map((g) => `${g.word} ${b2(g.adds)}`).join(", ")}`}>{groups.filter((g) => (g.adds ?? 0) > 0).map((g, i) => <i key={g.key} style={{ flexGrow: Math.max(0.01, g.adds ?? 0), background: BAR[i % BAR.length] }}>{g.word} {b2(g.adds)}</i>)}</div>

      <div className="eqr-read mfr" id="etp-read">
        <div className="eqr-read-h"><div><h3 className="eqr-h3">Reading a beta<Tip label="About “Reading a beta”" text="Where your list, its Indian share ETFs and a tapped ETF sit on the six ranges of beta." how="A beta of 1 moves with the Nifty 500. 1.5 has moved about 15% when it moved 10%; 0.5 about 5%." /></h3><p className="sp-note">A beta of 1 moves with the Nifty 500. 1.5 has moved about 15% when it moved 10%; 0.5 about 5%.</p></div></div>
        <div className="eqr-f4">{fig.map((x) => <div key={x.k}><b>{x.v}</b><small>{x.k}</small></div>)}</div>
        <BetaScale pins={pins} fmt={(b) => b2(b)} />
        <p className="sp-cap">How your {compared.length} ETFs spread across the ranges</p>
        <div className="eqr-spread">{ranges.filter((x) => x.who.length).map((x) => <span key={x.key} className={"r-" + x.key} style={{ flexGrow: x.who.length }}><b>{x.who.length}</b><small>{BETA_RANGE_WORD[x.key]}</small></span>)}</div>
        <p className="eqr-hint">{picked ? <>{picked.symbol}: {b2(picked.betaPast)} against the Nifty 500, {bandWord(picked.band).toLowerCase()}; {picked.explained}% of its moves explained by it.{picked.differentAsset ? " A different asset: the beta says little." : ""} <button type="button" className="eqd-link" onClick={() => setPin(null)}>Clear</button></> : `Tap an ETF below to place it on the scale. ${[...new Set(compared.map((e) => `${e.type?.badge}: ${e.type?.word.toLowerCase()}`))].join(" · ")}.${liq.length ? ` The liquid ${liq.length === 1 ? "ETF is" : "ETFs are"} left out.` : ""}`}</p>
        <EtfRangeBoxes ranges={ranges} total={compared.length} pin={pin} onPin={setPin} />
        {/* file 34, fault 2 and Build these too 7: "Without the liquid ETF" and "Liquid counts as 0" only when the list holds a liquid ETF */}
        <div className={"eqr-b3" + (liq.length ? "" : " etp-b2")}>
          <div className="eqr-tile"><p className="sp-cap">Your list<Tip label="About “Your list”" text={`Each ETF against the Nifty 500; the ETFs combined by their share of the list${liq.length ? ", liquid ETFs as 0" : ""}.`} how="The headline reading: 1 moves with the Indian market, above 1 more, below 1 less." /></p><p className="eqr-v"><b>{b2(o?.betaOwn)}</b><Chip band={o?.betaOwnBand} /></p><p className="eqr-sub">{liq.length ? "Liquid counts as 0: it follows no share index. " : ""}The headline reading.</p></div>
          {liq.length > 0 && <div className="eqr-tile"><p className="sp-cap">Without the liquid ETF<Tip label="About “Without the liquid ETF”" text="The same figure for the ETFs that move with markets, weighted among themselves." how="The gap to the headline figure is how much the liquid ETF calms the list." /></p><p className="eqr-v"><b>{b2(o?.betaExLiquid)}</b><Chip band={o?.betaExLiquidBand} /></p><p className="eqr-sub">The {num(rk.etfs.length - liq.length)} ETFs that move with markets.</p></div>}
          <div className="eqr-tile"><p className="sp-cap">Indian share ETFs only<Tip label="About “Indian share ETFs only”" text="The Indian share ETFs only, against the Nifty 500, weighted among themselves." how="How the part of the list that holds Indian shares moves with the market." /></p><p className="eqr-v"><b>{b2(o?.betaIndian)}</b><Chip band={o?.betaIndianBand} /></p><p className="eqr-sub">The {num(ind.length)} {ind.length === 1 ? "ETF that holds" : "ETFs that hold"} Indian shares.</p></div>
        </div>
        <Insights items={cards} scope="etf.beta" />
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 3 Each ETF against the Nifty 500
/** File 34 (O1 to O5): the Overall reading; an ETF with no down-week and up-week figures (gold, silver: they follow their own market) "Moves on its own market". */
export function overallEtf(e: R): { word: string; tone: "g" | "r" | "n" | "x" } | null {
  if (e.compared === false) return null;
  return overallOf(e.downPer100, e.upPer100) ?? (e.betaPast != null ? { word: "Moves on its own market", tone: "x" } : null);
}
const N500_COLS: Record<string, SortCol<R>> = {
  etf: { kind: "text", get: (e) => e.symbol }, yr: { kind: "num", get: (e) => e.oneYear }, expl: { kind: "num", get: (e) => (e.compared === false ? null : e.explained) },
  dn: { kind: "num", get: (e) => e.downPer100 }, up: { kind: "num", get: (e) => e.upPer100 }, all: { kind: { rank: OVERALL_RANK }, get: (e) => overallEtf(e)?.word },
};
export function N500Section({ rk, d }: P) {
  const tracks = (sym: string) => live(d).find((e) => e.symbol === sym)?.tracks.label;
  const sort = useSort(rk.etfs, N500_COLS), [open, setOpen] = useState(false), c = capRows(sort.sorted, RISK_CAP, open);
  return (
    <Section id="etp-n500" hide title="Each ETF against the Nifty 500" help="The beta figures only, past year of weekly prices: each ETF's 1-year change beside the Nifty 500's, how much of its moves the Nifty 500 explains, and how much it moved for every 100 the Nifty 500 moved in down weeks and in up weeks." how="Below 100 in down weeks: it fell less than the Nifty 500. Where the Nifty 500 explains under a fifth, the ETF is a different asset and the down and up weeks are left out."
      sub={`The beta figures, past year, weekly prices. Swing and worst fall over 3 years are in "Each ETF's risk".`}>
      <Scroll label="each ETF against the Nifty 500"><table className="sp-tb eqr-sb kit-grid mfr-sb" id="etp-n500-t"><thead><tr><SortHead id="etf" label="ETF" sort={sort} /><SortHead id="yr" label="1 year" num sort={sort} />
        <SortHead id="expl" label="Explained by the Nifty 500" sort={sort} /><SortHead id="dn" label="In down weeks" num sort={sort} /><SortHead id="up" label="In up weeks" num sort={sort} />
        <SortHead id="all" label="Overall" sort={sort} extra={<Tip label="About “Overall”" text="The down-week and up-week figures read together, per 100 of the Nifty 500's move: rises more and falls less, rises less and falls more, or moves more or less both ways." how="Green: under 100 in down weeks and 100 or more in up weeks. Red: the other way round. An ETF that follows another asset (gold, silver) moves on its own market." />} /></tr></thead>
        <tbody>{c.shown.map((e) => { const ov = overallEtf(e); return <tr key={e.symbol}><th scope="row">{e.symbol}<small className="mfp-sub">{tracks(e.symbol)}</small></th>
          {/* file 34, R4a: "ETF +6.5%" and "Nifty 500 +1.3%" on one line each */}
          <td className="r"><span className="mfr-yi"><span className="px-ix">ETF </span><b>{sp(e.oneYear)}</b></span>{e.compared !== false && <span className="mfr-yi mfr-yx"><span className="px-ix">Nifty 500 </span>{sp(e.benchOneYear)}</span>}</td>
          <td>{e.compared === false ? <span className="sp-note">Not compared: follows no share index</span> : e.explained == null ? <span className="sp-note">Under a year</span> : <span className="mfr-ex"><i><u style={{ width: `${e.explained}%` }} /></i>{e.explained}%{e.differentAsset && <span className="mff-tag etp-diff">Different asset</span>}</span>}</td>
          <td className="r">{e.downPer100 == null ? "–" : <><b>{e.downPer100}</b><small className="mfp-sub">per 100</small></>}</td><td className="r">{e.upPer100 == null ? "–" : <><b>{e.upPer100}</b><small className="mfp-sub">per 100</small></>}</td>
          <td>{ov ? <span className={"mfr-ov " + ov.tone}>{ov.word}</span> : <span className="sp-note">{e.compared === false ? "Not compared" : "Under a year"}</span>}</td></tr>; })}</tbody></table></Scroll>
      {c.capped && <ShowAll n={rk.etfs.length} noun="ETF" open={open} onToggle={() => setOpen(!open)} controls="etp-n500-t" />}
      <p className="sp-note">"In down weeks": how much the ETF fell for every 100 the Nifty 500 fell. Left blank where the Nifty 500 explains under a fifth of the moves.</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 4 Share of the list vs share of the risk
export function shaded(list: number, risk: number) { return risk - list >= 1.5 && risk >= list * 1.25; }
type RsRow = { k: string; list: number; risk: number };
const RS_COLS: Record<string, SortCol<RsRow>> = { name: { kind: "text", get: (r) => r.k }, list: { kind: "num", get: (r) => r.list }, risk: { kind: "num", get: (r) => r.risk } };
export function RiskShareSection({ rk }: { rk: EtfRisk }) {
  const [by, setBy] = useState<"etf" | "type">("etf"), [open, setOpen] = useState(false);
  const rows = useMemo<RsRow[]>(() => by === "etf" ? rk.etfs.map((e) => ({ k: e.symbol, list: e.weight, risk: e.riskShare ?? 0 }))
    : byType(rk).map((g) => ({ k: g.word, list: g.share, risk: g.etfs.reduce((a, e) => a + (e.riskShare ?? 0), 0) })), [by, rk]);
  const sort = useSort(rows, RS_COLS, { initial: { id: "risk", dir: -1 } }), c = capRows(sort.sorted, RISK_CAP, open);
  const max = Math.max(1, ...rows.flatMap((r) => [r.list, r.risk]));
  const byRisk = [...rows].sort((a, b) => b.risk - a.risk);
  const over = byRisk.filter((r) => shaded(r.list, r.risk)), calm = byRisk.filter((r) => r.list > 0 && r.risk < r.list * 0.8 && r.risk > 0.5);
  const cards: Card[] = [];
  if (over.length) cards.push({ kind: "watch", title: `${andList(over.map((r) => r.k))} ${over.length === 1 ? "carries" : "carry"} more than ${over.length === 1 ? "its" : "their"} share`, text: over.map((r) => `${r.k}: ${Math.round(r.list)}% of the list, ${r.risk.toFixed(1)}% of the swings`).join("; ") + "." });
  if (calm.length) cards.push({ kind: "good", title: `${andList(calm.map((r) => r.k))} ${calm.length === 1 ? "carries" : "carry"} less than ${calm.length === 1 ? "its" : "their"} share`, text: calm.map((r) => `${r.k}: ${Math.round(r.list)}% of the list, ${r.risk.toFixed(1)}% of the swings`).join("; ") + "." });
  return (
    <Section id="etp-share" hide title="Share of the list vs share of the risk" help="Each ETF's share of the list beside its share of the list's weekly ups and downs over the past year. The risk shares add to 100%." how="Grey: share of the list. Colour: share of the risk. A shaded row carries clearly more of the risk than of the list."
      sub="Grey: share of the list. Colour: share of the list's ups and downs. Shaded rows carry more of the swings than their size.">
      <div className="eqd-tools"><div className="eqd-seg" role="group" aria-label="Split by">{(["etf", "type"] as const).map((k) => <button key={k} type="button" aria-pressed={by === k} onClick={() => { setBy(k); setOpen(false); }}>{k === "etf" ? "By ETF" : "By type"}</button>)}</div></div>
      <Scroll label="share of the list and of the risk"><table className="sp-tb eqr-rs kit-grid" id="etp-rs-t"><thead><tr><SortHead id="name" label={by === "etf" ? "ETF" : "Type"} sort={sort} /><th scope="col">Bars</th><SortHead id="list" label="List" num sort={sort} /><SortHead id="risk" label="Risk" num sort={sort} /></tr></thead>
        <tbody>{c.shown.map((r) => <tr key={r.k} className={shaded(r.list, r.risk) ? "more" : undefined}><th scope="row">{r.k}</th>
          <td className="eqr-bars"><span className="l" style={{ width: `${(r.list / max) * 100}%` }} /><span className="k" style={{ width: `${(Math.max(0, r.risk) / max) * 100}%` }} /></td><td className="r">{Math.round(r.list)}%</td><td className="r"><b>{pc(r.risk)}</b></td></tr>)}</tbody></table></Scroll>
      {c.capped && <ShowAll n={rows.length} noun={by === "etf" ? "ETF" : "type"} open={open} onToggle={() => setOpen(!open)} controls="etp-rs-t" />}
      <Insights items={cards} scope="etf.share" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 5 If the market fell 10%
export function FallSection({ rk, value }: { rk: EtfRisk; value?: { now: number; name?: string } | null }) {
  const o = rk.own?.list, out = new Set(o?.leftOutOfFall ?? []);
  const groups = byType(rk).filter((g) => (g.adds ?? 0) > 0), top = groups[0];
  const items: Card[] = o?.betaOwn != null && top ? [{ kind: "insight", title: "What moves the beta", text: `${top.word} adds the most to the list's figure (${b2(top.adds)} of ${b2(o.betaOwn)}). ${byType(rk).filter((g) => g.key !== top.key).map((g) => `${g.word} ${b2(g.adds)}`).join(", ")}.` }] : [];
  const ind = rk.etfs.filter((e) => e.type?.key === "indian").length, metal = rk.etfs.some((e) => e.type?.key === "gold" || e.type?.key === "silver");
  // task #235 (pack C4, C5): the same picture as the Equity page, against the Nifty 500, with the size of the fall and the rupee line on the account's value now.
  // Task #390 (file 34, R2c, R7, B4): "Your ETFs' beta against the Nifty 500 0.58" reads "Your ETFs move 0.58× as much as the Nifty 500"; "pts" reads "points";
  // above 12 ETFs the 10 deepest falls show (the market and Your ETFs stay first)
  return <MarketFall id="etp-fall" what="Nifty 500" idx="Nifty 500" value={value ?? null} unit="points" cap={{ ...RISK_CAP, noun: "ETF" }}
    worst={rk.bench.worstFall != null && rk.bench.worstFall < 0 ? { pct: -rk.bench.worstFall, line: "the Nifty 500’s worst in 3 years" } : null}
    scenarios={[{ label: "The whole list", beta: o?.betaOwn ?? null, src: o?.betaOwn != null ? `Your ETFs move ${movesAsMuch(o.betaOwn, "the Nifty 500")}, past year of weekly prices` : "Not enough prices for a reading yet.", parts: true },
      ...(ind > 0 ? [{ label: "Indian share ETFs only", beta: o?.betaIndian ?? null, src: o?.betaIndian != null ? `The Indian share ETFs move ${movesAsMuch(o.betaIndian, "the Nifty 500")}, on average` : "Not enough prices for a reading yet.", parts: false }] : [])]}
    market={{ label: "Nifty 500", sub: "the index" }} list={{ label: "Your ETFs", sub: rk.basis === "value" ? "by value" : "each counts the same" }}
    parts={rk.etfs.filter((e) => e.betaPast != null && e.compared !== false && !out.has(e.symbol)).map((e) => ({ label: e.symbol, beta: e.betaPast as number, sub: `${Math.round(e.weight)}% of the list` }))}
    extraNote={[metal ? "Gold and silver ETFs do not follow the index closely, so their bars say little." : "", out.size ? `${andList([...out])} ${out.size === 1 ? "is" : "are"} left out: the Nifty 500 explains too little of ${out.size === 1 ? "its" : "their"} moves to size a fall.` : ""].filter(Boolean).join(" ")}
    after={<Insights items={items} scope="etf.fall" />} />;
}

// ------------------------------------------------------------------------------------------------ 6 Each ETF's risk
export function standsOut(e: R, d: EtfPortfolio, ins?: Inside) {
  const row = live(d).find((x) => x.symbol === e.symbol), out: string[] = [];
  if (row?.premium != null && Math.abs(row.premium) >= 1) out.push(`${sp(row.premium)} against its NAV`);
  if (e.differentAsset) out.push("Moves on its own market");
  if (e.riskShare != null && shaded(e.weight, e.riskShare)) out.push("More risk than its share");
  if (row?.twice) out.push("Same index as another ETF");
  if (ins?.files.find((f) => f.symbol === e.symbol)?.why) out.push("Holdings file not loaded");
  if (e.years != null && e.years < 2.95) out.push(`Under 3 years of prices (${e.years} years)`);
  return out.join(" · ") || "–";
}
export function EachEtfSection({ rk, d, ins }: P) {
  const row = (s: string) => live(d).find((x) => x.symbol === s);
  const cols = useMemo<Record<string, SortCol<R>>>(() => ({
    etf: { kind: "text", get: (e) => e.symbol }, beta: { kind: "num", get: (e) => (e.compared === false ? null : e.betaPast) }, swing: { kind: "num", get: (e) => e.swing },
    worst: { kind: "num", get: (e) => e.worstFall }, prem: { kind: "num", get: (e) => row(e.symbol)?.premium }, share: { kind: "num", get: (e) => e.riskShare },
    notes: { kind: "text", get: (e) => { const s = standsOut(e, d, ins); return s === "–" ? null : s; } },
  }), [d, ins]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sort = useSort(rk.etfs, cols, { initial: { id: "beta", dir: -1 } }), [open, setOpen] = useState(false), c = capRows(sort.sorted, RISK_CAP, open);
  return (
    <Section id="etp-each" hide title="Each ETF's risk" help="How much each ETF has moved with the Nifty 500 (past year, weekly), its swing and worst fall (3 years, daily), its price against its NAV and its share of the list's risk." how="Highest figure first. Under a year of prices: no figure. Under 3 years: since the start of its prices."
      sub={`Highest first by how much each moves with the Nifty 500. Swing and worst fall over 3 years. ${benchText(rk.bench)}.`}>
      <Scroll label="each ETF's risk"><table className="sp-tb eqr-each kit-grid mfr-each" id="etp-each-t"><thead><tr><SortHead id="etf" label="ETF" sort={sort} /><SortHead id="beta" label="Moves with the Nifty 500" sort={sort} />
        <SortHead id="swing" label="Swing a year, 3 yrs" num sort={sort} /><SortHead id="worst" label="Worst fall, 3 yrs" num sort={sort} /><SortHead id="prem" label="Price vs NAV" num sort={sort} />
        <SortHead id="share" label="Share of risk" num sort={sort} /><SortHead id="notes" label="What stands out" sort={sort} /></tr></thead>
        <tbody>{c.shown.map((e) => <tr key={e.symbol}><th scope="row">{e.symbol}<small className="mfp-sub">{row(e.symbol)?.tracks.label}</small></th>
          <td>{e.compared === false ? <span className="sp-note">Not compared</span> : e.betaPast == null ? <span className="sp-note">Under a year</span> : <><b>{b2(e.betaPast)}×</b> <Chip band={e.band} /><small className="mfp-sub etp-win">{betaWindowText(e.betaWindow)}</small></>}</td>
          <td className="r">{pc(e.swing)}</td><td className="r sp-red">{sp(e.worstFall)}{e.years != null && e.years < 2.95 && e.from ? <small className="mfp-sub">since {new Date(e.from + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</small> : null}</td>
          <td className="r">{sp(row(e.symbol)?.premium, 2)}</td><td className="r">{pc(e.riskShare)}</td><td>{standsOut(e, d, ins)}</td></tr>)}</tbody></table></Scroll>
      {c.capped && <ShowAll n={rk.etfs.length} noun="ETF" open={open} onToggle={() => setOpen(!open)} controls="etp-each-t" />}
      <p className="sp-note">"What stands out" describes the figures; it is not advice.</p>
    </Section>
  );
}

/** Task #390 PR A (developer file 34, Section bar, Update 25 Nov row 1): one section per step (portfolio/pack/EqSteps385 Step); Key figures sit in step 1
 *  after At a glance; on a phone with All sections on, every step after the first folds to its heading and its own first line. */
export function RiskTab({ rk, d, ins, value, kf }: P & { kf?: ReactNode }) {
  return <>
    <Step id="etp-glance" title="Risk at a glance" line=""><GlanceSection rk={rk} />{kf}</Step>
    <Step id="etp-build" title="How your list's beta is built" line=""><BuildSection rk={rk} d={d} /></Step>
    <Step id="etp-n500" title="Each ETF against the Nifty 500" line=""><N500Section rk={rk} d={d} /></Step>
    <Step id="etp-fall" title="If the Nifty 500 fell 10%" line=""><FallSection rk={rk} value={value} /></Step>
    <Step id="etp-share" title="Share of the list vs share of the risk" line=""><RiskShareSection rk={rk} /></Step>
    <Step id="etp-each" title="Each ETF's risk" line=""><EachEtfSection rk={rk} d={d} ins={ins} /></Step>
  </>;
}
