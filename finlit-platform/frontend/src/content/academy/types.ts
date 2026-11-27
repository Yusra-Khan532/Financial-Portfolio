// F&O Academy (Learn): the shape of the curriculum. Content is plain data (one file per module), so the content test can check every lesson,
// every quiz and every word (src/content/academy/academy.test.ts). Describe, never advise: the nouns "buyer", "seller" and "writer" name the
// sides of a contract; no lesson tells anyone what to do.
import type { StructureId } from "../../lib/payoff";

/** One block of a lesson's text. `terms` is a short list of words and their meaning; `note` a boxed aside; `formula` one formula with what it means. */
export type Block = { p: string } | { list: string[] } | { terms: [string, string][] } | { note: string } | { formula: string; what: string };
export type QuizOption = { text: string; correct?: true; /** shown after answering, for every option */ why: string };
export type Question = { q: string; options: QuizOption[] };
/** A worked example in ₹: the steps and the result in one line. */
export type Example = { title: string; steps: string[]; result: string };
export type Widget = { kind: "payoff"; structure: StructureId } | { kind: "greeks" } | { kind: "iv" } | { kind: "costs" };
export type Source = { label: string; url: string };
export type Lesson = {
  /** the address (/learn/fno-academy/<id>) and the progress key; lower-case words and hyphens */ id: string;
  title: string; summary: string; body: Block[]; example: Example; quiz: Question[];
  widget?: Widget;
  /** module 5: the same reading on live data, shown only to Trading Lab members */ live?: { to: string; label: string };
  sources?: Source[];
};
export type Module = { n: number; id: string; title: string; line: string; lessons: Lesson[] };

/** The reminder that ends every lesson (the page draws it; the content test checks it). */
export const RISK_LINE = "F&O carries a high risk of loss: SEBI's studies of individual traders found that most of them lost money in equity F&O. This lesson is education only, not investment advice.";

/** A rule that changes over time is followed by this pointer. */
export const CHECK = "Rules change: check the exchange's current circular.";
