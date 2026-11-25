// Task #183 part 2 (MF portfolio): the dark "Your MF list" box that opens the top of the page, beside one tile per tab (the Equity page's TopGrid).
// Task #389 (developer file 32, Top of the page): the dark "Your funds' health" card and the three coloured view cards become four calm cards with a crown
// each (MfCards): the Mutual Fund Score (ring, its word as a pill, how it is weighted, "See the four parts ▾"), then Your funds, Mix & overlap and Risk
// analytics, the open one saying "You are here", the others "Open →". The four Score parts open under them (MfParts). One line says what is new since the
// last visit (MfSince) and one line under the section bar says which date each kind of figure runs to (MfAsOf). Describes; never advice. Classes: px-.
import { type ReactNode } from "react";
import { Tip } from "../../components/sectors/pack/Common";
import { Info } from "../../portfolio/shared";
import { countOf } from "../../portfolio/shared/words";
import type { MfTile, listBox, partsAverage } from "../../lib/mfTop";
import type { MfView } from "./MfPack";
import "./mf389.css";

export function ListBox({ box, onUnits }: { box: ReturnType<typeof listBox>; onUnits: () => void }) {
  return (
    <div className="mfp-listbox">
      <p className="mfp-lb-k">Your MF list<Tip text="The funds in your list, by type, and how many stocks sit inside them, from the fund houses' latest monthly files." how="Until units are added every fund counts the same, so a liquid fund weighs as much as an equity fund. Add units to weigh them by your money." label="About “Your MF list”" /></p>
      <p className="mfp-lb-v"><b>{box.n}</b> {box.n === 1 ? "fund" : "funds"}</p>
      <p className="mfp-lb-x">{box.line} {box.weights}</p>
      <button type="button" className="mfp-lb-go" onClick={onUnits}>{box.valued ? "Change units" : "Add units"}</button>
    </div>
  );
}

export const CROWN = <span className="px-crown" title="FinLit’s own model"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 8.2l4.6 3.9L12 5l4.4 7.1L21 8.2 19.3 18H4.7z" fill="currentColor" /></svg></span>;
/** The band a score word colours: good (Strong, Healthy), middle (Average, Fair), bad (Weak, Poor). */
export const bandOfWord = (w: string | null | undefined): "hi" | "mid" | "lo" | "na" => { const x = (w ?? "").toLowerCase(); return /strong|healthy/.test(x) ? "hi" : /average|fair/.test(x) ? "mid" : /weak|poor/.test(x) ? "lo" : "na"; };
const wordCase = (w: string | null | undefined) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : null);
export const SCORE_TIP = "The Mutual Fund Score of each fund, from four parts (performance, risk, cost and quality) read against funds of the same category, from 0 to 100.";

export type MfScoreIn = { value: number | null; label: string | null; why?: string | null; valued: boolean; n: number };
/** The score card and the three view cards. `colors`: each view's accent. */
export function MfCards({ score, tiles, colors, view, onView, partsOpen, onParts, hasParts }: { score: MfScoreIn; tiles: MfTile[]; colors: Record<MfView, string>; view: MfView; onView: (v: MfView) => void;
  partsOpen: boolean; onParts: () => void; hasParts: boolean }) {
  const v = score.value == null ? null : Math.round(Math.max(0, Math.min(100, score.value))), w = wordCase(score.label), b = bandOfWord(score.label), C = 2 * Math.PI * 26;
  return (
    <section className="px-strip" aria-label="Your Mutual Fund Score and the three views">
      <div className={"px-c px-sc b-" + b}>
        {CROWN}
        <div className="px-ring" role="img" aria-label={v == null ? "Not scored" : `${v} of 100${w ? `, ${w}` : ""}`}>
          <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle className="t" cx="32" cy="32" r="26" /><circle className="f" cx="32" cy="32" r="26" strokeDasharray={`${((C * (v ?? 0)) / 100).toFixed(1)} ${C.toFixed(1)}`} /></svg>
          <b aria-hidden="true">{v ?? "–"}</b></div>
        <div className="px-sb">
          <p className="px-k">Mutual Fund Score<Info about="Mutual Fund Score" text={`${SCORE_TIP} ${score.valued ? "Your funds are averaged by the value of your units." : "Until units are added, every fund counts the same."}`} how="Higher reads healthier. The four Score parts open under the cards; each fund's own score is in the Your funds table." /></p>
          {w ? <span className={"px-pill " + b}>{w}</span> : <span className="px-pill">{v == null ? "Not scored" : "No band"}</span>}
          <p className="px-x">{v == null ? score.why || "None of your funds has a Mutual Fund Score yet." : score.valued ? "Each fund counts by the value of your units." : "Each fund counts the same until you add units."}</p>
          {hasParts && <button type="button" className="px-partsb" aria-expanded={partsOpen} aria-controls="px-parts" onClick={onParts}>{partsOpen ? "Hide the four parts" : "See the four parts"} <span aria-hidden="true">{partsOpen ? "▴" : "▾"}</span></button>}
        </div>
      </div>
      {tiles.map((t) => { const id = t.id as MfView, on = id === view;
        return <button key={id} type="button" className={"px-c px-vw" + (on ? " on" : "")} style={{ ["--vc" as string]: colors[id] }} aria-pressed={on} onClick={() => onView(id)}
          aria-label={`${t.k}: ${t.v}. ${on ? "You are here" : "Open this view"}`}>
          {CROWN}
          <p className="px-k">{t.k}<em>{on ? "You are here" : "Open →"}</em></p>
          <p className="px-v">{t.v}</p>
          <p className="px-x">{t.sub}</p>
        </button>; })}
    </section>);
}

/** The four Score parts, the plain average of the funds (Performance, Risk "higher = lower risk", Cost "higher = cheaper", Quality), each with a bar. */
export function MfParts({ parts, open }: { parts: ReturnType<typeof partsAverage>; open: boolean }) {
  const hint: Record<string, string> = { risk: "higher = lower risk", cost: "higher = cheaper" };
  return <div className="px-parts" id="px-parts" hidden={!open}>
    <p className="px-pk">The four parts, average of your funds</p>
    <div className="px-pg">{parts.map((p) => <div key={p.k} className="px-pt"><p>{p.label}{hint[p.k] && <small>{hint[p.k]}</small>}</p><b>{p.v ?? "–"}</b>
      <span className="px-ptr" aria-hidden="true"><i style={{ width: `${p.v ?? 0}%` }} /></span></div>)}</div>
    <p className="px-pn">Each part is read against funds of the same category, 0 to 100. These are the plain averages of your funds; the score above weights them by value.</p>
  </div>;
}

/** "Since your last visit on 23 Nov: 1 new filing at companies inside your funds." / "…: nothing new at the companies inside your funds." Exported for tests. */
/** `where`: "your funds" here; the ETF page (task #390) says "your ETFs". */
export function sinceLine(visit: string | null, fresh: number, where = "your funds"): { lead: string; rest: string } {
  if (!visit) return { lead: "Since your last visit:", rest: `what is new at the companies inside ${where} shows from your next visit.` };
  return { lead: `Since your last visit on ${visit}:`, rest: fresh ? `${countOf(fresh, "new filing")} at companies inside ${where}.` : `nothing new at the companies inside ${where}.` };
}
export function MfSince({ visit, fresh, onSee }: { visit: string | null; fresh: number; onSee: () => void }) {
  const t = sinceLine(visit, fresh);
  return <div className="px-since" role="note"><i className="px-dot" aria-hidden="true" /><span><b>{t.lead}</b> {t.rest}</span>
    <button type="button" onClick={onSee}>See what changed →</button></div>;
}

/** "Data as of · NAVs close of 23 Nov and 20 Nov · Filings the last 90 days · Holdings each fund's 31 Oct 2026 file". `parts`: [label, text]. */
export function MfAsOf({ parts }: { parts: [string, ReactNode][] }) {
  if (!parts.length) return null;
  return <p className="px-asof"><b>Data as of</b>{parts.map(([k, t], i) => <span key={k} className="px-ai">{i > 0 && <i aria-hidden="true">·</i>}<span className="px-ak">{k}</span> {t}</span>)}</p>;
}
