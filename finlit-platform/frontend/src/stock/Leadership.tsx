import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeFloating, type Placement } from "../lib/floating";
import { Link, useNavigate } from "react-router";
import { Icon } from "../lib/icons";
import { HScroll } from "../components/HScroll";
import {
  LABEL_WORD, groupSourceLine, monthYear, pts, sectorBench, tone, useLeadership,
  type Direction, type LeadLabel, type LeadershipOn,
} from "../lib/leadership";

/** Leader / In line / Laggard. Describes past relative price performance only; never a recommendation. */
export const LEAD_NOTE = "Describes past performance; not a recommendation.";
const EXPLAINER = "/leadership-label";

const dirWord = (d: Direction) => (d === "gaining" ? "gaining over 3 months" : d === "weakening" ? "weakening over 3 months" : "");

/* ------------------------------------------------------------------ chip + tooltip */
export function LeadChip({ label, onClick, title }: { label: LeadLabel; onClick?: () => void; title?: string }) {
  const body = <><i className="ld-dot" aria-hidden="true" />{LABEL_WORD[label]}</>;
  return onClick
    ? <button type="button" className={"ld-chip " + label} onClick={onClick} title={title} aria-label={`${LABEL_WORD[label]}. Show the peer ranking`}>{body}</button>
    : <span className={"ld-chip " + label}>{body}</span>;
}

function LeadTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Placement | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const leave = useRef(0);
  // Portalled and fixed: it can never be clipped or re-themed by the hero it sits in, and it is placed beside/above/below
  // the (i) so that it does not cover the Set alert / Watchlist / Download buttons.
  useLayoutEffect(() => { if (open && btn.current && tip.current) setPos(placeFloating(btn.current, tip.current)); else setPos(null); }, [open, text]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !tip.current?.contains(t)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const shut = () => setOpen(false);
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    addEventListener("scroll", shut, true); addEventListener("resize", shut);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); removeEventListener("scroll", shut, true); removeEventListener("resize", shut); };
  }, [open]);
  useEffect(() => () => clearTimeout(leave.current), []);
  const hold = () => { clearTimeout(leave.current); setOpen(true); };
  const release = () => { clearTimeout(leave.current); leave.current = window.setTimeout(() => setOpen(false), 140); };
  return (
    <span className="ld-tipw" ref={box} onMouseEnter={hold} onMouseLeave={release}>
      <button ref={btn} type="button" className="info" aria-label="What does this label mean?" aria-expanded={open} onClick={() => setOpen((o) => !o)} onFocus={hold}>i</button>
      {open && createPortal(
        <span ref={tip} className="ld-tip" role="tooltip" onMouseEnter={hold} onMouseLeave={release}
          style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, maxHeight: pos?.maxH, overflowY: "auto", visibility: pos ? "visible" : "hidden" }}>
          {text} <Link to={EXPLAINER} onClick={() => setOpen(false)}>What the labels mean →</Link>
        </span>, document.body)}
    </span>
  );
}

/* ------------------------------------------------------------------ 1. the line under the company name */
export function LeadLine({ symbol, jump }: { symbol: string; jump: (id: string) => void }) {
  const q = useLeadership(symbol);
  const d = q.data;
  if (q.isLoading || !d) return <div className="ld-line ld-wait" aria-hidden="true" />;
  if (!d.available) return d.display ? <div className="ld-line"><span className="ld-empty" role="note">{d.display.line}</span></div> : null;   // switched off, or the first weekly run has not happened: nothing to say
  const parts = d.display.parts;
  return (
    <div className="ld-line">
      <div className="ld-row">
        <span className="ld-a">
          <LeadChip label={d.label} onClick={() => jump("peers")} />
          <span className="ld-rank">{parts?.rank || d.display.line}</span>
        </span>
        {parts && (
          <span className="ld-b">
            <button type="button" className="ld-fig" onClick={() => jump("leadership")}><b className={"pt " + tone(parts.sector.v)}>{parts.sector.pts} pts</b> vs {parts.sector.name}</button>
            {parts.market && <button type="button" className="ld-fig" onClick={() => jump("leadership")}><b className={"pt " + tone(parts.market.v)}>{parts.market.pts} pts</b> vs {parts.market.name}</button>}
            <span className="ld-win">(12 months)</span>
          </span>
        )}
        {parts?.direction && <span className={"ld-dir ld-c " + parts.direction}>{parts.direction === "gaining" ? "▲" : "▼"} {dirWord(parts.direction)}</span>}
        <LeadTip text={d.display.tooltip || ""} />
      </div>
      <div className="ld-notes">
        {d.display.note && <div className="ld-caution" role="note"><Icon name="alert" /><span>{d.display.note}</span></div>}
        {d.display.pending && <div className="ld-stale" role="note">{d.display.pending}</div>}
        {d.stale && <div className="ld-stale" role="note">Last updated {monthYear(d.asOf)}; this week's refresh has not come through yet.</div>}
        {d.display.benchmarkNote && <div className="ld-stale" role="note">{d.display.benchmarkNote}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 2. the peer ranking table (Peers section) */
type Row = { symbol: string; name: string; rank: number | null; label: LeadLabel | null; thisWeek: LeadLabel | null; direction: Direction; rel52: number | null; rel13: number | null; rel52Market: number | null };
type SortKey = "rank" | "name" | "rel52" | "rel13" | "rel52Market";

/** Above the table: the status sentence, this week's own answer when it differs, what the figures are measured against, how long the label has stood, and the peer group. */
export function RankingStatus({ lead }: { lead: LeadershipOn }) {
  const d = lead.display, g = lead.peerGroup, r = lead.runs52, slots = g.leaderSlots;
  const peerAvg = lead.benchmarks.sector.kind === "peer_average";
  return (
    <div className="ld-status">
      <p className="ld-sline"><LeadChip label={lead.label} /><span>{d.line}</span></p>
      {d.pending && <p className="ld-pend" role="note">{d.pending}</p>}
      <ul className="ld-facts">
        <li>The 12-month and 3-month figures are against <b>{sectorBench(lead)}</b>{peerAvg ? ", because there is no matching sector index" : ""}{lead.benchmarks.market ? <>; the market figure is against <b>{lead.benchmarks.market.name}</b></> : ""}.</li>
        {slots != null && slots > 0 && <li>The top {slots} of {g.ranked} can be Leaders (12-month figure above 0) and the bottom {slots} Laggards (below 0); the rest are In line.</li>}
        {lead.labelSince && <li>This label has stood since {new Date(lead.labelSince + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.</li>}
        {r && r.total > 0 && <li>Over the last 52 weeks ({r.total} {r.total === 1 ? "check" : "checks"}): Leader {r.leader} · In line {r.in_line} · Laggard {r.laggard}.</li>}
        <li>{groupSourceLine(lead)}</li>
      </ul>
    </div>
  );
}

export function PeerRanking({ lead, self, extras }: { lead: LeadershipOn; self: string; extras: { symbol: string; name: string | null }[] }) {
  const nav = useNavigate();
  const [key, setKey] = useState<SortKey>("rank");
  const [dir, setDir] = useState<1 | -1>(1);
  const [all, setAll] = useState(false);
  const rows = useMemo<Row[]>(() => {
    const ranked: Row[] = lead.peers.map((p) => ({ symbol: p.symbol, name: p.name || p.symbol, rank: p.rank, label: p.label, thisWeek: p.rawLabel && p.rawLabel !== p.label ? p.rawLabel : null, direction: p.direction, rel52: p.rel52, rel13: p.rel13, rel52Market: p.rel52Market }));
    const seen = new Set(ranked.map((r) => r.symbol));
    // On the indicator's own list the companies that are not ranked are named (with the reason) under the table; the data provider's peers are only added for an industry group
    const rest: Row[] = (lead.peerGroup.source === "list" ? [] : extras).filter((e) => !seen.has(e.symbol) && e.symbol !== self).map((e) => ({ symbol: e.symbol, name: e.name || e.symbol, rank: null, label: null, thisWeek: null, direction: null, rel52: null, rel13: null, rel52Market: null }));
    const val = (r: Row): number | string => (key === "name" ? r.name.toLowerCase() : key === "rank" ? (r.rank ?? 1e9) : ((r[key] as number | null) ?? -1e9));
    const base = key === "rank" || key === "name" ? 1 : -1;   // the number columns open best-first
    ranked.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : a.symbol.localeCompare(b.symbol)) * dir * base; });
    return [...ranked, ...rest];   // stocks without a year of prices stay at the bottom whatever the sort
  }, [lead, extras, key, dir, self]);
  const sort = (k: SortKey) => { if (k === key) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(1); } };
  const LIMIT = 12;
  const shown = all ? rows : rows.filter((r, i) => i < LIMIT || r.symbol === self);
  const th = (k: SortKey, text: string, cls = "") => (
    <th scope="col" className={cls} aria-sort={key === k ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sort(k)}>{text}<span aria-hidden="true">{key === k ? (dir === 1 ? " ↑" : " ↓") : ""}</span></button>
    </th>
  );
  return (
    <div className="card acc ld-rank-card" style={{ "--ac": "var(--gold)", marginTop: 16 } as React.CSSProperties}>
      <div className="card-h"><h3><span className="ci"><Icon name="layers" /></span>How it ranks among {lead.peerGroup.ranked} {lead.peerGroup.short} peers</h3><span className="s">12-month return against {sectorBench(lead)}</span></div>
      <RankingStatus lead={lead} />
      <HScroll label="peer ranking">
        <table className="ld-tbl">
          <caption className="sr-only">Peers ranked by their 12-month return against {sectorBench(lead)}. Status is given in words.</caption>
          <thead><tr>{th("rank", "#", "n")}{th("name", "Company")}<th scope="col">Status</th>{th("rel52", "vs sector, 12M", "r")}{th("rel13", "vs sector, 3M", "r")}{th("rel52Market", "vs market, 12M", "r")}</tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.symbol} className={(r.symbol === self ? "me " : "") + (r.label ? "" : "none")} onClick={() => r.symbol !== self && nav(`/stocks/${r.symbol}`)} aria-current={r.symbol === self ? "true" : undefined}>
                <td className="n">{r.rank ?? "—"}</td>
                <th scope="row" className="nm">{r.symbol === self ? <b>{r.name}<span className="you"> · this company</span></b> : <Link to={`/stocks/${r.symbol}`} onClick={(e) => e.stopPropagation()}>{r.name}</Link>}<span className="tk">{r.symbol}</span></th>
                <td>{r.label ? <><LeadChip label={r.label} />{r.direction && <span className={"ld-dir ld-dsm " + r.direction} title={dirWord(r.direction)}>{r.direction === "gaining" ? "▲" : "▼"}<span className="sr-only"> {dirWord(r.direction)}</span></span>}{r.thisWeek && <span className="ld-tw">This week: {LABEL_WORD[r.thisWeek]}</span>}</> : <span className="ld-nh">Not enough history</span>}</td>
                <td className="r"><Pt v={r.rel52} /></td><td className="r"><Pt v={r.rel13} /></td><td className="r"><Pt v={r.rel52Market} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </HScroll>
      {rows.length > LIMIT && <button type="button" className="btn ld-more" onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `Show all ${rows.length} companies`}</button>}
      {(lead.notRanked?.length ?? 0) > 0 && (
        <details className="ld-nr">
          <summary>Not ranked this week ({lead.notRanked!.length})</summary>
          <ul>{lead.notRanked!.map((n) => <li key={n.symbol}><b>{n.name === n.symbol ? n.symbol : n.name}</b>{n.name !== n.symbol && <span className="tk">{n.symbol}</span>}<span className="why">{n.text}</span></li>)}</ul>
        </details>
      )}
      <p className="ld-foot">{LEAD_NOTE} <Link to={EXPLAINER}>What the labels mean →</Link></p>
    </div>
  );
}

function Pt({ v }: { v: number | null }) {
  return v == null ? <span className="ld-nh">—</span> : <span className={"pt " + tone(v)}>{pts(v)}<small> pts</small></span>;
}
