// Task #448 (Sector Pulse, developer file 42, 01 §3; shared with Sector Rotation, file 43): the round ⋯ button after Find. Its menu holds the reference blocks that
// used to sit on the page (How to read and use this page, What the labels mean, Which stocks are counted / Too small for a reading, Words on this page); an item
// opens the block itself over the page, with a dimmed backdrop and a ×. Focus stays inside the panel, × / the backdrop / Esc close it and focus goes back to the
// button that opened it; the page behind does not scroll meanwhile. Styles: styles/pulse448.css (sx-more, sx-panel).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type MoreItem = { key: string; label: string; content: ReactNode };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** The panel: the block over the page, role dialog (aria-modal), focus kept inside, closed by ×, the backdrop or Esc. */
export function RefPanel({ title, onClose, children, back }: { title: string; onClose: () => void; children: ReactNode; back?: HTMLElement | null }) {
  const box = useRef<HTMLDivElement>(null), id = "sx-panel-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";                                   // the page behind does not scroll
    const first = box.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    addEventListener("keydown", key);
    return () => { removeEventListener("keydown", key); document.body.style.overflow = prev; back?.focus(); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="sx-panel-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="sx-panel sx sp sx-new" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className="sx-panel-h"><h2 id={id}>{title}</h2><button type="button" className="sx-x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="sx-panel-b">{children}</div>
      </div>
    </div>, document.body);
}

/** The ⋯ button and its menu (role="menu"). `open` lets another part of the page open an item (the first-visit line opens "What the labels mean"). */
export function MoreMenu({ items, ask, onAsked }: { items: MoreItem[]; ask?: string | null; onAsked?: () => void }) {
  const [menu, setMenu] = useState(false), [cur, setCur] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null), backTo = useRef<HTMLElement | null>(null);
  const id = "sx-more-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useEffect(() => { if (ask && items.some((i) => i.key === ask)) { backTo.current = document.activeElement as HTMLElement; setCur(ask); onAsked?.(); } }, [ask]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!menu) return;
    list.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !list.current?.contains(t)) setMenu(false); };
    addEventListener("mousedown", away);
    return () => removeEventListener("mousedown", away);
  }, [menu]);
  const onKey = (e: React.KeyboardEvent) => {
    const f = [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])], i = f.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); setMenu(false); btn.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); f[(i + 1) % f.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); f[(i - 1 + f.length) % f.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); f[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); f[f.length - 1]?.focus(); }
    else if (e.key === "Tab") setMenu(false);
  };
  const item = items.find((i) => i.key === cur);
  return (
    <div className="sx-more">
      <button type="button" ref={btn} className="sx-more-b" aria-haspopup="menu" aria-expanded={menu} aria-controls={id}
        aria-label={`More on this page: ${items.map((i) => i.label).join(", ")}`} title="More on this page" onClick={() => setMenu((v) => !v)}>⋯</button>
      {menu && <ul ref={list} id={id} className="sx-more-l" role="menu" aria-label="More on this page" onKeyDown={onKey}>
        {items.map((i) => <li key={i.key} role="none"><button type="button" role="menuitem" onClick={() => { backTo.current = btn.current; setMenu(false); setCur(i.key); }}>{i.label}</button></li>)}
      </ul>}
      {item && <RefPanel title={item.label} onClose={() => setCur(null)} back={backTo.current ?? btn.current}>{item.content}</RefPanel>}
    </div>
  );
}
