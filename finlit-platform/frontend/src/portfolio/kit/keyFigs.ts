// Task #276 (shared portfolio parts, built on the ETF page first; the equity and MF pages reuse them): the shape of a Key figures card and the rule that
// picks them (number fix 8, code F). Every candidate returns null when it has nothing to say; a view shows the first three non-null of its ordered list.

/** Where a card's link goes: a section of the page (jump), a sort of the main table, or a set of its columns. */
export type KfGo = { label: string; kind: "jump" | "sort" | "cols"; arg: string };
/** One small bar: its label, its length (value of max) and the figure printed beside it. `neg` draws it in the falling colour; `muted` in grey. */
export type KfRow = { label: string; value: number; max: number; text: string; neg?: boolean; muted?: boolean };
/** One part of a stacked bar, with its legend. */
export type KfPart = { label: string; value: number; color: string; text: string };
export type KfCard = {
  id: string; tone: "info" | "warn" | "good";
  /** what it is about (the small capitals line) */ k: string;
  /** the sentence: its bold lead with the number, then the rest */ lead: string; rest?: string;
  rows?: KfRow[]; /** a line across the bars at this value (beta 1) */ line?: number; stack?: KfPart[];
  /** one line under the bar */ note?: string; /** what it rests on */ from?: string; go: KfGo;
};
export type KfCandidate<C> = (c: C) => KfCard | null;

/** The first `n` cards that have something to say, in the list's order. */
export function pickCards<C>(cands: KfCandidate<C>[], c: C, n = 3): KfCard[] {
  const out: KfCard[] = [];
  for (const f of cands) { if (out.length >= n) break; const x = f(c); if (x) out.push(x); }
  return out;
}
