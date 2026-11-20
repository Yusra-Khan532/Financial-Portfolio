import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { CompanyFacts, NameDots, ScoreBadge } from "./HeaderScore";
import { badgeView } from "../lib/scoreBands";
import type { Profile } from "../lib/api";
const profile = { symbol: "RELIANCE", industry: "Petroleum Products", subIndustry: "Refineries & Marketing", sector: "Energy", marketCapCr: 1602252.58 } as Profile;

describe("header", () => {
  it("names each NSE level under its own label, and market cap (task #192)", () => {
    const cls = { symbol: "RELIANCE", isin: "INE002A01018", macro_sector: "Energy", sector: "Oil, Gas & Consumable Fuels", industry: "Petroleum Products",
      basic_industry: "Refineries & Marketing", source: "basic_industry", note: null };
    const h = renderToStaticMarkup(<CompanyFacts p={profile} cls={cls} />);
    for (const [label, value] of [["Macro sector", "Energy"], ["Sector", "Oil, Gas &amp; Consumable Fuels"], ["Industry", "Petroleum Products"], ["Basic industry", "Refineries &amp; Marketing"]])
      expect(h).toContain(`<span class="hs-l">${label}</span><div class="hs-c"><span class="hs-t">${value}</span>`);
    expect(h).not.toContain("Petroleum Products · Refineries");   // before: two levels joined under one "Industry" label
    expect(h).toContain("Market cap"); expect(h).toContain("₹16,02,253 Cr · Large cap");
  });
  it("a blank level says why, once; a company NSE's lists do not place says Not classified with the reason", () => {
    const happy = { symbol: "HAPPY", isin: null, macro_sector: "Industrials", sector: "Capital Goods", industry: "Industrial Manufacturing", basic_industry: null,
      source: "industry", note: 'Basic industry not shown: "Forgings & Machined Components" is not one of NSE\'s 197 basic industries.' };
    const h = renderToStaticMarkup(<CompanyFacts p={profile} cls={happy} />);
    expect(h).toContain('<span class="hs-l">Basic industry</span><div class="hs-c"><span class="hs-t hs-na">Not shown</span><span class="hs-why">Basic industry not shown');
    const none = { ...happy, macro_sector: null, sector: null, industry: null, source: null, note: "Not classified: its classification (\"DVR\") is not one of NSE's names." };
    const n = renderToStaticMarkup(<CompanyFacts p={profile} cls={none} />);
    expect(n).toContain("Not classified"); expect(n).toContain("its classification (&quot;DVR&quot;) is not one of NSE"); expect(n).not.toContain("Macro sector");
  });
  it("before the classification arrives, only the industry, under Industry", () => {
    const h = renderToStaticMarkup(<CompanyFacts p={profile} />);
    expect(h).toContain('<span class="hs-l">Industry</span><div class="hs-c"><span class="hs-t">Petroleum Products</span>');
    expect(h).not.toContain("Refineries");
  });
  it("task #283: the company header shows FinLit Prism, or a locked Prism chip on a plan without it; never another score", () => {
    const wrap = (v: ReturnType<typeof badgeView>) => renderToStaticMarkup(<MemoryRouter><ScoreBadge view={v} symbol="RELIANCE" /></MemoryRouter>);
    for (const plan of ["basic", "silver"] as const) {
      const s = wrap(badgeView(plan, false, { kind: "report", final: 74.2, word: "Healthy", status: "RATED" }));
      expect(s).toContain("FinLit Prism · see plans"); expect(s).toContain('href="/plans"'); expect(s).not.toContain("74.2"); expect(s).not.toMatch(/\bIQ\b/);
    }
    const g = wrap(badgeView("gold", false, { kind: "report", final: 74.2, word: "Healthy", status: "RATED" }));
    expect(g).toContain("FinLit Prism"); expect(g).toContain("74.2"); expect(g).toContain("band-hi"); expect(g).not.toMatch(/\bIQ\b/);
    const n = wrap(badgeView("gold", false, { kind: "none" }));
    expect(n).toContain("Prism: not rated yet"); expect(n).toContain('href="/prism/RELIANCE"');
  });
  const rep = { kind: "report", final: 61, word: "Average", status: "RATED", parts: { fundamental: 68.8, valuation: 42.4, quality: 73.2, risk: 80 }, short: { score: 1, rating: "Hold" }, long: { score: -60, rating: "Sell" } } as const;
  it("Gold shows the six Prism dots, never the pillar dots; the legend lists them", () => {
    const h = renderToStaticMarkup(<NameDots plan="gold" admin={false} prism={rep} />);
    expect(h).toContain('title="Valuation 42: red, weak"'); expect(h).toContain('aria-label="Short-term technical +1: orange, sideways"');
    expect(h).toContain("Long-term technical −60: red, strong downtrend");
    expect(h).toContain("hs-gap"); expect(h.match(/class="hs-dot /g)).toHaveLength(6 + 6);   // six real dots + six in the legend
    expect(h).not.toMatch(/Growth(?! &amp; Profitability)/); expect(h).not.toMatch(/(?<!Growth &amp; )Profitability/);
    expect(h).toContain("a high Risk score means lower risk"); expect(h).toContain("What do the dots mean?");
  });
  it("Gold with no rating: six grey dots; while loading nothing; a plan without Prism has no dots (task #283); admin gets Prism", () => {
    const none = renderToStaticMarkup(<NameDots plan="gold" admin={false} prism={{ kind: "none" }} />);
    expect(none).toContain("Quality: grey, not rated yet"); expect(none).not.toContain("hs-dot band-hi");
    expect(renderToStaticMarkup(<NameDots plan="gold" admin={false} prism={{ kind: "loading" }} />)).toBe("");
    expect(renderToStaticMarkup(<NameDots plan="silver" admin={false} prism={rep} />)).toBe("");
    expect(renderToStaticMarkup(<NameDots plan="basic" admin={false} prism={rep} />)).toBe("");
    expect(renderToStaticMarkup(<NameDots plan="basic" admin={true} prism={rep} />)).toContain("Valuation 42");
  });
});

describe("the Growth & Profitability dot is marked G&P", () => {
  it("shows G&P (not F) in the header dots, the legend and the tooltip, as a pill; the other five stay single letters", async () => {
    const { PrismDots } = await import("./HeaderScore");
    const prism = { kind: "report", final: 60, word: "Healthy", status: "RATED", parts: { fundamental: 70, valuation: 50, quality: 80, risk: 60 }, short: { score: 31, rating: "Buy" }, long: { score: -12, rating: "Hold" } } as never;
    const h = renderToStaticMarkup(<PrismDots prism={prism} />);
    const marks = [...h.matchAll(/<span class="hs-dot[^"]*"[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]);
    const six = ["G&amp;P", "V", "Q", "R", "S", "L"];
    expect(marks).toEqual([...six, ...six]);                              // the six dots, then the same six marks in the legend
    expect(h.match(/data-wide/g)?.length).toBe(2);                       // only the G&P dot is a pill, in the header and in the legend
    expect(h).toContain("Growth &amp; Profitability 70");                // the tooltip names it in full
    expect(h).not.toMatch(/>F</);
  });
});
