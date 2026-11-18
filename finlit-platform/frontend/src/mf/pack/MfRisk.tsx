// Task #183 part 2 (MF portfolio, pack 02 §4 "Risk analytics (rebuilt, same blocks as equity)"): 1 At a glance (against the Nifty 500) → 2 How your list's beta is
// built (by fund type, then Reading a beta and the three beta figures) → 3 Each fund against its own benchmark → 4 Share of the list vs share of the risk →
// 5 If the market fell 10% → 6 Each fund's risk. The figures are the server's (/api/me/mf-portfolio/risk: mfportfolio/bench.py for the own-benchmark figures,
// mfportfolio/risk.py for swing and worst fall); the beta ranges are the owner's table (COMMON-RULES 8). The Equity page's eqr- styles are shared. Never advice.
import { useState } from "react";
import { Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import { Insights } from "../../portfolio/pack/EquityPack";
import { RANGE_EDGES, RANGE_SUB, type RangeKey } from "../../lib/eqRisk";
import type { Card } from "../../lib/pulsePack";
import type { BetaBand, FundRisk, MfRisk } from "../../lib/mfPack";
import "../../portfolio/pack/risk-pack.css";

const b2 = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(2));
const sp = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`);
const pc = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v.toFixed(d)}%`);
const MAX = 2.5, at = (b: number) => `${(Math.max(0, Math.min(MAX, b)) / MAX) * 100}%`;
const Chip = ({ band }: { band: BetaBand | undefined }) => (band ? <span className={"eqr-chip r-" + band.key}><i aria-hidden="true" />{band.word}</span> : null);
const WORDS: Record<RangeKey, string> = { less: "Less sensitive", defensive: "Defensive", similar: "Similar", more: "More sensitive", high: "High", very_high: "Very high" };
const BAR = ["#1f6b6b", "#b8892f", "#2E7D57", "#8fa8a6", "#B4362B", "#6b5ea8"];
const isLiquid = (f: FundRisk) => f.compared === false;

/** The funds grouped by type for the beta build: count, benchmark, average beta (within the type, weighted by the list), share of the list, what it adds. */
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

export function riskLede(rk: MfRisk) {
  const o = rk.own?.list, b = o?.betaOwn;
  if (b == null) return null;
  const lead = b < 0.9 ? "Your list moves less than its markets." : b > 1.1 ? "Your list moves more than its markets." : "Your list moves about with its markets.";
  return { lead, rest: `Each fund against its own benchmark, the list has moved ${b2(b)}% for every 1% move in them${rk.list.swing != null && rk.bench.swing != null ? `, and it swings ${rk.list.swing.toFixed(1)}% in a typical year against ${rk.bench.swing.toFixed(1)}% for the Nifty 500` : ""}.` };
}

export function glanceTiles(rk: MfRisk) {
  const l = rk.list, b = rk.bench, o = rk.own?.list;
  const ratio = l.swing != null && b.swing ? l.swing / b.swing : null;
  return [
    { k: "Typical swing in a year · 3 yrs", v: pc(l.swing), vs: `Nifty 500: ${pc(b.swing)}`, sub: ratio == null ? "Not enough NAVs." : ratio < 0.85 ? "A calmer ride than the index." : ratio > 1.15 ? "A bumpier ride than the index." : "About as bumpy as the index.",
      help: "How much the list's value has moved up and down in a typical year, from daily NAVs over 3 years.", how: "Higher is a bumpier ride. Set it beside the Nifty 500's." },
    { k: "Worst fall from a high · 3 yrs", v: sp(l.worstFall), vs: `Nifty 500: ${sp(b.worstFall)}`, sub: l.worstFall == null || b.worstFall == null ? "Not enough NAVs." : l.worstFall > b.worstFall / 2 ? "Less than half as deep." : l.worstFall > b.worstFall ? "Shallower than the index." : "Deeper than the index.",
      help: "The largest drop of the list from a high to a later low, over 3 years of daily NAVs.", how: "A larger minus figure is a deeper fall." },
    { k: "In the 10 worst weeks · past year", v: sp(o?.worst10.list), vs: `Nifty 500: ${sp(o?.worst10.nifty500)}`, sub: o?.worst10.list == null || o.worst10.nifty500 == null ? "Not enough NAVs." : o.worst10.list > o.worst10.nifty500 + 0.3 ? "Falls less when the market falls." : o.worst10.list < o.worst10.nifty500 - 0.3 ? "Falls more when the market falls." : "Falls about as much as the market.",
      help: "The list's average weekly change in the Nifty 500's 10 worst weeks of the past year.", how: "Above the Nifty 500's figure: the list fell less in those weeks." },
    { k: "Beta, own benchmarks", v: b2(o?.betaOwn), vs: "benchmarks: 1.00", sub: o?.betaOwn == null ? "Not enough NAVs." : o.betaOwn < 0.9 ? "Moves less than its markets." : o.betaOwn > 1.1 ? "Moves more than its markets." : "Moves about with its markets.",
      help: "Each fund against its own category's benchmark over the past year of weekly NAVs; the funds combined by their share of the list, liquid funds as 0.", how: "1.00 moves with its own benchmarks; above 1 more, below 1 less." },
  ];
}

export function glanceCards(rk: MfRisk): Card[] {
  const o = rk.own?.list, out: Card[] = [];
  if (rk.list.swing != null && rk.bench.swing != null) out.push(rk.list.swing < rk.bench.swing ? { kind: "good", title: "Calmer than the market", text: `The list swings ${rk.list.swing.toFixed(1)}% a year against ${rk.bench.swing.toFixed(1)}% for the Nifty 500.` }
    : { kind: "watch", title: "Bumpier than the market", text: `The list swings ${rk.list.swing.toFixed(1)}% a year against ${rk.bench.swing.toFixed(1)}% for the Nifty 500.` });
  const most = [...rk.funds].filter((f) => f.riskShare != null).sort((a, b) => (b.riskShare as number) - (a.riskShare as number))[0];
  if (most) out.push({ kind: "watch", title: `${most.short} carries the most risk`, text: `${pc(most.riskShare, 0)} of the list's ups and downs, from ${pc(most.listShare, 0)} of the list.` });
  if (o?.liquidShare && o.betaOwn != null && o.betaExLiquid != null) out.push({ kind: "insight", title: "The liquid fund does a lot of the calming", text: `Without it the list's beta is ${b2(o.betaExLiquid)}, not ${b2(o.betaOwn)}: it is ${pc(o.liquidShare, 0)} of the list and barely moves.` });
  return out;
}

// ------------------------------------------------------------------------------------------------ 1 At a glance
export function GlanceSection({ rk }: { rk: MfRisk }) {
  const lede = riskLede(rk), to = rk.own?.to ?? rk.bench.to;
  return (
    <Section id="mfp-glance" hide title="Risk at a glance" help="Four figures, each against the Nifty 500: the swing and the worst fall over 3 years of daily NAVs, the 10 worst weeks of the past year, and the beta with each fund against its own benchmark." how="Each figure sits beside the Nifty 500's; the line under it says whether the list has been calmer or bumpier."
      sub={`${rk.basis === "value" ? "Funds weighted by the value of your units" : "Each fund counts the same until units are added"} · swing and worst fall from daily NAVs over 3 years; beta and weekly figures from the past year, to ${new Date(to + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`}>
      {lede && <p className="eqr-lede"><b>{lede.lead}</b> {lede.rest}</p>}
      {rk.list.why && <p className="sp-note">{rk.list.why}</p>}
      <div className="eqr-tiles">{glanceTiles(rk).map((t) => <div key={t.k} className="eqr-tile"><p className="sp-cap">{t.k}<Tip text={t.help} how={t.how} label={`About “${t.k}”`} /></p><p className="eqr-v"><b>{t.v}</b><small>{t.vs}</small></p><p className="eqr-sub">{t.sub}</p></div>)}</div>
      <Insights items={glanceCards(rk)} scope="mf.glance" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2 Beta build + Reading a beta + three figures
const STEPS: [string, string][] = [["Sort by fund type", "Small cap, hybrid, thematic, liquid"], ["Match a benchmark", "Its category's index"], ["Beta for each fund", "Against its own benchmark, weekly, one year"], ["Average by type", "One beta for each type"], ["Weight by the list", "By count now; by money once units are in"]];
export function BuildSection({ rk }: { rk: MfRisk }) {
  const groups = byType(rk), o = rk.own?.list, [pin, setPin] = useState<number | null>(null);
  const compared = rk.funds.filter((f) => f.betaOwn != null && !isLiquid(f)), picked = pin != null ? rk.funds.find((f) => f.code === pin) : null;
  const pins = [...(o?.betaOwn != null ? [{ k: "Your list", b: o.betaOwn, band: o.betaOwnBand }] : []), ...(o?.betaExLiquid != null && o.liquidShare ? [{ k: "Without liquid", b: o.betaExLiquid, band: o.betaExLiquidBand }] : []),
    ...(picked?.betaOwn != null ? [{ k: picked.short, b: picked.betaOwn, band: picked.band }] : [])];
  const ranges = RANGE_EDGES.map(([k, lo, hi]) => ({ key: k, lo, hi, who: compared.filter((f) => f.band?.key === k) }));
  const fig = [{ k: "beta of your list, each fund against its own benchmark", v: b2(o?.betaOwn) }, { k: "its usual move when its benchmarks move 10%", v: o?.betaOwn != null ? `about ${(o.betaOwn * 10).toFixed(1)}%` : "–" },
    { k: "funds that move more than their market", v: `${compared.filter((f) => (f.betaOwn as number) > 1.1).length} of ${compared.length}` }, { k: "funds that move less than their market", v: `${compared.filter((f) => (f.betaOwn as number) < 0.9).length} of ${compared.length}` }];
  const cards: Card[] = [];
  const mismatch = rk.funds.filter((f) => f.beta != null && f.betaOwn != null && f.compared && Math.abs((f.beta as number) - (f.betaOwn as number)) >= 0.2);
  if (mismatch.length) cards.push({ kind: "insight", title: "A different answer from the Nifty 500 alone", text: `${mismatch.map((f) => `${f.short} reads ${b2(f.betaOwn)} against its own benchmark and ${b2(f.beta)} against the Nifty 500 (3 years, daily)`).join("; ")}.` });
  const blend = rk.funds.find((f) => f.benchKind === "blend" && f.betaOwn != null);
  if (blend) cards.push({ kind: "watch", title: `${blend.short} moves with its own mix`, text: `Against its blend (${blend.benchmark}) it reads ${b2(blend.betaOwn)}: it moves with the mix it holds, not calmer than it.` });
  const stand = rk.funds.filter((f) => f.standIn);
  if (stand.length) cards.push({ kind: "insight", title: `${stand.length === 1 ? "One benchmark is a" : `${stand.length} benchmarks are`} stand-in`, text: `${stand.map((f) => `${f.short}: ${f.benchWhy ?? f.benchmark}`).join(" ")}` });
  return (
    <Section id="mfp-build" hide title="How your list's beta is built" help="Each fund is compared with the benchmark its category is measured against, over the past year of weekly NAVs; the types are then combined by their share of the list." how="Each type card adds its part; the parts add up to the list's beta in the sum card. Liquid funds count as 0."
      sub="Each fund is compared with the benchmark its category is measured against, then the types are combined by their share of the list.">
      <ol className="eqr-steps">{STEPS.map(([t, x], i) => <li key={t}><span>{i + 1}</span><b>{t}</b><small>{x}</small></li>)}</ol>
      <div className="eqr-cards">{groups.map((g) => (
        <div key={g.type} className="eqr-card"><p className="sp-cap">{g.type} · {g.n}</p><p className="eqr-mute">against {g.bench}</p>
          <div className="eqr-strip" role="img" aria-label={`${g.type}: ${g.funds.map((f) => `${f.short} ${b2(f.betaOwn)}`).join(", ")}`}>{g.funds.filter((f) => f.betaOwn != null).map((f) => <i key={f.code} style={{ left: at(f.betaOwn as number) }} title={`${f.short} ${b2(f.betaOwn)}`} />)}{g.avg != null && <b style={{ left: at(g.avg) }} />}<span style={{ left: at(1) }} /></div>
          <p className="eqr-axis"><span>0</span><span style={{ left: at(1) }}>1.0</span><span>2.5</span></p>
          <dl><div><dt>Average beta</dt><dd>{b2(g.avg)}</dd></div><div><dt>Share of the list</dt><dd>× {Math.round(g.share)}%</dd></div><div><dt>Adds to the list's beta</dt><dd><b>{b2(g.adds)}</b></dd></div></dl></div>))}
        <div className="eqr-card eqr-sum"><p className="sp-cap">Your list</p><p className="eqr-mute">against its own benchmarks</p><p className="eqr-big">{b2(o?.betaOwn)}</p><Chip band={o?.betaOwnBand} /><p className="eqr-mute">{groups.map((g) => b2(g.adds)).join(" + ")} = {b2(o?.betaOwn)}</p></div>
      </div>
      <div className="eqr-stack" role="img" aria-label={`The list's beta by fund type: ${groups.map((g) => `${g.type} ${b2(g.adds)}`).join(", ")}`}>{groups.filter((g) => (g.adds ?? 0) > 0).map((g, i) => <i key={g.type} style={{ flexGrow: Math.max(0.01, g.adds ?? 0), background: BAR[i % BAR.length] }}>{g.type} {b2(g.adds)}</i>)}</div>

      <div className="eqr-read" id="mfp-read">
        <div className="eqr-read-h"><div><h3 className="eqr-h3">Reading a beta<Tip text="Where your list, the list without its liquid funds and a tapped fund sit on the six ranges of beta." how="A beta of 1 moves with its benchmark. 1.5 has moved about 15% when its benchmark moved 10%; 0.5 about 5%." /></h3><p className="sp-note">A beta of 1 moves with its benchmark. 1.5 has moved about 15% when its benchmark moved 10%; 0.5 about 5%.</p></div></div>
        <div className="eqr-f4">{fig.map((x) => <div key={x.k}><b>{x.v}</b><small>{x.k}</small></div>)}</div>
        <div className="eqr-scale"><div className="eqr-pins" style={{ height: `${pins.length * 26 + 6}px` }}>{pins.map((p, i) => <span key={p.k} className="eqr-pin" style={{ left: at(p.b), top: `${i * 26}px`, ["--stem" as string]: `${(pins.length - i) * 26 - 18}px` }}><b>{b2(p.b)}</b> {p.k}{p.band && <em> {p.band.word}</em>}</span>)}</div>
          <div className="eqr-bands">{RANGE_EDGES.map(([k, lo, hi]) => <span key={k} className={"r-" + k} style={{ width: `${((hi - lo) / MAX) * 100}%` }}>{WORDS[k]}</span>)}</div>
          <p className="eqr-ticks">{[0, 0.65, 0.9, 1.1, 1.35, 1.75, 2.5].map((t) => <span key={t} style={{ left: at(t) }}>{t}</span>)}</p></div>
        <p className="sp-cap">How your {compared.length} funds spread across the ranges</p>
        <div className="eqr-spread">{ranges.filter((x) => x.who.length).map((x) => <span key={x.key} className={"r-" + x.key} style={{ flexGrow: x.who.length }}><b>{x.who.length}</b><small>{WORDS[x.key]}</small></span>)}</div>
        <p className="eqr-hint">{picked ? <>{picked.short}: {b2(picked.betaOwn)} against {picked.benchmark}, {picked.band?.word.toLowerCase()}; {picked.explained}% of its moves explained by the benchmark. <button type="button" className="eqd-link" onClick={() => setPin(null)}>Clear</button></> : `Tap a fund below to place it on the scale and see its details.${o?.liquidShare ? " The liquid fund is left out: it follows no share index." : ""}`}</p>
        <div className="eqr-ranges">{ranges.map((x) => (
          <div key={x.key} className={"eqr-range r-" + x.key}><Chip band={{ key: x.key, word: WORDS[x.key] }} />
            <p className="eqr-mute">{x.key === "less" ? `below ${x.hi}` : x.key === "very_high" ? `above ${x.lo}` : `${x.lo.toFixed(2)} – ${x.hi.toFixed(2)}`}</p>
            <p className="eqr-n"><b>{x.who.length}</b> {x.who.length === 1 ? "fund" : "funds"} · {compared.length ? Math.round((x.who.length / compared.length) * 100) : 0}%</p><p className="eqr-mute">{RANGE_SUB[x.key]}</p>
            <ul>{x.who.map((f) => <li key={f.code}><button type="button" className="eqr-nm" aria-pressed={pin === f.code} onClick={() => setPin(f.code)}>{f.short}</button><b>{b2(f.betaOwn)}</b></li>)}</ul>{!x.who.length && <p className="eqr-mute">None</p>}</div>))}</div>
        <div className="eqr-b3">
          <div className="eqr-tile"><p className="sp-cap">Against own benchmarks<Tip text="Each fund against its own category's benchmark; the funds combined by their share of the list, liquid funds as 0." how="The headline reading: 1 moves with its own benchmarks, above 1 more, below 1 less." /></p><p className="eqr-v"><b>{b2(o?.betaOwn)}</b><Chip band={o?.betaOwnBand} /></p><p className="eqr-sub">Each fund against its category's index. The headline reading.</p></div>
          <div className="eqr-tile"><p className="sp-cap">Without the liquid fund<Tip text="The same figure for the funds that follow a share index only, weighted among themselves." how="The gap to the headline figure is how much the liquid funds calm the list." /></p><p className="eqr-v"><b>{b2(o?.betaExLiquid)}</b><Chip band={o?.betaExLiquidBand} /></p><p className="eqr-sub">The {compared.length} funds that hold shares, against their own benchmarks.</p></div>
          <div className="eqr-tile"><p className="sp-cap">Against the Nifty 500 alone<Tip text="The list's combined weekly NAV change against the Nifty 500 only, past year." how="The figure for what a Nifty 500 fall has meant; use it for “if the whole market fell”." /></p><p className="eqr-v"><b>{b2(o?.beta500)}</b><Chip band={o?.beta500Band} /></p><p className="eqr-sub">Use this for "what if the whole market falls".</p></div>
        </div>
        <Insights items={cards} scope="mf.beta" />
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 3 Each fund against its own benchmark
export function OwnBenchSection({ rk }: { rk: MfRisk }) {
  return (
    <Section id="mfp-ownb" hide title="Each fund against its own benchmark" help="The beta figures only, past year of weekly NAVs: each fund's 1-year change beside its benchmark's, how much of its moves the benchmark explains, and how much it moved for every 100 its benchmark moved in down weeks and in up weeks." how="Below 100 in down weeks: it fell less than its benchmark. Where the benchmark explains under a fifth, the down and up weeks are left out: the beta says little."
      sub="The beta figures, past year, weekly NAVs. Swing and worst fall over 3 years are in “Each fund's risk”.">
      <Scroll label="each fund against its own benchmark"><table className="sp-tb eqr-sb kit-grid"><thead><tr><th scope="col">Fund</th><th scope="col">Benchmark</th><th scope="col" className="r">1 year</th><th scope="col">Explained by benchmark</th><th scope="col" className="r">In down weeks</th><th scope="col" className="r">In up weeks</th></tr></thead>
        <tbody>{rk.funds.map((f) => <tr key={f.code}><th scope="row">{f.short}<small className="mfp-sub">{f.category}</small></th>
          <td>{f.compared === false ? "No share index" : f.benchmark}{f.standIn && <span className="mff-tag stand" title={f.benchWhy ?? undefined}>Stand-in</span>}</td>
          <td className="r"><b>{sp(f.oneYear)}</b><small className="mfp-sub">{f.compared === false ? "" : sp(f.benchOneYear)}</small></td>
          <td>{f.explained == null ? <span className="sp-note">{f.compared === false ? "–" : "Under a year"}</span> : <span className="mfr-ex"><i><u style={{ width: `${f.explained}%` }} /></i>{f.explained}%{f.saysLittle && <small> · the beta says little</small>}</span>}</td>
          <td className="r">{f.downPer100 == null ? "–" : <><b>{f.downPer100}</b><small className="mfp-sub">per 100</small></>}</td><td className="r">{f.upPer100 == null ? "–" : <><b>{f.upPer100}</b><small className="mfp-sub">per 100</small></>}</td></tr>)}</tbody></table></Scroll>
      <p className="sp-note">"In down weeks": how much the fund fell for every 100 its benchmark fell. "Stand-in": the benchmark until the right index is on the site. Blends are rebalanced each week.</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 4 Share of the list vs share of the risk
export function shaded(list: number, risk: number) { return risk - list >= 1.5 && risk >= list * 1.25; }
export function RiskShareSection({ rk }: { rk: MfRisk }) {
  const [by, setBy] = useState<"fund" | "type">("fund");
  const rows = by === "fund" ? rk.funds.map((f) => ({ k: f.short, list: f.listShare ?? 0, risk: f.riskShare ?? 0 }))
    : byType(rk).map((g) => ({ k: g.type, list: g.share, risk: g.funds.reduce((a, f) => a + (f.riskShare ?? 0), 0) }));
  rows.sort((a, b) => b.risk - a.risk);
  const max = Math.max(1, ...rows.flatMap((r) => [r.list, r.risk]));
  const over = rows.filter((r) => shaded(r.list, r.risk)), calm = rows.filter((r) => r.risk < r.list / 4);
  const cards: Card[] = [];
  if (over.length) cards.push({ kind: "watch", title: `${over.length === 1 ? "One part carries" : `${over.length === 2 ? "Two" : over.length} parts carry`} more than ${over.length === 1 ? "its" : "their"} size`, text: over.map((r) => `${r.k}: ${Math.round(r.list)}% of the list, ${r.risk.toFixed(1)}% of the swings`).join("; ") + "." });
  if (calm.length) cards.push({ kind: "good", title: `${calm.map((r) => r.k).join(" and ")} ${calm.length === 1 ? "carries" : "carry"} less than ${calm.length === 1 ? "its" : "their"} share`, text: calm.map((r) => `${r.k}: ${Math.round(r.list)}% of the list, ${r.risk.toFixed(1)}% of the swings`).join("; ") + "." });
  return (
    <Section id="mfp-share" hide title="Share of the list vs share of the risk" help="Each fund's share of the list beside its share of the list's weekly ups and downs over the past year. The risk shares add to 100%." how="Grey: share of the list. Colour: share of the risk. A shaded row carries clearly more of the risk than of the list."
      sub="Grey: share of the list. Colour: share of its ups and downs. Shaded rows carry more of the swings than their size."
>
      <div className="eqd-tools"><div className="eqd-seg" role="group" aria-label="Split by">{(["fund", "type"] as const).map((k) => <button key={k} type="button" aria-pressed={by === k} onClick={() => setBy(k)}>{k === "fund" ? "By fund" : "By fund type"}</button>)}</div></div>
      <Scroll label="share of the list and of the risk"><table className="sp-tb eqr-rs kit-grid"><thead><tr><th scope="col">{by === "fund" ? "Fund" : "Type"}</th><th scope="col">Bars</th><th scope="col" className="r">List</th><th scope="col" className="r">Risk</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.k} className={shaded(r.list, r.risk) ? "more" : undefined}><th scope="row">{r.k}</th>
          <td className="eqr-bars"><span className="l" style={{ width: `${(r.list / max) * 100}%` }} /><span className="k" style={{ width: `${(Math.max(0, r.risk) / max) * 100}%` }} /></td><td className="r">{Math.round(r.list)}%</td><td className="r"><b>{r.risk.toFixed(1)}%</b></td></tr>)}</tbody></table></Scroll>
      <Insights items={cards} scope="mf.share" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 5 If the market fell 10%
export function FallSection({ rk }: { rk: MfRisk }) {
  const o = rk.own?.list, w = (v: number | null | undefined) => (v == null ? 0 : Math.min(100, (-v / 25) * 100));
  const each = rk.funds.filter((f) => f.betaOwn != null).map((f) => ({ k: f.short, v: Math.round(-10 * (f.betaOwn as number) * 10) / 10 })).sort((a, b) => a.v - b.v);
  const lakh = (v: number | null | undefined) => (v == null ? "–" : `₹${(Math.round(Math.abs(v) * 100) * 100).toLocaleString("en-IN")}`);   // v% of ₹10 lakh
  const groups = byType(rk).filter((g) => (g.adds ?? 0) > 0), top = groups[0];
  const items: Card[] = o?.betaOwn != null && top ? [{ kind: "insight", title: "What moves the beta", text: `${top.type} adds the most to the list's beta (${b2(top.adds)} of ${b2(o.betaOwn)}): ${groups.map((g) => `${g.type.toLowerCase()} ${b2(g.adds)}`).join(", ")}.${o.liquidShare ? ` The liquid fund adds nothing, so its ${Math.round(o.liquidShare)}% of the list holds the figure down.` : ""}` }] : [];
  return (
    <Section id="mfp-fall" hide title="If the market fell 10%" help="A rough size guide from past betas: beta times 10%, past year of weekly NAVs." how="The rupee line puts it on ₹10 lakh. Real falls are uneven; this is not a forecast." sub="A rough size guide from past betas. Real falls are uneven; this is not a forecast.">
      <div className="eqr-fall"><div><b>If every benchmark fell 10%</b><small>beta against own benchmarks {b2(o?.betaOwn)}</small></div><span className="eqr-fb"><i style={{ width: `${w(o?.fall10.own)}%` }} /><s style={{ left: "40%" }} /></span><b>about {sp(o?.fall10.own)}</b></div>
      <div className="eqr-fall"><div><b>If the Nifty 500 alone fell 10%</b><small>beta against the Nifty 500 {b2(o?.beta500)}</small></div><span className="eqr-fb"><i style={{ width: `${w(o?.fall10.nifty500)}%` }} /><s style={{ left: "40%" }} /></span><b>about {sp(o?.fall10.nifty500)}</b></div>
      <p className="sp-cap">Each fund, if its own benchmark fell 10%</p>
      {each.map((x) => <div key={x.k} className="eqr-fall sm"><div>{x.k}</div><span className="eqr-fb"><i style={{ width: `${w(x.v)}%` }} /></span><b className="sp-red">{sp(x.v)}</b></div>)}
      <p className="eqr-rupee">On ₹10 lakh, a 10% fall in every benchmark has meant roughly {lakh(o?.fall10.own)}; a 10% fall in the Nifty 500 alone, roughly {lakh(o?.fall10.nifty500)}.</p>
      <Insights items={items} scope="mf.fall" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 6 Each fund's risk
export function standsOut(f: FundRisk) {
  const out: string[] = [];
  if (f.years != null && f.years < 2.95) out.push(`Under 3 years of NAVs (${f.years} years)`);
  if (f.riskShare != null && f.listShare != null && shaded(f.listShare, f.riskShare)) out.push("More risk than its share");
  if (f.betaOwn != null && f.beta != null && f.compared && Math.abs(f.betaOwn - f.beta) >= 0.2) out.push(`Moves ${f.betaOwn > f.beta ? "more" : "less"} on its own benchmark than on the Nifty 500`);
  if (f.standIn) out.push("Benchmark is a stand-in");
  if (f.saysLittle) out.push("Its benchmark explains little of its moves");
  if (f.worstFall != null && f.worstFall <= -20) out.push(`Fell ${Math.abs(f.worstFall).toFixed(0)}% from a high`);
  return out.filter(Boolean).join(" · ") || "–";
}
export function EachFundSection({ rk }: { rk: MfRisk }) {
  return (
    <Section id="mfp-each" hide title="Each fund's risk" help="Each fund's beta against its own benchmark (past year, weekly), how much of its moves the benchmark explains, its swing, worst fall and share of the Nifty 500's falls taken (3 years, daily), and its share of the list's risk." how="Highest beta first. Under a year of NAVs: no beta. Years under 3 are named in what stands out."
      sub="Highest beta first. Swing and worst fall over 3 years, daily NAVs, or since launch.">
      <Scroll label="each fund's risk"><table className="sp-tb eqr-each kit-grid"><thead><tr><th scope="col">Fund</th><th scope="col">Beta against its benchmark · past year</th><th scope="col" className="r">Explained by benchmark</th><th scope="col" className="r">Swing a year · 3 yrs</th><th scope="col" className="r">Worst fall · 3 yrs</th><th scope="col" className="r">Falls taken · 3 yrs</th><th scope="col" className="r">Share of risk</th><th scope="col">What stands out</th></tr></thead>
        <tbody>{[...rk.funds].sort((a, b) => (b.betaOwn ?? -1) - (a.betaOwn ?? -1)).map((f) => <tr key={f.code}><th scope="row">{f.short}<small className="mfp-sub">{f.compared === false ? "No share index" : `against ${f.benchmark}`}</small></th>
          <td>{f.compared === false ? <span className="sp-note">Not compared</span> : f.betaOwn == null ? <span className="sp-note">Under a year</span> : <><b>{b2(f.betaOwn)}</b> <Chip band={f.band} /></>}</td>
          <td className="r">{f.explained == null ? "–" : `${f.explained}%`}</td><td className="r">{pc(f.swing)}</td><td className="r sp-red">{sp(f.worstFall)}</td><td className="r">{f.fallsTaken == null ? "–" : `${f.fallsTaken} per 100`}</td>
          <td className="r">{pc(f.riskShare)}</td><td>{standsOut(f)}</td></tr>)}</tbody></table></Scroll>
      <p className="sp-note">"What stands out" describes the figures only.</p>
    </Section>
  );
}

export function RiskTab({ rk }: { rk: MfRisk }) {
  return <><GlanceSection rk={rk} /><BuildSection rk={rk} /><OwnBenchSection rk={rk} /><RiskShareSection rk={rk} /><FallSection rk={rk} /><EachFundSection rk={rk} /></>;
}
