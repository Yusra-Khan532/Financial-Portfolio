// Task #432: the "Download AI Summary" PDF. The file is a valid PDF (header, objects, a cross-reference table whose offsets point at each object,
// trailer), carries the company, the call, the source, every heading and point with its page reference and, on every page, the disclaimer and
// "Page n of m"; long summaries flow onto more pages; the rupee sign is written "Rs"; the logo is embedded when given.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { jpegSize, pdfName, summaryPdf, toWinAnsi, wrap } from "./summaryPdf";
import { summaryBlocks } from "./concalls";

const latin = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");
const TEXT = "## Revenue and margins\n- Total income ₹115.79 crore against ₹103.4 crore a year earlier (p. 5)\n- EBITDA margin 13.16% — up from 11.2% (p. 5)\n" +
  "## Orders and capacity\n### Orders\n- Order book of ₹1,234 crore (pp. 6, 7)\n### Capacity\n- New plant at Pune adds 20% capacity (p. 9)";
const base = { text: TEXT, company: "Globe Civil Projects Ltd", symbol: "GLOBECIVIL", kind: "Earnings call", quarter: "Q2 FY27", callDate: "26 Nov 2026",
  source: "transcript" as const, written: new Date("2026-11-27T10:00:00Z"), disclaimer: "Describes what the company said on its call, from its own filings; not a recommendation. Information only, not investment advice." };

describe("task #432: the AI summary PDF", () => {
  it("is a well-formed PDF whose cross-reference table points at every object", () => {
    const s = latin(summaryPdf(base));
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(xref, xref + 4)).toBe("xref");
    const offs = [...s.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    offs.forEach((o, i) => expect(s.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {          // every content stream's length is exact
      const start = m.index! + m[0].length;
      expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
    }
  });

  it("carries the company, the call, the source, every heading and point with its page, and the disclaimer with page numbers", () => {
    const s = latin(summaryPdf(base));
    for (const t of ["Globe Civil Projects Ltd", "GLOBECIVIL", "Q2 FY27", "call of 26 Nov 2026", "the call's transcript filed with the exchange",
      "Revenue and margins", "Orders and capacity", "Orders", "Capacity", "\\(pp. 6, 7\\)", "\\(p. 9\\)", "Information only, not investment advice.",
      "Page 1 of 1", "finlitventures.com", "AI summary"]) expect(s).toContain(t);
    expect(s).toContain("Total income Rs 115.79 crore");      // the standard fonts have no rupee sign
    expect(s).toContain("13.16% \x97 up from");                 // the em dash in the fonts' own set
    expect(s).not.toContain("**");
    expect(s).toContain("GLOBECIVIL  \x95  Earnings call  \x95  Q2 FY27");
    expect(s).not.toContain("\x01");
  });

  it("never breaks a page reference across two lines", () => {
    const pt = "- " + "word ".repeat(17) + "and a figure of 12% (p. 13)";
    const s = latin(summaryPdf({ ...base, text: "## A\n" + pt + "\n" + pt.replace("(p. 13)", "(pp. 6, 7)") }));
    const tj = s.split("\n").filter((l) => l.endsWith(" Tj ET"));       // one drawn line of text each
    expect(tj.some((t) => t.includes("\\(p. 13\\)"))).toBe(true);
    expect(tj.some((t) => t.includes("\\(pp. 6, 7\\)"))).toBe(true);
  });

  it("flows a long summary onto more pages, never past the footer, with the disclaimer on each page", () => {
    const long = Array.from({ length: 12 }, (_, i) => `## Topic ${i + 1}\n` + Array.from({ length: 6 }, (_, k) =>
      `- Point ${k + 1} of topic ${i + 1}: a long line that explains a figure of ${100 + k}.5 crore and what the company compared it with last year (p. ${k + 1})`).join("\n")).join("\n");
    const s = latin(summaryPdf({ ...base, text: long }));
    const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)![1]);
    expect(pages).toBeGreaterThan(2);
    expect(s).toContain(`Page ${pages} of ${pages}`);
    expect(s.split("Information only, not investment advice.").length - 1).toBe(pages);
    const ys = [...s.matchAll(/BT \/F1 10\.5 Tf [\d. ]+ rg [\d.]+ ([\d.]+) Td/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(92);   // body text stays above the footer
    for (let i = 1; i <= 12; i++) expect(s).toContain(`Topic ${i}`);
  });

  it("embeds the logo when given, read from the JPEG's own header", () => {
    const jpeg = new Uint8Array(readFileSync(resolve(__dirname, "../../public/brand/finlit-ventures-pdf-logo.jpg")));
    const sz = jpegSize(jpeg)!;
    expect(sz.width).toBeGreaterThan(sz.height);
    const s = latin(summaryPdf(base, { jpeg, ...sz }));
    expect(s).toContain(`/Subtype /Image /Width ${sz.width} /Height ${sz.height}`);
    expect(s).toContain("/DCTDecode");
    expect(s).toContain("/Im1 Do");
    expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(latin(summaryPdf(base))).toContain("(FinLit Ventures) Tj");     // no logo: the name in text
  });

  it("maps text into the fonts' set and wraps lines to the page", () => {
    expect(toWinAnsi("₹1,200 – “up” → ≥5")).toBe("Rs 1,200 \x96 \x93up\x94 -> >=5");
    expect(toWinAnsi("日本")).toBe("??");
    const lines = wrap("word ".repeat(80).trim(), 200, 10);
    expect(lines.length).toBeGreaterThan(5);
    expect(wrap("x".repeat(500), 100, 10).every((l) => l.length > 0)).toBe(true);
    expect(pdfName("GLOBECIVIL", new Date(2026, 10, 27))).toBe("FinLit-AI-summary-GLOBECIVIL-2026-11-27.pdf");
  });

  it("reads both forms of the summary: the new headings, subheadings and points, and the old fixed headings", () => {
    expect(summaryBlocks("## A\n### B\n- c (p. 1)")).toEqual([{ h: "A" }, { h: "B", sub: true }, { li: "c (p. 1)" }]);
    expect(summaryBlocks("**What the quarter looked like**\n- Revenue grew")).toEqual([{ h: "What the quarter looked like" }, { li: "Revenue grew" }]);
  });
});
