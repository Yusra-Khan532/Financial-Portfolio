// Task #215 (Chinmay Jain, 17 Nov 2026): the forecast card in the company report's section 06. For revenue and net profit it shows the past compound
// yearly growth over 1, 3 and 5 years, and, for the chosen span N, the value the company would reach N years after its latest year if that rate carried on:
// latest × (1 + rate)^N. Arithmetic on the company's own filings, not a prediction; every blank says why.
import type { Table } from "./api";

export type Span = 1 | 3 | 5;
export const SPANS: Span[] = [1, 3, 5];
export type Projection =
  | { ok: true; span: Span; rate: number; from: string; to: string; base: number; value: number; year: string }
  | { ok: false; span: Span; why: string };

const fyNum = (p: string): number | null => { const m = /^FY(\d{2})$/.exec(p); return m ? Number(m[1]) : null; };
const fy = (n: number) => `FY${String(n % 100).padStart(2, "0")}`;

/** The compound yearly growth of one row over the last `span` years, and the value `span` years after the latest year at that rate. */
export function project(t: Table | undefined, row: string, span: Span): Projection {
  const periods = t?.periods ?? [], vals = t?.rows[row] ?? [];
  const i = periods.length - 1;
  if (i < 0) return { ok: false, span, why: "No yearly figures yet" };
  const end = fyNum(periods[i]);
  if (end == null) return { ok: false, span, why: "The latest year is not a financial year" };
  const j = periods.findIndex((p) => fyNum(p) === end - span);
  if (j < 0) return { ok: false, span, why: `Needs ${span + 1} years of figures (${fy(end - span)} to ${periods[i]})` };
  const a = vals[j], b = vals[i];
  if (a == null || b == null) return { ok: false, span, why: `No figure for ${a == null ? periods[j] : periods[i]}` };
  if (a <= 0 || b <= 0) { const k = a <= 0 ? j : i, v = vals[k] as number; return { ok: false, span, why: `Not worked out: ${periods[k]} was ${v < 0 ? "a loss" : "zero"}, and a growth rate needs figures above zero at both ends` }; }
  const rate = (Math.pow(b / a, 1 / span) - 1) * 100;
  return { ok: true, span, rate, from: periods[j], to: periods[i], base: b, value: b * Math.pow(1 + rate / 100, span), year: fy(end + span) };
}

/** The span shown when the card opens: 3 years, as in the sample, or the longest one that can be worked out. */
export function firstSpan(ps: Projection[]): Span {
  const ok = (s: Span) => ps.some((p) => p.span === s && p.ok);
  return ok(3) ? 3 : ok(5) ? 5 : ok(1) ? 1 : 3;
}
