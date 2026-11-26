// Task #408: where every figure of the Watchlists page comes from (the pack's 03-data.md), read once and put together per stock (lib/watchlistPack.ts
// WStock). Each source is its own query, so one that fails shows "Could not load. Try again." only where it is used (`err`), and the rest of the page stays.
//   quote, returns          GET /api/stocks/{s}             (the company report's header and returns; the same cache as the report)
//   peer label, place       GET /api/leadership/list        (label, rank, ranked, group) and GET /api/stocks/{s}/leadership (labelSince, rel, peers[0], display.pending)
//   label before a change   GET /api/stocks/{s}/leadership-history, only for a stock whose label changed in the latest weekly run
//   Prism                   POST /api/portfolio/overview    (as the Shares page; FinLit Prism for Gold)
//   size, P/E, P/B, yield, ROE   the screener's universe row (as the live page)
//   revenue, net profit     GET /api/stocks/{s}/financials  (quarterly.pl, latest quarter and the same quarter a year earlier)
//   results, filings        GET /api/stocks/{s}/events      (announcements)
//   chart                   GET /api/stocks/{s}/price-6M    (cut to 3 months)
//   theme                   GET /api/discovery/board
//   industry, sector        GET /api/taxonomy/companies, GET /api/sectors/membership
//   Sector Pulse, Rotation  GET /api/sectors, GET /api/rotation
//   screens                 GET /api/screener/membership    (Gold)
//   results within 7 days   GET /api/results/calendar
import { useQueries, useQuery } from "@tanstack/react-query";
import { ApiError, apiGet, retryDelayMs, shouldRetry, type Quote, type Return } from "./api";
import { useLeadershipList, type Leadership, type LeadRun } from "./leadership";
import { isReady, useOverview, type OverviewHolding } from "./portfolioOverview";
import { useUniverse } from "./screener";
import { useClassifications } from "./taxonomy";
import { useSectorBoard } from "./sectors";
import { useRotationMap } from "./rotation";
import { useBoard } from "../discovery/model";
import { pulseSay, pulseWord } from "./pulseWords";
import {
  CORNER_ORDER, CORNER_TONE, PULSE_ORDER, PULSE_TONE, dMon, highNote, pts, rankMove, type Filing, type LeadLabel, type Screen, type Sec, type WStock,
} from "./watchlistPack";
import type { Meta } from "./watchlist";

type Summary = { quote?: Quote; returns?: Return[]; profile?: { name?: string } };
type Fin = { quarterly?: { pl?: { periods?: string[]; periodEnds?: string[]; rows?: Record<string, (number | null)[]> } } };
type Events = { announcements?: { date: string; category?: string | null; description?: string | null; link?: string | null }[] };
type PriceSec = { series?: { t?: string[]; c?: (number | null)[] } };
export type Membership = { symbols: Record<string, Screen[]>; asOf: string | null; screens: number };
type Cal = { today: string; days: { date: string; n: number; names: string[] }[] };

const sec = <T,>(sym: string, path: string, enabled: boolean) => ({
  queryKey: ["stock", sym, path, "consolidated"], enabled,
  queryFn: () => apiGet<T>(`/api/stocks/${encodeURIComponent(sym)}${path}`), staleTime: 60_000, retry: shouldRetry, retryDelay: retryDelayMs,
});
const one = (rs: Return[] | undefined, p: string) => { const r = rs?.find((x) => x.period === p); return r && !r.withheld && r.price != null ? r.price : null; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The latest quarter against the same quarter a year earlier: { yoy %, latest value in ₹ Cr, the period ("Sep 2026") }. */
export function yoy(pl: NonNullable<NonNullable<Fin["quarterly"]>["pl"]> | undefined, key: string): { y: number | null; cr: number | null; period: string | null } {
  const per = pl?.periods ?? [], vals = pl?.rows?.[key] ?? [];
  const i = vals.length - 1;
  if (i < 0 || vals[i] == null) return { y: null, cr: null, period: per[i] ?? null };
  const p = per[i], [m, yr] = (p || "").split(" "), j = per.indexOf(`${m} ${Number(yr) - 1}`);
  const old = j >= 0 ? vals[j] : null;
  return { y: old != null && old > 0 ? ((vals[i]! / old) - 1) * 100 : null, cr: vals[i], period: p ?? null };
}
/** The latest results filing among the announcements (not an intimation, a recording or a transcript), with its quarter. */
export function lastResults(ev: Events | undefined, latestPeriod: string | null): { d: string; q: string | null } | null {
  const a = (ev?.announcements ?? []).filter((x) => /financial results/i.test(`${x.category ?? ""} ${x.description ?? ""}`) && !/intimation|recording|transcript|prior|schedule/i.test(`${x.category ?? ""} ${(x.description ?? "").slice(0, 120)}`))
    .sort((x, y) => y.date.localeCompare(x.date))[0];
  if (!a) return null;
  const m = (a.description ?? "").match(/(?:quarter|period|half[- ]year|year)\s+ended\s+(?:on\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+)?([A-Z][a-z]+)/);
  const mi = m ? FULL.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) : -1;
  const q = mi >= 0 ? `${MONTHS[mi]} quarter` : latestPeriod ? `${latestPeriod.split(" ")[0]} quarter` : null;
  return { d: a.date, q };
}
/** The full month and year of a period ("Sep 2026" -> "September 2026"), for the Business set's ⓘ. */
export const quarterName = (p: string | null) => { if (!p) return null; const [m, y] = p.split(" "); const i = MONTHS.indexOf(m); return i >= 0 ? `${FULL[i]} ${y}` : p; };

export type WatchData = ReturnType<typeof useWatchData>;
const EAGER = 25;
export function useWatchData({ symbols, meta, view, open, gold, signedIn }: { symbols: string[]; meta: Record<string, Meta>; view: string; open: Set<string>; gold: boolean; signedIn: boolean }) {
  const on = symbols.length > 0;
  const biz = view === "biz";
  const eager = symbols.length <= EAGER;   // a short list reads every stock's Details sources at once, so Details opens without a wait
  const summaries = useQueries({ queries: symbols.map((s) => sec<Summary>(s, "", true)) });
  const leads = useQueries({ queries: symbols.map((s) => ({ queryKey: ["leadership", s], queryFn: () => apiGet<Leadership>(`/api/stocks/${encodeURIComponent(s)}/leadership`), staleTime: 15 * 60_000, retry: 1 })) });
  const list = useLeadershipList(symbols, on);
  const changedNow = symbols.filter((_s, i) => { const l = leads[i].data; return l && l.available && l.labelSince && l.labelSince === l.asOf; });
  const hist = useQueries({ queries: changedNow.map((s) => ({ queryKey: ["leadership-history", s], queryFn: () => apiGet<{ available: boolean; rows: LeadRun[] }>(`/api/stocks/${encodeURIComponent(s)}/leadership-history`), staleTime: 15 * 60_000, retry: 1 })) });
  const fins = useQueries({ queries: symbols.map((s) => sec<Fin>(s, "/financials", biz || eager || open.has(s))) });
  const evs = useQueries({ queries: symbols.map((s) => sec<Events>(s, "/events", biz || eager || open.has(s))) });
  const charts = useQueries({ queries: symbols.map((s) => sec<PriceSec>(s, "/price-6M", eager || open.has(s))) });
  const ov = useOverview(symbols, on && signedIn);
  const uni = useUniverse(on);
  const cls = useClassifications(symbols).data;
  const key = [...symbols].sort().join(",");
  const mem = useQuery({ queryKey: ["sectors", "membership", key], enabled: on, staleTime: 10 * 60_000, retry: 1,
    queryFn: () => apiGet<{ date: string; groups: Record<string, { slug: string; name: string }> }>(`/api/sectors/membership?symbols=${encodeURIComponent(key)}`) });
  const board = useSectorBoard("industries", on);
  const rot = useRotationMap("industries", on);
  const disc = useBoard();
  const scr = useQuery({ queryKey: ["screener", "membership", key], enabled: on && gold, staleTime: 10 * 60_000, retry: 1,
    queryFn: () => apiGet<Membership>(`/api/screener/membership?symbols=${encodeURIComponent(key)}`) });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const plus7 = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
  const cal = useQuery({ queryKey: ["results", "calendar", "watch", today, key], enabled: on, staleTime: 30 * 60_000, retry: 1,
    queryFn: () => apiGet<Cal>(`/api/results/calendar?from=${today}&to=${plus7}&symbols=${encodeURIComponent(key)}`) });

  const ovBy = new Map<string, OverviewHolding>((ov.data?.holdings ?? []).map((h) => [h.symbol, h]));
  const uniBy = new Map((uni.data?.rows ?? []).map((r) => [r.symbol, r]));
  const secBy = new Map((board.data?.rows ?? []).map((r) => [r.slug, r]));
  const rotBy = new Map((rot.data?.rows ?? []).map((r) => [r.slug, r]));
  const themeBy = new Map((disc.data?.rows ?? []).map((r) => [r.s, r]));
  const prismOn = ov.data?.model === "prism";

  const stocks: WStock[] = symbols.map((s, i) => {
    const sm = summaries[i].data, q = sm?.quote, l = leads[i].data, lr = list.data?.available ? list.data.rows[s] : undefined, o = ovBy.get(s), u = uniBy.get(s), m = meta[s];
    const p = isReady(o) ? o.prism : undefined;
    const lon = l && l.available ? l : null;
    const h = changedNow.includes(s) ? hist[changedNow.indexOf(s)].data : undefined;
    const before = lon && h?.rows?.length ? [...h.rows].filter((r) => r.date < lon.labelSince!).sort((a, b) => b.date.localeCompare(a.date))[0]?.label ?? null : null;
    const pl = fins[i].data?.quarterly?.pl, rv = yoy(pl, "revenue"), np = yoy(pl, "net_profit");
    const res = lastResults(evs[i].data, rv.period);
    const slug = mem.data?.groups?.[s]?.slug ?? null, g = slug ? secBy.get(slug) : undefined, r = slug ? rotBy.get(slug) : undefined;
    const c = cls?.[s];
    const sect: Sec | null = slug || c ? {
      slug, sector: c?.sector ?? g?.sector ?? null,
      pulseCode: g?.state_code ?? null, pulse: g ? pulseWord(g.state_code, null) : null, pulseTone: g ? PULSE_TONE[g.state_code] ?? "" : "", pulseO: g ? PULSE_ORDER.indexOf(g.state_code) : null,
      pulseNote: g ? highNote(g.index_vs_52w_high) : null, breadth: g?.breadth?.above_50 ?? null, n: g?.stocks_counted ?? null,
      pulseTip: g ? `${pulseSay(g.state_code) ?? g.meaning}${g.breadth?.above_50 != null ? ` ${Math.round(g.breadth.above_50)}% of its ${g.stocks_counted} stocks are above their medium trend.` : ""}` : null,
      corner: r?.corner_name ?? null, cornerTone: r ? CORNER_TONE[r.corner] ?? "" : "", cornerO: r ? CORNER_ORDER.indexOf(r.corner) : null,
      cornerNote: r?.corner_since ? `Since ${dMon(r.corner_since)}` : null,
      cornerTip: r ? `${rot.data?.corner_meanings?.[r.corner] ?? r.corner_meaning ?? ""}${r.strength_pts != null && r.change_pts != null ? ` Against the average industry: ${pts(r.strength_pts)} over 6 months, ${pts(r.change_pts)} last month.` : ""}`.trim() : null,
      rank: r?.rank ?? null, of: r?.ranked ?? null, rk1: rankMove(r?.rank_change_1w, "this week"), rk4: rankMove(r?.rank_change_4w, "in 4 weeks"),
      hist: (r?.rank_history ?? []).slice(-26).map((x) => x.rank).filter((x): x is number => x != null), s6: r?.strength_pts ?? null, s1: r?.change_pts ?? null,
    } : null;
    const th = themeBy.get(s);
    const peers0 = lon?.peers?.[0];
    return {
      s, name: sm?.profile?.name || u?.name || s, logo: null,
      added: m?.added || null, addedPrice: m?.addedPrice ?? null, target: m?.target ?? null, note: m?.note ?? "", nearAlert: m?.nearAlert !== false,
      px: q?.price ?? null, chgp: q?.changePct ?? null, h52: q?.high52 ?? null, l52: q?.low52 ?? null, quoteAsOf: q?.asOf ?? null,
      m1: one(sm?.returns, "1M"), m3: one(sm?.returns, "3M"), y1: one(sm?.returns, "1Y"),
      prism: prismOn && p?.final != null ? p.final : null, prismWord: prismOn ? p?.label ?? null : null,
      gp: prismOn ? p?.parts?.fundamental ?? null : null, val: prismOn ? p?.parts?.valuation ?? null : null, qual: prismOn ? p?.parts?.quality ?? null : null, risk: prismOn ? p?.parts?.risk ?? null : null,
      stS: prismOn ? p?.shortTerm?.score ?? null : null, stW: prismOn ? p?.shortTerm?.word ?? null : null, ltS: prismOn ? p?.longTerm?.score ?? null : null, ltW: prismOn ? p?.longTerm?.word ?? null : null,
      peer: lr && lr.available ? lr.label : null, peerRank: lr && lr.available ? lr.rank : null, peerOf: lr && lr.available ? lr.ranked : null,
      peerGroup: lr && lr.available ? (lr.groupName || lr.group) : lon?.peerGroup.short ?? null,
      peerWhy: lr && !lr.available ? lr.text : null, noLabelYet: !!lr && !lr.available && lr.reason === "history",
      rawLabel: (lon?.rawLabel as LeadLabel | null | undefined) ?? (lr && lr.available ? lr.rawLabel ?? null : null), pending: lon?.display?.pending ?? null,
      labelSince: lon?.labelSince ?? null, leadAsOf: lon?.asOf ?? (list.data?.available ? list.data.asOf : null), labelBefore: (before as LeadLabel | null),
      vixName: lon?.benchmarks.sector.name ?? null, vix52: lon?.rel.w52 != null ? lon.rel.w52 * 100 : null, vix13: lon?.rel.w13 != null ? lon.rel.w13 * 100 : null,
      grp1: peers0 && peers0.rel52 != null && lon ? `${peers0.name ?? peers0.symbol}, ${pts(peers0.rel52 * 100)} vs ${lon.benchmarks.sector.name}` : null,
      mcap: u?.market_cap ?? null, pe: u?.pe ?? null, pb: u?.pb ?? null, dy: u?.dividend_yield ?? null, roe: u?.roe ?? null,
      revY: rv.y, revCr: rv.cr, npY: np.y, npCr: np.cr, resD: res?.d ?? null, resQ: res?.q ?? null,
      filings: (evs[i].data?.announcements ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((a): Filing => ({ d: a.date, t: firstLine(a.description || a.category || "Filing"), l: a.link ?? null })),
      theme: th?.th ?? null, themeStatus: th?.st ?? null,
      ind: c?.industry ?? mem.data?.groups?.[s]?.name ?? null, sec: sect,
      scr: scr.data?.symbols?.[s] ?? [],
    };
  });

  const resultsSoon: Record<string, string> = {};
  for (const d of cal.data?.days ?? []) if (d.date >= (cal.data?.today ?? today)) for (const n of d.names) if (symbols.includes(n) && !resultsSoon[n]) resultsSoon[n] = d.date;
  const quoteTimes = stocks.map((x) => x.quoteAsOf).filter((x): x is string => !!x).sort();
  return {
    stocks,
    loadingQuotes: summaries.some((q) => q.isLoading),
    err: {
      quote: (s: string) => summaries[symbols.indexOf(s)]?.isError ? () => summaries[symbols.indexOf(s)].refetch() : null,
      lead: (s: string) => leads[symbols.indexOf(s)]?.isError && list.isError ? () => { leads[symbols.indexOf(s)].refetch(); list.refetch(); } : null,
      fin: (s: string) => fins[symbols.indexOf(s)]?.isError ? () => fins[symbols.indexOf(s)].refetch() : null,
      ev: (s: string) => evs[symbols.indexOf(s)]?.isError ? () => evs[symbols.indexOf(s)].refetch() : null,
      chart: (s: string) => charts[symbols.indexOf(s)]?.isError ? () => charts[symbols.indexOf(s)].refetch() : null,
      prism: ov.isError ? () => ov.refetch() : null,
      uni: uni.isError ? () => uni.refetch() : null,
      sectors: board.isError || rot.isError ? () => { board.refetch(); rot.refetch(); } : null,
      screens: scr.isError ? () => scr.refetch() : null,
      theme: disc.isError ? () => disc.refetch() : null,
    },
    loading: {
      fin: (s: string) => !!fins[symbols.indexOf(s)]?.isLoading, ev: (s: string) => !!evs[symbols.indexOf(s)]?.isLoading, chart: (s: string) => !!charts[symbols.indexOf(s)]?.isLoading,
      prism: ov.isLoading, sectors: board.isLoading || rot.isLoading, screens: scr.isLoading,
    },
    chart: (s: string) => charts[symbols.indexOf(s)]?.data?.series ?? null,
    prismLocked: !!ov.data && ov.data.model !== "prism",
    sectorsLocked: !!board.data && !board.data.rows,
    pricesAt: quoteTimes.length ? quoteTimes[quoteTimes.length - 1] : null,
    sectorsDate: board.data?.date_label ?? rot.data?.date ?? null,
    rotDate: rot.data?.date ?? null,
    moved: rot.data?.moved_this_week ?? [],
    screens: scr.data ?? null,
    screensLocked: !gold || (scr.error instanceof ApiError && scr.error.status === 403),
    resultsSoon,
    today: cal.data?.today ?? today,
    latestPeriod: stocks.map((x) => yoy(fins[symbols.indexOf(x.s)]?.data?.quarterly?.pl, "revenue").period).find(Boolean) ?? null,
  };
}

const firstLine = (t: string) => { const x = t.replace(/\s+/g, " ").trim(); return x.length > 90 ? x.slice(0, 90).trimEnd() + "…" : x; };
