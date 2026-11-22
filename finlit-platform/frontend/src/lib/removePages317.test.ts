// Task #317 (developer file 23, 22 Nov 2026): Commodity prices (/commodities) and Company financials (/premium/fundamentals) are off the site. Their old
// addresses go to India economy and the Company report; no menu, chip, tile, page question or tool card points at them.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_FAQS } from "../content/pageFaqs";
import { BUCKETS } from "./platformTools";

const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("task #317: two pages taken off the site", () => {
  it("the pages are gone and their old addresses go to /macro and /research", () => {
    expect(existsSync(join(__dirname, "..", "pages", "Commodities.tsx"))).toBe(false);
    expect(existsSync(join(__dirname, "..", "pages", "Fundamentals.tsx"))).toBe(false);
    const app = src("App.tsx");
    expect(app).toMatch(/path="commodities" element={<Navigate to="\/macro" replace \/>}/);
    expect(app).toMatch(/path="premium\/fundamentals" element={<Navigate to="\/research" replace \/>}/);
  });
  it("no Commodities chip on India economy, FII & DII flows or Market events & index", () => {
    for (const f of ["pages/Macro.tsx", "pages/FiiDii.tsx", "pages/Markets.tsx"]) expect(src(f)).not.toMatch(/links=\{\[[^\]]*"\/commodities"/);
  });
  it("Gold dashboards: no Company Financials tile or link; Plans no longer names company financials as a Gold dashboard", () => {
    const p = src("pages/Premium.tsx");
    expect(p).not.toContain("/premium/fundamentals");
    expect(p).toContain('links={["/prism", "/premium/markets"]}');
    expect(src("pages/Plans.tsx")).not.toContain("Markets and financials");
  });
  it("no page question set, tool card or demo points at either page", () => {
    expect(PAGE_FAQS.flatMap((f) => f.routes)).not.toEqual(expect.arrayContaining(["/commodities"]));
    expect(PAGE_FAQS.flatMap((f) => f.routes)).not.toEqual(expect.arrayContaining(["/premium/fundamentals"]));
    expect(BUCKETS.flatMap((b) => b.cards).some((c) => c.link === "/premium/fundamentals" || c.id === "company-financials")).toBe(false);
    expect(src("lib/featureDemos.ts")).not.toContain("/premium/fundamentals");
    expect(src("components/dashboard/Legacy.tsx")).not.toContain('to="/commodities"');
  });
});
