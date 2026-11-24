import { AdminViewStrip, AdminViewSwitch } from "./AdminViewSwitch";
import { ExtensionBanner } from "./ExtensionBanner";
import { Fragment, useEffect, useMemo, useState } from "react";
import { initDepth } from "../lib/depth";
import { ErrorBoundary } from "./ErrorBoundary";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { COMPANY } from "../content/site";
import { useUI } from "../lib/ui";
import { Icon } from "../lib/icons";
import { Tape } from "./Tape";
import { SearchPalette } from "./SearchPalette";
import { useWarmMyCompanies } from "../lib/mycompanies";
import { AccountNotice, AlertToasts, NotificationBell } from "./Notifications";
import { SystemControl } from "./SystemControl";
import { AssistantLauncher } from "./AssistantLauncher";
import { OPEN_AI } from "./assistantEvents";
import { PageFaqs } from "./PageFaqs";
import { EnquiryProvider, useEnquiry } from "./Enquiry";
import { InfoProvider } from "./Info";
import { DEMO } from "../lib/demo";
import { useAuth } from "../lib/auth";
import { MORE, PRICING, SECTIONS, isHere, isNew, offeredTo, sectionHere, showsTape, type NavSection } from "../lib/nav";
import { useInShell } from "../lib/shellPresence";
import { useIsGold } from "../lib/planGate";
import { versionLine } from "../lib/version";
import { HelpActions, PageFeedbackHost } from "./PageFeedback";
import "../styles/ai-top.css";
import { buttonClass } from "./ui";
import { WordOfDayButton, WordOfDayMenuItem, useWodInMenu } from "./WordOfDay";
import { SheetTools } from "./SheetTools";
import { HubChips, MobileMenu, MobileTabs, PhoneFootLinks, ToolsButton } from "./mobile/MobileApp";
import { desktopSiteOn, setDesktopSite } from "../lib/mobileNav";

/** One header dropdown, built from lib/nav.ts. */
function Menu({ m, open, setOpen, path, extra }: { m: NavSection; open: boolean; setOpen: (v: string | null) => void; path: string; extra?: React.ReactNode }) {
  const here = sectionHere(path, m);
  return (
    <div className="dd" onMouseLeave={() => open && setOpen(null)}>
      <button className={"ddb" + (here ? " hl" : "")} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(open ? null : m.id)} onKeyDown={(e) => e.key === "Escape" && setOpen(null)}
        onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(null); }}>{m.label}<Icon name="arrow" /></button>
      <div className={"ddm" + (open ? " open" : "") + (m.wide ? " wide" : "") + (m.id === "more" ? " right" : "") + (m.groups.length === 1 && !m.groups[0].title ? " solo" : "")} role="menu">
        {m.groups.map((g, gi) => (
          <div className="ddg" key={gi}>{g.title && <span className="ddt">{g.title}</span>}{gi === 0 && extra}
            {g.items.map((it, ii) => {
              // task #299 (the team, 21 Nov: "too much content written about each and every feature … provide an i button where a person can hover"):
              // the name only; its line sits behind an i beside the link (a button cannot be inside a link) and shows on hover, keyboard focus or a tap
              const tip = `ddtip-${m.id}-${gi}-${ii}`;
              return <div className="ddr" key={it.to}>
                <Link to={it.to} role="menuitem" className={isHere(path, it) ? "here" : undefined} aria-current={isHere(path, it) ? "page" : undefined} aria-describedby={it.sub ? tip : undefined} onClick={() => setOpen(null)}>
                  <span className="ddi"><Icon name={it.icon} /></span><span><b>{it.label}{it.gold && <em className="gtag">Gold</em>}{isNew(it) && <em className="nav-new">New</em>}</b></span></Link>
                {it.sub && <span className="ddq"><button type="button" className="ddq-b" aria-label={`What is ${it.label}?`} aria-describedby={tip} tabIndex={-1}>i</button>
                  <span role="tooltip" id={tip} className="ddq-t">{it.sub}</span></span>}
              </div>;
            })}</div>
        ))}
      </div>
    </div>
  );
}

function Header({ onSearch }: { onSearch: () => void }) {
  const { theme, toggleTheme, plan, setPlan } = useUI();
  const gold = useIsGold();
  const sections = useMemo(() => forPlan(SECTIONS, gold), [gold]);   // task #100: pages not offered to Gold (none since task #283)
  const { user, ready, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const [acct, setAcct] = useState(false);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const loc = useLocation();
  const onStock = loc.pathname.startsWith("/stocks/");
  const onDash = loc.pathname === "/dashboard";
  const onAuth = /^\/(login|forgot-password|reset-password|verify-email)(\/|$)/.test(loc.pathname);   // the sign-in pages carry no assistant
  useEffect(() => { setMenu(false); setOpen(null); setAcct(false); }, [loc.pathname]);
  useEffect(() => { const o = () => setMenu((m) => !m); addEventListener(OPEN_MENU, o); return () => removeEventListener(OPEN_MENU, o); }, []);
  // Task #310 part D (04-navigation.md, one layer per job): signed in on a page with the left menu, the left menu moves between pages, so the top bar drops
  // its seven menus and keeps the logo, a wider centred search, Ask FinLit AI, theme, notifications and account. Marketing pages and visitors keep the menus.
  const inShell = useInShell(), tool = !!user && inShell;
  const ai = !onAuth && <button type="button" className={buttonClass("secondary", "md", "ai-top")} onClick={() => dispatchEvent(new Event(OPEN_AI))} aria-label="Ask FinLit AI" aria-haspopup="dialog"><Icon name="spark" /><span>Ask FinLit AI</span></button>;
  const wod = !onAuth && <WordOfDayButton resetKey={`${user?.id ?? ""}|${tool}|${isAdmin}|${ready}`} />;
  const wodInMenu = useWodInMenu();   // task #315: in the band where even the tightened book does not fit, it is the first item of "More"   // task #315: just before Ask FinLit AI, on every page but the sign-in pages
  const find = <button className="search" onClick={onSearch} aria-label="Search stocks" aria-haspopup="dialog"><Icon name="search" /><span className="t">Search for a company</span></button>;
  return (
    <header className={"top" + (tool ? " top--tool" : "")}>
      <div className="wrap">
        <Link className="logo" to="/" aria-label="FinLit home"><span className="lg-mark" role="img" aria-label="FinLit" /></Link>
        {tool ? <><div className="grow" />{find}<div className="grow" />{wod}{ai}</> : <>
        <nav className="topnav" aria-label="Site">
          {sections.map((m) => <Menu key={m.id} m={m} open={open === m.id} setOpen={setOpen} path={loc.pathname} />)}
          <NavLink to={PRICING.to} className={({ isActive }) => (isActive ? "hl" : "")}>{PRICING.label}</NavLink>
          <Menu m={MORE} open={open === MORE.id} setOpen={setOpen} path={loc.pathname} extra={wodInMenu && <WordOfDayMenuItem onPick={() => setOpen(null)} />} />
        </nav>
        <div className="grow" />
        {wod}
        {ai}
        {find}</>}
        {DEMO && onStock && (
          <div className="seg planseg" role="group" aria-label="Preview plan">
            <span className="lbl">Preview</span>
            {(["basic", "silver", "gold"] as const).map((p) => (
              <button key={p} aria-pressed={plan === p} style={{ "--tc": `var(--t-${p})` } as React.CSSProperties} onClick={() => setPlan(p)}><i />{p[0].toUpperCase() + p.slice(1)}</button>
            ))}
          </div>
        )}
        <button className="icon-btn theme-btn" onClick={toggleTheme} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}>
          {theme === "light" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>}
        </button>
        {isAdmin && <AdminViewSwitch />}
        {isAdmin && <SystemControl />}
        {user && <NotificationBell />}
        {user ? (
          <div className="dd acct-dd">
            <button className="av-btn" aria-haspopup="true" aria-expanded={acct} aria-label={`Account menu for ${user.email}`} onClick={() => setAcct(!acct)} onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setAcct(false); }}>
              <span className="av sm" aria-hidden="true">{(user.name || user.email)[0].toUpperCase()}</span><span className={"tier " + plan}>{plan[0].toUpperCase() + plan.slice(1)}</span>
            </button>
            <div className={"ddm right" + (acct ? " open" : "")} role="menu">
              <div className="acct-who"><b>{user.name || "Signed in"}</b><small>{user.email}</small></div>
              {/* task #310 part D: on a page with the left menu these pages are in the left menu, so the top bar does not list them a second time */}
              {!inShell && <>
              <Link to="/dashboard" role="menuitem"><span className="ddi"><Icon name="table" /></span><span><b>Dashboard</b></span></Link>
              <Link to="/watchlist" role="menuitem"><span className="ddi"><Icon name="wallet" /></span><span><b>Watchlist</b></span></Link>
              <Link to="/account" role="menuitem"><span className="ddi"><Icon name="users" /></span><span><b>Account</b></span></Link>
              <Link to="/account/appearance" role="menuitem"><span className="ddi"><Icon name="spark" /></span><span><b>Appearance</b></span></Link>
              {isAdmin && <Link to="/console" role="menuitem"><span className="ddi"><Icon name="lock" /></span><span><b>Admin console</b></span></Link>}</>}
              <span className="ddt acct-help">Help and feedback</span>
              <HelpActions asMenu onPick={() => setAcct(false)} />
              {!DEMO && <button role="menuitem" onClick={async () => { setAcct(false); await signOut(); nav("/"); }}><span className="ddi"><Icon name="arrow" /></span><span><b>Sign out</b></span></button>}
            </div>
          </div>
        ) : ready || DEMO ? (
          <><Link className="btn hide-sm signin-ghost" to="/login">Sign in</Link><Link className="btn primary hide-sm signin" to={DEMO ? "/login" : "/login?mode=signup"}>{DEMO ? "Sign in" : "Create account"}</Link></>
        ) : <span className="signin-ph" aria-hidden="true" />}
        {user ? (onDash ? null : <Link className="btn primary mob-only mob-cta" to="/dashboard">Dashboard</Link>) : (ready || DEMO) ? <Link className="btn primary mob-only mob-cta" to="/login">Sign in</Link> : null}
        <button className="icon-btn burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
      </div>
      {menu && (
        <nav className="mnav" aria-label="Mobile">
          {user && <div className="mg mg-first"><NavLink to="/dashboard" className="mdash">Dashboard</NavLink></div>}
          {[...sections, MORE].map((m) => <div key={m.id} className="mg"><span className="mt">{m.label}</span>
            {m.groups.map((g, gi) => <Fragment key={gi}>{g.title && m.id !== "more" && <span className="mt2">{g.title}</span>}{g.title && m.id === "more" && <span className="mt2">{g.title}</span>}
              {g.items.map((it) => <NavLink key={it.to} to={it.to} end={it.end}>{it.label}{it.gold && <em className="gtag">Gold</em>}{isNew(it) && <em className="nav-new">New</em>}</NavLink>)}</Fragment>)}</div>)}
          <div className="mg mg-help"><span className="mt">Help and feedback</span><HelpActions onPick={() => setMenu(false)} /></div>
          <SheetTools />
          <div className="mg"><NavLink to={PRICING.to}>{PRICING.label}</NavLink>{user ? <><NavLink to="/dashboard">Dashboard</NavLink><NavLink to="/account">Account</NavLink></> : <><Link to="/login">Sign in</Link><Link to="/login?mode=signup" className="gold">Create free account</Link></>}</div>
        </nav>
      )}
    </header>
  );
}

/** The site map without the pages this plan does not get (lib/nav.ts NOT_FOR_GOLD). */
const forPlan = (list: NavSection[], gold: boolean): NavSection[] => gold ? list.map((x) => ({ ...x, groups: x.groups.map((g) => ({ ...g, items: g.items.filter(offeredTo(true)) })) })) : list;
const pick = (id: string) => SECTIONS.find((x) => x.id === id)!.groups.flatMap((g) => g.items);
/** Each link once, in order (a page in two menu sections is listed in the first column only once). */
const once = (items: { to: string; label: string }[]) => items.filter((it, i) => items.findIndex((x) => x.to === it.to) === i);
const FOOT: { title: string; items: { to: string; label: string }[] }[] = [
  { title: "Research", items: pick("research") },
  { title: "Markets and news", items: once([...pick("markets"), ...pick("news"), { to: "/premium/markets", label: "Market events & index" }]) },
  { title: "Funds and Workspace", items: once([...pick("funds"), { to: "/fund-score-screener", label: "Mutual Fund Score" }, { to: "/funds/compare", label: "Compare funds" }, ...pick("myfinlit")]) },
];

/** The home page's footer: the logo, one line, the disclosure and the main links. Every other page keeps the full footer. */
function SlimFooter() {
  return (
    <footer className="band foot-slim">
      <div className="wrap">
        <div className="fslim">
          <div><span className="lg-mark" role="img" aria-label="FinLit" /><h2>Follow the numbers, not the noise.</h2></div>
          <nav aria-label="Footer"><Link to="/about">About</Link><Link to="/plans">Pricing</Link><Link to="/blog">Blog</Link><Link to="/faq">FAQs</Link><Link to="/browser-extension">Browser extension</Link><Link to="/contact">Contact</Link><Link to="/legal/terms">Terms</Link><Link to="/legal/privacy">Privacy</Link><Link to="/legal/disclosures">Disclosures</Link><Link to="/status">Status</Link></nav>
        </div>
        <PhoneFootLinks />
        {desktopSiteOn() && <p className="ma-back"><button type="button" className="btn" onClick={() => setDesktopSite(false)}>Back to the mobile site</button></p>}
        <div className="ffine"><span>{COMPANY.disclaimer} Market data may be delayed. Past performance does not indicate future results.</span><span>© {new Date().getFullYear()} {COMPANY.name}</span></div>
      </div>
    </footer>
  );
}

function Footer() {
  const enquire = useEnquiry();
  const { user } = useAuth();
  const gold = useIsGold();
  if (useLocation().pathname === "/") return <SlimFooter />;
  return (
    <footer className="band">
      <div className="wrap">
        <div className="fcta">
          <div><span className="lg-mark" role="img" aria-label="FinLit" style={{ marginBottom: 18 }} /><h2>Follow the numbers, not the noise.</h2>{!user && <p>Open a free account to follow stocks, set alerts and read the research reports we have built so far.</p>}</div>
          <div className="cta-row">{!user && <Link className="btn primary" to="/login?mode=signup">Create free account</Link>}<button className="btn" onClick={() => enquire()}>Talk to the team</button><HelpActions className="btn foot-help" /></div>
        </div>
        <div className="fcols fcols5">
          <div className="fbrand"><b>{COMPANY.name}</b><p>Research and tools for Indian stocks and funds.</p>
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a><a href={COMPANY.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a></div>
          {FOOT.map((col) => <div key={col.title}><b>{col.title}</b>{col.items.filter(offeredTo(gold)).map((it) => <Link key={it.to} to={it.to}>{it.label}</Link>)}</div>)}
          <div><b>Company</b><Link to="/about">About</Link><Link to="/why-we-exist">Why we exist</Link><Link to="/browser-extension">Browser extension</Link><Link to="/services">Services</Link><Link to="/plans">Pricing</Link><Link to="/blog">Blog</Link><Link to="/forum">Discussion forums</Link><Link to="/companies">All companies</Link><Link to="/glossary">Glossary</Link><Link to="/faq">FAQs</Link><Link to="/mcp">Connect AI</Link><Link to="/contact">Contact</Link>
            <Link to="/legal/terms">Terms</Link><Link to="/legal/privacy">Privacy</Link><Link to="/legal/disclosures">Research disclosures</Link><Link to="/status">Status</Link>{!user && <Link to="/login">Sign in</Link>}</div>
        </div>
        <PhoneFootLinks />
        {desktopSiteOn() && <p className="ma-back"><button type="button" className="btn" onClick={() => setDesktopSite(false)}>Back to the mobile site</button></p>}
        <div className="ffine">
          <span>{COMPANY.disclaimer} Market data may be delayed. Past performance does not indicate future results.</span>
          <span>© {new Date().getFullYear()} {COMPANY.name}<br /><span className="ver" title="Quote this when you contact support">{versionLine()}</span><br /><Link to="/legal/terms">Terms</Link> · <Link to="/legal/privacy">Privacy</Link> · <Link to="/legal/disclosures">Disclosures</Link></span>
        </div>
      </div>
    </footer>
  );
}

const OPEN_MENU = "finlit:open-menu";

export function Layout() {
  useWarmMyCompanies();
  const [search, setSearch] = useState(false);
  const loc = useLocation();
  const onAuth = /^\/(login|forgot-password|reset-password|verify-email)(\/|$)/.test(loc.pathname);   // the floating assistant would sit on top of the sign-up form
  useEffect(() => { if (!loc.hash) window.scrollTo({ top: 0 }); }, [loc.pathname, loc.hash]);
  useEffect(() => initDepth(), []);
  useEffect(() => {
    // soft glow that follows the pointer on cards (one delegated listener)
    const mv = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(".feat, .bt .spot, .card, .mk-tile"); if (!el) return;
      const r = el.getBoundingClientRect(); el.style.setProperty("--mx", `${e.clientX - r.left}px`); el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", mv, { passive: true });
    return () => document.removeEventListener("pointermove", mv);
  }, []);
  useEffect(() => { const o = () => setSearch(true); addEventListener("finlit:open-search", o); return () => removeEventListener("finlit:open-search", o); }, []);   // the dashboard's "Find a stock" box
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((document.activeElement as HTMLElement | null)?.tagName || "");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch(true); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setSearch(true); }
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  const bare = ["/login", "/forgot-password", "/reset-password", "/verify-email"].includes(loc.pathname);
  return (
    <InfoProvider>
      <EnquiryProvider>
        <a className="skip" href="#main">Skip to content</a>
        {DEMO && <div className="demo-bar" role="note"><b>Demo preview</b> · saved sample data, no servers. Forms are not sent. The live site loads every stock.</div>}
        {showsTape(loc.pathname) && <Tape />}
        <Header onSearch={() => setSearch(true)} />
        {!bare && <ExtensionBanner />}
        <AdminViewStrip />
        <main id="main">{!bare && <HubChips />}{!onAuth && <AccountNotice />}<ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary><PageFaqs /></main>
        {!bare && <Footer />}
        <SearchPalette open={search} onClose={() => setSearch(false)} />
        <AlertToasts />
        {!onAuth && <AssistantLauncher />}
        {!bare && <PageFeedbackHost />}
        {!bare && <><MobileTabs /><MobileMenu /><ToolsButton /></>}
      </EnquiryProvider>
    </InfoProvider>
  );
}
