// Task #389 PR B (developer file 32, Mix & overlap 2 and 9, Words W22/W23, fault 10 on the page side): the ONE place the MF (and ETF) pages turn the
// name sent with a holding inside a fund into what the page shows. The server sends `name` for each stock inside a fund: today the fund house's own
// text ("ITC LTD", "EQ - BHARTI AIRTEL LTD.", "HDFC Bank Limited"); once the backend sends the listed-company master's name (task #389 PR C, fault 10)
// that same field carries "ITC Ltd". Both go through here, so nothing else on the page changes when the backend does.
//   holdingName   the full name for titles and tooltips: no "EQ - " prefix, words in capitals written in name case, abbreviations kept in capitals
//                 (ITC, NTPC, NHPC, SRF, ONGC, SAIL, TCS, HPCL …), "of", "and", "the" lower case inside a name.
//   holdingShort  the short name for chips, tables and sentences (shortCo: no Ltd/Limited, long names cut to two or three words), with the few
//                 well-known short forms the market uses (Oil & Natural Gas Corporation → ONGC).
import { nameCase, shortCo } from "../portfolio/shared/words";

/** Words that are abbreviations: they stay in capitals whatever case the fund file used (developer file 32, Mix 2; the preview's list). */
export const ABBREV = new Set(("ITC NHPC NTPC SRF LNG HDFC ICICI SBI LIC BHEL ONGC GAIL IRCTC NMDC PI KPR CMS ABB MRF UPL ACC BEL BPCL HPCL IOC IGL MGL NCC RBL IDFC HCL TCS AU " +
  "ESAB RHI CG KEI JSW JK SKF ZF TTK EID GE TD T&D IPCA SBFC CSB PB DLF PVR IRB MOIL NBCC SJVN RVNL IRFC HUDCO REC PFC BSE CDSL MCX CAMS HAL BDL GRSE DCB IIFL LG " +
  "MIM BLW HSBC KFIN NSE CESC GMR IEX LTIM TVS DOMS PNB IDBI UCO BOB AIA VIP KNR PNC EPL PTC GHCL TTML ZEE NLC MMTC KIMS SAIL INOX ICRA CRISIL NIIT MTAR " +
  "LT IT BSES CCL GNFC GSFC GSPL KEC NOCIL PCBL RITES SIS TBO UTI").split(" "));

/** Names whose usual short form is not their first words (the preview's map, keyed in lower case without Ltd/Limited). */
const SHORT_FORM: Record<string, string> = {
  "oil & natural gas corporation": "ONGC", "oil and natural gas corporation": "ONGC", "krishna institute of medical sciences": "KIMS",
  "adani ports & special economic zone": "Adani Ports", "adani ports and special economic zone": "Adani Ports", "hindustan petroleum corporation": "HPCL",
  "bharat petroleum corporation": "BPCL", "indian oil corporation": "Indian Oil", "godrej consumer products": "Godrej Consumer",
  "kalpataru projects international": "Kalpataru Projects", "honeywell automation india": "Honeywell Automation", "sun pharmaceutical industries": "Sun Pharma",
  "dr. reddy's laboratories": "Dr. Reddy's", "go digit general insurance": "Go Digit", "cholamandalam investment and finance": "Cholamandalam Finance",
  "cholamandalam investment & finance": "Cholamandalam Finance", "navin fluorine international": "Navin Fluorine", "tata consultancy services": "TCS",
  "info edge (india)": "Info Edge", "colgate palmolive (india)": "Colgate-Palmolive", "steel authority of india": "SAIL", "larsen & toubro": "Larsen & Toubro",
  "amazon com inc": "Amazon", "alphabet inc a": "Alphabet", "alphabet inc": "Alphabet", "microsoft corp": "Microsoft", "netflix inc": "Netflix",
};

/** One word written in capitals in the file ("BANK", "(INDIA)", "AUTO-COMPONENTS") in name case, unless it is an abbreviation. */
function wordCase(w: string): string {
  if (ABBREV.has(w.replace(/[().,]/g, ""))) return w;
  return w.toLowerCase().replace(/(^|[-(&./])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

/** The full name, cleaned: "EQ - BHARTI AIRTEL LTD." → "Bharti Airtel Ltd"; "Itc Limited" → "ITC Limited"; "Bank Of Baroda" → "Bank of Baroda". */
export function holdingName(raw: string | null | undefined): string {
  let n = String(raw ?? "").replace(/\s+/g, " ").trim().replace(/^EQ\s*-\s*/i, "").replace(/\.$/, "").trim();
  if (!n) return "";
  const shouting = n === n.toUpperCase() && /\p{Lu}{3}/u.test(n);
  n = n.split(" ").map((w) => (shouting ? wordCase(w) : ABBREV.has(w.toUpperCase()) && /^\p{Lu}\p{Ll}+$/u.test(w) && !/^(Ltd|It|Lt|Pi|Au|Ge|Cg|Jk|Lg|Pb|Td)$/.test(w) ? w.toUpperCase() : w)).join(" ");
  return nameCase(n);
}

/** The short name for a chip, a table row or a sentence: "HDFC Bank Limited" → "HDFC Bank"; "OIL AND NATURAL GAS CORPORATION LTD" → "ONGC". */
export function holdingShort(raw: string | null | undefined, symbol = ""): string {
  const full = holdingName(raw);
  if (!full) return symbol;
  const key = full.replace(/[\s,]+(Ltd\.?|Limited|Company)$/i, "").trim().toLowerCase();
  if (SHORT_FORM[key]) return SHORT_FORM[key];
  let s = shortCo(full.replace(/\s+(Inc|Corp|Plc)\.?(\s+[A-Z])?$/, ""), symbol);
  // a name cut short at the source ("ADANI PORTS AND SPECIAL ECONO") never ends on a joining word
  while (/\s(and|of|the|for|&)$/i.test(s)) s = s.replace(/\s\S+$/, "");
  return s || symbol;
}
