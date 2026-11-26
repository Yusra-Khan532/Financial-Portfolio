// @vitest-environment jsdom
// Task #365: the sentiment chip and its bands; section 18 matches a filing to its score by link, else by date and the feed's title.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SentimentChip } from "./SentimentChip";
import { bandOf, feedTitleOf, fmtScore, meanSentiment } from "../lib/sentiment";

afterEach(cleanup);
describe("task #365: sentiment of news and filings", () => {
  it("bands follow the plan's draft edges, as the backend", () => {
    expect([1, 0.5, 0.49, 0.1, 0.09, 0, -0.09, -0.1, -0.49, -0.5, -1].map(bandOf)).toEqual(["clearly_positive", "clearly_positive", "positive", "positive", "neutral",
      "neutral", "neutral", "negative", "negative", "clearly_negative", "clearly_negative"]);
    expect([0.62, -0.4, 0, 0.001].map(fmtScore)).toEqual(["+0.62", "−0.40", "0.00", "0.00"]);
  });
  it("the chip shows the signed score and its word, coloured by band, and says what it is", () => {
    const { container } = render(<SentimentChip s={{ score: -0.62, band: "clearly_negative" }} />);
    const c = container.querySelector(".snt")!;
    expect(c.className).toBe("snt snt-clearly_negative");
    expect(c.textContent).toBe("−0.62Clearly negative");
    expect(c.getAttribute("title")).toMatch(/not a recommendation/);
    expect(render(<SentimentChip s={null} />).container.innerHTML).toBe("");
  });
  it("a tab's average leaves out what is not scored", () => {
    // neutral (procedural) filings are left out of the average and counted in `mix`
    expect(meanSentiment([{ score: 0.6, band: "clearly_positive" }, null, { score: 0, band: "neutral" }]))
      .toEqual({ score: 0.6, band: "clearly_positive", mix: { pos: 1, neg: 0, neu: 1 } });
    expect(meanSentiment([null, undefined])).toBeNull();
  });
  it("finds a filing's feed title as the backend writes it", () => {
    expect(feedTitleOf("Order win of Rs 120 crore", "Updates")).toBe("Order win of Rs 120 crore");
    expect(feedTitleOf("x".repeat(200), "Updates")).toBe("Updates: " + "x".repeat(140));
    expect(feedTitleOf("short", null)).toBe("General: short");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import raw from "../lib/__fixtures__/events-TDPOWERSYS-19nov.json";
import type { Events } from "../lib/api";
import { NewsSection } from "../stock/NewsSection";

describe("task #365: section 18 shows each filing's score and each tab's average", () => {
  it("matches filings by link (else date and title) and averages every group tab", () => {
    const ev = raw as unknown as Events, a = ev.announcements;
    const qc = new QueryClient();
    qc.setQueryData(["feed-sentiment", "TDPOWERSYS"], { items: [
      { date: a[0].date, link: a[0].link, title: "anything", score: 0.8, band: "clearly_positive" },
      { date: a[1].date, link: null, title: feedTitleOf(a[1].description, a[1].category), score: -0.3, band: "negative" },
    ] });
    const { container } = render(<QueryClientProvider client={qc}><MemoryRouter><NewsSection e={ev} name="TD Power Systems Ltd" symbol="TDPOWERSYS" /></MemoryRouter></QueryClientProvider>);
    const rows = [...container.querySelectorAll(".nf-r .snt")].map((x) => x.className);
    expect(rows).toEqual(expect.arrayContaining(["snt snt-clearly_positive", "snt snt-negative"]));
    const all = container.querySelector(".nf-f .chip-b .snt")!;   // the "All" tab: the mean of the filings with a tone, and their counts
    expect(all.textContent).toBe("+0.251▲1▼");
  });
});

describe("26 Nov 2026: a company's average is not 0.00 because most filings are procedural", () => {
  const neu = { score: 0, band: "neutral" as const };
  it("averages only the filings with a tone and counts the rest", () => {
    const list = [...Array(33).fill(neu), { score: 0.99, band: "clearly_positive" as const }, { score: 0.41, band: "positive" as const }, { score: -0.35, band: "negative" as const }];
    expect(meanSentiment(list)).toEqual({ score: 0.35, band: "positive", mix: { pos: 2, neg: 1, neu: 33 } });
  });
  it("every filing neutral: neutral, 0, with the count; the chip says 'All neutral' instead of a bare 0.00", () => {
    const m = meanSentiment(Array(37).fill(neu));
    expect(m).toEqual({ score: 0, band: "neutral", mix: { pos: 0, neg: 0, neu: 37 } });
    const { container } = render(<SentimentChip s={m} avg word={false} />);
    expect(container.textContent).toBe("All neutral");
    expect(container.querySelector(".snt")?.getAttribute("aria-label")).toBe("Every one of the 37 scored filings reads neutral (procedural wording)");
  });
  it("an average shows its counts and says what it averages", () => {
    const { container } = render(<SentimentChip s={{ score: 0.35, band: "positive", mix: { pos: 2, neg: 1, neu: 33 } }} avg word={false} />);
    expect(container.textContent).toBe("+0.352▲1▼");
    expect(container.querySelector(".snt")?.getAttribute("aria-label"))
      .toBe("Average sentiment +0.35: Positive (the average of the 3 filings with a tone: 2 positive, 1 negative, 33 neutral)");
  });
  it("a single filing's chip is unchanged", () => {
    const { container } = render(<SentimentChip s={{ score: 0, band: "neutral" }} />);
    expect(container.textContent).toBe("0.00Neutral");
  });
});
