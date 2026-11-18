// Task #216 (company report handover, 17 Nov 2026, README 1.4): the texts of the 9 new i buttons, word for word from the pack's i-button-texts.json
// ("new_i_buttons"): five in 15 (Size, Style, Income, Momentum, Where it fits) and four in 12's filing facts. The site's existing i buttons keep their own texts.
import type { Glossary } from "./api";

export const NEW_I: Record<string, string> = {
  "Size": "FinLit’s fixed size bands: large above ₹50,000 Cr, small below ₹10,000 Cr, mid in between.",
  "Style": "Value, blend or growth, from the company’s valuation against its growth.",
  "Income": "Low, moderate or high, from the dividend yield and how much profit is paid out.",
  "Momentum": "Oversold, neutral or overbought, from the 14-day RSI.",
  "Where it fits": "The theme and sector group the company belongs to on FinLit.",
  "Shareholders": "How many shareholders the company has, from its latest shareholding filing.",
  "Promoter shares pledged": "The share of promoter holdings pledged with lenders. Pledged shares can be sold if a loan goes bad.",
  "Shares outstanding": "Total shares issued. A rise means new shares were issued, which spreads profit across more shares.",
  "Shares under lock-in": "Shares that cannot be sold yet, usually after an IPO or a preferential issue.",
};
/** The glossary entry the site's i button (components/Info) shows for one of the new labels; null for any other label. */
export const newInfo = (label: string): Glossary | null => (NEW_I[label] ? { key: "i216-" + label.toLowerCase().replace(/[^a-z]+/g, "-"), label, what: NEW_I[label] } : null);
