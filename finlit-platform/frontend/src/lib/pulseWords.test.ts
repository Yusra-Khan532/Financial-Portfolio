// Task #258 (20 Nov handoff, SHARED §3): one set of Sector Pulse words; the old words never reach the Advanced screener or the menu line.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MORE, SECTIONS } from "./nav";
import { PULSE_SAY, PULSE_TOOLTIP, PULSE_WORDS, pulseSay, pulseWord } from "./pulseWords";

const SRC = resolve(__dirname, "..");
const OLD = /Thrust CAP|Thrust C\b|\bConfirmed\b|\bFading\b|\bWashout\b|\bNeutral\b/;

describe("Sector Pulse words", () => {
  it("map each stored state to the pack's word, the same as the server's map", () => {
    expect(PULSE_WORDS).toEqual({ thrust_cap: "Bouncing back after a crash", thrust_c: "Bouncing back", confirmed: "Rising together", fading: "Losing steam", washout: "Sold off", neutral: "No clear signal" });
    const py = readFileSync(resolve(SRC, "../../backend/finlit/presets/sectorread.py"), "utf-8");
    for (const [code, word] of Object.entries(PULSE_WORDS)) expect(py).toContain(`"${code}": "${word}"`);
  });
  it("the five tooltip lines, word for word", () => {
    expect(PULSE_SAY.map((x) => `${PULSE_WORDS[x.code]}: ${x.say}`)).toEqual([
      "Sold off: most stocks below their trend, no broad bounce yet.",
      "Bouncing back: after a sell-off, most stocks turned up together in a short space of time.",
      "Bouncing back after a crash: the same broad bounce, after a deeper fall in which almost every stock hit a new low.",
      "Rising together: most stocks trending up together.",
      "Losing steam: a bounce or rise lost support; fewer stocks are still rising.",
    ]);
    expect(PULSE_TOOLTIP).not.toMatch(OLD);
    expect(pulseWord("thrust_cap", "Thrust CAP")).toBe("Bouncing back after a crash"); expect(pulseWord("new_state", "Some word")).toBe("Some word");
    expect(pulseSay("neutral")).toBeNull();
  });
  it("Research › Sector Pulse reads the new line in the menu", () => {
    const item = JSON.stringify([SECTIONS, MORE]);
    expect(item).toContain("Which NSE industries are sold off, bouncing back or losing steam");
    expect(item).not.toContain("in a washout, a rebound or fading");
  });
  it("no old Pulse word in the Advanced screener's code a reader sees (screens, boards, tooltips, filters)", () => {
    const dir = join(SRC, "components/screener/presets");
    const files = [...readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)).map((f) => join(dir, f)),
      join(SRC, "pages/AdvancedScoreScreener.tsx"), join(SRC, "components/screener/AdvFilterBar.tsx")];
    for (const f of files) {
      const text = readFileSync(f, "utf-8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/BADGE_TONE|prism-confirmed|Trend not confirmed|trend not confirmed/.test(l)).join("\n");
      expect([f, text.match(OLD)?.[0] ?? null]).toEqual([f, null]);
    }
  });
});
