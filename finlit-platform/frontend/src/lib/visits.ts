// FinLit's own visitor counter (the owner's choice of 27 Nov 2026, "both, in two steps": this is step 1; finlit/visits.py, POST /api/visits).
// One small message per page shown: the address, the NAME of the site the visit came from (the referrer's host only, never its path),
// a campaign tag if the link had one, the screen width (phone or desktop), and whether it is the first page of the visit.
// No cookie, no identifier, nothing stored in the browser. Never throws, never delays the page.
import { useEffect } from "react";
import { useLocation } from "react-router";

let first = true;
let lastPath = "";

function referrerHost(): string {
  try { return document.referrer ? new URL(document.referrer).host.toLowerCase() : ""; } catch { return ""; }
}

/** Count the page at `path` (call once per page change). The first call of a page load is the start of a visit unless it came from this site. */
export function countVisit(path: string): void {
  try {
    if ((import.meta.env.DEV && import.meta.env.MODE !== "test") || path === lastPath) return;   // the local dev server is not counted
    lastPath = path;
    const ref = first ? referrerHost() : location.host;
    const utm = first ? (new URLSearchParams(location.search).get("utm_source") || "").slice(0, 60) : "";
    const land = first && ref !== location.host;
    first = false;
    const body = JSON.stringify({ path: path.slice(0, 300), ref: ref.slice(0, 253), utm, w: Math.round(window.innerWidth || 0), land });
    const url = `${import.meta.env.BASE_URL}api/visits`.replace(/\/{2,}/g, "/");
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "application/json" })))) {
      void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
    }
  } catch { /* counting must never cause an error of its own */ }
}

/** For tests: start as a fresh page load. */
export function resetVisitsForTest(): void { first = true; lastPath = ""; }

/** Counts each page the visitor sees: mounted once inside the router (main.tsx). Draws nothing. */
export function VisitCounter(): null {
  const { pathname } = useLocation();
  useEffect(() => { countVisit(pathname); }, [pathname]);
  return null;
}
