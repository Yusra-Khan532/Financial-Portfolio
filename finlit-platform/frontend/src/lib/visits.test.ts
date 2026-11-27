// @vitest-environment jsdom
// FinLit's own cookie-free counter, the page side: one message per page change, the referrer's host only, the first page marked as the visit's start.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countVisit, resetVisitsForTest } from "./visits";

const sent: { url: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  resetVisitsForTest(); sent.length = 0;
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: (url: string, blob: Blob) => {
    const fr = new FileReader(); fr.onload = () => sent.push({ url, body: JSON.parse(String(fr.result)) }); fr.readAsText(blob); return true;   // jsdom's Blob has no text()
  } });
  Object.defineProperty(document, "referrer", { configurable: true, get: () => "https://www.google.co.in/search?q=tcs+debt+free&secret=1" });
});
afterEach(() => { vi.restoreAllMocks(); });
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("countVisit", () => {
  it("sends the first page as the start of a visit with the referrer's host only, then later pages as inside the site", async () => {
    countVisit("/stocks/TCS"); countVisit("/glossary/dividend-yield"); await flush();
    expect(sent.map((s) => s.url)).toEqual(["/api/visits", "/api/visits"]);
    expect(sent[0].body).toMatchObject({ path: "/stocks/TCS", ref: "www.google.co.in", land: true });
    expect(JSON.stringify(sent[0].body)).not.toContain("tcs+debt+free");      // never the search words or the page the visitor came from
    expect(sent[1].body).toMatchObject({ path: "/glossary/dividend-yield", ref: location.host, land: false, utm: "" });
  });

  it("counts a page once even when React runs the effect twice, and stores nothing in the browser", async () => {
    const before = { ls: localStorage.length, ss: sessionStorage.length, ck: document.cookie };
    countVisit("/"); countVisit("/"); await flush();
    expect(sent).toHaveLength(1);
    expect([localStorage.length, sessionStorage.length, document.cookie]).toEqual([before.ls, before.ss, before.ck]);
  });

  it("does not call a page reached from this same site the start of a visit", async () => {
    Object.defineProperty(document, "referrer", { configurable: true, get: () => `${location.origin}/screener` });
    countVisit("/stocks/INFY"); await flush();
    expect(sent[0].body).toMatchObject({ land: false, ref: location.host });
  });

  it("never throws, even when sending fails", () => {
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: () => { throw new Error("blocked"); } });
    expect(() => countVisit("/x")).not.toThrow();
  });
});
