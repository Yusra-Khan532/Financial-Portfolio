// Which score model the reader's plan has (founder, 13 Nov 2026, task #100): Gold and administrators see FinLit Prism, Silver the FinLit IQ, below Silver neither.
// Kept apart from lib/ui so it also works where a page is rendered without the providers (a component alone in a test): no plan there means "not Gold".
import { useAuth } from "./auth";
import { useUI } from "./ui";

export type ScoreModel = "prism" | "iq";

function useHas(): ((tier: "silver" | "gold") => boolean) | null {
  try { return useUI().has; } catch { return null; }
}
function useAdmin(): boolean {
  try { return !!useAuth().isAdmin; } catch { return false; }
}
/** True on Gold. */
export function useIsGold(): boolean {
  const has = useHas();
  return !!has?.("gold");
}
/** "prism" for Gold and administrators, "iq" for Silver, null below Silver. */
export function usePlanModel(): ScoreModel | null {
  const has = useHas(), admin = useAdmin();
  return has?.("gold") || admin ? "prism" : has?.("silver") ? "iq" : null;
}
