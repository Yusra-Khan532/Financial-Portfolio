// Hide / Show on an optional panel (the 9 Nov 2026 pages update): a helpful extra, never the page's main table, the user's own shares or an alert. Hidden, the panel shrinks to one row: its title,
// a "Hidden" tag and a Show button, and it stays hidden on the next visit until Show is clicked. The choice is kept per panel in this browser (the dashboard does the same, dashboard/parts.tsx).
import { useState, type ReactNode } from "react";
import "../styles/hideable.css";

const key = (id: string) => `finlit.hide.${id}`;
const read = (id: string) => { try { return localStorage.getItem(key(id)) === "1"; } catch { return false; } };

export function useHideable(id: string): [boolean, (v: boolean) => void] {
  const [hidden, set] = useState(() => read(id));
  return [hidden, (v) => { set(v); try { localStorage.setItem(key(id), v ? "1" : "0"); } catch { /* private window: lasts for this visit */ } }];
}

export function Hideable({ id, title, children, className = "" }: { id: string; title: string; children: ReactNode; className?: string }) {
  const [hidden, setHidden] = useHideable(id);
  if (hidden) {
    return (
      <section className={"hz hz-off " + className} aria-label={title}>
        <span className="hz-t">{title}</span><span className="hz-tag">Hidden</span>
        <button type="button" className="hz-btn" aria-expanded="false" aria-label={`Show: ${title}`} onClick={() => setHidden(false)}>Show</button>
      </section>);
  }
  return (
    <div className={"hz " + className}>
      {children}
      <button type="button" className="hz-btn hz-on" aria-expanded="true" aria-label={`Hide: ${title}`} onClick={() => setHidden(true)}>
        {/* the eye with a line through it, as the "FinLit final pages" pack draws Hide on every page (13 Nov 2026) */}
        <svg className="hz-ic" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 3l14 14M8.6 5.2A8 8 0 0 1 10 5c4 0 6.8 3.2 7.8 5-.4.8-1.2 1.9-2.3 2.9M12.8 12.9A4 4 0 0 1 7.1 7.2M5.2 6.6C3.9 7.6 3 8.9 2.2 10c1 1.8 3.8 5 7.8 5 1 0 1.9-.2 2.7-.5" /></svg>Hide</button>
    </div>);
}
