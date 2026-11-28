// Task #448 (Sector Pulse, developer file 42, 01 §1; shared with Sector Rotation, file 43): the step bar that replaces "On this page". The page's own sections
// are the steps, in order; the quick check (Today, Your …) comes first, then a GO DEEPER divider. One section at a time is the default: pressing a step shows
// only its blocks (and scrolls back to the bar if the page was below it). "All sections" shows every step one after another. The choice and the open step are
// kept for the session, per page and view. A red dot marks a step with something new since the member last opened it (kept with the member's settings,
// prefs.viewsSeen, keyed by page, view and the reading's date, so a new close brings the dots back). Each step ends with a previous / next row.
// Keyboard: a roving tabindex (only the current step is in the Tab order), ← → Home End; a "Skip to this step" link before the steps.
// On a phone the bar scrolls sideways with faded edges and the current step centred; in All sections every section after the first folds behind the
// site's fold row (PhoneFold); in one-section mode the section shows open. Styles: styles/pulse448.css (sx-steps).
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PhoneFold } from "../../PhoneFold";
import { prefs, usePrefs } from "../../../lib/prefs";

export type Step = { key: string; label: string; content: ReactNode; line: string; dot?: boolean };
type Mode = "one" | "all";

const read = (k: string): { mode?: Mode; cur?: string } => { try { return JSON.parse(sessionStorage.getItem(k) || "{}") ?? {}; } catch { return {}; } };
const write = (k: string, v: { mode: Mode; cur: string }) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: kept for this view only */ } };

/** The member's seen steps for this reading: "sp:s-261120-today" (page, view letter, the close's date as yymmdd, the step). */
export function seenKey(page: "sp" | "sr", view: string, date: string | null | undefined, step: string): string {
  return `${page}:${view[0]}-${(date ?? "").replace(/-/g, "").slice(2, 8)}-${step}`.slice(0, 37);
}

/** Moves focus to a step's heading (made focusable for that), so a keyboard or screen-reader user lands on the step they asked for. */
const focusStep = (k: string) => { const h = document.querySelector<HTMLElement>(`#sx-step-${k} h2`); if (!h) return; if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); h.focus(); };

export function Steps({ page, view, date, steps, quick, deeper = "Go deeper" }: { page: "sp" | "sr"; view: string; date: string | null | undefined; steps: Step[]; quick: number; deeper?: string }) {
  const store = `finlit:steps:${page}:${view}`;
  const saved = read(store);
  const keys = steps.map((s) => s.key);
  const [mode, setModeRaw] = useState<Mode>(saved.mode === "all" ? "all" : "one");
  const [cur, setCurRaw] = useState<string>(saved.cur && keys.includes(saved.cur) ? saved.cur : keys[0]);
  const current = keys.includes(cur) ? cur : keys[0];
  const p = usePrefs();
  const bar = useRef<HTMLDivElement>(null), list = useRef<HTMLOListElement>(null);
  const key = (s: string) => seenKey(page, view, date, s);
  const viewsSeen = useMemo(() => p.viewsSeen ?? [], [p.viewsSeen]);
  const seen = useMemo(() => new Set(viewsSeen), [viewsSeen]);
  const markSeen = (ss: string[]) => {
    const add = ss.map(key).filter((k) => !seen.has(k));
    if (!add.length) return;
    const today = key("x").slice(0, key("x").lastIndexOf("-"));                      // this page, view and reading: older readings' keys are dropped
    const keep = viewsSeen.filter((v) => !v.startsWith(`${page}:${view[0]}-`) || v.startsWith(today));
    prefs.set({ viewsSeen: [...keep, ...add].slice(-60) });
  };
  const isNew = (s: Step) => !!s.dot && !seen.has(key(s.key));
  useEffect(() => { if (mode === "one") markSeen([current]); else markSeen(keys); }, [mode, current, date]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // phone: centre the current step in the sideways-scrolling bar
    const el = list.current?.querySelector<HTMLElement>('[aria-current="step"]');
    if (el && list.current && list.current.scrollWidth > list.current.clientWidth) list.current.scrollLeft = el.offsetLeft - (list.current.clientWidth - el.offsetWidth) / 2;
  }, [current]);
  const go = (k: string, focus = false) => {
    setCurRaw(k); write(store, { mode, cur: k });
    if (mode === "all") { document.getElementById(`sx-step-${k}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" }); return; }
    const top = bar.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) bar.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });   // back to the bar if the page was below it
    if (focus) requestAnimationFrame(() => focusStep(k));
  };
  useEffect(() => {   // another part of the page asks for a step ("See all your sectors →" on Today)
    const on = (e: Event) => { const k = (e as CustomEvent<string>).detail; if (keys.includes(k)) go(k, true); };
    document.addEventListener("finlit:step", on);
    return () => document.removeEventListener("finlit:step", on);
  });
  const setMode = (m: Mode) => { setModeRaw(m); write(store, { mode: m, cur: current }); };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const j = e.key === "ArrowRight" ? Math.min(keys.length - 1, i + 1) : e.key === "ArrowLeft" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); go(keys[j]);
    requestAnimationFrame(() => list.current?.querySelectorAll<HTMLElement>("button.sx-step")[j]?.focus());
  };
  const anyNew = steps.some(isNew);
  const idx = keys.indexOf(current);
  const ends = (i: number) => {
    const prev = steps[i - 1], next = steps[i + 1], quickEnd = i === quick - 1 && next;
    return (
      <div className="sx-prevnext">
        {prev ? <button type="button" className="sx-stepgo sx-prev" onClick={() => go(prev.key, true)}>← {i} {prev.label}</button> : <span />}
        {quickEnd && <p className="sx-quick"><b>That's the quick check.</b> The steps after this cover the whole market, for when you have more time.</p>}
        {next ? <button type="button" className="sx-stepgo sx-next" onClick={() => go(next.key, true)}>{quickEnd ? `${deeper}: ${i + 2} ${next.label} →` : `Next: ${i + 2} ${next.label} →`}</button>
          : <button type="button" className="sx-stepgo sx-next" onClick={() => go(keys[0], true)}>Back to 1 {steps[0].label} ↑</button>}
      </div>
    );
  };
  return (
    <>
      <div className="sx-stepbar" ref={bar}>
        <nav className="sx-stepnav" aria-label="Steps on this page">
          <a className="sx-skip" href={`#sx-step-${current}`} onClick={(e) => { e.preventDefault(); focusStep(current); }}>Skip to this step</a>
          <ol ref={list}>{steps.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 && (i === quick ? <li className="sx-deeper" aria-hidden="true">{deeper}</li> : <li className="sx-step-ar" aria-hidden="true">→</li>)}
              <li><button type="button" className={"sx-step" + (s.key === current ? " on" : "")} aria-current={s.key === current ? "step" : undefined} tabIndex={s.key === current ? 0 : -1}
                aria-label={`${i + 1} ${s.label}${isNew(s) ? ", new since your last visit" : ""}`} title={isNew(s) ? "New since your last visit" : undefined}
                onClick={() => go(s.key)} onKeyDown={(e) => onKey(e, i)}><i aria-hidden="true">{i + 1}</i><span>{s.label}</span>{isNew(s) && <span className="sx-new-dot" aria-hidden="true" />}</button></li>
            </Fragment>))}</ol>
          <button type="button" className="sx-allsec" aria-pressed={mode === "all"} onClick={() => setMode(mode === "all" ? "one" : "all")}>{mode === "all" ? "One section at a time" : "All sections"}</button>
        </nav>
        {anyNew && <p className="sx-newkey"><span className="sx-new-dot" aria-hidden="true" /> New since your last visit</p>}
      </div>
      {mode === "one"
        ? <div className="sx-stepview" id={`sx-step-${current}`} data-step={current}>{steps[idx].content}{ends(idx)}</div>
        : steps.map((s, i) => (
          <div key={s.key} className="sx-stepview" id={`sx-step-${s.key}`} data-step={s.key}>
            {i === 0 ? s.content : <PhoneFold page={`steps-${page}-${view}`} id={s.key} title={`${i + 1} ${s.label}`} line={s.line.length > 90 ? s.line.slice(0, 89) + "…" : s.line}>{s.content}</PhoneFold>}
            {ends(i)}
          </div>))}
    </>
  );
}
