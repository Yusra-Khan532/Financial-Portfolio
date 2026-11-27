// Audit of 26 Nov (developer file 38, F6 in every column set of Your shares): a column label of three words or more is set on two lines, broken where the
// two lines come out most even, so no heading wraps to a third line ("Avg buy price" was 3 lines in By sector and By company size, "Debt to equity" in
// Ratios, "Net sales / revenue" in Financials) and the heading row stays within 56 px. The space stays in the text, so the label reads the same.
import type { ReactNode } from "react";

/** The two lines of `label` (one line when it is short): [first, second]. */
export function splitTwo(label: string): [string] | [string, string] {
  const w = label.split(" ");
  if (w.length < 3 || label.length < 13) return [label];
  const len = (k: number) => Math.max(w.slice(0, k).join(" ").length, w.slice(k).join(" ").length);
  // a line never starts with a sign such as "/" or "·": it stays with the word before it
  const ok = (k: number) => /[\p{L}\p{N}]/u.test(w[k]);
  let at = 0;
  for (let k = 1; k < w.length; k++) if (ok(k) && (!at || len(k) < len(at))) at = k;
  if (!at) return [label];
  return [w.slice(0, at).join(" "), w.slice(at).join(" ")];
}

export function twoLines(label: string): ReactNode {
  const l = splitTwo(label);
  return l.length === 1 ? label : <span className="pfx-l2">{l[0] + " "}<br />{l[1]}</span>;
}
