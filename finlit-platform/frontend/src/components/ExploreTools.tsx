import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { OPEN_AI } from "./Assistant";
import { BUCKETS, EXPANDED, FIGURE, SHORT, type Bucket, type BucketId, type PlatformCard } from "../lib/platformTools";
import { useFocusTrap } from "../lib/focusTrap";
import "../styles/explore-tools.css";

const pad = (n: number) => String(n).padStart(2, "0");
const TOTAL = BUCKETS.reduce((n, b) => n + b.cards.length, 0);
/** Fired by the hero button, so "Explore the platform" opens the groups even when the address already ends in #platform. */
export const OPEN_EXPLORE = "finlit:open-explore";
const BADGE_LABEL = { FREE: "Free", SILVER: "Silver", GOLD: "Gold" } as const;

function Card({ c, onExpand }: { c: PlatformCard; onExpand: (id: string) => void }) {
  const bot = c.id === "finlit-bot";          // the assistant opens its panel; every other card opens a page
  const open = `Open ${c.title}`;
  return (
    <li className="xt-card" data-tool={c.id}>
      <div className="xt-shot" onClick={() => onExpand(c.id)}><img src={`${import.meta.env.BASE_URL}landing/tools/${c.image}.webp`} width={1200} height={750} loading="lazy" decoding="async" alt="" />
        <button type="button" className="fl-exp" aria-haspopup="dialog" onClick={(e) => { e.stopPropagation(); onExpand(c.id); }} data-exp={c.id}><Icon name="search" />Expand<span className="sr-only"> the {c.title} picture</span></button></div>
      <div className="xt-body">
        <div className="xt-top"><h4>{c.title}</h4><span className={`xt-badge xt-${c.badge.toLowerCase()}`}>{BADGE_LABEL[c.badge]}<span className="sr-only"> plan</span></span></div>
        <p className="xt-what">{c.what}</p>
        <ul className="xt-pts">{c.points.map((p) => <li key={p}><Icon name="check" />{p}</li>)}</ul>
        {bot ? <button type="button" className="xt-open" onClick={() => dispatchEvent(new Event(OPEN_AI))} aria-haspopup="dialog">{open} <Icon name="arrow" /></button>
          : <Link className="xt-open" to={c.link}>{open} <Icon name="arrow" /></Link>}
      </div>
    </li>
  );
}

/** One tool in a group card: its name, a few words, a small plan mark for the paid ones and an arrow. The assistant opens its panel; every other tool opens its page. */
function Tool({ c }: { c: PlatformCard }) {
  const inner = <><span className="xt-tn"><span className="xt-ti" aria-hidden="true"><Icon name={TOOL_ICON[c.id] ?? "grid"} /></span><b>{c.title}</b>{(c.badge !== "FREE" || FIGURE[c.id]) && <span className="xt-sub">{c.badge !== "FREE" && <span className={`xt-badge xt-${c.badge.toLowerCase()} xt-mini`}>{BADGE_LABEL[c.badge]}<span className="sr-only"> plan</span></span>}{FIGURE[c.id] && <span className="xt-fig"><strong>{FIGURE[c.id][0]}</strong> {FIGURE[c.id][1]}</span>}</span>}</span><small>{SHORT[c.id]}</small><Icon name="arrow" /></>;
  return <li>{c.id === "finlit-bot" ? <button type="button" className="xt-tool" title={SHORT[c.id]} onClick={() => dispatchEvent(new Event(OPEN_AI))} aria-haspopup="dialog">{inner}</button> : <Link className="xt-tool" to={c.link} title={SHORT[c.id]}>{inner}</Link>}</li>;
}
const TOOL_ICON: Record<string, string> = {
  "stock-screener": "table", "basic-score-screener": "quality", "advanced-score-screener": "layers", "query-builder": "notes", "mutual-funds": "pie", "etfs": "bars", "fund-health-score": "gauge",
  "company-report": "search", "finlit-prism": "prism", "company-financials": "table", "compare-companies": "compare", "chart-builder": "line",
  "dcf-calculator": "rupee", "profit-revenue-outlook": "activity", "calculators": "percent", "option-chain": "grid",
  "watchlists": "star", "portfolios": "wallet", "alerts": "bell", "compare-funds": "compare",
  "sector-pulse": "activity", "sector-rotation": "refresh", "market-events": "calendar", "market-data": "globe", "news-filings": "notes", "results-ipo": "calendar",
  "glossary": "book", "discussion-forum": "users", "finlit-bot": "chat",
};
const GROUP_ICON: Record<string, string> = { discover: "search", "company-360": "building", "quant-lab": "gauge", track: "wallet", market: "line", learn: "book" };

/** A faint chart-like drawing in the card's corner, in the group's accent colour (decoration only). */
function Deco({ id }: { id: string }) {
  const bars = id === "discover" || id === "market" || id === "track";
  return (
    <svg className="xt-deco" viewBox="0 0 120 56" aria-hidden="true" focusable="false">
      {bars ? [10, 18, 14, 26, 22, 34, 44].map((h, i) => <rect key={i} x={8 + i * 15} y={56 - h} width="9" height={h} rx="2" />) : <path d="M4 48 L26 36 L44 40 L68 22 L90 26 L116 6" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>);
}

/** A group card: an icon, its name and count, one line on what it is for, every tool in a few words, and a button that opens the full cards on that group. */
function Row({ b, onOpen }: { b: Bucket; onOpen: () => void }) {
  return (
    <li className="xt-row" data-group={b.id}>
      <header><span className="xt-gi" aria-hidden="true"><Icon name={GROUP_ICON[b.id] ?? "grid"} /></span>
        <div><h3>{b.name}</h3><p>{b.line}</p></div><span className="xt-cnt">{pad(b.cards.length)} <small>tools</small></span><Deco id={b.id} /></header>
      <ul className="xt-tools" aria-label={`${b.name} tools`}>{b.cards.map((c) => <Tool key={c.id} c={c} />)}</ul>
      <button type="button" className="xt-rn" onClick={onOpen}>See the {b.cards.length} {b.name} cards <Icon name="arrow" /><span className="sr-only">. Show the full cards.</span></button>
    </li>);
}

const ALL = BUCKETS.flatMap((b, g) => b.cards.map((c, i) => ({ c, b, g, i })));
const tag = (id: BucketId) => `#tools-${id}`;
const fromHash = (h: string): Mode => { const id = h.startsWith("#tools-") ? (h.slice(7) as BucketId) : null; return id && BUCKETS.some((b) => b.id === id) ? id : h === "#platform" ? "dir" : "keep"; };
type Mode = "dir" | "off" | BucketId | "keep";

/** The large view of one tool: group and place, name and plan, its line, the tall picture in a frame that scrolls, its three points, Open and Next. A real dialog: page scroll locked, focus kept inside, Esc and the backdrop close it, focus returns to the Expand button. */
function Expanded({ at, go, close }: { at: number; go: (n: number) => void; close: () => void }) {
  const { c, b, i } = ALL[at], box = useRef<HTMLDivElement>(null), tid = useId();
  const next = ALL[(at + 1) % ALL.length], prev = ALL[(at + ALL.length - 1) % ALL.length], bot = c.id === "finlit-bot";
  useFocusTrap(box, true);
  useEffect(() => {
    const keep = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } else if (e.key === "ArrowRight") go((at + 1) % ALL.length); else if (e.key === "ArrowLeft") go((at + ALL.length - 1) % ALL.length); };
    document.addEventListener("keydown", key, true);
    return () => { document.body.style.overflow = keep; document.removeEventListener("keydown", key, true); };
  }, [at, close, go]);
  const src = EXPANDED.has(c.id) ? `${import.meta.env.BASE_URL}landing/expanded/${c.id}.webp` : `${import.meta.env.BASE_URL}landing/tools/${c.image}.webp`;
  return createPortal(
    <div className="fl-modal-wrap" data-group={b.id}>
      <div className="fl-scrim" onClick={close} aria-hidden="true" />
      <div className="fl-modal" role="dialog" aria-modal="true" aria-labelledby={tid} ref={box} tabIndex={-1}>
        <div className="fl-modal-top"><span className="fl-modal-pos">{b.name.toUpperCase()} · {i + 1} OF {b.cards.length}</span>
          <button type="button" className="fl-modal-x" onClick={close} aria-label={`Close the large view of ${c.title}`}>Close</button></div>
        <div className="fl-modal-cols">
          <div className="fl-modal-info">
            <div className="xt-top"><h2 id={tid}>{c.title}</h2><span className={`xt-badge xt-${c.badge.toLowerCase()}`}>{BADGE_LABEL[c.badge]}<span className="sr-only"> plan</span></span></div>
            <p className="xt-what">{c.what}</p>
            <ul className="xt-pts fl-modal-pts">{c.points.map((p) => <li key={p}><Icon name="check" />{p}</li>)}</ul>
            {bot ? <button type="button" className="xt-open" onClick={() => { close(); dispatchEvent(new Event(OPEN_AI)); }}>Open {c.title} <Icon name="arrow" /></button>
              : <Link className="xt-open" to={c.link} onClick={close}>Open {c.title} <Icon name="arrow" /></Link>}
            <div className="fl-modal-nav">
              <button type="button" className="xt-open" onClick={() => go((at + ALL.length - 1) % ALL.length)}>Previous: {prev.c.title}</button>
              <button type="button" className="xt-open" onClick={() => go((at + 1) % ALL.length)}>Next: {next.c.title}</button>
            </div>
          </div>
          <div className="fl-modal-pic" tabIndex={0} aria-label={`${c.title} picture, scrolls`}><img src={src} alt="" width={1200} height={EXPANDED.has(c.id) ? 1500 : 750} /></div>
        </div>
      </div>
    </div>, document.body);
}

/** "Explore the platform": a heading, a compact directory (one row per group, every tool named in a few words) and one button. A group's button, or a chip, swaps the directory for that group's cards in the
 *  same place (a sticky bar keeps every group one click away); "Hide the platform tools" hides the directory or the group view. The open group is in the address (#tools-discover) so Back and shared links open it. */
export function ExploreTools() {
  const [mode, setMode] = useState<Exclude<Mode, "keep">>(() => { const m = typeof location === "undefined" ? "keep" : fromHash(location.hash); return m === "keep" ? "dir" : m; });
  const [exp, setExp] = useState<number | null>(null), expBtn = useRef<HTMLElement | null>(null);
  const bar = useRef<HTMLDivElement>(null), toTop = useRef(false), panel = useId();
  const group = BUCKETS.find((b) => b.id === mode) ?? null, gi = group ? BUCKETS.indexOf(group) : -1;
  useEffect(() => {
    const on = () => setMode((m) => (m === "off" ? "dir" : m)), hash = () => { const m = fromHash(location.hash); if (m !== "keep") setMode(m); };
    addEventListener(OPEN_EXPLORE, on); addEventListener("hashchange", hash); addEventListener("popstate", hash);
    return () => { removeEventListener(OPEN_EXPLORE, on); removeEventListener("hashchange", hash); removeEventListener("popstate", hash); };
  }, []);
  useEffect(() => {   // a chip, Previous or Next brings the bar back to the top of the screen when it has scrolled away
    if (!toTop.current) return; toTop.current = false;
    const el = bar.current; if (!el) return;
    const r = el.getBoundingClientRect(); if (r.top < 72 || r.top > innerHeight * 0.5) el.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [mode]);
  const show = (m: Exclude<Mode, "keep">, push = true) => {
    toTop.current = m !== "off"; setMode(m);
    if (push && typeof history !== "undefined" && m !== "off") { const h = m === "dir" ? "#platform" : tag(m); if (location.hash !== h) history.pushState(null, "", h); }
  };
  const open = (n: number) => { expBtn.current = document.activeElement as HTMLElement | null; setExp(n); };
  const expand = (id: string) => open(ALL.findIndex((x) => x.c.id === id));
  const goExp = (n: number) => { setExp(n); const g = ALL[n].b.id; if (g !== mode && mode !== "off" && mode !== "dir") show(g); };
  const closeExp = () => { setExp(null); setTimeout(() => expBtn.current?.focus?.(), 0); };
  const prev = group ? BUCKETS[(gi + BUCKETS.length - 1) % BUCKETS.length] : null, next = group ? BUCKETS[(gi + 1) % BUCKETS.length] : null;
  return (
    <section className="sec hh-sec xt" id="platform" aria-labelledby="xt-title"><div className="wrap">
      <div className="xt-hero">
        <ul className="xt-checks" aria-label="What the platform is for">{["Screen & discover opportunities", "Analyse companies in depth", "Value with proven models", "Track your portfolio & market", "Learn, discuss & stay informed"].map((t) => <li key={t}><Icon name="check" />{t}</li>)}</ul>
        <div className="xt-head">
          <div className="hh-kicker">The platform</div>
          <h2 id="xt-title">Everything you need. <em>Nothing you don't.</em></h2>
          <p>{TOTAL} tools in six groups, from finding a stock to valuing it, tracking it and following its sector.</p>
          <div className="xt-cta">
            <button type="button" className="btn primary lg xt-go" aria-expanded={mode !== "off"} aria-controls={panel} onClick={() => show(mode === "off" ? "dir" : "off", mode === "off")}>{mode === "off" ? "Explore the platform" : "Hide the platform tools"} <Icon name="arrow" /></button>
            <a className="btn lg xt-tour" href="#tour"><Icon name="play" /> Watch the tour</a>
          </div>
        </div>
        <dl className="xt-stats" aria-label="The platform in numbers">
          <div><Icon name="building" /><dd>5,800+</dd><dt>Listed companies</dt></div><div><Icon name="pie" /><dd>1,200+</dd><dt>Mutual funds</dt></div>
          <div><Icon name="grid" /><dd>{TOTAL}</dd><dt>Tools</dt></div><div><Icon name="layers" /><dd>{BUCKETS.length}</dd><dt>Groups</dt></div>
        </dl>
      </div>
      <div id={panel}>
        {mode === "dir" && <ul className="xt-dir" aria-label="The six groups and their tools">{BUCKETS.map((b) => <Row key={b.id} b={b} onOpen={() => show(b.id)} />)}</ul>}
        {group && prev && next && (
          <div className="fl-gv" data-group={group.id}>
            <div className="fl-gbar" ref={bar} role="group" aria-label="Tool groups">
              <button type="button" className="fl-gall" onClick={() => show("dir")}><Icon name="grid" /><span>All groups</span></button>
              <div className="fl-gchips">{BUCKETS.map((b) => (
                <button key={b.id} type="button" className="fl-gchip" data-group={b.id} aria-pressed={b.id === group.id} onClick={() => show(b.id)}><span className="xt-gi" aria-hidden="true"><Icon name={GROUP_ICON[b.id] ?? "grid"} /></span><span>{b.name}</span><b>{pad(b.cards.length)}</b></button>))}</div>
            </div>
            <div className="xt-pane"><div className="xt-ghead fl-gh"><span className="xt-gi" aria-hidden="true"><Icon name={GROUP_ICON[group.id] ?? "grid"} /></span><div><h3>{group.name}</h3><p>{group.line}</p></div><span>{group.cards.length} tools</span></div>
              <ul className="xt-grid">{group.cards.map((c) => <Card key={c.id} c={c} onExpand={expand} />)}</ul></div>
            <nav className="fl-gfoot" aria-label="Move between groups">
              <button type="button" className="fl-gnav" onClick={() => show(prev.id)}><Icon name="arrow" /><span><small>Previous group</small><b>{prev.name}</b></span></button>
              <button type="button" className="fl-gall" onClick={() => show("dir")}><Icon name="grid" /><span>All six groups</span></button>
              <button type="button" className="fl-gnav fl-gnext" onClick={() => show(next.id)}><span><small>Next group</small><b>{next.name}</b></span><Icon name="arrow" /></button>
            </nav>
          </div>)}
        {mode !== "off" && <p className="xt-fine">Tools are for information and education only. They are never investment advice.</p>}
      </div>
      {exp != null && <Expanded at={exp} go={goExp} close={closeExp} />}
    </div></section>
  );
}
