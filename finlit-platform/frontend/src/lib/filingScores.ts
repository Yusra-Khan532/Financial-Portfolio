// Task #266: the three filings of Section 18 scored point by point (GET /api/stocks/{symbol}/filing-scores; the rules: backend/finlit/docscore). Scores and
// their colours only: green 65-100, yellow 40-64, red 0-39. The page never names a band as positive, neutral or negative.
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { apiGet } from "./api";

export type Band = "green" | "yellow" | "red";
export type DocKind = "P" | "C" | "R";
export type FsPoint = { id: number; page: number; section: string | null; speaker: string | null; text: string; score: number; band: Band; theme: string; themeName: string; rules: string; hard: boolean };
export type FsTheme = { theme: string; name: string; weight: number; points: number; score: number | null; band: Band | null };
export type FsParam = { id: "P1" | "P2" | "P3" | "P4" | "P5" | "P6"; weight: number; value: number | null; used: boolean };
export type FsDoc = { name: string; status: "scored" | "reading" | "none" | "unreadable"; why?: string;
  doc?: { title: string | null; date: string | null; link: string; source: "section18" | "filings" };
  score?: number; band?: Band; confidence?: "High" | "Medium" | "Low"; hardTriggers?: number; capped?: boolean; mixed?: boolean; boundary?: boolean;
  counts?: { found: number; scored: number; headings: number; excluded: number; noSignal: number }; share?: { green: number; yellow: number; red: number };
  params?: FsParam[]; themes?: FsTheme[]; keyPoints?: FsPoint[]; points?: FsPoint[]; more?: number; pages?: number; ofPages?: number; lexicon?: string };
export type FilingScores = { symbol: string; lexicon: string; bands: Record<Band, [number, number]>; docs: Record<DocKind, FsDoc>;
  company: { score: number | null; band: Band | null; weights: Partial<Record<DocKind, number>> }; reading: boolean };

export const KINDS: DocKind[] = ["P", "C", "R"];
export const METHOD_PDF = "/docs/finlit-filing-scores-method.pdf";
export const PARAM_NAME: Record<FsParam["id"], string> = { P1: "Theme-weighted points", P2: "Balance of green and red", P3: "Backed by figures", P4: "Done against intended",
  P5: "Severity of the weakest points", P6: "Agreement with reported figures" };
export const band = (v: number | null | undefined): Band | null => (v == null ? null : v >= 65 ? "green" : v >= 40 ? "yellow" : "red");
export const BAND_RANGE: Record<Band, string> = { green: "65–100", yellow: "40–64", red: "0–39" };

/** While a file is being read from the exchange, ask again every 6 seconds, at most 20 times (two minutes). */
export function useFilingScores(symbol: string) {
  const tries = useRef(0);
  return useQuery({
    queryKey: ["filing-scores", symbol], enabled: !!symbol, staleTime: 5 * 60_000, retry: 1,
    queryFn: () => apiGet<FilingScores>(`/api/stocks/${encodeURIComponent(symbol)}/filing-scores`),
    refetchInterval: (q) => { const d = q.state.data as FilingScores | undefined; if (d?.reading && tries.current < 20) { tries.current += 1; return 6000; } return false; },
  });
}
