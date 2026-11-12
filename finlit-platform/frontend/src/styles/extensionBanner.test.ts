import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #106: the "New: the FinLit browser extension" strip is one line on a wide screen, never two.
const css = readFileSync(join(process.cwd(), "src/styles/extension.css"), "utf8");
const tsx = readFileSync(join(process.cwd(), "src/components/ExtensionBanner.tsx"), "utf8");

describe("extension banner", () => {
  it("keeps its sentence on one line (with the full text as the tooltip if a narrow screen has to cut it)", () => {
    expect(css).toMatch(/\.ext-banner p \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/);
    expect(tsx).toMatch(/<p title="New: the FinLit browser extension\./);
  });
  it("says it in under 100 characters", () => {
    const m = /<\/b> ([^<]+)<\/p>/.exec(tsx);
    expect(m?.[1].length ?? 999).toBeLessThan(100);
  });
});
