// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hideable, HideButtons, setHidden } from "./Hideable";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("Hide / Show on optional panels", () => {
  it("hides to one row with its title, a Hidden tag and a Show button, and stays hidden on the next visit", () => {
    const { unmount } = render(<Hideable id="t.one" title="How the ranking changed"><section>body</section></Hideable>);
    fireEvent.click(screen.getByRole("button", { name: "Hide: How the ranking changed" }));
    expect(screen.queryByText("body")).toBeNull(); expect(screen.getByText("Hidden")).toBeTruthy(); expect(screen.getByText("How the ranking changed")).toBeTruthy();
    unmount();
    render(<Hideable id="t.one" title="How the ranking changed"><section>body</section></Hideable>);
    expect(screen.queryByText("body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show: How the ranking changed" }));
    expect(screen.getByText("body")).toBeTruthy(); expect(screen.getByRole("button", { name: "Hide: How the ranking changed" }).getAttribute("aria-expanded")).toBe("true");
  });
  it("remembers each panel on its own", () => {
    render(<><Hideable id="t.a" title="A"><p>aa</p></Hideable><Hideable id="t.b" title="B"><p>bb</p></Hideable></>);
    fireEvent.click(screen.getByRole("button", { name: "Hide: A" }));
    expect(screen.queryByText("aa")).toBeNull(); expect(screen.getByText("bb")).toBeTruthy();
  });
  it("task #323: the Watchlists' Key figures starts closed; once shown it stays open on the next visit; other panels start open", () => {
    const { unmount } = render(<><Hideable id="pack.wl-keys" title="Key figures"><p>kf</p></Hideable><Hideable id="pack.eq-wc" title="What changed"><p>wc</p></Hideable></>);
    expect(screen.queryByText("kf")).toBeNull(); expect(screen.getByText("wc")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show: Key figures" }));
    expect(screen.getByText("kf")).toBeTruthy();
    unmount();
    render(<Hideable id="pack.wl-keys" title="Key figures"><p>kf</p></Hideable>);
    expect(screen.getByText("kf")).toBeTruthy();
  });
  it("task #385: the equity portfolio's Key figures open by default; with HideButtons off no Hide button is drawn, and a hidden panel keeps its slim Show row", () => {
    render(<HideButtons.Provider value={false}><Hideable id="pack.eq-keys" title="Key figures"><p>kf</p></Hideable><Hideable id="pack.eq-trend" title="Trend"><p>tr</p></Hideable></HideButtons.Provider>);
    expect(screen.getByText("kf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Hide:/ })).toBeNull();
    act(() => setHidden("pack.eq-trend", true));
    expect(screen.getByRole("button", { name: "Show: Trend" })).toBeTruthy();
  });
  it("still works when browser storage is blocked", () => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); }; Storage.prototype.setItem = () => { throw new Error("blocked"); };
    try { render(<Hideable id="t.x" title="X"><p>xx</p></Hideable>); fireEvent.click(screen.getByRole("button", { name: "Hide: X" })); expect(screen.queryByText("xx")).toBeNull(); }
    finally { Storage.prototype.getItem = get; Storage.prototype.setItem = set; }
  });
});
