// Task #338 (23 Nov 2026): Bank of Maharashtra showed ₹98.07 on one computer and ₹97.7 on another (Google: 97.87), all with the same previous close: each
// was a real quote from a different moment. The company page took its price from the report when it opened and never asked again (no refetch, and
// returning to the tab did nothing), while the watchlist and search list read another copy. Now every page reads the one latest quote per company the
// server keeps (backend finlit/livequote.py): the company page asks for it every 30 seconds while the market is open and when its tab comes back into
// view, lays it over the report's price when it is newer, and shows the trade time beside the price.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type Quote, type Summary } from "./api";

export type LiveQuote = Partial<Pick<Quote, "price" | "change" | "changePct" | "previousClose" | "open" | "high" | "low" | "volume" | "upperCircuit" | "lowerCircuit" | "asOf">>;

const IST_MIN = 330;
/** True on a weekday between 09:00 (pre-open) and 15:45 IST, when prices move (exchange holidays are not known here: a holiday only asks more often). */
export function marketOpen(now = new Date()): boolean {
  const t = new Date(now.getTime() + IST_MIN * 60_000), d = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  return d >= 1 && d <= 5 && m >= 9 * 60 && m <= 15 * 60 + 45;
}

const time = (s?: string | null) => { const v = s ? Date.parse(s) : NaN; return Number.isNaN(v) ? null : v; };

/** Same rule as the server (livequote.newer + dhan.plausible): newer by trade time, and a previous close within 25% of the price held. */
export function isNewer(live: LiveQuote | null | undefined, base: Partial<Quote> | null | undefined): boolean {
  if (!live?.price) return false;
  if (!base?.price) return true;
  const a = time(live.asOf), b = time(base.asOf);
  if (b != null && (a == null || a < b)) return false;
  const ref = base.previousClose || base.price, cur = live.previousClose || live.price;
  return !ref || !cur || Math.abs(cur / ref - 1) <= 0.25;
}

/** `base` with the latest quote laid over it (market cap moves with the price; the 52-week range widens; an older price band is dropped), or `base`. */
export function withLatest(base: Quote, live: LiveQuote | null | undefined): Quote {
  if (!live || !isNewer(live, base)) return base;
  const q: Quote = { ...base };
  for (const [k, v] of Object.entries(live)) if (v != null) (q as Record<string, unknown>)[k] = v;
  if (base.marketCapCr && base.price && live.price) q.marketCapCr = Math.round((base.marketCapCr * live.price / base.price) * 100) / 100;
  if (base.high52 && live.high && live.high > base.high52) q.high52 = live.high;
  if (base.low52 && live.low && live.low < base.low52) q.low52 = live.low;
  if (live.upperCircuit == null) delete q.upperCircuit;
  if (live.lowerCircuit == null) delete q.lowerCircuit;
  return q;
}

export const LIVE_EVERY_MS = 30_000;
export function useLiveQuote(symbol: string | undefined) {
  const sym = (symbol ?? "").toUpperCase();
  return useQuery<{ quotes: Record<string, LiveQuote> }, unknown, LiveQuote | null>({
    queryKey: ["live-quote", sym], queryFn: () => apiGet(`/api/search/live?symbols=${encodeURIComponent(sym)}`), enabled: !!sym,
    select: (d) => d.quotes?.[sym] ?? null, staleTime: 15_000, retry: 1,
    refetchInterval: () => (marketOpen() ? LIVE_EVERY_MS : false), refetchOnWindowFocus: true,
  });
}

/** The report with the latest quote laid over its price (and the profile's market cap, which the page shows from the quote's day). */
export function useWithLatest(s: Summary | undefined): Summary | undefined {
  const live = useLiveQuote(s?.profile.symbol).data;
  return useMemo(() => {
    if (!s || !live) return s;
    const quote = withLatest(s.quote, live);
    if (quote === s.quote) return s;
    return { ...s, quote, profile: quote.marketCapCr != null && s.profile.marketCapCr != null ? { ...s.profile, marketCapCr: quote.marketCapCr } : s.profile };
  }, [s, live]);
}

/** "10:47 IST" for a trade today, "21 Nov, 15:29 IST" for an earlier day; null without a time. */
export function tradeTime(asOf: string | null | undefined, now = new Date()): string | null {
  const v = time(asOf);
  if (v == null) return null;
  const at = new Date(v), opt = { timeZone: "Asia/Kolkata" } as const;
  const hm = at.toLocaleTimeString("en-IN", { ...opt, hour: "2-digit", minute: "2-digit", hour12: false });
  const day = (d: Date) => d.toLocaleDateString("en-CA", opt);
  return day(at) === day(now) ? `${hm} IST` : `${at.toLocaleDateString("en-IN", { ...opt, day: "numeric", month: "short" })}, ${hm} IST`;
}
