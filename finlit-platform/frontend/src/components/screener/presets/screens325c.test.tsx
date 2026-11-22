// @vitest-environment jsdom
// Task #325 C (developer file 25, 2.1 rows 3 to 8 and section 1 row 9): the ready-made screen cards and the date bar.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/ui", () => ({ useUI: () => ({ upgrade: vi.fn(), has: () => true, toast: vi.fn() }) }));
import { ScreensStrip } from "./ScreensStrip";
import { usePresetRoute } from "./usePresetRoute";
import { INFO_RULES, statusLine } from "./ScreenParts";

const P = (id: string, name: string, o = {}) => ({ id, name, group: "top-rated", cardText: name, count: 25, asOf: "2026-11-20", status: "live", blockedReason: null, chips: [], howItWorks: [], locked: false, figure: "FinLit Prism", ...o });
const LIST = { asOf: "2026-11-20", tab: "advanced", groups: [{ id: "top-rated", name: "Top rated", featured: true, presets: [
  P("a", "Joined screen", { count: 62, joined: 10 }), P("b", "Rule day screen", { count: 59, rulesUpdated: true, joined: undefined }), P("c", "IPO base", { count: 0 }), P("d", "New one", { count: 10, isNew: true })] }] };
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => LIST }) as unknown as Response)));
afterEach(cleanup);
const Strip = () => { const r = usePresetRoute(); return <ScreensStrip route={r} />; };
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/advanced-score-screener"]}><Strip /></MemoryRouter></QueryClientProvider>);
const line = (name: string) => screen.getByText(name).closest("button")!.querySelector(".rms-m")!.textContent;

describe("ready-made screen cards (task #325 C)", () => {
  it("say '62 companies' and '+10'; 'rules updated' on a rule-update day, never a joined figure", async () => {
    mount(); await screen.findByText("Joined screen");
    expect(line("Joined screen")).toBe("62 companies · +10");
    expect(line("Rule day screen")).toBe("59 companies · rules updated");
  });
  it("an empty list is greyed and says None tonight; a new screen no longer repeats 'new screen'", async () => {
    mount(); await screen.findByText("IPO base");
    const ipo = screen.getByText("IPO base").closest("button")!;
    expect(ipo.className).toContain("is-empty"); expect(line("IPO base")).toBe("None tonight");
    expect(line("New one")).toBe("10 companies");
  });
  it("the date list says why a close has no list, and the rule-update note is in words", () => {
    expect(statusLine({ date: "2026-11-12", count: null, rulesUpdated: false, status: "not_saved", saved: false } as never)).toBe("Not saved: the night's run did not store a list for this close");
    expect(INFO_RULES).toMatch(/^The rules of this screen were updated at this close/);
  });
});
