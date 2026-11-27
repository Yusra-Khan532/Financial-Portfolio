// @vitest-environment jsdom
// F&O Academy progress (lib/academy.ts): lessons done, the highest quiz score and the lesson opened last are saved where Learn keeps a member's
// things (the site's prefs: this browser, and the account when signed in), come back after a reload, drive the module bars and "Continue where
// you left off", and join the account's progress on the first sign-in on this browser (lib/sync.tsx).
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ user: null as null | { id: string }, saved: {} as Record<string, unknown>, puts: [] as unknown[] }));
vi.mock("./auth", () => ({ useAuth: () => ({ user: st.user, plan: "basic" }) }));
vi.mock("./account", () => ({
  loadState: async () => ({ prefs: st.saved, screens: [], watchlist: {} }),
  savePrefs: async (p: unknown) => { st.puts.push(p); },
  savePortfolio: async () => undefined, saveScreens: async () => undefined, saveWatchlist: async () => undefined,
}));
import { LESSONS, MODULES } from "../content/academy";
import { continueAt, isDone, mergeAcademy, moduleProgress, overallProgress, saveQuiz, scores, setDone, setLast } from "./academy";
import { normalisePrefs, prefs } from "./prefs";
import { StateSync } from "./sync";

const reset = () => prefs.set({ academyDone: [], academyQuiz: [], academyLast: "" }, true);
beforeEach(() => { localStorage.clear(); st.user = null; st.saved = {}; st.puts = []; reset(); });
afterEach(cleanup);
const reload = () => normalisePrefs(JSON.parse(localStorage.getItem("finlit-prefs-v1")!));

describe("F&O Academy progress", () => {
  it("a lesson marked done, a quiz score and the last lesson are saved in this browser and come back after a reload", () => {
    setDone("futures-contract"); saveQuiz("calls-and-puts", 2, 3); setLast("calls-and-puts");
    const back = reload();
    expect(back.academyDone).toEqual(["futures-contract", "calls-and-puts"]);   // finishing a quiz counts the lesson as done
    expect(back.academyQuiz).toEqual(["calls-and-puts:2:3"]);
    expect(back.academyLast).toBe("calls-and-puts");
    setDone("futures-contract", false);
    expect(isDone("futures-contract")).toBe(false);
  });
  it("keeps the highest score of a quiz", () => {
    saveQuiz("delta", 3, 3); saveQuiz("delta", 1, 3);
    expect(scores().get("delta")).toEqual({ score: 3, of: 3 });
    expect(prefs.get().academyQuiz).toEqual(["delta:3:3"]);
  });
  it("refuses bad ids and impossible scores, here and when reading saved prefs", () => {
    saveQuiz("Bad Id", 1, 3); saveQuiz("delta", 4, 3); setDone("x y"); setLast("../x");
    expect(prefs.get()).toMatchObject({ academyDone: [], academyQuiz: [], academyLast: "" });
    expect(normalisePrefs({ academyDone: ["ok", 3, "NO"], academyQuiz: ["a:5:3", "b:2:3", "c:x:3"], academyLast: "<x>" } as never))
      .toMatchObject({ academyDone: ["ok"], academyQuiz: ["b:2:3"], academyLast: "" });
    expect(normalisePrefs({ palette: "gold" })).toMatchObject({ academyDone: [], academyQuiz: [], academyLast: "" });   // older saved prefs
  });
  it("module and overall progress count the lessons done", () => {
    const m2 = MODULES[1];
    setDone(m2.lessons[0].id); setDone(m2.lessons[1].id); setDone(m2.lessons[2].id);
    expect(moduleProgress(m2)).toEqual({ done: 3, total: m2.lessons.length, pct: Math.round((3 / m2.lessons.length) * 100) });
    expect(overallProgress()).toMatchObject({ done: 3, total: LESSONS.length });
  });
  it("Continue where you left off: the last lesson if open, else the next open lesson, else the first open one", () => {
    expect(continueAt()).toEqual({ id: LESSONS[0].lesson.id, started: false });
    setLast("delta");
    expect(continueAt()).toEqual({ id: "delta", started: true });
    setDone("delta"); setDone("gamma");
    expect(continueAt()!.id).toBe("theta");
    for (const x of LESSONS) setDone(x.lesson.id);
    expect(continueAt()).toBeNull();
  });
  it("merging: lessons from both, the higher score, the account's last lesson; null when nothing is new", () => {
    const local = { academyDone: ["delta"], academyQuiz: ["delta:3:3", "gamma:1:3"], academyLast: "gamma" };
    expect(mergeAcademy(local, { academyDone: ["theta"], academyQuiz: ["delta:2:3", "gamma:2:3"], academyLast: "theta" }))
      .toEqual({ academyDone: ["theta", "delta"], academyQuiz: ["delta:3:3", "gamma:2:3"], academyLast: "theta" });
    expect(mergeAcademy({ academyDone: [], academyQuiz: [], academyLast: "" }, { academyDone: ["theta"], academyQuiz: [], academyLast: "theta" })).toBeNull();
  });
  it("a visitor's progress joins the account's on the first sign-in on this browser, and is saved to the account", async () => {
    prefs.set({ academyDone: ["delta"], academyQuiz: ["delta:3:3"], academyLast: "delta" }, true);
    st.user = { id: "u1" }; st.saved = { palette: "gold", academyDone: ["theta"], academyQuiz: ["theta:2:3"], academyLast: "theta" };
    render(<StateSync />);
    await waitFor(() => expect(prefs.get().academyDone).toEqual(["theta", "delta"]));
    expect(prefs.get().academyQuiz).toEqual(["theta:2:3", "delta:3:3"]);
    expect(prefs.get().academyLast).toBe("theta");
    await waitFor(() => expect(st.puts.length).toBe(1));
    expect((st.puts[0] as { academyDone: string[] }).academyDone).toEqual(["theta", "delta"]);
  });
  it("progress left on this browser by another account is replaced by this account's", async () => {
    localStorage.setItem("finlit-sync-owner", "someone-else");
    prefs.set({ academyDone: ["delta"], academyQuiz: ["delta:3:3"], academyLast: "delta" }, true);
    st.user = { id: "u1" }; st.saved = { palette: "gold" };
    render(<StateSync />);
    await waitFor(() => expect(prefs.get().academyDone).toEqual([]));
    expect(prefs.get().academyLast).toBe("");
  });
});
