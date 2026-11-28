// Sector Pulse, three of the six additions (task #333, developer file 30, 23 Nov 2026). Every figure is the server's; the sentences are fixed and describe, never advise.
//  - WhatNext (addition 1): for each state, how often a group entered it over the last 12 months of weekly closes, where it went next, its typical stay and how many
//    are in it now (GET /api/sector-next, counted on the server). Cards, one per state; those holding groups today have a gold edge and "N in it now".
//  - PriceVsResults (addition 3): one row per group, the member's own first: the price side (state, stocks rising) beside its results groups this quarter
//    (GET /api/results/quarter: industries[].vsMarket), and one fixed sentence read from the two.
//  - InsideSector (addition 2): a picker, then the 12 strongest counted stocks of the group by 6-month return with their peer label, FinLit Prism (stored scores only:
//    GET /api/prism/scores reads, it never calculates, so it does not count against the daily Prism report limit) and trend words.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../../lib/api";
import type { Board, GroupRow, StateCode } from "../../../lib/sectors";
import { useSectorPage } from "../../../lib/sectors";
import { COLOUR, OF_CODE, WORD, allChip, keyOf, risingOf, short } from "../../../lib/pulsePack";
import { usePrismScores } from "../../../lib/prismScores";
import { useUI } from "../../../lib/ui";
import { useWatchlist } from "../../../lib/watchlist";
import { gl, sq, tw, wordsShow } from "../../../lib/groupWords";
import { LockedBlock } from "../Parts";
import { Wallet, Scroll, Section, StateChip } from "./Common";
import { AlertBell } from "./SectorAlert";
import { SectorListBox, TechChip, risingOnBoth } from "./InsideParts";

const pct = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);

// ------------------------------------------------------------------------------------------------ What happened next
export type NextRow = { state: StateCode; entered: number; ended: number; next: { state: StateCode; n: number }[]; typical_weeks: number | null; now: number };
export type NextData = { window_from: string; window_to: string; groups: number; rows: NextRow[]; date?: string };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dmy = (d: string) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
export const weeksWord = (w: number | null) => (w == null ? "–" : `${String(w).replace(".5", "½").replace(/^0½/, "½")} ${w === 1 ? "week" : "weeks"}`);

export function WhatNext() {
  const view = wordsShow();
  const q = useQuery<NextData, ApiError>({ queryKey: ["sector-next", view], queryFn: () => apiGet<NextData>("/api/sector-next" + sq()), staleTime: 3_600_000, retry: false });
  const d = q.data;
  return (
    <Section id="sx-next" title="What happened next" help={tw("What happened next. Each group's reading at every weekly close over the last 12 months: how often each state began, where the group went when it ended, how long it usually lasted, and how many are in it now. It shows what did happen, not what will.")}
      sub={d ? tw(`Counted at every weekly close from ${dmy(d.window_from)} to ${dmy(d.window_to)}, ${d.groups} ${d.groups === 1 ? "industry" : "industries"}. It shows what did happen, not what will.`) : undefined}>
      {q.isLoading ? <div className="sx-skel" style={{ height: 160 }} role="status" aria-label="Loading what happened next" />
        : !d ? <p className="sp-empty">{q.error?.message ?? "What happened next is not available right now."}</p>
        : <NextByState d={d} />}
    </Section>
  );
}

/** Task #448 (02 §4 What happened next): "times" in words: "once", "17 times". */
const times = (n: number) => (n === 1 ? "once" : `${n} times`);
/** The one sentence under the tabs (05 §7): "Sold off: a sector moved into it 72 times over this period. It usually stayed about 2 weeks. Of the 56 that left, it
 *  went to Losing steam 17 times, Bouncing back 12 times and Bouncing back after a crash 11 times." The top three places; the Industries view says "a group". */
export function nextSentence(r: NextRow, sectors: boolean): { head: string; moved: string; stay: string | null; left: string | null; first: string | null; rest: string[] } {
  const next = [...r.next].sort((a, c) => c.n - a.n).slice(0, 3);
  const words = next.map((x) => ({ w: WORD[OF_CODE[x.state] ?? "no_signal"], t: times(x.n) }));
  return { head: WORD[OF_CODE[r.state] ?? "no_signal"], moved: `${sectors ? "a sector" : "a group"} moved into it`,
    stay: r.typical_weeks != null ? `about ${Math.max(1, Math.round(r.typical_weeks))} ${Math.max(1, Math.round(r.typical_weeks)) === 1 ? "week" : "weeks"}` : null,
    left: r.ended ? `Of the ${r.ended} that left, it went to ` : null, first: words[0] ? `${words[0].w}` : null,
    rest: words.map((x, i) => (i === 0 ? ` ${x.t}` : `${x.w} ${x.t}`)) };
}
function NextByState({ d }: { d: NextData }) {
  const sectors = wordsShow() === "sectors";
  const byNow = [...d.rows].sort((a, c) => c.now - a.now);
  const [pick, setPick] = useState<StateCode>(byNow[0]?.state);
  const r = d.rows.find((x) => x.state === pick) ?? byNow[0];
  if (!r) return <p className="sp-empty">No state has a history yet.</p>;
  const most = Math.max(1, ...r.next.map((x) => x.n)), t = nextSentence(r, sectors);
  return (
    <div className="sx-nx1">
      <div className="sx-fl sx-stabs" role="group" aria-label="State">{d.rows.map((x) => { const kk = OF_CODE[x.state] ?? "no_signal"; return (
        <button key={x.state} type="button" aria-pressed={x.state === r.state} onClick={() => setPick(x.state)}><i className="sx-dot" style={{ background: COLOUR[kk] }} aria-hidden="true" />{WORD[kk]} <small>{x.now} now</small></button>); })}</div>
      <p className="sx-nx-sent"><b>{t.head}</b>: {t.moved} <b>{r.entered}</b> {r.entered === 1 ? "time" : "times"} over this period.{t.stay && <> It usually stayed <b>{t.stay}</b>.</>}
        {t.left && t.first && <> {t.left}<b>{t.first}</b>{t.rest[0]}{t.rest.length > 1 && <>{t.rest.length === 2 ? " and " : ", "}{t.rest[1]}</>}{t.rest.length > 2 && <> and {t.rest[2]}</>}.</>}</p>
      <p className="sx-nxk">Where it went next</p>
      {r.next.length ? <ul className="sx-nxl sx-nxl2">{[...r.next].sort((a, c) => c.n - a.n).map((x) => (
        <li key={x.state}><span className="sx-nxw"><span className="sx-nx-ar" aria-hidden="true">→</span><StateChip k={OF_CODE[x.state] ?? "no_signal"} /></span><span className="sx-nb" aria-hidden="true"><i style={{ width: `${(x.n / most) * 100}%`, background: COLOUR[OF_CODE[x.state] ?? "no_signal"] }} /></span><b>{x.n}</b></li>))}</ul>
        : <p className="sp-note">No stay that began in the window has ended yet.</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Price against results
export type ResultsGroup = { name: string; companies: number; declared: number; withNumbers?: number; medianRevenueYoY?: number | null; medianProfitYoY?: number | null; vsMarket?: "Ahead" | "Behind" | "In line" | null };
type Side = "weak" | "strong";
export const priceSide = (r: GroupRow): Side => (keyOf(r) === "sold_off" || keyOf(r) === "losing" ? "weak" : "strong");
/** "Read together": one fixed sentence from the price side and the results groups (file 30, addition 3). Null when no results group has a reading. */
export function readTogether(side: Side, groups: ResultsGroup[]): { text: string; tone: "info" | "good" | "bad" | "watch"; key: string } | null {
  const read = groups.filter((g) => g.vsMarket);
  if (!read.length) return null;
  const ahead = read.filter((g) => g.vsMarket === "Ahead").length, behind = read.filter((g) => g.vsMarket === "Behind").length;
  const most = read.length === 1 ? (read[0].vsMarket === "Ahead" ? "ahead" : read[0].vsMarket === "Behind" ? "behind" : "inline")
    : ahead * 2 > read.length ? "ahead" : behind * 2 > read.length ? "behind" : "mixed";
  if (most === "inline") return { text: "Results are in line with the market.", tone: "info", key: "inline" };
  if (most === "mixed") return { text: "Results are mixed across its industries.", tone: "info", key: "mixed" };
  if (side === "weak") return most === "ahead" ? { text: "Price is weak while results are ahead of the market.", tone: "watch", key: "weak-ahead" } : { text: "Price and results are both behind.", tone: "bad", key: "both-behind" };
  return most === "ahead" ? { text: "Price and results are both ahead.", tone: "good", key: "both-ahead" } : { text: "Price is strong while results are behind the market.", tone: "watch", key: "strong-behind" };
}
const keyN = (s: string) => s.toLowerCase().replace(/ and /g, " & ").replace(/[^a-z0-9&]/g, "");
/** The results groups behind one Sector Pulse row: in the Industries view the one matching group; in the Sectors view each of its industries with its own group,
 *  largest first, and the group of its smaller industries read together under the sector's own name ("Other <sector>"). */
export function resultsFor(r: GroupRow, all: ResultsGroup[], sectorsView: boolean): { shown: { g: ResultsGroup; label: string }[]; more: number } {
  if (!sectorsView) { const g = all.find((x) => keyN(x.name) === keyN(r.name)); return { shown: g ? [{ g, label: short(g.name) }] : [], more: 0 }; }
  const inds = r.industries ?? [], own = all.filter((x) => inds.some((i) => keyN(i) === keyN(x.name)) && keyN(x.name) !== keyN(r.name)).sort((a, b) => b.companies - a.companies);
  const rest = all.find((x) => keyN(x.name) === keyN(r.name)), smaller = inds.filter((i) => !own.some((g) => keyN(g.name) === keyN(i))).length;
  const list = [...own.map((g) => ({ g, label: short(g.name) })), ...(rest ? [{ g: rest, label: `Other ${short(r.name)} (${smaller} smaller ${smaller === 1 ? "industry" : "industries"} together)` }] : [])];
  return { shown: list.slice(0, 3), more: Math.max(0, list.length - 3) };
}
type PvFilter = "all" | "mine" | "weak-ahead" | "both-ahead" | "both-behind" | "strong-behind";
export function PriceVsResults({ b, mine }: { b: Board; mine: Set<string> }) {
  const sectorsView = wordsShow() === "sectors";
  const q = useQuery<{ industries: ResultsGroup[]; locked?: boolean; quarter?: { label?: string } | string | null }, ApiError>({ queryKey: ["results", "industries-for-pulse"], queryFn: () => apiGet("/api/results/quarter?limit=1"), staleTime: 600_000, retry: false });
  const [f, setF] = useState<PvFilter>("all"), [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const res = q.data?.industries ?? [];
    return [...b.rows].sort((a, c) => Number(mine.has(c.slug)) - Number(mine.has(a.slug))).map((r) => {
      const g = resultsFor(r, res, sectorsView), side = priceSide(r);
      return { r, g, side, read: readTogether(side, g.shown.map((x) => x.g)) };
    });
  }, [b.rows, q.data, mine, sectorsView]);
  const pass = (x: (typeof rows)[number]) => f === "all" || (f === "mine" ? mine.has(x.r.slug) : x.read?.key === f);
  const list = rows.filter(pass), shown = f !== "all" || all ? list : list.slice(0, 6);
  const count = (k: PvFilter) => rows.filter((x) => (k === "mine" ? mine.has(x.r.slug) : x.read?.key === k)).length;
  const quarter = typeof q.data?.quarter === "object" ? q.data?.quarter?.label : q.data?.quarter;
  return (
    <Section id="sx-pvr" title={tw("Price against results")} help={tw("Price against results. The price side is the industry's state and how many of its stocks are rising. The results side is how its companies' latest quarter compares with the typical listed company: Ahead when both revenue and profit grew faster, Behind when both grew slower, else In line.")}
      sub={tw(`Is the price picture in step with the latest results? One row per industry${quarter ? `, results for ${quarter}` : ""}.`)}>
      {q.isLoading ? <div className="sx-skel" style={{ height: 160 }} role="status" aria-label="Loading the results" />
        : q.data?.locked ? <LockedBlock plan="silver" name="Platinum" title="The results side is part of the Platinum plan">{tw("The price side is open to everyone. Platinum adds how each industry's latest results compare with the typical listed company.")}</LockedBlock>
        : <>
          <div className="sx-fl" role="group" aria-label="Show"><span>Show</span>
            {([["all", allChip(rows.length)], ...(mine.size ? [["mine", tw("My industries")]] : []), ["weak-ahead", "Price weak, results ahead"], ["both-ahead", "Both ahead"], ["both-behind", "Both behind"], ["strong-behind", "Price strong, results behind"]] as [PvFilter, string][])
              .map(([k, label]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{k === "mine" && <Wallet small />}{label}{k !== "all" && <> <small>{count(k)}</small></>}</button>)}</div>
          <Scroll label={tw("price against results")}><table className="sp-tb sx-t sx-incards sx-cards1">
            <thead><tr><th scope="col">{tw("Industry")}</th><th scope="col">Price</th><th scope="col" className="sx-div">Results this quarter</th><th scope="col" className="sx-div">Read together</th></tr></thead>
            <tbody>{shown.map(({ r, g, read }) => (
              <tr key={r.slug} className={mine.has(r.slug) ? "sx-mine" : undefined}>
                <td><Link className="sp-ind" to={gl(r.slug)}>{short(r.name)}</Link>{mine.has(r.slug) && <>{"\u2060"}<Wallet /></>}</td>
                <td data-label="Price"><StateChip k={keyOf(r)} /><span className="sx-sm">{Math.round(r.breadth?.above_20 ?? 0)} of 100 stocks rising</span></td>
                <td className="sx-div" data-label="Results this quarter">{g.shown.length >= 2 ? <ResultsSummary list={g.shown} more={g.more} />
                  : g.shown.length ? <ul className="sx-inds">{g.shown.map(({ g: x, label }) => <li key={x.name}>{label} {x.vsMarket ? <i className={"sx-vs sx-vs-" + x.vsMarket.toLowerCase().replace(" ", "")}>{x.vsMarket}</i> : <span>no reading yet</span>}
                  {x.medianRevenueYoY != null && <span> · revenue {pct(x.medianRevenueYoY)}, profit {pct(x.medianProfitYoY)}</span>}</li>)}
                  {g.more > 0 && <li className="sx-more">and {g.more} more</li>}</ul> : <span className="sp-nil">No results group</span>}</td>
                <td className="sx-div" data-label="Read together">{read ? <span className={"sx-rd sx-rd-" + read.tone}>{read.text}</span> : <span className="sp-nil">Results not in yet</span>}</td>
              </tr>))}
              {!shown.length && <tr><td colSpan={4}>{tw("No industry matches this filter.")}</td></tr>}</tbody>
          </table></Scroll>
          {f === "all" && list.length > 6 && <button type="button" className="sp-showall" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : <><span className="sx-wide">Show all {list.length} ▾</span><span className="sx-narrow">Show the other {list.length - 5} ▾</span></>}</button>}
          <p className="sp-note">Price weak means Sold off or Losing steam. The sentence is read from the two sides as they stand; it is not a reason to act.</p>
        </>}
    </Section>
  );
}

/** Task #448 (02 §4 Against results): with two or more industries the cell is one summary line ("1 Ahead · 1 In line · 1 Behind"), and the industries open
 *  below it from "3 industries ▾" ("3 parts ▾" in the Industries view, where they are the parts of a sector group). */
function ResultsSummary({ list, more }: { list: { g: ResultsGroup; label: string }[]; more: number }) {
  const [open, setOpen] = useState(false), id = "sx-rs-" + list.map((x) => x.g.name).join("-").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
  const n = (v: string) => list.filter((x) => x.g.vsMarket === v).length;
  const word = wordsShow() === "sectors" ? (list.length === 1 ? "industry" : "industries") : (list.length === 1 ? "part" : "parts");
  return (
    <div className="sx-rsum">
      <span className="sx-rsum-l">{(["Ahead", "In line", "Behind"] as const).filter((v) => n(v)).map((v) => <i key={v} className={"sx-vs sx-vs-" + v.toLowerCase().replace(" ", "")}>{n(v)} {v}</i>)}
        {list.every((x) => !x.g.vsMarket) && <span className="sp-nil">no reading yet</span>}</span>
      <button type="button" className="sx-tlink" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{list.length} {word} {open ? "▴" : "▾"}</button>
      {open && <ul className="sx-inds" id={id}>{list.map(({ g: x, label }) => <li key={x.name}>{label} {x.vsMarket ? <i className={"sx-vs sx-vs-" + x.vsMarket.toLowerCase().replace(" ", "")}>{x.vsMarket}</i> : <span>no reading yet</span>}
        {x.medianRevenueYoY != null && <span> · revenue {pct(x.medianRevenueYoY)}, profit {pct(x.medianProfitYoY)}</span>}</li>)}
        {more > 0 && <li className="sx-more">and {more} more</li>}</ul>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Inside a sector
type Membership = { groups: Record<string, { slug: string }> };
type InFilter = "all" | "leaders" | "prism" | "tech";
export function InsideSector({ b, mine, symbols }: { b: Board; mine: Set<string>; symbols: string[] }) {
  const sectorsView = wordsShow() === "sectors", unit = sectorsView ? "sector" : "industry";
  const { plan } = useUI();
  const gold = plan === "gold";
  const wl = useWatchlist();
  const watchSyms = useMemo(() => [...new Set(wl.lists.flatMap((l) => l.symbols.map((x) => x.toUpperCase())))].filter((s) => !symbols.includes(s)).sort(), [wl, symbols]);
  const wk = watchSyms.join(",");
  const wm = useQuery<Membership, ApiError>({ queryKey: ["sectors", "membership", wk, wordsShow()], queryFn: () => apiGet<Membership>(`/api/sectors/membership?symbols=${encodeURIComponent(wk)}` + sq(false)), enabled: watchSyms.length > 0, staleTime: 3_600_000, retry: false });
  const first = b.rows.find((r) => mine.has(r.slug)) ?? b.rows.find((r) => Object.values(wm.data?.groups ?? {}).some((g) => g.slug === r.slug)) ?? b.rows[0];
  const [picked, setPicked] = useState<string | null>(null);
  const slug = picked ?? first?.slug ?? "";
  const row = b.rows.find((r) => r.slug === slug);
  const p = useSectorPage(slug, wordsShow());
  const counted = p.data?.stocks ?? null;
  const top = useMemo(() => [...(counted ?? [])].filter((s) => s.return_6m_pct != null).sort((a, c) => (c.return_6m_pct ?? 0) - (a.return_6m_pct ?? 0)).slice(0, 12), [counted]);
  const prism = usePrismScores(top.map((s) => s.symbol), gold && top.length > 0);
  const [f, setF] = useState<InFilter>("all"), [all, setAll] = useState(false);
  const labels = { leaders: (counted ?? []).filter((s) => s.peer_label === "Leader").length, inline: (counted ?? []).filter((s) => s.peer_label === "In line").length, laggards: (counted ?? []).filter((s) => s.peer_label === "Laggard").length };
  const scoreOf = (sym: string) => { const v = prism[sym]; return v && v !== "error" ? v : null; };
  const both = (sym: string) => { const v = scoreOf(sym); return risingOnBoth(v?.shortTerm, v?.longTerm); };
  const nBoth = top.filter((s) => both(s.symbol)).length;          // 04 §3: counted over the whole list of 12, not only the rows showing
  const list = top.filter((s) => f === "all" || (f === "leaders" ? s.peer_label === "Leader" : f === "tech" ? both(s.symbol) : /^(healthy|strong)$/i.test(scoreOf(s.symbol)?.label ?? "")));
  // 04 §3: pressing "Technical: rising on both" turns on All, opens Show all, then hides the other rows; pressing it again closes what it opened.
  const tech = () => { if (f === "tech") { setF("all"); setAll(false); } else { setF("tech"); setAll(true); } };
  const shown = f !== "all" || all ? list : list.slice(0, 5);
  const held = new Set(symbols);
  return (
    <Section id="sx-inside" title={tw("Inside an industry: its strongest stocks, with FinLit Prism")} help={tw("Inside an industry. Pick one to see its 12 strongest counted stocks over 6 months, how each compares with its peers, its FinLit Prism rating and its trends.")}
      sub={tw(`Pick ${sectorsView ? "a sector" : "an industry"} to see its 12 strongest stocks over 6 months, how each compares with its peers, and its FinLit Prism rating. A list to start research from, not a recommendation.`)}>
      <div className="sx-inh">
        <SectorListBox label={sectorsView ? "Sector" : "Industry"} value={slug} items={b.rows.map((r) => ({ value: r.slug, label: short(r.name), mine: mine.has(r.slug) }))}
          onChange={(v) => { setPicked(v); setAll(false); setF("all"); }} />
        {row && <span className="sx-inst"><StateChip k={keyOf(row)} /></span>}
        {row && <span className="sx-peers"><b>{row.stocks_counted}</b> counted stocks{counted && labels.leaders + labels.inline + labels.laggards > 0 ? <> · <b>{labels.leaders}</b> Leaders · <b>{labels.inline}</b> In line · <b>{labels.laggards}</b> Laggards</> : null}</span>}
        {row && <AlertBell slug={row.slug} name={short(row.name)} />}
      </div>
      {p.isLoading ? <div className="sx-skel" style={{ height: 160 }} role="status" aria-label={`Loading the ${unit}`} />
        : counted == null ? <LockedBlock plan="silver" name="Platinum" title={tw("The stocks of each industry are part of the Platinum plan")}>{tw("The states and the stocks rising are open to everyone. Platinum lists the counted stocks, strongest 6 months first.")}</LockedBlock>
        : !top.length ? <p className="sp-empty">{tw("No counted stock of this industry has a 6-month return yet.")}</p>
        : <>
          <div className="sx-fl" role="group" aria-label="Show"><span>Show</span>
            <button type="button" aria-pressed={f === "all"} onClick={() => { if (f === "tech") setAll(false); setF("all"); }}>All {top.length}</button>
            <button type="button" aria-pressed={f === "leaders"} onClick={() => setF("leaders")}>Leaders</button>
            {gold && <button type="button" aria-pressed={f === "prism"} onClick={() => setF("prism")}>Prism: Healthy or Strong</button>}
            {gold && <button type="button" aria-pressed={f === "tech"} aria-disabled={nBoth === 0 || undefined} onClick={() => { if (nBoth > 0) tech(); }}>Technical: rising on both <span className="ct">{nBoth}</span></button>}</div>
          <Scroll label={tw("the industry's strongest stocks")}><table className="sp-tb sx-t sx-incards">
            <thead><tr><th scope="col">Stock</th><th scope="col" className="num">6-month return</th><th scope="col">Against its peers</th><th scope="col">FinLit Prism</th><th scope="col">Short-term technical</th><th scope="col">Long-term technical</th></tr></thead>
            <tbody>{shown.map((s) => { const sc = scoreOf(s.symbol); return (
              <tr key={s.symbol} className={held.has(s.symbol) ? "sx-mine" : undefined}>
                <td><Link className="sx-stk" to={`/stocks/${s.symbol}`}><b>{s.symbol}{held.has(s.symbol) && <Wallet />}</b><small>{s.name}</small></Link></td>
                <td data-label="6-month return" className={"num " + ((s.return_6m_pct ?? 0) >= 0 ? "sp-good" : "sp-red")}>{pct(s.return_6m_pct)}</td>
                <td data-label="Against its peers">{s.peer_label ? <span className={"sx-peer sx-peer-" + s.peer_label.toLowerCase().replace(/\s+/g, "")}>{s.peer_label}</span> : p.data?.locked?.peer_label ? <span className="sp-nil">Gold</span> : "–"}</td>
                <td data-label="FinLit Prism">{!gold ? <span className="sp-nil">Gold</span> : sc?.rated ? <span className={"sx-prism sx-prism-" + (sc.label ?? "").toLowerCase()}>{sc.label} <b>{Math.round(sc.final ?? 0)}</b></span> : prism[s.symbol] === undefined ? "…" : <span className="sp-nil">Not rated yet</span>}</td>
                <td data-label="Short-term technical">{gold ? <TechChip t={sc?.shortTerm} term="Short" /> : <span className="sp-nil">Gold</span>}</td>
                <td data-label="Long-term technical">{gold ? <TechChip t={sc?.longTerm} term="Long" /> : <span className="sp-nil">Gold</span>}</td>
              </tr>); })}
              {!shown.length && <tr><td colSpan={6}>No stock matches this filter.</td></tr>}</tbody>
          </table></Scroll>
          {f === "all" && list.length > 5 && <button type="button" className="sp-showall" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : <><span className="sx-wide">Show all {list.length} ▾</span><span className="sx-narrow">Show the other {list.length - 5} ▾</span></>}</button>}
          <p className="sp-note">{tw(`Strongest ${top.length} of its ${row?.stocks_counted ?? counted.length} counted stocks by 6-month return. Leader / In line / Laggard compares a stock with its peers. Open a stock for its full report.`)}</p>
        </>}
    </Section>
  );
}
export { risingOf };
