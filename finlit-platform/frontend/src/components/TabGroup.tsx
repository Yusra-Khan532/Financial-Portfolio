// The report's one tab group (company report handover, 17 Nov 2026, README 1.2). A bar with a blue left edge, a header ("⇆ N views", a muted hint), and the
// tabs, numbered (except 08's chart topics): the chosen one filled blue with white text. Until the reader first uses a bar, the tab after the chosen one pulses
// softly (4 times, 2.2 s each, after 1 s). Every panel ends with "Next view · 1 of 3 Name →" ("Back to the first view · 3 of 3 … ↺" on the last), which switches
// the tab and brings the bar back into view if it went off screen. A link (or a #hash) to an element inside a hidden panel opens that panel first. Panels stay
// mounted (hidden), so their anchors exist and a link can find them. Variants: "key" (09: a KEY VIEW badge with a crown inside the bar header) and
// "highlighted" (16). A bar can also wrap a switch the section already had (06, 07, 08): pass `value` and `onChange` and no `content`; such bars have no
// Next view. Styles: styles/tabgroup.css (classes ctabs, ct-*). Descriptive only.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import "../styles/tabgroup.css";

/** `chip`: a small score or count after the label (task #220: 01 "Growth & Profitability 58.1", 02 "Every signal 27"); `note`: a short muted
 *  addition after it (01's "N of M" while a filter is on). */
/** `crown` (developer file 44): a gold crown sits over the tab's top edge; the text is its hover title and is read out after the tab's name. */
export type TabView = { key: string; label: string; content?: ReactNode; chip?: ReactNode; note?: ReactNode; crown?: string };

/** Task #220 (Prism report, README 1.3): `tools` puts a row of controls inside the bar, under the tabs (01's filters and sort); `sticky` freezes the
 *  bar under the page's sections bar while its section is on screen (top = --pzn-stick, set by the sections bar), with a shadow and a page-colour band
 *  when stuck, and a tab press (or Next view) while stuck shows the new panel from its start. */
/** Task #329 (IPOs, developer file 29): `aside` is a short line after the tabs, in the bar ("Showing: …" for the view that is open). */
/** Task #332 (Sector Rotation, developer file 31): `title` names the box in the bar header ("All 19 sectors", with "4 ways to look · press one" under it) and
 *  `className` marks the bar for its page; without them the bar is exactly as before. */
export function TabGroup({ views, label, hint = "Tap a tab to switch", numbered = true, variant, value, onChange, next = true, initial, noun = "views", tools, sticky = false, aside, title, className }: {
  views: TabView[]; label: string; hint?: string; numbered?: boolean; variant?: "key" | "highlighted"; value?: string; onChange?: (key: string) => void; next?: boolean; initial?: string; noun?: string;
  tools?: ReactNode; sticky?: boolean; aside?: ReactNode; title?: ReactNode; className?: string;
}) {
  const uid = "ct" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [own, setOwn] = useState(initial ?? views[0]?.key);
  const cur = value ?? own;
  const [used, setUsed] = useState(false);
  const bar = useRef<HTMLDivElement>(null), panels = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const stickTop = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pzn-stick")) || 0;
  // a frozen bar: stuck while it sits at its sticky top and its section has started above it
  useEffect(() => {
    if (!sticky) return;
    let raf = 0;
    const upd = () => {
      raf = 0;
      const b = bar.current; if (!b) return;
      const t = stickTop(), r = b.getBoundingClientRect(), sec = (b.closest("section") ?? b.parentElement)!.getBoundingClientRect();
      setStuck(Math.abs(r.top - t) < 2 && sec.top < t - 4);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(upd); };
    upd(); addEventListener("scroll", on, { passive: true }); addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, [sticky]);
  // after a switch while the bar is frozen, the new panel starts just under the bar
  const showFromStart = (k: string) => requestAnimationFrame(() => {
    const p = panels.current?.querySelector<HTMLElement>(`[data-ct-panel="${CSS.escape(k)}"]`), b = bar.current;
    if (!p || !b) return;
    const d = p.getBoundingClientRect().top - (stickTop() + b.offsetHeight + 10);
    if (Math.abs(d) > 4) scrollBy({ top: d, behavior: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  const pick = useCallback((k: string) => {
    const was = sticky && stuck;
    setUsed(true); if (value === undefined) setOwn(k); onChange?.(k);
    if (was) showFromStart(k);
  }, [value, onChange, sticky, stuck]);   // eslint-disable-line react-hooks/exhaustive-deps
  const hasPanels = views.some((v) => v.content !== undefined);

  // A link or an address (#id) pointing inside a hidden panel of this group opens that panel first, then the browser (or the page's own handler) scrolls to it.
  useEffect(() => {
    if (!hasPanels) return;
    const open = (id: string) => {
      const el = id ? document.getElementById(id) : null, p = el?.closest<HTMLElement>("[data-ct-panel]");
      if (p && panels.current?.contains(p) && p.hidden) { const k = p.dataset.ctPanel!; setOwn(k); onChange?.(k); return true; }
      return false;
    };
    const click = (e: MouseEvent) => { const a = (e.target as Element | null)?.closest?.('a[href^="#"]'); if (a) open(decodeURIComponent(a.getAttribute("href")!.slice(1))); };
    const hash = () => { if (open(decodeURIComponent(location.hash.slice(1)))) requestAnimationFrame(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: "start" })); };
    document.addEventListener("click", click, true); addEventListener("hashchange", hash); hash();
    return () => { document.removeEventListener("click", click, true); removeEventListener("hashchange", hash); };
  }, [hasPanels, onChange]);

  const n = views.length;
  const goNext = (from: number) => {
    const k = views[(from + 1) % n].key; pick(k);
    if (sticky) { showFromStart(k); return; }
    const r = bar.current?.getBoundingClientRect();
    if (r && r.top < 130) scrollBy({ top: r.top - 140, behavior: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <>
      <div ref={bar} className={"ctabs" + (className ? " " + className : "") + (used ? " used" : "") + (variant ? " ct-" + variant : "") + (tools ? " has-tools" : "") + (sticky ? " ct-sticky" : "") + (stuck ? " stuck" : "")}>
        <div className="ctabs-h">
          {variant === "key" && <span className="ct-crown" title="The key view of this section"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true" focusable="false"><path d="M3 18h18l-1.6-9-4.4 3.6L12 6l-3 6.6L4.6 9z" /></svg>KEY VIEW</span>}
          <span className="ctabs-ic" aria-hidden="true">⇆</span>{title != null ? <b className="ct-title">{title}<small>{n} {noun} · {hint}</small></b> : <><b>{n} {noun}</b><span className="ctabs-hint">{hint}</span></>}
        </div>
        <div className={"ct-list" + (views.some((v) => v.crown) ? " crowned" : "")} role="tablist" aria-label={label}>
          {views.map((v, j) => (
            <button key={v.key} type="button" role="tab" id={`${uid}-t-${v.key}`} aria-selected={cur === v.key} aria-controls={hasPanels ? `${uid}-p-${v.key}` : undefined}
              tabIndex={cur === v.key ? 0 : -1} onClick={() => pick(v.key)}
              onKeyDown={(e) => { const m = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (m) { e.preventDefault(); const k = views[(j + m + n) % n].key; pick(k); document.getElementById(`${uid}-t-${k}`)?.focus(); } }}>
              {numbered && <span className="ct-n" aria-hidden="true">{j + 1}</span>}{v.label}
              {v.chip != null && <em className="ct-sc">{v.chip}</em>}{v.note != null && v.note !== "" && <small className="ct-cnt">{v.note}</small>}
              {v.crown && <span className="ct-tcrown" title={v.crown}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false"><path d="M3 18h18l-1.6-9-4.4 3.6L12 6l-3 6.6L4.6 9z" /></svg><span className="sr-only">, {v.crown}</span></span>}
            </button>
          ))}
        </div>
        {aside != null && <span className="ct-aside" aria-live="polite">{aside}</span>}
        {tools && <div className="ct-tools">{tools}</div>}
      </div>
      {hasPanels && <div ref={panels} className="ct-panels">{views.map((v, j) => (
        <div key={v.key} className="ctab-panel" role="tabpanel" id={`${uid}-p-${v.key}`} aria-labelledby={`${uid}-t-${v.key}`} data-ct-panel={v.key} hidden={cur !== v.key}>
          {v.content}
          {next && n > 1 && (j < n - 1
            ? <button type="button" className="ct-next" onClick={() => goNext(j)}><span className="ct-next-k">Next view · {j + 1} of {n}</span><b>{views[j + 1].label}</b><span className="ct-next-a" aria-hidden="true">→</span></button>
            : <button type="button" className="ct-next" onClick={() => goNext(j)}><span className="ct-next-k">Back to the first view · {n} of {n}</span><b>{views[0].label}</b><span className="ct-next-a" aria-hidden="true">↺</span></button>)}
        </div>))}</div>}
    </>
  );
}
