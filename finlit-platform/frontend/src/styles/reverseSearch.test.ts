import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #111: the Reverse valuation page used the DCF page's search bar classes (dcf-search, dcf-hits) without loading that stylesheet, so a fresh visit showed a tiny raw input and a bulleted list.
const page = readFileSync(join(process.cwd(), "src/pages/ReverseValuation.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/styles/reverse.css"), "utf8");

describe("Reverse valuation search bar", () => {
  it("loads the stylesheet that styles it, before its own", () => {
    const dcf = page.indexOf('import "../styles/dcf.css"'), rev = page.indexOf('import "../styles/reverse.css"');
    expect(dcf).toBeGreaterThan(-1);
    expect(rev).toBeGreaterThan(dcf);
  });
  it("makes it a proper full-height bar", () => {
    expect(css).toMatch(/\.rv-co \.dcf-search \{ min-height: 48px;/);
  });
});
