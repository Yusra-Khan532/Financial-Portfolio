#!/usr/bin/env node
// Task #310: the UI build check. Flags style values that are not in the design rules (src/styles/ui-tokens.css):
//   raw colour      a colour written as hex, rgb() or hsl() outside the token files          -> use var(--...)
//   radius          border-radius with a number                                              -> var(--ui-r-mark | --r-ctl | --r-card | --ui-r-pill), 50%, 0
//   font-size       font-size with a number                                                  -> var(--fs-...), inherit, 1em, 100%
//   font-weight     a weight other than 400, 500, 600, 700                                   -> those four, or var(--ui-fw-...)
//   chart colour on a control   --k*, --c*, --p-*, --pz-*, --pzr-*, --band-*, --ld-* on a button, tab, pill or link selector
//
// The site has thousands of these today, so the check compares against a starting point: ui-baseline.json (next to package.json)
// holds today's count per file. A file may go DOWN, never UP; a new file starts at 0. CI runs it through
// src/styles/uiCheck.test.ts (part of `npm test`), so a pull request that adds a finding fails.
//
//   npm run ui-check                    report, and fail if any file is above its starting point
//   npm run ui-check -- --list          every finding, file:line
//   npm run ui-check:baseline           write today's counts as the new starting point
//
// After each page family is moved to the shared pieces (Button, Tabs, Card, PageTitle, Input, Chip), lower the starting point so the
// cleaned files cannot drift back: run `npm run ui-check:baseline`, check that the diff of ui-baseline.json only goes DOWN (or drops
// files), and commit it in the same pull request. Never raise a number to get a change through: use the variables instead.
// If a file is renamed or split, its findings move with it: write the baseline again in that pull request and say so.
//
// It reads source files line by line (comments are skipped) and reports one finding per kind per line, so run it on source, not on a build.
// Node 18 or later, no dependencies.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative, resolve, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The frontend folder: every path in the report and in ui-baseline.json is relative to it, wherever the check is run from. */
export const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BASELINE = join(FRONTEND, "ui-baseline.json");
export const SRC = join(FRONTEND, "src");
/** The design-token layer: the only files where a raw colour may be written. */
export const TOKEN_FILES = [
  "src/styles/ui-tokens.css",
  "src/styles/design-system.css",
  "src/styles/typescale.css",
  "src/styles/site-green.css",
  "src/lib/palettes.ts",
];

const EXT = new Set([".css", ".jsx", ".tsx", ".js", ".ts"]);
const SKIP = new Set(["node_modules", "dist", "build", ".git", "coverage", "public", "vendor", "content"]);
const WEIGHTS = new Set(["400", "500", "600", "700", "normal", "bold", "inherit"]);
const CHART_VAR = /var\(\s*--(k\d|c\d|p-|pz-|pzr-|band-|ld-)/;
const CONTROL_SEL = /(btn|button|tab|pill|chip|link|\ba\b|toggle|seg)/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.has(extname(name)) && !/\.(min|test|spec|stories)\./.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

// property name in CSS (border-radius) or in JS style objects (borderRadius)
const prop = (css, js) => new RegExp(`(?:^|[\\s;{,(])(?:${css}|${js})\\s*:\\s*([^;},\\n]+)`, "i");
const RADIUS = prop("border(?:-(?:top|bottom)-(?:left|right))?-radius", "border(?:Top|Bottom)?(?:Left|Right)?Radius");
const SIZE = prop("font-size", "fontSize");
const WEIGHT = prop("font-weight", "fontWeight");
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/;
const OK_RADIUS = /^(var\(--(ui-r-mark|ui-r-pill|r-ctl|r-card)\)|50%|0(px)?|inherit)(\s+(var\(--(ui-r-mark|ui-r-pill|r-ctl|r-card)\)|0(px)?))*$/;
const clean = (v) => v.replace(/!important/, "").replace(/['"`,]/g, "").trim();

/** Findings in one file's text. `css` picks the CSS reading; `isToken` allows raw colours. */
export function checkText(text, { css = false, isToken = false } = {}) {
  const found = [];
  let selector = "";
  let inComment = false;
  text.split("\n").forEach((raw, i) => {
    // drop comments so a note such as "task #227" or "was #0E6471" is not read as a colour
    let line = raw;
    if (inComment) { const end = line.indexOf("*/"); if (end < 0) return; line = line.slice(end + 2); inComment = false; }
    line = line.replace(/\/\*.*?\*\//g, "");
    const open = line.indexOf("/*");
    if (open >= 0) { line = line.slice(0, open); inComment = true; }
    if (!css) line = line.replace(/(^|\s)\/\/(\s.*)?$/, "$1");
    const t = line.trim();
    if (!t || t.startsWith("*")) return;
    if (css && t.includes("{")) selector = t.split("{")[0];
    const add = (rule, value) => found.push({ line: i + 1, rule, value: value.slice(0, 60) });
    const styleLine = css || /style|sx=|css`|styled\.|className/.test(line) || /:\s*['"`]?[#\d]/.test(line);

    let m;
    // a value is read up to the first comma, so `var(--r-ctl, 12px)` arrives as `var(--r-ctl`: a token with a fallback is allowed
    if ((m = t.match(RADIUS))) {
      const v = clean(m[1]);
      if (!OK_RADIUS.test(v) && !/^var\(--(ui-r-mark|ui-r-pill|r-ctl|r-card)$/.test(v)) add("radius", v);
    }
    if ((m = t.match(SIZE))) {
      const v = clean(m[1]);
      if (!/^(var\(--(ui-)?fs-[\w-]+\)?|inherit|1em|100%)$/.test(v)) add("font-size", v);
    }
    if ((m = t.match(WEIGHT))) {
      const v = clean(m[1]);
      if (!WEIGHTS.has(v) && !/^var\(--ui-fw-/.test(v)) add("font-weight", v);
    }
    if (!isToken && styleLine && COLOUR.test(t) && !/^\s*--[\w-]+\s*:/.test(t) && !/(url\(|xmlns|href=|#\{)/.test(t)) {
      add("raw colour", t.match(COLOUR)[0]);
    }
    if (css && CHART_VAR.test(t) && CONTROL_SEL.test(selector) && /^(background|color|border)/.test(t)) add("chart colour on a control", t);
  });
  return found;
}

const rel = (f) => relative(FRONTEND, f).split(sep).join("/");

/** Every finding under src, keyed by the file's path relative to the frontend folder. */
export function scan(root = SRC, tokens = TOKEN_FILES) {
  const tokenSet = new Set(tokens);
  const results = {};
  for (const f of walk(root)) {
    const key = rel(f);
    const found = checkText(readFileSync(f, "utf8"), { css: extname(f) === ".css", isToken: tokenSet.has(key) });
    if (found.length) results[key] = found;
  }
  return results;
}

export const countsOf = (results) => Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b)).map(([f, a]) => [f, a.length]));
export function byRule(results) {
  const out = {};
  for (const a of Object.values(results)) for (const x of a) out[x.rule] = (out[x.rule] || 0) + 1;
  return out;
}
/** Files whose count is above their starting point (a file missing from the baseline starts at 0). */
export const worseThan = (counts, base) => Object.entries(counts).filter(([f, n]) => n > (base[f] || 0));
export const readBaseline = (file = BASELINE) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);

function main(args) {
  const WRITE = args.includes("--write-baseline"), LIST = args.includes("--list");
  const results = scan();
  const counts = countsOf(results);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (LIST) for (const [f, a] of Object.entries(results)) for (const x of a) console.log(`${f}:${x.line}  ${x.rule}  ${x.value}`);
  console.log(`UI check: ${total} findings in ${Object.keys(results).length} files`, byRule(results));

  if (WRITE) { writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n"); console.log(`Starting point saved to ${rel(BASELINE)}`); return 0; }
  const base = readBaseline();
  if (!base) { console.log("No starting point found. Run `npm run ui-check:baseline` once, or fix the findings."); return total ? 1 : 0; }
  const worse = worseThan(counts, base);
  if (worse.length) {
    console.error("\nNew values outside the design rules:");
    for (const [f, n] of worse) {
      console.error(`  ${f}: ${n} findings, starting point ${base[f] || 0}`);
      for (const x of results[f].slice(0, 8)) console.error(`    line ${x.line}  ${x.rule}  ${x.value}`);
    }
    console.error("\nUse the variables in src/styles/ui-tokens.css and the shared pieces in src/components/ui.");
    return 1;
  }
  const better = Object.entries(base).filter(([f, n]) => (counts[f] || 0) < n).length;
  console.log(better ? `OK. ${better} files are below their starting point; run \`npm run ui-check:baseline\` to lock that in.` : "OK.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
