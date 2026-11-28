// Task #365: the sentiment score of a news item or filing as a small coloured chip: the signed score and its band word, coloured by band (green for
// positive, grey for neutral, red for negative; the clear bands stronger). Nothing while the item is not scored yet. A routine filing gets a plain grey
// "Routine filing" label with no number (re-check, 28 Nov 2026); an average says how many items it covers ("+0.32 · 4 read").
import { ROUTINE_HELP, ROUTINE_WORD, SENT_HELP, SENT_WORD, fmtScore, type Average, type Sentiment } from "../lib/sentiment";
import "../styles/sentiment365.css";

export function SentimentChip({ s, word = true, avg = false }: { s?: Sentiment | Average | null; /** show the band word beside the score */ word?: boolean; /** an average of several */ avg?: boolean }) {
  if (!s) return null;
  if (s.band === "routine" || s.score == null) {
    if (avg) return null;                  // an average never shows a routine mark: no reading, no chip
    return <span className="snt snt-routine" title={`${ROUTINE_WORD}. ${ROUTINE_HELP}`} aria-label={ROUTINE_WORD}>{ROUTINE_WORD}</span>;
  }
  const n = "n" in s ? s.n : null;
  const read = n != null ? ` · ${n} read` : "";
  const label = `${avg ? "Average sentiment" : "Sentiment"} ${fmtScore(s.score)}${read}: ${SENT_WORD[s.band]}${n != null ? ` (the mean of ${n} item${n === 1 ? "" : "s"} whose wording was read; routine filings are left out)` : ""}`;
  return (
    <span className={"snt snt-" + s.band} title={`${label}. ${SENT_HELP}`} aria-label={label}>
      <b>{fmtScore(s.score)}</b>{n != null && <span className="snt-n">· {n} read</span>}{word && <span className="snt-w">{SENT_WORD[s.band]}</span>}
    </span>
  );
}
