// The dashboard as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/04): the sentences and cards the blocks add, worked out
// from what the page already loads (quotes, results, peer labels, the market snapshot, macro, FII/DII flows, Prism, the Sector Pulse board). Every figure comes from the
// server; this file only chooses, counts and words. Describes the market and the member's stocks; never advice.
import type { Card } from "./pulsePack";
import type { Flows } from "./flows";
import type { Board } from "./sectors";

const MINUS = "−";
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const sp = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(d)}%`;
const n0 = (v: number) => v.toLocaleString("en-IN");
const dm = (d: string) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;
/** The weekday of a date (YYYY-MM-DD). */
export const weekdayOf = (d: string) => WEEKDAY[new Date(d + "T00:00:00Z").getUTCDay()];

// ------------------------------------------------------------------------------------------------ the greeting line
/** "Market opens at 9:15 · Figures from Friday's close" (pack 04), from the time in India and the date of the latest close. */
export function marketWhen(now: Date, open: boolean | null, asOf: string | null): string[] {
  if (open == null) return [];
  if (open) return ["Market open"];
  const ist = new Date(now.getTime() + 330 * 60_000), day = ist.getUTCDay(), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes(), today = ist.toISOString().slice(0, 10);
  const out = [day === 0 || day === 6 ? "Market opens Monday at 9:15" : mins < 9 * 60 + 15 ? "Market opens at 9:15" : day === 5 ? "Market closed until Monday" : "Market closed"];
  if (asOf) out.push(asOf.slice(0, 10) === today ? "Figures from today's close" : `Figures from ${weekdayOf(asOf.slice(0, 10))}'s close`);
  return out;
}
/** The word for the day of the latest move: "Today" when it is today in India, else its weekday ("Friday"). */
export function dayWord(now: Date, asOf: string | null): string {
  if (!asOf) return "Today";
  const today = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return asOf.slice(0, 10) === today ? "Today" : weekdayOf(asOf.slice(0, 10));
}

// ------------------------------------------------------------------------------------------------ Your stocks today: the three cards
export type MyStock = { symbol: string; chg: number | null; size: "Large" | "Mid" | "Small" | null; profit: number | null; profitText: string | null; reported: boolean; peer: "leader" | "laggard" | "inline" | "unranked" | null };
const SIZE_WORD = { Large: "large", Mid: "mid-sized", Small: "small" } as const;
export function myStockCards(items: MyStock[], day: string, quarterEnd: string | null): Card[] {
  const out: Card[] = [], on = day === "Today" ? "today" : `on ${day}`;
  const fell = items.filter((s) => s.chg != null && s.chg <= -10).sort((a, b) => a.chg! - b.chg!), rose = items.filter((s) => s.chg != null && s.chg >= 10).sort((a, b) => b.chg! - a.chg!);
  if (fell.length) {
    const sizes = [...new Set(fell.map((s) => s.size))], same = sizes.length === 1 && sizes[0] ? SIZE_WORD[sizes[0]] : null;
    const who = fell.length === 1 ? "It is" : fell.length === 2 ? "Both are" : `All ${NUM[fell.length] ?? fell.length} are`;
    out.push({ kind: "warning", title: `${fell.length === 1 ? "One" : cap(NUM[fell.length] ?? String(fell.length))} of your stocks fell 10% or more ${on}`.replace(/^(\w)/, (c) => c.toUpperCase()),
      text: `${list(fell.map((s) => `${s.symbol} ${sp(s.chg!)}`))}.${same ? ` ${who} ${fell.length === 1 ? `a ${same} company` : `${same} companies`}.` : ""} Check News & filings before reacting.` });
  } else if (rose.length) {
    out.push({ kind: "good", title: `${cap(NUM[rose.length] ?? String(rose.length))} of your stocks rose 10% or more ${on}`, text: `${list(rose.map((s) => `${s.symbol} ${sp(s.chg!)}`))}. Check News & filings for what moved ${rose.length === 1 ? "it" : "them"}.` });
  }
  const rep = items.filter((s) => s.reported), up = rep.filter((s) => (s.profit != null && s.profit > 0) || s.profitText === "Turned profit" || s.profitText === "Loss narrowed");
  if (rep.length) {
    const down = rep.filter((s) => !up.includes(s)), q = quarterEnd ? `${MONTH[+quarterEnd.slice(5, 7) - 1]}-quarter profit` : "Latest-quarter profit";
    const named = down.slice(0, 4).map((s) => `${s.symbol} (${s.profit != null ? sp(s.profit) : (s.profitText ?? "").toLowerCase()})`);
    out.push(up.length * 2 >= rep.length
      ? { kind: "good", title: `Profit grew at ${up.length} of the ${rep.length} that reported`, text: down.length ? `${q} was higher than a year ago everywhere except ${list(named)}${down.length > 4 ? ` and ${down.length - 4} more` : ""}.` : `${q} was higher than a year ago at every one of them.` }
      : { kind: "watch", title: `Profit fell at ${down.length} of the ${rep.length} that reported`, text: `${q} was lower than a year ago at ${list(named)}${down.length > 4 ? ` and ${down.length - 4} more` : ""}.` });
  }
  const lead = items.filter((s) => s.peer === "leader").map((s) => s.symbol), lag = items.filter((s) => s.peer === "laggard").map((s) => s.symbol), none = items.filter((s) => s.peer === "unranked").length;
  if (lead.length || lag.length) out.push({ kind: "insight", title: `${lead.length} lead their peers, ${lag.length} lag`,
    text: `${[lead.length ? `${lead.join(", ")} lead` : "", lag.length ? `${lag.join(", ")} lag` : ""].filter(Boolean).join("; ")}.${none ? ` ${none} ${none === 1 ? "is" : "are"} not ranked (too new or too thinly traded).` : ""}` });
  return out;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------------------------------------ Market snapshot, prices and rates, flows, portfolio
export function snapshotCard(adv: number, dec: number, total: number, n50: { up: number; down: number; n: number } | null, niftyChg: number | null): Card | null {
  if (!total || niftyChg == null || !n50 || !n50.n) return null;
  if (niftyChg > 0 && dec > adv) return { kind: "watch", title: "The big names rose; most stocks fell", text: `Only ${n50.down} of the Nifty 50 fell, yet across all ${n0(total)} companies fallers beat risers by ${n0(dec - adv)}.` };
  if (niftyChg < 0 && adv > dec) return { kind: "good", title: "The big names fell; most stocks rose", text: `Only ${n50.up} of the Nifty 50 rose, yet across all ${n0(total)} companies risers beat fallers by ${n0(adv - dec)}.` };
  if (niftyChg > 0) return { kind: "good", title: "A broad rise", text: `${n50.up} of the Nifty 50 rose, and across all ${n0(total)} companies risers beat fallers by ${n0(adv - dec)}.` };
  if (niftyChg < 0) return { kind: "warning", title: "A broad fall", text: `${n50.down} of the Nifty 50 fell, and across all ${n0(total)} companies fallers beat risers by ${n0(dec - adv)}.` };
  return null;
}
export function inflationCard(cpi: number | null, wpi: number | null, decision: { date: string; bp: number } | null): Card | null {
  if (cpi == null) return null;
  const rbi = decision && decision.bp ? ` The RBI ${decision.bp > 0 ? "raised" : "cut"} the repo rate in ${MONTH[+decision.date.slice(5, 7) - 1]}; ${decision.bp > 0 ? "higher rates raise" : "lower rates ease"} borrowing costs for companies.` : "";
  const both = `Retail inflation is ${cpi.toFixed(2)}%${wpi != null ? ` and wholesale ${wpi.toFixed(2)}%` : ""}.`;
  if (cpi > 4) return { kind: "watch", title: "Inflation is above the 4% target", text: both + rbi };
  if (cpi >= 2) return { kind: "good", title: "Inflation is within the target band", text: `${both} The RBI's target is 4%, within a band of 2% to 6%.${rbi}` };
  return { kind: "insight", title: "Inflation is below the target band", text: `${both} The RBI's band runs from 2% to 6%.${rbi}` };
}
export function flowsCard(f: Flows | undefined): Card | null {
  const s = f?.streaks.fii, d = f?.streaks.dii, days = f?.days ?? [];
  if (!f || !s || !days.length) return null;
  if (s.side === "buying" && s.days >= 3 && s.since) {
    const before = days.filter((x) => x.d < s.since!).slice(-15), soldBefore = before.reduce((a, x) => a + (x.fii.net ?? 0), 0) < 0;
    const last = days[days.length - 1].d;
    return { kind: "insight", title: soldBefore ? "Foreign money has turned buyer" : "Foreign money keeps buying",
      text: `FIIs bought in each of the ${NUM[s.days] ?? s.days} sessions from ${dm(s.since)} to ${dm(last)}${soldBefore ? ", after selling in the weeks before" : ""}${d?.side === "selling" ? ", while Indian institutions sold" : d?.side === "buying" ? ", and Indian institutions bought too" : ""}.` };
  }
  if (s.side === "selling" && s.days >= 3 && s.since) return { kind: "watch", title: "Foreign money is leaving", text: `FIIs sold in each of the last ${NUM[s.days] ?? s.days} sessions, since ${dm(s.since)}${d?.side === "buying" ? ", while Indian institutions bought" : ""}.` };
  const a = f.last30.fii, b = f.last30.dii;
  if (a == null || b == null) return null;
  return { kind: "insight", title: a < 0 && b > 0 ? "Indian institutions have been the buyers" : a > 0 && b < 0 ? "Foreign money has been the buyer" : "Both sides in step", text: `Over the last ${f.last30.days} sessions FIIs ${a >= 0 ? "bought" : "sold"} a net ₹${n0(Math.round(Math.abs(a)))} Cr and DIIs ${b >= 0 ? "bought" : "sold"} ₹${n0(Math.round(Math.abs(b)))} Cr.` };
}
export type Parts = { growth: number | null; valuation: number | null; quality: number | null; risk: number | null };
const PART_NAME = { growth: "growth", valuation: "valuation", quality: "quality", risk: "risk" } as const;
const WEAK_MEANS = { growth: "the businesses are growing more slowly than their other scores suggest", valuation: "you are paying above-typical prices for these businesses", quality: "the businesses are less steady than their other scores suggest", risk: "the shares carry more risk than their other scores suggest" } as const;
export function portfolioCard(p: Parts): Card | null {
  const ks = (Object.keys(PART_NAME) as (keyof Parts)[]).filter((k) => p[k] != null);
  if (ks.length < 2) return null;
  const lo = ks.reduce((a, b) => (p[b]! < p[a]! ? b : a)), hi = ks.reduce((a, b) => (p[b]! > p[a]! ? b : a));
  if (p[lo]! >= 60) return { kind: "good", title: "No weak spot", text: `Every Prism part averages 60 or more; the strongest is ${PART_NAME[hi]} (${Math.round(p[hi]!)}).` };
  return { kind: "watch", title: `${cap(PART_NAME[lo])} is the weak spot`, text: `Your shares score well on ${PART_NAME[hi]} (${Math.round(p[hi]!)}) but ${Math.round(p[lo]!)} on ${PART_NAME[lo]}: ${lo === "valuation" && hi === "growth" ? "you are paying above-typical prices for that growth" : WEAK_MEANS[lo]}.` };
}

// ------------------------------------------------------------------------------------------------ The market on <day>: what it adds up to
export type Reading = { k: string; badge: string; tone: "good" | "mixed" | "warning"; head: string; text: string; base: string };
export type ReadIn = {
  day: string; adv: number; dec: number; total: number; niftyChg: number | null; midChg: number | null; smallChg: number | null;
  big: { up: number; down: number; n: number }; size: { large: number | null; small: number | null; n: number };
  board: Board | undefined;
};
const word100 = (v: number) => (v >= 64 && v <= 70 ? "Two in three" : v >= 47 && v <= 53 ? "Half of all" : v >= 30 && v <= 36 ? "One in three" : `${Math.round(v)} in 100`);
/** Breadth across every counted stock of the Sector Pulse board: the groups' shares weighted by their counted stocks. */
export function boardBreadth(b: Board | undefined): { n: number; s9: number; s20: number; s50: number } | null {
  const rows = b?.rows ?? []; let n = 0, a = 0, c = 0, e = 0;
  for (const r of rows) { const k = r.stocks_counted || 0; if (!k || r.breadth?.above_9 == null || r.breadth.above_20 == null || r.breadth.above_50 == null) continue; n += k; a += r.breadth.above_9 * k; c += r.breadth.above_20 * k; e += r.breadth.above_50 * k; }
  return n ? { n, s9: a / n, s20: c / n, s50: e / n } : null;
}
export function marketRead(x: ReadIn): { lead: string; rest: string; tail: string | null; readings: Reading[]; sum: { good: number; mixed: number; warning: number; text: string } } {
  const on = x.day === "Today" ? "today" : `on ${x.day}`, R: Reading[] = [];
  const n = x.niftyChg;
  // the headline
  const top = n != null && n > 0 && x.dec > x.adv, bottom = n != null && n < 0 && x.adv > x.dec;
  const lead = top ? "Big companies lifted the index; most stocks fell." : bottom ? "The index fell; most stocks rose." : n != null && n > 0 ? "A broad rise." : n != null && n < 0 ? "A broad fall." : "A quiet day.";
  const rest = n == null ? "" : ` The Nifty 50 ${n >= 0 ? "rose" : "fell"} ${Math.abs(n).toFixed(1)}% ${on}, ${top || bottom ? "yet" : "and"} ${n0(x.dec)} stocks fell and ${n0(x.adv)} rose.`;
  const ms = [x.midChg, x.smallChg];
  const tail = ms.every((v) => v != null && v < 0) ? "Mid and small company indices ended lower." : ms.every((v) => v != null && v > 0) ? "Mid and small company indices ended higher." : null;
  // 1 today
  R.push(x.dec > x.adv * 1.05 ? { k: "Today", badge: "More fallers", tone: "warning", head: `${n0(x.dec)} fell, ${n0(x.adv)} rose`, text: top ? `The Nifty 50 rose ${n!.toFixed(1)}%, yet more stocks fell than rose. A handful of big companies did the lifting.` : "More stocks fell than rose.", base: `all ${n0(x.total)} listed companies with a price ${on}` }
    : x.adv > x.dec * 1.05 ? { k: "Today", badge: "More risers", tone: "good", head: `${n0(x.adv)} rose, ${n0(x.dec)} fell`, text: bottom ? `The Nifty 50 fell ${Math.abs(n!).toFixed(1)}%, yet more stocks rose than fell.` : "More stocks rose than fell.", base: `all ${n0(x.total)} listed companies with a price ${on}` }
    : { k: "Today", badge: "Even", tone: "mixed", head: `${n0(x.adv)} rose, ${n0(x.dec)} fell`, text: "Risers and fallers were close to even.", base: `all ${n0(x.total)} listed companies with a price ${on}` });
  // 2 big moves
  const { up, down } = x.big;
  R.push(down > up * 1.5 ? { k: "Big moves", badge: "Selling had the edge", tone: "warning", head: `${n0(down)} down 4%+, ${n0(up)} up 4%+`, text: `Sharp falls outnumbered sharp rises${down >= up * 1.8 && down <= up * 2.2 ? " almost two to one" : ""}.`, base: `${n0(x.big.n)} stocks with a price ${on}` }
    : up > down * 1.5 ? { k: "Big moves", badge: "Buying had the edge", tone: "good", head: `${n0(up)} up 4%+, ${n0(down)} down 4%+`, text: "Sharp rises outnumbered sharp falls.", base: `${n0(x.big.n)} stocks with a price ${on}` }
    : { k: "Big moves", badge: "Balanced", tone: "mixed", head: `${n0(up)} up 4%+, ${n0(down)} down 4%+`, text: "Sharp rises and sharp falls were close to even.", base: `${n0(x.big.n)} stocks with a price ${on}` });
  // 3 leadership
  const L = x.size.large, S = x.size.small;
  if (L != null && S != null) {
    const d = L - S;
    R.push(Math.abs(d) >= 2 ? { k: "Leadership", badge: d > 0 ? "Large companies lead" : "Small companies lead", tone: "good", head: `${sp(d > 0 ? L : S)} vs ${sp(d > 0 ? S : L)}`, text: `Over the last month the typical ${d > 0 ? "large" : "small"} company ${(d > 0 ? L : S) >= 0 ? "rose" : "fell"} ${Math.abs(d > 0 ? L : S).toFixed(1)}%; the typical ${d > 0 ? "small" : "large"} company ${(d > 0 ? S : L) >= 0 ? "rose" : "fell"} ${Math.abs(d > 0 ? S : L).toFixed(1)}%.`, base: `${n0(x.size.n)} listed companies, by size` }
      : { k: "Leadership", badge: "No size leads", tone: "mixed", head: `${sp(L)} vs ${sp(S)}`, text: `Over the last month the typical large company moved ${sp(L)} and the typical small company ${sp(S)}.`, base: `${n0(x.size.n)} listed companies, by size` });
  }
  // 4 and 5: trends across the counted stocks
  const bb = boardBreadth(x.board), base = `${n0(x.board?.universe?.counted_in_groups_with_reading ?? bb?.n ?? 0)} actively traded stocks`;
  if (bb) {
    R.push(bb.s9 >= 60 && bb.s20 >= 60 ? { k: "Short term", badge: "Broad", tone: "good", head: `${Math.round(bb.s9)} in 100 rising`, text: `${word100(bb.s9)} stocks are above their short trend and ${Math.round(bb.s20)} in 100 above the medium trend.`, base }
      : bb.s9 < 40 && bb.s20 < 40 ? { k: "Short term", badge: "Weak", tone: "warning", head: `${Math.round(bb.s9)} in 100 rising`, text: `Only ${Math.round(bb.s9)} in 100 stocks are above their short trend, and ${Math.round(bb.s20)} in 100 above the medium trend.`, base }
      : { k: "Short term", badge: "Mixed", tone: "mixed", head: `${Math.round(bb.s9)} in 100 rising`, text: `${word100(bb.s9)} stocks are above their short trend, but only ${Math.round(bb.s20)} in 100 above the medium trend.`, base });
    const mk = x.board?.market?.pct_vs_200d ?? null, tens = Math.ceil(bb.s50 / 10);
    const mkt = mk == null ? "" : `The Nifty 50 is ${Math.abs(mk).toFixed(1)}% ${mk >= 0 ? "above" : "below"} its long-term average, `;
    R.push(bb.s50 >= 55 ? { k: "Bigger trend", badge: "Broad", tone: "good", head: `${Math.round(bb.s50)} in 100 rising`, text: `${mkt}${mkt ? "and" : "Across the market"} more than half of all stocks are above their own longer trend.`, base }
      : bb.s50 >= 35 ? { k: "Bigger trend", badge: "Narrow", tone: "mixed", head: `${Math.round(bb.s50)} in 100 rising`, text: `${mkt}${mkt ? "but" : "Across the market"} fewer than ${tens} in 10 stocks are above their own longer trend.`, base }
      : { k: "Bigger trend", badge: "Weak", tone: "warning", head: `${Math.round(bb.s50)} in 100 rising`, text: `${mkt}${mkt ? "and" : "Across the market"} only ${Math.round(bb.s50)} in 100 stocks are above their own longer trend.`, base });
  }
  // 6 industries
  const c = x.board?.counts as Record<string, number> | undefined, all = x.board?.rows.length ?? 0;
  if (c && all) {
    const crash = c["Thrust CAP"] || 0, bounce = (c["Thrust C"] || 0) + crash, rising = c.Confirmed || 0, sold = c.Washout || 0, fading = c.Fading || 0;
    const b2 = `the ${all} NSE industries on Sector Pulse`;
    R.push(rising * 10 >= all * 3 ? { k: "Industries", badge: "Rising together", tone: "good", head: `${rising} of ${all} rising together`, text: `${rising} industries have most of their stocks rising together.`, base: b2 }
      : bounce * 10 >= all * 3 ? { k: "Industries", badge: "Rebuilding", tone: "good", head: `${bounce} of ${all} bouncing`, text: `The industry sell-off is easing: ${bounce} industries bounced${crash ? `, ${crash} of them after a crash` : ""}.`, base: b2 }
      : sold * 2 >= all ? { k: "Industries", badge: "Sold off", tone: "warning", head: `${sold} of ${all} sold off`, text: `Most industries are sold off${bounce ? `; ${bounce} have bounced` : ""}.`, base: b2 }
      : { k: "Industries", badge: "Mixed", tone: "mixed", head: `${bounce} bouncing, ${fading} losing steam`, text: "The industries point different ways.", base: b2 });
  }
  const good = R.filter((r) => r.tone === "good").length, warning = R.filter((r) => r.tone === "warning").length, mixed = R.length - good - warning;
  const text = top ? "A top-heavy market: big companies are rising, most of the rest are not yet. Broad rallies usually need more stocks to join in."
    : good >= 4 ? "A broad market: most of the readings point the same way, up." : warning >= 4 ? "A weak market: most of the readings point down." : "A mixed market: the readings point different ways.";
  return { lead, rest, tail, readings: R, sum: { good, mixed, warning, text } };
}
