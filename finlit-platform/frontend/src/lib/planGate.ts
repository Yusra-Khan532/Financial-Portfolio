// Which score the reader's plan has. Task #283: the old overall score is retired; FinLit Prism is FinLit's only company score. A plan that has Prism
// (PLAN_FOR_PRISM, and administrators) sees it; every other plan sees no score (the page's own lock says which plan shows it).
// Kept apart from lib/ui so it also works where a page is rendered without the providers (a component alone in a test): no plan there means "no Prism".
import { useAuth, type Plan } from "./auth";
import { useUI } from "./ui";
import { PLAN_FOR_PRISM } from "./planGates";

/** The one company score model left on the site. */
export type ScoreModel = "prism";

function useHas(): ((tier: Plan) => boolean) | null {
  try { return useUI().has; } catch { return null; }
}
/** An administrator in the "everything" view: every plan's features at once (founder, 14 Nov 2026). */
export function useSeesAll(): boolean {
  try { return !!useAuth().seesAll; } catch { return false; }
}
/** True on Gold, for what Gold does without. False for an administrator seeing every plan's features: nothing is taken away from them (founder, 14 Nov 2026). */
export function useIsGold(): boolean {
  const has = useHas(), all = useSeesAll();
  return !!has?.("gold") && !all;
}
/** "prism" for plans with FinLit Prism and administrators, null otherwise (no score is shown). */
export function usePlanModel(): ScoreModel | null {
  const has = useHas(), all = useSeesAll();
  return has?.(PLAN_FOR_PRISM) || all ? "prism" : null;
}
