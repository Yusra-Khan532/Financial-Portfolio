// F&O Academy: the words its text never uses (checked by academy.test.ts and pages/fnoAcademy.test.tsx). The nouns "buyer", "seller" and
// "writer" name the sides of a contract and are allowed; the verbs, advice words and forecast words are not.
/** Advice and forecast words never used in the Academy (CLAUDE.md wording rule, docs/TRADING-LAB.md). */
export const BANNED = /\b(buy|buys|buying|bought|sell|sells|selling|sold|hold|holds|holding|held|holder|holders|target|targets|best|top pick|recommend\w*|forecast\w*|likely|will rise|will fall|bullish|bearish|signal\w*|tip|tips|should|strateg\w*|avoid\w*|reduce\w*|accumulat\w*|multibagger\w*|predict\w*|sure-shot|stop|stop-loss|conviction)\b/i;
