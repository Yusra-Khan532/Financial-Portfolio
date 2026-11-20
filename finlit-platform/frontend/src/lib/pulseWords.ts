// Task #258 (20 Nov handoff, SHARED §3): the one set of words a reader sees for each stored Sector Pulse state, and what each means, for every page that shows a
// Pulse reading. The stored codes stay as they are. The backend twin is backend/finlit/presets/sectorread.py PULSE_WORDS; a test keeps the two the same.
export type PulseCode = "thrust_cap" | "thrust_c" | "confirmed" | "fading" | "washout" | "neutral";
export const PULSE_WORDS: Record<PulseCode, string> = {
  thrust_cap: "Bouncing back after a crash",
  thrust_c: "Bouncing back",
  confirmed: "Rising together",
  fading: "Losing steam",
  washout: "Sold off",
  neutral: "No clear signal",
};
/** What each state means, in the order a reader meets them (the tooltip on the screeners' sector boards). */
export const PULSE_SAY: { code: PulseCode; say: string }[] = [
  { code: "washout", say: "most stocks below their trend, no broad bounce yet." },
  { code: "thrust_c", say: "after a sell-off, most stocks turned up together in a short space of time." },
  { code: "thrust_cap", say: "the same broad bounce, after a deeper fall in which almost every stock hit a new low." },
  { code: "confirmed", say: "most stocks trending up together." },
  { code: "fading", say: "a bounce or rise lost support; fewer stocks are still rising." },
];
export const PULSE_TOOLTIP = PULSE_SAY.map((x) => `${PULSE_WORDS[x.code]}: ${x.say}`).join(" ");
const isCode = (c: unknown): c is PulseCode => typeof c === "string" && c in PULSE_WORDS;
/** The word for a stored state; an unknown code falls back to the word the server sent (never an empty chip). */
export const pulseWord = (code: string | null | undefined, sent?: string | null): string | null => (isCode(code) ? PULSE_WORDS[code] : sent ?? null);
/** The one-line meaning of a state, for its own tooltip; null for No clear signal or an unknown code. */
export const pulseSay = (code: string | null | undefined): string | null => {
  const x = PULSE_SAY.find((p) => p.code === code);
  return x ? `${PULSE_WORDS[x.code]}: ${x.say}` : null;
};
