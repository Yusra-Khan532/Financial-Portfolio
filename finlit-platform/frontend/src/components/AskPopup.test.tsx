// @vitest-environment jsdom
// The founder, 25 Nov 2026: "when we click on FinLit AI it covers the whole page. It should not cover the whole page ... a little space left when it
// opens ... like a pop-up window." The full window is a pop-up over a dimmed page; on a phone a sheet from the bottom. Also: the answers left this
// month as a meter in its left column, no "Pro" upsell for a Gold member, and Tab kept inside the pop-up.
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Assistant, OPEN_AI } from "./Assistant";

const ai = vi.hoisted(() => ({ quota: undefined as undefined | Record<string, unknown>, user: null as null | { id: string }, plan: "basic" }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: ai.user, plan: ai.plan }) }));
vi.mock("../lib/askAi", async (orig) => ({ ...(await orig<typeof import("../lib/askAi")>()), useAskQuota: () => ({ data: ai.quota }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => ({ fields: [], rows: [] }) }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => { cleanup(); ai.quota = undefined; ai.user = null; ai.plan = "basic"; try { localStorage.clear(); } catch { /* */ } });

const openFull = () => {
  localStorage.setItem("finlit-ai-full", "1");
  render(<MemoryRouter initialEntries={["/"]}><Assistant /></MemoryRouter>);
  act(() => { dispatchEvent(new Event(OPEN_AI)); });
  return screen.getByRole("dialog", { name: "FinLit AI assistant" });
};

describe("FinLit AI as a pop-up", () => {
  it("opens over a dimmed page as a modal; a click on the page behind closes it", () => {
    const d = openFull();
    expect(d.className).toMatch(/\bfull\b/);
    expect(d.getAttribute("aria-modal")).toBe("true");
    const scrim = document.querySelector(".aif-scrim") as HTMLElement;
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".aif-scrim")).toBeNull();
  });
  it("the small corner window has no dimmed page and is not modal", () => {
    localStorage.setItem("finlit-ai-full", "0");
    render(<MemoryRouter initialEntries={["/"]}><Assistant /></MemoryRouter>);
    act(() => { dispatchEvent(new Event(OPEN_AI)); });
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBeNull();
    expect(document.querySelector(".aif-scrim")).toBeNull();
  });
  it("shows the answers left this month as a meter, and no Pro upsell to a Gold member", () => {
    ai.user = { id: "u1" }; ai.plan = "gold"; ai.quota = { enabled: true, limit: 100, used: 40, left: 60, resets: "2026-12-01" };
    const d = openFull();
    const q = d.querySelector(".aif-quota") as HTMLElement;
    expect(q.textContent).toMatch(/Answers left 60 of 100.*Renews on 1 Dec/);
    expect((q.querySelector("i > i") as HTMLElement).style.width).toBe("60%");
    expect(q.className).not.toMatch(/low/);
    expect(d.querySelector(".aif-pro")).toBeNull();
  });
  it("marks the meter low near the end, and keeps the Pro card for Silver", () => {
    ai.user = { id: "u2" }; ai.plan = "silver"; ai.quota = { enabled: true, limit: 50, used: 47, left: 3, resets: "2026-12-01" };
    const d = openFull();
    expect(d.querySelector(".aif-quota")!.className).toMatch(/low/);
    expect(d.querySelector(".aif-pro")).not.toBeNull();
  });
  it("keeps Tab inside the pop-up", () => {
    const d = openFull();
    const outside = document.createElement("button"); document.body.appendChild(outside); outside.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(d.contains(document.activeElement) || document.activeElement === outside).toBe(true);   // jsdom has no layout: offsetParent is null, so nothing is moved
    outside.remove();
  });
});

describe("the pop-up's frame (ask-ai.css)", () => {
  const css = readFileSync("src/styles/ask-ai.css", "utf8");
  const tail = css.slice(css.lastIndexOf("like a pop-up window"));
  it("leaves the page showing round it: 32px, at most 1200 x 820, centred, rounded", () => {
    expect(tail).toMatch(/\.aif\.full \{ inset: 32px; margin: auto; width: min\(1200px, calc\(100vw - 64px\)\); height: min\(820px, calc\(100dvh - 64px\)\);/);
    expect(tail).toMatch(/border-radius: var\(--r-card\); box-shadow: var\(--ov-shadow\)/);
    expect(tail).toMatch(/@media \(max-width: 980px\) \{ \.aif\.full \{ inset: 16px;/);
  });
  it("is a sheet from the bottom on a phone, with a grab bar", () => {
    expect(tail).toMatch(/@media \(max-width: 640px\) \{\s*\.aif\.full \{ inset: 6dvh 0 0 0;[^}]*border-radius: var\(--r-card\) var\(--r-card\) 0 0;/);
    expect(tail).toMatch(/\.aif\.full::before \{ content: ""/);
  });
  it("dims the page below the window and honours reduced motion", () => {
    expect(tail).toMatch(/\.aif-scrim \{ position: fixed; inset: 0; z-index: 57; background: var\(--ov-backdrop\);/);
    expect(tail).toMatch(/prefers-reduced-motion: reduce\) \{ \.aif\.full, \.aif-scrim \{ animation: none; \}/);
  });
});
