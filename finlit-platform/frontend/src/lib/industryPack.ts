// An industry page (/sectors/:slug) as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/07, Finance): the sentences, tiles,
// cards and the year's story, worked out from the server's answers (GET /api/sectors/:slug, /api/sectors/:slug/year, /api/rotation/:slug). Every figure is the
// server's; this file only chooses, orders and words them. Describes how an industry's stocks have moved; never advice.
import type { IndustryPage, RankedStock } from "./sectors";
import type { IndustryYear } from "./sectorExtra";
import type { RotationCard } from "./rotation";
import type { StateKey } from "./sectorHistory";
import { BOX, WORD, keyOf, short, type Card } from "./pulsePack";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const ORD = ["", "", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
/** "5 Nov" */
export const dm = (d: string) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;
const mon = (d: string) => MON[+d.slice(5, 7) - 1];
const days = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const lower = (n: string) => (/^[A-Z]{2,}/.test(n) ? n : n.toLowerCase());
/** Part of a month: "early July", "mid-July", "late July". */
const partOf = (d: string) => { const n = +d.slice(8, 10), m = MONTH[+d.slice(5, 7) - 1]; return n <= 10 ? `early ${m}` : n <= 20 ? `mid-${m}` : `late ${m}`; };
const isBounce = (k: StateKey | null | undefined) => k === "crash" || k === "bouncing";

// ------------------------------------------------------------------------------------------------ the header and "What is happening"
export function happening(p: IndustryPage): { lead: string; rest: string; watch: string } {
  const k = keyOf(p), n = short(p.name), lc = lower(n), since = p.since ? dm(p.since) : null;
  switch (k) {
    case "crash": return { lead: `${n} bounced back after a crash${since ? ` on ${since}` : ""}.`, rest: ` In the sell-off almost every ${lc} stock kept falling; then most of them turned up together within days.`, watch: "Watch whether the bounce holds for a few weeks and more stocks climb above their longer trend." };
    case "bouncing": return { lead: `${n} bounced back${since ? ` on ${since}` : ""}.`, rest: ` After a sell-off, most ${lc} stocks turned up together within days.`, watch: "Watch whether the bounce holds for a few weeks and more stocks climb above their longer trend." };
    case "rising": return { lead: `${n} is rising together.`, rest: ` Most ${lc} stocks are above their short, medium and longer trend.`, watch: "Watch whether the rise keeps its breadth, or fewer stocks keep rising." };
    case "losing": return { lead: `${n} is losing steam.`, rest: ` A bounce or rise has lost support: fewer ${lc} stocks are still rising.`, watch: "Watch whether it is sold off again, or most of its stocks turn up together." };
    case "sold_off": return { lead: `${n} is sold off.`, rest: ` Most ${lc} stocks have fallen below their trend, and no broad bounce has followed yet.`, watch: "Watch for most of its stocks turning up together within a few days: that would be a bounce." };
    default: return { lead: `${n} has no clear signal.`, rest: ` Its stocks are split between rising and falling.`, watch: "Watch for most of its stocks moving the same way." };
  }
}
const of = (pct: number | null | undefined, n: number) => (pct == null ? null : Math.round((pct * n) / 100));
export function tiles(p: IndustryPage): { k: string; help: string; v: string; sub: string }[] {
  const n = p.stocks_counted, b = p.breadth, lc = lower(short(p.name));
  const s = of(b.above_9, n), m = of(b.above_20, n), l = of(b.above_50, n);
  return [
    { k: "Stocks rising, short trend", help: "How many of the industry's counted stocks are above their short trend: their average price of about the last two weeks.", v: s == null ? "–" : `${s} of ${n}`, sub: "above their short trend" },
    { k: "Medium trend", help: "How many are above their medium trend, about the last month. This is the main reading: the industry's state is read from it.", v: m == null ? "–" : `${m} of ${n}`, sub: "the main reading" },
    { k: "Longer trend", help: "How many are above their longer trend, about the last two and a half months. A bounce turns into an uptrend when most stocks get here.", v: l == null ? "–" : `${l} of ${n}`, sub: l != null && l * 2 > n ? "most are there" : "not there yet" },
    { k: "Below its 1-year high", help: "How far the industry's typical stock (the equal-weighted industry index) is below its highest close of the last year.", v: p.index_vs_52w_high == null ? "–" : `${Math.abs(p.index_vs_52w_high).toFixed(1)}%`, sub: `the typical ${lc} stock` },
  ];
}
/** The earlier bounces of the year (not the one going on now). */
const earlier = (y: IndustryYear | undefined) => { const b = y?.bounces ?? []; const last = y?.dates[y.dates.length - 1]; return b.filter((x) => x.to !== last); };
export function topCards(p: IndustryPage, y: IndustryYear | undefined, rot: RotationCard | undefined): Card[] {
  const out: Card[] = [], k = keyOf(p), n = p.stocks_counted, s = of(p.breadth.above_9, n), name = short(p.name);
  if (isBounce(k) && s != null) out.push(s * 100 >= n * 80
    ? { kind: "good", title: "The bounce is broad", text: `${s} of the ${n} counted stocks are above their short trend: almost the whole industry turned up.` }
    : { kind: "insight", title: "The bounce", text: `${s} of the ${n} counted stocks are above their short trend.` });
  const e = earlier(y);
  if (isBounce(k) && e.length) {
    const months = [...new Set(e.map((x) => MONTH[+x.from.slice(5, 7) - 1]))];
    const wk = Math.max(...e.map((x) => Math.ceil(days(x.from, x.to) / 7)));
    out.push({ kind: "watch", title: e.length === 1 ? "An earlier bounce faded" : "Earlier bounces faded", text: `${name} bounced in ${list(months)} too. ${e.length === 1 ? "The rise" : e.length === 2 ? "Both times the rise" : "Each time the rise"} lost support within ${NUM[wk] ?? wk} weeks.` });
  }
  if (rot && rot.rank != null && (rot.corner === "behind_slipping" || rot.corner === "behind_gaining")) out.push({ kind: "warning", title: "Still behind other industries", text: `Over the longer run ${name} is behind the average industry and ranks ${rot.rank} of ${rot.ranked}.${isBounce(k) ? " The bounce has not changed that yet." : ""}` });
  else if (rot && rot.rank != null && (rot.corner === "ahead_gaining" || rot.corner === "ahead_slowing")) out.push({ kind: "good", title: "Ahead of other industries", text: `Over the longer run ${name} is ahead of the average industry and ranks ${rot.rank} of ${rot.ranked}.` });
  return out;
}

// ------------------------------------------------------------------------------------------------ Where it is in the cycle
export const CYCLE_STEPS: StateKey[] = ["sold_off", "bouncing", "rising", "losing"];
/** Each step's note: "· FINANCE IS HERE", "· next in the cycle", "· if the bounce breaks". */
export function cycleNotes(p: IndustryPage): Record<string, string> {
  const k = keyOf(p), here = k === "crash" ? "bouncing" : k, i = CYCLE_STEPS.indexOf(here as StateKey), name = short(p.name).toUpperCase();
  const out: Record<string, string> = {};
  if (i < 0) return out;
  out[here] = `${name} IS HERE`;
  out[CYCLE_STEPS[(i + 1) % 4]] = "next in the cycle";
  if (here === "bouncing") out.losing = "if the bounce breaks";
  if (here === "rising") out.sold_off = out.sold_off ?? "";
  return out;
}

// ------------------------------------------------------------------------------------------------ A year of <industry>: the story
type Run = { k: StateKey; a: number; b: number };
function runs(y: IndustryYear): Run[] {
  const out: Run[] = [];
  y.states.forEach((s, i) => { const k = (s ?? "no_signal") as StateKey; const r = out[out.length - 1]; if (r && r.k === k) r.b = i; else out.push({ k, a: i, b: i }); });
  return out;
}
export type Moment = { n: number; label: string; text: string; i: number };
const LONG = 15;   // a sell-off or a slide of three weeks of trading or more is a moment of its own
/** The year told in order, the pack's way: each long sell-off or slide, and each bounce with what became of it. `i` is the day its number sits on in the chart. */
export function story(y: IndustryYear): Moment[] {
  const R = runs(y), d = y.dates, r = y.rising, last = d.length - 1, out: Moment[] = [];
  const val = (i: number) => r[i] ?? 0;
  const argmin = (a: number, b: number) => { let m = a; for (let i = a; i <= b; i++) if (val(i) < val(m)) m = i; return m; };
  const argmax = (a: number, b: number) => { let m = a; for (let i = a; i <= b; i++) if (val(i) > val(m)) m = i; return m; };
  const lowAll = argmin(0, last);
  let bounces = 0, soldOffs = 0, year = true;
  const lab = (a: number, b: number) => { const end = +d[b].slice(8, 10) < 10 && b > a + 10 ? MON[(+d[b].slice(5, 7) + 10) % 12] : mon(d[b]); const s = mon(d[a]) === end ? mon(d[a]) : `${mon(d[a])} to ${end}`; const t = year ? `${s} ${d[a].slice(0, 4)}` : s; year = false; return t; };
  for (let j = 0; j < R.length; j++) {
    const x = R[j], len = x.b - x.a + 1;
    if (isBounce(x.k)) {
      bounces++;
      const nth = bounces === 1 ? "A bounce" : `A ${ORD[bounces] ?? bounces + "th"} bounce`;
      if (x.b === last) {   // going on now
        out.push({ n: 0, label: dm(d[x.a]), i: x.a, text: `${nth}${x.k === "crash" ? " after a crash" : ""}: ${Math.round(val(x.a))} in 100 were rising that day, and ${Math.round(val(last))} at the latest close (${dm(d[last])}).` });
        year = false; continue;
      }
      // what became of it: the runs after it, up to the next long sell-off or the next bounce
      const after: Run[] = [];
      let q = j + 1;
      for (; q < R.length; q++) { const z = R[q]; if (isBounce(z.k) || (z.k === "sold_off" && z.b - z.a + 1 >= LONG)) break; if (z.b - z.a + 1 >= 5 && (z.k === "sold_off" || z.k === "losing") && (!after.length || after[after.length - 1].k !== z.k)) after.push(z); }
      const tail = after.map((z, t) => z.k === "sold_off" ? `${t ? "then was" : "was"} sold off again in ${partOf(d[z.a])}` : `${t ? "then " : ""}lost steam${t ? "" : ` in ${MONTH[+d[z.a].slice(5, 7) - 1]}`}`);
      if (x.k === "crash") {
        const pk = argmax(x.a, x.b);
        out.push({ n: 0, label: lab(x.a, x.a), i: pk, text: `${nth} after a crash: by ${dm(d[pk])}, ${Math.round(val(pk))} in 100 were rising.${tail.length ? ` It ${tail.join(", ")}.` : ""}` });
      } else {
        out.push({ n: 0, label: lab(x.a, x.a), i: argmax(x.a, x.b), text: `${nth} on ${dm(d[x.a])}${tail.length ? `; it ${tail.join(", ")}` : ""}.` });
      }
      j = q - 1;
      continue;
    }
    if (len < LONG || (x.k !== "sold_off" && x.k !== "losing")) continue;
    if (x.k === "losing") {
      const lo = argmin(x.a, x.b), prevRise = R.slice(Math.max(0, j - 3), j).some((z) => z.k === "rising");
      const frac = val(lo) < 100 / 3 ? "fewer than 1 in 3" : val(lo) < 50 ? "fewer than half the" : "fewer";
      out.push({ n: 0, label: lab(x.a, x.b), i: lo, text: `${prevRise ? "A short rise lost steam" : "It lost steam"}: within a few weeks ${frac} stocks were rising.` });
      continue;
    }
    soldOffs++;
    const lo = argmin(x.a, x.b), cal = days(d[x.a], d[x.b]), months = Math.round(cal / 30.4);
    const head = months >= 3 ? `${cap(NUM[months] ?? String(months))} months sold off.` : `Sold off${soldOffs > 1 ? " again" : ""} for about ${Math.max(1, Math.round(cal / 7))} weeks.`;
    const deep = lo === lowAll && val(lo) <= 5 ? ` On ${dm(d[lo])} only ${Math.round(val(lo))} stock${Math.round(val(lo)) === 1 ? "" : "s"} in 100 ${Math.round(val(lo)) === 1 ? "was" : "were"} rising: almost the whole industry was falling.` : "";
    out.push({ n: 0, label: lab(x.a, x.b), i: lo, text: head + deep });
  }
  return out.map((m, i) => ({ ...m, n: i + 1 }));
}
/** The cards under the year's chart. */
export function yearCards(p: IndustryPage, y: IndustryYear): { top: Card[]; bottom: Card[] } {
  const k = keyOf(p), name = short(p.name), e = earlier(y), all = y.bounces.length, top: Card[] = [], bottom: Card[] = [];
  if (all) {
    const R = runs(y);
    const faded = e.map((b) => { const i = y.dates.indexOf(b.from); const r = R.findIndex((z) => z.a <= i && i <= z.b); const nx = R.slice(r + 1).find((z) => (z.k === "sold_off" || z.k === "losing") && z.b - z.a + 1 >= 5); return nx ? Math.round(days(b.from, y.dates[nx.a]) / 7) : null; }).filter((w): w is number => w != null);
    const lo = Math.min(...faded), hi = Math.max(...faded);
    top.push({ kind: "insight", title: "The pattern to notice", text: `${name} has bounced ${NUM[all] === "one" ? "once" : `${NUM[all] ?? all} times`} this year.${faded.length ? ` ${faded.length === 1 ? "The first bounce" : `The first ${NUM[faded.length]} bounces`} faded within ${lo === hi ? `${NUM[lo] ?? lo}` : `${NUM[lo] ?? lo} to ${NUM[hi] ?? hi}`} weeks${isBounce(k) ? ", so this one is still an early sign" : ""}.` : ""}` });
  }
  top.push(isBounce(k) ? { kind: "good", title: "What would confirm it", text: "The line staying above half for several weeks, and more stocks climbing above their longer trend too." }
    : k === "sold_off" ? { kind: "good", title: "What a bounce would look like", text: "Most of its stocks turning up together within a few days: the line jumping well above half." }
    : k === "rising" ? { kind: "watch", title: "What would show it fading", text: "Fewer stocks above their medium trend: the line slipping back towards half." }
    : { kind: "watch", title: "What to watch", text: "Whether the line falls back towards the bottom, or most stocks turn up together again." });
  const total = y.dates.length, d = y.days_in_state, keys = Object.keys(d) as StateKey[];
  const most = keys.sort((a, b) => d[b] - d[a])[0], least = (["rising", "bouncing", "crash"] as StateKey[]).filter((x) => x !== most).sort((a, b) => d[a] - d[b])[0];
  if (most) bottom.push({ kind: most === "sold_off" || most === "losing" ? "warning" : "insight", title: `${WORD[most]} on ${d[most]} of ${total} days`, text: `${name} spent more of the year ${WORD[most].toLowerCase()} than in any other state; it was ${WORD[least].toLowerCase()} on only ${d[least]} ${d[least] === 1 ? "day" : "days"}.` });
  if (e.length) { const avg = e.reduce((s, b) => s + b.days, 0) / e.length; bottom.push({ kind: "insight", title: avg <= 25 ? "Bounces have been short" : "How long bounces lasted", text: `${e.length === 1 ? "The earlier bounce" : e.length === 2 ? "Both earlier bounces" : "The earlier bounces"} ran for about ${avg <= 25 ? "a month" : `${Math.round(avg / 5)} weeks`} before the industry lost steam or was sold off again.` }); }
  return { top, bottom };
}

// ------------------------------------------------------------------------------------------------ Against other industries
export function rotationTiles(r: RotationCard, counted: number): {   // `counted`: the industry page's counted stocks (the rotation answer does not carry it)
 k: string; help: string; v: string; sub: string }[] {
  const s = r.strength_pts, c = r.change_pts, b = r.breadth === "broad" ? "Most" : r.breadth === "between" ? "Some" : r.breadth === "narrow" ? "Few" : "–";
  const up = r.breadth_above_50 == null ? null : Math.round((r.breadth_above_50 * counted) / 100);
  const mv = (n: number | null | undefined, w: string) => (n == null ? null : n > 0 ? `▲${n} ${w}` : n < 0 ? `▼${-n} ${w}` : `same ${w}`);
  return [
    { k: "Rank", help: "Its place among all ranked industries this week, 1 the strongest.", v: r.rank == null ? "Not ranked yet" : `${r.rank} of ${r.ranked}`, sub: [mv(r.rank_change_1w, "on the week"), mv(r.rank_change_4w, "in 4 weeks")].filter(Boolean).join(" · ") },
    { k: "Longer run vs average", help: "How many percentage points better (+) or worse (−) the industry did than the average industry over the last several months.", v: s == null ? "–" : `${s >= 0 ? "+" : "−"}${Math.abs(s).toFixed(1)}`, sub: s == null ? "" : `points ${s >= 0 ? "ahead of" : "behind"} the average industry` },
    { k: "Lately vs average", help: "The same over the last month.", v: c == null ? "–" : `${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(1)}`, sub: c == null ? "" : `points ${c >= 0 ? "ahead" : "behind"} last month` },
    { k: "Stocks taking part", help: "How many of its stocks are above their longer (50-day) average: Most, Some or Few. A lead most stocks share is broad.", v: b, sub: up == null ? "" : `${up} of ${counted} in an uptrend` },
  ];
}
export function twoPages(p: IndustryPage, r: RotationCard): Card {
  const k = keyOf(p), name = short(p.name), behind = r.corner === "behind_slipping" || r.corner === "behind_gaining";
  const pulse = isBounce(k) ? `Sector Pulse says ${name} stocks have just bounced` : k === "rising" ? `Sector Pulse says ${name} stocks are rising together` : k === "sold_off" ? `Sector Pulse says ${name} stocks are sold off` : k === "losing" ? `Sector Pulse says ${name} stocks are losing steam` : `Sector Pulse shows no clear signal for ${name} stocks`;
  const rot = `Sector Rotation says the industry is ${behind ? "still behind" : "ahead"}`;
  const end = isBounce(k) && behind ? "A bounce that also lifts its rank would be the sign of a real turn." : !isBounce(k) && k !== "rising" && !behind ? "A lead that its stocks stop sharing can fade; watch both pages." : "When both pages point the same way, the picture is clearer.";
  return { kind: "insight", title: "Reading the two pages together", text: `${pulse}; ${rot}. ${end}` };
}
export const boxWord = (r: RotationCard) => (r.corner && r.corner !== "middle" ? BOX[r.corner].word : "Near the average");

// ------------------------------------------------------------------------------------------------ the counted stocks
export function stockCards(stocks: RankedStock[], p: IndustryPage): Card[] {
  const out: Card[] = [], s = stocks.filter((x) => x.return_6m_pct != null), name = short(p.name);
  const top = s.slice(0, 3);
  if (top.length === 3) {
    const lo = Math.round(Math.min(...top.map((x) => x.return_6m_pct!))), hi = Math.round(Math.max(...top.map((x) => x.return_6m_pct!)));
    out.push({ kind: "good", title: lo > 0 ? "The leaders of the last 6 months" : "The strongest of the last 6 months", text: `${list(top.map((x) => x.symbol))} are ${lo >= 0 ? "up" : "changed"} ${lo}% to ${hi}% in 6 months.` });
  }
  const fl = stocks.filter((x) => x.leader_flag);
  if (fl.length) out.push({ kind: "insight", title: `${fl.length} standout ${fl.length === 1 ? "stock" : "stocks"}`, text: `${list(fl.slice(0, 3).map((x) => x.symbol))}${fl.length > 3 ? ` and ${fl.length - 3} more` : ""} made new 1-year highs while the industry is still ${p.index_vs_52w_high == null ? "below" : `${Math.round(Math.abs(p.index_vs_52w_high))}% below`} its own high.` });
  const low = s.slice(-5);
  if (s.length >= 15 && low.length === 5 && low.every((x) => x.return_6m_pct! < 0)) {
    const a = Math.round(Math.abs(Math.max(...low.map((x) => x.return_6m_pct!)))), b = Math.round(Math.abs(Math.min(...low.map((x) => x.return_6m_pct!))));
    out.push({ kind: "warning", title: "A wide spread", text: `The weakest five fell ${a}% to ${b}%: ${isBounce(keyOf(p)) ? `being in a bouncing industry does not lift every stock` : `an industry's reading does not describe every stock in it`}.` });
  }
  void name;
  return out;
}
export const tierWord = (s: RankedStock) => (s.leader_flag ? (/full|strong/i.test(s.leader_flag.tier) ? "Strong" : "Early") : null);
