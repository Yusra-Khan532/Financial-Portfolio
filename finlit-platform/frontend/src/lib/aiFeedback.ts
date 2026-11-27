// Task #366 (Chinmay, 24 Nov 2026): thumbs up / down on AI-written text, stored for the team (backend finlit/ai_feedback.py, POST /api/ai-feedback).
// The member's own vote is remembered in this browser so the button stays pressed; sending the same vote again withdraws it.
import { apiSend } from "./api";

export type AiSurface = "ask" | "prism_summary" | "concall_summary" | "company_brief";
export type Vote = -1 | 0 | 1;

const key = (s: AiSurface, ref: string) => `finlit.aifb.${s}.${ref}`;
export function storedVote(s: AiSurface, ref: string): Vote {
  try { const v = Number(localStorage.getItem(key(s, ref))); return v === 1 || v === -1 ? v : 0; } catch { return 0; }
}
export function rememberVote(s: AiSurface, ref: string, v: Vote) {
  try { if (v) localStorage.setItem(key(s, ref), String(v)); else localStorage.removeItem(key(s, ref)); } catch { /* storage blocked: the vote is still sent */ }
}
export const sendVote = (a: { surface: AiSurface; ref: string; rating: Vote; question?: string; excerpt?: string }) =>
  apiSend<{ status: string }>("POST", "/api/ai-feedback", { ...a, question: a.question?.slice(0, 2000), excerpt: a.excerpt?.slice(0, 1500) });
/** An Ask FinLit AI answer is named by the company it is about and its question. */
export const askRef = (symbol: string | null | undefined, question: string) => `${symbol || "-"}|${question.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 240)}`;
