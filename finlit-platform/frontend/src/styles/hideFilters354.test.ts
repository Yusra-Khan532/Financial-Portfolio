// Task #354 (team, 23 Nov 2026): "give hide filters a bolder outline". The three Hide filters buttons (Mutual funds, the screener, ETFs) share one look:
// (more specific than the dark theme rule ":root:not([data-theme=light]) .btn:not(.primary)", which kept the old colour in dark) a 2px outline in the text colour (it was 1px in the soft border colour), semibold, full text colour on hover and focus.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, f), "utf8");
const BOLD = "border: 2px solid color-mix(in srgb, var(--text) 70%, transparent); font-weight: 600;";
describe("task #354: Hide filters has a bolder outline", () => {
  it("on the Mutual funds page", () => { expect(read("../pages/Funds.tsx")).toContain('import "../styles/task354.css";'); expect(read("task354.css")).toContain(`.mf-list .mf-side .btn.mf-hidef:not(.primary) { ${BOLD} }`); expect(read("../pages/Funds.tsx")).toContain('className="btn sm mf-hidef"'); });   // task #376: small, the same size as Reset filters beside it
  it("on the Mutual Fund Screener", () => { expect(read("task354.css")).toContain(`:root .mfs-page .btn.mfs-hidef:not(.primary) { ${BOLD} }`); expect(read("../pages/MfScreener.tsx")).toContain('className="btn sm mfs-hidef"'); });
  it("on the ETF page (the toggle while the panel is open)", () => { expect(read("task354.css")).toContain(`:root .etf-list .btn.etf-ftog.is-on:not(.primary) { ${BOLD} }`); expect(read("etf351.css")).not.toContain(".etf-ftog.is-on { border-color: var(--gold); }"); });
});
