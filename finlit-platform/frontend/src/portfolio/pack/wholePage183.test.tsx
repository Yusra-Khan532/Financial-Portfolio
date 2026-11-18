// @vitest-environment jsdom
// Task #183 W9 (Equity portfolio, whole page H97–H100): insight cards closed on load (even after a member opened one on an earlier visit) and opened by a
// button (click, Enter or Space); every ⓘ on the page reads as two lines, "What it shows" and "How to read it"; no download control; the page ends
// "Information only, not investment advice."
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: { id: 7 } }) }));
import { Insights } from "./EquityPack";
import { Tip } from "../../components/sectors/pack/Common";
import type { Card } from "../../lib/pulsePack";

afterEach(() => { cleanup(); localStorage.clear(); });
const here = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const PAGE = ["./EquityPack.tsx", "./DivPack.tsx", "./RiskPack.tsx", "./PageTop.tsx", "../SharesTable.tsx"];
const cards: Card[] = [{ kind: "insight", title: "First", text: "One." }, { kind: "watch", title: "Second", text: "Two." }] as Card[];

describe("insight cards (H97)", () => {
  it("start closed on every load, even when an earlier visit left one open, and open from a button", () => {
    localStorage.setItem("finlit.dash.cards.7", JSON.stringify(["eq.t:0", "eq.t:1"]));
    render(<MemoryRouter><Insights items={cards} scope="eq.t" /></MemoryRouter>);
    const rows = screen.getAllByRole("button", { expanded: false });
    expect(rows.map((b) => b.tagName)).toEqual(["BUTTON", "BUTTON"]);   // native buttons: Enter and Space open them
    fireEvent.click(rows[0]);
    expect(rows[0].getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(2);
    expect(localStorage.getItem("finlit.dash.cards.7")).toBe(JSON.stringify(["eq.t:0", "eq.t:1"]));   // the page does not write the member's stored state
  });
  it("the share list's cards use the same closed dropdowns, not the always-open cards", () => {
    const h = here("../../pages/Holdings.tsx");
    expect(h).toContain('<Insights items={sharesCards(shares, day)} scope="eq.shares" />');
    expect(h).not.toMatch(/<Cards\b/);
  });
});

describe("ⓘ popovers (H100)", () => {
  it("read as two lines, What it shows and How to read it", () => {
    render(<Tip text="The average of the list." how="Higher is stronger." label="About it" />);
    fireEvent.click(screen.getByRole("button", { name: "About it" }));
    const lines = Array.from(document.querySelectorAll(".sp-pop .sp-pop-l")).map((l) => l.textContent);
    expect(lines).toEqual(["What it shows The average of the list.", "How to read it Higher is stronger."]);
  });
  it("every ⓘ on the Equity page has its How to read it line", () => {
    for (const f of PAGE) {
      const s = here(f);
      const tips = s.match(/<Tip [^>]*\/>/g) ?? [], helps = s.match(/<Section [^>]*help=/g) ?? [];
      for (const t of tips) expect(t, `${f}: ${t.slice(0, 80)}`).toMatch(/\bhow=/);
      expect((s.match(/<Section [^>]*\bhow=/g) ?? []).length, f).toBe(helps.length);
    }
    for (const f of ["../../lib/eqRisk.ts", "../../lib/equityTop.ts"]) {
      const s = here(f);
      expect((s.match(/\bhow: "/g) ?? []).length, f).toBe((s.match(/\bhelp: "/g) ?? []).length);
    }
  });
});

describe("the end of the page (H99)", () => {
  it("has no download control and ends Information only, not investment advice.", () => {
    const h = here("../../pages/Holdings.tsx");
    for (const f of PAGE) expect(here(f)).not.toMatch(/Export CSV|download=|Download/);
    expect(h).not.toMatch(/Export CSV|download=/);
    const tail = h.slice(h.lastIndexOf("</Gate>"));
    expect(tail).toMatch(/<PortfolioDisclaimer kind="equity" \/><\/details>\s*<p className="eq-end">Information only, not investment advice\.<\/p>\s*<\/div>/);
  });
});
