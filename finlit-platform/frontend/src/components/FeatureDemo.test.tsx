// @vitest-environment jsdom
// Task #51: the (i) beside each plan feature opens a short screen recording (or a picture) of that feature, with a link to it.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { FeatureInfo } from "./FeatureDemo";
import { DEMOS, FEATURE_DEMO, demoFor } from "../lib/featureDemos";
import STEPS_JSON from "../content/featureSteps.json";

afterEach(cleanup);
const PUB = join(process.cwd(), "public");
const plansSrc = readFileSync(join(process.cwd(), "src/pages/Plans.tsx"), "utf8");
// every feature title in the plan cards and the plan-by-plan table
const titles = [...plansSrc.matchAll(/\["([^"]+)", (?:"[^"]*"|null)(?:, \d)?\]/g)].map((m) => m[1]).filter((t) => /^[A-Z]/.test(t));   // feature titles start with a capital; icon names (check, spark ...) do not

const NO_DEMO = new Set(["Bigger limits", "Equity research report (planned, later)", "Equity research report (coming soon)", "Free for everyone (Basic)", "Silver: scores and tools", "Gold: more depth", "Planned, not built yet"]);

describe("feature demos", () => {
  it("every feature on the Plans page has a demo, except limits and what is not built yet", () => {
    const missing = titles.filter((t) => !NO_DEMO.has(t) && !demoFor(t));
    expect(missing).toEqual([]);
  });
  it("every demo's clip and poster, or its picture, is on disk; clips are small", () => {
    for (const d of Object.values(DEMOS)) {
      if (d.kind === "video") {
        const v = join(PUB, "plans/demos", d.id + ".mp4");
        expect(existsSync(v), v).toBe(true); expect(existsSync(join(PUB, "plans/demos", d.id + ".jpg"))).toBe(true);
        expect(readFileSync(v).length).toBeLessThan(1_800_000);
      } else expect(existsSync(join(PUB, "landing/tools", d.image + ".webp")), d.image).toBe(true);
    }
    for (const id of Object.values(FEATURE_DEMO)) expect(DEMOS[id], id).toBeTruthy();
  });
  it("the words describe and never advise", () => {
    expect(Object.values(DEMOS).map((d) => d.say + " " + d.title).join(" ")).not.toMatch(/\b(buy|sell|hold|accumulate|target price|best|multibagger|top pick)\b/i);
  });
});

describe("<FeatureInfo />", () => {
  const view = (f = "DCF calculator") => render(<MemoryRouter><p><b><FeatureInfo feature={f} label={f} /></b></p></MemoryRouter>);
  it("shows a plain label, no button, for a feature without a demo", () => {
    view("Bigger limits");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Bigger limits")).toBeTruthy();
  });
  it("the whole feature name is the button, so a click on the words opens the player too", () => {
    view();
    const b = screen.getByRole("button", { name: "See how DCF calculator works" });
    expect(b.textContent).toContain("DCF calculator");
    fireEvent.click(screen.getByText("DCF calculator"));        // the words, not only the small (i)
    expect(screen.getByRole("dialog", { name: "DCF calculator" })).toBeTruthy();
  });
  it("closing the player and pressing again opens it again, every time", () => {
    view();
    for (let k = 0; k < 3; k++) {
      fireEvent.click(screen.getByRole("button", { name: "See how DCF calculator works" }));
      expect(screen.getByRole("dialog")).toBeTruthy();
      act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  });
  it("a recording that cannot load leaves the poster and a plain line, never a blank box", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "See how DCF calculator works" }));
    fireEvent.error(screen.getByRole("dialog").querySelector("video")!);
    expect(screen.getByRole("status").textContent).toMatch(/could not be loaded/);
    expect(screen.getByRole("link", { name: /Open the DCF calculator/ })).toBeTruthy();
  });
  it("a click opens the full view with the clip, the words and a link; Esc closes it and returns focus", () => {
    view();
    const i = screen.getByRole("button", { name: "See how DCF calculator works" });
    fireEvent.click(i);
    const dlg = screen.getByRole("dialog", { name: "DCF calculator" });
    expect(dlg.querySelector("video")?.getAttribute("src")).toMatch(/plans\/demos\/dcf\.mp4$/);
    expect(dlg.querySelector("video")?.hasAttribute("controls")).toBe(true);
    expect(screen.getByRole("link", { name: /Open the DCF calculator/ }).getAttribute("href")).toBe("/dcf");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(i);
  });
  it("the player lists the steps of the walkthrough, the same as the captions in the clip", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "See how DCF calculator works" }));
    const steps = screen.getByRole("dialog").querySelectorAll(".fd-steps li");
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps[0].textContent).toMatch(/assumption/i);
  });
  it("every demo has its steps", () => { for (const d of Object.values(DEMOS)) expect((STEPS_JSON as Record<string, string[]>)[d.id]?.length, d.id).toBeGreaterThanOrEqual(3); });
  it("every demo is a recording", () => { expect(Object.values(DEMOS).filter((d) => d.kind !== "video").map((d) => d.id)).toEqual(["fund-health"].filter(() => false)); });
});
