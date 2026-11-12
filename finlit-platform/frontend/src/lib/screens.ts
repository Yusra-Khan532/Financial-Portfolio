// Saved screener filters. Kept in this browser and mirrored to the account when signed in (see lib/sync.tsx).
import { useSyncExternalStore } from "react";
import type { State } from "./screener";

/** `notify`: "Tell me when a company joins" (task #64, file 04): true sends a message after each close naming the companies that joined or left; false keeps the screen
 *  quiet; a screen saved before the choice existed has none, and the server keeps emailing it as before. */
export type SavedScreen = { name: string; state: State; notify?: boolean };
const KEY = "finlit-saved-screens";
function read(): SavedScreen[] { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }

let list: SavedScreen[] = typeof localStorage === "undefined" ? [] : read();
const subs = new Set<() => void>();
let onSave: ((s: SavedScreen[]) => void) | null = null;
const commit = (next: SavedScreen[], remote = false) => {
  list = next;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ }
  subs.forEach((f) => f());
  if (!remote) onSave?.(list);
};

export const screens = {
  get: () => list,
  subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f); },
  save: (name: string, state: State, max: number, notify?: boolean) => commit([{ name, state, ...(notify === undefined ? {} : { notify }) }, ...list.filter((s) => s.name !== name)].slice(0, max)),
  setNotify: (name: string, notify: boolean) => commit(list.map((s) => (s.name === name ? { ...s, notify } : s))),
  remove: (name: string) => commit(list.filter((s) => s.name !== name)),
  replace: (next: SavedScreen[]) => commit(next, true),
  onSave: (f: ((s: SavedScreen[]) => void) | null) => { onSave = f; },
};
export const useSavedScreens = () => useSyncExternalStore(screens.subscribe, screens.get, screens.get);
