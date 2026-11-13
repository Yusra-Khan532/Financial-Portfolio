// @vitest-environment jsdom
// Task #108: Stress Lab drew nothing ("being prepared") for every company while the EIA oil outlook had not been stored: the page read the missing outlook and stopped.
// A page without the outlook (no "Crude eases" scenario, no price history) must draw in full, for Silver and Gold, alone and next to a second company.
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../public/demo/stress-page.json";
import StressEngine from "./engine";
import { mountStressLab } from "./stressLab";
import { skeleton } from "./skeleton";
import css from "./stresslab.css?inline";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(() => { document.body.innerHTML = ""; });

/** The page the server sends on a day with no EIA outlook: no outlook, no "Crude eases" scenario, and (as on a fresh server) no price history. */
const withoutOutlook = (plan: "gold" | "silver", history = true) => {
  const d = JSON.parse(JSON.stringify(fixture));
  d.eia_outlook = null; d.scenarios = d.scenarios.filter((s: { id: string }) => s.id !== "today_eia");
  if (!history) d.history = [];
  d.plan = plan;
  if (plan === "silver") { const keep = ["today", "2022", "2020"]; d.locked_scenarios = d.scenarios.filter((s: { id: string }) => !keep.includes(s.id)).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })); d.scenarios = d.scenarios.filter((s: { id: string }) => keep.includes(s.id)); }
  return d;
};
const draw = (d: any, view: "single" | "compare" = "single", peer: any = null) => {
  const el = document.createElement("div"); document.body.append(el);
  const root = el.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${css}</style>` + skeleton(d.plan, d.disclaimer, d.model, d.as_of);
  const h = mountStressLab(root, StressEngine, d, { view, peer, logoUrl: () => "", search: () => [], onCompany() {}, onPeer() {}, requestPeer() {} } as never);
  return { root, h };
};

describe("Stress Lab without the EIA outlook", () => {
  for (const plan of ["gold", "silver"] as const) {
    it(`${plan}: draws the headline, the scenario chips and the inputs table instead of stopping`, () => {
      const { root, h } = draw(withoutOutlook(plan));
      expect(root.getElementById("head")?.textContent).toMatch(/earnings per share/);
      expect([...root.querySelectorAll(".chip")].map((c) => (c.textContent || "").replace("GOLD", "")).join("|")).toBe("Today|2022 commodity and rate shock|2020 lockdown|Oil spike|Rupee slide|Rates up|Demand slowdown|Custom");   // Silver sees the other chips locked
      expect(root.textContent).toMatch(/See today’s inputs/);
      expect(root.textContent).not.toMatch(/US\$undefined|NaN/);
      expect(root.querySelector("[data-tc]")).toBeNull();                                // no "Crude eases" switch when the server could not build that scenario
      expect(root.textContent).not.toMatch(/EIA outlook instead/);
      h.destroy();
    });
  }
  it("draws with no price history at all (the history chart says nothing rather than failing)", () => {
    const { root, h } = draw(withoutOutlook("gold", false));
    expect(root.getElementById("head")?.textContent).toMatch(/earnings per share/);
    h.destroy();
  });
  it("every scenario chip can be opened, alone and next to a second company", () => {
    for (const compare of [false, true]) {
      const a = withoutOutlook("gold"), b = withoutOutlook("gold");
      b.company.symbol = "PEERCO"; b.company.name = "Peer Co Ltd";
      const { root, h } = draw(a, compare ? "compare" : "single", compare ? { company: b.company, scenarios: b.scenarios, history: b.history, same_quarter: true, picked: false } : null);
      const chips = [...root.querySelectorAll<HTMLElement>(".chip")];
      expect(chips.length).toBe(8);
      for (const c of chips) { c.click(); expect(root.getElementById(compare ? "every" : "head")?.textContent, c.textContent + " " + compare).toBeTruthy(); }
      h.destroy();
    }
  });
  it("draws two companies side by side without the outlook", () => {
    const a = withoutOutlook("gold"), b = withoutOutlook("gold");
    b.company.symbol = "PEERCO"; b.company.name = "Peer Co Ltd";
    const peer = { company: b.company, scenarios: b.scenarios, history: b.history, same_quarter: true, picked: false };
    const { root, h } = draw(a, "compare", peer);
    expect(root.textContent).toMatch(/Peer Co Ltd/);
    expect(root.querySelector("[data-tc]")).toBeNull();
    h.destroy();
  });
  it("still names the EIA outlook when the server has one", () => {
    const { root, h } = draw(JSON.parse(JSON.stringify(fixture)));
    expect(root.querySelector("[data-tc=eia]")).toBeTruthy();
    expect(root.textContent).toMatch(/U\.S\. EIA outlook instead of today’s level: US\$95\.00, 92\.00, 90\.00, 88\.00/);
    h.destroy();
  });
});
