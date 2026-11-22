// Task #322 C (developer file 24, 22 Nov 2026): the three index tabs of Market events & index.
//  · Indices: names in one style; P/E against each index's own 5 years as a column with a position bar and a Low / Usual / High filter; a Columns
//    dropdown (Valuation, Returns, Today); sort by any of them; "Open" leads to Index in detail. Figures for every index come in one answer (/api/indices/board).
//  · Index in detail: one searchable, grouped Index dropdown with each P/E; Compare with a second index (both lines, its figures, the ratio against its usual
//    level); How it has moved (four returns, 1-year range, 1-year line); What is inside (largest by market value, the day's biggest rises and falls).
//  · Commodity indices: an Often watched table of 15 wholesale series (latest, 1 month, 1 year, 5 years, who it matters to); "Show" draws a series; one
//    searchable Series dropdown for the rest; the latest month on file stated at the top.
// Words: low / in its usual range / high describe where today sits in the index's own past; never advice.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { apiGet, type ApiError } from "../lib/api";
import { Icon } from "../lib/icons";
import { dateIN, nf, MINUS } from "../lib/format";
import { downloadCsv, usePremium } from "../lib/premium";
import { LineChart } from "../charts/LineChart";
import { useIndexHistory, useIndices, type IndexRow, type Stat } from "../lib/indices";
import { useLevels, useMembers } from "../lib/markets";
import { useUniverse } from "../lib/screener";
import { ChartZoom } from "../components/ChartZoom";
import { ChartHelp } from "../components/ChartHelp";
import { LogoLoader } from "../components/LogoLoader";
import { MkDd, MkSeg, type MkOption } from "../components/MkDd";
import { nice } from "../lib/marketEvents";
import { subOf, titleOf } from "../lib/companyLabel";

/* ---------------------------------------------------------------- shared bits */

export type BoardRow = { code: string; pe: { now: number; median: number; pctile: number; band: "low" | "usual" | "high"; n: number } | null;
  ret: { w1?: number; m1?: number; m3?: number; y1?: number }; lo1y: number | null; hi1y: number | null; pos1y: number | null; asOf?: string };
export type Board = { ready: boolean; items: BoardRow[]; built?: string; indices?: number; withPe?: number; withReturns?: number };
/** Every index's P/E position and returns in one answer, saved on the server; asked again every 30 s until the first copy is ready. */
export const useIndexBoard = (enabled = true) => useQuery<Board, ApiError>({
  queryKey: ["index-board"], queryFn: () => apiGet<Board>("/api/indices/board"), enabled, staleTime: 600_000, retry: 1, placeholderData: keepPreviousData,
  refetchInterval: (q) => (q.state.data && !q.state.data.ready ? 30_000 : false),
});

export const BAND = { low: "Low for this index", usual: "In its usual range", high: "High for this index" } as const;
const PAGE = 15, PAGE_BIG = 50;
const signed = (v: number | null | undefined, d = 1) => (v == null ? MINUS : `${v >= 0 ? "+" : MINUS}${nf(Math.abs(v), d)}%`);
const tone = (v: number | null | undefined) => (v == null ? undefined : { color: v >= 0 ? "var(--gain)" : "var(--loss)" });
const Ret = ({ v, d = 1 }: { v: number | null | undefined; d?: number }) => <span style={tone(v)}>{signed(v, d)}</span>;
const Chg = ({ v }: { v: number | null | undefined }) => <span style={tone(v)}>{v == null ? MINUS : `${v >= 0 ? "▲ +" : "▼ " + MINUS}${nf(Math.abs(v))}%`}</span>;
/** A thin bar with a mark at p (0 to 100): where today sits in its own range. */
export const Meter = ({ p, cls = "", label }: { p: number | null; cls?: string; label?: string }) => p == null ? <span className="faint">{MINUS}</span>
  : <span className={"mk-meter " + cls} role="img" aria-label={label ?? `Higher than on ${Math.round(p)}% of days`}><i style={{ left: `${Math.max(2, Math.min(98, p)).toFixed(0)}%` }} /></span>;
function Loading() { return <div aria-busy="true" style={{ minHeight: 280, display: "grid", placeItems: "center" }}><LogoLoader size="lg" label="Loading" /></div>; }
function Problem({ e, retry }: { e: unknown; retry: () => void }) {
  const status = (e as { status?: number })?.status;
  return <div className="state"><h2>{status === 403 ? "This tool is part of Gold" : "This data is not available right now"}</h2><p>{status === 403 ? "Sign in with a Gold account to use it." : "The data provider did not answer. Nothing is wrong with your account."}</p>
    {status !== 403 && <button className="btn" onClick={retry}>Try again</button>}</div>;
}
function Pager({ total, page, setPage, size, word }: { total: number; page: number; setPage: (p: number) => void; size: number; word: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <div className="pm-pager"><span>{total.toLocaleString("en-IN")} {word}</span><button className="btn" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="btn" type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button></div>;
}

/* ---------------------------------------------------------------- Indices */

const KINDS = ["All", "Broad market", "Sector", "Strategy & theme", "Volatility"] as const;
type Cols = "val" | "ret" | "day";
type SortKey = "default" | "pct:asc" | "pct:desc" | "changePct:desc" | "m1:desc" | "y1:desc" | "y1:asc" | "pe:asc" | "name:asc";
const SORTS: { v: SortKey; label: string }[] = [{ v: "default", label: "Main indices first" }, { v: "pct:asc", label: "Lowest P/E against its own history" }, { v: "pct:desc", label: "Highest P/E against its own history" },
  { v: "changePct:desc", label: "Biggest rise today" }, { v: "m1:desc", label: "Best 1 month" }, { v: "y1:desc", label: "Best 1 year" }, { v: "y1:asc", label: "Worst 1 year" }, { v: "pe:asc", label: "Lowest P/E" }, { v: "name:asc", label: "A to Z" }];

export function IndexPrices({ open, big }: { open: (code: string) => void; big: boolean }) {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useIndices();
  const board = useIndexBoard();
  const by = useMemo(() => new Map((board.data?.items || []).map((r) => [r.code, r])), [board.data]);
  const [cols, setCols] = useState<Cols>("val"), [kind, setKind] = useState<(typeof KINDS)[number]>("All"), [ex, setEx] = useState<"All" | "NSE" | "BSE">("All");
  const [band, setBand] = useState<"all" | "low" | "usual" | "high">("all"), [sort, setSort] = useState<SortKey>("default"), [q, setQ] = useState(""), [page, setPage] = useState(0);
  const items = data?.items || [];
  const cnt = { low: 0, usual: 0, high: 0 };
  for (const r of items) { const b = by.get(r.code)?.pe?.band; if (b) cnt[b]++; }
  const val = (r: IndexRow, k: string): number | string | null => {
    const b = by.get(r.code);
    return k === "name" ? nice(r.name) : k === "pct" ? b?.pe?.pctile ?? null : k === "m1" || k === "y1" ? (b?.ret[k] ?? null) : (r[k as keyof IndexRow] as number | null);
  };
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = items.filter((r) => (kind === "All" || r.group === kind) && (ex === "All" || r.exchange === ex) && (band === "all" || by.get(r.code)?.pe?.band === band)
      && (!t || r.name.toLowerCase().includes(t) || r.code.toLowerCase().includes(t)));
    if (sort === "default") return out;
    const [k, d] = sort.split(":"), m = d === "asc" ? 1 : -1;
    return [...out].sort((a, b) => { const x = val(a, k), y = val(b, k); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * m; });
  }, [items, kind, ex, band, q, sort, by]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPage(0), [kind, ex, band, q, sort, cols, big]);
  if (isError) return <Problem e={error} retry={() => refetch()} />;
  if (isLoading || !data) return <Loading />;
  const size = big ? PAGE_BIG : PAGE, shown = rows.slice(page * size, page * size + size);
  const key = data.key.map((c) => items.find((r) => r.code === c)).filter(Boolean) as IndexRow[];
  const withHist = cnt.low + cnt.usual + cnt.high;
  const name = (r: IndexRow) => <td data-l="Index"><b>{nice(r.name)}</b><small className="faint mk-u">{r.exchange} · {r.group}</small></td>;
  const lead = (r: IndexRow) => <>{name(r)}<td className="n" data-l="Close">{r.close == null ? MINUS : nf(r.close)}</td><td className="n" data-l="Today"><Chg v={r.changePct} /></td></>;
  const last = (r: IndexRow) => <td className="mk-nw" data-l="Detail">{r.code !== "INDVIX" ? <button className="alx-link" type="button" onClick={() => open(r.code)}>Open</button> : null}</td>;
  const sortTh = (label: string, k: string, cls = "") => <th scope="col" className={cls}><button className="pm-sort" type="button" onClick={() => setSort((s) => (s === `${k}:asc` ? `${k}:desc` : `${k}:asc`) as SortKey)}>{label}{sort === `${k}:asc` ? " ▲" : sort === `${k}:desc` ? " ▼" : ""}</button></th>;
  const csv = () => downloadCsv("finlit-indices", ["Index", "Code", "Exchange", "Kind", "Close", "Today %", "P/E", "5-year median P/E", "Higher than on % of days", "Position", "1 week %", "1 month %", "3 months %", "1 year %", "1-year low", "1-year high", "P/B", "Div. yield %"],
    rows.map((r) => { const b = by.get(r.code); return [nice(r.name), r.code, r.exchange, r.group, r.close, r.changePct, r.pe, b?.pe?.median, b?.pe?.pctile, b?.pe ? BAND[b.pe.band] : "", b?.ret.w1, b?.ret.m1, b?.ret.m3, b?.ret.y1, b?.lo1y, b?.hi1y, r.pb, r.divYield]; }));
  return (
    <section aria-label="Indices">
      <p className="pm-meta"><span className={"pm-live" + (data.marketOpen ? " on" : "")} />{data.marketOpen ? (data.live ? "Market open · live levels, refreshed every minute" : "Market open · showing the last close") : "Market closed · last prices"}{data.asOf ? ` · as of ${dateIN(data.asOf)}` : ""} · updated {new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} <ChartHelp id="idx-tiles" /></p>
      <div className="pm-heat" aria-label="Key indices">{key.map((r) => {
        const c = r.changePct;
        return <button key={r.code} type="button" className="pm-tile" onClick={() => r.code !== "INDVIX" && open(r.code)} title={r.code === "INDVIX" ? nice(r.name) : `Open ${nice(r.name)} in detail`}
          style={{ "--tc": c == null ? "var(--faint)" : (r.code === "INDVIX" ? -c : c) >= 0 ? "var(--gain)" : "var(--loss)", "--ti": c == null ? 0 : 6 + Math.min(Math.abs(c), 3) * 7 } as React.CSSProperties}>
          <small>{nice(r.name)}</small><b>{r.close == null ? MINUS : nf(r.close)}</b><span>{c == null ? MINUS : (c > 0 ? "▲ +" : c < 0 ? "▼ " + MINUS : "") + nf(Math.abs(c)) + "%"}{r.points != null ? ` (${r.points > 0 ? "+" : ""}${nf(r.points)})` : ""}</span>
          {r.pe != null && <em>P/E {nf(r.pe, 1)}</em>}</button>;
      })}</div>
      <div className="mk-vsum">
        <div><b>P/E against each index’s own 5 years</b><small className="faint mk-u">{board.data?.ready === false || board.isLoading ? "Being prepared: every index’s history is read once and saved; this fills in within a few minutes." : `${withHist} of ${items.length} indices have a P/E history. Low means lower than on three days in four; it describes the past, not what comes next.`}</small></div>
        <MkSeg k="P/E position" label="P/E position" value={band} onChange={setBand} options={[{ v: "all", label: `All ${items.length}` }, { v: "low", label: `Low ${cnt.low}` }, { v: "usual", label: `Usual ${cnt.usual}` }, { v: "high", label: `High ${cnt.high}` }]} />
      </div>
      <div className="pm-bar mk-bar">
        <MkDd k="Columns" value={cols} onChange={setCols} options={[{ v: "val", label: "Valuation" }, { v: "ret", label: "Returns" }, { v: "day", label: "Today" }]} />
        <MkDd k="Kind" value={kind} onChange={setKind} options={KINDS.map((k) => ({ v: k, label: k === "All" ? "All kinds" : k }))} />
        <MkDd k="Exchange" value={ex} onChange={setEx} options={[{ v: "All", label: "NSE and BSE" }, { v: "NSE", label: "NSE" }, { v: "BSE", label: "BSE" }]} />
        <MkDd k="Sort" value={sort} onChange={setSort} options={SORTS} />
        <label className="mk-find">Find<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Bank, IT, Midcap" /></label>
        <div className="mk-tools"><button className="alx-link" type="button" onClick={csv}><Icon name="table" /> Export CSV</button></div>
      </div>
      <div className="mk-tw"><table className="pm-t mk-stack mk-ixt">
        <thead><tr>{sortTh("Index", "name")}{sortTh("Close", "close", "n")}{sortTh("Today", "changePct", "n")}
          {cols === "val" && <>{sortTh("P/E", "pe", "n")}<th scope="col" className="n">5-year median</th>{sortTh("P/E against its own 5 years", "pct")}{sortTh("P/B", "pb", "n mk-hs")}{sortTh("Div. yield %", "divYield", "n mk-hs")}</>}
          {cols === "ret" && <>{sortTh("1 week", "w1", "n")}{sortTh("1 month", "m1", "n")}<th scope="col" className="n mk-hs">3 months</th>{sortTh("1 year", "y1", "n")}<th scope="col">Between its 1-year low and high</th></>}
          {cols === "day" && <><th scope="col" className="n">Points</th><th scope="col" className="n">Day range</th></>}
          <th scope="col"><span className="sr-only">Detail</span></th></tr></thead>
        <tbody>{shown.map((r) => { const b = by.get(r.code); return (
          <tr key={r.code}>{lead(r)}
            {cols === "val" && <><td className="n" data-l="P/E">{r.pe == null ? MINUS : nf(r.pe, 1)}</td><td className="n" data-l="5-year median">{b?.pe ? nf(b.pe.median, 1) : MINUS}</td>
              <td data-l="P/E against its own 5 years" className="mk-posc">{b?.pe ? <span className="mk-pos"><Meter p={b.pe.pctile} cls={b.pe.band} /><span><b className={"mk-b-" + b.pe.band}>{BAND[b.pe.band]}</b><small className="faint mk-u">higher than on {Math.round(b.pe.pctile)}% of days</small></span></span> : <span className="faint">{board.data?.ready === false ? "Being prepared" : "No history on file"}</span>}</td>
              <td className="n mk-hs" data-l="P/B">{r.pb == null ? MINUS : nf(r.pb)}</td><td className="n mk-hs" data-l="Div. yield %">{r.divYield == null ? MINUS : nf(r.divYield)}</td></>}
            {cols === "ret" && <><td className="n" data-l="1 week"><Ret v={b?.ret.w1} /></td><td className="n" data-l="1 month"><Ret v={b?.ret.m1} /></td><td className="n mk-hs" data-l="3 months"><Ret v={b?.ret.m3} /></td><td className="n" data-l="1 year"><Ret v={b?.ret.y1} /></td>
              <td data-l="Between its 1-year low and high">{b?.pos1y != null && b.lo1y != null && b.hi1y != null ? <span className="mk-pos"><Meter p={b.pos1y * 100} cls="plain" label={`${Math.round(b.pos1y * 100)}% of the way from its 1-year low to its high`} /><small className="faint">{nf(b.lo1y, 0)} – {nf(b.hi1y, 0)}</small></span> : <span className="faint">{MINUS}</span>}</td></>}
            {cols === "day" && <><td className="n" data-l="Points">{r.points == null ? MINUS : nf(r.points)}</td><td className="n" data-l="Day range">{r.low != null && r.high != null ? `${nf(r.low)} – ${nf(r.high)}` : MINUS}</td></>}
            {last(r)}</tr>); })}
          {!shown.length && <tr><td colSpan={9} className="mk-none">No index matches. Clear the filter or the search.</td></tr>}</tbody>
      </table></div>
      <Pager total={rows.length} page={page} setPage={setPage} size={size} word="indices" />
    </section>
  );
}

/* ---------------------------------------------------------------- Index in detail */

const MEASURES = { pe: { label: "P/E", d: 1, say: "Price for each rupee of the index’s yearly profit." }, pb: { label: "P/B", d: 2, say: "Price for each rupee of the index’s book value." },
  dy: { label: "Dividend yield", d: 2, say: "Yearly dividends as a share of the price, in %." } } as const;
type Measure = keyof typeof MEASURES;
const bandOf = (p: number) => (p < 25 ? "low" : p > 75 ? "high" : "usual");   // the pack: low is lower than on three days in four (under 25%)
/** The member lists are filed under NSE's own names (NIFTY50, NIFTYFINSERVICE); an index is matched by its name, with the few that differ named here. */
const MEMBER_ALIAS: Record<string, string> = { NIFFINSER: "NIFTYFINSERVICE", NIFHEAIND: "NIFTYHEALTHCARE", NIFINF: "NIFTYINFRA", NIFINDMAN: "NIFTYMANUFACTURING", NIFLAR250: "NIFTYLARGEMID250", NIFMIDSEL2: "NIFTYMIDCAPSELECT" };
export const memberKey = (r: Pick<IndexRow, "code" | "name">) => MEMBER_ALIAS[r.code]
  ?? r.name.toUpperCase().replace(/\bINDEX\b/g, "").replace(/MIDSMALLCAP/g, "MIDSMALL").replace(/PRIVATE/g, "PVT").replace(/[^A-Z0-9]/g, "");
const crore = (v: number) => (v >= 1e5 ? `₹${nf(v / 1e5, 2)} L Cr` : `₹${Math.round(v).toLocaleString("en-IN")} Cr`);

export function IndexDetail({ code, setCode }: { code: string; setCode: (c: string) => void }) {
  const feed = useIndices();
  const [cmp, setCmp] = useState(""), [years, setYears] = useState<"1" | "3" | "5">("5"), [m, setM] = useState<Measure>("pe");
  const y = +years;
  const main = useIndexHistory(code, y), other = useIndexHistory(cmp, y, !!cmp && cmp !== code);
  const items = feed.data?.items || [];
  const idx = items.find((r) => r.code === code), cIdx = cmp ? items.find((r) => r.code === cmp) : undefined;
  const options: MkOption<string>[] = [];
  for (const g of ["Broad market", "Sector", "Strategy & theme"] as const) {
    const rs = items.filter((r) => r.group === g && (r.pe != null || r.pb != null));
    if (rs.length) { options.push({ head: g }); rs.forEach((r) => options.push({ v: r.code, label: nice(r.name), small: r.pe != null ? `P/E ${nf(r.pe, 1)}` : "" })); }
  }
  const name = nice(idx?.name ?? main.data?.name ?? code), cname = cIdx ? nice(cIdx.name) : "";
  const st: Stat | null = main.data?.stats[m] ?? null, ct: Stat | null = cmp && other.data ? other.data.stats[m] ?? null : null;
  const rows = main.data?.rows || [], f = (v: number) => nf(v, MEASURES[m].d) + (m === "dy" ? "%" : "");
  const cmap = useMemo(() => new Map((other.data?.rows || []).map((r) => [r.d, r[m]])), [other.data, m]);
  const second = cmp && other.data ? rows.map((r) => cmap.get(r.d) ?? null) : null;
  const ratio = useMemo(() => {
    if (!second || !st || !ct) return null;
    const rs = rows.map((r, i) => (r[m] != null && second[i] ? (r[m] as number) / (second[i] as number) : null)).filter((v): v is number => v != null).sort((a, b) => a - b);
    return rs.length ? { now: st.now / ct.now, median: rs[Math.floor(rs.length / 2)] } : null;
  }, [second, st, ct, rows, m]);
  return (
    <section aria-label="Index in detail">
      <div className="pm-bar mk-bar">
        <MkDd k="Index" value={code} onChange={(v) => { setCode(v); if (v === cmp) setCmp(""); }} options={options.length ? options : [{ v: code, label: name }]} search="Find an index" />
        <MkDd k="Compare with" value={cmp} onChange={setCmp} options={[{ v: "", label: "No comparison" }, ...options.filter((o) => "head" in o || o.v !== code)]} search="Find an index" />
        <MkSeg k="Period" label="Period" value={years} onChange={setYears} options={[{ v: "1", label: "1 year" }, { v: "3", label: "3 years" }, { v: "5", label: "5 years" }]} />
        <MkSeg k="Measure" label="Measure" value={m} onChange={setM} options={[{ v: "pe", label: "P/E" }, { v: "pb", label: "P/B" }, { v: "dy", label: "Dividend yield" }]} />
      </div>
      {main.isError ? <Problem e={main.error} retry={() => main.refetch()} /> : main.isLoading || !main.data ? <Loading /> : !st ? <div className="pm-empty">No {MEASURES[m].label} history is on file for {name}. Try P/B or another index.</div> : (() => {
        const b = bandOf(st.pctile);
        return <>
          <div className="pm-verdict"><span className={"chip " + (m === "dy" ? "" : b === "low" ? "up" : b === "high" ? "down" : "")}>{MEASURES[m].label} is {b === "usual" ? "in its usual range" : b} against its own {y} year{y > 1 ? "s" : ""}</span>
            <span><b>{name} {MEASURES[m].label} {f(st.now)}</b> <span className="faint">against a {y}-year median of {f(st.median)} · higher than on {Math.round(st.pctile)}% of days</span></span></div>
          <div className="pm-cards mk-four" aria-label="Range over the period">
            <div className="pm-kpi"><small>Now</small><b>{f(st.now)}</b><i>{main.data.to ? dateIN(main.data.to) : ""}</i></div>
            <div className="pm-kpi"><small>{y}-year median</small><b>{f(st.median)}</b><i>Average {f(st.mean)}</i></div>
            <div className="pm-kpi"><small>Usual range</small><b>{f(Math.max(0, st.mean - st.sd))} – {f(st.mean + st.sd)}</b><i>Two days in three fall here</i></div>
            <div className="pm-kpi"><small>Low · High</small><b>{f(st.min)} · {f(st.max)}</b><i>{nf(st.n, 0)} trading days</i></div>
          </div>
          <ChartZoom label={`${name} ${MEASURES[m].label}${cname ? ` and ${cname}` : ""}`} className="cz-top"><div className="pm-chart card"><div className="pm-chart-h"><div><small>{MEASURES[m].say}</small><b>{name} {MEASURES[m].label}{cname ? ` and ${cname}` : ""}, last {y} year{y > 1 ? "s" : ""} <ChartHelp id="idx-valuation" /></b></div><span className="faint">Dashed: median</span></div>
            <LineChart periods={rows.map((r) => dateIN(r.d, { day: "numeric", month: "short", year: "2-digit" }))} fmt={(x) => nf(x, MEASURES[m].d)} height={280} avg={st.median} avgLabel="Median"
              series={[{ key: m, label: name, color: "var(--gold)", values: rows.map((r) => r[m]) }, ...(second ? [{ key: "cmp", label: cname, color: "var(--info, #4f8fd8)", values: second }] : [])]} /></div></ChartZoom>
          {ct && ratio && <div className="mk-cmp">
            <div className="pm-kpi"><small>{cname} {MEASURES[m].label}</small><b>{f(ct.now)}</b><i>median {f(ct.median)} · higher than on {Math.round(ct.pctile)}% of days</i></div>
            <div className="pm-kpi"><small>{name} ÷ {cname}</small><b>{nf(ratio.now, 2)} times</b><i>{y}-year median {nf(ratio.median, 2)} times · {ratio.now > ratio.median * 1.03 ? "higher than usual" : ratio.now < ratio.median * 0.97 ? "lower than usual" : "about usual"}</i></div>
          </div>}
          {cmp && other.isError && <p className="pm-meta">No {MEASURES[m].label} history is on file for {cname}.</p>}
          <div className="pm-tools"><button className="alx-link" type="button" onClick={() => downloadCsv(`finlit-${code}-valuation-${y}y`, ["Date", "P/E", "P/B", "Dividend yield %"], rows.map((r) => [r.d, r.pe, r.pb, r.dy]))}><Icon name="table" /> Export CSV ({nf(rows.length, 0)} days)</button></div>
        </>;
      })()}
      <Moved code={code} now={idx?.close ?? null} />
      <Inside idx={idx} />
    </section>
  );
}

function Moved({ code, now }: { code: string; now: number | null }) {
  const board = useIndexBoard(), lv = useLevels(code, 1);
  const b = board.data?.items.find((r) => r.code === code);
  const pts = lv.data?.rows || [];
  if (!b && !pts.length) return null;
  return (
    <div className="mk-block"><h3 className="mk-h">How it has moved</h3>
      <div className="mk-ret">
        {(["w1", "m1", "m3", "y1"] as const).map((k) => <div key={k} className="pm-kpi"><small>{{ w1: "1 week", m1: "1 month", m3: "3 months", y1: "1 year" }[k]}</small><b><Ret v={b?.ret[k]} /></b></div>)}
        <div className="pm-kpi mk-rng"><small>Between its 1-year low and high</small>{b?.pos1y != null ? <Meter p={b.pos1y * 100} cls="plain wide" label={`${Math.round(b.pos1y * 100)}% of the way from its 1-year low to its high`} /> : <span className="faint">{MINUS}</span>}
          <i>{b?.lo1y != null ? `${nf(b.lo1y, 0)} low · ${now != null ? nf(now, 0) + " now · " : ""}${nf(b.hi1y ?? 0, 0)} high` : ""}</i></div>
      </div>
      {pts.length > 1 && <ChartZoom label="Closing level, 1 year" className="cz-top"><div className="pm-chart card"><div className="pm-chart-h"><div><small>Closing level</small><b>Last 1 year</b></div><span className="faint">Points</span></div>
        <LineChart periods={pts.map((p) => dateIN(p.d, { day: "numeric", month: "short", year: "2-digit" }))} series={[{ key: "c", label: "Close", color: "var(--gain)", values: pts.map((p) => p.c) }]} fmt={(x) => nf(x, 0)} height={200} /></div></ChartZoom>}
    </div>
  );
}

function Inside({ idx }: { idx?: IndexRow }) {
  const mem = useMembers(), uni = useUniverse();
  if (!idx || mem.isLoading || uni.isLoading) return null;
  const list = mem.data?.indices[memberKey(idx)];
  if (!list) return <div className="mk-block"><h3 className="mk-h">What is inside</h3><p className="mk-none">Constituents are on file for {Object.keys(mem.data?.indices || {}).length} indices; {nice(idx.name)} is not among them yet.</p></div>;
  const by = new Map((uni.data?.rows || []).map((r) => [r.symbol, r]));
  const cs = list.map((s) => by.get(s)).filter((r): r is NonNullable<typeof r> => !!r);
  const up = cs.filter((c) => (c.change_pct ?? 0) > 0).length, dn = cs.filter((c) => (c.change_pct ?? 0) < 0).length;
  const top = [...cs].filter((c) => c.market_cap != null).sort((a, b) => (b.market_cap as number) - (a.market_cap as number)).slice(0, 8);
  const mv = cs.filter((c) => c.change_pct != null).sort((a, b) => (b.change_pct as number) - (a.change_pct as number));
  const rises = mv.filter((c) => (c.change_pct as number) > 0).slice(0, 6), falls = mv.filter((c) => (c.change_pct as number) < 0).reverse().slice(0, 6);   // each list only its own direction
  const li = (c: (typeof cs)[number], right: React.ReactNode) => <li key={c.symbol}><Link to={`/stocks/${encodeURIComponent(c.symbol)}`}><b>{titleOf(c)}</b><small className="faint">{subOf(c)}</small></Link>{right}</li>;
  return (
    <div className="mk-block"><h3 className="mk-h">What is inside</h3>
      <p className="pm-meta">{list.length} companies · on the last trading day <b style={{ color: "var(--gain)" }}>{up} rose</b> and <b style={{ color: "var(--loss)" }}>{dn} fell</b></p>
      <div className="mk-in">
        <div><h4>Largest by market value</h4><ul className="mk-list">{top.map((c) => li(c, <><span className="n">{crore(c.market_cap as number)}</span><Chg v={c.change_pct} /></>))}</ul><p className="faint mk-fine">By each company’s total market value, not its weight in the index.</p></div>
        <div><h4>Biggest rises</h4>{rises.length ? <ul className="mk-list">{rises.map((c) => li(c, <Chg v={c.change_pct} />))}</ul> : <p className="faint">None rose.</p>}</div>
        <div><h4>Biggest falls</h4>{falls.length ? <ul className="mk-list">{falls.map((c) => li(c, <Chg v={c.change_pct} />))}</ul> : <p className="faint">None fell.</p>}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Commodity indices */

/** The fifteen often-watched wholesale series (code, name, who it matters to: general, no company named). */
export const WATCHED: [string, string, string][] = [   // the pack's list (cmKey), word for word
  ["1000000000", "All commodities", "The whole wholesale basket"],
  ["1104000001", "Crude petroleum", "Oil producers gain; refiners, paints, airlines and tyres pay more"],
  ["1202000005", "Diesel (HSD)", "Transport, cement and mining, as a fuel cost"],
  ["1202000002", "Petrol", "Oil marketing companies; running cost of vehicles"],
  ["1201000000", "Coal", "Power, cement, steel and aluminium, as an input"],
  ["1314040000", "Steel, long products", "Steel makers gain; construction and capital goods pay more"],
  ["1314090012", "Aluminium ingot", "Aluminium makers gain; autos, cables and packaging pay more"],
  ["1314090006", "Copper bars, rods and strips", "Cables and wires, electricals, consumer durables"],
  ["1304010001", "Cotton yarn", "Spinners gain; garment makers pay more"],
  ["1301090001", "Sugar", "Sugar mills; food and drink makers"],
  ["1301040008", "Palm oil", "Soaps, snacks and edible oils"],
  ["1104000002", "Natural gas", "City gas, fertilisers and power"],
  ["1310020001", "Urea", "Fertiliser makers; farm input cost"],
  ["1101010102", "Wheat", "Flour, biscuits and other food makers"],
  ["1313050003", "Ordinary Portland cement", "Cement makers gain; builders and infrastructure pay more"],
];
type CmItem = { code: string; name: string; weight: number | null };
type CmHist = { history: { period: string; label: string; value: number | null }[]; changes: { period: string; value: number | null }[]; changesUnavailable?: boolean };
const chg = (h: CmHist | undefined, p: string) => h?.changes.find((c) => c.period === p)?.value ?? null;

function WatchedRow({ c, show, on }: { c: [string, string, string]; show: (code: string) => void; on: boolean }) {
  const h = usePremium<CmHist>(`/commodities/${c[0]}`);
  const latest = h.data?.history[0];
  return <tr className={on ? "mk-on" : undefined}>
    <td data-l="Series"><b>{c[1]}</b></td><td className="n" data-l="Latest">{latest?.value != null ? <>{nf(latest.value, 1)}<small className="faint mk-u">{latest.label}</small></> : h.isLoading ? "…" : MINUS}</td>
    <td className="n" data-l="1 month"><Ret v={chg(h.data, "1 month")} /></td><td className="n" data-l="1 year"><Ret v={chg(h.data, "1 year")} /></td><td className="n mk-hs" data-l="5 years"><Ret v={chg(h.data, "5 years")} /></td>
    <td className="wrapc" data-l="Who it matters to"><span className="faint">{c[2]}</span></td>
    <td data-l="Chart"><button className="alx-link" type="button" aria-pressed={on} onClick={() => show(c[0])}>{on ? "Shown" : "Show"}</button></td></tr>;
}

export function CommodityIndices() {
  const list = usePremium<{ items: CmItem[]; fetchedAt: string }>("/commodities?category=monthly_index");
  const [code, setCode] = useState(WATCHED[0][0]);
  const hist = usePremium<CmHist>(`/commodities/${code}`, !!code);
  const items = list.data?.items || [];
  const nameOf = (c: string) => WATCHED.find((w) => w[0] === c)?.[1] ?? items.find((i) => i.code === c)?.name ?? c;
  const rows = hist.data?.history || [];
  const latestOnFile = rows[0]?.label;
  const opts: MkOption<string>[] = [{ head: "Often watched" }, ...WATCHED.map((w) => ({ v: w[0], label: w[1] })), { head: "Every series" },
    ...items.filter((i) => !WATCHED.some((w) => w[0] === i.code)).map((i) => ({ v: i.code, label: i.name }))];
  return (
    <section aria-label="Commodity indices">
      <p className="pm-meta">Monthly wholesale price indices: index levels, not rupee prices.{latestOnFile ? <> <b>Latest month on file: {latestOnFile}.</b></> : null}</p>
      <h3 className="mk-h">Often watched</h3>
      <div className="mk-tw"><table className="pm-t mk-stack mk-cmt">
        <thead><tr><th scope="col">Series</th><th scope="col" className="n">Latest</th><th scope="col" className="n">1 month</th><th scope="col" className="n">1 year</th><th scope="col" className="n mk-hs">5 years</th><th scope="col">Who it matters to</th><th scope="col"><span className="sr-only">Chart</span></th></tr></thead>
        <tbody>{WATCHED.map((c) => <WatchedRow key={c[0]} c={c} on={code === c[0]} show={(v) => setCode(v)} />)}</tbody>
      </table></div>
      <div className="pm-bar mk-bar" style={{ marginTop: 16 }}>
        <MkDd k="Series" value={code} onChange={setCode} options={opts} search="Find a series, e.g. steel" />
        {list.isError && <span className="faint">The full list of series is not available right now.</span>}
      </div>
      {hist.isError ? <Problem e={hist.error} retry={() => hist.refetch()} /> : hist.isLoading ? <Loading /> : rows.length > 1 ? (
        <>
          <div className="pm-cards mk-four">
            <div className="pm-kpi"><small>Latest ({rows[0]?.label || MINUS})</small><b>{rows[0]?.value != null ? nf(rows[0].value, 1) : MINUS}</b></div>
            <div className="pm-kpi"><small>1 month</small><b><Ret v={chg(hist.data, "1 month")} /></b></div>
            <div className="pm-kpi"><small>1 year</small><b><Ret v={chg(hist.data, "1 year")} /></b></div>
            <div className="pm-kpi"><small>5 years</small><b><Ret v={chg(hist.data, "5 years")} /></b></div>
          </div>
          <ChartZoom label={`${nameOf(code)}, monthly index`} className="cz-top"><div className="pm-chart card"><div className="pm-chart-h"><div><small>Monthly index level</small><b>{nameOf(code)} <ChartHelp id="commodity-trend" /></b></div></div>
            <LineChart periods={[...rows].reverse().map((r) => r.label)} series={[{ key: "v", label: "Index", color: "var(--gold)", values: [...rows].reverse().map((r) => r.value) }]} fmt={(x) => nf(x, 1)} height={230} area /></div></ChartZoom>
          <div className="pm-tools"><button className="alx-link" type="button" onClick={() => downloadCsv(`finlit-commodity-${code}`, ["Month", "Index level"], rows.map((r) => [r.label, r.value]))}><Icon name="table" /> Export CSV</button></div>
        </>) : <div className="pm-empty">No history is on file for {nameOf(code)}.</div>}
    </section>
  );
}
