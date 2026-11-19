// Task #235 (the 18 Nov portfolios pack): the view tabs that read as tabs (B2, level 1: a colour per view, a 4 px top stripe, an icon tile, an arrow; the
// selected one filled with ✓ and a notch) and the switcher that the sticky sections bar carries once it sticks (B12: a portfolio picker and a view switch, so
// changing Dhan → Upstox or Portfolio → Risk needs no scroll back to the top). Shared by the four portfolio pages.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lk, pct, tone } from "./money";
import type { PfFigs, PfInfo } from "./Portfolios";
import "./view-kit.css";

const svg = (d: ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{d}</svg>;
export const VIEW_ICON = {
  case: svg(<><path d="M4 8h16v11H4z" /><path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M4 13h16" /></>),
  pie: svg(<><path d="M12 3v9l7.8 4.5" /><circle cx="12" cy="12" r="9" /></>),
  pulse: svg(<path d="M3 12h4l3-7 4 14 3-7h4" />),
};
/** The pack's view colours (B2): Portfolio teal, Diversification indigo, Risk rust; the same three on the MF and ETF pages. */
export const VIEW_COLOR = { first: "#0e6471", second: "#4b4fc4", risk: "#b5541c" };
export type ViewDef<T extends string> = { id: T; label: string; short: string; sub: string; color: string; icon: ReactNode };

export function ViewTabsKit<T extends string>({ defs, view, onView, label, idp, panel, what }: { defs: ViewDef<T>[]; view: T; onView: (v: T) => void; label: string; idp: string; panel: string; what: string }) {
  const key = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? defs.length - 1 : null;
    if (n == null) return;
    e.preventDefault(); const d = defs[(n + defs.length) % defs.length]; onView(d.id); setTimeout(() => document.getElementById(`${idp}-${d.id}`)?.focus(), 0);
  };
  return <>
    <p className="eqv-k">Choose a view <small>{defs.length} views of {what} · tap one</small></p>
    <div className="xv-tabs" role="tablist" aria-label={label}>{defs.map((d, i) => (
      <button key={d.id} type="button" role="tab" id={`${idp}-${d.id}`} aria-selected={view === d.id} aria-controls={panel} tabIndex={view === d.id ? 0 : -1} style={{ ["--va" as string]: d.color }} onClick={() => onView(d.id)} onKeyDown={(e) => key(e, i)}>
        <span className="eqv-ic" aria-hidden="true">{d.icon}</span><b>{d.label}</b><small>{d.sub}</small></button>))}</div>
  </>;
}

const AV = ["#0e6471", "#4b4fc4", "#b5541c", "#2f5a9e", "#9a6b12", "#7a3e8e", "#2e7d57", "#a3324a", "#5b6170", "#13606b"];
export const pfAvatar = (list: PfInfo[], id: string) => (id === "all" ? { ini: "∑", av: "#3a3f4b" } : { ini: (list.find((p) => p.id === id)?.name.trim().charAt(0) || "?").toUpperCase(), av: AV[Math.max(0, list.findIndex((p) => p.id === id)) % AV.length] });

/** The first section still on screen under the sticky bar, and where it is, so a change above it can be undone by scrolling (B12: "the reader keeps their place"). */
function anchor() {
  const head = document.querySelector("header.top")?.getBoundingClientRect().bottom ?? 0, bar = document.querySelector(".sw-host")?.getBoundingClientRect().height ?? 0;
  const lim = Math.max(0, head) + bar + 8;
  for (const e of Array.from(document.querySelectorAll<HTMLElement>("main section, main h2"))) { if (!e.getClientRects().length) continue; const r = e.getBoundingClientRect(); if (r.bottom > lim) return { e, t: r.top }; }
  return null;
}

type Menu = "p" | "v" | null;
/** B12: the portfolio picker and the view switch at the left of the sticky sections bar. Shown by the bar only while it is stuck (`x-sw-on`).
 *  The menus render into the page body: the bar's backdrop blur would otherwise clip a fixed menu inside the bar. */
export function StickySwitch<T extends string>({ list, cur, onPick, figs, defs, view, onView, tabsId, noun = ["share", "shares"] }: {
  list: PfInfo[]; cur: string | "all"; onPick: (id: string | "all") => void; figs: (id: string | "all") => PfFigs; defs: ViewDef<T>[]; view: T; onView: (v: T) => void; tabsId: string; noun?: [string, string];
}) {
  const [menu, setMenu] = useState<Menu>(null), [at, setAt] = useState({ top: 0, left: 0 });
  const pb = useRef<HTMLButtonElement>(null), vb = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null);
  const pfs = list.length > 1 ? [{ id: "all", name: "All accounts" }, ...list] : [];
  const p = pfs.find((x) => x.id === cur), v = defs.find((d) => d.id === view) ?? defs[0];
  const open = (m: Menu, b: HTMLButtonElement | null) => {
    if (!b || menu === m) { setMenu(null); return; }
    const r = b.getBoundingClientRect(); setAt({ top: Math.round(r.bottom + 6), left: Math.round(Math.max(12, Math.min(r.left, innerWidth - 262))) }); setMenu(m);
  };
  const close = (focus = false) => { const b = menu === "p" ? pb.current : vb.current; setMenu(null); if (focus) b?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!menu) return;
    (box.current?.querySelector<HTMLElement>("[aria-checked=true]") ?? box.current?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    const y0 = scrollY, sc = () => { if (Math.abs(scrollY - y0) > 40) setMenu(null); }, click = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !pb.current?.contains(e.target as Node) && !vb.current?.contains(e.target as Node)) setMenu(null); };
    addEventListener("scroll", sc, { passive: true }); addEventListener("resize", sc); document.addEventListener("mousedown", click);
    return () => { removeEventListener("scroll", sc); removeEventListener("resize", sc); document.removeEventListener("mousedown", click); };
  }, [menu]);
  const keys = (e: React.KeyboardEvent) => {
    const bs = Array.from(box.current?.querySelectorAll<HTMLButtonElement>("button") ?? []), i = bs.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length]?.focus({ preventScroll: true }); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); bs[e.key === "Home" ? 0 : bs.length - 1]?.focus({ preventScroll: true }); }
    else if (e.key === "Tab") setMenu(null);
  };
  const pick = (id: string) => {
    setMenu(null); if (id === cur) return;
    const an = anchor(); onPick(id);
    setTimeout(() => { if (an?.e.isConnected) { const d = an.e.getBoundingClientRect().top - an.t; if (Math.abs(d) > 2) scrollBy(0, d); } }, 40);
  };
  const go = (id: T) => {
    setMenu(null); if (id === view) return; onView(id);
    setTimeout(() => { const tl = document.getElementById(tabsId); if (!tl) return; const head = document.querySelector("header.top")?.getBoundingClientRect().bottom ?? 0;
      scrollTo({ top: Math.max(0, tl.getBoundingClientRect().bottom + scrollY - Math.max(0, head) - 8) }); }, 60);
  };
  const avOf = (id: string) => pfAvatar(list, id);
  return (
    <div className="x-sw" role="group" aria-label="Switch portfolio or view">
      {p && <button ref={pb} type="button" className="x-sw-b x-sw-p" aria-haspopup="menu" aria-expanded={menu === "p"} aria-label={`Portfolio: ${p.name}. Switch portfolio`} onClick={() => open("p", pb.current)}>
        <span className="acc-av" style={{ ["--av" as string]: avOf(p.id).av }} aria-hidden="true">{avOf(p.id).ini}</span><b>{p.name}</b><i aria-hidden="true">▾</i></button>}
      {defs.length > 1 && <>
        <span className="x-sw-seg" role="group" aria-label="View">{defs.map((d) => <button key={d.id} type="button" className="x-sw-v" aria-pressed={d.id === view} style={{ ["--va" as string]: d.color }} onClick={() => go(d.id)}>
          <span className="x-sw-ic" aria-hidden="true">{d.icon}</span>{d.short}</button>)}</span>
        <button ref={vb} type="button" className="x-sw-b x-sw-vm" aria-haspopup="menu" aria-expanded={menu === "v"} style={{ ["--va" as string]: v.color }} aria-label={`View: ${v.label}. Switch view`} onClick={() => open("v", vb.current)}>
          <span className="x-sw-ic" aria-hidden="true">{v.icon}</span><b>{v.short}</b><i aria-hidden="true">▾</i></button>
      </>}
      {menu && createPortal(<div ref={box} className="x-swm" role="menu" aria-label={menu === "p" ? "Portfolio" : "View"} style={{ top: at.top, left: at.left }} onKeyDown={keys}>
        <p className="x-swm-k" aria-hidden="true">{menu === "p" ? "Portfolio" : "View"}</p>
        {menu === "p" ? pfs.map((x) => { const f = figs(x.id), a = avOf(x.id); return (
          <button key={x.id} type="button" role="menuitemradio" aria-checked={x.id === cur} onClick={() => pick(x.id)}>
            <span className="acc-av" style={{ ["--av" as string]: a.av }} aria-hidden="true">{a.ini}</span>
            <span className="x-swm-t"><b>{x.name}</b><small>{f.n} {f.n === 1 ? noun[0] : noun[1]}{f.withQty ? ` · ${lk(f.now)}` : ""}{f.gainPct != null && <> · <span className={tone(f.gainPct)}>{pct(f.gainPct)}</span></>}</small></span></button>); })
          : defs.map((d) => <button key={d.id} type="button" role="menuitemradio" aria-checked={d.id === view} style={{ ["--va" as string]: d.color }} onClick={() => go(d.id)}>
            <span className="x-sw-ic" aria-hidden="true">{d.icon}</span><span className="x-swm-t"><b>{d.label}</b></span></button>)}
      </div>, document.body)}
    </div>
  );
}
