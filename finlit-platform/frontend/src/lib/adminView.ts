// What an administrator sees (founder, 14 Nov 2026): every plan's features at once ("all", the default), or exactly what one plan sees ("basic", "silver",
// "gold") to check it. The choice is kept in this browser. While a plan is previewed every API request carries the "view as" header and the server serves it
// as that plan (backend auth.service.admin_view); the server ignores the header for anyone who is not an administrator. Plain module: no React, so the API
// client can read it.
export type AdminView = "all" | "basic" | "silver" | "gold";
export const VIEW_AS_HEADER = "X-FinLit-View-As";
const KEY = "finlit-admin-view";
const ok = (v: unknown): v is AdminView => v === "all" || v === "basic" || v === "silver" || v === "gold";
let current: AdminView = (() => { try { const v = localStorage.getItem(KEY); return ok(v) ? v : "all"; } catch { return "all"; } })();

export const getAdminView = (): AdminView => current;
/** The header for an API request: present only while a plan is previewed. */
export const viewAsHeader = (): Record<string, string> => (current === "all" ? {} : { [VIEW_AS_HEADER]: current });
/** Switch the view. The caller reloads the page, so every answer is asked for again as the new view. */
export function setAdminView(v: AdminView): void {
  current = v;
  try { if (v === "all") localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* private mode */ }
}

/** True while an administrator sees every plan's features: the score helpers (lib/planScore) then add the FinLit IQ beside FinLit Prism. Set by lib/auth. */
let all = false;
export const seesAllNow = (): boolean => all;
export function setSeesAllNow(v: boolean): void { all = v; }
