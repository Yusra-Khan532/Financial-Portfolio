// Indian number formatting used across the site (₹, lakh/crore grouping, true minus sign).
import { capBucket } from "./capBuckets";
export const MINUS = "−";

// One formatter per number of decimals, made once: toLocaleString with options builds a new one on every call, which was a quarter of a second of
// a phone's time on the All IPOs list (27 Nov 2026). The output is the same.
const NF = new Map<number, Intl.NumberFormat>();
export const nf = (n: number, d = 2) => {
  let f = NF.get(d);
  if (!f) { f = new Intl.NumberFormat("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }); NF.set(d, f); }
  return f.format(Math.abs(n));
};

/** An en-IN date formatter for these options, made once and reused (same output as toLocaleDateString with them). */
const DF = new Map<string, Intl.DateTimeFormat>();
export const dateFormat = (opts: Intl.DateTimeFormatOptions) => {
  const k = JSON.stringify(opts);
  let f = DF.get(k);
  if (!f) { f = new Intl.DateTimeFormat("en-IN", opts); DF.set(k, f); }
  return f;
};

/** A text cell for a spreadsheet: one that starts like a formula (= + - @) is stored as plain text so Excel never runs it. Real numbers pass through. */
export const csvText = (s: string) => (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? "'" + s : s);

export const num = (n: number | null | undefined, d = 2) => (n == null ? "—" : (n < 0 ? MINUS : "") + nf(n, d));

export const signed = (n: number | null | undefined, d = 2, unit = "%") =>
  n == null ? "—" : (n > 0 ? "▲ +" : n < 0 ? "▼ " + MINUS : "") + nf(n, d) + unit;

/** Crore amount, switching to lakh crore (L) above ₹1,00,000 Cr. */
export const cr = (n: number | null | undefined) =>
  n == null ? "—" : Math.abs(n) >= 100000 ? (n < 0 ? MINUS : "") + nf(n / 100000, 2) + " L" : num(n, 0);

export const pct = (n: number | null | undefined, d = 2) => (n == null ? "—" : num(n, d) + "%");

export function fmtUnit(v: number | null | undefined, unit?: string | null): string {
  if (v == null) return "—";
  if (unit === "%") return num(v) + "%";
  if (unit === "x") return num(v) + "×";
  if (unit === "Cr") return "₹" + cr(v) + " Cr";
  if (unit === "days") return num(v, 0) + " days";
  return num(v);
}

export const dateIN = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) => {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return Number.isNaN(d.getTime()) ? iso : dateFormat(opts).format(d);
};

export const initials = (text: string) =>
  text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || text.slice(0, 2).toUpperCase();

/** The size word of a market value (₹ crore): the site's one four-size scale (capBuckets.ts). */
export const capSize = (crore: number | null | undefined): string | null => capBucket(crore)?.label ?? null;
