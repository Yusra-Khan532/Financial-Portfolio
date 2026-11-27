// Task #216 (company report handover, 17 Nov 2026, README 1.4): the texts of the 9 new i buttons, word for word from the pack's i-button-texts.json
// ("new_i_buttons"): four in Ownership's filing facts. The site's existing i buttons keep their own texts. The other five (Size, Style, Income, Momentum,
// Where it fits) belonged to Gold insights, which the founder removed in developer file 41 (25 Nov 2026).
import type { Glossary } from "./api";

export const NEW_I: Record<string, string> = {
  "Shareholders": "How many shareholders the company has, from its latest shareholding filing.",
  "Promoter shares pledged": "The share of promoter holdings pledged with lenders. Pledged shares can be sold if a loan goes bad.",
  "Shares outstanding": "Total shares issued. A rise means new shares were issued, which spreads profit across more shares.",
  "Shares under lock-in": "Shares that cannot be sold yet, usually after an IPO or a preferential issue.",
};
/** The glossary entry the site's i button (components/Info) shows for one of the new labels; null for any other label. */
export const newInfo = (label: string): Glossary | null => (NEW_I[label] ? { key: "i216-" + label.toLowerCase().replace(/[^a-z]+/g, "-"), label, what: NEW_I[label] } : null);
