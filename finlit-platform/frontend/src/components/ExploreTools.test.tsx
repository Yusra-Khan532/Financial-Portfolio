// @vitest-environment jsdom
// "Explore the platform" on the landing page: closed to begin with, one button opens it, six tabs show their own cards, and the data matches the design pack.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ExploreTools } from "./ExploreTools";
import { BUCKETS, SHORT } from "../lib/platformTools";

afterEach(() => { cleanup(); history.replaceState(null, "", "#"); document.body.style.overflow = ""; });
const view = () => render(<MemoryRouter><ExploreTools /></MemoryRouter>);

describe("platform data", () => {
  it("has the six groups with 7, 5, 4, 4, 6 and 3 cards (29 tools), each with three points and an image", () => {
    expect(BUCKETS.map((b) => b.cards.length)).toEqual([7, 5, 4, 4, 6, 3]);
    for (const c of BUCKETS.flatMap((b) => b.cards)) { expect(c.points).toHaveLength(3); expect(c.image).toMatch(/-(light|dark)$/); expect(["FREE", "SILVER", "GOLD"]).toContain(c.badge); }
  });
  it("drops the Premium Report and Connect AI cards and adds FinLit Bot", () => {
    const names = BUCKETS.flatMap((b) => b.cards.map((c) => c.title));
    expect(names).not.toContain("Premium Report"); expect(names).not.toContain("Connect AI"); expect(names).toContain("FinLit Bot"); expect(names).toContain("Company Report");
  });
  it("has no plan-quota lines and no advice words", () => {
    const text = BUCKETS.flatMap((b) => b.cards.flatMap((c) => [c.what, ...c.points])).join(" ");
    expect(text).not.toMatch(/2 free|up to 4 on Gold/i); expect(text).not.toMatch(/\b(buy|sell|hold|multibagger|top pick)\b/i);
  });
});

describe("<ExploreTools />", () => {
  it("starts with the directory shown; the button hides it and brings it back", () => {
    view();
    expect(screen.getByRole("list", { name: /six groups and their tools/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /hide the platform tools/i }));
    expect(screen.queryByRole("list", { name: /six groups and their tools/i })).toBeNull();
    const go = screen.getByRole("button", { name: /explore the platform/i }); expect(go.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(go);
    expect(screen.getByRole("list", { name: /six groups and their tools/i })).toBeTruthy();
  });
  it("a group button replaces the directory in the same place with that group's cards, a bar of six chips and a bottom bar", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /See the 7 Discover cards/ }));
    expect(screen.queryByRole("list", { name: /six groups and their tools/i })).toBeNull();
    const bar = screen.getByRole("group", { name: /tool groups/i });
    const chips = within(bar).getAllByRole("button").filter((b) => b.classList.contains("fl-gchip"));
    expect(chips).toHaveLength(6); expect(chips[0].getAttribute("aria-pressed")).toBe("true"); expect(chips[1].getAttribute("aria-pressed")).toBe("false");
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(7);
    expect(location.hash).toBe("#tools-discover");
    fireEvent.click(chips[1]);
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(5); expect(location.hash).toBe("#tools-company-360");
    const foot = screen.getByRole("navigation", { name: /between groups/i });
    expect(within(foot).getByText("Previous group").parentElement!.textContent).toMatch(/Discover/); expect(within(foot).getByText("Next group").parentElement!.textContent).toMatch(/Quant Lab/);
    fireEvent.click(within(foot).getByRole("button", { name: /All six groups/ }));
    expect(screen.getByRole("list", { name: /six groups and their tools/i })).toBeTruthy();
  });
  it("Next from Learn & connect goes to Discover and Previous from Discover goes to Learn & connect", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /See the 3 Learn & connect cards/ }));
    fireEvent.click(within(screen.getByRole("navigation", { name: /between groups/i })).getByRole("button", { name: /Next group/ }));
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(7);
    fireEvent.click(within(screen.getByRole("navigation", { name: /between groups/i })).getByRole("button", { name: /Previous group/ }));
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(3); expect(screen.getByRole("button", { name: /open finlit bot/i })).toBeTruthy();
  });
  it("the address opens the group, so a shared link or Back works", () => {
    history.replaceState(null, "", "#tools-quant-lab"); view();
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(4);
    history.replaceState(null, "", "#");
  });
  it("Expand opens a real dialog with the tool, runs through all 29 tools, locks the page scroll and closes with Esc", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /See the 7 Discover cards/ }));
    fireEvent.click(document.querySelector('[data-exp="stock-screener"]')!);
    const dlg = screen.getByRole("dialog"); expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.textContent).toMatch(/DISCOVER · 1 OF 7/); expect(within(dlg).getByRole("heading", { name: "Stock Screener" })).toBeTruthy();
    expect(dlg.querySelector("img")!.getAttribute("src")).toMatch(/landing\/expanded\/stock-screener\.webp$/);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(within(dlg).getByRole("button", { name: /Next: Basic Stock Screener/ }));
    expect(screen.getByRole("dialog").textContent).toMatch(/DISCOVER · 2 OF 7/);
    for (let i = 0; i < 6; i++) fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Next:/ }));
    expect(screen.getByRole("dialog").textContent).toMatch(/COMPANY 360 · 1 OF 5/);   // moving into another group's tool switches the group view behind it
    expect(location.hash).toBe("#tools-company-360");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.body.style.overflow).not.toBe("hidden");
  });
  it("a tool with no tall picture uses its card picture in the large view", () => {
    history.replaceState(null, "", "#tools-company-360"); view();
    fireEvent.click(document.querySelector('[data-exp="chart-builder"]')!);
    expect(screen.getByRole("dialog").querySelector("img")!.getAttribute("src")).toMatch(/landing\/tools\/chart-builder/);
    history.replaceState(null, "", "#");
  });
  it("the directory has one row per group naming every tool in a few words, each linking to its page", () => {
    view();
    const rows = within(screen.getByRole("list", { name: /six groups and their tools/i })).getAllByRole("listitem").filter((li) => li.classList.contains("xt-row"));
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.querySelectorAll(".xt-tool").length)).toEqual([7, 5, 4, 4, 6, 3]);
    const first = rows[0].querySelector("a.xt-tool")!;
    expect(first.getAttribute("href")).toBe("/screener"); expect(first.textContent).toMatch(/Stock Screener.*190\+ filters/);
    expect(rows[0].textContent).toMatch(/Advanced Stock Screener.*Gold/);
    for (const c of BUCKETS.flatMap((b) => b.cards)) expect(SHORT[c.id], c.id).toBeTruthy();
    const numbered = Object.entries(SHORT).filter(([, t]) => /\d/.test(t)).map(([id]) => id);                 // task #89: the tools that can carry a figure say it
    expect(numbered.length).toBeGreaterThanOrEqual(20);
    for (const id of ["stock-screener", "etfs", "sector-pulse", "glossary", "dcf-calculator", "alerts", "option-chain"]) expect(numbered, id).toContain(id);
    expect(Object.values(SHORT).every((t) => t.split(" ").length <= 6 && !/\b(buy|sell)\b/i.test(t))).toBe(true);
  });
  it("cards link to their pages and show the plan badge", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /See the 7 Discover cards/ }));
    expect(screen.getByRole("link", { name: /open stock screener/i }).getAttribute("href")).toBe("/screener");
    expect(screen.getByRole("link", { name: /open advanced stock screener/i }).getAttribute("href")).toBe("/advanced-score-screener");
  });
});
