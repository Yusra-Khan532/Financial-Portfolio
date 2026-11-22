// Task #274 (the 20 Nov equity pack, change 20): Themes, from Discover.
//   themeView     pure: for a list of symbols, Discover's main theme of each placed company, the themes only mentioned, and per theme Discover's own counts
//                 (companies with it as main theme, how many more mention it), the theme's 3-month median and its long-term uptrend count (the figures of its
//                 Discover theme card: discovery/model `stat`), and the companies of the list not placed yet.
//   YourThemes    the section after What changed: Your shares / Watchlists, a chip row (main themes, then themes only mentioned, dashed), a table, "Not in
//                 Discover yet", a note and three things to know; "Show them in the table" sets a Theme filter on Your shares.
//   ThemePill     the theme's short name beside the size chip in the table; opens the theme with the company found.
// A theme comes from the words of a company's own presentation; it is not proof of business in it. Describes; never advice.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Section, Tip } from "../../components/sectors/pack/Common";
import { NO_FILTERS, filterThemes, filtersOn, stageCounts, type ThemeFilters } from "../../lib/themesFilter";
import { isUp, joinRows, med, slug, type Board, type DRow } from "../../discovery/model";
import type { Card } from "../../lib/pulsePack";
import { Insights } from "./EquityPack";
import "./eq-themes.css";

type URowish = Parameters<typeof joinRows>[1];
export type ThemeLine = { name: string; short: string; slug: string; n: number; also: number; m3: number | null; up: number; /** companies of the theme with a long-term trend reading (none on a plan without Prism) */ rated: number; /** companies of the theme listed with prices (task #323) */ listed: number; mine: { s: string; r3m: number | null; st: string }[]; mention: string[] };
export type ThemeView = { total: number; placed: number; themes: ThemeLine[]; mentionOnly: { name: string; short: string; slug: string; mine: string[] }[]; notPlaced: string[]; updated: string | null };

export function themeView(board: Board, uni: URowish, symbols: string[]): ThemeView {
  const rows: DRow[] = joinRows(board, uni, undefined, undefined, undefined);
  const by = new Map(rows.map((r) => [r.s, r])), meta = new Map(board.themes.map((t) => [t.name, t]));
  const mineRows = symbols.map((s) => by.get(s)).filter((r): r is DRow => !!r);
  const mainNames = [...new Set(mineRows.map((r) => r.th))];
  const themes: ThemeLine[] = mainNames.map((name) => {
    const all = rows.filter((r) => r.th === name), t = meta.get(name), mine = mineRows.filter((r) => r.th === name);
    return { name, short: t?.short ?? name, slug: slug(name), n: t?.n ?? all.length, also: t?.also ?? 0, m3: med(all.map((r) => r.r3m)), up: all.filter(isUp).length, rated: all.filter((r) => r.lt != null).length, listed: all.length,
      mine: mine.map((r) => ({ s: r.s, r3m: r.r3m, st: r.st })), mention: mineRows.filter((r) => r.th !== name && r.sec.includes(name)).map((r) => r.s) };
  }).sort((a, b) => b.mine.length - a.mine.length || b.n - a.n);
  const mentionNames = [...new Set(mineRows.flatMap((r) => r.sec))].filter((x) => !mainNames.includes(x));
  return { total: symbols.length, placed: mineRows.length, themes,
    mentionOnly: mentionNames.map((name) => ({ name, short: meta.get(name)?.short ?? name, slug: slug(name), mine: mineRows.filter((r) => r.sec.includes(name)).map((r) => r.s) })),
    notPlaced: symbols.filter((s) => !by.has(s)), updated: board.updated };
}

const pct = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const num = (n: number) => (n <= 10 ? NUM[n] : String(n)), cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const STAGE_TONE: Record<string, string> = { Operating: "op", "Under execution": "ex", Planned: "pl", "MoU / pilot": "mou", "Not stated": "ns" };

/** Three things to know under the table: the theme most of the list shares, how the list's theme shares moved against their theme, and how far along they are. */
export function themeCards(v: ThemeView, label: (s: string) => string = (s) => s, voice: "own" | "list" = "own"): Card[] {
  const L = voice === "list";   // task #323 (file 22): companies on a watchlist, not your shares
  const out: Card[] = [];
  const top = v.themes[0];
  if (top && top.mine.length >= 2) out.push({ kind: "watch", title: L ? `${cap(num(top.mine.length))} companies on this list share one theme: ${top.short}` : `${cap(num(top.mine.length))} of your shares share one theme: ${top.short}`, text: `${top.mine.map((x) => label(x.s)).join(", ")} all have ${top.name} as their main theme, so news about that theme can move them together.` });
  const pairs = v.themes.flatMap((t) => t.mine.filter((x) => x.r3m != null && t.m3 != null).map((x) => ({ ...x, d: (x.r3m as number) - (t.m3 as number), t })));
  if (pairs.length) { const ahead = pairs.filter((x) => x.d > 0).length;
    out.push({ kind: ahead * 2 >= pairs.length ? "good" : "insight", title: `${ahead} of ${pairs.length} moved more than their theme in 3 months`, text: `Each share's 3-month move against the median of the companies with the same main theme on Discover${pairs[0] ? `; for example ${label(pairs[0].s)} ${pct(pairs[0].r3m)} against ${pct(pairs[0].t.m3)}` : ""}.` }); }
  const st = v.themes.flatMap((t) => t.mine.map((x) => x.st)), op = st.filter((x) => x === "Operating").length;
  if (st.length) out.push({ kind: "insight", title: op === st.length ? `Every placed ${L ? "company" : "share"} is already operating in its theme` : `${op} of ${st.length} placed ${L ? "companies" : "shares"} are already operating in their theme`, text: "How far along comes from each company's own presentation: operating, under execution, planned, or at MoU or pilot stage. Check the figures in its documents." });
  return out;
}

const MORE = 6;          // share lines shown per theme before "N more"
const ALSO = 4;          // names shown under "Also mention it" before "N more"
const list2 = (xs: React.ReactNode[]) => xs.reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ", ", x] : [x]), []);

/** Task #323 (developer file 21, part 10): the filter bar's state and what it shows (the rules are lib/themesFilter.ts). */
function useThemesFilter(v: ThemeView | null, list: "shares" | "watch", onList = false) {
  const [f, setF] = useState<ThemeFilters>(NO_FILTERS), [open, setOpen] = useState<Record<string, boolean>>({});
  const noun = list === "shares" ? "shares" : onList ? "companies" : "names";   // task #323 (file 22, W2): "… 5 of 32 companies match" on Watchlists
  const all = v?.themes ?? [];
  const res = useMemo(() => filterThemes(all, f, noun), [all, f, noun]);
  const on = filtersOn(f), q = f.q.trim().toUpperCase();
  const byName = new Map(res.rows.map((r) => [r.name, r]));
  const set = <K extends keyof ThemeFilters>(k: K, val: ThemeFilters[K]) => setF((o) => ({ ...o, [k]: val }));
  const bar = (
    <>
      <div className="eqh-f" role="group" aria-label="Filter and sort the themes">
        <div className="eqh-fst" role="group" aria-label="How far along">
          <span className="eqh-fl">How far along</span>
          {stageCounts(all).map(({ stage, n }) => <button key={stage} type="button" className="eqh-fc" aria-pressed={f.stages.includes(stage)}
            onClick={() => setF((o) => ({ ...o, stages: o.stages.includes(stage) ? o.stages.filter((x) => x !== stage) : [...o.stages, stage] }))}><i data-c={STAGE_TONE[stage] ?? "ns"} aria-hidden="true" />{stage} <b>{n}</b></button>)}
        </div>
        <div className="eqh-fr2">
          <label className="eqh-fs"><span>3-month move</span><select value={f.move} onChange={(e) => set("move", e.target.value as ThemeFilters["move"])}>
            <option value="">Any</option><option value="up">Up</option><option value="down">Down</option><option value="ahead">Ahead of its theme</option><option value="behind">Behind its theme</option></select></label>
          <label className="eqh-fs"><span>Sort</span><select value={f.sort} onChange={(e) => set("sort", e.target.value as ThemeFilters["sort"])}>
            <option value="n">{onList ? "Most companies" : `Most of your ${noun}`}</option><option value="med-d">3-month median, high to low</option><option value="med-a">3-month median, low to high</option><option value="ut">Most in a long-term uptrend</option><option value="az">Theme, A to Z</option></select></label>
          <label className="eqh-fq"><span className="sr-only">Find a share in the themes</span><input type="search" placeholder={list === "shares" ? "Find a share" : "Find a company"} value={f.q} autoComplete="off" spellCheck={false} onChange={(e) => set("q", e.target.value)} /></label>
          <Tip label="About these filters" text="How far along comes from each company's own presentation: operating, under execution, planned, MoU or pilot, or not stated; pick one or more. Ahead of its theme: the share's 3-month move is above the median of all companies with the same main theme; behind: below it."
            how={`A theme stays while at least one of its ${noun} matches. Sorting and finding work together with the filters.`} />
        </div>
      </div>
      <p className="eqh-fres" role="status" aria-live="polite">{res.summary}{on || f.sort !== "n" ? <button type="button" className="eqh-fx" onClick={() => setF(NO_FILTERS)}>Clear filters</button> : null}</p>
      {on && !res.rows.length ? <p className="eqh-fnone">No {list === "shares" ? "share" : "name"} in your themes matches these filters.</p> : null}
    </>);
  return {
    on, bar, rows: res.rows,
    mine: (t: ThemeLine) => byName.get(t.name)?.mine ?? t.mine,
    open: (t: ThemeLine) => on || !!open[t.name],
    hit: (s: string) => !!q && s.toUpperCase().includes(q),
    toggle: (t: ThemeLine) => setOpen((o) => ({ ...o, [t.name]: !o[t.name] })),
    isOpen: (t: ThemeLine) => !!open[t.name],
  };
}

/** "Operating 4 · Planned 2": the stage count under a theme's share lines, when they are at more than one stage. */
function stageSum(t: ThemeLine): string | null {
  const c: Record<string, number> = {};
  t.mine.forEach((x) => { c[x.st] = (c[x.st] || 0) + 1; });
  const k = Object.keys(c);
  return k.length > 1 ? k.sort((a, b) => c[b] - c[a]).map((x) => `${x} ${c[x]}`).join(" · ") : null;
}

export function YourThemes({ v, list, onList, counts, label, onShow, theme, voice = "own", showLabel }: { v: ThemeView | null; list: "shares" | "watch"; onList: (l: "shares" | "watch") => void;
  /** task #323 (developer file 22, W2): "list" on the Watchlists page: the open list's companies, no Your shares / Watchlists switch */ voice?: "own" | "list"; showLabel?: string;
  counts: { shares: { placed: number; total: number }; watch: { placed: number; total: number } }; label: (s: string) => string; onShow?: (name: string) => void; theme: string | null }) {
  const cards = useMemo(() => (v ? themeCards(v, label, voice) : []), [v, label, voice]);
  const L = voice === "list";
  const F = useThemesFilter(v, list, L);
  const day = v?.updated ? new Date(v.updated).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  const co = (s: string) => <Link key={s} to={`/stocks/${encodeURIComponent(s)}`}>{label(s)}</Link>;
  return (
    <Section id="eq-themes" hide title={L ? "Themes on this list, from Discover" : "Your themes, from Discover"} help={`The themes Discover reads from each company's newest investor presentation, for the companies on ${L ? "this" : "your"} list.`} how="A theme comes from the words of a company's own presentation; it is not proof of business in it."
      sub={v ? `${v.placed} of ${v.total} ${list === "shares" ? "shares are" : L ? "companies on this list are" : "watchlist names are"} placed in a theme; ${v.themes.length} main ${v.themes.length === 1 ? "theme" : "themes"} between them.` : "Reading Discover's themes…"}>
      <div className="eqh-bar">
        {!L && <span className="eqh-lists" role="group" aria-label="Which list">
          <button type="button" aria-pressed={list === "shares"} onClick={() => onList("shares")}>Your shares <b>{counts.shares.placed} of {counts.shares.total}</b></button>
          <button type="button" aria-pressed={list === "watch"} onClick={() => onList("watch")}>Watchlists <b>{counts.watch.placed} of {counts.watch.total}</b></button></span>}
        {day && <span className="eqh-asof">Read from each company's newest investor presentation, to {day}</span>}
        <Link className="eqh-all" to="/discover">All themes in Discover ↗</Link>
      </div>
      {!v ? <p className="sp-note">Reading Discover's themes…</p> : !v.placed ? <p className="sp-empty">None of {list === "shares" ? "your shares" : L ? "the companies on this list" : "your watchlist names"} is placed in a Discover theme yet. A company is placed once FinLit reads its newest investor presentation.</p> : <>
        <div className="eqh-chips" role="list">
          {v.themes.map((t) => <Link role="listitem" key={t.name} className="eqh-chip" to={`/discover/themes/${t.slug}?mine=1`}><b>{t.short}</b> {t.mine.length} {L ? "on this list" : "of yours"} · {t.n} companies ›</Link>)}
          {v.mentionOnly.map((t) => <Link role="listitem" key={t.name} className="eqh-chip dash" to={`/discover/themes/${t.slug}?mine=1`} title={`Mentioned by ${t.mine.map(label).join(", ")}, not their main theme`}><b>{t.short}</b> mentioned by {t.mine.length} ›</Link>)}
        </div>
        {F.bar}
        <div className="eqh-tw" hidden={F.on && !F.rows.length}><table className="eqh-t eqh-t2">
          <thead><tr><th scope="col">Theme</th>
            <th scope="col">{L ? "On this list, with it as their main theme" : `Your ${list === "shares" ? "shares" : "names"} with it as their main theme`}<span className="eqh-hh" aria-hidden="true"><span>{list === "shares" ? "Share" : L ? "Company" : "Name"}</span><span>3 months</span><span>How far along</span></span></th>
            <th scope="col" className="r">3-month median<span className="eqh-hs">all in the theme</span></th><th scope="col" className="r">In a long-term uptrend<span className="eqh-hs">all in the theme</span></th><th scope="col">Also mention it</th></tr></thead>
          <tbody>{F.rows.map((r) => { const t = v.themes.find((x) => x.name === r.name)!, mine = F.mine(t), open = F.open(t), extra = t.mine.length - MORE, sum = F.on ? null : stageSum(t);
            const ut = t.rated ? Math.round((t.up / t.rated) * 100) : null;
            return <tr key={t.name} className={theme === t.name ? "on" : undefined}>
              <th scope="row"><Link className="eqh-tn" to={`/discover/themes/${t.slug}?mine=1`}>{t.name}</Link><small>{t.n} companies{t.also ? ` · ${t.also} more mention it` : ""}</small>
                {onShow && <button type="button" className="eqh-show" onClick={() => onShow(t.name)}>{showLabel ?? "Show them in the table"}</button>}</th>
              <td data-l={`${L ? "On this list" : `Your ${list === "shares" ? "shares" : "names"}`}: 3 months · how far along`}>
                <ul className={open ? "eqh-ml open" : "eqh-ml"}>{mine.map((x, i) => <li key={x.s} className={[i >= MORE ? "eqh-x" : "", F.hit(x.s) ? "eqh-hit" : ""].filter(Boolean).join(" ") || undefined}>
                  <Link to={`/stocks/${encodeURIComponent(x.s)}`}>{label(x.s)}</Link>
                  <small className={x.r3m == null ? undefined : x.r3m >= 0 ? "eqh-up" : "eqh-dn"} title={x.r3m == null ? "3-month move not known" : "Its move over 3 months"}>{x.r3m == null ? "–" : pct(x.r3m)}</small>
                  <span className={"eqh-st " + (STAGE_TONE[x.st] ?? "ns")}><i aria-hidden="true" />{x.st}</span></li>)}</ul>
                {!F.on && extra > 0 && <button type="button" className="eqh-more" aria-expanded={F.isOpen(t)} onClick={() => F.toggle(t)}>{F.isOpen(t) ? "Show fewer ▴" : `${extra} more ▾`}</button>}
                {sum && <p className="eqh-sum">{sum}</p>}</td>
              <td className={"r eqh-md" + (t.m3 == null ? "" : t.m3 >= 0 ? " eqh-up" : " eqh-dn")} data-l="Theme · 3-month median">{pct(t.m3)}</td>
              <td className="r" data-l="Theme · in a long-term uptrend">{ut != null ? <><span className="eqh-ut"><i style={{ ["--w" as string]: `${ut}%` }} aria-hidden="true" />{ut}%</span><small className="eqh-of">{t.up} of {t.rated}</small>
                {t.listed > t.rated && <small>{t.listed - t.rated} of the {t.listed} have no trend reading yet</small>}</> : <span title="The long-term trend comes from FinLit Prism, on the Gold plan">–</span>}</td>
              <td data-l="Also mention it">{t.mention.length ? <>{list2(t.mention.slice(0, ALSO).map(co))}{t.mention.length > ALSO && <details className="eqh-mm"><summary>{t.mention.length - ALSO} more</summary>{list2(t.mention.slice(ALSO).map(co))}</details>}</> : "—"}</td></tr>; })}</tbody>
        </table></div>
        {v.notPlaced.length > 0 && <p className="eqh-np"><b>Not in Discover yet ({v.notPlaced.length}):</b> {v.notPlaced.map(co).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ", ", x] : [x]), [])}. A company is placed once FinLit reads its newest investor presentation.</p>}
        <p className="sp-note">A theme comes from the words of a company's own presentation; it is not proof of business in it. Check the figures, orders and status in the company's documents. Not a recommendation.</p>
        <Insights items={cards} scope="eq.themes" />
      </>}
    </Section>);
}

/** The pill in Industry · size: the main theme's short name, one line; it opens the theme with the company found. Nothing for a company not placed. */
export function ThemePill({ t, name }: { t: { short: string; slug: string; name: string } | null; name: string }) {
  if (!t) return null;
  return <Link className="pfs-theme" to={`/discover/themes/${t.slug}?q=${encodeURIComponent(name)}`} title={`${t.name}: Discover's main theme for ${name}`}>{t.short}</Link>;
}
