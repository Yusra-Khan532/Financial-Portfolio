// Task #235: money in the portfolio pages' words. Indian grouping (₹3,89,302); lakh and crore in compact places (₹3.89 L). Minus is the real minus sign.
import { MINUS } from "../lib/format";

const fmt = (n: number, d = 0) => Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const inr = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? MINUS : `${n < 0 ? MINUS : ""}₹${fmt(n, d)}`);
export const sinr = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? MINUS : `${n > 0 ? "+" : n < 0 ? MINUS : ""}₹${fmt(n)}`);
/** Task #385 (developer file 33, live bug 15): a change that rounds to zero prints 0.0% with no sign (it printed −0.0%) and takes no colour. */
export const pct = (n: number | null | undefined, d = 1) => { if (n == null || !Number.isFinite(n)) return ""; const r = Number(n.toFixed(d)); return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${Math.abs(r).toFixed(d)}%`; };
export const tone = (n: number | null | undefined, d = 1) => { if (n == null) return ""; const r = Number(n.toFixed(d)); return r === 0 ? "" : r > 0 ? "x-up" : "x-dn"; };
export const qf = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
/** ₹3.89 L, ₹1.20 Cr, or the rupees below a lakh. */
export const lk = (n: number) => { const a = Math.abs(n); return `${n < 0 ? MINUS : ""}₹${a >= 1e7 ? (a / 1e7).toFixed(2) + " Cr" : a >= 1e5 ? (a / 1e5).toFixed(2) + " L" : fmt(a)}`; };
const MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
/** 15 Apr 25 */ export const dshort = (d?: string) => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${+dd} ${MON[+m - 1]} ${y.slice(2)}`; };
/** 15 Apr 2025 */ export const dfmt = (d?: string) => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${+dd} ${MON[+m - 1]} ${y}`; };
