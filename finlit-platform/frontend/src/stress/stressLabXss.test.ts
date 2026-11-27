// @vitest-environment jsdom
// Security: the Stress Lab renders company identity/classification fields into innerHTML in many places, some unescaped (short()/poss()). A crafted
// company name or sector must not be able to inject markup. cleanCo() in stressLab.js strips < > " from those fields at the source; this test proves a
// payload carrying an <img onerror> name produces no element with an onerror attribute and no injected <img src=x>, in both the single and compare views.
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../../public/demo/stress-page.json";
import { draw, exercise, peerOf } from "./harness";

const EVIL = 'Acme<img src=x onerror=alert(1)>"Ltd';
const payload = (name: string) => {
  const p = JSON.parse(JSON.stringify(fixture));
  p.plan = "gold";   // unlock compare and every section
  p.company.name = name; p.company.short = name; p.company.sector = name;
  return p;
};
function assertClean(root: ShadowRoot) {
  expect(root.querySelector("[onerror]")).toBeNull();                                        // no injected event handler
  expect([...root.querySelectorAll("img")].some((i) => i.getAttribute("src") === "x")).toBe(false);   // no injected <img src=x>
}

afterEach(() => { document.body.innerHTML = ""; });

describe("Stress Lab: a crafted company name/sector cannot inject HTML (security)", () => {
  it("single view: the dangerous characters are stripped before any innerHTML render", () => {
    const { root, h } = draw(payload(EVIL), "single");
    exercise(root, "xss-single");
    assertClean(root);
    h.destroy();
  }, 30000);
  it("compare view: the peer company name is neutralised too", () => {
    const peer = peerOf(payload("Peer Co Ltd"), "EVILCO", EVIL);
    const { root, h } = draw(payload(EVIL), "compare", peer);
    exercise(root, "xss-compare");
    assertClean(root);
    h.destroy();
  }, 30000);
});
