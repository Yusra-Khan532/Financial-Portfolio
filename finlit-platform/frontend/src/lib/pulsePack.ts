// Sector Pulse as the "FinLit final pages" pack draws it (13 Nov 2026, docs/design/finlit-final-pages/05 and 06): the pack's names, colours, order and every sentence the page
// works out from the server's figures. Pure functions only, so each one is tested against the pack's own numbers (pulsePack.test.ts). Describes, never advises.
import type { Board, CornerCode, GroupRow, LeaderFlag, StateCode } from "./sectors";
import type { SectorHistory, StateKey } from "./sectorHistory";

/** The order the pack lists the states in (state table, groups, legends). */
export const ORDER: StateKey[] = ["crash", "bouncing", "rising", "losing", "sold_off", "no_signal"];
export const WORD: Record<StateKey, string> = {
  crash: "Bouncing back after a crash", bouncing: "Bouncing back", rising: "Rising together", losing: "Losing steam", sold_off: "Sold off", no_signal: "No clear signal",
};
/** The pack's colours (chart fills and the squares). Chips use the matching pale backgrounds in sectors-pack.css. */
export const COLOUR: Record<StateKey, string> = {
  crash: "#2E7D57", bouncing: "#7CC79B", rising: "#4A78C2", losing: "#D9727C", sold_off: "#E9B949", no_signal: "#C9C4B8",
};
export const OF_CODE: Record<StateCode, StateKey> = { thrust_cap: "crash", thrust_c: "bouncing", confirmed: "rising", fading: "losing", washout: "sold_off", neutral: "no_signal" };
export const keyOf = (r: Pick<GroupRow, "state_code">): StateKey => OF_CODE[r.state_code] ?? "no_signal";

/** One line under each state's group header (pack 05/06). */
export const MEANING: Record<StateKey, string> = {
  crash: "The same broad bounce, but after a deeper fall in which almost every stock hit a new low.",
  bouncing: "After a sell-off, most of its stocks turned up together in a short space of time.",
  rising: "Most of its stocks are above their short, medium and longer trend.",
  losing: "A bounce or rise has lost support: fewer of its stocks are still rising.",
  sold_off: "Most of its stocks have fallen below their trend, and no broad bounce has followed yet.",
  no_signal: "No sell-off, bounce or broad rise: its stocks are not moving together.",
};
/** The (i) text of each state (pack "Words on this page"). */
export const STATE_HELP: Record<StateKey, string> = {
  sold_off: "Sold off. Most of this industry's stocks have fallen below their usual price level, and they have not turned up together yet. The industry is out of favour for now.",
  bouncing: "Bouncing back. After a fall, most of the industry's stocks turned up together within a few days. It is the first sign of a recovery, and it can still fade.",
  crash: "Bouncing back after a crash. The same broad bounce, but after a deep fall in which almost every stock in the industry hit a new low. Bounces after a crash can be sharp, and they can also fade.",
  rising: "Rising together. Most of the industry's stocks are above their short, medium and longer-term price levels. The rise is broad, not carried by a few names.",
  losing: "Losing steam. A bounce or a rise that is losing support: fewer of the industry's stocks are still going up.",
  no_signal: "No clear signal. The industry is not sold off, not bouncing and not rising together: its stocks are not moving as one.",
};

/** The pack's short names for the eleven NSE industries whose full names do not fit a row; every other name is NSE's own. */
export const SHORT: Record<string, string> = {
  "Agricultural Commercial & Construction Vehicles": "Agri & Construction Vehicles", "Agricultural Food & other Products": "Agri Food Products", "Cement & Cement Products": "Cement",
  "Chemicals & Petrochemicals": "Chemicals", "Commercial Services & Supplies": "Commercial Services", "Fast Moving Consumer Goods": "FMCG", "Fertilizers & Agrochemicals": "Fertilizers & Agrochem",
  "Industrial Manufacturing": "Industrial Mfg", "Media Entertainment & Publication": "Media & Entertainment", "Oil Gas & Consumable Fuels": "Oil, Gas & Fuels",
  "Pharmaceuticals & Biotechnology": "Pharma & Biotech",
};
export const short = (name: string) => SHORT[name] ?? name;
/** The shortest name, for a card title: "IT - Software" is "IT" (the pack's card: "IT and Construction fell hardest"). */
export const brief = (name: string) => short(name).split(" - ")[0];

/** The Sector Rotation box, the pack's words and arrows. */
export const BOX: Record<Exclude<CornerCode, "middle">, { word: string; arrow: string; tone: "good" | "watch" | "info" | "bad" }> = {
  ahead_gaining: { word: "Ahead and gaining", arrow: "↗", tone: "good" }, ahead_slowing: { word: "Ahead but slowing", arrow: "→", tone: "watch" },
  behind_gaining: { word: "Behind but gaining", arrow: "↑", tone: "info" }, behind_slipping: { word: "Behind and slipping", arrow: "↘", tone: "bad" },
};
export const BOX_ORDER: Exclude<CornerCode, "middle">[] = ["ahead_gaining", "ahead_slowing", "behind_gaining", "behind_slipping"];

// ------------------------------------------------------------------------------------------------ figures for one industry
/** "N of M stocks rising": stocks above their medium (20-day) trend, of the counted ones (pack: "45 of the 67 counted finance stocks are above their medium-term trend"). */
export const risingOf = (r: GroupRow, k: "above_9" | "above_20" | "above_50" = "above_20"): number | null => {
  const v = r.breadth?.[k];
  return v == null || !r.stocks_counted ? null : Math.round((v / 100) * r.stocks_counted);
};
/** Sold off, but 4 in 5 of its stocks are already above their short trend (pack: "EARLY SIGN ... most of their stocks are already above their short trend"). */
export const EARLY_SHORT = 80;
export const isEarly = (r: GroupRow) => keyOf(r) === "sold_off" && (r.breadth?.above_9 ?? 0) >= EARLY_SHORT;
/** "1 day ago", "16 days ago": the last bounce, in trading days. */
export const bouncedAgo = (r: GroupRow): string | null => {
  const t = r.last_thrust; if (!t) return null;
  return t.sessions_ago === 0 ? "today" : `${t.sessions_ago} ${t.sessions_ago === 1 ? "day" : "days"} ago`;
};
/** Full table: "1d · crash", "3d · sell-off". */
export const bouncedShort = (r: GroupRow): string | null => (r.last_thrust ? `${r.last_thrust.sessions_ago}d · ${r.last_thrust.type === "CAP" ? "crash" : "sell-off"}` : null);
export const belowHigh = (v: number | null | undefined): string | null => (v == null ? null : v >= 0 ? "at its high" : `${trim(Math.abs(v))}% below`);
const trim = (v: number) => (Math.round(v * 10) / 10).toString();

/** The states of one day and of the last Friday before it, from the history. */
export function statesAt(h: SectorHistory | undefined, back: number): Record<StateKey, number> | null {
  if (!h || !h.dates.length) return null;
  const last = h.dates.length - 1, ends = h.week_ends ?? [];
  const i = back === 0 ? last : ends.length >= 2 ? ends[ends.length - 2] : Math.max(0, last - 5);
  const out = Object.fromEntries(ORDER.map((k) => [k, 0])) as Record<StateKey, number>;
  for (const k of ORDER) out[k] = h.counts[k]?.[i] ?? 0;
  return out;
}

// ------------------------------------------------------------------------------------------------ "Today in one minute"
export type Card = { kind: "good" | "watch" | "insight" | "warning"; title: string; text: string };
const bounceKeys: StateKey[] = ["crash", "bouncing"];
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

/** The headline sentence and the line under it (pack: "The sell-off is easing. 15 of 38 industries are bouncing back; a week ago just 1 was. None has most of its stocks rising together yet."). */
export function headline(rows: GroupRow[], _now: Record<StateKey, number> | null, week: Record<StateKey, number> | null): { lead: string; rest: string; sub: string | null } {
  const n = rows.length, cnt = (k: StateKey) => rows.filter((r) => keyOf(r) === k).length;
  const b = cnt("crash") + cnt("bouncing"), sold = cnt("sold_off"), rise = cnt("rising"), lose = cnt("losing");
  const bWeek = week ? week.crash + week.bouncing : null, sWeek = week ? week.sold_off : null;
  let lead: string;
  if (sWeek != null && sWeek > sold && b > (bWeek ?? 0)) lead = "The sell-off is easing.";
  else if (sWeek != null && sold > sWeek) lead = "The selling is spreading.";
  else if (rise * 2 >= n) lead = "Most industries are rising together.";
  else if (b * 2 >= n) lead = "Bounces are broad.";
  else lead = "A mixed picture.";
  const bounce = `${b} of ${n} industries ${b === 1 ? "is" : "are"} bouncing back` + (bWeek != null ? `; a week ago ${bWeek === 1 ? "just 1 was" : bWeek === 0 ? "none was" : `${bWeek} were`}` : "") + ".";
  const together = rise === 0 ? " None has most of its stocks rising together yet." : ` ${plural(rise, "industry has", "industries have")} most of ${rise === 1 ? "its" : "their"} stocks rising together.`;
  const sub = sWeek != null ? `Sold off: ${plural(sWeek, "industry", "industries")} a week ago, ${sold} today.` : lose ? `Losing steam: ${lose} today.` : null;
  return { lead, rest: " " + bounce + together, sub };
}

/** The four cards beside the squares (pack 05: good sign, watch out, insight, warning). */
export function todayCards(rows: GroupRow[]): Card[] {
  const by = (k: StateKey) => rows.filter((r) => keyOf(r) === k);
  const bounce = rows.filter((r) => bounceKeys.includes(keyOf(r))).sort((a, b) => (a.last_thrust?.sessions_ago ?? 99) - (b.last_thrust?.sessions_ago ?? 99));
  const out: Card[] = [];
  if (bounce.length) {
    const crash = by("crash").length, names = bounce.slice(0, 3).map((r) => short(r.name));
    out.push({ kind: "good", title: `${plural(bounce.length, "industry is", "industries are")} bouncing back`,
      text: `${bounce.length > 3 ? `${names.join(", ")} and ${bounce.length - 3} more` : list(names)}: most of their stocks turned up together within days.${crash ? ` ${crash} of them bounced after a crash.` : ""}` });
  }
  const rise = by("rising");
  out.push(rise.length
    ? { kind: "good", title: `${plural(rise.length, "industry is", "industries are")} rising together`, text: `${list(rise.slice(0, 4).map((r) => short(r.name)))}: most of their stocks are above their short, medium and longer trend.` }
    : { kind: "watch", title: "No industry is rising together yet", text: "A bounce becomes a recovery only when most stocks stay up. Watch the bouncing industries over the next few weeks." });
  const early = rows.filter(isEarly).sort((a, b) => (b.breadth.above_9 ?? 0) - (a.breadth.above_9 ?? 0));
  if (early.length) out.push({ kind: "insight", title: `A bounce may be forming in ${plural(early.length, "sold-off industry", "sold-off industries")}`,
    text: early.map((r) => `${short(r.name)} (${risingOf(r, "above_9")} of ${r.stocks_counted})`).join("; ") + ": most of their stocks are already above their short trend." });
  const lose = by("losing");
  if (lose.length) out.push({ kind: "warning", title: `${plural(lose.length, "industry is", "industries are")} losing steam`, text: `${list(lose.map((r) => short(r.name)))}: fewer of ${lose.length === 1 ? "its" : "their"} stocks are still rising.` });
  else if (by("sold_off").length * 2 >= rows.length) out.push({ kind: "warning", title: `${by("sold_off").length} of ${rows.length} industries are sold off`, text: "Most industries have most of their stocks below their trend, with no broad bounce yet." });
  return out.slice(0, 4);
}

// ------------------------------------------------------------------------------------------------ "How your industries are doing"
/** What a state and a Rotation box mean together for someone who owns shares in the industry (pack 05, last column). Describes, never advises. */
export function meansForYou(r: GroupRow): { text: string; tone: "good" | "watch" } {
  const k = keyOf(r), box = r.rotation?.corner;
  const ahead = box === "ahead_gaining" || box === "ahead_slowing";
  if (k === "crash" || k === "bouncing") {
    if (box === "ahead_gaining") return { text: "Recovering, and already ahead of most industries.", tone: "good" };
    if (box === "ahead_slowing") return { text: "Recovering; its lead over other industries has slowed.", tone: "good" };
    if (box === "behind_gaining") return { text: "Recovering, and catching up with other industries.", tone: "good" };
    return { text: "Recovering, though still behind most industries.", tone: "good" };
  }
  if (k === "rising") return { text: ahead ? "Rising broadly, and ahead of most industries." : "Rising broadly, though behind most industries over recent months.", tone: "good" };
  if (k === "losing") return { text: "Its recent rise is losing support.", tone: "watch" };
  if (k === "sold_off") {
    if (isEarly(r) && !ahead) return { text: "Sold off and behind most industries, but most of its stocks have started rising again. An early sign.", tone: "watch" };
    if (box === "ahead_gaining") return { text: "Sold off lately, though still ahead of most industries over the last few months.", tone: "watch" };
    if (box === "ahead_slowing") return { text: "Sold off, and its lead over other industries is fading.", tone: "watch" };
    if (box === "behind_gaining") return { text: "Sold off, though it has been catching up with other industries.", tone: "watch" };
    return { text: "Sold off, and falling further behind other industries.", tone: "watch" };
  }
  return { text: "No clear direction: its stocks are not moving together.", tone: "watch" };
}

export type Holding = { symbol: string; slug: string };
const BOX_RANK: Record<string, number> = { ahead_gaining: 0, ahead_slowing: 1, behind_gaining: 2, behind_slipping: 3, middle: 4 };
/** The pack's order for "your industries": recovering ones first (by box, then rank), then sold-off ones with an early sign, then the rest by box, sold off before losing steam, largest first. */
export function yourOrder(a: GroupRow, b: GroupRow): number {
  const tier = (r: GroupRow) => (bounceKeys.includes(keyOf(r)) || keyOf(r) === "rising" ? 0 : isEarly(r) ? 1 : 2);
  const st = (r: GroupRow) => ORDER.indexOf(keyOf(r) === "losing" ? "no_signal" : keyOf(r));
  return tier(a) - tier(b) || BOX_RANK[a.rotation?.corner ?? "middle"] - BOX_RANK[b.rotation?.corner ?? "middle"]
    || (tier(a) === 0 ? (a.rotation?.rank ?? 99) - (b.rotation?.rank ?? 99) : st(a) - st(b) || b.stocks_counted - a.stocks_counted);
}
/** The cards above "How your industries are doing" (pack 05). */
export function yourCards(rows: GroupRow[], held: Holding[]): Card[] {
  const mine = rows.filter((r) => held.some((h) => h.slug === r.slug));
  const out: Card[] = [];
  const good = mine.filter((r) => bounceKeys.includes(keyOf(r)) && (r.rotation?.corner === "ahead_gaining" || r.rotation?.corner === "ahead_slowing"))
    .sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b)) || BOX_RANK[a.rotation!.corner] - BOX_RANK[b.rotation!.corner] || (a.rotation?.rank ?? 99) - (b.rotation?.rank ?? 99));
  if (good.length) out.push({ kind: "good", title: `${good.length} of your industries ${good.length === 1 ? "is" : "are"} recovering and ahead of most others`,
    text: `${good.map((r) => short(r.name)).join(", ")}. ${good.length > 1 ? "This is the strongest mix on the page." : "Recovering, with a lead over most industries."}` });
  const soldSyms = held.filter((h) => { const r = rows.find((x) => x.slug === h.slug); return r && keyOf(r) === "sold_off"; }).map((h) => h.symbol);
  if (soldSyms.length) out.push({ kind: "watch", title: `${soldSyms.length} of your ${held.length} shares sit in sold-off industries`, text: `${soldSyms.join(", ")}. Their industries have not turned up together yet.` });
  return out;
}

// ------------------------------------------------------------------------------------------------ "All industries, by state"
/** Each state's industries, in the pack's order inside a group: the freshest bounce first for the bouncing states, the most stocks rising first for the others. */
export function byState(rows: GroupRow[]): { key: StateKey; rows: GroupRow[] }[] {
  return ORDER.map((key) => {
    const rs = rows.filter((r) => keyOf(r) === key);
    rs.sort((a, b) => (bounceKeys.includes(key) ? (a.last_thrust?.sessions_ago ?? 999) - (b.last_thrust?.sessions_ago ?? 999) : 0)
      || (b.breadth.above_20 ?? 0) - (a.breadth.above_20 ?? 0) || a.name.localeCompare(b.name));
    return { key, rows: rs };
  }).filter((g) => g.rows.length);
}

// ------------------------------------------------------------------------------------------------ "Momentum and strength, side by side"
export type Cell = { names: string[]; mark: "strongest" | "weakest" | null };
/** The matrix lists Sold off before Losing steam (pack 05), unlike the state table. */
export const MATRIX_ORDER: StateKey[] = ["crash", "bouncing", "rising", "sold_off", "losing", "no_signal"];
/** Rows: the state (Sector Pulse). Columns: the Rotation box. Every industry with a box lands in one cell. */
export function matrix(rows: GroupRow[]): { states: StateKey[]; cells: Record<string, Cell> } {
  const cells: Record<string, Cell> = {};
  const states = MATRIX_ORDER.filter((k) => rows.some((r) => keyOf(r) === k));
  for (const k of states) for (const b of BOX_ORDER) cells[k + ":" + b] = { names: [], mark: (k === "crash" || k === "bouncing") && b === "ahead_gaining" ? "strongest" : k === "sold_off" && b === "behind_slipping" ? "weakest" : null };
  for (const r of rows) { const b = r.rotation?.corner; if (!b || b === "middle") continue; const c = cells[keyOf(r) + ":" + b]; if (c) c.names.push(r.name); }
  return { states, cells };
}
export function matrixCards(rows: GroupRow[]): Card[] {
  const strong = rows.filter((r) => bounceKeys.includes(keyOf(r)) && r.rotation?.corner === "ahead_gaining").map((r) => short(r.name));
  const weak = rows.filter((r) => keyOf(r) === "sold_off" && r.rotation?.corner === "behind_slipping").map((r) => short(r.name));
  const out: Card[] = [];
  if (strong.length) out.push({ kind: "good", title: `Both views agree: ${strong.join(", ")}`, text: "Their stocks have just turned up together, and these industries were already beating most others. A recovery with support behind it." });
  if (weak.length) out.push({ kind: "warning", title: `Both views are negative: ${weak.length > 4 ? weak.slice(0, 4).join(", ") + ` and ${weak.length - 4} more` : list(weak)}`, text: "Sold off and falling further behind other industries. No sign of a turn yet." });
  return out;
}

// ------------------------------------------------------------------------------------------------ "Standout stocks in weak industries"
/** Full flag = "Strong" (industry far below its high), early flag = "Early". */
export const howStrong = (f: Pick<LeaderFlag, "tier" | "tier_code">) => (f.tier_code === 2 || /full/i.test(f.tier) ? "Strong" : "Early");
export const newHigh = (f: Pick<LeaderFlag, "sessions_ago">) => (f.sessions_ago === 0 ? "1-year high today" : `1-year high ${f.sessions_ago}d ago`);

// ------------------------------------------------------------------------------------------------ Full table view
/** The three cards above the full table (pack 06). */
export function tableCards(rows: GroupRow[], week: Record<StateKey, number> | null): Card[] {
  const shortUp = rows.filter((r) => (r.breadth.above_9 ?? 0) > 50).length, longDown = rows.filter((r) => (r.breadth.above_50 ?? 100) <= 50).length;   // half or fewer (four industries sit at exactly 50%: the pack counts them)
  const out: Card[] = [{ kind: "good", title: shortUp * 2 >= rows.length ? "Breadth is improving fast" : "Breadth is still narrow",
    text: `${shortUp} industries now have more than half their stocks above the short trend.${week && week.sold_off * 2 >= rows.length ? " A week ago the market was in a broad sell-off." : ""}` }];
  if (longDown) out.push({ kind: "watch", title: "The longer trend has not turned", text: `In ${longDown} of ${rows.length} industries half or fewer of the stocks are above their longer trend. Bounces need time to become uptrends.` });
  const crash = rows.filter((r) => keyOf(r) === "crash" && r.held_up != null).sort((a, b) => (a.held_up ?? 100) - (b.held_up ?? 100)).slice(0, 2);
  if (crash.length === 2) out.push({ kind: "insight", title: `${brief(crash[0].name)} and ${brief(crash[1].name)} fell hardest`, text: "Both made their low with almost every stock falling, and both have now bounced." });
  return out;
}
export type TableFilter = "all" | "bounce" | "sold_off" | "losing" | "standouts" | "yours";
export function inTableFilter(r: GroupRow, f: TableFilter, mine: Set<string>): boolean {
  const k = keyOf(r);
  if (f === "bounce") return k === "crash" || k === "bouncing";
  if (f === "sold_off") return k === "sold_off";
  if (f === "losing") return k === "losing";
  if (f === "standouts") return (r.leader_flags ?? 0) > 0;
  if (f === "yours") return mine.has(r.slug);
  return true;
}
/** The full table as a CSV, one line per industry, the figures as shown. */
export function toCsv(rows: GroupRow[]): string {
  const head = ["Industry", "State", "Stocks counted", "Above short trend %", "Above medium trend %", "Above longer trend %", "Below 1-year high %", "Held up %", "Last bounce", "Standout stocks", "Box", "Rank"];
  const q = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head, ...rows.map((r) => [r.name, WORD[keyOf(r)], r.stocks_counted, r.breadth.above_9, r.breadth.above_20, r.breadth.above_50, r.index_vs_52w_high == null ? "" : Math.abs(r.index_vs_52w_high), r.held_up ?? "",
    bouncedShort(r) ?? "", r.leader_flags ?? "", r.rotation?.corner_name ?? "", r.rotation?.rank ?? ""])].map((l) => l.map(q).join(",")).join("\n");
}
export const boardDateLine = (b: Board) => b.date_label ?? b.date;

// ------------------------------------------------------------------------------------------------ "Six months of every industry" (Full table, pack 06)
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "4 Sep", the pack's day format (browsers write "Sept" for some locales, so it is not left to them). */
export const dayMon = (d: string) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;
/** Each industry's state at every Friday close (the last 27 week ends), rows sorted by today's state, then by how many of its stocks are rising (medium trend), most first. */
export function fridays(h: SectorHistory): { ends: number[]; rows: { name: string; slug: string; states: (StateKey | null)[]; up: number }[] } {
  const ends = h.week_ends ?? [];
  const lastOf = (v?: (number | null)[]) => [...(v ?? [])].reverse().find((x) => x != null) ?? -1;
  const rows = h.groups.map((g) => ({ name: g.name, slug: g.slug, states: ends.map((i) => g.states[i] ?? null), up: lastOf(g.rising) }))
    .filter((r) => r.states[r.states.length - 1])
    .sort((a, b) => ORDER.indexOf(a.states[a.states.length - 1]!) - ORDER.indexOf(b.states[b.states.length - 1]!) || b.up - a.up || a.name.localeCompare(b.name));   // within a state, most stocks rising (medium trend) first, as the pack orders them
  return { ends, rows };
}
const bounceSet = new Set<StateKey | null>(["crash", "bouncing"]);
/** The three cards under the Friday squares (pack 06): turned to a bounce this week, the longest sell-off before this week, the last Friday any industry rose together. */
export function fridayCards(h: SectorHistory): Card[] {
  const ends = h.week_ends ?? [], out: Card[] = [];
  if (ends.length < 2) return out;
  const a = ends[ends.length - 2], z = ends[ends.length - 1], total = h.groups.length;
  const turned = h.groups.filter((g) => bounceSet.has(g.states[z]) && !bounceSet.has(g.states[a])).length;
  const changed = h.groups.filter((g) => g.states[z] && g.states[a] && g.states[z] !== g.states[a]);
  const fromSold = changed.filter((g) => g.states[a] === "sold_off").length;
  out.push({ kind: "good", title: `${turned} ${turned === 1 ? "industry" : "industries"} turned to a bounce this week`,
    text: `${changed.length} of ${total} changed state since ${dayMon(h.dates[a])}${fromSold * 2 > changed.length ? "; most of them came out of a long sell-off" : ""}.` });
  let best = { name: "", run: 0 };
  for (const g of h.groups) {
    let run = 0;
    for (let j = ends.length - 2; j >= 0 && g.states[ends[j]] === "sold_off"; j--) run++;
    if (run > best.run) best = { name: g.name, run };
  }
  if (best.run >= 2) out.push({ kind: "warning", title: `Longest sell-off: ${short(best.name)}`, text: `Sold off for ${best.run} Fridays in a row before this week.` });
  const lastRise = [...ends].reverse().find((i) => h.groups.some((g) => g.states[i] === "rising"));
  if (h.groups.some((g) => g.states[z] === "rising")) out.push({ kind: "good", title: "Industries rising together", text: `${h.groups.filter((g) => g.states[z] === "rising").length} of ${total} have most of their stocks rising together at this Friday's close.` });
  else out.push({ kind: "watch", title: "No industry rising together", text: lastRise != null ? `The last blue square on the chart is ${dayMon(h.dates[lastRise])}: at no Friday close since then has an industry had most of its stocks rising together.` : "No Friday close in the last six months had an industry with most of its stocks rising together." });
  return out;
}
/** Standout stocks, Full table (pack 06): how many are Strong and how many Early. */
export const standoutCounts = (flags: LeaderFlag[]) => ({ strong: flags.filter((f) => howStrong(f) === "Strong").length, early: flags.filter((f) => howStrong(f) === "Early").length });
/** The index of the last bounce in a 6-month series (the ▲ on the full table's line), or null. */
export function bounceIndex(dates: string[], r: GroupRow): number | null {
  const d = r.last_thrust?.date; if (!d) return null;
  const i = dates.indexOf(d); return i >= 0 ? i : null;
}
