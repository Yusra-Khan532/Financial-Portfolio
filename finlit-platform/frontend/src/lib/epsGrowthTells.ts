// Task #205: "What Your Growth Assumption Tells You", the collapsible section under the P/E, EPS & PEG calculator's results. For each of the four results
// (EPS, P/E, PEG, Implied 5Y EPS) it says whether the growth assumption moves it, which way it moved from the previous growth rate, by how much, and why,
// in one short line. The comparison holds the company inputs fixed, so only the growth assumption's own effect is shown. Describes figures; never advice.
import { MINUS, fix2, futureEps, peg as pegOf, round2 } from "./epsCalc";
import { nf } from "./format";

export type Dir = "up" | "down" | "same" | "na";
export type TellRow = {
  key: "eps" | "pe" | "peg" | "eps5"; metric: string; affected: boolean; dir: Dir;
  /** the value now, formatted ("₹12.40", "18.20x", "1.21", "—") */ now: string;
  /** the value at the previous growth rate, when there is one and it differs from now */ before: string | null;
  /** the change in words ("−0.30", "+16.2%", "No change") */ change: string;
  why: string;
};
export type Tells = { growth: number | null; prev: number | null; moved: number; rows: TellRow[]; headline: string };

const rs = (v: number) => (v < 0 ? MINUS + "₹" : "₹") + nf(Math.abs(Number(fix2(v))), 2);
const mult = (v: number) => nf(Number(fix2(v)), 2) + "x";
const signed = (v: number, digits = 2) => { const r = round2(v); return (r > 0 ? "+" : r < 0 ? MINUS : "") + nf(Math.abs(r), digits); };
const g1 = (g: number) => nf(g, Number.isInteger(g) ? 0 : 1) + "%";
const dirOf = (a: number, b: number): Dir => { const d = round2(b) - round2(a); return d > 0 ? "up" : d < 0 ? "down" : "same"; };

/**
 * @param e     EPS today (null while the company inputs are incomplete)
 * @param pe    P/E today (null when not meaningful)
 * @param growth the growth assumption now (% a year), or null when it is not a valid number
 * @param prev  the previous valid growth assumption, or null before the first change
 */
export function growthTells(e: number | null, pe: number | null, growth: number | null, prev: number | null): Tells {
  const has = growth != null, cmp = has && prev != null && prev !== growth;
  const rows: TellRow[] = [];

  // EPS and P/E: growth is not in either formula
  const epsNow = e == null ? "—" : rs(e);
  rows.push({ key: "eps", metric: "EPS", affected: false, dir: e == null ? "na" : "same", now: epsNow, before: null, change: e == null ? "Complete the inputs" : "No change",
    why: "EPS is today's profit per share: (net profit − preference dividends) ÷ shares. A future growth rate is not part of it." });
  rows.push({ key: "pe", metric: "P/E ratio", affected: false, dir: pe == null ? "na" : "same", now: pe == null ? "Not meaningful" : mult(pe), before: null, change: pe == null ? (e == null ? "Complete the inputs" : "Not meaningful") : "No change",
    why: "P/E is today's price ÷ today's EPS. Both are known now, so the growth you assume does not change it." });

  // PEG = P/E ÷ growth: higher growth, lower PEG
  const pNow = has ? pegOf(pe, growth).value : null, pPrev = cmp ? pegOf(pe, prev).value : null;
  const pegRow: TellRow = { key: "peg", metric: "PEG ratio", affected: true, dir: "na", now: pNow == null ? "Not meaningful" : fix2(pNow), before: null, change: "", why: "" };
  if (pe == null) { pegRow.change = e == null ? "Complete the inputs" : "Not meaningful"; pegRow.why = "PEG needs a meaningful P/E, and there is none while EPS is zero or negative."; }
  else if (!has || growth <= 0) { pegRow.change = "Not meaningful"; pegRow.why = "PEG divides the P/E by growth, so it says nothing when the growth assumed is zero or negative."; }
  else if (!cmp || pPrev == null) {
    pegRow.change = cmp ? `Now meaningful at ${g1(growth)}` : "Change the growth to compare";   // cmp here: the previous rate gave no PEG (zero or negative growth)
    pegRow.why = `PEG = P/E ÷ growth (${fix2(pe)} ÷ ${nf(growth, 1)}). A higher growth rate gives a lower PEG: you pay fewer times earnings for each point of growth assumed.`;
  } else {
    pegRow.dir = dirOf(pPrev, pNow as number); pegRow.before = fix2(pPrev); pegRow.change = signed(round2(pNow as number) - round2(pPrev));   // the difference of the figures shown, so they add up
    pegRow.why = growth > prev
      ? `Growth went up from ${g1(prev)} to ${g1(growth)} with the same P/E, so each point of growth costs fewer times earnings: PEG falls.`
      : `Growth came down from ${g1(prev)} to ${g1(growth)} with the same P/E, so each point of growth costs more times earnings: PEG rises.`;
  }
  rows.push(pegRow);

  // Implied 5Y EPS = EPS × (1 + growth)^5: higher growth, higher future EPS
  const fNow = has && e != null && e > 0 ? futureEps(e, growth, 5) : null, fPrev = cmp && e != null && e > 0 ? futureEps(e, prev, 5) : null;
  const f: TellRow = { key: "eps5", metric: "Implied 5Y EPS", affected: true, dir: "na", now: fNow == null ? "—" : rs(fNow), before: null, change: "", why: "" };
  if (e == null) { f.change = "Complete the inputs"; f.why = "It grows today's EPS at your rate for 5 years, so it needs EPS first."; }
  else if (e <= 0) { f.change = "Not meaningful"; f.why = "Growing a zero or negative EPS by a percentage does not describe a business."; }
  else if (!has) { f.change = "Check the growth"; f.why = "Enter a growth rate to project EPS 5 years ahead."; }
  else if (!cmp || fPrev == null) { f.change = "Change the growth to compare"; f.why = `EPS × (1 + growth)⁵: ${rs(e)} growing at ${g1(growth)} a year for 5 years. A higher rate gives a higher figure.`; }
  else {
    f.dir = dirOf(fPrev, fNow as number); f.before = rs(fPrev);
    f.change = `${signed(round2(fNow as number) - round2(fPrev))} (${signed(((fNow as number) / fPrev - 1) * 100, 1)}%)`;
    f.why = `The same ${rs(e)} of EPS now compounds at ${g1(growth)} instead of ${g1(prev)} for 5 years, so the gap widens each year.`;
  }
  rows.push(f);

  const moved = rows.filter((r) => r.dir === "up" || r.dir === "down").length;
  const headline = !has ? "Enter a valid growth rate to see what it changes."
    : !cmp ? `Your growth assumption is ${g1(growth)}. It moves PEG and Implied 5Y EPS; EPS and P/E stay as they are. Change it, or pick a quick percentage, to see by how much.`
    : `Growth ${growth > prev ? "raised" : "lowered"} from ${g1(prev)} to ${g1(growth)}: ${moved} of 4 results change; EPS and P/E stay the same.`;
  return { growth, prev: cmp ? prev : null, moved, rows, headline };
}
