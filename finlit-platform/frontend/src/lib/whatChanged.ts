// Task #272 (Watchlists and Alerts, 20 Nov pack): "What changed at these companies", the shared block of the Watchlists page and, next, the portfolio
// pages (task #274 mounts the same component). Data: GET /api/discovery/changes (backend finlit/discovery/changes.py) for the list's companies, and the
// member's last visit to the page (POST /api/visits/<page>), which marks what is new. Pure helpers here; the block is components/changes/WhatChanged.tsx.
// Describes what companies filed; never a recommendation.
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "./api";
import { useAuth } from "./auth";
import { DEMO } from "./demo";
import type { Sentiment } from "./sentiment";

export type KindFiling = { n: number; d: string; t: string | null; l: string | null; dates: string[]; /** task #365: the newest filing's sentiment, null while not scored */ snt?: Sentiment | null };
export type ChangesCompany = { s: string; n: string; ev: Record<string, KindFiling> };
export type Changes = { days: number; events: string[]; companies: ChangesCompany[]; notPlaced: { s: string; n: string }[] };
/** One row of the block: a company and a kind, with its count and newest filing. */
export type ChangeRow = { s: string; n: string; k: string; count: number; d: string; t: string | null; l: string | null; fresh: number; /** task #365 */ snt: Sentiment | null };

/** Discover's eight kinds, in the pack's order: the tile titles, the row's kind word and its colour class. */
export const KINDS: { k: string; tile: string; row: string; tone: string; one: string; many: string }[] = [
  { k: "order", tile: "Order wins", row: "Order win", tone: "g", one: "order win", many: "order wins" },
  { k: "capacity", tile: "Capacity and commissioning", row: "Capacity", tone: "t", one: "capacity filing", many: "capacity filings" },
  { k: "partnership", tile: "Partnerships and MoUs", row: "Partnership", tone: "v", one: "partnership", many: "partnerships" },
  { k: "mna", tile: "Acquisitions and mergers", row: "Acquisition / merger", tone: "o", one: "acquisition or merger filing", many: "acquisition or merger filings" },
  { k: "fundraise", tile: "Fund raising", row: "Fund raising", tone: "b", one: "fund raising filing", many: "fund raising filings" },
  { k: "rating", tile: "Credit ratings", row: "Credit rating", tone: "s", one: "credit rating", many: "credit ratings" },
  { k: "management", tile: "Management changes", row: "Management", tone: "m", one: "management change", many: "management changes" },
  { k: "legal", tile: "Legal and regulatory", row: "Legal / regulatory", tone: "r", one: "legal or regulatory filing", many: "legal or regulatory filings" },
];
export const KIND = Object.fromEntries(KINDS.map((x) => [x.k, x]));

export const discoverLink = (k: string, name: string) => `/discover/changes/${k}?q=${encodeURIComponent(name)}`;
export const DISCOVER_CHANGES = "/discover/changes";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Nov" from an ISO date or time (India's calendar day for a time). */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.length > 10 ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10) : iso;
  const [, m, day] = d.split("-");
  return `${Number(day)} ${MON[Number(m) - 1] ?? ""}`;
}
/** The India calendar day of the last visit (YYYY-MM-DD), the day from which a filing counts as new. */
export const visitDay = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10) : null);

/** Rows: one per company and kind; order wins first, then the newest. `fresh` = how many of the row's filings are dated on or after the last visit. */
export function rowsOf(data: Changes | undefined, lastVisit: string | null): ChangeRow[] {
  const since = visitDay(lastVisit);
  const out: ChangeRow[] = [];
  for (const c of data?.companies ?? []) for (const k of KINDS) {
    const e = c.ev[k.k]; if (!e) continue;
    out.push({ s: c.s, n: c.n, k: k.k, count: e.n, d: e.d, t: e.t, l: e.l, fresh: since ? e.dates.filter((x) => x >= since).length : 0, snt: e.snt ?? null });
  }
  return out.sort((a, b) => (a.k === "order" ? 0 : 1) - (b.k === "order" ? 0 : 1) || b.d.localeCompare(a.d) || a.n.localeCompare(b.n));
}
/** Each tile's number: how many companies of the list filed that kind. */
export function tileCounts(rows: ChangeRow[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(KINDS.map((k) => [k.k, 0]));
  for (const r of rows) out[r.k] += 1;
  return out;
}
/** The filings dated since the last visit (0 on a first visit: nothing is called new without a visit to compare with). */
export const newCount = (rows: ChangeRow[]) => rows.reduce((s, r) => s + r.fresh, 0);
/** The chip under a company in the list: its filing since the last visit, an order win first. */
export function chipFor(rows: ChangeRow[], symbol: string): ChangeRow | null {
  return rows.find((r) => r.s === symbol && r.fresh > 0) ?? null;   // rows are already ordered order wins first, then newest
}
/** The green notice over the list: the newest order win since the last visit. */
export const orderWinNotice = (rows: ChangeRow[]) => rows.find((r) => r.k === "order" && r.fresh > 0) ?? null;

/** "From Discover: 3 of the 4 companies on My watchlist filed one of these in the last 90 days." */
export function headline(data: Changes | undefined, total: number, listName: string): string {
  const filed = (data?.companies ?? []).filter((c) => Object.keys(c.ev).length > 0).length;
  const days = data?.days ?? 90;
  if (!total) return `From Discover: the companies on ${listName} and what they filed in the last ${days} days.`;
  return `From Discover: ${filed} of the ${total} compan${total === 1 ? "y" : "ies"} on ${listName} filed one of these in the last ${days} days.`;
}
/** "Not in Discover yet: Wheels India (WHEELS). Filings as the companies reported them to NSE in the last 90 days; not a recommendation." */
export function footnote(data: Changes | undefined, nameOf: (s: string) => string | undefined): string {
  const days = data?.days ?? 90;
  const np = (data?.notPlaced ?? []).map((x) => { const nm = nameOf(x.s) || (x.n !== x.s ? x.n : ""); return nm ? `${nm} (${x.s})` : x.s; });
  const head = np.length ? `Not in Discover yet: ${np.slice(0, 8).join(", ")}${np.length > 8 ? ` and ${np.length - 8} more` : ""}. ` : "";
  return `${head}Filings as the companies reported them to NSE in the last ${days} days; not a recommendation.`;
}

export function useChanges(symbols: string[]) {
  const key = [...symbols].sort().join(",");
  return useQuery({
    queryKey: ["discovery", "changes", key], enabled: symbols.length > 0, staleTime: 5 * 60_000, retry: 1,
    queryFn: () => apiGet<Changes>(`/api/discovery/changes?symbols=${encodeURIComponent(key)}`),
  });
}

/** The member's last visit to this page (null on a first visit, signed out, or in the demo). Asked once per page load. */
export function useLastVisit(page: string) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["visit", page], enabled: !!user && !DEMO, staleTime: Infinity, gcTime: Infinity, retry: 0, refetchOnWindowFocus: false,
    queryFn: () => apiSend<{ previous: string | null }>("POST", `/api/visits/${page}`).then((r) => r.previous),
  });
  return q.data ?? null;
}
