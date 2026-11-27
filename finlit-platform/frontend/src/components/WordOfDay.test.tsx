// @vitest-environment jsdom
// Task #315: the header's Word of the Day button, its panel (the team's pictures 1 and 2), the bookmark, and the dashboard's "Your bookmark".
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WordOfDayButton, WordOfDayMenuItem } from "./WordOfDay";
import { WordPanel } from "./WordOfDayPanel";
import { YourBookmarks } from "./dashboard/NewsBlocks";
import { TERMS, termOfTheDay } from "../lib/glossary";
import { prefs } from "../lib/prefs";
import { istDate } from "../lib/wordOfDay";

// The sign-in state the panel reads: null (a visitor) unless a test sets a member (task #435: the team's picture was taken signed in).
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuthMaybe: () => authState.value }));

const term = (id: string) => TERMS.find((t) => t.id === id)!;
const withFormula = term("dupont-analysis");
const noFormula = TERMS.find((t) => !t.formula && t.why)!;

beforeEach(() => { prefs.set({ wordBookmarks: [], wordSeen: "" }); authState.value = null; });
afterEach(cleanup);

describe("the header button (checklist 1)", () => {
  it("is a green main button with a book icon, the words Word of the Day and a gold dot until today's word is opened", async () => {
    render(<MemoryRouter><WordOfDayButton /></MemoryRouter>);
    const b = screen.getByRole("button", { name: "Word of the Day" });
    expect(b.className).toContain("ui-btn ui-btn--primary");
    expect(b.textContent).toContain("Word of the Day");
    expect(b.querySelector("svg")).not.toBeNull();
    expect(b.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.getByTestId("wod-dot")).toBeTruthy();
    fireEvent.click(b);
    expect(prefs.get().wordSeen).toBe(istDate());
    expect(screen.queryByTestId("wod-dot")).toBeNull();                         // opened today: the dot goes
    const dlg = await screen.findByRole("dialog", { name: "FinLit Word of the Day" });
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(within(dlg).getByRole("heading", { level: 3 }).textContent).toBe(termOfTheDay().term);   // the same helper as the dashboard card
    expect(dlg.contains(document.activeElement)).toBe(true);                    // focus moves into the dialog
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(b);                                     // and comes back to the button
  });
  it("closes with the X and with a click outside", async () => {
    render(<MemoryRouter><WordOfDayButton /></MemoryRouter>);
    const b = screen.getByRole("button", { name: "Word of the Day" });
    fireEvent.click(b);
    fireEvent.click(await screen.findByRole("button", { name: "Close Word of the Day" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(b);
    await screen.findByRole("dialog");
    fireEvent.click(document.querySelector(".wod-scrim")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Word of the Day" }).getAttribute("aria-expanded")).toBe("false");
  });
  it("where the row has no room even for the book, the 'More' menu item opens the same panel", async () => {
    let picked = 0;
    render(<MemoryRouter><WordOfDayButton /><WordOfDayMenuItem onPick={() => { picked++; }} /></MemoryRouter>);
    const item = screen.getByRole("menuitem", { name: /Word of the Day/ });
    expect(item.textContent).toContain("New today");
    fireEvent.click(item);
    expect(picked).toBe(1);
    expect(await screen.findByRole("dialog", { name: "FinLit Word of the Day" })).toBeTruthy();
    expect(prefs.get().wordSeen).toBe(istDate());
    const src = readFileSync(resolve(__dirname, "Layout.tsx"), "utf8");
    expect(src).toContain("extra={wodInMenu && <WordOfDayMenuItem onPick={() => setOpen(null)} />}");
  });
  it("sits in Header(), just before Ask FinLit AI, on every page but the sign-in pages", () => {
    const src = readFileSync(resolve(__dirname, "Layout.tsx"), "utf8");
    expect(src).toContain('const wod = !onAuth && <WordOfDayButton resetKey=');
    expect(src).toContain("{tool ? <><div className=\"grow\" />{find}<div className=\"grow\" />{wod}{ai}</> : <>");   // a tool page (task #310 D)
    expect(src).toMatch(/\{wod\}\n\s*\{ai\}\n\s*\{find\}<\/>\}/);                                                      // a page with the seven menus
  });
});

describe("the panel (checklists 2 and 3)", () => {
  it("shows the head, the term and its topic, the meaning, the formula as parts, why it matters and the bookmark, in that order (task #435: no glossary link)", () => {
    render(<MemoryRouter><WordPanel term={withFormula} onClose={() => undefined} /></MemoryRouter>);
    const dlg = screen.getByRole("dialog", { name: "FinLit Word of the Day" });
    const text = dlg.textContent!;
    const at = (s: string) => { const i = text.indexOf(s); expect(i, s).toBeGreaterThanOrEqual(0); return i; };
    const order = [at("FinLit Word of the Day"), at(withFormula.term), at(withFormula.topic), at(withFormula.meaning), at("ROE ="), at("Why it matters:"), at("Bookmark this word"), at("Your bookmarks")];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(dlg.querySelector(".wod-cal svg")).not.toBeNull();
    expect(dlg.querySelector(".wod-topic")!.className).toContain("ui-chip--gain");
    expect([...dlg.querySelectorAll(".wod-fx-pill")].map((e) => e.textContent)).toEqual(["Net margin", "Asset turnover", "Equity multiplier"]);
    expect([...dlg.querySelectorAll(".wod-fx-op")].map((e) => e.textContent)).toEqual(["×", "×"]);
    expect(dlg.querySelector(".wod-fx-text")!.textContent).toMatch(/^five-step:/);   // the second clause does not split cleanly: shown as written
    // task #435: the team's marked picture removes "Open in the glossary →"; the bookmark is the only action left
    expect(text).not.toContain("Open in the glossary");
    expect(within(dlg).queryByRole("link", { name: /glossary/i })).toBeNull();
    expect(dlg.querySelector(".wod-gl")).toBeNull();
    expect([...dlg.querySelector(".wod-acts")!.children].map((e) => e.textContent)).toEqual(["Bookmark this word"]);
    expect(dlg.querySelector(".wod-why")!.textContent).toBe("Why it matters: " + withFormula.why);
  });
  it("task #435: the glossary link is gone from the panel's code and its style sheet (no left-over rule)", () => {
    expect(readFileSync(resolve(__dirname, "WordOfDayPanel.tsx"), "utf8")).not.toMatch(/>Open in the glossary|wod-gl\b/);
    expect(readFileSync(resolve(__dirname, "../styles/word-of-day.css"), "utf8")).not.toMatch(/\.wod-gl\b/);
  });
  it("task #435: signed in, as in the team's picture, the panel has no glossary link either; the note's link to Your bookmark stays", () => {
    authState.value = { user: { id: 1, email: "m@example.com" } };
    render(<MemoryRouter><WordPanel term={withFormula} onClose={() => undefined} /></MemoryRouter>);
    const dlg = screen.getByRole("dialog", { name: "FinLit Word of the Day" });
    expect(dlg.textContent).not.toContain("Open in the glossary");
    expect([...dlg.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/dashboard#dsh-learn"]);
    expect(within(dlg).getByRole("button", { name: "Bookmark this word" })).toBeTruthy();
  });
  it("leaves the formula box out for a word without a formula", () => {
    render(<MemoryRouter><WordPanel term={noFormula} onClose={() => undefined} /></MemoryRouter>);
    expect(document.querySelector(".wod-fx")).toBeNull();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(noFormula.term);
  });
  it("a visitor is told the bookmarks stay in this browser until sign-in", () => {
    render(<MemoryRouter><WordPanel term={noFormula} onClose={() => undefined} /></MemoryRouter>);
    expect(document.querySelector(".wod-note")!.textContent).toBe("Your bookmarks are kept in this browser until you sign in; then they are on your dashboard, under Learn → Your bookmark.");
  });
});

describe("bookmark (checklist 5)", () => {
  it("toggles, shows Bookmarked with aria-pressed, and lands in prefs newest first", () => {
    prefs.set({ wordBookmarks: ["ebitda"] });
    render(<MemoryRouter><WordPanel term={withFormula} onClose={() => undefined} /></MemoryRouter>);
    const b = screen.getByRole("button", { name: "Bookmark this word" });
    expect(b.getAttribute("aria-pressed")).toBe("false");
    act(() => { fireEvent.click(b); });
    expect(prefs.get().wordBookmarks).toEqual(["dupont-analysis", "ebitda"]);
    const on = screen.getByRole("button", { name: "Bookmarked" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(on.querySelector("svg")!.getAttribute("fill")).toBe("currentColor");   // the filled icon
    act(() => { fireEvent.click(on); });
    expect(prefs.get().wordBookmarks).toEqual(["ebitda"]);
  });
});

describe("the dashboard's Your bookmark (checklists 6 and 7)", () => {
  it("is headed exactly 'Your bookmark' and shows the empty state", () => {
    render(<MemoryRouter><YourBookmarks terms={TERMS} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Your bookmark" })).toBeTruthy();
    expect(screen.getByText("No bookmarks yet. Open Word of the Day in the top bar and choose Bookmark this word.")).toBeTruthy();
  });
  it("lists the words newest first with their topic and a link, removes one, and shows the first 5 with Show all N", () => {
    const ids = TERMS.slice(0, 7).map((t) => t.id);
    prefs.set({ wordBookmarks: ids });
    render(<MemoryRouter><YourBookmarks terms={TERMS} /></MemoryRouter>);
    let items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(within(items[0]).getByRole("link").textContent).toBe(TERMS[0].term);
    expect(within(items[0]).getByRole("link").getAttribute("href")).toBe("/glossary#" + ids[0]);
    expect(items[0].textContent).toContain(TERMS[0].topic);
    fireEvent.click(screen.getByRole("button", { name: "Show all 7 bookmarks" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    act(() => { fireEvent.click(screen.getByRole("button", { name: `Remove ${TERMS[0].term} from your bookmarks` })); });
    expect(prefs.get().wordBookmarks).toEqual(ids.slice(1));
    items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByRole("link").textContent).toBe(TERMS[1].term);
  });
});

describe("Word of the Day formula as a fraction (owner's screenshot of 23 Nov: Inflation)", () => {
  it("draws 'a ÷ b' as a over b, drops the brackets that wrap a whole top part, and keeps the other operators between the terms", async () => {
    const { fractionTerms, unwrapParens } = await import("./WordOfDayPanel");
    expect(unwrapParens("(CPI now − CPI a year ago)")).toBe("CPI now − CPI a year ago");
    expect(unwrapParens("(a) × (b)")).toBe("(a) × (b)");
    expect(unwrapParens("EPS")).toBe("EPS");
    expect(fractionTerms(["(CPI now − CPI a year ago)", "CPI a year ago", "100"], ["÷", "×"]))
      .toEqual({ terms: [{ num: "CPI now − CPI a year ago", den: "CPI a year ago" }, { num: "100" }], ops: ["×"] });
    expect(fractionTerms(["Net margin", "Asset turnover"], ["×"])).toEqual({ terms: [{ num: "Net margin" }, { num: "Asset turnover" }], ops: ["×"] });
    expect(fractionTerms(["a", "b", "c"], ["÷", "÷"])).toEqual({ terms: [{ num: "a", den: "b" }, { num: "c" }], ops: ["÷"] });
  });
  it("renders the Inflation formula as one fraction and × 100", () => {
    const t = { ...withFormula, formula: "Inflation % = (CPI now − CPI a year ago) ÷ CPI a year ago × 100" };
    render(<MemoryRouter><WordPanel term={t} onClose={() => undefined} /></MemoryRouter>);
    const dlg = screen.getByRole("dialog", { name: "FinLit Word of the Day" });
    const frac = dlg.querySelector(".wod-fx-frac")!;
    expect([...frac.querySelectorAll(".wod-fx-fn")].map((e) => e.textContent)).toEqual(["CPI now − CPI a year ago", "CPI a year ago"]);
    expect([...dlg.querySelectorAll(".wod-fx-pill")].map((e) => e.textContent)).toEqual(["100"]);
    expect(frac.querySelector(".wod-fx-bar")).not.toBeNull();
    expect([...dlg.querySelectorAll(".wod-fx-op")].map((e) => e.textContent)).toEqual(["×"]);
    expect(dlg.querySelector(".wod-fx-row")!.textContent).toBe("Inflation % =CPI now − CPI a year agoCPI a year ago×100");
  });
});
