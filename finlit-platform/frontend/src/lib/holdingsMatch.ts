import type { SearchRow } from "./api";
import { SPLIT_NAMES, canon } from "./aliases";
import { entriesFromGrid, gridFromText, namesFromGrid, tidy, type Entry, type NameMatcher } from "./holdingsFile";
import { ISIN_RX, isinValid, type IsinAnswer } from "./isin";

/** Turning what a person typed, pasted or exported into listed companies. */

const norm = (s: string) => s.toUpperCase().replace(/&/g, " AND ").replace(/\b(LIMITED|LTD|THE|CO|COMPANY|CORPORATION|CORP|INC)\b\.?/g, " ").replace(/[^A-Z0-9]+/g, " ").trim();

/** The names or tickers in pasted text or a CSV: the column of listed companies (or headed symbol/stock/name/company), else the first column. */
export function namesFrom(text: string, matches?: NameMatcher): string[] {
  return namesFromGrid(gridFromText(text), matches);
}

/** The lines of pasted text or a CSV as ISIN + name (task #128): see `entriesFromGrid`. */
export function entriesFrom(text: string, matches?: NameMatcher): Entry[] {
  return entriesFromGrid(gridFromText(text), matches);
}

/** What one typed line means: an ISIN when it is one ("INE002A01018"), else a name or ticker. */
export function entryOf(typed: string): Entry {
  const t = typed.trim(), u = t.toUpperCase();
  return isinValid(u) || (ISIN_RX.test(u) && (u.match(/\d/g) || []).length >= 4) ? { isin: u, name: "" } : { name: t };
}

// how sure a match is: exact ticker, code or full name, a name that only starts the same way, a demerged company, a retired ticker, found inside running text;
// or, by ISIN (task #128): the company's current ISIN, an older ISIN of it, another ISIN of the same issuer, or the depository's issuer name
export type How = "exact" | "close" | "split" | "alias" | "scan" | "isin" | "old_isin" | "issuer" | "issuer_name";
/** `code`: the line is exactly a listed company's code (NSE symbol, NSE code, BSE code or BSE scrip ID), not a name; such a line needs no checking. */
export type Found = { input: string; symbol: string; name: string; how: How; isin?: string; code?: true };
/** A match that is not added until the member says so, with the reason. */
export type ToCheck = Found & { note: string };
/** A line that is not a listed company's share, with the reason (a fund unit, a bond, an unlisted share, an ISIN no list knows, a wrong check digit). */
export type Skipped = { input: string; isin: string; note: string };

/** One lookup, built once per search list: ticker, NSE or BSE code, BSE scrip ID, and the company name without Ltd/Limited/&.
 *  `exact` uses hash lookups only (safe to call on every word window of a document); `find` also accepts a name that starts the same way.
 *  A BSE scrip ID (row place 6, `rowsWithBseIds`) is taken only after every symbol and code, so it never hides another company's NSE symbol. */
export function makeLookup(index: SearchRow[]) {
  const byCode = new Map<string, SearchRow>(), byName = new Map<string, SearchRow>();
  for (const r of index) {
    for (const c of [r[0], r[2], r[4]]) if (c && !byCode.has(c.toUpperCase())) byCode.set(c.toUpperCase(), r);
    const n = norm(r[1]); if (n && !byName.has(n)) byName.set(n, r);
  }
  for (const r of index) { const id = r[5]?.toUpperCase(); if (id && !byCode.has(id)) byCode.set(id, r); }
  const code = (input: string): SearchRow | undefined => byCode.get(tidy(input).toUpperCase());
  const exact = (input: string): SearchRow | undefined => { const t = tidy(input); return byCode.get(t.toUpperCase()) || byName.get(norm(t)); };
  // normalised names, worked out once and only when a "starts the same way" search is first needed (norm on 6000 names for every unmatched line was seconds on a long statement)
  let norms: string[] | undefined;
  const one = (input: string): { row: SearchRow; how: "exact" | "close"; code?: true } | undefined => {
    const k = code(input); if (k) return { row: k, how: "exact", code: true };
    const e = exact(input); if (e) return { row: e, how: "exact" };
    const n = norm(tidy(input));
    let c: SearchRow | undefined;
    if (n.length >= 4) { norms ??= index.map((r) => norm(r[1])); const i = norms.findIndex((m) => m === n || m.startsWith(n + " ")); c = i >= 0 ? index[i] : undefined; }
    return c ? { row: c, how: "close" } : undefined;
  };
  // "Larsen & Toubro Ltd., Mumbai": a broker's registered-office tail after a comma is not part of the name.
  const find = (input: string) => one(input) || (input.includes(",") ? one(input.slice(0, input.indexOf(","))) : undefined);
  return { find, exact, code, norm };
}

/** Whether a name is a listed company; lets the file reader pick the right column. Empty until the company list has loaded. */
export function makeMatcher(index: SearchRow[]): NameMatcher | undefined {
  if (!index.length) return undefined;
  const { find } = makeLookup(index);
  return (name) => !!find(name) || !!SPLIT_NAMES[tidy(name).toUpperCase().replace(/\s+/g, " ")];
}

/** Match each name to a listed company. The search list is biggest company first, so an ambiguous name picks the larger company. */
export function matchNames(names: string[], index: SearchRow[]): { found: Found[]; missing: string[] } {
  const { find } = makeLookup(index);
  const found: Found[] = [], missing: string[] = [];
  const bySymbol = new Map(index.map((r) => [r[0], r]));
  for (const input of names) {
    const split = SPLIT_NAMES[tidy(input).toUpperCase().replace(/\s+/g, " ")];
    const parts = split ? split.map((sym) => bySymbol.get(sym)).filter((r): r is SearchRow => !!r) : [];
    if (parts.length) { parts.forEach((r) => found.push({ input, symbol: r[0], name: r[1], how: "split" })); continue; }   // a demerged company: the old share is now all of its parts
    const hit = find(input);
    if (hit) { found.push({ input, symbol: hit.row[0], name: hit.row[1], how: hit.how, ...(hit.code ? { code: true as const } : {}) }); continue; }
    const old = bySymbol.get(canon(tidy(input).toUpperCase()));
    if (old) found.push({ input, symbol: old[0], name: old[1], how: "alias" }); else missing.push(input);
  }
  return { found, missing };
}

/** Task #128: each line to a listed company BY ITS ISIN; a line's name is used only when the line has no ISIN. `answers` holds the ISIN answers
 *  (lib/isin.ts `resolveIsins`); an ISIN without an answer (the server could not be asked) falls back to the line's name, and that match is only offered
 *  to check, never added on its own. */
/** confirmNames (task #183): lines of a file or a pasted list that have no ISIN are matched by name and put up for the member to confirm, never added on
 *  their own. A line that is exactly a listed company's code (NSE symbol, NSE code, BSE code or BSE scrip ID: `code`) is as sure as an ISIN and is added:
 *  a broker's holdings report names every share that way, and all 42 of one member's shares waited under "Please check" (22 Nov 2026). */
export function matchEntries(entries: Entry[], index: SearchRow[], answers: ReadonlyMap<string, IsinAnswer> | null, confirmNames = false):
  { found: Found[]; check: ToCheck[]; skipped: Skipped[]; missing: string[]; byIsin: number } {
  const found: Found[] = [], check: ToCheck[] = [], skipped: Skipped[] = [];
  const named = entries.filter((e) => !e.isin).map((e) => e.name);
  const unanswered: Entry[] = [];
  let byIsin = 0;
  for (const e of entries) {
    if (!e.isin) continue;
    const a = answers?.get(e.isin), input = e.name || e.isin;
    if (!a) { unanswered.push(e); continue; }
    if (a.status === "matched" && a.symbol) { found.push({ input, symbol: a.symbol, name: a.name || a.symbol, how: a.how || "isin", isin: e.isin }); byIsin++; }
    else if (a.status === "check" && a.symbol) check.push({ input, symbol: a.symbol, name: a.name || a.symbol, how: a.how || "issuer", isin: e.isin, note: a.note || "Please check" });
    else skipped.push({ input, isin: e.isin, note: a.note || "Not a listed company's share." });
  }
  const byName = matchNames(named, index);
  if (confirmNames) byName.found.forEach((f) => (f.code ? found.push(f) : check.push({ ...f, note: "No ISIN on this line, so it is matched by its name: please check" })));
  else found.push(...byName.found);
  for (const e of unanswered) {
    const hit = e.name ? matchNames([e.name], index).found : [];
    if (hit.length) hit.forEach((h) => check.push({ ...h, isin: e.isin, note: `Its ISIN ${e.isin} could not be checked just now, so this is matched by the name in your file: please check` }));
    else skipped.push({ input: e.name || e.isin!, isin: e.isin!, note: "Its ISIN could not be checked just now. Try again in a moment." });
  }
  return { found, check, skipped, missing: byName.missing, byIsin };
}
