// All my investments (task #137): the member's shares and mutual funds read together, from POST /api/me/all-investments (finlit/myinvest).
// The shares come from the Equity portfolio list in this browser and the account (sent as symbol and quantity only); the funds are read by the server from
// the member's MF portfolio. ETFs: the ETF portfolio does not exist yet, so the page says they are coming. Describes; never advises.
import { useQuery } from "@tanstack/react-query";
import { apiSend, type ApiError } from "./api";
import { MINUS, nf } from "./format";
import type { Holding } from "./portfolio";
import { partWord } from "../stock/prismCardLogic";

export type PartCard = { count: number; valued: boolean; value: number | null; share: number; chg1y: number | null; largest: { name: string; symbol?: string | null; code?: number | null } | null;
  score?: number | null; scoreModel?: "iq" | "prism"; scoreWord?: string | null; scoreLocked?: boolean; peers?: { lead: number; lag: number; shown: boolean };
  overlap?: { pct: number; a: string; b: string } | null; sharedCompanies?: number; mostShared?: number };
export type Company = { symbol: string; name: string; sector: string | null; direct: number; funds: number; etfs: number; all: number; twice: boolean; ways: number; via: number[]; peer: string | null };
export type Risk = { swing: number; benchSwing: number; worstFall: number | null; benchWorstFall: number | null; beta: number | null; fallsTaken: number | null; weeks: number;
  worstWeek: number; benchWorstWeek: number; level: string | null; vs: string; parts: { part: "shares" | "funds"; money: number; swings: number | null }[]; lines: string[]; grain: string; years: number };
export type AllInvestments = {
  plan: "silver" | "gold"; byValue: boolean; total: number | null; chg1y: number | null;
  parts: { shares: PartCard; funds: PartCard; etfs: { count: 0; soon: true; why: string } };
  mix: Partial<Record<"equity" | "debt" | "cash" | "other" | "unknown", number>>; companies: Company[]; heldTwice: number; peersShown: boolean;
  sectors: { sector: string; mine: number; bench: number | null }[]; risk: Risk | null; riskWhy: string | null;
  insights: { id: "sector" | "three" | "soften"; title: string; text: string }[]; holdingsAsOf: string | null; unknown: string[]; noHoldings: string[]; disclaimer: string;
};

/** The Equity portfolio list as the server takes it: one entry per row, symbol and quantity only (0 or none means no quantity yet). */
export const sharesBody = (hs: Holding[]) => ({ shares: hs.map((h) => ({ symbol: h.symbol.toUpperCase(), qty: h.qty > 0 ? h.qty : null })) });

export const useAllInvestments = (hs: Holding[], enabled: boolean) => {
  const body = sharesBody(hs);
  return useQuery<AllInvestments, ApiError>({ queryKey: ["all-investments", body], queryFn: () => apiSend<AllInvestments>("POST", "/api/me/all-investments", body), enabled, staleTime: 120_000, retry: 1 });
};

/** ₹ in lakh or crore, as the design writes it ("₹14.2 lakh", "₹1.3 crore", "₹61,400"). */
export function rupees(v: number): string {
  const a = Math.abs(v), s = v < 0 ? MINUS : "";
  if (a >= 1e7) return `${s}₹${nf(a / 1e7, 2)} crore`;
  if (a >= 1e5) return `${s}₹${nf(a / 1e5, 1)} lakh`;
  return `${s}₹${nf(a, 0)}`;
}
/** A change with its sign always shown ("+7.9%", "−3.1%"). */
export const chg = (v: number | null | undefined, d = 1) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), d) + "%");
export const pctOf = (v: number | null | undefined, d = 1) => (v == null ? "—" : nf(v, d) + "%");

/** A score's word on the site's own bands: FinLit IQ (Strong 78+, Healthy 62+, Mixed 45+, Watch), FinLit Prism (the Prism page's part bands). */
export const iqWord = (v: number) => (v >= 78 ? "Strong" : v >= 62 ? "Healthy" : v >= 45 ? "Mixed" : "Watch");
export const shareScoreWord = (v: number, model: "iq" | "prism") => (model === "iq" ? iqWord(v) : partWord(v)[0]);
export const MODEL_NAME = { iq: "FinLit IQ", prism: "FinLit Prism" } as const;

export type Seg = "all" | "twice" | "through";
/** The look-through table's segment: All, Held twice (directly and through a fund), Only through funds and ETFs (no direct holding). */
export const segRows = (rows: Company[], seg: Seg) => (seg === "twice" ? rows.filter((r) => r.twice) : seg === "through" ? rows.filter((r) => r.direct === 0 && (r.funds > 0 || r.etfs > 0)) : rows);

/** "4.2% direct, 1.3% through funds" (only the ways it is held). */
export function splitText(c: Company): string {
  const parts = [c.direct > 0 ? `${pctOf(c.direct)} direct` : null, c.funds > 0 ? `${pctOf(c.funds)} through funds` : null, c.etfs > 0 ? `${pctOf(c.etfs)} through ETFs` : null].filter(Boolean);
  return parts.join(", ");
}
