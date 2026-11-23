// Task #350 (23 Nov 2026): the Mutual Fund Screener filters by the FinLit Mutual Fund Score: the total and each of its four parts, each its own range,
// all joined with AND (backend: finlit/mfscreen/spec.py, `sc=field:from:below`). Gold only: the server answers 403 for any other plan.
// The total takes any range from 0 to 100. A part takes only its band edges (0, 50, 70, 100): an exact part range would give the part's own figure away,
// which the site shows only as a word (Strong 70+, Fair 50 to under 70, Weak under 50).
import type { Glossary } from "./api";
import { PILLAR_HELP, SCORE_BANDS } from "./mfScore";

export type ScoreField = "total" | "perf" | "risk" | "cost" | "quality";
export type ScoreRange = [string, string];   // [from, below] as typed: "" is open
export const SCORE_FIELDS: ScoreField[] = ["total", "perf", "risk", "cost", "quality"];
export const PART_EDGES = [0, 50, 70, 100];
export const SCORE_NAME: Record<ScoreField, string> = { total: "FinLit Mutual Fund Score", perf: "Performance", risk: "Risk", cost: "Cost", quality: "Quality" };
const PILLAR_KEY: Record<Exclude<ScoreField, "total">, string> = { perf: "performance", risk: "risk", cost: "cost", quality: "quality" };

export type ScorePreset = { label: string; lo: string; hi: string };
/** The total's presets are the model's own labels (lib/mfScore SCORE_BANDS): no gap, no overlap, each "from, to under". */
export const TOTAL_PRESETS: ScorePreset[] = SCORE_BANDS.map(([w, a, b]) => ({ label: `${w} ${a === 0 ? `under ${b}` : b === 100 ? `${a}+` : `${a}–${b}`}`, lo: a === 0 ? "" : String(a), hi: b === 100 ? "" : String(b) }));
/** A part's presets are its three words. */
export const PART_PRESETS: ScorePreset[] = [{ label: "Weak under 50", lo: "", hi: "50" }, { label: "Fair 50–70", lo: "50", hi: "70" }, { label: "Strong 70+", lo: "70", hi: "" }];

const NUM = /^\d+(\.\d+)?$/;
/** A range is valid when each end is empty or a number from 0 to 100, a part's ends are band edges, and from is below to. */
export function scoreRangeError(f: ScoreField, lo: string, hi: string): string | null {
  for (const v of [lo, hi]) {
    if (v === "") continue;
    if (!NUM.test(v) || Number(v) > 100) return "Use a number from 0 to 100.";
    if (f !== "total" && !PART_EDGES.includes(Number(v))) return "A part filters by its bands: 0, 50, 70 or 100.";
  }
  if (lo !== "" && hi !== "" && Number(lo) >= Number(hi)) return "The minimum must be below the maximum.";
  return null;
}
/** Ranges from the address bar: unknown fields and invalid ranges are dropped, never trusted. */
export function parseScores(values: string[]): Partial<Record<ScoreField, ScoreRange>> {
  const out: Partial<Record<ScoreField, ScoreRange>> = {};
  for (const v of values) {
    const [f, lo = "", hi = ""] = v.split(":");
    if (!(SCORE_FIELDS as string[]).includes(f) || (!lo && !hi)) continue;
    const a = lo === "" ? "" : String(Number(lo)), b = hi === "" ? "" : String(Number(hi));
    if (!scoreRangeError(f as ScoreField, lo === "" ? "" : lo, hi === "" ? "" : hi)) out[f as ScoreField] = [a, b];
  }
  return out;
}
export const scoreParams = (sc: Partial<Record<ScoreField, ScoreRange>>): string[] =>
  SCORE_FIELDS.filter((f) => sc[f] && (sc[f]![0] || sc[f]![1])).map((f) => `${f}:${sc[f]![0]}:${sc[f]![1]}`);

/** "65 to under 80", "80 or more", "under 35". */
export function scoreRangeText(lo: string, hi: string): string {
  if (lo && hi) return Number(hi) >= 100 ? `${lo} to 100` : `${lo} to under ${hi}`;
  if (lo) return `${lo} or more`;
  return `under ${hi}`;
}
/** The word a range matches exactly, if it is one of the presets. */
export const presetOf = (f: ScoreField, lo: string, hi: string) => (f === "total" ? TOTAL_PRESETS : PART_PRESETS).find((p) => p.lo === lo && p.hi === hi) ?? null;
export const scoreChipLabel = (f: ScoreField, lo: string, hi: string) => {
  const p = presetOf(f, lo, hi);
  return `${f === "total" ? "FinLit score" : SCORE_NAME[f]}: ${p ? p.label.replace(/ (under|\d).*$/, "") + " (" + scoreRangeText(lo, hi) + ")" : scoreRangeText(lo, hi)}`;
};

/** The (i) explanations, from the methodology page (/methodology/mf-score): what it measures, what goes into it, how to read it, what higher and lower mean. */
export const SCORE_HELP: Record<ScoreField, Glossary> = {
  total: {
    key: "mfscore.total", label: "the FinLit Mutual Fund Score",
    what: "A total from 0 to 100 that describes a fund's health from its past NAVs, costs and holdings, against funds of the same category and plan (Direct with Direct, Regular with Regular).",
    lines: ["It combines four parts: Performance, Risk, Cost and Quality. How much each counts depends on the fund group.", "Labels: " + SCORE_BANDS.map(([w, a, b]) => `${w} ${a}${b === 100 ? " to 100" : " to under " + b}`).join(", ") + "."],
    read: "Higher means the fund's past figures compare better with similar funds; lower means they compare worse. A fund with 12 to 35 months of history is provisional; under 12 months it is not rated, and drops out while this filter is set.",
    note: "Describes the fund's health; not a recommendation and not a forecast. Information only, not investment advice.",
  },
  perf: part("perf", "Returns against funds like it: over how long, and month after month.", "Strong means the fund was ahead of similar funds more of the time and over longer periods; Weak means it was behind. Past returns say little about the next year, so Performance is one of four parts."),
  risk: part("risk", "How bumpy the ride was and how deep the falls were, against similar funds.", "Strong means a smoother ride and shallower falls than similar funds; Weak means bumpier or deeper."),
  cost: part("cost", "How much of the return is paid away in expenses, and what it costs to leave (exit load).", "Strong means cheaper than similar funds; Weak means more of the return is paid away."),
  quality: part("quality", "Whether the fund is proven, big enough and built soundly: age, size and how the portfolio is built.", "Strong means an established, adequately sized, soundly built fund; Weak means newer, smaller or less soundly built."),
};
function part(f: Exclude<ScoreField, "total">, what: string, read: string): Glossary {
  return {
    key: "mfscore." + f, label: `the ${SCORE_NAME[f]} part`, what: `Measures ${what.charAt(0).toLowerCase()}${what.slice(1)}`,
    lines: [`The question it answers: ${PILLAR_HELP[PILLAR_KEY[f]]}`, "Shown as a word, never a figure: Strong 70 or more, Fair 50 to under 70, Weak under 50, so this filter picks those bands."],
    read, note: "Each part is scored against funds of the same category and plan. A missing figure never helps a fund's score.",
  };
}
