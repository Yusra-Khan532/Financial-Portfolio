// @vitest-environment jsdom
// Every word the Equity portfolio page shows about a list comes from the server's readings or from the fixed words here; this scans all of it for advice wording,
// in both amount modes, for the 12-share and the 40-share sample.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
import { FAQ_BANNED, PAGE_BANNED } from "./wordingRules";
import * as W from "./words";
import { MY_PORTFOLIO_FAQ } from "../content/myPortfolioFaqs";
import { InShort, MarketFall, MoneyRisk, MovesGrid, Packs, SpreadSection, StyleTiltPack, WhereSits } from "./pack/EquityPack";
import { SharesTable } from "./SharesTable";
import { sectorColors, sectorOrder } from "./derive";
import s12 from "./__fixtures__/sample_12.json";
import s40 from "./__fixtures__/sample_40.json";
import type { Meta, Mode, PageObject } from "./types";

const TILT = { universe: 650, notRated: [], sentence: "This list leans towards faster-growing and lower-risk companies.", parts: [{ part: "Valuation", listAverage: 60, universeMedian: 50, avgPercentile: 62, lean: "typical" as const, wording: null, stocks: 12 }, { part: "Risk", listAverage: 80, universeMedian: 50, avgPercentile: 86, lean: "high" as const, wording: "lower-risk companies", stocks: 12 }] };

function scan(text: string, where: string) {
  const m = text.match(PAGE_BANNED);
  expect(m, `${where}: "${m?.[0]}" in ${text.slice(0, 120)}`).toBeNull();
  expect(/\b(?:\d*[02-9])?[123]th\b/.test(text), `${where}: wrong ordinal`).toBe(false);
}

const cases: [string, typeof s12][] = [["12 shares", s12], ["40 shares", s40 as unknown as typeof s12]];

describe.each(cases)("the page text, %s", (_n, s) => {
  const page = s.page as unknown as PageObject;
  const meta = Object.fromEntries(Object.entries(s.inputs.meta).map(([k, v]) => [k, { name: v.name, sector: v.sector, size: v.size, mcap_cr: v.mcap_cr }])) as Record<string, Meta>;
  const symbols = Object.keys(meta), colors = sectorColors(sectorOrder(page, "eq"));
  const counts: Record<string, string[]> = {}; symbols.forEach((x) => (counts[meta[x].sector ?? "Other"] ??= []).push(x));
  const packs = page.groups.map((g) => ({ members: g.members, avg: g.avg_corr, name: meta[g.members[0]]?.sector ?? "Mixed" }));
  it.each(["eq", "mc"] as Mode[])("holds no advice wording in mode %s", (mode) => {
    const { container } = render(<MemoryRouter><div>
      <SpreadSection page={page} weights={page.sector_weight.eq} counts={counts} sizeCount={{ Large: 6, Mid: 4, Small: 2 }} packs={packs} />
      <WhereSits weights={page.sector_weight.eq} sizes={[{ k: "Large", pct: 50, who: symbols.slice(0, 6) }]} /><Packs packs={packs} weights={page.sector_weight.eq} n={symbols.length} />
      <MovesGrid page={page} packs={packs} /><StyleTiltPack tilt={TILT} />
      <MoneyRisk sw={page.sector_weight.eq} sr={page.sector_risk.eq} counts={counts} /><MarketFall beta={page.market.eq.beta} /><InShort items={page.summary[mode]} />
      <SharesTable qtyOf={() => null} onQty={() => {}} lines={symbols.map((x) => ({ symbol: x, name: meta[x].name }))} meta={meta} page={page} mode={mode} colors={colors} model="prism" tab="overview" period="year" limit={500} state="ready" onTab={() => {}} onPeriod={() => {}} onExport={() => {}} actions={() => null} />
    </div></MemoryRouter>);
    const text = container.textContent || "";
    expect(text.length).toBeGreaterThan(500);
    scan(text, mode);
    expect(text).toContain("Information only, not investment advice");
  });
  it("every server reading passes the same check", () => { page.readings.forEach((x) => scan(x.text, x.rule)); });
});

describe("the fixed words", () => {
  it("hold no advice wording", () => {
    const strings = Object.values(W).flatMap((v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flat(2).filter((x): x is string => typeof x === "string") : typeof v === "object" ? Object.values(v as object).flatMap((o) => (typeof o === "string" ? [o] : typeof o === "object" ? Object.values(o as object).filter((x): x is string => typeof x === "string") : [])) : []));
    expect(strings.length).toBeGreaterThan(20);
    strings.forEach((t) => scan(t, "words"));
  });
  it("keeps the disclaimer", () => { expect(W.DISCLAIMER).toBe("Information only, not investment advice."); expect(W.TABLE_FOOT).toContain(W.DISCLAIMER); });
  it("the FAQ holds none either, and asks the design's six questions", () => {
    expect(MY_PORTFOLIO_FAQ.items).toHaveLength(6);
    MY_PORTFOLIO_FAQ.items.forEach((i) => { scan(i.q, "faq q"); scan(i.a, "faq a"); expect(FAQ_BANNED.test(i.a)).toBe(false); });
  });
});
