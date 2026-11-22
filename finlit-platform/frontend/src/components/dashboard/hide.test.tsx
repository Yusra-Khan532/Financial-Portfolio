// @vitest-environment jsdom
// Task #316 (dashboard file 22, point 16): every card has a ⋯ menu with "Hide this card"; hidden cards are kept on the account (prefs.dashUi.hidden) and
// come back from "N cards hidden · Show" in the section bar. The three Hide buttons of the older dashboard (kept in this browser) join the saved list once.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Card } from "./parts";
import { DxProvider } from "./dx";
import { SectionFilter } from "./Today";
import { prefs } from "../../lib/prefs";

beforeEach(() => { localStorage.clear(); prefs.set({ dashUi: { ...prefs.get().dashUi, hidden: [], sec: "all" } }); });
afterEach(cleanup);
const page = (ids: string[]) => render(<MemoryRouter><DxProvider><SectionFilter sections={[{ id: "market", title: "The market" }]} />
  {ids.map((id) => <Card key={id} id={id} title={`Card ${id}`}><p>body {id}</p></Card>)}</DxProvider></MemoryRouter>);

describe("Hide this card, and bring it back", () => {
  it("hides a card from its ⋯ menu, says how many are hidden, and Show restores every card", () => {
    page(["flows", "mystocks"]);
    fireEvent.click(screen.getByRole("button", { name: "More for Card flows" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide this card" }));
    expect(screen.queryByText("body flows")).toBeNull();
    expect(screen.getByText("body mystocks")).toBeTruthy();
    expect(prefs.get().dashUi.hidden).toEqual(["flows"]);
    expect(screen.getAllByRole("button", { name: "1 card hidden · Show" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "1 card hidden · Show" })[0]);
    expect(screen.getByText("body flows")).toBeTruthy();
    expect(prefs.get().dashUi.hidden).toEqual([]);
  });
  it("offers the card's full page in the menu, beside Hide", () => {
    page(["flows"]);
    fireEvent.click(screen.getByRole("button", { name: "More for Card flows" }));
    expect(screen.getByRole("menuitem", { name: "Full FII/DII data →" }).getAttribute("href")).toBe("/fii-dii");
  });
  it("keeps a hidden card hidden on the next visit (the choice is saved)", () => {
    prefs.set({ dashUi: { ...prefs.get().dashUi, hidden: ["heatmap"] } });
    page(["heatmap"]);
    expect(screen.queryByText("body heatmap")).toBeNull();
  });
  it("moves the older Hide choices of this browser into the saved list", () => {
    localStorage.setItem("finlit.hide.dashboard.sectors", "1");
    page(["sectors"]);
    expect(prefs.get().dashUi.hidden).toContain("sectors");
    expect(localStorage.getItem("finlit.hide.dashboard.sectors")).toBeNull();
    expect(screen.queryByText("body sectors")).toBeNull();
  });
});
