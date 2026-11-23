// Sector Pulse, the shorter page (task #333, developer file 30, 23 Nov 2026): the pieces the new layout is built from.
//  - SxNav: "On this page", one numbered stop per section with its real name; it stays under the site header while scrolling and the section in view turns black.
//    Pressing a closed row's name scrolls to it and opens it.
//  - SxBox: a box with a switch, the "views" bar of the Results and IPOs pages (thick dark left edge, ⇆, numbered buttons, black for the open one). One pane is open
//    at a time; a pane is drawn once it has been opened and kept, hidden, after. The open tab is remembered for the member in this browser (as the Results page
//    remembers its view) and, for a box that names `param`, read from and written to the address (&tab=map) so a link can open on it. A first visit opens tab 1.
//  - SxFold: a closed row with its title, one line and Show.
// Styles: styles/sector-pages.css (sx-). Describes, never advises.
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { foldAnchor, revealAndScroll } from "../../PhoneFold";

export type NavStop = { id: string; label: string };
export function SxNav({ items }: { items: NavStop[] }) {
  const [on, setOn] = useState<string | null>(null);
  const key = items.map((i) => i.id).join(",");
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      raf = 0;
      let cur: string | null = null;
      for (const it of items) { const e = foldAnchor(document.getElementById(it.id)); if (e && e.getBoundingClientRect().top <= 170) cur = it.id; }   // a closed phone section by its row
      setOn(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick); };
    pick();
    addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el instanceof HTMLDetailsElement && !el.open) el.open = true;          // a closed row opens when its name is pressed
    revealAndScroll(el, (x) => x.scrollIntoView?.({ behavior: "smooth", block: "start" }));   // a section closed on a phone opens first
    setOn(id);
  };
  return (
    <nav className="sx-nav" aria-label="On this page">
      <span className="sx-nav-k">On this page</span>
      <ol>{items.map((it, i) => (
        <Fragment key={it.id}>
          {i > 0 && <li className="sx-nav-ar" aria-hidden="true">→</li>}
          <li><a href={`#${it.id}`} className={on === it.id ? "on" : undefined} aria-current={on === it.id ? "location" : undefined} onClick={(e) => { e.preventDefault(); go(it.id); }}>
            <i aria-hidden="true">{i + 1}</i>{it.label}</a></li>
        </Fragment>))}</ol>
    </nav>
  );
}

export type BoxTab = { key: string; label: string; isNew?: boolean; content: ReactNode };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window: not remembered */ } };

export function SxBox({ id, label, sub, tabs, param, store }: { id: string; label: string; sub: string; tabs: BoxTab[]; param?: string; store: string }) {
  const [params, setParams] = useSearchParams();
  const keys = tabs.map((t) => t.key);
  const asked = param ? params.get(param) : null, saved = read(store);
  const initial = asked && keys.includes(asked) ? asked : saved && keys.includes(saved) ? saved : keys[0];
  const [open, setOpen] = useState(initial);
  const cur = keys.includes(open) ? open : keys[0];
  const [seen, setSeen] = useState<Set<string>>(() => new Set([cur]));
  useEffect(() => { if (asked && keys.includes(asked) && asked !== open) { setOpen(asked); setSeen((s) => new Set(s).add(asked)); } }, [asked]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (k: string) => {
    setOpen(k); setSeen((s) => new Set(s).add(k)); write(store, k);
    if (param) { const p = new URLSearchParams(params); if (k === keys[0]) p.delete(param); else p.set(param, k); setParams(p, { replace: true }); }
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const j = e.key === "ArrowRight" ? (i + 1) % keys.length : e.key === "ArrowLeft" ? (i - 1 + keys.length) % keys.length : -1;
    if (j < 0) return;
    e.preventDefault(); pick(keys[j]); document.getElementById(`${id}-t-${keys[j]}`)?.focus();
  };
  return (
    <div className="sx-box" id={id} data-box={id}>
      <div className="sx-bar" role="tablist" aria-label={label}>
        <span className="sx-bar-ic" aria-hidden="true">⇆</span>
        <span className="sx-bar-k">{label}<small>{sub}</small></span>
        {tabs.map((t, i) => <button key={t.key} id={`${id}-t-${t.key}`} type="button" role="tab" aria-selected={cur === t.key} aria-controls={`${id}-p-${t.key}`} tabIndex={cur === t.key ? 0 : -1}
          className={cur === t.key ? "on" : undefined} onClick={() => pick(t.key)} onKeyDown={(e) => onKey(e, i)}><i>{i + 1}</i>{t.label}{t.isNew && <span className="n"> new</span>}</button>)}
      </div>
      {tabs.map((t) => (seen.has(t.key) || cur === t.key) && (
        <div key={t.key} id={`${id}-p-${t.key}`} className="sx-pane" role="tabpanel" aria-labelledby={`${id}-t-${t.key}`} hidden={cur !== t.key}>{t.content}</div>))}
    </div>
  );
}

/** A closed row: its title, one line and Show; pressing the name in the section bar opens it. */
export function SxFold({ id, title, line, children }: { id: string; title: string; line: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="sp-sec sp-fold sx-fold" id={id} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary><span><b className="sp-ft">{title}</b><small className="sx-fs">{line}</small></span><span className="sp-show">{open ? "Hide ▴" : "Show ▾"}</span></summary>
      {open && <div className="sx-in">{children}</div>}
    </details>
  );
}
