// @vitest-environment jsdom
// Task #51: the (i) beside each plan feature opens a short screen recording (or a picture) of that feature, with a link to it.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { FeatureInfo } from "./FeatureDemo";
import { DEMOS, FEATURE_DEMO, demoFor } from "../lib/featureDemos";

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
        expect(readFileSync(v).length).toBeLessThan(700_000);
      } else expect(existsSync(join(PUB, "landing/tools", d.image + ".webp")), d.image).toBe(true);
    }
    for (const id of Object.values(FEATURE_DEMO)) expect(DEMOS[id], id).toBeTruthy();
  });
  it("the words describe and never advise", () => {
    expect(Object.values(DEMOS).map((d) => d.say + " " + d.title).join(" ")).not.toMatch(/\b(buy|sell|hold|accumulate|target price|best|multibagger|top pick)\b/i);
  });
});

describe("<FeatureInfo />", () => {
  const view = (f = "DCF calculator") => render(<MemoryRouter><p><b>{f}<FeatureInfo feature={f} /></b></p></MemoryRouter>);
  it("renders nothing for a feature without a demo", () => {
    view("Bigger limits");
    expect(screen.queryByRole("button")).toBeNull();
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
  it("a picture stands in where there is no recording", () => {
    view("Alerts");
    fireEvent.click(screen.getByRole("button", { name: /See how Alerts works/ }));
    expect(screen.getByRole("dialog").querySelector("img")?.getAttribute("src")).toMatch(/landing\/tools\/alerts-light\.webp$/);
  });
});
