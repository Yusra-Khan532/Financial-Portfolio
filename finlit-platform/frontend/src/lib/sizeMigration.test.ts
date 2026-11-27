// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { SIZE_NOTE, SIZE_NOTE_KEY, SIZE_VERSION_KEY, migrateScreens, migrateSmall, migrateStoredScreens } from "./sizeMigration";
import { isOldSizeLink, parseState, serializeState } from "./scoreScreen";
import { decodeState, encodeState, EMPTY } from "./proscreen";
import { decodeUniverse, encodeUniverse, EMPTY_UNIVERSE, isOldSizeUniverse } from "./advanced";

describe("task #262: saved and linked size filters move from the old Small to Micro, once", () => {
  beforeEach(() => { localStorage.clear(); });
  it("reads the old Small (below ₹10,000 Cr) as Micro and leaves the other sizes alone", () => {
    expect(migrateSmall(["Large", "Small"])).toEqual(["Large", "Micro"]);
    expect(migrateSmall(["small", "mid"])).toEqual(["micro", "mid"]);
    expect(migrateSmall(["Small", "Micro"])).toEqual(["Micro"]);
  });
  it("moves the browser's saved screens once, behind a version marker, and asks for the one-time note", () => {
    const old = [{ name: "Tiny", state: { caps: ["Small"], sectors: [] } }, { name: "Big", state: { caps: ["Large"] } }];
    localStorage.setItem("k", JSON.stringify(old));
    const out = migrateStoredScreens("k", old);
    expect(out[0].state).toEqual({ caps: ["Micro"], sectors: [] });
    expect(out[1]).toBe(old[1]);
    expect(JSON.parse(localStorage.getItem("k")!)[0].state.caps).toEqual(["Micro"]);
    expect(localStorage.getItem(SIZE_VERSION_KEY)).toBe("4");
    expect(localStorage.getItem(SIZE_NOTE_KEY)).toBe("1");
    // a second run (a screen saved later with today's Small) changes nothing
    const later = [{ name: "New", state: { caps: ["Small"] } }];
    expect(migrateStoredScreens("k", later)).toBe(later);
  });
  it("never moves a screen the server already moved (sizesMoved)", () => {
    const srv = [{ name: "S", state: { caps: ["Small"] }, sizesMoved: "2026-11-20" }];
    expect(migrateScreens(srv)).toEqual({ list: srv, changed: false });
  });
  it("Score screener links: an old ?cap=Small reads Micro; a new Small carries the marker and stays Small", () => {
    const old = new URLSearchParams("cap=Large,Small");
    expect(isOldSizeLink(old)).toBe(true);
    expect(parseState(old).filters.caps).toEqual(["Large", "Micro"]);
    const s = parseState(new URLSearchParams("")); s.filters.caps = ["Small"];
    const p = serializeState(s);
    expect(p.get("sz")).toBe("4");
    expect(isOldSizeLink(p)).toBe(false);
    expect(parseState(p).filters.caps).toEqual(["Small"]);
    expect(parseState(new URLSearchParams("cap=Micro")).filters.caps).toEqual(["Micro"]);
  });
  it("Stock screener links (s=): the same rule", () => {
    const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const old = decodeState(enc({ c: ["Small"] }));
    expect(old.state.caps).toEqual(["Micro"]); expect(old.moved).toBe(true);
    const now = decodeState(encodeState({ ...EMPTY, caps: ["Small"] }, "market_cap", "desc"));
    expect(now.state.caps).toEqual(["Small"]); expect(now.moved).toBeUndefined();
  });
  it("Advanced charts links (u=): the same rule", () => {
    const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeUniverse(enc({ c: ["Small", "Large"] })).cap).toEqual(["Micro", "Large"]);
    expect(isOldSizeUniverse(enc({ c: ["Small"] }))).toBe(true);
    const now = encodeUniverse({ ...EMPTY_UNIVERSE, cap: ["Small", "Micro"] });
    expect(isOldSizeUniverse(now)).toBe(false);
    expect(decodeUniverse(now).cap).toEqual(["Small", "Micro"]);
  });
  it("says what changed in the owner's words", () => {
    expect(SIZE_NOTE).toBe("Company sizes changed on 20 Nov 2026: your Small filter now reads Micro.");
  });
});
