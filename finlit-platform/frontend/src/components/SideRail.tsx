// The side menu folded to an icon rail (the "FinLit final pages" design pack, 13 Nov 2026): one entry per group with its short name under the icon, the group of
// the current page highlighted, and the expand button on top. A group opens a small panel beside the rail with that group's pages, so every page stays one click away.
// Styles: styles/sidebar.css (side-rail). Used by components/AppShell.tsx on desktop only (a phone keeps the drawer).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router";
import { Icon } from "../lib/icons";

export type RailItem = { to: string; label: string; icon: string; end?: boolean; gold?: boolean; badge?: string };
export type RailGroup = { title: string; items: RailItem[] };

/** The short name and the icon of each group, exactly as the design pack draws them (20px, stroke 1.6). */
export const RAIL: Record<string, { short: string; icon: ReactNode }> = {
  "Overview": { short: "Overview", icon: <><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" /></> },
  "Find stocks": { short: "Find", icon: <><circle cx="9" cy="9" r="5.5" /><path d="M13 13l4 4" /></> },
  "Analyse a company": { short: "Company", icon: <path d="M4 16V9M10 16V4M16 16v-5" /> },
  "Investment calculators": { short: "Calculators", icon: <><rect x="4" y="3" width="12" height="14" rx="2" /><path d="M7 7h6M7 11h1M10 11h1M13 11h0M7 14h1M10 14h1" /></> },
  "Charts": { short: "Charts", icon: <path d="M3 15l4-5 3 3 6-7" /> },
  "Markets": { short: "Markets", icon: <path d="M2 10h4l2-5 4 10 2-5h4" /> },
  "News & events": { short: "News", icon: <><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></> },
  "Funds": { short: "Funds", icon: <><path d="M10 3a7 7 0 1 0 7 7h-7z" /><path d="M12 2.5A6 6 0 0 1 17.5 8H12z" /></> },
  "Your workspace": { short: "Workspace", icon: <><rect x="3" y="6" width="14" height="11" rx="2" /><path d="M7 6V4h6v2" /></> },
  "Gold dashboards": { short: "Gold", icon: <path d="M10 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.3l5-.7z" /> },
  "Learn": { short: "Learn", icon: <path d="M3 5h5a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H3zM17 5h-5a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h5z" /> },
  "Account": { short: "Account", icon: <><circle cx="10" cy="7" r="3.2" /><path d="M4 17c1-3.2 3.3-4.6 6-4.6s5 1.4 6 4.6" /></> },
};
const svg = (body: ReactNode) => <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{body}</svg>;
export const railShort = (title: string) => RAIL[title]?.short ?? title;

export function SideRail({ groups, here, onExpand }: { groups: RailGroup[]; here: (g: RailGroup) => boolean; onExpand: () => void }) {
  const { pathname } = useLocation();
  const [fly, setFly] = useState<{ title: string; top: number; left: number } | null>(null);
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
      <nav className="side-rail" aria-label="Workspace, collapsed" ref={nav}>
        <button type="button" className="side-rail-x" onClick={onExpand} aria-label="Expand the side menu" title="Expand">{svg(<><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></>)}</button>
        {groups.map((g) => {
          const on = here(g), r = RAIL[g.title];
          return (
            <button key={g.title} type="button" data-group={g.title} ref={(el) => { btns.current[g.title] = el; }} className={"side-rail-g" + (on ? " on" : "")} aria-label={g.title} aria-haspopup="true" aria-expanded={fly?.title === g.title}
              aria-current={on ? "true" : undefined}
              onClick={(e) => { const r0 = e.currentTarget.getBoundingClientRect(), rail = nav.current?.getBoundingClientRect(); setFly((f) => (f?.title === g.title ? null : { title: g.title, top: r0.top, left: (rail?.right ?? r0.right) + 12 })); }}>
              {r ? svg(r.icon) : <Icon name="grid" />}<span>{railShort(g.title)}</span>
            </button>);
        })}
      </nav>
      {open && fly && createPortal(
        <div className="side-fly" ref={box} role="dialog" aria-label={open.title} style={{ top: Math.max(84, Math.min(fly.top - 8, innerHeight - 60 - open.items.length * 44)), left: fly.left }}>
          <p className="side-fly-t">{open.title}</p>
          {open.items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end ?? false} className={({ isActive }) => "side-fly-i" + (isActive ? " on" : "")}>
              <Icon name={i.icon} /><span>{i.label}</span>{i.gold && <em className="gtag" title="Gold plan" aria-label="Gold plan">Gold</em>}{i.badge && <b className="side-b">{i.badge}</b>}
            </NavLink>))}
        </div>, document.body)}
    </>
  );
}
