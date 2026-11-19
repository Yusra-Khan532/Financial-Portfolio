// Task #251 (the 19 Nov Discover pack): the Discover page's data and the pure rules it draws with.
//   GET /api/discovery/board     every placed company (main theme, stage, tone, 90 days of filings by event, NSE classification, Sector Pulse group), the
//                                themes as shown (Renewable Power inside Renewable Energy & Power, the two broad groups flagged) and the latest filings
//   GET /api/screener/universe   FinLit Prism, the two technical views and prices, as each plan sees them (the server gates them; a locked value is null)
//   GET /api/rotation, /api/sectors   the industry's Sector Rotation corner and rank and its Sector Pulse state (reading date shown)
//   GET /api/leadership/list     the peer label (Leader / In line / Laggard), when it is published
// Describes what companies say and file, and FinLit's own readings beside them; never a pick.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { useUniverse, type Row as URow } from "../lib/screener";
import { useRotationMap, type RotationRow } from "../lib/rotation";
import { useSectorBoard } from "../lib/sectors";
import { useLeadershipList } from "../lib/leadership";

export type Filing = { s: string; n: string; d: string; e: string; el: string; t: string; l: string | null };
export type BoardRow = {
  s: string; n: string; th: string; sec: string[]; st: string; tone: number | null; fc: number; ev: Record<string, number>;
  mac: string | null; ind: string | null; dd: string | null; pg: number | null; grp: string | null; lf?: { d: string; el: string; t: string };
};
export type BoardTheme = { name: string; label: string; short: string; broad: boolean; n: number; also: number; news: { filings: number; positive: number; negative: number }; verify: string[]; merged: string[] };
export type Board = {
  updated: string | null; companies: number; read: number; days: number; rows: BoardRow[]; themes: BoardTheme[]; efil: Record<string, Filing[]>;
  events: string[]; eventsTracked: string[]; caution: string; method: string;
};
export type Corner = "ahead_gaining" | "ahead_slowing" | "behind_gaining" | "behind_slipping";
export type Lead = "leader" | "in_line" | "laggard";
/** One company as the page draws it: the board row and FinLit's readings beside it (null = not available to this plan, or not rated). */
export type DRow = BoardRow & {
  pr: number | null; pl: string | null; lt: string | null; st2: string | null; r1m: number | null; r3m: number | null; r1y: number | null; hi: number | null; mc: number | null;
  pe: number | null; roce: number | null; cc: Corner | null; cn: string | null; rk: number | null; of: number | null; pulse: string | null; grpName: string | null; lead: Lead | null; ll: string | null;
};

export const useBoard = () => useQuery({ queryKey: ["discovery", "board"], queryFn: () => apiGet<Board>("/api/discovery/board"), staleTime: 10 * 60_000, retry: 1 });

export const STAGES = ["Operating", "Under execution", "Planned", "MoU / pilot", "Not stated"] as const;
export const STAGE_CLASS: Record<string, string> = { Operating: "op", "Under execution": "ex", Planned: "pl", "MoU / pilot": "mou", "Not stated": "ns" };
export const EVENTS: { k: string; t: string; d: string; short: string }[] = [
  { k: "order", t: "Order wins", d: "filed an order or contract win", short: "order" },
  { k: "capacity", t: "Capacity and commissioning", d: "filed a new plant, line or capacity", short: "capacity" },
  { k: "partnership", t: "Partnerships and MoUs", d: "signed a partnership or MoU", short: "partnership" },
  { k: "mna", t: "Acquisitions and mergers", d: "bought, merged or sold a business", short: "M&A" },
  { k: "fundraise", t: "Fund raising", d: "raised money through shares, a QIP or debt", short: "fund raise" },
  { k: "rating", t: "Credit ratings", d: "had a credit rating action", short: "rating" },
  { k: "management", t: "Management changes", d: "had a key person join or leave", short: "management" },
  { k: "legal", t: "Legal and regulatory", d: "received an order, penalty or notice", short: "legal" },
];
export const BRIEF_CARDS = [{ k: "order-book", t: "Order book (₹)" }, { k: "plans", t: "Guidance and dated plans" }] as const;
export const CORNERS: Record<Corner, string> = { ahead_gaining: "Ahead and gaining", ahead_slowing: "Ahead but slowing", behind_gaining: "Behind but gaining", behind_slipping: "Behind and slipping" };
export const SIZES: Record<string, string> = { L: "Large", M: "Mid", S: "Small", X: "Micro" };
export const TRENDS = ["Strong uptrend", "Uptrend", "Sideways", "Downtrend", "Strong downtrend"] as const;
export const BANDS = ["Strong", "Healthy", "Average", "Weak", "Poor"] as const;
/** Sector Rotation's own launch of the track record: it starts when Discover started noting entries. */
export const RECORD_FROM = "2026-11-19";

export const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const sizeOf = (mc: number | null): string | null => (mc == null ? null : mc >= 100000 ? "L" : mc >= 30000 ? "M" : mc >= 5000 ? "S" : "X");
export const isUp = (r: Pick<DRow, "lt">) => !!r.lt && /uptrend/i.test(r.lt) && !/down/i.test(r.lt);
export const evBiz = (r: Pick<DRow, "ev">) => ["order", "capacity", "partnership", "mna"].reduce((a, k) => a + (r.ev[k] || 0), 0);
export const short = (n: string) => n.replace(/ (Ltd|Limited)\.?$/, "");
export const titleCase = (s: string | null | undefined) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : null);
export function med(a: (number | null)[]): number | null {
  const v = a.filter((x): x is number => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export const stat = (rows: DRow[]) => ({ n: rows.length, m3: med(rows.map((r) => r.r3m)), m1y: med(rows.map((r) => r.r1y)), up: rows.filter(isUp).length });
export const pct = (v: number | null | undefined, dp = 1) => (v == null ? "−" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(dp) + "%");
export const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "");
export const crore = (v: number | null) => (v == null ? "−" : "₹" + Math.round(v).toLocaleString("en-IN") + " cr");
export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "";
  const x = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
export const codeOf = (s: string) => (/^\d{6}$/.test(s) ? "BSE " + s : s);

/** A figure the universe sends that its shared type does not name (ret_3m, pct_from_high). */
const num = (u: URow | undefined, k: string): number | null => { const v = u ? (u as unknown as Record<string, unknown>)[k] : null; return typeof v === "number" && Number.isFinite(v) ? v : null; };

/** Joins the board with FinLit's readings. A missing reading stays null: the page says "Not rated" (or the plan it is part of), never a guess. */
export function joinRows(board: Board, uni: URow[] | undefined, rot: RotationRow[] | undefined, pulse: { slug: string; name: string; state: string }[] | undefined,
  lead: Record<string, { available: boolean; label?: Lead; text?: string }> | undefined): DRow[] {
  const U = new Map((uni ?? []).map((u) => [u.symbol, u]));
  const ROT = new Map((rot ?? []).map((r) => [r.slug, r]));
  const PUL = new Map((pulse ?? []).map((p) => [p.slug, p]));
  return board.rows.map((r) => {
    const u = U.get(r.s), ro = r.grp ? ROT.get(r.grp) : undefined, pu = r.grp ? PUL.get(r.grp) : undefined, l = lead?.[r.s];
    return {
      ...r, pr: u?.prism_final != null ? Math.round(u.prism_final) : null, pl: titleCase(u?.prism_label ?? null), lt: u?.prism_lt ?? null, st2: u?.prism_st ?? null,
      r1m: u?.return_1m ?? null, r3m: num(u, "ret_3m"), r1y: u?.return_1y ?? null, hi: num(u, "pct_from_high"), mc: u?.market_cap ?? null, pe: u?.pe ?? null, roce: u?.roce ?? null,
      cc: (ro?.corner as Corner) ?? null, cn: ro?.corner_name ?? null, rk: ro?.rank ?? null, of: ro?.ranked ?? null, pulse: pu?.state ?? null, grpName: ro?.name ?? pu?.name ?? null,
      lead: l?.available ? (l.label ?? null) : null, ll: l?.available && l.label ? { leader: "Leader", in_line: "In line", laggard: "Laggard" }[l.label] : l?.text ?? null,
    };
  });
}

/** Everything the page reads, joined; `ready` once the board is in (the readings fill in when they arrive). */
export function useDiscover() {
  const b = useBoard(), u = useUniverse(), ro = useRotationMap(), se = useSectorBoard();
  const syms = useMemo(() => (b.data?.rows ?? []).map((r) => r.s), [b.data]);
  const le = useLeadershipList(syms, syms.length > 0);
  const leadRows = le.data && le.data.available ? (le.data as { rows: Record<string, { available: boolean; label?: Lead; text?: string }> }).rows : undefined;
  const rows = useMemo(() => (b.data ? joinRows(b.data, u.data?.rows, ro.data?.rows, se.data?.rows, leadRows) : []), [b.data, u.data, ro.data, se.data, leadRows]);
  const uni = useMemo(() => new Map((u.data?.rows ?? []).map((r) => [r.symbol, r])), [u.data]);
  return {
    board: b.data, rows, uni, isError: b.isError, ready: !!b.data, leaders: !!leadRows,
    pricesAsOf: u.data?.asOf ?? null, rotDate: ro.data?.date ?? se.data?.date ?? null, rotLabel: (ro.data as { date_label?: string } | undefined)?.date_label ?? null,
    ranked: (ro.data as { groups_ranked?: number } | undefined)?.groups_ranked ?? null,
  };
}

// ------------------------------------------------------------------------------------------------ the address (#themes, #theme-ai-and-genai, ...)
export type Route = { view: "themes" | "what-changed" | "sectors" | "all-companies"; theme?: string; event?: string; sector?: string };
export function parseRoute(hash: string, themes: string[], sectors: string[]): Route {
  const h = hash.replace(/^#/, "");
  if (h.startsWith("theme-")) { const t = themes.find((x) => slug(x) === h.slice(6)); if (t) return { view: "themes", theme: t }; }
  if (h.startsWith("change-")) { const k = h.slice(7); if (EVENTS.some((e) => e.k === k) || BRIEF_CARDS.some((b) => b.k === k)) return { view: "what-changed", event: k }; }
  if (h.startsWith("sector-")) { const s = sectors.find((x) => slug(x) === h.slice(7)); if (s) return { view: "sectors", sector: s }; }
  if (h === "what-changed" || h === "sectors" || h === "all-companies") return { view: h };
  return { view: "themes" };
}
export const routeKey = (r: Route) => (r.theme ? "theme-" + slug(r.theme) : r.event ? "change-" + r.event : r.sector ? "sector-" + slug(r.sector) : r.view);

// ------------------------------------------------------------------------------------------------ the table's filters, views and sorting
export type TState = { stage: string; size: string; lt: string; pr: string; cn: string; mine: boolean; q: string; lenses: string[]; sort: string; dir: 1 | -1; page: number; per: number; cell: string | null };
export const freshT = (sort = "pr"): TState => ({ stage: "", size: "", lt: "", pr: "", cn: "", mine: false, q: "", lenses: [], sort, dir: -1, page: 0, per: 25, cell: null });
export const LENSES: { k: string; t: string; f: (r: DRow) => boolean }[] = [
  { k: "fresh", t: "New order or capacity filing", f: (r) => !!(r.ev.order || r.ev.capacity) },
  { k: "uptrend", t: "Long-term uptrend", f: isUp },
  { k: "leader", t: "Leader in its peer group", f: (r) => r.lead === "leader" },
  { k: "high", t: "Within 10% of its 52-week high", f: (r) => r.hi != null && r.hi <= 10 },
  { k: "ahead", t: "Industry ahead and gaining", f: (r) => r.cc === "ahead_gaining" },
  { k: "prism", t: "Prism strong or healthy", f: (r) => r.pl === "Strong" || r.pl === "Healthy" },
];
const TREND_RANK: Record<string, number> = { "Strong uptrend": 5, Uptrend: 4, Sideways: 3, Downtrend: 2, "Strong downtrend": 1 };
const CORNER_RANK: Record<string, number> = { ahead_gaining: 4, ahead_slowing: 3, behind_gaining: 2, behind_slipping: 1 };
export function sortValue(k: string, r: DRow, event?: string): number | string | null {
  switch (k) {
    case "co": return r.n.toLowerCase();
    case "th": return r.th + " " + r.st;
    case "ev": return event ? (r.ev[event] || 0) * 1000 + evBiz(r) : evBiz(r) * 1000 + (r.fc || 0);
    case "pr": return r.pr;
    case "lt": return r.lt ? TREND_RANK[r.lt] ?? null : null;
    case "r3m": return r.r3m;
    case "r1y": return r.r1y;
    case "hi": return r.hi == null ? null : -r.hi;
    case "mc": return r.mc;
    case "cn": return r.cc ? CORNER_RANK[r.cc] : null;
    default: return null;
  }
}
export function filterRows(rows: DRow[], S: TState, onList: (s: string) => boolean, withLenses = true): DRow[] {
  let a = rows.filter((r) => {
    if (S.stage && r.st !== S.stage) return false;
    if (S.size && sizeOf(r.mc) !== S.size) return false;
    if (S.lt) { if (S.lt === "none") { if (r.lt) return false; } else if (r.lt !== S.lt) return false; }
    if (S.pr && r.pl !== S.pr) return false;
    if (S.cn && r.cc !== S.cn) return false;
    if (S.mine && !onList(r.s)) return false;
    if (S.cell && r.th !== S.cell) return false;
    if (S.q) { const q = S.q.toLowerCase(); if (!(r.n.toLowerCase().includes(q) || r.s.toLowerCase().includes(q))) return false; }
    return true;
  });
  if (withLenses) for (const l of LENSES) if (S.lenses.includes(l.k)) a = a.filter(l.f);
  return a;
}
export function sortRows(rows: DRow[], S: TState, event?: string): DRow[] {
  return rows.slice().sort((a, b) => {
    const x = sortValue(S.sort, a, event), y = sortValue(S.sort, b, event);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * S.dir;
  });
}
