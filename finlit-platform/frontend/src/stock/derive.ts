import type { Financials, Ratios, Summary } from "../lib/api";
import { capSize } from "../lib/format";
import type { Classification } from "../lib/taxonomy";

export const PILLAR_COLOR: Record<string, string> = { quality: "--p-quality", growth: "--p-growth", profitability: "--p-profit", balance: "--p-balance", technical: "--p-tech" };
export const PILLAR_ICON: Record<string, string> = { quality: "quality", growth: "growth", profitability: "profit", balance: "balance", technical: "tech" };

export const metric = (s: Summary, key: string) => s.keyMetrics.find((m) => m.key === key);
export const ratio = (r: Ratios | undefined, key: string) => r?.latest[key];

/** Growth of the latest value over the one `lag` periods earlier (1 = the previous year for yearly data, 4 = the same quarter a year ago).
 *  Positions count, not values: a missing period is not skipped over. Not meaningful (null) when the earlier figure is zero or negative. */
export function yoy(series: (number | null)[], lag = 1): number | null {
  const a = series[series.length - 1], b = series[series.length - 1 - lag];
  if (a == null || b == null || b <= 0) return null;
  return (a / b - 1) * 100;
}

export function finTiles(f: Financials) {
  const pl = f.yearly.pl, cf = f.yearly.cf, fy = pl.periods[pl.periods.length - 1];
  const rev = pl.rows.revenue || [], np = pl.rows.net_profit || [], op = cf.rows.operating || [];
  const margin = rev.map((r, i) => (r && np[i] != null ? ((np[i] as number) / r) * 100 : null));
  const last = <T,>(a: T[]) => a[a.length - 1];
  return [
    { k: "Revenue", fy, value: last(rev), unit: "cr" as const, delta: yoy(rev), series: rev, color: "--p-growth", icon: "rupee", suffix: "%" },
    { k: "Net profit", fy, value: last(np), unit: "cr" as const, delta: yoy(np), series: np, color: "--p-quality", icon: "growth", suffix: "%" },
    { k: "Operating cash", fy: cf.periods[cf.periods.length - 1], value: last(op), unit: "cr" as const, delta: yoy(op), series: op, color: "--p-balance", icon: "wallet", suffix: "%" },
    { k: "Net margin", fy, value: last(margin), unit: "pct" as const, delta: margin.length > 1 && last(margin) != null && margin[margin.length - 2] != null ? (last(margin) as number) - (margin[margin.length - 2] as number) : null, series: margin, color: "--p-profit", icon: "percent", suffix: " pts" },
  ];
}

export function buckets(s: Summary, r: Ratios | undefined, tech: { rsi14: number | null } | undefined, cls?: Classification | null) {
  const out: [string, string, string, string][] = [];
  const cap = capSize(s.profile.marketCapCr); if (cap) out.push(["cap", "Size", cap, "--p-growth"]);
  const pe = metric(s, "pe")?.value, pb = metric(s, "pb")?.value;
  if (pe != null) out.push(["tag", "Style", pe < 15 || (pb != null && pb < 1.5) ? "Value" : pe > 35 ? "Premium growth" : "Blend", "--p-quality"]);
  const dy = metric(s, "dividend_yield")?.value; if (dy != null) out.push(["coins", "Income", dy >= 3 ? "High dividend" : dy >= 1 ? "Moderate dividend" : "Low dividend", "--t-gold"]);
  // NSE's levels, each under its own name (task #192): the provider's `sector` mixed sectors with basic industries, and its macro sector was sometimes an industry
  if (cls?.sector) out.push(["factory", "Sector", cls.sector, "--p-profit"]);
  if (cls?.macro_sector && cls.macro_sector !== cls.sector) out.push(["building", "Macro sector", cls.macro_sector, "--p-balance"]);
  const rsi = tech?.rsi14; if (rsi != null) out.push(["activity", "Momentum", rsi < 30 ? "Oversold" : rsi > 70 ? "Overbought" : "Neutral", "--p-tech"]);
  void r; return out;
}

export function ownershipSlices(latest: { key: string; value: number | null }[]) {
  const col: Record<string, string> = { promoters: "--c1", fii: "--c2", dii: "--c3", public: "--c4", government: "--c5", others: "--faint" };
  return latest.filter((l) => l.value != null).map((l) => ({ v: l.value as number, color: col[l.key] || "--faint" }));
}
export const OWN_COLOR: Record<string, string> = { promoters: "--c1", fii: "--c2", dii: "--c3", public: "--c4", government: "--c5", others: "--faint" };

export function saveFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


