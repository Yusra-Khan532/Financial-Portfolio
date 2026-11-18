// @vitest-environment jsdom
// Task #234 (Chinmay, 18 Nov 2026): "'the' shall be Capital in all i button". The EPS calculator's tab buttons opened a box headed "the Sensitivity tab";
// the shared i-button box now starts its heading with a capital letter, while the button's spoken name keeps the label as written ("What is the Sensitivity tab?").
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Info, InfoProvider, capFirst } from "./Info";
import type { Glossary } from "../lib/api";

afterEach(cleanup);

describe("task #234: an i button's heading starts with a capital letter", () => {
  it("capitalises only the first letter", () => {
    expect(capFirst("the Sensitivity tab")).toBe("The Sensitivity tab");
    expect(capFirst("P/E ratio")).toBe("P/E ratio");
    expect(capFirst("₹ value")).toBe("₹ value");
    expect(capFirst("")).toBe("");
    expect(capFirst(null)).toBe("");
  });
  it("the box heads 'The Sensitivity tab'; the button's name reads as a sentence", () => {
    const g = { key: "tab-sensitivity", label: "the Sensitivity tab", what: "Shows how the implied price and return move." } as Glossary;
    render(<InfoProvider><Info g={g} /></InfoProvider>);
    const btn = screen.getByRole("button", { name: "What is the Sensitivity tab?" });
    fireEvent.mouseEnter(btn);
    const tip = screen.getByRole("tooltip");
    expect(tip.querySelector("b")!.textContent).toBe("The Sensitivity tab");
  });
});
