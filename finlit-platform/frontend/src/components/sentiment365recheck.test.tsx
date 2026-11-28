// @vitest-environment jsdom
// Task #365 re-check (28 Nov 2026): every filing read "0.00 Neutral". A routine filing now shows a plain "Routine filing" label with no number, an
// average covers only the items whose wording was read and says how many, nothing is shown when none was read, and no score ever reads "−0.00".
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { SentimentChip } from "./SentimentChip";
import { feedTitleOf, fmtScore, meanSentiment, type Sentiment } from "../lib/sentiment";
import raw from "../lib/__fixtures__/events-TDPOWERSYS-19nov.json";
import type { Events } from "../lib/api";
import { NewsSection } from "../stock/NewsSection";

afterEach(cleanup);
const ROUTINE: Sentiment = { score: null, band: "routine" };

describe("task #365 re-check: no reading is shown honestly", () => {
  it("never shows −0.00: a score that rounds to zero is 0.00", () => {
    expect([-0.004, -0.0049, -0, 0.004, -0.006, 0.005, -0.01].map(fmtScore)).toEqual(["0.00", "0.00", "0.00", "0.00", "−0.01", "+0.01", "−0.01"]);
    const { container } = render(<SentimentChip s={{ score: -0.003, band: "neutral" }} />);
    expect(container.textContent).toBe("0.00Neutral");
    expect(container.textContent).not.toContain("−");
    expect(meanSentiment([{ score: -0.001, band: "neutral" }, { score: 0.0, band: "neutral" }])!.score).toBe(0);
    expect(fmtScore(meanSentiment([{ score: -0.004, band: "neutral" }])!.score)).toBe("0.00");
  });
  it("a routine filing shows a plain grey Routine filing label, no number", () => {
    const { container } = render(<SentimentChip s={ROUTINE} />);
    const c = container.querySelector(".snt")!;
    expect(c.className).toBe("snt snt-routine");
    expect(c.textContent).toBe("Routine filing");
    expect(c.textContent).not.toMatch(/\d/);
    expect(c.getAttribute("aria-label")).toBe("Routine filing");
    expect(c.getAttribute("title")).toMatch(/left out of the averages/);
    expect(render(<SentimentChip s={ROUTINE} avg />).container.querySelector(".snt")).toBeNull();
  });
  it("an average covers only the items read and says how many; none read, nothing shown", () => {
    const m = meanSentiment([{ score: 0.5, band: "clearly_positive" }, ROUTINE, null, { score: 0.14, band: "positive" }, undefined, ROUTINE]);
    expect(m).toEqual({ score: 0.32, band: "positive", n: 2 });
    const { container } = render(<SentimentChip s={m} word={false} avg />);
    const c = container.querySelector(".snt")!;
    expect(c.textContent).toBe("+0.32· 2 read");
    expect(c.getAttribute("aria-label")).toMatch(/^Average sentiment \+0\.32 · 2 read: Positive/);
    expect(c.getAttribute("title")).toMatch(/routine filings are left out/);
    expect(meanSentiment([ROUTINE, null, ROUTINE])).toBeNull();
    expect(render(<SentimentChip s={meanSentiment([ROUTINE])} avg />).container.innerHTML).toBe("");
  });
  it("the wording describes the words, never the share", () => {
    const { container } = render(<><SentimentChip s={ROUTINE} /><SentimentChip s={{ score: 0.3, band: "positive", n: 4 }} avg /></>);
    const text = [...container.querySelectorAll(".snt")].map((x) => `${x.textContent} ${x.getAttribute("title")}`).join(" ");
    expect(text).not.toMatch(/\b(buy|sell|hold|target|best)\b/i);
  });
  it("section 18: a routine filing reads Routine filing, and the tab average leaves it out and counts what was read", () => {
    const ev = raw as unknown as Events, a = ev.announcements;
    const qc = new QueryClient();
    qc.setQueryData(["feed-sentiment", "TDPOWERSYS"], { items: [
      { date: a[0].date, link: a[0].link, title: "anything", score: 0.4, band: "positive", state: "read" },
      { date: a[1].date, link: null, title: feedTitleOf(a[1].description, a[1].category), score: null, band: "routine", state: "routine" },
    ] });
    const { container } = render(<QueryClientProvider client={qc}><MemoryRouter><NewsSection e={ev} name="TD Power Systems Ltd" symbol="TDPOWERSYS" /></MemoryRouter></QueryClientProvider>);
    const rows = [...container.querySelectorAll(".nf-r .snt")].map((x) => x.textContent);
    expect(rows).toEqual(expect.arrayContaining(["+0.40Positive", "Routine filing"]));
    const all = container.querySelector(".nf-f .chip-b .snt")!;
    expect(all.textContent).toBe("+0.40· 1 read");
    expect(container.textContent).not.toContain("−0.00");
  });
});
