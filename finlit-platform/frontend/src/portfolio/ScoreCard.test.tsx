// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import { ScoreCard } from "./ScoreCard";
import type { ScoreAnswer } from "./useScore";

afterEach(cleanup);
const readings = {
  strength: { word: "Fair", figure: 68, scoredShare: 0.9 }, spread: { word: "Fairly spread", figure: 86 },
  risk: { word: "Above your comfort", against: "Above the index", beta: 1.45, swing: 22, swingIndex: 14, worstFall: -30, worstFallIndex: -15, benchmark: "NIFTY 50" },
  trend: { word: "Split", term: "long", upShare: 0.41, downShare: 0.38 }, valuation: { word: "Fair" }, concentration: { word: "Needs quantities", why: "Largest holding and top five, once amounts are in." },
};
const wrap = (a: ScoreAnswer) => render(<MemoryRouter><ScoreCard a={a} state="ready" /></MemoryRouter>);

it("shows a dash and Needs quantities until amounts are in", () => {
  wrap({ locked: false, needsQuantities: true, total: null, readings } as unknown as ScoreAnswer);
  expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  expect(screen.getByText(/Needs quantities: type how many/)).toBeTruthy();
});
it("shows the total, each reading as a word with its figure, and no weights", () => {
  wrap({ locked: false, needsQuantities: false, total: 62, band: "Fair", benchmark: "NIFTY 50", confidence: "Usual", readings } as unknown as ScoreAnswer);
  expect(screen.getByText("62")).toBeTruthy();
  expect(screen.getByText("β 1.45")).toBeTruthy();
  expect(screen.getByText("41% up")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/weight|points|blend/i);
});
it("a Silver member sees the lock note", () => {
  wrap({ locked: true, why: "Your portfolio score is part of the Gold plan." });
  expect(screen.getByText(/part of the Gold plan/)).toBeTruthy();
});
