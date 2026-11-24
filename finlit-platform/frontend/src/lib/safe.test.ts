import { describe, expect, it } from "vitest";
import { safeNext, safeUrl } from "./safe";

describe("safeNext", () => {
  it("keeps same-site paths", () => { expect(safeNext("/dashboard")).toBe("/dashboard"); expect(safeNext("/stocks/TCS?x=1#top")).toBe("/stocks/TCS?x=1#top"); });
  it("falls back for anything that could leave the site", () => {
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/ok\nSet-Cookie: x"]) expect(safeNext(bad)).toBe("/dashboard");
  });
});

describe("safeUrl — only http(s) external links (feed/exchange/notification data is untrusted)", () => {
  it("keeps http and https and normalises", () => {
    expect(safeUrl("https://www.nseindia.com/x.pdf")).toBe("https://www.nseindia.com/x.pdf");
    expect(safeUrl("http://bseindia.com/a")).toBe("http://bseindia.com/a");
    expect(safeUrl("  https://x.com/y  ")).toBe("https://x.com/y");   // trimmed
  });
  it("rejects script/data and non-absolute values", () => {
    for (const bad of [null, undefined, "", "javascript:alert(document.cookie)", "JavaScript:alert(1)", "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)", "/relative/path", "mailto:x@y.com", "not a url", "tel:123"]) expect(safeUrl(bad)).toBeNull();
  });
});
