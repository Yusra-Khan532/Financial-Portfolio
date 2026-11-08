// @vitest-environment jsdom
// "Explore the platform" on the landing page: closed to begin with, one button opens it, six tabs show their own cards, and the data matches the design pack.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ExploreTools } from "./ExploreTools";
import { BUCKETS, SHORT } from "../lib/platformTools";

afterEach(cleanup);
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
  it("starts closed, and the button opens it and closes it again", () => {
    view();
    const go = screen.getByRole("button", { name: /explore the platform/i });
    expect(go.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(go.getAttribute("aria-controls")!)?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(go);
    expect(screen.getByRole("button", { name: /hide the platform tools/i }).getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(go.getAttribute("aria-controls")!)?.hasAttribute("hidden")).toBe(false);
  });
  it("shows the Discover tools first and switches group from a tab or the arrow keys", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /explore the platform/i }));
    const tabs = screen.getAllByRole("tab"); expect(tabs).toHaveLength(6);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    const first = screen.getByRole("tabpanel"); expect(within(first).getAllByRole("heading", { level: 4 })).toHaveLength(7);
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("tabpanel")).getAllByRole("heading", { level: 4 })).toHaveLength(5);
  });
  it("the directory has one row per group naming every tool in a few words, each linking to its page", () => {
    view();
    const rows = within(screen.getByRole("list", { name: /six groups and their tools/i })).getAllByRole("listitem").filter((li) => li.classList.contains("xt-row"));
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.querySelectorAll(".xt-tool").length)).toEqual([7, 5, 4, 4, 6, 3]);
    const first = rows[0].querySelector("a.xt-tool")!;
    expect(first.getAttribute("href")).toBe("/screener"); expect(first.textContent).toMatch(/Stock Screener.*190\+ filters/);
    expect(rows[0].textContent).toMatch(/Advanced Score Screener.*Gold/);
    for (const c of BUCKETS.flatMap((b) => b.cards)) expect(SHORT[c.id], c.id).toBeTruthy();
    expect(Object.values(SHORT).every((t) => t.split(" ").length <= 4 && !/\b(buy|sell)\b/i.test(t))).toBe(true);
  });
  it("a group name opens the section on that group", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /^Learn & connect/ }));
    expect(screen.getAllByRole("tab")[5].getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("tabpanel")).getByRole("button", { name: /open finlit bot/i })).toBeTruthy();
  });
  it("cards link to their pages and show the plan badge", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: /explore the platform/i }));
    expect(screen.getByRole("link", { name: /open stock screener/i }).getAttribute("href")).toBe("/screener");
    expect(screen.getByRole("link", { name: /open advanced score screener/i }).getAttribute("href")).toBe("/advanced-score-screener");
  });
});
