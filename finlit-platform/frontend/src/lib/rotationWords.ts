// Sector Rotation's words for its two views (task #332, developer file 31, "The three levels"). The Sectors view says "sectors" (tw() does that). The Industries view
// says "groups" for its 38 rows, because five of them are sectors that read small industries together, and "industry" for one row. So in the Industries view the
// plural "industries" that names the rows becomes "groups"; phrases where "industries" means NSE's own industries (inside a sector group, the Industries view's
// name) are kept. Only Sector Rotation calls this; Sector Pulse keeps its own wording (task #333).
import type { Card } from "./pulsePack";
import { tw, wordsShow } from "./groupWords";

/** Phrases where "industries" is not the page's rows: kept as written. */
const KEEP = /\b(?:Industries view|industry groups?|small(?:er)? industries|NSE industries|average industry|its industries)\b/gi;

export function toGroups(s: string): string {
  if (!s || !/industries/i.test(s)) return s;
  const kept: string[] = [];
  const x = s.replace(KEEP, (m) => { kept.push(m); return `\u0001${kept.length - 1}\u0002`; })
    .replace(/\bINDUSTRIES\b/g, "GROUPS").replace(/\bIndustries\b/g, "Groups").replace(/\bindustries\b/g, "groups");
  return x.replace(/\u0001(\d+)\u0002/g, (_m, i: string) => kept[Number(i)]);
}

/** tw() for Sector Rotation: "sectors" in the Sectors view, "groups" for the rows in the Industries view. */
export const rw = (s: string): string => (wordsShow() === "sectors" ? toSectorsKeepingYardstick(s) : toGroups(s));
/** The Sectors view: tw(), except that the yardstick stays "industry groups" (fault 2: both views measure against the average of the industry groups). */
const YARD = /\b(?:industry groups?|Industries view)\b/gi;
function toSectorsKeepingYardstick(s: string): string {
  const kept: string[] = [];
  const x = tw(s.replace(YARD, (m) => { kept.push(m); return `\u0003${kept.length - 1}\u0004`; }));
  return x.replace(/\u0003(\d+)\u0004/g, (_m, i: string) => kept[Number(i)]);
}
/** The same for a list of insight cards (some are written by the server). */
export const rwCards = (cards: Card[]): Card[] => cards.map((c) => ({ ...c, title: rw(c.title), text: rw(c.text) }));
