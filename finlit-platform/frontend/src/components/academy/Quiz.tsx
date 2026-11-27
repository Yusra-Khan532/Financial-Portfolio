// F&O Academy: a lesson's quiz. Choosing an option locks the question and shows, for every option, whether it is the right one and why.
// When every question is answered the score is shown and saved (the top score is kept, lib/academy.ts); "Try again" starts over.
import { useState } from "react";
import type { Question } from "../../content/academy/types";
import { saveQuiz, scores } from "../../lib/academy";
import { usePrefs } from "../../lib/prefs";

export function Quiz({ lessonId, questions }: { lessonId: string; questions: Question[] }) {
  const p = usePrefs();
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const answered = picked.filter((x) => x != null).length;
  const right = picked.filter((x, i) => x != null && questions[i].options[x].correct).length;
  const top = scores(p).get(lessonId);
  const pick = (qi: number, oi: number) => {
    if (picked[qi] != null) return;
    const next = picked.map((x, i) => (i === qi ? oi : x));
    setPicked(next);
    if (next.every((x) => x != null)) saveQuiz(lessonId, next.filter((x, i) => questions[i].options[x!].correct).length, questions.length);
  };
  return (
    <section className="fa-quiz" aria-labelledby={`fa-quiz-${lessonId}`}>
      <h2 id={`fa-quiz-${lessonId}`}>Check yourself</h2>
      <p className="muted">{questions.length} questions. Choose an answer to see why each option is right or not.{top ? ` Your highest score so far: ${top.score} of ${top.of}.` : ""}</p>
      <ol className="fa-qs">
        {questions.map((q, qi) => {
          const sel = picked[qi];
          return (
            <li key={qi} className="fa-q">
              <p className="fa-q-t" id={`fa-q-${lessonId}-${qi}`}>{q.q}</p>
              <ul className="fa-opts" role="group" aria-labelledby={`fa-q-${lessonId}-${qi}`}>
                {q.options.map((o, oi) => {
                  const shown = sel != null;
                  const state = !shown ? "" : o.correct ? "ok" : sel === oi ? "no" : "";
                  return (
                    <li key={oi}>
                      <button type="button" className={`fa-opt ${state}`} aria-pressed={sel === oi} disabled={shown && sel !== oi} onClick={() => pick(qi, oi)}>
                        <span className="fa-opt-mark" aria-hidden="true">{shown ? (o.correct ? "✓" : sel === oi ? "✕" : "") : String.fromCharCode(65 + oi)}</span>
                        <span>{o.text}{shown && o.correct ? <span className="sr-only"> (the right answer)</span> : null}</span>
                      </button>
                      {shown && <p className={`fa-why ${o.correct ? "ok" : ""}`}>{o.why}</p>}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      <div className="fa-score" aria-live="polite">
        {answered < questions.length
          ? <span>Answered {answered} of {questions.length}.</span>
          : <><b>Your score: {right} of {questions.length}.</b> <span>Saved{top && top.score > right ? ` (your highest stays ${top.score} of ${top.of})` : ""}.</span>
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => setPicked(questions.map(() => null))}>Try again</button></>}
      </div>
    </section>
  );
}
