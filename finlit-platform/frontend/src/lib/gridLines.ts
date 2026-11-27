// Developer file 30: the line of the file each spreadsheet row came from. A grid (lib/holdingsFile) leaves blank lines out, so a row's place in it is not its
// line: a broker's report with a blank line under its summary was shown one line early in the MF and ETF import reviews ("Line 4" for a fund on line 5).
// Excel files keep the sheet's own row number (also when the sheet starts lower than row 1); text files count every record, blank ones included.
// Its own small module, so the ETF page can number lines without loading the file reader up front.
import type { Grid } from "./holdingsFile";

const LINES = new WeakMap<Grid, number[]>();
/** Records the line in the file of each row of a grid read from a file. */
export function setLines(grid: Grid, lines: number[]): Grid { LINES.set(grid, lines); return grid; }
/** The line in the file of a grid's row `i`, as the member sees it in Excel or a text editor; `i + 1` for a grid not read from a file. */
export function lineOf(grid: Grid, i: number): number { return LINES.get(grid)?.[i] ?? i + 1; }
