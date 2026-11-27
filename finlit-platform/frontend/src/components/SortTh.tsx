// Task #224 (A1): a table heading that sorts. The heading text is a button (Enter and Space work), with ↕ at rest and ▲ / ▼ in a filled blue box while it
// sorts; the heading carries aria-sort. Anything after the label (an i button) stays outside the button. Styles: styles/tablesort.css.
import type { ReactNode } from "react";
import type { SortState } from "../lib/tableSort";
import "../styles/tablesort.css";

export function SortTh({ k, label, sort, onSort, className, after, colSpan, rowSpan }: { k: string; label: ReactNode; sort: SortState; onSort: (k: string) => void; className?: string; after?: ReactNode; colSpan?: number; rowSpan?: number }) {
  const on = sort?.key === k ? sort.dir : null;
  return (
    <th scope="col" className={(className ? className + " " : "") + "ts-th" + (on ? " ts-on" : "")} aria-sort={on === "desc" ? "descending" : on === "asc" ? "ascending" : "none"} colSpan={colSpan} rowSpan={rowSpan}>
      <button type="button" className="ts-b" onClick={() => onSort(k)} title={on ? "Sorted; click to change" : "Click to sort"}>
        <span className="ts-l">{label}</span><span className="ts-i" aria-hidden="true">{on === "desc" ? "▼" : on === "asc" ? "▲" : "↕"}</span>
      </button>{after}
    </th>
  );
}
