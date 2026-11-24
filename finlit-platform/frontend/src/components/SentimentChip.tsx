// Task #365: the sentiment score of a news item or filing as a small coloured chip: the signed score and its band word, coloured by band (green for
// positive, grey for neutral, red for negative; the clear bands stronger). Nothing while the item is not scored yet.
import { SENT_HELP, SENT_WORD, fmtScore, type Sentiment } from "../lib/sentiment";
import "../styles/sentiment365.css";

export function SentimentChip({ s, word = true, avg = false }: { s?: Sentiment | null; /** show the band word beside the score */ word?: boolean; /** an average of several */ avg?: boolean }) {
  if (!s) return null;
  const label = `${avg ? "Average sentiment" : "Sentiment"} ${fmtScore(s.score)}: ${SENT_WORD[s.band]}`;
  return (
    <span className={"snt snt-" + s.band} title={`${label}. ${SENT_HELP}`} aria-label={label}>
      <b>{fmtScore(s.score)}</b>{word && <span className="snt-w">{SENT_WORD[s.band]}</span>}
    </span>
  );
}
