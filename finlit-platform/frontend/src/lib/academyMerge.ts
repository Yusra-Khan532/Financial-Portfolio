// F&O Academy progress across sign-in (lib/sync.tsx). Kept apart from lib/academy.ts so the app shell does not load the curriculum.
import type { Prefs } from "./prefs";

export type AcademyState = Pick<Prefs, "academyDone" | "academyQuiz" | "academyLast">;

/** Progress made on this browser joins the account's on sign-in: lessons done from either, the higher score of each quiz, and the account's
 *  last lesson unless it has none. Returns null when the account's copy already holds everything. */
export function mergeAcademy(local: AcademyState, saved: Partial<AcademyState>): AcademyState | null {
  const sDone = Array.isArray(saved.academyDone) ? saved.academyDone : [], sQuiz = Array.isArray(saved.academyQuiz) ? saved.academyQuiz : [];
  const done = [...new Set([...sDone, ...local.academyDone])];
  const best = new Map<string, string>();
  for (const x of [...sQuiz, ...local.academyQuiz]) { const id = x.split(":")[0], o = best.get(id); if (!o || +x.split(":")[1] > +o.split(":")[1]) best.set(id, x); }
  const quiz = [...best.values()];
  const last = saved.academyLast || local.academyLast || "";
  const same = done.length === sDone.length && quiz.length === sQuiz.length && quiz.every((q) => sQuiz.includes(q)) && last === (saved.academyLast ?? "");
  return same ? null : { academyDone: done, academyQuiz: quiz, academyLast: last };
}
