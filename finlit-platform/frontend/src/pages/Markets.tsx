import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { Icon } from "../lib/icons";
import { dateIN, nf, num, MINUS } from "../lib/format";
import { downloadCsv, prefetchMarkets, qs, useGold, usePremium, type Feed as FeedT } from "../lib/premium";
import { LineChart } from "../charts/LineChart";
import { useDocTitle } from "../lib/title";
import { GoldLock, PremiumHead } from "./Premium";
import { useIndexHistory, useIndices, type IndexRow, type Stat } from "../lib/indices";
import { ChartHelp } from "../components/ChartHelp";
import { LogoLoader } from "../components/LogoLoader";
import { ChartZoom } from "../components/ChartZoom";
import { usePortfolio } from "../lib/portfolio";
import { useWatchlist } from "../lib/watchlist";
import { useAuth } from "../lib/auth";
import { useExpand } from "../components/dashboard/dx";
import { MkDd, MkSeg, type MkOption } from "../components/MkDd";
import { MK_TABS, MOVED, ROUTINE, catLabel, dShort, hhmm, ipoCounts, nice, resultCounts, split, todayIST, type MkTab } from "../lib/marketEvents";
import "../styles/market-events.css";

/* Task #322 (developer file 24, 22 Nov 2026): Market events & index in five tabs (Announcements, Call transcripts, Indices, Index in detail, Commodity
   indices). The IPO and results calendars left this page: both repeat a free page that holds more (/ipo, /results), and their old addresses lead there.
   No table scrolls sideways any more (the "First column ... Last column" slider is gone): each fits its space, and on a phone each row is a small card. */

type Row = Record<string, string | number | null | undefined>;
type Col = { key: string; label: string; num?: boolean; fmt?: (v: string | number | null | undefined, r: Row) => React.ReactNode };
const txt = (v: unknown) => (v == null || v === "" ? MINUS : String(v));
const n2 = (v: unknown) => (typeof v === "number" ? num(v) : MINUS);
const pc = (v: unknown) => (typeof v === "number" ? <span style={{ color: v >= 0 ? "var(--gain)" : "var(--loss)" }}>{(v > 0 ? "▲ +" : v < 0 ? "▼ " + MINUS : "") + nf(Math.abs(v))}%</span> : MINUS);

const PAGE = 15, PAGE_BIG = 50;

function Loading() { return <div aria-busy="true" style={{ minHeight: 360, display: "grid", placeItems: "center" }}><LogoLoader size="lg" label="Loading" /></div>; }
function Problem({ e, retry }: { e: unknown; retry: () => void }) {
  const status = (e as { status?: number })?.status;
  return <div className="state"><h2>{status === 403 ? "This tool is part of Gold" : "This data is not available right now"}</h2><p>{status === 403 ? "Sign in with a Gold account to use it." : "The data provider did not answer. Nothing is wrong with your account."}</p>
    {status !== 403 && <button className="btn" onClick={retry}>Try again</button>}</div>;
}
function Pager({ total, page, setPage, size, word }: { total: number; page: number; setPage: (p: number) => void; size: number; word: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <div className="pm-pager"><span>{total.toLocaleString("en-IN")} {word}</span><button className="btn" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="btn" type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button></div>;
}

/** A plain table (the commodity history): fits its space, rows as cards on a phone. */
function Table({ cols, rows, file }: { cols: Col[]; rows: Row[]; q?: string; file?: string }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows]);
  if (!rows.length) return <div className="pm-empty">Nothing to show for this choice.</div>;
  return <>
    {file && <div className="pm-tools"><button className="alx-link" onClick={() => downloadCsv(file, cols.map((c) => c.label), rows.map((r) => cols.map((c) => r[c.key] as string | number | null)))}><Icon name="table" /> Export CSV</button></div>}
    <div className="mk-tw"><table className="pm-t mk-stack"><thead><tr>{cols.map((c) => <th key={c.key} className={c.num ? "n" : ""} scope="col">{c.label}</th>)}</tr></thead>
      <tbody>{rows.slice(page * PAGE, page * PAGE + PAGE).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.key} data-l={c.label} className={c.num ? "n" : ""}>{c.fmt ? c.fmt(r[c.key], r) : txt(r[c.key])}</td>)}</tr>)}</tbody></table></div>
    <Pager total={rows.length} page={page} setPage={setPage} size={PAGE} word="rows" />
  </>;
}

/* ---------------------------------------------------------------- announcements and call transcripts */

type Ann = { date?: string; symbol?: string; category?: string; description?: string; document_url?: string };
const when = (s: unknown) => <>{dShort(s)}{hhmm(s) ? <small className="faint mk-u">{hhmm(s)}</small> : null}</>;
const matches = (r: Ann, t: string) => !t || `${r.symbol} ${r.description} ${r.category}`.toLowerCase().includes(t);

/** The member's followed companies (holdings and watchlists), for "My stocks". */
function useMine(): Set<string> {
  const { user } = useAuth(); const pf = usePortfolio(), wl = useWatchlist();
  return useMemo(() => new Set(user ? [...pf.holdings.filter((h) => h.owned !== false && h.side !== "sell").map((h) => h.symbol), ...wl.lists.flatMap((l) => l.symbols)] : []), [user, pf, wl]);
}

function EventFeed({ kind, big }: { kind: "announcements" | "transcripts"; big: boolean }) {
  const ann = kind === "announcements";
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [applied, setApplied] = useState({ from: "", to: "" });
  const [q, setQ] = useState(""), [cat, setCat] = useState("all"), [who, setWho] = useState<"all" | "mine">("all"), [noise, setNoise] = useState<"hide" | "show">("hide"), [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch, isFetching } = usePremium<FeedT<Ann>>(`/markets/${kind}` + qs({ from_date: applied.from, to_date: applied.to }));
  const mine = useMine();
  const all = data?.items || [];
  const t = q.trim().toLowerCase();
  const cats = useMemo(() => { const m = new Map<string, number>(); for (const r of all) m.set(String(r.category ?? ""), (m.get(String(r.category ?? "")) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); }, [all]);
  const nMine = all.filter((r) => mine.has(String(r.symbol))).length, nRout = all.filter((r) => ROUTINE.test(String(r.category ?? ""))).length;
  const rows = all.filter((r) => (!ann || cat === "all" || r.category === cat) && (who === "all" || mine.has(String(r.symbol)))
    && (!ann || noise === "show" || cat !== "all" || !ROUTINE.test(String(r.category ?? ""))) && matches(r, t));
  useEffect(() => setPage(0), [q, cat, who, noise, applied, big]);
  const size = big ? PAGE_BIG : PAGE;
  const shown = rows.slice(page * size, page * size + size);
  const csv = () => downloadCsv(`finlit-${kind}`, ["Date", "Symbol", "Company", ...(ann ? ["Category"] : []), "Announcement", "Document"],
    rows.map((r) => { const s = split(r); return [r.date, r.symbol, s.co, ...(ann ? [r.category] : []), s.what, r.document_url]; }));
  const catOpts: MkOption<string>[] = [{ v: "all", label: "All categories", small: all.length }, ...cats.map(([c, n]) => ({ v: c, label: catLabel(c) || "Other", small: n }))];
  return (
    <section aria-label={ann ? "Announcements" : "Call transcripts"}>
      {ann && <div className="pm-bar mk-bar">
        <MkSeg k="Companies" label="Companies" value={who} onChange={setWho} options={[{ v: "all", label: "All companies" }, { v: "mine", label: `My stocks ${nMine}` }]} />
        <MkSeg k="Routine notices" label="Routine notices" value={noise} onChange={setNoise} options={[{ v: "hide", label: `Hide routine notices ${nRout}` }, { v: "show", label: "Show everything" }]} />
      </div>}
      <div className="pm-bar mk-bar">
        {ann && <MkDd k="Category" value={cat} onChange={setCat} options={catOpts} search="Find a category" />}
        <label className="mk-find">Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company or words" /></label>
        <form className="mk-dates" onSubmit={(e) => { e.preventDefault(); setApplied({ from, to }); }}>
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} /></label>
          <button className="btn" type="submit">Apply</button>
          {(applied.from || applied.to) && <button className="btn" type="button" onClick={() => { setFrom(""); setTo(""); setApplied({ from: "", to: "" }); }}>Reset</button>}
        </form>
        <div className="mk-tools"><button className="alx-link" type="button" onClick={csv} disabled={!rows.length}><Icon name="table" /> Export CSV</button></div>
      </div>
      {isError ? <Problem e={error} retry={() => refetch()} /> : isLoading ? <Loading /> : <>
        <div className="mk-tw"><table className="pm-t mk-ann mk-stack">
          <thead><tr><th scope="col">When</th><th scope="col">Company</th>{ann && <th scope="col">Category</th>}<th scope="col">{ann ? "Announcement" : "Call or meeting"}</th><th scope="col">Document</th></tr></thead>
          <tbody>{shown.map((r, i) => { const s = split(r); return (
            <tr key={i}>
              <td className="mk-nw" data-l="When">{when(r.date)}</td>
              <td data-l="Company"><b>{txt(r.symbol)}</b>{s.co && s.co !== r.symbol ? <small className="faint mk-u">{s.co}</small> : null}</td>
              {ann && <td data-l="Category"><span className="chip mk-cat">{catLabel(r.category) || MINUS}</span></td>}
              <td className="wrapc mk-what" data-l={ann ? "Announcement" : "Call or meeting"}>{s.what || <span className="faint">No detail given; see the document</span>}</td>
              <td className="mk-nw" data-l="Document">{r.document_url ? <a href={r.document_url} target="_blank" rel="noopener noreferrer">Open ↗</a> : MINUS}</td>
            </tr>); })}
            {!shown.length && <tr><td colSpan={ann ? 5 : 4} className="mk-none">{who === "mine" && !mine.size ? "Add companies to a watchlist or your portfolio to see their filings here." : "Nothing matches. Clear the filter to see every row."}</td></tr>}</tbody>
        </table></div>
        <Pager total={rows.length} page={page} setPage={setPage} size={size} word={ann ? "announcements" : "filings"} />
        <p className="pm-meta">{ann ? "Routine notices are meeting schedules, newspaper copies, trading-window and certificate filings; choosing a category shows them. " : "Analyst-meet and call filings: schedules, recordings and transcripts. "}
          {applied.from || applied.to ? "Up to 7 days at a time. " : "The last 7 days. "}Updated {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "just now"} · Source: {data?.provider || "FinEdge"}{isFetching ? " · refreshing…" : ""}</p>
      </>}
    </section>
  );
}

/* ---------------------------------------------------------------- index prices and valuation history (/api/indices) */

const GROUPS = ["All", "Broad market", "Sector", "Strategy & theme", "Volatility"] as const;
const chg = (v: number | null) => (v == null ? MINUS : <span style={{ color: v >= 0 ? "var(--gain)" : "var(--loss)" }}>{(v > 0 ? "▲ +" : v < 0 ? "▼ " + MINUS : "") + nf(Math.abs(v))}%</span>);
const v2 = (v: number | null, d = 2) => (v == null ? MINUS : nf(v, d));
type IKey = "name" | "close" | "changePct" | "pe" | "pb" | "divYield";

/** Every NSE and BSE index: key indices as tiles, then a searchable, sortable table. A row opens its valuation history. */
function IndexPrices({ open }: { open: (code: string) => void }) {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useIndices();
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("All"), [ex, setEx] = useState<"All" | "NSE" | "BSE">("All"), [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: IKey; d: 1 | -1 } | null>(null), [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = (data?.items || []).filter((r) => (group === "All" || r.group === group) && (ex === "All" || r.exchange === ex) && (!t || r.name.toLowerCase().includes(t) || r.code.toLowerCase().includes(t)));
    if (!sort) return out;
    return [...out].sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.d;
    });
  }, [data, group, ex, q, sort]);
  useEffect(() => setPage(0), [group, ex, q, sort]);
  if (isError) return <Problem e={error} retry={() => refetch()} />;
  if (isLoading || !data) return <Loading />;
  const key = data.key.map((c) => data.items.find((r) => r.code === c)).filter(Boolean) as IndexRow[];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const th = (k: IKey, label: string, n = true) => <th className={n ? "n" : ""}><button className="pm-sort" onClick={() => setSort((s) => ({ k, d: s?.k === k ? (s.d === 1 ? -1 : 1) : k === "name" ? 1 : -1 }))}>{label} {sort?.k === k ? (sort.d > 0 ? "▲" : "▼") : ""}</button></th>;
  return (
    <section aria-label="Index prices">
      <p className="pm-meta"><span className={"pm-live" + (data.marketOpen ? " on" : "")} />{data.marketOpen ? (data.live ? "Market open · live levels from Dhan, refreshed every minute" : "Market open · live prices unavailable, showing the last close") : "Market closed · last prices"}{data.asOf ? ` · as of ${dateIN(data.asOf)}` : ""} · updated {new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} <ChartHelp id="idx-tiles" /></p>
      <div className="pm-heat" aria-label="Key indices">{key.map((r) => {
        const c = r.changePct;
        return <button key={r.code} className="pm-tile" onClick={() => r.code !== "INDVIX" && open(r.code)} title={r.code === "INDVIX" ? r.name : `Open ${r.name} valuation history`}
          style={{ "--tc": c == null ? "var(--faint)" : (r.code === "INDVIX" ? -c : c) >= 0 ? "var(--gain)" : "var(--loss)", "--ti": c == null ? 0 : 6 + Math.min(Math.abs(c), 3) * 7 } as React.CSSProperties}>
          <small>{r.name}</small><b>{v2(r.close)}</b><span>{c == null ? MINUS : (c > 0 ? "▲ +" : c < 0 ? "▼ " + MINUS : "") + nf(Math.abs(c)) + "%"}{r.points != null ? ` (${r.points > 0 ? "+" : ""}${nf(r.points)})` : ""}</span>
          {r.pe != null && <em>P/E {nf(r.pe, 1)}</em>}</button>;
      })}</div>
      <div className="pm-bar">
        <div className="pm-seg" role="group" aria-label="Kind of index">{GROUPS.map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}</div>
        <div className="pm-seg" role="group" aria-label="Exchange">{(["All", "NSE", "BSE"] as const).map((g) => <button key={g} type="button" aria-pressed={ex === g} onClick={() => setEx(g)}>{g}</button>)}</div>
        <label style={{ marginLeft: "auto" }}>Find an index<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Bank, IT, Midcap" /></label>
      </div>
      {!rows.length ? <div className="pm-empty">No index matches. Clear the search or pick another group.</div> : <>
        <div className="pm-tools"><button className="alx-link" onClick={() => downloadCsv("finlit-indices", ["Index", "Code", "Exchange", "Group", "Close", "Change %", "Points", "High", "Low", "P/E", "P/B", "Div. yield %", "Date"], rows.map((r) => [r.name, r.code, r.exchange, r.group, r.close, r.changePct, r.points, r.high, r.low, r.pe, r.pb, r.divYield, r.date]))}><Icon name="table" /> Export CSV</button></div>
        <div className="mk-tw"><table className="pm-t"><thead><tr>{th("name", "Index", false)}{th("close", "Close")}{th("changePct", "Change")}<th className="n">Points</th><th className="n">Day range</th>{th("pe", "P/E")}{th("pb", "P/B")}{th("divYield", "Div. yield %")}<th><span className="sr">Valuation history</span></th></tr></thead>
          <tbody>{rows.slice(page * PAGE, page * PAGE + PAGE).map((r) => (
            <tr key={r.code}><td><b>{r.name}</b><small className="faint" style={{ display: "block" }}>{r.exchange} · {r.group}</small></td><td className="n">{v2(r.close)}</td><td className="n">{chg(r.changePct)}</td><td className="n">{v2(r.points)}</td>
              <td className="n">{r.low != null && r.high != null ? `${nf(r.low)} – ${nf(r.high)}` : MINUS}</td><td className="n">{v2(r.pe, 1)}</td><td className="n">{v2(r.pb)}</td><td className="n">{v2(r.divYield)}</td>
              <td>{r.pe != null || r.pb != null ? <button className="alx-link" onClick={() => open(r.code)}>History</button> : null}</td></tr>))}</tbody></table></div>
        <div className="pm-pager"><span>{rows.length} indices</span><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button></div>
      </>}
    </section>
  );
}

const MEASURES = { pe: { label: "P/E", unit: "", d: 1, say: "Price for each rupee of the index's yearly profit." },
  pb: { label: "P/B", unit: "", d: 2, say: "Price against the book value of the index's companies." },
  dy: { label: "Dividend yield", unit: "%", d: 2, say: "Yearly dividends as a share of the index level, in %." } } as const;
type Measure = keyof typeof MEASURES;

/** Where an index's valuation sits against its own last 1, 3 or 5 years: the line, its median, a one-standard-deviation band, and a plain verdict. */
function IndexValuation({ code, setCode }: { code: string; setCode: (c: string) => void }) {
  const feed = useIndices();
  const [years, setYears] = useState(5), [m, setM] = useState<Measure>("pe"), [find, setFind] = useState("");
  const { data, isLoading, isError, error, refetch, isFetching } = useIndexHistory(code, years);
  const list = useMemo(() => (feed.data?.items || []).filter((r) => r.pe != null || r.pb != null), [feed.data]);
  const pick = list.filter((r) => !find.trim() || r.name.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 60);
  const st: Stat | null = data?.stats[m] ?? null;
  const rows = data?.rows || [];
  const series = rows.map((r) => r[m]);
  // task #322: where today sits in the index's own past, in the pack's words (low is lower than on three days in four), describing the past only
  const verdict = (s: Stat) => {
    const b = s.pctile <= 25 ? "low" : s.pctile >= 75 ? "high" : "usual";
    return { word: `${MEASURES[m].label} is ${b === "usual" ? "in its usual range" : b} against its own ${years} year${years > 1 ? "s" : ""}`, tone: m === "dy" ? "" : b === "low" ? "up" : b === "high" ? "down" : "" };
  };
  return (
    <section aria-label="Index valuation">
      <div className="pm-bar">
        <label>Index<select value={code} onChange={(e) => setCode(e.target.value)}>{(list.length ? list : [{ code, name: data?.name || code } as IndexRow]).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label>
        <label>Find<input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Type to narrow, e.g. Bank" /></label>
        {find.trim() && <div className="pm-pick">{pick.map((r) => <button key={r.code} type="button" className="bandc" onClick={() => { setCode(r.code); setFind(""); }}>{r.name}</button>)}{!pick.length && <span className="faint">No index with that name.</span>}</div>}
        <div className="pm-seg" role="group" aria-label="Period">{[1, 3, 5].map((y) => <button key={y} type="button" aria-pressed={years === y} onClick={() => setYears(y)}>{y}Y</button>)}</div>
        <div className="pm-seg" role="group" aria-label="Measure">{(Object.keys(MEASURES) as Measure[]).map((k) => <button key={k} type="button" aria-pressed={m === k} onClick={() => setM(k)}>{MEASURES[k].label}</button>)}</div>
      </div>
      {isError ? <Problem e={error} retry={() => refetch()} /> : isLoading || !data ? <Loading /> : !st ? <div className="pm-empty">{data.name} has no {MEASURES[m].label} history from the data provider. Try P/B or another index.</div> : (() => {
        const v = verdict(st), f = (x: number) => nf(x, MEASURES[m].d) + MEASURES[m].unit;
        return <>
          <div className="pm-verdict"><span className={"chip " + v.tone}>{v.word}</span>
            <span><b>{data.name} {MEASURES[m].label} {f(st.now)}</b> <span className="faint">against a {years}-year median of {f(st.median)} · higher than on {nf(st.pctile, 0)}% of days{isFetching ? " · refreshing…" : ""}</span></span></div>
          <div className="pm-cards" aria-label="Range over the period">
            <div className="pm-kpi"><small>Now</small><b>{f(st.now)}</b><i>{data.to ? dateIN(data.to) : ""}</i></div>
            <div className="pm-kpi"><small>{years}-year median</small><b>{f(st.median)}</b><i>Average {f(st.mean)}</i></div>
            <div className="pm-kpi"><small>Usual range (±1 sd)</small><b style={{ fontSize: 20 }}>{f(Math.max(0, st.median - st.sd))} – {f(st.median + st.sd)}</b><i>Two days in three fall here</i></div>
            <div className="pm-kpi"><small>Low · High</small><b style={{ fontSize: 20 }}>{f(st.min)} · {f(st.max)}</b><i>{nf(st.n, 0)} trading days</i></div>
          </div>
          <ChartZoom label="Index valuation history" className="cz-top"><div className="pm-chart card"><div className="pm-chart-h"><div><small>{MEASURES[m].say}</small><b>{data.name} {MEASURES[m].label}, last {years} year{years > 1 ? "s" : ""} <ChartHelp id="idx-valuation" /></b></div><span className="faint">Dashed: median · faint lines: usual range</span></div>
            <LineChart periods={rows.map((r) => dateIN(r.d, { day: "numeric", month: "short", year: "2-digit" }))} fmt={(x) => nf(x, MEASURES[m].d)} height={280} avg={st.median} avgLabel="Median"
              series={[{ key: m, label: MEASURES[m].label, color: "var(--gold)", values: series },
                { key: "hi", label: "Upper usual", color: "color-mix(in srgb, var(--muted) 45%, transparent)", values: rows.map(() => st.median + st.sd) },
                { key: "lo", label: "Lower usual", color: "color-mix(in srgb, var(--muted) 45%, transparent)", values: rows.map(() => Math.max(0, st.median - st.sd)) }]} /></div></ChartZoom>
          <div className="pm-tools"><button className="alx-link" onClick={() => downloadCsv(`finlit-${data.code}-valuation-${years}y`, ["Date", "P/E", "P/B", "Dividend yield %"], rows.map((r) => [r.d, r.pe, r.pb, r.dy]))}><Icon name="table" /> Export CSV ({nf(rows.length, 0)} days)</button></div>
        </>;
      })()}
    </section>
  );
}

type Item = { code: string; name: string; weight: number | null };
type Hist = { history: { period: string; label: string; value: number | null }[]; changes: { period: string; value: number | null }[]; changesUnavailable?: boolean };

function Commodities() {
  const [cat, setCat] = useState<"monthly_index" | "core_infra">("monthly_index");
  const [picked, setPicked] = useState<Record<string, string>>({}); const [q, setQ] = useState("");
  const list = usePremium<{ items: Item[]; fetchedAt: string }>(`/commodities?category=${cat}`);
  const code = picked[cat] || list.data?.items?.[0]?.code || null;   // the first series is shown until the member picks one
  const setCode = (c: string) => setPicked({ ...picked, [cat]: c });
  const hist = usePremium<Hist>(`/commodities/${code}`, !!code);
  const items = (list.data?.items || []).filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const rows = hist.data?.history || [];
  const latest = rows[0], prev = rows[1];
  return (
    <section aria-label="Commodities">
      <div className="pm-bar"><div className="pm-seg" role="group" aria-label="Series">{([["monthly_index", "Monthly commodity indices"], ["core_infra", "Eight core industries"]] as const).map(([k, l]) => <button key={k} aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>)}</div>
        <label style={{ marginLeft: "auto" }}>Find a series<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. steel" /></label></div>
      <p className="pm-meta">Values are monthly index levels, not rupee prices.</p>
      {list.isError ? <Problem e={list.error} retry={() => list.refetch()} /> : list.isLoading ? <Loading /> : (
        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(220px, 320px) 1fr", alignItems: "start" }} className="pm-comm">
          <ul className="scr-sec" aria-label="Series" style={{ maxHeight: 460, overflow: "auto" }}>{items.map((i) => <li key={i.code}><label><input type="radio" name="com" checked={code === i.code} onChange={() => setCode(i.code)} /><span>{i.name}</span>{i.weight != null && <small className="faint" style={{ marginLeft: "auto" }}>{nf(i.weight, 1)}</small>}</label></li>)}{!items.length && <li className="faint">No series match.</li>}</ul>
          <div>{hist.isError ? <Problem e={hist.error} retry={() => hist.refetch()} /> : hist.isLoading || !code ? <Loading /> : (
            <>
              <div className="pm-cards"><div className="pm-kpi"><small>Latest ({latest?.label || MINUS})</small><b>{latest?.value != null ? nf(latest.value) : MINUS}</b></div>
                <div className="pm-kpi"><small>Change on last month</small><b>{latest?.value != null && prev?.value ? pc(((latest.value - prev.value) / prev.value) * 100) : MINUS}</b></div></div>
              {hist.data?.changesUnavailable && <p className="pm-meta">Provider percentage changes are unavailable right now. The history below is still correct.</p>}
              {rows.length > 1 && <ChartZoom label="Commodity index trend" className="cz-top"><div className="pm-chart card"><div className="pm-chart-h"><div><small>Trend</small><b>{list.data?.items.find((i) => i.code === code)?.name} <ChartHelp id="commodity-trend" /></b></div><span className="faint">Monthly index level</span></div>
                <LineChart periods={[...rows].reverse().map((r) => r.label)} series={[{ key: "v", label: "Index", color: "var(--gold)", values: [...rows].reverse().map((r) => r.value) }]} fmt={(x) => nf(x, 1)} height={230} area /></div></ChartZoom>}
              <Table cols={[{ key: "label", label: "Month" }, { key: "value", label: "Index level", num: true, fmt: n2 }]} rows={rows as unknown as Row[]} q="" file={`finlit-commodity-${code}`} />
            </>)}</div>
        </div>)}
    </section>
  );
}


/** The week in four numbers. Open IPOs are counted from the dates (open only between the open and close dates); each tile opens its page or tab. */
function Glance({ go }: { go: (t: MkTab) => void }) {
  const ipo = usePremium<FeedT<Row>>("/markets/ipo"), res = usePremium<FeedT<Row>>("/markets/results"), ann = usePremium<FeedT<Row>>("/markets/announcements"), idx = useIndices();
  const today = todayIST();
  const ic = ipoCounts(ipo.data?.items || [], today), rc = resultCounts(res.data?.items || [], today);
  const nifty = (idx.data?.items || []).find((r) => r.code === "NIF50");
  const k = (v: React.ReactNode, ready: boolean) => (ready ? v : <span className="skeleton" style={{ display: "inline-block", width: 60, height: 26 }} />);
  return (
    <div className="pm-cards mk-kpis" aria-label="This week at a glance">
      <Link className="pm-kpi pm-kpi-btn" to="/ipo"><small>IPOs open now</small><b>{k(ic.open, !!ipo.data)}</b><i>{ipo.data ? `${ic.soon} upcoming · IPO calendar` : " "}</i></Link>
      <Link className="pm-kpi pm-kpi-btn" to="/results"><small>Results due this week</small><b>{k(rc.week, !!res.data)}</b><i>{res.data ? `${rc.later} coming up · Results calendar` : " "}</i></Link>
      <button className="pm-kpi pm-kpi-btn" type="button" onClick={() => go("announcements")}><small>Announcements, last 7 days</small><b>{k((ann.data?.items.length ?? 0).toLocaleString("en-IN"), !!ann.data)}</b><i>Filings and board outcomes</i></button>
      <button className="pm-kpi pm-kpi-btn" type="button" onClick={() => go("indices")}><small>{nifty ? nice(nifty.name) : "Nifty 50"}</small><b>{k(nifty?.close != null ? nf(nifty.close) : MINUS, !!idx.data)}</b><i>{nifty ? pc(nifty.changePct) : "Index level"}{nifty?.pe != null ? ` · P/E ${nf(nifty.pe, 1)}` : ""}</i></button>
    </div>
  );
}

const startTab = (): MkTab | string => { const h = location.hash.slice(1); return MOVED[h] ? h : (MK_TABS.find((t) => t.id === h)?.id ?? "announcements"); };

export function MarketsPage() {
  useDocTitle("Market events & index", "What companies told the exchanges this week, and every index with its valuation and returns against its own history, with monthly commodity indices.");
  const gold = useGold(); const qc = useQueryClient();
  const [tab, setTab] = useState<MkTab | string>(startTab);
  const [idx, setIdx] = useState("NIF50");
  const openIndex = (c: string) => { setIdx(c); setTab("valuations"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const label = MK_TABS.find((t) => t.id === tab)?.label ?? "";
  const x = useExpand(label);
  useEffect(() => { if (gold) prefetchMarkets(qc); }, [gold, qc]);
  useEffect(() => { if (!MOVED[tab]) history.replaceState(history.state, "", "#" + tab); }, [tab]);   // keep the router's own state
  if (MOVED[tab]) return <Navigate to={MOVED[tab]} replace />;   // the old #ipo and #results tabs: their own pages
  if (!gold) return <><PremiumHead title="Market events & index" art="macro" /><GoldLock title="Market Events & Index Dashboard" /></>;
  const t = tab as MkTab;
  const body = t === "commodities" ? <Commodities /> : t === "indices" ? <IndexPrices open={openIndex} /> : t === "valuations" ? <IndexValuation code={idx} setCode={setIdx} /> : <EventFeed key={t} kind={t} big={x.open} />;
  return (
    <>
      <PremiumHead title="Market events & index" art="macro" links={["/ipo", "/results", "/premium"]}>What companies told the exchanges this week, and every index with its <b>valuation and returns against its own history</b>, with monthly commodity indices.</PremiumHead>
      <div className="wrap mke" style={{ paddingBottom: 56 }}>
        <Glance go={setTab} />
        <div className="pm-tabs" role="tablist" aria-label="Market events sections">{MK_TABS.map((s) => <button key={s.id} role="tab" type="button" aria-selected={t === s.id} onClick={() => setTab(s.id)}>{s.label}</button>)}</div>
        <div className="mk-sect"><MkDd k="Section" value={t} onChange={(v) => setTab(v)} options={MK_TABS.map((s) => ({ v: s.id, label: s.label }))} /></div>
        {x.open && <div className="dx-hold mk-hold" style={{ height: x.hold ?? undefined }} aria-hidden="true" />}
        <section ref={x.panelRef} className={"mk-panel" + (x.open ? " dx-xp" : "")} aria-label={label} {...(x.open ? { role: "dialog", "aria-modal": true } : {})}>
          {x.bar}
          <div className="mk-ph"><h2 className="mk-pt">{label}</h2>{!x.open && <button ref={x.btnRef} type="button" className="dx-xb mk-xb" aria-label={`Expand: ${label}`} title="Expanded view, 50 rows a page" onClick={x.expand}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" /></svg></button>}</div>
          {body}
        </section>
        {x.backdrop}
        <p className="pm-meta" style={{ marginTop: 22 }}>General information, not investment advice. Index levels refresh every minute while the market is open; valuations (P/E, P/B, dividend yield) are published once a day. Where a value sits against its own history describes the past, not what comes next.</p>
      </div>
    </>
  );
}
