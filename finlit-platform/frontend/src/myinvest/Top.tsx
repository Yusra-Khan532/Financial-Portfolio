// Task #277 (All my investments pack of 20 Nov 2026, changes 1, 2 and 16; the shared parts' spec is the Equity file §2 and §16):
//   TopCard    the compact top: the title row (plan, i, "Prices at close", Add quantities · Import ▾ · ⋯, no add box: change 1), then a money box that
//              says what it covers (value now; invested, gain or loss and holdings side by side; a bar for how many holdings have a quantity and buy price,
//              or a green line once every one has) and Your portfolios (All accounts and each account; past four, the three largest and "N more ▾").
//   ViewTiles  the four views drawn as tabs (they replace the dark summary box and the three kind tiles): the open one has a check, a heavier border and a
//              notch; the others an arrow and open from anywhere on the card. "Everything, seen 4 ways" counts the views opened; a view not yet opened has
//              an orange "Not opened yet" tag and edge, kept per member (prefs.viewsSeen).
//   NextView   at the end of each view, a card that leads on (All together → Equity → Mutual funds → ETFs → All together).
// Describes the member's lists; never advises. Styles: styles/mi7.css (class prefix mi7-).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { nf } from "../lib/format";
import { KIND_NAME, MODEL_NAME, betaTxt, chg, dateShort, kindsHeld, pctOf, rupees, toneOf, type AllInvestments, type Kind, type KindMoney, type Tab } from "../lib/myInvest";
import { prefs, usePrefs } from "../lib/prefs";
import { I } from "./parts";
import "../styles/mi7.css";

export const VIEW_ORDER: Tab[] = ["all", "equity", "mf", "etf"];
export const VIEW_NAME: Record<Tab, string> = { all: "All together", equity: "Equity", mf: "Mutual funds", etf: "ETFs" };
const TAB_KIND: Record<Exclude<Tab, "all">, Kind> = { equity: "shares", mf: "funds", etf: "etfs" };
const seenKey = (t: Tab) => `mi:${t}`;

/** What is inside a view, as its tab says it ("Inside: your shares, how they are spread, risk"). */
export function insideOf(t: Tab, d: AllInvestments): string {
  if (t === "all") return "money, mix, every company, health, risk";
  if (t === "equity") return "your shares, how they are spread, risk";
  if (t === "mf") return `your ${d.counts.funds === 1 ? "fund" : "funds"}, what is inside, risk`;
  return "your ETFs, what is inside, risk";
}

/** The views opened once, kept with the member's settings; the open one counts as seen as soon as it is shown. */
export function useViewsSeen(open: Tab): Set<Tab> {
  const p = usePrefs();
  useEffect(() => { if (!p.viewsSeen.includes(seenKey(open))) prefs.set({ viewsSeen: [...p.viewsSeen, seenKey(open)] }); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  return new Set(VIEW_ORDER.filter((t) => t === open || p.viewsSeen.includes(seenKey(t))));
}

// ------------------------------------------------------------------------------------------------ the top
export type AccRow = { id: string; name: string; sub: string; value: number | null; gainPct: number | null; color: string; initial: string };

function Menu({ label, items, more }: { label: ReactNode; items: { to: string; text: string }[]; more?: boolean }) {
  const [open, setOpen] = useState(false), box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); (box.current?.querySelector("button") as HTMLButtonElement | null)?.focus(); } };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <span className="mi7-menu" ref={box}>
      <button type="button" className={"btn" + (more ? " mi7-more" : "")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={more ? "More: the three portfolio pages and how it is counted" : undefined}>{label}</button>
      {open && <span className="mi7-menu-m" role="menu">{items.map((x) => x.to.startsWith("#")
        ? <a key={x.to} role="menuitem" href={x.to} onClick={() => setOpen(false)}>{x.text}</a> : <Link key={x.to} role="menuitem" to={x.to}>{x.text}</Link>)}</span>}
    </span>);
}

export function TopCard({ d, money, accs, cur, onPick, openQty, loading }: { d?: AllInvestments; money: Record<Kind | "all", KindMoney> | null; accs: AccRow[]; cur: string;
  onPick: (id: string) => void; openQty: () => void; loading: boolean }) {
  const m = money?.all, [moreOpen, setMoreOpen] = useState(false);
  const counts = d ? `${nf(d.counts.shares, 0)} share${d.counts.shares === 1 ? "" : "s"} · ${nf(d.counts.funds, 0)} fund${d.counts.funds === 1 ? "" : "s"} · ${nf(d.counts.etfs, 0)} ETF${d.counts.etfs === 1 ? "" : "s"}` : loading ? "Reading your three lists…" : "";
  const n = m?.n ?? 0, have = m ? m.n - m.missing.length : 0, all = n > 0 && have === n;
  const withQty = d ? d.shares.filter((s) => s.qty && s.price).length + d.funds.filter((f) => f.units && f.nav).length + d.etfs.filter((e) => e.qty && e.price).length : 0;
  const haveNames = d && m ? [...d.shares.map((s) => s.symbol), ...d.funds.map((f) => f.short || f.name), ...d.etfs.map((e) => e.symbol)].filter((x) => !m.missing.includes(x)) : [];
  const nKinds = d ? kindsHeld(d).length : 0, frac = nKinds === 3 ? "⅓" : nKinds === 2 ? "½" : "all";
  const sorted = [...accs].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const fold = accs.length > 4 && !moreOpen;
  const shown = fold ? accs.filter((a) => a.id === cur || sorted.slice(0, 3).some((x) => x.id === a.id)) : accs;
  const allRow: AccRow = { id: "all", name: "All accounts", sub: `${n} ${n === 1 ? "holding" : "holdings"}`, value: m && m.now > 0 ? m.now : null, gainPct: m && have && m.invested ? (m.gain / m.invested) * 100 : null, color: "#3a3f4b", initial: "∑" };
  const row = (a: AccRow) => (
    <button key={a.id} type="button" role="radio" aria-checked={cur === a.id} onClick={() => onPick(a.id)}>
      <span className="mi7-av" aria-hidden="true" style={{ "--av": a.color } as React.CSSProperties}>{a.initial}</span>
      <span className="mi7-pn"><b>{a.name}</b><small>{a.sub}</small></span>
      <span className="mi7-pv">{a.value != null ? <><b>{rupees(a.value)}</b>{a.gainPct != null && <small className={a.gainPct >= 0 ? "x-up" : "x-dn"}>{chg(a.gainPct)}</small>}</> : <small>no buys yet</small>}</span>
    </button>);
  return (
    <header className="card mi7-top" aria-label="All my investments">
      <div className="mi7-t1">
        <div className="mi7-ht">
          <h1>All my investments</h1>
          {d && <span className="mi7-plan">{d.plan === "gold" ? "Gold" : "Silver"}</span>}
          <I k="All my investments" what="Your shares, mutual funds and ETFs read together: how much you have and where it sits, what it is made of, what you really own underneath, how healthy it is and how risky it is as a whole."
            read="This page reads your three portfolio lists. Add or remove a holding on its own page and it changes here. Nothing is sent to a broker." />
          {d?.sources.pricesTo && <span className="mi7-asof">Prices at close · {dateShort(d.sources.pricesTo).replace(/ \d{4}$/, "")}</span>}
        </div>
        <div className="mi7-acts">
          <button type="button" className="btn primary" disabled={!d} onClick={openQty}>{d?.byValue ? "Edit quantities" : "Add quantities"}</button>
          <Menu label="Import ▾" items={[{ to: "/holdings", text: "Shares: broker file on the Equity portfolio" }, { to: "/mf-portfolio?tab=import", text: "Mutual funds: CAS or statement on the MF portfolio" }, { to: "/etf-portfolio?tab=import", text: "ETFs: broker file on the ETF portfolio" }]} />
          <Menu label="⋯" more items={[{ to: "/holdings", text: "Equity portfolio" }, { to: "/mf-portfolio", text: "MF portfolio" }, { to: "/etf-portfolio", text: "ETF portfolio" }, { to: "#mi-faq", text: "How it is counted" }]} />
          <span className="mi7-count" aria-live="polite">{counts}</span>
        </div>
      </div>
      {d && m && <div className="mi7-t2">
        <section className="mi7-box mi7-money" aria-label="All your investments">
          <p className="mi7-k">All your investments</p>
          {m.now > 0 ? <p className="mi7-big">{rupees(m.now)}<small>value now{d.byValue ? "" : `, of the ${nf(withQty, 0)} with a quantity`}</small></p> : <p className="mi7-big">{n} {n === 1 ? "holding" : "holdings"}<small>no quantities yet</small></p>}
          <div className="mi7-sub3">
            <div><span className="mi7-k">Invested</span><b>{have ? rupees(m.invested) : "—"}</b><small>what you paid</small></div>
            <div><span className="mi7-k">Gain or loss</span>{have && m.invested ? <b className={m.gain >= 0 ? "x-up" : "x-dn"}><span aria-hidden="true">{m.gain >= 0 ? "▲ " : "▼ "}</span>{rupees(Math.abs(m.gain))} <span className="mi7-pp">{chg((m.gain / m.invested) * 100)}</span></b> : <b>—</b>}<small>on what you invested</small></div>
            <div><span className="mi7-k">Holdings</span><b>{d.counts.shares} · {d.counts.funds} · {d.counts.etfs}</b><small>shares · funds · ETFs</small></div>
          </div>
          {all ? <p className="mi7-cov ok" role="note">All {n} holdings have a quantity and buy price, so the money figures cover the whole list.</p>
            : <div className="mi7-cov">
              <div className="mi7-bar" role="img" aria-label={`${have} of ${n} holdings have a quantity and buy price`}><i style={{ width: `${n ? (have / n) * 100 : 0}%` }} /></div>
              <p><b>Money figures cover {have} of {n} holdings.</b> {have === 0 ? <>None has a quantity and buy price yet; </> : have <= 3 ? <>Only {haveNames.map((x, i) => <span key={x}>{i > 0 ? (i === haveNames.length - 1 ? " and " : ", ") : ""}{d.shares.some((s) => s.symbol === x) ? <Link to={`/stocks/${encodeURIComponent(x)}`}>{x}</Link> : x}</span>)} {have === 1 ? "has" : "have"} a quantity and buy price; </> : null}
                the other {n - have} count in every reading but not in the money{!d.byValue && nKinds > 1 ? <>, and each kind counts as {frac}</> : null}. <button type="button" className="mi7-lnk" onClick={openQty}>Add quantities</button></p>
            </div>}
        </section>
        <section className="mi7-box mi7-ports" aria-label="Your portfolios">
          <p className="mi7-k">Your portfolios{accs.length ? ` · ${accs.length}` : ""}<I k="Your portfolios" what="Every account from your three portfolio pages, by name. Picking one shows only its shares, funds and ETFs." read="Add, rename or remove an account on its portfolio page." /></p>
          <div className="mi7-plist" role="radiogroup" aria-label="Portfolio">
            {row(allRow)}
            {shown.map(row)}
          </div>
          {accs.length > 4 && <button type="button" className="mi7-lnk" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>{moreOpen ? "Fewer ▴" : `${accs.length - shown.length} more ▾`}</button>}
          <p className="mi7-add">+ Add portfolio: on the <Link to="/holdings">Equity</Link>, <Link to="/mf-portfolio">MF</Link> or <Link to="/etf-portfolio">ETF</Link> page</p>
        </section>
      </div>}
    </header>);
}

// ------------------------------------------------------------------------------------------------ the four views as tabs
const HI = "var(--mi7-hi)", MID = "var(--mi7-mid)", LO = "var(--mi7-lo)", NONE = "var(--mi7-none)";
const toneColor = (label: string) => ({ pos: HI, mid: MID, neg: LO, none: NONE })[toneOf(label === "Not rated" ? null : label)];

function tileOf(t: Tab, d: AllInvestments): { v: string; x: string; bar: { n: number; c: string; label: string }[]; empty?: string } {
  if (t === "all") {
    const kinds = kindsHeld(d), n = kinds.reduce((a, k) => a + d.counts[k], 0), frac = kinds.length === 3 ? "⅓" : kinds.length === 2 ? "½" : "";
    return { v: d.byValue && d.total != null ? rupees(d.total) : `${n} ${n === 1 ? "holding" : "holdings"}`,
      x: `${d.counts.shares} shares · ${d.counts.funds} ${d.counts.funds === 1 ? "fund" : "funds"} · ${d.counts.etfs} ETFs${!d.byValue && frac ? `, ${frac} each until you add quantities` : ""}`,
      bar: kinds.map((k) => ({ n: d.cards[k].share, c: `var(--mi-${k})`, label: `${KIND_NAME[k]} ${pctOf(d.cards[k].share, 0)}` })) };
  }
  const k = TAB_KIND[t], c = d.cards[k];
  if (!c.count) return { v: "None yet", x: `Nothing on your ${t === "equity" ? "Equity" : t === "mf" ? "MF" : "ETF"} portfolio yet.`, bar: [], empty: "none" };
  const bands = (c.bands ?? []).filter((b) => b.count > 0);
  if (t === "equity") {
    const model = MODEL_NAME[c.scoreModel ?? "iq"].replace(/^FinLit /, "");
    return { v: `${c.score != null ? `${model} ${nf(c.score, 0)}` : `${model}: not rated`} · Beta ${betaTxt(c.beta)}`,
      x: `${c.count} ${c.count === 1 ? "share" : "shares"}${bands.length ? " · " + bands.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(" · ") : ""}`,
      bar: bands.map((b) => ({ n: b.count, c: toneColor(b.label), label: `${b.count} ${b.label}` })) };
  }
  if (t === "mf") {
    const one = c.count === 1, word = one ? d.funds[0]?.label : c.scoreWord;
    return { v: c.scoreLocked ? "Mutual Fund Score on Gold" : c.score != null ? `Score ${nf(c.score, 0)}${word ? ` · ${word}` : ""}` : "No Mutual Fund Score yet",
      x: `${c.count} ${one ? "fund" : "funds"} · Beta ${betaTxt(c.beta)} against the Nifty 500`,
      bar: c.scoreLocked ? [] : bands.map((b) => ({ n: b.count, c: toneColor(b.label), label: `${b.count} ${b.label}` })) };
  }
  const types = c.types ?? [];
  return { v: `${c.ter != null ? `${pctOf(c.ter, 2)} a year` : "Cost not published"} · Beta ${betaTxt(c.beta)}`,
    x: `${c.count} ETFs${types.length ? ": " + types.map((x) => x.label.toLowerCase()).join(", ") : ""}`,
    bar: types.map((x, i) => ({ n: x.count, c: `var(--mi7-type${i % 4})`, label: `${x.count} ${x.label}` })) };
}

export function ViewTiles({ d, view, onView, seen }: { d: AllInvestments; view: Tab; onView: (t: Tab) => void; seen: Set<Tab> }) {
  const left = VIEW_ORDER.filter((t) => !seen.has(t));
  return (
    <section className="mi7-views" id="mi-tabs" aria-label="The views">
      <div className="mi7-vhead" id="mi7-vhint"><b>Everything, seen 4 ways</b>
        <span className="mi7-prog" aria-hidden="true">{VIEW_ORDER.map((t) => <i key={t} className={seen.has(t) ? "on" : ""} />)}</span>
        <span>{seen.size} of 4 opened{left.length ? ` · ${left.map((t) => VIEW_NAME[t]).join(", ").replace(/, ([^,]*)$/, " and $1")} still to see` : " · every view seen"}</span></div>
      <div className="mi7-tiles" role="tablist" aria-label="All my investments views">
        {VIEW_ORDER.map((t) => {
          const on = t === view, tile = tileOf(t, d), fresh = !seen.has(t);
          return (
            <div key={t} className={"mi7-tile v-" + t + (on ? " on" : "") + (fresh ? " fresh" : "")} onClick={() => !on && onView(t)}>
              <p className="mi7-tk">{VIEW_NAME[t]}</p>
              {on ? <span className="mi7-state" title="You are on this view" role="tab" aria-selected="true" id={`mi-t-${t}`} aria-controls={`mi-p-${t}`} tabIndex={0}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg><span className="sr-only">{VIEW_NAME[t]}: you are on this view</span></span>
                : <button type="button" className="mi7-go" role="tab" aria-selected="false" id={`mi-t-${t}`} aria-describedby="mi7-vhint" onClick={(e) => { e.stopPropagation(); onView(t); }} title={`Go to ${VIEW_NAME[t]}`}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg><span className="sr-only">Go to {VIEW_NAME[t]}: inside: {insideOf(t, d)}</span></button>}
              <p className="mi7-tv">{tile.v}</p>
              <p className="mi7-tx">{tile.x}</p>
              {tile.bar.length > 0 && <span className="mi7-stk" role="img" aria-label={tile.bar.map((b) => b.label).join(", ")}>{tile.bar.map((b) => <i key={b.label} style={{ flex: Math.max(b.n, 0.5), background: b.c }} />)}</span>}
              <p className="mi7-what">{fresh && <span className="mi7-new">Not opened yet</span>}Inside: {insideOf(t, d)}</p>
            </div>);
        })}
      </div>
    </section>);
}

/** At the end of each view: a card to the next one. */
export function NextView({ d, view, onView }: { d: AllInvestments; view: Tab; onView: (t: Tab) => void }) {
  const next = VIEW_ORDER[(VIEW_ORDER.indexOf(view) + 1) % VIEW_ORDER.length];
  return (
    <div className="mi7-next">
      <button type="button" className={"mi7-nextb v-" + next} onClick={() => onView(next)}>
        <span className="mi7-k">Next view</span><b>{VIEW_NAME[next]}</b><small>Inside: {insideOf(next, d)}</small>
        <span className="mi7-go" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
      </button>
    </div>);
}
