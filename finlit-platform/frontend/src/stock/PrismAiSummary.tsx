// Task #228 (18 Nov 2026, the team's picture of the company page's FinLit Prism block): "give a AI summary button for this just below it".
// The button sits under the two cards (Fundamental analysis and Technical analysis). A Silver or Gold member gets FinLit AI's written summary of
// this card, streamed in place (one question of the month's allowance, the same /api/ask the FinLit AI panel uses, so the plan and the quota
// apply as everywhere). A visitor or a Basic member, or anyone when written answers are off or the month's questions are used, gets an instant
// summary written from the card's own figures, said plainly as such, with the note that written answers are part of Silver and Gold.
// Describes; never advises: the AI's own checks apply, and the card summary only restates the card.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AskRefused, askAi, type AskQuota } from "../lib/askAi";
import { apiGet } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Icon } from "../lib/icons";
import { fmtScore, ratingWord, verdictView, type TechAssessment } from "../lib/prismTechnical";
import { AnswerText } from "../components/AnswerText";
import { partWord, type CardPart } from "./prismCardLogic";
import { LABEL, type PrismLatest } from "./PrismCard";

const DISCLAIMER = "Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice.";
const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** The card in a few plain sentences, from its own figures only (no model): the overall score, the strongest and weakest parts, the others, and the
 *  technical view. Exported for the tests. */
export function cardSummary(name: string, r: PrismLatest["rating"], parts: CardPart[], a: TechAssessment | null): string[] {
  const out: string[] = [];
  if (r.status === "NOT RATED" || r.final == null) out.push(`${name} has no overall FinLit Prism rating at the moment: too little of the data it needs is available.`);
  else out.push(`${name}: FinLit Prism ${one(r.final)} out of 100, ${LABEL[r.label][0]}${r.status === "PROVISIONAL" ? " (a provisional rating: some data is missing)" : ""}.`);
  const scored = parts.filter((p) => p.key !== "technical" && p.value != null) as (CardPart & { value: number })[];
  if (scored.length) {
    const sorted = [...scored].sort((x, y) => y.value - x.value), hi = sorted[0], lo = sorted[sorted.length - 1];
    const say = (p: CardPart & { value: number }) => `${p.name} ${Math.round(p.value)} (${partWord(p.value)[0]})`;
    if (sorted.length > 1 && hi.value !== lo.value) {
      out.push(`Strongest part: ${say(hi)}. Weakest: ${say(lo)}.`);
      const rest = scored.filter((p) => p !== hi && p !== lo);   // the others in the card's own order
      if (rest.length) out.push(`${rest.map(say).join(", ")}.`);
    } else out.push(`${sorted.map(say).join(", ")}.`);
    if (scored.some((p) => p.key === "risk")) out.push("A higher Risk score means lower risk.");
  }
  if (a && (a.shortTerm.score != null || a.longTerm.score != null)) {
    const h = (x: TechAssessment["shortTerm"]) => (x.score == null ? "not available" : `${fmtScore(x.score)} (${ratingWord(x.rating, x.score).word})`);
    const v = verdictView(a);
    out.push(`Technical view: short term ${h(a.shortTerm)}, long term ${h(a.longTerm)}${v.tone !== "na" ? `: ${v.word.toLowerCase()}` : ""}.`);
  }
  return out;
}

/** The session, or null where the page is drawn without the sign-in context (a preview, the card's own tests): then it acts as for a visitor. */
function useViewer(): ReturnType<typeof useAuth> | null {
  try { return useAuth(); } catch { return null; }
}

type State = { kind: "idle" } | { kind: "ai"; text: string; status: string | null; done: boolean; error: string | null } | { kind: "card"; note: string };

export function PrismAiSummary({ symbol, name, r, parts, a }: { symbol: string; name: string; r: PrismLatest["rating"]; parts: CardPart[]; a: TechAssessment | null }) {
  const auth = useViewer(), user = auth?.user ?? null, plan = auth?.plan ?? "basic";
  // the same query (and cache key) as lib/askAi useAskQuota, read only for a signed-in member
  const quota = useQuery<AskQuota>({ queryKey: ["ask-quota", user?.id ?? null], queryFn: () => apiGet<AskQuota>("/api/ask/quota"), enabled: !!user, staleTime: 60_000, retry: false });
  const [state, setState] = useState<State>({ kind: "idle" });
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const q = quota.data;
  const paid = user?.role === "admin" || plan === "silver" || plan === "gold";
  const canAi = !!user && paid && !!q?.enabled && (q.left ?? 0) > 0;

  const fallback = (why: string) => setState({ kind: "card", note: why });
  const run = async () => {
    if (!canAi) {
      fallback(!q?.enabled && user && paid ? "FinLit AI's written answers are not switched on right now, so this summary is written from the card's own figures."
        : user && paid ? "You have used this month's FinLit AI questions, so this summary is written from the card's own figures."
          : "This summary is written from the card's own figures. A written summary from FinLit AI is part of the Silver and Gold plans.");
      return;
    }
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    setState({ kind: "ai", text: "", status: "Reading the FinLit Prism card", done: false, error: null });
    const question = `Summarise the FinLit Prism rating of ${name} (${symbol}) shown on this page: the overall score and its label, the four parts (strongest and weakest) and the technical view (short and long term), in a few short lines.`;
    try {
      await askAi(question, [], symbol, (e) => {
        if (e.type === "status") setState((s) => (s.kind === "ai" ? { ...s, status: e.text } : s));
        else if (e.type === "text") setState((s) => (s.kind === "ai" ? { ...s, text: s.text + e.text, status: null } : s));
        else if (e.type === "replace") setState((s) => (s.kind === "ai" ? { ...s, text: e.text } : s));
        else if (e.type === "done") setState((s) => (s.kind === "ai" ? { ...s, status: null, done: true } : s));
        else if (e.type === "error") setState((s) => (s.kind === "ai" ? { ...s, status: null, done: true, error: e.text } : s));
      }, c.signal);
      void quota.refetch();
    } catch (err) {
      if (c.signal.aborted) return;
      fallback(err instanceof AskRefused ? `${err.message} Meanwhile, this summary is written from the card's own figures.` : "FinLit AI could not be reached just now, so this summary is written from the card's own figures.");
    }
  };

  const left = canAi && q?.left != null ? ` · ${q.left} of ${q.limit} FinLit AI questions left this month` : "";
  return (
    <div className="pai" aria-live="polite">
      <p className="pai-row">
        <button type="button" className="btn pai-btn" onClick={() => void run()} disabled={state.kind === "ai" && !state.done} aria-expanded={state.kind !== "idle"}>
          <Icon name="spark" />{state.kind === "ai" && !state.done ? "Writing the summary…" : state.kind === "idle" ? "AI summary" : "Summarise again"}
        </button>
        <small className="pai-hint">{canAi ? `A few lines from FinLit AI on this card${left}` : "A few lines on this card"}</small>
      </p>
      {state.kind === "ai" && (
        <div className="pai-box" role="region" aria-label={`AI summary of the FinLit Prism rating of ${name}`}>
          {state.status && <p className="pai-status" aria-busy="true">{state.status}…</p>}
          {state.text && <AnswerText text={state.text} />}
          {state.error && <p className="pai-err" role="alert">{state.error}</p>}
          {state.done && !state.error && <p className="pai-disc">{DISCLAIMER}</p>}
        </div>
      )}
      {state.kind === "card" && (
        <div className="pai-box" role="region" aria-label={`Summary of the FinLit Prism rating of ${name}`}>
          {cardSummary(name, r, parts, a).map((l) => <p key={l}>{l}</p>)}
          <p className="pai-note"><Icon name="info" /> {state.note}{!user || !paid ? <> <Link to="/plans">Compare plans</Link></> : null}</p>
          <p className="pai-disc">{DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}
