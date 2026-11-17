/** Load a part of the site that is not needed for the first paint (the search window, Ask FinLit AI) once the browser has nothing else to do, so it
 *  is ready before the visitor clicks, without being in the first download. Errors are ignored here: opening the part loads it again (with its retry). */
export function preloadWhenIdle(load: () => Promise<unknown>, delayMs = 2500): () => void {
  if (typeof window === "undefined") return () => {};
  let idle: number | undefined;
  const run = () => { void load().catch(() => {}); };
  const timer = window.setTimeout(() => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) idle = ric(run, { timeout: 5000 });
    else run();
  }, delayMs);
  return () => {
    window.clearTimeout(timer);
    const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (idle !== undefined && cic) cic(idle);
  };
}
