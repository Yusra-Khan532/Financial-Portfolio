import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUCKETS, FIGURE } from "./platformTools";

// Task #89: the figures under the tools in the platform directory must belong to real tools and agree with the product's own counts.
const ids = new Set(BUCKETS.flatMap((b) => b.cards.map((c) => c.id)));
const glossary = JSON.parse(readFileSync(join(process.cwd(), "src/content/glossary.json"), "utf8")) as { terms: unknown[] | Record<string, unknown> };

describe("platform directory figures", () => {
  it("names only real tools, each with a figure and a label", () => {
    for (const [id, [n, label]] of Object.entries(FIGURE)) { expect(ids.has(id), id).toBe(true); expect(n.length).toBeGreaterThan(0); expect(label.length).toBeGreaterThan(0); }
    expect(Object.keys(FIGURE).length).toBeGreaterThanOrEqual(15);
  });
  it("states a glossary floor the glossary meets", () => {
    const have = Array.isArray(glossary.terms) ? glossary.terms.length : Object.keys(glossary.terms).length;
    const floor = Number(FIGURE["glossary"][0].replace(/\D/g, ""));
    expect(have).toBeGreaterThanOrEqual(floor);
  });
  it("describes, never advises", () => {
    for (const [, [n, label]] of Object.entries(FIGURE)) expect(`${n} ${label}`).not.toMatch(/\b(buy|sell|hold|best|top pick)\b/i);
  });
});
