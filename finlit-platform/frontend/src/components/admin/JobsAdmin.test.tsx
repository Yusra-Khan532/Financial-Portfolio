// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobsAdmin } from "./JobsAdmin";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const stat = (o: Partial<Record<string, unknown>> = {}) => ({ runs: 10, ok: 10, failed: 0, killed: 0, timeout: 0, partial: 0, skipped: 0, successPct: 100, typicalMin: 12, longestMin: 20, lastMin: 11, lastStatus: "ok", busyMin: 120, peakMb: 300, limitMin: 90, resumable: true, lastFailure: null, ...o });
const job = (name: string, o: Partial<Record<string, unknown>> = {}) => ({ name, class: "bulk", description: "", state: "idle", reason: "up to date", lastSuccessAt: "2026-11-16T02:20:00Z", ageHours: 4, slaHours: 26, late: false, overdue: false, nextDueAt: null, lastAttemptAt: null, lastStatus: "ok", consecutiveFailures: 0, retryAt: null, disabledByConfig: false, ...o });
const OVERVIEW = {
  asOf: "2026-11-16T06:30:00Z", days: 7,
  running: [{ name: "ingest", startedAt: "2026-11-16T06:00:00Z", elapsedMin: 30, limitMin: 90, limitPct: 33, progress: { done: 600, total: 2400, pct: 25 }, lastLine: "ingest-all: 600 / 2400", peakMb: 410, attempt: 1 }],
  stats: { ingest: stat({ busyMin: 630 }), prism: stat({ runs: 4, ok: 2, timeout: 2, successPct: 50, lastStatus: "timeout", lastFailure: { at: "2026-11-16T05:00:00Z", status: "timeout", reason: "ran longer than its 60-minute limit" } }), calendars: stat() },
  daily: [{ day: "2026-11-15", job: "ingest", runs: 3, bad: 0, busyMin: 620 }, { day: "2026-11-16", job: "ingest", runs: 1, bad: 0, busyMin: 79 }, { day: "2026-11-16", job: "prism", runs: 4, bad: 2, busyMin: 409 }],
  status: { jobs: [job("ingest", { state: "running" }), job("prism", { lastStatus: "timeout", consecutiveFailures: 2 }), job("calendars", { class: "light" })], overdue: [], failing: [], healthy: true,
    supervisor: { alive: true, heartbeatAgeSeconds: 3, startedAt: "2026-11-15T19:01:20Z" } },
};
const RUNS = { runs: [{ id: 2, job: "prism", startedAt: "2026-11-16T05:00:00Z", finishedAt: "2026-11-16T06:00:00Z", status: "timeout", reason: "ran longer than its 60-minute limit", attempt: 1, minutes: 60, peakMb: 500 }] };

const show = () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const body = String(url).includes("/runs") ? RUNS : OVERVIEW;
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => body, text: async () => JSON.stringify(body) } as Response;
  });
  render(<QueryClientProvider client={new QueryClient()}><JobsAdmin /></QueryClientProvider>);
};

describe("JobsAdmin", () => {
  it("shows what runs now with how far it is and how much of its time limit it used", async () => {
    show();
    const row = (await screen.findByText("ingest-all: 600 / 2400")).closest("tr")!;
    expect(row.textContent).toContain("25% · 600 of 2,400");
    expect(row.textContent).toContain("33% of 90 min");
    expect(row.textContent).toContain("410 MB");
    expect(within(row).getAllByRole("progressbar")).toHaveLength(2);
  });

  it("lists the jobs that need attention first, with their success rate and timings, and all jobs on request", async () => {
    show();
    await screen.findByTestId("jobs-admin");
    expect(screen.getByText("Every job").closest("section")!.textContent).toContain("50%");
    expect(screen.queryByText("calendars")).toBeNull();                       // healthy and not running: not in "Needs attention"
    fireEvent.click(within(screen.getByText("Every job").closest("section")!).getByRole("button", { name: "All" }));
    expect(await screen.findByText("calendars")).toBeTruthy();
  });

  it("charts job time per day with a number for each day and shows the runs with their reason", async () => {
    show();
    await screen.findByTestId("jobs-admin");
    const chart = screen.getByRole("img", { name: "Minutes of job time per day" });
    expect(chart.querySelectorAll("[title]")).toHaveLength(2);
    expect(chart.querySelector("[title]")!.getAttribute("title")).toContain("2026-11-15: 10.3 h of job time");
    expect(await screen.findByText("ran longer than its 60-minute limit")).toBeTruthy();
  });
});
