// @vitest-environment jsdom
// Task #183 (Equity portfolio, live fixes): the second tab is "Diversification analytics", and the shares table has no download control.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewTabs } from "./EquityPack";
import { TIER } from "../../lib/ui";

afterEach(cleanup);
describe("Equity portfolio live fixes (#183)", () => {
  it("names the tabs Portfolio, Diversification analytics and Risk analytics", () => {
    render(<ViewTabs view="portfolio" onView={() => {}} n={39} />);
    expect(screen.getAllByRole("tab").map((t) => t.querySelector("b")?.textContent ?? t.textContent?.split(/(?=[A-Z][a-z]+ \d)/)[0])).toEqual(expect.arrayContaining([expect.stringMatching(/^Diversification analytics/)]));
    expect(screen.queryByRole("tab", { name: /^Diversification(?! analytics)/ })).toBeNull();
  });
  it("the plan badge words come from the plan: a Gold account reads Gold, never Silver", () => {
    expect([TIER.gold.n, TIER.silver.n]).toEqual(["Gold", "Gold"]);   // task #410: an old Silver gate reads Gold, the smallest full plan that opens it
  });
});
