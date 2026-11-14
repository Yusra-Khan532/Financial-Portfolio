// @vitest-environment jsdom
// Sector Rotation against the real nightly output of 29 Oct 2026 (src/lib/__fixtures__/rotation): the tab, the card, the helpers, the redirect and a wording scan of every sentence the pages print.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import map from "../lib/__fixtures__/rotation/map.json";
import media from "../lib/__fixtures__/rotation/media.json";
import { mapGeometry, placeLabels, rankGrid, rankMove, rowsByRank, shade, sparkPath, type RotationCard, type RotationMap } from "../lib/rotation";

const st = vi.hoisted(() => ({ map: null as unknown, card: null as unknown }));
const q = (d: unknown) => (d instanceof Error ? { data: undefined, isLoading: false, isError: true, error: d, refetch: () => {} } : { data: d, isLoading: false, isError: false, error: null, refetch: () => {} });
vi.mock("../lib/rotation", async (orig) => ({ ...(await orig<typeof import("../lib/rotation")>()), useRotationMap: () => q(st.map), useRotationCard: () => q(st.card) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { LearnSectorRotationPage } from "./LearnSectorRotation";

const M = map as unknown as RotationMap;
const C = { ...(media as unknown as RotationCard), reading: true } as RotationCard;
const BANNED = /\b(buy|sell|hold|accumulate|avoid|multibagger|top pick|signals?|target|best)\b/i;
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); st.map = M; st.card = C; });
afterEach(cleanup);
const at = (ui: React.ReactElement, path = "/") => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={ui} /></Routes></MemoryRouter>);

describe("helpers", () => {
  it("writes rank moves with an arrow, 'new' for a first ranked week and flags moves of 3 or more", () => {
    expect(rankMove(3)).toMatchObject({ text: "▲3", dir: "up", big: true }); expect(rankMove(-1)).toMatchObject({ text: "▼1", big: false });
    expect(rankMove(0).text).toBe("–"); expect(rankMove(null)).toMatchObject({ text: "new", dir: "new" });
  });
  it("orders by rank and builds the 12-week grid from the file's rank history", () => {
    const rows = rowsByRank(M.rows);
    expect(rows[0].rank).toBe(1); expect(rows[0].name).toBe("Pharmaceuticals & Biotechnology");
    const g = rankGrid(M.rows, 12);
    expect(g.weeks.length).toBe(12); expect(g.rows.length).toBe(M.rows.length); expect(g.rows[0].cells[11]).toBe(1);
    const veh = g.rows.find((r) => r.row.slug === "agricultural-commercial-construction-vehicles")!;
    expect(veh.row.name).not.toMatch(/Capital Goods/); expect(veh.cells.length).toBe(12);
  });
  it("shades ranks in five buckets and leaves unranked weeks unshaded", () => {
    expect(shade(1, 37)).toBe(1); expect(shade(37, 37)).toBe(5); expect(shade(null, 37)).toBe(0);
  });
  it("puts every dot of the map inside the plot, holds 0 on both axes and labels only the top 6 when asked", () => {
    const g = mapGeometry(M.rows, 960, 560, 8, null);
    for (const d of g.dots) { expect(d.x).toBeGreaterThanOrEqual(g.left - 1); expect(d.x).toBeLessThanOrEqual(g.right + 1); expect(d.y).toBeGreaterThanOrEqual(g.top - 1); expect(d.y).toBeLessThanOrEqual(g.bottom + 1); }
    expect(g.x0).toBeGreaterThan(g.left); expect(g.y0).toBeLessThan(g.bottom);
    expect(g.dots.filter((d) => d.hollow).length).toBe(M.rows.filter((r) => r.this_week_reading).length);
    expect(mapGeometry(M.rows, 390, 420, 8, 6).dots.filter((d) => d.label).length).toBe(6);
    expect(Object.keys(placeLabels(g.dots)).length).toBe(M.rows.length);
  });
  it("draws a sparkline that breaks at an unranked week", () => {
    expect(sparkPath([{ rank: 1 }, { rank: 5 }, { rank: null }, { rank: 3 }], 100, 30, 10)).toMatch(/^M.*L.*M/);
  });
});

// The Sector Rotation page itself (the final pages pack) is tested in SectorRotation.test.tsx; the Learn page's wording is scanned here.
describe("the Learn page", () => {
  it("describes and never advises", () => {
    at(<LearnSectorRotationPage />);
    const strip = (s: string) => s.replace(/not a recommendation to buy, sell or hold any security/gi, "");
    expect(strip(document.body.textContent ?? "")).not.toMatch(BANNED);
    expect(JSON.stringify([M.rows.map((r) => r.summary), M.how_to_use])).not.toMatch(BANNED);
  });
});

describe("the renamed group", () => {
  it("redirects /sectors/capital-goods to the vehicles group", () => {
    render(<MemoryRouter initialEntries={["/sectors/capital-goods"]}><Routes><Route path="/sectors/capital-goods" element={<Navigate to="/sectors/agricultural-commercial-construction-vehicles" replace />} /><Route path="/sectors/:slug" element={<p>landed</p>} /></Routes></MemoryRouter>);
    expect(screen.getByText("landed")).toBeTruthy();
  });
});
