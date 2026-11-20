// Task #183 W8: the Equity portfolio's Risk analytics tab as the 15 Nov pack draws it (01-equity-portfolio, E72–E85): Risk at a glance, How your list's beta is
// built (with Reading a beta), Each size against its own benchmark, Share of the list vs share of the risk, If the market fell 10%, Each share's risk. Betas are
// against each share's own size index from index closes (POST /api/portfolio/risk); risk shares from the page answer. Every class is eqr-. Never advice.
import { BENCHMARKS } from "../useScore";
import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiSend, type ApiError, busyRetry } from "../../lib/api";
import { CoLogo } from "../../components/CoLogo";
import { Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import { Insights } from "./EquityPack";
import { MarketFall } from "./MarketFall";
import { RANGE_EDGES, RANGE_SUB, betaCards, glanceCards, glanceTiles, rangeCards, readingFigures, riskKeyCards, riskLede, riskStandsOut, signed, type RangeKey, type RiskAnswer, type RiskShare } from "../../lib/eqRisk";
import type { Share } from "../../lib/equityPack";
import type { PageObject } from "../types";
import "./risk-pack.css";
import { codeText, coTitle, subLine, titleOf } from "../../lib/companyLabel";

/** The risk answer for the saved list (Silver and Gold). */
export function usePortfolioRisk(symbols: string[], enabled: boolean) {
  const key = [...symbols].sort().join(",");
  return useQuery<RiskAnswer, ApiError>({ queryKey: ["portfolio-risk", key], queryFn: () => apiSend<RiskAnswer>("POST", "/api/portfolio/risk", { symbols }), enabled: enabled && symbols.length > 0, ...busyRetry, staleTime: 300_000 });
}
const b2 = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(2));
const pc = (v: number) => `${v.toFixed(1)}%`;
const MAX = 2.5, at = (b: number) => `${(Math.max(0, Math.min(MAX, b)) / MAX) * 100}%`;
const Chip = ({ band }: { band: RiskShare["band"] }) => (band ? <span className={"eqr-chip r-" + band.key}><i aria-hidden="true" />{band.word}</span> : null);
const SIZE_LETTER: Record<string, string> = { Large: "L", Mid: "M", Small: "S", Micro: "X" };

/** The page answer's risk shares (each share's part of the list's ups and downs; they add to 100%), by size, by macro sector and by share. */
export function riskSplit(page: PageObject, r: RiskAnswer, sectorOf: (s: string) => string) {
  const w = page.share_weight.eq, k = page.share_risk.eq, sz = new Map(r.shares.map((x) => [x.symbol, x.size]));
  const group = (of: (s: string) => string | null) => { const out: Record<string, { list: number; risk: number; n: number }> = {};
    for (const s of Object.keys(k)) { const g = of(s) ?? "No size band"; const x = (out[g] ??= { list: 0, risk: 0, n: 0 }); x.list += w[s] ?? 0; x.risk += k[s] ?? 0; x.n++; } return out; };
  return { bySize: group((s) => sz.get(s) ?? null), bySector: group(sectorOf), byShare: Object.fromEntries(Object.keys(k).map((s) => [s, { list: w[s] ?? 0, risk: k[s] ?? 0, n: 1 }])) };
}
export const riskKeys = (r: RiskAnswer, split: ReturnType<typeof riskSplit>) => riskKeyCards(r, split.bySize);

// ------------------------------------------------------------------------------------------------ 1 Risk at a glance
/** compare (task #235, pack B5): "Compare with [NIFTY 50 ▾]", the index the portfolio score reads the list against (moved here from "Make the score yours"). */
export function RiskGlancePack({ r, split, compare }: { r: RiskAnswer; split: ReturnType<typeof riskSplit>; compare?: { value: string; onChange: (v: string) => void } }) {
  const short = r.shares.filter((s) => s.why === "Under a year of prices").map((s) => s.symbol), lede = riskLede(r);
  return (
    <Section id="eq-rg" hide title="Risk at a glance" right={compare && <label className="eq-cmp">Compare with<select value={compare.value} onChange={(e) => compare.onChange(e.target.value)}>{BENCHMARKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>} help="Four figures, each against the Nifty 50: the typical swing and the worst fall over 3 years (the shares from weekly closes, the Nifty 50 from daily closes), the 10 worst weeks of the past year, and the beta weighted by size." how="Each figure sits beside the Nifty 50's; the line under it says whether the list has been bumpier or smoother."
      sub={`If equal amounts were held · swing and worst fall: 3 years of ${r.glance.list?.grain ?? "weekly"} prices; beta and weekly figures: the past year, to ${new Date(r.to + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · beta for ${r.counted} ${r.counted === 1 ? "share" : "shares"}${short.length ? ` (${short.join(", ")} ${short.length === 1 ? "has" : "have"} under a year of prices)` : ""}`}>
      <p className="eqr-lede"><b>{lede.lead}</b> {lede.rest}</p>
      <div className="eqr-tiles">{glanceTiles(r).map((t) => <div key={t.k} className="eqr-tile"><p className="sp-cap">{t.k}<Tip text={t.help} how={t.how} label={`About “${t.k}”`} /></p><p className="eqr-v"><b>{t.v}</b><small>{t.niftyWord ?? "Nifty 50"}: {t.nifty}</small></p><p className="eqr-sub">{t.sub}</p>{t.win && <p className="eqr-win">{t.win}</p>}</div>)}</div>
      {r.missingIndex.length > 0 && <p className="sp-note">Index closes not available right now for {r.missingIndex.join(", ")}: shares of that size have no beta until they are back.</p>}
      <Insights items={glanceCards(r, split.bySize)} scope="eq.rg" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2 How your list's beta is built + Reading a beta
const STEPS: [string, string][] = [["Sort by size", "Large, mid, small or micro by company value"], ["Match a benchmark", "Nifty 50 · Midcap 150 · Smallcap 250 · Microcap 250"], ["Beta for each share", "Against its own benchmark, weekly, one year"], ["Average by size", "One beta for each size"], ["Weight by the list", "By count now; by money once quantities are in"]];
const BAR: Record<string, string> = { Large: "#2E7D57", Mid: "#C9A227", Small: "#B4362B", Micro: "var(--k7)" };   // Micro: the site's violet chart token (task #262)
export function BetaBuild({ r }: { r: RiskAnswer }) {
  const [tab, setTab] = useState<"size" | "where" | "three" | "how">("size"), [f, setF] = useState<"All" | "Large" | "Mid" | "Small" | "Micro">("All"), [pin, setPin] = useState<string | null>(null), [open, setOpen] = useState<Record<string, boolean>>({});
  const sizes = r.sizes.filter((s) => s.n), w = r.betas.weighted;
  const shown = r.shares.filter((s) => s.beta != null && (f === "All" || s.size === f)), beta = f === "All" ? w : r.sizes.find((s) => s.size === f)?.avgBeta ?? null;
  const ranges = rangeCards(shown), picked = pin ? r.shares.find((s) => s.symbol === pin) : null;
  const pins = [...(f === "All" && w != null ? [{ k: "Your list", b: w, band: r.betas.weightedBand }] : []), ...sizes.filter((s) => (f === "All" || s.size === f) && s.avgBeta != null).map((s) => ({ k: `${s.size} companies`, b: s.avgBeta as number, band: s.band })),
    ...(picked?.beta != null ? [{ k: picked.symbol, b: picked.beta, band: picked.band }] : [])];
  const TABS: [typeof tab, string, string][] = [["size", "By size", "Each size against its own index"], ["where", "Where your shares sit", "The six ranges, share by share"], ["three", "Three ways to measure", "Size-weighted, blended, Nifty 50"], ["how", "How it is worked out", "The five steps"]];
  return (
    <Section id="eq-build" hide title="How your list's beta is built" help="Each share is compared with the index of companies its own size over the past year of weekly closes; the sizes are then combined by their share of the list." how="Each size card adds its part; the parts add up to the size-weighted beta in the sum card."
      sub="Each share is compared with the index of companies its own size, then the sizes are combined by their share of the list.">
      {/* task #235 (pack B4): two cards always shown, then four tabs, each with its existing content */}
      <div className="eqb-sum">
        <div><p className="sp-cap">Your list's beta</p><p className="eqb-big"><b>{b2(w)}</b><Chip band={r.betas.weightedBand} /></p>
          <p className="eqb-x">{w == null ? "Not enough prices for a beta yet." : `Has moved about ${(w * 10).toFixed(1)}% when its benchmarks moved 10%. Each share is measured against its own size index.`}</p></div>
        <div className="eqb-mix"><p className="sp-cap">What adds up to {b2(w)}</p>
          <div className="eqr-stack" role="img" aria-label={`The list's beta by size: ${sizes.map((s) => `${s.size} ${b2(s.adds)}`).join(", ")}`}>{sizes.map((s) => <i key={s.size} style={{ flexGrow: Math.max(0.01, s.adds ?? 0), background: BAR[s.size] }}>{s.size} {b2(s.adds)}</i>)}</div>
          <ul className="eqb-leg">{sizes.map((s) => <li key={s.size}><b>{s.size}</b> β {b2(s.avgBeta)} × {Math.round(s.listShare)}% = <b>{b2(s.adds)}</b></li>)}</ul></div>
      </div>
      <p className="x2-k" aria-hidden="true">How it is built <small>{TABS.length} ways to look · tap one</small></p>
      <div className="xtabs" role="tablist" aria-label="How your list's beta is built">{TABS.map(([k, t, x], i) => (
        <button key={k} type="button" role="tab" id={"eqb-t-" + k} aria-selected={tab === k} aria-controls={"eqb-p-" + k} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}
          onKeyDown={(e) => { const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null; if (n == null) return; e.preventDefault(); const to = TABS[(n + TABS.length) % TABS.length][0]; setTab(to); setTimeout(() => document.getElementById("eqb-t-" + to)?.focus(), 0); }}>
          <span className="xn" aria-hidden="true">{i + 1}</span><b>{t}</b><small>{x}</small></button>))}</div>
      <div className="eqb-p" role="tabpanel" id={"eqb-p-" + tab} aria-labelledby={"eqb-t-" + tab}>
      {tab === "size" && <>
      <div className="eqr-cards">{sizes.map((s) => { const xs = r.shares.filter((x) => x.size === s.size && x.beta != null); return (
        <div key={s.size} className="eqr-card"><p className="sp-cap">{s.size} companies · {s.n}</p><p className="eqr-mute">against {s.benchmark}</p>
          <div className="eqr-strip" role="img" aria-label={`${s.size} companies' betas: ${xs.map((x) => `${x.symbol} ${b2(x.beta)}`).join(", ")}`}>{xs.map((x) => <i key={x.symbol} style={{ left: at(x.beta as number) }} title={`${x.symbol} ${b2(x.beta)}`} />)}{s.avgBeta != null && <b style={{ left: at(s.avgBeta) }} />}<span style={{ left: at(1) }} /></div>
          <p className="eqr-axis"><span>0</span><span style={{ left: at(1) }}>1.0</span><span>2.5</span></p>
          <dl><div><dt>Average beta</dt><dd>{b2(s.avgBeta)}</dd></div><div className="c"><Chip band={s.band} /></div><div><dt>Share of the list</dt><dd>× {Math.round(s.listShare)}%</dd></div><div><dt>Adds to the list's beta</dt><dd><b>{b2(s.adds)}</b></dd></div></dl></div>); })}
        <div className="eqr-card eqr-sum"><p className="sp-cap">Your list</p><p className="eqr-mute">size-weighted</p><p className="eqr-big">{b2(w)}</p><Chip band={r.betas.weightedBand} /><p className="eqr-mute">{sizes.map((s) => b2(s.adds)).join(" + ")}</p></div>
      </div>
      </>}
      {tab === "where" && <div className="eqr-read" id="eq-read">
        <div className="eqr-read-h"><div><h3 className="eqr-h3">Reading a beta<Tip text="Where your list, each size and a tapped share sit on the six ranges of beta." how="A beta of 1 moves with its benchmark. 1.5 has moved about 15% when its benchmark moved 10%; 0.5 about 5%." /></h3><p className="sp-note">A beta of 1 moves with its benchmark. 1.5 has moved about 15% when its benchmark moved 10%; 0.5 about 5%.</p></div>
          <div className="eqd-seg" role="group" aria-label="Which shares">{(["All", "Large", "Mid", "Small", "Micro"] as const).map((k) => <button key={k} type="button" aria-pressed={f === k} onClick={() => { setF(k); setPin(null); }}>{k === "All" ? `All ${r.counted}` : k}</button>)}</div></div>
        <div className="eqr-f4">{readingFigures(shown, beta).map((x) => <div key={x.k}><b>{x.v}</b><small>{x.k}</small></div>)}</div>
        <div className="eqr-scale"><div className="eqr-pins" style={{ height: `${pins.length * 26 + 6}px` }}>{pins.map((p, i) => <span key={p.k} className="eqr-pin" style={{ left: at(p.b), top: `${i * 26}px`, ["--stem" as string]: `${(pins.length - i) * 26 - 18}px` }}><b>{b2(p.b)}</b> {p.k}{p.band && <em> {p.band.word}</em>}</span>)}</div>
          <div className="eqr-bands">{RANGE_EDGES.map(([k, lo, hi]) => <span key={k} className={"r-" + k} style={{ width: `${((hi - lo) / MAX) * 100}%` }}>{r.ranges.find((x) => x.key === k)?.word}</span>)}</div>
          <p className="eqr-ticks">{[0, 0.65, 0.9, 1.1, 1.35, 1.75, 2.5].map((t) => <span key={t} style={{ left: at(t) }}>{t}</span>)}</p></div>
        <p className="sp-cap">How your {shown.length} shares spread across the ranges</p>
        <div className="eqr-spread">{ranges.filter((x) => x.who.length).map((x) => <span key={x.key} className={"r-" + x.key} style={{ flexGrow: x.who.length }}><b>{x.who.length}</b><small>{r.ranges.find((y) => y.key === x.key)?.word}</small></span>)}</div>
        <p className="eqr-hint">{picked ? <>{picked.symbol}: {b2(picked.beta)} against {picked.benchmark}, {picked.band?.word.toLowerCase()}; {picked.explained}% of its moves explained by the benchmark. <button type="button" className="eqd-link" onClick={() => setPin(null)}>Clear</button></> : "Tap a share's name below to place it on the scale and see its details."}</p>
        <div className="eqr-ranges">{ranges.map((x) => { const all = !!open[x.key], show = all ? x.who : x.who.slice(0, 6); return (
          <div key={x.key} className={"eqr-range r-" + x.key}><Chip band={{ key: x.key as RangeKey, word: r.ranges.find((y) => y.key === x.key)?.word ?? "" }} />
            <p className="eqr-mute">{x.key === "less" ? `below ${x.hi}` : x.key === "very_high" ? `above ${x.lo}` : `${x.lo.toFixed(2)} – ${x.hi.toFixed(2)}`}</p>
            <p className="eqr-n"><b>{x.who.length}</b> {x.who.length === 1 ? "share" : "shares"} · {Math.round(x.pct)}%</p><p className="eqr-mute">{RANGE_SUB[x.key as RangeKey]}</p>
            <ul>{show.map((s) => <li key={s.symbol}><button type="button" className="eqr-nm" aria-pressed={pin === s.symbol} onClick={() => setPin(s.symbol)}><i className={"z-" + (SIZE_LETTER[s.size ?? ""] ?? "U")}>{SIZE_LETTER[s.size ?? ""] ?? "–"}</i>{codeText(s.symbol)}</button><b>{b2(s.beta)}</b></li>)}</ul>
            {x.who.length > 6 && <button type="button" className="eq-more" aria-expanded={all} onClick={() => setOpen({ ...open, [x.key]: !all })}>{all ? "Show fewer ▴" : `Show all ${x.who.length} ▾`}</button>}</div>); })}</div>
      </div>}
      {tab === "three" && <>
        <div className="eqr-b3">
          <div className="eqr-tile"><p className="sp-cap">Size-weighted beta<Tip text="Each share against its own size index; each size's average beta times its share of the list." how="The headline reading: 1 moves with its own benchmarks, above 1 more, below 1 less." /></p><p className="eqr-v"><b>{b2(r.betas.weighted)}</b><Chip band={r.betas.weightedBand} /></p><p className="eqr-sub">Each share against its own size index. The headline reading.</p></div>
          <div className="eqr-tile"><p className="sp-cap">Against a blended benchmark<Tip text="The list against the size indices mixed in its own proportions." how="It checks the size-weighted figure: close to it, the two agree." /></p><p className="eqr-v"><b>{b2(r.betas.blended)}</b><Chip band={r.betas.blendedBand} /></p><p className="eqr-sub">{sizes.map((s) => `${Math.round(s.listShare)}% ${s.benchmark}`).join(" + ")}. {r.betas.blended != null && r.betas.weighted != null && Math.abs(r.betas.blended - r.betas.weighted) <= 0.1 ? "Close to the size-weighted figure, which checks it." : "It checks the size-weighted figure."}</p></div>
          <div className="eqr-tile"><p className="sp-cap">Against the Nifty 50 alone<Tip text="The list against the Nifty 50 only." how="The figure for what a Nifty 50 fall has meant. Mid, small and micro companies move less in step with it." /></p><p className="eqr-v"><b>{b2(r.betas.nifty)}</b><Chip band={r.betas.niftyBand} /></p><p className="eqr-sub">Use this for "what if the Nifty 50 falls". Mid, small and micro companies move less in step with it.</p></div>
        </div>
      </>}
      {tab === "how" && <>
      <ol className="eqr-steps">{STEPS.map(([t, x], i) => <li key={t}><span>{i + 1}</span><b>{t}</b><small>{x}</small></li>)}</ol>
      </>}
      </div>
      <Insights items={betaCards(r)} scope="eq.beta" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 3 Each size against its own benchmark
export function SizeBench({ r }: { r: RiskAnswer }) {
  return (
    <Section id="eq-sizeb" hide title="Each size against its own benchmark" help="Your shares of each size, held in equal amounts, against the index of companies that size, over the past year." how="Per 100 in down weeks: below 100 fell less than the index. Per 100 in up weeks: above 100 rose more."
      sub="Your shares of each size, held in equal amounts, against the index of companies that size. Past year, weekly prices.">
      <Scroll label="each size against its own benchmark"><table className="sp-tb eqr-sb kit-grid"><thead><tr><th scope="col">Size</th><th scope="col">Benchmark</th><th scope="col" className="r">1 year</th><th scope="col" className="r">In down weeks</th><th scope="col" className="r">In up weeks</th></tr></thead>
        <tbody>{r.sizes.filter((s) => s.n).map((s) => <tr key={s.size}><th scope="row"><b>{s.size}</b><small>· {s.n} {s.n === 1 ? "share" : "shares"}</small></th><td>{s.benchmark}</td>
          <td className="r"><b className={(s.oneYear ?? 0) >= 0 ? "sp-good" : "sp-red"}>{signed(s.oneYear)}</b><small>{signed(s.benchOneYear)}</small></td>
          <td className="r"><b>{s.downPer100 ?? "–"}</b><small>per 100</small></td><td className="r"><b>{s.upPer100 ?? "–"}</b><small>per 100</small></td></tr>)}</tbody></table></Scroll>
      <p className="sp-note">First figure: your shares of that size. Second: the benchmark. "In down weeks": how much your shares fell for every 100 the benchmark fell.</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 4 Share of the list vs share of the risk
export function RiskShareSection({ r, split }: { r: RiskAnswer; split: ReturnType<typeof riskSplit> }) {
  const [by, setBy] = useState<"size" | "sector" | "share">("size"), bySym = new Map(r.shares.map((s) => [s.symbol, s]));
  const rows = Object.entries(by === "size" ? split.bySize : by === "sector" ? split.bySector : split.byShare).sort((a, b) => b[1].risk - a[1].risk);
  const max = Math.max(1, ...rows.flatMap(([, x]) => [x.list, x.risk]));
  return (
    <Section id="eq-mr" hide title="Share of the list vs share of the risk" help="Each part's share of the list beside its share of the list's ups and downs (past two years of weekly closes)." how="Grey: the share of the list, if equal amounts were held. Colour: the share of the risk; they add to 100%. A shaded row carries more of the risk than of the list."
      sub="Grey: share of the list. Colour: share of the list's ups and downs. Shaded rows carry more of the swings than their size.">
      <div className="eqd-tools"><div className="eqd-seg" role="group" aria-label="Split by">{(["size", "sector", "share"] as const).map((k) => <button key={k} type="button" aria-pressed={by === k} onClick={() => setBy(k)}>By {k}</button>)}</div></div>
      <Scroll label="share of the list and of the risk"><table className="sp-tb eqr-rs"><thead><tr><th scope="col">{by === "size" ? "Size" : by === "sector" ? "Macro sector" : "Share"}</th><th scope="col"><span className="sr-only">Bars</span></th>
        {by === "share" && <><th scope="col" className="r">Beta</th><th scope="col">Reading</th></>}<th scope="col" className="r">List</th><th scope="col" className="r">Risk</th></tr></thead>
        <tbody>{rows.map(([k, x]) => { const s = bySym.get(k); return <tr key={k} className={x.risk > x.list + 1 ? "more" : ""}><th scope="row">{by === "size" ? `${k} companies` : k}</th>
          <td className="eqr-bars"><span className="l" style={{ width: `${(x.list / max) * 100}%` }} /><span className="k" style={{ width: `${(x.risk / max) * 100}%` }} /></td>
          {by === "share" && <><td className="r">{b2(s?.beta)}</td><td>{s?.band ? <Chip band={s.band} /> : <span className="sp-nil">{s?.why ?? "–"}</span>}</td></>}<td className="r">{pc(x.list)}</td><td className="r"><b>{pc(x.risk)}</b></td></tr>; })}</tbody></table></Scroll>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 5 If the market fell 10%
export function Fall10({ r, value }: { r: RiskAnswer; value?: { now: number; name?: string } | null }) {
  const most = [...r.sizes].filter((s) => s.n && s.adds != null).sort((a, b) => (b.adds as number) - (a.adds as number))[0];
  const items = r.betas.weighted != null && most ? [{ kind: "insight" as const, title: "What moves the beta", text: `${most.size} companies add the most to the list's beta (${b2(most.adds)} of ${b2(r.betas.weighted)}): ${r.sizes.filter((s) => s.n).map((s) => `${s.size.toLowerCase()} ${b2(s.adds)}`).join(", ")}. The more of the list a size holds, the more its own index sets the list's moves.` }] : [];
  // pack B8 v3: the worst-fall size is the Risk tab's own "Worst fall" for the Nifty 50 over 3 years, served as it is
  const worst = r.glance.nifty.worstFall != null && r.glance.nifty.worstFall < 0 ? { pct: -r.glance.nifty.worstFall, line: "the Nifty 50’s worst in 3 years" } : null;
  return <MarketFall id="eq-fall" value={value ?? null} worst={worst}
    scenarios={[{ label: "Every size index falls", beta: r.betas.weighted, src: `Size-weighted beta ${b2(r.betas.weighted)}: each share against its own size index`, parts: true },
      { label: "Only the Nifty 50 falls", beta: r.betas.nifty, src: `Beta against the Nifty 50 ${b2(r.betas.nifty)}`, parts: false }]}
    parts={r.sizes.filter((s) => s.n && s.avgBeta != null).map((s) => ({ label: s.size, beta: s.avgBeta as number, sub: `${Math.round(s.listShare)}% of the list` }))}
    after={<Insights items={items} scope="eq.fall" />} />;
}

// ------------------------------------------------------------------------------------------------ 6 Each share's risk
export function EachShareRisk({ r, split, shares, gold }: { r: RiskAnswer; split: ReturnType<typeof riskSplit>; shares: Share[]; gold: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set()), byS = new Map(shares.map((s) => [s.symbol, s]));
  const groups = (["Large", "Mid", "Small", "Micro"] as const).map((k) => ({ k, sz: r.sizes.find((s) => s.size === k)!, xs: r.shares.filter((s) => s.size === k).sort((a, b) => (b.beta ?? -1) - (a.beta ?? -1)), risk: split.bySize[k]?.risk ?? 0 })).filter((g) => g.xs.length);
  const none = r.shares.filter((s) => !s.size);
  const all = groups.every((g) => open.has(g.k)), flip = (k: string) => { const n = new Set(open); if (n.has(k)) n.delete(k); else n.add(k); setOpen(n); };
  const yrs = (s: RiskShare) => (s.years != null && s.years < 2.95 ? ` (${s.years.toFixed(1)} yrs)` : "");
  const row = (s: RiskShare) => { const x = byS.get(s.symbol), rk = split.byShare[s.symbol]; return (
    <tr key={s.symbol}><td><Link to={`/stocks/${s.symbol}`} className="ip-sym"><CoLogo symbol={s.symbol} size={22} inline /><span><b title={coTitle({ symbol: s.symbol, name: x?.name })}>{titleOf({ symbol: s.symbol, name: x?.name })}</b><small>{subLine({ symbol: s.symbol, name: x?.name }, s.sector ?? "") ?? ""}</small></span></Link></td>
      <td>{s.beta != null ? <><b>{b2(s.beta)}</b> <Chip band={s.band} /></> : <span className="sp-nil">{s.why === "Under a year of prices" ? "Under a year" : s.why ?? "–"}</span>}</td>
      <td className="r">{s.explained != null ? `${s.explained}%` : "–"}</td>
      <td className="r">{s.swing != null ? `${s.swing.toFixed(1)}%${yrs(s)}` : "–"}</td><td className="r">{s.worstFall != null ? `${signed(s.worstFall)}${yrs(s)}` : "–"}</td>
      <td className={"r " + ((s.oneYear ?? 0) >= 0 ? "sp-good" : "sp-red")}>{signed(s.oneYear)}</td><td className="r">{x?.below52 == null ? "–" : `${x.below52.toFixed(1)}%`}</td>
      <td className={"r " + ((x?.m1 ?? 0) >= 0 ? "sp-good" : "sp-red")}>{signed(x?.m1)}</td><td className="r">{rk ? pc(rk.risk) : "–"}</td>
      {gold && <td className="r">{x?.risk == null ? <span className="sp-nil">Not scored</span> : Math.round(x.risk)}</td>}
      <td className="eq-so">{riskStandsOut(s, rk?.risk ?? null, rk?.list ?? null, x?.below52 ?? null, x?.m1 ?? null)}</td></tr>); };
  const nCols = gold ? 11 : 10;
  return (
    <Section id="eq-each" hide title="Each share's risk" help="Each share against its own size index over the past year, its typical swing and worst fall over 3 years, its last year, how far below its 1-year high it is, its last month, and its share of the list's risk." how="Grouped by size: open a group to see its shares. Under a year: too few prices for a beta. Years under 3 are shown beside the swing."
      sub="Grouped by company size, each against its own benchmark. Highest beta first inside each group."
      right={<span className="eqr-oc"><button type="button" className="eqd-link" onClick={() => setOpen(new Set(groups.map((g) => g.k)))} disabled={all}>Open all</button> <button type="button" className="eqd-link" onClick={() => setOpen(new Set())} disabled={!open.size}>Close all</button></span>}>
      <Scroll label="each share's risk"><table className="sp-tb eqr-each kit-grid"><thead><tr><th scope="col">Share</th><th scope="col">Beta against its benchmark<Tip text="The share against the index of companies its size, past year of weekly closes." how="1 moves with that index, above 1 more, below 1 less; the tag names its range." /></th>
        <th scope="col" className="r">Explained by benchmark<Tip text="How much of the share's weekly moves its size index explains (R²)." how="High: the beta reads the share well. Low: the share mostly follows its own news, and the beta says less." /></th>
        <th scope="col" className="r">Swing a year, 3 yrs</th><th scope="col" className="r">Worst fall, 3 yrs</th><th scope="col" className="r">1 year</th><th scope="col" className="r">Below 1-yr high</th><th scope="col" className="r">1 month</th><th scope="col" className="r">Share of risk</th>
        {gold && <th scope="col" className="r">Prism Risk<Tip text="FinLit Prism's Risk part, 0 to 100, from the business's own figures." how="Higher means lower risk on those figures. It reads the business, not the price." /></th>}<th scope="col">What stands out</th></tr></thead>
        {groups.map((g) => <tbody key={g.k}><tr className="eqr-g"><td colSpan={nCols}><button type="button" aria-expanded={open.has(g.k)} onClick={() => flip(g.k)}><span aria-hidden="true">{open.has(g.k) ? "▾" : "▸"}</span> <b>{g.k} companies</b> · {g.xs.length} {g.xs.length === 1 ? "share" : "shares"} · against {g.sz.benchmark} · average beta {b2(g.sz.avgBeta)}{g.sz.band ? `, ${g.sz.band.word.toLowerCase()}` : ""} · {Math.round(g.risk)}% of the risk · {open.has(g.k) ? "Hide" : "Show"}</button></td></tr>
          {open.has(g.k) && g.xs.map(row)}</tbody>)}
        {none.length > 0 && <tbody><tr className="eqr-g"><td colSpan={nCols}><b>No size band yet</b> · {none.map((s) => s.symbol).join(", ")}: no benchmark to compare with.</td></tr></tbody>}
      </table></Scroll>
      <p className="sp-note">"What stands out" describes the figures; it is not advice. Swing and worst fall are over 3 years of weekly closes (fewer when a share has less, shown in brackets); betas, 1 year and share of risk are over the past year.</p>
    </Section>
  );
}
