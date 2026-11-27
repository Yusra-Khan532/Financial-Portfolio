// Types for check-ui.mjs, so src/styles/uiCheck.test.ts can import it.
export type Finding = { line: number; rule: string; value: string };
export const FRONTEND: string;
export const BASELINE: string;
export const SRC: string;
export const TOKEN_FILES: string[];
export function checkText(text: string, opts?: { css?: boolean; isToken?: boolean }): Finding[];
export function scan(root?: string, tokens?: string[]): Record<string, Finding[]>;
export function countsOf(results: Record<string, Finding[]>): Record<string, number>;
export function byRule(results: Record<string, Finding[]>): Record<string, number>;
export function worseThan(counts: Record<string, number>, base: Record<string, number>): [string, number][];
export function readBaseline(file?: string): Record<string, number> | null;
