// Task #391 PR A (developer file 35, Section bar and Phone): one stop of All together at a time.
//   MiStepCtx / MiStep  a stop's sections show when that stop is chosen in the section bar or All sections is on. On a phone with All sections on, every
//                       stop after the first folds to its own heading block (step number, title and the step's first line) with "Open ▾"; "Close ▴" folds
//                       it again. The block is found as the pack's hdOf() does: the section's heading block (.mi-sh), and for What changed the inner
//                       section (.mi7-wc > section.wc) with its heading and its Discover line. With one stop chosen nothing folds.
// Styles: styles/mi391.css (mi391-fold). Describes; never advises.
import { createContext, useContext, useState, type ReactNode } from "react";
import { useIsPhone } from "../components/PhoneFold";

export const MiStepCtx = createContext<{ step: string; first: string }>({ step: "all", first: "" });

export function MiStep({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { step, first } = useContext(MiStepCtx), phone = useIsPhone(), [open, setOpen] = useState(false);
  if (step !== "all" && step !== id) return null;
  if (step !== "all" || !phone || id === first) return <>{children}</>;
  return (
    <div className={"mi391-fold" + (open ? " open" : "")} data-fold={id}>
      {open && <button type="button" className="mi391-fc" aria-expanded="true" aria-label={`Close ${title}`} onClick={() => setOpen(false)}>Close <i aria-hidden="true">▴</i></button>}
      {children}
      {!open && <button type="button" className="mi391-fo" aria-expanded="false" aria-label={`Open ${title}`} onClick={() => setOpen(true)}>Open <i aria-hidden="true">▾</i></button>}
    </div>);
}
