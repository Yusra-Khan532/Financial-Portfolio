// @vitest-environment jsdom
// Task #440 (team, 28 Nov 2026), the Mutual funds list (/funds): "this is in mutual fund 'i' box is getting hidden inside the columns". The missing-score
// i drew its explanation as a CSS ::after box inside the score's table cell; a stopped scheme's cells are faded with opacity, which makes each cell its own
// layer, so the NAV and return cells and the frozen Scheme column were painted over the box (and the table's scroll box cut it on a phone). The i now opens
// the site's shared popover, drawn outside the table.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InfoProvider } from "../components/Info";
import { ScoreCell } from "./ScoreCell";
import type { ScoreItem } from "../lib/mfScore";

afterEach(cleanup);
const none = (o: Partial<ScoreItem> = {}): ScoreItem => ({ code: 1, symbol: null, plan: "Direct", group: null, final: null, label: null, status: "NOT SCORED", reason: null, pillars: null, rank: null, rankOf: null, flags: [], confidence: null, ...o });
const table = (cell: React.ReactNode) => (
  <InfoProvider>
    <div className="tw" style={{ overflow: "auto" }}><table><tbody><tr className="mf-stopped"><th className="mf-name">Scheme</th><td className="mfs-hs">{cell}</td><td className="num">₹22.849</td></tr></tbody></table></div>
  </InfoProvider>);
const openPop = () => [...document.querySelectorAll<HTMLElement>(".pop")].find((p) => !p.hidden);

describe("task #440: the missing-score i opens a box no column can hide", () => {
  const reason = "Not scored: this scheme has stopped publishing NAVs.";
  it("hover shows the explanation in the shared popover, outside the table, with the heading and the reason", () => {
    const { container } = render(table(<ScoreCell item={none({ reason })} locked={false} why="x" bare />));
    act(() => { fireEvent.mouseEnter(container.querySelector(".mf-na-i")!); });
    const pop = openPop()!;
    expect(pop).toBeTruthy();
    expect(pop.closest("table, .tw, td")).toBeNull();               // not inside a cell, a column or the scroll box
    expect(pop.querySelector("b")!.textContent).toBe("Missing data from AMFI");
    expect(pop.textContent).toContain(reason);
  });
  it("keyboard focus opens it and leaving closes it; an ETF says Scoring not available", () => {
    const { container } = render(table(<ScoreCell item={none({ reason })} locked={false} why="x" etf />));
    const i = container.querySelector<HTMLButtonElement>(".mf-na-i")!;
    act(() => { i.focus(); });
    expect(openPop()!.querySelector("b")!.textContent).toBe("Scoring not available");
    expect(i.getAttribute("aria-label")).toBe(`No score. Scoring not available. ${reason}`);
  });
  it("a tap opens it and it stays open (no hover on a phone)", () => {
    const { container } = render(table(<ScoreCell item={none({ reason })} locked={false} why="x" />));
    const i = container.querySelector(".mf-na-i")!;
    act(() => { fireEvent.pointerDown(i, { pointerType: "touch" }); fireEvent.click(i); });
    act(() => { fireEvent.mouseLeave(i); fireEvent.blur(i); });
    expect(openPop()!.textContent).toContain(reason);
  });
  it("the old in-cell ::after box is gone, so nothing draws a second, hidden copy", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/task374.css"), "utf8");
    expect(css).not.toMatch(/\.mf-na-i[^{]*::after/);
    expect(css).toMatch(/button\.mf-na-i \{[^}]*background: none/);
  });
});
