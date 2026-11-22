// Task #310 part D: does the page on screen sit inside AppShell (the left menu)? The top bar is drawn above the route, so AppShell says so here when it
// mounts (before paint) and the header drops the destinations the left menu already lists. A plain counter, so two shells never confuse it.
import { useLayoutEffect, useSyncExternalStore } from "react";

let count = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => count > 0;

/** Called by AppShell: marks the left menu as on screen while it is mounted. */
export function useMarkShell(): void {
  useLayoutEffect(() => { count += 1; emit(); return () => { count -= 1; emit(); }; }, []);
}

/** True while a page with the left menu is on screen. */
export const useInShell = (): boolean => useSyncExternalStore(sub, get, () => false);
