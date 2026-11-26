// Task #407: types for ./goliveData.js (the landing page's areas and tools, plans and recordings, from the go-live pack).
/** [icon, name, plan, line, parts, note, path, isNew, ownModel, tiles] */
export type GoLiveTool = [string, string, string, string, string[], string, string, boolean, boolean, [string, string, string][] | null];
export const AREAS: { id?: string; name: string; line: string; tools: GoLiveTool[] }[];
export type GoLivePlanRow = { n: string; line: string; k?: string; new?: boolean; usp?: boolean; v: string[]; ao?: string; subs: { n: string; line: string; v: string[]; ao?: string }[] };
export const PLANS: {
  /** [name, price text, colour, note, { y: yearly price in rupees } | null] */
  P: [string, string, string, string, { y: number } | null][];
  G: { id: string; name: string; line: string; addon?: boolean; rows: GoLivePlanRow[] }[];
  cnt: number[]; n: number; AP?: Record<string, string>;
};
export const CLIPS: Record<string, string>;
