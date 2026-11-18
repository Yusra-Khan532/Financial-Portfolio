// Task #211: the streamed answer's events are read in pieces as they arrive; a piece cut in the middle waits for the rest, a broken one is skipped.
import { describe, expect, it } from "vitest";
import { parseSse, safePages } from "./askAi";

describe("parseSse", () => {
  it("reads finished events and keeps an unfinished one for the next piece", () => {
    const a = parseSse('event: meta\ndata: {"limit":5,"used":1,"left":4,"resets":"2026-12-01","cached":false}\n\nevent: text\ndata: {"text":"Hel');
    expect(a.events).toEqual([{ type: "meta", limit: 5, used: 1, left: 4, resets: "2026-12-01", cached: false }]);
    const b = parseSse(a.rest + 'lo"}\n\nevent: done\ndata: {"disclaimer":"x","sources":[]}\n\n');
    expect(b.events).toEqual([{ type: "text", text: "Hello" }, { type: "done", disclaimer: "x", sources: [] }]);
    expect(b.rest).toBe("");
  });
  it("skips a broken event instead of showing it", () => {
    expect(parseSse("event: text\ndata: {not json\n\nevent: text\ndata: {\"text\":\"ok\"}\n\n").events).toEqual([{ type: "text", text: "ok" }]);
  });
});

describe("safePages (task #218: the FinLit pages an answer read)", () => {
  it("keeps this site's own pages, once each, at most four, and nothing else", () => {
    expect(safePages([{ to: "/macro", label: "India economy" }, { to: "/macro", label: "again" }, { to: "https://x.example", label: "x" }, { to: "//x.example", label: "x" },
      { to: "/a b", label: "space" }, { to: "/glossary", label: "" }, { to: "/glossary", label: "Glossary" }, { to: "/news", label: "News" }, { to: "/fii-dii", label: "FII" }, { to: "/results", label: "R" }]))
      .toEqual([{ to: "/macro", label: "India economy" }, { to: "/glossary", label: "Glossary" }, { to: "/news", label: "News" }, { to: "/fii-dii", label: "FII" }]);
    expect(safePages(undefined)).toEqual([]);
    expect(safePages("x")).toEqual([]);
  });
});
