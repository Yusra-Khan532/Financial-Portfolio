// Account calls. Each returns plain data or throws ApiError (with the server's code in `.body.status`).
import { apiGet, apiSend } from "./api";
import type { Holding, Portfolio } from "./portfolio";
import type { User } from "./auth";
import type { Prefs } from "./prefs";

export type SignInResult = { user: User; csrf: string; mfaSetupRequired: boolean };
export const signUp = (b: { email: string; password: string; name?: string; mobile: string; accept_terms: boolean }) => apiSend("POST", "/api/auth/register", b);
export const verifyEmail = (token: string) => apiSend("POST", "/api/auth/verify-email", { token });
export const resendVerification = (email: string) => apiSend("POST", "/api/auth/resend-verification", { email });
export const signIn = (b: { email: string; password: string; code?: string }) => apiSend<SignInResult>("POST", "/api/auth/login", b);
export const forgotPassword = (email: string) => apiSend("POST", "/api/auth/forgot", { email });
export const resetPassword = (token: string, password: string) => apiSend("POST", "/api/auth/reset", { token, password });
/** The second page of "Forgot password" (owner, 17 Nov 2026): the 6-digit code from the email and the new password. */
export const resetPasswordWithCode = (email: string, code: string, password: string) => apiSend("POST", "/api/auth/reset-code", { email, code, password });

export const updateProfile = (name: string, mobile?: string) => apiSend("PATCH", "/api/me", mobile ? { name, mobile } : { name });
/** The member's own name, email and mobile (owner, 24 Nov 2026). */
export const myProfile = () => apiGet<{ name: string | null; email: string; mobile: string | null }>("/api/me/profile");
/** An Indian mobile: 10 digits starting 6-9, with an optional +91 / 91 / 0 and spaces or dashes (the server checks it again). */
export const isMobile = (s: string): boolean => /^(?:\+?91|0)?[6-9]\d{9}$/.test(s.replace(/[\s\-().]/g, ""));
export const changePassword = (current: string, next: string) => apiSend("POST", "/api/me/password", { current, new: next });
export type SessionRow = { id: string; current: boolean; ip: string | null; agent: string; createdAt: string; lastSeenAt: string };
export const listSessions = () => apiGet<{ sessions: SessionRow[] }>("/api/me/sessions");
export const endSession = (id: string) => apiSend("DELETE", `/api/me/sessions/${encodeURIComponent(id)}`);
export const endOtherSessions = () => apiSend("POST", "/api/me/sessions/end-others");
export const mfaSetup = () => apiSend<{ secret: string; uri: string }>("POST", "/api/me/mfa/setup");
export const mfaEnable = (code: string) => apiSend("POST", "/api/me/mfa/enable", { code });
export const mfaDisable = (code: string) => apiSend("POST", "/api/me/mfa/disable", { code });
export const deleteAccount = (password: string) => apiSend("DELETE", "/api/me", { password });
export const requestPlan = (plan: "silver" | "gold", note?: string) => apiSend("POST", "/api/me/plan-request", { plan, note });

export type SavedState = { portfolio?: { holdings?: Holding[]; portfolios?: Portfolio[] }; watchlist: { lists?: { id: string; name: string; symbols: string[] }[]; meta?: Record<string, { note?: string; target?: number; added: number }> }; screens: { name: string; state: unknown }[]; prefs: Partial<Prefs> };
export const loadState = () => apiGet<SavedState>("/api/me/state");
export const saveWatchlist = (b: unknown) => apiSend("PUT", "/api/me/watchlist", b);
/** Task #235: the rows (buys, sales, names) and, when there are any, the portfolios (one per broker account). */
export const savePortfolio = (holdings: unknown, portfolios?: unknown[]) => apiSend("PUT", "/api/me/portfolio", portfolios?.length ? { holdings, portfolios } : { holdings });
/** Clear portfolio (task #183): the server empties the equity list and holds what was there for the Undo window. */
export const clearPortfolioServer = () => apiSend<{ status: string; removed: number; undoSeconds: number }>("POST", "/api/me/portfolio/clear");
export const undoClearPortfolioServer = () => apiSend<{ status: string; holdings: unknown[] }>("POST", "/api/me/portfolio/undo-clear");
export const saveScreens = (screens: unknown) => apiSend("PUT", "/api/me/screens", { screens });
export const savePrefs = (p: Prefs) => apiSend("PUT", "/api/me/prefs", p);

export type AdminUser = { id: string; email: string; name: string | null; role: string; plan: Plan3; planUntil: string | null; status: string; verified: boolean; mfa: boolean; createdAt: string; lastLoginAt: string | null };
type Plan3 = "basic" | "silver" | "gold";
export type PlanRequest = { id: number; email: string; plan: Plan3; currentPlan: Plan3; note: string | null; createdAt: string; userId: string };
export type AuditRow = { at: string; actor: string | null; action: string; target: string | null; ip: string | null; meta: Record<string, unknown> };
export const adminUsers = (q: string, page: number) => apiGet<{ users: AdminUser[]; total: number; page: number }>(`/api/admin/users?q=${encodeURIComponent(q)}&page=${page}`);
export const adminPatch = (id: string, b: { plan?: Plan3; plan_days?: number; role?: string; status?: string; verify_email?: boolean }) => apiSend("PATCH", `/api/admin/users/${id}`, b);
export const adminRequests = () => apiGet<{ requests: PlanRequest[] }>("/api/admin/plan-requests");
export const adminDecline = (id: number) => apiSend("POST", `/api/admin/plan-requests/${id}/decline`);
export const adminAudit = () => apiGet<{ events: AuditRow[] }>("/api/admin/audit");
export type DbWake = { available: boolean; wakesToday: number | null; awakeMinutesToday: number | null; monthAwakeHours: number | null; monthCuHours: number | null; budgetCuHours: number; budgetAwakeHours: number; pct: number | null; warning: string | null; assumption: string };
/** Task #281: every fund data gap of the active schemes, counted each time the Data health panel opens (null when the count could not be read). */
export type FundGaps = { active: number; at: string; gaps: { key: string; label: string; count: number; of: number; among: string; fix: string; examples: string[] }[] };
export type DataHealth = { fundGaps?: FundGaps | null; coverage?: { byState: Record<string, number>; mismatches: { symbol: string; lines: string[]; at: string }[]; providerEmpty: { symbol: string; name: string | null }[] }; universe: number; loaded: number; scored: number; queued: number; lastLoad: string | null; calendars?: { resultsAt: string | null; resultsThrough: string | null; ipoAt: string | null }; runs24h: Record<string, number>; /** Task #283 PR C: listed companies with the retired overall score but no FinLit Prism score (admin only). */ prismGap?: { listed: number; retiredScored: number; prismScored: number; retiredNoPrism: number } | null; recentProblems: { symbol: string; status: string; at: string; detail: string }[]; funds?: { etf: { n: number; active: number; last: string | null } | null; mf: { n: number; active: number; with_history: number; last: string | null } | null }; clientIp?: { header: string | null; chain: string | null; peer: string | null; resolved: string }; dbWake?: DbWake; resultsLight?: { days: number; declared: number; filled: number; fromFullReport: number; fromLightRow: number; awaitingProvider: number; awaitingOurs: number } | null; integrity?: { at: string; level: "green" | "amber" | "red"; sampled: number; checks: { key: string; label: string; level: "green" | "amber" | "red"; checked: number; bad: number; message: string; examples: string[] }[] } | null };
export type MonCheck = { key: string; name: string; group: string; up: boolean | null; latencyMs: number | null; checkedAt: string | null; goodPct: number | null; checks: number; errors: string[] };
export type Monitoring = { checks: MonCheck[]; note: string | null; incidents: { name: string; type: string; at: string }[]; failingJobs: string[];
  outside: { ok: boolean; status: number | null; ms: number | null; version: string | null; failsInARow: number; at: string } | null;
  outsideRecent: { ok: boolean; at: string }[];
  k6: { run: string; passed: boolean; requests: number; p95Ms: number | null; avgMs: number | null; errorPct: number | null; vus: number | null; runUrl: string | null; at: string } | null;
  kumaUrl: string | null; asOf: string };
export const adminMonitoring = () => apiGet<Monitoring>("/api/admin/monitoring");
export const adminHealth = () => apiGet<DataHealth>("/api/admin/data-health");
/** Console > Storage (finlit/storage.py): the server disk, what fills it, the database by table, the backups and the daily growth. Bytes throughout. */
export type StorageTable = { name: string; group: string; total: number; data: number; indexes: number; largeValues: number; live: number; dead: number; chunks?: number; compressedChunks?: number };
export type StoragePart = { name: string; bytes: number | null; note?: string };
export type StorageReport = {
  at: string; alertPct: number;
  disk: { total: number; used: number; free: number } | null;
  parts: StoragePart[];
  database: { bytes: number; walBytes: number | null; walWhy?: string; tables: StorageTable[]; tableCount: number; otherTables: number; otherTablesBytes: number;
    groups: { name: string; bytes: number; tables: number }[]; systemBytes: number; deadRows: number; hypertables: { name: string; chunks: number; compressed: number }[] };
  backups: { available: false; why: string } | { available: true; count: number; bytes: number; files: { name: string; bytes: number; at: string }[] };
  folders: { name: string; path: string; bytes: number | null }[];
  history: { day: string; diskUsed: number | null; diskTotal: number | null; dbBytes: number | null; backupsBytes: number | null }[];
  growth: { known: false; why: string } | { known: true; fromDay: string; toDay: string; days: number; diskPerDay: number; dbPerDay: number | null; daysToAlert: number | null; daysToFull: number | null; steady?: boolean };
};
export const adminStorage = () => apiGet<StorageReport>("/api/admin/storage");

export const addIpo = (b: Record<string, unknown>) => apiSend("POST", "/api/admin/ipos", b);
export const deleteIpo = (id: number) => apiSend("DELETE", `/api/admin/ipos/${id}`);
export const addFeed = (b: Record<string, unknown>) => apiSend("POST", "/api/admin/feed", b);
export const deleteFeed = (id: number) => apiSend("DELETE", `/api/admin/feed/${id}`);

export type FundJob = "refresh-etf" | "refresh-mf" | "backfill-mf";
export type FundJobRow = { state: "starting" | "running" | "done" | "failed"; startedAt?: string; finishedAt?: string; rc?: number; result?: string } | null;
export type FundStatus = { running: boolean; scheduledPaused: boolean; jobs: Record<FundJob, FundJobRow> };
export const fundStatus = () => apiGet<FundStatus>("/api/admin/funds/status");
export const fundRun = (job: FundJob) => apiSend("POST", "/api/admin/funds/run", { job });

export type SystemStatus = { loadsEnabled: boolean; pausedUntil?: string | null; pausedUntilIST?: string | null; pausedBy?: string | null; pauseWasLegacy?: boolean; resumesAutomatically?: boolean; pauseChoicesMinutes?: number[]; bootEnvOff: boolean; fundEnvOff: boolean; memory: { totalMb: number | null; usedMb: number | null; availableMb: number | null }; uptimeSeconds: number; startedAt: string };
export const systemStatus = () => apiGet<SystemStatus>("/api/admin/system/status");
/** Pause (enabled=false, for `minutes`: 30 by default; over 720 needs confirmLong) or resume the heavy loads. A pause always ends by itself. */
export const systemLoads = (enabled: boolean, minutes?: number, confirmLong?: boolean) => apiSend<SystemStatus>("POST", "/api/admin/system/loads", { enabled, ...(minutes ? { minutes } : {}), ...(confirmLong ? { confirmLong } : {}) });
export const systemRestart = () => apiSend("POST", "/api/admin/system/restart");
