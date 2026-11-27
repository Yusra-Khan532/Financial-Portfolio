// F&O Academy (Learn, /learn/fno-academy): the curriculum in order. Public inside Learn (education, describe-only); only module 5's
// "see it on live data" links are limited to Trading Lab members. Content test: academy.test.ts.
import { M1 } from "./m01";
import { M2 } from "./m02";
import { M3 } from "./m03";
import { M4 } from "./m04";
import { M5 } from "./m05";
import { M6 } from "./m06";
import { M7 } from "./m07";
import { M8 } from "./m08";
import { M9 } from "./m09";
import { M10 } from "./m10";
import type { Lesson, Module } from "./types";

export const MODULES: Module[] = [M1, M2, M3, M4, M5, M6, M7, M8, M9, M10];

/** Every lesson in reading order, with its module. */
export const LESSONS: { lesson: Lesson; module: Module; index: number }[] = MODULES.flatMap((module) => module.lessons.map((lesson) => ({ lesson, module }))).map((x, index) => ({ ...x, index }));
const BY_ID = new Map(LESSONS.map((x) => [x.lesson.id, x]));
export const findLesson = (id: string) => BY_ID.get(id) ?? null;

/** The practice tools, each also inside the lessons that use it. */
export const TOOLS = [
  { id: "payoff-diagram", title: "Payoff diagram", line: "Every structure of module 7 at expiry: strikes, premiums and lot size in; breakevens, largest profit and loss out.", lesson: "reading-payoff-diagrams" },
  { id: "greeks-explorer", title: "Greeks explorer", line: "Delta, gamma, theta and vega across prices and days to expiry, from the Black-Scholes model.", lesson: "black-scholes-explorer" },
  { id: "costs-calculator", title: "F&O costs calculator", line: "STT, exchange charges, SEBI fee, stamp duty and GST on one round trip, with the rates as announced.", lesson: "round-trip-costs" },
] as const;
export type ToolId = (typeof TOOLS)[number]["id"];
export const findTool = (id: string) => TOOLS.find((t) => t.id === id) ?? null;
