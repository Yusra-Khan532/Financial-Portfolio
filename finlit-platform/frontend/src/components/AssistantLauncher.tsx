// Ask FinLit AI without it in the first download: the panel and its question bank (about 65 KB) load the first time a visitor opens it, or earlier when
// the browser is idle. The panel drew nothing while closed, so nothing on the page changes; the first opening event, which fires before the panel is
// loaded and listening, opens it as soon as it arrives.
import { Suspense, useEffect, useState } from "react";
import { lazyPage } from "../lib/resilience";
import { preloadWhenIdle } from "../lib/idle";
import { OPEN_AI } from "./assistantEvents";

const load = () => import("./Assistant").then((m) => ({ default: m.Assistant }));
const Assistant = lazyPage(load);

export function AssistantLauncher({ sector }: { sector?: string | null } = {}) {
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (asked) return;
    const o = () => setAsked(true);
    addEventListener(OPEN_AI, o);
    return () => removeEventListener(OPEN_AI, o);
  }, [asked]);
  useEffect(() => preloadWhenIdle(load), []);
  if (!asked) return null;
  return <Suspense fallback={null}><Assistant sector={sector} startOpen /></Suspense>;
}
