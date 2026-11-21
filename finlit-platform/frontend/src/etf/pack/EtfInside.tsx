// Task #183 part 3 (ETF portfolio, pack 03 §3 and "Changes of 15 Nov (afternoon)"): the What's inside tab, in the pack's order.
// 1 What they own (macro sector · 12 | sector · 22 × size look-through over Indian shares, chips with the plan's reading, "+N more ▾"; the MF page's grid) →
// three sub-tabs: What your money is in (2 Money in: the list's asset bar and one bar per ETF, holdings abroad apart; 3 Sectors inside each share ETF) ·
// How ETFs move together (4 the correlation grid without liquid ETFs and a pair reader; 5 Shared stocks and "Same index twice") · Large, mid, small and micro (6) →
// 7 Largest stocks underneath (5, then Show all 8). Figures are the server's (/inside, /risk); this file only draws and words them. Describes; never advice.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Scroll } from "../../components/sectors/pack/Common";
import { Section } from "../../portfolio/kit/KitSection";
import { Insights } from "../../portfolio/pack/EquityPack";
import { WideBox } from "../../portfolio/pack/DivPack";
import { Cell, LevelSwitch, gridRows, tone, useLevel, type Level, type Reading } from "../../mf/pack/MfMix";
import { traded } from "../../lib/etf";
import type { Card } from "../../lib/pulsePack";
import type { EtfPortfolio, EtfRisk, Inside } from "../../lib/etfPortfolio";
import { live, movesLike } from "../../lib/etfTop";
import { metalGaps } from "../../lib/etfKeyFigs";
import { coTitle, subLine, titleOf } from "../../lib/companyLabel";

const SIZES = ["Large", "Mid", "Small", "Micro"] as const;   // FinLit's four sizes (lib/capBuckets.ts, task #262)
const SIZE_HEAD: Record<string, [string, string]> = { Large: ["Large", "above ₹75,000 Cr"], Mid: ["Mid", "₹25,000–75,000 Cr"], Small: ["Small", "₹10,000–25,000 Cr"], Micro: ["Micro", "below ₹10,000 Cr"], Unsized: ["Not sized", "not matched to a listed company"] };
const p1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const p0 = (x: number) => `${Math.round(x * 100)}%`;
const month = (iso: string | null | undefined) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { month: "long" }) : "latest");
const word = (n: number) => ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"][n] ?? String(n);
type Props = { d: EtfPortfolio; ins: Inside; rk: EtfRisk | undefined };

const weightOf = (d: EtfPortfolio) => new Map(live(d).map((e) => [e.symbol, (e.weight ?? 0) / 100]));
const missingShares = (d: EtfPortfolio, ins: Inside) => ins.files.filter((f) => f.why && live(d).find((e) => e.symbol === f.symbol)?.type?.key === "indian").map((f) => f.symbol);
const notShares = (d: EtfPortfolio) => live(d).filter((e) => e.type?.key !== "indian");
const TYPE_PHRASE: Record<string, string> = { abroad: "shares abroad", gold: "gold", silver: "silver", liquid: "liquid", debt: "debt" };

/** "The rest: HDFCSML250, not loaded (14%), shares abroad, gold and liquid (43%)." Exported for tests. */
export function restLine(d: EtfPortfolio, ins: Inside) {
  const w = weightOf(d), miss = missingShares(d, ins), others = notShares(d);
  const kinds = [...new Set(others.map((e) => TYPE_PHRASE[e.type?.key ?? ""] ?? "other"))];
  const ow = others.reduce((a, e) => a + (w.get(e.symbol) ?? 0), 0);
  const parts = [...miss.map((s) => `${s}, not loaded (${p0(w.get(s) ?? 0)})`), ...(others.length ? [`${kinds.length > 1 ? kinds.slice(0, -1).join(", ") + " and " + kinds[kinds.length - 1] : kinds[0]} (${p0(ow)})`] : [])];
  return parts.length ? `The rest: ${parts.join(", ")}.` : "";
}

/** A stock's FinLit Prism reading, from the chips the server sent; none on a plan without Prism (task #283: any other score the server sends is dropped). */
export function readingsOf(ins: Inside): (s: string | null) => Reading {
  const m = new Map<string, Reading>();
  if (ins.scoreModel !== "prism") return () => null;
  for (const cells of Object.values(ins.lookThrough ?? {})) for (const c of Object.values(cells)) for (const st of c.stocks) if (st.symbol && st.score?.score != null) m.set(st.symbol, { word: st.score.label ? st.score.label.charAt(0) + st.score.label.slice(1).toLowerCase() : null, score: st.score.score });
  for (const t of ins.top) if (t.symbol && t.score?.score != null) m.set(t.symbol, { word: t.score.label ? t.score.label.charAt(0) + t.score.label.slice(1).toLowerCase() : null, score: t.score.score });
  return (s) => (s ? m.get(s) ?? null : null);
}

// ------------------------------------------------------------------------------------------------ 1 What they own
export function OwnSection({ d, ins, level, onLevel }: Props & { level: Level; onLevel: (l: Level) => void }) {
  const [all, setAll] = useState(false);
  const sp = { lookThrough: ins.lookThrough }, known = ins.knownShares ?? 0, gold = ins.scoreModel === "prism", readingOf = useMemo(() => readingsOf(ins), [ins]);
  const rows = useMemo(() => gridRows(sp, level), [ins, level]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sizes = [...SIZES, ...(rows.some((r) => r.cells.Unsized) ? ["Unsized"] : [])];
  const max = Math.max(0, ...rows.flatMap((r) => Object.values(r.cells).map((c) => c.w)));
  const colTot = (s: string) => rows.reduce((a, r) => a + (r.cells[s]?.w ?? 0), 0);
  const shown = level === "sector" && !all ? rows.slice(0, 8) : rows;
  const macroOf = (n: string) => ins.sectorMacro?.[n];
  const miss = missingShares(d, ins), large = colTot("Large") / (known || 1), top = rows[0];
  const cards: Card[] = [];
  // task #262: "Large" is above ₹75,000 Cr now (the 70% line is unchanged); the second figure was "below ₹10,000 Cr", the old Small, which is the Micro column now
  if (known) cards.push({ kind: large >= 0.7 ? "insight" : "watch", title: large >= 0.7 ? "Large companies lead" : "Not only large companies", text: `${p0(large)} of the Indian shares inside your ETFs are in companies above ₹75,000 Cr, ${p0(colTot("Micro") / (known || 1))} below ₹10,000 Cr.` });
  if (top) cards.push({ kind: "watch", title: `${top.name} is the biggest block`, text: `${p1(top.total)} of your list sits in ${top.name}, through ${top.n} companies across your ETFs.` });
  if (miss.length) cards.push({ kind: "insight", title: miss.length === 1 ? "One file is missing" : `${word(miss.length)} files are missing`, text: `${miss.join(" and ")}'s monthly ${miss.length === 1 ? "file is" : "files are"} not loaded yet, so ${miss.length === 1 ? "it is" : "they are"} left out of this grid, not spread over the others.` });
  return (
    <Section id="etp-own" hide title="What your ETFs own: macro sector and size" help="The Indian shares inside your ETFs, added up from each fund house's latest monthly file, by NSE macro sector or sector and company size. Each chip is one company." how="Darker cells hold more of your list. A chip's dot is its reading on your plan; +N more opens the rest of the cell."
      sub={`The Indian shares inside your ETFs, from each fund house's ${month(ins.asOf)} file. ${gold ? "Each chip is one company; its dot shows the FinLit Prism band." : "Each chip is one company (names only on this plan; the dots show FinLit Prism, see plans)."}${miss.length ? ` ${miss.join(" and ")}'s file ${miss.length === 1 ? "is" : "are"} not loaded yet.` : ""}`}>
      <LevelSwitch level={level} onLevel={onLevel} sp={sp} />
      {rows.length ? <Scroll label="what your ETFs own"><table className="sp-tb mfm-g">
        <thead><tr><th scope="col">{level === "macro" ? "Macro sector" : "Sector"}</th>{sizes.map((s) => <th key={s} scope="col">{SIZE_HEAD[s][0]}<small>{SIZE_HEAD[s][1]}</small></th>)}<th scope="col" className="r">Of your list</th></tr></thead>
        <tbody>{shown.map((r) => <tr key={r.name}><th scope="row"><b>{r.name}</b>{level === "sector" && macroOf(r.name) && macroOf(r.name) !== r.name && <small>{macroOf(r.name)}</small>}</th>
          {sizes.map((s) => <Cell key={s} c={r.cells[s]} max={max} readingOf={readingOf} link />)}
          <td className="r mfm-tot"><b>{p1(r.total)}</b><i className="mfm-bar"><u style={{ width: `${(r.total / (rows[0]?.total || 1)) * 100}%` }} /></i><small>{p0(r.total / (known || 1))} of the shares</small></td></tr>)}</tbody>
        <tfoot><tr><th scope="row">All {level === "macro" ? "macro sectors" : "sectors"} · {rows.length}</th>{sizes.map((s) => <td key={s}><b>{p1(colTot(s))}</b> of the list · {p0(colTot(s) / (known || 1))} of the shares</td>)}<td className="r"><b>{p1(known)}</b> in Indian shares</td></tr></tfoot>
      </table></Scroll> : <p className="sp-note">None of your ETFs holds Indian shares with a monthly file loaded.</p>}
      {level === "sector" && rows.length > 8 && <button type="button" className="eq-more mfm-all" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : `Show all ${rows.length} sectors ▾`}</button>}
      <p className="sp-note">{gold && <><i className="mfm-dot g" /> Strong or Healthy · <i className="mfm-dot m" /> Average · <i className="mfm-dot b" /> Weak. </>}Chips: the biggest holdings with a reading; "+N more" lists the rest of that cell. {restLine(d, ins)}</p>
      <Insights items={cards} scope="etf.own" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ sub-tab 1: what your money is in
const BAR: [keyof Inside["mix"] | "notLoaded", string, string][] = [["indian", "Indian shares", "etp-zI"], ["notLoaded", "Indian shares, file not loaded", "etp-zN"], ["abroad", "Shares abroad", "etp-zA"], ["gold", "Gold", "etp-zG"], ["silver", "Silver", "etp-zS"], ["debt", "Overnight lending and debt", "etp-zD"]];
/** The list's asset bar, in percent: Indian shares whose file is loaded, those whose file is not, shares abroad, gold, silver, overnight lending and debt. Exported for tests. */
export function assetBar(d: EtfPortfolio, ins: Inside): Record<string, number> {
  const w = weightOf(d), nl = missingShares(d, ins).reduce((a, s) => a + (w.get(s) ?? 0) * 100, 0);
  return { indian: Math.max(0, (ins.mix.indian ?? 0) - nl), notLoaded: nl, abroad: ins.mix.abroad ?? 0, gold: ins.mix.gold ?? 0, silver: ins.mix.silver ?? 0, debt: ins.mix.debt ?? 0 };
}
const MAIN: Record<string, [string, string]> = { indian: ["Indian shares", "etp-zI"], abroad: ["Shares abroad", "etp-zA"], gold: ["Gold", "etp-zG"], silver: ["Silver", "etp-zS"], liquid: ["Overnight lending", "etp-zD"], debt: ["Debt", "etp-zD"] };
/** One ETF's bar from its monthly file: its main asset (shares for a share ETF; for gold or silver the file's "other" line, where the metal sits), then cash
 *  and the rest in grey; an ETF without a file shows its type in full, except a share ETF, whose holdings are said to be not loaded. Exported for tests. */
export function etfSplit(ins: Inside, sym: string): { k: string; v: number; c: string }[] | null {
  const e = (ins.etfs ?? []).find((x) => x.symbol === sym), s = e?.split, t = e?.type?.key ?? "indian", [word, cls] = MAIN[t] ?? MAIN.indian;
  if (!s) return t === "indian" ? null : [{ k: word, v: 100, c: cls }];
  // task #276, number fix 2: a gold or silver ETF read by its type on the server (its file was read without its metal) is all metal, as the list's mix counts it
  if ((t === "gold" || t === "silver") && ins.mixFromType?.includes(sym)) return [{ k: word, v: 100, c: cls }];
  const pos = (x: number | undefined) => Math.max(0, x ?? 0), tot = pos(s.equity) + pos(s.debt) + pos(s.cash) + pos(s.other) || 1;
  const main = t === "indian" || t === "abroad" ? pos(s.equity) : t === "gold" || t === "silver" ? pos(s.other) + pos(s.equity) : pos(s.debt) + pos(s.cash) + pos(s.other);
  const v = Math.min(100, (main / tot) * 100), rest = 100 - v;
  return [{ k: word, v, c: cls }, ...(rest >= 0.5 ? [{ k: "Cash and other", v: rest, c: "etp-zD" }] : [])];
}

function MoneySection({ d, ins }: Props) {
  const bar = assetBar(d, ins), abroad = Object.entries(ins.abroadTop ?? {});
  const split = (sym: string) => etfSplit(ins, sym);
  return (
    <Section id="etp-money" hide title="What your money is in" help="The list's money by asset, from each ETF's latest monthly file (an ETF without one by its type), then one bar per ETF." how="Each ETF counts like the list; the grey part of a bar is cash and other." sub={`Each ETF's latest monthly file, each ETF counting ${d.basis === "value" ? "by your money" : "the same"}.`}>
      <div className="etp-bar" role="img" aria-label={BAR.filter(([k]) => bar[k] > 0.05).map(([k, l]) => `${l} ${Math.round(bar[k])}%`).join(", ")}>{BAR.filter(([k]) => bar[k] > 0.05).map(([k, l, c]) => <i key={k} className={c} style={{ flexGrow: bar[k] }} title={`${l} ${Math.round(bar[k])}%`}>{bar[k] >= 8 ? `${Math.round(bar[k])}%` : ""}</i>)}</div>
      <p className="sp-note etp-keys">{BAR.filter(([k]) => bar[k] > 0.05).map(([k, l, c]) => <span key={k}><i className={"mfm-key " + c} /> {l} {bar[k] < 0.5 ? "under 1" : Math.round(bar[k])}%</span>)}</p>
      {metalGaps(d, ins).length > 0 && <p className="sp-note" role="status">Data to check: {metalGaps(d, ins).join(" and ")} {metalGaps(d, ins).length === 1 ? "is" : "are"} read without {metalGaps(d, ins).length === 1 ? "its" : "their"} metal in the fund house's file, so {metalGaps(d, ins).length === 1 ? "it shows" : "they show"} as debt and cash here.</p>}
      <div className="mfm-fbars">{live(d).map((e) => { const s = split(e.symbol); return <div key={e.symbol} className="mfm-fb"><b>{e.symbol}</b>
        {s ? <span className="mfm-stack">{s.map((x) => <i key={x.k} className={x.c} style={{ width: `${x.v}%` }} title={`${x.k} ${Math.round(x.v)}%`}>{x.v >= 12 ? `${x.k} ${Math.round(x.v)}%` : ""}</i>)}</span> : <span className="mfm-stack etp-none">Holdings not loaded yet</span>}</div>; })}</div>
      {abroad.map(([sym, hs]) => <div key={sym} className="etp-abroad"><p className="sp-cap">{sym}'s five largest holdings · listed abroad</p>
        <ol>{hs.map((h) => <li key={h.name}><b>{h.name}</b> <span>{h.pct.toFixed(1)}%</span></li>)}</ol><p className="sp-note">Not compared with FinLit readings: listed abroad.</p></div>)}
    </Section>
  );
}

function SectorsInside({ d, ins, level, onLevel }: Props & { level: Level; onLevel: (l: Level) => void }) {
  const sp = { lookThrough: ins.lookThrough }, known = ins.knownShares ?? 0;
  const rows = gridRows(sp, level).filter((r) => r.name !== "Not classified");
  const etfs = live(d).filter((e) => ins.perEtf?.[e.symbol]), miss = missingShares(d, ins);
  const max = Math.max(0.0001, ...etfs.flatMap((e) => Object.values(ins.perEtf?.[e.symbol]?.[level] ?? {})));
  return (
    <Section id="etp-secin" hide title="Sectors inside each share ETF" help="Each share ETF's own money by NSE macro sector or sector, from its latest monthly file; the last row is your list's Indian shares." how="Darker cells hold more of that ETF. Read across a row for one ETF's lean; down a column for how many ETFs share it."
      sub="Share of each ETF's money in each sector. Darker cells hold more. The last row adds up your list's Indian shares.">
      <LevelSwitch level={level} onLevel={onLevel} sp={sp} />
      <WideBox title="Sectors inside each share ETF"><table className="sp-tb mfm-heat">
        <thead><tr><th scope="col">ETF</th>{rows.map((r) => <th key={r.name} scope="col"><span>{r.name}</span></th>)}</tr></thead>
        <tbody>{etfs.map((e) => <tr key={e.symbol}><th scope="row">{e.symbol}</th>{rows.map((r) => { const v = ins.perEtf?.[e.symbol]?.[level]?.[r.name] ?? 0;
          return <td key={r.name} style={{ ["--mfm-a" as string]: String((v / max) * 0.7) }}>{v >= 0.005 ? p0(v) : v > 0 ? "<1%" : "–"}</td>; })}</tr>)}
          <tr className="mfm-list"><th scope="row">Your list</th>{rows.map((r) => <td key={r.name}>{p0(r.total / (known || 1))}</td>)}</tr></tbody>
      </table></WideBox>
      {miss.length > 0 && <p className="sp-note">Not loaded yet, so not in this grid: {miss.join(", ")}.</p>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ sub-tab 2: how ETFs move together
const linkWord = (v: number) => (v >= 0.8 ? "rise and fall almost as one" : v >= 0.6 ? "move together closely" : v >= 0.4 ? "move together somewhat" : v >= 0.2 ? "are loosely linked" : "go their own way");
/** The pair reader's words. Exported for tests. */
export function pairText(d: EtfPortfolio, ins: Inside, rk: EtfRisk, a: string, b: string) {
  const p = rk.together.pairs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (!p || p.r == null) return `${a} and ${b}: ${p?.why ?? "not enough weeks in common."}`;
  const ea = live(d).find((e) => e.symbol === a), eb = live(d).find((e) => e.symbol === b);
  const ov = ins.overlap.pairs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  const same = ea?.tracks.key && ea.tracks.key === eb?.tracks.key ? "The same index" : ea?.type?.key === eb?.type?.key ? "The same kind of asset, different indexes" : "Different kinds of asset";
  const shared = ov ? (ov.n ? `They keep ${ov.pct.toFixed(1)}% of their money in the same ${ov.n} ${ov.n === 1 ? "stock" : "stocks"}.` : "They share no stocks.") : ea?.type?.key === eb?.type?.key ? "One of them has no holdings file loaded, so shared stocks are not known." : "";
  return [`${a} and ${b}: ${p.r.toFixed(2)}.`, `They ${linkWord(p.r)}.`, shared, `${same}, ${ea?.fundHouse === eb?.fundHouse ? "the same fund house" : "different fund houses"}.`].filter(Boolean).join(" ");
}
function MoveSection({ d, ins, rk }: Props) {
  const t = rk?.together, syms = t?.symbols ?? [], [pick, setPick] = useState<[string, string] | null>(syms.length > 1 ? [syms[0], syms[1]] : null);
  const r = (a: string, b: string) => t?.pairs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))?.r ?? null;
  const mv = movesLike(rk), track = (s: string) => live(d).find((e) => e.symbol === s)?.tracks.label;
  return (
    <Section id="etp-move" hide title="How your ETFs move together" help="How closely each pair of ETFs has moved, from weekly price changes over the past year. Liquid ETFs are left out: their price barely moves." how="1.00 means two ETFs rise and fall in step; below 0 they tend to move opposite ways. Tap a cell to read the pair."
      sub={`1.00 means two ETFs rise and fall in step; below 0 they tend to move opposite ways.${t?.leftOut.length ? ` ${t.leftOut.join(" and ")} ${t.leftOut.length === 1 ? "is" : "are"} left out.` : ""}`}>
      {t && syms.length > 1 ? <div className="mfm-pair">
        <Scroll label="how your ETFs move together"><table className="sp-tb mfm-cg"><thead><tr><th><span className="sr-only">ETF</span></th>{syms.map((s) => <th key={s} scope="col"><span>{s}</span></th>)}</tr></thead>
          <tbody>{syms.map((a) => <tr key={a}><th scope="row">{a}<small className="mfp-sub">{track(a)}</small></th>{syms.map((b) => { const v = r(a, b); return a === b ? <td key={b} className="self">–</td> :
            <td key={b} style={{ ["--mfm-a" as string]: String(Math.max(0, v ?? 0) * 0.7) }} className={pick && ((pick[0] === a && pick[1] === b) || (pick[0] === b && pick[1] === a)) ? "on" : undefined}>
              <button type="button" aria-label={`${a} and ${b}: ${v == null ? "not enough weeks" : v.toFixed(2)}`} onClick={() => setPick([a, b])}>{v == null ? "–" : v.toFixed(2)}</button></td>; })}</tr>)}</tbody></table></Scroll>
        <div className="mfm-reader" aria-live="polite"><p className="sp-cap">Read a pair</p><p>{pick && rk ? pairText(d, ins, rk, pick[0], pick[1]) : "Tap a cell to compare two ETFs."}</p>
          {mv && <p className="etp-mv"><b>{mv.independent.toFixed(1)}</b> independent ETFs out of {mv.of}</p>}</div>
      </div> : <p className="sp-note">Needs a year of weekly prices for at least two ETFs that are not liquid.</p>}
    </Section>
  );
}
function SharedSection({ d, ins, rk }: Props) {
  const pairs = [...ins.overlap.pairs].sort((a, b) => b.pct - a.pct), miss = missingShares(d, ins), byS = new Map(live(d).map((e) => [e.symbol, e]));
  const r = (a: string, b: string) => rk?.together.pairs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))?.r ?? null;
  return (
    <Section id="etp-shared" hide title="Stocks they share" help="For each pair of share ETFs, the share of money both keep in the same stocks: for each stock in both, the smaller of the two weights, added up." how="Higher means the two hold more of the same. An ETF whose file is not loaded is shown with a dashed line."
      sub="For each pair of share ETFs, the share of money both keep in the same stocks.">
      <div className="mfm-cards">{pairs.map((o) => <div key={`${o.a}-${o.b}`} className="mfm-card"><p className="sp-cap">{o.a} and {o.b}</p>
        <p className="mfm-rw"><b>{o.pct.toFixed(1)}%</b> <span>{o.n ? (byS.get(o.a)?.tracks.key && byS.get(o.a)?.tracks.key === byS.get(o.b)?.tracks.key ? `All ${o.n} stocks shared` : `in ${o.n} ${o.n === 1 ? "stock" : "stocks"}`) : "No shared stocks"}</span></p></div>)}
        {miss.map((s) => <div key={s} className="mfm-card dashed"><p className="sp-cap">{s} and the others</p><p className="mfm-rl">Holdings not loaded yet, so the stocks it shares are not known.</p></div>)}
        {d.repeats.map((rp) => { const [a, b] = rp.symbols, ea = byS.get(a), eb = byS.get(b), ov = ins.overlap.pairs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)), v = r(a, b);
          return <div key={rp.key} className="mfm-card theme etp-twicecard"><p className="sp-cap">Same index twice</p>
            <p className="mfm-rl">{a} ({(ea?.fundHouse || "").replace(/\s+mutual\s+fund$/i, "")}) and {b} ({(eb?.fundHouse || "").replace(/\s+mutual\s+fund$/i, "")}){ov ? ` · same ${ov.n} stocks` : ""}{v != null ? ` · move together ${v.toFixed(2)}` : ""} · costs and trading differ: {a} trades {traded(ea?.avgTurnover)} a day, {b} {traded(eb?.avgTurnover)}.</p></div>; })}</div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ sub-tab 3: large, mid, small and micro
function SizesSection({ d, ins }: Props) {
  const etfs = live(d).filter((e) => e.type?.key === "indian"), miss = new Set(missingShares(d, ins)), tot = ins.size;
  const row = (sz: Record<string, number>, scale = 1) => { const l = (sz.Large ?? 0) * scale, m = (sz.Mid ?? 0) * scale, s = (sz.Small ?? 0) * scale, x = (sz.Micro ?? 0) * scale, u = ((sz.Unsized ?? sz["Not sized"] ?? 0)) * scale, o = Math.max(0, 1 - l - m - s - x - u);
    return <span className="mfm-stack">{([["L", l, "Large"], ["M", m, "Mid"], ["S", s, "Small"], ["X", x, "Micro"], ["U", u, "Not sized"], ["O", o, "Cash and other"]] as [string, number, string][]).map(([c, v, n]) => v > 0.005 ?
      <i key={c} className={"mfm-z" + c} style={{ width: `${v * 100}%` }} title={`${n} ${p0(v)}`}>{v > 0.08 ? p0(v) : ""}</i> : null)}</span>; };
  const cards: Card[] = [];
  const mid = etfs.find((e) => /mid/i.test(e.tracks.label || "") && (ins.perEtf?.[e.symbol]?.size?.Large ?? 0) > 0.5);
  if (mid) cards.push({ kind: "insight", title: "The midcap ETF is mostly large here", text: `${mid.symbol} reads ${p0(ins.perEtf![mid.symbol].size.Large ?? 0)} large and ${p0(ins.perEtf![mid.symbol].size.Mid ?? 0)} mid on FinLit's ₹ sizes: its index picks companies by rank (101st to 250th), and most of them are above ₹75,000 Cr.` });
  if (miss.size) cards.push({ kind: "watch", title: "Smaller companies are missing from the view", text: `${[...miss].join(" and ")}'s holdings are not loaded, so the smaller companies ${miss.size === 1 ? "it holds are" : "they hold are"} not in the list total.` });
  return (
    <Section id="etp-sizes" hide title="Company sizes inside each share ETF" help="The Indian shares inside each share ETF by company size, on FinLit's ₹ rule: large above ₹75,000 Cr, mid ₹25,000 to 75,000 Cr, small ₹10,000 to 25,000 Cr, micro below ₹10,000 Cr." how="One bar per share ETF; the last bar adds up the Indian shares inside your loaded ETFs."
      sub="Large: above ₹75,000 Cr market value. Mid: ₹25,000 to 75,000 Cr. Small: ₹10,000 to 25,000 Cr. Micro: below ₹10,000 Cr. FinLit uses these amounts on every page; SEBI's fund categories rank companies instead, so a fund's category and its sizes here can differ.">
      <div className="mfm-fbars">{etfs.map((e) => <div key={e.symbol} className="mfm-fb"><b>{e.symbol}<small className="mfp-sub">{e.tracks.label}</small></b>
        {ins.perEtf?.[e.symbol] ? row(ins.perEtf[e.symbol].size) : <span className="mfm-stack etp-none">Holdings not loaded yet</span>}</div>)}
        {tot && <div className="mfm-fb total"><b>Indian shares inside your loaded ETFs</b>{row({ Large: tot.Large / 100, Mid: tot.Mid / 100, Small: tot.Small / 100, Micro: (tot.Micro ?? 0) / 100, Unsized: (tot["Not sized"] ?? 0) / 100 })}</div>}</div>
      <p className="sp-note"><i className="mfm-key mfm-zL" /> Large · <i className="mfm-key mfm-zM" /> Mid · <i className="mfm-key mfm-zS" /> Small · <i className="mfm-key mfm-zX" /> Micro · <i className="mfm-key mfm-zO" /> Cash and other.</p>
      <Insights items={cards} scope="etf.sizes" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ the three sub-tabs
type Sub = "hold" | "move" | "size";
const SUB_OF: Record<string, Sub> = { "etp-money": "hold", "etp-secin": "hold", "etp-move": "move", "etp-shared": "move", "etp-sizes": "size" };
export function InsideSubTabs(p: Props & { level: Level; onLevel: (l: Level) => void }) {
  const [sub, setSub] = useState<Sub>("hold");
  useEffect(() => { const on = (e: Event) => { const s = SUB_OF[(e as CustomEvent).detail as string]; if (s) setSub(s); }; addEventListener("eq-jump", on); return () => removeEventListener("eq-jump", on); }, []);
  const TABS: [Sub, string, string][] = [["hold", "What your money is in", "Shares, gold, debt and sectors"], ["move", "How ETFs move together", "Price moves and shared stocks"], ["size", "Large, mid, small and micro", "Company sizes inside each ETF"]];
  return <>
    <div className="eqd-subbar mfm-subtabs" role="tablist" aria-label="What's inside views">{TABS.map(([k, t, s]) => <button key={k} type="button" role="tab" aria-selected={sub === k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}><b>{t}</b><small>{s}</small></button>)}</div>
    {sub === "hold" && <><MoneySection {...p} /><SectorsInside {...p} /></>}
    {sub === "move" && <><MoveSection {...p} /><SharedSection {...p} /></>}
    {sub === "size" && <SizesSection {...p} />}
  </>;
}

// ------------------------------------------------------------------------------------------------ 7 Largest stocks underneath
export function LargestSection({ ins }: { ins: Inside }) {
  const [all, setAll] = useState(false), rows = ins.top, shown = all ? rows : rows.slice(0, 5), gold = ins.scoreModel === "prism", model = "FinLit Prism";
  const macroOf = useMemo(() => { const m = new Map<string, string>(); for (const [k, c] of Object.entries(ins.lookThrough?.macro ?? {})) for (const st of c.stocks) if (st.symbol) m.set(st.symbol, k.split("|")[0]); return m; }, [ins]);
  return (
    <Section id="etp-largest" hide title="Largest stocks underneath" help="The largest Indian holdings across your ETFs: each company's weight inside each ETF times the ETF's share of your list, added up." how={`"Of your ETFs" is that share of your list. The reading is the company's ${model} score, on a plan that has it.`}
      sub={gold ? `The ${rows.length} largest Indian holdings across your ETFs, with their ${model} reading.` : `The ${rows.length} largest Indian holdings across your ETFs (names only on this plan).`}>
      <Scroll label="largest stocks underneath"><table className="sp-tb mfm-big kit-grid"><thead><tr><th scope="col">Stock</th><th scope="col">Macro sector</th><th scope="col">Size</th><th scope="col" className="r">Of your ETFs</th><th scope="col">Held by</th><th scope="col">{model}</th></tr></thead>
        <tbody>{shown.map((r) => <tr key={r.isin ?? r.name}>
          <th scope="row">{r.symbol ? <Link to={`/stocks/${r.symbol}`} title={coTitle({ symbol: r.symbol, name: r.name })}>{titleOf({ symbol: r.symbol, name: r.name })}</Link> : r.name}<small className="mfp-sub">{r.symbol ? subLine({ symbol: r.symbol, name: r.name }, r.name) : r.name}</small></th><td>{(r.symbol && macroOf.get(r.symbol)) ?? r.industry ?? "–"}</td><td>{r.size ? <span className="mfm-sz">{r.size[0]}</span> : "–"}</td>
          <td className="r">{r.w.toFixed(2)}%</td><td><span className="mfm-held">{r.etfs.map((s) => <span key={s}>{s}</span>)}</span></td>
          <td>{!gold ? <Link to="/plans" className="mfm-lock">FinLit Prism · see plans</Link> : r.score?.score != null ? <span className="mff-score"><b className={"mff-num " + tone(r.score.label)}>{Math.round(r.score.score)}</b> <span className={"mff-w " + tone(r.score.label)}>{r.score.label ? r.score.label.charAt(0) + r.score.label.slice(1).toLowerCase() : ""}</span></span> : <span className="sp-note">{r.scoreWhy ?? "Not rated"}</span>}</td></tr>)}</tbody></table></Scroll>
      {rows.length > 5 && <button type="button" className="eq-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : `Show all ${rows.length} ▾`}</button>}
    </Section>
  );
}

export function InsideTab({ d, ins, rk, kf }: Props & { kf?: ReactNode }) {
  const [level, setLevel] = useLevel("finlit-etf-level");
  return <>
    <OwnSection d={d} ins={ins} rk={rk} level={level} onLevel={setLevel} />
    {kf}
    <InsideSubTabs d={d} ins={ins} rk={rk} level={level} onLevel={setLevel} />
    {ins.top.length > 0 && <LargestSection ins={ins} />}
  </>;
}
