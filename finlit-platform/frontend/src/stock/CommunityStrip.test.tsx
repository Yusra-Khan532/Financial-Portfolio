// @vitest-environment jsdom
// The community strip under a company's header (task #101): how many discussions and comments, and the way in; a visitor is invited to sign in.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const st = vi.hoisted(() => ({ me: { signedIn: true } as { signedIn: boolean } | undefined, stats: { threads: 12, replies: 38 } as { threads: number; replies: number } }));
vi.mock("../lib/forum", async (orig) => ({ ...(await orig<typeof import("../lib/forum")>()), forumMe: () => ({ data: st.me }), useStats: () => ({ data: st.stats }) }));
vi.mock("../components/forum/ForumParts", () => ({ Disclaimer: () => null, ThreadList: () => null, ThreadView: () => null }));
import { CommunityStrip } from "./CommunitySection";

afterEach(cleanup);
describe("CommunityStrip", () => {
  it("shows the counts for a signed-in member and jumps to the section", () => {
    st.me = { signedIn: true }; st.stats = { threads: 12, replies: 38 };
    const jump = vi.fn();
    render(<CommunityStrip symbol="SHRIRAMFIN" name="Shriram Finance Ltd." jump={jump} />);
    expect(screen.getByText(/12 discussions · 38 comments about Shriram Finance/)).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /Community discussions about Shriram Finance/ }));
    expect(jump).toHaveBeenCalledWith("community");
  });
  it("invites the first discussion when there are none, and a visitor to sign in", () => {
    st.me = { signedIn: true }; st.stats = { threads: 0, replies: 0 };
    const { unmount } = render(<CommunityStrip symbol="X" name="Xyz Limited" jump={() => {}} />);
    expect(screen.getByText(/No discussions about Xyz yet/)).toBeTruthy(); expect(screen.getByText(/Start a discussion/)).toBeTruthy();
    unmount();
    st.me = { signedIn: false };
    render(<CommunityStrip symbol="X" name="Xyz Limited" jump={() => {}} />);
    expect(screen.getByText(/Sign in \(free\) to read and join/)).toBeTruthy(); expect(screen.getByText(/Join the conversation/)).toBeTruthy();
  });
  it("shows nothing until the viewer is known", () => {
    st.me = undefined;
    const { container } = render(<CommunityStrip symbol="X" name="Xyz Ltd" jump={() => {}} />);
    expect(container.textContent).toBe("");
  });
});
