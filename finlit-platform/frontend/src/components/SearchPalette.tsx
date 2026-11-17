// The site-wide search box (Ctrl K or "/"). Kept under this name for the layout; the search itself lives in ./search/.
// The search window (about 25 KB) is not in the first download: it loads the first time search opens, or earlier when the browser is idle, and
// stays mounted after that. Until then nothing is drawn, exactly as the window drew nothing while closed.
import { Suspense, useEffect, useState } from "react";
import { lazyPage } from "../lib/resilience";
import { preloadWhenIdle } from "../lib/idle";

const load = () => import("./search/SearchOverlay").then((m) => ({ default: m.SearchOverlay }));
const SearchOverlay = lazyPage(load);

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [used, setUsed] = useState(open);
  useEffect(() => { if (open) setUsed(true); }, [open]);
  useEffect(() => preloadWhenIdle(load), []);
  if (!used && !open) return null;
  return <Suspense fallback={null}><SearchOverlay open={open} onClose={onClose} /></Suspense>;
}
