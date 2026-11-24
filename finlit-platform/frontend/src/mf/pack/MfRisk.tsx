// Task #183 part 2 (MF portfolio, pack 02 §4 "Risk analytics (rebuilt, same blocks as equity)"): 1 At a glance (against the Nifty 500) → 2 How your list's beta is
// built (by fund type, then Reading a beta and the three beta figures) → 3 Each fund against its own benchmark → 4 Share of the list vs share of the risk →
// 5 If the market fell 10% → 6 Each fund's risk. The figures are the server's (/api/me/mf-portfolio/risk: mfportfolio/bench.py for the own-benchmark figures,
// mfportfolio/risk.py for swing and worst fall); the beta ranges are the owner's table (COMMON-RULES 8). The Equity page's eqr- styles are shared. Never advice.
// Task #389 PR C (developer file 32, Risk analytics view and Update 25 Nov rows 3, 4, 5, 7): the six range names in one pass from their keys (Much less
// sensitive … Very high, the server's keys unchanged), "Moves with its markets", the step 5 line from the server's basis, the labels on the scale (the
// Equity page's BetaScale and betaLabels.ts), six range boxes of one size with "+N more", Yours / Index lines and an Overall column, every risk table sorts
// (words by rank) and stops at 10 rows above 12, the 10% fall stops at the 10 deepest above 12 funds, "What stands out" one note a line, real minus signs.
import { useMemo, useState, type ReactNode } from "react";
import { Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import { Insights } from "../../portfolio/pack/EquityPack";
import { MarketFall } from "../../portfolio/pack/MarketFall";
import { BetaScale, Popup, type Pin } from "../../portfolio/pack/RiskPack";
import { OVERALL_RANK, overallOf } from "../../portfolio/pack/risk385";
import { BETA_RANGE_WORD, MINUS, ShowAll, SortHead, betaRangeWord, capRows, countOf, movesAsMuch, useSort, type CapRule, type SortCol } from "../../portfolio/shared";
import { RANGE_EDGES, type RangeKey } from "../../lib/eqRisk";
import type { Card } from "../../lib/pulsePack";
import type { BetaBand, FundRisk, MfRisk } from "../../lib/mfPack";
import "../../portfolio/pack/risk-pack.css";
import "./mf-risk389.css";

/** A beta with two decimals and a real minus ("−0.04"). */
const b2 = (v: number | null | undefined) => (v == null ? "–" : `${v < 0 ? MINUS : ""}${Math.abs(v).toFixed(2)}`);
const sp = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(d)}%`);
const pc = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v < 0 ? MINUS : ""}${Math.abs(v).toFixed(d)}%`);
const MAX = 2.5, at = (b: number) => `${(Math.max(0, Math.min(MAX, b)) / MAX) * 100}%`;
/** A range's name, from its key (file 32, Risk 1: one pass, never a chain of renames; the server still sends "Defensive" for the key "defensive"). */
export const bandWord = (band: BetaBand | undefined) => (band ? betaRangeWord(band.key, band.word) : "");
const Chip = ({ band }: { band: BetaBand | undefined }) => (band ? <span className={"eqr-chip mfr-chip r-" + band.key}><i aria-hidden="true" />{bandWord(band)}</span> : null);
const BAR = ["#1f6b6b", "#b8892f", "#2E7D57", "#8fa8a6", "#B4362B", "#6b5ea8"];
const isLiquid = (f: FundRisk) => f.compared === false;
/** File 32 (Risk 6, Build these too 3): above 12 rows, 10 show, then "Show all N funds". */
export const RISK_CAP: CapRule = { over: 12, keep: 10 };

/** The funds grouped by type for the beta build: count, benchmark, average beta (within the type, weighted by the list), share of the list, what it adds. */
/** Task #275 (number fixes 4 and 5): the window of each index figure, printed beside it. The swing and the worst fall come from 3 years of daily NAVs
 *  (bench.from / bench.to); the beta and the 10 worst weeks from the past year of weekly closes (own.from / own.to). */
export const WIN_3Y = "3 yrs, daily", WIN_1Y = "past year, weekly", BETA_WIN = "vs Nifty 500 · weekly · past year";

export function byType(rk: MfRisk) {
  const m = new Map<string, FundRisk[]>();
  for (const f of rk.funds) { const t = f.type || "Other"; m.set(t, [...(m.get(t) ?? []), f]); }
  return [...m].map(([type, fs]) => {
    const share = fs.reduce((a, f) => a + (f.listShare ?? 0), 0), ok = fs.filter((f) => f.betaOwn != null);
    const avg = ok.length && share ? ok.reduce((a, f) => a + (f.betaOwn as number) * (f.listShare ?? 0), 0) / ok.reduce((a, f) => a + (f.listShare ?? 0), 0) : null;
    const bench = [...new Set(fs.map((f) => (f.compared === false ? "no share index" : `${f.benchmark}${f.standIn ? " (stand-in)" : ""}`)))].join(" · ");
    return { type, n: fs.length, bench, avg: avg == null ? null : Math.round(avg * 100) / 100, share, adds: avg == null ? null : Math.round(((avg * share) / 100) * 100) / 100, funds: fs };
  }).sort((a, b) => (b.adds ?? 0) - (a.adds ?? 0) || b.share - a.share);
}

/** The sum card's line with real minus signs: "0.59 − 0.01 + 0.00" (file 32, Update row 5), never "+ -0.01". */
export function sumLine(adds: (number | null)[]): string {
  return adds.map((a, i) => (a == null ? (i ? ` + –` : "–") : i === 0 ? b2(a) : a < 0 ? ` ${MINUS} ${Math.abs(a).toFixed(2)}` : ` + ${a.toFixed(2)}`)).join("");
}

export function riskLede(rk: MfRisk) {
  const o = rk.own?.list, b = o?.betaOwn;
  if (b == null) return null;
  const lead = b < 0.9 ? "Your list moves less than its markets." : b > 1.1 ? "Your list moves more than its markets." : "Your list moves about with its markets.";
  return { lead, rest: `Each fund against its own benchmark, the list has moved ${b2(b)}% for every 1% move in them${rk.list.swing != null && rk.bench.swing != null ? `, and it swings ${rk.list.swing.toFixed(1)}% in a typical year against ${rk.bench.swing.toFixed(1)}% for the Nifty 500 (${WIN_3Y})` : ""}.` };
}

export function glanceTiles(rk: MfRisk) {
  const l = rk.list, b = rk.bench, o = rk.own?.list;
  const ratio = l.swing != null && b.swing ? l.swing / b.swing : null;
  return [
    { k: "Typical swing in a year · 3 yrs", v: pc(l.swing), vs: `Nifty 500: ${pc(b.swing)} (${WIN_3Y})`, sub: ratio == null ? "Not enough NAVs." : ratio < 0.85 ? "A calmer ride than the index." : ratio > 1.15 ? "A bumpier ride than the index." : "About as bumpy as the index.",
      help: "How much the list's value has moved up and down in a typical year, from daily NAVs over 3 years.", how: "Higher is a bumpier ride. Set it beside the Nifty 500's." },
    { k: "Worst fall from a high · 3 yrs", v: sp(l.worstFall), vs: `Nifty 500: ${sp(b.worstFall)} (${WIN_3Y})`, sub: l.worstFall == null || b.worstFall == null ? "Not enough NAVs." : l.worstFall > b.worstFall / 2 ? "Less than half as deep." : l.worstFall > b.worstFall ? "Shallower than the index." : "Deeper than the index.",
      help: "The largest drop of the list from a high to a later low, over 3 years of daily NAVs.", how: "A larger minus figure is a deeper fall." },
    { k: "In the 10 worst weeks · past year", v: sp(o?.worst10.list), vs: `Nifty 500: ${sp(o?.worst10.nifty500)} (${WIN_1Y})`, sub: o?.worst10.list == null || o.worst10.nifty500 == null ? "Not enough NAVs." : o.worst10.list > o.worst10.nifty500 + 0.3 ? "Falls less when the market falls." : o.worst10.list < o.worst10.nifty500 - 0.3 ? "Falls more when the market falls." : "Falls about as much as the market.",
      help: "The list's average weekly change in the Nifty 500's 10 worst weeks of the past year.", how: "Above the Nifty 500's figure: the list fell less in those weeks." },
    // file 32 (Risk 2, Words): "Beta, own benchmarks" reads "Moves with its markets"
    { k: "Moves with its markets", v: o?.betaOwn == null ? "–" : `${b2(o.betaOwn)}×`, vs: "its markets: 1.00×", sub: o?.betaOwn == null ? "Not enough NAVs." : o.betaOwn < 0.9 ? "Moves less than its markets." : o.betaOwn > 1.1 ? "Moves more than its markets." : "Moves about with its markets.",
      help: "Each fund against its own category's benchmark over the past year of weekly NAVs; the funds combined by their share of the list, liquid funds as 0.", how: "1.00× moves with its own benchmarks; above 1 more, below 1 less." },
  ];
}

export function glanceCards(rk: MfRisk): Card[] {
  const o = rk.own?.list, out: Card[] = [];
  if (rk.list.swing != null && rk.bench.swing != null) out.push(rk.list.swing < rk.bench.swing ? { kind: "good", title: "Calmer than the market", text: `The list swings ${rk.list.swing.toFixed(1)}% a year against ${rk.bench.swing.toFixed(1)}% for the Nifty 500 (${WIN_3Y}).` }
    : { kind: "watch", title: "Bumpier than the market", text: `The list swings ${rk.list.swing.toFixed(1)}% a year against ${rk.bench.swing.toFixed(1)}% for the Nifty 500 (${WIN_3Y}).` });
  const most = [...rk.funds].filter((f) => f.riskShare != null).sort((a, b) => (b.riskShare as number) - (a.riskShare as number))[0];
  if (most) out.push({ kind: "watch", title: `${most.short} carries the most risk`, text: `${pc(most.riskShare, 0)} of the list's ups and downs, from ${pc(most.listShare, 0)} of the list.` });
  if (o?.liquidShare && o.betaOwn != null && o.betaExLiquid != null) out.push({ kind: "insight", title: "The liquid fund does a lot of the calming", text: `Without it the list's beta is ${b2(o.betaExLiquid)}, not ${b2(o.betaOwn)}: it is ${pc(o.liquidShare, 0)} of the list and barely moves.` });
  return out;
}

// ------------------------------------------------------------------------------------------------ 1 At a glance
export function GlanceSection({ rk }: { rk: MfRisk }) {
  const lede = riskLede(rk), to = rk.own?.to ?? rk.bench.to;
  return (
    <Section id="mfp-glance" hide title="Risk at a glance" help="Four figures, each against the Nifty 500: the swing and the worst fall over 3 years of daily NAVs, the 10 worst weeks of the past year, and how much the list moves with its markets, each fund against its own benchmark." how="Each figure sits beside the Nifty 500's; the line under it says whether the list has been calmer or bumpier."
      sub={`${rk.basis === "value" ? "Funds weighted by the value of your units" : "Each fund counts the same until units are added"} · swing and worst fall from daily NAVs over 3 years; beta and weekly figures from the past year, to ${new Date(to + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`}>
      {lede && <p className="eqr-lede"><b>{lede.lead}</b> {lede.rest}</p>}
      {rk.list.why && <p className="sp-note">{rk.list.why}</p>}
      <div className="eqr-tiles">{glanceTiles(rk).map((t) => <div key={t.k} className="eqr-tile"><p className="sp-cap">{t.k}<Tip text={t.help} how={t.how} label={`About “${t.k}”`} /></p><p className="eqr-v"><b>{t.v}</b><small>{t.vs}</small></p><p className="eqr-sub">{t.sub}</p></div>)}</div>
      <Insights items={glanceCards(rk)} scope="mf.glance" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2 Beta build + Reading a beta + three figures
/** The five steps. Step 5 says how the list is weighted from the server's `basis` (file 32, Risk 3 and fault 5: it read "By count now; by money once units
 *  are in" with units in every fund). */
export function buildSteps(basis: MfRisk["basis"]): [string, string][] {
  return [["Sort by fund type", "Small cap, hybrid, thematic, liquid"], ["Match a benchmark", "Its category's index; an index fund, the index it tracks"], ["Beta for each fund", "Against its own benchmark, weekly, one year"],
    ["Average by type", "One beta for each type"], ["Weight by the list", basis === "value" ? "By what you hold now" : "Each fund the same until units are in for every fund"]];
}
type Range = { key: RangeKey; lo: number; hi: number; who: FundRisk[] };
const rangeText = (x: { key: RangeKey; lo: number; hi: number }) => (x.key === "less" ? `below ${x.hi.toFixed(2)}` : x.key === "very_high" ? `above ${x.lo.toFixed(2)}` : `${x.lo.toFixed(2)} – ${x.hi.toFixed(2)}`);
export const RANGE_SHOW = 3;

/** File 32, Update row 4: six boxes of one size whatever their counts: chip, range, count, room for 3 funds (names on two lines at most, then "…"), and one
 *  line kept for "+N more", which opens every fund of that range in a pop-up (tapping a name places it on the scale and closes the pop-up). An empty range
 *  says "None of your funds". The second description line is gone. */
export function MfRangeBoxes({ ranges, total, pin, onPin }: { ranges: Range[]; total: number; pin: number | null; onPin: (code: number) => void }) {
  const [pop, setPop] = useState<string | null>(null);
  const item = (f: FundRisk, close = false) => <li key={f.code}><button type="button" className="eqr-nm mfr-nm" aria-pressed={pin === f.code} title={f.short} onClick={() => { onPin(f.code); if (close) setPop(null); }}>
    <span>{f.short}</span></button><b>{b2(f.betaOwn)}</b></li>;
  return <div className="eqr-ranges mfr-ranges">{ranges.map((x) => {
    const word = BETA_RANGE_WORD[x.key], pct = total ? Math.round((x.who.length / total) * 100) : 0, head = `${word} · ${countOf(x.who.length, "fund")} · ${pct}%`;
    return <div key={x.key} className={"eqr-range r-" + x.key}><Chip band={{ key: x.key, word }} />
      <p className="eqr-mute">{rangeText(x)}</p>
      <p className="eqr-n"><b>{x.who.length}</b> {x.who.length === 1 ? "fund" : "funds"} · {pct}%</p>
      <ul id={"mfr-rg-" + x.key}>{x.who.length ? x.who.slice(0, RANGE_SHOW).map((f) => item(f)) : <li className="mfr-none">None of your funds</li>}</ul>
      <div className="mfr-foot">{x.who.length > RANGE_SHOW && <span className="mfr-mw"><button type="button" className="mfr-more" aria-haspopup="dialog" aria-expanded={pop === x.key} onClick={() => setPop(pop === x.key ? null : x.key)}>+{x.who.length - RANGE_SHOW} more</button>
        {pop === x.key && <Popup title={head} onClose={() => setPop(null)}><ul className="eqb-popl">{x.who.map((f) => item(f, true))}</ul></Popup>}</span>}</div>
    </div>; })}</div>;
}

export function BuildSection({ rk }: { rk: MfRisk }) {
  const groups = byType(rk), o = rk.own?.list, [pin, setPin] = useState<number | null>(null);
  const compared = rk.funds.filter((f) => f.betaOwn != null && !isLiquid(f)), picked = pin != null ? rk.funds.find((f) => f.code === pin) : null;
  // file 32, Update row 3: each figure is a label on the scale itself: "0.84 Your list" (filled), "0.91 Without liquid" (outlined), a tapped fund (dashed)
  const pins: Pin[] = [...(o?.betaOwn != null ? [{ k: "Your list", short: "Your list", b: o.betaOwn, band: o.betaOwnBand, list: true }] : []),
    ...(o?.betaExLiquid != null && o.liquidShare ? [{ k: "Without liquid", short: "Without liquid", b: o.betaExLiquid, band: o.betaExLiquidBand }] : []),
    ...(picked?.betaOwn != null ? [{ k: picked.short, short: picked.short, b: picked.betaOwn, band: picked.band ?? null, pick: true }] : [])];
  const ranges: Range[] = RANGE_EDGES.map(([k, lo, hi]) => ({ key: k, lo, hi, who: compared.filter((f) => f.band?.key === k).sort((a, b) => (b.betaOwn as number) - (a.betaOwn as number)) }));
  const fig = [{ k: "beta of your list, each fund against its own benchmark", v: b2(o?.betaOwn) }, { k: "its usual move when its benchmarks move 10%", v: o?.betaOwn != null ? `about ${(o.betaOwn * 10).toFixed(1)}%` : "–" },
    { k: "funds that move more than their market", v: `${compared.filter((f) => (f.betaOwn as number) > 1.1).length} of ${compared.length}` }, { k: "funds that move less than their market", v: `${compared.filter((f) => (f.betaOwn as number) < 0.9).length} of ${compared.length}` }];
  const cards: Card[] = [];
  // task #275 (number fix 4): one Nifty 500 beta on the page, weekly over the past year like the headline (it compared with the 3-year daily figure)
  const mismatch = rk.funds.filter((f) => f.beta500 != null && f.betaOwn != null && f.compared && Math.abs((f.beta500 as number) - (f.betaOwn as number)) >= 0.2);
  if (mismatch.length) cards.push({ kind: "insight", title: "A different answer from the Nifty 500 alone", text: `${mismatch.map((f) => `${f.short} reads ${b2(f.betaOwn)} against its own benchmark and ${b2(f.beta500)} against the Nifty 500 (${WIN_1Y})`).join("; ")}.` });
  const blend = rk.funds.find((f) => f.benchKind === "blend" && f.betaOwn != null);
  if (blend) cards.push({ kind: "watch", title: `${blend.short} moves with its own mix`, text: `Against its blend (${blend.benchmark}) it reads ${b2(blend.betaOwn)}: it moves with the mix it holds, not calmer than it.` });
  const stand = rk.funds.filter((f) => f.standIn);
  if (stand.length) cards.push({ kind: "insight", title: `${stand.length === 1 ? "One benchmark is a" : `${stand.length} benchmarks are`} stand-in`, text: `${stand.map((f) => `${f.short}: ${f.benchWhy ?? f.benchmark}`).join(" ")}` });
  return (
    <Section id="mfp-build" hide title="How your list's beta is built" help="Each fund is compared with the benchmark its category is measured against (an index fund with the index it tracks), over the past year of weekly NAVs; the types are then combined by their share of the list." how="Each type card adds its part; the parts add up to the list's figure in the sum card. Liquid funds count as 0."
      sub="Each fund is compared with the benchmark its category is measured against, then the types are combined by their share of the list.">
      <ol className="eqr-steps">{buildSteps(rk.basis).map(([t, x], i) => <li key={t}><span>{i + 1}</span><b>{t}</b><small>{x}</small></li>)}</ol>
      <div className="eqr-cards">{groups.map((g) => (
        <div key={g.type} className="eqr-card"><p className="sp-cap">{g.type} · {g.n}</p><p className="eqr-mute">against {g.bench}</p>
          <div className="eqr-strip" role="img" aria-label={`${g.type}: ${g.funds.map((f) => `${f.short} ${b2(f.betaOwn)}`).join(", ")}`}>{g.funds.filter((f) => f.betaOwn != null).map((f) => <i key={f.code} style={{ left: at(f.betaOwn as number) }} title={`${f.short} ${b2(f.betaOwn)}`} />)}{g.avg != null && <b style={{ left: at(g.avg) }} />}<span style={{ left: at(1) }} /></div>
          <p className="eqr-axis"><span>0</span><span style={{ left: at(1) }}>1.0</span><span>2.5</span></p>
          <dl><div><dt>Moves, on average</dt><dd>{g.avg == null ? "–" : `${b2(g.avg)}×`}</dd></div><div><dt>Share of the list</dt><dd>× {Math.round(g.share)}%</dd></div><div><dt>Adds to the list's figure</dt><dd><b>{b2(g.adds)}</b></dd></div></dl></div>))}
        <div className="eqr-card eqr-sum"><p className="sp-cap">Your list</p><p className="eqr-mute">against its own benchmarks</p><p className="eqr-big">{b2(o?.betaOwn)}</p><Chip band={o?.betaOwnBand} /><p className="eqr-mute">{sumLine(groups.map((g) => g.adds))} = {b2(o?.betaOwn)}</p></div>
      </div>
      <div className="eqr-stack" role="img" aria-label={`The list's figure by fund type: ${groups.map((g) => `${g.type} ${b2(g.adds)}`).join(", ")}`}>{groups.filter((g) => (g.adds ?? 0) > 0).map((g, i) => <i key={g.type} style={{ flexGrow: Math.max(0.01, g.adds ?? 0), background: BAR[i % BAR.length] }}>{g.type} {b2(g.adds)}</i>)}</div>

      <div className="eqr-read mfr" id="mfp-read">
        <div className="eqr-read-h"><div><h3 className="eqr-h3">Reading a beta<Tip label="About “Reading a beta”" text="Where your list, the list without its liquid funds and a tapped fund sit on the six ranges of beta." how="A beta of 1 moves with its benchmark. 1.5 has moved about 15% when its benchmark moved 10%; 0.5 about 5%." /></h3><p className="sp-note">A beta of 1 moves with its benchmark. 1.5 has moved about 15% when its benchmark moved 10%; 0.5 about 5%.</p></div></div>
        <div className="eqr-f4">{fig.map((x) => <div key={x.k}><b>{x.v}</b><small>{x.k}</small></div>)}</div>
        <BetaScale pins={pins} fmt={(b) => b2(b)} />
        <p className="sp-cap">How your {compared.length} funds spread across the ranges</p>
        <div className="eqr-spread">{ranges.filter((x) => x.who.length).map((x) => <span key={x.key} className={"r-" + x.key} style={{ flexGrow: x.who.length }}><b>{x.who.length}</b><small>{BETA_RANGE_WORD[x.key]}</small></span>)}</div>
        <p className="eqr-hint">{picked ? <>{picked.short}: {b2(picked.betaOwn)} against {picked.benchmark}, {bandWord(picked.band).toLowerCase()}; {picked.explained}% of its moves explained by the benchmark. <button type="button" className="eqd-link" onClick={() => setPin(null)}>Clear</button></> : `Tap a fund below to place it on the scale and see its details.${o?.liquidShare ? " The liquid fund is left out: it follows no share index." : ""}`}</p>
        <MfRangeBoxes ranges={ranges} total={compared.length} pin={pin} onPin={setPin} />
        <div className="eqr-b3">
          <div className="eqr-tile"><p className="sp-cap">Against own benchmarks<Tip label="About “Against own benchmarks”" text="Each fund against its own category's benchmark; the funds combined by their share of the list, liquid funds as 0." how="The headline reading: 1 moves with its own benchmarks, above 1 more, below 1 less." /></p><p className="eqr-v"><b>{b2(o?.betaOwn)}</b><Chip band={o?.betaOwnBand} /></p><p className="eqr-sub">Each fund against its category's index. The headline reading.</p></div>
          <div className="eqr-tile"><p className="sp-cap">Without the liquid fund<Tip label="About “Without the liquid fund”" text="The same figure for the funds that follow a share index only, weighted among themselves." how="The gap to the headline figure is how much the liquid funds calm the list." /></p><p className="eqr-v"><b>{b2(o?.betaExLiquid)}</b><Chip band={o?.betaExLiquidBand} /></p><p className="eqr-sub">The {compared.length} funds that hold shares, against their own benchmarks.</p></div>
          <div className="eqr-tile"><p className="sp-cap">Against the Nifty 500 alone<Tip label="About “Against the Nifty 500 alone”" text="The list's combined weekly NAV change against the Nifty 500 only, past year." how="The figure for what a Nifty 500 fall has meant; use it for “if the whole market fell”." /></p><p className="eqr-v"><b>{b2(o?.beta500)}</b><Chip band={o?.beta500Band} /></p><p className="eqr-win">{BETA_WIN}</p><p className="eqr-sub">Use this for "what if the whole market falls".</p></div>
        </div>
        <Insights items={cards} scope="mf.beta" />
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 3 Each fund against its own benchmark
const OWN_COLS: Record<string, SortCol<FundRisk>> = {
  fund: { kind: "text", get: (f) => f.short }, bench: { kind: "text", get: (f) => (f.compared === false ? null : f.benchmark) }, yr: { kind: "num", get: (f) => f.oneYear },
  expl: { kind: "num", get: (f) => f.explained }, dn: { kind: "num", get: (f) => f.downPer100 }, up: { kind: "num", get: (f) => f.upPer100 },
  all: { kind: { rank: OVERALL_RANK }, get: (f) => overallOf(f.downPer100, f.upPer100)?.word },
};
export function OwnBenchSection({ rk }: { rk: MfRisk }) {
  const sort = useSort(rk.funds, OWN_COLS), [open, setOpen] = useState(false), c = capRows(sort.sorted, RISK_CAP, open);
  return (
    <Section id="mfp-ownb" hide title="Each fund against its own benchmark" help="The beta figures only, past year of weekly NAVs: each fund's 1-year change beside its benchmark's, how much of its moves the benchmark explains, and how much it moved for every 100 its benchmark moved in down weeks and in up weeks." how="Below 100 in down weeks: it fell less than its benchmark. Where the benchmark explains under a fifth, the down and up weeks are left out: the beta says little."
      sub="The beta figures, past year, weekly NAVs. Swing and worst fall over 3 years are in “Each fund's risk”.">
      <Scroll label="each fund against its own benchmark"><table className="sp-tb eqr-sb kit-grid mfr-sb" id="mfr-ownb-t"><thead><tr><SortHead id="fund" label="Fund" sort={sort} /><SortHead id="bench" label="Benchmark" sort={sort} />
        <SortHead id="yr" label="1 year" num sort={sort} /><SortHead id="expl" label="Explained by benchmark" sort={sort} /><SortHead id="dn" label="In down weeks" num sort={sort} /><SortHead id="up" label="In up weeks" num sort={sort} />
        <SortHead id="all" label="Overall" sort={sort} extra={<Tip label="About “Overall”" text="The down-week and up-week figures read together, per 100 of the benchmark's move: rises more and falls less, rises less and falls more, or moves more or less both ways." how="Green: under 100 in down weeks and 100 or more in up weeks. Red: the other way round. Blank where the benchmark explains too little of the fund's moves." />} /></tr></thead>
        <tbody>{c.shown.map((f) => { const ov = overallOf(f.downPer100, f.upPer100); return <tr key={f.code}><th scope="row">{f.short}<small className="mfp-sub">{f.category}</small></th>
          <td>{f.compared === false ? "No share index" : f.benchmark}{f.standIn && <span className="mff-tag stand" title={f.benchWhy ?? undefined}>Stand-in</span>}</td>
          <td className="r"><span className="mfr-yi"><span className="px-ix">Yours </span><b>{sp(f.oneYear)}</b></span>{f.compared !== false && <span className="mfr-yi mfr-yx"><span className="px-ix">Index </span>{sp(f.benchOneYear)}</span>}</td>
          <td>{f.explained == null ? <span className="sp-note">{f.compared === false ? "–" : "Under a year"}</span> : <span className="mfr-ex"><i><u style={{ width: `${f.explained}%` }} /></i>{f.explained}%{f.saysLittle && <small> · the beta says little</small>}</span>}</td>
          <td className="r">{f.downPer100 == null ? "–" : <><b>{f.downPer100}</b><small className="mfp-sub">per 100</small></>}</td><td className="r">{f.upPer100 == null ? "–" : <><b>{f.upPer100}</b><small className="mfp-sub">per 100</small></>}</td>
          <td>{ov ? <span className={"mfr-ov " + ov.tone}>{ov.word}</span> : <span className="sp-note">{f.compared === false ? "Not compared" : f.saysLittle ? "The beta says little" : "–"}</span>}</td></tr>; })}</tbody></table></Scroll>
      {c.capped && <ShowAll n={rk.funds.length} noun="fund" open={open} onToggle={() => setOpen(!open)} controls="mfr-ownb-t" />}
      <p className="sp-note">"In down weeks": how much the fund fell for every 100 its benchmark fell. "Stand-in": the benchmark until the right index is on the site. Blends are rebalanced each week.</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 4 Share of the list vs share of the risk
export function shaded(list: number, risk: number) { return risk - list >= 1.5 && risk >= list * 1.25; }
type RsRow = { k: string; list: number; risk: number };
const RS_COLS: Record<string, SortCol<RsRow>> = { name: { kind: "text", get: (r) => r.k }, list: { kind: "num", get: (r) => r.list }, risk: { kind: "num", get: (r) => r.risk } };
export function RiskShareSection({ rk }: { rk: MfRisk }) {
  const [by, setBy] = useState<"fund" | "type">("fund"), [open, setOpen] = useState(false);
  const rows = useMemo<RsRow[]>(() => by === "fund" ? rk.funds.map((f) => ({ k: f.short, list: f.listShare ?? 0, risk: f.riskShare ?? 0 }))
    : byType(rk).map((g) => ({ k: g.type, list: g.share, risk: g.funds.reduce((a, f) => a + (f.riskShare ?? 0), 0) })), [by, rk]);
  const sort = useSort(rows, RS_COLS, { initial: { id: "risk", dir: -1 } }), c = capRows(sort.sorted, RISK_CAP, open);
  const max = Math.max(1, ...rows.flatMap((r) => [r.list, r.risk]));
  const over = [...rows].sort((a, b) => b.risk - a.risk).filter((r) => shaded(r.list, r.risk)), calm = [...rows].sort((a, b) => b.risk - a.risk).filter((r) => r.risk < r.list / 4);
  const cards: Card[] = [];
  if (over.length) cards.push({ kind: "watch", title: `${over.length === 1 ? "One part carries" : `${over.length === 2 ? "Two" : over.length} parts carry`} more than ${over.length === 1 ? "its" : "their"} size`, text: over.map((r) => `${r.k}: ${Math.round(r.list)}% of the list, ${pc(r.risk)} of the swings`).join("; ") + "." });
  if (calm.length) cards.push({ kind: "good", title: `${calm.map((r) => r.k).join(" and ")} ${calm.length === 1 ? "carries" : "carry"} less than ${calm.length === 1 ? "its" : "their"} share`, text: calm.map((r) => `${r.k}: ${Math.round(r.list)}% of the list, ${pc(r.risk)} of the swings`).join("; ") + "." });
  return (
    <Section id="mfp-share" hide title="Share of the list vs share of the risk" help="Each fund's share of the list beside its share of the list's weekly ups and downs over the past year. The risk shares add to 100%." how="Grey: share of the list. Colour: share of the risk. A shaded row carries clearly more of the risk than of the list."
      sub="Grey: share of the list. Colour: share of its ups and downs. Shaded rows carry more of the swings than their size."
>
      <div className="eqd-tools"><div className="eqd-seg" role="group" aria-label="Split by">{(["fund", "type"] as const).map((k) => <button key={k} type="button" aria-pressed={by === k} onClick={() => { setBy(k); setOpen(false); }}>{k === "fund" ? "By fund" : "By fund type"}</button>)}</div></div>
      <Scroll label="share of the list and of the risk"><table className="sp-tb eqr-rs kit-grid" id="mfr-rs-t"><thead><tr><SortHead id="name" label={by === "fund" ? "Fund" : "Type"} sort={sort} /><th scope="col">Bars</th><SortHead id="list" label="List" num sort={sort} /><SortHead id="risk" label="Risk" num sort={sort} /></tr></thead>
        <tbody>{c.shown.map((r) => <tr key={r.k} className={shaded(r.list, r.risk) ? "more" : undefined}><th scope="row">{r.k}</th>
          <td className="eqr-bars"><span className="l" style={{ width: `${(r.list / max) * 100}%` }} /><span className="k" style={{ width: `${(Math.max(0, r.risk) / max) * 100}%` }} /></td><td className="r">{Math.round(r.list)}%</td><td className="r"><b>{pc(r.risk)}</b></td></tr>)}</tbody></table></Scroll>
      {c.capped && <ShowAll n={rows.length} noun={by === "fund" ? "fund" : "fund type"} open={open} onToggle={() => setOpen(!open)} controls="mfr-rs-t" />}
      <Insights items={cards} scope="mf.share" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 5 If the market fell 10%
export function FallSection({ rk, value }: { rk: MfRisk; value?: { now: number; name?: string } | null }) {
  const o = rk.own?.list;
  const groups = byType(rk).filter((g) => (g.adds ?? 0) > 0), top = groups[0];
  const items: Card[] = o?.betaOwn != null && top ? [{ kind: "insight", title: "What moves the beta", text: `${top.type} adds the most to the list's beta (${b2(top.adds)} of ${b2(o.betaOwn)}): ${groups.map((g) => `${g.type.toLowerCase()} ${b2(g.adds)}`).join(", ")}.${o.liquidShare ? ` The liquid fund adds nothing, so its ${Math.round(o.liquidShare)}% of the list holds the figure down.` : ""}` }] : [];
  // task #235 (pack C4, C5): the same picture as the Equity page, with the size of the fall and the rupee line on the platform's value now.
  // Task #389 (file 32): "Your funds' beta 0.84" reads "Moves 0.84× as much as its markets"; "2 pts" reads "2 points"; above 12 funds the 10 deepest falls.
  return <MarketFall id="mfp-fall" what="Nifty 500" idx="Nifty 500" value={value ?? null} unit="points" cap={{ ...RISK_CAP, noun: "fund" }}
    worst={rk.bench.worstFall != null && rk.bench.worstFall < 0 ? { pct: -rk.bench.worstFall, line: "the Nifty 500’s worst in 3 years" } : null}
    scenarios={[{ label: "Every benchmark falls", beta: o?.betaOwn ?? null, src: o?.betaOwn != null ? `Moves ${movesAsMuch(o.betaOwn)}: each fund against its own benchmark` : "Not enough NAVs for a reading yet.", parts: true },
      { label: "Only the Nifty 500 falls", beta: o?.beta500 ?? null, src: o?.beta500 != null ? `Moves ${movesAsMuch(o.beta500, "the Nifty 500")} alone: the whole list against it` : "Not enough NAVs for a reading yet.", parts: false }]}
    market={{ label: "Market", sub: "each fund's own benchmark" }} list={{ label: "Your funds", sub: rk.basis === "value" ? "by value" : "each counts the same" }}
    parts={rk.funds.filter((f) => f.betaOwn != null).map((f) => ({ label: f.short, beta: f.betaOwn as number, sub: f.listShare != null ? `${Math.round(f.listShare)}% of the list` : "" }))}
    after={<Insights items={items} scope="mf.fall" />} />;
}

// ------------------------------------------------------------------------------------------------ 6 Each fund's risk
/** What stands out about one fund, one note each (file 32, fault 13: joined with " · " they made one row about three times as tall). */
export function standsOutNotes(f: FundRisk): string[] {
  const out: string[] = [];
  if (f.years != null && f.years < 2.95) out.push(`Under 3 years of NAVs (${f.years} years)`);
  if (f.riskShare != null && f.listShare != null && shaded(f.listShare, f.riskShare)) out.push("More risk than its share");
  if (f.betaOwn != null && f.beta500 != null && f.compared && Math.abs(f.betaOwn - f.beta500) >= 0.2) out.push(`Moves ${f.betaOwn > f.beta500 ? "more" : "less"} on its own benchmark than on the Nifty 500 (${WIN_1Y})`);
  if (f.standIn) out.push("Benchmark is a stand-in");
  if (f.saysLittle) out.push("Its benchmark explains little of its moves");
  if (f.worstFall != null && f.worstFall <= -20) out.push(`Fell ${Math.abs(f.worstFall).toFixed(0)}% from a high`);
  return out;
}
export const standsOut = (f: FundRisk) => standsOutNotes(f).join(" · ") || "–";
/** At most two notes show, one a line; with three or more, the first and "+N more", which opens the rest in place. Nothing is dropped. */
export const NOTES_SHOW = 2;
function StandsOut({ notes }: { notes: string[] }) {
  const [open, setOpen] = useState(false);
  if (!notes.length) return <span className="sp-note">–</span>;
  const many = notes.length > NOTES_SHOW, shown = many && !open ? notes.slice(0, 1) : notes;
  return <ul className="mfr-so">{shown.map((n) => <li key={n}>{n}</li>)}
    {many && <li><button type="button" className="mfr-so-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Show fewer" : `+${notes.length - 1} more`}</button></li>}</ul>;
}
const EACH_COLS: Record<string, SortCol<FundRisk>> = {
  fund: { kind: "text", get: (f) => f.short }, beta: { kind: "num", get: (f) => (f.compared === false ? null : f.betaOwn) }, expl: { kind: "num", get: (f) => f.explained },
  swing: { kind: "num", get: (f) => f.swing }, worst: { kind: "num", get: (f) => f.worstFall }, falls: { kind: "num", get: (f) => (f.compared === false ? null : f.fallsTaken) },
  share: { kind: "num", get: (f) => f.riskShare }, notes: { kind: "text", get: (f) => standsOutNotes(f)[0] ?? null },
};
export function EachFundSection({ rk }: { rk: MfRisk }) {
  const sort = useSort(rk.funds, EACH_COLS, { initial: { id: "beta", dir: -1 } }), [open, setOpen] = useState(false), c = capRows(sort.sorted, RISK_CAP, open);
  return (
    <Section id="mfp-each" hide title="Each fund's risk" help="Each fund's beta against its own benchmark (past year, weekly), how much of its moves the benchmark explains, its swing, worst fall and share of the Nifty 500's falls taken (3 years, daily), and its share of the list's risk." how="Highest beta first. Under a year of NAVs: no beta. Years under 3 are named in what stands out."
      sub="Highest beta first. Swing and worst fall over 3 years, daily NAVs, or since launch.">
      <Scroll label="each fund's risk"><table className="sp-tb eqr-each kit-grid mfr-each" id="mfr-each-t"><thead><tr><SortHead id="fund" label="Fund" sort={sort} /><SortHead id="beta" label="Beta against its benchmark · past year" sort={sort} />
        <SortHead id="expl" label="Explained by benchmark" num sort={sort} /><SortHead id="swing" label="Swing a year · 3 yrs" num sort={sort} /><SortHead id="worst" label="Worst fall · 3 yrs" num sort={sort} />
        <SortHead id="falls" label="Falls taken · 3 yrs" num sort={sort} /><SortHead id="share" label="Share of risk" num sort={sort} /><SortHead id="notes" label="What stands out" sort={sort} className="mfr-so-h" /></tr></thead>
        <tbody>{c.shown.map((f) => <tr key={f.code}><th scope="row">{f.short}<small className="mfp-sub">{f.compared === false ? "No share index" : `against ${f.benchmark}`}</small></th>
          <td>{f.compared === false ? <span className="sp-note">Not compared</span> : f.betaOwn == null ? <span className="sp-note">Under a year</span> : <><b>{b2(f.betaOwn)}</b> <Chip band={f.band} /></>}</td>
          <td className="r">{f.explained == null ? "–" : `${f.explained}%`}</td><td className="r">{pc(f.swing)}</td><td className="r sp-red">{sp(f.worstFall)}</td>
          {/* file 32, fault 6: a fund not compared has no falls-taken reading, as it has no beta (the server sends none, with the reason) */}
          <td className="r">{f.compared === false || f.fallsTaken == null ? <span className="sp-note" title={f.fallsWhy ?? (f.compared === false ? "Not compared: it follows no share index." : f.why ?? undefined)}>–</span> : `${f.fallsTaken < 0 ? MINUS : ""}${Math.abs(f.fallsTaken)} per 100`}</td>
          <td className="r">{pc(f.riskShare)}</td><td className="mfr-so-c"><StandsOut notes={standsOutNotes(f)} /></td></tr>)}</tbody></table></Scroll>
      {c.capped && <ShowAll n={rk.funds.length} noun="fund" open={open} onToggle={() => setOpen(!open)} controls="mfr-each-t" />}
      <p className="sp-note">"What stands out" describes the figures only. "Falls taken": how much the fund fell for every 100 the Nifty 500 fell, on its down days.</p>
    </Section>
  );
}

export function RiskTab({ rk, value, kf }: { rk: MfRisk; value?: { now: number; name?: string } | null; /** task #275 (change 9): Key figures, under the main section */ kf?: ReactNode }) {
  return <><GlanceSection rk={rk} />{kf}<BuildSection rk={rk} /><OwnBenchSection rk={rk} /><RiskShareSection rk={rk} /><FallSection rk={rk} value={value} /><EachFundSection rk={rk} /></>;
}
