// Task #251 (the 19 Nov Discover pack), task #260 (the 20 Nov pack): the Discover page's data and the pure rules it draws with.
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
import { stateWord } from "../lib/sectors";
import { SIZE_WORD, sizeOfRow, type CompanySize } from "../lib/companySize";

export type Filing = { s: string; n: string; d: string; e: string; el: string; t: string; l: string | null };
export type BoardRow = {
  s: string; n: string; th: string; sec: string[]; st: string; tone: number | null; fc: number; ev: Record<string, number>;
  mac: string | null; sc?: string | null; ind: string | null; dd: string | null; pg: number | null; grp: string | null; lf?: { d: string; el: string; t: string; l?: string };
};
export type BoardTheme = { name: string; label: string; short: string; broad: boolean; n: number; also: number; news: { filings: number; positive: number; negative: number }; verify: string[]; merged: string[] };
export type Board = {
  updated: string | null; companies: number; read: number; days: number; rows: BoardRow[]; themes: BoardTheme[]; efil: Record<string, Filing[]>;
  /** task #260: the latest event filings of the companies whose main theme it is */ thfil?: Record<string, Filing[]>;
  events: string[]; eventsTracked: string[]; caution: string; method: string;
};
export type Corner = "ahead_gaining" | "ahead_slowing" | "behind_gaining" | "behind_slipping";
export type Lead = "leader" | "in_line" | "laggard";
/** One company as the page draws it: the board row and FinLit's readings beside it (null = not available to this plan, or not rated). */
export type DRow = BoardRow & {
  pr: number | null; pl: string | null; lt: string | null; st2: string | null; r1m: number | null; r3m: number | null; r1y: number | null; hi: number | null; mc: number | null;
  pe: number | null; roce: number | null; cc: Corner | null; cn: string | null; rk: number | null; of: number | null; pulse: string | null; grpName: string | null; lead: Lead | null; ll: string | null;
  /** task #260: the size word (the four shared sizes), weeks in the Rotation box, the Pulse state code, the 22-level NSE sector */
  sz: CompanySize | null; wk: number | null; pcode: string | null; sct: string | null;
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
/** The four shared sizes (SHARED §2): Discover's own bands (₹1 lakh / 30,000 / 5,000 Cr) are retired (task #260). */
export const SIZES: Record<CompanySize, string> = SIZE_WORD;
/** The Sector Rotation boxes with their arrows (SHARED §3). */
export const ARROW: Record<Corner, string> = { ahead_gaining: "↗", ahead_slowing: "→", behind_gaining: "↑", behind_slipping: "↘" };
/** The Sector Pulse words (SHARED §3), from a stored state name or code; the old words never reach the page. */
const PULSE_CODE_WORD: Record<string, string> = { thrust_cap: "Bouncing back after a crash", thrust_c: "Bouncing back", confirmed: "Rising together", fading: "Losing steam", washout: "Sold off", neutral: "No clear signal" };
export const pulseWord = (name: string | null | undefined, code?: string | null) => (code && PULSE_CODE_WORD[code]) || stateWord(name) || null;
/** The tone of a presentation in words (SPEC §12). */
export const toneWord = (v: number | null | undefined) => (v == null ? null : v >= 0.6 ? "Very positive" : v >= 0.2 ? "Positive" : v > -0.2 ? "Neutral" : v > -0.6 ? "Negative" : "Very negative");
export const TRENDS = ["Strong uptrend", "Uptrend", "Sideways", "Downtrend", "Strong downtrend"] as const;
export const BANDS = ["Strong", "Healthy", "Average", "Weak", "Poor"] as const;
/** Sector Rotation's own launch of the track record: it starts when Discover started noting entries. */
export const RECORD_FROM = "2026-11-19";

export const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const sizeOf = (r: Pick<DRow, "sz">): CompanySize | null => r.sz;
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
/** Whole days from a reading's date to today (or to `to`); null when the date is not known. */
export function daysOld(d: string | null | undefined, to: Date = new Date()): number | null {
  if (!d) return null;
  const x = new Date(d.length === 10 ? d + "T00:00:00" : d);
  if (Number.isNaN(x.getTime())) return null;
  const t = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.round((t.getTime() - new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()) / 864e5));
}

/** A figure the universe sends that its shared type does not name (ret_3m, pct_from_high). */
const num = (u: URow | undefined, k: string): number | null => { const v = u ? (u as unknown as Record<string, unknown>)[k] : null; return typeof v === "number" && Number.isFinite(v) ? v : null; };

/** One company's peer reading from GET /api/leadership/list: the label with "N of M <group>", or the reason there is none. */
export type LeadRow = { available: boolean; label?: Lead; text?: string; rank?: number; ranked?: number; groupName?: string; group?: string };
/** Joins the board with FinLit's readings. A missing reading stays null: the page says "Not rated" (or the plan it is part of), never a guess. */
export function joinRows(board: Board, uni: URow[] | undefined, rot: RotationRow[] | undefined, pulse: { slug: string; name: string; state: string; state_code?: string }[] | undefined,
  lead: Record<string, LeadRow> | undefined): DRow[] {
  const U = new Map((uni ?? []).map((u) => [u.symbol, u]));
  const ROT = new Map((rot ?? []).map((r) => [r.slug, r]));
  const PUL = new Map((pulse ?? []).map((p) => [p.slug, p]));
  return board.rows.map((r) => {
    const u = U.get(r.s), ro = r.grp ? ROT.get(r.grp) : undefined, pu = r.grp ? PUL.get(r.grp) : undefined, l = lead?.[r.s];
    return {
      ...r, pr: u?.prism_final != null ? Math.round(u.prism_final) : null, pl: titleCase(u?.prism_label ?? null), lt: u?.prism_lt ?? null, st2: u?.prism_st ?? null,
      r1m: u?.return_1m ?? null, r3m: num(u, "ret_3m"), r1y: u?.return_1y ?? null, hi: num(u, "pct_from_high"), mc: u?.market_cap ?? null, pe: u?.pe ?? null, roce: u?.roce ?? null,
      cc: (ro?.corner as Corner) ?? null, cn: ro?.corner_name ?? null, rk: ro?.rank ?? null, of: ro?.ranked ?? null, pulse: pu?.state ?? null, grpName: ro?.name ?? pu?.name ?? null,
      sz: sizeOfRow(u ?? null), wk: ro?.weeks_in_corner ?? null, pcode: pu?.state_code ?? null, sct: r.sc ?? null,
      // task #260 (SPEC §10): "Leader" with "3 of 20 Information Technology Services"; with no peer reading, the site's reason
      lead: l?.available ? (l.label ?? null) : null,
      ll: l?.available && l.label ? (l.rank && l.ranked ? `${l.rank} of ${l.ranked} ${l.groupName ?? l.group ?? "peers"}` : null) : l?.text ?? null,
    };
  });
}

/** Everything the page reads, joined; `ready` once the board is in (the readings fill in when they arrive). */
export function useDiscover() {
  const b = useBoard(), u = useUniverse(), ro = useRotationMap(), se = useSectorBoard();
  const syms = useMemo(() => (b.data?.rows ?? []).map((r) => r.s), [b.data]);
  const le = useLeadershipList(syms, syms.length > 0);
  const leadRows = le.data && le.data.available ? (le.data as { rows: Record<string, LeadRow> }).rows : undefined;
  const rows = useMemo(() => (b.data ? joinRows(b.data, u.data?.rows, ro.data?.rows, se.data?.rows, leadRows) : []), [b.data, u.data, ro.data, se.data, leadRows]);
  const uni = useMemo(() => new Map((u.data?.rows ?? []).map((r) => [r.symbol, r])), [u.data]);
  return {
    board: b.data, rows, uni, isError: b.isError, ready: !!b.data, leaders: !!leadRows,
    pricesAsOf: u.data?.asOf ?? null, rotDate: ro.data?.date ?? se.data?.date ?? null, rotLabel: (ro.data as { date_label?: string } | undefined)?.date_label ?? null,
    pulseDate: se.data?.date ?? null,
    ranked: (ro.data as { groups_ranked?: number } | undefined)?.groups_ranked ?? null,
  };
}

// ------------------------------------------------------------------------------------------------ the address (task #260, SPEC §14: real paths)
//   /discover                                  Themes            /discover/themes/<slug>          a theme
//   /discover/changes                          What changed      /discover/changes/<key>          an event (or a brief card)
//   /discover/sectors                          Sectors           /discover/sectors/<macro>        a macro sector
//   /discover/sectors/<macro>/<sector>         a sector          /discover/industries/<industry>  an industry
//   /discover/companies                        All companies
// The table's filters, sort and page are in the query string. Old /discovery#theme-... links land on the same page.
//   /discover/calls[/<bucket>]                 Earnings calls    /discover/results[/<bucket>]     Results filings (task #267; the bucket's slug)
export type View = "themes" | "what-changed" | "sectors" | "all-companies" | "calls" | "results";
export type Route = { view: View; theme?: string; event?: string; macro?: string; sector?: string; industry?: string; bucket?: string };
export type Names = { themes: string[]; macros: string[]; sectors: string[]; industries: string[] };
export const BASE = "/discover";
export function parseRoute(pathname: string, n: Names): Route {
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean).slice(1).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  const by = (list: string[], v?: string) => (v ? list.find((x) => slug(x) === v) : undefined);
  if (seg[0] === "themes") { const t = by(n.themes, seg[1]); return t ? { view: "themes", theme: t } : { view: "themes" }; }
  if (seg[0] === "changes") { const k = seg[1]; return k && (EVENTS.some((e) => e.k === k) || BRIEF_CARDS.some((b) => b.k === k)) ? { view: "what-changed", event: k } : { view: "what-changed" }; }
  if (seg[0] === "sectors") {
    const m = by(n.macros, seg[1]); if (!m) return { view: "sectors" };
    const sc = by(n.sectors, seg[2]); return sc ? { view: "sectors", macro: m, sector: sc } : { view: "sectors", macro: m };
  }
  if (seg[0] === "industries") { const i = by(n.industries, seg[1]); return i ? { view: "sectors", industry: i } : { view: "sectors" }; }
  if (seg[0] === "companies") return { view: "all-companies" };
  if (seg[0] === "calls" || seg[0] === "results") return seg[1] ? { view: seg[0], bucket: seg[1] } : { view: seg[0] };
  return { view: "themes" };
}
export const themePath = (t: string) => `${BASE}/themes/${slug(t)}`;
export const eventPath = (k: string) => `${BASE}/changes/${k}`;
export const macroPath = (m: string) => `${BASE}/sectors/${slug(m)}`;
export const sectorPath = (m: string, sc: string) => `${BASE}/sectors/${slug(m)}/${slug(sc)}`;
export const industryPath = (i: string) => `${BASE}/industries/${slug(i)}`;
export const VIEW_PATH: Record<View, string> = { themes: BASE, "what-changed": `${BASE}/changes`, sectors: `${BASE}/sectors`, "all-companies": `${BASE}/companies`,
  calls: `${BASE}/calls`, results: `${BASE}/results` };
export const bucketPath = (src: Source, name: string) => `${VIEW_PATH[src]}/${slug(name.replace(/^(Call|Results):\s*/, ""))}`;
export function pathOf(r: Route): string {
  if ((r.view === "calls" || r.view === "results") && r.bucket) return `${VIEW_PATH[r.view]}/${r.bucket}`;
  if (r.theme) return themePath(r.theme);
  if (r.event) return eventPath(r.event);
  if (r.industry) return industryPath(r.industry);
  if (r.macro && r.sector) return sectorPath(r.macro, r.sector);
  if (r.macro) return macroPath(r.macro);
  return VIEW_PATH[r.view];
}
/** The old hash addresses of /discovery (task #251) on the new paths. */
export function legacyPath(hash: string): string {
  const h = hash.replace(/^#/, "");
  if (h.startsWith("theme-")) return `${BASE}/themes/${h.slice(6)}`;
  if (h.startsWith("change-")) return `${BASE}/changes/${h.slice(7)}`;
  if (h.startsWith("sector-")) return `${BASE}/sectors/${h.slice(7)}`;
  if (h === "what-changed") return `${BASE}/changes`;
  if (h === "sectors") return `${BASE}/sectors`;
  if (h === "all-companies") return `${BASE}/companies`;
  return BASE;
}
export const routeKey = (r: Route) => pathOf(r);

// ------------------------------------------------------------------------------------------------ the table's filters, views and sorting
export type TState = { stage: string; size: string; lt: string; pr: string; cn: string; mac: string; sct: string; ind: string; mine: boolean; q: string; lenses: string[];
  sort: string; dir: 1 | -1; page: number; per: number; cell: string | null };
export const freshT = (sort = "pr"): TState => ({ stage: "", size: "", lt: "", pr: "", cn: "", mac: "", sct: "", ind: "", mine: false, q: "", lenses: [], sort, dir: sort === "co" ? 1 : -1, page: 0, per: 25, cell: null });
const QS_KEYS = ["q", "stage", "size", "lt", "pr", "mac", "sct", "ind", "cn"] as const;
/** The table state from the query string (SPEC §14): ?stage=Operating&size=mid&mac=Industrials&v=uptrend,high&sort=r3m&dir=asc&page=2&per=50 */
export function readT(sp: URLSearchParams, sort = "pr"): TState {
  const t = freshT(sort);
  for (const k of QS_KEYS) t[k] = sp.get(k) ?? "";
  t.mine = sp.get("mine") === "1";
  t.lenses = (sp.get("v") ?? "").split(",").filter((x) => LENSES.some((l) => l.k === x));
  if (sp.get("sort")) t.sort = sp.get("sort")!;
  if (sp.get("dir")) t.dir = sp.get("dir") === "asc" ? 1 : -1;
  const pg = Number(sp.get("page")), per = Number(sp.get("per"));
  t.page = Number.isFinite(pg) && pg > 1 ? Math.floor(pg) - 1 : 0;
  t.per = [25, 50, 100].includes(per) ? per : 25;
  t.cell = sp.get("theme") || null;
  return t;
}
/** The query string of a table state; defaults are left out, so a clean page has a clean address. */
export function writeT(t: TState, sort = "pr"): URLSearchParams {
  const sp = new URLSearchParams(), d = freshT(sort);
  for (const k of QS_KEYS) if (t[k]) sp.set(k, t[k]);
  if (t.mine) sp.set("mine", "1");
  if (t.lenses.length) sp.set("v", t.lenses.join(","));
  if (t.cell) sp.set("theme", t.cell);
  if (t.sort !== d.sort) sp.set("sort", t.sort);
  if (t.dir !== (t.sort === d.sort ? d.dir : t.sort === "co" || t.sort === "th" || t.sort === "cls" ? 1 : -1)) sp.set("dir", t.dir === 1 ? "asc" : "desc");
  if (t.page) sp.set("page", String(t.page + 1));
  if (t.per !== 25) sp.set("per", String(t.per));
  return sp;
}
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
    case "cls": return ((r.sct ?? "~") + " " + (r.ind ?? "")).toLowerCase();
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
    if (S.size && r.sz !== S.size) return false;
    if (S.mac && r.mac !== S.mac) return false;
    if (S.sct && r.sct !== S.sct) return false;
    if (S.ind && r.ind !== S.ind) return false;
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

// ------------------------------------------------------------------------------------------------ NSE classification (SHARED §1): the linked lists
export type Tree = { macros: string[]; sectorsOf: Map<string, string[]>; industriesOf: Map<string, string[]>; macroOf: Map<string, string>; sectorOfInd: Map<string, string> };
/** The macro sector › sector › industry tree of the placed companies (each industry in one sector, each sector in one macro sector). */
export function treeOf(rows: Pick<DRow, "mac" | "sct" | "ind">[]): Tree {
  const sectorsOf = new Map<string, Set<string>>(), industriesOf = new Map<string, Set<string>>(), macroOf = new Map<string, string>(), sectorOfInd = new Map<string, string>();
  for (const r of rows) {
    if (!r.mac) continue;
    if (!sectorsOf.has(r.mac)) sectorsOf.set(r.mac, new Set());
    if (r.sct) { sectorsOf.get(r.mac)!.add(r.sct); macroOf.set(r.sct, r.mac); if (!industriesOf.has(r.sct)) industriesOf.set(r.sct, new Set()); }
    if (r.ind && r.sct) { industriesOf.get(r.sct)!.add(r.ind); sectorOfInd.set(r.ind, r.sct); }
  }
  const sort = (m: Map<string, Set<string>>) => new Map([...m].map(([k, v]) => [k, [...v].sort()]));
  return { macros: [...sectorsOf.keys()].sort(), sectorsOf: sort(sectorsOf), industriesOf: sort(industriesOf), macroOf, sectorOfInd };
}
/** Linked filters (SHARED §1): a choice that no longer fits the level above it is taken off, with the short message to show. */
export function linkFilters(t: Pick<TState, "mac" | "sct" | "ind">, tree: Tree): { mac: string; sct: string; ind: string; dropped: string | null } {
  let { sct, ind } = t; const mac = t.mac; let dropped: string | null = null;
  if (mac && sct && tree.macroOf.get(sct) !== mac) { dropped = `${sct} was taken off: not inside your other choice.`; sct = ""; }
  const indSec = ind ? tree.sectorOfInd.get(ind) : undefined;
  if (ind && ((sct && indSec !== sct) || (mac && indSec && tree.macroOf.get(indSec) !== mac))) { dropped = `${ind} was taken off: not inside your other choice.`; ind = ""; }
  return { mac, sct, ind, dropped };
}

// ------------------------------------------------------------------------------------------------ task #267: earnings calls and results filings
//   GET /api/discovery/sources?source=calls|results[&bucket=<name>]   the keyword directory's call and results buckets, read from each company's newest
//                                                                     call transcript and results filing (finlit/discovery/sources.py)
export type Source = "calls" | "results";
export const SOURCES: Record<Source, { label: string; n: number; line: string; doc: string }> = {
  calls: { label: "Earnings calls", n: 8, line: "What management says on results calls", doc: "Call transcript" },
  results: { label: "Results filings", n: 7, line: "What quarterly results filings report", doc: "Results filing" },
};
export const isSource = (v: View): v is Source => v === "calls" || v === "results";
export type SrcDoc = { title: string | null; date: string | null; link: string | null; pages: number | null };
export type SrcCompany = { symbol: string; company: string; score: number | null; distinct: number | null; mentions: number | null; keywords: string[]; evidence: string[];
  verify: string[]; document: SrcDoc; tone: { score: number | null; label: string | null } };
export type SrcBucket = { name: string; label: string; keywords: string[]; companies: number; withEvidence: number; verify: string[]; reason: string | null;
  preview?: string[]; list?: SrcCompany[] };
export type SrcData = { source: Source; label: string; document: string; days: number; buckets: SrcBucket[]; read: number; statuses: Record<string, number>; companies: number;
  updated: string | null; newest: string | null; caution: string; method: string };
export const useSources = (src: Source | null, bucket?: string | null) => useQuery({
  queryKey: ["discovery", "sources", src, bucket ?? null], enabled: !!src, staleTime: 10 * 60_000, retry: 1,
  queryFn: () => apiGet<SrcData>(`/api/discovery/sources?source=${src}${bucket ? `&bucket=${encodeURIComponent(bucket)}` : ""}`),
});
