// Task #183 (Equity portfolio, the 15 Nov pack): the top of the page (the score and one tile per tab, the whole tile opens its tab), each tab's Key figures
// row (three cards, foldable, remembers open or closed per tab in this browser; each button jumps to its section and flashes it), and the sticky sections
// bar (numbered chips with arrows for the open tab, the one in view underlined; All sections lists every section of the three tabs).
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Tip } from "../../components/sectors/pack/Common";
import type { KeyCard, TabKey, TopTile } from "../../lib/equityTop";
import "./pagetop.css";

export function jumpTo(id: string, retry = true) {
  // a section inside a sub-tab (Diversification analytics) opens its sub-tab first, then it is scrolled to
  if (retry) window.dispatchEvent(new CustomEvent("eq-jump", { detail: id }));
  const el = document.getElementById(id);
  if (!el) { if (retry) setTimeout(() => jumpTo(id, false), 80); return; }
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("eqt-flash"); void el.offsetWidth; el.classList.add("eqt-flash");
  setTimeout(() => el.classList.remove("eqt-flash"), 1600);
}

/** Generic over the page's tab names (Equity: portfolio | diversification | risk; MF: funds | mix | risk). */
export function TopGrid<T extends string = TabKey>({ score, tiles, onOpen, label = "Your portfolio at a glance" }: { score: React.ReactNode; tiles: (Omit<TopTile, "id"> & { id: T })[]; onOpen: (t: T) => void; label?: string }) {
  return (
    <section className="eqt-grid" aria-label={label}>
      {score}
      {tiles.map((t) => (
        <div key={t.id} className={"eqt-tile eqt-" + t.tone} role="link" tabIndex={0} aria-label={`${t.k}: ${t.v}. ${t.link}`} onClick={() => onOpen(t.id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(t.id); } }}>
          <p className="eqt-k">{t.k}<span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><Tip text={t.help} how={t.how} label={`About “${t.k}”`} /></span></p>
          <p className="eqt-v">{t.v}{t.tag && <span className="eqt-tag">{t.tag}</span>}</p>
          <p className="eqt-x">{t.sub}</p>
          <span className="eqt-go">{t.link} →</span>
        </div>))}
    </section>
  );
}

/** The score box for Silver: the portfolio score is worked out from FinLit Prism, part of Gold. */
export function ScoreLocked() {
  return (
    <div className="eqt-score eqt-locked">
      <p className="eqt-score-k">Your portfolio score</p>
      <p className="eqt-score-v"><b>—</b> / 100</p>
      <p className="eqt-score-x">Worked out from FinLit Prism, part of the Gold plan. Your shares' FinLit IQ is in the Portfolio tab. <Link to="/plans">See plans</Link></p>
    </div>
  );
}

const KF_KEY = "finlit-eq-keyfig";
const readOpen = (tab: string, key = KF_KEY) => { try { const v = JSON.parse(localStorage.getItem(key) || "{}")[tab]; return v !== false; } catch { return true; } };
const saveOpen = (tab: string, open: boolean, key = KF_KEY) => { try { const all = JSON.parse(localStorage.getItem(key) || "{}"); all[tab] = open; localStorage.setItem(key, JSON.stringify(all)); } catch { /* not kept */ } };

/** `store`: the browser key that remembers open or closed per tab (one per page, so two pages' "risk" tabs do not share it). */
export function KeyFigures({ tab, sub, cards, store = KF_KEY }: { tab: string; sub: string; cards: KeyCard[]; store?: string }) {
  const [open, setOpen] = useState(() => readOpen(tab, store));
  useEffect(() => { setOpen(readOpen(tab, store)); }, [tab, store]);
  if (!cards.length) return null;
  const flip = () => { saveOpen(tab, !open, store); setOpen(!open); };
  return (
    <section className="eqt-kf" aria-labelledby={`eqt-kf-${tab}`}>
      <div className="eqt-kf-h"><div><h2 id={`eqt-kf-${tab}`}>Key figures</h2><p>{sub}</p></div>
        <button type="button" className="eqt-fold" aria-expanded={open} onClick={flip}>{open ? "Hide ▴" : "Show ▾"}</button></div>
      {open && <div className="eqt-kf-cards">{cards.map((c) => (
        <div key={c.k} className={"eqt-card eqt-" + c.tone}><p className="eqt-k">{c.k}</p><p className="eqt-v">{c.v}</p><p className="eqt-x">{c.text}</p>
          <button type="button" className="eqt-go eqt-jump" onClick={() => jumpTo(c.to)}>{c.go} →</button></div>))}</div>}
    </section>
  );
}

export type Sec = [id: string, label: string];
export function SectionsBar<T extends string = TabKey>({ tab, all, onTab }: { tab: T; all: Record<T, { label: string; secs: Sec[] }>; onTab: (t: T, then?: string) => void }) {
  const secs = all[tab].secs, [on, setOn] = useState(secs[0]?.[0] ?? ""), [menu, setMenu] = useState(false);
  useEffect(() => {
    setOn(secs[0]?.[0] ?? "");
    if (typeof IntersectionObserver === "undefined") return;
    const els = secs.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setOn(v.target.id); }, { rootMargin: "-110px 0px -55% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [tab, secs.map((s) => s[0]).join()]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!menu) return; const close = () => setMenu(false); addEventListener("click", close); return () => removeEventListener("click", close); }, [menu]);
  return (
    <nav className="eqt-bar" aria-label="Sections on this tab">
      <span className="eqt-allw"><button type="button" className="eqt-all" aria-expanded={menu} aria-haspopup="true" onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}>All sections</button>
        {menu && <div className="eqt-menu" role="menu">{(Object.keys(all) as T[]).map((t) => <div key={t}><p>{all[t].label}</p>
          {all[t].secs.map(([id, label], i) => <button key={id} type="button" role="menuitem" onClick={() => { setMenu(false); if (t === tab) { setOn(id); jumpTo(id); } else onTab(t, id); }}><span className="eqt-n">{i + 1}</span>{label}</button>)}</div>)}</div>}</span>
      {secs.map(([id, label], i) => <span key={id} className="eqt-chipw">{i > 0 && <span className="eqt-arrow" aria-hidden="true">→</span>}
        <button type="button" className="eqt-chip" aria-current={on === id ? "true" : undefined} onClick={() => { setOn(id); jumpTo(id); }}><span className="eqt-n">{i + 1}</span>{label}</button></span>)}
    </nav>
  );
}

/** Gold: the portfolio score box (as before), now the first cell of the top grid. */
export function ScoreBox({ total, band, needsQty, onAddQty }: { total: number | null; band?: string; needsQty: boolean; onAddQty: () => void }) {
  return (
    <div className="eqt-score">
      <p className="eqt-score-k">Your portfolio score<Tip text="One number from 0 to 100 that sums up how strong the shares are, how well spread, how risky against the index, the price trend, valuation and concentration." how="Higher reads stronger on those together. How they are combined stays on FinLit's side; Make the score yours shows the parts." label="About “Your portfolio score”" /></p>
      <p className="eqt-score-v"><b>{total ?? "—"}</b> / 100{band && total != null && <em> {band}</em>}</p>
      <p className="eqt-score-x">{needsQty ? "Needs quantities: type how many of each share you own in the Qty column of Your shares. Until then every share counts the same." : "Counted by the value of each holding you entered."}</p>
      {needsQty && <button type="button" className="eqt-addq" onClick={onAddQty}>Add quantities</button>}
    </div>
  );
}
