// @vitest-environment jsdom
// Task #374 (team, 24 Nov 2026), the Mutual Funds list: (1) the Ready list caption in a straight line with Columns and the enlarge button; (2) a missing
// Mutual Fund Score shows an "i" that, on hover, focus or tap, says "Missing data from AMFI" (for an ETF, "Scoring not available"), then the reason.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isEtfCategory, missingScoreTip, ScoreCell } from "./ScoreCell";
import type { ScoreItem } from "../lib/mfScore";

afterEach(cleanup);
const none = (o: Partial<ScoreItem> = {}): ScoreItem => ({ code: 1, symbol: null, plan: "Direct", group: null, final: null, label: null, status: "NOT SCORED", reason: null, pillars: null, rank: null, rankOf: null, flags: [], confidence: null, ...o });

describe("task #374: the i on a missing score", () => {
  it("a fund with no score shows the dash and an i that names the missing AMFI data and the reason", () => {
    const { container } = render(<ScoreCell item={none({ reason: "Not scored: under a year of NAV history." })} locked={false} why="Not scored yet." />);
    const i = container.querySelector(".mf-na-i")!;
    expect(container.textContent).toContain("—");
    expect(i.getAttribute("data-tip")).toBe("Missing data from AMFI. Not scored: under a year of NAV history.");
    expect(i.tagName).toBe("BUTTON");   // task #440: a button (focusable by itself) that opens the shared popover
    expect(i.getAttribute("aria-label")).toBe("No score. Missing data from AMFI. Not scored: under a year of NAV history.");
  });
  it("with no score item at all, the page's own reason follows", () => {
    const { container } = render(<ScoreCell locked={false} why="Not scored yet." />);
    expect(container.querySelector(".mf-na-i")!.getAttribute("data-tip")).toBe("Missing data from AMFI. Not scored yet.");
  });
  it("an ETF says Scoring not available", () => {
    const { container } = render(<ScoreCell item={none()} locked={false} why="Not scored yet." etf />);
    expect(container.querySelector(".mf-na-i")!.getAttribute("data-tip")).toBe("Scoring not available. Not scored yet.");
    expect(missingScoreTip(true, "x")).toBe("Scoring not available. x");
  });
  it("ETF rows are told apart by their category", () => {
    expect(isEtfCategory("Other Scheme - Other  ETFs")).toBe(true);
    expect(isEtfCategory("Other ETFs")).toBe(true);
    expect(isEtfCategory("Gold ETF")).toBe(true);
    expect(isEtfCategory("Flexi Cap Fund")).toBe(false);
    expect(isEtfCategory("Index Funds")).toBe(false);
  });
  it("below Gold the lock stays and no i is drawn; a scored fund has no i", () => {
    expect(render(<ScoreCell item={none()} locked why="x" />).container.querySelector(".mf-na-i")).toBeNull();
    cleanup();
    expect(render(<ScoreCell item={none({ final: 71, label: "Healthy", status: "RATED" })} locked={false} why="x" />).container.querySelector(".mf-na-i")).toBeNull();
  });
  it("both tables pass the ETF flag", () => {
    for (const f of ["./FundTable.tsx", "./screen/Results.tsx"]) expect(readFileSync(join(process.cwd(), "src/mf", f), "utf8")).toMatch(/<ScoreCell [^>]*etf=\{isEtfCategory\(r\.category\)\}/);
  });
});

describe("task #374: the caption in line with the Columns and enlarge buttons", () => {
  const css = readFileSync(join(process.cwd(), "src/styles/task374.css"), "utf8");
  const page = readFileSync(join(process.cwd(), "src/pages/Funds.tsx"), "utf8");
  it("the Ready list caption uses the bar's row class, not the old loose paragraph", () => {
    expect(page).toContain('<p className="faint mf-fine mf-tbar-cap">{hot.data.basis}</p>');
    expect(page).not.toContain('mf-fine mf-pad">{hot.data.basis}');
  });
  it("the caption row is centred on the buttons' line and leaves room for them; on a phone it moves under them", () => {
    expect(css).toMatch(/\.mf-tbar-cap \{ display: flex; align-items: center; min-height: 40px;[^}]*margin: 0 0 8px; padding: 0 252px 0 10px; \}/);
    expect(css).toMatch(/@media \(max-width: 760px\) \{ \.mf-list \.mf-tablecard > \.mf-tbar-cap \{ min-height: 0; padding: 52px/);
  });
  it("the i has a 44px tap area and a focus ring (task #440: its explanation is the shared popover, see scoreI440.test.tsx)", () => {
    expect(css).toMatch(/\.mf-na-i::before \{ content: ""; position: absolute; inset: -13px; \}/);
    expect(css).toMatch(/\.mf-na-i:focus-visible \{ outline: 2px solid/);
  });
});
