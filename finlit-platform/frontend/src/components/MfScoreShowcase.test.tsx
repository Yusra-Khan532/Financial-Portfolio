// @vitest-environment jsdom
// Task #239 (19 Nov 2026): "below finlit prism add this for mutual fund too same 4 buttons to highlights the score just like we did in prism for
// fundamental and technical" (the team's picture: the Mutual Fund Score card, Strong on performance and risk, fair on cost and quality: 77.7, Healthy).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MfScoreShowcase } from "./MfScoreShowcase";
import { fundName, fundTag, mfPartTone, mfShowcaseView, type MfShowcaseReading } from "../lib/mfShowcase";

// the team's picture's figures, on the shape /api/mf/score-showcase sends
const READING: MfShowcaseReading = {
  code: 122639, name: "Parag Parikh Flexi Cap Fund", plan: "Direct", category: "Equity Scheme - Flexi Cap Fund", categoryLabel: "Flexi Cap", final: 77.7, label: "Healthy",
  status: "RATED", runDate: "2026-11-18",
  parts: [{ key: "performance", name: "Performance", points: 88, reading: "Strong" }, { key: "risk", name: "Risk", points: 92.4, reading: "Strong" },
    { key: "cost", name: "Cost", points: 62, reading: "Fair" }, { key: "quality", name: "Quality", points: 66.3, reading: "Fair" }],
};
let answer: { status: number; body: unknown } = { status: 200, body: READING };
beforeEach(() => { answer = { status: 200, body: READING }; vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><MfScoreShowcase /></MemoryRouter></QueryClientProvider>);

describe("task #239: the Mutual Fund Score part of the landing page", () => {
  it("the band: pill, line and four buttons, one per part, in the score's order", () => {
    const { container: c } = open();
    expect(c.querySelector(".hmf .hpz-pill")!.textContent).toBe("Mutual Fund Score");
    expect(c.querySelector("#hmf-title")!.textContent).toBe("Beyond Returns. One Score for Deeper Mutual Fund Analysis.");
    expect([...c.querySelectorAll(".hmf-feats .hpz-feat b")].map((b) => b.textContent)).toEqual(["Performance", "Risk", "Cost", "Quality"]);
    expect([...c.querySelectorAll(".hmf-feats .hpz-feat")].every((f) => f.getAttribute("tabindex") === "0")).toBe(true);
  });
  it("the card: the fund, its tag, the one-line reading, the ring and each part's figure, word and bar", async () => {
    const { container: c } = open();
    expect(await screen.findByText("Strong on performance and risk, fair on cost and quality: 77.7, Healthy.")).toBeTruthy();
    expect(c.querySelector(".hmf-blk .hpz-bh p")!.textContent).toBe("Parag Parikh Flexi Cap Fund");
    expect(c.querySelector(".hmf-blk .hpz-sample")!.textContent).toBe("Flexi Cap · Direct plan");
    expect(c.querySelector(".hpz-score-in b")!.textContent).toBe("77.7");
    expect(c.querySelector(".hpz-score-in em")!.className).toBe("hpz-chip green");
    const parts = [...c.querySelectorAll(".hpz-part")];
    expect(parts.map((p) => [p.querySelector("b")!.textContent, p.querySelector(".hpz-pv")!.textContent, p.querySelector("em")!.textContent, p.className])).toEqual([
      ["Performance", "88.0", "Strong", "hpz-part green"], ["Risk", "92.4", "Strong", "hpz-part green"], ["Cost", "62.0", "Fair", "hpz-part gold"], ["Quality", "66.3", "Fair", "hpz-part gold"]]);
    expect((parts[3].querySelector(".hpz-slide i") as HTMLElement).style.width).toBe("66.3%");
    expect(c.querySelector("figcaption")!.textContent).toBe("Parag Parikh Flexi Cap Fund (Direct plan) on Mutual Fund Score, 18 Nov 2026. Updated daily. Shown as an example, not a recommendation.");
    expect(screen.getByText("Open Mutual Fund Score").closest("a")!.getAttribute("href")).toBe("/funds/122639#fd-score");
  });
  it("a button lights its part in gold, and a part lights its button, as the Prism part does", async () => {
    const { container: c } = open();
    await screen.findByText(/Strong on performance/);
    const btn = (k: number) => c.querySelectorAll(".hmf-feats .hpz-feat")[k], part = (k: number) => c.querySelectorAll(".hpz-part")[k];
    fireEvent.mouseEnter(btn(2));
    expect(part(2).className).toContain("lit"); expect(btn(2).className).toContain("lit");
    expect([0, 1, 3].some((k) => part(k).className.includes("lit"))).toBe(false);
    fireEvent.mouseLeave(btn(2)); expect(part(2).className).not.toContain("lit");
    fireEvent.focus(btn(0)); expect(part(0).className).toContain("lit"); fireEvent.blur(btn(0));
    fireEvent.mouseEnter(part(3)); expect(btn(3).className).toContain("lit");
    expect(btn(1).getAttribute("aria-describedby")).toBe("hmf-p-risk"); expect(c.querySelector("#hmf-p-risk")).not.toBeNull();
  });
  it("no rated score stored, or a fault: the card says so in words, never a made-up score", async () => {
    answer = { status: 404, body: { status: "none", detail: "No rated Mutual Fund Score is stored for the sample fund yet." } };
    const { container: c } = open();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("no rated score stored right now"));
    expect(c.querySelectorAll(".hpz-part").length).toBe(0); expect(c.querySelector("figcaption")).toBeNull();
    expect(screen.getByText("Open Mutual Fund Score").closest("a")!.getAttribute("href")).toBe("/fund-score-screener");
    cleanup();
    answer = { status: 503, body: { status: "unavailable" } };
    open();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("cannot be read right now"), { timeout: 4000 });
  });
});

describe("the reading's rules", () => {
  it("a reading missing any figure the card shows is not drawn", () => {
    expect(mfShowcaseView(READING)).not.toBeNull();
    expect(mfShowcaseView({ ...READING, final: null })).toBeNull();
    expect(mfShowcaseView({ ...READING, label: "Great" })).toBeNull();
    expect(mfShowcaseView({ ...READING, parts: READING.parts.slice(0, 3) })).toBeNull();
    expect(mfShowcaseView({ ...READING, parts: READING.parts.map((p) => (p.key === "cost" ? { ...p, points: null } : p)) })).toBeNull();
  });
  it("words, names and tags", () => {
    expect([mfPartTone("Strong"), mfPartTone("Fair"), mfPartTone("Weak")]).toEqual(["green", "gold", "red"]);
    expect(fundName("Parag Parikh Flexi Cap Fund - Direct Plan - Growth")).toBe("Parag Parikh Flexi Cap Fund");
    expect(fundTag({ categoryLabel: "Flexi Cap funds", plan: "Direct" })).toBe("Flexi Cap · Direct plan");
    expect(fundTag({ categoryLabel: null, plan: null })).toBe("");
  });
  it("sits under the Prism part on the landing page and describes, never advises", () => {
    const home = readFileSync(join(__dirname, "..", "pages", "Home.tsx"), "utf8");
    expect(home.indexOf("<MfScoreShowcase />")).toBeGreaterThan(home.indexOf("<PrismShowcase />"));
    expect(home.indexOf("<MfScoreShowcase />")).toBeLessThan(home.indexOf("<PlansBand"));
    const src = readFileSync(join(__dirname, "MfScoreShowcase.tsx"), "utf8") + readFileSync(join(__dirname, "..", "lib", "mfShowcase.ts"), "utf8");
    expect(src).not.toMatch(/\b(buy|sell|hold|accumulate|avoid|target|best|top pick)\b/i);
  });
});
