// Task #283: FinLit IQ is retired and FinLit Prism is FinLit's only company score. This is the ONE file in the site's code that names the retired score,
// so FinLit AI can answer a member who asks about it. Every other file says nothing of it (lib/noRetiredScore.test.ts checks that).
export const RETIRED_SCORE_NAME = "FinLit IQ";

/** FinLit AI's answer to "What is the FinLit IQ?" (and anything else that asks about the retired score). */
export const RETIRED_SCORE_ANSWER =
  `${RETIRED_SCORE_NAME} has been retired. FinLit Prism is now FinLit's only company score: a score out of 100 for a company's financial health from its filings and prices, ` +
  "built from four parts (Growth & Profitability, Valuation, Quality and Risk), with a short-term and a long-term technical view shown beside it and not part of the score. " +
  "It describes the company; it is not a recommendation. Information only, not investment advice.";

/** True when a question asks about the retired score by name ("FinLit IQ", "finlit-iq", "IQ score"; any case). */
export const asksRetiredScore = (q: string): boolean => /\bfinlit[\s-]*iq\b|\biq\s+score\b/i.test(q);
