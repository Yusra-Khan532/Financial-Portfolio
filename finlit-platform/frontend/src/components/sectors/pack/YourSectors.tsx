// Task #448 (Sector Pulse, developer file 42): the member's own sectors.
//  - MySectorsAlert (02 §1.2): one alert for all the member's sectors, the same setting on Today and on Your sectors. Two kinds: when one changes state on Sector
//    Pulse, when one changes box on Sector Rotation; kept in prefs.sectorAlerts as "state:<view>:mine" / "box:<view>:mine" (finlit/sector_alerts.py expands
//    "mine" to the groups of the shares held at each Friday run, so shares added later are covered; it counts as one alert).
//  - PeerPills (04 §2): each share as a pill coloured by its label against its own sector over 6 months, Leaders first, 4 then "+N more ▾" (3 on a phone).
//  - ForYouCard (02 §1.2): "For you this week" on Today.
//  - YourShort (02 §2): the short grouped view of "How your sectors are doing".
// Figures from lib/yourSectors.ts; peer labels from /api/sectors/<slug> (Gold and up; below that the pills carry no label). Describes, never advises.
// Styles: styles/pulse448.css (sx-yr, sx-fy, sx-pl, sx-ma).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { prefs, usePrefs } from "../../../lib/prefs";
import { useUI } from "../../../lib/ui";
import { useIsPhone } from "../../PhoneFold";
import { gl, sq, tw, wordsShow } from "../../../lib/groupWords";
import type { Board, IndustryPage } from "../../../lib/sectors";
import type { SectorHistory, StateKey } from "../../../lib/sectorHistory";
import { BOX, COLOUR, MEANING, ORDER, meansForYou, risingOf, short } from "../../../lib/pulsePack";
import { byPeer, forYou, pct, shares, stayLine, timeInState, typicalWeeks, valueOf, yourGroups, yourLead, type HeldShare, type NextRow, type PeerWord, type YourGroup } from "../../../lib/yourSectors";
import { BoxChip, StateChip, Tip } from "./Common";

// ------------------------------------------------------------------------------------------------ the drawn bell (07 M8: one bell icon everywhere)
export const BellIcon = () => <svg className="sx-bell" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;

// ------------------------------------------------------------------------------------------------ one alert for all your sectors
const MINE_KINDS = [{ k: "state", label: "When one changes state on Sector Pulse" }, { k: "box", label: "When one changes box on Sector Rotation" }] as const;
export function MySectorsAlert({ count }: { count: number }) {
  const { user } = useAuth(), { plan } = useUI(), phone = useIsPhone();
  const view = wordsShow(), ns = view === "sectors" ? "sectors" : "industries";
  const all = usePrefs().sectorAlerts ?? [];
  const set = MINE_KINDS.map((x) => x.k).filter((k) => all.includes(`${k}:${view}:mine`));
  const on = set.length > 0;
  const [open, setOpen] = useState(false), [pick, setPick] = useState<string[]>(["state", "box"]);
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null), id = "sx-ma-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>("input, button")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !box.current?.contains(t)) setOpen(false); };
    addEventListener("keydown", key); addEventListener("mousedown", away);
    return () => { removeEventListener("keydown", key); removeEventListener("mousedown", away); };
  }, [open]);
  const save = (kinds: string[]) => {
    const rest = all.filter((e) => !e.endsWith(`:${view}:mine`));
    prefs.set({ sectorAlerts: [...rest, ...kinds.map((k) => `${k}:${view}:mine`)] });
    setOpen(false); btn.current?.focus();
  };
  const label = on ? (phone ? "Alert on ✓" : `Alert on for your ${ns} ✓`) : (phone ? "Get alerts" : `Get an alert when your ${ns} change`);
  return (
    <span className="sx-ma">
      <button ref={btn} type="button" className={"sx-ma-b" + (on ? " on" : "")} aria-expanded={open} aria-controls={id} onClick={() => { setPick(on ? set : ["state", "box"]); setOpen((v) => !v); }}><BellIcon />{label}</button>
      {open && <div ref={box} id={id} className="sx-ma-pop" role="dialog" aria-label={`One alert for all ${count} of your ${ns}`}>
        <b>One alert for all {count} of your {ns}</b>
        {!user ? <p><Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link> to set this alert.</p>
          : plan === "basic" ? <p>Alerts on your {ns} come with the Platinum plan, as the rest of this page.</p>
          : <>
            {MINE_KINDS.map((x) => <label key={x.k}><input type="checkbox" checked={pick.includes(x.k)} onChange={(e) => setPick(e.target.checked ? [...pick, x.k] : pick.filter((k) => k !== x.k))} />{x.label}</label>)}
            <p>Sent after the Friday update. {tw("Industries")} of shares you add later are covered too.</p>
            <div>{on ? <button type="button" className="sx-go2" onClick={() => save([])}>Turn off</button>
              : <button type="button" className="sx-go" disabled={!pick.length} onClick={() => save(pick)}>Turn on</button>}
              {on && pick.length > 0 && <button type="button" className="sx-go" onClick={() => save(pick)}>Save</button>}
              <button type="button" className="sx-go2" onClick={() => { setOpen(false); btn.current?.focus(); }}>Cancel</button></div>
          </>}
      </div>}
    </span>
  );
}

// ------------------------------------------------------------------------------------------------ peer labels
const PEER_CLASS: Record<string, string> = { Leader: "lead", "In line": "line", Laggard: "lag" };
/** The member's shares' peer labels, from each of their groups' pages (Gold and up). Symbol -> label; a share its page does not count has no label. */
export function usePeerLabels(slugs: string[]): Map<string, PeerWord> {
  const view = wordsShow();
  const qs = useQueries({ queries: slugs.map((slug) => ({ queryKey: ["sectors", "page", slug, view], queryFn: () => apiGet<IndustryPage>(`/api/sectors/${encodeURIComponent(slug)}` + sq()), staleTime: 300_000, retry: false })) });
  return useMemo(() => {
    const m = new Map<string, PeerWord>();
    for (const q of qs) for (const s of q.data?.stocks ?? []) if (s.peer_label === "Leader" || s.peer_label === "In line" || s.peer_label === "Laggard") m.set(s.symbol.toUpperCase(), s.peer_label);
    return m;
  }, [qs.map((q) => q.dataUpdatedAt).join(",")]);   // eslint-disable-line react-hooks/exhaustive-deps
}
export function PeerPills({ syms, labels, groupName }: { syms: { symbol: string; wl?: boolean }[]; labels: Map<string, PeerWord>; groupName: string }) {
  const [open, setOpen] = useState(false), phone = useIsPhone(), first = phone ? 3 : 4;
  const list = byPeer(syms.map((s) => ({ ...s, label: labels.get(s.symbol) ?? null })));
  const shown = open ? list : list.slice(0, first);
  return (
    <span className="sx-peerpills">{shown.map((s) => <Link key={s.symbol} to={`/stocks/${s.symbol}`} className={"sx-pl sx-pl-" + (s.label ? PEER_CLASS[s.label] : "none") + (s.wl ? " sx-wl" : "")}
      title={`${s.symbol}: ${s.label ? `${s.label} in its ${tw("industry")}` : "no label"}${s.wl ? " (watchlist)" : ""}`} aria-label={`${s.symbol}, ${s.label ?? "no label"}`}><i aria-hidden="true" />{s.symbol}</Link>)}
      {list.length > first && <button type="button" className="sx-pmore2" aria-expanded={open} aria-label={open ? `Show fewer of your shares in ${groupName}` : `Show ${list.length - first} more of your shares in ${groupName}`} onClick={() => setOpen(!open)}>{open ? "Show fewer ▴" : `+${list.length - first} more ▾`}</button>}
    </span>
  );
}

// ------------------------------------------------------------------------------------------------ For you this week (Today)
export function ForYouCard({ b, h, held, labels, labelOf }: { b: Board; h: SectorHistory | undefined; held: HeldShare[]; labels: Map<string, PeerWord>; labelOf: (k: StateKey) => string }) {
  const noun = wordsShow() === "sectors" ? "sector" : "industry", ns = noun === "sector" ? "sectors" : "industries";
  const groups = useMemo(() => yourGroups(b.rows, held, h), [b.rows, held, h]);
  if (!groups.length) return null;
  const f = forYou(groups, held, noun);
  const total = f.total, nShares = held.length;
  return (
    <section className="sx-fy" aria-labelledby="sx-fy-t" data-testid="for-you">
      <div className="sx-fy-h"><h3 id="sx-fy-t" className="sx-fy-t">For you this week</h3><span className="sx-fy-sub">Your {nShares} {nShares === 1 ? "share" : "shares"}, in {groups.length} {groups.length === 1 ? noun : ns}</span>
        <MySectorsAlert count={groups.length} /></div>
      <p className="sx-fy-lead"><b>{f.head.b}</b>{f.head.rest}</p>
      {f.value && <p className="sx-fy-val">{f.value}</p>}
      {f.state && <p className="sx-fy-mean"><b>{labelOf(f.state)}</b> means {lcFirst(MEANING_PLAIN[f.state](noun))}</p>}
      {f.changed.length > 0 && <div className="sp-scroll" role="region" aria-label={`Your ${ns} that changed this week`} tabIndex={0}><table className="sp-tb sx-fy-t">
        <thead><tr><th scope="col">{noun === "sector" ? "Sector" : "Industry"}</th><th scope="col">This week</th><th scope="col">Your shares</th>
          <th scope="col" className="r">Of your portfolio<Tip label="About “Of your portfolio”" text={`How much of your portfolio's value sits in this ${noun}. Each share counts as quantity × its last close, so a big holding counts more than a small one.`} /></th></tr></thead>
        <tbody>{f.changed.map((g) => (
          <tr key={g.row.slug}><td><Link className="sp-ind" to={gl(g.row.slug)}>{short(g.row.name)}</Link></td>
            <td><StateChip k={g.key} /><small className="sx-was">was {labelOf(g.was!)}</small>
              {g.row.rotation?.corner && g.row.rotation.corner !== "middle" && <small className="sx-was">On Sector Rotation: <b>{BOX[g.row.rotation.corner].word}</b></small>}</td>
            <td><PeerPills syms={g.shares.map((s) => ({ symbol: s.symbol }))} labels={labels} groupName={short(g.row.name)} /></td>
            <td className="r">{total > 0 ? pct((g.value / total) * 100) : "–"}</td></tr>))}</tbody>
      </table></div>}
      <p className="sx-fy-end"><button type="button" className="sx-tlink" onClick={() => document.dispatchEvent(new CustomEvent("finlit:step", { detail: "yours" }))}>See all your {ns} →</button></p>
    </section>
  );
}
const lcFirst = (s: string) => s[0].toLowerCase() + s.slice(1);
/** 02 §1.2 fix 3: the label's meaning where it first appears, from the labels card (04 §4). */
export const MEANING_PLAIN: Record<StateKey, (n: string) => string> = {
  rising: (n) => `Most of the ${n}'s stocks are above their short, medium and longer-term price levels. The rise is broad, not carried by a few names.`,
  bouncing: (n) => `After a fall, most of the ${n}'s stocks turned up together within a few days. It is the first sign of a recovery, and it can still fade.`,
  crash: (n) => `The same broad bounce, but after a deep fall in which almost every stock in the ${n} hit a new low.`,
  losing: (n) => `A bounce or a rise that is losing support: fewer of the ${n}'s stocks are still going up.`,
  sold_off: (n) => `Most of the ${n}'s stocks have fallen below their usual price level, and they have not turned up together yet.`,
  no_signal: (n) => `No sell-off, bounce or broad rise: the ${n}'s stocks are not moving together.`,
};

// ------------------------------------------------------------------------------------------------ the short "Your sectors" view
export function useTypicalWeeks() {
  const view = wordsShow();
  const q = useQuery<{ rows: NextRow[] }, ApiError>({ queryKey: ["sector-next", view], queryFn: () => apiGet("/api/sector-next" + sq()), staleTime: 3_600_000, retry: false });
  return useMemo(() => typicalWeeks(q.data?.rows), [q.data]);
}
export function YourShort({ b, h, held, by, labels, labelOf, wlSet }: { b: Board; h: SectorHistory | undefined; held: HeldShare[]; by: "value" | "count"; labels: Map<string, PeerWord>; labelOf: (k: StateKey) => string; wlSet: Set<string> }) {
  const noun = wordsShow() === "sectors" ? "sector" : "industry", ns = noun === "sector" ? "sectors" : "industries", phone = useIsPhone();
  const groups = useMemo(() => yourGroups(b.rows, held, h), [b.rows, held, h]);
  const usual = useTypicalWeeks();
  const [tab, setTab] = useState<StateKey | "all">("all"), [more, setMore] = useState<Set<StateKey>>(new Set());
  const total = held.reduce((a, x) => a + valueOf(x), 0);
  const lead = yourLead(groups, held, by, noun);
  const states = ORDER.filter((k) => groups.some((g) => g.key === k));
  const segs = (() => {   // the stacked bar: one segment per state, sized by value or by count; shares with no group grey
    const vals = states.map((k) => groups.filter((g) => g.key === k).reduce((a, g) => a + (by === "value" ? g.value : 1), 0));
    const none = by === "value" ? held.filter((x) => !x.slug).reduce((a, x) => a + valueOf(x), 0) : 0;
    const p = shares([...vals, none]);
    return [...states.map((k, i) => ({ k: k as StateKey | "none", p: p[i] })), { k: "none" as const, p: p[p.length - 1] }].filter((x) => x.p > 0);
  })();
  const peer = (() => {
    const all = groups.flatMap((g) => g.shares.map((s) => ({ s, g })));
    const n = (w: PeerWord) => all.filter((x) => (labels.get(x.s.symbol) ?? null) === w).length;
    const big = [...groups].sort((a, c) => c.value - a.value)[0];
    const inBig = big ? groups.filter((g) => g.key === big.key).flatMap((g) => g.shares) : [];
    const leaders = inBig.filter((s) => labels.get(s.symbol) === "Leader").length;
    return { lead: n("Leader"), line: n("In line"), lag: n("Laggard"), none: n(null), note: big && inBig.length >= 3 ? `In ${groupWord(big.key, ns)}, ${leaders} of your ${inBig.length} shares ${leaders === 1 ? "is a Leader" : "are Leaders"}.` : null };
  })();
  if (!groups.length) return null;
  const shown = tab === "all" ? states : [tab];
  return (
    <div className="sx-yr">
      {lead && <p className="sx-yr-lead"><b>{lead.b}</b>{lead.rest}</p>}
      <div className="sx-vbar" role="img" aria-label={segs.map((s) => `${s.k === "none" ? `no NSE ${noun}` : labelOf(s.k)} ${pct(s.p)}`).join(", ")}>
        {segs.map((s) => <i key={s.k} style={{ width: `${s.p}%`, background: s.k === "none" ? undefined : COLOUR[s.k] }} className={s.k === "none" ? "sx-vbar-none" : undefined} />)}</div>
      <p className="sx-peerline">Your shares against their own {noun}<Tip label={`About “Your shares against their own ${noun}”`} text={`Each share is compared with the other stocks in its own ${noun} over 6 months. Leader: ahead of most of them. In line: in the middle. Laggard: behind most of them. No label: too few comparable stocks.`} />:
        <span className="sx-pl sx-pl-lead"><i aria-hidden="true" />{peer.lead} {peer.lead === 1 ? "Leader" : "Leaders"}</span><span className="sx-pl sx-pl-line"><i aria-hidden="true" />{peer.line} In line</span>
        <span className="sx-pl sx-pl-lag"><i aria-hidden="true" />{peer.lag} {peer.lag === 1 ? "Laggard" : "Laggards"}</span><span className="sx-pl sx-pl-none"><i aria-hidden="true" />{peer.none} No label</span>
        {peer.note && <span className="sx-peernote">{peer.note}</span>}</p>
      <div className="sx-fl sx-stabs" role="group" aria-label={`Your ${ns} by state`}>
        <button type="button" aria-pressed={tab === "all"} onClick={() => setTab("all")}>All <small>{groups.length}</small></button>
        {states.map((k) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}><i className="sx-dot" style={{ background: COLOUR[k] }} aria-hidden="true" />{labelOf(k)} <small>{groups.filter((g) => g.key === k).length}</small></button>)}
      </div>
      {phone ? <p className="sx-yr-keys">Time in a state<Tip label="About “Time in a state”" text={TIME_HELP_OF(noun, ns)} /> · % of your portfolio<Tip label="About “% of your portfolio”" text={VALUE_HELP(noun)} /> · Share colours<Tip label="About “Share colours”" text={SHARES_HELP(noun)} /></p>
        : <div className="sx-yr-hd" aria-hidden="false">
          <span>{noun === "sector" ? "Sector" : "Industry"}<Tip label="About “Time in a state”" text={TIME_HELP_OF(noun, ns)} />{groups.some((g) => stayLine(timeInState(h, g.row.slug), usual[g.key])?.long) && <small className="sx-longkey"><i className="sx-long" aria-hidden="true" /> longer than its usual stay</small>}</span>
          <span>Box on Sector Rotation</span><span>Stocks rising{by === "value" ? " · % of your portfolio" : ""}<Tip label="About “% of your portfolio”" text={VALUE_HELP(noun)} /></span>
          <span>Your shares<Tip label="About “Your shares”" text={SHARES_HELP(noun)} /></span></div>}
      {shown.map((k) => {
        const gs = groups.filter((g) => g.key === k).sort((a, c) => c.value - a.value), nSh = gs.reduce((a, g) => a + g.shares.length, 0), v = gs.reduce((a, g) => a + g.value, 0);
        const cut = gs.length > 6 && !more.has(k), rows = cut ? gs.slice(0, phone ? 4 : 5) : gs;
        const means = new Map<string, YourGroup[]>();
        for (const g of rows) { const m = meansForYou(g.row).text; means.set(m, [...(means.get(m) ?? []), g]); }
        const one = means.size === 1;
        return (
          <section key={k} className="sx-yr-card" aria-label={`${labelOf(k)}: ${gs.length} ${gs.length === 1 ? noun : ns}`}>
            <div className="sx-yr-ch"><StateChip k={k} /><span>{gs.length} {gs.length === 1 ? noun : ns} · {nSh} of your shares{by === "value" && total > 0 ? ` · ${pct((v / total) * 100)} of your portfolio` : ""}</span></div>
            {one && <p className="sx-yr-mean">{[...means.keys()][0]}</p>}
            {[...means.entries()].map(([m, list]) => (
              <div key={m}>{!one && <p className="sx-yr-mean">{m}</p>}
                {list.map((g) => { const st = stayLine(timeInState(h, g.row.slug), usual[g.key]), up = risingOf(g.row); return (
                  <div key={g.row.slug} className="sx-yr-row">
                    <span><Link className="sp-ind" to={gl(g.row.slug)}>{short(g.row.name)}</Link>{st && <small>{st.text}{st.long && <i className="sx-long" title="Longer than its usual stay" aria-label="longer than its usual stay" />}</small>}</span>
                    <span><BoxChip corner={g.row.rotation?.corner} />{g.row.rotation?.rank != null && <small className="sp-rank">rank {g.row.rotation.rank} of {g.row.rotation.ranked}</small>}</span>
                    <span><b>{up ?? "–"} of {g.row.stocks_counted} rising</b>{by === "value" && total > 0 && <small>{pct((g.value / total) * 100)} of your portfolio</small>}</span>
                    <span><PeerPills syms={g.shares.map((s) => ({ symbol: s.symbol, wl: wlSet.has(s.symbol) }))} labels={labels} groupName={short(g.row.name)} /></span>
                  </div>); })}</div>))}
            {cut && <button type="button" className="sx-tlink" aria-expanded={false} onClick={() => setMore((s) => new Set(s).add(k))}>Show the other {gs.length - rows.length} {ns} ▾</button>}
          </section>);
      })}
    </div>
  );
}
const groupWord = (k: StateKey, ns: string) => (k === "sold_off" ? `sold-off ${ns}` : `${ns} ${k === "no_signal" ? "with no clear signal" : MEANING_SHORT[k]}`);
const MEANING_SHORT: Record<StateKey, string> = { rising: "rising together", bouncing: "bouncing back", crash: "bouncing back after a crash", losing: "losing steam", sold_off: "sold off", no_signal: "with no clear signal" };
const TIME_HELP_OF = (n: string, ns: string) => `Weeks the ${n} has spent in the state it is in now, against how long ${ns} usually stayed in that state over the last year. A dot marks a stay at least twice the usual.`;
const VALUE_HELP = (n: string) => `How much of your portfolio's value sits in this ${n}. Each share counts as quantity × its last close, so a big holding counts more than a small one.`;
const SHARES_HELP = (n: string) => `Your shares in this ${n}, coloured by how each does against its own ${n}: green Leader, grey In line, red Laggard. Press +N more to see the rest.`;
void MEANING;
