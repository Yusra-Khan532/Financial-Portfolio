// Task #379 (team, 24 Nov 2026), the Mutual Fund Screener: "give this a disclamer drop down box which shall be intially closed / the red box shows how
// big the box shall be". The drop-down (task #373) now sits under both columns, the full width of the page, as the team's red box shows.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "src/pages/MfScreener.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/styles/task373.css"), "utf8");

describe("task #379: the screener's Disclaimer drop-down, closed, the full width of the page", () => {
  it("is a closed details box named Disclaimer", () => {
    const f = src.slice(src.indexOf('<footer className="mfs-fine'), src.indexOf("</footer>"));
    expect(f).toMatch(/<details className="mfs-disc">/); expect(f).not.toMatch(/<details[^>]*\bopen\b/);
    expect(f).toMatch(/className="mfs-disc-k">Disclaimer</);
  });
  it("sits after the two-column layout (filters + results), not inside the results card", () => {
    const main = src.indexOf('<section className="card mfs-main"'), mainEnd = src.indexOf("        </section>\n      </div>\n", main), foot = src.indexOf('<footer className="mfs-fine');
    expect(main).toBeGreaterThan(0); expect(mainEnd).toBeGreaterThan(main); expect(foot).toBeGreaterThan(mainEnd);
  });
  it("spans the page and keeps its own edge", () => {
    expect(css).toContain(".mfs-page > .mfs-fine { margin: 16px 0 0; padding: 0; border: 0; max-width: none; }");
  });
});
