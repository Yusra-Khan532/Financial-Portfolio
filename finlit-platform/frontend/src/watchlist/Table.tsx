// Task #408: the list's table (02-columns.md): four column sets, two-row grouped headers with their ⓘ, sorting both ways, Group by bands that open and
// close, the bell and Details on each row, and the Details row with its six blocks (01-page.md section 3). Every figure comes from lib/watchlistData.ts;
// a source that failed shows "Could not load. Try again." in its own cells only. Describes, never advises.
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import { AlertButton } from "../components/AlertComposer";
import { Tip } from "../components/sectors/pack/Common";
import { Logo } from "../components/search/parts";
import { titleOf } from "../lib/companyLabel";
import { plansFromText } from "../lib/planNames";
import type { WatchData } from "../lib/watchlistData";
import { quarterName } from "../lib/watchlistData";
import {
  BAND_WORD, COULD_NOT, LABEL_TONE, LABEL_WORD, NO_LABEL_DETAIL, NO_SCORE, NEAR, band, colsOf, dMon, dist, distText, groupHeads, groupStocks, istDay, pc, pendingNote, pts,
  rangeAt, rangeNote, rs, sgn1, since, sizeWord, stocksN, techBand, tone, trend, type Col, type GroupBy, type View, type WStock,
} from "../lib/watchlistPack";
import { PriceChart } from "./Chart";

const chev = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
const sortI = <svg aria-hidden="true" fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 12 12" width="10"><path d="m3 4.5 3-3 3 3M3 7.5l3 3 3-3" /></svg>;
const noteI = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>;
const PRISM_GOLD = `FinLit Prism comes with ${plansFromText("gold")}.`;   // the plans whose tier opens it (lib/planNames.ts)

export type TableProps = {
  stocks: WStock[]; view: View; group: GroupBy; sort: string | null; dir: 1 | -1; open: Set<string>; shut: Set<string>; cmp: Set<string>;
  data: WatchData; lists: { id: string; name: string }[]; listId: string; logos: Map<string, { logo?: string | null }>;
  onSort: (k: string) => void; onToggle: (s: string) => void; onShut: (k: string) => void; onCmp: (s: string, on: boolean) => void; onScreens: (s: string) => void; onNote: (s: string) => void;
  onTarget: (s: string, v: string) => void; onNearAlert: (s: string, on: boolean) => void; onNoteText: (s: string, v: string) => void; onMove: (s: string, to: string) => void; onRemove: (s: string) => void;
  targetText: Record<string, string>;
};

const Retry = ({ fn }: { fn: () => void }) => <span className="wl-err">{COULD_NOT} <button type="button" className="wl-lnk" onClick={fn}>Try again</button></span>;
const Dash = ({ why }: { why: string }) => <span className="wl-na" title={why}>—</span>;
const Part = ({ v, why }: { v: number | null; why: string }) => (v == null ? <span className="wl-sc na" title={why}>−</span> : <span className={"wl-sc b-" + band(v)}>{BAND_WORD[band(v) as "hi"]}</span>);
function Tech({ sc, w, why }: { sc: number | null; w: string | null; why: string }) {
  if (sc == null) return <span className="wl-sc na" title={why}>−</span>;
  const r = Math.round(Math.max(-100, Math.min(100, sc))), b = techBand(w);
  return <span className="wl-tc"><b className={"wl-sc b-" + b}>{r > 0 ? "+" : r < 0 ? "−" : ""}{Math.abs(r)}</b>{w && <small className={"t-" + b}>{w}</small>}</span>;
}
function PrismBox({ s, why }: { s: WStock; why: string }) {
  if (s.prism == null) return <span className="wl-sc na" title={why}>−</span>;
  const b = band(s.prism);
  return <span className="wl-tc"><b className={"wl-sc big b-" + b}>{Math.round(s.prism)}</b>{s.prismWord && <small className={"t-" + b}>{s.prismWord}</small>}</span>;
}

function Th({ c, rowSpan, sort, dir, onSort }: { c: Col; rowSpan?: number; sort: string | null; dir: 1 | -1; onSort: (k: string) => void }) {
  if (c.k === "ac") return <th scope="col" rowSpan={rowSpan}><span className="sr-only">Actions</span></th>;
  const cls = c.c?.split(" ") ?? [];
  const cc = [cls.includes("r") ? "r" : "", cls.includes("wl-dv") ? "wl-dv" : "", c.hw ? "hw" : ""].join(" ").trim() || undefined;
  return (
    <th scope="col" rowSpan={rowSpan} className={cc} aria-sort={c.s ? (sort === c.s ? (dir > 0 ? "ascending" : "descending") : "none") : undefined}>
      <span className="wp-th">{c.s ? <button type="button" data-sort={c.s} title={c.title || `Sort by ${c.l || c.t}`} onClick={() => onSort(c.s!)}>{c.t}{sortI}</button> : c.t}
        {c.i && <Tip text={c.i} label={`About ${c.t}`} />}</span>
      {c.sub && <small className="wl-hsub">{c.sub}</small>}
    </th>
  );
}
function Head({ view, sort, dir, onSort, quarter }: { view: View; sort: string | null; dir: 1 | -1; onSort: (k: string) => void; quarter: string | null }) {
  const V = colsOf(view), G = groupHeads(quarter);
  if (!V.some((c) => c.g)) return <tr>{V.map((c) => <Th key={c.k} c={c} sort={sort} dir={dir} onSort={onSort} />)}</tr>;
  const r1: ReactNode[] = [], r2: ReactNode[] = [];
  for (let i = 0; i < V.length; i++) {
    const c = V[i];
    if (!c.g) { r1.push(<Th key={c.k} c={c} rowSpan={2} sort={sort} dir={dir} onSort={onSort} />); continue; }
    let n = 1; while (V[i + n] && V[i + n].g === c.g) n++;
    const [name, info] = G[c.g];
    r1.push(<th key={"g" + c.g} scope="colgroup" colSpan={n} className="wl-gh wl-dv"><span className="wp-th">{name}{info && <Tip text={info} label={`About ${name}`} />}</span></th>);
    for (let j = 0; j < n; j++) r2.push(<Th key={V[i + j].k} c={V[i + j]} sort={sort} dir={dir} onSort={onSort} />);
    i += n - 1;
  }
  return <><tr className="wl-h1">{r1}</tr><tr className="wl-h2">{r2}</tr></>;
}

function Cell({ s, c, p }: { s: WStock; c: Col; p: TableProps }) {
  const L = { "data-l": c.pl || c.t };
  const d = p.data, eq = d.err.quote(s.s), el = d.err.lead(s.s);
  const prismWhy = d.prismLocked ? PRISM_GOLD : NO_SCORE;
  const secWhy = d.sectorsLocked ? "Sector Pulse and Sector Rotation are not part of this plan." : "This company is not in an industry group with a reading.";
  switch (c.k) {
    case "co": {
      const lg = p.logos.get(s.s);
      return <td className="c-co"><div className="wp-co">
        <input type="checkbox" data-cmp={s.s} aria-label={`Select ${s.s} to compare`} checked={p.cmp.has(s.s)} onChange={(e) => p.onCmp(s.s, e.target.checked)} />
        <span className="wl-mono"><Logo src={lg?.logo} name={s.name} kind="stock" size={28} /></span>
        <div className="wl-cn"><span className="wl-sym"><Link to={`/stocks/${encodeURIComponent(s.s)}`}><b>{titleOf({ symbol: s.s, name: s.name })}</b></Link>
          {s.scr.length > 0 && <button type="button" className="wl-scb" data-scr={s.s} title={`In ${s.scr.length} Advanced screener screens: ${s.scr.map((x) => x.name).join(", ")}`} aria-label={`${s.s} is in ${s.scr.length} Advanced screener screen${s.scr.length === 1 ? "" : "s"}`} onClick={() => p.onScreens(s.s)}>{s.scr.length} screen{s.scr.length === 1 ? "" : "s"}</button>}
          {s.note && <button type="button" className="wl-ntb" data-note={s.s} title={s.note} aria-label={`Your note on ${s.s}: ${s.note}`} onClick={() => p.onNote(s.s)}>{noteI}</button>}
        </span><small title={s.name}>{s.name}</small></div></div></td>;
    }
    case "px": return <td className="c-px r wp-px" {...L}>{eq ? <Retry fn={eq} /> : s.px == null ? <><b title="No quote yet for this company.">—</b><span>—</span></> : <><b>{rs(s.px)}</b>{s.chgp == null ? <span title="No change for the day yet.">—</span> : <span className={tone(s.chgp)}>{pc(s.chgp)}</span>}</>}</td>;
    case "since": { const v = since(s); return <td className="r" {...L}><div>{v == null ? <b className="wl-b" title={s.addedPrice ? "No quote yet for this company." : "The price on the day you added it is being filled in from the stored closes."}>—</b> : <b className={"wl-b " + tone(v)}>{pc(v)}</b>}<span className="wl-s">{s.added ? `from ${dMon(istDay(s.added))}` : ""}</span></div></td>; }
    case "tg": {
      const dt = distText(dist(s));
      return <td className="c-tg" {...L}><div><input className="wp-tg" type="number" inputMode="decimal" min={0} step={0.05} placeholder="₹ add" aria-label={`${s.s} target price in rupees`} data-tgt={s.s}
        value={p.targetText[s.s] ?? (s.target ?? "")} onChange={(e) => p.onTarget(s.s, e.target.value)} /><span className={"wl-dist" + (dt.near ? " near" : "")} data-dist={s.s}>{dt.t}</span></div></td>;
    }
    case "m1": return <td className="r" {...L}><div>{eq ? <Retry fn={eq} /> : s.m1 == null ? <b className="wl-b" title="Returns are not stored yet for this company.">—</b> : <b className={"wl-b " + tone(s.m1, 1)}>{pc(s.m1, 1)}</b>}
      <span className="wl-s">3 months {s.m3 == null ? "—" : <span className={tone(s.m3, 1)}>{pc(s.m3, 1)}</span>}</span></div></td>;
    case "rng": {
      if (s.px == null || !s.h52 || !s.l52) return <td {...L}>{eq ? <Retry fn={eq} /> : <Dash why="No 52-week range yet for this company." />}</td>;
      const at = rangeAt(s.px, s.l52, s.h52);
      return <td {...L}><div><div className="wl-rng" role="img" aria-label={`52-week range ${rs(s.l52)} to ${rs(s.h52)}, price at ${at.toFixed(0)}% of the range`}><i style={{ left: `${at.toFixed(1)}%` }} /></div><span className="wl-s">{rangeNote(s.px, s.h52)}</span></div></td>;
    }
    case "tr": { const t = trend(s.stS, s.ltS); return <td className="wl-tr" {...L}>{t ? <div><b>{t.phrase}</b><span className="wl-s">Short {t.st} · Long {t.lt}</span></div> : d.err.prism ? <Retry fn={d.err.prism} /> : <Dash why={d.prismLocked ? "The trend reads FinLit Prism’s short- and long-term scores, which come with Gold." : NO_SCORE} />}</td>; }
    case "prism": return <td className="wl-dv" {...L}>{d.err.prism ? <Retry fn={d.err.prism} /> : <PrismBox s={s} why={prismWhy} />}</td>;
    case "gp": return <td {...L}><Part v={s.gp} why={prismWhy} /></td>;
    case "val": return <td data-l="Val. (strong = cheaper)"><Part v={s.val} why={prismWhy} /></td>;
    case "qual": return <td {...L}><Part v={s.qual} why={prismWhy} /></td>;
    case "risk": return <td data-l="Risk (strong = safer)"><Part v={s.risk} why={prismWhy} /></td>;
    case "st": return <td className="wl-dv" {...L}><Tech sc={s.stS} w={s.stW} why={prismWhy} /></td>;
    case "lt": return <td {...L}><Tech sc={s.ltS} w={s.ltW} why={prismWhy} /></td>;
    case "peer": return <td className="wl-dv wl-pr" {...L}>{el ? <Retry fn={el} /> : s.peer ? <div><b title={s.pending && s.rawLabel ? pendingNote(s.rawLabel) : undefined}>{LABEL_WORD[s.peer]}{s.pending && s.rawLabel && s.rawLabel !== s.peer ? "*" : ""}</b><small>{s.peerRank} of {s.peerOf} peers</small></div>
      : <div><b>{s.noLabelYet ? "No label yet" : "—"}</b><small>{s.noLabelYet ? "Under a year of prices" : s.peerWhy ?? "Not in the last weekly check"}</small></div>}</td>;
    case "size": return <td className="wp-size" {...L}>{s.mcap == null ? (d.err.uni ? <Retry fn={d.err.uni} /> : <Dash why="Market value not known yet." />) : <div>{sizeWord(s.mcap)}<small>₹{Math.round(s.mcap).toLocaleString("en-IN")} Cr</small></div>}</td>;
    case "pe": return <td className="r wl-dv" {...L}>{s.pe == null ? <Dash why="No P/E: the company has no profit over the last 12 months, or it is not stored yet." /> : `${s.pe.toFixed(1)}×`}</td>;
    case "pb": return <td className="r" {...L}>{s.pb == null ? <Dash why="No P/B stored yet." /> : `${s.pb.toFixed(2)}×`}</td>;
    case "dy": return <td className="r" {...L}>{s.dy == null ? <Dash why="No dividends in the last 12 months, or not stored yet." /> : `${s.dy.toFixed(2)}%`}</td>;
    case "roe": return <td className="r wl-dv" {...L}>{s.roe == null ? <Dash why="No ROE stored yet." /> : `${s.roe.toFixed(1)}%`}</td>;
    case "rev": case "np": {
      const y = c.k === "rev" ? s.revY : s.npY, cr = c.k === "rev" ? s.revCr : s.npCr, ef = d.err.fin(s.s);
      return <td className="r" {...L}>{ef ? <Retry fn={ef} /> : d.loading.fin(s.s) ? <span className="wl-ld" aria-label="Loading" /> : <div>{y == null ? <b className="wl-b" title="No same quarter a year earlier to compare with, or a loss then.">—</b> : <b className={"wl-b " + tone(y, 1)}>{pc(y, 1)}</b>}<span className="wl-s">{cr == null ? "" : `₹${Math.round(cr).toLocaleString("en-IN")} Cr`}</span></div>}</td>;
    }
    case "res": { const ee = d.err.ev(s.s); return <td className="wl-dv" {...L}>{ee ? <Retry fn={ee} /> : d.loading.ev(s.s) ? <span className="wl-ld" aria-label="Loading" /> : s.resD ? <div><b className="wl-b">{dMon(s.resD)}</b><span className="wl-s">{s.resQ ?? ""}</span></div> : <Dash why="No results filing among its latest filings." />}</td>; }
    case "th": return <td className="c-th" {...L}>{d.err.theme ? <Retry fn={d.err.theme} /> : <div><span className="wl-b wl-ell" title={s.theme ?? undefined}>{s.theme ?? "Not placed yet"}</span>{s.theme && s.themeStatus && <span className="wl-s">{s.themeStatus}</span>}</div>}</td>;
    case "sind": return <td className="c-stk" {...L}>{s.ind ? <div>{s.sec?.slug ? <Link className="wl-b wl-ind" to={`/sectors/${s.sec.slug}`}>{s.ind}</Link> : <span className="wl-b">{s.ind}</span>}<span className="wl-s wl-sec-s" title={s.sec?.sector ?? undefined}>{s.sec?.sector ?? ""}</span></div> : <Dash why="This company is not in NSE's industry lists." />}</td>;
    case "pulse": return <td className="wl-dv c-stk" {...L}>{d.err.sectors ? <Retry fn={d.err.sectors} /> : s.sec?.pulse ? <div><span className={"wp-chip " + s.sec.pulseTone} title={s.sec.pulseTip ?? undefined}>{s.sec.pulse}</span><span className="wl-s">{s.sec.pulseNote}</span></div> : <Dash why={secWhy} />}</td>;
    case "corner": return <td className="wl-dv c-stk" {...L}>{d.err.sectors ? <Retry fn={d.err.sectors} /> : s.sec?.corner ? <div><span className={"wp-chip " + s.sec.cornerTone} title={s.sec.cornerTip ?? undefined}>{s.sec.corner}</span><span className="wl-s">{s.sec.cornerNote}</span></div> : <Dash why={secWhy} />}</td>;
    case "rrank": return <td className="c-stk" {...L} title={s.sec?.rk1 && s.sec.rk4 ? `${s.sec.rk1}, ${s.sec.rk4.toLowerCase()}` : undefined}>{s.sec?.rank != null && s.sec.of ? <div><span className="wl-rk"><b className="wl-b">{s.sec.rank} of {s.sec.of}</b>{s.sec.hist.length > 1 && <Spark h={s.sec.hist} of={s.sec.of} />}</span><span className="wl-s">{s.sec.rk1}</span></div> : <Dash why={secWhy} />}</td>;
    case "vsix": return <td className="r wl-dv c-stk" {...L} title={s.vixName ? `Against ${s.vixName}` : undefined}>{el ? <Retry fn={el} /> : s.vix52 == null ? <Dash why="Not compared with its sector index yet." /> : <div><b className={"wl-b " + tone(s.vix52, 1)}>{pts(s.vix52)}</b><span className="wl-s">3 months {s.vix13 == null ? "—" : <span className={tone(s.vix13, 1)}>{sgn1(s.vix13)}</span>}</span></div>}</td>;
    case "ac": { const o = p.open.has(s.s); return <td className="wl-ac" data-l=""><AlertButton symbol={s.s} className="wp-ib" /><button className="wl-xb" type="button" data-x={s.s} aria-expanded={o} aria-controls={`wlx-${s.s}`} aria-label={`Details for ${s.s}`} onClick={() => p.onToggle(s.s)}>{chev}<span className="wl-xl">Details</span></button></td>; }
    default: return <td />;
  }
}

function Spark({ h, of }: { h: number[]; of: number }) {
  const W = 72, H = 26, n = h.length;
  const X = (i: number) => ((i * (W - 4)) / (n - 1) + 2).toFixed(1), Y = (r: number) => (2 + ((r - 1) * (H - 4)) / Math.max(1, of - 1)).toFixed(1);
  return <svg className="wl-sp" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Rotation rank over ${n} weeks, from ${h[0]} to ${h[n - 1]} of ${of}`}>
    <path d={h.map((r, i) => (i ? "L" : "M") + X(i) + " " + Y(r)).join("")} /><circle cx={X(n - 1)} cy={Y(h[n - 1])} r={2.5} /></svg>;
}

function Details({ s, p, span }: { s: WStock; p: TableProps; span: number }) {
  const d = p.data, o = p.open.has(s.s), S = s.sec;
  const kv = (k: ReactNode, v: ReactNode) => <><dt>{k}</dt><dd>{v}</dd></>;
  const n = d.screens?.screens ?? null;
  const ec = d.err.chart(s.s), ee = d.err.ev(s.s);
  return (
    <tr className="wl-x" id={`wlx-${s.s}`} hidden={!o}><td colSpan={span}>{o && <div className="wl-xg">
      <section className="wl-xc d-chart"><h3>Price · last 3 months</h3>
        {ec ? <Retry fn={ec} /> : <PriceChart sym={s.s} series={d.chart(s.s)} px={s.px} asOf={s.quoteAsOf} addedDay={s.added ? istDay(s.added) : null} target={s.target} />}
        <ul className="wl-ret">{([["Since added", since(s), 2], ["1 month", s.m1, 1], ["3 months", s.m3, 1], ["1 year", s.y1, 1]] as const).map(([k, v, dd]) =>
          <li key={k}><span>{k}</span>{v == null ? <b>—</b> : <b className={tone(v, dd)}>{pc(v, dd)}</b>}</li>)}</ul></section>
      <section className="wl-xc d-yours"><h3>Yours</h3>
        <div className="wl-f"><label htmlFor={`nt-${s.s}`}>Why you are watching</label><textarea id={`nt-${s.s}`} data-nt={s.s} maxLength={200} placeholder="Add a note" value={s.note} onChange={(e) => p.onNoteText(s.s, e.target.value)} /></div>
        <div className="wl-f"><label htmlFor={`tg-${s.s}`}>Target price (₹)</label><input id={`tg-${s.s}`} type="number" inputMode="decimal" min={0} step={0.05} placeholder="Set a target" data-tgt={s.s}
          value={p.targetText[s.s] ?? (s.target ?? "")} onChange={(e) => p.onTarget(s.s, e.target.value)} /></div>
        <label className="wl-chk wl-f"><input type="checkbox" data-al={s.s} checked={s.nearAlert} onChange={(e) => p.onNearAlert(s.s, e.target.checked)} /><span>Tell me when the price is within {NEAR}% of my target</span></label>
        <div className="wl-f"><label htmlFor={`mv-${s.s}`}>Move to another list</label><select id={`mv-${s.s}`} value="" onChange={(e) => { if (e.target.value) p.onMove(s.s, e.target.value); }}>
          <option value="">Keep on {p.lists.find((l) => l.id === p.listId)?.name}</option>{p.lists.filter((l) => l.id !== p.listId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div className="wl-row2"><Link className="wl-lnk" to={`/stocks/${encodeURIComponent(s.s)}`}>Open the report ↗</Link><button type="button" className="wl-lnk bad" onClick={() => p.onRemove(s.s)}>Remove</button></div></section>
      <section className="wl-xc d-files"><h3>Latest filings</h3>{ee ? <Retry fn={ee} /> : d.loading.ev(s.s) ? <span className="wl-ld" aria-label="Loading" /> : s.filings.length ? <ul className="wl-fl">{s.filings.map((f) =>
        <li key={f.d + f.t}><span className="wl-fd">{dMon(f.d)}</span>{f.l ? <a href={f.l} rel="noopener noreferrer" target="_blank">{f.t} ↗</a> : <span>{f.t}</span>}</li>)}</ul> : <p className="wl-none2">No filings stored yet.</p>}
        {!ee && <p className="wl-foot2">Last results: {s.resD ? `${dMon(s.resD)}${s.resQ ? ` (${s.resQ})` : ""}` : "none among its latest filings"}</p>}</section>
      <section className="wl-xc d-peers"><h3>Prism and peers</h3>{d.err.lead(s.s) ? <Retry fn={d.err.lead(s.s)!} /> : <dl className="wl-kv">
        {kv("FinLit Prism", s.prism != null ? <PrismBox s={s} why={NO_SCORE} /> : <span className="wl-mut">{d.prismLocked ? PRISM_GOLD : NO_SCORE}</span>)}
        {kv("Technical view", s.stS != null || s.ltS != null ? <><span className="wl-tv"><Tech sc={s.stS} w={s.stW} why={NO_SCORE} /><small className="wl-mut">short</small></span><span className="wl-tv"><Tech sc={s.ltS} w={s.ltW} why={NO_SCORE} /><small className="wl-mut">long</small></span></> : <span className="wl-mut">{d.prismLocked ? PRISM_GOLD : NO_SCORE}</span>)}
        {kv("Vs its peers", s.peer ? <><span className={"wp-chip " + LABEL_TONE[s.peer]}>{LABEL_WORD[s.peer]}</span> {s.peerRank} of {s.peerOf} {s.peerGroup}</> : s.noLabelYet ? NO_LABEL_DETAIL : s.peerWhy ?? "Not in the last weekly check.")}
        {s.peer && kv("Label since", s.labelSince ? `${LABEL_WORD[s.peer]} since ${dMon(s.labelSince)}` : "—")}
        {s.vixName && kv(`Vs ${s.vixName}`, s.vix52 == null ? "—" : <><span className={tone(s.vix52, 1)}>{pts(s.vix52)}</span> over 12 months</>)}
        {s.grp1 && kv("Group #1", s.grp1)}
      </dl>}{s.pending && s.rawLabel && s.peer && s.rawLabel !== s.peer && <p className="wl-pend">{pendingNote(s.rawLabel)}</p>}</section>
      <section className="wl-xc d-ind"><h3>Industry and theme</h3>{d.err.sectors ? <Retry fn={d.err.sectors} /> : <dl className="wl-kv">
        {kv("Industry", s.ind ? <>{s.ind}{S?.sector && <span className="wl-mut"> · {S.sector}</span>}</> : "Not in NSE’s industry lists")}
        {kv("Sector Pulse", S?.pulse ? <><span className={"wp-chip " + S.pulseTone}>{S.pulse}</span>{S.breadth != null && <span className="wl-sub2">{Math.round(S.breadth)}% of its {S.n} stocks rising</span>}</> : "No reading for its industry")}
        {kv("Sector Rotation", S?.corner ? <><span className={"wp-chip " + S.cornerTone}>{S.corner}</span>{S.rank != null && <span className="wl-sub2">{S.rank} of {S.of}{S.rk1 ? ` · ${S.rk1.toLowerCase()}` : ""}</span>}</> : "No reading for its industry")}
        {S?.s6 != null && kv("Vs average industry", <><span className={tone(S.s6, 1)}>{pts(S.s6)}</span> over 6 months{S.s1 != null && <span className="wl-sub2"><span className={tone(S.s1, 1)}>{pts(S.s1)}</span> last month</span>}</>)}
        {kv("Theme", s.theme ? <>{s.theme}{s.themeStatus && <span className="wl-mut"> · {s.themeStatus}</span>}</> : "Not placed yet")}
      </dl>}</section>
      <section className="wl-xc d-scr" id={`wls-${s.s}`}><h3>Advanced screener{d.screensLocked ? "" : " · "}{d.screensLocked ? "" : s.scr.length ? `${s.scr.length} screen${s.scr.length === 1 ? "" : "s"}` : "no screens"}</h3>
        {d.screensLocked ? <p className="wl-none2">The Advanced screener’s screens come with {plansFromText("gold")}.</p> : d.err.screens ? <Retry fn={d.err.screens} /> : s.scr.length ? <ul className="wl-scl">{s.scr.map((x) =>
          <li key={x.id}><Link to={`/advanced-score-screener?preset=${encodeURIComponent(x.id)}`}>{x.name} ↗</Link><small>{x.group} · {x.added_on ? (x.baseline ? `on it since ${dMon(x.added_on)}` : `joined ${dMon(x.added_on)}`) : "on it today"}{x.position ? ` · ${x.position} of ${x.count}` : ""}</small></li>)}</ul>
          : <p className="wl-none2">{n != null ? `Not in any of the screener’s ${n} screens today.` : "Not in any of the screener’s screens today."}</p>}
        {!d.screensLocked && d.screens?.asOf && <p className="wl-foot2">Screens as of {dMon(d.screens.asOf)}. A screen narrows a list; it is not a recommendation.</p>}</section>
    </div>}</td></tr>
  );
}

export function WatchTable(p: TableProps) {
  const V = colsOf(p.view), groups = groupStocks(p.stocks, p.group);
  const rows = (list: WStock[]) => list.map((s) => <Fragment key={s.s}><tr className={"wl-r" + (p.open.has(s.s) ? " open" : "")} data-s={s.s}>{V.map((c) => <Cell key={c.k} s={s} c={c} p={p} />)}</tr><Details s={s} p={p} span={V.length} /></Fragment>);
  return (
    <table className={"wp-t wl-t v-" + p.view} id="wl-t" aria-label={`${p.lists.find((l) => l.id === p.listId)?.name}: your stocks`}>
      <thead>
        <Head view={p.view} sort={p.sort} dir={p.dir} onSort={p.onSort} quarter={quarterName(p.data.latestPeriod)} /></thead>
      <tbody>
        {p.group === "none" ? rows(groups[0]?.stocks ?? []) : groups.map((g) => { const k = `${p.group}:${g.key}`, sh = p.shut.has(k); return <Fragment key={k}>
          <tr className={"wp-grp " + g.tone}><th colSpan={V.length} scope="colgroup"><button type="button" className="wl-gb" data-gb={k} aria-expanded={!sh} onClick={() => p.onShut(k)}><b>{g.label}</b><span>{stocksN(g.stocks.length)}</span>{chev}</button></th></tr>
          {!sh && rows(g.stocks)}</Fragment>; })}
      </tbody>
    </table>
  );
}
