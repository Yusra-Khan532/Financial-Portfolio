// Task #365: the sentiment score of a news item or filing as a small coloured chip: the signed score and its band word, coloured by band (green for
// positive, grey for neutral, red for negative; the clear bands stronger). Nothing while the item is not scored yet.
import { SENT_HELP, SENT_WORD, fmtScore, mixText, type Sentiment } from "../lib/sentiment";
import "../styles/sentiment365.css";

export function SentimentChip({ s, word = true, avg = false }: { s?: Sentiment | null; /** show the band word beside the score */ word?: boolean; /** an average of several */ avg?: boolean }) {
  if (!s) return null;
  const m = avg ? s.mix : undefined, toned = m ? m.pos + m.neg : 0;
  if (m && !toned) {   // every filing reads neutral: say so in words, not as a 0.00 that looks like a missing score
    const label = `Every one of the ${m.neu} scored filing${m.neu === 1 ? "" : "s"} reads neutral (procedural wording)`;
    return <span className="snt snt-neutral" title={`${label}. ${SENT_HELP}`} aria-label={label}><span className="snt-w">All neutral</span></span>;
  }
  const label = `${avg ? "Average sentiment" : "Sentiment"} ${fmtScore(s.score)}: ${SENT_WORD[s.band]}`
    + (m ? ` (the average of the ${toned} filing${toned === 1 ? "" : "s"} with a tone: ${mixText(m)})` : "");
  return (
    <span className={"snt snt-" + s.band} title={`${label}. ${SENT_HELP}`} aria-label={label}>
      <b>{fmtScore(s.score)}</b>{word && <span className="snt-w">{SENT_WORD[s.band]}</span>}
      {m && <span className="snt-m">{m.pos > 0 && <>{m.pos}<i aria-hidden="true">▲</i></>}{m.neg > 0 && <>{m.neg}<i aria-hidden="true">▼</i></>}</span>}
    </span>
  );
}
