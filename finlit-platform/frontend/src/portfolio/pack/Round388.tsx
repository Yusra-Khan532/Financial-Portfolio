// Task #388 part A (developer file 36, "Equity portfolio, round 2"): the new pieces of the Equity portfolio page.
//   KnowPop / KnowButton  change 3: a section's "things to know" leave the page. A pill at the right of the section's heading ("●● 3 things to know", one dot
//                         per note in its kind's colour) opens them in a pop-up under it, with the box's own caption, Open all and ×. It closes on ×, Esc, a tap
//                         outside or a change of view; one pop-up at a time; role="dialog", aria-expanded on the pill.
//   PeersChart            change 1: Against their peers as one chart: a count bar (Lead · In line · Lag · Not compared, each a group filter), Find, a hint, and one
//                         table grouped Leaders, In line, Laggards: a track from weakest to strongest with the share's place, the points ahead or behind and
//                         Lately. Every heading sorts inside each group (a Sort menu on a phone); above 12 compared shares each group shows its first 5.
//                         The heading row and each group's label stay pinned under the section bar.
//   AccountsButton        change 5: "3 accounts ▾" under a share held in two or more accounts; it opens "By account" (account and quantity, one per row).
//   useBarBottom          found F1: where the section bar ends on screen (its sticky top + its height + 6px), kept in --eq-bar-b on <html>, so the shares table's
//                         tools row and the peers headings stick under the bar, not on top of it, at every bar height.
// Describes the past; never advice. Classes: eq8k-, eq8p-, eq8a-.
import { createContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { DashCards, DashCardsProvider, OpenAll } from "../../components/dashboard/DashCards";
import { useAuth } from "../../lib/auth";
import type { Card } from "../../lib/pulsePack";
import type { Share } from "../../lib/equityPack";
import { coTitle } from "../../lib/companyLabel";
import { MINUS, coName, indexName } from "../shared";
import "./round388.css";

// ------------------------------------------------------------------------------------------------ the section bar's bottom (F1)
/** Keeps --eq-bar-b on <html>: the section bar's sticky top + its height + 6px (the place just under the bar), measured on the page. */
export function useBarBottom(bar: React.RefObject<HTMLElement | null>, on = true) {
  useEffect(() => {
    const el = bar.current; if (!on || !el) return;
    const set = () => { const top = parseFloat(getComputedStyle(el).top) || 0; document.documentElement.style.setProperty("--eq-bar-b", `${Math.round(top + el.offsetHeight + 6)}px`); };
    set(); addEventListener("resize", set);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set); ro?.observe(el);
    const h = document.querySelector("header.top"); if (h) ro?.observe(h);
    return () => { removeEventListener("resize", set); ro?.disconnect(); };
  }, [bar, on]);
}

// ------------------------------------------------------------------------------------------------ one pop-up at a time
const POP_EV = "eq8-pop";
/** Closes every pop-up of this page (a change of view calls it). */
export const closePops = () => window.dispatchEvent(new CustomEvent(POP_EV, { detail: "" }));
/** A pop-up's open state: opening one closes the others; Esc and a tap outside (not on `keep`) close it. */
function usePop(keep: React.RefObject<HTMLElement | null>[]) {
  const id = useId(), [open, setOpen] = useState(false);
  useEffect(() => { const f = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) setOpen(false); }; addEventListener(POP_EV, f); return () => removeEventListener(POP_EV, f); }, [id]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent | TouchEvent) => { const t = e.target as Node; if (!keep.some((r) => r.current?.contains(t))) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const w0 = innerWidth, rs = () => { if (innerWidth !== w0) setOpen(false); };   // a new width (a phone turned) closes it; a taller page does not
    document.addEventListener("mousedown", out); document.addEventListener("touchstart", out, { passive: true }); document.addEventListener("keydown", key); addEventListener("resize", rs);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("touchstart", out); document.removeEventListener("keydown", key); removeEventListener("resize", rs); };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const set = (v: boolean) => { if (v) window.dispatchEvent(new CustomEvent(POP_EV, { detail: id })); setOpen(v); };
  return [open, set] as const;
}
/** Where a pop-up sits: under its button, as wide as min(width, screen − 20px), kept on screen. */
function placeUnder(b: HTMLElement | null, width: number, alignRight: boolean) {
  if (!b) return { left: 10, top: 0, width };
  const r = b.getBoundingClientRect(), w = Math.min(width, innerWidth - 20);
  const left = Math.max(10, Math.min(alignRight ? r.right - w : r.left, innerWidth - w - 10));
  return { left, top: Math.round(r.bottom + scrollY + 8), width: w };
}

// ------------------------------------------------------------------------------------------------ things to know (change 3)
/** True on the Equity portfolio: a section's things to know show as a pill and a pop-up, not as a box (the MF and ETF pages keep the box). */
export const KnowPop = createContext(false);
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const DOT: Record<Card["kind"], string> = { good: "g", watch: "w", warning: "w", insight: "n" };
/** The heading a section's pill sits in: the section's heading row, or the shares table's title block. */
const hostOf = (el: HTMLElement | null): HTMLElement | null => { const sec = el?.closest("section"); return sec?.querySelector<HTMLElement>(":scope .sp-sec-h") ?? sec?.querySelector<HTMLElement>(":scope .pfx-h > div") ?? null; };

export function KnowButton({ items, scope }: { items: Card[]; scope: string }) {
  const { user } = useAuth();
  const here = useRef<HTMLSpanElement>(null), btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null | undefined>(undefined);
  const [open, setOpen] = usePop([btn, pop]), [at, setAt] = useState({ left: 0, top: 0, width: 460 });
  useLayoutEffect(() => { setHost(hostOf(here.current)); }, []);
  const n = items.length, cap = n === 1 ? "One thing to know" : `${n <= 10 ? NUM[n].charAt(0).toUpperCase() + NUM[n].slice(1) : n} things to know`, popId = "eq8k-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const button = <button ref={btn} type="button" className={"eq8k-btn" + (host?.matches(".pfx-h > div") ? " in-sub" : "")} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popId : undefined}
    onClick={() => { if (!open) setAt(placeUnder(btn.current, 460, !host?.matches(".pfx-h > div"))); setOpen(!open); }}>
    <span className="eq8k-dots" aria-hidden="true">{items.map((c, i) => <i key={i} className={DOT[c.kind] ?? "n"} />)}</span>{n === 1 ? "1 thing to know" : `${n} things to know`}</button>;
  return <DashCardsProvider userId={user?.id} remember={false}>
    <span ref={here} hidden />
    {host === undefined ? null : host ? createPortal(button, host) : <div className="eq8k-inline">{button}</div>}
    {open && createPortal(<div ref={pop} id={popId} className="eq8k-pop eq" role="dialog" aria-label={cap} style={{ left: at.left, top: at.top, width: at.width }}>
      <div className="eq8k-h"><b>{cap}</b><OpenAll scope={scope} n={n} /><button type="button" className="eq8k-x" aria-label="Close" onClick={() => { setOpen(false); btn.current?.focus(); }}>×</button></div>
      <div className="eq-ins">{/* the page's quiet card list (eq385.css "things to know") */}<DashCards items={items} scope={scope} cols={1} /></div>
    </div>, document.body)}
  </DashCardsProvider>;
}

// ------------------------------------------------------------------------------------------------ accounts under a share (change 5)
export type AccountQty = { name: string; qty: number };
export function AccountsButton({ list }: { list: AccountQty[] }) {
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null), [open, setOpen] = usePop([btn, pop]), [at, setAt] = useState({ left: 0, top: 0, width: 240 });
  const id = "eq8a-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (list.length < 2) return null;
  return <>
    <button ref={btn} type="button" className="eq8a-btn" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (!open) setAt(placeUnder(btn.current, 240, false)); setOpen(!open); }}>{list.length} accounts <i aria-hidden="true">▾</i></button>
    {open && createPortal(<div ref={pop} id={id} className="eq8k-pop eq8a-pop" role="dialog" aria-label="By account" style={{ left: at.left, top: at.top, width: at.width }}>
      <div className="eq8k-h"><b>By account</b><button type="button" className="eq8k-x" aria-label="Close" onClick={() => { setOpen(false); btn.current?.focus(); }}>×</button></div>
      <ul>{list.map((a) => <li key={a.name}><span>{a.name}</span><b>{a.qty.toLocaleString("en-IN", { maximumFractionDigits: 4 })}</b></li>)}</ul>
    </div>, document.body)}
  </>;
}

// ------------------------------------------------------------------------------------------------ Against their peers (change 1)
type G = "leader" | "in_line" | "laggard";
const GROUPS: { g: G; tone: "good" | "mid" | "bad"; seg: string; head: string }[] = [
  { g: "leader", tone: "good", seg: "Lead", head: "Leaders" }, { g: "in_line", tone: "mid", seg: "In line", head: "In line" }, { g: "laggard", tone: "bad", seg: "Lag", head: "Laggards" }];
export type SortKey = "pos" | "pts" | "n";
/** Where a share sits on the weakest-to-strongest track: (N − rank) ÷ (N − 1), so 1st of N is at the strongest end; a group of one sits there too; no rank, the middle. */
export const peerPos = (rank: number | null | undefined, of: number | null | undefined) => (rank == null || !of ? 0.5 : of > 1 ? Math.max(0, Math.min(1, (of - rank) / (of - 1))) : 1);
/** A group's rows in order: Rank strongest first, Points most ahead first, Share A to Z; `dir` −1 is that first order, 1 reverses it. */
export function sortPeers(xs: Share[], key: SortKey, dir: 1 | -1): Share[] {
  const v = (s: Share) => (key === "pos" ? peerPos(s.peer?.rank, s.peer?.of) : s.peer?.vs ?? null);
  return [...xs].sort((a, b) => {
    if (key === "n") return (dir === -1 ? 1 : -1) * coName(a).localeCompare(coName(b));
    const x = v(a), y = v(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (dir === -1 ? 1 : -1) * (y - x) || coName(a).localeCompare(coName(b));
  });
}
/** "+46.6" / "−5.5" (one decimal, signed). */
export const ptsText = (v: number | null | undefined) => (v == null ? MINUS : `${v >= 0 ? "+" : MINUS}${Math.abs(v).toFixed(1)}`);
const vsText = (bench: string) => `vs ${/^peer average$/i.test(bench) ? "peer average" : indexName(bench)}`;
/** Above this many compared shares, each group shows its first FIRST rows. */
export const PEERS_OVER = 12, PEERS_FIRST = 5;

export function PeersChart({ shares }: { shares: Share[] }) {
  const [f, setF] = useState<G | null>(null), [q, setQ] = useState(""), [key, setKey] = useState<SortKey>("pos"), [dir, setDir] = useState<1 | -1>(-1), [open, setOpen] = useState<Set<G>>(new Set());
  const head = useRef<HTMLDivElement>(null), tab = useRef<HTMLDivElement>(null);
  useEffect(() => {   // the group labels stick under the heading row: its height, measured
    const h = head.current, t = tab.current; if (!h || !t) return;
    const set = () => t.style.setProperty("--eq8p-hh", `${h.offsetHeight}px`); set();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set); ro?.observe(h); return () => ro?.disconnect();
  }, []);
  const compared = useMemo(() => shares.filter((s) => s.peer), [shares]);
  const counts = { leader: 0, in_line: 0, laggard: 0 } as Record<G, number>; compared.forEach((s) => { counts[s.peer!.label as G]++; });
  const nc = shares.length - compared.length, big = compared.length > PEERS_OVER, needle = q.trim().toLowerCase();
  const hit = (s: Share) => !needle || [coName(s), s.name ?? "", s.symbol, s.peer?.group ?? "", s.peer?.bench ?? "", indexName(s.peer?.bench ?? "")].join(" ").toLowerCase().includes(needle);
  const sortBy = (k: SortKey) => { if (k === key) setDir(dir === -1 ? 1 : -1); else { setKey(k); setDir(-1); } };
  const arrow = (k: SortKey) => (k === key ? (dir === -1 ? (k === "n" ? "↓" : "↓") : "↑") : "");
  const ariaSort = (k: SortKey): "ascending" | "descending" | "none" => (k !== key ? "none" : (k === "n" ? dir === -1 : dir === 1) ? "ascending" : "descending");
  const groups = GROUPS.map((g) => { const all = sortPeers(compared.filter((s) => s.peer!.label === g.g), key, dir), match = all.filter(hit);
    const every = open.has(g.g) || !!f || !!needle, shown = big && !every ? match.slice(0, PEERS_FIRST) : match;
    return { ...g, all, match, shown, hide: (f && f !== g.g) || !match.length }; });
  const any = groups.some((g) => !g.hide);
  if (!shares.length) return null;
  return (
    <div className="eq8p">
      {compared.length + nc > 0 && <div className="eq8p-bar" role="group" aria-label="Shares by how they compare with their peers">
        {GROUPS.filter((g) => counts[g.g]).map((g) => <button key={g.g} type="button" className={"eq8p-seg " + g.tone + (f && f !== g.g ? " dim" : "")} style={{ flex: counts[g.g] }} aria-pressed={f === g.g}
          title={f === g.g ? "Show every group" : `Show only ${g.head.toLowerCase()}`} onClick={() => setF(f === g.g ? null : g.g)}><b>{counts[g.g]}</b> {g.seg}</button>)}
        {nc > 0 && <span className="eq8p-seg nc" style={{ flex: nc }} title="No peer group reading for these shares"><b>{nc}</b> Not compared</span>}
      </div>}
      {compared.length > 0 ? <>
        <div className="eq8p-tools">
          <label className="eq8p-q"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a share or peer group" aria-label="Find a share or peer group" /></label>
          <span className="eq8p-hint">{big ? `Top ${PEERS_FIRST} in each group shown · tap a colour for one group` : "Tap a colour for one group"}</span>
          <label className="eq8p-sel"><span>Sort</span><select aria-label="Sort the shares" value={key} onChange={(e) => { setKey(e.target.value as SortKey); setDir(-1); }}>
            <option value="pos">Rank in peer group</option><option value="pts">Points ahead or behind</option><option value="n">Name</option></select></label>
        </div>
        <div className="eq8p-tab" ref={tab} role="table" aria-label="Each share against its peer group">
          <div className="eq8p-r eq8p-rh" role="row" ref={head}>
            <span role="columnheader" aria-sort={ariaSort("n")}><button type="button" className={"eq8p-sb" + (key === "n" ? " on" : "")} onClick={() => sortBy("n")}>Share and peer group<i aria-hidden="true">{arrow("n")}</i></button></span>
            <span role="columnheader" aria-sort={ariaSort("pos")}><button type="button" className={"eq8p-sb" + (key === "pos" ? " on" : "")} onClick={() => sortBy("pos")}>Rank in its peer group<i aria-hidden="true">{arrow("pos")}</i></button><em aria-hidden="true"><i>weakest</i><i>strongest</i></em></span>
            <span role="columnheader" aria-sort={ariaSort("pts")}><button type="button" className={"eq8p-sb" + (key === "pts" ? " on" : "")} onClick={() => sortBy("pts")}>Points ahead or behind<i aria-hidden="true">{arrow("pts")}</i></button></span>
            <span role="columnheader" className="lt">Lately</span>
          </div>
          {groups.map((g) => g.hide ? null : <div key={g.g} className={"eq8p-g " + g.tone} role="rowgroup">
            <p className="eq8p-gh" role="row"><b role="rowheader">{g.head}</b><span>{counts[g.g]}</span></p>
            {g.shown.map((s) => { const p = s.peer!, at = peerPos(p.rank, p.of), lt = p.direction;
              return <div key={s.symbol} className="eq8p-r" role="row">
                <span className="eq8p-n" role="cell"><Link to={`/stocks/${encodeURIComponent(s.symbol)}`} className="eq-col" title={coTitle(s)}>{coName(s)}</Link><small>{p.group}</small></span>
                <span className="eq8p-k" role="cell"><span className="eq8p-trk" aria-hidden="true"><i style={{ left: `${(at * 100).toFixed(1)}%` }} /></span><small>{p.rank} of {p.of}</small></span>
                <span className={"eq8p-pt" + (p.vs == null ? "" : p.vs >= 0 ? " up" : " dn")} role="cell">{ptsText(p.vs)}<small>{vsText(p.bench)}</small></span>
                <span className={"eq8p-lt " + (lt ?? "")} role="cell" title={lt ? `${lt} lately` : undefined}>{lt === "gaining" ? "↗" : lt === "weakening" ? "↘" : ""}{lt && <span className="sr-only">{lt} lately</span>}</span>
              </div>; })}
            {big && !f && !needle && g.match.length > PEERS_FIRST && <button type="button" className="eq8p-more" aria-expanded={open.has(g.g)}
              onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(g.g)) n.delete(g.g); else n.add(g.g); return n; })}>{open.has(g.g) ? "Show fewer ▴" : `Show all ${g.match.length} ▾`}</button>}
          </div>)}
          {!any && <p className="eq8p-none">No share in this list matches.</p>}
        </div>
      </> : <p className="sp-note">None of your shares has a peer group reading yet.</p>}
    </div>);
}

/** The phone's "click a column heading to sort" goes (part B item 4): the words only from 761px up. */
export const DeskOnly = ({ children }: { children: ReactNode }) => <span className="eq8-desk">{children}</span>;
