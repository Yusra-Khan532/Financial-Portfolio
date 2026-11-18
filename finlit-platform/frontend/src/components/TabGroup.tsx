// The report's one tab group (company report handover, 17 Nov 2026, README 1.2). A bar with a blue left edge, a header ("⇆ N views", a muted hint), and the
// tabs, numbered (except 08's chart topics): the chosen one filled blue with white text. Until the reader first uses a bar, the tab after the chosen one pulses
// softly (4 times, 2.2 s each, after 1 s). Every panel ends with "Next view · 1 of 3 Name →" ("Back to the first view · 3 of 3 … ↺" on the last), which switches
// the tab and brings the bar back into view if it went off screen. A link (or a #hash) to an element inside a hidden panel opens that panel first. Panels stay
// mounted (hidden), so their anchors exist and a link can find them. Variants: "key" (09: a KEY VIEW badge with a crown inside the bar header) and
// "highlighted" (16). A bar can also wrap a switch the section already had (06, 07, 08): pass `value` and `onChange` and no `content`; such bars have no
// Next view. Styles: styles/tabgroup.css (classes ctabs, ct-*). Descriptive only.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import "../styles/tabgroup.css";

export type TabView = { key: string; label: string; content?: ReactNode };

export function TabGroup({ views, label, hint = "Tap a tab to switch", numbered = true, variant, value, onChange, next = true, initial, noun = "views" }: {
  views: TabView[]; label: string; hint?: string; numbered?: boolean; variant?: "key" | "highlighted"; value?: string; onChange?: (key: string) => void; next?: boolean; initial?: string; noun?: string;
}) {
  const uid = "ct" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [own, setOwn] = useState(initial ?? views[0]?.key);
  const cur = value ?? own;
  const [used, setUsed] = useState(false);
  const bar = useRef<HTMLDivElement>(null), panels = useRef<HTMLDivElement>(null);
  const pick = useCallback((k: string) => { setUsed(true); if (value === undefined) setOwn(k); onChange?.(k); }, [value, onChange]);
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
    const r = bar.current?.getBoundingClientRect();
    if (r && r.top < 130) scrollBy({ top: r.top - 140, behavior: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <>
      <div ref={bar} className={"ctabs" + (used ? " used" : "") + (variant ? " ct-" + variant : "")}>
        <div className="ctabs-h">
          {variant === "key" && <span className="ct-crown" title="The key view of this section"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true" focusable="false"><path d="M3 18h18l-1.6-9-4.4 3.6L12 6l-3 6.6L4.6 9z" /></svg>KEY VIEW</span>}
          <span className="ctabs-ic" aria-hidden="true">⇆</span><b>{n} {noun}</b><span className="ctabs-hint">{hint}</span>
        </div>
        <div className="ct-list" role="tablist" aria-label={label}>
          {views.map((v, j) => (
            <button key={v.key} type="button" role="tab" id={`${uid}-t-${v.key}`} aria-selected={cur === v.key} aria-controls={hasPanels ? `${uid}-p-${v.key}` : undefined}
              tabIndex={cur === v.key ? 0 : -1} onClick={() => pick(v.key)}
              onKeyDown={(e) => { const m = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (m) { e.preventDefault(); const k = views[(j + m + n) % n].key; pick(k); document.getElementById(`${uid}-t-${k}`)?.focus(); } }}>
              {numbered && <span className="ct-n" aria-hidden="true">{j + 1}</span>}{v.label}
            </button>
          ))}
        </div>
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
