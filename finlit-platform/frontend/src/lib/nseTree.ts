// NSE's classification (macro sector 12 > sector 22 > industry 59) as lists, derived from the site's one copy in nseTaxonomy.ts (task #183, used by #257 too).
// Task #258 (20 Nov handoff, SHARED §1): the screener lists every name of each level; a test checks the tree against the backend's file.
import { NSE_INDUSTRY, NSE_MACRO, NSE_SECTORS as SECTOR_NAMES } from "./nseTaxonomy";

export type NseSector = { name: string; macro: string };
export type NseIndustry = { name: string; sector: string; macro: string };
export const NSE_MACROS: string[] = [...NSE_MACRO];
export const NSE_INDUSTRIES: NseIndustry[] = Object.entries(NSE_INDUSTRY).map(([name, [sector, macro]]) => ({ name, sector, macro }));
export const NSE_SECTORS: NseSector[] = SECTOR_NAMES.map((name) => ({ name, macro: NSE_INDUSTRIES.find((i) => i.sector === name)?.macro ?? "" }));
