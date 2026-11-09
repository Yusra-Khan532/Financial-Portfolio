// Finding a listed company from the words a person selected, using the company list kept inside the extension (the site's public search list:
// biggest company first). The selected text never leaves the browser: only a company that was found has its symbol sent, and only when its card is opened.
import { looksLikeTicker, nameKey } from "./text.js";

const MAX_OTHERS = 3;
const TOO_MANY = 8;       // a single word that starts this many company names (INDIA, BANK, GLOBAL) is a word, not a company

/** @param {Array<Array<string>>} rows [symbol, name, bse, nse?] biggest company first */
export function makeCompanies(rows) {
  const byCode = new Map(), byName = new Map();
  for (const r of rows) {
    for (const c of [r[0], r[2], r[3]]) if (c && !byCode.has(String(c).toUpperCase())) byCode.set(String(c).toUpperCase(), r);
    const n = nameKey(r[1]);
    if (n && !byName.has(n)) byName.set(n, r);
  }
  let keys = null;      // each company's name key, worked out only when a "starts the same way" search is first needed

  /** { best, how, others } or null. how: "ticker" | "name" | "starts". `others` are other companies the words could mean (largest first). */
  const find = (text) => {
    const raw = String(text).trim();
    const n = nameKey(raw);
    if (!n) return null;
    if (looksLikeTicker(raw)) {
      const t = byCode.get(raw.replace(/\s+/g, "").toUpperCase());
      if (t) return { best: t, how: "ticker", others: [] };
    }
    const exact = byName.get(n);
    if (exact) return { best: exact, how: "name", others: [] };
    if (n.length < 4) return null;
    keys ??= rows.map((r) => nameKey(r[1]));
    const hits = [];
    for (let i = 0; i < keys.length; i++) if (keys[i] === n || keys[i].startsWith(n + " ")) hits.push(rows[i]);
    if (!hits.length) return null;
    if (!n.includes(" ") && hits.length > TOO_MANY) return null;
    return { best: hits[0], how: "starts", others: hits.slice(1, 1 + MAX_OTHERS) };
  };
  return { find, size: rows.length };
}

/** The slim form kept in browser storage: [symbol, name, bse, nse] for every company in the site's search list. */
export function slimIndex(doc) {
  return (doc.rows || []).map((r) => [r[0], r[1], r[2] || "", r[4] || ""]);
}
