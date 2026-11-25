// Logo.dev fallback (owner, 25 Nov 2026: every company needs a logo): our own logo first; else Logo.dev by NSE ticker (.NS) or BSE code (.BO);
// nothing without a publishable key; the footer credit only while the key is sent.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cdnLogo, isCdnLogo, logoFor } from "./logoCdn";
import { quoteMap } from "./globalSearch";

const KEY = "pk_TestKey_123";
describe("company logos from Logo.dev when our own fetch has none", () => {
  it("builds the ticker URL: NSE symbol .NS, BSE code .BO, encoded, one 128px PNG, 404 instead of a monogram", () => {
    expect(cdnLogo("TCS", KEY)).toBe("https://img.logo.dev/ticker/TCS.NS?token=pk_TestKey_123&size=128&format=png&fallback=404");
    expect(cdnLogo("M&M", KEY)).toContain("/ticker/M%26M.NS?");
    expect(cdnLogo("544937", KEY)).toContain("/ticker/544937.BO?");
    expect(isCdnLogo(cdnLogo("TCS", KEY)!)).toBe(true);
  });
  it("never without a publishable key (no key, a secret key or junk gives the initials tile)", () => {
    for (const k of [null, undefined, "", "sk_secret_123456", "pk_", "pk_bad key", "javascript:alert(1)"]) expect(cdnLogo("TCS", k)).toBeNull();
  });
  it("our own fetched logo always wins; the CDN only fills the gaps", () => {
    expect(logoFor("RELIANCE", "/api/logos/abc.png", KEY)).toBe("/api/logos/abc.png");
    expect(logoFor("TCS", null, KEY)).toContain("img.logo.dev");
    expect(logoFor("TCS", null, null)).toBeNull();
    const m = quoteMap({ fields: [], level: "basic", builtAt: 0, amcLogos: {}, logoCdn: KEY, rows: [["RELIANCE", 1, 0, "2026-11-25", null, null, "/api/logos/abc.png"], ["TCS", 1, 0, "2026-11-25", null, null, null]] as never });
    expect(m.get("RELIANCE")!.logo).toBe("/api/logos/abc.png");
    expect(m.get("TCS")!.logo).toContain("/ticker/TCS.NS?");
  });
  it("the footer shows Logo.dev's credit, and logo.dev images send only our site's origin (for the key's domain lock)", () => {
    expect(readFileSync(join(__dirname, "../components/Layout.tsx"), "utf8")).toContain("<LogoCredit />");
    const co = readFileSync(join(__dirname, "../components/CoLogo.tsx"), "utf8");
    expect(co).toContain('Logos provided by Logo.dev');
    expect(co).toMatch(/enabled: false, select: \(q\) => q\?\.logoCdn \?\? null/);   // never fetches the big list just for the footer
    expect(readFileSync(join(__dirname, "../components/search/parts.tsx"), "utf8")).toContain('referrerPolicy={isCdnLogo(src) ? "strict-origin" : "no-referrer"}');
  });
});
