// @vitest-environment jsdom
// Console > Visitors: FinLit's own cookie-free counter (finlit/visits.py). The numbers here are made up.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VisitorsReport } from "./VisitorsAdmin";

const asked: string[] = [];
let REPORT: VisitorsReport;
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), apiGet: async (url: string) => { asked.push(url); return REPORT; } }));
import { VisitorsAdmin } from "./VisitorsAdmin";

const base = (): VisitorsReport => ({
  from: "2026-11-21", to: "2026-11-27", days: 7, countingSince: "2026-11-27",
  totals: { views: 140, visits: 50, signups: 3 },
  daily: [{ day: "2026-11-26", views: 40, visits: 15, signups: 1 }, { day: "2026-11-27", views: 100, visits: 35, signups: 2 }],
  sources: [{ source: "google", visits: 20, views: 60 }, { source: "chatgpt", visits: 5, views: 9 }, { source: "direct", visits: 15, views: 40 }, { source: "bing", visits: 10, views: 31 }],
  pages: [{ path: "/stocks/TCS", views: 30, visits: 12 }, { path: "/", views: 25, visits: 10 }],
  devices: [{ device: "desktop", views: 98, visits: 30 }, { device: "mobile", views: 42, visits: 20 }],
  how: "Counted on FinLit's own server without cookies. Nothing identifies a person.",
});
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><VisitorsAdmin /></QueryClientProvider>);
afterEach(() => { cleanup(); asked.length = 0; });

describe("Console > Visitors", () => {
  it("shows the totals, with search engines and AI assistants counted apart", async () => {
    REPORT = base(); open();
    await screen.findByRole("heading", { name: "Visitors" });
    const t = document.body.textContent!;
    expect(t).toMatch(/50\s*visits/);
    expect(t).toMatch(/140\s*pages opened/);
    expect(t).toMatch(/30\s*visits from search engines/);     // Google 20 + Bing 10
    expect(t).toMatch(/5\s*visits from AI assistants/);       // ChatGPT
    expect(t).toMatch(/3\s*new members/);
    expect(t).toContain("Nothing identifies a person.");
    expect(t).toContain("Counting since");
  });

  it("names each source, shows its share, and lists pages, devices and days (newest first)", async () => {
    REPORT = base(); open();
    await screen.findByRole("heading", { name: "Where visits came from" });
    const rows = screen.getAllByRole("row").map((r) => r.textContent);
    expect(rows).toContain("Google2040%60");
    expect(rows).toContain("Typed in or bookmarked1530%40");
    expect(rows).toContain("/stocks/TCS3012");
    expect(document.body.textContent).toContain("Desktop: 70% of pages opened · Phone: 30% of pages opened");
    const days = rows.filter((r) => /Nov/.test(r || ""));
    expect(days[0]).toMatch(/27 Nov/);
  });

  it("asks for 30 days first and changes the period on a click", async () => {
    REPORT = base(); open();
    await screen.findByRole("heading", { name: "Visitors" });
    expect(asked[0]).toBe("/api/admin/visitors?days=30");
    expect(screen.getByRole("tab", { name: "Last 30 days" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Last 7 days" }));
    await vi.waitFor(() => expect(asked).toContain("/api/admin/visitors?days=7"));
  });

  it("says plainly when nothing has been counted yet", async () => {
    REPORT = { ...base(), countingSince: null, totals: { views: 0, visits: 0, signups: 0 }, daily: [], sources: [], pages: [], devices: [] }; open();
    await screen.findByText("No visits in this period yet.");
    expect(document.body.textContent).toContain("Nothing counted yet.");
  });
});
