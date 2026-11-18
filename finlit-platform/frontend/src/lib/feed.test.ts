import { describe, expect, it } from "vitest";
import { docType, inResultsSeason, staleResultsNote } from "./feed";
import liveDocs from "./__fixtures__/feed_reliance_documents.json";

describe("staleResultsNote", () => {
  it("warns on a weekday in results season when the newest result is more than 2 days old", () => {
    expect(staleResultsNote({ todayIST: "2026-10-30", newestResultInDb: "2026-10-26" })).toBe("The latest results have not been refreshed since 26 Oct 2026. We are checking again every hour.");
  });
  it("stays quiet when fresh, at weekends and outside the season", () => {
    expect(staleResultsNote({ todayIST: "2026-10-30", newestResultInDb: "2026-10-28" })).toBeNull();
    expect(staleResultsNote({ todayIST: "2026-10-31", newestResultInDb: "2026-10-20" })).toBeNull();
    expect(staleResultsNote({ todayIST: "2026-09-10", newestResultInDb: "2026-08-01" })).toBeNull();
    expect(staleResultsNote(undefined)).toBeNull();
  });
  it("says so when nothing is held in season", () => {
    expect(staleResultsNote({ todayIST: "2026-10-30", newestResultInDb: null })).toBe("No results are held yet. We are checking again every hour.");
  });
  it("season windows", () => { expect(inResultsSeason("2026-10-14")).toBe(false); expect(inResultsSeason("2026-10-15")).toBe(true); expect(inResultsSeason("2026-05-31")).toBe(true); expect(inResultsSeason("2026-06-01")).toBe(false); });
});

describe("docType (task #218: what is an investor presentation)", () => {
  it("a meeting notice is not a presentation; a transcript filed under the same NSE category is a transcript", () => {
    const t = (category: string, title: string) => docType({ category, title });
    expect(t("Investor Presentation", "Reliance Industries Limited has informed the Exchange about Investor Presentation")).toBe("Investor presentation");
    expect(t("Analysts/Institutional Investor Meet/Con. Call Updates", "Analysts/Institutional Investor Meet/Con. Call Updates: Please note that the Company executives")).toBe("Other filing");
    expect(t("Analysts/Institutional Investor Meet/Con. Call Updates", "Analysts/Institutional Investor Meet/Con. Call Updates: Transcript of the earnings call")).toBe("Call transcript");
    expect(t("Annual Report", "Annual Report 2025-26")).toBe("Annual report");
    expect(t("General Updates", "Proposed Initial Public Offer of Jio Platforms Limited - filing of the DRHP")).toBe("Offer document");
    expect(t("Updates", "Shareholder meeting: the RHP-style notice wording")).toBe("Offer document");   // "rhp" as a whole word only
  });
  it("on Reliance's live documents (18 Nov 2026) one investor presentation, not nine", () => {
    const items = (liveDocs as { items: { category: string; title: string; date: string }[] }).items;
    const pres = items.filter((i) => docType(i) === "Investor presentation");
    expect(pres.map((i) => i.date)).toEqual(["2026-10-30"]);
    expect(items.filter((i) => /Investor Meet/.test(i.category)).every((i) => docType(i) === "Other filing")).toBe(true);
  });
});
