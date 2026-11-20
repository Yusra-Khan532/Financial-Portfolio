// Task #262 (owner's rule, 20 Nov 2026): company sizes went from three to four. Under the old rule "Small" meant below ₹10,000 Cr; that
// band is "Micro" now, and today's "Small" is ₹10,000–25,000 Cr. Size filters the browser keeps (saved screens in localStorage, and the
// size part of an old shared screener link) are moved from Small to Micro once, so a saved filter keeps picking the same companies it did.
// Saved screens: migrated once per browser, behind a version marker (SIZE_VERSION_KEY), so it never runs twice. Links: a link written under
// the new rule carries a marker (scoreScreen's `sz=4`, the Stock screener's `z: 4`), so only links without it are read as old ones.
// Server copies (saved screens and alerts of a signed-in member) are moved by the server itself, which marks each moved screen with
// `sizesMoved: "2026-11-20"`; the browser never moves those again (a screen with `sizesMoved` is skipped here, and a fresh browser sets the
// version marker before any server copy arrives, so a screen saved under the new rule is never read as an old one).
import { useEffect, useState } from "react";

export const SIZE_NOTE = "Company sizes changed on 20 Nov 2026: your Small filter now reads Micro.";
/** localStorage: "4" once this browser's saved filters are on the four-size rule. */
export const SIZE_VERSION_KEY = "finlit-size-rule";
/** localStorage: "1" while the one-time note is still to be shown; "0" once shown. */
export const SIZE_NOTE_KEY = "finlit-size-note";

/** A size list with the old "Small" (or "small") read as Micro; every other value unchanged, no duplicates. */
export function migrateSmall<T extends string>(list: readonly T[]): T[] {
  const out: T[] = [];
  for (const v of list) { const n = (v === "Small" ? "Micro" : v === "small" ? "micro" : v) as T; if (!out.includes(n)) out.push(n); }
  return out;
}
const hasSmall = (list: unknown): list is string[] => Array.isArray(list) && list.some((v) => v === "Small" || v === "small");

/** Saved screens with each size filter moved from Small to Micro, and whether anything changed. Pure (exported for tests). */
export function migrateScreens<S extends { state?: unknown; sizesMoved?: string | null }>(list: S[]): { list: S[]; changed: boolean } {
  let changed = false;
  const next = list.map((s) => {
    const st = s?.state as { caps?: unknown } | undefined;
    if (!st || s.sizesMoved || !hasSmall(st.caps)) return s;
    changed = true;
    return { ...s, state: { ...st, caps: migrateSmall(st.caps) } };
  });
  return { list: next, changed };
}

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window: runs again next visit, harmlessly, as nothing was saved either */ } };

/** Runs the one-time move on the saved screens kept under `key` (once per browser); returns the list to use. */
export function migrateStoredScreens<S extends { state?: unknown; sizesMoved?: string | null }>(key: string, list: S[]): S[] {
  if (get(SIZE_VERSION_KEY) === "4") return list;
  const r = migrateScreens(list);
  if (r.changed) { set(key, JSON.stringify(r.list)); flagSizeNote(); }
  set(SIZE_VERSION_KEY, "4");
  return r.list;
}

/** Asks for the one-time note (a migrated filter is about to be shown). */
export const flagSizeNote = () => { if (get(SIZE_NOTE_KEY) !== "0") set(SIZE_NOTE_KEY, "1"); };

/** Whether the note should show on this page view, and a way to close it.
 *  `link`: an old link's size filter was just read as Micro (shown each time such a link is opened, as it is moved each time).
 *  `saved`: a saved screen was moved (in this browser, or by the server: `sizesMoved`); shown once, until closed or until the next visit.
 *  Closing (or the first showing of a saved-screen note) is remembered in localStorage (SIZE_NOTE_KEY = "0"); `sizesMoved` stays on the
 *  screen as the server sent it. */
export function useSizeNote(link: boolean, saved = false): [boolean, () => void] {
  const due = (s: boolean) => link || ((s || get(SIZE_NOTE_KEY) === "1") && get(SIZE_NOTE_KEY) !== "0");
  const [on, setOn] = useState(() => due(saved));
  const [closed, setClosed] = useState(false);
  useEffect(() => { if (!closed && due(saved)) setOn(true); }, [link, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (on && !link) set(SIZE_NOTE_KEY, "0"); }, [on, link]);
  return [on && !closed, () => { setClosed(true); setOn(false); set(SIZE_NOTE_KEY, "0"); }];
}
