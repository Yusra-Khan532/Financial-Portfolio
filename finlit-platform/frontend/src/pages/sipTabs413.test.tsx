// @vitest-environment jsdom
// Task #413: the "How it is worked out" tab (the FV formula box, its P / i / n / FV lines and the notes under them) is removed from the
// SIP calculator. The other four tabs stay, in the same order, and each still opens; the page FAQ no longer points at the removed tab.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ toast: () => undefined }) }));
import { SipCalculator } from "./SipCalculator";
import { PAGE_FAQS } from "../content/pageFaqs";

const page = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>
    <MemoryRouter initialEntries={["/sip-calculator"]}><SipCalculator /></MemoryRouter>
  </QueryClientProvider>);

afterEach(cleanup);

describe("task #413: SIP calculator without the 'How it is worked out' tab", () => {
  it("shows only the four other tabs, in their order", () => {
    page();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Year by year", "Goal planner", "Cost of waiting", "After tax"]);
    expect(screen.queryByRole("tab", { name: "How it is worked out" })).toBeNull();
  });
  it("draws no formula box, variable list or formula notes, whichever tab is open", () => {
    const { container } = page();
    for (const t of screen.getAllByRole("tab")) {
      fireEvent.click(t);
      expect(t.getAttribute("aria-selected")).toBe("true");
      expect(container.querySelector(".sip-how, .sip-formula, .sip-vars, .sip-how-l")).toBeNull();
      expect(container.textContent).not.toMatch(/number of instalments:|With no options, the month-by-month result equals the formula exactly/);
      expect(container.querySelector('[role="tabpanel"]')!.textContent!.length).toBeGreaterThan(0);
    }
  });
  it("the page FAQ (both copies) no longer sends readers to the removed tab", () => {
    const sip = PAGE_FAQS.find((p) => p.id === "sip-calculator")!;
    expect(sip.items.map((i) => i.a).join(" ")).not.toMatch(/How it is worked out/);
    const json = readFileSync(resolve(__dirname, "../../../scripts/data/page-faqs.json"), "utf8");
    expect(json).not.toMatch(/How it is worked out shows your numbers/);
    // and the page's CSS carries no rules left over for the removed panel
    expect(readFileSync(resolve(__dirname, "../styles/sip.css"), "utf8")).not.toMatch(/\.sip-(how|formula|vars)\b/);
  });
});
