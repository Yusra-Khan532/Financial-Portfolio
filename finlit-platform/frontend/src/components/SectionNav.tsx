// A sticky bar of section buttons for a long calculator page (task #189, DCF calculator; the same behaviour as Reverse valuation's bar, task #183): each
// button scrolls smoothly to its section without hiding or changing anything, an (i) beside it explains the section, the section on screen is marked in
// emerald green, and a section that does not exist yet (no result) is greyed out with the reason. On a phone the row scrolls sideways with faded edges.
// A section inside a closed <details> is opened before scrolling. Styles: styles/section-nav.css (snav-).
import { useEffect, useRef, useState } from "react";
import { Info } from "./Info";
import { Icon } from "../lib/icons";
import type { Glossary } from "../lib/api";
import "../styles/section-nav.css";

export type SectionItem = { id: string; label: string; /** an icon before the label (optional: the DCF bar has none so all eight fit on one row) */ icon?: string; about: string; /** null when the section is there; else why it is not */ off?: string | null };
const HEADER = 64;   // the site header's height: the bar sticks just under it
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The element a button scrolls to: the one marked data-snav="<id>" inside `scope`. */
const target = (scope: string, id: string) => document.querySelector<HTMLElement>(`${scope} [data-snav="${id}"]`);

export function SectionNav({ items, scope, label = "Sections of this page" }: { items: SectionItem[]; scope: string; label?: string }) {
  const bar = useRef<HTMLElement>(null), row = useRef<HTMLDivElement>(null), lock = useRef(0);
  const [on, setOn] = useState<string | null>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const offset = () => HEADER + (bar.current?.offsetHeight ?? 52) + 12;
  const key = items.map((n) => n.id + (n.off ? "0" : "1")).join();
  // the marked section: the last one whose top has passed under the bar (the last one when the page is scrolled to the end)
  useEffect(() => {
    let raf = 0;
    const spy = () => {
      raf = 0; if (Date.now() < lock.current) return;
      const live = items.filter((n) => !n.off).map((n) => ({ n, el: target(scope, n.id) })).filter((x) => x.el);
      if (!live.length) { setOn(null); return; }
      let cur: string | null = null;
      for (const x of live) if (x.el!.getBoundingClientRect().top <= offset() + 8) cur = x.n.id;
      if (cur && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = live[live.length - 1].n.id;
      setOn(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(spy); };
    spy(); addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [key, scope]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the bar's height, for pages that keep their own sticky parts below it
  useEffect(() => {
    const el = bar.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--snav-h", el.offsetHeight + "px"));
    ro.observe(el); return () => { ro.disconnect(); document.documentElement.style.removeProperty("--snav-h"); };
  }, []);
  const edges = () => { const el = row.current; if (el) setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 }); };
  useEffect(() => {   // keep the marked button in view on a phone
    const el = row.current, b = on ? el?.querySelector<HTMLElement>(`[data-id="${on}"]`) : null;
    if (el && b && el.scrollWidth > el.clientWidth) { const l = b.offsetLeft - el.offsetLeft; if (l < el.scrollLeft || l + b.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, l - 24); }
    edges();
  }, [on]);
  useEffect(() => { addEventListener("resize", edges); return () => removeEventListener("resize", edges); }, []);
  const go = (n: SectionItem) => {
    const el = target(scope, n.id); if (!el) return;
    if (el instanceof HTMLDetailsElement && !el.open) el.open = true;   // never hidden: a closed group opens
    lock.current = Date.now() + (reduced() ? 100 : 900);
    setOn(n.id);
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset()), behavior: reduced() ? "auto" : "smooth" });
    // charts above the section can grow while the page scrolls (they draw as they come into view), moving the section: once the scroll ends, land on it
    let done = false;
    const settle = () => { if (done) return; done = true; removeEventListener("scrollend", settle);
      const d = el.getBoundingClientRect().top - offset(); if (Math.abs(d) > 4) window.scrollTo({ top: Math.max(0, window.scrollY + d), behavior: "auto" }); };
    addEventListener("scrollend", settle, { once: true }); window.setTimeout(settle, reduced() ? 60 : 1200);
  };
  return (
    <nav ref={bar} className="snav" aria-label={label}>
      <div ref={row} className={"snav-row" + (edge.l ? " fl" : "") + (edge.r ? " fr" : "")} onScroll={edges}>
        {items.map((n) => (
          <div key={n.id} className={"snav-i" + (on === n.id ? " on" : "") + (n.off ? " off" : "")} data-id={n.id}>
            <button type="button" className="snav-b" aria-current={on === n.id ? "true" : undefined} aria-disabled={n.off ? true : undefined}
              title={n.off ?? `Go to ${n.label}`} onClick={() => (n.off ? undefined : go(n))}>{n.icon && <Icon name={n.icon} />}<span>{n.label}</span></button>
            <Info g={{ key: "snav-" + n.id, label: n.label, what: n.about, note: n.off ?? undefined } as Glossary} />
          </div>))}
      </div>
    </nav>
  );
}
