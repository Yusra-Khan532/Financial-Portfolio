// Task #410 (owner, 27 Nov 2026): each plan on sale, its name and price, read from the landing page's plan data (landing/goliveData.js: PLANS.P and
// COMBINED). Nothing here is a copied number: change a price in goliveData and the landing page, /plans and the account page all follow.
import { COMBINED, PLANS } from "../landing/goliveData.js";
import type { PlanKey } from "./auth";

export type PlanOffer = { key: PlanKey; name: string; yearly: number; monthly: number };

/** goliveData's plans in its own order (Free, Mutual Fund + ETF, Equity Portfolio, Gold, Platinum), each with its plan key. */
const ORDER: PlanKey[] = ["free", "mfetf", "equity", "gold", "platinum"];

/** Every plan on sale, lowest first, with the combined plan after the two one-area plans. Monthly is the yearly price spread over 12 months. */
export function planOffers(): PlanOffer[] {
  const out: PlanOffer[] = PLANS.P.map((p, i) => ({ key: ORDER[i], name: p[0], yearly: p[4]?.y ?? 0, monthly: Math.round((p[4]?.y ?? 0) / 12) }));
  const combined: PlanOffer = { key: "combined", name: `${PLANS.P[2][0]} + ${PLANS.P[1][0]}`, yearly: COMBINED.y, monthly: Math.round(COMBINED.y / 12) };
  return [...out.slice(0, 3), combined, ...out.slice(3)];
}

/** Whether plan `have` already includes plan `want` (the server's plan-request rule): the same plan; a higher full plan (Gold, Platinum include every
 *  plan below them); the combined plan includes both one-area plans. The two one-area plans do not include each other or the combined plan. */
export function planIncludes(have: PlanKey, want: PlanKey): boolean {
  if (have === want) return true;
  if (want === "free") return true;
  if (have === "combined") return want === "mfetf" || want === "equity";
  if (have === "gold") return want !== "platinum";
  return have === "platinum";
}

/** ₹ in the Indian style: "₹5,500". */
export const rupees = (n: number): string => "₹" + Math.round(n).toLocaleString("en-IN");
