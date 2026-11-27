// @vitest-environment jsdom
// Task #243 round 3a (screeners pack v4): "F&O stocks only" and "Liquid only" in More filters with their counts and chips, the i beside a new screen's name
// ("What it shows" and three "How to use it" points), the NEW tag on its card, the first-list pill and "Left the list: none yet".
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DateBar, FilterChips, FilterMenus, LeftDrop } from "./ScreenParts";
import { AboutNote } from "./ScreenView";
import { Card } from "./ScreensStrip";
import { NO_BAR, barCount, barParams, type BarFilter, type Preset, type PresetDetail, type PresetGroup } from "../../../lib/presets";

afterEach(cleanup);

describe("More filters: F&O stocks only and Liquid only", () => {
  const D = { facets: { sizes: { Large: 4 }, sectors: [], strong: 3, strongOnly: 1, anyRating: 4, new: 1, ahead: 2, nse: 4, bse: 0, fno: 218, liquid: 853 } } as unknown as PresetDetail;
  function F() { const [b, setB] = useState<BarFilter>(NO_BAR); return <MemoryRouter><FilterMenus d={D} f={{ bar: b, set: setB }} onAddRule={() => {}} /><FilterChips f={{ bar: b, set: setB }} /></MemoryRouter>; }
  it("lists both with their counts after Ahead of NIFTY 500, and each shows as a chip when on", () => {
    render(<F />);
    fireEvent.click(screen.getByRole("button", { name: /More filters/ }));
    const labels = screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent);
    expect(labels.slice(2, 4)).toEqual(["F&O stocks onlyStocks with futures and options contracts on NSE.218", "Liquid onlyAn average of ₹10 Cr or more traded a day over the last 20 sessions.853"]);      // round 3b: the two sector filters follow on Advanced
    fireEvent.click(screen.getByRole("checkbox", { name: /F&O stocks only/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Liquid only/ }));
    expect(screen.getByRole("button", { name: /More filters · 2/ })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    const chips = screen.getByRole("group", { name: "Filters on" });
    expect(chips.textContent).toContain("F&O stocks only");
    expect(chips.textContent).toContain("Liquid only");
    fireEvent.click(within(chips).getByRole("button", { name: "Remove F&O stocks only" }));
    expect(screen.getByRole("group", { name: "Filters on" }).textContent).not.toContain("F&O");
  });
  it("sends fno=1 and liquid=1 and counts them", () => {
    const b = { ...NO_BAR, fno: true, liquid: true };
    expect(barParams(b)).toEqual(["fno=1", "liquid=1"]);
    expect(barCount(b)).toBe(2);
  });
});

describe("a new screen", () => {
  const about = { shows: "Companies where the promoters raised their stake last quarter.", use: ["Read the two columns together.", "Holdings can be up to three months old.", "Open the report's ownership section."] };
  it("the i says What it shows, then three How to use it points", () => {
    const { container } = render(<AboutNote a={about} />);
    expect([...container.querySelectorAll("b")].map((b) => b.textContent)).toEqual(["What it shows", "How to use it"]);
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(about.use);
  });
  it("its card carries a green NEW tag and 'new screen'", () => {
    const p = { id: "promoter-buying", name: "Promoter buying, sound rating", group: "ownership", cardText: "x", count: 10, asOf: "2026-11-19", status: "live", blockedReason: null, chips: [], howItWorks: [], locked: false, isNew: true, about } as Preset;
    const g = { id: "ownership", name: "Ownership", presets: [p] } as PresetGroup;
    render(<Card p={p} group={g} on={false} planName="Gold" onPick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn.querySelector(".rms-new")!.textContent).toBe("NEW");
    expect(btn.querySelector(".rms-m")!.textContent).toBe("10 companies");      // task #325: the NEW tag says it
  });
  it("its only saved list shows the first-list pill, and Left the list says none yet", () => {
    const s = [{ date: "2026-11-19", count: 10, joined: null, left: null, prev: null, rulesUpdated: false, status: "first" as const, saved: true }];
    render(<DateBar sessions={s} asOn={null} setAsOn={() => {}} list={{ date: "2026-11-19", latest: "2026-11-19", count: 10, joined: null, left: null, prev: null, first: "2026-11-19", rulesUpdated: false }} />);
    expect(document.querySelector(".psx3-pill")!.textContent).toBe("New screen · first list, after the 19 Nov close");
    cleanup();
    render(<MemoryRouter><LeftDrop rows={[]} counts={{ on: 0, upto: 0, after: 0 }} asOn={null} latest="2026-11-19" first="2026-11-19" mode="on" setMode={() => {}} /></MemoryRouter>);
    expect(document.querySelector("details.psx3-left summary")!.textContent).toBe("Left the listNone yet. This is the screen's first list.");
  });
});
