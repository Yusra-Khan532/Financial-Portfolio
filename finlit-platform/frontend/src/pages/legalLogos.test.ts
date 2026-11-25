// The research disclosures say how company logos are used (owner's question, 25 Nov 2026): only beside the name, unchanged, to identify the company;
// no endorsement or connection; a company can ask for a change or removal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("company logos in the research disclosures", () => {
  it("names the owners, the identifying use, no endorsement, and how a company asks for a change", () => {
    const src = readFileSync(join(__dirname, "Legal.tsx"), "utf8");
    expect(src).toContain('["Company names and logos", "Company names, logos and trademarks belong to their owners.');
    expect(src).toMatch(/only beside its name, unchanged, to identify the company/);
    expect(src).toMatch(/does not mean the company endorses, sponsors or is connected with FinLit/);
    expect(src).toMatch(/changed or removed can write to us through the contact page/);
  });
});
