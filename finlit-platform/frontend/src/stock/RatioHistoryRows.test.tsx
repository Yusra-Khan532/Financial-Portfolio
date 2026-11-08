// @vitest-environment jsdom
// Task #37: the ratio history opens with the eight ratios people read first, and "Show all N" shows the rest.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HistoryTable } from "./Sections3";
import type { Ratios } from "../lib/api";

afterEach(cleanup);
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };   // HScroll measures its box
const r = JSON.parse(readFileSync(join(__dirname, "../../public/demo/RELIANCE/ratios.json"), "utf8")) as Ratios;
const labels = () => Array.from(document.querySelectorAll(".htab tbody td:first-child:not([colspan])")).map((e) => e.textContent);

describe("ratio history rows", () => {
  it("shows the main eight first and the rest after Show all", () => {
    render(<HistoryTable r={r} profile={{ sector: "Energy", industry: "Refineries" }} />);
    const first = labels();
    expect(first.length).toBe(8);
    for (const k of ["roe", "roce", "net_margin", "debt_to_equity", "interest_coverage", "current_ratio", "asset_turnover", "debtor_days"]) expect(first).toContain(r.glossary[k].label);
    const total = Object.keys(r.history.rows).filter((k) => r.glossary[k]?.label).length;
    fireEvent.click(screen.getByRole("button", { name: `Show all ${total}` }));
    expect(labels().length).toBe(total);
    fireEvent.click(screen.getByRole("button", { name: "Show the main eight" }));
    expect(labels().length).toBe(8);
  });
});
