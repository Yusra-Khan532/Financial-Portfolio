// Task #388 (developer file 36, part B item 2): the plan list in one place. Every plan name a member reads (the lock card, "on Gold and Platinum" in the
// Questions) is read from here, never written as a fixed string, so renaming or adding a plan is one change here.
// Task #410 (owner, 27 Nov 2026): the plans on sale are the landing page's (landing/goliveData.js): Free, Mutual Fund + ETF, Equity Portfolio, the
// combined plan, Gold and Platinum. A gate still names an access tier (basic, silver, gold) or a new gate ("platinum", "equity", "mfetf"); each reads
// as the plans that open it. The old Silver tier is opened by the one-area plans for their own area and in full by Gold and Platinum, so a Silver gate
// reads "Gold"; Basic reads "Free".
import type { PlanKey } from "./auth";

/** The plans in order, lowest first, with the name a member reads. */
export const PLAN_LIST: readonly { id: PlanKey; name: string }[] = [
  { id: "free", name: "Free" },
  { id: "mfetf", name: "Mutual Fund + ETF" },
  { id: "equity", name: "Equity Portfolio" },
  { id: "combined", name: "Combined" },
  { id: "gold", name: "Gold" },
  { id: "platinum", name: "Platinum" },
];
const NAME: Record<string, string> = Object.fromEntries(PLAN_LIST.map((p) => [p.id, p.name]));
/** The plans that open each gate, lowest first. */
const FROM: Record<string, PlanKey[]> = {
  basic: ["free", "mfetf", "equity", "combined", "gold", "platinum"], free: ["free", "mfetf", "equity", "combined", "gold", "platinum"],
  silver: ["gold", "platinum"], gold: ["gold", "platinum"], platinum: ["platinum"],
  equity: ["equity", "combined", "gold", "platinum"], mfetf: ["mfetf", "combined", "gold", "platinum"], combined: ["combined", "gold", "platinum"],
};

/** A plan's or a gate's name: "Platinum", "Equity Portfolio"; a Silver gate reads "Gold" (the smallest full plan that opens it), Basic reads "Free". */
export const planName = (p: string): string => NAME[p] ?? (p === "basic" ? "Free" : p === "silver" ? "Gold" : p);

/** The plans that open a gate, in order, with their names. */
export const plansOpening = (from: string): readonly { id: PlanKey; name: string }[] => (FROM[from] ?? []).map((k) => ({ id: k, name: NAME[k] }));

/** The names of the plans that open a gate, in order: ["Gold", "Platinum"]. */
export const plansFrom = (from: string): string[] => (FROM[from] ?? []).map((k) => NAME[k]);

/** The same list in words: "Gold and Platinum", "Platinum", "Equity Portfolio, Combined, Gold and Platinum". */
export const plansFromText = (from: string): string => { const xs = plansFrom(from); return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`; };

/** Task #410: the name of the member's plan for a badge: the plan key when there is one, else the plan that keeps the tier's access (basic Free,
 *  silver Combined, gold Platinum: a demo preview, or a test that mocks the account). */
export const memberPlanName = (key: string | null | undefined, tier: string): string =>
  planName(key || (tier === "gold" ? "platinum" : tier === "silver" ? "combined" : "free"));
