// NSE's classification (task #183): each of NSE's 59 industries with its sector (22) and macro-economic sector (12), from the team's
// sector & industry pack of 15 Nov 2026 (taxonomy/industries.csv). A company's industry comes from its own report (profile.industry).
// Generated from the pack's file; edit the file, not this list.
export const NSE_INDUSTRY: Record<string, readonly [sector: string, macro: string]> = {
 "Aerospace & Defense": [
  "Capital Goods",
  "Industrials"
 ],
 "Agricultural Food & other Products": [
  "Fast Moving Consumer Goods",
  "Fast Moving Consumer Goods"
 ],
 "Agricultural, Commercial & Construction Vehicles": [
  "Capital Goods",
  "Industrials"
 ],
 "Auto Components": [
  "Automobile and Auto Components",
  "Consumer Discretionary"
 ],
 "Automobiles": [
  "Automobile and Auto Components",
  "Consumer Discretionary"
 ],
 "Banks": [
  "Financial Services",
  "Financial Services"
 ],
 "Beverages": [
  "Fast Moving Consumer Goods",
  "Fast Moving Consumer Goods"
 ],
 "Capital Markets": [
  "Financial Services",
  "Financial Services"
 ],
 "Cement & Cement Products": [
  "Construction Materials",
  "Commodities"
 ],
 "Chemicals & Petrochemicals": [
  "Chemicals",
  "Commodities"
 ],
 "Cigarettes & Tobacco Products": [
  "Fast Moving Consumer Goods",
  "Fast Moving Consumer Goods"
 ],
 "Commercial Services & Supplies": [
  "Services",
  "Services"
 ],
 "Construction": [
  "Construction",
  "Industrials"
 ],
 "Consumable Fuels": [
  "Oil Gas & Consumable Fuels",
  "Energy"
 ],
 "Consumer Durables": [
  "Consumer Durables",
  "Consumer Discretionary"
 ],
 "Diversified": [
  "Diversified",
  "Diversified"
 ],
 "Diversified FMCG": [
  "Fast Moving Consumer Goods",
  "Fast Moving Consumer Goods"
 ],
 "Diversified Metals": [
  "Metals & Mining",
  "Commodities"
 ],
 "Electrical Equipment": [
  "Capital Goods",
  "Industrials"
 ],
 "Engineering Services": [
  "Services",
  "Services"
 ],
 "Entertainment": [
  "Media Entertainment & Publication",
  "Consumer Discretionary"
 ],
 "Ferrous Metals": [
  "Metals & Mining",
  "Commodities"
 ],
 "Fertilizers & Agrochemicals": [
  "Chemicals",
  "Commodities"
 ],
 "Finance": [
  "Financial Services",
  "Financial Services"
 ],
 "Financial Technology (Fintech)": [
  "Financial Services",
  "Financial Services"
 ],
 "Food Products": [
  "Fast Moving Consumer Goods",
  "Fast Moving Consumer Goods"
 ],
 "Gas": [
  "Oil Gas & Consumable Fuels",
  "Energy"
 ],
 "Healthcare Equipment & Supplies": [
  "Healthcare",
  "Healthcare"
 ],
 "Healthcare Services": [
  "Healthcare",
  "Healthcare"
 ],
 "Household Products": [
  "Fast Moving Consumer Goods",
  "Fast Moving Consumer Goods"
 ],
 "IT - Hardware": [
  "Information Technology",
  "Information Technology"
 ],
 "IT - Services": [
  "Information Technology",
  "Information Technology"
 ],
 "IT - Software": [
  "Information Technology",
  "Information Technology"
 ],
 "Industrial Manufacturing": [
  "Capital Goods",
  "Industrials"
 ],
 "Industrial Products": [
  "Capital Goods",
  "Industrials"
 ],
 "Insurance": [
  "Financial Services",
  "Financial Services"
 ],
 "Leisure Services": [
  "Consumer Services",
  "Consumer Discretionary"
 ],
 "Media": [
  "Media Entertainment & Publication",
  "Consumer Discretionary"
 ],
 "Metals & Minerals Trading": [
  "Metals & Mining",
  "Commodities"
 ],
 "Minerals & Mining": [
  "Metals & Mining",
  "Commodities"
 ],
 "Non - Ferrous Metals": [
  "Metals & Mining",
  "Commodities"
 ],
 "Oil": [
  "Oil Gas & Consumable Fuels",
  "Energy"
 ],
 "Other Construction Materials": [
  "Construction Materials",
  "Commodities"
 ],
 "Other Consumer Services": [
  "Consumer Services",
  "Consumer Discretionary"
 ],
 "Other Utilities": [
  "Utilities",
  "Utilities"
 ],
 "Paper, Forest & Jute Products": [
  "Forest Materials",
  "Commodities"
 ],
 "Personal Products": [
  "Fast Moving Consumer Goods",
  "Fast Moving Consumer Goods"
 ],
 "Petroleum Products": [
  "Oil Gas & Consumable Fuels",
  "Energy"
 ],
 "Pharmaceuticals & Biotechnology": [
  "Healthcare",
  "Healthcare"
 ],
 "Power": [
  "Power",
  "Utilities"
 ],
 "Printing & Publication": [
  "Media Entertainment & Publication",
  "Consumer Discretionary"
 ],
 "Realty": [
  "Realty",
  "Consumer Discretionary"
 ],
 "Retailing": [
  "Consumer Services",
  "Consumer Discretionary"
 ],
 "Telecom - Equipment & Accessories": [
  "Telecommunication",
  "Telecommunication"
 ],
 "Telecom - Services": [
  "Telecommunication",
  "Telecommunication"
 ],
 "Textiles & Apparels": [
  "Textiles",
  "Consumer Discretionary"
 ],
 "Trading": [
  "Services",
  "Services"
 ],
 "Transport Infrastructure": [
  "Services",
  "Services"
 ],
 "Transport Services": [
  "Services",
  "Services"
 ]
} as const;
export const NSE_SECTORS = ["Automobile and Auto Components", "Capital Goods", "Chemicals", "Construction", "Construction Materials", "Consumer Durables", "Consumer Services", "Diversified", "Fast Moving Consumer Goods", "Financial Services", "Forest Materials", "Healthcare", "Information Technology", "Media Entertainment & Publication", "Metals & Mining", "Oil Gas & Consumable Fuels", "Power", "Realty", "Services", "Telecommunication", "Textiles", "Utilities"] as const;
export const NSE_MACRO = ["Commodities", "Consumer Discretionary", "Diversified", "Energy", "Fast Moving Consumer Goods", "Financial Services", "Healthcare", "Industrials", "Information Technology", "Services", "Telecommunication", "Utilities"] as const;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const BY = new Map(Object.entries(NSE_INDUSTRY).map(([k, v]) => [norm(k), [k, ...v] as const]));
/** The three levels for a company from its industry; null when the industry is not one of NSE's 59 (the page then says so). */
export function nseLevels(industry: string | null | undefined): { industry: string; sector: string; macro: string } | null {
  const hit = industry ? BY.get(norm(industry)) : undefined;
  return hit ? { industry: hit[0], sector: hit[1], macro: hit[2] } : null;
}
