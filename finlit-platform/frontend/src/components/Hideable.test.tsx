// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hideable } from "./Hideable";

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
  it("still works when browser storage is blocked", () => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); }; Storage.prototype.setItem = () => { throw new Error("blocked"); };
    try { render(<Hideable id="t.x" title="X"><p>xx</p></Hideable>); fireEvent.click(screen.getByRole("button", { name: "Hide: X" })); expect(screen.queryByText("xx")).toBeNull(); }
    finally { Storage.prototype.getItem = get; Storage.prototype.setItem = set; }
  });
});
