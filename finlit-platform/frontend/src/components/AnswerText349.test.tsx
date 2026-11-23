// @vitest-environment jsdom
// Task #349: an answer cut by its length or time, or stopped by a refusal, ends with the server's marker; it is drawn as a plain note under the
// points, never as one of them, so the member sees the answer is not whole.
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerText, CUT } from "./AnswerText";

afterEach(cleanup);

describe("the cut-short note (task #349)", () => {
  it("is a note under the sections, not a point", () => {
    const { container } = render(<AnswerText text={"TCS grew.\n1. Growth\n- Sales rose 12% [results filing, 9 Oct 2026]\n2. Margins\n- EBIT margin 24%\n\n(cut short; ask for the rest)"} />);
    const note = container.querySelector(".aif-a-cut")!;
    expect(note.textContent).toBe("Cut short; ask for the rest");
    expect(note.getAttribute("role")).toBe("note");
    expect([...container.querySelectorAll("li")].some((li) => /cut short/i.test(li.textContent ?? ""))).toBe(false);
    expect(container.querySelectorAll("section").length).toBe(2);
  });
  it("the stopped-early marker too, and plain brackets in an answer are left alone", () => {
    const { container } = render(<AnswerText text={"Sales rose (in FY2026)\n(stopped early: FinLit AI could not finish this answer; ask again, or ask in other words)"} />);
    expect(within(container).getByRole("note").textContent).toMatch(/^Stopped early: FinLit AI could not finish/);
    expect(CUT.test("(in FY2026)")).toBe(false);
  });
});
