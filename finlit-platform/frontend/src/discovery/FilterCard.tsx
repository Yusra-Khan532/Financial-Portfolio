// Task #296 (the 21 Nov Discover filters pack): the one box of views and filters every Discover list uses, moved out of the company table so the calls and
// results bucket pages use the same card. Options: leave out Stage (a theme reading), and an extra first row (the bucket's own filters). The markup is the
// table's own (task #260 rev 4): the views on a cream strip, search with "Only my names", labelled rows of 42 px drop-downs, "Filters ▾" on a phone.
import { useState, type ReactNode } from "react";
import { Icon } from "../lib/icons";
import { I, type InfoKey } from "./Info";
import { ARROW, BANDS, CORNERS, SIZES, STAGES, TRENDS, type TState } from "./model";
import type { CompanySize } from "../lib/companySize";

const SIZE_KEYS: CompanySize[] = ["large", "mid", "small", "micro"];

/** One labelled drop-down of the card. `info` is an Info key, or a sentence for an (i) of its own. */
export function Sel({ label, info, value, opts, onChange }: { label: string; info?: InfoKey | null; value: string; opts: [string, string][]; onChange: (v: string) => void }) {
  return <label className="dsc-ff"><span>{label}{info ? <I k={info} /> : null}</span>
    <select aria-label={label} value={value} data-on={value ? true : undefined} onChange={(e) => onChange(e.target.value)}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;
}

/** A ready-made view as the card draws it: its count in this list, or why it cannot be used (Gold, no peer labels yet, no company). */
export type ViewBtn = { k: string; t: string; n: number; gold?: boolean; noPeers?: boolean };
export type Nse = { macs: string[]; scts: string[]; inds: string[]; cnt: (k: "mac" | "sct" | "ind", v: string) => number; set: (k: "mac" | "sct" | "ind", v: string) => void };

export function FilterCard({ S, set, views, nse, prismOpen, signedIn, hideStage, extra }: {
  S: TState; set: (p: Partial<TState>) => void; views: ViewBtn[]; nse: Nse; prismOpen: boolean; signedIn: boolean; hideStage?: boolean;
  /** a first row of the card (the bucket's own filters), already labelled */ extra?: ReactNode;
}) {
  const [fOpen, setFOpen] = useState(false);
  const sel = (k: keyof TState, label: string, info: InfoKey | null, opts: [string, string][], onChange?: (v: string) => void) =>
    <Sel label={label} info={info} value={String(S[k] ?? "")} opts={opts} onChange={(v) => (onChange ? onChange(v) : set({ [k]: v, page: 0 } as Partial<TState>))} />;
  const inMac = S.mac ? ` in ${S.mac}` : "", inSct = S.sct ? ` in ${S.sct}` : inMac;
  return <div className="dsc-tools">
    <div className="dsc-views" role="group" aria-label="Ready-made views"><span className="dsc-lab">Ready-made views</span><I k="views" />
      {views.map((l) => {
        const on = S.lenses.includes(l.k), zero = !l.gold && !l.noPeers && l.n === 0, off = l.gold || l.noPeers || zero;
        return <button key={l.k} type="button" className={"dsc-ln" + (zero || l.noPeers ? " zero" : "") + (l.gold ? " gold" : "")} aria-pressed={on} disabled={off && !on}
          title={l.gold ? "FinLit Prism and the technical views are part of Gold" : l.noPeers ? "The peer labels are not published yet" : zero ? "No company in this list" : undefined}
          onClick={() => set({ lenses: on ? S.lenses.filter((x) => x !== l.k) : [...S.lenses, l.k], page: 0 })}>{l.t}<span className="dsc-c">{l.gold ? "Gold" : l.noPeers ? "−" : l.n}</span></button>;
      })}</div>
    <div className={"dsc-fbar" + (fOpen ? " open" : "")} id="dsc-fbar">
      <div className="dsc-fbtop">
        <label className="dsc-fq"><Icon name="search" /><input type="search" placeholder="Search a company in this list" aria-label="Search in this list" value={S.q} onChange={(e) => set({ q: e.target.value, page: 0 })} /></label>
        <label className="dsc-mine-t" data-on={S.mine || undefined} title={signedIn ? undefined : "Sign in to use your portfolio and watchlist"}>
          <input type="checkbox" checked={S.mine} onChange={(e) => set({ mine: e.target.checked, page: 0 })} disabled={!signedIn} /><span>Only my names</span></label>
        <button type="button" className="dsc-fbtog" aria-expanded={fOpen} aria-controls="dsc-frows" onClick={() => setFOpen((v) => !v)}>Filters <i aria-hidden="true">▾</i></button>
      </div>
      <div className="dsc-frows" id="dsc-frows">
        {extra}
        <div className="dsc-frow" role="group" aria-labelledby="dsc-fh-co"><div className="dsc-fh" id="dsc-fh-co">About the company</div>
          {!hideStage && sel("stage", "Stage", "stage", [["", "Any stage"], ...STAGES.map((s) => [s, s] as [string, string])])}
          {sel("size", "Size", "mc", [["", "Any size"], ...SIZE_KEYS.map((s) => [s, SIZES[s]] as [string, string])])}
          {sel("lt", "Long-term trend", "lt", prismOpen ? [["", "Any trend"], ...TRENDS.map((s) => [s, s] as [string, string]), ["none", "Not rated"]] : [["", "Part of Gold"]])}
          {sel("pr", "FinLit Prism", "prism", prismOpen ? [["", "Any rating"], ...BANDS.map((s) => [s, s] as [string, string])] : [["", "Part of Gold"]])}
        </div>
        <div className="dsc-frow" role="group" aria-labelledby="dsc-fh-nse"><div className="dsc-fh" id="dsc-fh-nse">Where it sits <small>NSE</small></div>
          {sel("mac", "Macro sector", null, [["", "Any macro sector"], ...nse.macs.map((m) => [m, `${m} (${nse.cnt("mac", m)})`] as [string, string])], (v) => nse.set("mac", v))}
          {sel("sct", "Sector", null, [["", "Any sector" + inMac], ...nse.scts.map((m) => [m, `${m} (${nse.cnt("sct", m)})`] as [string, string])], (v) => nse.set("sct", v))}
          {sel("ind", "Industry", null, [["", "Any industry" + inSct], ...nse.inds.map((m) => [m, `${m} (${nse.cnt("ind", m)})`] as [string, string])], (v) => nse.set("ind", v))}
          {sel("cn", "Sector Rotation", "corner", [["", "Any box"], ...Object.entries(CORNERS).map(([k, v]) => [k, `${ARROW[k as keyof typeof ARROW]} ${v}`] as [string, string])])}
        </div>
      </div>
    </div>
  </div>;
}

/** The active filters as chips with Clear all (the table's own row). */
export function ActiveChips({ chips, unset }: { chips: [string, string][]; unset: (k: string) => void }) {
  if (!chips.length) return null;
  return <div className="dsc-active" role="group" aria-label="Filters on"><span>Filters:</span>{chips.map(([k, t]) => (
    <button key={k} type="button" className="dsc-ac" aria-label={`Remove filter ${t}`} onClick={() => unset(k)}>{t} ✕</button>))}
    <button type="button" className="dsc-linkish" onClick={() => unset("all")}>Clear all</button></div>;
}
