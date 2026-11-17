// Task #135 (dashboard pack 06): "Your investments today": the shares held, the mutual funds in the MF portfolio, the ETFs and the watchlist in one table
// under All / Watchlist / Shares / Mutual funds / ETFs. Held first, then the watchlist; within a type the largest first when every quantity is known,
// otherwise A to Z. Pure functions, so the order and the readings are tested. Descriptive only.

export type InvKind = "share" | "mf" | "etf" | "watch";
export const KIND_TAG: Record<InvKind, string> = { share: "Share", mf: "Mutual fund", etf: "ETF", watch: "Watchlist" };

export type InvRow = {
  key: string; kind: InvKind; name: string; sub: string; href: string; alertHref: string;
  symbol?: string; code?: number;
  price: number | null; priceWhy?: string;
  day: number | null; dayWhy?: string; dayOn?: string | null;
  y1: number | null; y1Why?: string;
  value: number | null;                                     // rupees held, for the order only
  health?: { score: number | null; label: string | null; locked: boolean; why?: string | null };
  premium?: number | null;                                   // ETFs: last close against NAV, percent
};

const byName = (a: InvRow, b: InvRow) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
/** Largest first when every row of the type has a value; otherwise A to Z (the pack's rule). */
export function orderType(rows: InvRow[]): InvRow[] {
  const known = rows.length > 0 && rows.every((r) => r.value != null && r.value > 0);
  return [...rows].sort(known ? (a, b) => (b.value as number) - (a.value as number) || byName(a, b) : byName);
}

/** All: held shares, mutual funds, ETFs, then the watchlist (a share both held and watched is listed once, as held). */
export function investRows(parts: { shares: InvRow[]; funds: InvRow[]; etfs: InvRow[]; watch: InvRow[] }): InvRow[] {
  const held = new Set(parts.shares.map((r) => r.symbol));
  return [...orderType(parts.shares), ...orderType(parts.funds), ...orderType(parts.etfs), ...orderType(parts.watch.filter((r) => !held.has(r.symbol)))];
}

/** "Health 60 · Average" for a fund; the reason (locked on Silver, not scored yet) when there is no figure. */
export function healthText(h: InvRow["health"]): { text: string; band: "g" | "o" | "r" | "n"; title?: string } {
  if (!h) return { text: "—", band: "n" };
  if (h.locked) return { text: "FundPulse: Gold", band: "n", title: "The FinLit FundPulse is part of the Gold plan" };
  if (h.score == null) return { text: "Not scored yet", band: "n", title: h.why ?? "This fund has no FundPulse yet" };
  const l = (h.label || "").toLowerCase();
  const band = /strong|healthy/.test(l) ? "g" : /average/.test(l) ? "o" : /weak|poor/.test(l) ? "r" : "n";
  return { text: `Health ${Math.round(h.score)}${h.label ? " · " + h.label : ""}`, band };
}

/** "0.12% below NAV" / "0.18% above NAV" / "At NAV" for an ETF. */
export function navText(p: number | null | undefined): string {
  if (p == null) return "—";
  if (Math.abs(p) < 0.005) return "At NAV";
  return `${Math.abs(p).toFixed(2)}% ${p < 0 ? "below" : "above"} NAV`;
}

/** The line under the heading: "4 on your watchlist · 14 shares · 3 mutual funds · prices and NAVs of 13 Nov". */
/** Task #195: the rows by the size of the last day's move, largest first (a rise or a fall); rows with no move yet go last, in their earlier order. */
export function byMove<T extends { day: number | null }>(rows: readonly T[]): T[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => (b.r.day == null ? -1 : Math.abs(b.r.day)) - (a.r.day == null ? -1 : Math.abs(a.r.day)) || a.i - b.i).map((x) => x.r);
}
/** The card's sub-line (task #195): "18 investments · biggest moves on Friday first · prices and NAVs of 13 Nov". */
export function investLine(n: number, noun: [string, string], day: string, when: string | null, navs: boolean): string {
  const parts = [`${n} ${n === 1 ? noun[0] : noun[1]}`, `biggest moves ${day === "Today" ? "today" : `on ${day}`} first`];
  if (when) parts.push(navs ? `prices and NAVs of ${when}` : `prices of ${when}`);
  return parts.join(" · ");
}

// ------------------------------------------------------------------------------------------------ Your mutual funds at a glance (pack 06, panel 2)
export type FundForGlance = { code: number; name: string | null; weight: number | null; r1y: number | null; score: number | null; label: string | null; locked: boolean;
  parts: Record<string, number | null> | null };
export type MfGlance = {
  count: number; locked: boolean; avg: number | null; avgLabel: string | null;
  bands: { g: number; o: number; r: number; n: number };          // healthy (strong or healthy) · average · poor (weak or poor) · not scored
  r1y: number | null;                                              // value-weighted 1-year return of the funds with one (equal weights when values are missing)
  weakest: { name: string; score: number; label: string | null; parts: string[] } | null;
};
const PART_WORD: Record<string, string> = { performance: "performance", risk: "risk", cost: "cost", quality: "quality" };
export function mfGlance(funds: FundForGlance[], avg: { value: number | null; label: string | null; locked: boolean }): MfGlance {
  const bands = { g: 0, o: 0, r: 0, n: 0 };
  for (const f of funds) {
    const l = (f.label || "").toLowerCase();
    if (f.locked || f.score == null) bands.n += 1; else if (/strong|healthy/.test(l)) bands.g += 1; else if (/average/.test(l)) bands.o += 1; else if (/weak|poor/.test(l)) bands.r += 1; else bands.n += 1;
  }
  const withR = funds.filter((f) => f.r1y != null);
  const allW = withR.length > 0 && withR.every((f) => f.weight != null && f.weight > 0);
  const tw = withR.reduce((a, f) => a + (allW ? (f.weight as number) : 1), 0);
  const r1y = withR.length ? Math.round((withR.reduce((a, f) => a + (f.r1y as number) * (allW ? (f.weight as number) : 1), 0) / tw) * 10) / 10 : null;
  const scored = funds.filter((f) => !f.locked && f.score != null).sort((a, b) => (a.score as number) - (b.score as number));
  const low = scored[0];
  const weakest = low && scored.length > 1 ? { name: low.name ?? `Scheme ${low.code}`, score: Math.round(low.score as number), label: low.label,
    parts: Object.entries(low.parts ?? {}).filter((e): e is [string, number] => e[1] != null).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([k]) => PART_WORD[k] ?? k) } : null;
  return { count: funds.length, locked: avg.locked, avg: avg.value == null ? null : Math.round(avg.value), avgLabel: avg.label, bands, r1y, weakest };
}
export const fundBandLine = (b: MfGlance["bands"]) => [b.g ? `${b.g} healthy` : null, b.o ? `${b.o} average` : null, b.r ? `${b.r} poor` : null, b.n ? `${b.n} not scored` : null].filter(Boolean).join(" · ");
