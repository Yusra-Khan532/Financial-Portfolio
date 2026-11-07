import { describe, expect, it } from "vitest";
import { ago, buildTree, draftProblem, linkify, pageWindow, pickCompanies, validHandle, type Post } from "./forum";

describe("linkify", () => {
  it("makes only http(s) links and keeps everything else as text", () => {
    const t = linkify("see https://www.bseindia.com/x.pdf, and javascript:alert(1) <img src=x onerror=alert(1)>");
    expect(t.filter((x) => x.t === "link")).toEqual([{ t: "link", href: "https://www.bseindia.com/x.pdf", label: "bseindia.com/…" }]);
    expect(t.map((x) => (x.t === "text" ? x.v : "")).join("")).toContain("<img src=x onerror=alert(1)>");
  });
  it("refuses credentials in links and trims trailing punctuation", () => {
    expect(linkify("https://a:b@evil.example/x").some((x) => x.t === "link")).toBe(false);
    expect(linkify("(https://a.example/x).")[1]).toMatchObject({ href: "https://a.example/x" });
  });
});
describe("draftProblem", () => {
  it("checks lengths and link count", () => {
    expect(draftProblem("thread", "short", "x".repeat(30))).toMatch(/title/);
    expect(draftProblem("thread", "A fine title", "x".repeat(30))).toBe("");
    expect(draftProblem("reply", "", "x")).toMatch(/Write/);
    expect(draftProblem("reply", "", "https://a.example https://b.example https://c.example")).toMatch(/links/);
  });
});
describe("misc", () => {
  it("handles", () => { expect(validHandle("asha_k")).toBe(true); expect(validHandle("1abc")).toBe(false); });
  it("pageWindow", () => { expect(pageWindow(1, 3)).toEqual([1, 2, 3]); expect(pageWindow(10, 20)).toEqual([1, "…", 8, 9, 10, 11, 12, "…", 20]); });
  it("ago", () => { const n = Date.now(); expect(ago(new Date(n - 5000).toISOString(), n)).toBe("just now"); expect(ago(new Date(n - 7200_000).toISOString(), n)).toBe("2 h ago"); });
});

describe("boards by plan", () => {
  it("has one board per plan, in plan order, with plain names", async () => {
    const { PLANS, BOARD_NAME } = await import("./forum");
    expect(PLANS).toEqual(["basic", "silver", "gold"]);
    expect(PLANS.map((p) => BOARD_NAME[p])).toEqual(["Basic", "Silver", "Gold"]);
  });
});

describe("forum hierarchy helpers", () => {
  const post = (id: number, parentId: number | null, upvotes = 0, at = id) => ({
    id, threadId: 1, parentId, kind: "reply", plan: "basic", symbol: "TCS", company: "TCS", title: null, body: "x", author: { handle: "a", staff: false },
    createdAt: new Date(2026, 0, at).toISOString(), editedAt: null, lastActivityAt: "", upvotes, voted: false, replies: 0, status: "visible", mine: false, note: null, canEdit: false, editableSeconds: 0,
  }) as Post;
  it("nests replies under their parent and keeps orphans at the top", () => {
    const tree = buildTree([post(2, null), post(3, 2), post(4, 3), post(5, 99)]);
    expect(tree.map((n) => n.post.id).sort()).toEqual([2, 5]);
    const two = tree.find((n) => n.post.id === 2)!;
    expect(two.size).toBe(2);
    expect(two.children[0].post.id).toBe(3);
    expect(two.children[0].children[0].post.id).toBe(4);
  });
  it("sorts each level: best by upvotes, new and old by time", () => {
    const flat = [post(2, null, 1, 2), post(3, null, 5, 3), post(4, null, 0, 4)];
    expect(buildTree(flat, "best").map((n) => n.post.id)).toEqual([3, 2, 4]);
    expect(buildTree(flat, "new").map((n) => n.post.id)).toEqual([4, 3, 2]);
    expect(buildTree(flat, "old").map((n) => n.post.id)).toEqual([2, 3, 4]);
  });
  it("picks companies: trending, most discussed and followed", () => {
    const c = (symbol: string, threads: number, recent: number, at: string) => ({ symbol, name: symbol, threads, replies: 0, recent, lastActivityAt: at });
    const list = [c("A", 2, 0, "2026-11-01"), c("B", 9, 1, "2026-11-05"), c("C", 4, 3, "2026-11-06")];
    expect(pickCompanies(list, "all", () => false).map((x) => x.symbol)).toEqual(["A", "B", "C"]);
    expect(pickCompanies(list, "trending", () => false).map((x) => x.symbol)).toEqual(["C", "B"]);
    expect(pickCompanies(list, "discussed", () => false).map((x) => x.symbol)).toEqual(["B", "C", "A"]);
    expect(pickCompanies(list, "following", (s) => s === "A").map((x) => x.symbol)).toEqual(["A"]);
  });
});
