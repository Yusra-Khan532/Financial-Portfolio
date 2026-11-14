// Which score model the reader's plan has (founder, 13 Nov 2026, task #100): Gold and administrators see FinLit Prism, Silver the FinLit IQ, below Silver neither.
// Kept apart from lib/ui so it also works where a page is rendered without the providers (a component alone in a test): no plan there means "not Gold".
import { useAuth } from "./auth";
import { useUI } from "./ui";

export type ScoreModel = "prism" | "iq";

function useHas(): ((tier: "silver" | "gold") => boolean) | null {
  try { return useUI().has; } catch { return null; }
}
/** An administrator in the "everything" view: every plan's features at once (founder, 14 Nov 2026). */
export function useSeesAll(): boolean {
  try { return !!useAuth().seesAll; } catch { return false; }
}
/** True on Gold, for what Gold does without (task #100: no Basic stock screener, which uses the FinLit IQ). False for an administrator seeing every
 *  plan's features: nothing is taken away from them (founder, 14 Nov 2026). */
export function useIsGold(): boolean {
  const has = useHas(), all = useSeesAll();
  return !!has?.("gold") && !all;
}
/** "prism" for Gold and administrators, "iq" for Silver, null below Silver. */
export function usePlanModel(): ScoreModel | null {
  const has = useHas(), all = useSeesAll();
  return has?.("gold") || all ? "prism" : has?.("silver") ? "iq" : null;
}
