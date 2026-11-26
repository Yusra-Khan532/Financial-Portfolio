// Task #277 (All my investments pack of 20 Nov 2026, changes 1, 2 and 16; the shared parts' spec is the Equity file §2 and §16):
//   TopCard    the compact top: the title row (plan, i, "Prices at close", Add quantities · Import ▾ · ⋯, no add box: change 1), then a money box that
//              says what it covers (value now; invested, gain or loss and holdings side by side; a bar for how many holdings have a quantity and buy price,
//              or a green line once every one has) and Your portfolios (All accounts and each account; past four, the three largest and "N more ▾").
//   MiCards    task #391 (developer file 35): the four views as calm cards with a crown each, "You are here" / "Open →" (they replaced task #277's
//              coloured view tiles and the "Everything, seen 4 ways" progress line; prefs.viewsSeen is left as it is stored).
//   NextView   at the end of each view, a card that leads on (All together → Equity → Mutual funds → ETFs → All together).
// Describes the member's lists; never advises. Styles: styles/mi7.css (class prefix mi7-), styles/mi391.css (mi391-).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { nf } from "../lib/format";
import { chg, rupees, type AllInvestments, type Kind, type KindMoney, type Tab } from "../lib/myInvest";
import { planName } from "../lib/planNames";
import { coLabel, headerStamp, moneyNote, viewCard } from "../lib/mi391";
import { CROWN } from "../mf/pack/MfTop";
import { I } from "./parts";
import "../styles/mi7.css";
import "../styles/mi391.css";

export const VIEW_ORDER: Tab[] = ["all", "equity", "mf", "etf"];
export const VIEW_NAME: Record<Tab, string> = { all: "All together", equity: "Equity", mf: "Mutual funds", etf: "ETFs" };

/** What is inside a view, as its tab says it ("Inside: your shares, how they are spread, risk"). */
export function insideOf(t: Tab, d: AllInvestments): string {
  if (t === "all") return "money, mix, every company, health, risk";
  if (t === "equity") return "your shares, how they are spread, risk";
  if (t === "mf") return `your ${d.counts.funds === 1 ? "fund" : "funds"}, what is inside, risk`;
  return "your ETFs, what is inside, risk";
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

export function TopCard({ d, money, allMoney, accs, cur, onPick, openQty, loading }: { d?: AllInvestments; money: Record<Kind | "all", KindMoney> | null;
  /** developer file 33: every account together, for the All accounts row (money is the picked account's when one is picked) */ allMoney?: Record<Kind | "all", KindMoney> | null;
  accs: AccRow[]; cur: string; onPick: (id: string) => void; openQty: () => void; loading: boolean }) {
  const m = money?.all, [moreOpen, setMoreOpen] = useState(false);
  const counts = d ? `${nf(d.counts.shares, 0)} share${d.counts.shares === 1 ? "" : "s"} · ${nf(d.counts.funds, 0)} fund${d.counts.funds === 1 ? "" : "s"} · ${nf(d.counts.etfs, 0)} ETF${d.counts.etfs === 1 ? "" : "s"}` : loading ? "Reading your three lists…" : "";
  const n = m?.n ?? 0, have = m ? m.n - m.missing.length : 0, all = n > 0 && have === n;
  const split = !!m && m.full > 0 && m.full < m.withQty;
  const haveNames = d && m ? [...d.shares.map((s) => ({ code: s.symbol, name: coLabel(s), link: true })), ...d.funds.map((f) => ({ code: f.short || f.name, name: f.short || f.name, link: false })), ...d.etfs.map((e) => ({ code: e.symbol, name: e.symbol, link: false }))].filter((x) => !m.missing.includes(x.code)) : [];
  const sorted = [...accs].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const fold = accs.length > 4 && !moreOpen;
  const shown = fold ? accs.filter((a) => a.id === cur || sorted.slice(0, 3).some((x) => x.id === a.id)) : accs;
  const am = allMoney?.all ?? m, an = am?.n ?? 0, ahave = am ? am.n - am.missing.length : 0;
  const allRow: AccRow = { id: "all", name: "All accounts", sub: `${an} ${an === 1 ? "holding" : "holdings"}`, value: am && am.now > 0 ? am.now : null, gainPct: am && ahave && am.invested ? (am.gain / am.invested) * 100 : null, color: "#3a3f4b", initial: "∑" };
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
          <h1 className="ui-title">All my investments</h1>
          {d && <span className="mi7-plan">{planName(d.plan)}</span>}
          <I k="All my investments" what="Your shares, mutual funds and ETFs read together: how much you have and where it sits, what it is made of, what you really own underneath, how healthy it is and how risky it is as a whole."
            read="This page reads your three portfolio lists. Add or remove a holding on its own page and it changes here. Nothing is sent to a broker." />
          {/* task #391 (developer file 41 v4, A1): the time of the prices inside the session, as the Equity page ("Prices at 10:16 · 26 Nov"); close after it */}
          {d && headerStamp(d) && <span className="mi7-asof">{headerStamp(d)}</span>}
        </div>
        <div className="mi7-acts">
          <button type="button" className="btn primary" disabled={!d} onClick={openQty}>{d?.byValue ? "Edit quantities" : "Add quantities"}</button>
          <Menu label="Import ▾" items={[{ to: "/holdings", text: "Shares: broker file on the Equity portfolio" }, { to: "/mf-portfolio?tab=import", text: "Mutual funds: CAS or statement on the MF portfolio" }, { to: "/etf-portfolio?tab=import", text: "ETFs: broker file on the ETF portfolio" }]} />
          <Menu label="⋯" more items={[{ to: "/holdings", text: "Equity portfolio" }, { to: "/mf-portfolio", text: "MF portfolio" }, { to: "/etf-portfolio", text: "ETF portfolio" }, { to: "#faq", text: "How it is counted" }]} />
          <span className="mi7-count" aria-live="polite">{counts}</span>
        </div>
      </div>
      {d && m && <div className="mi7-t2">
        <section className="mi7-box mi7-money" aria-label="All your investments">
          <p className="mi7-k">All your investments</p>
          {/* task #391 (developer file 35, fault 3): the big figure covers the same holdings as Invested and Gain beside it (those with a buy price); the value
              of every holding with a quantity sits on its own labelled line under them */}
          {m.now > 0 ? <p className="mi7-big">{rupees(split ? m.nowPriced : m.now)}<small>{split ? `value now, of the ${nf(m.full, 0)} with a buy price` : all ? "value now" : m.full ? `value now, of the ${nf(m.withQty, 0)} with a quantity and buy price` : `value now, of the ${nf(m.withQty, 0)} with a quantity`}</small></p> : <p className="mi7-big">{n} {n === 1 ? "holding" : "holdings"}<small>no quantities yet</small></p>}
          <div className="mi7-sub3">
            <div><span className="mi7-k">Invested</span><b>{have ? rupees(m.invested) : "—"}</b><small>what you paid</small></div>
            <div><span className="mi7-k">Gain or loss</span>{have && m.invested ? <b className={m.gain >= 0 ? "x-up" : "x-dn"}><span aria-hidden="true">{m.gain >= 0 ? "▲ " : "▼ "}</span>{rupees(Math.abs(m.gain))} <span className="mi7-pp">{chg((m.gain / m.invested) * 100)}</span></b> : <b>—</b>}<small>on what you invested</small></div>
            <div><span className="mi7-k">Holdings</span><b>{d.counts.shares} · {d.counts.funds} · {d.counts.etfs}</b><small>shares · funds · ETFs</small></div>
          </div>
          {split && <p className="mi391-allv"><span className="mi7-k">Value now of all {nf(m.withQty, 0)} with a quantity</span><b>{rupees(m.now)}</b></p>}
          {all ? <p className="mi7-cov ok" role="note">All {n} holdings have a quantity and buy price, so the money figures cover the whole list.</p>
            : <div className="mi7-cov">
              <div className="mi7-bar" role="img" aria-label={`${have} of ${n} holdings have a quantity and buy price`}><i style={{ width: `${n ? (have / n) * 100 : 0}%` }} /></div>
              {/* task #391 (fault 4): three sentences, each starting with a capital; the last one only while each kind still counts the same */}
              <p><b>Money figures cover {have} of {n} holdings.</b> {have === 0 ? <>None has a quantity and buy price yet. </> : have <= 3 ? <>Only {haveNames.map((x, i) => <span key={x.code}>{i > 0 ? (i === haveNames.length - 1 ? " and " : ", ") : ""}{x.link ? <Link to={`/stocks/${encodeURIComponent(x.code)}`}>{x.name}</Link> : x.name}</span>)} {have === 1 ? "has" : "have"} a quantity and buy price. </> : null}
                {/* task #391 (fault 1, with PR B): who is out of the money, who is out of the split (named), and the equal part only while a kind has no quantity */}
                {moneyNote(d, have, n).join(" ")} <button type="button" className="mi7-lnk" onClick={openQty}>Add quantities</button></p>
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

// ------------------------------------------------------------------------------------------------ the four views as calm cards
/** Task #391 (developer file 35, Top 1–5, Phone): four calm cards with a crown each (they replace the coloured tiles and the "Everything, seen 4 ways"
 *  progress line). The open one says "You are here", the others "Open →" and switch the view in the page, as before. On a phone they stack one per row
 *  with the name and the figure only. */
const CARD_COLOR: Record<Tab, string> = { all: "var(--mi7-type2)", equity: "var(--mi-shares)", mf: "var(--mi-funds)", etf: "var(--mi-etfs)" };
export function MiCards({ d, view, onView }: { d: AllInvestments; view: Tab; onView: (t: Tab) => void }) {
  return (
    <section className="mi391-strip" id="mi-tabs" aria-label="The four views">
      {VIEW_ORDER.map((t) => { const c = viewCard(t, d), on = t === view;
        return <button key={t} type="button" id={`mi-t-${t}`} className={"mi391-c" + (on ? " on" : "")} style={{ ["--vc" as string]: CARD_COLOR[t] }} aria-pressed={on}
          aria-label={`${c.k}: ${c.v}. ${on ? "You are here" : "Open this view"}`} onClick={() => { if (!on) onView(t); }}>
          {CROWN}
          <p className="mi391-k">{c.k}<em>{on ? "You are here" : "Open →"}</em></p>
          <p className="mi391-v">{c.v}</p>
          <p className="mi391-x">{c.x}</p>
          {c.b && <p className="mi391-b">{c.b}</p>}
        </button>; })}
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
