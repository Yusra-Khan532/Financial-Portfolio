// Task #385 phase 2 (developer file 33, Diversification view): the new pieces of Share by share and the grids.
//   GridFold     a grid behind "Hide the grid" / "Show the grid · <what it holds>": open by default up to 20 rows, closed above; Share by share (task #388,
//                file 36 change 9): open at any size unless the member hid it (remembered with the account), and Expand ⤢ opens it on its own screen
//   PairsChart   "How tightly your N pairs move together": one dot per pair on a 0 to 0.7 scale (wider if a pair is above), the four bands marked,
//                the count in each band and a mark at the typical pair; tap, hover or focus a dot to read it. When more than 12 pairs share one 0.02
//                slot the slots become bars.
//   ReadPanel    the full-width panel of three cards under the grid: Read a pair or a share, Pairs that move most alike (with Sectors in the grid),
//                Each share against the rest.
// Figures are the server's correlations (the past two years of weekly closes, page.weeks; task #388 says the window in every i). Classes: eqv-. Describes how prices moved; never advice.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CAP_DEFAULT, Info, ShowAll, SortHead, cap1, capRows, corrBand, corrWord, countOf, inCommon, pairChart, pairLine, slotLine, useSort, CORR_CUTS, CORR_WORDS, corr2, togetherWindow, type Pair } from "../shared";
import { setBlockHidden, usePrefs } from "../../lib/prefs";
import "./div385.css";

// ------------------------------------------------------------------------------------------------ a grid behind a button
/** "Hide the grid" / "Show the grid · every pair of your 13 shares, 78 in all". Open by default up to `openUpTo` rows.
 *  Task #388 (developer file 36, change 9), with `remember`: open whenever the page opens, at any size, unless the member hid it; "Hide the grid" is kept
 *  with the member's settings (prefs.hiddenBlocks), so it stays hidden across views, visits and devices. With `expand`: an "Expand ⤢" pill on the same line
 *  opens `big` (or the grid) on its own screen: title, line, Close × (Esc closes too), scrolling both ways. */
export function GridFold({ rows, what, openUpTo = 20, remember, expand, big, children }: { rows: number; what: string; openUpTo?: number; remember?: string;
  expand?: { title: string; line: string }; big?: ReactNode; children: ReactNode }) {
  const p = usePrefs(), [own, setOwn] = useState(rows <= openUpTo), [full, setFull] = useState(false);
  const open = remember ? !p.hiddenBlocks.includes(remember) : own;
  const flip = () => { if (remember) setBlockHidden(remember, open); else setOwn(!open); };
  return <div className={"eqv-gf" + (open ? " open" : "") + (expand ? " eqv-gfx" : "")}>
    <button type="button" className="eqv-gfb" aria-expanded={open} onClick={flip}><span className="a">{open ? "Hide the grid" : "Show the grid"}</span>{!open && <span className="b">{what}</span>}</button>
    {open && expand && <button type="button" className="eqv-gx" aria-haspopup="dialog" aria-expanded={full} onClick={() => setFull(true)}>Expand <span aria-hidden="true">⤢</span></button>}
    {open && <div className="eqv-gfbody">{children}</div>}
    {open && expand && full && <GridScreen title={expand.title} line={expand.line} onClose={() => setFull(false)}>{big ?? children}</GridScreen>}
  </div>;
}

/** The grid on its own screen (change 9): covers the page, scrolls both ways inside, Close × and Esc close it and focus goes back to Expand. */
export function GridScreen({ title, line, onClose, children }: { title: string; line: string; onClose: () => void; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null, html = document.documentElement;
    html.classList.add("eqv-noscroll"); close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); html.classList.remove("eqv-noscroll"); back?.focus?.(); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="eqv-ovl" role="dialog" aria-modal="true" aria-label={title}>
    <div className="eqv-ovlh"><div><b>{title}</b><span>{line}</span></div><button ref={close} type="button" className="eqv-ovlx" onClick={onClose}>Close <span aria-hidden="true">×</span></button></div>
    <div className="eqv-ovlb">{children}</div>
  </div>;
}

// ------------------------------------------------------------------------------------------------ the scale a reading sits on
const SCALE_MAX = 0.7;
/** The four bands (barely to closely) on a 0 to 0.7 bar, a mark at the reading and a line at the typical pair. */
export function CorrScale({ v, typical }: { v: number; typical: number | null }) {
  const at = (x: number) => `${(Math.max(0, Math.min(SCALE_MAX, x)) / SCALE_MAX) * 100}%`;
  const edges = [0, ...CORR_CUTS, SCALE_MAX];
  return <div className="eqv-sc" aria-hidden="true">
    <div className="tr">{CORR_WORDS.map((w, i) => <i key={w} className={"eqv-b" + i} style={{ width: `${((edges[i + 1] - edges[i]) / SCALE_MAX) * 100}%` }} />)}
      {typical != null && <span className="md" style={{ left: at(typical) }} />}<span className="mk" style={{ left: at(v) }} /></div>
    <div className="lb">{CORR_WORDS.map((w) => <span key={w}>{cap1(w)}</span>)}</div>
  </div>;
}

// ------------------------------------------------------------------------------------------------ the pairs chart
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null), [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const m = () => setW(el.clientWidth); m();
    if (typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}
export function PairsChart({ pairs, label, onPick, weeks }: { pairs: Pair[]; label: (s: string) => string; onPick: (p: Pair) => void; /** page.weeks: the window, said in the i */ weeks?: number }) {
  const c = useMemo(() => pairChart(pairs), [pairs]);
  const [box, cw] = useWidth<HTMLDivElement>(), [line, setLine] = useState<string | null>(null), [on, setOn] = useState<string | null>(null);
  if (pairs.length < 3) return null;
  const W = Math.max(280, Math.min(900, cw || 600)), sm = W < 520, r = sm ? 3.6 : 5.5, st = sm ? 8 : 13, L = sm ? 14 : 24, R = W - (sm ? 14 : 24);
  const X = (v: number) => L + (Math.max(0, v) / c.max) * (R - L);
  const top = Math.max(1, ...c.slots.map((s) => s.pairs.length)), bh = 150, base = 26 + (c.bars ? bh : top * st) + 6, H = base + 24;
  const ticks: number[] = []; for (let v = 0; v <= c.max + 1e-9; v += 0.1) ticks.push(Number(v.toFixed(1)));
  const edges = [0, ...CORR_CUTS.filter((x) => x < c.max), c.max];
  const read = (k: string, t: string, p: Pair, pick = false) => { setOn(k); setLine(t); if (pick) onPick(p); };
  const bpx = Math.max(2, X(c.slot) - X(0) - 1.5);
  return (
    <div className="eqv-pc" ref={box}>
      <p className="eqv-pch">How tightly your {countOf(pairs.length, "pair")} move together<Info about="How tightly your pairs move together" text={`Each dot is one pair of your shares, placed by how closely their weekly prices moved over ${togetherWindow(weeks)}: further right, more alike. The words are a reading guide: barely below 0.2, loosely 0.2 to 0.4, partly 0.4 to 0.6, closely 0.6 and above.`} how="Tap or hover a dot to read the pair. With many pairs, the dots become bars: each bar is the pairs with about the same figure." /></p>
      <p className="eqv-pcs">{c.counts.map((n, i) => <span key={i}><i className={"eqv-b" + i} aria-hidden="true" />{n} {CORR_WORDS[i]}</span>)}{c.median != null && <span className="md">Typical pair {c.median.toFixed(2)}</span>}</p>
      <div className="eqv-pcv">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="group" aria-label={`${countOf(pairs.length, "pair")}: ${c.counts.map((n, i) => `${n} ${CORR_WORDS[i]} linked`).join(", ")}${c.median != null ? `; typical pair ${c.median.toFixed(2)}` : ""}`}>
          {edges.slice(0, -1).map((e, i) => <text key={"l" + i} x={(X(e) + X(edges[i + 1])) / 2} y={13} textAnchor="middle" className="eqv-pcl">{cap1(CORR_WORDS[i])}</text>)}
          {CORR_CUTS.filter((x) => x < c.max).map((x) => <line key={x} x1={X(x)} x2={X(x)} y1={18} y2={base} className="eqv-pcc" />)}
          <line x1={L} x2={R} y1={base} y2={base} className="eqv-pca" />
          {ticks.map((v) => <text key={v} x={X(v)} y={base + 18} textAnchor="middle" className="eqv-pct">{v.toFixed(1)}</text>)}
          {c.median != null && <line x1={X(c.median)} x2={X(c.median)} y1={base - 4} y2={base + 6} className="eqv-pcm" />}
          {c.bars ? c.slots.map((s) => { const hh = Math.max(3, (s.pairs.length / top) * bh), k = "s" + s.at, t = slotLine(s, label);
            return <rect key={k} x={X(s.at) - bpx / 2} y={base - hh} width={bpx} height={hh} rx={1.5} className={"eqv-pd eqv-b" + corrBand(s.at) + (on === k ? " on" : "")} tabIndex={0} role="button" aria-label={t}
              onMouseEnter={() => read(k, t, s.pairs[0])} onFocus={() => read(k, t, s.pairs[0])} onClick={() => read(k, t, s.pairs[0], true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); read(k, t, s.pairs[0], true); } }} />; })
          : c.slots.flatMap((s) => [...s.pairs].sort((a, b) => a.corr - b.corr).map((p, i) => { const k = p.a + "|" + p.b, t = pairLine(label(p.a), label(p.b), p.corr);
            return <circle key={k} cx={X(p.corr)} cy={base - r - 2 - i * st} r={r} className={"eqv-pd eqv-b" + corrBand(Math.max(0, p.corr)) + (on === k ? " on" : "")} tabIndex={0} role="button" aria-label={t}
              onMouseEnter={() => read(k, t, p)} onFocus={() => read(k, t, p)} onClick={() => read(k, t, p, true)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); read(k, t, p, true); } }} />; }))}
        </svg>
      </div>
      <p className="eqv-pcr" aria-live="polite">{line ?? (c.bars ? "Each bar is a group of pairs with about the same figure. Tap a bar to see how many sit there." : "Tap a dot to see the pair.")}</p>
    </div>);
}

// ------------------------------------------------------------------------------------------------ the reading panel
export type Pick = { a: string; b?: string } | null;
type SecRow = { name: string; n: number; inside: number | null; others: number | null };
export function ReadPanel({ order, corrOf, rest, sectorOf, label, pick, onPick, secRows, typical, dot, weeks }: {
  order: string[]; corrOf: (a: string, b: string) => number; rest: Record<string, number>; sectorOf: (s: string) => string; label: (s: string) => string;
  pick: Pick; onPick: (p: Pick) => void; secRows: SecRow[]; typical: number | null; dot: (sector: string) => string; /** page.weeks: the window, said in each i */ weeks?: number;
}) {
  const pairs = useMemo(() => { const out: Pair[] = []; for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) { const v = corrOf(order[i], order[j]); if (Number.isFinite(v)) out.push({ a: order[i], b: order[j], corr: v }); } return out.sort((x, y) => y.corr - x.corr); }, [order, corrOf]);
  const restRows = useMemo(() => order.filter((s) => rest[s] != null).sort((a, b) => rest[a] - rest[b]), [order, rest]);
  const mx = Math.max(0.01, ...restRows.map((s) => rest[s]));
  const cap = capRows(restRows, CAP_DEFAULT, false);
  const [allRest, setAllRest] = useState(false), [allSec, setAllSec] = useState(false);
  const sec = useSort(secRows, useMemo(() => ({ name: { kind: "text" as const, get: (r: SecRow) => r.name }, inside: { kind: "num" as const, get: (r: SecRow) => r.inside }, others: { kind: "num" as const, get: (r: SecRow) => r.others } }), []));
  const secShown = capRows(sec.sorted, { over: 8, keep: 6 }, allSec), restShown = capRows(restRows, CAP_DEFAULT, allRest);
  const p = pick ?? (pairs[0] ? { a: pairs[0].a, b: pairs[0].b } : null);
  let body: ReactNode = <p className="eqv-rx">Tap a cell or a name in the grid, a dot above, or a line here.</p>;
  if (p?.b) {
    const v = corrOf(p.a, p.b), sa = sectorOf(p.a), sb = sectorOf(p.b);
    body = <><p className="eqv-rn">{label(p.a)} <span>and</span> {label(p.b)}</p>
      <p className="eqv-rv"><b>{v.toFixed(2)}</b><span className={"eqv-rw eqv-t" + corrBand(v)}>{cap1(corrWord(v))} linked</span></p>
      <p className="eqv-rx">About {inCommon(v)}% of their weekly moves in common. {sa === sb ? `Both in ${sa}.` : `${sa} and ${sb}.`}</p>
      <CorrScale v={v} typical={typical} />{typical != null && <p className="eqv-rx2">Line: your typical pair, {typical.toFixed(2)}</p>}</>;
  } else if (p && rest[p.a] != null) {
    const mine = order.filter((s) => s !== p.a).map((s) => ({ s, v: corrOf(p.a, s) })).filter((x) => Number.isFinite(x.v)).sort((x, y) => y.v - x.v), v = rest[p.a];
    body = <><p className="eqv-rn">{label(p.a)} <span>· {sectorOf(p.a)}</span></p>
      <p className="eqv-rv"><b>{v.toFixed(2)}</b><span className={"eqv-rw eqv-t" + corrBand(v)}>{cap1(corrWord(v))} linked with the rest</span></p>
      {mine.length > 0 && <p className="eqv-rx">Moves most with <b>{label(mine[0].s)}</b> ({mine[0].v.toFixed(2)}), least with <b>{label(mine[mine.length - 1].s)}</b> ({mine[mine.length - 1].v.toFixed(2)}).</p>}
      <CorrScale v={v} typical={typical} />{typical != null && <p className="eqv-rx2">Line: your typical pair, {typical.toFixed(2)}</p>}</>;
  }
  const isPair = (x: Pair) => !!p?.b && ((p.a === x.a && p.b === x.b) || (p.a === x.b && p.b === x.a));
  return (
    <div className="eqv-rp">
      <div className="eqv-rc eqv-rc1"><p className="eqv-rk">Read a pair or a share<Info about="Read a pair or a share" text="The pair or the share you tapped, in words: its figure, how closely that is linked, the part of their weekly moves the two have in common (the figure squared) and where it sits against your typical pair." /></p>
        <div aria-live="polite">{body}</div>
        {p && <p className="eqv-rx2">Tap a cell or a name in the grid, a dot above, or a line here.</p>}</div>
      <div className="eqv-rc"><p className="eqv-rk">Pairs that move most alike<Info about="Pairs that move most alike" text={`The four pairs of your shares whose weekly prices moved most alike over ${togetherWindow(weeks)}. Across sectors: the two sit in different macro sectors, so the sector labels alone would not show the link.`} /></p>
        <ol className="eqv-pl">{pairs.slice(0, 4).map((x) => <li key={x.a + x.b}><button type="button" className={isPair(x) ? "on" : undefined} aria-pressed={isPair(x)} onClick={() => onPick({ a: x.a, b: x.b })}>
          <span className="n">{label(x.a)} · {label(x.b)}{sectorOf(x.a) !== sectorOf(x.b) && <em>across sectors</em>}</span><span className="v"><small>{corrWord(x.corr)}</small>{x.corr.toFixed(2)}</span></button></li>)}</ol>
        {secRows.length > 0 && <>
          <p className="eqv-rk eqv-rk2">Sectors in the grid<Info about="Sectors in the grid" text="Each macro sector's shares with each other (inside) and with every share outside it (others), as average correlations." how="Inside well above others: that macro sector's shares move as one bet. Close together: the macro sector adds little spread. A dash: one share, nothing to compare inside it." /><span>inside · with others</span></p>
          <table className="eqv-mst" id="eqv-mst"><thead><tr><SortHead id="name" label="Macro sector" sort={sec} /><SortHead id="inside" label="Inside" sort={sec} num /><SortHead id="others" label="Others" sort={sec} num /></tr></thead>
            <tbody>{secShown.shown.map((r) => <tr key={r.name}><th scope="row"><i style={{ background: dot(r.name) }} aria-hidden="true" />{r.name} · {r.n}</th><td className="r">{r.inside == null ? "–" : r.inside.toFixed(2)}</td><td className="r">{r.others == null ? "–" : r.others.toFixed(2)}</td></tr>)}</tbody></table>
          {secShown.capped && <ShowAll n={secRows.length} noun="macro sector" open={allSec} onToggle={() => setAllSec(!allSec)} controls="eqv-mst" />}</>}
      </div>
      <div className="eqv-rc"><p className="eqv-rk">Each share against the rest<Info about="Each share against the rest" text={`Each share's average correlation with every other share in your list over ${togetherWindow(weeks)}, lowest first: the shares at the top go their own way most. Each figure carries its word: below 0.2 barely, 0.2 to 0.4 loosely, 0.4 to 0.6 partly, 0.6 and up closely.`} /><span>most independent first</span></p>
        <ul className="eqv-rest" id="eqv-rest">{restShown.shown.map((s) => { const v = rest[s], sel = !!p && !p.b && p.a === s;
          return <li key={s}><button type="button" className={sel ? "on" : undefined} aria-pressed={sel} onClick={() => onPick({ a: s })}><span className="n">{label(s)}</span><span className="t" aria-hidden="true"><i className={"eqv-b" + corrBand(v)} style={{ width: `${((Math.max(0, v) / mx) * 100).toFixed(1)}%` }} /></span><span className="v">{corr2(v)} <small className="eqv-vw">{corrWord(v)}</small></span></button></li>; })}</ul>
        {cap.capped && <ShowAll n={restRows.length} open={allRest} onToggle={() => setAllRest(!allRest)} controls="eqv-rest" />}
        <p className="eqv-rx2">The same figure as “Moves with rest” in Your shares; “Most independent first” puts the grid in this order.</p></div>
    </div>);
}
