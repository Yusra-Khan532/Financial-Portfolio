// @vitest-environment jsdom
// Task #274 (the 20 Nov equity pack, change 11): the view bar and the row inside the table. All sections shows every hidden section again; Sections ▾
// lists the open view's sections with their numbers, "You are here" and "Hidden · opens it" (choosing it shows it); a hidden section is a slim card with
// "Hidden · " and its subtitle and Show ▾, and a change made in one place reaches every panel at once.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HideSlim, Hideable, isHidden, setHidden } from "../../components/Hideable";
import { SectionsBar, SectionsMenu } from "./PageTop";

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); });
const SECS = { portfolio: { label: "Portfolio", secs: [["pf-shares", "Your shares"], ["eq-keys", "Key figures"], ["eq-trend", "Trends"]] as [string, string][] } };

describe("hidden sections", () => {
  it("a slim card: the title, Hidden · and its subtitle on one line, and Show ▾ that brings it back and focuses Hide", () => {
    setHidden("pack.eq-trend", true);
    render(<HideSlim.Provider value={true}><Hideable id="pack.eq-trend" title="Short- and long-term trend" sub="15 of 15 stocks rated"><p>matrix</p></Hideable></HideSlim.Provider>);
    const card = screen.getByRole("region", { name: "Short- and long-term trend" });
    expect(card.textContent).toBe("Short- and long-term trendHidden · 15 of 15 stocks ratedShow ▾");
    fireEvent.click(within(card).getByRole("button", { name: "Show: Short- and long-term trend" }));
    expect(screen.getByText("matrix")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide: Short- and long-term trend" }));
  });
  it("other pages keep the plain card", () => {
    setHidden("pack.x", true);
    render(<Hideable id="pack.x" title="Something" sub="sub"><p>x</p></Hideable>);
    expect(screen.getByRole("region", { name: "Something" }).textContent).toBe("SomethingHiddenShow");
  });
  it("a change made elsewhere reaches the panel at once", () => {
    render(<Hideable id="pack.eq-keys" title="Key figures"><p>cards</p></Hideable>);
    act(() => setHidden("pack.eq-keys", true));
    expect(screen.queryByText("cards")).toBeNull();
    act(() => setHidden("pack.eq-keys", false));
    expect(screen.getByText("cards")).toBeTruthy();
  });
});

describe("Sections ▾ in the row inside the table", () => {
  it("lists the sections with numbers, You are here, Hidden · opens it, and ends with All sections", () => {
    setHidden("pack.eq-trend", true);
    const onAll = vi.fn();
    render(<SectionsMenu secs={SECS.portfolio.secs} here="pf-shares" isHidden={(id) => isHidden("pack." + id)} show={(id) => setHidden("pack." + id, false)} onAll={onAll} />);
    fireEvent.click(screen.getByRole("button", { name: /Sections/ }));
    const items = screen.getAllByRole("menuitem").map((b) => b.textContent);
    // task #385 (file 33): Key figures open by default, so only the section the member hid says so
    expect(items).toEqual(["1Your sharesYou are here", "2Key figures", "3TrendsHidden · opens it", "All sections"]);
    fireEvent.click(screen.getByRole("menuitem", { name: /Trends/ }));
    expect(isHidden("pack.eq-trend")).toBe(false);   // choosing a hidden one shows it
    fireEvent.click(screen.getByRole("button", { name: /Sections/ })); fireEvent.click(screen.getByRole("menuitem", { name: "All sections" }));
    expect(onAll).toHaveBeenCalled();
  });
  it("closes on Esc and returns to its button", () => {
    render(<SectionsMenu secs={SECS.portfolio.secs} here="pf-shares" isHidden={() => false} show={() => {}} onAll={() => {}} />);
    const b = screen.getByRole("button", { name: /Sections/ }); fireEvent.click(b);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(b);
  });
});

describe("the view bar's steps", () => {
  it("numbers the steps; All sections asks the page to show every hidden section and go to the top of the view", () => {
    const onAll = vi.fn();
    render(<SectionsBar tab="portfolio" all={SECS} steps onAll={onAll} onTab={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "Sections on this tab" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["All sections", "1Your shares", "2Key figures", "3Trends"]);
    fireEvent.click(within(nav).getByRole("button", { name: "All sections" }));
    expect(onAll).toHaveBeenCalled();
    expect(within(nav).queryByRole("button", { name: /Earlier sections|Later sections/ })).toBeNull();   // arrows only when the steps do not fit
  });
});
