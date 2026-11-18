// Reverse valuation's quick picks and "Last searched" companies (task #182: "like we have in profit and revenue forecasting"). The quick picks are the
// forecasting page's five; the last-searched list is this page's own, kept in this browser only. Never throws: a blocked store means an empty list.
export { QUICK_PICKS } from "./outlookPick";

export type Recent = { symbol: string; name: string };
const KEY = "finlit.reverse.recent";
export const RV_RECENT_MAX = 5;
const SYM = /^[A-Z0-9&._-]{1,24}$/;

export function readRvRecent(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is Recent => !!x && typeof x.symbol === "string" && SYM.test(x.symbol) && typeof x.name === "string").map((x) => ({ symbol: x.symbol, name: x.name.slice(0, 80) })).slice(0, RV_RECENT_MAX) : [];
  } catch { return []; }
}
/** Puts a company first (once), keeps the latest five, returns the new list. */
export function pushRvRecent(symbol: string, name?: string | null): Recent[] {
  const s = symbol.trim().toUpperCase();
  if (!SYM.test(s)) return readRvRecent();
  const next = [{ symbol: s, name: (name || s).trim().slice(0, 80) }, ...readRvRecent().filter((x) => x.symbol !== s)].slice(0, RV_RECENT_MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* a private window: the list lasts for this visit only */ }
  return next;
}
