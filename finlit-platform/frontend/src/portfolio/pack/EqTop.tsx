// Task #274 (the 20 Nov equity pack, changes 2 and 16): the compact top of the Equity portfolio.
//   EqTitle     the title row: Equity portfolio · plan · (i) with the page description · "Prices at close · 20 Nov"; on the right the add row and ⋯
//               (MF portfolio, Watchlists, Alerts, Learn more, Clear portfolio…; Clear asks to confirm).
//   MoneyBox    Stocks: the portfolio picker ("All accounts · 15 shares ▾"); value now; Invested · Today · Gain or loss side by side with ▲▼ and % pills;
//               the day's best and worst share; "prices: 9 up · 6 down"; and what the money covers ("Money figures cover 1 of 15 shares…", a bar), or a
//               green line once every share has a quantity and buy price.
//   YourPortfolios  All accounts and the three largest, each with value and gain; more fold behind "N more ▾" (the open one always shows); tap one to
//               switch; + Add portfolio; Rename and Remove for the open one.
//   ScorePanel  "Your portfolio score is Fair" on a 0–100 scale with a marker (no labelled bands: the page does not publish its cut-offs).
//   ViewCards   Portfolio, Diversification, Risk drawn as tabs: the open one with a check, a heavier border and a notch; the others an arrow, opening
//               from anywhere on the card; "Your list, seen 3 ways"; a view not opened yet has an orange "Not opened yet" tag and edge (kept per member in
//               the account's settings, prefs.viewsSeen) and its arrow nudges three times after two seconds (not with reduced motion).
//   NextView    at the end of each view, a card that leads on (Portfolio → Diversification → Risk → Portfolio).
// Figures are the page's own (lib/ledger's Money, the score answer, lib/equityTop's tiles). Describes; never advice. Classes: eqx-.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Tip } from "../../components/sectors/pack/Common";
import { dayLabel } from "../../lib/holdingsColumns";
import type { Money } from "../../lib/ledger";
import { prefs, usePrefs } from "../../lib/prefs";
import { inr, pct } from "../money";
import { pfAvatar } from "../ViewKit";
import type { PfFigs, PfInfo } from "../Portfolios";
import type { View } from "./EquityPack";
import "./eq-top.css";
import { PageTabs } from "../../components/PageTabs";

export const EQ_VIEWS: View[] = ["portfolio", "diversification", "risk"];
export const EQ_VIEW_NAME: Record<View, string> = { portfolio: "Portfolio", diversification: "Diversification", risk: "Risk" };
export const EQ_INSIDE: Record<View, string> = { portfolio: "shares, trends, peers, leaders", diversification: "sectors, sizes, moving together", risk: "beta, swings, risk split, falls" };
const seenKey = (v: View) => `eq:${v}`;

/** The views opened once, kept with the member's settings (the same on every device); the open one counts as seen as soon as it is shown. */
export function useEqViewsSeen(open: View): Set<View> {
  const p = usePrefs();
  useEffect(() => { if (!p.viewsSeen.includes(seenKey(open))) prefs.set({ viewsSeen: [...p.viewsSeen, seenKey(open)] }); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  return new Set(EQ_VIEWS.filter((v) => v === open || p.viewsSeen.includes(seenKey(v))));
}

/** A small menu that closes on Esc (focus back on its button) or a click outside. */
function useMenu() {
  const [open, setOpen] = useState(false), box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector<HTMLButtonElement>("button")?.focus(); } };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, [open]);
  return { open, setOpen, box };
}

const DAY = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return Number.isNaN(+d) ? null : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

// ------------------------------------------------------------------------------------------------ title row
export function EqTitle({ plan, asOf, add, clear }: { plan: string; asOf: string | null | undefined; add: ReactNode; clear: ReactNode }) {
  const m = useMenu(), day = DAY(asOf);
  return (<>
    <div className="eqx-t1">
      <div className="eqx-ht">
        <h1 className="ui-title">Equity portfolio</h1><span className="eqx-plan">{plan}</span>
        <Tip text="How strong your shares are, how well spread they are, and how risky the whole list is. Start with names; add quantities when you want the figures to follow your money." how="Nothing is sent to a broker. Information only, not investment advice." label="About the Equity portfolio" />
        {day && <span className="eqx-asof">Prices at close · {day}</span>}
      </div>
      <div className="eqx-acts">
        {add}
        <span className="eqx-menu" ref={m.box}>
          <button type="button" className="pfx-btn eqx-more" aria-haspopup="menu" aria-expanded={m.open} aria-label="More: related pages and Clear portfolio" onClick={() => m.setOpen(!m.open)}>⋯</button>
          <span className="eqx-menu-m" role="menu" hidden={!m.open}>
            <Link role="menuitem" to="/mf-portfolio">MF portfolio</Link><Link role="menuitem" to="/watchlist">Watchlists</Link>
            <Link role="menuitem" to="/alerts">Alerts</Link><Link role="menuitem" to="/learn/portfolio">Learn more</Link>
            <span className="eqx-menu-sep" role="separator" />{clear}
          </span>
        </span>
      </div>
    </div>
    <PageTabs set="portfolios" className="pf-sibs" />{/* task #310 part D: the three portfolios as page tabs under the title */}
    </>);
}

// ------------------------------------------------------------------------------------------------ the money box
const Pill = ({ v, d = 1 }: { v: number; d?: number }) => <span className={"eqx-pp " + (v > 0 ? "up" : v < 0 ? "dn" : "")}>{pct(v, d)}</span>;
const Arrow = ({ v }: { v: number }) => (v === 0 ? null : <span aria-hidden="true" className={v > 0 ? "eqx-up" : "eqx-dn"}>{v > 0 ? "▲ " : "▼ "}</span>);
export type DayMove = { symbol: string; label: string; chg: number };

export function MoneyBox({ t, picker, best, worst, up, down, have, onAdd }: { t: Money; picker: ReactNode; best: DayMove | null; worst: DayMove | null; up: number; down: number;
  /** the shares that have a quantity and buy price (the money figures cover these) */ have: DayMove[] | { symbol: string; label: string }[]; onAdd: () => void }) {
  const todayPct = t.withQty && t.prev ? (t.today / t.prev) * 100 : null, gainPct = t.full && t.invested ? (t.gain / t.invested) * 100 : null;
  const all = t.n > 0 && t.full === t.n && t.withQty === t.n;
  const co = (x: { symbol: string; label: string }) => <Link key={x.symbol} to={`/stocks/${encodeURIComponent(x.symbol)}`}>{x.label}</Link>;
  return (
    <section className="eqx-box eqx-money" aria-label="Your stocks: value and money figures">
      <div className="eqx-mh"><span className="eqx-k">Stocks</span>{picker}</div>
      <p className="eqx-big">{t.withQty ? inr(t.now) : "—"}<small>{t.withQty ? "value now" : "value now: add quantities to see it"}</small></p>
      <div className="eqx-sub3">
        <div><span className="eqx-k">Invested</span><b>{t.full ? inr(t.invested) : "—"}</b><small>what you paid</small></div>
        <div><span className="eqx-k">Today</span>{t.withQty ? <b><Arrow v={t.today} />{inr(Math.abs(t.today))}{todayPct != null && <> <Pill v={todayPct} d={2} /></>}</b> : <b>—</b>}
          <small>prices: <span className="eqx-up">{up} up</span> · <span className="eqx-dn">{down} down</span></small></div>
        <div><span className="eqx-k">Gain or loss</span>{t.full ? <b><Arrow v={t.gain} />{inr(Math.abs(t.gain))}{gainPct != null && <> <Pill v={gainPct} /></>}</b> : <b>—</b>}<small>on what you invested</small></div>
        {t.nSales > 0 && <div><span className="eqx-k">Booked</span>{t.bookedOk ? <b><Arrow v={t.booked} />{inr(Math.abs(t.booked))}</b> : <b>—</b>}<small>{t.nSales} {t.nSales === 1 ? "sale" : "sales"}, first in, first out</small></div>}
      </div>
      {(best || worst) && <p className="eqx-day"><span className="eqx-k">Today</span>
        {best && <>best {co(best)} <span className="eqx-up">▲{Math.abs(best.chg).toFixed(2)}%</span></>}{best && worst && " · "}
        {worst && <>worst {co(worst)} <span className="eqx-dn">▼{Math.abs(worst.chg).toFixed(2)}%</span></>}</p>}
      {t.rate.length > 0 && <p className="eqx-rate" role="note"><b>Buy prices from your statement's Rate.</b> For {t.rate.length === t.n ? `all ${t.n} shares` : `${t.rate.length} of ${t.n} shares`} it is the price{dayLabel(t.rateOn) ? ` of ${dayLabel(t.rateOn)}` : " on the statement's date"}: what the shares were worth that day, not what you paid. So Invested is their value{dayLabel(t.rateOn) ? ` on ${dayLabel(t.rateOn)}` : " that day"}, and Gain or loss counts from that day. Type what you paid under Edit to change it.</p>}
      {t.n > 0 && (all ? <p className="eqx-cov ok" role="note">All {t.n} shares have a quantity and buy price, so the money figures cover the whole list.</p>
        : <div className="eqx-cov">
          <span className="eqx-bar" role="img" aria-label={`${have.length} of ${t.n} shares have a quantity and buy price`}><i style={{ width: `${(have.length / t.n) * 100}%` }} /></span>
          <p><b>Money figures cover {have.length} of {t.n} shares.</b> {have.length === 0 && t.withQty > 0 ? <>None has a buy price yet, so Invested and Gain or loss stay blank; value now covers {t.withQty} of {t.n}. All {t.n} </>
            : have.length === 0 ? <>None has a quantity and buy price yet; the {t.n} </>
            : have.length <= 3 ? <>Only {have.map((x, i) => <span key={x.symbol}>{i ? (i === have.length - 1 ? " and " : ", ") : ""}{co(x)}</span>)} {have.length === 1 ? "has" : "have"} a quantity and buy price; the other {t.n - have.length} </>
            : <>The other {t.n - have.length} </>}count in every score but not in the money. <button type="button" className="eqx-lnk" onClick={onAdd}>Add buys</button></p>
        </div>)}
    </section>);
}

/** "All accounts · 15 shares ▾": the portfolio picker in the money box. */
export function PfPicker({ list, cur, figs, onPick }: { list: PfInfo[]; cur: string | "all"; figs: (id: string | "all") => PfFigs; onPick: (id: string | "all") => void }) {
  const m = useMenu(), rows = [{ id: "all", name: "All accounts" }, ...list], c = rows.find((x) => x.id === cur) ?? rows[0], a = pfAvatar(list, c.id), n = figs(c.id).n;
  if (list.length < 2) return <span className="eqx-pick static"><span className="acc-av" style={{ ["--av" as string]: a.av }} aria-hidden="true">{a.ini}</span>{c.name} · {n} {n === 1 ? "share" : "shares"}</span>;
  return (
    <span className="eqx-menu" ref={m.box}>
      <button type="button" className="eqx-pick" aria-haspopup="menu" aria-expanded={m.open} aria-label={`Portfolio: ${c.name}, ${n} ${n === 1 ? "share" : "shares"}. Switch portfolio`} onClick={() => m.setOpen(!m.open)}>
        <span className="acc-av" style={{ ["--av" as string]: a.av }} aria-hidden="true">{a.ini}</span>{c.name} · {n} {n === 1 ? "share" : "shares"} <i aria-hidden="true">▾</i></button>
      <span className="eqx-menu-m" role="menu" hidden={!m.open}>{rows.map((x) => { const f = figs(x.id);
        return <button key={x.id} type="button" role="menuitemradio" aria-checked={x.id === cur} onClick={() => { m.setOpen(false); onPick(x.id); }}>{x.name}<small>{f.n} {f.n === 1 ? "share" : "shares"}</small></button>; })}</span>
    </span>);
}

// ------------------------------------------------------------------------------------------------ your portfolios
export function YourPortfolios({ list, cur, figs, onPick, onAdd, onRename, onRemove, max }: { list: PfInfo[]; cur: string | "all"; figs: (id: string | "all") => PfFigs;
  onPick: (id: string | "all") => void; onAdd: () => void; onRename: (id: string, name: string) => string | null; onRemove: (id: string) => void; max: number }) {
  const [more, setMore] = useState(false), [mode, setMode] = useState<"" | "ren" | "rm">(""), [name, setName] = useState(""), [err, setErr] = useState("");
  useEffect(() => { setMode(""); setErr(""); }, [cur]);
  const sorted = [...list].sort((a, b) => (figs(b.id).now || 0) - (figs(a.id).now || 0)), top3 = sorted.slice(0, 3).map((x) => x.id);
  const fold = list.length > 3 && !more, shown = fold ? list.filter((x) => top3.includes(x.id) || x.id === cur) : list, sel = list.find((x) => x.id === cur);
  const row = (id: string, nm: string) => { const f = figs(id), a = pfAvatar(list, id);
    return <button key={id} type="button" role="radio" aria-checked={cur === id} onClick={() => onPick(id)}>
      <span className="acc-av" style={{ ["--av" as string]: a.av }} aria-hidden="true">{a.ini}</span>
      <span className="eqx-pn"><b>{nm}</b><small>{f.n} {f.n === 1 ? "share" : "shares"}</small></span>
      <span className="eqx-pv">{f.withQty ? <><b>{inr(f.now)}</b>{f.gainPct != null && <small className={f.gainPct >= 0 ? "eqx-up" : "eqx-dn"}>{pct(f.gainPct)}</small>}</> : <small>no buys yet</small>}</span></button>; };
  return (
    <section className="eqx-box eqx-ports" aria-labelledby="eqx-pk">
      <div className="eqx-ph"><p className="eqx-k" id="eqx-pk">Your portfolios · {list.length}<Tip text="One portfolio for each broker account. All accounts adds them up and scores them as one list." how="Tap one to show only its shares. New shares go to the portfolio you pick in the Add window." label="About Your portfolios" /></p>
        <button type="button" className="eqx-lnk" onClick={onAdd} disabled={list.length >= max} title={list.length >= max ? `Up to ${max} portfolios` : undefined}>+ Add portfolio</button></div>
      <div className="eqx-plist" role="radiogroup" aria-label="Portfolio">{row("all", "All accounts")}{shown.map((x) => row(x.id, x.name))}</div>
      {list.length > 3 && <button type="button" className="eqx-lnk" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Fewer ▴" : `${list.length - shown.length} more ▾`}</button>}
      {sel && <p className="eqx-pact"><button type="button" className="eqx-lnk" onClick={() => { setMode("ren"); setName(sel.name); setErr(""); }}>Rename {sel.name}</button>
        {list.length > 1 && <> · <button type="button" className="eqx-lnk del" onClick={() => setMode("rm")}>Remove</button></>}</p>}
      {sel && mode === "ren" && <form className="acc-confirm ren" onSubmit={(e) => { e.preventDefault(); const why = onRename(sel.id, name); if (why) setErr(why); else setMode(""); }}>
        <label htmlFor="eqx-ren">New name</label><input id="eqx-ren" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
        <button type="submit" className="go">Save</button><button type="button" onClick={() => setMode("")}>Cancel</button>{err && <p className="acc-err" role="alert">{err}</p>}</form>}
      {sel && mode === "rm" && <div className="acc-confirm" role="alertdialog" aria-label={`Remove ${sel.name}`}>
        <span>Remove {sel.name} and its {figs(sel.id).n} {figs(sel.id).n === 1 ? "share" : "shares"} from FinLit? Nothing changes at your broker. This cannot be undone.</span>
        <button type="button" className="go del" onClick={() => { onRemove(sel.id); setMode(""); }} autoFocus>Remove</button><button type="button" onClick={() => setMode("")}>Cancel</button></div>}
    </section>);
}

// ------------------------------------------------------------------------------------------------ the score
export function ScorePanel({ total, band, missing, shares, onAdd, locked }: { total: number | null; band?: string | null; missing: number; shares: number; onAdd: () => void; locked?: boolean }) {
  const v = total == null ? null : Math.max(0, Math.min(100, total));
  return (
    <section className="eqx-score" aria-labelledby="eqx-sk">
      <p className="eqx-sk" id="eqx-sk">Your portfolio score<Tip text="One number from 0 to 100 that sums up how strong the shares are, how well spread, how risky against the index, the price trend, valuation and concentration." how="Higher reads stronger on those together. Once every holding has its buys, each share counts by its value now." label="About Your portfolio score" /></p>
      {locked ? <p className="eqx-sv">Worked out from FinLit Prism, part of the Gold plan. <Link to="/plans">See plans</Link></p> : <>
        <p className="eqx-sv">{v == null ? "Your portfolio score is being worked out…" : <>Your portfolio score is <b>{band || `${Math.round(v)} of 100`}</b></>}</p>
        <div className="eqx-scale" role="img" aria-label={v == null ? "Score not worked out yet" : `${Math.round(v)} on a scale of 0 to 100`}>
          {v != null && <span className="eqx-mark" style={{ left: `${v}%` }}><b>{Math.round(v)}</b><i aria-hidden="true" /></span>}
          <span className="eqx-grad" aria-hidden="true" /><span className="eqx-ticks" aria-hidden="true">{[0, 25, 50, 75, 100].map((x) => <span key={x}>{x}</span>)}</span>
        </div>
        <p className="eqx-sx">{missing ? <>Add buys for {missing} {missing === 1 ? "share" : "shares"} to weight the score by value now. <button type="button" className="eqx-lnk" onClick={onAdd}>Add buys</button></> : `Weighted by value now across ${shares} ${shares === 1 ? "share" : "shares"}.`}</p>
      </>}
    </section>);
}

// ------------------------------------------------------------------------------------------------ the three views as tabs
export type ViewCard = { id: View; v: string; x: string; help: string; how: string; bar?: { n: number; c: string; label: string }[] };
const CHECK = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const ARROW = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

export function ViewCards({ cards, view, onView, seen }: { cards: ViewCard[]; view: View; onView: (v: View) => void; seen: Set<View> }) {
  const left = EQ_VIEWS.filter((v) => !seen.has(v));
  const key = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? cards.length - 1 : null;
    if (n == null) return;
    e.preventDefault(); const d = cards[(n + cards.length) % cards.length]; onView(d.id); setTimeout(() => document.getElementById(`eq-tab-${d.id}`)?.focus(), 0);
  };
  return (
    <section className="eqx-views" aria-label="The three views">
      <p className="eqx-vh" id="eqx-vhint"><b>Your list, seen 3 ways</b>
        <span className="eqx-prog" aria-hidden="true">{EQ_VIEWS.map((v) => <i key={v} className={seen.has(v) ? "on" : ""} />)}</span>
        <span>{seen.size} of 3 opened{left.length ? ` · ${left.map((v) => EQ_VIEW_NAME[v]).join(" and ")} still to see` : " · every view seen"}</span></p>
      <div className="eqx-tiles" role="tablist" aria-label="Equity portfolio views">{cards.map((c, i) => { const on = c.id === view, fresh = !seen.has(c.id);
        return <div key={c.id} className={"eqx-tile v-" + c.id + (on ? " on" : "") + (fresh ? " fresh" : "")} onClick={() => !on && onView(c.id)}>
          <p className="eqx-tk">{EQ_VIEW_NAME[c.id]}<span onClick={(e) => e.stopPropagation()}><Tip text={c.help} how={c.how} label={`About ${EQ_VIEW_NAME[c.id]}`} /></span></p>
          <button type="button" role="tab" id={`eq-tab-${c.id}`} aria-selected={on} aria-controls="eq-panel" tabIndex={on ? 0 : -1} className={on ? "eqx-state" : "eqx-go"} aria-describedby="eqx-vhint"
            onClick={(e) => { e.stopPropagation(); onView(c.id); }} onKeyDown={(e) => key(e, i)} title={on ? "You are on this view" : `Go to ${EQ_VIEW_NAME[c.id]}`}>
            {on ? CHECK : ARROW}<span className="sr-only">{EQ_VIEW_NAME[c.id]}{on ? ": you are on this view" : `: inside: ${EQ_INSIDE[c.id]}`}</span></button>
          <p className="eqx-tv">{c.v}</p><p className="eqx-tx">{c.x}</p>
          {c.bar && c.bar.length > 0 && <span className="eqx-stk" role="img" aria-label={c.bar.map((b) => b.label).join(", ")}>{c.bar.map((b, j) => <i key={j} style={{ flex: Math.max(b.n, 0.5), background: b.c }} />)}</span>}
          <p className="eqx-what">{fresh && <span className="eqx-new">Not opened yet</span>}Inside: {EQ_INSIDE[c.id]}</p>
        </div>; })}</div>
    </section>);
}

/** At the end of each view: a card to the next one (Portfolio → Diversification → Risk → Portfolio). */
export function NextView({ view, onView }: { view: View; onView: (v: View) => void }) {
  const next = EQ_VIEWS[(EQ_VIEWS.indexOf(view) + 1) % EQ_VIEWS.length];
  return (
    <div className="eqx-next">
      <button type="button" className={"eqx-nextb v-" + next} onClick={() => onView(next)}>
        <span className="eqx-k">Next view</span><b>{EQ_VIEW_NAME[next]}</b><small>Inside: {EQ_INSIDE[next]}</small><span className="eqx-go" aria-hidden="true">{ARROW}</span>
      </button>
    </div>);
}
