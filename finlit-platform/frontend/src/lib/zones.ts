// Trading Lab > Order Flow > Stock zones: the answer of /api/lab/zones/{symbol} (backend finlit/lab/zones.py) and the plain words for it.
// Describe, never advise: a zone is where something happened in past prices, never "a place to buy".

export type ZoneLevel = { key: string; label: string; price: number; group: "previous" | "pivot" | "opening" | "vwap"; note: string };
export type Zone = {
  kind: "ob" | "fvg"; side: "up" | "down"; lo: number; hi: number; at: string; index: number;
  status: "open" | "part filled" | "filled" | "untested" | "tested" | "broken"; touches: number; moveAvg: number | null; distancePct: number | null;
};
export type Zones = {
  status: string; symbol: string; available: boolean; detail?: string; exchange?: string; source?: string; asOf?: string; stale?: boolean; phase?: string;
  session?: string; previousSession?: string | null; interval?: number; last?: number; dayHigh?: number; dayLow?: number; changePct?: number | null;
  vsVwap?: "above" | "below" | "at" | null; openingRange?: string | null;
  candles?: { t: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
  vwap?: (number | null)[]; levels?: ZoneLevel[]; zones?: Zone[];
};

export const KIND = { ob: "Order block", fvg: "Fair-value gap" } as const;

/** What a zone is, in one line: "Order block left by a rise", "Fair-value gap left by a fall". */
export const zoneName = (z: Zone) => `${KIND[z.kind]} left by a ${z.side === "up" ? "rise" : "fall"}`;

export const ZONE_RULE = {
  ob: "The last candle against the move before price moved away by at least twice the average candle range within three candles. The zone is that candle's high to low.",
  fvg: "Three candles where the third did not reach back to the first: the price range between them was skipped.",
} as const;

export const STATUS_NOTE: Record<Zone["status"], string> = {
  open: "No later candle has traded into it.",
  "part filled": "Later candles traded into part of it.",
  filled: "Later candles traded all the way through it.",
  untested: "No later candle has come back into it.",
  tested: "Price has come back into it since.",
  broken: "A later candle closed beyond its far side.",
};

/** Zones still in play (not filled, not broken), nearest to the last price first. */
export function nearest(zs: Zone[] = [], n = 6): Zone[] {
  return zs.filter((z) => z.status !== "filled" && z.status !== "broken" && z.distancePct != null)
    .sort((a, b) => Math.abs(a.distancePct as number) - Math.abs(b.distancePct as number)).slice(0, n);
}

/** Where the last price sits against the levels: the nearest level above and below it. */
export function between(levels: ZoneLevel[] = [], last: number | undefined): { above: ZoneLevel | null; below: ZoneLevel | null } {
  if (last == null) return { above: null, below: null };
  const above = levels.filter((l) => l.price > last).sort((a, b) => a.price - b.price)[0] ?? null;
  const below = levels.filter((l) => l.price <= last).sort((a, b) => b.price - a.price)[0] ?? null;
  return { above, below };
}

/** The stock's day in one plain sentence. */
export function zonesLine(z: Zones): string {
  if (!z.available || z.last == null) return "";
  const b = between(z.levels, z.last);
  const p = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    `${z.symbol} at ${p(z.last)}${z.changePct != null ? ` (${z.changePct > 0 ? "+" : ""}${z.changePct.toFixed(2)}%)` : ""}`,
    z.vsVwap ? `${z.vsVwap} VWAP` : null,
    z.openingRange,
    b.below && b.above ? `between ${b.below.label} ${p(b.below.price)} and ${b.above.label} ${p(b.above.price)}` : null,
  ].filter(Boolean).join(" · ");
}
