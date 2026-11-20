// Task #183 W7: the Equity portfolio's Diversification analytics tab as the 15 Nov pack draws it (01-equity-portfolio, D50–D71): Where it sits (macro sector × size,
// one chip per share), How spread out is the list?, three sub-tabs (how sectors move together · how stocks move together · large, mid, small and micro), Share by share,
// and the style tilt (Gold). Figures from the server's page answer, worked out in lib/eqDiv. Every class is eqd-. Describes how prices moved; never advice.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import { Insights, More } from "./EquityPack";
import { averageLinkage, divKeyCards, effective, groupCard, heatOf, looserFamilies, pairsOf, sameVsDiff, sectorCards, sizeCards, sizeFigures, tiesOf, two, whereGrid, SIZES3, type Level, type Size3 } from "../../lib/eqDiv";
import type { PageObject } from "../types";
import "./div-pack.css";

const pc = (x: number) => `${x.toFixed(1)}%`;
/** A cell's shade: deeper with a closer link (0 to 1). */
const shade = (v: number | null) => (v == null ? undefined : { background: `color-mix(in srgb, var(--eqd-heat) ${Math.round(Math.max(0, Math.min(1, v)) * 100)}%, var(--eqd-heat0))`, color: v >= 0.45 ? "#fff" : undefined });
/** Plain words for one correlation (the reader). */
export const linkWord = (v: number) => (v >= 0.65 ? "move almost as one" : v >= 0.5 ? "move together closely" : v >= 0.35 ? "move together somewhat" : v >= 0.2 ? "are loosely linked" : "mostly go their own way");
const SHORT: Record<string, string> = { "Consumer Discretionary": "Cons. Disc.", "Information Technology": "IT", "Financial Services": "Financial", "Fast Moving Consumer Goods": "FMCG", "Telecommunication": "Telecom" };
const short = (s: string) => SHORT[s] ?? s;

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
/** Step 1 (moved here from the Portfolio tab): macro sector × size, one chip per share with its Prism (Gold) or FinLit IQ (Silver) band, darker cells holding more,
 *  each row's share of the list, and totals that add to 100% (D52, D53). */
export function WhereSitsGrid({ d }: { d: DivInput }) {
  const g = useMemo(() => whereGrid(d.symbols, (s) => d.levelOf(s, "macro"), d.sizeOf), [d]);
  const sizeLabel: Record<Size3, string> = { Large: "Large cap", Mid: "Mid cap", Small: "Small cap", Micro: "Micro cap" };
  return (
    <Section id="eq-where" hide title="Where your list sits: macro sector and size" help="Each share in one row, its NSE macro sector, and one column, its size: large, mid, small or micro." how="A deeper cell has more of your shares. The last column is the row's share of the list, if equal amounts were held; rows and columns each add to 100%."
      sub={<>Each chip is one share; its dot shows the {d.gold ? "FinLit Prism" : "FinLit IQ"} band. Darker cells carry more of the list. Large above ₹75,000 Cr · Mid ₹25,000–75,000 Cr · Small ₹10,000–25,000 Cr · Micro below ₹10,000 Cr.</>}>
      <Scroll label="where your list sits"><table className="eqd-ws">
        <thead><tr><th scope="col">Macro sector</th>{g.cols.map((c) => <th key={c.k} scope="col">{sizeLabel[c.k]} <span className="eqd-mute">· {c.n}</span></th>)}<th scope="col">Of the list</th></tr></thead>
        <tbody>{g.rows.map((r) => <tr key={r.name}><th scope="row">{r.name}</th>
          {r.cells.map((c) => <td key={c.k} className={c.who.length ? "" : "e"} style={c.who.length ? { background: `color-mix(in srgb, var(--eqd-sit) ${Math.round(15 + (c.who.length / g.max) * 55)}%, var(--s1))` } : undefined}>
            {c.who.length > 0 && <><span className="eqd-chips">{c.who.map((s) => <span key={s} className="eqd-chip" title={`${d.nameOf(s)} · ${d.levelOf(s, "industry")}`}><i className={"b-" + (d.band(s) ?? "n")} aria-hidden="true" />{s}</span>)}</span><small>{pc(c.pct)}</small></>}</td>)}
          <td className="eqd-of"><b>{pc(r.pct)}</b><span className="eqd-ob" aria-hidden="true"><i style={{ width: `${r.pct}%` }} /></span><small>{r.n} {r.n === 1 ? "share" : "shares"}</small></td></tr>)}</tbody>
        <tfoot><tr><th scope="row">All macro sectors</th>{g.cols.map((c) => <td key={c.k}><b>{c.n} {c.n === 1 ? "share" : "shares"}</b> · {pc(c.pct)}</td>)}<td><b>100%</b></td></tr></tfoot>
      </table></Scroll>
      <p className="eqd-key"><span><i className="b-g" />{d.gold ? "Strong or Healthy Prism" : "Strong or Healthy FinLit IQ"}</span><span><i className="b-m" />{d.gold ? "Average" : "Mixed"}</span><span><i className="b-b" />{d.gold ? "Weak" : "Watch"}</span><span><i className="b-n" />Not scored yet</span></p>
      {g.noSize.length > 0 && <p className="sp-note">No size band yet for {g.noSize.join(", ")}: counted in the row total, not in a size column.</p>}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 2 How spread out is the list?
export function SpreadPack({ d }: { d: DivInput }) {
  const s = d.page.score, n = d.page.order.length;
  const lv = (l: Level | "industry") => new Set(d.symbols.map((x) => d.levelOf(x, l))).size;
  const macro = lv("macro"), sector = lv("sector"), ind = lv("industry");
  const top = Object.entries(d.symbols.reduce<Record<string, number>>((a, x) => { const k = d.levelOf(x, "macro"); a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0];
  const ones = Object.values(d.symbols.reduce<Record<string, number>>((a, x) => { const k = d.levelOf(x, "industry"); a[k] = (a[k] ?? 0) + 1; return a; }, {})).filter((v) => v === 1).length;
  const sz = SIZES3.map((k) => d.symbols.filter((x) => d.sizeOf(x) === k).length), sm = sz[2] + sz[3];
  const cards = [
    { kind: "good" as const, title: `Spread across ${macro} macro sectors, ${sector} sectors and ${ind} industries`, text: `${top && top[1] > 8 ? `Every macro sector except ${top[0].toLowerCase()} has 8 shares or fewer` : "No macro sector has more than 8 shares"}, and ${ones} of the ${ind} industries have just one share.` },
    ...(top && top[1] / d.symbols.length >= 0.25 ? [{ kind: "watch" as const, title: `${top[0]} is ${Math.round((top[1] / d.symbols.length) * 100)}% of the list`, text: `${top[1]} of ${d.symbols.length} shares sit in one macro sector, so they share its business cycle.` }] : []),
    // task #262: "small" here meant below ₹10,000 Cr; with four sizes the smaller side is Small and Micro together (sm), so the card reads as before
    { kind: "insight" as const, title: sz[0] && sz[1] && sm ? (sm > sz[0] + sz[1] ? "Balanced by size, tilted to smaller companies" : "Balanced by size") : "Leaning to one size", text: `${sz[0]} large, ${sz[1]} mid, ${sz[2]} small and ${sz[3]} micro companies.${sz[0] && sm ? " Large companies steady the list; the small and micro ones add most of the swings." : ""}` },
  ];
  return (
    <Section id="eq-spread" hide title="How spread out is the list?" help="The diversification score, 0 to 100: how widely the shares spread across NSE's 12 macro sectors and how independently they move." how="Higher means more spread. Moves like counts shares that rise and fall together as one bet, so a list of many shares can still read as fewer."
      sub="Two readings: how widely the list is spread across sectors, and how independently the shares move.">
      {/* task #235 (pack B3): three cards: the score on a ring with its word, line and chips; the two readings it is built from; Moves like, as squares → circles */}
      <div className="spx">
        <div className="spx-sc">
          <div className="spx-ring" role="img" aria-label={`Spread score ${s.score} out of 100, ${s.band}`}>
            <svg width="132" height="132" viewBox="0 0 120 120" aria-hidden="true"><circle className="tr" cx="60" cy="60" r="52" /><circle className="fg" cx="60" cy="60" r="52" strokeDasharray={`${((Math.max(0, Math.min(100, s.score)) / 100) * 326.7).toFixed(1)} 326.7`} transform="rotate(-90 60 60)" /></svg>
            <span className="spx-n"><b>{s.score}</b><small>of 100</small></span></div>
          <div className="spx-w"><p className="spx-k">Spread score</p><p className="spx-word">{s.band}</p>
            <div className="spx-line" aria-hidden="true"><i style={{ left: `${Math.max(0, Math.min(100, s.score))}%` }} /></div><p className="spx-ends"><span>All in one bet</span><span>Widely spread</span></p>
            <p className="spx-chips"><span><b>{macro}</b> macro sectors</span><span><b>{sector}</b> sectors</span><span><b>{ind}</b> industries</span><span><b>{sz.filter(Boolean).length}</b> {sz.filter(Boolean).length === 1 ? "size" : "sizes"}</span></p></div>
        </div>
        <div className="spx-parts"><p className="spx-k">Built from two readings</p>
          <div className="spx-p"><div className="spx-ph"><b>Across sectors</b><span>{Math.round(s.sector_spread)}</span></div><div className="spx-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.sector_spread)}%` }} /></div>
            <p>{d.symbols.length} shares across {macro} macro sectors, {sector} sectors and {ind} industries{top && top[1] / d.symbols.length >= 0.25 ? `; ${top[1]} of them are ${top[0].toLowerCase()}, so by sector the list spreads like about ${s.effective_sectors.toFixed(1)} macro sectors` : `; by sector the list spreads like about ${s.effective_sectors.toFixed(1)} macro sectors`}.</p></div>
          <div className="spx-p"><div className="spx-ph"><b>How independently they move</b><span>{Math.round(s.comovement)}</span></div><div className="spx-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.comovement)}%` }} /></div>
            <p>From a year of prices: the less the shares rise and fall together, the higher it reads.</p></div>
        </div>
        <div className="spx-bets"><p className="spx-k">Moves like</p><p className="spx-big"><b>{s.effective_stocks.toFixed(1)}</b> of {n} {n === 1 ? "share" : "shares"}</p>
          <div className="spx-dots" role="img" aria-label={`${n} shares behave like about ${s.effective_stocks.toFixed(1)} independent ones`}>
            <div className="r1">{Array.from({ length: n }, (_, i) => <i key={i} />)}</div><span className="ar" aria-hidden="true">↓</span>
            <div className="r2">{Array.from({ length: Math.ceil(s.effective_stocks) }, (_, i) => { const f = Math.min(1, s.effective_stocks - i); return <i key={i} className={f < 1 ? "part" : "b"} style={f < 1 ? { ["--f" as string]: f.toFixed(2) } : undefined} />; })}</div></div>
          <p>Your {n} shares with a full year of prices behave like about {s.effective_stocks.toFixed(1)} that move independently. Shares that rise and fall together count as one bet.</p></div>
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
    <div className="eqd-subs">
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
  return (
    <Section id="eq-sectors" hide title={`Do your ${word}s move together?`} help={`For each pair of ${word}s, the average correlation of their shares' weekly prices over the past two years.`} how="0 means no link; 1 means they move as one. A darker cell is a closer pair."
      sub="0 means no link; 1 means they move as one. Weekly prices, past two years."
>
      <div className="eqd-tools"><div className="eqd-seg" role="group" aria-label="Level"><button type="button" aria-pressed={lv === "macro"} onClick={() => { setLv("macro"); setPick(null); }}>Macro sector · {nMacro}</button><button type="button" aria-pressed={lv === "sector"} onClick={() => { setLv("sector"); setPick(null); }}>Sector · {nSec}</button></div></div>
      <div className="eqd-k3">
        <div className="eqd-kpi"><p className="sp-cap">Shares in the same {word}<Tip text={`The average correlation of every pair of your shares in the same ${word}.`} how="0 means no link; 1 means they move as one. Compare it with the next figure." /></p><b>{two(sd.same.avg)}</b><small>{sd.same.pairs} {sd.same.pairs === 1 ? "pair" : "pairs"}</small></div>
        <div className="eqd-kpi"><p className="sp-cap">Shares in different {word}s<Tip text={`The average correlation of every pair of your shares in two different ${word}s.`} how={`Well below the same-${word} figure: the ${word}s spread the list. Close to it: they move much alike.`} /></p><b>{two(sd.diff.avg)}</b><small>{sd.diff.pairs} pairs{sd.same.avg != null && sd.diff.avg != null ? (Math.abs(sd.same.avg - sd.diff.avg) < 0.1 ? " · close to the same-sector figure" : " · well below the same-sector figure") : ""}</small></div>
        <div className="eqd-kpi"><p className="sp-cap">Goes its own way most<Tip text={`The ${word} whose shares move least with the rest of your list.`} how="The figure under it is its average correlation with the rest: the lower, the more it goes its own way." /></p><b className="eqd-serif">{ties[0]?.name ?? "–"}</b><small>{ties[0] ? `${two(ties[0].avg)} with the rest of the list` : "Needs two or more sectors."}</small></div>
      </div>
      <div className="eqd-two">
        <div>
          <h3 className="eqd-h3">{Title}<Tip text={`How closely each pair of ${word}s moves, from their shares' weekly prices.`} how={`Darker: the two ${word}s move together more. Outlined: shares inside one ${word}. Tap a cell to read it.`} /></h3>
          <p className="sp-note">Darker: the two {word}s move together more. Outlined: shares inside one {word}. Tap a cell.</p>
          <WideBox title={Title}><table className="eqd-heat"><thead><tr><td />{heat.names.map((c) => <th key={c} scope="col" title={c}>{short(c)}</th>)}</tr></thead>
            <tbody>{heat.names.map((r) => <tr key={r}><th scope="row">{short(r)} · {heat.count[r]}</th>{heat.names.map((c) => { const x = heat.cell(r, c), self = r === c;
              return <td key={c} className={self ? "self" : ""}>{x.avg == null ? <span className="eqd-one">{self ? "1 share" : "–"}</span>
                : <button type="button" style={self ? undefined : shade(x.avg)} aria-pressed={!!pick && ((pick[0] === r && pick[1] === c) || (pick[0] === c && pick[1] === r))} aria-label={`${r} and ${c}: ${two(x.avg)}`} onClick={() => setPick([r, c])}>{two(x.avg)}</button>}</td>; })}</tr>)}</tbody></table></WideBox>
          <div className="eqd-reader" aria-live="polite"><h3 className="eqd-h3">Read a cell<Tip text="The pair you tapped in the grid, in words." how="Tap any cell in the grid; this box says how closely those two move and how many pairs of shares the figure rests on." /></h3>
            {pick && sel?.avg != null ? <p><b>{pick[0] === pick[1] ? `Inside ${pick[0]}` : `${pick[0]} · ${pick[1]}`}: {two(sel.avg)}</b>. Across {sel.pairs} {sel.pairs === 1 ? "pair" : "pairs"} of shares, they {linkWord(sel.avg)}.</p> : null}
            <dl><div><dt>Strongest link</dt><dd>{hi[0] ? `${hi[0].a} · ${hi[0].b} ${two(hi[0].avg)}` : "–"}</dd></div><div><dt>Weakest link</dt><dd>{hi.length ? `${hi[hi.length - 1].a} · ${hi[hi.length - 1].b} ${two(hi[hi.length - 1].avg)}` : "–"}</dd></div><div><dt>Typical pair in your list</dt><dd>{two(typical)}</dd></div></dl></div>
        </div>
        <div>
          <h3 className="eqd-h3">Tied to the rest of your list<Tip text={`Each ${word}'s shares against every share outside it: their average correlation.`} how="A short bar moves least with the rest and steadies the list most; a long bar moves with it." /></h3>
          <p className="sp-note">Shortest first. A short bar steadies the list most.</p>
          <ul className="eqd-ties">{ties.map((t) => <li key={t.name}><span>{short(t.name)} · {t.n}</span><span className="t" aria-hidden="true"><i style={{ width: `${(t.avg / maxTie) * 100}%` }} /></span><b>{two(t.avg)}</b></li>)}</ul>
          <div className="eqd-pairs"><p className="sp-cap">Different {word}s, moving together</p><ul>{hi.slice(0, 3).map((x) => <li key={x.a + x.b}><span><b>{x.a}</b> and <b>{x.b}</b></span><b>{two(x.avg)}</b></li>)}</ul></div>
          <div className="eqd-pairs"><p className="sp-cap">Most independent {word}s</p><ul>{[...hi].reverse().slice(0, 3).map((x) => <li key={x.a + x.b}><span><b>{x.a}</b> and <b>{x.b}</b></span><b>{two(x.avg)}</b></li>)}</ul></div>
        </div>
      </div>
      <Insights items={sectorCards(ties, heat, word)} scope={"eq.sectors." + lv} />
    </Section>
  );
}
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function GroupsPanel({ d }: { d: DivInput }) {
  const [f, setF] = useState<"all" | "cross" | "same">("all"), [more, setMore] = useState(false);
  const o = d.page.order, C = d.page.corr, of = (s: string) => d.levelOf(s, "macro");
  const groups = d.page.groups.map((g) => ({ ...g, ...groupCard(g.members, g.avg_corr, o, C, of, d.sizeOf) }));
  const inGroup = groups.reduce((a, g) => a + g.members.length, 0), cross = groups.filter((g) => g.cross).length, bets = groups.reduce((a, g) => a + g.bets, 0);
  const shown = groups.filter((g) => f === "all" || (f === "cross") === g.cross), first = more ? shown : shown.slice(0, 6);
  const fam = useMemo(() => looserFamilies(o, C, d.page.groups), [o, C, d.page.groups]);
  return (
    <Section id="eq-groups" hide title="How stocks move together" help="Groups found from each pair of shares' weekly prices, not from sector labels: average-linkage clustering on 1 − correlation, cut at 0.5." how="Shares in one group average a correlation of 0.50 or more: they have tended to rise and fall together. Crosses sectors: the group joins shares from different sectors."
      sub="Found from each pair of shares, not from sector labels. A group's shares average a correlation of 0.50 or more."
>
      <div className="eqd-tools"><div className="eqd-seg" role="group" aria-label="Show"><button type="button" aria-pressed={f === "all"} onClick={() => setF("all")}>All groups</button><button type="button" aria-pressed={f === "cross"} onClick={() => setF("cross")}>Crosses sectors</button><button type="button" aria-pressed={f === "same"} onClick={() => setF("same")}>One sector</button></div></div>
      {!groups.length ? <p className="sp-empty">No group of shares moves together closely (0.50 or more): your shares move fairly independently of each other.</p> : <>
        <div className="eqd-k3">
          <div className="eqd-kpi"><p className="sp-cap">Shares in a group</p><b>{inGroup} of {o.length}</b><small>the rest move fairly independently</small></div>
          <div className="eqd-kpi"><p className="sp-cap">Groups that cross sectors</p><b>{cross} of {groups.length}</b><small>{cross ? "sector labels alone would miss these" : "every group sits inside one sector"}</small></div>
          <div className="eqd-kpi"><p className="sp-cap">{inGroup} grouped shares count as</p><b>about {Math.round(bets)} {Math.round(bets) === 1 ? "bet" : "bets"}</b><small>for spreading risk</small></div>
        </div>
        <div className="eqd-gcards">{first.map((g) => <div key={g.letter} className={"eqd-gcard" + (g.cross ? " x" : "")}>
          <p className="eqd-gh"><b>{g.members.length} shares · {two(g.avg_corr)} on average</b><span className={"eqd-xb" + (g.cross ? "" : " s")}>{g.cross ? "Crosses sectors" : "One sector"}</span></p>
          <p className="eqd-gchips">{g.members.map((m) => <span key={m} className="eqd-chip" title={d.levelOf(m, "industry")}><i className={"b-" + (d.band(m) ?? "n")} aria-hidden="true" />{m}</span>)}</p>
          <p className="eqd-gsec">{g.name}</p>
          <p className="eqd-gfacts"><span>Counts as about <b>{g.bets.toFixed(1)}</b> {g.bets < 1.95 ? "bet" : "bets"}</span>{g.cross && g.withOwn != null && <span>With own sector: <b>{two(g.withOwn)}</b></span>}{g.sizeWord && <span>{g.sizeWord}</span>}</p>
        </div>)}</div>
        {shown.length > 6 && <button type="button" className="eq-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Show fewer groups ▴" : `Show ${shown.length - 6} more ${shown.length - 6 === 1 ? "group" : "groups"} ▾`}</button>}
        {!shown.length && <p className="sp-note">{f === "cross" ? "No group crosses sectors." : "No group sits inside one sector."}</p>}
        <details className="eqd-fam"><summary><b>Looser families</b><Tip text="Wider groups that join up when the net widens: shares that average 0.35 or more with each other." how="Each family joins two or more of the groups above, or a group and other shares. They move together less tightly than a group." /><span className="eqd-mute">{fam.length ? `${fam.length} wider ${fam.length === 1 ? "group" : "groups"} that join up when the net widens` : "None: the groups stay apart even with a wider net"} · Show ▾</span></summary>
          {fam.map((x, i) => <p key={i} className="eqd-famr"><b>{x.members.length} shares</b> · <More names={x.members} show={8} /> <span className="eqd-mute">· joins {x.joins} {x.joins === 1 ? "group" : "groups"}</span></p>)}</details>
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
      <div className="eqd-k3">{f.within.map((w) => <div key={w.k} className="eqd-kpi"><p className="sp-cap">{w.k} companies · {w.n} counted</p><b>{two(w.avg)}</b><small>{w.n > 1 && w.avg != null ? `with each other. ${w.n} shares move like about ${w.eff.toFixed(1)} independent ones.` : w.n === 1 ? "One share: nothing to compare it with." : "None in the list."}</small></div>)}</div>
      <div className="eqd-two">
        <div><h3 className="eqd-h3">Size against size<Tip text="The average correlation between shares of two sizes." how="Darker: they move together more. Outlined: shares of the same size." /></h3><p className="sp-note">Outlined: shares of the same size. Darker: they move together more.</p>
          <Scroll label="size against size"><table className="eqd-heat eqd-sz3"><thead><tr><td />{SIZES3.map((k) => <th key={k} scope="col">{k}</th>)}</tr></thead>
            <tbody>{SIZES3.map((r) => <tr key={r}><th scope="row">{r} · {f.heat.count[r] ?? 0}</th>{SIZES3.map((c) => { const x = f.heat.cell(r, c); return <td key={c} className={r === c ? "self" : ""}>{x.avg == null ? <span className="eqd-one">–</span> : <span className="eqd-v" style={r === c ? undefined : shade(x.avg)}>{two(x.avg)}</span>}</td>; })}</tr>)}</tbody></table></Scroll></div>
        <div><h3 className="eqd-h3">Your {f.closest} most alike pairs<Tip text="Which sizes the closest pairs of shares come from." how="Each bar sets the closest pairs against how common that mix is among all pairs in your list: more than its share means that size pairing moves especially alike." /></h3><p className="sp-note">Which sizes the closest pairs come from, against how common that mix is in your list.</p>
          <div className="eqd-mix"><p className="eqd-mixh"><span /><span>Of the {f.closest} closest</span><span>Of all pairs</span></p>
            {f.mix.map((m) => <p key={m.k} className="eqd-mixr"><span>{m.k}</span><span className="eqd-mb"><i style={{ width: `${(m.top / maxTop) * 100}%` }} /><b>{m.top}</b></span><span className="eqd-mb g"><i style={{ width: `${m.allShare}%` }} /><b>{Math.round(m.allShare)}%</b></span></p>)}
            {lead && f.closest > 0 && <p className="sp-note">{mixLine(lead, f.closest)}</p>}</div></div>
      </div>
      <Insights items={sizeCards(f)} scope="eq.sizes" />
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ 6 Share by share
type Ord = "sector" | "group" | "rest";
/** The interactive share grid (D67–D69): order by sector, by how they move (the server's clustering order) or by "Rest"; only pairs across sectors; tap a share or a
 *  cell to read it; a slider and Expand when it is wider than its box. */
export function ShareGrid({ d }: { d: DivInput }) {
  const [ord, setOrd] = useState<Ord>("sector"), [crossOnly, setCrossOnly] = useState(false), [pick, setPick] = useState<{ a: string; b?: string } | null>(null);
  const p = d.page, idx = useMemo(() => new Map(p.order.map((s, i) => [s, i])), [p.order]), of = (s: string) => d.levelOf(s, "macro");
  const rest = p.avg_with_rest, heat = useMemo(() => heatOf(p.order, p.corr, of), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const o = useMemo(() => ord === "group" ? p.order : ord === "rest" ? [...p.order].sort((a, b) => (rest[a] ?? 0) - (rest[b] ?? 0)) : [...p.order].sort((a, b) => (heat.count[of(b)] - heat.count[of(a)]) || of(a).localeCompare(of(b)) || (idx.get(a)! - idx.get(b)!)), [ord, p, heat]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = (a: string, b: string) => p.corr[idx.get(a)!][idx.get(b)!];
  const ps = useMemo(() => pairsOf(p.order, p.corr).sort((x, y) => y.corr - x.corr), [p]);
  const sd = sameVsDiff(p.order, p.corr, of), typical = ps.length ? ps[Math.floor(ps.length / 2)].corr : null;
  const own = [...p.order].sort((a, b) => (rest[a] ?? 0) - (rest[b] ?? 0)).slice(0, 3);
  const rd = pick?.b ? { t: `${pick.a} · ${pick.b}: ${two(c(pick.a, pick.b))}`, x: `They ${linkWord(c(pick.a, pick.b))}${of(pick.a) === of(pick.b) ? `, both in ${of(pick.a)}` : `, across ${of(pick.a)} and ${of(pick.b)}`}.` }
    : pick ? (() => { const near = p.order.filter((s) => s !== pick.a).sort((x, y) => c(pick.a, y) - c(pick.a, x)); return { t: `${pick.a} · ${of(pick.a)}`, x: `With the rest of the list: ${two(rest[pick.a])}. Closest: ${near.slice(0, 3).map((s) => `${s} (${two(c(pick.a, s))})`).join(", ")}.` }; })() : null;
  const pair = (x: { a: string; b: string; corr: number }) => <li key={x.a + x.b}><button type="button" className="eqd-link" onClick={() => setPick({ a: x.a, b: x.b })}>{x.a} · {x.b}</button><b>{two(x.corr)}</b></li>;
  return (
    <Section id="eq-grid" hide title="Share by share" help="How closely each pair of shares moves, from weekly prices." how="0 means the two are unrelated; near 1, they rise and fall as one. Tap a cell for the pair, or a name for that share."
      sub={`${p.order.length} shares move like ${p.score.effective_stocks.toFixed(1)} independent ones. Same sector: ${sd.same.pairs} pairs at ${two(sd.same.avg)} on average. Different sectors: ${sd.diff.pairs} pairs at ${two(sd.diff.avg)}.`}>
      <div className="eqd-shx">
        <div>
          <div className="eqd-sctl"><div className="eqd-seg" role="group" aria-label="Order"><button type="button" aria-pressed={ord === "sector"} onClick={() => setOrd("sector")}>Order by sector</button><button type="button" aria-pressed={ord === "group"} onClick={() => setOrd("group")}>Order by how they move</button><button type="button" aria-pressed={ord === "rest"} onClick={() => setOrd("rest")}>Order by “Rest”</button></div>
            <label className="eqd-tgl"><input type="checkbox" checked={crossOnly} onChange={(e) => setCrossOnly(e.target.checked)} /> Only pairs across sectors</label></div>
          <WideBox title={`Share by share · ${p.order.length} shares`}><table className="eqd-sheat"><thead><tr><td />{o.map((s) => <th key={s} scope="col"><button type="button" className="eqd-v" onClick={() => setPick({ a: s })}>{s}</button></th>)}</tr></thead>
            <tbody>{o.map((r) => <tr key={r}><th scope="row"><button type="button" className="eqd-rw" onClick={() => setPick({ a: r })}><i className={"s-" + Math.abs(hash(of(r))) % 8} aria-hidden="true" />{r}</button></th>{o.map((s) => { if (r === s) return <td key={s} className="self" />; const v = c(r, s), hide = crossOnly && of(r) === of(s);
              return <td key={s} className={(pick && (pick.a === r || pick.a === s) && (!pick.b || (pick.b === s || pick.b === r)) ? "on " : "") + (hide ? "off" : "")}>{hide ? "" : <button type="button" style={shade(v)} aria-label={`${r} and ${s}: ${two(v)}`} onClick={() => setPick({ a: r, b: s })}>{v.toFixed(2).replace(/^0\./, ".").replace(/^-0\./, "-.")}</button>}</td>; })}</tr>)}</tbody></table></WideBox>
          <p className="eqd-key2"><span>Independent</span><i aria-hidden="true" /><span>Move as one</span><span>· Tap a cell for the pair, or a name for that share</span></p>
        </div>
        <aside className="eqd-side">
          <div className="eqd-box" aria-live="polite"><h3 className="eqd-h3">What the grid shows<Tip text="The pairs that move most alike, the most alike across sectors, and the shares that go their own way most." how="Tap a cell or a name in the grid and this box reads it instead." /></h3>
            {rd ? <p className="eqd-read"><b>{rd.t}</b><br />{rd.x} <button type="button" className="eqd-link" onClick={() => setPick(null)}>Clear</button></p> : <p className="sp-note">{ps.length} pairs. A typical pair moves together at {two(typical)}.</p>}
            <p className="sp-cap">Most alike</p><ul className="eqd-pl">{ps.slice(0, 5).map(pair)}</ul>
            <p className="sp-cap">Most alike across sectors</p><ul className="eqd-pl">{ps.filter((x) => of(x.a) !== of(x.b)).slice(0, 3).map(pair)}</ul>
            <p className="sp-cap">Go their own way most</p><ul className="eqd-pl">{own.map((s) => <li key={s}><button type="button" className="eqd-link" onClick={() => setPick({ a: s })}>{s}</button><b>{two(rest[s])}</b></li>)}</ul></div>
          <div className="eqd-box"><h3 className="eqd-h3">Macro sectors in the grid<Tip text="Each macro sector's shares with each other (inside) and with every other share (others)." how="Inside well above others: that sector's shares move as one bet. Close together: the sector adds little spread." /></h3>
            <table className="eqd-mst"><thead><tr><th scope="col">Sector</th><th scope="col" className="r">Inside</th><th scope="col" className="r">Others</th></tr></thead>
              <tbody>{heat.names.map((n) => { const t = tiesOf(p.order, p.corr, of).find((x) => x.name === n); return <tr key={n}><th scope="row"><i className={"s-" + Math.abs(hash(n)) % 8} aria-hidden="true" />{short(n)} · {heat.count[n]}</th><td className="r">{two(heat.cell(n, n).avg)}</td><td className="r">{two(t?.avg)}</td></tr>; })}</tbody></table>
            <p className="sp-note">–: one share, nothing to compare inside the sector.</p></div>
        </aside>
      </div>
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
export { averageLinkage, effective };
