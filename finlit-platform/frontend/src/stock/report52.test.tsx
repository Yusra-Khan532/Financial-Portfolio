// Developer file 52, the founder's points of 27 Nov 2026 (5:22 pm): In numbers that reads plainly (stock/report51*.test.tsx), 14 in four tabs with a top box
// that opens them (pages/Sectors.test.tsx), 13 in two tabs.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(resolve(__dirname, ".."), p), "utf8");

describe("13 Comparison with peers: two tabs", () => {
  it("its closest peers (the map and the list), and the price against them (the ranking and the group leader what-if); no ranking, no tabs", () => {
    const s = read("stock/Sections3.tsx");
    expect(s).toContain('<TabGroup label="Comparison with peers" hint="Its closest peers shown here" views={[');
    expect(s).toContain('{ key: "peers", label: "Its closest peers", content: closest },');
    expect(s).toMatch(/\{ key: "price", label: "Price against peers", content: <><PeerRanking lead=\{lead\}/);
    expect(s).toContain("if (!lead?.available) return closest;");
  });
});

describe("14 Industry analysis: four tabs and a top box that opens them", () => {
  const w = read("stock/pack/WhereStands.tsx");
  it("the four tabs hold what was one long column", () => {
    expect(w).toContain('return <TabGroup label="Industry analysis" hint="Industry now shown here" views={[');
    for (const [k, l] of [["now", "Industry now"], ["rot", "Against other industries"], ["in", "Inside its industry"], ["num", "In numbers"]]) expect(w).toContain(`{ key: "${k}", label: "${l}", content:`);
  });
  it("the top box: four readings in one row (two by two on a narrow screen), the company's own chart one line under them, 3 things to know beside the lead", () => {
    const css = read("stock/pack/stands.css");
    expect(css).toContain(".ws-glance { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }");
    expect(css).toContain("@media (max-width: 900px) { .ws-glance { grid-template-columns: repeat(2, minmax(0, 1fr)); } }");
    expect(w).toContain('{align && <p className="ws-ownline">Its own chart: <b className="ws-own">{align}</b>');
    expect(w).toMatch(/<div className="ws-headtop">\{h && <p className="ws-lead">[^\n]*<Know scope="ws-industry"/);
  });
  it("a reading opens its tab and scrolls to the tab bar, without changing the page's address", () => {
    expect(w).toContain('const toTab = (id: string) => (e: React.MouseEvent) => { e.preventDefault();');
  });
});
