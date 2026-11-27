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

describe("Stress Lab #401: the redesigned controls", () => {
  it("1. the section bar: seven numbered buttons, no arrows, each with a 'Jump to' tip; a click marks it at once", () => {
    const { root } = draw(P("gold"));
    const btns = [...root.querySelectorAll<HTMLElement>(".sb-c")];
    expect(btns.map((b) => b.textContent)).toEqual(["1Company", "2Choose a shock", "3The result", "4Why it moves", "5Every scenario", "6History", "7Assumptions"]);
    expect(root.querySelectorAll(".sb-ar").length).toBe(0);
    expect(btns.map((b) => b.getAttribute("title"))).toEqual(["Jump to Company", "Jump to Choose a shock", "Jump to The result", "Jump to Why it moves", "Jump to Every scenario", "Jump to History", "Jump to Assumptions"]);
    expect(btns[5].getAttribute("aria-label")).toBe("6. History: jump to this section");
    btns[5].click();
    expect(root.querySelectorAll(".sb-c.on").length).toBe(1);
    expect(root.querySelector(".sb-c.on")!.textContent).toBe("6History");
    expect(root.querySelector(".sb-c.on")!.getAttribute("aria-current")).toBe("location");
  });
  it("4. choose a shock: the ready-made scenarios and your own in two labelled groups, the same eight chips", () => {
    const { root } = draw(P("gold"));
    const groups = [...root.querySelectorAll<HTMLElement>("#chips .chg")];
    expect(groups.map((g) => g.querySelector(".chgl")!.textContent)).toEqual(["Ready-made scenarios", "Your own"]);
    expect(txt(root, "#chips .chg.own .chip")).toEqual(["Custom"]);
    expect(root.querySelectorAll(".chip").length).toBe(8);
  });
  it("6. what stands out: a one-line explanation while closed, the full detail when opened", () => {
    const { root } = draw(P("gold"));
    const c = root.querySelector<HTMLElement>("#calls .call")!;
    const ln = c.querySelector<HTMLElement>(".ln")!;
    expect(ln.hidden).toBe(false);
    expect(ln.textContent!.length).toBeGreaterThan(5);
    expect(c.querySelector<HTMLElement>(".d")!.hidden).toBe(true);
    c.querySelector<HTMLElement>("[data-cx]")!.click();
    expect(ln.hidden).toBe(true);
    expect(c.querySelector<HTMLElement>(".d")!.hidden).toBe(false);
  });
  it("10. every scenario: a row opens in place to show its shocks, without switching the scenario", () => {
    const { root } = draw(P("gold"));
    const before = root.querySelector(".chip[aria-pressed=true]")!.getAttribute("data-scen");
    const x = root.querySelector<HTMLElement>('[data-xr="2020"]')!;
    expect(x.getAttribute("aria-expanded")).toBe("false");
    x.click();
    const open = root.querySelector<HTMLElement>('[data-xr="2020"]')!;
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelectorAll("#xr-2020 .shock").length).toBeGreaterThan(2);
    expect(root.querySelector(".chip[aria-pressed=true]")!.getAttribute("data-scen")).toBe(before);
    open.click();
    expect(root.getElementById("xr-2020")).toBeNull();
  });
});

describe("Stress Lab QA 27 Nov", () => {
  it("6. a click anywhere on an 'Every scenario' row picks it AND opens its shocks; a second click on the open row closes them; widths are fixed", () => {
    const { root } = draw(P("gold"));
    root.querySelector<HTMLElement>('#every tr[data-pick="2020"] td.l')!.click();
    expect(root.querySelector('[data-xr="2020"]')!.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelectorAll("#xr-2020 .shock").length).toBeGreaterThan(2);
    expect(root.querySelector('#every tr[data-pick="2020"]')!.classList.contains("on")).toBe(true);
    root.querySelector<HTMLElement>('#every tr[data-pick="2020"] td.r')!.click();
    expect(root.getElementById("xr-2020")).toBeNull();
    const t = root.querySelector("#every table")!;
    expect(t.classList.contains("evt")).toBe(true);
    expect(t.querySelectorAll("colgroup col").length).toBe(t.querySelectorAll("thead th").length);
  });
  it("6b. Enter on a focused row opens it too", () => {
    const { root } = draw(P("gold"));
    root.querySelector<HTMLElement>('#every tr[data-pick="2020"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(root.querySelector('[data-xr="2020"]')!.getAttribute("aria-expanded")).toBe("true");
  });
  it("7. the history table says the high is the share's own, and a recovery inside the episode says so", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "stressLab.js"), "utf8");
    expect(src).toContain("Each share’s own largest fall from a closing high inside the episode");
    expect(src).toMatch(/x\.back < h\.to \? '<br>within the episode'/);
  });
});
