// A company listed only on the BSE has its 6-digit BSE code as its symbol (for example 526775). Lists show such a company by its NAME, never by the bare number;
// the code stays in the address (/stocks/526775) and on the company's own page. One rule for every list, so a new list cannot forget it.
type Co = { symbol: string; name?: string | null; exchange?: string | null };

export const isBseCode = (symbol: string): boolean => /^\d+$/.test(symbol);
/** What to print as the bold title of a company: its name for a BSE-only company, else its symbol. With no name on file the code is shown (see `codeNote`). */
export const titleOf = (r: Co): string => (isBseCode(r.symbol) && r.name ? r.name : r.symbol);
/** The small line under the title: the company name, left out when the name is already the title. */
export const subOf = (r: Co): string | null => (isBseCode(r.symbol) && r.name ? null : r.name || null);
/** The reason to show on hover when a BSE code had to stay the title because no name is stored. */
export const codeNote = (r: Co): string | undefined => (isBseCode(r.symbol) && !r.name ? "BSE code. The company name is not in our data yet." : undefined);
/** The exchange a company is listed on, when known: the row's own field (from the company record), else BSE for a numeric symbol. Null when neither says. */
export const exchangeOf = (r: Co): "NSE" | "BSE" | null => (r.exchange === "NSE" || r.exchange === "BSE" ? r.exchange : isBseCode(r.symbol) ? "BSE" : null);
/** True for a company listed on the BSE only (no NSE listing): the ones the "NSE-listed only" option leaves out. */
export const isBseOnly = (r: Co): boolean => exchangeOf(r) === "BSE";
/** The small tag for a BSE-only company: the exchange and its scrip code (the code is the symbol for such a company). Null for an NSE-listed one. */
export const exchangeTag = (r: Co): string | null => (isBseOnly(r) ? (isBseCode(r.symbol) ? `BSE only, code ${r.symbol}` : "BSE only") : null);

// Task #246 (name first, 19 Nov 2026): the one way every list, table, chip and card labels a company. For a BSE-only company (its symbol is a BSE code) the NAME
// leads and the code moves to the small line as "BSE 526433"; an NSE symbol is unchanged. Links stay /stocks/<symbol>.
/** The company name without a trailing "Limited" / "Ltd" / "Ltd.": for chips and tight single-line labels. */
export const shortName = (name: string | null | undefined): string => String(name ?? "").replace(/\s+(Limited|Ltd\.?)$/i, "").trim();
/** Cut to `max` characters with "…" at the end (the cut never ends on a space). */
export const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);
export type CoLabel = { main: string; code: string | null; title: string };
/** The parts of a company label: `main` (what the bold label shows), `code` ("BSE 526433" for a BSE-only company with a name, else null) and `title` (the hover text). */
export function coLabel(r: Co): CoLabel {
  if (isBseCode(r.symbol) && r.name) return { main: r.name, code: `BSE ${r.symbol}`, title: `${r.name} · BSE ${r.symbol}` };
  if (isBseCode(r.symbol)) return { main: r.symbol, code: null, title: codeNote(r)! };
  return { main: r.symbol, code: null, title: r.name || r.symbol };
}
/** A single-line label (a chip, a chart label, a tight cell): the short name, cut to `max`, for a BSE-only company with a name; the symbol otherwise. */
export const shortLabel = (r: Co, max = 22): string => (isBseCode(r.symbol) && r.name ? clip(shortName(r.name), max) : r.symbol);
/** The small line under a label: "BSE 526433" then what the line showed before (`sub`), never repeating the name. NSE: `sub` unchanged. */
export function subLine(r: Co, sub?: string | null): string | null {
  const l = coLabel(r), parts: string[] = [];
  if (l.code) parts.push(l.code);
  const s = (sub ?? "").trim();
  if (s && !(l.code && r.name && s === r.name.trim())) parts.push(s);
  return parts.length ? parts.join(" · ") : null;
}
/** The hover text for a label: the full name and code (or why the name is missing) for a BSE code; undefined for an NSE symbol, so its markup is unchanged. */
export const coTitle = (r: Co): string | undefined => (isBseCode(r.symbol) ? coLabel(r).title : undefined);
/** The symbol as a small tag beside a name that already leads: "BSE 526433" for a BSE code, the NSE symbol unchanged. */
export const codeText = (symbol: string): string => (isBseCode(symbol) ? `BSE ${symbol}` : symbol);
/** Sort key for a company column: the label that is shown. */
export const sortLabel = (r: Co): string => coLabel(r).main.toLowerCase();
