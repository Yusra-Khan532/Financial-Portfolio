// F&O Academy progress (Learn, 27 Nov 2026): lessons marked done, the best quiz score of each lesson and the lesson opened last. Stored where
// Learn already keeps a member's things (the Word of the Day bookmarks): the site's prefs, saved in this browser for everyone and with the
// account when signed in (lib/prefs.ts, lib/sync.tsx, backend PrefsIn.academyDone / academyQuiz / academyLast).
import { LESSONS, MODULES } from "../content/academy";
import type { Module } from "../content/academy/types";
import type { AcademyState } from "./academyMerge";
import { LESSON_ID, prefs } from "./prefs";

export type Score = { score: number; of: number };
export type { AcademyState } from "./academyMerge";
export { mergeAcademy } from "./academyMerge";

/** The highest saved score of each lesson's quiz. */
export function scores(p: AcademyState = prefs.get()): Map<string, Score> {
  return new Map(p.academyQuiz.map((x) => { const [id, s, of] = x.split(":"); return [id, { score: +s, of: +of }] as const; }));
}
export const isDone = (id: string, p: AcademyState = prefs.get()) => p.academyDone.includes(id);

/** Mark a lesson done (or not done). */
export function setDone(id: string, done = true) {
  if (!LESSON_ID.test(id)) return;
  const xs = prefs.get().academyDone.filter((x) => x !== id);
  prefs.set({ academyDone: done ? [...xs, id] : xs });
}
/** Save a finished quiz: the highest score is kept, and the lesson counts as done. */
export function saveQuiz(id: string, score: number, of: number) {
  if (!LESSON_ID.test(id) || !(of >= 1 && of <= 9) || !(score >= 0 && score <= of)) return;
  const top = Math.max(score, scores().get(id)?.score ?? 0);
  const p = prefs.get();
  prefs.set({ academyQuiz: [...p.academyQuiz.filter((x) => !x.startsWith(id + ":")), `${id}:${top}:${of}`], academyDone: p.academyDone.includes(id) ? p.academyDone : [...p.academyDone, id] });
}
/** Remember the lesson opened last, for "Continue where you left off". */
export function setLast(id: string) { if (LESSON_ID.test(id) && prefs.get().academyLast !== id) prefs.set({ academyLast: id }); }

export type Progress = { done: number; total: number; pct: number };
export function moduleProgress(m: Module, p: AcademyState = prefs.get()): Progress {
  const done = m.lessons.filter((l) => p.academyDone.includes(l.id)).length;
  return { done, total: m.lessons.length, pct: Math.round((done / m.lessons.length) * 100) };
}
export function overallProgress(p: AcademyState = prefs.get()): Progress {
  const total = LESSONS.length, done = LESSONS.filter((x) => p.academyDone.includes(x.lesson.id)).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

/** Where to continue: the lesson opened last if it is not done yet, else the next lesson after it not done, else the first lesson not done.
 *  `started` is false before any lesson was opened or done (the page says "Start with lesson 1"); null when every lesson is done. */
export function continueAt(p: AcademyState = prefs.get()): { id: string; started: boolean } | null {
  const started = !!p.academyLast || p.academyDone.length > 0;
  const open = (i: number) => !p.academyDone.includes(LESSONS[i].lesson.id);
  const last = LESSONS.findIndex((x) => x.lesson.id === p.academyLast);
  if (last >= 0) {
    if (open(last)) return { id: LESSONS[last].lesson.id, started };
    for (let i = last + 1; i < LESSONS.length; i++) if (open(i)) return { id: LESSONS[i].lesson.id, started };
  }
  for (let i = 0; i < LESSONS.length; i++) if (open(i)) return { id: LESSONS[i].lesson.id, started };
  return null;
}

export { MODULES };
