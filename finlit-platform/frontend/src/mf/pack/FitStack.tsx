// Audit of 26 Nov (files 39 and 40; the file 32 rule for bar labels): a stacked bar's slices carry their label only when it fits. The rule by size stays
// (a word from 14%, the percent from 4%: sliceLabel), and on a narrow screen a slice whose text is wider than the slice drops its word first, then its
// percent, so no label is ever cut mid-word ("5'", "Not loade" at 390 px). What is dropped stays in the legend under the bar and in the slice's title.
import { createElement, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

/** Sets data-fit on each slice of `stack`: "pct" hides its word (small, .mfm-w), "none" hides all its text. */
export function fitSlices(stack: HTMLElement): void {
  for (const i of Array.from(stack.children) as HTMLElement[]) {
    i.removeAttribute("data-fit");
    if (!i.textContent?.trim() || i.scrollWidth <= i.clientWidth + 1) continue;
    if (i.querySelector("small, .mfm-w")) { i.setAttribute("data-fit", "pct"); if (i.scrollWidth <= i.clientWidth + 1) continue; }
    i.setAttribute("data-fit", "none");
  }
}

/** A stacked bar (`.mfm-stack`, `.etp-bar`) that fits its labels on every render, when it is resized and when the fonts arrive. */
export function FitStack({ as = "span", className, children, ...rest }: { as?: "span" | "div"; className: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    fitSlices(el);
    let live = true;
    document.fonts?.ready.then(() => { if (live) fitSlices(el); }).catch(() => {});
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => fitSlices(el)) : null; ro?.observe(el);
    return () => { live = false; ro?.disconnect(); };
  });
  return createElement(as, { ref, className, ...rest }, children);
}
