import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #78: the dashboard's "biggest movers" list is <ul class="dv">, and the Diversification card is <section class="dv">. A bare `.dv li` rule in account.css
// turned every list inside the card (the company chips, the sector rows) into a wide three-column grid: huge gaps, names floating. The list rules must name the element.
const css = readFileSync(join(process.cwd(), "src/styles/account.css"), "utf8");

describe("account.css and the Diversification card share the class name dv", () => {
  it("only styles .dv on the movers list (ul.dv), never on the card (section.dv) or the lists and links inside it", () => {
    const bare = css.split("\n").flatMap((l) => l.split("}")).map((r) => r.trim()).filter((r) => /(^|[\s,])\.dv(\s|\{|:|,|$)/.test(r.split("{")[0] ?? "") && !/(^|[\s,])ul\.dv/.test(r.split("{")[0] ?? ""));
    expect(bare).toEqual([]);
    expect(css).toMatch(/ul\.dv li \{/);
  });
});
