// @vitest-environment jsdom
// The Ready-made screens strip on Basic and Advanced. Task #243 (screeners update pack v4, 18 Nov 2026), section R, which replaces task #64's N-38 strip:
// one header row; every tab in view in two groups (FEATURED, gold and crowned; MORE); compact cards with the name and one line of figures.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../../../lib/ui", () => ({ useUI: () => ({ upgrade: vi.fn(), has: () => true, toast: vi.fn() }) }));
import { ScreensStrip, closeDay, figureText } from "./ScreensStrip";
import { usePresetRoute } from "./usePresetRoute";

const P = (id: string, name: string, group: string, o = {}) => ({ id, name, group, cardText: name + " text", count: 25, asOf: "2026-11-12", status: "live", blockedReason: null, chips: [], howItWorks: [], locked: false, figure: "FinLit IQ", ...o });
const F = (pairs: [string, number | null][]) => pairs.map(([name, value]) => ({ symbol: name.toUpperCase().replace(/\s/g, ""), name, value }));
const LIST = { asOf: "2026-11-17", tab: "basic", groups: [
  { id: "top-rated", name: "Top rated", featured: true, presets: [
    P("t-large", "Top 10 large caps", "top-rated", { top10: true, count: 131, listText: "Top 10 of 131 that pass", joined: 3, first: F([["Indrav Infotech", 90]]) }),
    P("both", "Strong on both", "top-rated", { count: 71, joined: 0 })] },
  { id: "trend", name: "Momentum", featured: true, presets: [P("up", "Momentum leaders", "trend", { count: 153, joined: 9 }), P("near", "Near 52-week high", "trend", { count: 102, joined: 4 })] },
  { id: "growth", name: "Growth", featured: true, presets: [P("gl", "Growth leaders", "growth", { count: 233 })] },
  { id: "themes", name: "Themes", featured: true, presets: [P("th", "Sector themes in play", "themes", { count: 3, listText: "3 industries · 15 companies" })] },
  { id: "setups", name: "Setups", presets: [P("nh", "Just under the 52-week high", "setups", { figure: "From 52-week high", count: 12, joined: 4 })] },
  { id: "chart-patterns", name: "Chart patterns", presets: Array.from({ length: 11 }, (_, i) => P("cp" + i, "Pattern " + i, "chart-patterns", { count: 10 + i })) },
  { id: "top-gainers", name: "Top gainers", presets: [P("g1", "Top gainers: Today", "top-gainers", { figure: "Since it joined", count: 20 })] },
  { id: "safety", name: "Safety", presets: [P("cl", "Caution list", "safety", { count: 219 })] },
] };
let body: unknown = LIST;
beforeEach(() => { body = LIST; vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as unknown as Response)); });
afterEach(cleanup);
const Where = () => { const l = useLocation(); return <output data-testid="loc">{l.search}</output>; };
const Strip = ({ past }: { past?: { day: string; count: number } }) => { const r = usePresetRoute("basic"); return <ScreensStrip route={r} past={past} />; };
const mount = (qs = "", past?: { day: string; count: number }) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/score-screener" + qs]}><Strip past={past} /><Where /></MemoryRouter></QueryClientProvider>);
const tabNames = (el: HTMLElement) => within(el).getAllByRole("tab").map((t) => t.textContent!.replace(/\d+(New)?$/, "").trim());

describe("Ready-made screens strip (task #243, pack R)", () => {
  it("R1: one header row in the pack's words, with the close it was built on; no crown block", async () => {
    mount();
    await screen.findAllByRole("tab");
    const strip = screen.getByRole("region", { name: "Ready-made screens" });
    expect(within(strip).getByRole("heading", { name: "Ready-made screens" })).toBeTruthy();
    expect(strip.querySelector(".rms-hd p")!.textContent).toBe("Lists FinLit builds after every close. Pick one to see the companies on it and who joined.");
    expect(strip.querySelector(".rms-upd")!.textContent).toBe("Updated after the 17 Nov close");
    expect(strip.querySelector(".rms-cw")).toBeNull();
  });

  it("R2: every tab in view in two groups, FEATURED (crowned, light gold) then MORE, in the pack's order; Top rated open first", async () => {
    mount();
    await screen.findAllByRole("tab");
    const [feat, more] = [...document.querySelectorAll<HTMLElement>(".rms-tgrp")];
    expect(feat.className).toContain("rms-tfeat");
    expect(feat.querySelector(".rms-tlab")!.textContent).toBe("Featured");
    expect(tabNames(feat)).toEqual(["Top rated", "Momentum", "Growth", "Themes"]);
    expect(more.querySelector(".rms-tlab")!.textContent).toBe("More");
    expect(tabNames(more)).toEqual(["Setups", "Chart patterns", "Top gainers", "Safety"]);
    for (const t of within(feat).getAllByRole("tab")) { expect(t.className).toContain("is-feat"); expect(t.querySelector(".rms-shine")).toBeTruthy(); }
    for (const t of within(more).getAllByRole("tab")) { expect(t.className).not.toContain("is-feat"); expect(t.querySelector(".rms-shine")).toBeNull(); }
    expect(screen.getByRole("tab", { name: /Top rated/ }).getAttribute("aria-selected")).toBe("true");
    expect(document.body.textContent).not.toMatch(/Trend|New highs/);
  });

  it("R3: compact cards: the name, one line of figures (listText or 'N match · +N joined') and →; Top 10 has a crown, a TOP 10 tag and a gold rule", async () => {
    mount();
    const top = (await screen.findByText("Top 10 large caps")).closest("button")!;
    expect(top.className).toContain("is-top10"); expect(top.className).toContain("is-feat");
    expect(top.querySelector(".rms-t .rms-crown")).toBeTruthy();
    expect(top.querySelector(".rms-tag")!.textContent).toBe("Top 10");
    expect(top.querySelector(".rms-m")!.textContent).toBe("Top 10 of 131 that pass");
    expect(top.querySelector(".rms-go")!.textContent).toBe("→");
    const both = screen.getByText("Strong on both").closest("button")!;
    expect(both.querySelector(".rms-m")!.textContent).toBe("71 match");
    expect(both.className).not.toContain("is-top10");
    fireEvent.click(screen.getByRole("tab", { name: /Momentum/ }));
    expect(screen.getByText("Momentum leaders").closest("button")!.querySelector(".rms-m")!.textContent).toBe("153 match · +9 joined");
    fireEvent.click(screen.getByRole("tab", { name: /Themes/ }));
    expect(screen.getByText("Sector themes in play").closest("button")!.querySelector(".rms-m")!.textContent).toBe("3 industries · 15 companies");   // L11
    fireEvent.click(screen.getByRole("tab", { name: /Safety/ }));
    expect(screen.getByText("Caution list").closest("button")!.className).not.toContain("is-feat");
    expect(document.querySelector(".rms-pv, .rms-start, .rms-star, .rms-rib, .rms-cbadge")).toBeNull();   // no First 3, Start here, star or badge block
  });

  it("R4: a tab shows every one of its cards: Chart patterns shows all 11", async () => {
    mount();
    fireEvent.click(await screen.findByRole("tab", { name: /Chart patterns/ }));
    expect(screen.getByRole("tabpanel").querySelectorAll(".rms-card")).toHaveLength(11);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("the open screen's card has a gold rule and ●; on a past date it reads 'N on {day} · past list' (L2)", async () => {
    mount();
    fireEvent.click((await screen.findByText("Top 10 large caps")).closest("button")!);
    expect(screen.getByTestId("loc").textContent).toContain("preset=t-large");
    cleanup();
    mount("?preset=up");
    let card = (await screen.findByText("Momentum leaders")).closest("button")!;
    expect(screen.getByRole("tab", { name: /Momentum/ }).getAttribute("aria-selected")).toBe("true");   // its group opens
    expect(card.className).toContain("is-on"); expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(card.querySelector(".rms-go")!.textContent).toBe("●");
    cleanup();
    mount("?preset=up", { day: "16 Nov", count: 150 });
    card = (await screen.findByText("Momentum leaders")).closest("button")!;
    expect(card.querySelector(".rms-m")!.textContent).toBe("150 on 16 Nov · past list");
  });

  it("a list not built yet, and a card below the plan, say why instead of showing numbers", async () => {
    body = { ...LIST, groups: [{ id: "top-rated", name: "Top rated", featured: true, presets: [P("t", "Top 10 large caps", "top-rated", { top10: true, count: null }), P("l", "Strong on both", "top-rated", { locked: true, count: null })] }] };
    mount();
    expect((await screen.findByText("Top 10 large caps")).closest("button")!.querySelector(".rms-m")!.textContent).toBe("Built after the close");
    expect(screen.getByText("Strong on both").closest("button")!.textContent).toContain("Part of Silver");
  });

  it("formats each figure and day as the lists show them", () => {
    expect(closeDay("2026-11-12")).toBe("12 Nov");
    expect(closeDay(null)).toBeNull();
    expect(figureText("From 52-week high", 0.02)).toEqual({ t: "at high", up: true });
    expect(figureText("From 52-week high", 2.4).t).toBe("−2.4%");
    expect(figureText("Since it joined", 4.8)).toEqual({ t: "+4.8%", up: true });
    expect(figureText("FinLit Prism", 81.6).t).toBe("82");
  });

  it("the crown glows and a light passes over it, still with reduced motion; featured tabs are light gold, never black; cards are 58 px on an auto-fill grid", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/readyScreens.css"), "utf8");
    expect(css).toMatch(/@keyframes rms-sweep/); expect(css).toMatch(/@keyframes rms-glow/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.rms-shine, \.rms-shine::after \{ animation: none; \}/);
    expect(css).toMatch(/\.rms-tab\.is-feat \{ background: linear-gradient\(180deg, #FFFBF2, #F7E9C2\); color: #3D2C06;/);
    expect(css).toMatch(/\.rms-cards \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(228px, 1fr\)\);/);
    expect(css).toMatch(/\.rms-card \{[^}]*min-height: 58px;/);
    expect(css).toMatch(/\.rms-tabs \{ display: flex; flex-wrap: wrap;/);                   // wraps: nothing scrolls sideways
    const src = readFileSync(resolve(process.cwd(), "src/components/screener/presets/ScreensStrip.tsx"), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(src).not.toMatch(/\b(best|top picks?|buy|winners?)\b/i);
  });
});
