// Task #276 (shared portfolio parts, §11 "View bar", Bar B): the live pill under the views: the account picker, the views (an orange dot on a view not opened
// yet), All sections, then the open view's numbered steps, which scroll inside the bar with ‹ › arrows and faded edges; the open step is underlined and kept
// in view. On a phone the steps scroll by swipe. Inside a long table the bar slides up (`away`) and the table's filter row takes its place (FilterRow), with
// the same picker, views and a Sections ▾ menu (SectionsMenu) that says "You are here", "Hidden · opens it" and lists All sections.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { jumpTo, useHeaderHeight } from "../pack/PageTop";
import { lk, pct, tone } from "../money";
import type { PfFigs, PfInfo } from "../Portfolios";
import { pfAvatar } from "../ViewKit";
import { isHidden, setHidden } from "./KitSection";
import "../view-kit.css";
import "./kit.css";

export type Step = { id: string; label: string; badge?: string };
export type ViewSteps<T extends string> = Record<T, { label: string; steps: Step[] }>;
export type Pick = { list: PfInfo[]; cur: string | "all"; onPick: (id: string | "all") => void; figs: (id: string | "all") => PfFigs; noun: [string, string] };
export type ViewDefB<T extends string> = { id: T; label: string; color: string };

/** A menu that renders into the page body (a blurred sticky bar would clip it), closes on Esc, a click outside or a scroll. */
export function Pop({ at, onClose, label, children, wide }: { at: { top: number; left: number }; onClose: () => void; label: string; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null), close = useRef(onClose);
  close.current = onClose;                       // task #292: the newest onClose, without re-running the effect (a page re-render no longer moves the focus)
  useEffect(() => {
    const y0 = scrollY, key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); }, sc = () => { if (Math.abs(scrollY - y0) > 60) close.current(); };
    const click = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close.current(); };
    addEventListener("keydown", key); addEventListener("scroll", sc, { passive: true }); const t = setTimeout(() => document.addEventListener("mousedown", click), 0);
    box.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    return () => { clearTimeout(t); removeEventListener("keydown", key); removeEventListener("scroll", sc); document.removeEventListener("mousedown", click); };
  }, []);                                        // once per opening
  return createPortal(<div ref={box} className={"ptk-pop" + (wide ? " wide" : "")} role="menu" aria-label={label} style={{ top: at.top, left: at.left }}>{children}</div>, document.body);
}
const place = (b: HTMLElement, w = 300) => { const r = b.getBoundingClientRect(); return { top: Math.round(r.bottom + 6), left: Math.round(Math.max(12, Math.min(r.left, innerWidth - w - 12))) }; };

/** The account picker: "∑ All accounts ▾", a menu of All accounts and each account with its count and value. */
export function AccountPicker({ p, compact }: { p: Pick; compact?: boolean }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const all = [{ id: "all", name: "All accounts" }, ...p.list], cur = all.find((x) => x.id === p.cur) ?? all[0], av = pfAvatar(p.list, cur.id);
  return <>
    <button type="button" className="x-sw-b x-sw-p" aria-haspopup="menu" aria-expanded={!!at} aria-label={`Portfolio: ${cur.name}. Switch portfolio`} onClick={(e) => setAt(at ? null : place(e.currentTarget, 280))}>
      <span className="acc-av" style={{ ["--av" as string]: av.av }} aria-hidden="true">{av.ini}</span><b>{cur.name}</b>{!compact && <small className="ptk-pk-n">{p.figs(cur.id).n} {p.figs(cur.id).n === 1 ? p.noun[0] : p.noun[1]}</small>}<i aria-hidden="true">▾</i></button>
    {at && <Pop at={at} onClose={() => setAt(null)} label="Portfolio">
      <p className="ptk-pop-k">Portfolio</p>
      {all.map((x) => { const f = p.figs(x.id), a = pfAvatar(p.list, x.id); return (
        <button key={x.id} type="button" role="menuitemradio" aria-checked={x.id === p.cur} onClick={() => { setAt(null); p.onPick(x.id); }}>
          <span className="acc-av" style={{ ["--av" as string]: a.av }} aria-hidden="true">{a.ini}</span>
          <span className="ptk-pop-t"><b>{x.name}</b><small>{f.n} {f.n === 1 ? p.noun[0] : p.noun[1]}{f.withQty ? ` · ${lk(f.now)}` : " · no buys yet"}{f.gainPct != null && <> · <span className={tone(f.gainPct)}>{pct(f.gainPct)}</span></>}</small></span></button>); })}
    </Pop>}
  </>;
}

/** The views as a segment; a view not opened yet carries an orange dot. */
export function ViewSeg<T extends string>({ defs, view, onView, seen }: { defs: ViewDefB<T>[]; view: T; onView: (v: T) => void; seen: Set<string> }) {
  return <span className="x-sw-seg ptk-seg" role="group" aria-label="View">{defs.map((d) => <button key={d.id} type="button" className="x-sw-v" aria-pressed={d.id === view} style={{ ["--va" as string]: d.color }} onClick={() => onView(d.id)}>
    {d.label}{!seen.has(d.id) && <><i className="ptk-vdot" aria-hidden="true" /><span className="sr-only"> (not opened yet)</span></>}</button>)}</span>;
}

/** All sections of every view (the bar), or this view's sections first with "You are here" and "Hidden · opens it" (the filter row's Sections ▾). */
export function SectionsMenu<T extends string>({ all, view, onSec, here, label, btnClass, mode }: {
  all: ViewSteps<T>; view: T; onSec: (v: T, id: string) => void; here?: string; label: string; btnClass: string; mode: "all" | "view";
}) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null), [more, setMore] = useState(false);
  const go = (v: T, id: string) => { setAt(null); if (isHidden(id)) setHidden(id, false); onSec(v, id); };
  const list = (v: T, mark: boolean) => all[v].steps.map((s, i) => { const hid = isHidden(s.id), cur = mark && here === s.id;
    return <button key={s.id} type="button" role="menuitem" aria-current={cur ? "true" : undefined} onClick={() => go(v, s.id)}><span className="eqt-n">{i + 1}</span><span className="ptk-pop-t"><b>{s.label}</b>
      {cur ? <small>You are here</small> : hid ? <small>Hidden · opens it</small> : null}</span></button>; });
  const views = Object.keys(all) as T[];
  return <>
    <button type="button" className={btnClass} aria-haspopup="menu" aria-expanded={!!at} onClick={(e) => { setMore(false); setAt(at ? null : place(e.currentTarget, 320)); }}>{label}</button>
    {at && <Pop at={at} onClose={() => setAt(null)} label={label.replace(/ ▾$/, "")} wide>
      {mode === "view" ? <>
        <p className="ptk-pop-k">{all[view].label}</p>{list(view, true)}
        <button type="button" className="ptk-pop-all" aria-expanded={more} onClick={() => setMore(!more)}>All sections {more ? "▴" : "▾"}</button>
        {more && views.filter((v) => v !== view).map((v) => <div key={v}><p className="ptk-pop-k">{all[v].label}</p>{list(v, false)}</div>)}
      </> : views.map((v) => <div key={v}><p className="ptk-pop-k">{all[v].label}</p>{list(v, v === view)}</div>)}
    </Pop>}
  </>;
}

/** The step in view under the bar (the first section whose top has passed the bar), for the underline and "You are here". */
export function useStepInView(ids: string[]) {
  const [on, setOn] = useState(ids[0] ?? "");
  useEffect(() => {
    setOn(ids[0] ?? "");
    const f = () => { const lim = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--top-h")) || 0) + 140;
      let cur = ids[0] ?? ""; for (const id of ids) { const el = document.getElementById(id); if (el && el.getClientRects().length && el.getBoundingClientRect().top <= lim) cur = id; } setOn(cur); };
    f(); addEventListener("scroll", f, { passive: true }); return () => removeEventListener("scroll", f);
  }, [ids.join()]);   // eslint-disable-line react-hooks/exhaustive-deps
  return on;
}

export function ViewBar<T extends string>({ pick, defs, view, onView, seen, all, onSec, away, step, onStep }: {
  pick: Pick; defs: ViewDefB<T>[]; view: T; onView: (v: T) => void; seen: Set<string>; all: ViewSteps<T>; onSec: (v: T, id: string) => void; away?: boolean;
  /** task #389 (MF portfolio, developer file 32, Section bar): one section at a time. `step` is the step shown ("all": every section); a step shows that
   *  section only and All sections (pressed) puts every section back. Without it the bar jumps to sections as before (the ETF page). */
  step?: string; onStep?: (id: string) => void;
}) {
  useHeaderHeight(".ptk-bar:not(.away), .ptk-frow.stuck");   // task #388 reopened (S3): the MF and ETF pages' floating bars, 8px under the header
  const steps = all[view].steps, inView = useStepInView(steps.map((s) => s.id)), box = useRef<HTMLSpanElement>(null), [edge, setEdge] = useState({ l: false, r: false });
  const one = !!onStep, on = one ? (step === "all" ? "" : step ?? "") : inView;
  const measure = () => { const el = box.current; if (!el) return; setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 }); };
  useEffect(() => { measure(); const el = box.current; el?.addEventListener("scroll", measure, { passive: true }); addEventListener("resize", measure); return () => { el?.removeEventListener("scroll", measure); removeEventListener("resize", measure); }; }, [view]);
  useEffect(() => {   // the open step is kept in view inside the bar
    const el = box.current, c = el?.querySelector<HTMLElement>("[aria-current=true]"); if (!el || !c) return;
    const l = c.offsetLeft - el.offsetLeft, r = l + c.offsetWidth;
    if (l < el.scrollLeft + 24) el.scrollTo?.({ left: Math.max(0, l - 32) }); else if (r > el.scrollLeft + el.clientWidth - 24) el.scrollTo?.({ left: r - el.clientWidth + 32 });
  }, [on]);
  const by = (d: number) => box.current?.scrollBy?.({ left: d * Math.max(160, (box.current?.clientWidth ?? 300) * 0.7), behavior: "smooth" });
  return (
    <nav className={"ptk-bar sw-host" + (away ? " away" : "")} aria-label="Views and sections" aria-hidden={away || undefined}>
      <span className="x-sw ptk-lead"><AccountPicker p={pick} /><ViewSeg defs={defs} view={view} onView={onView} seen={seen} /></span>
      {one ? <button type="button" className="eqt-all" aria-pressed={step === "all"} onClick={() => onStep!("all")}>All sections</button>
        : <SectionsMenu all={all} view={view} onSec={onSec} here={on} label="All sections" btnClass="eqt-all" mode="all" />}
      <button type="button" className="ptk-bsc" aria-label="Show earlier steps" hidden={!edge.l && !edge.r} disabled={!edge.l} onClick={() => by(-1)}>‹</button>
      <span ref={box} className={"ptk-steps" + (edge.l ? " fl" : "") + (edge.r ? " fr" : "")}>
        {steps.map((s, i) => <button key={s.id} type="button" className="eqt-chip" aria-current={on === s.id ? "true" : undefined} onClick={() => { if (isHidden(s.id)) setHidden(s.id, false); if (one) onStep!(s.id); else jumpTo(s.id); }}>
          <span className="eqt-n">{i + 1}</span>{s.label}{s.badge && <span className="ptk-stepnew">{s.badge}</span>}</button>)}
      </span>
      <button type="button" className="ptk-bsc" aria-label="Show later steps" hidden={!edge.l && !edge.r} disabled={!edge.r} onClick={() => by(1)}>›</button>
    </nav>
  );
}

/** True while the reader is inside the long table (its section's top has passed under the header and its end is still below): the bar slides up. */
export function useInside(id: string, on = true) {
  const [inside, set] = useState(false);
  useEffect(() => {
    if (!on) { set(false); return; }
    const f = () => { const el = document.getElementById(id); if (!el) return set(false); const r = el.getBoundingClientRect(), top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--top-h")) || 0;
      set(r.top < top + 8 && r.bottom > top + 220); };
    f(); addEventListener("scroll", f, { passive: true }); addEventListener("resize", f); return () => { removeEventListener("scroll", f); removeEventListener("resize", f); };
  }, [id, on]);
  return inside;
}
