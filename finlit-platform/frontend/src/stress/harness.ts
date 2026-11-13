// Test helpers for the Stress Lab page (task 79): draw a payload into a shadow root the way StressLab.tsx does, and press every control on it.
import StressEngine from "./engine";
import { mountStressLab } from "./stressLab";
import { skeleton } from "./skeleton";
import css from "./stresslab.css?inline";

export type Payload = any;   // the JSON of GET /api/stress/SYM/page
const BAD = /NaN|undefined|null|Infinity/;

/** The second company the way StressLab.tsx passes it. */
export const peerOf = (p: Payload, sym = "PEERCO", name = "Peer Co Ltd") => {
  const b = JSON.parse(JSON.stringify(p));
  b.company.symbol = sym; b.company.name = name;
  return { company: b.company, scenarios: b.scenarios, history: (b.history || []).map((h: any) => ({ ...h, [sym]: h[p.company.symbol] })), same_quarter: true, picked: false };
};

export function draw(p: Payload, view: "single" | "compare" = "single", peer: any = null, more: Record<string, unknown> = {}) {
  const el = document.createElement("div"); document.body.append(el);
  const root = el.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${css}</style>` + skeleton(p.plan === "gold" ? "gold" : "silver", p.disclaimer, p.model, p.as_of, { fxSource: p.today_inputs?.usdinr_source, statement: p.company?.statement });
  const d = JSON.parse(JSON.stringify(p));
  if (peer && Array.isArray(d.history)) {
    const byEp = new Map<string, any>((peer.history || []).map((r: any) => [r.episode, r]));
    d.history = d.history.map((r: any) => (byEp.get(r.episode)?.[peer.company.symbol] !== undefined ? { ...r, [peer.company.symbol]: byEp.get(r.episode)[peer.company.symbol] } : r));
  }
  const h = mountStressLab(root, StressEngine, d, { view, peer, logoUrl: () => "", search: () => [], onCompany() {}, onPeer() {}, requestPeer() {}, ...more } as never);
  return { root, h };
}

/** What a reader would see that is not a number or a word: the text with the inline styles and the i-button texts kept (they are read too). */
export function badText(root: ShadowRoot): string | null {
  const t = root.querySelector(".sl-root")?.textContent || "";
  const m = t.match(new RegExp(".{0,60}(" + BAD.source + ").{0,40}"));
  return m ? m[0] : null;
}

/** Press every control the page has, checking after each one that nothing broke. Returns the problems found ([] when none). */
export function exercise(root: ShadowRoot, label: string): string[] {
  const out: string[] = [];
  const check = (what: string) => {
    const b = badText(root); if (b) out.push(`${label} after ${what}: ${b}`);
    const main = root.getElementById("head")?.textContent || root.getElementById("cmpsum")?.textContent || "";
    if (!main.trim()) out.push(`${label} after ${what}: the result is empty`);
  };
  const act = (what: string, fn: () => void) => { try { fn(); check(what); } catch (e) { out.push(`${label} on ${what}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`); } };
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  check("drawing");
  const chips = all(".chip").map((c) => c.getAttribute("data-scen") || c.getAttribute("data-locked"));
  for (const id of chips) {
    act(`chip ${id}`, () => root.querySelector<HTMLElement>(`.chip[data-scen="${id}"],.chip[data-locked="${id}"]`)?.click());
    for (const tc of ["eia", "level"]) act(`chip ${id} crude ${tc}`, () => root.querySelector<HTMLElement>(`[data-tc="${tc}"]`)?.click());
    for (const u of ["cr", "eps"]) act(`chip ${id} unit ${u}`, () => root.querySelector<HTMLElement>(`[data-unit="${u}"]`)?.click());
    for (const b of all("[data-sure]").map((x) => x.getAttribute("data-v"))) act(`chip ${id} sure ${b}`, () => root.querySelector<HTMLElement>(`[data-sure][data-v="${b}"]`)?.click());
    act(`chip ${id} use estimates`, () => root.querySelector<HTMLElement>("[data-resetedits]")?.click());
  }
  for (const id of all("[data-pick]").map((r) => r.getAttribute("data-pick"))) act(`row ${id}`, () => root.querySelector<HTMLElement>(`[data-pick="${id}"]`)?.click());
  act("adjust", () => root.getElementById("adj")?.click());
  for (const s of all("input[type=range][data-k]").map((x) => x.getAttribute("data-k"))) {
    for (const v of ["min", "max", "0"]) act(`slider ${s} ${v}`, () => {
      const r = root.querySelector<HTMLInputElement>(`input[type=range][data-k="${s}"]`); if (!r) return;
      r.value = v === "0" ? "0" : r.getAttribute(v) || "0"; r.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  for (const p of ["permanent", "one_year"]) act(`persistence ${p}`, () => root.querySelector<HTMLElement>(`[data-pers="${p}"]`)?.click());
  for (const u of ["cr", "eps"]) act(`custom unit ${u}`, () => root.querySelector<HTMLElement>(`[data-unit="${u}"]`)?.click());
  act("back to Today", () => root.querySelector<HTMLElement>("[data-reset]")?.click());
  for (const k of all("input[data-edit]").map((x) => x.getAttribute("data-edit"))) {
    for (const v of ["0", "100", "", "1"]) act(`edit ${k}=${v}`, () => {
      const i = root.querySelector<HTMLInputElement>(`input[data-edit="${k}"]`); if (!i) return;
      i.value = v; i.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  act("use estimates", () => root.querySelector<HTMLElement>("[data-resetedits]")?.click());
  act("i buttons", () => all(".ib").forEach((b) => b.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))));
  act("bar tips", () => all("[data-tip]").forEach((b) => b.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))));
  act("locked", () => all("[data-locked]").forEach((b) => b.click()));
  return out;
}
