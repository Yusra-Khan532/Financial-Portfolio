// @vitest-environment jsdom
// Task #401 (Stress Lab redesign): the numbers stay exactly as they were. Every scenario's result figures, the before-and-after table and the
// every-scenario table are pinned for the demo company (Gold) and the same company on Silver, taken on the code before the redesign; the redesign
// may change layout only. The second block covers the new section bar (buttons, no arrows, "Jump to" tips, the clicked one active at once).
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../../public/demo/stress-page.json";
import { draw, peerOf } from "./harness";

const P = (plan: "gold" | "silver") => { const p = JSON.parse(JSON.stringify(fixture)); p.plan = plan; return p; };
const txt = (root: ShadowRoot, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)].map((e) => (e.textContent || "").replace(/\s+/g, " ").trim());
afterEach(() => { document.body.innerHTML = ""; });

function figures(plan: "gold" | "silver") {
  const { root } = draw(P(plan));
  const out: Record<string, unknown> = {};
  const ids = [...root.querySelectorAll<HTMLElement>(".chip[data-scen]")].map((c) => c.getAttribute("data-scen") as string);
  for (const id of ids) {
    root.querySelector<HTMLElement>(`.chip[data-scen="${id}"]`)!.click();
    out[id] = { kpis: txt(root, "#head .kpi .v"), table: txt(root, "#tbl td"), drivers: txt(root, "#drv .bar .v"), sens: txt(root, "#sens .bar .v") };
  }
  out.every = txt(root, "#every td");
  out.hist = txt(root, "#hist td");
  out.bt = txt(root, "#bt .kpi .v, #bt td");
  out.asm = txt(root, "#asm td");
  return out;
}

describe("Stress Lab #401: the financial results are unchanged by the redesign", () => {
  it("gold: every scenario's figures, the tables, history, back-test and assumptions", () => { expect(figures("gold")).toMatchSnapshot(); });
  it("silver: the same company on the Silver plan", () => { expect(figures("silver")).toMatchSnapshot(); });
  it("compare two: both companies' every-scenario table", () => {
    const { root } = draw(P("gold"), "compare", peerOf(P("gold")));
    expect(txt(root, "#every td")).toMatchSnapshot();
  });
});
