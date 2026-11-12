// @vitest-environment jsdom
// Results calendar: the first 18 reported companies stay in view and "Show the other N companies" opens the rest in place (9 Nov 2026 pages update).
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const feed = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("../lib/feed", async (orig) => ({ ...(await orig<typeof import("../lib/feed")>()), useFeed: (_k: string, o: { before?: string }) => ({ data: o?.before ? feed.items : [], isLoading: false, isError: false }), useResultsStatus: () => ({ data: undefined }) }));
vi.mock("../lib/jobsStatus", () => ({ useJobsStatus: () => ({ data: undefined }), resultsDelayedNote: () => null }));
vi.mock("../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [] }) }));
vi.mock("../components/PageHeader", () => ({ PageHeader: () => <header /> }));
vi.mock("../components/ChartHelp", () => ({ ChartHelp: () => null }));
import { ResultsPage } from "./Results";

afterEach(cleanup);
const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, symbol: `SYM${i}`, company: `Company ${i}`, date: "2026-11-07", title: "Results", category: "Result", period: "Sep 2026" }));
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ResultsPage /></MemoryRouter></QueryClientProvider>);

describe("Recently reported", () => {
  it("shows the first 18 and puts the rest behind a closed dropdown", () => {
    feed.items = mk(49); open();
    const more = document.querySelector("details.rc-more")!;
    expect(more).toBeTruthy(); expect(more.hasAttribute("open")).toBe(false);
    expect(more.querySelector("summary")!.textContent).toBe("Show the other 31 companies");
    expect(document.querySelectorAll(".rc-side .feed-l")[1].querySelectorAll("li").length).toBeGreaterThan(0);
    expect(more.querySelectorAll("li")).toHaveLength(31);
  });
  it("has no dropdown when 18 or fewer reported", () => {
    feed.items = mk(12); open();
    expect(document.querySelector("details.rc-more")).toBeNull(); expect(screen.getAllByText(/SYM11/).length).toBeGreaterThan(0);
  });
});
