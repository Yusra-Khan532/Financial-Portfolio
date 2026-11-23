// @vitest-environment jsdom
// Task #349 PR 5: "What's new in my holdings?". A signed-in Silver or Gold member with written answers on sees it first under "Try asking", and a
// tap sends that question to FinLit AI as typed; a visitor and a Basic member do not see it. A kept "what's new" question reads "Your holdings"
// in Chat History.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { subjectLabel } from "../lib/askMemory";
import { Assistant, OPEN_AI, WHATS_NEW_Q } from "./Assistant";

const ai = vi.hoisted(() => ({ asked: [] as string[], user: { id: "u1" } as { id: string } | null,
  quota: { enabled: true, signedIn: true, limit: 50, used: 1, left: 49, resets: "2026-12-01" } as Record<string, unknown> }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => ({ fields: [], rows: [] }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: ai.user, plan: ai.user ? "silver" : null }) }));
vi.mock("../lib/askAi", async (orig) => ({ ...(await orig<typeof import("../lib/askAi")>()),
  useAskQuota: () => ({ data: ai.quota }),
  askAi: async (q: string, _h: unknown, _s: unknown, on: (e: unknown) => void) => {
    ai.asked.push(q);
    [{ type: "text", text: "TCS rose 5% (14 Nov 2026 → 22 Nov 2026)." }, { type: "done", disclaimer: "Information only, not investment advice.", sources: [] }].forEach(on);
  } }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => {
  cleanup(); ai.asked = []; ai.user = { id: "u1" };
  ai.quota = { enabled: true, signedIn: true, limit: 50, used: 1, left: 49, resets: "2026-12-01" };
});

const open = () => {
  render(<MemoryRouter initialEntries={["/"]}><Assistant /></MemoryRouter>);
  act(() => { dispatchEvent(new Event(OPEN_AI)); });
};
const tryRow = () => document.querySelector(".aif-try") as HTMLElement;

describe("What's new in my holdings? (task #349 PR 5)", () => {
  it("is the first thing to try for a Silver or Gold member, and asks FinLit AI as typed", async () => {
    open();
    const chips = [...tryRow().querySelectorAll("button")].map((b) => b.textContent);
    expect(chips[0]).toBe(WHATS_NEW_Q);
    expect(chips).toContain("Reliance financials");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: WHATS_NEW_Q })); });
    expect(ai.asked).toEqual([WHATS_NEW_Q]);
    expect(document.body.textContent).toContain("TCS rose 5% (14 Nov 2026 → 22 Nov 2026).");
  });
  it("is not offered to a visitor", () => {
    ai.user = null;
    ai.quota = { enabled: true, signedIn: false };
    open();
    expect(screen.queryByRole("button", { name: WHATS_NEW_Q })).toBeNull();
    expect([...tryRow().querySelectorAll("button")].map((b) => b.textContent)[0]).toBe("Reliance financials");
  });
  it("is not offered on Basic (no written answers), nor when the month's questions are used", () => {
    ai.quota = { enabled: true, signedIn: true, limit: 0, used: 0, left: 0, resets: "2026-12-01" };
    open();
    expect(screen.queryByRole("button", { name: WHATS_NEW_Q })).toBeNull();
    cleanup();
    ai.quota = { enabled: true, signedIn: true, limit: 50, used: 50, left: 0, resets: "2026-12-01" };
    open();
    expect(screen.queryByRole("button", { name: WHATS_NEW_Q })).toBeNull();
  });
  it("reads 'Your holdings' in Chat History", () => {
    expect(subjectLabel({ subjectKind: "mine", subjectId: "-" })).toBe("Your holdings");
  });
});
