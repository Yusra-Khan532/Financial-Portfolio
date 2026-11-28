// The owner asked for the word "Fundamental(s)" to go from every page (Nov 2026). The Prism first part is "Growth & Profitability", the whole Prism rating is
// "financial health", the basic score's former "Fundamental" is "Growth & Profitability", the statements page is "Company financials". Routes, ids and data keys keep the old
// spelling (links and saved data must not break); the finance glossary keeps "fundamental analysis" as a dictionary term.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "__fixtures__" ? [] : files(p)) : /\.(tsx?)$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
// a quoted string or a JSX text run that holds the word
const VISIBLE = /(["'`>])([^"'`<>\n]*\b[Ff]undamentals?\b[^"'`<>\n]*)(?=["'`<])/g;
// The founder named the FinLit Prism Score panel himself (Nov 2026): "Fundamental Score", "Total Fundamental Score" and its subtitle are the only visible uses.
// Task #24 (Nov 2026, asked for by the team and approved by the founder): the first Prism card is titled "Fundamental analysis" (it was "Financial health analysis").
// Task #93 (Nov 2026, asked for by the founder's team): the Advanced stock screener names the Prism total "Prism Fundamental score".
// Task #126 (14 Nov 2026, the team's sample, kept at the founder's choice): the tag on the business-scores card of "How the scores have moved" reads "Fundamental".
// Task #122 (14 Nov 2026, the team's picture, its wording kept exactly at the founder's choice): the landing page's Prism part says "4 Fundamental Areas"
// (its "Combines fundamental and technical views..." strip was removed by task #149).
// Task #407 (26 Nov 2026, the team's go-live pack, its wording kept exactly): the landing page's picture of the Prism card says
// "Fundamental · one score, four parts" and "Cumulative fundamental score 57.9 of 100, Average".
// Task #183 (15 Nov 2026, the team's portfolio pack, its screenshots): the Equity portfolio's heading band reads "Fundamental pillars".
// Task #243 (18 Nov 2026, the screeners pack v4, the owner's v3 request 8): the screen tables label the Prism columns "Score · 4 fundamental pillars · 2 technical pillars".
// Task #280 (20 Nov 2026, the team's picture of the company header: "INSTEAD OF RATING MAKE IT FUNDAMENTAL RATING EVERYWHERE"): the label of the Prism and
// FinLit IQ rating on the company header and the screeners' rating filters reads "Fundamental rating".
// Task #385 (24 Nov 2026, developer file 33): the Equity portfolio names FinLit Prism "the fundamental score" (the Strength card, the table's heading
// "FinLit Prism · fundamental score", and the i texts that explain it); any string that says both "FinLit Prism" and "fundamental score" is allowed.
// Task #408 (27 Nov 2026, the founder's Watchlists pack, 02-columns and its approved reference page): the Prism column set's group heading reads
// "FinLit Prism · Fundamental score", capital F as the pack writes it.
// Task #411 (27 Nov 2026, the team's landing pack, finlit-prism-block.html): the Prism block built on the page names its group for screen readers
// "Fundamental score 57.9 of 100, Average. ...", as the pack writes it (the visible label is the allowed "Fundamental · one score, four parts").
const ALLOWED = /^(Fundamental score 57\.9 of 100, Average\. Growth and Profitability 58, Average\. Valuation 36, Weak\. Quality 77, Healthy\. Risk 86, Strong\.|(?=.*FinLit Prism)(?=.*[Ff]undamental score).*|Fundamental rating|Prism fundamental rating|FinLit IQ fundamental rating|Fundamental|Fundamental pillars|4 fundamental pillars| fundamental |4 Fundamental Areas|Prism Fundamental score|Fundamental Score|Total Fundamental Score|Fundamental analysis|Cumulative fundamental score|Fundamental · one score, four parts|Cumulative fundamental score 57\.9 of 100, Average|Fundamental components|Filter stocks using our fundamental and technical scoring model\.|fundamentals?|prism_fundamental|stock-fundamentals|cmp-fundamentals|\/premium\/fundamentals.*|premium\/fundamentals|\/fundamentals.*|\.\/pages\/Fundamentals|.*\$\{.*|= \{ fundamental:.*)$/;

describe("no 'Fundamental' on any page", () => {
  it("no visible string uses the word (only routes, ids and data keys keep it)", () => {
    const hits: string[] = [];
    for (const f of files(ROOT)) {
      const src = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
      for (const m of src.matchAll(VISIBLE)) if (!ALLOWED.test(m[2].trim())) hits.push(`${f.replace(ROOT, "")}: ${m[2].trim().slice(0, 80)}`);
    }
    expect(hits).toEqual([]);
  });
});
