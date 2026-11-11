// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Card } from "./parts";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("Hide / Show on optional dashboard panels", () => {
  it("hides to one row with a Hidden tag and a Show button, and remembers the choice", () => {
    const { unmount } = render(<Card id="flows" title="FII / DII flows"><p>body</p></Card>);
    fireEvent.click(screen.getByRole("button", { name: "Hide: FII / DII flows" }));
    expect(screen.queryByText("body")).toBeNull(); expect(screen.getByText("Hidden")).toBeTruthy();
    unmount();
    render(<Card id="flows" title="FII / DII flows"><p>body</p></Card>);                         // the next visit: still hidden until Show is clicked
    expect(screen.queryByText("body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show: FII / DII flows" }));
    expect(screen.getByText("body")).toBeTruthy();
  });
  it("never offers Hide on the user's own panels", () => {
    render(<Card id="mystocks" title="Your stocks today"><p>mine</p></Card>);
    expect(screen.queryByRole("button", { name: /Hide/ })).toBeNull();
  });
});
