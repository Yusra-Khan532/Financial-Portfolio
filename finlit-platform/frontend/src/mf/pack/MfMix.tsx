// Task #183 part 2 (MF portfolio, pack 02 §3 and "Changes of 15 Nov (afternoon)"): the Mix & overlap tab, in the pack's order.
// 1 What they own (macro sector · 12 | sector · 22 × size look-through, chips with the plan's reading, "+N more ▾") → 2 Spread (six readings) → three sub-tabs:
// What they hold (3 Money in, 4 Sectors inside) · How funds move together (5 Move together with a pair reader, 6 Shared stocks) · Large, mid, small and micro (7) →
// 8 Biggest stocks (5, then Show all 10) → 9 Trend (Gold, folded; a lock card below Gold). Figures are the server's; this file only draws and words them.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Scroll, Section } from "../../components/sectors/pack/Common";
import { Insights, GoldLock } from "../../portfolio/pack/EquityPack";
import { WideBox } from "../../portfolio/pack/DivPack";
import { TrendCard } from "../Spread";
import type { Card } from "../../lib/pulsePack";
import type { MfSpread } from "../../lib/mfPortfolio";
import { shortFund } from "../../lib/mfPack";
import { coTitle, subLine, titleOf } from "../../lib/companyLabel";

export type Level = "macro" | "sector";
export type Reading = { word: string | null; score: number | null } | null;
const SIZES = ["Large", "Mid", "Small", "Micro"] as const;   // FinLit's four sizes (lib/capBuckets.ts, task #262)
const SIZE_HEAD: Record<string, [string, string]> = { Large: ["Large", "above ₹75,000 Cr"], Mid: ["Mid", "₹25,000–75,000 Cr"], Small: ["Small", "₹10,000–25,000 Cr"], Micro: ["Micro", "below ₹10,000 Cr"], Unsized: ["Not sized", "abroad or not matched"] };
const p1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const p0 = (x: number) => `${Math.round(x * 100)}%`;
export const tone = (w: string | null | undefined) => (/strong|healthy/i.test(w || "") ? "g" : /average|mixed|fair/i.test(w || "") ? "m" : /weak|poor|watch/i.test(w || "") ? "b" : "n");
const LKEY = "finlit-mf-level";
const readLevel = (key: string): Level => { try { return localStorage.getItem(key) === "sector" ? "sector" : "macro"; } catch { return "macro"; } };
/** The look-through grid's shape, shared with the ETF page (task #183 part 3). */
type Grid = { lookThrough?: MfSpread["lookThrough"] };

/** One setting for both grids, kept in this browser (pack: "one setting for both, kept per member"). `key`: one per page. */
export function useLevel(key = LKEY): [Level, (l: Level) => void] {
  const [l, setL] = useState<Level>(() => readLevel(key));
  return [l, (v: Level) => { setL(v); try { localStorage.setItem(key, v); } catch { /* not kept */ } }];
}

export function LevelSwitch({ level, onLevel, sp }: { level: Level; onLevel: (l: Level) => void; sp: Grid }) {
  const n = (lv: Level) => new Set(Object.keys(sp.lookThrough?.[lv] ?? {}).map((k) => k.split("|")[0]).filter((s) => s !== "Listed abroad" && s !== "Not classified")).size;
  return <div className="sp-view mfm-lv" role="group" aria-label="Group the shares by">{(["macro", "sector"] as Level[]).map((l) =>
    <button key={l} type="button" className={"sp-vbtn" + (level === l ? " on" : "")} aria-pressed={level === l} onClick={() => onLevel(l)}>{l === "macro" ? "Macro sector" : "Sector"} · {l === "macro" ? 12 : 22}<span className="sr-only"> ({n(l)} in your funds)</span></button>)}</div>;
}

/** The grid's rows: each sector's cells by size, its total, biggest first. Exported for tests. */
export function gridRows(sp: Grid, level: Level) {
  const cells = sp.lookThrough?.[level] ?? {};
  const rows = new Map<string, Record<string, { w: number; n: number; stocks: { name: string; symbol: string | null; w: number }[] }>>();
  for (const [k, c] of Object.entries(cells)) { const [name, size] = k.split("|"); const r = rows.get(name) ?? {}; r[size] = c; rows.set(name, r); }
  return [...rows].map(([name, r]) => ({ name, cells: r, total: Object.values(r).reduce((a, c) => a + c.w, 0), n: new Set(Object.values(r).flatMap((c) => c.stocks.map((s) => s.symbol ?? s.name))).size }))
    .sort((a, b) => b.total - a.total);
}

export function Cell({ c, max, readingOf, link }: { c?: { w: number; n: number; stocks: { name: string; symbol: string | null; w: number }[] }; max: number; readingOf: (s: string | null) => Reading;
  /** task #276 (ETF page, change 5): each chip opens the company report */ link?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!c || c.w <= 0) return <td className="mfm-c empty" />;
  const show = open ? c.stocks : c.stocks.slice(0, 4), rest = c.stocks.length - 4;
  return <td className="mfm-c" style={{ ["--mfm-a" as string]: String(Math.min(1, c.w / max) * 0.55) }}>
    <span className="mfm-chips">{show.map((s) => { const r = readingOf(s.symbol); const tip = `${s.name}: ${p1(s.w)} of your list${r?.word ? ` · ${r.word}` : ""}`;
      const inner = <><i className={"mfm-dot " + tone(r?.word)} aria-hidden="true" />{s.symbol ?? s.name.split(" ")[0]}</>;
      // task #275 (change 5) and #276: a listed company's chip opens its company report (every page; `link={false}` keeps plain labels); one with no listed
      // symbol (an ISIN not matched) has no report and stays a label that says so
      return (link ?? true) && s.symbol ? <Link key={s.symbol} className="mfm-chip mfm-chip-a ptk-chipl" to={`/stocks/${encodeURIComponent(s.symbol)}`} title={`${tip}. Open the company report`}>{inner}</Link>
        : <span key={s.symbol ?? s.name} className="mfm-chip" title={s.symbol ? tip : `${tip} · no company report (not matched to a listed company)`}>{inner}</span>; })}
      {rest > 0 && <button type="button" className="eq-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Show fewer ▴" : `+${rest} more ▾`}</button>}</span>
    <small className="mfm-cw">{p1(c.w)} · {c.n} {c.n === 1 ? "co" : "cos"}</small></td>;
}

function rest(sp: MfSpread) {
  const nm = new Map(sp.funds.map((f) => [f.code, shortFund(f.name)]));
  const missing = sp.coverage.missing.map((c) => sp.funds.find((f) => f.code === c)).filter(Boolean) as MfSpread["funds"];
  const other = 1 - sp.knownShares - missing.reduce((a, f) => a + f.weight / 100, 0);
  const parts = [other > 0.0005 ? `debt, cash and gold (${p0(other)})` : null, ...missing.map((f) => `${nm.get(f.code)}, not loaded (${Math.round(f.weight)}%)`)].filter(Boolean);
  return parts.length ? `The rest of the list: ${parts.join(", and ")}.` : "";
}

// ------------------------------------------------------------------------------------------------ 1 What they own
export function OwnSection({ sp, level, onLevel, readingOf, gold, mfOnly }: { sp: MfSpread; level: Level; onLevel: (l: Level) => void; readingOf: (s: string | null) => Reading; gold: boolean; mfOnly?: boolean }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => gridRows(sp, level), [sp, level]);
  const sizes = [...SIZES, ...(rows.some((r) => r.cells.Unsized) ? ["Unsized"] : [])];
  const max = Math.max(0, ...rows.flatMap((r) => Object.values(r.cells).map((c) => c.w)));
  const colTot = (s: string) => rows.reduce((a, r) => a + (r.cells[s]?.w ?? 0), 0);
  const shown = level === "sector" && !all ? rows.slice(0, 8) : rows;
  const macroOf = (n: string) => sp.sectorMacro?.[n];
  // task #262: this card was about companies below ₹10,000 Cr (the old "Small"), which is the Micro column now; it keeps that meaning and its 15% line
  const top = rows[0], small = colTot("Micro") / (sp.knownShares || 1);
  const cards: Card[] = [];
  if (top) cards.push({ kind: "insight", title: `${top.name} leads underneath`, text: `${p1(top.total)} of your list sits in ${top.name}, through ${top.n} companies across your funds.` });
  cards.push({ kind: small < 0.15 ? "insight" : "watch", title: small < 0.15 ? "Few micro companies underneath" : "Many micro companies underneath", text: `${p0(small)} of the shares sit in micro companies, below ₹10,000 Cr. Fund categories rank companies instead, so a fund's category and these sizes can differ.` });
  cards.push({ kind: "insight", title: "Weights follow the fund files", text: `From each fund house's latest monthly file, each fund counting ${sp.basis === "value" ? "by the value of your units" : "the same"}.${sp.coverage.notMatched ? ` ${sp.coverage.notMatched} share ${sp.coverage.notMatched === 1 ? "ISIN is" : "ISINs are"} not matched to a listed company: counted as "Not sized".` : ""}` });
  return (
    <Section id="mfp-own" hide title="What your funds own: sector and size" help="The shares inside your funds, added up from each fund house's latest monthly file, by NSE sector and company size. Each chip is one company." how="Darker cells hold more of your list. A chip's dot is its reading on your plan; +N more opens the rest of the cell."
      sub={`The shares inside your funds, added up from each fund house's latest monthly file. ${mfOnly ? "Each chip is one company." : `Each chip is one company; its dot shows its ${gold ? "FinLit Prism" : "FinLit IQ"} band.`} Darker cells hold more of your list.`}>
      <LevelSwitch level={level} onLevel={onLevel} sp={sp} />
      <Scroll label="what your funds own"><table className="sp-tb mfm-g">
        <thead><tr><th scope="col">{level === "macro" ? "Macro sector" : "Sector"}</th>{sizes.map((s) => <th key={s} scope="col">{SIZE_HEAD[s][0]}<small>{SIZE_HEAD[s][1]}</small></th>)}<th scope="col" className="r">Of your list</th></tr></thead>
        <tbody>{shown.map((r) => <tr key={r.name}><th scope="row"><b>{r.name}</b>{level === "sector" && macroOf(r.name) && macroOf(r.name) !== r.name && <small>{macroOf(r.name)}</small>}</th>
          {sizes.map((s) => <Cell key={s} c={r.cells[s]} max={max} readingOf={mfOnly ? () => null : readingOf} />)}
          <td className="r mfm-tot"><b>{p1(r.total)}</b><i className="mfm-bar"><u style={{ width: `${(r.total / (rows[0]?.total || 1)) * 100}%` }} /></i><small>{p0(r.total / (sp.knownShares || 1))} of the shares</small></td></tr>)}</tbody>
        <tfoot><tr><th scope="row">All {level === "macro" ? "macro sectors" : "sectors"} · {rows.length}</th>{sizes.map((s) => <td key={s}><b>{p1(colTot(s))}</b> of the list · {p0(colTot(s) / (sp.knownShares || 1))} of the shares</td>)}<td className="r"><b>{p1(sp.knownShares)}</b> in shares</td></tr></tfoot>
      </table></Scroll>
      {level === "sector" && rows.length > 8 && <button type="button" className="eq-more mfm-all" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : `Show all ${rows.length} sectors ▾`}</button>}
      <p className="sp-note">{mfOnly ? "Readings of the stocks inside are part of Silver and up." : <><i className="mfm-dot g" /> Strong or Healthy · <i className="mfm-dot m" /> {gold ? "Average" : "Mixed"} · <i className="mfm-dot b" /> {gold ? "Weak" : "Watch"}.</>} Chips: the biggest holdings with a reading; "+N more" opens the rest of that cell. {rest(sp)}</p>
      <Insights items={cards} scope="mf.own" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2 Spread
const READS: [keyof MfSpread["readings"], string][] = [["together", "Funds that move together"], ["underneath", "Stocks underneath"], ["overlap", "Overlap between funds"], ["theme", "Same theme"], ["houses", "Fund houses"], ["assets", "Asset mix"]];
export function readingTiles(sp: MfSpread) {
  const r = sp.readings, top = r.overlap.top;
  const fig: Record<string, string> = { together: r.together.of ? `${r.together.independent.toFixed(1)} of ${r.together.of}` : "–", underneath: String(r.underneath.stocks || "–"), overlap: top ? `${Math.round(top.pct)}%` : "–",
    theme: r.theme.theme || "–", houses: `${r.houses.count} of ${sp.count}`, assets: p0(r.assets.equityShare) };
  const line: Record<string, string> = {
    together: r.together.range ? `Weekly NAV changes line up between ${r.together.range[0].toFixed(2)} and ${r.together.range[1].toFixed(2)}.` : "Needs two equity-type funds with a year of NAVs.",
    underneath: `${r.underneath.inTwoOrMore} are held through two or more funds.`, overlap: top ? "The most two funds keep in the same stocks." : "Needs the holdings of two funds.",
    theme: r.theme.theme ? `${r.theme.funds.length === 2 ? "Two" : r.theme.funds.length} thematic funds follow it.` : "No two thematic funds share a theme.", houses: `${r.houses.top} runs ${r.houses.count} of your funds.`,
    assets: "In shares, counting funds whose split is not loaded as shares." };
  return READS.map(([k, label]) => ({ k, label, word: (r[k] as { word: string }).word, fig: fig[k], line: line[k] }));
}
export function SpreadSection({ sp }: { sp: MfSpread }) {
  const r = sp.readings, cards: Card[] = [];
  if (r.together.of > 1) cards.push({ kind: r.together.word === "Move as one" ? "watch" : "good", title: r.together.word === "Move as one" ? `${r.together.of === 4 ? "Four" : r.together.of} funds move almost as one` : "Your funds move apart", text: `Your ${r.together.of} equity-type funds behave like ${r.together.independent.toFixed(1)} independent funds.` });
  if (r.overlap.top) cards.push({ kind: r.overlap.word === "Low" ? "good" : "watch", title: r.overlap.word === "Low" ? "Little stock overlap" : "Funds share many stocks", text: `The most two funds keep in the same stocks is ${Math.round(r.overlap.top.pct)}%.` });
  if (r.theme.theme) cards.push({ kind: "insight", title: r.houses.word === "Leans on one" ? "One theme, two fund houses" : "One theme twice", text: `${r.theme.funds.length} funds follow the ${r.theme.theme} theme; ${r.houses.top} runs ${r.houses.count} of your funds.` });
  return (
    <Section id="mfp-spread" hide title="How spread are your funds?" help="Six readings across your funds, from how their NAVs move to what sits inside them." how="Each card is a word, a figure and one line. Together they say whether the funds are as different as their labels."
      sub={`Six readings across your ${sp.count} funds, from how their NAVs move to what sits inside them. ${sp.basis === "value" ? "Funds count by the value of your units." : "Each fund counts the same until units are added."}`}>
      <div className="mfm-reads">{readingTiles(sp).map((t) => <div key={t.k} className="mfm-read"><p className="sp-cap">{t.label}</p><p className="mfm-rw"><b>{t.word}</b> <span>{t.fig}</span></p><p className="mfm-rl">{t.line}</p></div>)}</div>
      <Insights items={cards} scope="mf.spread" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ sub-tab 1: what they hold
const MIX: [string, string, string][] = [["shares", "Shares", "s"], ["debt", "Debt and money market", "d"], ["other", "Gold and other", "o"], ["sharesUnknown", "Not loaded", "u"]];
export function MoneySection({ sp }: { sp: MfSpread }) {
  const nm = (n: string) => shortFund(n);
  return (
    <Section id="mfp-money" hide title="What your money is in" help="Your list split into shares, debt and money market, and gold and other, from each fund's latest monthly file." how="The top bar is the whole list; one bar per fund below it. Grey stripes: a fund whose file is not loaded."
      sub={`Each fund's latest monthly file, each fund counting ${sp.basis === "value" ? "by the value of your units" : "the same"}.`}>
      <div className="mfm-stack big" role="img" aria-label={MIX.filter(([k]) => sp.mix[k as keyof MfSpread["mix"]] > 0.0005).map(([k, l]) => `${l} ${p0(sp.mix[k as keyof MfSpread["mix"]])}`).join(", ")}>
        {MIX.map(([k, l, c]) => { const v = sp.mix[k as keyof MfSpread["mix"]]; return v > 0.0005 ? <i key={k} className={"mfm-" + c} style={{ width: `${v * 100}%` }}><b>{p0(v)}</b><small>{l}</small></i> : null; })}</div>
      <div className="mfm-fbars">{sp.funds.map((f) => { const a = f.assetSplit, t = a ? (a.equity ?? 0) + (a.debt ?? 0) + (a.cash ?? 0) + (a.other ?? 0) : 0;
        return <div key={f.code} className="mfm-fb"><b>{nm(f.name)}</b>{a && t ? <span className="mfm-stack">{[["s", (a.equity ?? 0) / t, "Shares"], ["d", ((a.debt ?? 0) + (a.cash ?? 0)) / t, "Debt"], ["o", (a.other ?? 0) / t, "Gold and other"]].map(([c, v, l]) =>
          (v as number) > 0.005 ? <i key={c as string} className={"mfm-" + c} style={{ width: `${(v as number) * 100}%` }} title={`${l} ${p0(v as number)}`}>{(v as number) > 0.12 ? `${l} ${p0(v as number)}` : ""}</i> : null)}</span>
          : <span className="mfm-stack"><i className="mfm-u" style={{ width: "100%" }}>Holdings not loaded yet</i></span>}</div>; })}</div>
      <p className="sp-note"><i className="mfm-key mfm-s" /> Shares · <i className="mfm-key mfm-d" /> Debt and money market · <i className="mfm-key mfm-o" /> Gold and other · <i className="mfm-key mfm-u" /> Not loaded</p>
    </Section>
  );
}

export function SectorsInside({ sp, level, onLevel }: { sp: MfSpread; level: Level; onLevel: (l: Level) => void }) {
  const rows = gridRows(sp, level).filter((r) => r.name !== "Not classified");
  const funds = sp.funds.filter((f) => sp.perFund?.[String(f.code)]);
  const listRow = Object.fromEntries(rows.map((r) => [r.name, r.total / (sp.knownShares || 1)]));
  const max = Math.max(0.0001, ...funds.flatMap((f) => Object.values(sp.perFund?.[String(f.code)]?.[level] ?? {})));
  const top = (code: number) => Object.entries(sp.perFund?.[String(code)]?.[level] ?? {}).sort((a, b) => b[1] - a[1])[0];
  const cards: Card[] = [];
  const leans = funds.map((f) => [shortFund(f.name), top(f.code)] as const).filter(([, t]) => t);
  if (leans.length) cards.push({ kind: "insight", title: "Each fund has its own lean", text: leans.map(([n, t]) => `${n}: ${t![0]} ${p0(t![1])}`).join("; ") + "." });
  const shared = rows.find((r) => funds.filter((f) => (sp.perFund?.[String(f.code)]?.[level]?.[r.name] ?? 0) > 0.15).length >= 2);
  if (shared) cards.push({ kind: "watch", title: `${shared.name} sits in ${funds.filter((f) => (sp.perFund?.[String(f.code)]?.[level]?.[shared.name] ?? 0) > 0.15).length} funds`, text: `More than 15% of each of those funds is in ${shared.name}.` });
  return (
    <Section id="mfp-secin" hide title="Sectors inside each fund" help="Each fund's own money by NSE sector, from its latest monthly file; the last row is your list." how="Darker cells hold more of that fund. Read across a row for one fund's lean; down a column for how many funds share it."
      sub="Share of each fund's money in each sector. Darker cells hold more. The last row adds up your list.">
      <LevelSwitch level={level} onLevel={onLevel} sp={sp} />
      <WideBox title="Sectors inside each fund"><table className="sp-tb mfm-heat">
        <thead><tr><th scope="col">Fund</th>{rows.map((r) => <th key={r.name} scope="col"><span>{r.name}</span></th>)}</tr></thead>
        <tbody>{funds.map((f) => <tr key={f.code}><th scope="row">{shortFund(f.name)}</th>{rows.map((r) => { const v = sp.perFund?.[String(f.code)]?.[level]?.[r.name] ?? 0;
          return <td key={r.name} style={{ ["--mfm-a" as string]: String((v / max) * 0.7) }}>{v >= 0.005 ? p0(v) : v > 0 ? "<1%" : "–"}</td>; })}</tr>)}
          <tr className="mfm-list"><th scope="row">Your list</th>{rows.map((r) => <td key={r.name}>{p0(listRow[r.name])}</td>)}</tr></tbody>
      </table></WideBox>
      {sp.coverage.missing.length > 0 && <p className="sp-note">Not loaded yet, so not in this grid: {sp.coverage.missing.map((c) => shortFund(sp.funds.find((f) => f.code === c)?.name)).join(", ")}.</p>}
      <Insights items={cards} scope="mf.secin" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ sub-tab 2: how funds move together
const linkWord = (v: number) => (v >= 0.8 ? "rise and fall almost as one" : v >= 0.6 ? "move together closely" : v >= 0.4 ? "move together somewhat" : v >= 0.2 ? "are loosely linked" : "mostly go their own way");
export function pairText(sp: MfSpread, a: number, b: number) {
  const i = sp.together.codes.indexOf(a), j = sp.together.codes.indexOf(b);
  if (i < 0 || j < 0) return "";
  const fa = sp.funds.find((f) => f.code === a)!, fb = sp.funds.find((f) => f.code === b)!, v = sp.together.C[i][j];
  const ov = sp.overlap.find((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a));
  const same = [fa.category === fb.category ? "the same category" : "different categories", fa.amc === fb.amc ? "the same fund house" : "different fund houses"];
  return `${shortFund(fa.name)} and ${shortFund(fb.name)}: ${v.toFixed(2)}. They ${linkWord(v)}. ${ov ? `They keep ${Math.round(ov.pct)}% of their money in the same ${ov.n} stocks.` : "One of them has no holdings loaded, so shared stocks are not known."} ${same[0].charAt(0).toUpperCase() + same[0].slice(1)}, ${same[1]}.`;
}
export function MoveSection({ sp }: { sp: MfSpread }) {
  const codes = sp.together.codes, nm = (c: number) => shortFund(sp.funds.find((f) => f.code === c)?.name);
  const [pick, setPick] = useState<[number, number] | null>(codes.length > 1 ? [codes[0], codes[1]] : null);
  return (
    <Section id="mfp-move" hide title="How your funds move together" help="How closely each pair of your equity-type funds has moved, from weekly NAV changes over the past year. Liquid and overnight funds are left out." how="1.00: in step; near 0: unrelated. Tap a cell to read the pair: its correlation, the stocks they share, and whether they are the same category or fund house."
      sub={`Weekly NAV changes of each fund's Growth option, past year (${sp.together.weeks} weeks). Liquid funds are left out.`}>
      {codes.length > 1 ? <div className="mfm-pair">
        <Scroll label="how your funds move together"><table className="sp-tb mfm-cg"><thead><tr><th><span className="sr-only">Fund</span></th>{codes.map((c) => <th key={c} scope="col"><span>{nm(c)}</span></th>)}</tr></thead>
          <tbody>{codes.map((a, i) => <tr key={a}><th scope="row">{nm(a)}</th>{codes.map((b, j) => i === j ? <td key={b} className="self">–</td> :
            <td key={b} style={{ ["--mfm-a" as string]: String(Math.max(0, sp.together.C[i][j]) * 0.7) }} className={pick && ((pick[0] === a && pick[1] === b) || (pick[0] === b && pick[1] === a)) ? "on" : undefined}>
              <button type="button" aria-label={`${nm(a)} and ${nm(b)}: ${sp.together.C[i][j].toFixed(2)}`} onClick={() => setPick([a, b])}>{sp.together.C[i][j].toFixed(2)}</button></td>)}</tr>)}</tbody></table></Scroll>
        <div className="mfm-reader" aria-live="polite"><p className="sp-cap">Read a pair</p><p>{pick ? pairText(sp, pick[0], pick[1]) : "Tap a cell."}</p></div>
      </div> : <p className="sp-note">Needs a year of NAVs for at least two equity-type funds.</p>}
    </Section>
  );
}
export function SharedSection({ sp }: { sp: MfSpread }) {
  const nm = (c: number) => shortFund(sp.funds.find((f) => f.code === c)?.name);
  const pairs = [...sp.overlap].sort((a, b) => b.pct - a.pct), th = sp.readings.theme;
  const corr = (a: number, b: number) => { const i = sp.together.codes.indexOf(a), j = sp.together.codes.indexOf(b); return i >= 0 && j >= 0 ? sp.together.C[i][j] : null; };
  return (
    <Section id="mfp-shared" hide title="Stocks they share" help="For each pair of funds, the share of money both keep in the same stocks: for each stock in both, the smaller of the two weights, added up." how="Higher means the two funds hold more of the same. A fund whose file is not loaded is shown with a dashed line."
      sub="One card per pair of funds whose holdings are loaded.">
      <div className="mfm-cards">{pairs.map((o) => <div key={`${o.a}-${o.b}`} className="mfm-card"><p className="sp-cap">{nm(o.a)} · {nm(o.b)}</p><p className="mfm-rw"><b>{Math.round(o.pct)}%</b> <span>in {o.n} {o.n === 1 ? "stock" : "stocks"}</span></p></div>)}
        {sp.coverage.missing.map((c) => <div key={c} className="mfm-card dashed"><p className="sp-cap">{nm(c)}</p><p className="mfm-rl">Its monthly holdings are not loaded yet, so the stocks it shares are not known.</p></div>)}
        {th.theme && th.funds.length > 1 && <div className="mfm-card theme"><p className="sp-cap">Same theme twice</p><p className="mfm-rw"><b>{th.theme}</b> <span>{th.funds.map(nm).join(" · ")}</span></p>
          {corr(th.funds[0], th.funds[1]) != null && <p className="mfm-rl">They move together {corr(th.funds[0], th.funds[1])!.toFixed(2)}.</p>}</div>}</div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ sub-tab 3: large, mid, small and micro
export function SizesSection({ sp }: { sp: MfSpread }) {
  const funds = sp.funds.filter((f) => sp.perFund?.[String(f.code)]);
  const row = (sz: Record<string, number>, scale = 1) => { const l = (sz.Large ?? 0) * scale, m = (sz.Mid ?? 0) * scale, s = (sz.Small ?? 0) * scale, x = (sz.Micro ?? 0) * scale, u = (sz.Unsized ?? 0) * scale, o = Math.max(0, 1 - l - m - s - x - u);
    return <span className="mfm-stack">{[["L", l, "Large"], ["M", m, "Mid"], ["S", s, "Small"], ["X", x, "Micro"], ["U", u, "Not sized"], ["O", o, "Cash, debt and gold"]].map(([c, v, n]) => (v as number) > 0.005 ?
      <i key={c as string} className={"mfm-z" + c} style={{ width: `${(v as number) * 100}%` }} title={`${n} ${p0(v as number)}`}>{(v as number) > 0.08 ? p0(v as number) : ""}</i> : null)}</span>; };
  const micro = sp.size.Micro ?? 0, tot = sp.size.Large + sp.size.Mid + sp.size.Small + micro;
  return (
    <Section id="mfp-sizes" hide title="Large, mid, small and micro" help="The shares inside each fund by company size, on FinLit's ₹ rule: large above ₹75,000 Cr, mid ₹25,000 to 75,000 Cr, small ₹10,000 to 25,000 Cr, micro below ₹10,000 Cr." how="One bar per fund: large, mid, small and micro, then cash, debt and gold in grey. The list's total adds up the shares only."
      sub="One bar per fund; the list's total is for the shares only.">
      <div className="mfm-fbars">{funds.map((f) => <div key={f.code} className="mfm-fb"><b>{shortFund(f.name)}</b>{row(sp.perFund![String(f.code)].size)}</div>)}
        <div className="mfm-fb total"><b>Your list, shares only</b>{row({ Large: sp.size.Large / (tot || 1), Mid: sp.size.Mid / (tot || 1), Small: sp.size.Small / (tot || 1), Micro: micro / (tot || 1) })}</div></div>
      <p className="sp-note"><i className="mfm-key mfm-zL" /> Large · <i className="mfm-key mfm-zM" /> Mid · <i className="mfm-key mfm-zS" /> Small · <i className="mfm-key mfm-zX" /> Micro · <i className="mfm-key mfm-zO" /> Cash, debt and gold.
        Sizes follow FinLit's ₹ rule on the company's market value. SEBI's fund categories rank companies instead (the top 100 large, the next 150 mid), so a fund's category and these sizes can differ.</p>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ the three sub-tabs
type Sub = "hold" | "move" | "size";
const SUB_OF: Record<string, Sub> = { "mfp-money": "hold", "mfp-secin": "hold", "mfp-move": "move", "mfp-shared": "move", "mfp-sizes": "size" };
export function MixSubTabs({ sp, level, onLevel }: { sp: MfSpread; level: Level; onLevel: (l: Level) => void }) {
  const [sub, setSub] = useState<Sub>("hold");
  useEffect(() => { const on = (e: Event) => { const s = SUB_OF[(e as CustomEvent).detail as string]; if (s) setSub(s); }; addEventListener("eq-jump", on); return () => removeEventListener("eq-jump", on); }, []);
  const TABS: [Sub, string, string][] = [["hold", "What they hold", "Shares, debt, gold and sectors"], ["move", "How funds move together", "NAV moves and shared stocks"], ["size", "Large, mid, small and micro", "Company sizes inside each fund"]];
  return <>
    <div className="eqd-subbar mfm-subtabs" role="tablist" aria-label="Mix and overlap views">{TABS.map(([k, t, s]) => <button key={k} type="button" role="tab" aria-selected={sub === k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}><b>{t}</b><small>{s}</small></button>)}</div>
    {sub === "hold" && <><MoneySection sp={sp} /><SectorsInside sp={sp} level={level} onLevel={onLevel} /></>}
    {sub === "move" && <><MoveSection sp={sp} /><SharedSection sp={sp} /></>}
    {sub === "size" && <SizesSection sp={sp} />}
  </>;
}

// ------------------------------------------------------------------------------------------------ 8 Biggest stocks, 9 Trend
export type Big = { name: string; symbol: string | null; macro: string | null; size: string | null; w: number; funds: number[] };
export function BiggestSection({ rows, sp, readingOf, gold, mfOnly }: { rows: Big[]; sp: MfSpread; readingOf: (s: string | null) => Reading; gold: boolean; mfOnly?: boolean }) {
  const [all, setAll] = useState(false), nm = (c: number) => shortFund(sp.funds.find((f) => f.code === c)?.name);
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <Section id="mfp-biggest" hide title="Biggest stocks underneath" help="The largest holdings across your funds: each company's weight inside each fund times the fund's share of your list, added up." how={`"Of your funds" is that share of your list. The reading is the company's ${gold ? "FinLit Prism" : "FinLit IQ"} on your plan.`}
      sub={`The ${rows.length} largest holdings across your funds, and which funds hold them. Reading: ${mfOnly ? "names only on this plan" : gold ? "FinLit Prism" : "FinLit IQ"}.`}>
      <Scroll label="biggest stocks underneath"><table className="sp-tb mfm-big kit-grid"><thead><tr><th scope="col">Stock</th><th scope="col">Macro sector</th><th scope="col">Size</th><th scope="col" className="r">Of your funds</th><th scope="col">Held by</th><th scope="col">{gold ? "FinLit Prism" : "FinLit IQ"}</th></tr></thead>
        <tbody>{shown.map((r) => { const rd = readingOf(r.symbol); return <tr key={r.symbol ?? r.name}>
          <th scope="row">{r.symbol ? <Link to={`/stocks/${r.symbol}`} title={coTitle({ symbol: r.symbol, name: r.name })}>{titleOf({ symbol: r.symbol, name: r.name })}</Link> : r.name}<small className="mfp-sub">{r.symbol ? subLine({ symbol: r.symbol, name: r.name }, r.name) : r.name}</small></th><td>{r.macro ?? "–"}</td><td>{r.size ? <span className="mfm-sz">{r.size[0]}</span> : "–"}</td>
          <td className="r">{(r.w * 100).toFixed(2)}%</td><td><span className="mfm-held">{r.funds.map((c) => <span key={c}>{nm(c)}</span>)}</span></td>
          <td>{mfOnly ? <Link to="/plans" className="mfm-lock">🔒 Silver</Link> : rd?.score != null ? <span className="mff-score"><b className={"mff-num " + tone(rd.word)}>{Math.round(rd.score)}</b> <span className={"mff-w " + tone(rd.word)}>{rd.word}</span></span> : <span className="sp-note">Not rated</span>}</td></tr>; })}</tbody></table></Scroll>
      {rows.length > 5 && <button type="button" className="eq-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : `Show all ${rows.length} ▾`}</button>}
    </Section>
  );
}
export function TrendUnder({ sp, gold }: { sp: MfSpread; gold: boolean }) {
  if (!gold || !sp.trend) return <GoldLock id="mfp-trend" title="Short- and long-term trend underneath" text="How the stocks inside your funds are trending, short and long term, from FinLit Prism's technical view." />;
  const rated = sp.trend.all.rated, n = sp.trend.all.n;
  return (
    <section className="sp-sec" aria-labelledby="mfp-trend"><details className="mfm-fold"><summary><span><h2 id="mfp-trend">Short- and long-term trend underneath</h2><small>{rated} of {n} stocks rated, by share of your funds. From FinLit Prism's technical views.</small></span><span className="sp-show">Show ▾</span></summary>
      <TrendCard t={sp.trend} nm={(c) => shortFund(sp.funds.find((f) => f.code === c)?.name)} /></details></section>
  );
}

export function MixTab({ sp, readingOf, gold, big }: { sp: MfSpread; readingOf: (s: string | null) => Reading; gold: boolean; big: Big[] }) {
  const [level, setLevel] = useLevel();
  return <>
    <OwnSection sp={sp} level={level} onLevel={setLevel} readingOf={readingOf} gold={gold} />
    <SpreadSection sp={sp} />
    <MixSubTabs sp={sp} level={level} onLevel={setLevel} />
    {big.length > 0 && <BiggestSection rows={big} sp={sp} readingOf={readingOf} gold={gold} />}
    <TrendUnder sp={sp} gold={gold} />
  </>;
}

