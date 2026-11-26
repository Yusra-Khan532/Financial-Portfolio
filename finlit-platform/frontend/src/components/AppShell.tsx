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
import { isBool, loadUi, removeUi, saveUi } from "../lib/persist";
import { useMarkShell } from "../lib/shellPresence";
import { HelpActions } from "./PageFeedback";
import { SideRail } from "./SideRail";
import { SheetTools } from "./SheetTools";
import { hasLab } from "../lib/lab";

/** Task #310 part D: the menu is on screen from 860px (below it, a sheet); from 860 to 1100px it starts as the rail. */
export const DESKTOP_Q = "(min-width: 861px)", NARROW_Q = "(max-width: 1099px)";

type Item = { to: string; label: string; icon: string; badge?: string; end?: boolean; gold?: boolean; sub?: boolean; fresh?: boolean; desc?: string };
type Group = { id: string; title: string; line: string; short: string; icon: string; items: Item[] };

/** The "i" beside a menu row (task #285; group headings and the Dashboard since the #282 rework): opens its note under the row, one note in the menu at a
 *  time; a second click or Escape closes it and focus stays on the i. It never opens or closes a group. */
function InfoButton({ k, label, target, info, setInfo, title }: { k: string; label: string; target: string; info: string | null; setInfo: (f: (v: string | null) => string | null) => void; title: string }) {
  const shows = info === k;
  return <button type="button" className="side-info" aria-label={label} aria-expanded={shows} aria-controls={target} title={title}
    onClick={(e) => { e.stopPropagation(); setInfo((v) => (v === k ? null : k)); }}
    onKeyDown={(e) => { if (e.key === "Escape" && shows) { e.stopPropagation(); setInfo(() => null); } }}>i</button>;
}

/** The left rail for every product page: where you are, what you follow, and what else the platform offers, in the order people use it. */
export function AppShell() {
  const { pathname } = useLocation();
  const { user, isAdmin, features } = useAuth();
  const { plan } = useUI();
  const gold = useIsGold();
  const wl = useWatchlist();
  const saved = useSavedScreens();
  const held = usePortfolio().holdings.length;
  const { unread } = useNotices();
  const live = useAlerts().alerts.filter((a) => a.status === "active").length;
  useMarkShell();   // task #310 part D: the top bar drops the destinations this menu lists
  // Task #310 part D (04-navigation.md): the menu looks the same on every tool page, in two states only, open or the icon rail. The reader's choice is
  // remembered once and applies to every page (one setting; the old separate one for the Find stocks pages, "side-collapsed-find", is no longer read).
  // Folded to the icon rail by default (the "FinLit final pages" design pack, 13 Nov 2026).
  const [collapsedAll, setCollapsedAll] = useState(() => loadUi("side-collapsed", 1, isBool, true));
  useEffect(() => { removeUi("side-collapsed-find"); }, []);
  // Under 1100px wide it starts as the rail on each page (opening it there lasts for that page and does not change the saved choice); under 860px it is
  // not shown and the phone bottom bar's Menu opens it as a sheet. Only one of the rail and the drawer is ever in the page.
  const mq = (q: string, dflt: boolean) => (typeof matchMedia === "undefined" ? dflt : matchMedia(q).matches);
  const [desktop, setDesktop] = useState(() => mq(DESKTOP_Q, true));
  const [narrow, setNarrow] = useState(() => mq(NARROW_Q, false));
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const d = matchMedia(DESKTOP_Q), n = matchMedia(NARROW_Q), f = () => { setDesktop(d.matches); setNarrow(n.matches); };
    d.addEventListener?.("change", f); n.addEventListener?.("change", f);
    return () => { d.removeEventListener?.("change", f); n.removeEventListener?.("change", f); };
  }, []);
  const [narrowOpen, setNarrowOpen] = useState(false);
  useEffect(() => { setNarrowOpen(false); }, [pathname, narrow]);
  const collapsed = narrow ? !narrowOpen : collapsedAll;
  const setCollapsed = (v: boolean) => (narrow ? setNarrowOpen(!v) : setCollapsedAll(v));
  const [open, setOpen] = useState(false); // phone sheet
  const [help, setHelp] = useState(false); // the foot's Help and feedback
  useEffect(() => { setOpen(false); setHelp(false); }, [pathname]);
  useEffect(() => { const o = () => setOpen((v) => !v); addEventListener("finlit:open-side", o); return () => removeEventListener("finlit:open-side", o); }, []);
  useEffect(() => { saveUi("side-collapsed", 1, collapsedAll); }, [collapsedAll]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [open]);
  // Each group is a drop-down: a header you click to show or hide its pages. The group holding the current page is always open;
  // what you opened or closed by hand is remembered.
  // Task #282 rework (the slim side menu file, 21 Nov): one group open at a time. The group holding the page is opened on arrival; otherwise the group
  // the member opened last (one key, "side-open"; the old per-group "side-groups" choices are no longer read). Find stocks on a first visit.
  const [openId, setOpenId] = useState<string>(() => loadUi("side-open", 1, (d: unknown) => (typeof d === "string" ? d : null), "find"));
  const toggleGroup = (id: string, isOpen: boolean) => { const n = isOpen ? id : ""; setOpenId(n); saveUi("side-open", 1, n); };
  // "Find a page": filters the links by name and opens the groups that match (Ctrl+/ focuses it).
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  // Task #285: every page row has an "i" button that opens the page's one-line description under it (one open at a time; Escape or a second click closes it).
  const [info, setInfo] = useState<string | null>(null);     // the one note open: a page ("/screener"), a group ("g:find") or the Dashboard ("dash")
  useEffect(() => { setInfo(null); }, [pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "/") return;
      e.preventDefault();
      if (collapsed && matchMedia(DESKTOP_Q).matches) setCollapsed(false);
      setOpen(true);
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [collapsed]);
  const showTip = (el: HTMLElement, label: string) => {
    if (!collapsed || !matchMedia(DESKTOP_Q).matches) return;
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
  const toItem = (n: NavItem): Item => ({ to: n.to, label: n.label, icon: n.icon, end: n.end, gold: n.gold, badge: badges[n.to], fresh: isNew(n), desc: n.sub });
  // task #282: one list (lib/nav MENU) for the side menu, the rail, the pop-outs, the top bar and Find a page; Dashboard sits above the groups
  const dash: Item = toItem(DASHBOARD);
  const groups: Group[] = ([
    ...MENU.map((g) => ({ id: g.id, title: g.title, line: g.line, short: g.short, icon: g.icon, items: g.items.map(toItem) })),
    ...(user ? [{ id: "account", title: "Account", line: "Your profile, appearance and plan", short: "Account", icon: "users", items: [
      { to: "/account", label: "Profile & security", icon: "users", end: true, desc: "Your name, email, password and sign-in" },
      { to: "/account/appearance", label: "Appearance", icon: "spark", desc: "Light or dark theme, text size and how pages are laid out" },
      ...(DEMO ? [] : [{ to: "/account/plan", label: "Plan", icon: "crown", desc: "Your plan and what each plan includes" }]),
      ...(hasLab(features) ? [{ to: "/lab", label: "Trading Lab", icon: "activity", desc: "Research tools for NSE traders, open by invitation" }] : []),   // only members an administrator named (and administrators)
      ...(isAdmin ? [{ to: "/console", label: "Admin console", icon: "lock", desc: "Team tools: members, jobs and data checks" }] : []),
    ] }] : []),
  ] as Group[]).map((g) => ({ ...g, items: g.items.filter(offeredTo(gold)) }));   // task #100: pages not offered to Gold (none since task #283)
  const navOf = new Map(MENU.flatMap((g) => g.items.map((n) => [n.to, n] as const)));

  // task #310 part D: the company report (/stocks/…) is in the left menu now; it belongs to "Company report" (/research) in Analyse a company
  const reportOf = (to: string) => to === "/research" && pathname.startsWith("/stocks/");
  const here = (g: Group) => g.items.some((i) => reportOf(i.to) || (i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(i.to + "/")));
  // open when the page you are on is inside it, otherwise what you chose; the one-page Overview group and the first visit start open for Find stocks
  // remembered by the group's id (task #282: find, company, markets, funds and learn keep their ids; the renamed groups start as on a first visit)
  // the page's own group opens on arrival (and becomes the remembered one); after that the member's choice rules, one group at a time
  const homeGroup = groups.find(here)?.id;
  useEffect(() => { if (homeGroup) { setOpenId(homeGroup); saveUi("side-open", 1, homeGroup); } }, [pathname, homeGroup]);
  useEffect(() => { if (q) setInfo(null); }, [q]);   // typing in Find a page closes an open note
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
          {dashShown && <><div className={"side-row has-info side-dash-row" + (info === "dash" ? " is-info" : "")}>
            <NavLink to={dash.to} end className={({ isActive }) => "side-i side-dash" + (isActive ? " on" : "")}>
              <span className="side-ic"><Icon name="grid" /></span><span className="side-l"><span className="side-lt">{dash.label}</span></span></NavLink>
            <InfoButton k="dash" label="What is on the Dashboard" target="side-dash-d" info={info} setInfo={setInfo} title={DASHBOARD.sub} />
          </div>
          <p className="side-desc" id="side-dash-d" role="note" hidden={info !== "dash"}>{DASHBOARD.sub}</p></>}
          {shown.map(({ g, items }) => {
            if (q && !items.length) return null;
            // while Find a page has text, every group with a match is open (one at a time is paused); clearing it returns to the one open before
            const gid = "sg-" + g.id, isOpen = q ? items.length > 0 : openId === g.id, holds = here(g), nk = "g:" + g.id;
            return (
            <div className={"side-g" + (isOpen ? " is-open" : "") + (holds ? " has-here" : "")} key={g.id} data-group={g.id}>
              <div className={"side-row" + (g.line ? " has-info" : "") + (info === nk ? " is-info" : "")}>
                <button type="button" className="side-gt side-gb" aria-expanded={isOpen} aria-controls={gid} onClick={() => toggleGroup(g.id, !isOpen)}>
                  <span className="side-gbd" aria-hidden="true"><Icon name={g.icon} /></span><span className="side-gname">{g.title}</span><svg className="side-gc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
                </button>
                {g.line && <InfoButton k={nk} label={`What is in ${g.title}`} target={gid + "-d"} info={info} setInfo={setInfo} title={g.line} />}
              </div>
              {g.line && <p className="side-desc" id={gid + "-d"} role="note" hidden={info !== nk}>{g.line}</p>}
              <div id={gid} className="side-gi" role="region" aria-label={g.title} inert={!isOpen && !collapsed}>
              <div className="side-gin">
              {items.map((i) => {
                const did = "sd-" + i.to.replace(/[^a-z0-9]+/gi, "-"), shows = info === i.to;
                return (
                <div key={i.to} className={"side-row" + (i.desc ? " has-info" : "") + (shows ? " is-info" : "")}>
                {(() => {
                  const cls = (on: boolean) => "side-i" + (i.sub ? " sub" : "") + (on ? " on" : "");
                  const common = { "aria-label": collapsed ? i.label : undefined, onMouseEnter: (e: React.MouseEvent<HTMLAnchorElement>) => showTip(e.currentTarget, i.label), onFocus: (e: React.FocusEvent<HTMLAnchorElement>) => showTip(e.currentTarget, i.label), onMouseLeave: () => setTip(null), onBlur: () => setTip(null) };
                  const body = <><span className="side-ic"><Icon name={i.icon} /></span><span className="side-l"><span className="side-lt">{i.label}</span>{i.gold && <em className="gtag" title="Gold plan" aria-label="Gold plan">Gold</em>}{i.fresh && <em className="side-new" title="A new page">New</em>}</span>{i.badge && <span className="side-b">{i.badge}</span>}</>;
                  // task #310 part D: on a company report, "Company report" is the current page (a NavLink would not mark it: its address is /research)
                  return reportOf(i.to) ? <Link to={i.to} className={cls(true)} aria-current="page" {...common}>{body}</Link>
                    : <NavLink to={i.to} end={i.end ?? false} className={({ isActive }) => cls(isActive)} {...common}>{body}</NavLink>;
                })()}
                {i.desc && <InfoButton k={i.to} label={`About ${i.label}`} target={did} info={info} setInfo={setInfo} title={i.desc} />}
                {shows && <p id={did} className="side-desc" role="note">{i.desc}</p>}
                </div>);
              })}
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
          {/* task #310 part D: Help and feedback at the foot of the menu (the floating dock is gone) */}
          <div className={"side-help" + (help ? " is-open" : "")}>
            <button type="button" className="side-help-b" aria-expanded={help} aria-controls="side-help-a" onClick={() => setHelp((v) => !v)}>
              <span className="side-ic"><Icon name="info" /></span><span className="side-l"><span className="side-lt">Help and feedback</span></span>
              <svg className="side-gc" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
            </button>
            <div id="side-help-a" className="side-help-a" hidden={!help}><HelpActions className="side-help-i" /></div>
          </div>
          {/* task #310 part E: under 860px the theme switch and the system controls are here, not in the header */}
          <SheetTools className="side-tools" />
        </div>
        </div>
        </>}
      </aside>
      {tip && <div className="side-tip" role="presentation" style={{ top: tip.top, left: tip.left }}>{tip.label}</div>}
      <div className="shell-main"><Outlet /></div>
    </div>
  );
}
