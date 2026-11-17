// Task #183 W8: the Equity portfolio's Risk analytics tab as the 15 Nov pack draws it (01-equity-portfolio, E72–E85): Risk at a glance, How your list's beta is
// built (with Reading a beta), Each size against its own benchmark, Share of the list vs share of the risk, If the market fell 10%, Each share's risk. Betas are
// against each share's own size index from index closes (POST /api/portfolio/risk); risk shares from the page answer. Every class is eqr-. Never advice.
import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiSend, type ApiError } from "../../lib/api";
import { CoLogo } from "../../components/CoLogo";
import { Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import { Insights } from "./EquityPack";
import { RANGE_EDGES, RANGE_SUB, betaCards, fallLines, glanceCards, glanceTiles, rangeCards, readingFigures, riskKeyCards, riskLede, riskStandsOut, signed, type RangeKey, type RiskAnswer, type RiskShare } from "../../lib/eqRisk";
import type { Share } from "../../lib/equityPack";
import type { PageObject } from "../types";
import "./risk-pack.css";

/** The risk answer for the saved list (Silver and Gold). */
export function usePortfolioRisk(symbols: string[], enabled: boolean) {
  const key = [...symbols].sort().join(",");
  return useQuery<RiskAnswer, ApiError>({ queryKey: ["portfolio-risk", key], queryFn: () => apiSend<RiskAnswer>("POST", "/api/portfolio/risk", { symbols }), enabled: enabled && symbols.length > 0, retry: false, staleTime: 300_000 });
}
const b2 = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(2));
const pc = (v: number) => `${v.toFixed(1)}%`;
const MAX = 2.5, at = (b: number) => `${(Math.max(0, Math.min(MAX, b)) / MAX) * 100}%`;
const Chip = ({ band }: { band: RiskShare["band"] }) => (band ? <span className={"eqr-chip r-" + band.key}><i aria-hidden="true" />{band.word}</span> : null);
const SIZE_LETTER: Record<string, string> = { Large: "L", Mid: "M", Small: "S" };

/** The page answer's risk shares (each share's part of the list's ups and downs; they add to 100%), by size, by macro sector and by share. */
export function riskSplit(page: PageObject, r: RiskAnswer, sectorOf: (s: string) => string) {
  const w = page.share_weight.eq, k = page.share_risk.eq, sz = new Map(r.shares.map((x) => [x.symbol, x.size]));
  const group = (of: (s: string) => string | null) => { const out: Record<string, { list: number; risk: number; n: number }> = {};
    for (const s of Object.keys(k)) { const g = of(s) ?? "No size band"; const x = (out[g] ??= { list: 0, risk: 0, n: 0 }); x.list += w[s] ?? 0; x.risk += k[s] ?? 0; x.n++; } return out; };
  return { bySize: group((s) => sz.get(s) ?? null), bySector: group(sectorOf), byShare: Object.fromEntries(Object.keys(k).map((s) => [s, { list: w[s] ?? 0, risk: k[s] ?? 0, n: 1 }])) };
}
export const riskKeys = (r: RiskAnswer, split: ReturnType<typeof riskSplit>) => riskKeyCards(r, split.bySize);

// ------------------------------------------------------------------------------------------------ 1 Risk at a glance
export function RiskGlancePack({ r, split }: { r: RiskAnswer; split: ReturnType<typeof riskSplit> }) {
  const short = r.shares.filter((s) => s.why === "Under a year of prices").map((s) => s.symbol), lede = riskLede(r);
  return (
    <Section id="eq-rg" hide title="Risk at a glance" help="Risk at a glance. Four figures, each against the Nifty 50: the typical swing and the worst fall over 3 years of daily closes, the 10 worst weeks of the past year, and the beta weighted by size."
      sub={`If equal amounts were held · swing and worst fall: 3 years of daily prices; beta and weekly figures: the past year, to ${new Date(r.to + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · beta for ${r.counted} ${r.counted === 1 ? "share" : "shares"}${short.length ? ` (${short.join(", ")} ${short.length === 1 ? "has" : "have"} under a year of prices)` : ""}`}>
      <p className="eqr-lede"><b>{lede.lead}</b> {lede.rest}</p>
      <div className="eqr-tiles">{glanceTiles(r).map((t) => <div key={t.k} className="eqr-tile"><p className="sp-cap">{t.k}<Tip text={t.help} label={`About “${t.k}”`} /></p><p className="eqr-v"><b>{t.v}</b><small>{t.niftyWord ?? "Nifty 50"}: {t.nifty}</small></p><p className="eqr-sub">{t.sub}</p></div>)}</div>
      {r.missingIndex.length > 0 && <p className="sp-note">Index closes not available right now for {r.missingIndex.join(", ")}: shares of that size have no beta until they are back.</p>}
      <Insights items={glanceCards(r, split.bySize)} scope="eq.rg" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2 How your list's beta is built + Reading a beta
const STEPS: [string, string][] = [["Sort by size", "Large, mid or small by company value"], ["Match a benchmark", "Nifty 50 · Midcap 150 · Smallcap 250"], ["Beta for each share", "Against its own benchmark, weekly, one year"], ["Average by size", "One beta for each size"], ["Weight by the list", "By count now; by money once quantities are in"]];
const BAR: Record<string, string> = { Large: "#2E7D57", Mid: "#C9A227", Small: "#B4362B" };
export function BetaBuild({ r }: { r: RiskAnswer }) {
  const [f, setF] = useState<"All" | "Large" | "Mid" | "Small">("All"), [pin, setPin] = useState<string | null>(null), [open, setOpen] = useState<Record<string, boolean>>({});
  const sizes = r.sizes.filter((s) => s.n), w = r.betas.weighted;
  const shown = r.shares.filter((s) => s.beta != null && (f === "All" || s.size === f)), beta = f === "All" ? w : r.sizes.find((s) => s.size === f)?.avgBeta ?? null;
  const ranges = rangeCards(shown), picked = pin ? r.shares.find((s) => s.symbol === pin) : null;
  const pins = [...(f === "All" && w != null ? [{ k: "Your list", b: w, band: r.betas.weightedBand }] : []), ...sizes.filter((s) => (f === "All" || s.size === f) && s.avgBeta != null).map((s) => ({ k: `${s.size} companies`, b: s.avgBeta as number, band: s.band })),
    ...(picked?.beta != null ? [{ k: picked.symbol, b: picked.beta, band: picked.band }] : [])];
  return (
    <Section id="eq-build" hide title="How your list's beta is built" help="How your list's beta is built. Each share is compared with the index of companies its own size over the past year of weekly closes; the sizes are then combined by their share of the list."
      sub="Each share is compared with the index of companies its own size, then the sizes are combined by their share of the list.">
      <ol className="eqr-steps">{STEPS.map(([t, x], i) => <li key={t}><span>{i + 1}</span><b>{t}</b><small>{x}</small></li>)}</ol>
      <div className="eqr-cards">{sizes.map((s) => { const xs = r.shares.filter((x) => x.size === s.size && x.beta != null); return (
        <div key={s.size} className="eqr-card"><p className="sp-cap">{s.size} companies · {s.n}</p><p className="eqr-mute">against {s.benchmark}</p>
          <div className="eqr-strip" role="img" aria-label={`${s.size} companies' betas: ${xs.map((x) => `${x.symbol} ${b2(x.beta)}`).join(", ")}`}>{xs.map((x) => <i key={x.symbol} style={{ left: at(x.beta as number) }} title={`${x.symbol} ${b2(x.beta)}`} />)}{s.avgBeta != null && <b style={{ left: at(s.avgBeta) }} />}<span style={{ left: at(1) }} /></div>
          <p className="eqr-axis"><span>0</span><span style={{ left: at(1) }}>1.0</span><span>2.5</span></p>
          <dl><div><dt>Average beta</dt><dd>{b2(s.avgBeta)}</dd></div><div className="c"><Chip band={s.band} /></div><div><dt>Share of the list</dt><dd>× {Math.round(s.listShare)}%</dd></div><div><dt>Adds to the list's beta</dt><dd><b>{b2(s.adds)}</b></dd></div></dl></div>); })}
        <div className="eqr-card eqr-sum"><p className="sp-cap">Your list</p><p className="eqr-mute">size-weighted</p><p className="eqr-big">{b2(w)}</p><Chip band={r.betas.weightedBand} /><p className="eqr-mute">{sizes.map((s) => b2(s.adds)).join(" + ")}</p></div>
      </div>
      <div className="eqr-stack" role="img" aria-label={`The list's beta by size: ${sizes.map((s) => `${s.size} ${b2(s.adds)}`).join(", ")}`}>{sizes.map((s) => <i key={s.size} style={{ flexGrow: Math.max(0.01, s.adds ?? 0), background: BAR[s.size] }}>{s.size} {b2(s.adds)}</i>)}</div>

      <div className="eqr-read" id="eq-read">
        <div className="eqr-read-h"><div><h3 className="eqr-h3">Reading a beta<Tip text="Reading a beta. A beta of 1 moves with its benchmark. 1.5 has moved about 15% when its benchmark moved 10%; 0.5 about 5%." /></h3><p className="sp-note">A beta of 1 moves with its benchmark. 1.5 has moved about 15% when its benchmark moved 10%; 0.5 about 5%.</p></div>
          <div className="eqd-seg" role="group" aria-label="Which shares">{(["All", "Large", "Mid", "Small"] as const).map((k) => <button key={k} type="button" aria-pressed={f === k} onClick={() => { setF(k); setPin(null); }}>{k === "All" ? `All ${r.counted}` : k}</button>)}</div></div>
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
            <ul>{show.map((s) => <li key={s.symbol}><button type="button" className="eqr-nm" aria-pressed={pin === s.symbol} onClick={() => setPin(s.symbol)}><i className={"z-" + (SIZE_LETTER[s.size ?? ""] ?? "U")}>{SIZE_LETTER[s.size ?? ""] ?? "–"}</i>{s.symbol}</button><b>{b2(s.beta)}</b></li>)}</ul>
            {x.who.length > 6 && <button type="button" className="eq-more" aria-expanded={all} onClick={() => setOpen({ ...open, [x.key]: !all })}>{all ? "Show fewer ▴" : `Show all ${x.who.length} ▾`}</button>}</div>); })}</div>
        <div className="eqr-b3">
          <div className="eqr-tile"><p className="sp-cap">Size-weighted beta<Tip text="Size-weighted beta. Each share against its own size index; each size's average beta times its share of the list. The headline reading." /></p><p className="eqr-v"><b>{b2(r.betas.weighted)}</b><Chip band={r.betas.weightedBand} /></p><p className="eqr-sub">Each share against its own size index. The headline reading.</p></div>
          <div className="eqr-tile"><p className="sp-cap">Against a blended benchmark<Tip text="Against a blended benchmark. The list against the three size indices mixed in its own proportions. It checks the size-weighted figure." /></p><p className="eqr-v"><b>{b2(r.betas.blended)}</b><Chip band={r.betas.blendedBand} /></p><p className="eqr-sub">{sizes.map((s) => `${Math.round(s.listShare)}% ${s.benchmark}`).join(" + ")}. {r.betas.blended != null && r.betas.weighted != null && Math.abs(r.betas.blended - r.betas.weighted) <= 0.1 ? "Close to the size-weighted figure, which checks it." : "It checks the size-weighted figure."}</p></div>
          <div className="eqr-tile"><p className="sp-cap">Against the Nifty 50 alone<Tip text="Against the Nifty 50 alone. The list against the Nifty 50 only: the figure to use for what a Nifty 50 fall has meant." /></p><p className="eqr-v"><b>{b2(r.betas.nifty)}</b><Chip band={r.betas.niftyBand} /></p><p className="eqr-sub">Use this for "what if the Nifty 50 falls". Small and mid companies move less in step with it.</p></div>
        </div>
        <Insights items={betaCards(r)} scope="eq.beta" />
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 3 Each size against its own benchmark
export function SizeBench({ r }: { r: RiskAnswer }) {
  return (
    <Section id="eq-sizeb" hide title="Each size against its own benchmark" help="Each size against its own benchmark. Your shares of each size, held in equal amounts, against the index of companies that size: the past year's return, and how much they moved for every 100 the index moved in its down weeks and in its up weeks."
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
    <Section id="eq-mr" hide title="Share of the list vs share of the risk" help="Share of the list vs share of the risk. Grey: the part's share of the list, if equal amounts were held. Colour: its share of the list's ups and downs (past two years of weekly closes). The risk shares add to 100%."
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
export function Fall10({ r }: { r: RiskAnswer }) {
  const f = fallLines(r), w = (v: number | null) => (v == null ? 0 : Math.min(100, (-v / 25) * 100));
  const most = [...r.sizes].filter((s) => s.n && s.adds != null).sort((a, b) => (b.adds as number) - (a.adds as number))[0];
  const items = r.betas.weighted != null && most ? [{ kind: "insight" as const, title: "What moves the beta", text: `${most.size} companies add the most to the list's beta (${b2(most.adds)} of ${b2(r.betas.weighted)}): ${r.sizes.filter((s) => s.n).map((s) => `${s.size.toLowerCase()} ${b2(s.adds)}`).join(", ")}. The more of the list a size holds, the more its own index sets the list's moves.` }] : [];
  return (
    <Section id="eq-fall" hide title="If the market fell 10%" help="If the market fell 10%. A rough size guide from past betas: beta times 10%. Real falls are uneven; this is not a forecast." sub="A rough size guide from past betas. Real falls are uneven; this is not a forecast.">
      <div className="eqr-fall"><div><b>If every size index fell 10%</b><small>size-weighted beta {b2(r.betas.weighted)}</small></div><span className="eqr-fb"><i style={{ width: `${w(f.weighted)}%` }} /><s style={{ left: "40%" }} /></span><b>about {signed(f.weighted)}</b></div>
      <div className="eqr-fall"><div><b>If the Nifty 50 alone fell 10%</b><small>beta against the Nifty 50 {b2(r.betas.nifty)}</small></div><span className="eqr-fb"><i style={{ width: `${w(f.nifty)}%` }} /><s style={{ left: "40%" }} /></span><b>about {signed(f.nifty)}</b></div>
      <p className="sp-cap">By size, if its own index fell 10%</p>
      {f.sizes.map((s) => <div key={s.size} className="eqr-fall sm"><div>{s.size}</div><span className="eqr-fb"><i style={{ width: `${w(s.fall)}%` }} /></span><b className="sp-red">{signed(s.fall)}</b></div>)}
      {f.rupee && <p className="eqr-rupee">{f.rupee}</p>}
      <Insights items={items} scope="eq.fall" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 6 Each share's risk
export function EachShareRisk({ r, split, shares, gold }: { r: RiskAnswer; split: ReturnType<typeof riskSplit>; shares: Share[]; gold: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set()), byS = new Map(shares.map((s) => [s.symbol, s]));
  const groups = (["Large", "Mid", "Small"] as const).map((k) => ({ k, sz: r.sizes.find((s) => s.size === k)!, xs: r.shares.filter((s) => s.size === k).sort((a, b) => (b.beta ?? -1) - (a.beta ?? -1)), risk: split.bySize[k]?.risk ?? 0 })).filter((g) => g.xs.length);
  const none = r.shares.filter((s) => !s.size);
  const all = groups.every((g) => open.has(g.k)), flip = (k: string) => { const n = new Set(open); if (n.has(k)) n.delete(k); else n.add(k); setOpen(n); };
  const yrs = (s: RiskShare) => (s.years != null && s.years < 2.95 ? ` (${s.years.toFixed(1)} yrs)` : "");
  const row = (s: RiskShare) => { const x = byS.get(s.symbol), rk = split.byShare[s.symbol]; return (
    <tr key={s.symbol}><td><Link to={`/stocks/${s.symbol}`} className="ip-sym"><CoLogo symbol={s.symbol} size={22} inline /><span><b>{s.symbol}</b><small>{s.sector ?? ""}</small></span></Link></td>
      <td>{s.beta != null ? <><b>{b2(s.beta)}</b> <Chip band={s.band} /></> : <span className="sp-nil">{s.why === "Under a year of prices" ? "Under a year" : s.why ?? "–"}</span>}</td>
      <td className="r">{s.explained != null ? `${s.explained}%` : "–"}</td>
      <td className="r">{s.swing != null ? `${s.swing.toFixed(1)}%${yrs(s)}` : "–"}</td><td className="r">{s.worstFall != null ? `${signed(s.worstFall)}${yrs(s)}` : "–"}</td>
      <td className={"r " + ((s.oneYear ?? 0) >= 0 ? "sp-good" : "sp-red")}>{signed(s.oneYear)}</td><td className="r">{x?.below52 == null ? "–" : `${x.below52.toFixed(1)}%`}</td>
      <td className={"r " + ((x?.m1 ?? 0) >= 0 ? "sp-good" : "sp-red")}>{signed(x?.m1)}</td><td className="r">{rk ? pc(rk.risk) : "–"}</td>
      {gold && <td className="r">{x?.risk == null ? <span className="sp-nil">Not scored</span> : Math.round(x.risk)}</td>}
      <td className="eq-so">{riskStandsOut(s, rk?.risk ?? null, rk?.list ?? null, x?.below52 ?? null, x?.m1 ?? null)}</td></tr>); };
  const nCols = gold ? 11 : 10;
  return (
    <Section id="eq-each" hide title="Each share's risk" help="Each share's risk. Each share against its own size index over the past year (beta, and how much of its moves the index explains), its typical swing and worst fall over 3 years, its last year, how far below its 1-year high it is, its last month, and its share of the list's risk."
      sub="Grouped by company size, each against its own benchmark. Highest beta first inside each group."
      right={<span className="eqr-oc"><button type="button" className="eqd-link" onClick={() => setOpen(new Set(groups.map((g) => g.k)))} disabled={all}>Open all</button> <button type="button" className="eqd-link" onClick={() => setOpen(new Set())} disabled={!open.size}>Close all</button></span>}>
      <Scroll label="each share's risk"><table className="sp-tb eqr-each kit-grid"><thead><tr><th scope="col">Share</th><th scope="col">Beta against its benchmark<Tip text="Beta against its benchmark. The share against the index of companies its size, past year of weekly closes, with its reading." /></th>
        <th scope="col" className="r">Explained by benchmark<Tip text="Explained by benchmark. How much of the share's weekly moves its size index explains (R²); the rest is the share's own news." /></th>
        <th scope="col" className="r">Swing a year, 3 yrs</th><th scope="col" className="r">Worst fall, 3 yrs</th><th scope="col" className="r">1 year</th><th scope="col" className="r">Below 1-yr high</th><th scope="col" className="r">1 month</th><th scope="col" className="r">Share of risk</th>
        {gold && <th scope="col" className="r">Prism Risk<Tip text="FinLit Prism's Risk part, 0 to 100: higher means lower risk on the business's own figures." /></th>}<th scope="col">What stands out</th></tr></thead>
        {groups.map((g) => <tbody key={g.k}><tr className="eqr-g"><td colSpan={nCols}><button type="button" aria-expanded={open.has(g.k)} onClick={() => flip(g.k)}><span aria-hidden="true">{open.has(g.k) ? "▾" : "▸"}</span> <b>{g.k} companies</b> · {g.xs.length} {g.xs.length === 1 ? "share" : "shares"} · against {g.sz.benchmark} · average beta {b2(g.sz.avgBeta)}{g.sz.band ? `, ${g.sz.band.word.toLowerCase()}` : ""} · {Math.round(g.risk)}% of the risk · {open.has(g.k) ? "Hide" : "Show"}</button></td></tr>
          {open.has(g.k) && g.xs.map(row)}</tbody>)}
        {none.length > 0 && <tbody><tr className="eqr-g"><td colSpan={nCols}><b>No size band yet</b> · {none.map((s) => s.symbol).join(", ")}: no benchmark to compare with.</td></tr></tbody>}
      </table></Scroll>
      <p className="sp-note">"What stands out" describes the figures; it is not advice. Swing and worst fall are over 3 years (fewer when a share has less, shown in brackets); betas, 1 year and share of risk are over the past year.</p>
    </Section>
  );
}
