import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./extension.css", import.meta.url), "utf8");
const tsx = readFileSync(new URL("../pages/BrowserExtension.tsx", import.meta.url), "utf8");

describe("browser extension page top boxes (task #66)", () => {
  it("the two top boxes are equal columns of one height", () => {
    expect(css).toMatch(/\.ext-hero \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)[^}]*align-items: stretch/);
  });
  it("the long install steps sit below the pair, not inside the left box", () => {
    const hero = tsx.slice(tsx.indexOf('className="ext-hero"'), tsx.indexOf("<Preview />"));
    expect(hero).not.toContain("<Steps />");
    expect(tsx).toContain('aria-labelledby="ext-steps"');
  });
});
