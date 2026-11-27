// Types for tour-timing.mjs, so frontend/src/landing/tourTiming.test.ts can import it.
export function chapterList(goliveSource: string): [string, number][];
export function targetLengths(ch: number[], endAt: number, endLen: number, fade: number): number[];
export function startsOf(lengths: number[], fade: number): number[];
