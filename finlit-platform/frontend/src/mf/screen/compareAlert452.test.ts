// Task #452 (team, 28 Nov 2026: "after clicking on check box compare box is getting selected but after clicking in check box just give a small alert that it
// is added in compare list and correct the ui why is it coming as white in colour"). Ticking or unticking a fund on the Mutual Fund Screener says so in
// the app's short toast (a polite live region that goes by itself); the compare bar follows the theme instead of being the text colour inverted.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareToast, TRAY_MAX } from "../../lib/mf";

const src = (f: string) => readFileSync(resolve(process.cwd(), "src", f), "utf8");

describe("task #452: a small alert when a fund is added to or removed from the compare list", () => {
  it("names the fund and how many are in the list", () => {
    expect(compareToast(true, "Parag Parikh Flexi Cap Fund", 1)).toBe(`Parag Parikh Flexi Cap Fund added to the compare list (1 of ${TRAY_MAX}). Tick one more to compare.`);
    expect(compareToast(true, "HDFC Flexi Cap Fund", 2)).toBe(`HDFC Flexi Cap Fund added to the compare list (2 of ${TRAY_MAX}).`);
    expect(compareToast(false, "HDFC Flexi Cap Fund", 1)).toBe("HDFC Flexi Cap Fund removed from the compare list.");
    expect(compareToast(true, null, 3)).toBe(`The fund added to the compare list (3 of ${TRAY_MAX}).`);
  });
  it("the screener toasts on every tick, untick and × (and still says when the list is full)", () => {
    const s = src("pages/MfScreener.tsx");
    expect(s).toMatch(/toast\(compareToast\(!had,/);
    expect(s).toMatch(/You can compare up to 4 funds at a time/);
    expect(s).toMatch(/from compare`\} onClick=\{\(\) => pick\(c\)\}/);
  });
  it("the app's toast is a polite live region that hides itself", () => {
    const ui = src("lib/ui.tsx");
    expect(ui).toMatch(/className="toast" role="status"/);
    expect(ui).toMatch(/setTimeout\(\(\) => setMsg\(null\)/);
  });
  it("the compare bar follows the theme: no inverted text-colour background", () => {
    const css = src("styles/mfscreen.css");
    const bar = /\.mfs-tray \{[^}]*\}/.exec(css)![0];
    expect(bar).not.toMatch(/background: var\(--text\)/);
    expect(bar).toMatch(/background: var\(--gold-soft\)/);
    expect(bar).toMatch(/color: var\(--text\)/);
    expect(css).not.toMatch(/\.mfs-tray \.btn:not\(\.primary\) \{[^}]*var\(--bg\) 40%/);
  });
});
