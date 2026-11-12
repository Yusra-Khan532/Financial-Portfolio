// @vitest-environment jsdom
// Stress Lab page: the plan gate, the messages for a company outside the coverage, and the model drawn into the page for a covered one.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../public/demo/stress-page.json";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const st = vi.hoisted(() => ({ gold: true, silver: true, status: 200, body: null as unknown }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: (t: string) => (t === "gold" ? st.gold : st.silver), upgrade: vi.fn(), toast: vi.fn() }), TIER: { gold: { n: "Gold" }, silver: { n: "Silver" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</>, TierChip: () => null }));
vi.mock("../components/OutlookPicker", () => ({ OutlookPicker: () => <section aria-label="picker" /> }));
vi.mock("../components/PageHeader", () => ({ PageHeader: () => <header /> }));
vi.mock("../components/SearchFilters", () => ({ useIndexFilter: () => ({ search: () => [] }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(async (path: string) => {
  const { ApiError } = await orig<typeof import("../lib/api")>();
  if (st.status !== 200) throw new ApiError(st.status, { detail: st.body } as never);
  if (path.endsWith("/peer")) return { peer: null, peers: [] };
  return fixture;
}) }));
import { StressLabPage } from "./StressLab";

afterEach(cleanup);
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/research/stress-lab/ASIANPAINT"]}><Routes><Route path="/research/stress-lab/:symbol" element={<StressLabPage />} /></Routes></MemoryRouter></QueryClientProvider>);

describe("Stress Lab page", () => {
  it("draws the model into a shadow root: Today's result and eight scenario chips, from the engine", async () => {
    st.status = 200; open();
    await waitFor(() => expect(document.querySelector(".sl-host")?.shadowRoot?.getElementById("head")?.textContent).toMatch(/Asian Paints’ earnings per share fall 10\.5%, from ₹52\.77 to ₹47\.25/));
    const root = document.querySelector(".sl-host")!.shadowRoot!;
    expect(root.querySelectorAll(".chip").length).toBe(8);
    expect(root.textContent).toMatch(/illustrative stress test/i);
    expect(root.textContent).not.toMatch(/\b(buy|sell)\b/i);
  });
  it("says why a company is not covered, in the server's own words", async () => {
    st.status = 404; st.body = "Stress Lab does not cover financial companies yet."; open();
    expect(await screen.findByText("Stress Lab does not cover financial companies yet.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /does not cover this company/ })).toBeTruthy();
  });
  it("tells the member when the data is still being prepared", async () => {
    st.status = 503; st.body = "Macro data has not been loaded yet."; open();
    expect(await screen.findByRole("heading", { name: /getting ready/ })).toBeTruthy();
  });
  it("shows the latest-quarter check and the inventory days, and the size once (task 79)", async () => {
    st.status = 200; open();
    await waitFor(() => expect(document.querySelector(".sl-host")?.shadowRoot?.getElementById("head")?.textContent).toMatch(/earnings per share/));
    const root = document.querySelector(".sl-host")!.shadowRoot!;
    expect(root.textContent).toMatch(/In the latest quarter the model put the margin at 13\.9% and Asian Paints reported 15\.6% \(from 17\.6%\)/);
    expect(root.textContent).toMatch(/about 120 days of inventory/);
    expect(root.querySelector(".costrip small")?.textContent).toBe("ASIANPAINT · Paints · Large cap");
    expect(root.querySelector(".costrip .logo")?.textContent).toBe("A");   // no logo on file: the initial shows
  });
});
