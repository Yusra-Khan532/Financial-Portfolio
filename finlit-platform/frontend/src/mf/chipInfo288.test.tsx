// @vitest-environment jsdom
// Task #288: the glossary "i" of a chip (fund page header: plan, option, scheme type) sits OUTSIDE the chip, not inside it; a long chip wraps on a phone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GTerm } from "./Bits";

afterEach(cleanup);
const page = readFileSync(join(process.cwd(), "src/pages/Funds.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/styles/mf.css"), "utf8");

describe("task #288: the i of a chip is outside the box", () => {
  it("draws the word in the chip and the i after it, not inside", () => {
    const { container } = render(<ul><li><GTerm box="chip ghost" id="open-ended-and-closed-ended-funds">Open Ended</GTerm></li></ul>);
    const chip = container.querySelector(".chip.ghost")!;
    expect(chip.textContent).toBe("Open Ended");
    expect(chip.querySelector(".info")).toBeNull();
    const i = container.querySelector("button.info")!;
    expect(i.previousElementSibling).toBe(chip);
    expect(i.parentElement!.className).toBe("mf-term mf-term-out");
  });
  it("keeps the plain form (word + i, no box) for words in running text and headings", () => {
    const { container } = render(<p><GTerm id="open-ended-and-closed-ended-funds">Open Ended</GTerm></p>);
    expect(container.querySelector(".chip")).toBeNull();
    expect(container.querySelector(".mf-term")!.className).toBe("mf-term");
  });
  it("uses the outside form for all three chips of the fund page, and lets a long chip wrap on a phone", () => {
    expect(page.match(/<GTerm box="chip ghost"/g)).toHaveLength(3);
    expect(page).not.toMatch(/className="chip ghost"><GTerm/);
    expect(css).toMatch(/@media \(max-width: 760px\) \{ \.mf-term-out > \.chip \{ white-space: normal; height: auto;/);
  });
});
