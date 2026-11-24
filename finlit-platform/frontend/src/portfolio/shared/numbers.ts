// Task #385 (developer file 33, Numbers): how every figure on the Equity portfolio prints. Minus is U+2212; rupees use Indian grouping (₹1,41,223)
// and short forms (₹2.96 L, ₹5,64,392 Cr); a change that rounds to zero prints 0.0% and is shown grey, never −0.0%; multiples carry ×.
// Pure; tested in shared/shared385.test.ts. Phase 2 (Diversification, Risk) prints with the same helpers.
import { MINUS } from "./words";

const grp = (n: number, d = 0) => Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

/** ₹1,41,223 (and −₹1,41,223). A value that rounds to zero has no sign. */
export function rupees(n: number | null | undefined, d = 0): string {
  if (!ok(n)) return MINUS;
  const zero = Number(Math.abs(n).toFixed(d)) === 0;
  return `${n < 0 && !zero ? MINUS : ""}₹${grp(n, d)}`;
}
/** +₹14,738 / −₹76,468 / ₹0: a gain or loss with its sign. */
export function rupeesSigned(n: number | null | undefined): string {
  if (!ok(n)) return MINUS;
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? MINUS : ""}₹${grp(r)}`;
}
/** The short forms: ₹2.96 L from a lakh, ₹1.20 Cr from a crore, ₹5,64,392 Cr from 1,000 crore up; below a lakh the full figure. */
export function rupeesShort(n: number | null | undefined): string {
  if (!ok(n)) return MINUS;
  const a = Math.abs(n), s = n < 0 ? MINUS : "";
  if (a >= 1e10) return `${s}₹${grp(a / 1e7)} Cr`;
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  return `${s}₹${grp(a)}`;
}
/** A market value already in crore: ₹5,64,392 Cr. */
export const croreText = (cr: number | null | undefined) => (ok(cr) ? `${cr < 0 ? MINUS : ""}₹${grp(cr)} Cr` : MINUS);

/** A change in percent: "+1.2%", "−0.4%", and "0.0%" when it rounds to zero (`flat`, shown grey). `sign: false` drops the + on a rise. */
export function pctChange(n: number | null | undefined, d = 1, sign = true): { text: string; flat: boolean; tone: "up" | "dn" | "flat" | "na" } {
  if (!ok(n)) return { text: MINUS, flat: false, tone: "na" };
  const r = Number(n.toFixed(d));
  if (r === 0) return { text: `${(0).toFixed(d)}%`, flat: true, tone: "flat" };
  return { text: `${r > 0 ? (sign ? "+" : "") : MINUS}${Math.abs(r).toFixed(d)}%`, flat: false, tone: r > 0 ? "up" : "dn" };
}
/** The text of pctChange only. */
export const pctText = (n: number | null | undefined, d = 1, sign = true) => pctChange(n, d, sign).text;
/** A plain share of a whole: "36.8%" (no sign). */
export const shareText = (n: number | null | undefined, d = 1) => (ok(n) ? `${Number(n.toFixed(d)) === 0 ? (0).toFixed(d) : n.toFixed(d)}%` : MINUS);
/** A multiple: "1.08×". */
export const times = (n: number | null | undefined, d = 2) => (ok(n) ? `${n < 0 ? MINUS : ""}${Math.abs(n).toFixed(d)}×` : MINUS);
/** A plain number with the real minus: "−18.9". */
export const signedNum = (n: number | null | undefined, d = 1) => (ok(n) ? `${Number(n.toFixed(d)) < 0 ? MINUS : ""}${Math.abs(n).toFixed(d)}` : MINUS);
/** Which class a gain or loss takes: gain, loss, or grey when it rounds to zero. */
export const toneOf = (n: number | null | undefined, d = 1): "up" | "dn" | "flat" | "na" => pctChange(n, d).tone;
