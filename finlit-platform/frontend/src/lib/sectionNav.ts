// The stock page's sections, for the sticky section bar and its "All sections" panel: id, name, icon and a one-line hint of what the section holds,
// plus the pure keyboard rule of the panel's grid.
export type NavItem = [id: string, label: string, icon: string, hint: string];

export const NAV: NavItem[] = [
  ["prism", "Scores", "gauge", "The FinLit IQ and the FinLit Prism score, side by side"],
  ["business", "Company", "building", "What the company does and how it earns"],
  ["macro", "Macro outlook", "globe", "How the economy is moving for the sector: score, drivers and indicators"],
  ["notes", "Strengths & watch-outs", "notes", "Every red flag, watch item and strength in one list, each linking to its section"],
  ["price", "Price", "line", "Price chart, returns and technical levels"],
  ["quarter", "Quarter", "notes", "The latest quarter against a year ago"],
  ["financials", "Financials", "bars", "Profit and loss, balance sheet and cash flow, quarterly and yearly"],
  ["trends", "Trends", "line", "How sales, profit and cash have moved"],
  ["charts", "Charts", "bars", "Price history, statements and ownership in charts"],
  ["ratios", "Ratios", "gauge", "Valuation, returns, margins and debt"],
  ["dupont", "DuPont analysis", "layers", "What drives return on equity"],
  ["earnings", "Earnings & cash", "coins", "Is the profit real, and is it turning into cash?"],
  ["ownership", "Ownership", "pie", "Promoters, institutions and the public"],
  ["peers", "Peers", "layers", "How the company compares with its peers"],
  ["sector", "Where it stands", "activity", "Its industry, its peers, its own price and its risk, one question per tab"],
  ["insights", "What to watch", "crown", "Triggers to watch and where the company fits"],
  ["segments", "Segments", "pie", "Where the revenue comes from"],
  ["dividends", "Dividends", "coins", "Dividends, splits, bonuses and events"],
  ["announcements", "Announcements", "notes", "Exchange announcements, routine filings hidden"],
  ["community", "Discussions", "users", "What members are discussing about this company: read, reply or start one"],
];

/** The first section of each reading group: the bar draws a thin separator before it. */
export const GROUP_START = new Set(["price", "quarter", "ratios", "ownership", "insights", "dividends", "community"]);

/** Task #216 (README 1.8): each chip and each "All sections" line shows its section number ("01 Company" … "18 Discussions"); Scores and Announcements
 *  (which opens 17's third tab) have none. */
const NUMBERS: Record<string, string> = { business: "01", macro: "02", notes: "03", price: "04", quarter: "05", financials: "06", trends: "07", charts: "08", ratios: "09",
  dupont: "10", earnings: "11", ownership: "12", peers: "13", sector: "14", insights: "15", segments: "16", dividends: "17", community: "18" };
export const sectionNo = (id: string): string | null => NUMBERS[id] ?? null;
/** The Scores line follows the plan (one score per screen): Gold and Platinum speak only of FinLit Prism, Silver only of the FinLit IQ. */
const SCORES_HINT = { prism: "The FinLit Prism score: financial health and the technical view, side by side", iq: "The FinLit IQ: the overall score and its five pillars" } as const;
/** The sections to list (Where it stands took over the old Leadership section, final pages pack board 17), with the Scores line for the plan's score model. */
export const navFor = (model?: "prism" | "iq" | null): NavItem[] => NAV.map((n) => (n[0] === "prism" && model ? [n[0], n[1], n[2], SCORES_HINT[model]] : n));

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
