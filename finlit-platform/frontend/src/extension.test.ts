// The browser extension's lookup logic (extension/lib): what is selected, the glossary inside the extension, and finding a listed company. Pure functions, no browser.
import { describe, expect, it } from "vitest";
import glossaryDoc from "../../extension/data/glossary.json";

// @ts-ignore: plain JavaScript files shared with the extension (no build step there)
const text = await import("../../extension/lib/text.js");
// @ts-ignore
const gl = await import("../../extension/lib/glossary.js");
// @ts-ignore
const co = await import("../../extension/lib/companies.js");
// @ts-ignore
const fmt = await import("../../extension/lib/format.js");

describe("cleanSelection", () => {
  it("keeps a short phrase, trims quotes and sentence punctuation, collapses spaces", () => {
    expect(text.cleanSelection("  “Return on  equity”, ")).toBe("Return on equity");
    expect(text.cleanSelection("EBITDA.")).toBe("EBITDA");
  });
  it("refuses what is not worth looking up and never passes long text on", () => {
    for (const bad of ["", "a", "12345", "₹ 1,200", "name@example.com", "https://example.com/x", "www.example.com", "x".repeat(81), "one two three four five six seven eight nine", null, 5])
      expect(text.cleanSelection(bad as never)).toBeNull();
  });
});

describe("glossary inside the extension", () => {
  const g = gl.makeGlossary(glossaryDoc);
  it("finds a term by name or alias, ignoring case, symbols and a plural", () => {
    expect(g.exact("52-week high")?.id).toBe("52-week-high-and-low");
    expect(g.exact("EBITDA")?.term).toMatch(/EBITDA/i);
    expect(g.exact("dividends")).not.toBeNull();
    expect(g.exact("zzzqqq nothing")).toBeNull();
  });
  it("offers related terms only for a real word and caps them", () => {
    expect(g.related("zz")).toEqual([]);
    expect(g.related("dividend").length).toBeLessThanOrEqual(4);
  });
  it("carries a meaning for every term and nothing the card does not show", () => {
    expect(glossaryDoc.terms.length).toBeGreaterThan(400);
    for (const t of glossaryDoc.terms) { expect(t.meaning.length).toBeGreaterThan(10); expect(Object.keys(t).sort()).toEqual(["aliases", "formula", "id", "meaning", "term", "topic"]); }
  });
});

describe("finding a listed company", () => {
  const rows = [["RELIANCE", "Reliance Industries Ltd", "500325", "RELIANCE"], ["TCS", "Tata Consultancy Services Ltd", "532540", ""], ["RELINFRA", "Reliance Infrastructure Ltd", "500390", ""],
    ["RPOWER", "Reliance Power Ltd", "532939", ""], ["INFY", "Infosys Ltd", "500209", ""],
    ...Array.from({ length: 9 }, (_, i) => [`IND${i}`, `Indian Thing ${i} Ltd`, "", ""])];
  const c = co.makeCompanies(rows);
  it("matches a ticker only when it is written in capitals, and a full name in any case", () => {
    expect(c.find("TCS")?.best[0]).toBe("TCS");
    expect(c.find("tcs")).toBeNull();
    expect(c.find("infosys")?.how).toBe("name");
    expect(c.find("Tata Consultancy Services Limited")?.best[0]).toBe("TCS");
  });
  it("takes the biggest company for a name that starts the same way and offers the others", () => {
    const r = c.find("Reliance");
    expect(r.best[0]).toBe("RELIANCE");
    expect(r.how).toBe("starts");
    expect(r.others.map((x: string[]) => x[0])).toEqual(["RELINFRA", "RPOWER"]);
  });
  it("does not treat a common word that starts many names as a company", () => {
    expect(c.find("Indian")).toBeNull();
    expect(c.find("Indian Thing 3")?.best[0]).toBe("IND3");
    expect(c.find("xy")).toBeNull();
  });
  it("keeps only symbol, name and the two codes of the site's search list", () => {
    expect(co.slimIndex({ rows: [["A", "A Ltd", "1", 1, "AA"], ["B", "B Ltd", null, 0]] })).toEqual([["A", "A Ltd", "1", "AA"], ["B", "B Ltd", "", ""]]);
  });
});

describe("number wording", () => {
  it("writes market value in crore or lakh crore", () => {
    expect(fmt.crores(1960000)).toBe("₹19.6 L Cr");
    expect(fmt.crores(5430)).toBe("₹5,430 Cr");
    expect(fmt.crores(0)).toBeNull();
    expect(fmt.num(null)).toBeNull();
    expect(fmt.pct(9.84)).toBe("9.8%");
  });
});
