// Task #183 W8: the Equity portfolio's Risk analytics tab as the 15 Nov pack draws it (01-equity-portfolio, E72–E85): Risk at a glance, How your list's beta is
// built (with Reading a beta), Each size against its own benchmark, Share of the list vs share of the risk, If the market fell 10%, Each share's risk. Betas are
// against each share's own size index from index closes (POST /api/portfolio/risk). Every class is eqr-. Never advice.
// Task #385 phase 2 (developer file 33, Risk view): beta is said in plain words ("1.29× as much as its markets"), every table sorts, each figure says what it
// is measured against; the list is read by what you hold now with Equal amounts as a switch (open item 7); the shares and the index are measured the same
// way (open item 1); the shared Key figures replace the old answers; each size gets an Overall reading; each share's risk fits a laptop, in column groups,
// with a group row per size; tables keep their first column on a phone; folded sections on a phone carry their own summary line. Words: risk385.ts.
import { BENCHMARKS } from "../useScore";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { placeLabels, type ScaleLayout } from "./betaLabels";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiSend, type ApiError, busyRetry } from "../../lib/api";
import { CoLogo } from "../../components/CoLogo";
import { Section } from "../../components/sectors/pack/Common";
import { Insights } from "./EquityPack";
import { MarketFall } from "./MarketFall";
import { RANGE_EDGES, compareOf, glanceTiles, rangeCards, type RangeKey, type RiskAnswer, type RiskShare } from "../../lib/eqRisk";
import type { Share } from "../../lib/equityPack";
import type { PageObject } from "../types";
import { Step } from "./EqSteps385";
import { CAP_DEFAULT, FrozenTable, Info, KeyFigures, ShowAll, SortHead, capRows, countOf, signedNum, sortRows, times, useSort, MINUS, type SortCol } from "../shared";
import { OVERALL_RANK, RANGE_RANK, SIZE_C, SIZE_ORDER, basisWords, buildNotes, cardLine, coverageLine, foldLines, glanceLede, glanceNotes, measureLine, overallOf, pickBasis, rangeWord, riskKeyFigs, type Basis } from "./risk385";
import "./risk-pack.css";
import "./risk385.css";
import { coTitle, subLine, titleOf } from "../../lib/companyLabel";

/** The risk answer for the saved list (Silver and Gold). `qty`: each share's quantity in the same order (null where none); with one for every share the answer
 *  also carries the figures by what is held now (task #385, open item 7). */
export function usePortfolioRisk(symbols: string[], enabled: boolean, qty?: (number | null)[]) {
  const key = [...symbols].sort().join(","), q = qty && qty.some((x) => x) ? qty : undefined;
  return useQuery<RiskAnswer, ApiError>({ queryKey: ["portfolio-risk", key, q ? symbols.map((s, i) => `${s}:${q[i] ?? ""}`).join(",") : ""], queryFn: () => apiSend<RiskAnswer>("POST", "/api/portfolio/risk", q ? { symbols, qty: q } : { symbols }),
    enabled: enabled && symbols.length > 0, ...busyRetry, staleTime: 300_000 });
}
const pc = (v: number) => `${signedNum(v)}%`;   // a share of the ups and downs can be below zero (a share that steadies the list): real minus, never −0.0%
const MAX = 2.5, at = (b: number) => `${(Math.max(0, Math.min(MAX, b)) / MAX) * 100}%`;
const Chip = ({ band }: { band: RiskShare["band"] }) => (band ? <span className={"eqr-chip r-" + band.key}><i aria-hidden="true" />{rangeWord(band)}</span> : null);
const SIZE_LETTER: Record<string, string> = { Large: "L", Mid: "M", Small: "S", Micro: "X" };
const ident = (s: string) => s;

type Part = { list: number; risk: number; n: number };
/** Each share's part of the list and of the list's ups and downs (they add to 100%), by size, by macro sector and by share. Task #385: from the risk answer
 *  itself (each share's listShare and riskShare, by what is held now or in equal amounts); an answer without them falls back to the page answer's. */
export function riskSplit(page: PageObject | null, r: RiskAnswer, sectorOf: (s: string) => string) {
  const own = r.shares.some((x) => x.riskShare != null);
  const w: Record<string, number> = own ? Object.fromEntries(r.shares.filter((x) => x.listShare != null).map((x) => [x.symbol, x.listShare as number])) : page?.share_weight.eq ?? {};
  const k: Record<string, number> = own ? Object.fromEntries(r.shares.filter((x) => x.riskShare != null).map((x) => [x.symbol, x.riskShare as number])) : page?.share_risk.eq ?? {};
  const sz = new Map(r.shares.map((x) => [x.symbol, x.size]));
  const group = (of: (s: string) => string | null) => { const out: Record<string, Part> = {};
    for (const s of Object.keys(k)) { const g = of(s) ?? "No size band"; const x = (out[g] ??= { list: 0, risk: 0, n: 0 }); x.list += w[s] ?? 0; x.risk += k[s] ?? 0; x.n++; } return out; };
  return { bySize: group((s) => sz.get(s) ?? null), bySector: group(sectorOf), byShare: Object.fromEntries(Object.keys(k).map((s) => [s, { list: w[s] ?? 0, risk: k[s] ?? 0, n: 1 }])) as Record<string, Part> };
}
export type Split = ReturnType<typeof riskSplit>;
export type CardRisk = { beta: number; swing: number; worstFall?: number | null; byValue: boolean } | null;

// ------------------------------------------------------------------------------------------------ the whole Risk view (task #385)
/** The Risk view: the weighting switch, then each section as a step (one at a time, or all; on a phone, folded with its summary line). */
export function RiskView({ answer, page, sectorOf, shares, gold, compare, value, card, nameOf = ident }: { answer: RiskAnswer; page: PageObject | null; sectorOf: (s: string) => string; shares: Share[]; gold: boolean;
  compare?: { value: string; onChange: (v: string) => void }; value: { now: number; name?: string } | null; card: CardRisk; nameOf?: (s: string) => string }) {
  const [want, setWant] = useState<Basis>("value");
  const { r, basis } = pickBasis(answer, want);
  const split = useMemo(() => riskSplit(page, r, sectorOf), [page, r, sectorOf]);
  const lines = foldLines(r, split.bySize, nameOf);
  const noQty = answer.noQuantity ?? [];
  return <>
    <div className="eqr-basis" role="group" aria-label="How the list is weighted">
      <span className="k">Count each share</span>
      <div className="eqd-seg">{(["value", "equal"] as const).map((b) => <button key={b} type="button" aria-pressed={basis === b} disabled={b === "value" && !answer.byValue} onClick={() => setWant(b)}>{b === "value" ? "By what you hold now" : "Equal amounts"}</button>)}</div>
      <Info about="How the list is weighted" text="By what you hold now: each share counts by its value today (quantity × last close), as the Risk card does. Equal amounts: every share counts the same, whatever the amounts." how="Every figure in this view follows the switch: how much the list moves, its swing and worst fall, the risk split and a 10% fall." />
      {!answer.byValue && <span className="n">{noQty.length ? `${countOf(noQty.length, "share")} without a quantity (${noQty.slice(0, 3).map(nameOf).join(", ")}${noQty.length > 3 ? " and more" : ""}), so every share counts the same.` : "Add quantities to read the list by what you hold now."}</span>}
    </div>
    {/* task #388 (change 8): Key figures sits in step 1, after Risk at a glance; no step of its own */}
    <Step id="eq-rg" title="Risk at a glance" line={lines.glance}><RiskGlancePack r={r} split={split} compare={compare} basis={basis} card={card} nameOf={nameOf} />
      <KeyFigures id="eq-keysr" sub={`Where the list's risk sits, in three answers, ${basisWords(basis)}.`} cards={riskKeyFigs(r, split.bySize, nameOf, basis)} about="Key figures, Risk" /></Step>
    <Step id="eq-build" title="How your list's beta is built" line={lines.build}><BetaBuild r={r} basis={basis} nameOf={nameOf} /></Step>
    <Step id="eq-sizeb" title="Each size against its own benchmark" line={lines.sizeb}><SizeBench r={r} basis={basis} /></Step>
    <Step id="eq-mr" title="Share of the list vs share of the risk" line={lines.mr}><RiskShareSection r={r} split={split} basis={basis} nameOf={nameOf} /></Step>
    <Step id="eq-fall" title="If the market fell 10%" line={lines.fall}><Fall10 r={r} value={value} basis={basis} /></Step>
    <Step id="eq-each" title="Each share's risk" line={lines.each}><EachShareRisk r={r} split={split} shares={shares} gold={gold} basis={basis} /></Step>
  </>;
}

// ------------------------------------------------------------------------------------------------ 1 Risk at a glance
/** compare (task #235, pack B5): "Compare with [NIFTY 50 ▾]", the index the four boxes are set beside. */
export function RiskGlancePack({ r, split, compare, basis = "equal", card = null, nameOf = ident }: { r: RiskAnswer; split: Split; compare?: { value: string; onChange: (v: string) => void }; basis?: Basis; card?: CardRisk; nameOf?: (s: string) => string }) {
  const c = compareOf(r, compare?.value), lede = glanceLede(r, { name: c.name, swing: c.idx.swing }), tiles = glanceTiles(r, compare?.value);
  const cover = coverageLine(r, nameOf), tie = cardLine(basis, card);
  const boxes = tiles.map((t, i) => i < 3 ? { ...t, k: t.k.replace(/ · .*$/, ""), when: t.k.replace(/^.* · /, "") }
    : { ...t, k: "Moves with its markets", when: "past year", v: times(r.betas.weighted), nifty: times(c.beta), niftyWord: `alternate, against the ${c.name} alone`,
      sub: r.betas.weighted == null ? "Not enough prices." : `${rangeWord(r.betas.weightedBand)}: each share against its own size index, the headline figure.`,
      help: `How much the list moves when its markets move: each share against the index of companies its size (Nifty 50, Midcap 150, Smallcap 250, Microcap 250), past year of weekly closes, ${basisWords(basis)}. Beside it, the alternate: the whole list against the ${c.name} alone.`,
      how: "1.00× moves as much as its markets; above, more; below, less." });
  return (
    <Section id="eq-rg" hide title="Risk at a glance" right={compare && <label className="eq-cmp">Compare with<select value={compare.value} onChange={(e) => compare.onChange(e.target.value)}>{BENCHMARKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
      help={`Four figures, ${basisWords(basis)}, each beside the ${c.name}'s (pick another index in Compare with): the typical swing and the worst fall over 3 years and the 10 worst weeks of the past year, all from weekly closes for the list and the index alike, and how much the list moves with its own markets.`} how="The line under each figure says whether the list has been bumpier or smoother than the index.">
      <p className="eqr-lede"><b>{lede.lead}</b> {lede.rest}</p>
      <div className="eqr-tiles">{boxes.map((t) => <div key={t.k} className="eqr-tile"><p className="sp-cap">{t.k} <span className="w">· {t.when}</span><Info about={t.k} text={t.help} how={t.how} /></p><p className="eqr-v"><b>{t.v}</b><small>{t.niftyWord ?? "Nifty 50"}: {t.nifty}</small></p><p className="eqr-sub">{t.sub}</p></div>)}</div>
      <p className="eqr-meas">{measureLine(r, basis, c.name)}</p>
      {tie && <p className="eqr-tie">{tie}</p>}
      {cover && <p className="eqr-cover" role="note">{cover}</p>}
      {r.missingIndex.length > 0 && <p className="sp-note">Index closes not available right now for {r.missingIndex.join(", ")}: shares of that size have no figure until they are back.</p>}
      <Insights items={glanceNotes(r, split.bySize, nameOf)} scope="eq.rg" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2 How your list's beta is built + Reading a beta
// task #388 (file 36, change 10): "How it is worked out" and its five steps go; "By size" and the i texts cover them.
const BAR = SIZE_C;   // task #385: the same size colours as Key figures
export const RANGE_SHOW = 3;   // task #388 (file 36, change 10): each range box has room for 3 shares; the rest sit behind "+N more"
export function BetaBuild({ r, basis = "equal", nameOf = ident }: { r: RiskAnswer; basis?: Basis; nameOf?: (s: string) => string }) {
  const [tab, setTab] = useState<"size" | "where" | "three">("size"), [f, setF] = useState<"All" | "Large" | "Mid" | "Small" | "Micro">("All"), [pin, setPin] = useState<string | null>(null);
  const sizes = r.sizes.filter((s) => s.n), w = r.betas.weighted;
  const shown = r.shares.filter((s) => s.beta != null && (f === "All" || s.size === f)), beta = f === "All" ? w : r.sizes.find((s) => s.size === f)?.avgBeta ?? null;
  const ranges = rangeCards(shown), picked = pin ? r.shares.find((s) => s.symbol === pin) : null;
  const pins: Pin[] = [...(f === "All" && w != null ? [{ k: "Your list", short: "Your list", b: w, band: r.betas.weightedBand, list: true }] : []),
    ...sizes.filter((s) => (f === "All" || s.size === f) && s.avgBeta != null).map((s) => ({ k: `${s.size} companies`, short: s.size, b: s.avgBeta as number, band: s.band })),
    ...(picked?.beta != null ? [{ k: nameOf(picked.symbol), short: nameOf(picked.symbol), b: picked.beta, band: picked.band, pick: true }] : [])];
  const TABS: [typeof tab, string, string][] = [["size", "By size", "Each size against its own index"], ["where", "Where your shares sit", "The six ranges, share by share"], ["three", "Three ways to measure", "By size index, blended, Nifty 50"]];
  const hi = shown.filter((s) => (s.beta as number) >= 1.35).length, lo = shown.filter((s) => (s.beta as number) < 0.9).length;
  return (
    <Section id="eq-build" hide title="How your list's beta is built" help={`Each share is measured against the index of companies its own size (Nifty 50, Midcap 150, Smallcap 250, Microcap 250) over the past year of weekly closes; the sizes are then combined by their share of the list, ${basisWords(basis)}.`} how="Each size adds its part; the parts add up to how much the whole list moves with its markets."
      sub={`Each share against the index of companies its own size, then the sizes combined by their share of the list, ${basisWords(basis)}.`}>
      <div className="eqb-sum">
        <div><p className="sp-cap">Moves with its markets</p><p className="eqb-big"><b>{times(w)}</b><Chip band={r.betas.weightedBand} /></p>
          <p className="eqb-x">{w == null ? "Not enough prices for a reading yet." : `As much as its markets: the list has moved about ${(w * 10).toFixed(1)}% when they moved 10%. Each share is measured against its own size index.`}</p></div>
        <div className="eqb-mix"><p className="sp-cap">What adds up to {times(w)}</p>
          <div className="eqr-stack" role="img" aria-label={`What each size adds: ${sizes.map((s) => `${s.size} ${s.adds?.toFixed(2) ?? MINUS}`).join(", ")}`}>{sizes.map((s) => <i key={s.size} style={{ flexGrow: Math.max(0.01, s.adds ?? 0) / Math.max(0.01, w ?? 1), background: BAR[s.size] }}>{s.size} {s.adds?.toFixed(2) ?? MINUS}</i>)}</div>
          <ul className="eqb-leg">{sizes.map((s) => <li key={s.size}><b>{s.size}</b> moves {times(s.avgBeta)}, on {Math.round(s.listShare)}% of the list: adds <b>{s.adds?.toFixed(2) ?? MINUS}</b></li>)}</ul></div>
      </div>
      {/* audit of 26 Nov (file 38, Part D): the caption sits inside the tab bar, so the bar is 18 px under the boxes above (was 37 with the caption between) */}
      <div className="xtabs eqb-tabs3" role="tablist" aria-label="How your list's beta is built"><p className="x2-k" aria-hidden="true">How it is built <small>{TABS.length} ways to look · tap one</small></p>{TABS.map(([k, t, x], i) => (
        <button key={k} type="button" role="tab" id={"eqb-t-" + k} aria-selected={tab === k} aria-controls={"eqb-p-" + k} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}
          onKeyDown={(e) => { const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null; if (n == null) return; e.preventDefault(); const to = TABS[(n + TABS.length) % TABS.length][0]; setTab(to); setTimeout(() => document.getElementById("eqb-t-" + to)?.focus(), 0); }}>
          <span className="xn" aria-hidden="true">{i + 1}</span><b>{t}</b><small>{x}</small></button>))}</div>
      <div className="eqb-p" role="tabpanel" id={"eqb-p-" + tab} aria-labelledby={"eqb-t-" + tab}>
      {tab === "size" && <div className="eqr-cards">{sizes.map((s) => { const xs = r.shares.filter((x) => x.size === s.size && x.beta != null); return (
        <div key={s.size} className="eqr-card"><p className="sp-cap">{s.size} companies · {s.n}</p><p className="eqr-mute">against {s.benchmark}</p>
          <div className="eqr-strip" role="img" aria-label={`How much each of the ${s.size.toLowerCase()} companies moves with the ${s.benchmark}: ${xs.map((x) => `${nameOf(x.symbol)} ${times(x.beta)}`).join(", ")}`}>{xs.map((x) => <i key={x.symbol} style={{ left: at(x.beta as number) }} title={`${nameOf(x.symbol)} ${times(x.beta)}`} />)}{s.avgBeta != null && <b style={{ left: at(s.avgBeta) }} />}<span style={{ left: at(1) }} /></div>
          <p className="eqr-axis"><span>0</span><span style={{ left: at(1) }}>1.0×</span><span>2.5×</span></p>
          <dl><div><dt>Moves, on average</dt><dd>{times(s.avgBeta)}</dd></div><div className="c"><Chip band={s.band} /></div><div><dt>Share of the list</dt><dd>× {Math.round(s.listShare)}%</dd></div><div><dt>Adds to the list's figure</dt><dd><b>{s.adds?.toFixed(2) ?? MINUS}</b></dd></div></dl></div>); })}
        <div className="eqr-card eqr-sum"><p className="sp-cap">Your list</p><p className="eqr-mute">by size index</p><p className="eqr-big">{times(w)}</p><Chip band={r.betas.weightedBand} /><p className="eqr-mute">{sizes.map((s) => s.adds?.toFixed(2) ?? MINUS).join(" + ")}</p></div>
      </div>}
      {tab === "where" && <div className="eqr-read" id="eq-read">
        <div className="eqr-read-h"><div><h3 className="eqr-h3">Reading how much a share moves<Info about="Reading how much a share moves" text="Where your list, each size and a tapped share sit on the six ranges, each share against its own size index." how="1.00× moves as much as its index. 1.5× has moved about 15% when its index moved 10%; 0.5× about 5%." /></h3><p className="sp-note">1.00× moves as much as its index. 1.5× has moved about 15% when its index moved 10%; 0.5× about 5%.</p></div>
          <div className="eqd-seg" role="group" aria-label="Which shares">{(["All", "Large", "Mid", "Small", "Micro"] as const).map((k) => <button key={k} type="button" aria-pressed={f === k} onClick={() => { setF(k); setPin(null); }}>{k === "All" ? `All ${r.counted}` : k}</button>)}</div></div>
        <div className="eqr-f4">{[{ v: times(beta), k: f === "All" ? "how much your list moves with its markets" : `how much ${f.toLowerCase()} companies move, on average` },
          { v: beta == null ? MINUS : `about ${(beta * 10).toFixed(1)}%`, k: "its usual move when its markets move 10%" }, { v: `${hi} of ${shown.length}`, k: "shares in the High or Very high range" },
          { v: `${lo} of ${shown.length}`, k: "shares that move less than their market" }].map((x) => <div key={x.k}><b>{x.v}</b><small>{x.k}</small></div>)}</div>
        <BetaScale pins={pins} />
        <p className="sp-cap">How your {countOf(shown.length, "share")} spread across the ranges</p>
        <div className="eqr-spread">{ranges.filter((x) => x.who.length).map((x) => <span key={x.key} className={"r-" + x.key} style={{ flexGrow: x.who.length }}><b>{x.who.length}</b><small>{rangeWord({ key: x.key, word: x.key })}</small></span>)}</div>
        <p className="eqr-hint">{picked ? <>{nameOf(picked.symbol)}: {times(picked.beta)} as much as the {picked.benchmark}, {rangeWord(picked.band).toLowerCase()}; {picked.explained}% of its weekly moves explained by that index. <button type="button" className="eqd-link" onClick={() => setPin(null)}>Clear</button></> : "Tap a share's name below to place it on the scale and see its details."}</p>
        <RangeBoxes ranges={ranges} pin={pin} onPin={setPin} nameOf={nameOf} />
      </div>}
      {tab === "three" && <div className="eqr-b3">
        <div className="eqr-tile"><p className="sp-cap">Each share against its own size index<Info about="Each share against its own size index" text="Each share against the index of companies its size; each size's average times its share of the list. This is the headline figure everywhere on this view." how="1.00× moves as much as its own markets; above, more; below, less." /></p><p className="eqr-v"><b>{times(r.betas.weighted)}</b><Chip band={r.betas.weightedBand} /></p><p className="eqr-sub"><span className="eqr-tag">Headline figure</span> The figure in Key figures, the folded line and If the market fell.</p></div>
        <div className="eqr-tile"><p className="sp-cap">Against a blended benchmark<Info about="Against a blended benchmark" text="The whole list against the size indices mixed in the list's own proportions." how="It checks the headline figure: close to it, the two agree." /></p><p className="eqr-v"><b>{times(r.betas.blended)}</b><Chip band={r.betas.blendedBand} /></p><p className="eqr-sub"><span className="eqr-tag">Alternate</span> {sizes.map((s) => `${Math.round(s.listShare)}% ${s.benchmark}`).join(" + ")}. {r.betas.blended != null && r.betas.weighted != null && Math.abs(r.betas.blended - r.betas.weighted) <= 0.1 ? "Close to the headline figure, which checks it." : "It checks the headline figure."}</p></div>
        <div className="eqr-tile"><p className="sp-cap">Against the Nifty 50 alone<Info about="Against the Nifty 50 alone" text="The whole list against the Nifty 50 only, the measure the Risk card on top uses." how="The figure for what a Nifty 50 fall has meant. Mid, small and micro companies move less in step with it." /></p><p className="eqr-v"><b>{times(r.betas.nifty)}</b><Chip band={r.betas.niftyBand} /></p><p className="eqr-sub"><span className="eqr-tag">Alternate</span> The Risk card's measure, for "what if the Nifty 50 falls". Mid, small and micro companies move less in step with it.</p></div>
      </div>}
      </div>
      <Insights items={buildNotes(r, basis)} scope="eq.beta" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ the beta scale and the range boxes (task #388, file 36, change 10)
export type Pin = { k: string; short: string; b: number; band: RiskShare["band"]; list?: boolean; pick?: boolean };
/** The six ranges with a label for each figure on the scale itself ("1.29× Your list"): one row with curved lines on a laptop, stepped rows with straight
 *  lines on a phone (betaLabels.ts). A band name that does not fit inside its band is hidden (the colour stays; the range boxes name every range). */
export function BetaScale({ pins, fmt = times }: { pins: Pin[]; /** a figure's text on its label: "1.29×" (default); the MF page (task #389, file 32) writes "0.84" */ fmt?: (b: number) => string }) {
  const box = useRef<HTMLDivElement>(null), labs = useRef<Record<string, HTMLSpanElement | null>>({}), bands = useRef<HTMLDivElement>(null);
  const [L, setL] = useState<ScaleLayout | null>(null), [tight, setTight] = useState<Set<string>>(new Set());
  const sig = pins.map((p) => `${p.k}:${p.b}`).join("|");
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => { const w = el.clientWidth || 600;
      setL(placeLabels(pins.map((p) => ({ key: p.k, x: (Math.max(0, Math.min(MAX, p.b)) / MAX) * w, w: labs.current[p.k]?.offsetWidth || 24 + 8 * (fmt(p.b).length + p.short.length) })), w));
      const hide = new Set<string>(); bands.current?.querySelectorAll<HTMLElement>("span[data-k]").forEach((b) => { if (b.scrollWidth > b.clientWidth + 1) hide.add(b.dataset.k!); });
      setTight((t) => (t.size === hide.size && [...hide].every((k) => t.has(k)) ? t : hide)); };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [sig]);   // eslint-disable-line react-hooks/exhaustive-deps
  const at2 = (k: string) => L?.labels.find((x) => x.key === k);
  return <div className="eqr-scale eqb-scale">
    <div className={"eqb-labs" + (L ? " " + L.mode : "")} ref={box} style={{ height: L ? `${L.height}px` : undefined }}>
      {pins.map((p) => { const q = at2(p.k); return <span key={p.k} ref={(n) => { labs.current[p.k] = n; }} className={"eqb-lab" + (p.list ? " list" : "") + (p.pick ? " pick" : "")}
        style={q ? { left: `${q.left}px`, top: `${q.top}px` } : { visibility: "hidden" }} title={`${p.k} ${fmt(p.b)}${p.band ? ` · ${rangeWord(p.band)}` : ""}`}><b>{fmt(p.b)}</b>{p.short}</span>; })}
      {L && <svg className="eqb-lnk" width="100%" height={L.height} aria-hidden="true">{L.lines.map((ln) => { const p = pins.find((x) => x.k === ln.key); const c = p?.list ? "list" : undefined;
        return <g key={ln.key}><path d={ln.d} className={c} /><circle cx={ln.x2} cy={ln.y2 - 4} r={4} className={c} /></g>; })}</svg>}
    </div>
    <div className="eqr-bands" ref={bands}>{RANGE_EDGES.map(([k, lo2, hi2]) => <span key={k} data-k={k} className={"r-" + k + (tight.has(k) ? " eqb-tight" : "")} style={{ width: `${((hi2 - lo2) / MAX) * 100}%` }} title={rangeWord({ key: k, word: k })}>{rangeWord({ key: k, word: k })}</span>)}</div>
    <p className="eqr-ticks">{[0, 0.65, 0.9, 1.1, 1.35, 1.75, 2.5].map((t) => <span key={t} style={{ left: at(t) }}>{t}</span>)}</p></div>;
}

type Range = ReturnType<typeof rangeCards>[number];
const rangeOf = (x: Range) => (x.key === "less" ? `below ${x.hi}×` : x.key === "very_high" ? `above ${x.lo}×` : `${x.lo.toFixed(2)}× – ${x.hi.toFixed(2)}×`);
/** Six boxes of one size whatever their counts: chip, range, "N shares · x%", room for 3 shares (highest figure first), then one line for "+N more", which
 *  opens every share of that range in a pop-up (× , Esc or a tap outside closes it; tapping a name places it on the scale). An empty range says so. */
export function RangeBoxes({ ranges, pin, onPin, nameOf }: { ranges: Range[]; pin: string | null; onPin: (s: string) => void; nameOf: (s: string) => string }) {
  const [pop, setPop] = useState<string | null>(null);
  const item = (s: RiskShare, close = false) => <li key={s.symbol}><button type="button" className="eqr-nm" aria-pressed={pin === s.symbol} title={nameOf(s.symbol)} onClick={() => { onPin(s.symbol); if (close) setPop(null); }}>
    <i className={"z-" + (SIZE_LETTER[s.size ?? ""] ?? "U")}>{SIZE_LETTER[s.size ?? ""] ?? MINUS}</i><span>{nameOf(s.symbol)}</span></button><b>{times(s.beta)}</b></li>;
  return <div className="eqr-ranges eqb-ranges">{ranges.map((x) => { const head = `${rangeWord({ key: x.key as RangeKey, word: x.key })} · ${countOf(x.who.length, "share")} · ${Math.round(x.pct)}%`;
    return <div key={x.key} className={"eqr-range r-" + x.key}><Chip band={{ key: x.key as RangeKey, word: x.key }} />
      <p className="eqr-mute">{rangeOf(x)}</p>
      <p className="eqr-n"><b>{x.who.length}</b> {x.who.length === 1 ? "share" : "shares"} · {Math.round(x.pct)}%</p>
      <ul id={"eqr-rg-" + x.key}>{x.who.length ? x.who.slice(0, RANGE_SHOW).map((s) => item(s)) : <li className="eqb-none">None of your shares</li>}</ul>
      <div className="eqb-foot">{x.who.length > RANGE_SHOW && <span className="eqb-mw"><button type="button" className="eqb-more" aria-haspopup="dialog" aria-expanded={pop === x.key} onClick={() => setPop(pop === x.key ? null : x.key)}>+{x.who.length - RANGE_SHOW} more</button>
        {pop === x.key && <Popup title={head} onClose={() => setPop(null)}><ul className="eqb-popl">{x.who.map((s) => item(s, true))}</ul></Popup>}</span>}</div>
    </div>; })}</div>;
}
/** A small pop-up under its button: title, ×; Esc or a tap outside closes it. */
export function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const me = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const out = (e: MouseEvent) => { const t = e.target as Node; if (me.current && !me.current.contains(t) && !me.current.parentElement?.contains(t)) onClose(); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", out);
    me.current?.querySelector<HTMLElement>(".eqb-popx")?.focus();
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", out); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="eqb-pop" role="dialog" aria-label={title} ref={me}><p className="eqb-poph"><b>{title}</b><button type="button" className="eqb-popx" aria-label="Close" onClick={onClose}>×</button></p>{children}</div>;
}

// ------------------------------------------------------------------------------------------------ 3 Each size against its own benchmark
type SizeRow = RiskAnswer["sizes"][number];
const SB_COLS: Record<string, SortCol<SizeRow>> = { size: { kind: { rank: SIZE_ORDER }, get: (s) => s.size }, bench: { kind: "text", get: (s) => s.benchmark }, yr: { kind: "num", get: (s) => s.oneYear },
  dn: { kind: "num", get: (s) => s.downPer100 }, up: { kind: "num", get: (s) => s.upPer100 }, all: { kind: { rank: OVERALL_RANK }, get: (s) => overallOf(s.downPer100, s.upPer100)?.word } };
export function SizeBench({ r, basis = "equal" }: { r: RiskAnswer; basis?: Basis }) {
  const rows = useMemo(() => r.sizes.filter((s) => s.n), [r]), sort = useSort(rows, SB_COLS);
  return (
    <Section id="eq-sizeb" hide title="Each size against its own benchmark" help={`Your shares of each size, ${basisWords(basis)}, against the index of companies that size, over the past year of weekly closes.`} how="Per 100 in down weeks: below 100 fell less than the index. Per 100 in up weeks: above 100 rose more. Overall reads the two together."
      sub={`Your shares of each size, ${basisWords(basis)}, against the index of companies that size. Past year, weekly closes.`}>
      <FrozenTable label="each size against its own benchmark"><table className="sp-tb eqr-sb kit-grid"><thead><tr><SortHead id="size" label="Size" sort={sort} /><SortHead id="bench" label="Benchmark" sort={sort} />
        <SortHead id="yr" label="1 year" num sort={sort} extra={<Info about="1 year, each size" text="The past year's price change of your shares of that size (Yours) beside the change of their index (Index)." />} />
        <SortHead id="dn" label="In down weeks" num sort={sort} extra={<Info about="In down weeks" text="How much your shares of that size fell for every 100 their index fell, in the weeks of the past year when the index fell." />} />
        <SortHead id="up" label="In up weeks" num sort={sort} extra={<Info about="In up weeks" text="How much your shares of that size rose for every 100 their index rose, in the weeks of the past year when the index rose." />} />
        <SortHead id="all" label="Overall" sort={sort} extra={<Info about="Overall, each size" text="The down-week and up-week figures read together: rises more, falls less; rises less, falls more; or moves more or less both ways." />} /></tr></thead>
        <tbody>{sort.sorted.map((s) => { const o = overallOf(s.downPer100, s.upPer100); return <tr key={s.size}><th scope="row"><b>{s.size}</b><small>· {countOf(s.n, "share")}</small></th><td>{s.benchmark}</td>
          <td className="r"><b><span className="ix">Yours </span><span className={(s.oneYear ?? 0) >= 0 ? "sp-good" : "sp-red"}>{signedNum(s.oneYear) === MINUS ? MINUS : `${(s.oneYear ?? 0) > 0 ? "+" : ""}${signedNum(s.oneYear)}%`}</span></b><small><span className="ix">Index </span>{s.benchOneYear == null ? MINUS : `${s.benchOneYear > 0 ? "+" : ""}${signedNum(s.benchOneYear)}%`}</small></td>
          <td className="r"><b>{s.downPer100 ?? MINUS}</b><small>per 100</small></td><td className="r"><b>{s.upPer100 ?? MINUS}</b><small>per 100</small></td>
          <td>{o ? <span className={"eqr-ov " + o.tone}>{o.word}</span> : <span className="sp-nil">Not enough weeks</span>}</td></tr>; })}</tbody></table></FrozenTable>
      <p className="sp-note">“In down weeks”: how much your shares fell for every 100 the index fell. “In up weeks”: how much they rose for every 100 it rose. Below 100 in down weeks with above 100 in up weeks means the shares fell less and rose more than their index.</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 4 Share of the list vs share of the risk
type RsRow = { k: string; list: number; risk: number; s?: RiskShare };
const RS_COLS: Record<string, SortCol<RsRow>> = { name: { kind: "text", get: (x) => x.k }, beta: { kind: "num", get: (x) => x.s?.beta }, reading: { kind: { rank: RANGE_RANK }, get: (x) => (x.s?.band ? rangeWord(x.s.band) : null) },
  list: { kind: "num", get: (x) => x.list }, risk: { kind: "num", get: (x) => x.risk } };
export function RiskShareSection({ r, split, basis = "equal", nameOf = ident }: { r: RiskAnswer; split: Split; basis?: Basis; nameOf?: (s: string) => string }) {
  const [by, setBy] = useState<"size" | "sector" | "share">("size"), [open, setOpen] = useState(false);
  const bySym = useMemo(() => new Map(r.shares.map((s) => [s.symbol, s])), [r]);
  const rows = useMemo<RsRow[]>(() => Object.entries(by === "size" ? split.bySize : by === "sector" ? split.bySector : split.byShare).map(([k, x]) => ({ k: by === "size" ? `${k} companies` : by === "share" ? nameOf(k) : k, list: x.list, risk: x.risk, s: by === "share" ? bySym.get(k) : undefined })), [by, split, bySym, nameOf]);
  const sort = useSort(rows, RS_COLS, { initial: { id: "risk", dir: -1 } });
  const c = capRows(sort.sorted, CAP_DEFAULT, open || by === "size");
  const max = Math.max(1, ...rows.flatMap((x) => [x.list, x.risk]));
  const noun = by === "sector" ? "macro sector" : "share";
  return (
    <Section id="eq-mr" hide title="Share of the list vs share of the risk" help={`Each part's share of the list (${basisWords(basis)}) beside its share of the list's ups and downs, past year of weekly closes, each share counted against the others in the list.`} how="The ups and downs add to 100%. A shaded row carries more of them than of the list.">
      <div className="eqd-tools eqr-rs-tools"><div className="eqd-seg" role="group" aria-label="Split by">{(["size", "sector", "share"] as const).map((k) => <button key={k} type="button" aria-pressed={by === k} onClick={() => { setBy(k); setOpen(false); }}>By {k}</button>)}</div>
        <p className="eqr-key" aria-hidden="true"><span><i className="l" />Share of the list</span><span><i className="k" />Share of the ups and downs</span><span><i className="m" />Carries more than its share</span></p></div>
      <FrozenTable label="share of the list and of the risk"><table className="sp-tb eqr-rs" id="eqr-rs-t"><thead><tr><SortHead id="name" label={by === "size" ? "Size" : by === "sector" ? "Macro sector" : "Share"} sort={sort} /><th scope="col"><span className="sr-only">Bars</span></th>
        {by === "share" && <><SortHead id="beta" label="Moves with its index" num sort={sort} extra={<Info about="Moves with its index, by share" text="How much the share moves when the index of companies its size moves, past year of weekly closes." />} /><SortHead id="reading" label="Range" sort={sort} /></>}
        <SortHead id="list" label="List" num sort={sort} extra={<Info about="List, share of the list" text={`The part's share of the list, ${basisWords(basis)}, among the shares counted here.`} />} />
        <SortHead id="risk" label="Ups and downs" num sort={sort} extra={<Info about="Ups and downs, share of the risk" text="The part's share of the list's ups and downs over the past year; all parts add to 100%." />} /></tr></thead>
        <tbody>{c.shown.map((x) => <tr key={x.k} className={x.risk > x.list + 1 ? "more" : ""}><th scope="row">{by === "share" && x.s ? (() => { const t = titleOf({ symbol: x.s.symbol, name: x.k }); return <><b>{t}</b>{t !== x.k && <small>{x.k}</small>}</>; })() : x.k}</th>
          <td className="eqr-bars"><span className="l" style={{ width: `${(x.list / max) * 100}%` }} /><span className="k" style={{ width: `${(x.risk / max) * 100}%` }} /></td>
          {by === "share" && <><td className="r">{times(x.s?.beta)}</td><td>{x.s?.band ? <Chip band={x.s.band} /> : <span className="sp-nil">{x.s?.why ?? MINUS}</span>}</td></>}<td className="r">{pc(x.list)}</td><td className="r"><b>{pc(x.risk)}</b></td></tr>)}</tbody></table></FrozenTable>
      {c.capped && <ShowAll n={rows.length} noun={noun} open={open} onToggle={() => setOpen(!open)} controls="eqr-rs-t" />}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 5 If the market fell 10%
export function Fall10({ r, value, basis = "equal" }: { r: RiskAnswer; value?: { now: number; name?: string } | null; basis?: Basis }) {
  const most = [...r.sizes].filter((s) => s.n && s.adds != null).sort((a, b) => (b.adds as number) - (a.adds as number))[0];
  const items = r.betas.weighted != null && most ? [{ kind: "insight" as const, title: "What moves the list the most", text: `${most.size} companies add the most to how much the list moves (${(most.adds as number).toFixed(2)} of ${times(r.betas.weighted)}): ${r.sizes.filter((s) => s.n).map((s) => `${s.size.toLowerCase()} ${s.adds?.toFixed(2) ?? MINUS}`).join(", ")}. The more of the list a size holds, the more its own index sets the list's moves.` }] : [];
  // pack B8 v3: the worst-fall size is the Risk view's own "Worst fall" for the Nifty 50 over 3 years, served as it is
  const worst = r.glance.nifty.worstFall != null && r.glance.nifty.worstFall < 0 ? { pct: -r.glance.nifty.worstFall, line: "the Nifty 50’s worst in 3 years" } : null;
  return <MarketFall id="eq-fall" value={value ?? null} worst={worst} unit="points" list={{ label: "Your list", sub: `by size index, ${basis === "value" ? "by value now" : "equal amounts"}` }}
    scenarios={[{ label: "Every size index falls", beta: r.betas.weighted, src: `Moves ${times(r.betas.weighted)} as much as its markets: each share against its own size index`, parts: true },
      { label: "Only the Nifty 50 falls", beta: r.betas.nifty, src: `Moves ${times(r.betas.nifty)} as much as the Nifty 50 alone: the whole list against it`, parts: false }]}
    parts={r.sizes.filter((s) => s.n && s.avgBeta != null).map((s) => ({ label: s.size, beta: s.avgBeta as number, sub: `${Math.round(s.listShare)}% of the list` }))}
    after={<Insights items={items} scope="eq.fall" />} />;
}

// ------------------------------------------------------------------------------------------------ 6 Each share's risk
type EachRow = { s: RiskShare; x?: Share; rk: Part | undefined; name: string };
/** "What stands out" for one share's row: the figures only, in plain words. */
export function standsOut(s: RiskShare, risk: number | null, list: number | null, below52: number | null, m1: number | null): string {
  const x: string[] = [];
  if (s.beta != null && s.beta >= 1.75) x.push("Moves very much with its index");
  if (risk != null && list != null && risk > list * 1.5) x.push("Carries more of the ups and downs than its share of the list");
  if (s.worstFall != null && s.worstFall <= -50) x.push(`Fell ${Math.round(-s.worstFall)}% from a high`);
  if (m1 != null && m1 <= -10) x.push(`Fell ${Math.round(-m1)}% last month`);
  if (below52 != null && below52 >= 30) x.push("Far below its 1-year high");
  if (s.explained != null && s.explained < 20 && s.beta != null) x.push("Moves on its own news");
  return x.join(" · ") || "—";
}
const EACH_COLS: Record<string, SortCol<EachRow>> = { share: { kind: "text", get: (r) => r.name }, beta: { kind: "num", get: (r) => r.s.beta }, expl: { kind: "num", get: (r) => r.s.explained },
  swing: { kind: "num", get: (r) => r.s.swing }, fall: { kind: "num", get: (r) => r.s.worstFall }, yr: { kind: "num", get: (r) => r.s.oneYear }, below: { kind: "num", get: (r) => r.x?.below52 },
  m1: { kind: "num", get: (r) => r.x?.m1 }, risk: { kind: "num", get: (r) => r.rk?.risk }, prism: { kind: "num", get: (r) => r.x?.risk }, so: { kind: "text", get: (r) => { const t = standsOut(r.s, r.rk?.risk ?? null, r.rk?.list ?? null, r.x?.below52 ?? null, r.x?.m1 ?? null); return t === "—" ? null : t; } } };
const EACH_TIPS: [string, string, string, string][] = [
  ["beta", "Moves with its index", "How much the share moves when the index of companies its own size moves (Nifty 50, Midcap 150, Smallcap 250 or Microcap 250), past year of weekly closes.", "1.00× moves as much as that index, above more, below less; the tag names its range."],
  ["expl", "Explained by its index", "How much of the share's weekly moves its own size index explains, past year.", "High: the figure beside it reads the share well. Low: the share mostly follows its own news."],
  ["swing", "Swing a year", "How much the share’s price moves up and down in a typical year, from 3 years of weekly closes (fewer when a share has less, shown in brackets).", ""],
  ["fall", "Worst fall", "The largest drop from a high to a later low over the last 3 years of weekly closes.", ""],
  ["yr", "1 year", "The share's price change over the past year of weekly closes, to the same week as the other figures.", ""],
  ["below", "Below 1-yr high", "How far the price sits below its highest close of the past year.", ""],
  ["m1", "1 month", "The price change over the past month.", ""],
  ["risk", "Share of risk", "This share’s part of the list’s ups and downs over the past year. The Share of the list vs share of the risk section shows it beside its share of the list.", ""],
  ["prism", "Prism Risk", "FinLit Prism's Risk part, 0 to 100, from the business's own figures, not the price.", "Higher means lower risk on those figures."],
  ["so", "What stands out", "A short description of the figures in the row. It is not advice.", ""]];
export function EachShareRisk({ r, split, shares, gold, basis = "equal" }: { r: RiskAnswer; split: Split; shares: Share[]; gold: boolean; basis?: Basis }) {
  const [open, setOpen] = useState<Set<string>>(new Set()), [more, setMore] = useState<Set<string>>(new Set());
  const byS = useMemo(() => new Map(shares.map((s) => [s.symbol, s])), [shares]);
  const all = useMemo<EachRow[]>(() => r.shares.map((s) => { const x = byS.get(s.symbol); return { s, x, rk: split.byShare[s.symbol], name: titleOf({ symbol: s.symbol, name: x?.name }) }; }), [r, byS, split]);
  const sort = useSort(all, EACH_COLS, { initial: { id: "share", dir: 1 } });
  const groups = SIZE_ORDER.map((k) => ({ k, sz: r.sizes.find((s) => s.size === k)!, xs: sortRows(all.filter((e) => e.s.size === k), sort.state ? EACH_COLS[sort.state.id] : undefined, sort.state?.dir ?? 1), risk: split.bySize[k]?.risk ?? 0 })).filter((g) => g.xs.length && g.sz);
  const none = r.shares.filter((s) => !s.size);
  const allOpen = groups.every((g) => open.has(g.k)), flip = (set: Set<string>, put: (s: Set<string>) => void, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); put(n); };
  const yrs = (s: RiskShare) => (s.years != null && s.years < 2.95 ? ` (${s.years.toFixed(1)} yrs)` : "");
  const sgn = (v: number | null | undefined) => (v == null ? MINUS : `${Number(v.toFixed(1)) > 0 ? "+" : ""}${signedNum(v)}%`);
  const tone = (v: number | null | undefined) => (v == null || Number(v.toFixed(1)) === 0 ? "" : v > 0 ? "sp-good" : "sp-red");
  const row = ({ s, x, rk, name }: EachRow) => (
    <tr key={s.symbol} className="eqr-er"><td><Link to={`/stocks/${s.symbol}`} className="ip-sym"><CoLogo symbol={s.symbol} size={22} inline /><span><b title={coTitle({ symbol: s.symbol, name: x?.name })}>{name}</b><small>{x?.name && x.name !== name ? x.name : subLine({ symbol: s.symbol, name: x?.name }, s.sector ?? "") ?? ""}</small></span></Link></td>
      <td className="eqr-gs">{s.beta != null ? <><b>{times(s.beta)}</b> <Chip band={s.band} /></> : <span className="sp-nil">{s.why === "Under a year of prices" ? "Under a year" : s.why ?? MINUS}</span>}</td>
      <td className="r">{s.explained != null ? `${s.explained}%` : MINUS}</td>
      <td className="r eqr-gs">{s.swing != null ? `${s.swing.toFixed(1)}%${yrs(s)}` : MINUS}</td><td className="r">{s.worstFall != null ? `${signedNum(s.worstFall)}%${yrs(s)}` : MINUS}</td>
      <td className={"r eqr-gs " + tone(s.oneYear)}>{sgn(s.oneYear)}</td><td className="r">{x?.below52 == null ? MINUS : `${x.below52.toFixed(1)}%`}</td>
      <td className={"r " + tone(x?.m1)}>{sgn(x?.m1)}</td><td className="r eqr-gs">{rk ? pc(rk.risk) : MINUS}</td>
      {gold && <td className="r eqr-gs">{x?.risk == null ? <span className="sp-nil">Not scored</span> : Math.round(x.risk)}</td>}
      <td className="eq-so eqr-gs">{standsOut(s, rk?.risk ?? null, rk?.list ?? null, x?.below52 ?? null, x?.m1 ?? null)}</td></tr>);
  const nCols = gold ? 11 : 10;
  const head = (id: string, label: ReactNode, num: boolean, gs: boolean, extra?: ReactNode) => { const t = EACH_TIPS.find((e) => e[0] === id);
    return <SortHead key={id} id={id} label={label} num={num} className={gs ? "eqr-gs" : undefined} sort={sort} extra={<>{t && <Info about={`${t[1]}, each share`} text={t[2]} how={t[3] || undefined} />}{extra}</>} />; };
  return (
    <Section id="eq-each" hide title="Each share's risk" help={`Each share against the index of companies its own size over the past year, its typical swing and worst fall over 3 years, its last year, how far below its 1-year high it is, its last month, and its share of the list's ups and downs (${basisWords(basis)}).`} how="Grouped by size: open a group to see its shares. Sort by any column; rows sort inside each size. Under a year: too few prices to measure against an index."
      sub="Grouped by company size, each against its own benchmark. Sort by any column heading."
      right={<span className="eqr-oc"><button type="button" className="eqd-link" onClick={() => setOpen(new Set(groups.map((g) => g.k)))} disabled={allOpen}>Open all</button> <button type="button" className="eqd-link" onClick={() => setOpen(new Set())} disabled={!open.size}>Close all</button></span>}>
      <FrozenTable label="each share's risk" className="eqr-each-w"><table className={"sp-tb eqr-each kit-grid" + (gold ? " g11" : " g10")}>
        <colgroup>{Array.from({ length: nCols }, (_, i) => <col key={i} className={"c" + (i + 1)} />)}</colgroup>
        <thead><tr className="eqr-thg"><th aria-hidden="true" /><th colSpan={2} scope="colgroup" className="eqr-gs">Against its size index · past year</th><th colSpan={2} scope="colgroup" className="eqr-gs">Over 3 years</th><th colSpan={3} scope="colgroup" className="eqr-gs">Price</th><th className="eqr-gs" aria-hidden="true" />{gold && <th className="eqr-gs" aria-hidden="true" />}<th className="eqr-gs" aria-hidden="true" /></tr>
          <tr>{head("share", "Share", false, false)}{head("beta", "Moves with its index", false, true)}{head("expl", "Explained by its index", true, false)}{head("swing", "Swing a year", true, true)}{head("fall", "Worst fall", true, false)}
            {head("yr", "1 year", true, true)}{head("below", "Below 1-yr high", true, false)}{head("m1", "1 month", true, false)}{head("risk", "Share of risk", true, true)}
            {gold && head("prism", "Prism Risk", true, true, <small className="eqr-safer">higher = safer</small>)}{head("so", "What stands out", false, true)}</tr></thead>
        {groups.map((g) => { const isOpen = open.has(g.k), c = capRows(g.xs, CAP_DEFAULT, more.has(g.k)); return <tbody key={g.k} id={"eqr-each-" + g.k}><tr className="eqr-g"><td colSpan={nCols}><button type="button" aria-expanded={isOpen} onClick={() => flip(open, setOpen, g.k)}>
          <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span><b>{g.k} companies</b><span className="t">{countOf(g.xs.length, "share")}</span><span className="t">against {g.sz.benchmark}</span>
          {g.sz.avgBeta != null && <span className="t">on average {times(g.sz.avgBeta)} its index{g.sz.band ? `, ${rangeWord(g.sz.band).toLowerCase()}` : ""}</span>}<span className="t">{Math.round(g.risk)}% of the risk</span><span className="h">{isOpen ? "Hide" : "Show"}</span></button></td></tr>
          {isOpen && c.shown.map(row)}
          {isOpen && c.capped && <tr className="eqr-more"><td colSpan={nCols}><ShowAll n={g.xs.length} noun={`${g.k.toLowerCase()} company`} open={more.has(g.k)} onToggle={() => flip(more, setMore, g.k)} controls={"eqr-each-" + g.k} /></td></tr>}</tbody>; })}
        {none.length > 0 && <tbody><tr className="eqr-g"><td colSpan={nCols}><b>No size band yet</b> · {none.map((s) => titleOf({ symbol: s.symbol, name: byS.get(s.symbol)?.name })).join(", ")}: no benchmark to compare with.</td></tr></tbody>}
      </table></FrozenTable>
      <p className="sp-note">"What stands out" describes the figures; it is not advice. Swing and worst fall are over 3 years of weekly closes (fewer when a share has less, shown in brackets); how much each share moves, 1 year and share of risk are over the past year.</p>
    </Section>
  );
}

