// The stock page's sections, for the sticky section bar and its "All sections" panel: id, name, icon and a one-line hint of what the section holds,
// plus the pure keyboard rule of the panel's grid.
export type NavItem = [id: string, label: string, icon: string, hint: string];

/** Developer file 41 (founder, 25 Nov 2026): the report runs like a funnel, from the company out to its industry, its sector and the economy; News and
 *  filings and the Discussions stay last. Chart lab (old 08) is merged into the sections it repeated and Gold insights (old 15) is gone. This list is the
 *  one order: the page draws its sections in it, and each section's number comes from it (a test holds the page to it). */
export const NAV: NavItem[] = [
  ["prism", "Scores", "gauge", "The FinLit Prism score: financial health and the technical view, side by side"],
  // the company
  ["business", "Company", "building", "What the company does and how it earns"],
  ["notes", "Strengths & watch-outs", "notes", "Every red flag, watch item and strength in one list, each linking to its section"],
  ["price", "Price", "line", "Price chart, returns, technical levels and price statistics"],
  ["quarter", "Quarter", "notes", "The latest quarter against a year ago"],
  ["financials", "Financials", "bars", "Profit and loss, balance sheet and cash flow, quarterly and yearly, in tables and charts"],
  ["trends", "Trends", "line", "How sales, profit and cash have moved"],
  ["segments", "Segments", "pie", "Where the revenue comes from"],
  ["ratios", "Ratios", "gauge", "Valuation, returns, margins and debt"],
  ["dupont", "DuPont analysis", "layers", "What drives return on equity"],
  ["earnings", "Earnings & cash", "coins", "Is the profit real, and is it turning into cash?"],
  ["dividends", "Dividends", "coins", "Dividend history, bonus issues and splits, and what it would pay you"],
  ["ownership", "Ownership", "pie", "Promoters, institutions and the public"],
  // its industry, its sector and the economy
  ["peers", "Peers", "layers", "How the company compares with its peers"],
  ["sector", "Industry", "activity", "Its industry against the others, and where the company ranks inside it"],   // developer file 47: the peers are 13's; no Risk tab
  ["macro", "Economy", "globe", "Is the economy helping its sector? The reading, its drivers and indicators"],
  // what it has filed, and what members say
  ["news", "News & filings", "notes", "Everything the company has filed with NSE, by group; routine filings hidden"],
  ["community", "Discussions", "users", "What members are discussing about this company: read, reply or start one"],
];

/** Developer file 48 (founder, 27 Nov 2026: "the headings of the sections are too vague"): each report section's one heading says what the section
 *  shows, in plain words, without the company's name. The section bar and the All sections panel keep the short names in NAV above. */
export const HEADING: Record<string, string> = {
  business: "What the company does",
  notes: "Strengths and points to watch",
  price: "Share price and trend",
  quarter: "Latest quarterly results",
  financials: "Profit & loss, balance sheet and cash flow",
  trends: "Sales, profit and cash over the years",
  segments: "Revenue by business segment",
  ratios: "Valuation, returns, margins and debt",
  dupont: "DuPont analysis: what drives return on equity",   // the founder looked for "DuPont" (27 Nov 2026, 2:17 pm): the name stays in the heading
  earnings: "Profit quality and cash flow",
  dividends: "Dividends paid to shareholders",
  ownership: "Who owns the shares",
  peers: "How it compares with its peers",
  sector: "How its industry is doing",
  macro: "How the economy affects its sector",
  news: "Exchange filings and news",
  community: "Community discussions",
};

/** The first section of each reading group: the bar draws a thin separator before it (price · results · ratios · shareholders · industry, sector and
 *  economy · filings and discussions). */
export const GROUP_START = new Set(["price", "quarter", "ratios", "dividends", "peers", "news"]);

/** Each chip, each "All sections" line and each section heading shows its number ("01 Company" … "17 Discussions"); Scores has none. The numbers follow
 *  NAV, so moving a section renumbers every place at once. */
const NUMBERS: Record<string, string> = Object.fromEntries(NAV.filter(([id]) => id !== "prism").map(([id], i) => [id, String(i + 1).padStart(2, "0")]));
export const sectionNo = (id: string): string | null => NUMBERS[id] ?? null;
/** The sections to list (Where it stands took over the old Leadership section, final pages pack board 17). Task #283: the Scores line names FinLit Prism,
 *  FinLit's only company score, for every plan. */
export const navFor = (model?: "prism" | null): NavItem[] => { void model; return NAV; };

/** Where arrow keys move inside the panel's grid of `n` items laid out in `cols` columns: Left/Right step one (wrapping), Up/Down step a row (staying put at the
 *  top and bottom edge), Home/End jump to the ends. Any other key returns the same index. */
export function moveIndex(i: number, key: string, n: number, cols: number): number {
  if (n <= 0) return -1;
  const c = Math.max(1, cols), last = n - 1;
  switch (key) {
    case "ArrowRight": return i >= last ? 0 : i + 1;
    case "ArrowLeft": return i <= 0 ? last : i - 1;
    case "ArrowDown": return i + c <= last ? i + c : i;
    case "ArrowUp": return i - c >= 0 ? i - c : i;
    case "Home": return 0;
    case "End": return last;
    default: return i;
  }
}

/** The number of columns a CSS grid is drawing, read from its computed template (falls back to 1). */
export const columnsOf = (template: string): number => Math.max(1, template.split(" ").filter(Boolean).length);
