import type { ReactNode } from "react";
import { ChartZoom } from "./ChartZoom";

/** The same enlarge arrow as the charts, for a results table (task #41, #44): an arrow in the corner of the card opens the SAME table, not a copy,
 *  in a full-screen dialog, so its sorting, columns and scroll position carry over. Esc, Restore or a click outside close it.
 *  The wrapper carries `data-chart` only so the shared enlarge component knows there is something to enlarge. */
export function TableZoom({ label, children }: { label: string; children: ReactNode }) {
  return <ChartZoom label={label} kind="table" className="cz-table"><div data-chart className="cz-tbl">{children}</div></ChartZoom>;
}
