// Task #274 (the 20 Nov equity pack, change 20): Themes, from Discover.
//   themeView     pure: for a list of symbols, Discover's main theme of each placed company, the themes only mentioned, and per theme Discover's own counts
//                 (companies with it as main theme, how many more mention it), the theme's 3-month median and its long-term uptrend count (the figures of its
//                 Discover theme card: discovery/model `stat`), and the companies of the list not placed yet.
//   YourThemes    the section after What changed: Your shares / Watchlists, a chip row (main themes, then themes only mentioned, dashed), a table, "Not in
//                 Discover yet", a note and three things to know; "Show them in the table" sets a Theme filter on Your shares.
//   ThemePill     the theme's short name beside the size chip in the table; opens the theme with the company found.
// A theme comes from the words of a company's own presentation; it is not proof of business in it. Describes; never advice.
import { useMemo } from "react";
import { Link } from "react-router";
import { Section } from "../../components/sectors/pack/Common";
import { isUp, joinRows, med, slug, type Board, type DRow } from "../../discovery/model";
import type { Card } from "../../lib/pulsePack";
import { Insights } from "./EquityPack";
import "./eq-themes.css";

type URowish = Parameters<typeof joinRows>[1];
export type ThemeLine = { name: string; short: string; slug: string; n: number; also: number; m3: number | null; up: number; /** companies of the theme with a long-term trend reading (none on a plan without Prism) */ rated: number; mine: { s: string; r3m: number | null; st: string }[]; mention: string[] };
export type ThemeView = { total: number; placed: number; themes: ThemeLine[]; mentionOnly: { name: string; short: string; slug: string; mine: string[] }[]; notPlaced: string[]; updated: string | null };

export function themeView(board: Board, uni: URowish, symbols: string[]): ThemeView {
  const rows: DRow[] = joinRows(board, uni, undefined, undefined, undefined);
  const by = new Map(rows.map((r) => [r.s, r])), meta = new Map(board.themes.map((t) => [t.name, t]));
  const mineRows = symbols.map((s) => by.get(s)).filter((r): r is DRow => !!r);
  const mainNames = [...new Set(mineRows.map((r) => r.th))];
  const themes: ThemeLine[] = mainNames.map((name) => {
    const all = rows.filter((r) => r.th === name), t = meta.get(name), mine = mineRows.filter((r) => r.th === name);
    return { name, short: t?.short ?? name, slug: slug(name), n: t?.n ?? all.length, also: t?.also ?? 0, m3: med(all.map((r) => r.r3m)), up: all.filter(isUp).length, rated: all.filter((r) => r.lt != null).length,
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
export function themeCards(v: ThemeView, label: (s: string) => string = (s) => s): Card[] {
  const out: Card[] = [];
  const top = v.themes[0];
  if (top && top.mine.length >= 2) out.push({ kind: "watch", title: `${cap(num(top.mine.length))} of your shares share one theme: ${top.short}`, text: `${top.mine.map((x) => label(x.s)).join(", ")} all have ${top.name} as their main theme, so news about that theme can move them together.` });
  const pairs = v.themes.flatMap((t) => t.mine.filter((x) => x.r3m != null && t.m3 != null).map((x) => ({ ...x, d: (x.r3m as number) - (t.m3 as number), t })));
  if (pairs.length) { const ahead = pairs.filter((x) => x.d > 0).length;
    out.push({ kind: ahead * 2 >= pairs.length ? "good" : "insight", title: `${ahead} of ${pairs.length} moved more than their theme in 3 months`, text: `Each share's 3-month move against the median of the companies with the same main theme on Discover${pairs[0] ? `; for example ${label(pairs[0].s)} ${pct(pairs[0].r3m)} against ${pct(pairs[0].t.m3)}` : ""}.` }); }
  const st = v.themes.flatMap((t) => t.mine.map((x) => x.st)), op = st.filter((x) => x === "Operating").length;
  if (st.length) out.push({ kind: "insight", title: op === st.length ? "Every placed share is already operating in its theme" : `${op} of ${st.length} placed shares are already operating in their theme`, text: "How far along comes from each company's own presentation: operating, under execution, planned, or at MoU or pilot stage. Check the figures in its documents." });
  return out;
}

export function YourThemes({ v, list, onList, counts, label, onShow, theme }: { v: ThemeView | null; list: "shares" | "watch"; onList: (l: "shares" | "watch") => void;
  counts: { shares: { placed: number; total: number }; watch: { placed: number; total: number } }; label: (s: string) => string; onShow?: (name: string) => void; theme: string | null }) {
  const cards = useMemo(() => (v ? themeCards(v, label) : []), [v, label]);
  const day = v?.updated ? new Date(v.updated).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  const co = (s: string) => <Link key={s} to={`/stocks/${encodeURIComponent(s)}`}>{label(s)}</Link>;
  return (
    <Section id="eq-themes" hide title="Your themes, from Discover" help="The themes Discover reads from each company's newest investor presentation, for the companies on your list." how="A theme comes from the words of a company's own presentation; it is not proof of business in it."
      sub={v ? `${v.placed} of ${v.total} ${list === "shares" ? "shares are" : "watchlist names are"} placed in a theme; ${v.themes.length} main ${v.themes.length === 1 ? "theme" : "themes"} between them.` : "Reading Discover's themes…"}>
      <div className="eqh-bar">
        <span className="eqh-lists" role="group" aria-label="Which list">
          <button type="button" aria-pressed={list === "shares"} onClick={() => onList("shares")}>Your shares <b>{counts.shares.placed} of {counts.shares.total}</b></button>
          <button type="button" aria-pressed={list === "watch"} onClick={() => onList("watch")}>Watchlists <b>{counts.watch.placed} of {counts.watch.total}</b></button></span>
        {day && <span className="eqh-asof">Read from each company's newest investor presentation, to {day}</span>}
        <Link className="eqh-all" to="/discover">All themes in Discover ↗</Link>
      </div>
      {!v ? <p className="sp-note">Reading Discover's themes…</p> : !v.placed ? <p className="sp-empty">None of {list === "shares" ? "your shares" : "your watchlist names"} is placed in a Discover theme yet. A company is placed once FinLit reads its newest investor presentation.</p> : <>
        <div className="eqh-chips" role="list">
          {v.themes.map((t) => <Link role="listitem" key={t.name} className="eqh-chip" to={`/discover/themes/${t.slug}?mine=1`}><b>{t.short}</b> {t.mine.length} of yours · {t.n} companies ›</Link>)}
          {v.mentionOnly.map((t) => <Link role="listitem" key={t.name} className="eqh-chip dash" to={`/discover/themes/${t.slug}?mine=1`} title={`Mentioned by ${t.mine.map(label).join(", ")}, not their main theme`}><b>{t.short}</b> mentioned by {t.mine.length} ›</Link>)}
        </div>
        <div className="eqh-tw"><table className="eqh-t">
          <thead><tr><th scope="col">Theme</th><th scope="col">Your {list === "shares" ? "shares" : "names"} with it as their main theme</th><th scope="col">How far along</th><th scope="col" className="r">Theme · 3-month median</th><th scope="col" className="r">Theme · in a long-term uptrend</th><th scope="col">Also mention it</th></tr></thead>
          <tbody>{v.themes.map((t) => <tr key={t.name} className={theme === t.name ? "on" : undefined}>
            <th scope="row"><Link className="eqh-tn" to={`/discover/themes/${t.slug}?mine=1`}>{t.name}</Link><small>{t.n} companies{t.also ? ` · ${t.also} more mention it` : ""}</small>
              {onShow && <button type="button" className="eqh-show" onClick={() => onShow(t.name)}>Show them in the table</button>}</th>
            <td>{t.mine.map((x) => <span key={x.s} className="eqh-m">{co(x.s)} <small className={x.r3m == null ? "" : x.r3m >= 0 ? "eqh-up" : "eqh-dn"}>{x.r3m == null ? "3-month move not known" : `${pct(x.r3m)} in 3 months`}</small></span>)}</td>
            <td>{[...new Set(t.mine.map((x) => x.st))].map((st) => <span key={st} className={"eqh-st " + (STAGE_TONE[st] ?? "ns")}><i aria-hidden="true" />{st}</span>)}</td>
            <td className="r">{pct(t.m3)}</td><td className="r">{t.rated ? `${t.up} of ${t.rated}` : <span title="The long-term trend comes from FinLit Prism, on the Gold plan">–</span>}</td>
            <td>{t.mention.length ? t.mention.map(co).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ", ", x] : [x]), []) : "—"}</td></tr>)}</tbody>
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
