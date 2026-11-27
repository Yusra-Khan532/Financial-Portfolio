// @vitest-environment jsdom
// Task #411 (the team's 27 Nov list of live-site bugs, bug 2): on Sector Rotation (/sectors/rotation) the side menu marked both "Sector Pulse" and
// "Sector Rotation" as the current page (Sector Pulse's address, /sectors, is the start of Rotation's). Only the page you are on is marked now, in the
// left menu and in the header's menus; Sector Pulse's industry pages (/sectors/<industry>) stay under Sector Pulse. The same cause marked Company report on
// Stress Lab (/research/stress-lab) and Mutual funds on the fund screener (/funds/screener); both are fixed the same way.
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { MENU, isHere } from "../lib/nav";

vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { email: "a@b.c" }, isAdmin: false }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: "gold" }) }));
vi.mock("../lib/screens", () => ({ useSavedScreens: () => [] }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [] }) }));
vi.mock("../lib/portfolio", () => ({ usePortfolio: () => ({ holdings: [] }) }));
vi.mock("../lib/alerts", () => ({ useAlerts: () => ({ alerts: [] }), useNotices: () => ({ unread: 0 }) }));

afterEach(() => { cleanup(); localStorage.clear(); });
const show = (path: string) => {
  localStorage.setItem("finlit:ui:side-collapsed", JSON.stringify({ v: 1, data: false }));
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<AppShell />}><Route path="*" element={<p>page</p>} /></Route></Routes></MemoryRouter>);
};
/** The left menu's items marked as the current page. */
const current = (c: HTMLElement) => [...c.querySelectorAll(".side-gi a.side-i.on")].map((a) => a.querySelector(".side-lt")!.textContent);
const currentAria = (c: HTMLElement) => [...c.querySelectorAll('.side-gi a[aria-current="page"]')].map((a) => a.querySelector(".side-lt")!.textContent);

describe("task #411 bug 2: one current page in the menu on the sector pages", () => {
  it("Sector Rotation: only Sector Rotation is marked", () => {
    const { container } = show("/sectors/rotation");
    expect(current(container)).toEqual(["Sector Rotation"]);
    expect(currentAria(container)).toEqual(["Sector Rotation"]);
  });
  it("Sector Pulse and its industry pages: only Sector Pulse is marked", () => {
    for (const p of ["/sectors", "/sectors/finance"]) {
      const { container } = show(p);
      expect(current(container), p).toEqual(["Sector Pulse"]);
      expect(currentAria(container), p).toEqual(["Sector Pulse"]);
      cleanup();
    }
  });
  it("the same cause elsewhere: Stress Lab and the fund screener are marked alone; Company report stays marked on a company's report", () => {
    for (const [p, want] of [["/research/stress-lab", "Stress Lab"], ["/funds/screener", "Mutual fund screener"], ["/funds/120503", "Mutual funds"], ["/research", "Company report"], ["/stocks/RELIANCE", "Company report"]]) {
      const { container } = show(p);
      expect(current(container), p).toEqual([want]);
      cleanup();
    }
  });
  it("the header's menus (lib/nav isHere) agree", () => {
    const items = MENU.flatMap((g) => g.items);
    const here = (p: string) => items.filter((i) => isHere(p, i)).map((i) => i.label);
    expect(here("/sectors/rotation")).toEqual(["Sector Rotation"]);
    expect(here("/sectors")).toEqual(["Sector Pulse"]);
    expect(here("/sectors/finance")).toEqual(["Sector Pulse"]);
    expect(here("/research/stress-lab")).toEqual(["Stress Lab"]);
    expect(here("/funds/screener")).toEqual(["Mutual fund screener"]);
    // no other address is marked twice in the menu
    for (const i of items) expect(here(i.to.split("#")[0]).length, i.to).toBeLessThanOrEqual(1);
  });
});
