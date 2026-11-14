// @vitest-environment jsdom
// The Glossary as the pack draws it (board 02): breadcrumb, header with three links, search (Ctrl K), four tiles, three views, topics on the left,
// letters, the letter's rows that open, Other letters, the page's questions and the note under them.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/PageFaqs", () => ({ PageFaqs: ({ inline }: { inline?: boolean }) => (inline ? <section aria-label="Questions about this page" /> : null) }));
import { GlossaryPage } from "./Glossary";

afterEach(cleanup);
const open = (path = "/glossary") => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/glossary" element={<GlossaryPage />} /><Route path="/glossary/:id" element={<GlossaryPage />} /></Routes></MemoryRouter>);
const rows = () => within(screen.getByRole("region", { name: /^A$|FinLit words|New and updated|Results|Absolute/ }) as HTMLElement);

describe("Glossary, as the pack draws it", () => {
  it("has the breadcrumb, the header, the links, the search box and the four tiles", () => {
    open();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Glossary")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Glossary" })).toBeTruthy();
    expect(screen.getByText(/The language of investing in plain words: 450 terms from A to Z\./)).toBeTruthy();
    for (const l of ["Insights & blog →", "FAQs →", "Company report →"]) expect(screen.getByRole("link", { name: l })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search 450 terms, for example "P/E", "Sold off" or "Company size"')).toBeTruthy();
    expect(screen.getByText("Ctrl K")).toBeTruthy();
    const tile = (k: string) => screen.getByText(k, { selector: ".gp-tile > span" }).parentElement!.textContent;
    expect([tile("Terms"), tile("Topics"), tile("New this update"), tile("Updated this update")]).toEqual(["Terms450from A to Z", "Topics18pick one on the left", "New this update7words used on the new pages", "Updated this update35renamed or rewritten"]);
    expect(screen.getByText("For education only; not investment, tax or legal advice.")).toBeTruthy();
    expect(screen.getByText("Definitions are for education only. FinLit Ventures is a technology company and is not registered with SEBI as an investment adviser or research analyst.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Questions about this page" })).toBeTruthy();
  });
  it("opens on letter A: 21 terms, the first one open, ATR marked Updated, the other letters with their counts", () => {
    open();
    expect(screen.getByRole("button", { name: /Browse A to Z/, pressed: true })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "A" })).toBeTruthy();
    expect(screen.getByText("21 terms · select a term to open it")).toBeTruthy();
    const first = screen.getByRole("button", { name: /Absolute and annualised return/ });
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("50% over five years is about 8.4% a year.")).toBeTruthy();
    const atr = screen.getByRole("button", { name: /Average true range \(ATR\)/ });
    expect(atr.getAttribute("aria-expanded")).toBe("false"); expect(within(atr).getByText("Updated")).toBeTruthy();
    fireEvent.click(atr);
    expect(atr.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/How much it counts stays inside the model\./)).toBeTruthy();
    const other = screen.getByText("Other letters").parentElement as HTMLElement;
    expect(within(other).getByRole("button", { name: "B 26" })).toBeTruthy();
    fireEvent.click(within(other).getByRole("button", { name: "S 41" }));
    expect(screen.getByText("41 terms · select a term to open it")).toBeTruthy();
  });
  it("lists the topics with their counts, and a topic narrows the letters", () => {
    open();
    const side = screen.getByRole("complementary", { name: "Topics" });
    expect(within(side).getByRole("button", { name: "All topics 450", pressed: true })).toBeTruthy();
    expect(within(side).getByRole("button", { name: "Funds, bonds and derivatives 64" })).toBeTruthy();
    fireEvent.click(within(side).getByRole("button", { name: "Banks and lenders 8" }));
    expect(screen.getAllByRole("listitem").filter((li) => li.classList.contains("gp-row")).every((li) => li.textContent?.includes("Banks and lenders"))).toBe(true);
  });
  it("FinLit words and New and updated show their own lists", () => {
    open();
    fireEvent.click(within(screen.getByRole("group", { name: "Views" })).getByRole("button", { name: /^FinLit words/ }));
    expect(screen.getByText("37 terms · select a term to open it")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Views" })).getByRole("button", { name: /^New and updated/ }));
    expect(screen.getByText("42 terms · select a term to open it")).toBeTruthy();
    const names = screen.getAllByRole("listitem").filter((li) => li.classList.contains("gp-row")).map((li) => li.querySelector(".gp-badge")?.textContent);
    expect(names.slice(0, 7).every((b) => b === "New")).toBe(true);
    expect(names.slice(7).every((b) => b === "Updated")).toBe(true);
  });
  it("finds a term from the search box, and Ctrl K puts the cursor there", () => {
    open();
    const box = screen.getByRole("searchbox", { name: "Search the glossary" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: "Sold off" } });
    expect(screen.getByRole("heading", { level: 2, name: "Results for “Sold off”" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Industry states \(Sold off/ }).length).toBeGreaterThan(0);
  });
  it("opens one term on its own address", () => {
    open("/glossary/company-size-bands-mega-cap-to-nano-cap");   // a renamed term keeps its old address, so links already shared still open it
    expect(screen.getByRole("heading", { level: 2, name: "Company size (Large, Mid, Small)" })).toBeTruthy();
    expect(screen.getByText(/FinLit no longer uses mega, micro or nano labels\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "All 450 glossary terms" })).toBeTruthy();
  });
});
void rows;
