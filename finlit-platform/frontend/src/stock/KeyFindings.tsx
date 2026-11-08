// Section 02, "What's going well and what to watch": every red flag, watch item and strength in one place (it replaces the two blocks that repeated each other: Scorecard notes and Key findings), each linking to the section it comes from.
// Red flags and watch items from the profit-and-loss checks (lib/plFlags) and the scorecard notes; strengths from the scorecard notes. They describe
// what the figures did and are not a recommendation. Same Silver plan as the scorecard notes they repeat.
import { useMemo } from "react";
import type { Financials, Summary } from "../lib/api";
import { plInsights } from "../lib/plFlags";
import { earningsIntel, type Intel, type ModuleKey } from "../lib/earningsIntel";
import { useProfitReality } from "./ProfitReality";
import { Gate } from "../components/Gate";
import { Icon } from "../lib/icons";
import { SectionHead } from "./Sections";
import "../styles/insights.css";

export type Findings = { flags: Item[]; watch: Item[]; good: Item[] };
type Item = { key: string; title: string; text: string; to: string; tag?: string };

/** The six earnings checks (section 11) in plain words, so a problem found there also shows here (task #37). */
export const CHECK_TITLE: Partial<Record<ModuleKey, string>> = {
  cash: "Profit is not turning into cash", receivables: "Customers are paying more slowly", inventory: "Stock is building up", fcf: "Little cash left after investment",
  normalized: "Profit leans on one-off items", sustain: "Profit may not last",
};

/** Checks that need a look: an alert is a red flag; "Investigate" goes in the Watch column with its tag. OK and not-enough-data checks add nothing. */
export function checkItems(intel: Intel | null): { flags: Item[]; watch: Item[] } {
  const out = { flags: [] as Item[], watch: [] as Item[] };
  for (const m of intel?.modules ?? []) {
    const title = CHECK_TITLE[m.key];
    if (!title || (m.tone !== "alert" && m.tone !== "watch")) continue;
    const item: Item = { key: "ec-" + m.key, title, text: m.facts[0] ?? `${m.name}: ${m.badge}.`, to: "earnings" };
    if (m.tone === "alert") out.flags.push(item); else out.watch.push({ ...item, tag: "Investigate" });
  }
  return out;
}

/** One list per column with no title twice; a title found in more than one column stays in the most serious (red flag, then watch, then strength). */
export function dedupe(k: Findings): Findings {
  const seen = new Set<string>(), keep = (list: Item[]) => list.filter((i) => { const t = i.title.trim().toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; });
  return { flags: keep(k.flags), watch: keep(k.watch), good: keep(k.good) };
}

export function findingsOf(s: Summary, f: Financials | undefined, lender: boolean, checks?: { flags: Item[]; watch: Item[] }): Findings {
  const pl = plInsights({ annual: f?.yearly?.pl, quarterly: f?.quarterly?.pl, lender });
  const fromPl = (sev: "caution" | "watch") => pl.filter((i) => i.severity === sev).map((i) => ({ key: "pl-" + i.key, title: i.title, text: i.why, to: "financials" }));
  return dedupe({
    flags: [...fromPl("caution"), ...(checks?.flags ?? [])],
    watch: [...fromPl("watch"), ...s.watchouts.map((n) => ({ key: "w-" + n.key, title: n.title, text: n.text, to: "prism" })), ...(checks?.watch ?? [])],
    good: s.strengths.map((n) => ({ key: "s-" + n.key, title: n.title, text: n.text, to: "prism" })),
  });
}

const jump = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

function Col({ kind, tag, icon, items, empty }: { kind: "f" | "w" | "s"; tag: string; icon: string; items: Item[]; empty: string }) {
  return (
    <div className="kf-col">
      <h3><span className={"ins-dot " + kind} aria-hidden="true"><Icon name={icon} /></span>{tag}<span className="kf-n">{items.length}</span></h3>
      {items.length ? items.map((i) => (
        <div className={"ins " + kind} key={i.key}><span className="ins-tag">{i.tag ?? tag}</span><b>{i.title}</b><p>{i.text}</p><a href={"#" + i.to} onClick={jump(i.to)}>See the section ↓</a></div>
      )) : <p className="kf-none">{empty}</p>}
    </div>);
}

export function KeyFindings({ s, f, lender }: { s: Summary; f?: Financials; lender: boolean }) {
  const pr = useProfitReality(s.profile.symbol, lender);
  const checks = useMemo(() => checkItems(earningsIntel(pr, s.profile.sector, s.profile.industry)), [pr, s.profile.sector, s.profile.industry]);
  const k = useMemo(() => findingsOf(s, f, lender, checks), [s, f, lender, checks]);
  const total = k.flags.length + k.watch.length + k.good.length;
  if (!total) return null;
  const counts = `${k.flags.length} red flag${k.flags.length === 1 ? "" : "s"} · ${k.watch.length} to watch · ${k.good.length} positive${k.good.length === 1 ? "" : "s"}`;
  return (
    <section className="block" style={{ "--sc": "var(--gold-deep)" } as React.CSSProperties}>
      <SectionHead id="notes" no="03 · What's going well and what to watch" icon="notes" tier="silver" title="What's going well and what to watch" sub="Plain-language findings from the statements, ratios and price history, in one list." color="--gold-deep" aside={<span className="sh-counts">{counts}</span>} />
      <Gate tier="silver" title="See the full scorecard notes" points={["Red flags, items to watch and strengths together", "Each links to its section", "Updated with every result"]}>
        <div className="kf-g">
          <Col kind="f" tag="Red flag" icon="alert" items={k.flags} empty="No red flags from the profit and loss checks." />
          <Col kind="w" tag="Watch" icon="info" items={k.watch} empty="Nothing to watch right now." />
          <Col kind="s" tag="Strength" icon="check" items={k.good} empty="Nothing stands out yet." />
        </div>
        <p className="faint kf-foot">Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice.</p>
      </Gate>
    </section>
  );
}
