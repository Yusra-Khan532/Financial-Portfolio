// Task #136: "ETF portfolio" sits in the workspace menu right after MF portfolio, with a NEW tag for 30 days.
import { describe, expect, it } from "vitest";
import { SECTIONS, isNew } from "./nav";

describe("the ETF portfolio in the workspace menu", () => {
  const items = SECTIONS.find((s) => s.id === "myfinlit")!.groups.flatMap((g) => g.items);
  const at = items.findIndex((i) => i.to === "/etf-portfolio");
  it("comes right after MF portfolio", () => { expect(items[at - 1].to).toBe("/mf-portfolio"); expect(items[at].label).toBe("ETF portfolio"); });
  it("is tagged new until 15 Dec 2026 (India time), then not", () => {
    expect(isNew(items[at], Date.parse("2026-11-16T10:00:00+05:30"))).toBe(true);
    expect(isNew(items[at], Date.parse("2026-12-14T23:59:00+05:30"))).toBe(true);
    expect(isNew(items[at], Date.parse("2026-12-15T00:00:00+05:30"))).toBe(false);
    expect(items.filter((i) => i.to !== "/etf-portfolio").some((i) => isNew(i))).toBe(false);
  });
});
