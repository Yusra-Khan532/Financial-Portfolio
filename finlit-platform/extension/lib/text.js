// What a person selected, made safe to look up. Pure functions: no DOM, no network.
// The text a person selects is used only inside the browser (to find a glossary term or a listed company); it is never sent anywhere.

export const MAX_CHARS = 80;
export const MAX_WORDS = 8;

/** The selection as a clean phrase, or null when it is not something worth looking up (too short or long, only numbers or symbols, an address). */
export function cleanSelection(raw) {
  if (typeof raw !== "string") return null;
  let t = raw.replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^[\s"'“”‘’(\[{<]+|[\s"'“”‘’)\]}>.,;:!?]+$/g, "");        // quotes, brackets and sentence punctuation around the phrase
  if (t.length < 2 || t.length > MAX_CHARS) return null;
  if (t.split(" ").length > MAX_WORDS) return null;
  if (!/[A-Za-z]{2}/.test(t)) return null;                                  // numbers and symbols alone are not a term or a company
  if (/@|:\/\/|^www\./i.test(t)) return null;                               // an email or a web address is never looked up
  return t;
}

/** The comparison form of a glossary term: lower case, "&" read as "and", every other symbol a single space. */
export function termKey(s) {
  return String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

const LEGAL = /\b(LIMITED|LTD|THE|CO|COMPANY|CORPORATION|CORP|INC)\b\.?/g;
/** The comparison form of a company name: upper case, without Limited / Ltd / The / Co, "&" read as AND. */
export function nameKey(s) {
  return String(s).toUpperCase().replace(/&/g, " AND ").replace(LEGAL, " ").replace(/[^A-Z0-9]+/g, " ").trim();
}

/** True when the selection is written in capitals (a ticker such as TCS or RELIANCE), so it may be matched to a ticker. */
export function looksLikeTicker(s) {
  return /^[A-Z0-9&.\-]{2,24}$/.test(s.replace(/\s+/g, ""));
}
