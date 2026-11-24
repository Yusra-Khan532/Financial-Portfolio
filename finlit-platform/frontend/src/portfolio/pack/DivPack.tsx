// Task #183 W7: the Equity portfolio's Diversification analytics tab as the 15 Nov pack draws it (01-equity-portfolio, D50–D71): Where it sits (macro sector × size,
// one chip per share), How spread out is the list?, three sub-tabs (how sectors move together · how stocks move together · large, mid, small and micro), Share by share,
// and the style tilt (Gold). Figures from the server's page answer, worked out in lib/eqDiv. Every class is eqd-. Describes how prices moved; never advice.
import type { DivFacts } from "../../lib/keyAnswers";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Section } from "../../components/sectors/pack/Common";
import { FrozenTable, Info, ShowAll, cap1, corrText, corrWord, countOf, gridLine, macroNote, sectorsLine, moneyGrid, pluralOf, rowMoneyLine, shareText, shortCo, spreadCards, spreadNote, independentNote, useCap, whereLine, withCorrWords, type SpreadFigs } from "../shared";
import { GridFold, PairsChart, ReadPanel, type Pick } from "./Div385";
import { Insights, More } from "./EquityPack";
import { averageLinkage, divKeyCards, effective, groupCard, heatOf, looserFamilies, pairsOf, sameVsDiff, sectorCards, sizeCards, sizeFigures, tiesOf, two, whereGrid, SIZES3, type Level, type Size3 } from "../../lib/eqDiv";
import type { PageObject } from "../types";
import "./div-pack.css";

/** A cell's shade: deeper with a closer link (0 to 1). */
const shade = (v: number | null) => (v == null ? undefined : { background: `color-mix(in srgb, var(--eqd-heat) ${Math.round(Math.max(0, Math.min(1, v)) * 100)}%, var(--eqd-heat0))`, color: v >= 0.45 ? "#fff" : undefined });
/** Plain words for one correlation (kept for its importers; task #385 reads every correlation with corrWord from ../shared, file 33's cut-offs). */
export const linkWord = (v: number) => (v >= 0.65 ? "move almost as one" : v >= 0.5 ? "move together closely" : v >= 0.35 ? "move together somewhat" : v >= 0.2 ? "are loosely linked" : "mostly go their own way");

export type DivInput = { page: PageObject; symbols: string[]; levelOf: (s: string, l: Level | "industry") => string; sizeOf: (s: string) => Size3 | null; band: (s: string) => "g" | "m" | "b" | null; gold: boolean; nameOf: (s: string) => string };

// ------------------------------------------------------------------------------------------------ a box wider than the page: slider and Expand
/** Content that may be wider than its box: a slider under it scrolls it sideways, and Expand ⤢ opens it over the page (Esc or Close brings it back). */
export function WideBox({ title, children }: { title: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null), [wide, setWide] = useState(false), [pos, setPos] = useState(0), [big, setBig] = useState(false);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const check = () => setWide(el.scrollWidth > el.clientWidth + 2);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check); ro.observe(el); return () => ro.disconnect();
  }, [children]);
  useEffect(() => { if (!big) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setBig(false); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [big]);
  const slide = (v: number) => { setPos(v); const el = box.current; if (el) el.scrollLeft = ((el.scrollWidth - el.clientWidth) * v) / 100; };
  return (
    <div className={"eqd-wide" + (big ? " big" : "")} role={big ? "dialog" : undefined} aria-modal={big || undefined} aria-label={big ? title : undefined}>
      <div className="eqd-wide-bar">
        {big && <b>{title}</b>}
        {(wide || big) && <button type="button" className="eqd-xbtn" onClick={() => setBig(!big)}>{big ? "Close ✕" : "Expand ⤢"}</button>}
      </div>
      <div ref={box} className="eqd-wide-box" tabIndex={0} role="region" aria-label={title} onScroll={(e) => { const el = e.currentTarget; const m = el.scrollWidth - el.clientWidth; setPos(m > 0 ? (el.scrollLeft / m) * 100 : 0); }}>{children}</div>
      {wide && !big && <label className="eqd-slide"><span className="sr-only">Scroll {title} sideways</span><span aria-hidden="true">◀</span><input type="range" min={0} max={100} value={Math.round(pos)} onChange={(e) => slide(+e.target.value)} /><span aria-hidden="true">▶</span></label>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ 1 Where it sits
/** Step 1 (moved here from the Portfolio tab): macro sector × size, one chip per share with its FinLit Prism band (Gold; names only otherwise, task #283), darker cells holding more,
 *  each row's share of the list, and totals that add to 100% (D52, D53). Task #385: a switch counts the grid By number of shares or By money (each cell's %
 *  its shares' value over the list's value, its shade 16% + 54% × its value ÷ the largest cell's value); a cell with more than 5 shares shows 4 chips and
 *  "+N more", which opens the cell; macro sectors are written out, each with a one-line note; the grid keeps its first column put on a phone.
 *  `worth`: each share's value now (the switch shows only when every share has one). `onLine`: the phone's folded summary line. */
export function WhereSitsGrid({ d, worth, onLine }: { d: DivInput; worth?: (s: string) => number | null | undefined; onLine?: (s: string) => void }) {
  const g = useMemo(() => whereGrid(d.symbols, (s) => d.levelOf(s, "macro"), d.sizeOf), [d]);
  const mg = useMemo(() => (worth ? moneyGrid(g, d.symbols, worth, (s) => d.levelOf(s, "macro")) : null), [g, d, worth]);
  const [by, setBy] = useState<"count" | "money">("count"), [openCells, setOpenCells] = useState<Set<string>>(new Set());
  const money = by === "money" && !!mg;
  const sizeLabel: Record<Size3, string> = { Large: "Large cap", Mid: "Mid cap", Small: "Small cap", Micro: "Micro cap" };
  const line = whereLine(g.rows.map((r) => ({ name: r.name, pct: money && mg ? mg.row(r.name).pct : r.pct })), money);
  useEffect(() => { onLine?.(line); }, [line, onLine]);
  const toggleCell = (k: string) => setOpenCells((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <Section id="eq-where" hide title="Where your list sits: macro sector and size" help="Each share in one row, its NSE macro sector, and one column, its size: large, mid, small or micro." how="By number of shares, each share counts once and the last column is the row's share of the list; by money, each cell counts what its shares are worth now. Rows and columns each add to 100%."
      sub={<>{d.gold ? "Each chip is one share; its dot shows the FinLit Prism band." : "Each chip is one share (names only on this plan; the dots show FinLit Prism, see plans)."} Darker cells carry more of the list. Large above ₹75,000 Cr · Mid ₹25,000–75,000 Cr · Small ₹10,000–25,000 Cr · Micro below ₹10,000 Cr.</>}>
      {mg && <div className="eqv-sw"><div className="eqd-seg" role="group" aria-label="Count the list by"><button type="button" aria-pressed={!money} onClick={() => setBy("count")}>By number of shares</button><button type="button" aria-pressed={money} onClick={() => setBy("money")}>By money</button></div>
        <span>{money ? "By what each share is worth now. Darker cells carry more of your money." : "Each share counts once. Darker cells carry more of your shares."}</span></div>}
      <FrozenTable label="where your list sits"><table className="eqd-ws">
        <thead><tr><th scope="col">Macro sector</th>{g.cols.map((c) => <th key={c.k} scope="col">{sizeLabel[c.k]} <span className="eqd-mute">· {c.n}</span></th>)}<th scope="col">Of the list</th></tr></thead>
        <tbody>{g.rows.map((r) => <tr key={r.name}><th scope="row">{r.name}{macroNote(r.name) && <small className="eqv-macro">{macroNote(r.name)}</small>}</th>
          {r.cells.map((c) => { const m = mg?.cell(r.name, c.k), key = r.name + "|" + c.k, many = c.who.length > 5, open = openCells.has(key), shown = many && !open ? c.who.slice(0, 4) : c.who;
            const pct = money && m ? m.pct : c.pct, shade = money && m ? m.shade : Math.round(15 + (c.who.length / g.max) * 55);
            return <td key={c.k} className={c.who.length ? "" : "e"} style={c.who.length ? { background: `color-mix(in srgb, var(--eqd-sit) ${shade}%, var(--s1))` } : undefined}>
              {c.who.length > 0 && <><span className="eqd-chips">{shown.map((s) => <span key={s} className="eqd-chip" title={`${d.nameOf(s)} · ${d.levelOf(s, "industry")}`}><i className={"b-" + (d.band(s) ?? "n")} aria-hidden="true" />{shortCo(d.nameOf(s), s)}</span>)}
                {many && <button type="button" className="eqd-chip eqv-chm" aria-expanded={open} onClick={() => toggleCell(key)}>{open ? "Fewer ▴" : `+${c.who.length - 4} more`}</button>}</span><small>{shareText(pct)}</small></>}</td>; })}
          <td className="eqd-of">{money && mg ? (() => { const x = mg.row(r.name); return <><b>{shareText(x.pct)}</b><span className="eqd-ob" aria-hidden="true"><i style={{ width: `${x.pct}%` }} /></span><small>{rowMoneyLine(r.n, x.v)}</small></>; })()
            : <><b>{shareText(r.pct)}</b><span className="eqd-ob" aria-hidden="true"><i style={{ width: `${r.pct}%` }} /></span><small>{countOf(r.n, "share")}</small></>}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">All macro sectors</th>{g.cols.map((c) => <td key={c.k}><b>{countOf(c.n, "share")}</b> · {shareText(money && mg ? mg.col(c.k) : c.pct)}</td>)}<td><b>100%</b></td></tr></tfoot>
      </table></FrozenTable>
      {d.gold && <p className="eqd-key"><span><i className="b-g" />Strong or Healthy Prism</span><span><i className="b-m" />Average</span><span><i className="b-b" />Weak</span><span><i className="b-n" />Not scored yet</span></p>}
      {g.noSize.length > 0 && <p className="sp-note">No size band yet for {g.noSize.map((s) => shortCo(d.nameOf(s), s)).join(", ")}: counted in the row total, not in a size column.</p>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2 How spread out is the list?
/** Task #385: the score counts by what you own now when every share has a quantity (open item 7), with "Equal amounts" as a switch; chips read the singular
 *  for one; one note under the two readings ties it to the Diversification card; "How independently they move" says how it is scaled (open item 12); the good sign
 *  needs two or more macro sectors (open item 11). `byValue`: the score by value (POST /api/portfolio/score), null until every share has a quantity. */
export function SpreadPack({ d, byValue = null }: { d: DivInput; byValue?: SpreadFigs | null }) {
  const [mode, setMode] = useState<"value" | "equal">("value");
  const eq = d.page.score, use = mode === "value" && byValue ? "value" : "equal", s = use === "value" && byValue ? byValue : eq, n = d.page.order.length, N = d.symbols.length;
  const lv = (l: Level | "industry") => new Set(d.symbols.map((x) => d.levelOf(x, l))).size;
  const macro = lv("macro"), sector = lv("sector"), ind = lv("industry");
  const top = Object.entries(d.symbols.reduce<Record<string, number>>((a, x) => { const k = d.levelOf(x, "macro"); a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0] ?? null;
  const ones = Object.values(d.symbols.reduce<Record<string, number>>((a, x) => { const k = d.levelOf(x, "industry"); a[k] = (a[k] ?? 0) + 1; return a; }, {})).filter((v) => v === 1).length;
  const sz = SIZES3.map((k) => d.symbols.filter((x) => d.sizeOf(x) === k).length), nSz = sz.filter(Boolean).length;
  const cards = spreadCards({ n: N, macro, sector, ind, top, ones, sizes: sz });
  const chip = (k: number, one: string) => <span key={one}><b>{k}</b> {k === 1 ? one : pluralOf(one)}</span>;
  const by = use === "value" ? "by money" : "by sector", es = s.effective_sectors.toFixed(1);
  return (
    <Section id="eq-spread" hide title="How spread out is the list?" help="The diversification score, 0 to 100: how widely the shares spread across NSE's 12 macro sectors and how independently they move." how="Higher means more spread. Moves like counts shares that rise and fall together as one bet, so a list of many shares can still read as fewer. It measures how spread out the list is, not how safe it is."
      sub="Two readings: how widely the list is spread across sectors, and how independently the shares move.">
      {byValue && <div className="eqv-sw"><div className="eqd-seg" role="group" aria-label="Count each share"><button type="button" aria-pressed={use === "value"} onClick={() => setMode("value")}>By what you own now</button><button type="button" aria-pressed={use === "equal"} onClick={() => setMode("equal")}>Equal amounts</button></div>
        <span>{use === "value" ? "Each share counts by what it is worth now, as on the Diversification card." : "Each share counts the same, whatever it is worth."}</span></div>}
      <div className="spx">
        <div className="spx-sc">
          <div className="spx-ring" role="img" aria-label={`Spread score ${Math.round(s.score)} out of 100, ${s.band}`}>
            <svg width="132" height="132" viewBox="0 0 120 120" aria-hidden="true"><circle className="tr" cx="60" cy="60" r="52" /><circle className="fg" cx="60" cy="60" r="52" strokeDasharray={`${((Math.max(0, Math.min(100, s.score)) / 100) * 326.7).toFixed(1)} 326.7`} transform="rotate(-90 60 60)" /></svg>
            <span className="spx-n"><b>{Math.round(s.score)}</b><small>of 100</small></span></div>
          <div className="spx-w"><p className="spx-k">Spread score</p><p className="spx-word">{s.band}</p>
            <div className="spx-line" aria-hidden="true"><i style={{ left: `${Math.max(0, Math.min(100, s.score))}%` }} /></div><p className="spx-ends"><span>All in one bet</span><span>Widely spread</span></p>
            <p className="spx-chips">{chip(macro, "macro sector")}{chip(sector, "sector")}{chip(ind, "industry")}<span key="size"><b>{nSz}</b> {nSz === 1 ? "size" : "sizes"}</span></p>
            <p className="eqv-note spx-note">{spreadNote(use, eq, byValue, n)}</p></div>
        </div>
        <div className="spx-parts"><p className="spx-k">Built from two readings<Info about="Built from two readings" text="The spread score brings together how independently your shares move and how widely they spread across macro sectors. It measures how spread out the list is, not how safe it is." /></p>
          <div className="spx-p"><div className="spx-ph"><b>Across sectors</b><span>{Math.round(s.sector_spread)}</span></div><div className="spx-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.sector_spread)}%` }} /></div>
            <p>{countOf(N, "share")} across {countOf(macro, "macro sector")}, {countOf(sector, "sector")} and {countOf(ind, "industry")}{top && N > 1 && top[1] / N >= 0.25 ? `; ${top[1] === N ? "all of them are" : `${top[1]} of them ${top[1] === 1 ? "is" : "are"}`} ${top[0]}, so ${by} the list spreads like about ${es} ${es === "1.0" ? "macro sector" : "macro sectors"}` : `; ${by} the list spreads like about ${es} macro sectors`}.</p></div>
          <div className="spx-p"><div className="spx-ph"><b>How independently they move</b><span>{Math.round(s.comovement)}</span></div><div className="spx-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.comovement)}%` }} /></div>
            <p>{independentNote(s, n)}</p></div>
        </div>
        <div className="spx-bets"><p className="spx-k">Moves like<Info about="Moves like" text={`Shares that rise and fall together count as one bet. "Moves like ${s.effective_stocks.toFixed(1)} of ${n}" means the ${countOf(n, "share")} have behaved like about ${s.effective_stocks.toFixed(1)} shares that each move on their own. ${use === "value" ? "Here each share counts by what you own now, as on the Diversification card." : "Here each share counts equally."}`} /></p>
          <p className="spx-big"><b>{s.effective_stocks.toFixed(1)}</b> of {countOf(n, "share")}</p>
          <div className="spx-dots" role="img" aria-label={`${countOf(n, "share")} behave like about ${s.effective_stocks.toFixed(1)} independent ones`}>
            <div className="r1">{Array.from({ length: n }, (_, i) => <i key={i} />)}</div><span className="ar" aria-hidden="true">↓</span>
            <div className="r2">{Array.from({ length: Math.ceil(s.effective_stocks) }, (_, i) => { const f = Math.min(1, s.effective_stocks - i); return <i key={i} className={f < 1 ? "part" : "b"} style={f < 1 ? { ["--f" as string]: f.toFixed(2) } : undefined} />; })}</div></div>
          <p>Your {countOf(n, "share")} with a year or more of prices behave like about {s.effective_stocks.toFixed(1)} that move independently. Shares that rise and fall together count as one bet.</p></div>
      </div>
      <Insights items={cards} scope="eq.spread" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 3–5 the three sub-tabs
type Sub = "sectors" | "groups" | "sizes";
const SUBS: [Sub, string, string, string][] = [["sectors", "eq-sectors", "How sectors move together", "Sector against sector"], ["groups", "eq-groups", "How stocks move together", "Groups found from prices"], ["sizes", "eq-sizes", "Large, mid, small and micro", "Do company sizes move together?"]];
/** Three sub-tabs under one bar (D54). A jump to a sub-tab's section (Key figures, the sections bar) opens that sub-tab first. */
export function DivSubTabs({ d }: { d: DivInput }) {
  const [sub, setSub] = useState<Sub>("sectors");
  useEffect(() => { const on = (e: Event) => { const id = (e as CustomEvent<string>).detail, hit = SUBS.find((x) => x[1] === id); if (hit) setSub(hit[0]); }; addEventListener("eq-jump", on); return () => removeEventListener("eq-jump", on); }, []);
  return (
    <div className="eqd-subs" id="eq-moves">   {/* task #274 (change 17): one step, "How the list moves together", with the three ways as tabs */}
      <p className="x2-k" aria-hidden="true">How the list moves together <small>{SUBS.length} ways to look · tap one</small></p>
      <div className="eqd-subbar" role="tablist" aria-label="How the list moves together">{SUBS.map(([k, , t, s], i) => <button key={k} type="button" role="tab" aria-selected={sub === k} aria-controls={"eqd-p-" + k} id={"eqd-t-" + k} onClick={() => setSub(k)}><span className="xn" aria-hidden="true">{i + 1}</span><b>{t}</b><small>{s}</small></button>)}</div>
      <div role="tabpanel" id={"eqd-p-" + sub} aria-labelledby={"eqd-t-" + sub}>
        {sub === "sectors" ? <SectorsPanel d={d} /> : sub === "groups" ? <GroupsPanel d={d} /> : <SizesPanel d={d} />}
      </div>
    </div>
  );
}

function SectorsPanel({ d }: { d: DivInput }) {
  const [lv, setLv] = useState<Level>("macro"), [pick, setPick] = useState<[string, string] | null>(null);
  const o = d.page.order, C = d.page.corr, of = (s: string) => d.levelOf(s, lv), word = lv === "macro" ? "macro sector" : "sector";
  const heat = useMemo(() => heatOf(o, C, of), [o, C, lv]); // eslint-disable-line react-hooks/exhaustive-deps
  const sd = useMemo(() => sameVsDiff(o, C, of), [o, C, lv]); // eslint-disable-line react-hooks/exhaustive-deps
  const ties = useMemo(() => tiesOf(o, C, of), [o, C, lv]); // eslint-disable-line react-hooks/exhaustive-deps
  const nMacro = new Set(o.map((s) => d.levelOf(s, "macro"))).size, nSec = new Set(o.map((s) => d.levelOf(s, "sector"))).size;
  const cross = heat.names.flatMap((a, i) => heat.names.slice(i + 1).map((b) => ({ a, b, ...heat.cell(a, b) }))).filter((x) => x.avg != null) as { a: string; b: string; avg: number; pairs: number }[];
  const hi = [...cross].sort((x, y) => y.avg - x.avg), all = pairsOf(o, C).map((p) => p.corr).sort((a, b) => a - b);
  const typical = all.length ? all[Math.floor(all.length / 2)] : null, maxTie = Math.max(0.01, ...ties.map((t) => t.avg));
  const Title = cap1(word) + " against " + word;
  const sel = pick ? heat.cell(pick[0], pick[1]) : null;
  const tiesCap = useCap(ties);
  const cw = (v: number | null | undefined) => (v == null ? null : <span className="eqv-cw">{cap1(corrWord(v))} linked</span>);
  const pairLi = (x: { a: string; b: string; avg: number }) => <li key={x.a + x.b}><span title={`${x.a} and ${x.b}`}><b>{x.a}</b> and <b>{x.b}</b></span><small>{corrWord(x.avg)}</small><b>{two(x.avg)}</b></li>;
  return (
    <Section id="eq-sectors" hide title={`Do your ${word}s move together?`} help={`For each pair of ${word}s, the average correlation of their shares' weekly prices over the past two years.`} how="0 means no link; 1 means they move as one. Below 0.2 reads barely linked, 0.2 to 0.4 loosely, 0.4 to 0.6 partly, 0.6 and above closely."
      sub="0 means no link; 1 means they move as one. Weekly prices, past two years.">
      <div className="eqd-tools"><div className="eqd-seg" role="group" aria-label="Level"><button type="button" aria-pressed={lv === "macro"} onClick={() => { setLv("macro"); setPick(null); }}>Macro sector · {nMacro}</button><button type="button" aria-pressed={lv === "sector"} onClick={() => { setLv("sector"); setPick(null); }}>Sector · {nSec}</button></div></div>
      <div className="eqd-k3">
        <div className="eqd-kpi"><p className="sp-cap">Shares in the same {word}<Info about={`Shares in the same ${word}`} text={`The average correlation of every pair of your shares in the same ${word}.`} how="0 means no link; 1 means they move as one. Compare it with the next figure." /></p><b>{two(sd.same.avg)}</b>{cw(sd.same.avg)}<small>{countOf(sd.same.pairs, "pair")}</small></div>
        <div className="eqd-kpi"><p className="sp-cap">Shares in different {word}s<Info about={`Shares in different ${word}s`} text={`The average correlation of every pair of your shares in two different ${word}s.`} how={`Well below the same-${word} figure: the ${word}s spread the list. Close to it: they move much alike.`} /></p><b>{two(sd.diff.avg)}</b>{cw(sd.diff.avg)}<small>{countOf(sd.diff.pairs, "pair")}{sd.same.avg != null && sd.diff.avg != null ? (Math.abs(sd.same.avg - sd.diff.avg) < 0.1 ? ` · close to the same-${word} figure` : ` · well below the same-${word} figure`) : ""}</small></div>
        <div className="eqd-kpi"><p className="sp-cap">Goes its own way most<Info about={`The ${word} that goes its own way most`} text={`The ${word} whose shares move least with the rest of your list.`} how="The figure under it is its average correlation with the rest: the lower, the more it goes its own way." /></p><b className="eqd-serif">{ties[0]?.name ?? "–"}</b><small>{ties[0] ? `${two(ties[0].avg)} with the rest of the list · ${corrWord(ties[0].avg)} linked` : `Needs two or more ${word}s.`}</small></div>
      </div>
      <div className="eqd-two">
        <div>
          <h3 className="eqd-h3">{Title}<Info about={Title} text={`How closely each pair of ${word}s moves, from their shares' weekly prices.`} how={`Darker: the two ${word}s move together more. Outlined: shares inside one ${word}. Tap a cell to read it.`} /></h3>
          <p className="sp-note">Darker: the two {word}s move together more. Outlined: shares inside one {word}. Tap a cell.</p>
          <GridFold rows={heat.names.length} what={`every pair of ${word}s, with its figure`}>
            <FrozenTable label={Title} className="eqv-frz"><table className="eqd-heat"><thead><tr><td />{heat.names.map((c) => <th key={c} scope="col" title={lv === "macro" ? macroNote(c) : undefined}>{c}</th>)}</tr></thead>
              <tbody>{heat.names.map((r) => <tr key={r}><th scope="row" title={lv === "macro" ? macroNote(r) : undefined}>{r} · {heat.count[r]}</th>{heat.names.map((c) => { const x = heat.cell(r, c), self = r === c;
                return <td key={c} className={self ? "self" : ""}>{x.avg == null ? <span className="eqd-one">{self ? "1 share" : "–"}</span>
                  : <button type="button" style={self ? undefined : shade(x.avg)} aria-pressed={!!pick && ((pick[0] === r && pick[1] === c) || (pick[0] === c && pick[1] === r))} aria-label={`${r} and ${c}: ${two(x.avg)}`} onClick={() => setPick([r, c])}>{two(x.avg)}</button>}</td>; })}</tr>)}</tbody></table></FrozenTable>
          </GridFold>
          <div className="eqd-reader" aria-live="polite"><h3 className="eqd-h3">Read a cell<Info about={`Read a cell of the ${word} grid`} text="The pair you tapped in the grid, in words." how="Tap any cell in the grid; this box says how closely those two move and how many pairs of shares the figure rests on." /></h3>
            {pick && sel?.avg != null ? <p><b>{pick[0] === pick[1] ? `Inside ${pick[0]}` : `${pick[0]} · ${pick[1]}`}: {two(sel.avg)}</b>. Across {countOf(sel.pairs, "pair")} of shares, they are {corrWord(sel.avg)} linked.</p> : null}
            <dl><div><dt>Strongest link</dt><dd>{hi[0] ? `${hi[0].a} · ${hi[0].b} ${corrText(hi[0].avg)}` : "–"}</dd></div><div><dt>Weakest link</dt><dd>{hi.length ? `${hi[hi.length - 1].a} · ${hi[hi.length - 1].b} ${corrText(hi[hi.length - 1].avg)}` : "–"}</dd></div><div><dt>Typical pair in your list</dt><dd>{typical == null ? "–" : corrText(typical)}</dd></div></dl></div>
        </div>
        <div>
          <h3 className="eqd-h3">Tied to the rest of your list<Info about={`Each ${word} tied to the rest of your list`} text={`Each ${word}'s shares against every share outside it: their average correlation.`} how="A short bar moves least with the rest and steadies the list most; a long bar moves with it." /></h3>
          <p className="sp-note">Shortest first. A short bar steadies the list most.</p>
          {!ties.length && <p className="sp-note">All your shares sit in one {word}, so there is nothing outside it to set them against.</p>}
          <ul className="eqd-ties" id="eqd-ties">{tiesCap.shown.map((t) => <li key={t.name}><span>{t.name} · {t.n}</span><span className="t" aria-hidden="true"><i style={{ width: `${(t.avg / maxTie) * 100}%` }} /></span><b>{two(t.avg)}<small>{corrWord(t.avg)}</small></b></li>)}</ul>
          {tiesCap.capped && <ShowAll n={ties.length} noun={word} open={tiesCap.open} onToggle={tiesCap.toggle} controls="eqd-ties" />}
          {hi.length > 0 && <div className="eqd-pairs"><p className="sp-cap">Different {word}s, moving together</p><ul>{hi.slice(0, 3).map(pairLi)}</ul></div>}
          {hi.length > 1 && <div className="eqd-pairs"><p className="sp-cap">Most independent {word}s</p><ul>{[...hi].reverse().slice(0, 3).map(pairLi)}</ul></div>}
        </div>
      </div>
      <Insights items={sectorCards(ties, heat, word).map((c) => ({ ...c, text: withCorrWords(c.text) }))} scope={"eq.sectors." + lv} />
    </Section>
  );
}

function GroupsPanel({ d }: { d: DivInput }) {
  const [f, setF] = useState<"all" | "cross" | "same">("all"), [more, setMore] = useState(false);
  const o = d.page.order, C = d.page.corr, of = (s: string) => d.levelOf(s, "macro"), lab = (s: string) => shortCo(d.nameOf(s), s);
  const groups = d.page.groups.map((g) => ({ ...g, ...groupCard(g.members, g.avg_corr, o, C, of, d.sizeOf) }));
  const inGroup = groups.reduce((a, g) => a + g.members.length, 0), cross = groups.filter((g) => g.cross).length, bets = groups.reduce((a, g) => a + g.bets, 0);
  const shown = groups.filter((g) => f === "all" || (f === "cross") === g.cross), first = more ? shown : shown.slice(0, 6);
  const fam = useMemo(() => looserFamilies(o, C, d.page.groups), [o, C, d.page.groups]);
  return (
    <Section id="eq-groups" hide title="How stocks move together" help="Groups found from each pair of shares' weekly prices, not from sector labels: average-linkage clustering on 1 − correlation, cut at 0.5." how="Shares in one group average a correlation of 0.50 or more (partly linked or closer): they have tended to rise and fall together. Crosses sectors: the group joins shares from different sectors."
      sub="Found from each pair of shares, not from sector labels. A group's shares average a correlation of 0.50 or more.">
      <div className="eqd-tools"><div className="eqd-seg" role="group" aria-label="Show"><button type="button" aria-pressed={f === "all"} onClick={() => setF("all")}>All groups</button><button type="button" aria-pressed={f === "cross"} onClick={() => setF("cross")}>Crosses sectors</button><button type="button" aria-pressed={f === "same"} onClick={() => setF("same")}>One sector</button></div></div>
      {!groups.length ? <p className="sp-empty">No group of shares moves together closely (0.50 or more): your shares move fairly independently of each other.</p> : <>
        <div className="eqd-k3">
          <div className="eqd-kpi"><p className="sp-cap">Shares in a group</p><b>{inGroup} of {o.length}</b><small>the rest move fairly independently</small></div>
          <div className="eqd-kpi"><p className="sp-cap">Groups that cross sectors</p><b>{cross} of {groups.length}</b><small>{cross ? "sector labels alone would miss these" : "every group sits inside one sector"}</small></div>
          <div className="eqd-kpi"><p className="sp-cap">{countOf(inGroup, "grouped share")} count as</p><b>about {Math.round(bets)} {Math.round(bets) === 1 ? "bet" : "bets"}</b><small>for spreading risk</small></div>
        </div>
        <div className="eqd-gcards">{first.map((g) => <div key={g.letter} className={"eqd-gcard" + (g.cross ? " x" : "")}>
          <p className="eqd-gh"><b>{countOf(g.members.length, "share")} · {corrText(g.avg_corr)} on average</b><span className={"eqd-xb" + (g.cross ? "" : " s")}>{g.cross ? "Crosses sectors" : "One sector"}</span></p>
          <p className="eqd-gchips">{g.members.map((m) => <span key={m} className="eqd-chip" title={`${d.nameOf(m)} · ${d.levelOf(m, "industry")}`}><i className={"b-" + (d.band(m) ?? "n")} aria-hidden="true" />{lab(m)}</span>)}</p>
          <p className="eqd-gsec">{g.name}</p>
          <p className="eqd-gfacts"><span>Counts as about <b>{g.bets.toFixed(1)}</b> {g.bets < 1.95 ? "bet" : "bets"}</span>{g.cross && g.withOwn != null && <span>With own sector: <b>{corrText(g.withOwn)}</b></span>}{g.sizeWord && <span>{g.sizeWord}</span>}</p>
        </div>)}</div>
        {shown.length > 6 && <button type="button" className="eq-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Show fewer groups ▴" : `Show ${shown.length - 6} more ${shown.length - 6 === 1 ? "group" : "groups"} ▾`}</button>}
        {!shown.length && <p className="sp-note">{f === "cross" ? "No group crosses sectors." : "No group sits inside one sector."}</p>}
        <details className="eqd-fam"><summary><b>Looser families</b><Info about="Looser families" text="Wider groups that join up when the net widens: shares that average 0.35 or more with each other." how="Each family joins two or more of the groups above, or a group and other shares. They move together less tightly than a group." /><span className="eqd-mute">{fam.length ? `${fam.length} wider ${fam.length === 1 ? "group" : "groups"} that join up when the net widens` : "None: the groups stay apart even with a wider net"} · Show ▾</span></summary>
          {fam.map((x, i) => <p key={i} className="eqd-famr"><b>{countOf(x.members.length, "share")}</b> · <More names={x.members.map(lab)} show={8} /> <span className="eqd-mute">· joins {x.joins} {x.joins === 1 ? "group" : "groups"}</span></p>)}</details>
      </>}
    </Section>
  );
}

function SizesPanel({ d }: { d: DivInput }) {
  const f = useMemo(() => sizeFigures(d.page.order, d.page.corr, d.sizeOf), [d]);
  const maxTop = Math.max(1, ...f.mix.map((m) => m.top)), lead = f.mix[0];
  return (
    <Section id="eq-sizes" hide title="Do large, mid, small and micro companies move together?" help="How closely shares move with others of the same size, and with the other sizes, from weekly prices." how="0 means no link; 1 means they move as one. A size that moves closely with itself acts more like one bet."
      sub="How closely shares move with others of the same size, and with the other sizes. 0 means no link; 1 means they move as one.">
      <div className="eqd-k3">{f.within.map((w) => <div key={w.k} className="eqd-kpi"><p className="sp-cap">{w.k} companies · {w.n} counted</p><b>{two(w.avg)}</b>{w.avg != null && w.n > 1 && <span className="eqv-cw">{cap1(corrWord(w.avg))} linked</span>}<small>{w.n > 1 && w.avg != null ? `with each other. ${w.n} shares move like about ${w.eff.toFixed(1)} independent ones.` : w.n === 1 ? "One share: nothing to compare it with." : "None in the list."}</small></div>)}</div>
      <div className="eqd-two">
        <div><h3 className="eqd-h3">Size against size<Info about="Size against size" text="The average correlation between shares of two sizes." how="Darker: they move together more. Outlined: shares of the same size." /></h3><p className="sp-note">Outlined: shares of the same size. Darker: they move together more.</p>
          <FrozenTable label="size against size" className="eqv-frz"><table className="eqd-heat eqd-sz3"><thead><tr><td />{SIZES3.map((k) => <th key={k} scope="col">{k}</th>)}</tr></thead>
            <tbody>{SIZES3.map((r) => <tr key={r}><th scope="row">{r} · {f.heat.count[r] ?? 0}</th>{SIZES3.map((c) => { const x = f.heat.cell(r, c); return <td key={c} className={r === c ? "self" : ""}>{x.avg == null ? <span className="eqd-one">–</span> : <span className="eqd-v" style={r === c ? undefined : shade(x.avg)}>{two(x.avg)}</span>}</td>; })}</tr>)}</tbody></table></FrozenTable></div>
        <div><h3 className="eqd-h3">Your {f.closest} most alike pairs<Info about="Your most alike pairs, by size" text="Which sizes the closest pairs of shares come from." how="Each bar sets the closest pairs against how common that mix is among all pairs in your list: more than its share means that size pairing moves especially alike." /></h3><p className="sp-note">Which sizes the closest pairs come from, against how common that mix is in your list.</p>
          <div className="eqd-mix"><p className="eqd-mixh"><span /><span>Of the {f.closest} closest</span><span>Of all pairs</span></p>
            {f.mix.map((m) => <p key={m.k} className="eqd-mixr"><span>{m.k}</span><span className="eqd-mb"><i style={{ width: `${(m.top / maxTop) * 100}%` }} /><b>{m.top}</b></span><span className="eqd-mb g"><i style={{ width: `${m.allShare}%` }} /><b>{Math.round(m.allShare)}%</b></span></p>)}
            {lead && f.closest > 0 && <p className="sp-note">{mixLine(lead, f.closest)}</p>}</div></div>
      </div>
      <Insights items={sizeCards(f).map((c) => ({ ...c, text: withCorrWords(c.text) }))} scope="eq.sizes" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 6 Share by share
type Ord = "sector" | "group" | "rest";
const ORDERS: [Ord, string][] = [["sector", "Grouped by sector"], ["group", "Alike shares side by side"], ["rest", "Most independent first"]];
/** The interactive share grid (D67–D69). Task #385: the pairs chart at the top; order buttons that say what they do; the grid open up to 20 shares and
 *  behind "Show the grid" above; tapping a cell, a name, a dot or a line reads it in a full-width panel of three cards. Codes in the grid (a table), short
 *  names in the chart and the panel. */
export function ShareGrid({ d, eff }: { d: DivInput; /** task #385 (open item 7): "moves like" by what you own now when every share has a quantity */ eff?: number }) {
  const [ord, setOrd] = useState<Ord>("sector"), [crossOnly, setCrossOnly] = useState(false), [pick, setPick] = useState<Pick>(null);
  const p = d.page, idx = useMemo(() => new Map(p.order.map((s, i) => [s, i])), [p.order]), of = (s: string) => d.levelOf(s, "macro"), lab = (s: string) => shortCo(d.nameOf(s), s);
  const rest = p.avg_with_rest, heat = useMemo(() => heatOf(p.order, p.corr, of), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const o = useMemo(() => ord === "group" ? p.order : ord === "rest" ? [...p.order].sort((a, b) => (rest[a] ?? 0) - (rest[b] ?? 0)) : [...p.order].sort((a, b) => (heat.count[of(b)] - heat.count[of(a)]) || of(a).localeCompare(of(b)) || (idx.get(a)! - idx.get(b)!)), [ord, p, heat]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = useCallback((a: string, b: string) => p.corr[idx.get(a)!]?.[idx.get(b)!], [p, idx]);
  const ps = useMemo(() => pairsOf(p.order, p.corr).sort((x, y) => y.corr - x.corr), [p]);
  const sd = sameVsDiff(p.order, p.corr, of), vs = ps.map((x) => x.corr).sort((a, b) => a - b);
  const typical = vs.length ? (vs.length % 2 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2) : null;
  const ties = useMemo(() => tiesOf(p.order, p.corr, of), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const secRows = heat.names.map((n) => ({ name: n, n: heat.count[n], inside: heat.cell(n, n).avg, others: ties.find((x) => x.name === n)?.avg ?? null }));
  const dot = (n: string) => `var(--chart-${(Math.abs(hash(n)) % 6) + 1})`;
  const N = p.order.length, P = (N * (N - 1)) / 2;
  const on = (r: string, s: string) => !!pick && (pick.b ? (pick.a === r && pick.b === s) || (pick.a === s && pick.b === r) : pick.a === r || pick.a === s);
  return (
    <Section id="eq-grid" hide title="Share by share" help="How closely each pair of shares moves, from weekly prices over the past two years." how="0 means the two are unrelated; near 1, they rise and fall as one. Tap a cell for the pair, or a name for that share."
      sub={`${eff != null ? gridLine(N, eff).replace(/\.$/, ", by what you own now.") : gridLine(N, p.score.effective_stocks)}${sd.same.pairs ? ` Same sector: ${countOf(sd.same.pairs, "pair")} at ${two(sd.same.avg)} on average.` : ""}${sd.diff.pairs ? ` Different sectors: ${countOf(sd.diff.pairs, "pair")} at ${two(sd.diff.avg)}.` : ""}`}>
      <PairsChart pairs={ps} label={lab} onPick={(x) => setPick({ a: x.a, b: x.b })} />
      <div className="eqd-sctl"><div className="eqd-seg" role="group" aria-label="Order of the grid">{ORDERS.map(([k, t]) => <button key={k} type="button" aria-pressed={ord === k} onClick={() => setOrd(k)}>{t}</button>)}</div>
        <label className="eqd-tgl"><input type="checkbox" checked={crossOnly} onChange={(e) => setCrossOnly(e.target.checked)} /> Only pairs across sectors</label></div>
      <GridFold rows={N} what={`every pair of your ${countOf(N, "share")}, ${P.toLocaleString("en-IN")} in all`}>
        <FrozenTable label={`Share by share · ${countOf(N, "share")}`} className="eqv-frz"><table className="eqd-sheat"><thead><tr><td />{o.map((s) => <th key={s} scope="col" className={pick && !pick.b && pick.a === s ? "on" : undefined}><button type="button" className="eqd-v" title={d.nameOf(s)} onClick={() => setPick({ a: s })}>{s}</button></th>)}</tr></thead>
          <tbody>{o.map((r) => <tr key={r}><th scope="row" className={pick && !pick.b && pick.a === r ? "on" : undefined}><button type="button" className="eqd-rw" title={d.nameOf(r)} onClick={() => setPick({ a: r })}><i className={"s-" + Math.abs(hash(of(r))) % 8} aria-hidden="true" />{r}</button></th>{o.map((s) => { if (r === s) return <td key={s} className="self" />; const v = c(r, s), hide = crossOnly && of(r) === of(s);
            return <td key={s} className={(on(r, s) ? "on " : "") + (hide ? "off" : "")}>{hide ? "" : <button type="button" style={shade(v)} aria-label={`${r} and ${s}: ${two(v)}`} onClick={() => setPick({ a: r, b: s })}>{v.toFixed(2).replace(/^0\./, ".").replace(/^-0\./, "−.")}</button>}</td>; })}</tr>)}</tbody></table></FrozenTable>
        <p className="eqd-key2"><span>Independent</span><i aria-hidden="true" /><span>Move as one</span><span>· Tap a cell for the pair, or a name for that share</span></p>
      </GridFold>
      <ReadPanel order={p.order} corrOf={c} rest={rest} sectorOf={of} label={lab} pick={pick} onPick={setPick} secRows={secRows} typical={typical} dot={dot} />
    </Section>
  );
}
/** "17 of your 30 closest pairs are small with small, though only 23% of all pairs are." — "though only" when the closest pairs clearly lean to that mix. */
export function mixLine(m: { k: string; top: number; allShare: number }, closest: number) {
  const lean = (m.top / closest) * 100 > m.allShare + 10;
  return `${m.top} of your ${closest} closest pairs are ${m.k.toLowerCase()}, ${lean ? `though only ${Math.round(m.allShare)}% of all pairs are` : `in line with their ${Math.round(m.allShare)}% share of all pairs`}.`;
}
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);

/** The Key figures of this tab: Concentration, Hidden packs, Moves like (B18). */
export function divKeys(d: DivInput) {
  const of = (s: string) => d.levelOf(s, "macro"), N = d.symbols.length;
  const counts = d.symbols.reduce<Record<string, string[]>>((a, s) => { (a[of(s)] ??= []).push(s); return a; }, {});
  const [name, who] = Object.entries(counts).sort((a, b) => b[1].length - a[1].length)[0] ?? [null, []];
  const groups = d.page.groups.map((g) => groupCard(g.members, g.avg_corr, d.page.order, d.page.corr, of, d.sizeOf));
  // task #262: the "move together more closely" note was about the old Small (below ₹10,000 Cr). With four sizes it reads the Small and the Micro
  // groups and names the one that moves together most (each group by its own name), so the sentence stays about the list's smaller companies.
  const sm = sizeFigures(d.page.order, d.page.corr, d.sizeOf).within.filter((x) => (x.k === "Small" || x.k === "Micro") && x.n > 1 && x.avg != null)
    .sort((a, b) => (b.avg as number) - (a.avg as number))[0] ?? null;
  return divKeyCards({ top: name ? { name, n: who.length, pct: (who.length / Math.max(1, N)) * 100, sectorNames: [...new Set(who.map((s) => d.levelOf(s, "sector")))] } : null, N,
    groups: groups.length, cross: groups.filter((g) => g.cross).length, eff: d.page.score.effective_stocks, counted: d.page.order.length,
    small: sm ? { n: sm.n, avg: sm.avg, k: sm.k } : null, sameAvg: sameVsDiff(d.page.order, d.page.corr, of).same.avg });
}
/** Task #385: the one-line summaries of the folded Diversification sections on a phone (All sections), worked out from the same figures: Do your macro
 *  sectors move together? ("Most linked: A and B, 0.34 (loosely linked)") and Share by share ("13 shares move like 5.7 independent ones."). */
export function divLines(d: DivInput, eff?: number) {
  const of = (s: string) => d.levelOf(s, "macro"), heat = heatOf(d.page.order, d.page.corr, of);
  const cross = heat.names.flatMap((a, i) => heat.names.slice(i + 1).map((b) => ({ a, b, avg: heat.cell(a, b).avg }))).filter((x): x is { a: string; b: string; avg: number } => x.avg != null);
  return { sectors: sectorsLine(cross, heat.names.length === 1 ? heat.names[0] : null), grid: gridLine(d.page.order.length, eff ?? d.page.score.effective_stocks) };
}
/** Task #274 (change 9): the figures behind Diversification's three Key figures answers (lib/keyAnswers divAnswers). */
export function divFacts(d: DivInput): DivFacts {
  const of = (s: string) => d.levelOf(s, "macro"), N = d.symbols.length;
  const counts = d.symbols.reduce<Record<string, string[]>>((a, s) => { (a[of(s)] ??= []).push(s); return a; }, {});
  const top = Object.entries(counts).sort((a, b) => b[1].length - a[1].length)[0];
  return { N, sectors: Object.entries(counts).map(([name, xs]) => ({ name, n: xs.length })), sectorLevelOfTop: top ? [...new Set(top[1].map((s) => d.levelOf(s, "sector")))] : [],
    groups: d.page.groups.map((g) => ({ members: g.members, cross: groupCard(g.members, g.avg_corr, d.page.order, d.page.corr, of, d.sizeOf).cross })),
    eff: d.page.score.effective_stocks, counted: d.page.order.length };
}
export { averageLinkage, effective };
