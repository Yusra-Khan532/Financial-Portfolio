// Trading Lab > Order Flow > Case for / against: the answer of /api/lab/case/{symbol} (backend finlit/lab/case.py) and the plain words around it.
// FinLit AI writes three sections from a numbered sheet of FinLit's stored figures; every sentence with a figure carries its source numbers.
// The case gives no verdict: the page only shows what the figures support, what they challenge and what they cannot settle.
import { apiGet, apiSend } from "./api";

export type CaseFact = {
  n: number; key: string; group: string; groupLabel: string; label: string; text: string; source: string;
  value: number | null; unit: string | null; period: string;
};
export type CaseSentence = { text: string; sources: number[] };
export type CaseSection = { id: "support" | "challenge" | "unsettled"; title: string; sentences: CaseSentence[] };
export type CaseLimit = { limit: number; used: number; left: number; resets: string };
export type LabCase = {
  status: string; symbol: string; name: string; method: string;
  outcome: "written" | "not_written" | "none" | "too_few";
  sections: CaseSection[]; sources: CaseFact[]; generatedAt: string | null; cached: boolean;
  inputs: { statement: string; filingDate: string | null; priceDate: string | null; flowDay: string | null; reportDate: string | null };
  limit: CaseLimit; enabled: boolean; note: string; disclaimer: string; message?: string;
};

export const getCase = (s: string) => apiGet<LabCase>(`/api/lab/case/${encodeURIComponent(s)}`);
export const writeCase = (s: string) => apiSend<LabCase>("POST", `/api/lab/case/${encodeURIComponent(s)}`);

export const CASE_TITLES: Record<CaseSection["id"], string> = {
  support: "What the figures support",
  challenge: "What the figures challenge",
  unsettled: "What the data cannot settle",
};
export const CASE_NOTE = "Written from FinLit's stored figures by FinLit AI; it gives no verdict and is not a recommendation.";
export const CASE_HOW = "FinLit AI reads only the numbered sheet below: the stored report's ratios, growth and latest quarter, the daily closes and, for an F&O "
  + "stock, the Lab's Order Flow snapshot. Every sentence with a figure ends with the number of its source. Each answer is checked before it is shown: the "
  + "three sections, every source number on the sheet, every figure matching its source, and no word of advice. An answer that fails is written once more; "
  + "if it fails again, nothing is shown in its place. A case is kept until a new filing or a new day's prices arrive.";

/** 27 Nov 2026 (dates of the inputs, India time for a timestamp). */
export function caseDay(iso: string | null | undefined): string {
  if (!iso) return "not stored";
  const d = iso.length > 10 ? new Date(iso) : new Date(iso + "T00:00:00+05:30");
  if (Number.isNaN(d.getTime())) return "not stored";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** 27 Nov 2026, 12:11 pm IST. */
export function caseTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${caseDay(iso)}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST`;
}

/** The facts grouped as the sheet orders them: [{label, facts}], groups in the order their first fact appears. */
export function factGroups(facts: CaseFact[]): { label: string; facts: CaseFact[] }[] {
  const out: { label: string; facts: CaseFact[] }[] = [];
  for (const f of facts) {
    const g = out.find((x) => x.label === f.groupLabel);
    if (g) g.facts.push(f); else out.push({ label: f.groupLabel, facts: [f] });
  }
  return out;
}

/** The line under the button: how many cases are left today and when they renew. */
export function limitLine(l: CaseLimit): string {
  if (l.left <= 0) return `All ${l.limit} cases of today are used. They renew at midnight India time; a case already written still opens.`;
  return `${l.left} of ${l.limit} cases left today. A case already written for a stock opens free.`;
}
