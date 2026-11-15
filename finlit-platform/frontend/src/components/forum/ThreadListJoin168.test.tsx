// @vitest-environment jsdom
// Task #168: on the company report (section 18) and the forum pages, the "choose a public name" form is a block of its own above the search-and-sort
// toolbar, never inside it (inside, the search box sat at mid-height and on Safari the list below overlapped the toolbar).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const st = vi.hoisted(() => ({ me: { signedIn: true, plan: "gold", board: "gold", handle: null, canPost: false, banned: false, moderator: false } as Record<string, unknown> }));
vi.mock("../../lib/forum", async (orig) => ({ ...(await orig<typeof import("../../lib/forum")>()), forumMe: () => ({ data: st.me }) }));
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()), apiGet: vi.fn(async () => ({ threads: [], total: 0, page: 1, pages: 1 })) }));
import { ThreadList } from "./ForumParts";

const view = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ThreadList symbol="RELIANCE" local per={5} startLabel="Start a discussion about Reliance" /></MemoryRouter></QueryClientProvider>);
afterEach(cleanup);

describe("join form placement", () => {
  it("a member with no public name sees the join form above the toolbar, not in it", () => {
    st.me = { ...st.me, canPost: false, banned: false };
    const { container } = view();
    const join = container.querySelector(".fo-join")!, top = container.querySelector(".fo-tl-top")!;
    expect(join.querySelector("form.fo-form")).toBeTruthy();
    expect(top.querySelector("form.fo-form")).toBeNull();
    expect(join.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...top.children].map((c) => c.className.split(" ")[0])).toEqual(["fo-search", "seg"]);
  });
  it("a member who can post gets the Start button in the toolbar and no join block", () => {
    st.me = { ...st.me, canPost: true, handle: "ana", banned: false };
    const { container } = view();
    expect(container.querySelector(".fo-join")).toBeNull();
    expect(container.querySelector(".fo-tl-top .fo-start")!.textContent).toContain("Start a discussion about Reliance");
  });
  it("a paused account sees its note above the toolbar", () => {
    st.me = { ...st.me, canPost: false, banned: true };
    const { container } = view();
    expect(container.querySelector(".fo-join")!.textContent).toContain("Posting is paused");
    expect(container.querySelector(".fo-tl-top .fo-start")).toBeNull();
  });
  it("the report keeps the Trending column's room only when there is a Trending list", () => {
    const src = readFileSync(resolve(__dirname, "../../stock/CommunitySection.tsx"), "utf8");
    expect(src).toContain('(open == null && n != null && n > 1 ? " has-aside" : "")');
  });
});
