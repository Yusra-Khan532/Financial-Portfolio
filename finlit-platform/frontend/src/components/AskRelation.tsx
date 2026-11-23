// Task #349 PR 4: holdings-aware answers. When the signed-in member holds, watches or has an alert on the company an answer is about, the server
// sends a `relation` event (lib/askAi.ts safeRelation) and the answer carries these tags: "You hold this" (its tooltip: the shares and the weight),
// "In 2 of your funds", "In your ETF", "On your watchlist", "Alert set". Read-only ui Chips; tokens only (styles/ask-relation.css, scoped air- classes).
// A signed-out visitor never gets the event, and the panel shows no tags without a signed-in member either.
import type { AskRelationTag } from "../lib/askAi";
import { Chip } from "./ui";
import "../styles/ask-relation.css";

export function AskRelation({ tags, signedIn }: { tags: AskRelationTag[]; signedIn: boolean }) {
  if (!signedIn || !tags.length) return null;
  return (
    <ul className="air" aria-label="How you are linked to this company">
      {tags.map((t) => (
        <li key={t.text}>
          <Chip tone={t.kind === "hold" ? "gold" : "neutral"} className="air-tag" title={t.tip}>{t.text}{t.tip && <span className="sr-only">: {t.tip}</span>}</Chip>
        </li>
      ))}
    </ul>
  );
}
