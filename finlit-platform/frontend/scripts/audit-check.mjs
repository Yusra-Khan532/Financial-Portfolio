// The website's dependency audit (run by .github/workflows/platform-security.yml from finlit-platform/frontend). Fails on any high or critical advisory,
// except one listed in audit-allow.json, and such an exception holds only while (1) it is not in anything that ships to visitors (`npm audit --omit=dev`
// stays clean of it) and (2) no fixed version of its package is published. Reads package-lock.json only (no install). Exit 1 with the reason on any failure.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args) => { try { return execFileSync(npm, args, { encoding: "utf8", maxBuffer: 64 << 20 }); } catch (e) { return e.stdout || ""; } };   // npm audit exits 1 when it finds anything
const HIGH = new Set(["high", "critical"]);
const allow = JSON.parse(readFileSync(new URL("../audit-allow.json", import.meta.url), "utf8")).allow;
const idOf = (a) => (String(a.url || "").match(/GHSA-[a-z0-9-]+/i) || [])[0] || String(a.source);
const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

function advisories(json) {
  const out = new Map();
  for (const v of Object.values(JSON.parse(json || "{}").vulnerabilities || {})) for (const a of v.via || []) if (typeof a === "object") out.set(idOf(a), a);
  return [...out.entries()].filter(([, a]) => HIGH.has(a.severity));
}

const problems = [];
const all = advisories(run(["audit", "--json"]));
const shipped = new Set(advisories(run(["audit", "--json", "--omit=dev"])).map(([id]) => id));
for (const [id, a] of all) {
  const ok = allow.find((x) => x.id === id);
  if (!ok) problems.push(`${id} (${a.name}, ${a.severity}): ${a.title}`);
  else if (shipped.has(id)) problems.push(`${id} is allowed for build and test tools only, but it now reaches what ships to visitors (${a.name})`);
}
for (const x of allow) {
  const latest = run(["view", x.package, "version"]).trim();
  if (latest && cmp(latest, x.maxAffected) > 0) problems.push(`${x.package} ${latest} is published (the advisory ${x.id} covers up to ${x.maxAffected}): update the lockfile and remove the entry from audit-allow.json`);
}
const used = allow.filter((x) => all.some(([id]) => id === x.id)).map((x) => x.id);
if (problems.length) {
  console.error("Website dependency audit failed:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Website dependency audit passed: no high or critical advisory${used.length ? ` except the allowed ${used.join(", ")} (build and test tools only, no fixed version published yet)` : ""}.`);
