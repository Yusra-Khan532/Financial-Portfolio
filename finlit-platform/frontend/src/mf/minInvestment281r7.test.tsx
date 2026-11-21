// @vitest-environment jsdom
// Task #281 round 7 (the owner, 21 Nov 2026: "if there is data, even old or out of date, show it"): the minimum investment AMFI lists is shown in Fund facts
// with its source, its date and the note that AMFI's figure is out of date for some schemes; it is no longer in the "Not in our data yet" box.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FundFacts } from "../lib/mf";
import { FactsCard } from "./Facts";

afterEach(cleanup);
const NOTE = "As AMFI lists it; for some schemes AMFI's figure is out of date. The scheme's own documents on the fund house's site give the current minimum.";
const FACTS: FundFacts = { code: 151130, order: ["aum", "exitLoad", "minInvestment"], facts: {
  aum: { value: "₹18,453 crore", asOf: "2026-09-30", source: "AMFI" },
  exitLoad: { unavailable: "Exit load comes from AMFI's scheme details, which has not been read for this scheme yet." },
  minInvestment: { value: "Rs. 5,000 and in multiples of Re.1 thereafter", asOf: "2026-11-21", source: "AMFI scheme details (amfiindia.com/otherdata/scheme-details)", note: NOTE } } };

describe("minimum investment, shown with its source and date", () => {
  it("shows AMFI's figure in Fund facts with the day it was read and the note", () => {
    render(<FactsCard facts={FACTS} loading={false} failed={false} />);
    const row = screen.getByText("Minimum investment").closest("div")!;
    expect(within(row).getByText("Rs. 5,000 and in multiples of Re.1 thereafter")).toBeTruthy();
    expect(row.textContent).toContain("As of 21 Nov 2026");
    expect(row.textContent).toContain("AMFI scheme details");
    expect(row.textContent).toContain("out of date");
    const box = screen.getByRole("note", { name: "Facts not in our data yet" });
    expect(box.textContent).not.toMatch(/minimum/i);                                  // only what is really missing stays in the box
    expect(box.textContent).toMatch(/Exit load/);
  });
  it("the scheme master's minimum (no date) still shows, with its source and the note", () => {
    const f: FundFacts = { ...FACTS, facts: { ...FACTS.facts, minInvestment: { value: "₹500", source: "AMFI scheme master", note: NOTE } } };
    render(<FactsCard facts={f} loading={false} failed={false} />);
    const row = screen.getByText("Minimum investment").closest("div")!;
    expect(row.textContent).toContain("₹500");
    expect(row.textContent).toContain("AMFI scheme master");
  });
});
