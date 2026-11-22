import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MK_TABS, MOVED, ROUTINE, catLabel, dLong, dShort, hhmm, ipoCounts, iso, nice, resultCounts, split } from "./marketEvents";

// Task #322 (developer file 24, 22 Nov 2026): Market events & index.
const page = readFileSync(join(__dirname, "..", "pages", "Markets.tsx"), "utf8");

describe("formatting in one place (task #322)", () => {
  it("dates", () => {
    expect(iso("25-Nov-2026")).toBe("2026-11-25"); expect(iso("2026-11-22 00:41:03")).toBe("2026-11-22");
    expect(dShort("2026-11-22 00:41:03")).toBe("22 Nov"); expect(dLong("20-Nov-2026")).toBe("20 Nov 2026"); expect(hhmm("2026-11-22 00:41:03")).toBe("00:41");
  });
  it("index names in one style, short forms kept", () => {
    expect(nice("NIFTY MIDCAP 100")).toBe("Nifty Midcap 100"); expect(nice("INDIA VIX")).toBe("India VIX"); expect(nice("Nifty 50")).toBe("Nifty 50");
    expect(nice("NIFTY IT")).toBe("Nifty IT"); expect(nice("NIFTY FMCG")).toBe("Nifty FMCG"); expect(nice("BSE PSU")).toBe("BSE PSU");
  });
  it("the exchange boilerplate comes off; a line that only repeats the category is empty", () => {
    expect(split({ symbol: "MARUTI", category: "General Updates", description: "Maruti Suzuki India Limited has informed the Exchange about Price increase" }))
      .toEqual({ co: "Maruti Suzuki India Limited", what: "Price increase" });
    expect(split({ symbol: "FUSIONCX", category: "General Updates", description: "Fusion CX Limited has informed the Exchange about General Updates" }))
      .toEqual({ co: "Fusion CX Limited", what: "" });
    expect(split({ category: "Updates", description: "X Ltd has informed the Exchange regarding Updates: allotment of shares" }).what).toBe("Allotment of shares");
    expect(split({ symbol: "Y", description: "Board meeting on 25 Nov" })).toEqual({ co: "Y", what: "Board meeting on 25 Nov" });
  });
  it("routine notices and the short category label", () => {
    expect(ROUTINE.test("Analysts/Institutional Investor Meet/Con. Call Updates")).toBe(true); expect(ROUTINE.test("Newspaper Publication")).toBe(true);
    expect(ROUTINE.test("Outcome of Board Meeting")).toBe(false);
    expect(catLabel("Analysts/Institutional Investor Meet/Con. Call Updates")).toBe("Analyst meet or call");
  });
  it("open IPOs are counted from the dates: an issue that closed is not open, whatever its status says", () => {
    const rows = [{ ipo_status: "Live", start_date: "18-Nov-2026", end_date: "20-Nov-2026" }, { ipo_status: "Live", start_date: "21-Nov-2026", end_date: "25-Nov-2026" },
      { start_date: "20-Nov-2026", end_date: "24-Nov-2026" }, { ipo_status: "Upcoming", start_date: "26-Nov-2026", end_date: "28-Nov-2026" }];
    expect(ipoCounts(rows, "2026-11-22")).toEqual({ open: 2, soon: 1 });
  });
  it("results this week are the next seven days; past dates are not counted", () => {
    const rows = ["2026-11-16", "2026-11-22", "2026-11-24", "2026-11-28", "2026-11-29", "2026-12-02"].map((d) => ({ expected_result_date: d }));
    expect(resultCounts(rows, "2026-11-22")).toEqual({ week: 3, later: 2 });
  });
});

describe("the page (task #322)", () => {
  it("five tabs, opening on Announcements; the two calendars' old tabs lead to their pages", () => {
    expect(MK_TABS.map((t) => t.label)).toEqual(["Announcements", "Call transcripts", "Indices", "Index in detail", "Commodity indices"]);
    expect(MOVED).toEqual({ ipo: "/ipo", results: "/results" });
    expect(page).toContain('?? "announcements"');
    expect(page).toContain("if (MOVED[tab]) return <Navigate to={MOVED[tab]} replace />;");
  });
  it("no sideways slider and no IPO or results table on the page", () => {
    expect(page).not.toMatch(/HScroll|hs-bar/);
    expect(page).not.toMatch(/ipo_status: |IPO calendar" \}|Results calendar" \}/);
  });
  it("one Section dropdown on a phone, an expanded view, the new heading, and no advice words", () => {
    expect(page).toContain('<MkDd k="Section"');
    expect(page).toContain("const x = useExpand(label);");
    expect(page).toContain("What companies told the exchanges this week, and every index with its");
    expect(page.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\b(cheap|expensive|undervalued|buy)\b/i);
  });
});
