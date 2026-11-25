// The phone app (docs/MOBILE-APP.md, owner 25 Nov 2026): the bottom tabs, the section chips of each tab, the Menu sheet and the floating Tools
// button. Everything here is drawn under 860px only (styles/mobile-app.css hides it above), so the desktop site is unchanged and "Desktop site" in a
// phone browser (which lays the page out about 980px wide) shows the desktop site by itself. Class prefix: ma-.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { Icon } from "../../lib/icons";
import { useAuth } from "../../lib/auth";
import { useUI } from "../../lib/ui";
import { useIsGold } from "../../lib/planGate";
import { DASHBOARD, MENU, MORE, PRICING, isNew, menuMatch, offeredTo } from "../../lib/nav";
import { HUBS, MOST_USED, chipFor, desktopSiteOn, freeAccountLine, setDesktopSite, tabFor, tabHome, toolsList, type TabId } from "../../lib/mobileNav";
import { OPEN_AI } from "../assistantEvents";
import { HelpActions } from "../PageFeedback";
import { SystemControl } from "../SystemControl";
import { DEMO } from "../../lib/demo";

export const OPEN_PHONE_MENU = "finlit:open-phone-menu";

export { useIsPhone as usePhone } from "../PhoneFold";

const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: works for this visit */ } },
};

/** The five tabs: Home, Markets, Discover, Portfolio, Menu. A tab is lit on every page of its group; the Menu tab opens the Menu sheet. */
export function MobileTabs() {
  const { pathname } = useLocation();
  const here = tabFor(pathname);
  const tabs: [TabId, string, string][] = [["home", "home", "Home"], ["markets", "activity", "Markets"], ["discover", "globe", "Discover"], ["folio", "wallet", "Portfolio"]];
  return (
    <nav className="ma-tabs" aria-label="Main">
      {tabs.map(([id, icon, label]) => {
        const to = tabHome(id), on = here === id;
        return <Link key={id} to={to} className={"ma-tab" + (on ? " on" : "")} aria-current={on ? "page" : undefined}><Icon name={icon} /><span>{label}</span></Link>;
      })}
      <button type="button" className="ma-tab" onClick={() => dispatchEvent(new Event(OPEN_PHONE_MENU))} aria-haspopup="dialog"><Icon name="list" /><span>Menu</span></button>
    </nav>
  );
}

/** The section chips at the top of a tab's pages (Markets: Today, Sectors, Rotation, IPOs…). The lit chip scrolls into view. */
export function HubChips() {
  const { pathname } = useLocation();
  const at = chipFor(pathname);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {   // the lit chip in the middle of its row (the row only; the page itself never moves)
    const r = row.current, el = r?.querySelector<HTMLElement>(".ma-chip.on");
    if (r && el) r.scrollLeft = Math.max(0, el.offsetLeft - (r.clientWidth - el.offsetWidth) / 2);
  }, [pathname]);
  if (!at) return null;
  const label = { markets: "Markets", discover: "Discover", folio: "Portfolio" }[at.tab];
  return (
    <nav className="ma-hub" aria-label={`${label} sections`}>
      <div className="ma-hub-row" ref={row}>
        {HUBS[at.tab].map((c) => {
          const on = c === at.chip;
          return <Link key={c.to} to={c.to} className={"ma-chip" + (on ? " on" : "")} aria-current={on ? "page" : undefined}>{c.label}</Link>;
        })}
      </div>
    </nav>
  );
}

/** A switch row inside the Menu sheet. */
function Switch({ on, label, sub, onClick, icon }: { on: boolean; label: string; sub?: string; onClick: () => void; icon: string }) {
  return <button type="button" className="ma-row" role="switch" aria-checked={on} onClick={onClick}>
    <span className="ma-ico"><Icon name={icon} /></span><span className="ma-rt"><b>{label}</b>{sub && <small>{sub}</small>}</span><span className={"ma-sw" + (on ? " on" : "")} aria-hidden="true" /></button>;
}

/** The Menu sheet: the account, the most used pages, every page by group (lib/nav.ts), the theme, the Tools button, help, and "Desktop site". */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { user, isAdmin, signOut } = useAuth();
  const { theme, toggleTheme, plan } = useUI();
  const gold = useIsGold();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const panel = useRef<HTMLDivElement>(null);
  const [fab, setFab] = useState(() => store.get("finlit.tools.button", true));
  const [find, setFind] = useState("");
  useEffect(() => { const o = () => setOpen((v) => !v); addEventListener(OPEN_PHONE_MENU, o); return () => removeEventListener(OPEN_PHONE_MENU, o); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { if (!open) setFind(""); }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", k);
    document.documentElement.classList.add("ma-locked");
    panel.current?.focus();
    return () => { removeEventListener("keydown", k); document.documentElement.classList.remove("ma-locked"); };
  }, [open]);
  if (!open) return null;
  const go = (to: string) => { setOpen(false); nav(to); };
  const flipFab = () => { const v = !fab; setFab(v); store.set("finlit.tools.button", v); dispatchEvent(new Event("finlit:tools-button")); };
  const all = [{ id: "dash", title: "Dashboard", items: user ? [DASHBOARD] : [] }, ...MENU, { id: "about", title: "About FinLit", items: [...MORE.groups[2].items, PRICING] }];
  const groups = all.map((g) => ({ ...g, items: g.items.filter((it) => menuMatch(find, it, g)) })).filter((g) => g.items.length);
  const finding = find.trim().length > 0;
  return (
    <div className="ma-menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="ma-menu-h"><b>Menu</b><button type="button" className="ma-x" onClick={() => setOpen(false)} aria-label="Close the menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
      <div className="ma-menu-b" ref={panel} tabIndex={-1}>
        <div className="ma-list">
          {user ? <>
            <button type="button" className="ma-row" onClick={() => go("/account")}><span className="ma-av" aria-hidden="true">{(user.name || user.email)[0].toUpperCase()}</span>
              <span className="ma-rt"><b>{user.name || "Your account"}</b><small>{plan[0].toUpperCase() + plan.slice(1)} plan · {user.email}</small></span><Icon name="arrow" className="ma-chev" /></button>
          </> : <>
            <button type="button" className="ma-row" onClick={() => go("/login")}><span className="ma-av" aria-hidden="true"><Icon name="users" /></span>
              <span className="ma-rt"><b>Sign in</b><small>{`Free account: ${freeAccountLine()}`}</small></span><Icon name="arrow" className="ma-chev" /></button>
          </>}
          <Switch on={theme === "dark"} label="Dark theme" icon="spark" onClick={toggleTheme} />
          <Switch on={fab} label="Tools button" sub="Bottom right on every page" icon="grid" onClick={flipFab} />
          {isAdmin && <div className="ma-row"><span className="ma-ico"><Icon name="lock" /></span><span className="ma-rt"><b>System controls</b></span><SystemControl /></div>}
        </div>
        {!user && <Link to="/login?mode=signup" className="ma-cta" onClick={() => setOpen(false)}>Create a free account</Link>}

        <label className="ma-find"><Icon name="search" /><input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a page, e.g. IPO, DCF, glossary" aria-label="Find a page" enterKeyHint="search" /></label>
        {finding && !groups.length && <p className="ma-fine">No page matches “{find}”. Try another word, or search for a company in the top bar.</p>}

        {!finding && <><h3 className="ma-gt">Most used</h3>
        <div className="ma-grid">{MOST_USED.map((m) => <Link key={m.to} to={m.to} className="ma-tool" onClick={() => setOpen(false)}><span><Icon name={m.icon} /></span>{m.label}</Link>)}</div></>}

        {groups.map((g) => (
          <section key={g.id} className="ma-grp" aria-label={g.title}>
            <h3 className="ma-gt">{g.title}<small>{g.items.length}</small></h3>
            <div className="ma-list">
              {g.items.filter(offeredTo(gold)).map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => "ma-row ma-link" + (isActive ? " on" : "")} onClick={() => setOpen(false)}>
                  <span className="ma-ico"><Icon name={it.icon} /></span><span className="ma-rt"><b>{it.label}</b></span>
                  {it.gold && <em className="ma-gold">Gold</em>}{isNew(it) && <em className="ma-new">New</em>}<Icon name="arrow" className="ma-chev" />
                </NavLink>
              ))}
            </div>
          </section>
        ))}

        <h3 className="ma-gt">Help</h3>
        <div className="ma-list ma-help"><HelpActions onPick={() => setOpen(false)} /></div>
        <div className="ma-list" style={{ marginTop: 12 }}>
          <button type="button" className="ma-row" onClick={() => setDesktopSite(true)}><span className="ma-ico"><Icon name="panel" /></span>
            <span className="ma-rt"><b>Desktop site</b><small>The full desktop layout on this phone (switch back at the foot of any page)</small></span></button>
          {user && !DEMO && <button type="button" className="ma-row" onClick={async () => { setOpen(false); await signOut(); nav("/"); }}><span className="ma-ico"><Icon name="arrow" /></span><span className="ma-rt"><b>Sign out</b></span></button>}
        </div>
        <p className="ma-fine">Information only, not investment advice. FinLit describes companies and markets; it does not recommend.</p>
      </div>
    </div>
  );
}

/** Pages with their own bar of actions along the bottom: the Tools button stays off there, so two floating layers never stack. */
const OWN_BAR = /^\/(login|forgot-password|reset-password|verify-email)(\/|$)/;

/** The floating Tools button (the team's suggestion, 23 Nov 2026): bottom right, above the tabs; tap for the tools, this page's first.
 *  It hides while you scroll down (so it never sits over a row's numbers) and comes back on any scroll up; it can be switched off in Menu. */
export function ToolsButton() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [hid, setHid] = useState(false);
  const [on, setOn] = useState(() => store.get("finlit.tools.button", true));
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const kb = useRef(false);
  useEffect(() => { const o = () => setOn(store.get("finlit.tools.button", true)); addEventListener("finlit:tools-button", o); return () => removeEventListener("finlit:tools-button", o); }, []);
  useEffect(() => { setOpen(false); setHid(false); }, [pathname]);
  // Round 3: while a text box has the focus the phone keyboard is open, and the button would sit on the field: it steps aside until typing ends.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isText = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range|color|file|reset|image)$/i.test((t as HTMLInputElement).type)));
    const fin = (e: FocusEvent) => setTyping(isText(e.target)), fout = () => setTyping(false);
    document.addEventListener("focusin", fin); document.addEventListener("focusout", fout);
    return () => { document.removeEventListener("focusin", fin); document.removeEventListener("focusout", fout); };
  }, []);
  useEffect(() => {
    let last = scrollY;
    const s = () => {
      const y = scrollY, d = y - last, end = innerHeight + y >= document.documentElement.scrollHeight - 4;
      if (y < 40 || end) setHid(false); else if (d > 8) setHid(true); else if (d < -4) setHid(false);
      if (Math.abs(d) > 2) setOpen(false);
      last = y;
    };
    addEventListener("scroll", s, { passive: true });
    return () => removeEventListener("scroll", s);
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btn.current?.focus(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const r = [...(list.current?.querySelectorAll<HTMLElement>(".ma-fr") ?? [])], i = r.indexOf(document.activeElement as HTMLElement);
        e.preventDefault(); r[(i + (e.key === "ArrowDown" ? 1 : -1) + r.length) % r.length]?.focus();
      }
    };
    addEventListener("keydown", k);
    if (kb.current) setTimeout(() => list.current?.querySelector<HTMLElement>(".ma-fr")?.focus(), 30);
    return () => removeEventListener("keydown", k);
  }, [open]);
  if (!on || OWN_BAR.test(pathname)) return null;
  const rows = toolsList(pathname);
  return <>
    <div className={"ma-scrim" + (open ? " show" : "")} onClick={() => setOpen(false)} aria-hidden="true" />
    <div className={"ma-fabp" + (open ? " show" : "")} ref={list} id="ma-tools" role="menu" aria-label="Tools" hidden={!open}>
      {rows.map((t, i) => <Link key={t.to} to={t.to} role="menuitem" className={"ma-fr" + (t.here ? " here" : "")} style={{ "--i": rows.length - i } as React.CSSProperties} onClick={() => setOpen(false)}>
        <span><Icon name={t.icon} /></span><b>{t.label}</b></Link>)}
      <Link to="/tools" role="menuitem" className="ma-fr all" style={{ "--i": 0 } as React.CSSProperties} onClick={() => setOpen(false)}><span><Icon name="grid" /></span><b>All tools</b></Link>
    </div>
    <button ref={btn} type="button" className={"ma-fab" + (open ? " open" : "") + ((hid || typing) && !open ? " hid" : "")} aria-expanded={open} aria-controls="ma-tools" aria-label={open ? "Close tools" : "Tools"}
      onClick={(e) => { kb.current = e.detail === 0; setOpen((v) => !v); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>Tools</span>
    </button>
  </>;
}

/** On a phone, the top bar's Ask FinLit AI opens the assistant (shared event); kept here so the header stays one component. */
export const openAI = () => dispatchEvent(new Event(OPEN_AI));

/** The foot of every page on a phone: one line of links, and "Mobile site" when the visitor chose Desktop site. */
export function PhoneFootLinks() {
  const desk = useSyncExternalStore(() => () => {}, desktopSiteOn, () => false);
  return <nav className="ma-foot" aria-label="Footer">
    <Link to="/about">About</Link><Link to="/plans">Pricing</Link><Link to="/contact">Contact</Link><Link to="/faq">Help</Link><Link to="/legal/terms">Terms</Link><Link to="/legal/privacy">Privacy</Link><Link to="/legal/disclosures">Disclosures</Link><Link to="/status">Status</Link>
    {desk && <button type="button" onClick={() => setDesktopSite(false)}>Mobile site</button>}
  </nav>;
}
