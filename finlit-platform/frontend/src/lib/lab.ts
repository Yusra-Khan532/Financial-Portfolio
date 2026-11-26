// FinLit Trading Lab: access is opened by an administrator to named members (backend finlit/lab/access.py, docs/TRADING-LAB.md).
import { apiGet, apiSend } from "./api";

export const LAB = "trading_lab";
export const LAB_SIGNALS = "trading_lab_signals";
/** True when the member may open the Lab: the server lists the feature in /api/auth/me (administrators always). */
export const hasLab = (features: string[] | undefined) => (features ?? []).includes(LAB);
/** True when an administrator switched this member's trade signals on (Buy/Hold/Sell rating, trader's plan, trade-size debate; administrators always). */
export const hasSignals = (features: string[] | undefined) => (features ?? []).includes(LAB_SIGNALS);

export type LabAccess = { access: boolean; reason: "sign_in" | "admin" | "granted" | "not_granted"; expiresAt: string | null; signals: boolean };
export type LabGrant = { userId: string; email: string; name: string | null; plan: string; grantedAt: string; expiresAt: string | null; note: string | null; grantedBy: string | null; active: boolean; signals: boolean };

export const labAccess = () => apiGet<LabAccess>("/api/lab/access");
export const labGrants = () => apiGet<{ grants: LabGrant[] }>("/api/admin/lab/grants");
export const labGrant = (b: { email: string; days?: number | null; note?: string | null; signals?: boolean }) => apiSend("PUT", "/api/admin/lab/grants", b);
export const labSetSignals = (userId: string, signals: boolean) => apiSend("PATCH", `/api/admin/lab/grants/${userId}`, { signals });
export const labRevoke = (userId: string) => apiSend("DELETE", `/api/admin/lab/grants/${userId}`);
