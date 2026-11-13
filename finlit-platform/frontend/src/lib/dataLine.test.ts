import { describe, expect, it } from "vitest";
import { dataLine } from "./proscreen";

// task #64 S-9: the header names the data it shows, in India time (UTC + 5:30)
describe("dataLine", () => {
  const now = new Date("2026-11-13T06:00:00Z");      // 13 Nov, 11:30 IST
  it("a price written after the close, and scores of the same day, read as one close", () => {
    expect(dataLine("2026-11-12T10:30:00Z", "2026-11-12T12:00:00Z", now)).toBe("Prices and scores: 12 Nov close");
  });
  it("a price of an earlier day is that day's close; scores of another day are named apart", () => {
    expect(dataLine("2026-11-12T10:05:00Z", "2026-11-12T23:00:00Z", now)).toBe("Prices: 12 Nov close · scores: 13 Nov");
  });
  it("a price written during today's session shows its time", () => {
    expect(dataLine("2026-11-13T05:45:00Z", "2026-11-12T23:00:00Z", now)).toBe("Prices: 13 Nov, 11:15 IST · scores: 13 Nov");
  });
  it("nothing known: no line (never a made-up date); one known: only that one", () => {
    expect(dataLine(null, undefined, now)).toBeNull();
    expect(dataLine("bad", null, now)).toBeNull();
    expect(dataLine(null, "2026-11-12T23:00:00Z", now)).toBe("Scores: 13 Nov");
  });
});
