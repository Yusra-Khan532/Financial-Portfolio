// Task #349 PR 2: FinLit AI's question memory (backend finlit/ask/memory.py, routes finlit/ask/history.py, docs/ASK-AI.md "Question memory").
// A Silver or Gold member's written answers are kept on the server for 180 days (at most 200), so a later answer can say what changed; the member
// sees them in the panel's Chat History and manages them in Account > FinLit AI. Visitors and Basic keep the browser-only list (askExplorer.loadRecent).
import { apiGet, apiSend } from "./api";
import { RANK, type Plan } from "./ui";

export type AskHistoryItem = { id: number; askedAt: string; topic: string; subjectKind: string; subjectId: string; intent: string; question: string };
export type AskHistory = { items: AskHistoryItem[]; count: number; remember: boolean; retentionDays: number; maxRows: number };

export const RETENTION_DAYS = 180;
export const MEMORY_NOTICE = "FinLit AI keeps your questions for 180 days to tell you what changed. Manage in Account.";
export const ACCOUNT_AI_PATH = "/account/ai";

/** The server keeps questions only where written answers exist: a signed-in Silver or Gold member (an administrator counts as Gold). */
export const memoryApplies = (signedIn: boolean, plan: Plan | undefined | null): boolean => signedIn && !!plan && (RANK[plan] ?? 0) >= RANK.silver;

const asItem = (x: unknown): AskHistoryItem | null => {
  const r = x as Partial<AskHistoryItem> | null;
  if (!r || typeof r.id !== "number" || typeof r.question !== "string" || typeof r.askedAt !== "string") return null;
  return { id: r.id, askedAt: r.askedAt, question: r.question.slice(0, 500), topic: String(r.topic ?? ""), subjectKind: String(r.subjectKind ?? ""),
    subjectId: String(r.subjectId ?? ""), intent: String(r.intent ?? "") };
};

/** The member's kept questions, newest first. */
export async function loadAskHistory(limit = 50): Promise<AskHistory> {
  const d = await apiGet<Partial<AskHistory>>(`/api/ask/history?limit=${Math.max(1, Math.min(200, Math.round(limit)))}`);
  const items = (Array.isArray(d?.items) ? d!.items : []).map(asItem).filter((x): x is AskHistoryItem => x !== null);
  return { items, count: typeof d?.count === "number" ? d.count : items.length, remember: d?.remember !== false,
    retentionDays: typeof d?.retentionDays === "number" ? d.retentionDays : RETENTION_DAYS, maxRows: typeof d?.maxRows === "number" ? d.maxRows : 200 };
}
export const deleteAskHistoryItem = (id: number) => apiSend("DELETE", `/api/ask/history/${encodeURIComponent(String(id))}`);
export const clearAskHistory = () => apiSend<{ status: string; deleted: number }>("DELETE", "/api/ask/history");

const SECTOR: Record<string, string> = { insurance: "Insurance", pharma: "Pharma and healthcare", energy_power: "Power and energy", metals_chemicals: "Metals and mining",
  real_estate: "Real estate", auto: "Automobiles", it: "IT services", rural_agri: "Rural and farm" };

/** What a kept question was about, in a few words. Task #349 fix D (the founder's Gold QA): by its subject, never by the company pinned when it was
 *  asked: "Economy", "Sectors" (or "Pharma and healthcare sector"), "Market", "Funds", "Your holdings", a term, or the company symbol only for a
 *  company question (the server labels rows kept before the fix by their field). */
export function subjectLabel(i: Pick<AskHistoryItem, "subjectKind" | "subjectId">): string {
  const id = i.subjectId;
  switch (i.subjectKind) {
    case "company": return id || "A company";
    case "fund": return id && id !== "all" ? `Fund ${id}` : "Funds";
    case "etf": return id && id !== "all" ? `ETF ${id}` : "ETFs";
    case "sector": return !id || id === "all" ? "Sectors" : `${SECTOR[id] ?? id.replace(/[_-]/g, " ")} sector`;
    case "economy": return "Economy";
    case "market": return "Market";
    case "concept": return id && id !== "general" ? `Term: ${id.replace(/-/g, " ")}` : "A term";
    case "mine": return "Your holdings";             // task #349 PR 5: "what's new" in the member's own companies
    default: return "General";
  }
}

/** "23 Nov 2026" in India time. */
export const askedOn = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};
