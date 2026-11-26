// Task #183 (Equity portfolio, the 15 Nov pack): the top of the page (the score and one tile per tab, the whole tile opens its tab), each tab's Key figures
// row (three cards, foldable, remembers open or closed per tab in this browser; each button jumps to its section and flashes it), and the sticky sections
// bar (numbered chips with arrows for the open tab, the one in view underlined; All sections lists every section of the three tabs).
import { useBarBottom } from "./Round388";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { Tip } from "../../components/sectors/pack/Common";
import type { KeyCard, TabKey, TopTile } from "../../lib/equityTop";
import "./pagetop.css";

export function jumpTo(id: string, retry = true) {
  // a section inside a sub-tab (Diversification analytics) opens its sub-tab first, then it is scrolled to
  if (retry) window.dispatchEvent(new CustomEvent("eq-jump", { detail: id }));
  const el = document.getElementById(id);
  if (!el) { if (retry) setTimeout(() => jumpTo(id, false), 80); return; }
  el.scrollIntoView?.({ behavior: "smooth", block: "start" });     // guarded: a test browser (jsdom) has no scrollIntoView
  el.classList.remove("eqt-flash"); void el.offsetWidth; el.classList.add("eqt-flash");
  setTimeout(() => el.classList.remove("eqt-flash"), 1600);
}

/** Generic over the page's tab names (Equity: portfolio | diversification | risk; MF: funds | mix | risk). */
export function TopGrid<T extends string = TabKey>({ score, tiles, onOpen, label = "Your portfolio at a glance" }: { score: React.ReactNode; tiles: (Omit<TopTile, "id"> & { id: T })[]; onOpen: (t: T) => void; label?: string }) {
  return (
    <section className="eqt-grid" aria-label={label}>
      {score}
      {tiles.map((t) => (
        <div key={t.id} className={"eqt-tile eqt-" + t.tone} role="link" tabIndex={0} aria-label={`${t.k}: ${t.v}. ${t.link}`} onClick={() => onOpen(t.id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(t.id); } }}>
          <p className="eqt-k">{t.k}<span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><Tip text={t.help} how={t.how} label={`About “${t.k}”`} /></span></p>
          <p className="eqt-v">{t.v}{t.tag && <span className="eqt-tag">{t.tag}</span>}</p>
          <p className="eqt-x">{t.sub}</p>
          <span className="eqt-go" aria-hidden="true">Open →</span>
        </div>))}
    </section>
  );
}

/** The score box for Silver: the portfolio score is worked out from FinLit Prism, part of Gold. */
export function ScoreLocked() {
  return (
    <div className="eqt-score eqt-locked">
      <p className="eqt-score-k">Your portfolio score</p>
      <p className="eqt-score-v"><b>—</b> / 100</p>
      <p className="eqt-score-x">Worked out from FinLit Prism, part of the Gold plan. <Link to="/plans">FinLit Prism · see plans</Link></p>
    </div>
  );
}

const KF_KEY = "finlit-eq-keyfig";
const readOpen = (tab: string, key = KF_KEY) => { try { const v = JSON.parse(localStorage.getItem(key) || "{}")[tab]; return v !== false; } catch { return true; } };
const saveOpen = (tab: string, open: boolean, key = KF_KEY) => { try { const all = JSON.parse(localStorage.getItem(key) || "{}"); all[tab] = open; localStorage.setItem(key, JSON.stringify(all)); } catch { /* not kept */ } };

/** `store`: the browser key that remembers open or closed per tab (one per page, so two pages' "risk" tabs do not share it). */
export function KeyFigures({ tab, sub, cards, store = KF_KEY, drop, n = 0, noun = ["share", "shares"] }: { tab: string; sub: string; cards: KeyCard[]; store?: string; drop?: (k: string) => ReactNode | null; n?: number; noun?: [string, string] }) {
  const [open, setOpen] = useState(() => readOpen(tab, store)), [dd, setDd] = useState<Set<string>>(new Set());
  useEffect(() => { setOpen(readOpen(tab, store)); }, [tab, store]);
  if (!cards.length) return null;
  const flip = () => { saveOpen(tab, !open, store); setOpen(!open); };
  return (
    <section className="eqt-kf" aria-labelledby={`eqt-kf-${tab}`}>
      <div className="eqt-kf-h"><div><h2 id={`eqt-kf-${tab}`}>Key figures</h2><p>{sub}</p></div>
        <button type="button" className="eqt-fold" aria-expanded={open} onClick={flip}>{open ? "Hide ▴" : "Show ▾"}</button></div>
      {open && <div className="eqt-kf-cards">{cards.map((c) => (
        <KeyCardBox key={c.k} c={c} panel={drop?.(c.k) ?? null} on={dd.has(c.k)} n={n} noun={noun} id={`x-kd-${tab}-${c.k.replace(/\W+/g, "-").toLowerCase()}`}
          flip={() => setDd((x) => { const y = new Set(x); if (y.has(c.k)) y.delete(c.k); else y.add(c.k); return y; })} />))}</div>}
    </section>
  );
}

/** One Key figures card. With a panel (task #235, pack B15): "Show the N shares ▾" beside its link opens the shares behind the figure inside the card. */
function KeyCardBox({ c, panel, on, flip, n, noun, id }: { c: KeyCard; panel: ReactNode | null; on: boolean; flip: () => void; n: number; noun: [string, string]; id: string }) {
  const go = <button type="button" className="eqt-go eqt-jump" onClick={() => jumpTo(c.to)}>{c.go} →</button>;
  return (
    <div className={"eqt-card eqt-" + c.tone + (panel ? " x-kd-card" : "") + (on ? " x-kd-on" : "")}><p className="eqt-k">{c.k}</p><p className="eqt-v">{c.v}</p><p className="eqt-x">{c.text}</p>
      {panel ? <><div className="x-kd-f"><button type="button" className="x-kd-b" aria-expanded={on} aria-controls={id} onClick={flip}>{on ? "Hide" : "Show"} the {n} {n === 1 ? noun[0] : noun[1]} <i aria-hidden="true">▾</i></button>{go}</div>
        <div className="x-kd" id={id} hidden={!on}>{on && panel}</div></> : go}
    </div>
  );
}

export type Sec = [id: string, label: string, badge?: string];   // task #274: an optional badge on the step ("2 new")
/** Task #235 (pack B6): the site header's height, kept in --top-h so a sticky bar sits just under the header at every width.
 *  Task #388 reopened (developer file 38, S3): on a phone the section chips under the header (.ma-hub, sticky) count too, or the bar slid under them and
 *  hid its top line (the account switcher). `strip`: the selector of this page's floating bars (8px under the header); while one of them is stuck there,
 *  <html> carries `x-hstrip`, so the header (and the phone's chips) paint that 8px strip in the page colour and no row scrolls through it
 *  (pagetop.css). Only while stuck: at the top of the page the strip stays the page's own background (the dark theme's glow). */
export const HSTRIP = "x-hstrip";
export const headerBottom = (h: HTMLElement | null, hub: HTMLElement | null) => {
  const hb = h ? h.getBoundingClientRect().height : 0;
  if (!hub || getComputedStyle(hub).position !== "sticky" || !hub.offsetHeight) return hb;
  return hb + hub.getBoundingClientRect().height;
};
/** The vertical shift of an element's own transform ("matrix(…, ty)" or "matrix3d(…, ty, tz, 1)"), 0 for none. */
export const shiftY = (transform: string) => {
  const m = /^matrix(3d)?\(([^)]*)\)$/.exec(transform.trim()); if (!m) return 0;
  const v = m[2].split(",").map(Number), y = m[1] ? v[13] : v[5]; return Number.isFinite(y) ? y : 0;
};
/** True when one of `sel` sits at its sticky place under the header (within a pixel) and the page has scrolled.
 *  Task #390 (developer file 39 v4, T4; left by #389: the ETF 390 px strip): the place is read without the bar's own transform. The section bar slides
 *  back in (transform .25s) when the filter row leaves at the table's end; read mid-slide it was "not stuck", the strip cover dropped, and no later
 *  scroll put it back, so rows showed in the 8 px under the header. */
export const barStuck = (sel: string) => scrollY > 0 && [...document.querySelectorAll<HTMLElement>(sel)].some((el) => {
  const cs = getComputedStyle(el), top = parseFloat(cs.top);
  return el.offsetHeight > 0 && Number.isFinite(top) && Math.abs(el.getBoundingClientRect().top - shiftY(cs.transform) - top) <= 1; });
export function useHeaderHeight(strip = "") {
  useEffect(() => {
    const root = document.documentElement, h = document.querySelector<HTMLElement>("header.top");
    const hub = () => document.querySelector<HTMLElement>(".ma-hub");
    const set = () => { if (h) root.style.setProperty("--top-h", `${Math.round(headerBottom(h, hub()))}px`); };
    let raf = 0;
    const paint = () => { if (strip) root.classList.toggle(HSTRIP, barStuck(strip)); };
    const soon = () => { paint(); cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); };   // again after the frame: a bar's own .stuck/.away comes with the render
    set(); paint(); addEventListener("resize", set);
    if (strip) addEventListener("scroll", soon, { passive: true });
    const ro = typeof ResizeObserver === "undefined" || !h ? null : new ResizeObserver(set); if (h) ro?.observe(h); const x = hub(); if (x) ro?.observe(x);
    return () => { removeEventListener("resize", set); removeEventListener("scroll", soon); cancelAnimationFrame(raf); ro?.disconnect(); if (strip) root.classList.remove(HSTRIP); };
  }, [strip]);
}

export function SectionsBar<T extends string = TabKey>({ tab, all, onTab, lead, steps: scr = false, onAll, step, onStep }: { tab: T; all: Record<T, { label: string; secs: Sec[] }>; onTab: (t: T, then?: string) => void; lead?: ReactNode;
  /** task #274 (Equity, change 11): the steps scroll inside the bar with ‹ › arrows when they do not fit; All sections shows every hidden section and goes to the top of the view */
  steps?: boolean; onAll?: () => void;
  /** task #385 (Equity, developer file 33): one section at a time. `step` is the step shown ("all": every section on one page); a chip shows its
   *  step, All sections puts everything back. Without it the bar jumps to sections as before. */
  step?: string; onStep?: (id: string) => void }) {
  const stepsBox = useRef<HTMLSpanElement>(null), [over, setOver] = useState({ any: false, l: false, r: false });
  useEffect(() => {   // recheck the fit whenever the bar changes width (the portfolio and views appear on sticking)
    const el = stepsBox.current; if (!scr || !el) return;
    const fit = () => setOver({ any: el.scrollWidth > el.clientWidth + 2, l: el.scrollLeft > 2, r: el.scrollLeft < el.scrollWidth - el.clientWidth - 2 });
    fit(); el.addEventListener("scroll", fit, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit); ro?.observe(el); if (el.parentElement) ro?.observe(el.parentElement);
    return () => { el.removeEventListener("scroll", fit); ro?.disconnect(); };
  }, [scr, tab]);
  const secs = all[tab].secs, [on, setOn] = useState(secs[0]?.[0] ?? ""), [menu, setMenu] = useState(false), [at, setAt] = useState({ top: 0, left: 0 }), [stuck, setStuck] = useState(false), bar = useRef<HTMLElement>(null);
  useHeaderHeight(scr ? ".eq .eqt-bar.eqt-scr" : "");   // the floating bar of the equity page (steps mode): the strip above it is painted while stuck
  useBarBottom(bar, scr);   // task #388 (file 36, F1): --eq-bar-b, the place just under this bar, for the rows that stick under it
  useEffect(() => {   // "stuck": the bar has reached its sticky place under the header
    const on = () => { const el = bar.current; if (!el) return; const top = parseFloat(getComputedStyle(el).top) || 0; setStuck(el.getBoundingClientRect().top <= top + 1 && scrollY > 0); };
    on(); addEventListener("scroll", on, { passive: true }); return () => removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    setOn(secs[0]?.[0] ?? "");
    if (typeof IntersectionObserver === "undefined") return;
    const els = secs.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setOn(v.target.id); }, { rootMargin: "-110px 0px -55% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [tab, secs.map((s) => s[0]).join()]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!menu) return; const y0 = scrollY, close = () => setMenu(false), sc = () => { if (Math.abs(scrollY - y0) > 40) setMenu(false); };
    addEventListener("click", close); addEventListener("scroll", sc, { passive: true }); return () => { removeEventListener("click", close); removeEventListener("scroll", sc); };
  }, [menu]);
  useEffect(() => {   // task #274: the open step slides into view inside the steps box
    const box = stepsBox.current, c = box?.querySelector<HTMLElement>(".eqt-chip[aria-current]"); if (!scr || !box || !c) return;
    const l = c.offsetLeft - box.offsetLeft, r = l + c.offsetWidth;
    if (l < box.scrollLeft) box.scrollTo?.({ left: Math.max(0, l - 24), behavior: "smooth" }); else if (r > box.scrollLeft + box.clientWidth) box.scrollTo?.({ left: r - box.clientWidth + 24, behavior: "smooth" });
  }, [on, scr, over.any, step]);
  useEffect(() => {   // task #274: at the bottom of the page the last section on screen is marked
    if (!scr) return;
    const end = () => { if (innerHeight + scrollY < document.documentElement.scrollHeight - 4) return; const vis = secs.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e && e.getBoundingClientRect().top < innerHeight); if (vis.length) setOn(vis[vis.length - 1].id); };
    addEventListener("scroll", end, { passive: true }); return () => removeEventListener("scroll", end);
  }, [scr, tab]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // task #235 (pack B12): the current chip scrolls into view beside the switchers, not under them
    const el = bar.current, c = el?.querySelector<HTMLElement>(".eqt-chip[aria-current=true]"); if (scr || !el || !c) return;
    const sw = stuck ? el.querySelector<HTMLElement>(":scope > .x-sw")?.offsetWidth ?? 0 : 0, l = c.offsetLeft - el.offsetLeft, r = l + c.offsetWidth;
    if (l < el.scrollLeft + sw) el.scrollLeft = Math.max(0, l - sw - 8); else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth + 8;
  }, [on, stuck]);
  const stepMode = !!onStep, cur = stepMode && step && step !== "all" ? step : on;
  const chips = secs.map(([id, label, badge], i) => <span key={id} className="eqt-chipw">{i > 0 && <span className="eqt-arrow" aria-hidden="true">→</span>}
    <button type="button" className="eqt-chip" aria-current={cur === id && (!stepMode || step !== "all" || on === id) ? (stepMode && step !== "all" ? "step" : "true") : undefined}
      onClick={() => { setOn(id); if (stepMode) onStep!(id); else jumpTo(id); }}><span className="eqt-n">{i + 1}</span>{label}{badge && <span className="eqt-badge">{badge}</span>}</button></span>);
  if (scr) {
    const nudge = (d: 1 | -1) => { const el = stepsBox.current; if (el) el.scrollBy?.({ left: d * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" }); };
    return (
      <nav ref={bar} className={"eqt-bar eqt-scr sw-host" + (stuck ? " stuck" : "") + (stuck && lead ? " x-sw-on" : "")} aria-label="Sections on this tab">
        {lead}
        {stepMode ? <button type="button" className="eqt-all" aria-pressed={step === "all"} onClick={() => { setOn(secs[0]?.[0] ?? ""); onStep!("all"); }} title="Every section of this view on one page">All sections</button>
          : <button type="button" className="eqt-all" onClick={() => { setOn(secs[0]?.[0] ?? ""); onAll?.(); }} title="Show every hidden section again and go to the top of the view">All sections</button>}
        {over.any && <button type="button" className="eqt-sa" aria-label="Earlier sections" disabled={!over.l} onClick={() => nudge(-1)}>‹</button>}
        <span ref={stepsBox} className={"eqt-steps" + (over.l ? " f-l" : "") + (over.r ? " f-r" : "")}>{chips}</span>
        {over.any && <button type="button" className="eqt-sa" aria-label="Later sections" disabled={!over.r} onClick={() => nudge(1)}>›</button>}
      </nav>);
  }
  return (
    <nav ref={bar} className={"eqt-bar sw-host" + (stuck ? " stuck" : "") + (stuck && lead ? " x-sw-on" : "")} aria-label="Sections on this tab">
      {lead}
      <span className="eqt-allw"><button type="button" className="eqt-all" aria-expanded={menu} aria-haspopup="true" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setAt({ top: Math.round(r.bottom), left: Math.round(Math.max(12, Math.min(r.left, innerWidth - 332))) }); setMenu((m) => !m); }}>All sections</button>
        {/* task #235: the menu renders into the page body, because the stuck bar's backdrop blur clipped a fixed menu inside the bar */}
        {menu && createPortal(<div className="eqt-menu" role="menu" style={{ top: at.top, left: at.left }} onClick={(e) => e.stopPropagation()}>{(Object.keys(all) as T[]).map((t) => <div key={t}><p>{all[t].label}</p>
          {all[t].secs.map(([id, label], i) => <button key={id} type="button" role="menuitem" onClick={() => { setMenu(false); if (t === tab) { setOn(id); jumpTo(id); } else onTab(t, id); }}><span className="eqt-n">{i + 1}</span>{label}</button>)}</div>)}</div>, document.body)}</span>
      {chips}
    </nav>
  );
}

/** Task #274 (change 11): "Sections ▾" in the row that takes the bar's place inside the table: the open view's sections with their numbers, "You are here",
 *  "Hidden · opens it" for a hidden one (choosing it shows it and goes there), and All sections at the end. */
export function SectionsMenu({ secs, here, isHidden, show, onAll }: { secs: Sec[]; here: string; isHidden: (id: string) => boolean; show: (id: string) => void; onAll: () => void }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector<HTMLButtonElement>("button")?.focus(); } };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, [open]);
  return <span className="eqt-secw" ref={box}><button type="button" className="eqt-secb" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>Sections <i aria-hidden="true">▾</i></button>
    {open && <span className="eqt-secm" role="menu">{secs.map(([id, label, badge], i) => { const h = isHidden(id);
      return <button key={id} type="button" role="menuitem" onClick={() => { setOpen(false); if (h) show(id); setTimeout(() => jumpTo(id), h ? 120 : 0); }}>
        <span className="eqt-n">{i + 1}</span><b>{label}{badge && <span className="eqt-badge">{badge}</span>}</b>{id === here ? <small>You are here</small> : h ? <small>Hidden · opens it</small> : null}</button>; })}
      <button type="button" role="menuitem" className="eqt-secall" onClick={() => { setOpen(false); onAll(); }}>All sections</button></span>}</span>;
}

/** Gold: the portfolio score box (as before), now the first cell of the top grid. */
/** The score box (task #235, pack B5 and B13): the score with one short line beside it. Every holding has a quantity: "Weighted by value now across N shares".
 *  Quantities missing: "Add buys for N shares to weight the score by value now." with a small "Add buys" button that opens the first such holding's buys. */
export function ScoreBox({ total, band, missing, shares, onAddQty }: { total: number | null; band?: string; missing: number; shares: number; onAddQty: () => void }) {
  return (
    <div className="eqt-score">
      <p className="eqt-score-k">Your portfolio score<Tip text="One number from 0 to 100 that sums up how strong the shares are, how well spread, how risky against the index, the price trend, valuation and concentration." how="Higher reads stronger on those together. Once every holding has its buys, each share counts by its value now." label="About “Your portfolio score”" /></p>
      <p className="eqt-score-v"><b>{total ?? "—"}</b> / 100{band && total != null && <em> {band}</em>}</p>
      <p className="eqt-score-x">{missing ? `Add buys for ${missing} ${missing === 1 ? "share" : "shares"} to weight the score by value now.` : `Weighted by value now across ${shares} ${shares === 1 ? "share" : "shares"}.`}</p>
      {missing > 0 && <button type="button" className="eqt-addq" onClick={onAddQty}>Add buys</button>}
    </div>
  );
}
