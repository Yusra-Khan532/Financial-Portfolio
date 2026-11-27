// Task #407: types for ./goliveData.js (the landing page's areas and tools, plans and recordings, from the go-live pack).
/** [icon, name, plan, line, parts, note, path, isNew, ownModel, tiles] */
export type GoLiveTool = [string, string, string, string, string[], string, string, boolean, boolean, [string, string, string][] | null];
export const AREAS: { id?: string; name: string; line: string; tools: GoLiveTool[] }[];
/** `v`: one value per plan in PLANS.P order, then the combined plan's (task #411). */
export type GoLivePlanRow = { n: string; line: string; k?: string; new?: boolean; usp?: boolean; v: string[]; ao?: string; subs: { n: string; line: string; v: string[]; ao?: string }[] };
export const PLANS: {
  /** [name, price text, colour, note, { y: yearly price in rupees } | null] */
  P: [string, string, string, string, { y: number } | null][];
  G: { id: string; name: string; line: string; addon?: boolean; rows: GoLivePlanRow[] }[];
  cnt: number[]; n: number; AP?: Record<string, string>;
};
export const CLIPS: Record<string, string>;
/** Task #410: the combined plan (Equity Portfolio + Mutual Fund + ETF): its yearly price and the extras it adds from Gold ([name, line]). */
/** Task #411: `head`: the name and colour of its column in the landing page's table. */
export const COMBINED: { head: [string, string]; y: number; extras: [string, string][] };
