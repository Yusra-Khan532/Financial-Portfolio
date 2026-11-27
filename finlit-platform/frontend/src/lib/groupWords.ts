// "Show: Sectors | Industries" on Sector Pulse and Sector Rotation (task #192, SECTOR-PAGES.md S1): "Words change from "industry" to "sector" everywhere" in the
// Sectors view. The pages set the view once per render (useShowWords); every visible sentence of the sector pages goes through tw(), which leaves it as written in
// the Industries view and swaps industry -> sector, industries -> sectors (any case, "an industry" -> "a sector") in the Sectors view. The yardstick is the
// same in both views ("Measure both views against the same yardstick"), so "the average industry" / "the average group" is never swapped.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useSectorStatus, type Show } from "./sectors";

let current: Show = "industries";

/** The sentence as the current view words it. */
export function tw(s: string): string {
  return current === "sectors" ? toSectors(s) : s;
}

export function toSectors(s: string): string {
  if (!s || !/industr|group/i.test(s)) return s;
  const kept: string[] = [];
  let x = s.replace(/\baverage (industry|group)\b/gi, (m) => { kept.push(m); return `\u0001${kept.length - 1}\u0002`; });
  x = x.replace(/\bindustry (or|and) sector groups?\b/gi, (m) => (m[0] === "I" ? "Sector" : "sector"))           // "an industry or sector group" -> "a sector"
    .replace(/\b(an|An|AN) (industry|Industry|INDUSTRY)\b/g, (_m, a: string, w: string) => `${a === "an" ? "a" : "A"} ${w[0] === "I" ? (w === "INDUSTRY" ? "SECTOR" : "Sector") : "sector"}`)
    .replace(/\bINDUSTRIES\b/g, "SECTORS").replace(/\bINDUSTRY\b/g, "SECTOR")
    .replace(/\bIndustries\b/g, "Sectors").replace(/\bIndustry\b/g, "Sector")
    .replace(/\bindustries\b/g, "sectors").replace(/\bindustry\b/g, "sector")
    .replace(/\ba sector or sector\b/g, "a sector").replace(/\bsector and sector\b/g, "sector")
    // task #333 (file 30): in the Sectors view every group is a sector, so "groups" and "sectors" are never used for the same thing ("2 of 19 sectors")
    .replace(/\b(sector|Sector) (group|Group)(s?)\b/g, (_m, a: string, _g: string, pl: string) => a + (pl ? "s" : ""))
    .replace(/\bGroups\b/g, "Sectors").replace(/\bGroup\b/g, "Sector").replace(/\bgroups\b/g, "sectors").replace(/\bgroup\b/g, "sector")
    .replace(/\bsectors? sectors\b/g, "sectors").replace(/\bsector sector\b/g, "sector");
  return x.replace(/\u0001(\d+)\u0002/g, (_m, i: string) => kept[Number(i)]);
}

/** The current view, for code that needs it outside a render (a sentence built in a helper). */
export const wordsShow = (): Show => current;

/** Called at the top of a sector page's render, before its children render: they word their text for this view. Back to Industries when the page goes. */
export function useShowWords(show: Show): void {
  current = show;
  useEffect(() => {
    current = show;
    return () => { current = "industries"; };
  }, [show]);
}

/** The address of a group's page in the current view: an industry page, or a sector page of the Sectors view (?show=sectors). */
export const gl = (slug: string): string => `/sectors/${slug}${current === "sectors" ? "?show=sectors" : ""}`;
/** The API's view parameter for the current view ("" in the Industries view). */
export const sq = (first = true): string => (current === "sectors" ? `${first ? "?" : "&"}show=sectors` : "");

/** "Show: Sectors | Industries", shared by Sector Pulse, Sector Rotation and a group's page and kept in the link (?show=sectors | ?show=industries).
 *  Sectors is the default (SECTOR-PAGES.md S1) once the live data holds it (/api/sectors/status sectorsViewLoaded); until then the default is Industries and
 *  `pending` says why. `ready` is false only while the status is read for a link that names no view, so the page never shows one view and then the other. */
export function useShow(): { show: Show; setShow: (s: Show) => void; ready: boolean; pending: string | null } {
  const [params, setParams] = useSearchParams();
  const asked = params.get("show");
  const explicit: Show | null = asked === "sectors" || asked === "industries" ? asked : null;
  const st = useSectorStatus();
  const loaded = st.data?.sectorsViewLoaded === true;
  const show: Show = explicit ?? (loaded ? "sectors" : "industries");
  const ready = explicit != null || !st.isLoading;
  const pending = !loaded && st.data ? "The Sectors view (NSE's 22 sectors) is added by the sector job on its next weekend night; the industries are shown meanwhile." : null;
  const setShow = (s: Show) => { const p = new URLSearchParams(params); p.set("show", s); setParams(p, { replace: true }); };
  return { show, setShow, ready, pending };
}

/** The link to the other sector page, or a group's page, in the same view. */
export const withShow = (to: string, show: Show): string => `${to}${to.includes("?") ? "&" : "?"}show=${show}`;
