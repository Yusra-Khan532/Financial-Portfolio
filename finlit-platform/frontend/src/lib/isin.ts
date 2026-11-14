import { apiSend, type SearchIndex } from "./api";

/** Task #128: a holdings file is read by ISIN, the one code that is unique to each security; the company name in the file is used only when a line has no ISIN.
 *  A name can differ from file to file ("DR. LAL PATHLABS LIMITED", "Dr Lal PathLabs") or be shared by two companies ("ATLANTA LIMITED", "Atlanta Electricals"),
 *  an ISIN cannot. The current ISIN of every listed company comes with the company list (`/api/stocks/search-index`, `isin`); every other ISIN (an old one,
 *  a fund unit, a bond, an unlisted share) is answered by POST /api/isin/resolve (backend/finlit/isin.py), which also says why when it is not a share. */

/** The shape of an Indian ISIN: IN, nine letters or digits, a check digit. */
export const ISIN_RX = /^IN[A-Z0-9]{9}\d$/;
const ISIN_TOKEN = /\bIN[A-Z0-9]{9}\d\b/g;

/** ISO 6166 check digit: letters become numbers (A=10 ... Z=35) and the Luhn sum of every digit must end in 0. Same rule as finlit/isin.py `valid`. */
export function isinValid(s: string): boolean {
  if (!ISIN_RX.test(s)) return false;
  const digits = [...s].map((c) => parseInt(c, 36).toString()).join("");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** The ISIN in a piece of text ("INE002A01018", "INE002A01018 RELIANCE INDUSTRIES LTD", "ISIN: INE002A01018"), or undefined. A valid one is preferred;
 *  one with a wrong check digit is still returned (it has at least four digits, so it is a code, not a word): the line then says its ISIN is not valid,
 *  instead of being matched by its name. */
export function isinIn(text: string): string | undefined {
  const all = [...(text || "").toUpperCase().matchAll(ISIN_TOKEN)].map((m) => m[0]);
  return all.find(isinValid) ?? all.find((x) => (x.match(/\d/g) || []).length >= 4);
}

export type IsinStatus = "matched" | "check" | "not_share" | "not_found" | "invalid";
export type IsinHow = "isin" | "old_isin" | "issuer" | "issuer_name";
export type IsinAnswer = { isin: string; status: IsinStatus; symbol: string | null; name: string | null; how: IsinHow | null; note: string | null; kind?: string | null };
export type IsinSources = { exchanges?: { source: string; loadedAt: string | null } | null; depository?: { source: string; date: string | null } | null };
export type IsinResult = { answers: Map<string, IsinAnswer>; sources: IsinSources | null; offline: boolean };

const CHUNK = 2000;

/** Answers from the company list alone (each listed company's current ISIN): no request needed. */
export function localAnswers(isins: readonly string[], idx: SearchIndex | undefined): Map<string, IsinAnswer> {
  const out = new Map<string, IsinAnswer>();
  if (!idx?.isin?.length) return out;
  const at = new Map<string, number>();
  idx.isin.forEach((x, i) => { if (x && !at.has(x)) at.set(x, i); });
  for (const i of isins) {
    const k = at.get(i);
    if (k !== undefined) out.set(i, { isin: i, status: "matched", symbol: idx.rows[k][0], name: idx.rows[k][1], how: "isin", note: null });
    else if (!isinValid(i)) out.set(i, { isin: i, status: "invalid", symbol: null, name: null, how: null, note: "Not a valid ISIN: its last (check) digit does not match the other eleven characters. Please check it against your statement." });
  }
  return out;
}

/** Every ISIN answered: the company list first, the server for the rest. `offline` says the server could not be asked (those ISINs then have no answer). */
export async function resolveIsins(isins: readonly string[], idx: SearchIndex | undefined): Promise<IsinResult> {
  const want = [...new Set(isins)];
  const answers = localAnswers(want, idx);
  const rest = want.filter((i) => !answers.has(i));
  let sources: IsinSources | null = null, offline = false;
  for (let i = 0; i < rest.length; i += CHUNK) {
    try {
      const r = await apiSend<{ items: Record<string, IsinAnswer>; sources: IsinSources }>("POST", "/api/isin/resolve", { isins: rest.slice(i, i + CHUNK) });
      Object.values(r.items || {}).forEach((a) => answers.set(a.isin, a));
      sources = r.sources ?? sources;
    } catch { offline = true; }
  }
  return { answers, sources, offline };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string | null | undefined) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null; };

/** "Read by ISIN against the NSE and BSE lists (loaded 14 Nov 2026) and NSDL's ISIN list of 12 Nov 2026." The source and date of the answers. */
export function sourcesLine(s: IsinSources | null): string {
  const parts: string[] = [];
  const ex = day(s?.exchanges?.loadedAt), dep = day(s?.depository?.date);
  parts.push(`the NSE and BSE lists${ex ? ` (loaded ${ex})` : ""}`);
  if (s?.depository) parts.push(`NSDL's ISIN list${dep ? ` of ${dep}` : ""}`);
  return parts.join(" and ");
}
