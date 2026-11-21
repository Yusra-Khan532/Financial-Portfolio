import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyEvent } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Icon } from "../lib/icons";
import { useAuth } from "../lib/auth";
import { TIER, useUI } from "../lib/ui";
import { useSavedScreens } from "../lib/screens";
import { useWatchlist } from "../lib/watchlist";
import { usePortfolio } from "../lib/portfolio";
import { DEMO } from "../lib/demo";
import { useAlerts, useNotices } from "../lib/alerts";
import { DASHBOARD, MENU, isNew, menuMatch, offeredTo, type NavItem } from "../lib/nav";
import { useIsGold } from "../lib/planGate";
import { isBool, isBoolMap, loadUi, saveUi } from "../lib/persist";
import { SideRail } from "./SideRail";

type Item = { to: string; label: string; icon: string; badge?: string; end?: boolean; gold?: boolean; sub?: boolean; fresh?: boolean };
type Group = { id: string; title: string; line: string; short: string; icon: string; items: Item[] };

/** The left rail for every product page: where you are, what you follow, and what else the platform offers, in the order people use it. */
export function AppShell() {
  const { pathname } = useLocation();
  const { user, isAdmin } = useAuth();
  const { plan } = useUI();
  const gold = useIsGold();
  const wl = useWatchlist();
  const saved = useSavedScreens();
  const held = usePortfolio().holdings.length;
  const { unread } = useNotices();
  const live = useAlerts().alerts.filter((a) => a.status === "active").length;
  // The Find stocks pages (the screeners and the query builder) fold the menu to the icon rail so the table gets the room; every other page keeps the reader's own choice.
  // The choice made on those pages is remembered on its own, so folding or opening it there never changes the menu elsewhere.
  const onFind = /^\/(screener|advanced-score-screener|query-builder)(\/|$)/.test(pathname);
  // Folded to the icon rail by default on every page (the "FinLit final pages" design pack, 13 Nov 2026); the reader's own choice is remembered.
  const [collapsedAll, setCollapsedAll] = useState(() => loadUi("side-collapsed", 1, isBool, true));
  const [collapsedFind, setCollapsedFind] = useState(() => loadUi("side-collapsed-find", 1, isBool, true));
  const collapsed = onFind ? collapsedFind : collapsedAll, setCollapsed = onFind ? setCollapsedFind : setCollapsedAll;
  const [open, setOpen] = useState(false); // mobile drawer
  // The rail is a desktop view: a phone or a narrow window always gets the full menu in its drawer. Only one of the two is ever in the page.
  const wide = () => (typeof matchMedia === "undefined" ? true : matchMedia("(min-width: 961px)").matches);
  const [desktop, setDesktop] = useState(wide);
  useEffect(() => { if (typeof matchMedia === "undefined") return; const m = matchMedia("(min-width: 961px)"), f = () => setDesktop(m.matches); m.addEventListener?.("change", f); return () => m.removeEventListener?.("change", f); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { const o = () => setOpen((v) => !v); addEventListener("finlit:open-side", o); return () => removeEventListener("finlit:open-side", o); }, []);
  useEffect(() => { saveUi("side-collapsed", 1, collapsedAll); }, [collapsedAll]);
  useEffect(() => { saveUi("side-collapsed-find", 1, collapsedFind); }, [collapsedFind]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [open]);
  // Each group is a drop-down: a header you click to show or hide its pages. The group holding the current page is always open;
  // what you opened or closed by hand is remembered.
  const [folded, setFolded] = useState<Record<string, boolean>>(() => loadUi("side-groups", 1, isBoolMap, {}));
  const toggleGroup = (id: string, isOpen: boolean) => setFolded((f) => { const n = { ...f, [id]: isOpen }; saveUi("side-groups", 1, n); return n; });
  // "Find a page": filters the links by name and opens the groups that match (Ctrl+/ focuses it).
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "/") return;
      e.preventDefault();
      if (collapsed && matchMedia("(min-width: 961px)").matches) setCollapsed(false);
      setOpen(true);
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [collapsed]);
  const showTip = (el: HTMLElement, label: string) => {
    if (!collapsed || !matchMedia("(min-width: 961px)").matches) return;
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const followed = new Set(wl.lists.flatMap((l) => l.symbols)).size;

  // The rail follows the site map (lib/nav.ts): the same five headings and groups as the header, plus the extras and the account.
  const badges: Record<string, string | undefined> = {
    "/screener": saved.length ? String(saved.length) : undefined, "/watchlist": followed ? String(followed) : undefined, "/holdings": held ? String(held) : undefined,
    "/alerts": unread ? `${unread} new` : live ? String(live) : undefined,
    "/my-investments": "NEW",   // task #137: a new page
  };
  const toItem = (n: NavItem): Item => ({ to: n.to, label: n.label, icon: n.icon, end: n.end, gold: n.gold, badge: badges[n.to], fresh: isNew(n) });
  // task #282: one list (lib/nav MENU) for the side menu, the rail, the pop-outs, the top bar and Find a page; Dashboard sits above the groups
  const dash: Item = toItem(DASHBOARD);
  const groups: Group[] = ([
    ...MENU.map((g) => ({ id: g.id, title: g.title, line: g.line, short: g.short, icon: g.icon, items: g.items.map(toItem) })),
    ...(user ? [{ id: "account", title: "Account", line: "Your profile, appearance and plan", short: "Account", icon: "users", items: [
      { to: "/account", label: "Profile & security", icon: "users", end: true },
      { to: "/account/appearance", label: "Appearance", icon: "spark" },
      ...(DEMO ? [] : [{ to: "/account/plan", label: "Plan", icon: "crown" }]),
      ...(isAdmin ? [{ to: "/console", label: "Admin console", icon: "lock" }] : []),
    ] }] : []),
  ] as Group[]).map((g) => ({ ...g, items: g.items.filter(offeredTo(gold)) }));   // task #100: pages not offered to Gold (none since task #283)
  const navOf = new Map(MENU.flatMap((g) => g.items.map((n) => [n.to, n] as const)));

  const here = (g: Group) => g.items.some((i) => (i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(i.to + "/")));
  // open when the page you are on is inside it, otherwise what you chose; the one-page Overview group and the first visit start open for Find stocks
  // remembered by the group's id (task #282: find, company, markets, funds and learn keep their ids; the renamed groups start as on a first visit)
  const groupOpen = (g: Group) => here(g) || folded[g.id] === true || (folded[g.id] === undefined && g.id === "find");
  // Find a page (task #282): the page's name, its one line, its group's heading, and short aliases ("inflation" finds India economy)
  const shown = useMemo(() => groups.map((g) => ({ g, items: !q ? g.items : g.items.filter((i) => menuMatch(q, navOf.get(i.to) ?? { to: i.to, label: i.label, sub: "", icon: i.icon, gold: i.gold }, g)) })), [groups, q]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dashShown = !q || menuMatch(q, DASHBOARD);
  const hits = shown.reduce((n, x) => n + x.items.length, 0) + (q && dashShown ? 1 : 0);
  // Arrow keys walk the visible group headers and links; Home/End jump to the ends; ArrowUp from the first row returns to the search box.
  const onNavKey = (e: RKeyEvent<HTMLElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>(".side-gb, .side-i")].filter((el) => !el.closest("[inert]") && getComputedStyle(el).display !== "none");
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const to = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : e.key === "ArrowDown" ? Math.min(at + 1, rows.length - 1) : at - 1;
    if (to < 0) searchRef.current?.focus(); else rows[to].focus();
  };
  return (
    <div className={"shell" + (collapsed ? " is-collapsed" : "") + (open ? " is-open" : "")}>
      <button className="shell-fab" onClick={() => setOpen(true)} aria-label="Open the product menu" aria-expanded={open}><Icon name="panel" /><span>Menu</span></button>
      {open && <div className="shell-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className="side" aria-label="Product navigation">
        {collapsed && desktop ? <SideRail groups={groups} dash={{ to: dash.to, label: dash.label, line: DASHBOARD.sub }} here={here} onExpand={() => setCollapsed(false)} /> : <>
        <div className={"side-top" + (scrolled ? " is-scrolled" : "")}>
          <span className="side-t"><span className="side-tb" aria-hidden="true"><Icon name="grid" /></span><span className="side-tt">All pages</span></span>
          <button className="side-toggle hide-sm" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand the side menu" : "Collapse the side menu"} aria-pressed={collapsed} title={collapsed ? "Expand" : "Collapse"}><Icon name="panel" /></button>
          <button className="side-toggle show-sm" onClick={() => setOpen(false)} aria-label="Close the product menu">✕</button>
          <div className="side-find">
            <Icon name="search" />
            <input ref={searchRef} type="search" value={query} placeholder="Find a page" aria-label="Find a page" autoComplete="off" spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); }
                else if (e.key === "ArrowDown") { e.preventDefault(); bodyRef.current?.querySelector<HTMLElement>(".side-i, .side-gb")?.focus(); }
              }} />
            {query ? <button type="button" className="side-clear" aria-label="Clear the search" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>✕</button> : <kbd aria-hidden="true">Ctrl /</kbd>}
          </div>
        </div>
        <div className="side-body" ref={bodyRef} onScroll={(e) => { const v = e.currentTarget.scrollTop > 2; if (v !== scrolled) setScrolled(v); setTip(null); }}>
        <nav onKeyDown={onNavKey}>
          {q && hits === 0 && <p className="side-none" role="status">No page matches “{query.trim()}”.</p>}
          {dashShown && <NavLink to={dash.to} end className={({ isActive }) => "side-i side-dash" + (isActive ? " on" : "")}>
            <span className="side-ic"><Icon name="grid" /></span><span className="side-l side-l2"><span className="side-lt">{dash.label}</span><span className="side-ls">{DASHBOARD.sub}</span></span></NavLink>}
          {shown.map(({ g, items }) => {
            if (q && !items.length) return null;
            const gid = "sg-" + g.id, isOpen = !!q || groupOpen(g), holds = here(g);
            return (
            <div className={"side-g" + (isOpen ? " is-open" : "") + (holds ? " has-here" : "")} key={g.id} data-group={g.id}>
              <button type="button" className="side-gt side-gb" aria-expanded={isOpen} aria-controls={gid} onClick={() => toggleGroup(g.id, !isOpen)}>
                <span className="side-gbd" aria-hidden="true"><Icon name={g.icon} /></span><span className="side-gw"><span className="side-gname">{g.title}</span><span className="side-gs">{g.line}</span></span><span className="side-gn" aria-label={g.items.length + (g.items.length === 1 ? " page" : " pages")}>{g.items.length}</span><svg className="side-gc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
              </button>
              <div id={gid} className="side-gi" role="region" aria-label={g.title} inert={!isOpen && !collapsed}>
              <div className="side-gin">
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end ?? false} className={({ isActive }) => "side-i" + (i.sub ? " sub" : "") + (isActive ? " on" : "")} aria-label={collapsed ? i.label : undefined}
                  onMouseEnter={(e) => showTip(e.currentTarget, i.label)} onFocus={(e) => showTip(e.currentTarget, i.label)} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}>
                  <span className="side-ic"><Icon name={i.icon} /></span><span className="side-l"><span className="side-lt">{i.label}</span>{i.gold && <em className="gtag" title="Gold plan" aria-label="Gold plan">Gold</em>}{i.fresh && <em className="side-new" title="A new page">New</em>}</span>{i.badge && <span className="side-b">{i.badge}</span>}
                </NavLink>
              ))}
              </div>
              </div>
            </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="side-plan" style={{ "--tc": `var(${TIER[plan].tc})` } as React.CSSProperties}>
            <span className={"tier " + plan}><Icon name={TIER[plan].ic} />{TIER[plan].n}</span>
            {plan !== "gold" ? <><p>{plan === "basic" ? "Unlock watchlists, the full screener and more." : "Gold adds FinLit Prism and deeper analysis."}</p><Link className="btn primary" to={user ? "/account/plan?want=" + (plan === "basic" ? "silver" : "gold") : "/plans"}>{plan === "basic" ? "See Silver" : "See Gold"}</Link></> : <p>Everything is unlocked.</p>}
          </div>
        </div>
        </div>
        </>}
      </aside>
      {tip && <div className="side-tip" role="presentation" style={{ top: tip.top, left: tip.left }}>{tip.label}</div>}
      <div className="shell-main"><Outlet /></div>
    </div>
  );
}
