// The FinLit glossary, searched inside the extension (no request is made). Entries come from data/glossary.json, built from the site's own glossary.
import { termKey } from "./text.js";

/** @param {{terms: Array<{id:string, term:string, topic:string, meaning:string, formula?:string, aliases?:string[]}>}} doc */
export function makeGlossary(doc) {
  const byKey = new Map();
  const add = (k, i) => { if (k && !byKey.has(k)) byKey.set(k, i); };
  doc.terms.forEach((t, i) => { add(termKey(t.term), i); });                        // a term's own name wins over another term's alias
  doc.terms.forEach((t, i) => { for (const a of t.aliases || []) add(termKey(a), i); });
  const keys = doc.terms.map((t) => termKey(t.term));

  const exact = (text) => {
    const k = termKey(text);
    if (!k) return null;
    let i = byKey.get(k);
    if (i === undefined && k.length > 3) {                                          // a plural or a singular: "dividends" for "dividend", "ratio" for "ratios"
      i = byKey.get(k.endsWith("s") ? k.slice(0, -1) : k + "s");
    }
    return i === undefined ? null : doc.terms[i];
  };

  /** Up to `max` other terms whose name holds every word of the text: shown as "Did you mean" when there is no exact term. */
  const related = (text, max = 4) => {
    const words = termKey(text).split(" ").filter((w) => w.length >= 3);
    if (!words.length || termKey(text).length < 4) return [];
    const out = [];
    for (let i = 0; i < keys.length && out.length < max; i++) if (words.every((w) => keys[i].split(" ").some((p) => p.startsWith(w)))) out.push(doc.terms[i]);
    return out;
  };
  return { exact, related, size: doc.terms.length };
}
