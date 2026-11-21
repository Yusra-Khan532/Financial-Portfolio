// The side menu folded to an icon rail (the "FinLit final pages" design pack, 13 Nov 2026): one entry per group with its short name under the icon, the group of
// the current page highlighted, and the expand button on top. A group opens a small panel beside the rail with that group's pages, so every page stays one click away.
// Styles: styles/sidebar.css (side-rail). Used by components/AppShell.tsx on desktop only (a phone keeps the drawer).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router";
import { Icon } from "../lib/icons";

export type RailItem = { to: string; label: string; icon: string; end?: boolean; gold?: boolean; badge?: string; desc?: string };
export type RailGroup = { id: string; title: string; line: string; short: string; icon: string; items: RailItem[] };

/** The icon of each group in the folded rail (20px, stroke 1.6), by group id (task #282 reuses the live icons: Portfolio takes "Your workspace"'s, Compare the
 *  "Charts" one; Apps is new, a browser window). */
export const RAIL_ICON: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" /></>,
  mine: <><rect x="3" y="6" width="14" height="11" rx="2" /><path d="M7 6V4h6v2" /></>,
  find: <><circle cx="9" cy="9" r="5.5" /><path d="M13 13l4 4" /></>,
  company: <path d="M4 16V9M10 16V4M16 16v-5" />,
  compare: <path d="M3 15l4-5 3 3 6-7" />,
  calc: <><rect x="4" y="3" width="12" height="14" rx="2" /><path d="M7 7h6M7 11h1M10 11h1M13 11h0M7 14h1M10 14h1" /></>,
  markets: <path d="M2 10h4l2-5 4 10 2-5h4" />,
  news: <><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></>,
  funds: <><path d="M10 3a7 7 0 1 0 7 7h-7z" /><path d="M12 2.5A6 6 0 0 1 17.5 8H12z" /></>,
  learn: <path d="M3 5h5a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H3zM17 5h-5a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h5z" />,
  apps: <><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M3 8h14M6 6h0M8 6h0" /></>,
  account: <><circle cx="10" cy="7" r="3.2" /><path d="M4 17c1-3.2 3.3-4.6 6-4.6s5 1.4 6 4.6" /></>,
};
const svg = (body: ReactNode) => <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{body}</svg>;

export function SideRail({ groups, dash, here, onExpand }: { groups: RailGroup[]; dash: { to: string; label: string; line: string }; here: (g: RailGroup) => boolean; onExpand: () => void }) {
  const { pathname } = useLocation();
  const [fly, setFly] = useState<{ title: string; top: number; left: number } | null>(null);
  const [info, setInfo] = useState<string | null>(null);   // task #285: the page whose "i" description is open in the pop-out
  useEffect(() => { setInfo(null); }, [fly?.title]);
  const box = useRef<HTMLDivElement>(null), nav = useRef<HTMLElement>(null), btns = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => { setFly(null); }, [pathname]);
  useEffect(() => {
    if (!fly) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { const t = fly.title; setFly(null); btns.current[t]?.focus(); } };
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !nav.current?.contains(t)) setFly(null); };
    addEventListener("keydown", key); addEventListener("mousedown", away);
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("a")?.focus());
    return () => { removeEventListener("keydown", key); removeEventListener("mousedown", away); };
  }, [fly]);
  const open = groups.find((g) => g.title === fly?.title);
  return (
    <>
      <nav className="side-rail" aria-label="All pages, collapsed" ref={nav}>
        <button type="button" className="side-rail-x" onClick={onExpand} aria-label="Expand the side menu" title="Expand">{svg(<><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></>)}</button>
        {/* task #282: Dashboard's icon opens the dashboard directly */}
        <NavLink to={dash.to} end className={({ isActive }) => "side-rail-g" + (isActive ? " on" : "")} aria-label={`${dash.label}: ${dash.line}`} title={`${dash.label}: ${dash.line}`} data-group="dashboard">
          {svg(RAIL_ICON.dashboard)}<span>{dash.label}</span></NavLink>
        {groups.map((g) => {
          const on = here(g), tipText = `${g.title}: ${g.line}`;
          return (
            <button key={g.id} type="button" data-group={g.id} ref={(el) => { btns.current[g.title] = el; }} className={"side-rail-g" + (on ? " on" : "")} aria-label={tipText} title={tipText} aria-haspopup="true" aria-expanded={fly?.title === g.title}
              aria-current={on ? "true" : undefined}
              onClick={(e) => { const r0 = e.currentTarget.getBoundingClientRect(), rail = nav.current?.getBoundingClientRect(); setFly((f) => (f?.title === g.title ? null : { title: g.title, top: r0.top, left: (rail?.right ?? r0.right) + 12 })); }}>
              {RAIL_ICON[g.id] ? svg(RAIL_ICON[g.id]) : <Icon name={g.icon} />}<span>{g.short}</span>
            </button>);
        })}
      </nav>
      {open && fly && createPortal(
        <div className="side-fly" ref={box} role="dialog" aria-label={open.title} style={{ top: Math.max(84, Math.min(fly.top - 8, innerHeight - 60 - open.items.length * 44)), left: fly.left }}>
          <p className="side-fly-t">{open.title}</p>
          <p className="side-fly-s">{open.line}</p>
          {open.items.map((i) => {
            const did = "fd-" + i.to.replace(/[^a-z0-9]+/gi, "-"), shows = info === i.to;
            return (
            <div key={i.to} className={"side-row" + (i.desc ? " has-info" : "") + (shows ? " is-info" : "")}>
            <NavLink to={i.to} end={i.end ?? false} className={({ isActive }) => "side-fly-i" + (isActive ? " on" : "")}>
              <Icon name={i.icon} /><span>{i.label}</span>{i.gold && <em className="gtag" title="Gold plan" aria-label="Gold plan">Gold</em>}{i.badge && <b className="side-b">{i.badge}</b>}
            </NavLink>
            {i.desc && <button type="button" className="side-info" aria-label={`About ${i.label}`} aria-expanded={shows} aria-controls={did} title={i.desc}
              onClick={() => setInfo((v) => (v === i.to ? null : i.to))}>i</button>}
            {shows && <p id={did} className="side-desc" role="note">{i.desc}</p>}
            </div>);
          })}
        </div>, document.body)}
    </>
  );
}
