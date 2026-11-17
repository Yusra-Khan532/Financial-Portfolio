// @vitest-environment jsdom
// Task #196 (Stress Lab pack, 15 Nov): sliders without limits, callouts with a dropdown, the guide, the 7 steps and the sections bar, words for gains and losses.
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../../public/demo/stress-page.json";
import StressEngine from "./engine";
import { draw } from "./harness";

afterEach(() => { document.body.innerHTML = ""; localStorage.clear(); });
const P = () => JSON.parse(JSON.stringify(fixture));
const typeIn = (root: ShadowRoot, k: string, v: string) => { const i = root.getElementById("n-" + k) as HTMLInputElement; i.value = v; i.dispatchEvent(new Event("change", { bubbles: true })); };

describe("sliders without limits (D1)", () => {
  it("a typed value beyond the range stretches the slider and its range line, and the model takes it", () => {
    const { root } = draw(P());
    (root.getElementById("adj") as HTMLElement).click();
    expect(root.querySelector(".slnote")?.textContent).toMatch(/^These are your own numbers, so there is no limit\./);
    expect(root.querySelectorAll("input[data-num]").length).toBe(root.querySelectorAll("input[type=range][data-k]").length);
    typeIn(root, "crude", "496");
    const r = root.getElementById("s-crude") as HTMLInputElement;
    expect([r.min, r.max, r.value]).toEqual(["-90", "496", "496"]);
    expect(root.getElementById("r-crude")?.textContent).toBe("Slider: −90.0% to +496.0%");
    expect(root.querySelector(".shocks")?.textContent).toContain("Crude oil +496.0%");
  });
  it("refuses only impossible values: crude or demand below −100%, a rupee worth nothing", () => {
    const { root } = draw(P());
    (root.getElementById("adj") as HTMLElement).click();
    typeIn(root, "demand", "-150");
    expect(root.getElementById("x-demand")?.hidden).toBe(false);
    expect(root.getElementById("x-demand")?.textContent).toMatch(/Demand cannot fall by more than 100%/);
    typeIn(root, "demand", "-100");
    expect(root.getElementById("x-demand")?.hidden).toBe(true);
    typeIn(root, "rate_bp", "5000");
    expect((root.getElementById("s-rate_bp") as HTMLInputElement).max).toBe("5000");
    expect(StressEngine.refused({ crude: -101 })).toEqual(["crude"]);
    expect(StressEngine.refused({ crude: 900, rate_bp: 5000 })).toEqual([]);
  });
});

describe("callouts with a dropdown (D4)", () => {
  it("shows the kind and headline, hides the detail behind a chevron, and Open all opens every one", () => {
    const { root } = draw(P());
    const calls = root.querySelectorAll("#calls .call");
    expect(calls.length).toBeGreaterThan(1);
    expect(root.querySelectorAll("#calls .call .d[hidden]").length).toBe(calls.length);
    (root.querySelector("[data-callall]") as HTMLElement).click();
    expect(root.querySelectorAll("#calls .call .d[hidden]").length).toBe(0);
    expect(root.querySelector("[data-callall]")?.textContent).toBe("Close all");
    (root.querySelector("[data-callall]") as HTMLElement).click();
    expect(root.querySelectorAll("#calls .call .d[hidden]").length).toBe(calls.length);
  });
});

describe("the guide, the steps and the bar (D2, D6)", () => {
  it("is closed by default, opens from its header row, remembers it, and its label table is the model's", () => {
    const { root } = draw(P());
    const h = root.querySelector(".gd-h") as HTMLElement;
    expect(h.getAttribute("aria-expanded")).toBe("false");
    h.click();
    expect(localStorage.getItem("finlit-stress-guide")).toBe("open");
    const rows = [...root.querySelectorAll(".gd-t tbody tr")].map((r) => [r.children[0].textContent, r.children[1].textContent]);
    for (const [l, when] of rows) expect(when!.startsWith(StressEngine.LABELS[l!])).toBe(true);
    expect(rows.map((r) => r[0])).toEqual(["Gains under this shock", "Holds up well", "Takes a clear hit", "Hit hard", "Debt cover at risk", "Not comparable"]);
  });
  it("numbers the 7 steps in order and lists every sub-section under All sections", () => {
    const { root } = draw(P());
    expect([...root.querySelectorAll(".sb-c")].map((c) => c.textContent)).toEqual(["1Company", "2Choose a shock", "3The result", "4Why it moves", "5Every scenario", "6History", "7Assumptions"]);
    const subs = [...root.querySelectorAll(".sb-menu .sb-sub")].map((a) => a.textContent);
    expect(subs).toEqual(expect.arrayContaining(["Score and figures", "Good sign, insight, watch out", "What the numbers say", "What drives it", "How the model did", "How the model works"]));
  });
  it("shows the same 7 steps in compare mode", async () => {
    const { peerOf } = await import("./harness");
    const { root } = draw(P(), "compare", peerOf(P()));
    expect(root.querySelectorAll(".sb-c").length).toBe(7);
  });
});

describe("words for gains and losses (bugs 1 to 3), the score scale", () => {
  it("never says 'hit lasts', shows the scale, and explains a pass-through gap", () => {
    const p = P(); p.company.exposure.export_rev = 0.5; p.company.exposure.crude_rev = 0;
    const { root } = draw(p);
    const t = root.querySelector(".sl-root")!.textContent!;
    expect(t).not.toMatch(/hit lasts/i);
    expect(root.querySelector(".rscale")?.textContent).toBe("0–100; higher holds up better");
    expect(t).toMatch(/but only on sales priced in India, 50% of revenue; export and crude-linked sales follow world prices/);
  });
});
