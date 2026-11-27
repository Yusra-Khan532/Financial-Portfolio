// @vitest-environment jsdom
// Task #222: section 05's "Against its industry this quarter" card, drawn from the pack's figures (Latest results -> Industries for Reliance and TD Power Systems).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import fx from "../lib/__fixtures__/industryCard-18nov.json";
import type { VRow } from "../lib/resultsPack";
import type { Ind } from "../components/results/pack/IndustriesView";
import { IndustryCard, industryKeyLine, type IndustryRead } from "./IndustryCard";

vi.mock("../lib/rotation", async (orig) => ({ ...(await orig<typeof import("../lib/rotation")>()),
  useRotationMap: () => ({ data: { rows: [{ name: "Petroleum Products", corner: "ahead_gaining" }, { name: "Electrical Equipment", corner: "ahead_slowing" }] } }) }));
vi.mock("../components/sectors/Parts", () => ({ LockedBlock: ({ title, children }: { title: string; children: React.ReactNode }) => <div className="sx-lock"><b>{title}</b><p>{children}</p></div> }));
afterEach(cleanup);

const rows = fx.rows as unknown as VRow[];
const ind = (n: string) => (fx.industries as unknown as Ind[]).find((i) => i.name === n)!;
const read = (sym: string, over: Partial<IndustryRead> = {}): IndustryRead => {
  const row = rows.find((r) => r.symbol === sym)!;
  const peers = rows.filter((r) => r.industry === row.industry).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, 10);
  return { state: "ready", row, ind: ind(row.industry!), peers, name: sym === "RELIANCE" ? "Reliance" : "TD Power Systems", declared: true, quarter: fx.base.quarter as IndustryRead["quarter"], ...over };
};
const draw = (r: IndustryRead) => render(<MemoryRouter><IndustryCard read={r} /></MemoryRouter>);
const order = (c: HTMLElement) => [...c.querySelectorAll(".aiq-t tbody tr")].map((t) => t.querySelector("td b")!.textContent);

describe("the key read (v2)", () => {
  it("Reliance: the frame, the lead with bold blue comparison, the sub-line, an amber In line badge, the two score tiles and the fact tiles", () => {
    const { container: c } = draw(read("RELIANCE"));
    expect(c.querySelector("#aiq .aiq-eye")!.textContent).toBe("Key read for this quarter");
    expect(c.querySelector(".aiq-lead")!.textContent).toBe("Reliance grew about as fast as the typical Petroleum Products company.");
    expect(c.querySelector(".aiq-lead b")!.textContent).toBe("about as fast as");
    expect(c.querySelector(".aiq-sub")!.textContent).toBe("Petroleum Products · 22 of 22 companies have declared · revenue and net profit, Sep 2026 quarter against a year ago");
    const vb = c.querySelector(".aiq-vb")!;
    expect(vb.className).toContain("v-inline"); expect(vb.textContent).toBe("Its verdict on ResultsIn line");
    expect([...c.querySelectorAll(".aiq-big b")].map((b) => b.textContent)).toEqual(["+28.6%", "+40.6%"]);
    expect([...c.querySelectorAll(".aiq-gap")].map((b) => [b.className.split(" ").pop(), b.textContent])).toEqual([["dn", "1.2 pts below its industry"], ["up", "+2.8 pts above its industry"]]);
    expect([...c.querySelectorAll(".aiq-bul em")].map((e) => e.textContent)).toEqual(["Industry +29.8%", "Market +16.8%", "Industry +37.8%", "Market +10.9%"]);
    expect([...c.querySelectorAll(".aiq-f b")].map((e) => e.textContent)).toEqual(["Ahead of the market", "40% of its companies", "Agree"]);
    expect(c.querySelector(".aiq-meter i")!.getAttribute("style")).toContain("width: 40%");
    expect(c.querySelector(".aiq-f a")!.getAttribute("href")).toBe("#sector");
    // task #328 (developer file 27, change 3): two tabs under the header; the company against its industry is selected, the ten biggest are the second tab
    const tabs = [...c.querySelectorAll<HTMLButtonElement>(".aiq-tabs [role=tab]")];
    expect(tabs.map((t) => [t.textContent, t.getAttribute("aria-selected")])).toEqual([["Reliance against its industry", "true"], ["The 10 biggest in Petroleum Products10", "false"]]);
    expect(c.querySelector<HTMLElement>("#aiq-p2")!.hidden).toBe(true);
    expect(c.querySelector<HTMLElement>("#aiq-p1")!.hidden).toBe(false);
    expect(c.querySelector(".aiq-peers")).toBeNull();
  });
  it("TD Power Systems, not among the ten biggest: an outlined link badge, faster than, and Mixed", () => {
    const { container: c } = draw(read("TDPOWERSYS"));
    const vb = c.querySelector("a.aiq-vb")!;
    expect(vb.className).toContain("v-none"); expect(vb.textContent).toBe("Its own verdictOn Results →"); expect(vb.getAttribute("href")).toBe("/results?view=companies&q=TDPOWERSYS");
    expect(c.querySelector(".aiq-lead")!.textContent).toBe("TD Power Systems grew faster than the typical Electrical Equipment company.");
    expect(c.querySelector(".aiq-sub")!.textContent).toContain("Electrical Equipment · 122 of 122 companies have declared");
    expect([...c.querySelectorAll(".aiq-gap")].map((b) => b.textContent)).toEqual(["+61.7 pts above its industry", "+94.7 pts above its industry"]);
    expect([...c.querySelectorAll(".aiq-f b")].map((e) => e.textContent)).toEqual(["In line with the market", "45% of its companies", "Mixed"]);
  });
  it("a company that has not declared: industry and market ticks only, 'Not declared yet', no gap chip, no lead or key-points line", () => {
    const r = read("RELIANCE", { declared: false });
    const { container: c } = draw(r);
    expect([...c.querySelectorAll(".aiq-big b")].map((b) => b.textContent)).toEqual(["Not declared yet", "Not declared yet"]);
    expect(c.querySelectorAll(".aiq-gap").length).toBe(0); expect(c.querySelectorAll(".aiq-bul .bar").length).toBe(0); expect(c.querySelectorAll(".aiq-bul .tk").length).toBe(4);
    expect(c.querySelector(".aiq-lead b")).toBeNull();
    expect(industryKeyLine(r)).toBeNull();
  });
  it("the key-points line follows the 3-point rule and keeps the numbers", () => {
    expect(industryKeyLine(read("RELIANCE"))).toBe("Sales and profit grew about as fast as the typical Petroleum Products company (+29.8% and +37.8%).");
    expect(industryKeyLine(read("TDPOWERSYS"))).toBe("Sales and profit grew faster than the typical Electrical Equipment company (+24.2% and +10.9%).");
  });
  it("a Basic reader gets the counts and the Silver lock; a company without a comparable group says why", () => {
    const { container: c } = draw({ ...read("RELIANCE"), state: "locked" });
    expect(c.querySelector(".sx-lock")!.textContent).toContain("part of every paid plan");
    expect(c.querySelector(".sx-lock")!.textContent).toContain("22 of 22 companies in Petroleum Products have declared");
    expect(c.querySelector(".aiq-kp")).toBeNull();
    cleanup();
    const { container: d } = draw({ ...read("RELIANCE"), state: "nogroup", ind: undefined });
    expect(d.querySelector(".aiq-sub")!.textContent).toContain("has too few results this quarter to compare");
  });
});

describe("the biggest companies (v3)", () => {
  const open = (sym = "RELIANCE") => { const r = draw(read(sym)); fireEvent.click(r.container.querySelectorAll(".aiq-tabs [role=tab]")[1]!); return r.container; };
  it("the sort bar (Size selected), the key, the pinned typical company, chips, and the company's own row", () => {
    const c = open();
    const sb = within(c.querySelector(".aiq-sb") as HTMLElement);
    expect(sb.getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([["Size", "true"], ["Revenue growth", "false"], ["Profit growth", "false"], ["Verdict", "false"]]);
    expect(c.querySelector(".aiq-lg")!.textContent).toBe("Typical Petroleum Products company");
    const first = c.querySelector(".aiq-t tbody tr")!;
    expect(first.className).toBe("ref"); expect(first.textContent).toContain("Typical Petroleum Products companythe middle company of the industry");
    const me = c.querySelector("tr.me")!;
    expect(me.querySelector("em")!.textContent).toBe("This company"); expect(me.querySelector(".sz")!.className).toBe("sz sz-L"); expect(me.querySelector(".vc")!.className).toBe("vc v-inline");
    expect([...c.querySelectorAll(".aiq-t .sz")].map((s) => s.textContent)).toEqual(["Large", "Large", "Large", "Large", "Mid", "Mid", "Mid", "Small", "Small", "Small"]);
    expect(c.querySelectorAll(".aiq-t .gb s").length).toBe(22);                                                      // the industry tick on every bar
    expect(c.querySelector('tr.pr td.g .gb i.neg')).not.toBeNull();                                                   // BPCL's −21.5% grows left of zero
    expect(screen.getByText("All 22 companies in Petroleum Products →").getAttribute("href")).toBe("/results?view=companies&industry=Petroleum%20Products");
  });
  it("sorts both ways from the bar and the headings, which stay in step; the typical company never moves", () => {
    const c = open();
    expect([...c.querySelectorAll(".aiq-t thead th")].map((t) => [t.getAttribute("aria-sort"), t.querySelector(".si")!.textContent])).toEqual(Array(5).fill(["none", "↕"]));   // on load: Size in the bar, headings at rest
    fireEvent.click(within(c.querySelector(".aiq-sb") as HTMLElement).getByText("Profit growth"));
    expect(order(c)).toEqual(["Typical Petroleum Products company", "SOTL", "PANAMAPET", "CHENNPETRO", "MRPL", "IOC", "RELIANCE", "GULFOILLUB", "HINDPETRO", "BPCL", "CASTROLIND"]);
    const th = [...c.querySelectorAll(".aiq-t thead th")];
    expect(th.map((t) => t.getAttribute("aria-sort"))).toEqual(["none", "none", "none", "descending", "none"]);
    expect(th[3].querySelector(".si")!.textContent).toBe("▼"); expect(th[0].querySelector(".si")!.textContent).toBe("↕");
    fireEvent.click(th[3].querySelector("button")!);                                                                  // the heading: the other way
    expect(order(c).slice(0, 3)).toEqual(["Typical Petroleum Products company", "CASTROLIND", "BPCL"]);
    expect(th[3].getAttribute("aria-sort")).toBe("ascending"); expect(th[3].querySelector(".si")!.textContent).toBe("▲");
    expect(within(c.querySelector(".aiq-sb") as HTMLElement).getByText("Profit growth").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(th[0].querySelector("button")!);                                                                  // Company: A to Z first
    expect(order(c).slice(1, 3)).toEqual(["BPCL", "CASTROLIND"]);
    expect([...c.querySelectorAll(".aiq-sb button")].every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
    fireEvent.click(within(c.querySelector(".aiq-sb") as HTMLElement).getByText("Verdict"));
    expect(order(c).slice(1, 5)).toEqual(["IOC", "MRPL", "SOTL", "PANAMAPET"]);                                      // Strong first, ties in the page's order
  });
  it("TD Power Systems: the ten biggest, no THIS COMPANY row, and the 'not among the 10 biggest' line", () => {
    const c = open("TDPOWERSYS");
    expect(order(c).slice(1)).toEqual(["BHEL", "ABB", "POWERINDIA", "CGPOWER", "SIEMENS", "GVT&D", "WAAREEENER", "APARINDS", "SUZLON", "PREMIERENE"]);
    expect(c.querySelector("tr.me")).toBeNull();
    expect(c.querySelector(".aiq-foot")!.textContent).toBe("TDPOWERSYS is not among the 10 biggest; its own verdict is on Results.");
  });
});
