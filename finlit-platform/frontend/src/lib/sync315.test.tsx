// @vitest-environment jsdom
// Task #315: Word of the Day bookmarks made as a visitor ("kept in this browser until you sign in") join the account's on the first sign-in on
// this browser, and the later "opened today" date wins; a browser an account already used takes the account's list as it is.
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ user: null as null | { id: string }, saved: {} as Record<string, unknown>, puts: [] as unknown[] }));
vi.mock("./auth", () => ({ useAuth: () => ({ user: st.user, plan: "basic" }) }));
vi.mock("./account", () => ({
  loadState: async () => ({ prefs: st.saved, screens: [], watchlist: {} }),
  savePrefs: async (p: unknown) => { st.puts.push(p); },
  savePortfolio: async () => undefined, saveScreens: async () => undefined, saveWatchlist: async () => undefined,
}));
import { StateSync } from "./sync";
import { prefs } from "./prefs";

beforeEach(() => { localStorage.clear(); st.user = null; st.saved = {}; st.puts = []; prefs.set({ wordBookmarks: [], wordSeen: "" }, true); });
afterEach(cleanup);

describe("Word of the Day bookmarks across sign-in (task #315)", () => {
  it("a visitor's bookmarks join the account's, newest first, and are saved to the account", async () => {
    prefs.set({ wordBookmarks: ["ebitda", "dupont-analysis"], wordSeen: "2026-11-24" }, true);
    st.user = { id: "u1" }; st.saved = { palette: "gold", wordBookmarks: ["dupont-analysis", "net-debt"], wordSeen: "2026-11-23" };
    render(<StateSync />);
    await waitFor(() => expect(prefs.get().wordBookmarks).toEqual(["ebitda", "dupont-analysis", "net-debt"]));
    expect(prefs.get().wordSeen).toBe("2026-11-24");
    await waitFor(() => expect(st.puts.length).toBe(1));
    expect((st.puts[0] as { wordBookmarks: string[] }).wordBookmarks).toEqual(["ebitda", "dupont-analysis", "net-debt"]);
  });
  it("on a browser an account already used, the account's list is taken as it is (a word removed on another device stays removed)", async () => {
    localStorage.setItem("finlit-sync-owner", "u1");
    prefs.set({ wordBookmarks: ["ebitda", "dupont-analysis"] }, true);
    st.user = { id: "u1" }; st.saved = { palette: "gold", wordBookmarks: ["dupont-analysis"] };
    render(<StateSync />);
    await waitFor(() => expect(prefs.get().wordBookmarks).toEqual(["dupont-analysis"]));
    expect(st.puts).toEqual([]);
  });
});
