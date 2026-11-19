// Task #132: the "at a glance" row under a fund's header (Mutual Fund Score, 5 years a year, 1 year, expense ratio, fund size, largest fall) and the row of links to
// each section of the page. Every value is one the page already loads (the fund, its facts and its score): nothing new is fetched and nothing is estimated.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { dateIN } from "../lib/format";
import { aumBucket, pctText, scoreReason, tone, type FundDetail, type FundFacts } from "../lib/mf";
import { rankText, scoreText, useFundScore } from "../lib/mfScore";
import { bandOf } from "../lib/mfScore";
import { bandVar } from "../lib/scoreBands";

export const FUND_SECTIONS = [
  ["fd-returns", "Returns"], ["fd-score", "Mutual Fund Score"], ["fd-chart", "NAV chart"], ["fd-facts", "Fund facts"], ["fd-risk", "Risk"],
  ["fd-holdings", "What it invests in"], ["fd-plans", "Other plans"], ["fd-about", "About the data"],
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (iso: string | null | undefined) => { const m = /^(\d{4})-(\d{2})/.exec(iso || ""); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ""; };
/** "₹1,47,064 crore" (as AMFI's figure is written) to 147064. */
export const croreOf = (v: unknown): number | null => { if (typeof v === "number") return v; const m = /([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/i.exec(String(v ?? "")); return m ? Number(m[1].replace(/,/g, "")) : null; };
const factText = (facts: FundFacts | undefined, k: string): { text: string | null; asOf: string | null; why: string | null } => {
  const f = facts?.facts[k];
  if (!f) return { text: null, asOf: null, why: facts ? "Not in the fund facts." : null };
  if ("unavailable" in f) return { text: null, asOf: null, why: f.unavailable };
  return { text: f.value == null ? null : String(f.value), asOf: f.asOf ?? null, why: f.value == null ? "The source gives no value." : null };
};

type Cell = { k: string; label: string; value: React.ReactNode; sub: React.ReactNode; title?: string };

/** The six cells. `facts` may still be loading: a cell then says so instead of showing a blank. */
export function FundGlance({ d, facts, factsLoading }: { d: FundDetail; facts?: FundFacts; factsLoading: boolean }) {
  const q = useFundScore(d.code, "mf", "");
  const s = q.data;
  const r5 = d.returns["5y"], r1 = d.returns["1y"], dd = d.risk.maxDrawdown;
  const plan = d.plan === "Regular" ? "Regular" : "Direct", other = plan === "Direct" ? "Regular" : "Direct";
  const terOwn = factText(facts, plan === "Direct" ? "terDirect" : "terRegular"), terOther = factText(facts, plan === "Direct" ? "terRegular" : "terDirect");
  const aum = factText(facts, "aum"), size = aumBucket(croreOf(aum.text));
  const wait = factsLoading && !facts ? "Loading…" : null;
  const pct = (v: number | null) => (v == null ? "—" : <span className={tone(v)}>{pctText(v)}</span>);
  const cells: Cell[] = [
    { k: "score", label: "Mutual Fund Score",
      value: q.isLoading ? "…" : !s || s.notOffered ? "—" : s.locked ? "Locked" : s.final == null ? "—" : <span style={{ color: bandVar(bandOf(s.final)) }}>{scoreText(s.final)}</span>,
      sub: q.isLoading ? "Loading…" : !s ? "Not available right now" : s.notOffered ? "Not given for this kind of fund" : s.locked ? <>Part of a paid plan · <Link to="/plans">See plans</Link></>
        : s.final == null ? (s.status === "NOT SCORED" ? "Not scored" : "Not rated") + (scoreReason(s.reason) ? `: ${scoreReason(s.reason)}` : "")
        : [s.label, s.rank ? rankText(s.rank, s.family) : null].filter(Boolean).join(" · ") },
    { k: "r5", label: "5 years a year", value: pct(r5.value), sub: r5.value == null ? r5.why || "Not enough history" : `NAV, ${plan} · ${d.option}` },
    { k: "r1", label: "1 year", value: pct(r1.value), sub: r1.value == null ? r1.why || "Not enough history" : "NAV change" },
    { k: "ter", label: "Expense ratio", value: terOwn.text ? terOwn.text.replace(/\s*a year$/, "") : "—",
      sub: wait ?? (terOwn.text ? <>a year, {plan}{terOther.text ? <> · {other} {terOther.text.replace(/\s*a year$/, "")}</> : null}</> : terOwn.why || "Not published") },
    { k: "aum", label: "Fund size", value: aum.text ? aum.text.replace(/\s*crore$/i, " Cr") : "—",
      sub: wait ?? (aum.text ? [size?.label, aum.asOf ? dateIN(aum.asOf) : null].filter(Boolean).join(" · ") : aum.why || "Not published") },
    { k: "dd", label: "Largest fall", value: dd.value == null ? "—" : pct(dd.value),
      sub: dd.value == null ? dd.why || "Not enough history" : dd.peak && dd.trough && dd.value < 0 ? `${monthYear(dd.peak)} to ${monthYear(dd.trough)}` : "No fall from a high on file" },
  ];
  return (
    <section className="fd-glance" aria-label="At a glance">
      {cells.map((c) => <div key={c.k} className="fd-cell"><span className="fd-k">{c.label}</span><b className="fd-v">{c.value}</b><small className="fd-s">{c.sub}</small></div>)}
    </section>
  );
}

/** Links to each section of the page; the one in view is marked. On a phone the row scrolls sideways on its own. */
export function FundSectionNav({ present }: { present: string[] }) {
  const items = FUND_SECTIONS.filter(([id]) => present.includes(id));
  const [on, setOn] = useState<string>(items[0]?.[0] ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = items.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setOn(v.target.id); }, { rootMargin: "-90px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    const top = () => { if (els[0] && els[0].getBoundingClientRect().top > innerHeight * 0.4) setOn(els[0].id); };   // above the first section: the first link
    addEventListener("scroll", top, { passive: true });
    return () => { io.disconnect(); removeEventListener("scroll", top); };
  }, [items.map(([id]) => id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id); if (!el) return;
    e.preventDefault(); setOn(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    try { history.replaceState(history.state, "", `#${id}`); } catch { /* not kept */ }
  };
  return (
    <nav className="fd-nav" aria-label="Sections of this page">
      {items.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={on === id ? "location" : undefined} onClick={(e) => go(e, id)}>{label}</a>)}
    </nav>
  );
}
