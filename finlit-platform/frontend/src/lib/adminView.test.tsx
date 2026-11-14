// @vitest-environment jsdom
// An administrator sees every plan's features (founder, 14 Nov 2026): the "view as" header only while one plan is previewed, both scores side by side,
// and nothing taken away from Gold (the Basic stock screener stays).
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdminView, setAdminView, setSeesAllNow, viewAsHeader, VIEW_AS_HEADER } from "./adminView";
import { ScoreChip, rowView, scoreView } from "./planScore";

afterEach(() => { setAdminView("all"); setSeesAllNow(false); });

describe("the admin view", () => {
  it("sends the view-as header only while a plan is previewed, and remembers the choice", () => {
    expect(viewAsHeader()).toEqual({});
    setAdminView("silver");
    expect(viewAsHeader()).toEqual({ [VIEW_AS_HEADER]: "silver" }); expect(getAdminView()).toBe("silver");
    expect(localStorage.getItem("finlit-admin-view")).toBe("silver");
    setAdminView("all");
    expect(viewAsHeader()).toEqual({}); expect(localStorage.getItem("finlit-admin-view")).toBeNull();
  });
  it("adds the FinLit IQ beside FinLit Prism only while an administrator sees everything", () => {
    const row = { overall: 66, band: "healthy", prism_final: 59.4, prism_label: "AVERAGE" };
    expect(rowView("prism", row).also).toBeUndefined();
    setSeesAllNow(true);
    const v = rowView("prism", row);
    expect(v.score).toBe(59); expect(v.also?.model).toBe("iq"); expect(v.also?.score).toBe(66);
    const h = renderToStaticMarkup(<ScoreChip v={v} />);
    expect(h).toContain("Prism"); expect(h).toContain("FinLit IQ"); expect(h).toContain(">66<");
    expect(scoreView("prism", { score: 66, word: "Healthy" }, null).also?.score).toBe(66);
    expect(rowView("iq", row).also).toBeUndefined();        // a Silver view stays one model
  });
});

describe("nothing is taken away from an administrator", () => {
  it("useIsGold is false for an administrator seeing everything, so the Basic stock screener stays", async () => {
    vi.resetModules();
    vi.doMock("./ui", () => ({ useUI: () => ({ has: () => true }) }));
    vi.doMock("./auth", () => ({ useAuth: () => ({ seesAll: true, isAdmin: true }) }));
    const g = await import("./planGate");
    let gold: boolean | null = null, model: string | null = null;
    const Probe = () => { gold = g.useIsGold(); model = g.usePlanModel(); return null; };
    renderToStaticMarkup(<Probe />);
    expect(gold).toBe(false); expect(model).toBe("prism");
    vi.doUnmock("./ui"); vi.doUnmock("./auth");
  });
  it("a Gold member still gets the Gold-only layout", async () => {
    vi.resetModules();
    vi.doMock("./ui", () => ({ useUI: () => ({ has: () => true }) }));
    vi.doMock("./auth", () => ({ useAuth: () => ({ seesAll: false, isAdmin: false }) }));
    const g = await import("./planGate");
    let gold: boolean | null = null;
    const Probe = () => { gold = g.useIsGold(); return null; };
    renderToStaticMarkup(<Probe />);
    expect(gold).toBe(true);
    vi.doUnmock("./ui"); vi.doUnmock("./auth");
  });
});
