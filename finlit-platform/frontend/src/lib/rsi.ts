// Trading Lab > Order Flow > RSI heatmap: the answer of /api/lab/rsi (backend finlit/lab/rsi.py) and the helpers the tab uses.
// Describe, never advise: a band is a name for where a value sits (30 or less, 70 or more ...), never a call to act.
import { apiGet } from "./api";

export type Tf = "5m" | "15m" | "1h" | "1D";
export type BandKey = "oversold" | "weak" | "middle" | "strong" | "overbought";
export type PerTf<T> = Record<Tf, T>;

export type RsiStock = {
  sym: string; name: string; sector: string; price: number | null;
  rsi: PerTf<number | null>; prev: PerTf<number | null>; band: PerTf<BandKey | null>; bars: PerTf<number>;
  forming: PerTf<boolean>; barAt: PerTf<string | null>; reason: Partial<PerTf<string>>; lastBar: string | null;
};
export type RsiSector = { sector: string; stocks: number; avg: PerTf<number | null>; band: PerTf<BandKey | null>; counted: PerTf<number> };
export type BandCounts = Record<BandKey | "none", number>;
export type RsiReady = {
  ready: true; takenAt: string; asOf: string; stale: boolean; period: number; minBars: number; timeframes: Tf[];
  stocks: RsiStock[]; sectors: RsiSector[]; counts: PerTf<BandCounts>; note: string;
};
export type RsiWaiting = { ready: false; reason: string; asOf: null; stale: false; note: string };
export type RsiGrid = RsiReady | RsiWaiting;

export const getRsi = () => apiGet<RsiGrid>("/api/lab/rsi");

export const TFS: Tf[] = ["5m", "15m", "1h", "1D"];
export const TF_NAME: Record<Tf, string> = { "5m": "5 minutes", "15m": "15 minutes", "1h": "1 hour", "1D": "1 day" };
export const BANDS: BandKey[] = ["oversold", "weak", "middle", "strong", "overbought"];
export const BAND_NAME: Record<BandKey, string> = { oversold: "Oversold band", weak: "Weak", middle: "Middle", strong: "Strong", overbought: "Overbought band" };
export const BAND_RANGE: Record<BandKey, string> = { oversold: "30 or less", weak: "above 30, below 40", middle: "40 to 60", strong: "above 60, below 70", overbought: "70 or more" };
export const NOTE = "RSI is a fixed formula on past closes; it is not a forecast.";

/** The band of a value, the same edges as the server: 30 or less, below 40, 40 to 60 (both included), below 70, 70 or more. */
export function bandOf(v: number | null | undefined): BandKey | null {
  if (v == null) return null;
  if (v <= 30) return "oversold";
  if (v < 40) return "weak";
  if (v <= 60) return "middle";
  if (v < 70) return "strong";
  return "overbought";
}

export const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));
/** The change from the bar before, one decimal: null when either value is missing. */
export const change = (v: number | null | undefined, p: number | null | undefined) => (v == null || p == null ? null : Math.round((v - p) * 10) / 10);
export const signed = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`);

export type Sort = "name" | "high" | "low";
export type Filters = { tf: Tf; band: BandKey | "none" | null; sector: string | null; q: string };

/** Stocks that pass the band (on the chosen timeframe), sector and search filters. */
export function filterStocks(list: RsiStock[], f: Filters): RsiStock[] {
  const q = f.q.trim().toLowerCase();
  return list.filter((s) =>
    (f.band == null || (s.band[f.tf] ?? "none") === f.band)
    && (f.sector == null || s.sector === f.sector)
    && (!q || s.sym.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)));
}

/** By name (symbol), or by the value on the chosen timeframe, high to low or low to high; a stock with no value goes last. */
export function sortStocks(list: RsiStock[], sort: Sort, tf: Tf): RsiStock[] {
  const out = [...list];
  if (sort === "name") return out.sort((a, b) => a.sym.localeCompare(b.sym));
  const dir = sort === "high" ? -1 : 1;
  return out.sort((a, b) => {
    const x = a.rsi[tf], y = b.rsi[tf];
    if (x == null && y == null) return a.sym.localeCompare(b.sym);
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * dir || a.sym.localeCompare(b.sym);
  });
}

export type Group = { sector: string; avg: PerTf<number | null>; total: number; stocks: RsiStock[] };

/** The stocks by sector (sectors by name, "Other" last), each with the server's sector average over all its stocks. */
export function groupBySector(list: RsiStock[], sectors: RsiSector[]): Group[] {
  const by = new Map<string, RsiStock[]>();
  for (const s of list) by.set(s.sector, [...(by.get(s.sector) ?? []), s]);
  const info = new Map(sectors.map((s) => [s.sector, s]));
  const empty = { "5m": null, "15m": null, "1h": null, "1D": null };
  return [...by.entries()]
    .sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)))
    .map(([sector, stocks]) => ({ sector, stocks, avg: info.get(sector)?.avg ?? empty, total: info.get(sector)?.stocks ?? stocks.length }));
}

const IST = { timeZone: "Asia/Kolkata" } as const;
/** "26 Nov, 15:25 IST" for a bar time; a daily bar (a date only) reads "26 Nov". */
export function barTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.length === 10) return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...IST })}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, ...IST })} IST`;
}
