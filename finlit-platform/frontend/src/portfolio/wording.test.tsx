// @vitest-environment jsdom
// Every word the Equity portfolio page shows about a list comes from the server's readings or from the fixed words here; this scans all of it for advice wording,
// in both amount modes, for the 12-share and the 40-share sample.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { FAQ_BANNED, PAGE_BANNED } from "./wordingRules";
import * as W from "./words";
import { MY_PORTFOLIO_FAQ } from "../content/myPortfolioFaqs";
import { InShort, StyleTiltPack } from "./pack/EquityPack";
import { BetaBuild, EachShareRisk, Fall10, RiskGlancePack, RiskShareSection, SizeBench, riskKeys, riskSplit } from "./pack/RiskPack";
import type { RiskAnswer } from "../lib/eqRisk";
import { DivSubTabs, ShareGrid, SpreadPack, WhereSitsGrid, divKeys, type DivInput } from "./pack/DivPack";
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
  const SZ = { L: "Large", M: "Mid", S: "Small" } as const;
  const d: DivInput = { page, symbols: page.order, levelOf: (x, l) => (l === "industry" ? `${meta[x]?.sector ?? "Other"} industry` : meta[x]?.sector ?? "Not classified"), sizeOf: (x) => SZ[meta[x]?.size as "L" | "M" | "S"] ?? null,
    band: () => "g", gold: true, nameOf: (x) => meta[x]?.name ?? x };
  // a risk answer for the same shares (the server's shape): sizes from the sample, betas spread across the six ranges
  const betas = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0];
  const B = (b: number | null) => (b == null ? null : b < 0.65 ? { key: "less" as const, word: "Less sensitive" } : b < 0.9 ? { key: "defensive" as const, word: "Defensive" } : b < 1.1 ? { key: "similar" as const, word: "Similar" } : b < 1.35 ? { key: "more" as const, word: "More sensitive" } : b < 1.75 ? { key: "high" as const, word: "High" } : { key: "very_high" as const, word: "Very high" });
  const RISK: RiskAnswer = { to: "2026-11-13", from: "2025-11-14", counted: page.order.length, unknown: [], missingIndex: [],
    shares: page.order.map((x, i) => ({ symbol: x, size: d.sizeOf(x), sector: meta[x]?.sector ?? null, benchmark: "Nifty 50", beta: betas[i % 6], explained: 40, band: B(betas[i % 6]), why: null, swing: 25, worstFall: -30, years: 3, oneYear: 12 })),
    sizes: (["Large", "Mid", "Small"] as const).map((k) => ({ size: k, benchmark: k === "Large" ? "Nifty 50" : k === "Mid" ? "Nifty Midcap 150" : "Nifty Smallcap 250", n: page.order.filter((x) => d.sizeOf(x) === k).length, avgBeta: 1.1, band: B(1.1), listShare: 33.3, adds: 0.37, oneYear: 10, benchOneYear: 8, downPer100: 90, upPer100: 110 })),
    betas: { weighted: 1.1, blended: 1.12, nifty: 0.95, weightedBand: B(1.1), blendedBand: B(1.12), niftyBand: B(0.95) },
    glance: { list: { swing: 22, worstFall: -28 }, nifty: { swing: 13, worstFall: -15 }, worst10: { list: -3.9, nifty: -2.7 }, weighted: 1.1 },
    ranges: [{ key: "less", word: "Less sensitive", below: 0.65 }, { key: "defensive", word: "Defensive", below: 0.9 }, { key: "similar", word: "Similar", below: 1.1 }, { key: "more", word: "More sensitive", below: 1.35 }, { key: "high", word: "High", below: 1.75 }, { key: "very_high", word: "Very high", below: null }] };
  const sp = riskSplit(page, RISK, (x) => meta[x]?.sector ?? "Other");
  it.each(["eq", "mc"] as Mode[])("holds no advice wording in mode %s", (mode) => {
    const { container } = render(<MemoryRouter><div>
      <WhereSitsGrid d={d} /><SpreadPack d={d} /><DivSubTabs d={d} /><ShareGrid d={d} /><p>{divKeys(d).map((c) => `${c.k} ${c.v} ${c.text}`).join(" ")}</p><StyleTiltPack tilt={TILT} />
      <RiskGlancePack r={RISK} split={sp} /><BetaBuild r={RISK} /><SizeBench r={RISK} /><RiskShareSection r={RISK} split={sp} /><Fall10 r={RISK} /><EachShareRisk r={RISK} split={sp} shares={[]} gold /><p>{riskKeys(RISK, sp).map((c) => `${c.k} ${c.v} ${c.text}`).join(" ")}</p><InShort items={page.summary[mode]} />
      <SharesTable qtyOf={() => null} onQty={() => {}} lines={symbols.map((x) => ({ symbol: x, name: meta[x].name }))} meta={meta} page={page} mode={mode} colors={colors} model="prism" tab="overview" period="year" limit={500} state="ready" onTab={() => {}} onPeriod={() => {}} actions={() => null} />
    </div></MemoryRouter>);
    const text = container.textContent || "";
    expect(text.length).toBeGreaterThan(500);
    expect(text).not.toContain("Export CSV");   // task #183: no download control on the portfolio pages
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
