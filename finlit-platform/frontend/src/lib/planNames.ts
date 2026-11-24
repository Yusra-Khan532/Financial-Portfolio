// Task #388 (developer file 36, part B item 2): the plan list in one place. Every plan name a member reads (the lock card, "on Silver and Gold" in the
// Questions) is read from here, never written as a fixed string, so renaming or adding a plan is one change here. Today's list is Basic, Silver and Gold
// (lib/auth Plan, pages/Plans.tsx).
import type { Plan } from "./auth";

/** The plans in order, lowest first, with the name a member reads. */
export const PLAN_LIST: readonly { id: Plan; name: string }[] = [
  { id: "basic", name: "Basic" },
  { id: "silver", name: "Silver" },
  { id: "gold", name: "Gold" },
];

/** A plan's name ("Silver"). */
export const planName = (p: Plan): string => PLAN_LIST.find((x) => x.id === p)?.name ?? p;

/** The names of the plans that include a feature opening at `from`, in order: ["Silver", "Gold"]. */
export const plansFrom = (from: Plan): string[] => { const i = PLAN_LIST.findIndex((x) => x.id === from); return (i < 0 ? [] : PLAN_LIST.slice(i)).map((x) => x.name); };

/** The same list in words: "Silver and Gold", "Gold", "Silver, Gold and Platinum". */
export const plansFromText = (from: Plan): string => { const xs = plansFrom(from); return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`; };
