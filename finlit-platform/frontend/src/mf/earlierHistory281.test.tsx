// @vitest-environment jsdom
// Task #281 round 2: HSBC Small Cap Fund (151130) was L&T Emerging Businesses Fund until AMFI gave it a new code in November 2022. Its history now
// includes the earlier code's NAVs, and the fund page says so under the source line; a fund without an earlier code shows nothing extra.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HistoryInfo } from "../lib/mf";
import { Foot } from "./Bits";

const base: HistoryInfo = { source: "amfi", from: "2014-05-15", to: "2026-11-19", points: 3079, complete: true, note: null };

describe("a fund whose AMFI code changed names its earlier scheme", () => {
  it("shows the earlier scheme, its code and where those NAVs come from", () => {
    const note = "Includes the NAV history of L&T Emerging Businesses Fund - Direct Plan - Growth before 28 Nov 2022, when AMFI gave the scheme a new code.";
    render(<Foot facts={null} history={{ ...base, note, earlier: { oldCode: 129220, oldName: "L&T Emerging Businesses Fund - Direct Plan - Growth", joinedOn: "2022-11-28", note } }} />);
    const p = screen.getByText(/Includes the NAV history of L&T Emerging Businesses Fund/);
    expect(p.textContent).toContain("before 28 Nov 2022");
    expect(p.textContent).toContain("scheme code 129220");
    expect(p.textContent).toContain("api.mfapi.in");
  });
  it("shows nothing extra for a fund without an earlier code", () => {
    const { container } = render(<Foot facts={null} history={base} />);
    expect(container.querySelector(".mf-earlier")).toBeNull();
  });
});
