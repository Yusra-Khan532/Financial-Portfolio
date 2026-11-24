import { describe, expect, it } from "vitest";
import { recordLine, stateTone, stateWord, when } from "./monitorText";

describe("monitoring wording", () => {
  it("states and the record line never claim more than the checker returned", () => {
    expect([stateWord(true), stateWord(false), stateWord(null)]).toEqual(["Up", "Down", "Not checked yet"]);
    expect([stateTone(true), stateTone(false), stateTone(undefined)]).toEqual(["gain", "loss", "neutral"]);
    expect(recordLine(100, 48)).toBe("100% of the last 48 checks were good");
    expect(recordLine(97.9166, 48)).toBe("97.9% of the last 48 checks were good");
    expect(recordLine(100, 1)).toBe("100% of the last 1 check was good");
    expect(recordLine(null, 0)).toBe("No checks recorded yet");
    expect(when(null)).toBe("not yet");
    expect(when("2026-11-24T05:00:00Z")).toMatch(/IST$/);
  });
});
