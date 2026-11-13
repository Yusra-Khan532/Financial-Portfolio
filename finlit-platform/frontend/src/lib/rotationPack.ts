// Sector Rotation as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/08 and 09): the sentences, cards and tables of the Simple
// and Full table views, worked out from the server's rotation answer (GET /api/rotation) and, where the pack asks "Does Sector Pulse agree?", the Sector Pulse board.
// Every figure is the server's; this file only chooses, orders and words them. Describes how industries have done against the average industry; never advice.
import type { CornerCode, GroupRow } from "./sectors";
import type { RotationMap, RotationRow } from "./rotation";
import { BOX, isEarly, keyOf, short } from "./pulsePack";
import type { Card } from "./pulsePack";

export type Box = Exclude<CornerCode, "middle">;
export const BOXES: Box[] = ["ahead_gaining", "ahead_slowing", "behind_gaining", "behind_slipping"];
/** The pack's four-box picture, in the order industries usually move. */
export const CYCLE: Box[] = ["behind_gaining", "ahead_gaining", "ahead_slowing", "behind_slipping"];
/** How strong a box is: a move up this scale is "a better box". */
export const LEVEL: Record<Box, number> = { behind_slipping: 0, behind_gaining: 1, ahead_slowing: 2, ahead_gaining: 3 };
export const BOX_MEANING: Record<Box, string> = {
  ahead_gaining: "Doing better than the average industry over the longer run, and still pulling ahead lately.",
  ahead_slowing: "Still ahead over the longer run, but lately it has done worse than the average.",
  behind_gaining: "Behind over the longer run, but lately it has done better than the average.",
  behind_slipping: "Doing worse than the average over the longer run, and still falling further behind.",
};
export const BOX_HELP: Record<Box, string> = {
  ahead_gaining: "Ahead and gaining. Over the last several months the industry did better than the average industry, and over the last month it is still pulling further ahead.",
  ahead_slowing: "Ahead but slowing. Over the last several months the industry did better than the average industry, but over the last month it did worse, so its lead is shrinking.",
  behind_gaining: "Behind but gaining. Over the last several months the industry did worse than the average industry, but over the last month it did better, so it is catching up.",
  behind_slipping: "Behind and slipping. Over the last several months the industry did worse than the average industry, and over the last month it fell further behind.",
};
export const WATCH_NEXT: Record<Box, string> = {
  behind_gaining: "Does the catch-up last long enough to get ahead?", ahead_gaining: "The first month it trails the average.",
  ahead_slowing: "Does it start gaining again, or lose its lead?", behind_slipping: "The first month it beats the average.",
};
/** Where each box sits on the map. */
export const CORNER_AT: Record<Box, string> = { behind_gaining: "top-left", ahead_gaining: "top-right", ahead_slowing: "bottom-right", behind_slipping: "bottom-left" };

const boxOf = (c: CornerCode | null | undefined): Box | null => (c && c !== "middle" ? c : null);
export const word = (c: CornerCode | null | undefined) => (boxOf(c) ? BOX[boxOf(c)!].word : "No box yet");
/** "+1.2%", "−5.6%", "+0.0%": a figure against the average industry, as the pack writes it. */
export const pc = (v: number | null | undefined, dp = 1) => (v == null ? "–" : `${v > 0 || Object.is(v, 0) || (v === 0) ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`);
export const pt = (v: number | null | undefined) => (v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`);
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
export const ordinal = (n: number) => ord(n).replace(/(\d)(st|nd|rd|th)$/, (_, d, s) => d + (["st", "nd", "rd"].includes(s) ? s : "th"));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** "Banks" → "bank" for "bank stocks"; other names as they are. */
const noun = (n: string) => (/^[A-Z][a-z]+s$/.test(n) ? n.slice(0, -1).toLowerCase() : n);
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// ------------------------------------------------------------------------------------------------ one industry
export const ranked = (m: RotationMap) => m.rows.filter((r) => r.rank != null);
export const lastMonth = (r: RotationRow) => r.vs_average?.["21d"] ?? null;
export const threeMonths = (r: RotationRow) => r.vs_average?.["63d"] ?? null;
export const sixMonths = (r: RotationRow) => r.vs_average?.["126d"] ?? null;
/** The box its newest weekly reading sits in, when that differs from its box (the pack's "may move to"). */
export const nextBox = (r: RotationRow): Box | null => { const t = r.tail[r.tail.length - 1]?.corner; return r.rank != null && boxOf(t) && t !== r.corner ? (t as Box) : null; };
/** Its box last week: the box it moved from this week, or the same box. */
export function lastWeekBox(m: RotationMap, r: RotationRow): Box | null {
  const mv = m.moved_this_week.find((x) => x.slug === r.slug);
  if (!mv) return boxOf(r.corner);
  return BOXES.find((b) => BOX[b].word === mv.from) ?? null;
}
/** The rank four weekly closes ago, from its rank history. */
export const rankAgo = (r: RotationRow, weeks: number): number | null => r.rank_history[r.rank_history.length - 1 - weeks]?.rank ?? null;
/** Breadth in the pack's words: Most (broad), Some (between), Few (narrow), with the share above the 50-day average. */
export function breadthWord(r: RotationRow): { w: "Most" | "Some" | "Few" | null; pct: number | null } {
  const w = r.breadth === "broad" ? "Most" : r.breadth === "between" ? "Some" : r.breadth === "narrow" ? "Few" : null;
  return { w, pct: r.breadth_above_50 == null ? null : Math.round(r.breadth_above_50) };
}
/** "▲5", "▼1", "–", "same". */
export const move = (n: number | null | undefined) => (n == null ? "–" : n > 0 ? `▲${n}` : n < 0 ? `▼${-n}` : "–");

// ------------------------------------------------------------------------------------------------ does Sector Pulse agree?
export type Agree = { word: "Agrees" | "Mixed" | "Partly" | "Not yet"; tone: "good" | "watch" | "bad"; why: string };
/** Whether the industry's Sector Pulse state points the same way as its change of box. `to` is the box it moved to (or may move to). */
export function pulseAgrees(from: Box, to: Box, g: GroupRow | undefined): Agree | null {
  if (!g || !g.state_code) return null;
  const up = LEVEL[to] > LEVEL[from] || (to === "behind_gaining" && from === "behind_slipping");
  const k = keyOf(g);
  const bounced = k === "crash" || k === "bouncing";
  if (up) {
    if (bounced) return { word: "Agrees", tone: "good", why: "its stocks just bounced" };
    if (k === "rising") return { word: "Agrees", tone: "good", why: "its stocks are rising together" };
    if (k === "sold_off" && isEarly(g)) return { word: "Partly", tone: "watch", why: "most stocks are rising, no broad bounce yet" };
    if (k === "sold_off") return { word: "Not yet", tone: "bad", why: "its stocks are still sold off" };
    if (k === "losing") return { word: "Not yet", tone: "bad", why: "its stocks are losing steam" };
    return { word: "Mixed", tone: "watch", why: "no clear signal from its stocks" };
  }
  if (bounced) return { word: "Mixed", tone: "watch", why: "its stocks just bounced" };
  if (k === "rising") return { word: "Mixed", tone: "watch", why: "its stocks are rising together" };
  return { word: "Agrees", tone: "good", why: "its stocks are not rising together" };
}

// ------------------------------------------------------------------------------------------------ what a change of box means (pack 08: "Changed box this week")
type Mean = { kind: Card["kind"]; lead: string; text: string };
const vs = (v: number | null) => `${pc(v)} vs average`;
/** The pack's sentence for a move from one box to another this week, with the industry's figures. */
export function changeMeaning(from: Box, to: Box, r: RotationRow): Mean {
  const s = r.strength_pts, c = r.change_pts;
  const key = `${from}>${to}`;
  switch (key) {
    case "ahead_slowing>ahead_gaining": return { kind: "good", lead: "Lead widening again.", text: `The pause is over: it beat the average again lately (${vs(c)}), on top of a longer-run lead (${vs(s)}).` };
    case "behind_slipping>ahead_gaining": return { kind: "good", lead: "Turnaround.", text: `A strong last month (${vs(c)}) lifted it from falling behind to leading. A new lead is fragile: watch whether it holds for a few weeks.` };
    case "behind_gaining>ahead_gaining": return { kind: "good", lead: "Caught up.", text: `It beat the average lately (${vs(c)}) and is now ahead over the longer run too (${vs(s)}).` };
    case "ahead_gaining>ahead_slowing": return { kind: "watch", lead: "Lead pausing.", text: `Still ahead over the longer run (${vs(s)}), but it trailed the average lately (${vs(c)}). Often a pause; more weak weeks would erode the lead.` };
    case "behind_gaining>ahead_slowing": case "behind_slipping>ahead_slowing": return { kind: "watch", lead: "Ahead, but not lately.", text: `It is now ahead over the longer run (${vs(s)}), though it trailed the average lately (${vs(c)}).` };
    case "ahead_slowing>behind_slipping": return { kind: "warning", lead: "Lead lost.", text: `Its longer-run lead is gone (${vs(s)}) and it keeps trailing lately (${vs(c)}).` };
    case "ahead_gaining>behind_slipping": return { kind: "warning", lead: "Lead lost quickly.", text: `It trailed the average lately (${vs(c)}) and its longer-run lead is gone (${vs(s)}).` };
    case "behind_gaining>behind_slipping": return { kind: "warning", lead: "Bounce faded.", text: `The catch-up did not last: it trailed again lately (${vs(c)}) and is still behind over the longer run (${vs(s)}).` };
    case "behind_slipping>behind_gaining": return { kind: "insight", lead: "Catching up.", text: `It beat the average lately (${vs(c)}) but is still behind over the longer run (${vs(s)}). Until that turns, treat it as a bounce.` };
    case "ahead_gaining>behind_gaining": case "ahead_slowing>behind_gaining": return { kind: "insight", lead: "Longer-run lead gone.", text: `It is now behind over the longer run (${vs(s)}), though it beat the average lately (${vs(c)}).` };
    default: return { kind: "insight", lead: "Changed box.", text: `${vs(s)} over the longer run, ${vs(c)} lately.` };
  }
}
/** The pack's sentence for an industry whose newest weekly reading already sits in another box. */
export function mayMoveMeaning(from: Box, to: Box): Mean {
  const tail = " Its newest weekly reading already sits in the new box. One more week like it, and it moves.";
  const key = `${from}>${to}`;
  const lead =
    key === "ahead_gaining>ahead_slowing" ? "If it moves: its lead would pause." :
    key === "ahead_slowing>ahead_gaining" ? "If it moves: its lead would start widening again." :
    key === "behind_slipping>ahead_gaining" ? "If it moves: it would jump from the weakest box to the strongest." :
    key === "behind_slipping>behind_gaining" ? "If it moves: it would start catching up." :
    key === "behind_gaining>ahead_gaining" ? "If it moves: it would catch up and take the lead." :
    key === "behind_gaining>behind_slipping" ? "If it moves: its catch-up would fade." :
    key === "ahead_slowing>behind_slipping" ? "If it moves: it would lose its lead." :
    key === "ahead_gaining>behind_slipping" ? "If it moves: it would drop from the strongest box to the weakest." :
    to === "ahead_slowing" ? "If it moves: it would be ahead, but slowing." : "If it moves: it would be behind, but gaining.";
  const kind: Card["kind"] = to === "ahead_gaining" ? "good" : to === "behind_gaining" ? "insight" : to === "ahead_slowing" ? "watch" : "warning";
  return { kind, lead, text: tail.trim() };
}

// ------------------------------------------------------------------------------------------------ Today in one minute (pack 08)
export function boxCounts(m: RotationMap): { box: Box; now: number; last: number }[] {
  return BOXES.map((b) => ({ box: b, now: m.rows.filter((r) => r.corner === b).length, last: m.rows.filter((r) => lastWeekBox(m, r) === b).length }));
}
type Moved = { r: RotationRow; from: Box; to: Box };
export function movedRows(m: RotationMap): Moved[] {
  return m.moved_this_week.map((x) => ({ r: m.rows.find((r) => r.slug === x.slug)!, from: BOXES.find((b) => BOX[b].word === x.from)!, to: BOXES.find((b) => BOX[b].word === x.to)! }))
    .filter((x) => x.r && x.from && x.to).sort((a, b) => (a.r.rank ?? 99) - (b.r.rank ?? 99));
}
export function mayMoveRows(m: RotationMap): { r: RotationRow; from: Box; to: Box }[] {
  return ranked(m).filter((r) => nextBox(r) && boxOf(r.corner)).map((r) => ({ r, from: r.corner as Box, to: nextBox(r)! })).sort((a, b) => (a.r.rank ?? 99) - (b.r.rank ?? 99));
}
/** The industries moving from Behind and slipping towards a gaining box: yours first, then the ones with the most stocks. */
function towardsGaining(m: RotationMap, mine: Set<string>) {
  return mayMoveRows(m).filter((x) => x.from === "behind_slipping" && (x.to === "ahead_gaining" || x.to === "behind_gaining"))
    .sort((a, b) => Number(mine.has(b.r.slug)) - Number(mine.has(a.r.slug)) || b.r.stocks_counted - a.r.stocks_counted);
}
export function rotationHeadline(m: RotationMap, mine: Set<string>): { lead: string; rest: string; line: string } {
  const mv = movedRows(m), up = mv.filter((x) => LEVEL[x.to] > LEVEL[x.from]), down = mv.filter((x) => LEVEL[x.to] < LEVEL[x.from]);
  const jump = [...up].sort((a, b) => LEVEL[b.to] - LEVEL[b.from] - (LEVEL[a.to] - LEVEL[a.from]) || (b.r.rank_change_4w ?? 0) - (a.r.rank_change_4w ?? 0))[0];
  const tg = towardsGaining(m, mine).slice(0, 2).map((x) => short(x.r.name));
  const lead = !mv.length ? "Leadership is steady." : jump?.to === "ahead_gaining" ? "Leadership is shifting." : "The boxes are shifting.";
  const parts = [jump ? `${short(jump.r.name)} ${jump.to === "ahead_gaining" ? "jumped into the top box" : `moved up to ${BOX[jump.to].word}`} this week` : !mv.length ? "No industry changed box this week" : `${plural(mv.length, "industry", "industries")} moved to a weaker box this week`];
  if (tg.length) parts.push(`${list(tg)} may start gaining next week`);
  const k = mayMoveRows(m).length;
  const line = `${plural(mv.length, "industry", "industries")} changed box this week${mv.length ? `: ${up.length} moved to a better box, ${down.length} to a weaker one` : ""}. ${k ? `${k} more may change next week.` : "None looks set to change next week."}`;
  return { lead, rest: " " + parts.join("; ") + ".", line };
}
export function rotationTodayCards(m: RotationMap, mine: Set<string>, pulse: Map<string, GroupRow>): Card[] {
  const out: Card[] = [], rk = ranked(m), mv = movedRows(m);
  const jump = [...mv].filter((x) => LEVEL[x.to] > LEVEL[x.from]).sort((a, b) => LEVEL[b.to] - LEVEL[b.from] - (LEVEL[a.to] - LEVEL[a.from]) || (b.r.rank_change_4w ?? 0) - (a.r.rank_change_4w ?? 0))[0];
  if (jump) {
    const c4 = jump.r.rank_change_4w;
    out.push({ kind: "good", title: `${short(jump.r.name)} made the biggest jump`, text: `From ${BOX[jump.from].word} to ${BOX[jump.to].word} in one week${c4 && c4 > 0 ? `, and up ${c4} places in 4 weeks` : ""} to rank ${jump.r.rank}. It beat the average industry by ${pc(lastMonth(jump.r))} last month.` });
  }
  const top = [...rk].sort((a, b) => a.rank! - b.rank!).slice(0, 3);
  if (top.length === 3) {
    const t = top[0], worst = t.rank_worst_26w, weeks = t.rank_history.filter((p) => p.rank != null).length;
    out.push({ kind: "insight", title: worst != null && worst <= 10 ? "The leaders are steady" : "The leaders", text: `${list(top.map((r) => short(r.name)))} take the top 3 places.${worst != null && worst <= 10 ? ` ${short(t.name)} has stayed in the top ${worst} for all of the last ${weeks} weeks.` : ""}` });
  }
  const mm = mayMoveRows(m);
  if (mm.length) {
    const tg = towardsGaining(m, mine).slice(0, 3);
    const fits = tg.filter((x) => { const g = pulse.get(x.r.slug); return g && (keyOf(g) === "crash" || keyOf(g) === "bouncing" || keyOf(g) === "rising" || isEarly(g)); }).length;
    out.push({ kind: "watch", title: `${plural(mm.length, "industry", "industries")} may change box next week`,
      text: tg.length ? `${list(tg.map((x) => short(x.r.name)))} ${tg.length === 1 ? "is" : "are"} among them, ${tg.length === 1 ? "" : "all "}moving towards gaining.${tg.length && fits * 2 > tg.length ? " It fits what Sector Pulse shows: their stocks have started rising." : ""}` : `Their newest weekly readings already sit in another box. ${list(mm.slice(0, 3).map((x) => short(x.r.name)))} are among them.` });
  }
  const fall = [...rk].filter((r) => (r.rank_change_4w ?? 0) < 0).sort((a, b) => a.rank_change_4w! - b.rank_change_4w! || b.rank! - a.rank!);   // equal falls: the one now lower first
  if (fall[0] && fall[0].rank_change_4w! <= -10) {
    const also = fall.slice(1).filter((r) => r.rank_change_4w! <= -15).map((r) => short(r.name));
    out.push({ kind: "warning", title: `${short(fall[0].name)} is sliding fast`, text: `Down ${-fall[0].rank_change_4w!} places in 4 weeks to rank ${fall[0].rank}.${also.length ? ` ${list(also)} also fell more than 15 places.` : ""}` });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ How your industries compare (pack 08)
export const MEANS_FOR_YOU: Record<Box, { text: string; tone: "good" | "watch" | "info" }> = {
  ahead_gaining: { text: "Leading the market, and the lead is growing.", tone: "good" },
  ahead_slowing: { text: "Still ahead, but it lagged the average lately.", tone: "watch" },
  behind_gaining: { text: "Behind, but catching up lately.", tone: "info" },
  behind_slipping: { text: "Behind, and falling further back.", tone: "watch" },
};
export function meansForYou(r: RotationRow): { text: string; tone: "good" | "watch" | "info" } | null {
  const b = boxOf(r.corner); if (!b) return null;
  const n = nextBox(r), base = MEANS_FOR_YOU[b];
  return { ...base, text: base.text + (n ? ` May move to ${BOX[n].word} next week.` : "") };
}
/** `value`: the money in your shares of each industry (slug to rupees), to say where most of it sits. `shares`: your symbols in each industry. */
export function yourRotationCards(rows: RotationRow[], value: Map<string, number>, shares: Map<string, string[]>, pulse: Map<string, GroupRow>): Card[] {
  const out: Card[] = [];
  if (!rows.length) return out;
  const ag = rows.filter((r) => r.corner === "ahead_gaining").sort((a, b) => (value.get(b.slug) ?? 0) - (value.get(a.slug) ?? 0));
  const total = rows.reduce((s, r) => s + (value.get(r.slug) ?? 0), 0), inAg = ag.reduce((s, r) => s + (value.get(r.slug) ?? 0), 0);
  if (ag.length) out.push({ kind: "good", title: `${ag.length} of your ${rows.length} industries ${ag.length === 1 ? "is" : "are"} ahead and gaining`,
    text: `${ag.map((r) => short(r.name)).join(", ")}.${total > 0 ? inAg * 2 > total ? " Most of your money sits in industries that are leading the market." : " Less than half of your money sits in them." : ""}` });
  const jump = rows.filter((r) => r.corner === "behind_slipping" && nextBox(r) === "ahead_gaining").sort((a, b) => (value.get(b.slug) ?? 0) - (value.get(a.slug) ?? 0))[0];
  if (jump) {
    const g = pulse.get(jump.slug), syms = shares.get(jump.slug) ?? [];
    const rising = g && (keyOf(g) === "crash" || keyOf(g) === "bouncing" || keyOf(g) === "rising" || isEarly(g));
    out.push({ kind: "watch", title: `${short(jump.name)} is behind, but may jump next week`, text: `${syms.length === 1 ? `${syms[0]}'s industry is` : syms.length ? `The industry of ${list(syms)} is` : "It is"} in Behind and slipping, yet its newest reading points to Ahead and gaining.${rising ? ` Sector Pulse shows ${noun(short(jump.name))} stocks rising too.` : ""}` });
  } else {
    const bs = rows.filter((r) => r.corner === "behind_slipping");
    if (bs.length) out.push({ kind: "watch", title: `${bs.length} of your industries ${bs.length === 1 ? "is" : "are"} behind and slipping`, text: `${list(bs.map((r) => short(r.name)))}: behind the average industry over the longer run, and still falling further back.` });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ The map (pack 08)
export function mapCards(m: RotationMap): Card[] {
  const rk = ranked(m), out: Card[] = [];
  const lead = [...rk].filter((r) => (r.change_pts ?? 0) > 0).sort((a, b) => (b.strength_pts ?? -99) - (a.strength_pts ?? -99))[0];
  if (lead) out.push({ kind: "good", title: `${short(lead.name)} is furthest ahead`, text: `${pc(lead.strength_pts)} against the average over the longer run, and still gaining. The clearest leader on the map.` });
  // the length of the climb: from the point of its 8-week path furthest from where it is now
  const path = (r: RotationRow) => { const t = r.tail.slice(-8); const a = t[0], z = t[t.length - 1]; return a && z ? { a, z, d: Math.max(...t.map((p) => Math.hypot(z.strength - p.strength, z.change - p.change))) } : null; };
  const steep = [...rk].map((r) => ({ r, p: path(r) })).filter((x) => x.p && boxOf(x.p.a.corner) && boxOf(x.p.z.corner) && LEVEL[x.p.z.corner as Box] > LEVEL[x.p.a.corner as Box]).sort((a, b) => (LEVEL[b.p!.z.corner as Box] - LEVEL[b.p!.a.corner as Box]) - (LEVEL[a.p!.z.corner as Box] - LEVEL[a.p!.a.corner as Box]) || b.p!.d - a.p!.d)[0];   // the biggest jump in box first, then the longest path
  if (steep) out.push({ kind: "insight", title: `${short(steep.r.name)} took the steepest path`, text: `Its 8-week path climbs from the ${CORNER_AT[steep.p!.a.corner as Box]} box to the ${CORNER_AT[steep.p!.z.corner as Box]} one. Turn on the paths to see it.` });
  const near = rk.filter((r) => Math.abs(r.strength_pts ?? 99) < 5 && Math.abs(r.change_pts ?? 99) < 3).length;   // within 5 points across and 3 up or down of the cross
  if (near >= 5) out.push({ kind: "watch", title: "Many industries sit near the middle", text: "Dots close to the cross can change box with a small move. Treat their box as provisional." });
  return out;
}

// ------------------------------------------------------------------------------------------------ Who is ahead (pack 08)
export const turned = (r: RotationRow) => { const s = sixMonths(r), l = lastMonth(r); return s != null && l != null && ((s > 0 && l <= -0.5) || (s < 0 && l >= 0.5)); };
export function aheadCards(m: RotationMap): Card[] {
  const rows = m.rows.filter((r) => sixMonths(r) != null && lastMonth(r) != null), out: Card[] = [];
  const slipped = rows.filter((r) => sixMonths(r)! > 0 && turned(r)), gained = rows.filter((r) => sixMonths(r)! < 0 && turned(r));
  if (slipped.length) out.push({ kind: "watch", title: `${plural(slipped.length, "leader")} slipped last month`, text: "Ahead of the average industry over 6 months, but behind it over the last month." });
  if (gained.length) out.push({ kind: "good", title: `${plural(gained.length, "laggard")} gained last month`, text: "Behind over 6 months, but ahead of the average industry over the last month." });
  const rk = ranked(m).filter((r) => lastMonth(r) != null);
  const best = [...rk].sort((a, b) => lastMonth(b)! - lastMonth(a)! || a.rank! - b.rank!)[0], worst = [...rk].sort((a, b) => lastMonth(a)! - lastMonth(b)! || a.rank! - b.rank!)[0];
  if (best && worst) out.push({ kind: "insight", title: `Biggest move last month: ${short(best.name)}`, text: `${pt(lastMonth(best))} points against the average industry; the weakest was ${short(worst.name)} at ${pt(lastMonth(worst))}.` });
  return out;
}

// ------------------------------------------------------------------------------------------------ Biggest rank moves in 4 weeks (pack 08)
export function rankMoveCards(m: RotationMap): Card[] {
  const out: Card[] = [], half = Math.ceil((ranked(m).length || 37) / 2);
  const up = m.climbers_4w.map((x) => ({ x, r: m.rows.find((r) => r.slug === x.slug)! })).filter((y) => y.r);
  const down = m.fallers_4w.map((x) => ({ x, r: m.rows.find((r) => r.slug === x.slug)! })).filter((y) => y.r);
  const low = up.map((y) => ({ n: short(y.r.name), was: rankAgo(y.r, 4) })).filter((y) => y.was != null && y.was > half).sort((a, b) => b.was! - a.was!);
  if (low.length * 2 >= up.length && low.length) out.push({ kind: "good", title: "The climbers were near the bottom", text: `A month ago ${list(low.map((y, i) => `${y.n} ${i ? "" : "was "}${ordinal(y.was!)}`))}. Money is moving into industries that had been left behind.` });
  const fav = down.map((y) => ({ n: short(y.r.name), was: rankAgo(y.r, 4), now: y.r.rank })).filter((y) => y.was != null && y.was <= 12).sort((a, b) => a.was! - b.was!);
  if (fav.length >= 2) out.push({ kind: "warning", title: "The fallers were recent favourites", text: `A month ago ${list(fav.map((y, i) => `${y.n} ${i ? "" : "was "}${ordinal(y.was!)}`))}.${fav.every((y) => (y.now ?? 0) > half) ? ` ${fav.length === 2 ? "Both" : `All ${["", "", "", "three", "four", "five"][fav.length] ?? fav.length}`} are now in the bottom half.` : ""}` });
  out.push({ kind: "insight", title: "Why this matters", text: "A big climb can be the start of a new lead, or a short catch-up. The box (above) and Sector Pulse help tell the two apart." });
  return out;
}

// ------------------------------------------------------------------------------------------------ Full table (pack 09)
export function fullCards(m: RotationMap): Card[] {
  const out: Card[] = [], ag = m.rows.filter((r) => r.corner === "ahead_gaining" && r.rank != null);
  const broad = ag.filter((r) => r.breadth === "broad"), few = ag.filter((r) => r.breadth === "narrow");
  if (ag.length) out.push({ kind: broad.length * 2 > ag.length ? "good" : "watch", title: broad.length * 2 > ag.length ? "Most leaders are broad" : "Few leaders are broad",
    text: `In ${broad.length} of the ${ag.length} industries ahead and gaining, most stocks are taking part. A lead that many stocks share is sturdier.` });
  if (few.length) out.push({ kind: "watch", title: "Some leads rest on a few stocks", text: `${few.map((r) => short(r.name)).join(", ")}: ahead and gaining, but only a few of their stocks are in an uptrend. One or two big shares may be carrying the industry.` });
  const long = m.rows.filter((r) => r.corner === "behind_slipping" && r.weeks_in_corner >= 15).sort((a, b) => a.weeks_in_corner - b.weeks_in_corner);
  if (long.length) out.push({ kind: "warning", title: "Long stays at the bottom", text: `${list(long.map((r) => short(r.name)))} ${long.length === 1 ? "has" : "have"} been behind and slipping for ${list(long.map((r) => String(r.weeks_in_corner)))} weeks. A long stay shows a steady trend, not a quick bounce.` });
  return out;
}
export type RotFilter = "all" | Box | "next" | "yours";
export const inRotFilter = (r: RotationRow, f: RotFilter, mine: Set<string>) => f === "all" || (f === "next" ? !!nextBox(r) : f === "yours" ? mine.has(r.slug) : r.corner === f);
/** The rows of the ranking, grouped by box, strongest rank first (an unranked industry last in its box). */
export const byBox = (rows: RotationRow[]) => BOXES.map((b) => ({ box: b, rows: rows.filter((r) => r.corner === b).sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999)) })).filter((g) => g.rows.length);
/** The sentence when an industry is opened (pack 09). */
export function rowSummary(r: RotationRow): string {
  if (r.rank == null) return `${short(r.name)} is too new for a rank. Against the average industry it is ${pc(sixMonths(r))} over 6 months and ${pc(lastMonth(r))} over the last month.`;
  const b = breadthWord(r).w;
  return `${short(r.name)} is rank ${r.rank} of ${r.ranked}, in ${word(r.corner)} for ${plural(r.weeks_in_corner, "week")}. Against the average industry it is ${pc(sixMonths(r))} over 6 months and ${pc(lastMonth(r))} over the last month.${b === "Most" ? " Most of its stocks are taking part in the move." : b === "Some" ? " Some of its stocks are taking part in the move." : b === "Few" ? " Only a few of its stocks are taking part in the move." : ""}`;
}
export function rotationCsv(rows: RotationRow[]): string {
  const head = ["Rank", "Change 1 week", "Change 4 weeks", "Industry", "Box", "May move to", "Weeks in box", "1 month vs average %", "3 months vs average %", "6 months vs average %", "Taking part", "Share above 50-day average %", "Highest rank 26 weeks", "Lowest rank 26 weeks"];
  const q = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head, ...rows.map((r) => [r.rank ?? "", r.rank_change_1w ?? "", r.rank_change_4w ?? "", r.name, word(r.corner), nextBox(r) ? BOX[nextBox(r)!].word : "", r.weeks_in_corner, lastMonth(r) ?? "", threeMonths(r) ?? "", sixMonths(r) ?? "",
    breadthWord(r).w ?? "", r.breadth_above_50 ?? "", r.rank_best_26w ?? "", r.rank_worst_26w ?? ""])].map((l) => l.map(q).join(",")).join("\n");
}
/** Six months of ranks (pack 09): its cards. */
export function sixMonthRankCards(m: RotationMap): Card[] {
  const rk = ranked(m), out: Card[] = [];
  const span = rk.map((r) => ({ r, first: r.rank_history.find((p) => p.rank != null)?.rank ?? null })).filter((x) => x.first != null);
  const climb = [...span].sort((a, b) => (b.first! - b.r.rank!) - (a.first! - a.r.rank!))[0], fall = [...span].sort((a, b) => (a.first! - a.r.rank!) - (b.first! - b.r.rank!))[0];
  const weeks = m.rank_weeks.length;
  if (climb && climb.first! > climb.r.rank!) out.push({ kind: "good", title: `Biggest climb: ${short(climb.r.name)}`, text: `From rank ${climb.first} ${weeks} weeks ago to rank ${climb.r.rank} now.` });
  const top5 = rk.filter((r) => r.rank! <= 5).map((r) => ({ r, n: r.rank_history.filter((p) => p.rank != null && p.rank <= 5).length })).sort((a, b) => b.n - a.n || a.r.rank! - b.r.rank!)[0];
  if (top5) out.push({ kind: "insight", title: `Steadiest near the top: ${short(top5.r.name)}`, text: `In the top 5 for ${top5.n} of the last ${weeks} weeks.` });
  if (fall && fall.first! < fall.r.rank!) out.push({ kind: "warning", title: `Biggest fall: ${short(fall.r.name)}`, text: `From rank ${fall.first} ${weeks} weeks ago to rank ${fall.r.rank} now.` });
  return out;
}
export function climbers26(m: RotationMap): { up: { r: RotationRow; from: number; d: number }[]; down: { r: RotationRow; from: number; d: number }[] } {
  const x = ranked(m).map((r) => { const f = r.rank_history.find((p) => p.rank != null)?.rank ?? null; return f == null ? null : { r, from: f, d: f - r.rank! }; }).filter((v): v is { r: RotationRow; from: number; d: number } => !!v);
  return { up: x.filter((v) => v.d > 0).sort((a, b) => b.d - a.d).slice(0, 5), down: x.filter((v) => v.d < 0).sort((a, b) => a.d - b.d).slice(0, 5) };
}
/** How the ranking changed over 12 weeks (pack 09): its three cards. */
export function twelveWeekCards(m: RotationMap): Card[] {
  const rk = ranked(m), out: Card[] = [];
  const last = (r: RotationRow, n: number) => r.rank_history.slice(-n).map((p) => p.rank);
  const fast = rk.map((r) => {
    const h = last(r, 12), now = r.rank!; let max = -1, at = -1;
    h.forEach((v, i) => { if (v != null && v > max) { max = v; at = i; } else if (v != null && v === max && at === i - 1) { /* the earliest week of a run at the low point counts */ } });
    return { r, from: max, weeks: h.length - 1 - at, d: max - now };
  }).sort((a, b) => b.d - a.d || a.weeks - b.weeks)[0];
  const steady = rk.map((r) => { const h = last(r, 12); return { r, from: h[0] ?? null, d: (h[0] ?? r.rank!) - r.rank! }; }).filter((x) => x.r.slug !== fast?.r.slug && x.d > 0).sort((a, b) => b.d - a.d)[0];
  const n = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
  if (fast && fast.d > 0) out.push({ kind: "good", title: `${short(fast.r.name)}: from ${fast.from} to ${fast.r.rank} in ${n[fast.weeks] ?? fast.weeks} weeks`,
    text: `The fastest climb on the board.${steady ? ` ${short(steady.r.name)} climbed more steadily, from ${steady.from} to ${steady.r.rank} over 12 weeks.` : ""}` });
  const lead = rk.find((r) => r.rank === 1);
  if (lead && lead.rank_worst_26w != null && lead.rank_worst_26w <= 10) out.push({ kind: "insight", title: `${short(lead.name)} never left the top ${lead.rank_worst_26w}`, text: `The steadiest leader: a dark row from end to end. It has been in the top ${lead.rank_worst_26w} for ${lead.rank_history.filter((p) => p.rank != null).length} weeks.` });
  const faded = rk.map((r) => ({ r, was: rankAgo(r, 4), d: r.rank_change_4w ?? 0 })).filter((x) => x.was != null && x.was <= 12 && x.d < 0).sort((a, b) => a.d - b.d || a.was! - b.was!).slice(0, 2).sort((a, b) => a.was! - b.was!);
  if (faded.length === 2) out.push({ kind: "warning", title: `${short(faded[0].r.name)} and ${short(faded[1].r.name)} faded`, text: `${short(faded[0].r.name)} went from ${faded[0].was} to ${faded[0].r.rank} and ${short(faded[1].r.name)} from ${faded[1].was} to ${faded[1].r.rank} in four weeks. Rows that turn light this fast show money leaving.` });
  return out;
}
