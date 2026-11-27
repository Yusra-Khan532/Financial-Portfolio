// The shared "sections bar with numbered steps" (dashboard pack, 15 Nov 2026, START-HERE rule 2), built once for every page that splits into numbered steps:
// - a sticky bar under the site's sticky header: "All sections" opens a menu of every section, grouped by step; then one chip per step, numbered 1, 2, 3 …
//   with arrows between them; the chip of the step in view is underlined (aria-current). On phones the bar scrolls sideways.
// - <StepHeading>: the numbered step heading (circle, title, one-line description) that splits the page into groups. Its id is the scroll target.
// Styles: styles/steps-bar.css (classes stb-*), scoped to these components.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "../styles/steps-bar.css";
import { SECTION_BAR_MIN } from "../lib/nav";
import { foldAnchor, revealAndScroll } from "./PhoneFold";

export type StepSection = { id: string; label: string };
export type Step = { id: string; n: number; title: string; line?: string; sections: StepSection[]; /** task #277: a section the member has not seen (Key figures, What changed) carries a dot */ dot?: boolean };
/** An optional menu for "All sections" grouped another way (all my investments: every tab's sections, grouped by tab); `go` runs instead of a scroll. */
export type MenuGroup = { title: string; items: { id: string; label: string; go: () => void }[] };

// task #310 part E: a step closed on a phone (PhoneFold) opens before the scroll, and is tracked by its closed row
const scrollTo = (id: string) => revealAndScroll(document.getElementById(id), (el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
/** The height of the site's sticky header (the bar sits right under it). 0 when there is none, or it does not stick. */
function headerHeight(): number {
  const h = document.querySelector<HTMLElement>("header.top");
  if (!h) return 0;
  const pos = getComputedStyle(h).position;
  if (pos !== "sticky" && pos !== "fixed") return 0;
  // task #391: on a phone the app's section chips (.ma-hub) stick right under the header; the bar sits under them, not behind them
  const hub = document.querySelector<HTMLElement>(".ma-hub"), hp = hub ? getComputedStyle(hub) : null;
  const hubH = hub && hp && hp.display !== "none" && (hp.position === "sticky" || hp.position === "fixed") ? hub.getBoundingClientRect().height : 0;
  return Math.round(h.getBoundingClientRect().height + hubH);
}

/** The step in view: the last step heading whose top has passed just under the bar. Exported for tests. */
export function stepInView(tops: { id: string; top: number }[], line: number): string | null {
  let cur: string | null = tops[0]?.id ?? null;
  for (const t of tops) if (t.top <= line) cur = t.id;
  return cur;
}

export function StepsBar({ steps, label = "Sections", menu, lead, arrows = false, step, onStep }: { steps: Step[]; label?: string; menu?: MenuGroup[]; /** task #235 (pack B12): shown at the left once the bar sticks */ lead?: ReactNode;
  /** task #277 (Equity file §11): the steps scroll inside the bar with ‹ › at its ends and a faded edge where steps are hidden; each arrow greys out at its end. Opt-in. */ arrows?: boolean;
  /** task #391 (developer file 35, Section bar): one section at a time. `step` is the stop shown ("all": every section); pressing a stop calls `onStep`
   *  with it and "All sections" (pressed while every section shows) calls it with "all". Without `onStep` the bar scrolls to sections as before. */
  step?: string; onStep?: (id: string) => void }) {
  const one = !!onStep;
  const [spied, setActive] = useState<string | null>(steps[0]?.id ?? null);
  const active = one ? (step === "all" ? null : step ?? null) : spied;
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0), [stuck, setStuck] = useState(false);
  const bar = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const popId = "stb-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const key = steps.map((s) => s.id).join(",");

  // Sit under the sticky site header, whatever its height on this screen.
  useEffect(() => {
    const fix = () => setTop(headerHeight());
    fix(); addEventListener("resize", fix);
    return () => removeEventListener("resize", fix);
  }, []);
  // Task #235 (pack B12): "stuck" once the bar reaches its place under the header, so the switcher at its left shows.
  useEffect(() => {
    if (!lead) return;
    const on = () => { const el = bar.current?.parentElement; if (!el) return; setStuck(el.getBoundingClientRect().top <= headerHeight() + 1 && scrollY > 0); };
    on(); addEventListener("scroll", on, { passive: true }); return () => removeEventListener("scroll", on);
  }, [lead]);
  // Underline the step in view.
  useEffect(() => {
    if (one) return;   // one section at a time: the chip of the shown stop is the current one
    let t = 0;
    const spy = () => {
      cancelAnimationFrame(t);
      t = requestAnimationFrame(() => {
        const line = Math.max(headerHeight() + (bar.current?.offsetHeight ?? 0) + 40, innerHeight * 0.4);   // a step is in view once its heading reaches the upper part of the window
        const tops = steps.map((s) => ({ id: s.id, top: foldAnchor(document.getElementById(s.id))?.getBoundingClientRect().top ?? Infinity }));
        setActive(stepInView(tops, line));
      });
    };
    spy(); addEventListener("scroll", spy, { passive: true }); addEventListener("resize", spy);
    return () => { cancelAnimationFrame(t); removeEventListener("scroll", spy); removeEventListener("resize", spy); };
  }, [key, one]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the chip of the step in view visible on a phone, where the bar scrolls sideways.
  useEffect(() => {
    const b = bar.current, c = b?.querySelector<HTMLElement>(`[data-step="${active}"]`);
    if (!b || !c || b.scrollWidth <= b.clientWidth) return;
    if (active === steps[0]?.id) { if (b.scrollLeft > 0) b.scrollTo({ left: 0, behavior: "smooth" }); return; }   // the first step: "All sections" stays in sight
    const left = c.offsetLeft - (one ? (b.querySelector<HTMLElement>(".stb-all")?.offsetWidth ?? 0) + 56 : 48);   // task #391: clear of the pinned All sections
    if (left < b.scrollLeft || c.offsetLeft + c.offsetWidth > b.scrollLeft + b.clientWidth) b.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active, one && stuck]);   // task #391: once the bar sticks (and the switcher takes room) the chosen stop is brought back into view
  // The menu closes on Escape (focus back to its button) and on a click outside.
  useEffect(() => {
    if (!open) return;
    const down = (e: Event) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus({ preventScroll: true }); } };
    document.addEventListener("pointerdown", down, true); document.addEventListener("keydown", esc);
    pop.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", esc); };
  }, [open]);

  // task #277: whether steps are hidden at each end (measured on scroll and on any change of the bar's width)
  const [edge, setEdge] = useState({ l: false, r: false });
  useEffect(() => {
    const b = bar.current; if (!arrows || !b) return;
    const m = () => setEdge({ l: b.scrollLeft > 2, r: b.scrollLeft + b.clientWidth < b.scrollWidth - 2 });
    m(); b.addEventListener("scroll", m, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(m) : null; ro?.observe(b);
    return () => { b.removeEventListener("scroll", m); ro?.disconnect(); };
  }, [arrows, steps.length, stuck]);
  const slide = (dir: number) => bar.current?.scrollBy({ left: dir * Math.max(160, (bar.current?.clientWidth ?? 600) * 0.6), behavior: "smooth" });
  if (steps.length < (one ? 2 : SECTION_BAR_MIN)) return null;   // task #310 part D: a section bar only on a page with four or more sections (task #391: in step mode the bar is how the stops open, so it shows from two)
  const go = (id: string, step: string) => { setOpen(false); setActive(step); scrollTo(id); };
  return (
    <div className={"stb-wrap" + (one ? " stb-one" : "") + (arrows ? " stb-arw" + (edge.l ? " edge-l" : "") + (edge.r ? " edge-r" : "") : "")} style={{ top }}>
      {/* task #277 (QA of 21 Nov, item 13): with the arrows the switcher sits before the scrolling steps, not pinned over them (it hid the first steps) */}
      {arrows && lead && stuck && <div className="stb-lead sw-host x-sw-on">{lead}</div>}
      {arrows && (edge.l || edge.r) && <button type="button" className="stb-sl l" aria-label="Earlier steps" disabled={!edge.l} onClick={() => slide(-1)}>‹</button>}
      <nav className={"stb sw-host" + (stuck && lead && !arrows ? " x-sw-on" : "")} ref={bar} aria-label={label}>
        {!arrows && lead}
        {one ? <button type="button" className="stb-all" aria-pressed={step === "all"} onClick={() => onStep!("all")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
          All sections
        </button> : <button type="button" ref={btn} className="stb-all" aria-haspopup="true" aria-expanded={open} aria-controls={popId} onClick={() => setOpen(!open)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
          All sections
        </button>}
        <span className="stb-sep" aria-hidden="true" />
        {steps.map((s, i) => (
          <span className="stb-item" key={s.id}>
            {i > 0 && <span className="stb-arrow" aria-hidden="true">→</span>}
            <button type="button" className="stb-chip" data-step={s.id} aria-current={active === s.id ? "step" : undefined} onClick={() => (one ? onStep!(s.id) : go(s.id, s.id))}>
              {s.n > 0 ? <span className="stb-n" aria-hidden="true">{s.n}</span> : <span className="stb-n stb-n0" aria-hidden="true">·</span>}{s.title}{s.dot && <i className="stb-dot" role="img" aria-label="not seen yet" />}
            </button>
          </span>
        ))}
      </nav>
      {arrows && (edge.l || edge.r) && <button type="button" className="stb-sl r" aria-label="More steps" disabled={!edge.r} onClick={() => slide(1)}>›</button>}
      {open && (
        <div className="stb-pop" id={popId} ref={pop} role="dialog" aria-label="All sections">
          {menu ? menu.map((g) => (
            <div className="stb-grp" key={g.title}>
              <h5>{g.title}</h5>
              {g.items.map((x) => <button type="button" key={x.id} onClick={() => { setOpen(false); x.go(); }}>{x.label}</button>)}
            </div>
          )) : steps.map((s) => (
            <div className="stb-grp" key={s.id}>
              <h5>{s.n} · {s.title}</h5>
              {s.sections.map((x) => <button type="button" key={x.id} onClick={() => go(x.id, s.id)}>{x.label}</button>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A numbered step heading: the circle, the title and its one-line description. */
export function StepHeading({ id, n, title, line, children }: { id: string; n: number; title: string; line?: string; children?: ReactNode }) {
  return (
    <div className="stb-step" id={id}>
      <span className="stb-step-n" aria-hidden="true">{n}</span>
      <div><h2><span className="sr-only">Step {n}: </span>{title}</h2>{line ? <p>{line}</p> : null}</div>
      {children}
    </div>
  );
}
