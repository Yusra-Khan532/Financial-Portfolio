// Monitoring wording (docs/MONITORING.md): one place for how a check's state and record are said, on the public status page and in the console.
export type Up = boolean | null | undefined;
export const stateWord = (up: Up): string => (up === true ? "Up" : up === false ? "Down" : "Not checked yet");
export const stateTone = (up: Up): "gain" | "loss" | "neutral" => (up === true ? "gain" : up === false ? "loss" : "neutral");
/** "100% of the last 48 checks were good": never claims more history than the checker returned. */
export const recordLine = (goodPct: number | null | undefined, checks: number): string =>
  goodPct == null || !checks ? "No checks recorded yet" : `${Number.isInteger(goodPct) ? goodPct : goodPct.toFixed(1)}% of the last ${checks} check${checks === 1 ? " was" : "s were"} good`;
export const when = (iso: string | null | undefined): string => {
  if (!iso) return "not yet";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "not yet" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
};
