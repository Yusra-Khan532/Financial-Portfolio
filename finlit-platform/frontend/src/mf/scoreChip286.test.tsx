// @vitest-environment jsdom
// Task #286: the score chip next to a fund's name is a small box the size of its number (the red box of the task's picture), never a bar as wide as the name.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScoreChip } from "./ScoreCell";

afterEach(cleanup);
const css = readFileSync(join(process.cwd(), "src/styles/mfup.css"), "utf8");
const mf = readFileSync(join(process.cwd(), "src/styles/mf.css"), "utf8");

describe("task #286: the fund score chip hugs its number", () => {
  it("draws the rounded score with its band class", () => {
    const { container } = render(<ScoreChip item={{ final: 72.4, label: "Above its peers", status: "FINAL" } as never} />);
    const chip = container.querySelector(".mfs-chip")!;
    expect(chip.className).toMatch(/\bb-/);
    expect(chip.firstChild!.textContent).toBe("72");
  });
  it("is not stretched by the grid of the fund name cell", () => {
    expect(mf).toMatch(/\.mf-nm \{ display: grid;/);   // the cause: the name cell is a grid, whose items stretch by default
    const rule = css.match(/\.mfs-chip \{ justify-self[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/justify-self: start/);
    expect(rule).toMatch(/width: max-content/);
    expect(css).toMatch(/\.mf-nm > \.mfs-chip \{ margin-left: 0; \}/);
  });
});
