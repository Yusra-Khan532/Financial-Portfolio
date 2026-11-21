// Task #213: the option chain is off for now. No menu, sidebar, "Find a page", footer, tools directory, Plans table or Gold hub link points to it,
// the glossary does not offer it, and the old address lands on the Gold dashboards. The page, /api/options and the lot-size job stay.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MORE, SECTIONS, PRICING } from "./nav";
import { BUCKETS } from "./platformTools";
import { FEATURE_DEMO } from "./featureDemos";
import glossary from "../content/glossary.json";
import steps from "../content/featureSteps.json";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const allNav = [...[...SECTIONS, MORE].flatMap((s) => s.groups.flatMap((g) => g.items)), PRICING];

describe("task #213: option chain off", () => {
  it("is not in the menu, the sidebar or Find a page (all read lib/nav.ts)", () => {
    expect(allNav.some((i) => i.to === "/premium/options" || /option chain/i.test(i.label))).toBe(false);
    // task #282: the "Gold dashboards" heading is gone; its two pages sit in Analyse a company and Markets & economy, each with its Gold dot
    expect(allNav.filter((i) => i.to.startsWith("/premium/")).map((i) => [i.label, i.gold])).toEqual([["Company financials", true], ["Market events & index", true]]);
  });
  it("is not in the tools directory or the Plans demos", () => {
    expect(BUCKETS.flatMap((b) => b.cards).some((c) => c.id === "option-chain" || c.link.includes("/premium/options"))).toBe(false);
    expect(Object.keys(FEATURE_DEMO)).not.toContain("Option chain");
  });
  it("no page links to it, and the old address goes to the Gold dashboards", () => {
    for (const f of ["../components/Layout.tsx", "../pages/Premium.tsx", "../pages/Plans.tsx"]) expect(src(f)).not.toMatch(/premium\/options|"Option chain"/);
    expect(src("../App.tsx")).toMatch(/path="premium\/options" element={<Navigate to="\/premium" replace \/>}/);
  });
  it("the glossary does not offer FinLit's option chain, and the Gold dashboards demo names its four tools", () => {
    expect(JSON.stringify(glossary)).not.toMatch(/FinLit's option chain/);
    expect((steps as Record<string, string[]>)["gold-dash"][1]).toBe("FinLit Prism, company financials, market events and the premium report");
  });
});
