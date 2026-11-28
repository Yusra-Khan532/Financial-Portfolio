// Task #448 (Sector Pulse, developer file 42, 02 §1.2 and §2, 06): the figures behind "For you this week" and the short "Your sectors" view. Pure functions over
// the feeds the page already loads (the board, the weekly history, /api/sector-next, the member's holdings, sector membership, last prices). Describes past
// prices; never advice.
import type { SectorHistory, StateKey } from "./sectorHistory";
import type { GroupRow, StateCode } from "./sectors";
import { OF_CODE, WORD, keyOf } from "./pulsePack";

/** A held share, once per symbol: quantity across lots, its last close, and its group (null: no NSE sector / industry). */
export type HeldShare = { symbol: string; qty: number; price: number | null; slug: string | null };

/** Share of the whole, by the largest-remainder method so the parts add up to 100 (in tenths). */
export function shares(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 1000), base = raw.map(Math.floor);
  let left = 1000 - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; base[i] += 1; left -= 1; }
  return base.map((t) => t / 10);
}
/** "0.5%", "8.2%" below 10; "13%", "88%" from 10 up (06). */
export const pct = (p: number): string => (p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`);

/** A share's value: quantity × last close (0 when there is no price). */
export const valueOf = (h: HeldShare): number => (h.price != null && h.qty > 0 ? h.qty * h.price : 0);

/** The state at the latest weekly close and at the one before, from the history. */
export function weeklyStates(h: SectorHistory | undefined, slug: string): (StateKey | null)[] {
  const g = h?.groups.find((x) => x.slug === slug);
  if (!g || !h) return [];
  const ends = h.week_ends?.length ? h.week_ends : [h.dates.length - 1];
  return ends.map((i) => g.states[i] ?? null);
}

/** Time in a state (06): the run of identical weekly states back from the latest; "N+ weeks" when the run covers every week in the history. */
export function timeInState(h: SectorHistory | undefined, slug: string): { weeks: number; whole: boolean } | null {
  const s = weeklyStates(h, slug);
  if (!s.length || s[s.length - 1] == null) return null;
  let n = 1;
  for (let i = s.length - 2; i >= 0 && s[i] === s[s.length - 1]; i--) n++;
  return n === s.length ? { weeks: Math.max(1, n - 1), whole: true } : { weeks: n, whole: false };
}

export type NextRow = { state: StateCode; typical_weeks: number | null; entered?: number; ended?: number; now?: number; next?: { state: StateCode; n: number }[] };
/** How long groups usually stayed in each state over the last year (/api/sector-next), in whole weeks, at least 1. */
export function typicalWeeks(rows: NextRow[] | undefined): Partial<Record<StateKey, number>> {
  const out: Partial<Record<StateKey, number>> = {};
  for (const r of rows ?? []) if (r.typical_weeks != null) out[OF_CODE[r.state]] = Math.max(1, Math.round(r.typical_weeks));
  return out;
}
const weeksWord = (n: number) => `${n} ${n === 1 ? "week" : "weeks"}`;
/** "3 weeks in this state; usually about 2 weeks" (05 §4); `long`: at least twice the usual stay and at least 4 weeks (06). */
export function stayLine(t: { weeks: number; whole: boolean } | null, usual: number | undefined): { text: string; long: boolean } | null {
  if (!t) return null;
  const now = t.whole ? `${t.weeks}+ weeks in this state` : `${weeksWord(t.weeks)} in this state`;
  return { text: usual ? `${now}; usually about ${weeksWord(usual)}` : now, long: usual != null && t.weeks >= 2 * usual && t.weeks >= 4 };
}

/** The phrase for a state's group of sectors: "sold-off sectors", "sectors bouncing back" (05 §7). */
export function groupPhrase(k: StateKey, ns: string): string {
  switch (k) {
    case "sold_off": return `sold-off ${ns}`;
    case "losing": return `${ns} losing steam`;
    case "rising": return `${ns} rising together`;
    case "bouncing": return `${ns} bouncing back`;
    case "crash": return `${ns} bouncing back after a crash`;
    default: return `${ns} with no clear signal`;
  }
}
/** The state in a lead's list: "8% losing steam", "1% bouncing back after a crash". */
export const stateWords = (k: StateKey): string => (k === "no_signal" ? "with no clear signal" : WORD[k].toLowerCase());

export type YourGroup = { row: GroupRow; key: StateKey; was: StateKey | null; shares: HeldShare[]; value: number };
/** The member's groups: each with its shares (portfolio), its value and its state now and a week ago. */
export function yourGroups(rows: GroupRow[], held: HeldShare[], h: SectorHistory | undefined): YourGroup[] {
  return rows.flatMap((row) => {
    const s = held.filter((x) => x.slug === row.slug);
    if (!s.length) return [];
    const w = weeklyStates(h, row.slug);
    return [{ row, key: keyOf(row), was: w.length >= 2 ? w[w.length - 2] : null, shares: s, value: s.reduce((a, x) => a + valueOf(x), 0) }];
  });
}

/** "For you this week" (02 §1.2): the sentence, the value line, and the groups that changed, largest value first. `noun`: sector / industry. */
export function forYou(groups: YourGroup[], held: HeldShare[], noun: "sector" | "industry") {
  const ns = noun === "industry" ? "industries" : "sectors", n = groups.length;
  const changed = groups.filter((g) => g.was != null && g.was !== g.key).sort((a, b) => b.value - a.value);
  const head = changed.length
    ? { b: `${changed.length} of your ${n} ${ns} changed state this week.`, rest: n - changed.length ? ` ${n - changed.length} stayed where ${n - changed.length === 1 ? "it was" : "they were"}.` : "" }
    : { b: `None of your ${n} ${ns} changed state this week.`, rest: " Each is where it was a week ago." };
  const total = held.reduce((a, x) => a + valueOf(x), 0);
  const byKey = (pick: (g: YourGroup) => StateKey | null) => {
    const m = new Map<StateKey, number>();
    for (const g of groups) { const k = pick(g); if (k) m.set(k, (m.get(k) ?? 0) + g.value); }
    return m;
  };
  const now = byKey((g) => g.key), before = byKey((g) => g.was);
  const top = [...now.entries()].sort((a, b) => b[1] - a[1])[0];
  let value: string | null = null, state: StateKey | null = null;
  if (top && total > 0) {
    state = top[0];
    const p = Math.round((top[1] / total) * 100), w = Math.round(((before.get(top[0]) ?? 0) / total) * 100);
    value = `${p}% of your portfolio is in ${groupPhrase(top[0], ns)}, against ${w}% a week ago.`;
  }
  return { head, value, state, changed, total };
}

/** The Your-sectors lead (02 §2): by value or by number of sectors. */
export function yourLead(groups: YourGroup[], held: HeldShare[], by: "value" | "count", noun: "sector" | "industry"): { b: string; rest: string } | null {
  const ns = noun === "industry" ? "industries" : "sectors";
  if (!groups.length) return null;
  const order: StateKey[] = [];
  const add = (k: StateKey, v: number, m: Map<StateKey, number>) => { if (!m.has(k)) order.push(k); m.set(k, (m.get(k) ?? 0) + v); };
  const m = new Map<StateKey, number>();
  if (by === "count") {
    for (const g of groups) add(g.key, 1, m);
    const list = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const [k0, n0] = list[0];
    const tail = list.slice(1).map(([k, n]) => `${n} ${n === 1 ? "is" : "are"} ${stateWords(k)}`);
    return { b: `${n0} of your ${groups.length} ${ns} ${n0 === 1 ? "is" : "are"} ${stateWords(k0)}.`, rest: tail.length ? ` ${join(tail)}.` : "" };
  }
  for (const g of groups) add(g.key, g.value, m);
  const none = held.filter((x) => !x.slug).reduce((a, x) => a + valueOf(x), 0);
  const keys = [...m.keys()], vals = [...keys.map((k) => m.get(k)!), none];
  if (!vals.some((v) => v > 0)) return null;
  const p = shares(vals);
  const list = keys.map((k, i) => [k, p[i]] as const).sort((a, b) => b[1] - a[1]);
  const [k0, p0] = list[0];
  const tail = [...list.slice(1).filter(([, x]) => x > 0).map(([k, x]) => `${pct(x)} ${stateWords(k)}`), ...(p[p.length - 1] > 0 ? [`${pct(p[p.length - 1])} with no NSE ${noun}`] : [])];
  return { b: `${pct(p0)} of your portfolio value is in ${groupPhrase(k0, ns)}.`, rest: tail.length ? ` The rest: ${join(tail)}.` : "" };
}
/** "A, B and C". */
export const join = (xs: string[]): string => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export type PeerWord = "Leader" | "In line" | "Laggard" | null;
const PEER_ORDER: Record<string, number> = { Leader: 0, "In line": 1, Laggard: 2 };
/** Leaders first, then In line, Laggard and No label (04 §2). */
export const byPeer = <T extends { label: PeerWord }>(xs: T[]): T[] => [...xs].sort((a, b) => (PEER_ORDER[a.label ?? ""] ?? 3) - (PEER_ORDER[b.label ?? ""] ?? 3));
