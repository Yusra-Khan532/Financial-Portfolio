// Sector Rotation, developer file 31 (task #332, 23 Nov 2026): the shorter page and its six additions. The section bar (nav.sp-secbar.sx-nav), Today in one minute
// (headline chip, tiles, two callouts), Your sectors (portfolio / watchlist / both, Alert me, the no-shares prompt), the boxes with a switch (the Results and IPOs
// "views" bar, TabGroup), Price against results, What happened next, Inside a sector, the hover card and the Alert me card. Rules and figures: lib/rotation332.ts;
// styles: styles/sector-pages.css (task #333) and styles/rotation-332.css. Describes what happened and what is on file; never advice.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../../lib/api";
import { usePrismScores } from "../../../lib/prismScores";
import { useGold } from "../../../lib/premium";
import { BOX, keyOf, short } from "../../../lib/pulsePack";
import type { RotationMap, RotationRow } from "../../../lib/rotation";
import type { GroupRow, IndustryPage, RankedStock } from "../../../lib/sectors";
import { BOXES, BOX_HELP, boxCounts, lastMonth, meansForYou, pc, rotationHeadline, rotationTodayCards, sixMonths, yourRotationCards, gw, type Box } from "../../../lib/rotationPack";
import {
  READ_SENTENCE, RES_FILTERS, headlineTone, inInside, inResFilter, insideStart, insideTop, pickTwo, readTogether, resultsFor,
  sharesFor, weeksText, type InsideFilter, type MemberShares, type ReadKey, type ResFilter, type ResultsGroup, type Source, type WhatNext,
} from "../../../lib/rotation332";
import { gl, sq } from "../../../lib/groupWords";
import { rw, rwCards } from "../../../lib/rotationWords";
import { BoxChip, Cards, Scroll, StateChip, Tip } from "../../sectors/pack/Common";
import { AlertBell } from "../../sectors/pack/SectorAlert";
import { BOX_COLOUR, RankLine } from "./RotationSimple";

const READ_TONE: Record<ReadKey, string> = { weak_ahead: "sx-rd-info", strong_ahead: "sx-rd-good", weak_behind: "sx-rd-bad", strong_behind: "sx-rd-watch", mixed: "", inline: "", none: "" };

// ------------------------------------------------------------------------------------------------ the section bar
export type NavItem = { id: string; label: string };
/** "On this page" bar: sticks under the site header; the section in view turns black; pressing a closed row's name scrolls to it and opens it. */
export function RotNav({ items }: { items: NavItem[] }) {
  const [on, setOn] = useState<string | null>(items[0]?.id ?? null);
  const key = items.map((i) => i.id).join(",");
  useEffect(() => {
    let raf = 0;
    const pick = () => { raf = 0; let cur = items[0]?.id ?? null; for (const it of items) { const e = document.getElementById(it.id); if (e && e.getBoundingClientRect().top <= 180) cur = it.id; } setOn(cur); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick); };
    pick(); addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const d = el.matches("details") ? el : el.querySelector("details");
    if (d instanceof HTMLDetailsElement) d.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" }); setOn(id);
  };
  return (
    <nav className="sp-secbar sx-nav" aria-label="On this page">
      <span className="sx-nav-k">On this page</span>
      <ol className="sp-secbar-l">{items.map((it, i) => (
        <li key={it.id}>{i > 0 && <span className="sp-secbar-ar" aria-hidden="true">→ </span>}
          <a href={"#" + it.id} className={"sp-secbar-c" + (on === it.id ? " on" : "")} aria-current={on === it.id ? "location" : undefined} onClick={(e) => { e.preventDefault(); go(it.id); }}>
            <span className="sp-secbar-n">{i + 1}</span>{it.label}</a></li>))}</ol>
    </nav>
  );
}

/** "Why it matters" as a small button that opens the line (details.sx-why); open on a member's first visit to the page, closed after. */
export function Why({ text, open }: { text: string; open: boolean }) {
  return <details className="sx-why" open={open}><summary>Why it matters</summary><p>{text}</p></details>;
}

// ------------------------------------------------------------------------------------------------ Today in one minute
export function TodayNew({ m, mine, pulse }: { m: RotationMap; mine: Set<string>; pulse: Map<string, GroupRow> }) {
  const h = rotationHeadline(m, mine), counts = boxCounts(m), tone = headlineTone(m);
  const cards = pickTwo(rotationTodayCards(m, mine, pulse));
  return (
    <section className="sp-sec sx-today" aria-labelledby="sx-today-h" id="sx-today">
      <h2 id="sx-today-h">Today in one minute<Tip text="Today in one minute. What changed at the latest weekly close: how many sit in each box now and a week ago, and the few moves worth knowing." label="About “Today in one minute”" /></h2>
      <p className="sp-sub">{rw("Which industries are leading, which are fading, and what changed this week.")}</p>
      <p className="sp-lead"><b className={"sx-hl sx-hl-" + tone}>{h.lead}</b>{h.rest}</p>
      <p className="sp-note">{h.line}</p>
      <p className="sp-cap">All {gw(m.rows.length)} by box</p>
      <div className="rp-strip" role="img" aria-label={counts.map((c) => `${BOX[c.box].word} ${c.now}`).join(", ")}>{counts.map((c) => <i key={c.box} style={{ flex: c.now, background: BOX_COLOUR[c.box] }} />)}</div>
      <div className="sx-tiles" style={{ ["--n" as string]: counts.length }}>{counts.map((c) => { const d = c.now - c.last; return (
        <div key={c.box} className="sx-tile"><b>{c.now}</b>
          <span className="sx-tile-k"><span className="rp-boxname"><i className="rp-sq" style={{ background: BOX_COLOUR[c.box] }} aria-hidden="true" />{BOX[c.box].word}<Tip text={BOX_HELP[c.box]} label={`About “${BOX[c.box].word}”`} /></span></span>
          <small className={d > 0 ? "sx-d-up" : d < 0 ? "sx-d-dn" : ""}>{d > 0 ? `▲${d} vs last week` : d < 0 ? `▼${-d} vs last week` : "no change"}</small></div>); })}</div>
      <Cards items={rwCards(cards)} cols={2} />
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Your sectors
const PILLS = 3;
function Pills({ list }: { list: { sym: string; watch: boolean }[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, PILLS);
  return <span className="rp-shares">{shown.map((x) => <Link key={x.sym} to={`/stocks/${x.sym}`} className={"sp-sym rp-pill" + (x.watch ? " sx-wl" : "")} title={x.watch ? "On your watchlist" : "In your portfolio"}>{x.sym}</Link>)}
    {list.length > PILLS && <button type="button" className="sx-pmore" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "fewer" : `+${list.length - PILLS}`}</button>}</span>;
}
export function YourNew({ m, ms, pulse, signedIn, whyOpen }: { m: RotationMap; ms: MemberShares; pulse: Map<string, GroupRow>; signedIn: boolean; sectors: boolean; whyOpen: boolean }) {
  const nHeld = new Set([...ms.held.values()].flat()).size, nWatch = new Set([...ms.watched.values()].flat()).size;
  const [picked, setSrc] = useState<Source | null>(null);
  const src: Source = picked ?? (nHeld ? "portfolio" : "watchlist");      // My portfolio first; the watchlist when there are no shares
  const shares = sharesFor(src, ms);
  const rows = m.rows.filter((r) => shares.has(r.slug)).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const plain = new Map([...shares].map(([k, v]) => [k, v.map((x) => x.sym)]));
  const empty = !nHeld && !nWatch;
  return (
    <section className="sp-sec sx-yours" aria-labelledby="sx-yours-h" id="sx-yours">
      <div className="sp-sec-h"><div><h2 id="sx-yours-h">{rw("How your industries compare")}<Tip text={rw("How your industries compare. The industries your shares belong to, each with its box, its rank and how it has done against the average group.")} /></h2>
        {!empty && <p className="sp-sub">{rw(`The ${rows.length} ${rows.length === 1 ? "industry" : "industries"} your ${src === "watchlist" ? `${nWatch} watchlist` : src === "both" ? `${new Set([...plain.values()].flat()).size}` : `${nHeld}`} shares belong to, from the strongest rank to the weakest.`)}</p>}</div></div>
      {empty ? <div className="sx-empty" style={{ display: "block" }}><b>{rw("Your industries will show here")}</b>
        <p>{rw("Add the shares you own, or build a watchlist, and this box shows which of your industries are rising, falling, leading or lagging.")}</p>
        <p>{signedIn ? <><Link className="sx-go" to="/portfolio">Add my shares</Link><Link className="sx-go2" to="/watchlists">Open my watchlist</Link></> : <><Link className="sx-go" to="/login?next=/sectors/rotation">Sign in to add my shares</Link></>}</p></div> : <>
        <div className="sx-src" role="group" aria-label="Which shares"><span>{rw("Industries of")}</span>
          <button type="button" aria-pressed={src === "portfolio"} onClick={() => setSrc("portfolio")}>My portfolio <small>{nHeld} {nHeld === 1 ? "share" : "shares"}</small></button>
          <button type="button" aria-pressed={src === "watchlist"} onClick={() => setSrc("watchlist")}>My watchlist <small>{nWatch} {nWatch === 1 ? "share" : "shares"}</small></button>
          <button type="button" aria-pressed={src === "both"} onClick={() => setSrc("both")}>Both</button></div>
        <Why open={whyOpen} text={rw("A share in a leading industry has the wind behind it; a share in a lagging one is swimming against the current. This shows which of your shares have which.")} />
        {src === "portfolio" && <Cards items={rwCards(yourRotationCards(rows, ms.held, plain, pulse).slice(0, 2))} />}
        {!rows.length ? <p className="sp-empty">{src === "watchlist" ? rw("None of your watchlist shares is in an industry with a reading.") : rw("None of your shares is in an industry with a reading.")}</p> :
          <Scroll label={rw("your industries")}><table className="sp-tb rp-yourt">
            <thead><tr><th scope="col">{rw("Industry and your shares")}</th><th scope="col">Its box<Tip text={rw("Its box: how the industry has done against the average group over the last several months and over the last month.")} /></th>
              <th scope="col">Rank<Tip text="Its place among all ranked this week, 1 the strongest; below it, the places moved in 4 weeks." /></th><th scope="col">Rank, 26 weeks<Tip text="Its rank at each of the last 26 weekly closes: higher on the line is a better rank. The shaded band is the top third." /></th>
              <th scope="col">Vs the average group<Tip text={rw("How much better (+) or worse (−) the industry did than the average group over the last month and the last 6 months.")} /></th><th scope="col">What it means for you</th><th scope="col" className="sx-alh">Alert</th></tr></thead>
            <tbody>{rows.map((r) => { const mf = meansForYou(r), c = r.rank_change_4w; return (
              <tr key={r.slug} className="sx-mine"><td><Link to={gl(r.slug)} className="rp-ind"><b>{short(r.name)}</b></Link><Pills list={shares.get(r.slug) ?? []} /></td>
                <td><BoxChip corner={r.corner} /></td>
                <td><span className="rp-rank"><span><b>{r.rank ?? "–"}</b>{r.rank != null && <> of {r.ranked}</>}</span><small className={c == null ? "" : c > 0 ? "up" : c < 0 ? "dn" : ""}>{c == null ? "" : c > 0 ? `▲ ${c} in 4 weeks` : c < 0 ? `▼ ${-c} in 4 weeks` : "same in 4 weeks"}</small></span></td>
                <td><RankLine r={r} /></td>
                <td className="rp-vsavg"><span>last month <b className={(lastMonth(r) ?? 0) > 0 ? "sp-good" : (lastMonth(r) ?? 0) < 0 ? "sp-red" : ""}>{pc(lastMonth(r))}</b></span><span>6 months <b className={(sixMonths(r) ?? 0) > 0 ? "sp-good" : (sixMonths(r) ?? 0) < 0 ? "sp-red" : ""}>{pc(sixMonths(r))}</b></span></td>
                <td>{mf && <span className={"sp-mean rp-mean-" + mf.tone}>{mf.text}</span>}</td>
                <td className="sx-alc"><AlertBell slug={r.slug} name={short(r.name)} compact /></td></tr>); })}</tbody>
          </table></Scroll>}
      </>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ the hover card (map dots)
export function hoverCard(m: RotationMap, pulse: Map<string, GroupRow>, mine: Set<string>, watched: Set<string>) {
  const by = new Map(m.rows.map((r) => [r.slug, r]));
  return (slug: string): ReactNode => {
    const r = by.get(slug), g = pulse.get(slug);
    if (!r) return null;
    const rising = g?.breadth?.above_20 != null ? Math.round((g.breadth.above_20 / 100) * g.stocks_counted) : null;
    return <>
      <b>{short(r.name)}{mine.has(slug) ? <em>{watched.has(slug) ? "Watchlist" : "Yours"}</em> : null}</b>
      <span className="sx-hcc">{g && <StateChip k={keyOf(g)} />}<BoxChip corner={r.corner} /></span>
      <dl>
        <div><dt>Stocks rising</dt><dd>{rising != null && g ? `${rising} of ${g.stocks_counted}` : "no reading"}</dd></div>
        <div><dt>Below its 1-year high</dt><dd>{g?.index_vs_52w_high != null ? `${Math.abs(g.index_vs_52w_high).toFixed(1)}%` : "–"}</dd></div>
        <div><dt>Rank</dt><dd>{r.rank != null ? `${r.rank} of ${r.ranked}` : "not ranked yet"}</dd></div>
        <div><dt>6 months vs average</dt><dd>{pc(sixMonths(r))}</dd></div>
      </dl>
      <small>Press to open its page.</small>
    </>;
  };
}

// ------------------------------------------------------------------------------------------------ Price against results
type QInd = { quarter?: { fiscal?: string }; industries?: ResultsGroup[]; locked?: boolean | string[] | null; plan?: string };
export function PriceResults({ m, mine, sectors }: { m: RotationMap; mine: Set<string>; sectors: boolean }) {
  const q = useQuery<QInd, ApiError>({ queryKey: ["quarter-results", "view=industries"], queryFn: () => apiGet<QInd>("/api/results/quarter?view=industries&limit=1"), staleTime: 300_000, retry: false });
  const [f, setF] = useState<ResFilter>("all"), [all, setAll] = useState(false);
  const groups = q.data?.industries ?? [];
  const locked = groups.length > 0 && groups.every((g) => g.vsMarket == null && g.medianRevenueYoY == null);
  const rows = useMemo(() => m.rows.map((r) => { const lines = resultsFor(r, groups, sectors); return { r, lines, key: readTogether(r.corner, lines.map((l) => l.g.vsMarket)) }; })
    .sort((a, b) => Number(mine.has(b.r.slug)) - Number(mine.has(a.r.slug)) || (a.r.rank ?? 999) - (b.r.rank ?? 999)), [m, groups, sectors, mine]);
  const hit = rows.filter((x) => inResFilter(f, x.key, mine.has(x.r.slug)));
  const shown = f !== "all" || all ? hit : hit.slice(0, 6);
  const mk = groups.find((g) => g.market)?.market;
  const sig = (v: number | null | undefined) => (v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`);
  const one = sectors ? "Sector" : "Industry";
  return (
    <section className="sp-sec sx-add" aria-labelledby="sx-res-h">
      <div className="sp-sec-h"><div><h2 id="sx-res-h">Price against results{q.data?.quarter?.fiscal ? `, ${q.data.quarter.fiscal}` : ""}<span className="sx-new-b">New</span></h2>
        <p className="sp-sub">{rw("Each industry's box today beside how its companies' latest quarter compares with the market. They do not always agree.")}</p></div></div>
      {q.isLoading ? <div className="sx-skel" style={{ height: 120 }} role="status" aria-label="Loading the results groups" />
        : q.isError ? <p className="sp-empty">The results groups could not be loaded just now, so this check is blank. Please try again shortly.</p>
        : locked ? <p className="sp-empty">The results figures of each group are part of the Silver plan, as on the Results page. <Link to="/results?view=industries">Open Results</Link></p>
        : <>
          <div className="sx-fl" role="group" aria-label="Filter"><span>Show</span>{RES_FILTERS.filter(([k]) => k !== "mine" || mine.size).map(([k, l]) =>
            <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{k === "all" ? `All ${rows.length}` : k === "mine" ? (sectors ? "My sectors" : "My groups") : l}</button>)}</div>
          {mk && <p className="sx-cap">Market{q.data?.quarter?.fiscal ? `, ${q.data.quarter.fiscal}` : ""}: typical revenue growth {sig(mk.medianRevenueYoY)}, typical profit growth {sig(mk.medianProfitYoY)} on a year ago. “Typical” is the middle company.</p>}
          <Scroll label="price against results"><table className="sp-tb sx-t">
            <thead><tr><th scope="col">{one}</th><th scope="col">Price: its box today</th><th scope="col">Results: {sectors ? "its industries" : "its group"} against the market</th><th scope="col">Read together</th></tr></thead>
            <tbody>{shown.map(({ r, lines, key }) => (
              <tr key={r.slug} className={mine.has(r.slug) ? "sx-mine" : undefined}>
                <td><Link to={gl(r.slug)} className="sp-ind">{short(r.name)}</Link>{mine.has(r.slug) && <em className="sp-yours">Yours</em>}</td>
                <td><BoxChip corner={r.corner} /><span className="sx-sm">{r.rank != null ? `rank ${r.rank} of ${r.ranked}` : "not ranked yet"}</span></td>
                <td>{lines.length ? <ul className="sx-inds">{lines.slice(0, 3).map((l) => <li key={l.label}><b>{l.label}</b> <span>revenue {sig(l.g.medianRevenueYoY)} · profit {sig(l.g.medianProfitYoY)}</span> {l.g.vsMarket ? <i className={"sx-vs sx-vs-" + l.g.vsMarket.toLowerCase().replace(" ", "")}>{l.g.vsMarket}</i> : <i className="sx-vs">Too few results</i>}</li>)}
                  {lines.length > 3 && <li className="sx-more">and {lines.length - 3} more</li>}</ul> : <span className="sp-nil">No results group with enough results this quarter</span>}</td>
                <td><span className={"sx-rd " + READ_TONE[key]}>{READ_SENTENCE[key]}</span></td>
              </tr>))}</tbody>
          </table></Scroll>
          {f === "all" && hit.length > 6 && <button type="button" className="sp-showall" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : `Show all ${hit.length} ▾`}</button>}
          <p className="sp-note">{rw("Your industries come first.")} Results are from the Results page, by NSE industry{sectors ? "; a sector with several industries shows up to three, largest first. “Other …” is the sector's smaller industries read together" : ""}. Ahead / In line / Behind is that group's typical growth against the market's.</p>
        </>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ What happened next
export function WhatNextCards({ m, sectors }: { m: RotationMap; sectors: boolean }) {
  const wn = (m as RotationMap & { what_next?: WhatNext | null }).what_next;
  return (
    <section className="sp-sec sx-add" aria-labelledby="sx-next-h">
      <div className="sp-sec-h"><div><h2 id="sx-next-h">What happened next<span className="sx-new-b">New</span></h2>
        <p className="sp-sub">{rw("Where industries went after each box, counted from the weekly readings on this page.")}</p></div></div>
      {!wn || !wn.cards.length ? <p className="sp-empty">Not counted yet: the weekly readings behind this check are not in the current data set. They are added at the next weekly close.</p> : <>
        <p className="sx-cap"><b>What happened next, {wn.from_label} to {wn.to_label}.</b> Counted from {wn.weeks} weekly readings of {wn.groups} {sectors ? "sectors" : "groups"}. It shows what did happen, not what will.</p>
        <div className="sx-nx">{wn.cards.map((c) => (
          <article key={c.box} className={"sx-nxc" + (c.now ? " sx-nxnow" : "")}>
            <header><BoxChip corner={c.box} />{c.now > 0 && <span className="sx-nxtag">{c.now} in it now</span>}</header>
            <dl className="sx-nxs"><div><dt>Times entered</dt><dd>{c.entered}</dd></div><div><dt>Typical stay</dt><dd>{weeksText(c.typical_weeks)}</dd></div><div><dt>Stays that ended</dt><dd>{c.ended}</dd></div></dl>
            {c.next.length ? <><p className="sx-nxk">Where it went next</p>
              <ul className="sx-nxl">{c.next.map((x) => <li key={x.box}><span className="sx-nxw"><BoxChip corner={x.box} /></span><span className="sx-nb"><i style={{ width: `${(x.n / Math.max(1, c.ended)) * 100}%` }} /></span><b>{x.n}</b><small>of {c.ended}</small></li>)}</ul></>
              : <p className="sx-sm">No stay that began in this window has ended yet.</p>}
          </article>))}</div>
      </>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Inside a sector
export function Inside({ m, held, watched, mine, pulse, sectors, syms }: { m: RotationMap; held: string[]; watched: string[]; mine: Set<string>; pulse: Map<string, GroupRow>; sectors: boolean; syms: Set<string> }) {
  const start = insideStart(m.rows, held, watched);
  // the member's first sector once their shares are known; their own pick after that
  const [picked, setSlug] = useState<string | null>(null);
  const slug = picked && m.rows.some((r) => r.slug === picked) ? picked : start;
  const [f, setF] = useState<InsideFilter>("all"), [all, setAll] = useState(false);
  const gold = useGold();
  const q = useQuery<IndustryPage, ApiError>({ queryKey: ["sector", slug, sectors ? "sectors" : "industries"], queryFn: () => apiGet<IndustryPage>(`/api/sectors/${encodeURIComponent(slug!)}` + sq()), enabled: !!slug, staleTime: 300_000, retry: false });
  const stocks = (q.data?.stocks as RankedStock[] | null) ?? [];
  const t = insideTop(stocks);
  const prism = usePrismScores(t.top.map((s) => s.symbol), gold && t.top.length > 0, 0);
  const r = m.rows.find((x) => x.slug === slug), g = slug ? pulse.get(slug) : undefined;
  const one = sectors ? "sector" : "industry";
  const label = (s: string) => { const p = prism[s]; return p && p !== "error" && p.rated ? p.label : null; };
  const hit = t.top.filter((s) => inInside(f, s.peer_label, label(s.symbol)));
  const shown = f !== "all" || all ? hit : hit.slice(0, 5);
  return (
    <section className="sp-sec sx-add" aria-labelledby="sx-inside-h" id="sx-inside">
      <div className="sp-sec-h"><div><h2 id="sx-inside-h">{sectors ? "Inside a sector" : "Inside an industry"}: its strongest stocks, with FinLit Prism<span className="sx-new-b">New</span></h2>
        <p className="sp-sub">Pick {sectors ? "a sector" : "an industry"} to see its 12 strongest stocks over 6 months, how each compares with its peers, and its FinLit Prism rating. A list to start research from, not a recommendation.</p></div></div>
      <div className="sx-inh">
        <label>{sectors ? "Sector" : "Industry"} <select value={slug ?? ""} onChange={(e) => { setSlug(e.target.value); setAll(false); }}>
          {m.rows.map((x) => <option key={x.slug} value={x.slug}>{short(x.name)}{mine.has(x.slug) ? (held.includes(x.slug) ? " · yours" : " · watchlist") : ""}</option>)}</select></label>
        {r && <span className="sx-inst">{g && <StateChip k={keyOf(g)} />}<BoxChip corner={r.corner} /></span>}
        {q.data && stocks.length > 0 && <span className="sx-peers"><b>{t.counted}</b> counted stocks{gold ? <> · <b className="sx-p-l">{t.leaders}</b> Leaders · <b>{t.inline}</b> In line · <b className="sx-p-g">{t.laggards}</b> Laggards</> : null}</span>}
        {r && <AlertBell slug={r.slug} name={short(r.name)} />}
      </div>
      {q.isLoading ? <div className="sx-skel" style={{ height: 160 }} role="status" aria-label={`Loading the stocks of this ${one}`} />
        : q.isError ? <p className="sp-empty">{`The stocks of this ${one} could not be loaded just now. Please try again shortly.`}</p>
        : q.data && q.data.stocks == null ? <p className="sp-empty">{`The stocks of each ${one} are part of the Silver plan; the Leader / Laggard tags and FinLit Prism are part of Gold.`} <Link to="/pricing">See the plans</Link></p>
        : !t.top.length ? <p className="sp-empty">{`No counted stock with a 6-month return in this ${one} right now.`}</p> : <>
          <div className="sx-fl" role="group" aria-label="Filter"><span>Show</span>
            {([["all", `All ${t.top.length}`], ["leaders", "Leaders"], ["prism", "Prism: Healthy or Strong"]] as [InsideFilter, string][]).filter(([k]) => k === "all" || gold).map(([k, l]) =>
              <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
          <Scroll label={`the strongest stocks of this ${one}`}><table className="sp-tb sx-t">
            <thead><tr><th scope="col">Stock</th><th scope="col" className="num">6-month return</th><th scope="col">Against its peers</th><th scope="col">FinLit Prism</th><th scope="col">Short-term trend</th><th scope="col">Long-term trend</th></tr></thead>
            <tbody>{shown.map((s) => { const p = prism[s.symbol], ps = p && p !== "error" ? p : null; return (
              <tr key={s.symbol} className={syms.has(s.symbol) ? "sx-mine" : undefined}>
                <td><Link to={`/stocks/${s.symbol}`} className="sx-stk"><b>{s.symbol}{syms.has(s.symbol) && <em className="sp-yours">Yours</em>}</b><small>{s.name}</small></Link></td>
                <td className={"num " + ((s.return_6m_pct ?? 0) >= 0 ? "sp-good" : "sp-red")}>{s.return_6m_pct == null ? "–" : `${s.return_6m_pct >= 0 ? "+" : "−"}${Math.abs(s.return_6m_pct).toFixed(1)}%`}</td>
                <td>{!gold ? <span className="sp-nil">Gold</span> : s.peer_label ? <span className={"sx-peer sx-peer-" + s.peer_label.toLowerCase().replace(" ", "")}>{s.peer_label}</span> : <span className="sp-nil">no label</span>}</td>
                <td>{!gold ? <span className="sp-nil">Gold</span> : p === undefined ? <span className="sp-nil">…</span> : p === "error" ? <span className="sp-nil">could not load</span> : !ps || !ps.rated ? <span className="sp-nil">not rated yet</span>
                  : <><span className={"sx-prism sx-prism-" + (ps.label ?? "").toLowerCase()}>{ps.label}</span> <b>{ps.final != null ? Math.round(ps.final) : ""}</b></>}</td>
                <td>{!gold ? <span className="sp-nil">Gold</span> : ps ? ps.shortTerm?.word ?? "–" : "–"}</td>
                <td>{!gold ? <span className="sp-nil">Gold</span> : ps ? ps.longTerm?.word ?? "–" : "–"}</td>
              </tr>); })}</tbody>
          </table></Scroll>
          {f === "all" && hit.length > 5 && <button type="button" className="sp-showall" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer ▴" : `Show all ${hit.length} ▾`}</button>}
          {f !== "all" && !hit.length && <p className="sp-empty">No stock of these {t.top.length} matches this filter.</p>}
          <p className="sp-note">{`Strongest ${t.top.length} of its counted stocks by 6-month return. Leader / In line / Laggard compares a stock with its peers. Open a stock for its full report.`}</p>
        </>}
    </section>
  );
}
export { BOXES };
export type { Box, RotationRow };
