// Task #277 (All my investments pack of 20 Nov 2026, change 9; the Equity file §9; live number fixes 7 and 8): Key figures, in plain words. A section under
// the main section of each view (after Step 4 on All together, after Step 1 on Equity, Mutual funds and ETFs) with three cards: what it is about, one full
// sentence with the numbers, a small bar with a legend, what the figure rests on, and a link. Each card is a template filled from the answer; a card with
// nothing to say returns null and the next one moves up (pack code F). Describes; never advises. Styles: styles/mi7.css (mi7-kf*).
import type { ReactNode } from "react";
import { nf } from "../lib/format";
import { KIND_NAME, dateShort, joinWords, pctOf, type AllInvestments, type Company, type Kind, type Tab } from "../lib/myInvest";
import { coLabel, movesAsMuchNifty } from "../lib/mi391";
import { andList } from "../portfolio/shared/words";

export type Seg = { label: string; n: number; color: string; unit?: "%" };
export type KfCard = { /** task #391: the card's plain question (All together) */ q?: string; tone: "info" | "warn" | "good"; k: string; say: ReactNode; bar: { kind: "stack"; segs: Seg[] } | { kind: "bars"; rows: { label: string; v: number; color?: string; txt: string }[]; max: number } | null;
  rest: ReactNode; link: { label: string; go: () => void } } | null;

const C = { sh: "var(--mi-shares)", fu: "var(--mi-funds)", et: "var(--mi-etfs)", hi: "var(--mi7-hi)", mid: "var(--mi7-mid)", lo: "var(--mi7-lo)", none: "var(--mi7-none)", grey: "var(--mi7-none)" };
const SEQ = ["#0e6471", "#2f5a9e", "#7a5c1f", "#a23b72", "#4b8a5f", "#8a6a4f", "#5b6577"];
/** Task #391 (developer file 35, Sections 2, fault 10): a company by its short name ("Bank of Konkan", "Sahyadri Peripherals": made-up names), not its code. */
const name = (c: Company) => coLabel(c);
const tenX = (b: number) => nf(b * 10, 0);

/** How a company is held, in words: "directly and through MID150BEES". */
function howHeld(c: Company): string {
  const via = c.via.length ? andList(c.via) : null;   // task #391: "A, B and C", not "A and B and C"
  if (c.held.length === 1) return c.held[0] === "D" ? "all of it directly" : `all of it through ${via ?? (c.held[0] === "F" ? "your fund" : "your ETF")}`;
  return `${c.held.includes("D") ? "directly and " : ""}through ${via ?? "your funds and ETFs"}`;
}

// ------------------------------------------------------------------------------------------------ All together
function heldMoreWays(d: AllInvestments, go: Go): KfCard {
  const multi = d.companies.filter((c) => c.held.length > 1);
  if (!multi.length) return null;
  const de = multi.filter((c) => c.held.includes("D") && c.held.includes("E") && !c.held.includes("F")).length, fe = multi.filter((c) => !c.held.includes("D") && c.held.includes("F") && c.held.includes("E")).length;
  const df = multi.length - de - fe, onlyD = d.companies.filter((c) => c.held.length === 1 && c.held[0] === "D").length, one = d.companies.length - multi.length - onlyD;
  const ex = multi.slice(0, 3), via = [...new Set(ex.flatMap((c) => c.via))];
  return { q: "How many companies do you hold more than one way?", tone: "info", k: "Held more than one way", say: <><b>{multi.length} {multi.length === 1 ? "company" : "companies"}</b> you hold more than one way.</>,
    bar: { kind: "stack", segs: [{ label: "Direct and through an ETF", n: de, color: C.sh }, { label: "Through your fund and an ETF", n: fe, color: C.fu }, { label: "Direct and through a fund", n: df, color: C.et },
      { label: "Only direct", n: onlyD, color: "var(--mi7-type2)" }, { label: "Through one fund or ETF", n: one, color: C.grey }].filter((s) => s.n > 0) },
    rest: <>{joinWords(ex.map(name))}, for example: you hold {ex.length === 1 ? "it" : "them"} {ex.every((c) => c.held.includes("D")) ? "directly and " : ""}through {via.length ? joinWords(via) : "your funds and ETFs"}.</>,
    link: { label: `Show the ${multi.length}`, go: () => go("held") } };
}
function biggest(d: AllInvestments, go: Go): KfCard {
  const top = [...d.companies].sort((a, b) => b.all - a.all), c = top[0];
  if (!c) return null;
  const five = top.slice(0, 5), sum5 = five.reduce((a, x) => a + x.all, 0);
  return { q: "Which company is the biggest part of everything?", tone: "warn", k: "Biggest single company", say: <><b>{name(c)}: {pctOf(c.all, 1)} of everything</b>, {howHeld(c)}.</>,
    bar: { kind: "bars", rows: five.map((x) => ({ label: name(x), v: x.all, txt: pctOf(x.all, 2) })), max: Math.max(...five.map((x) => x.all)) * 1.1 },
    rest: <>The five largest add up to {pctOf(sum5, 1)}.{d.byValue ? "" : " Each kind counts the same until you add quantities."}</>,
    link: { label: "See every company", go: () => go("mi-every") } };
}
function riskFrom(d: AllInvestments, go: Go): KfCard {
  const r = d.risk, parts = r.parts.filter((p) => p.riskShare != null);
  if (r.beta == null || !parts.length) return null;
  const lead = [...parts].sort((a, b) => (b.riskShare ?? 0) - (a.riskShare ?? 0))[0];
  return { q: "Which kind brings the most market risk?", tone: "good", k: "Where the market risk comes from", say: <><b>{KIND_NAME[lead.kind]}: {pctOf(lead.riskShare, 0)} of the market risk</b>, on {pctOf(lead.money, 0)} of the money.</>,
    bar: { kind: "stack", segs: parts.map((p) => ({ label: KIND_NAME[p.kind], n: p.riskShare ?? 0, color: C[(({ shares: "sh", funds: "fu", etfs: "et" }) as Record<Kind, "sh" | "fu" | "et">)[p.kind]], unit: "%" as const })) },
    rest: <>All together it {movesAsMuchNifty(r.beta)}: about {tenX(r.beta)}% when the index moved 10%.</>,
    link: { label: "See Step 7", go: () => go("mi-risk") } };
}

// ------------------------------------------------------------------------------------------------ Equity
function peers(d: AllInvestments, go: Go): KfCard {
  const p = d.cards.shares.peers, n = d.counts.shares;
  if (!p || !n) return null;
  const lead = p.Leader ?? 0, mid = p["In line"] ?? 0, lag = p.Laggard ?? 0, rest = Math.max(0, n - lead - mid - lag);
  if (!lead && !mid && !lag) return null;
  return { tone: "good", k: "Against their peers", say: <><b>{lead} of your {n} shares {lead === 1 ? "leads" : "lead"} {lead === 1 ? "its" : "their"} peers</b>; {lag} lag.</>,
    bar: { kind: "stack", segs: [{ label: "Leader", n: lead, color: C.hi }, { label: "In line", n: mid, color: C.mid }, { label: "Laggard", n: lag, color: C.lo }, { label: "Not compared", n: rest, color: C.grey }].filter((s) => s.n > 0) },
    rest: "Each share against companies of its own industry and size.", link: { label: "See your shares", go: () => go("mi-eq-list") } };
}
function spread(d: AllInvestments, go: Go): KfCard {
  const n = d.shares.length;
  if (!n) return null;
  const by = new Map<string, number>(); for (const s of d.shares) by.set(s.macro || "Not classified", (by.get(s.macro || "Not classified") ?? 0) + 1);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]), [top, k] = rows[0];
  const sz = new Map<string, number>(); for (const s of d.shares) if (s.size) sz.set(s.size, (sz.get(s.size) ?? 0) + 1);
  const sizes = ["Large", "Mid", "Small", "Micro"].filter((x) => sz.get(x)).map((x) => `${sz.get(x)} ${x.toLowerCase()}`);
  return { tone: "info", k: "How they are spread", say: <><b>{top}: {k} of {n} shares</b>; {rows.length} macro {rows.length === 1 ? "sector" : "sectors"} in all.</>,
    bar: { kind: "stack", segs: rows.map(([l, c], i) => ({ label: l, n: c, color: SEQ[i % SEQ.length] })) },
    rest: <>By count of shares{sizes.length ? `; sizes: ${joinWords(sizes)}` : ""}.</>, link: { label: "See the spread", go: () => go("mi-eq-spread") } };
}
function risky(d: AllInvestments, go: Go): KfCard {
  const x = d.risk.kinds.shares;
  if (!x || x.beta == null) return null;
  return { tone: "warn", k: "How risky", say: <><b>Moves {x.beta.toFixed(2)}×</b>: your shares have moved about {tenX(x.beta)}% when the Nifty 500 moved 10%.</>,
    bar: x.swing != null && x.benchSwing != null ? { kind: "bars", rows: [{ label: "Your shares", v: x.swing, color: C.lo, txt: pctOf(x.swing) }, { label: "Nifty 500", v: x.benchSwing, color: C.grey, txt: pctOf(x.benchSwing) }], max: Math.max(x.swing, x.benchSwing) * 1.1 } : null,
    rest: x.swing != null ? <>They swing {pctOf(x.swing)} in a typical year, against {pctOf(x.benchSwing)} for the Nifty 500 (weekly prices).</> : x.why ?? "No swing figure yet.",
    link: { label: "See the risk", go: () => go("mi-eq-risk") } };
}

// ------------------------------------------------------------------------------------------------ Mutual funds
const LIQUID = /liquid|overnight|money market/i;
function healthy(d: AllInvestments, go: Go): KfCard {
  const h = d.health.funds, f = d.funds;
  if (!h || !f.length) return null;
  if (h.locked) return { tone: "info", k: "How healthy", say: <>The <b>Mutual Fund Score</b> is part of Gold.</>, bar: null, rest: "Each fund's health, 0 to 100, against funds of its own category.", link: { label: "See your funds", go: () => go("mi-mf-list") } };
  if (h.score == null) return null;
  const one = f.length === 1;
  return { tone: h.label === "Strong" || h.label === "Healthy" ? "good" : "warn", k: "How healthy", say: <>{one ? "Your fund scores" : "Your funds score"} <b>{nf(h.score, 0)} of 100: {h.label}</b>{one ? "" : " on average"}.</>,
    bar: { kind: "stack", segs: h.bands.filter((b) => b.count > 0).map((b) => ({ label: b.label, n: b.count, color: b.label === "Strong" || b.label === "Healthy" ? C.hi : b.label === "Average" ? C.mid : C.lo })) },
    rest: one ? <>{f[0].short || f[0].name} is your only fund.</> : h.lowest ? <>The lowest is {h.lowest.name}, {nf(h.lowest.score, 0)}.</> : "", link: { label: "See your funds", go: () => go("mi-mf-list") } };
}
function weakest(d: AllInvestments, go: Go): KfCard {
  const f = d.funds.filter((x) => x.parts), tw = f.reduce((a, x) => a + (x.of || 1), 0);
  if (!f.length || (d.health.funds && d.health.funds.locked)) return null;
  const keys = [...new Set(f.flatMap((x) => Object.keys(x.parts!)))];
  const avg = keys.map((k) => { const have = f.filter((x) => x.parts![k] != null); const w = have.reduce((a, x) => a + (x.of || 1), 0);
    return { k, v: have.length ? have.reduce((a, x) => a + (x.parts![k] as number) * (x.of || 1), 0) / (w || tw) : null }; }).filter((x): x is { k: string; v: number } => x.v != null).sort((a, b) => a.v - b.v);
  if (avg.length < 2) return null;
  const lo = avg[0], word = lo.k.charAt(0).toUpperCase() + lo.k.slice(1);
  return { tone: "info", k: "Its weakest part", say: <><b>{word}: {nf(lo.v, 0)} of 100</b>, the lowest of the {avg.length === 4 ? "four" : avg.length} parts.</>,
    bar: { kind: "bars", rows: avg.map((x) => ({ label: x.k.charAt(0).toUpperCase() + x.k.slice(1), v: x.v, color: x.v >= 62 ? C.hi : x.v >= 45 ? C.mid : C.lo, txt: nf(x.v, 0) })), max: 100 },
    rest: `${f.length === 1 ? "Your fund's" : "Weighted across your funds;"} each part against funds of the same category.`, link: { label: "See your funds", go: () => go("mi-mf-list") } };
}
function ready(d: AllInvestments, go: Go): KfCard {
  if (!d.funds.length) return null;
  const liq = d.funds.filter((x) => LIQUID.test(x.type ?? "") || LIQUID.test(x.name)), share = liq.reduce((a, x) => a + x.of, 0);
  const own = d.madeOf.each.filter((e) => e.kind === "funds").map((e) => e.mix.debt ?? 0), ownAvg = own.length ? own.reduce((a, b) => a + b, 0) / own.length : null;
  if (!liq.length) return { tone: "good", k: "Money kept ready", say: <><b>None in liquid funds</b>: 0% of everything.</>, bar: null,
    rest: <>No liquid, overnight or money market fund.{ownAvg != null ? ` ${d.funds.length === 1 ? "Your fund keeps" : "Your funds keep"} ${pctOf(ownAvg, 0)} in debt and money market of ${d.funds.length === 1 ? "its" : "their"} own.` : ""}</>,
    link: { label: "See what is inside", go: () => go("mi-mf-inside") } };
  return { tone: "info", k: "Money kept ready", say: <><b>{pctOf(share, 1)} of everything</b> in {liq.length === 1 ? "a liquid fund" : `${liq.length} liquid funds`}.</>, bar: null,
    rest: <>{joinWords(liq.map((x) => x.short || x.name))}.</>, link: { label: "See your funds", go: () => go("mi-mf-list") } };
}

// ------------------------------------------------------------------------------------------------ ETFs
function cost(d: AllInvestments, go: Go): KfCard {
  const h = d.health.etfs, e = d.etfs.filter((x) => x.ter != null);
  if (!h || h.ter == null || !e.length) return null;
  const s = [...e].sort((a, b) => (b.ter ?? 0) - (a.ter ?? 0));
  return { tone: "info", k: "What they cost", say: <><b>{pctOf(h.ter, 2)} a year</b> on average{h.costPerLakh != null ? `: about ₹${nf(h.costPerLakh, 0)} on ₹1 lakh` : ""}.</>,
    bar: { kind: "bars", rows: s.map((x) => ({ label: x.symbol, v: x.ter as number, txt: pctOf(x.ter, 2) })), max: Math.max(...s.map((x) => x.ter as number)) * 1.1 },
    rest: s.length > 1 ? `${s[0].symbol} costs the most and ${s.at(-1)!.symbol} the least.` : `${s[0].symbol} is your only ETF with a published cost.`, link: { label: "See your ETFs", go: () => go("mi-etf-list") } };
}
/** Live number fix 7: the label by sign ("Furthest below its value"); under 0.1% there is nothing to say. */
export function furthest(d: AllInvestments, go: Go): KfCard {
  const e = d.etfs.filter((x) => x.premium != null).sort((a, b) => Math.abs(b.premium!) - Math.abs(a.premium!)), x = e[0];
  if (!x || Math.abs(x.premium!) < 0.1) return null;
  const up = x.premium! > 0;
  return { tone: Math.abs(x.premium!) >= 1 ? "warn" : "info", k: up ? "Furthest above its value" : "Furthest below its value",
    say: <><b>{x.symbol} traded {nf(Math.abs(x.premium!), 2)}% {up ? "above" : "below"} its value</b>{x.priceDate ? ` on ${dateShort(x.priceDate).replace(/ \d{4}$/, "")}` : ""}.</>,
    bar: { kind: "bars", rows: e.map((y) => ({ label: y.symbol, v: Math.abs(y.premium!), color: y.premium! < 0 ? C.lo : C.hi, txt: `${y.premium! > 0 ? "+" : y.premium! < 0 ? "−" : ""}${nf(Math.abs(y.premium!), 2)}%` })), max: Math.max(...e.map((y) => Math.abs(y.premium!))) * 1.1 },
    rest: "Price against value compares each ETF's last price with its NAV of the same day.", link: { label: "See your ETFs", go: () => go("mi-etf-list") } };
}
/** What each ETF follows. A label two ETFs share (a kind such as "International", when no index is known) names those ETFs by their own names instead, which
 *  carry the index ("Mirae Asset NYSE FANG+ ETF"): QA of 21 Nov, item 11, read "International, Gold and International". */
export function trackNames(e: { symbol: string; name?: string | null; tracks?: string | null; categoryLabel?: string | null }[]): string[] {
  const lab = e.map((x) => x.tracks ?? x.categoryLabel ?? x.symbol);
  return lab.map((l, i) => (lab.filter((y) => y === l).length > 1 ? e[i].name || e[i].symbol : l));
}
/** Live number fix 8: "Same index twice: None" is not a card; "Each ETF follows a different index" only when no two share one. */
function twice(d: AllInvestments, go: Go): KfCard {
  const rep = d.cards.etfs.repeats ?? [], e = d.etfs;
  if (!e.length) return null;
  if (rep.length) return { tone: "warn", k: "The same index twice", say: <><b>{rep.length === 1 ? `${rep[0].label}: ${andList(rep[0].symbols)}` : `${rep.length} indices followed twice`}</b>.</>, bar: null,
    rest: "Two ETFs on one index hold the same companies in the same weights.", link: { label: "See your ETFs", go: () => go("mi-etf-list") } };
  if (e.length < 2) return null;
  return { tone: "good", k: "No two the same", say: <><b>Each ETF follows a different index</b>.</>, bar: null,
    rest: <>{joinWords(trackNames(e))}.</>, link: { label: "See what is inside", go: () => go("mi-etf-inside") } };
}

// ------------------------------------------------------------------------------------------------ the section
type Go = (where: string) => void;
const ORDER: Record<Tab, ((d: AllInvestments, go: Go) => KfCard)[]> = {
  all: [heldMoreWays, biggest, riskFrom], equity: [peers, spread, risky], mf: [healthy, weakest, ready], etf: [cost, furthest, twice],
};
export const keyFiguresOf = (t: Tab, d: AllInvestments, go: Go) => ORDER[t].map((f) => f(d, go)).filter((x): x is NonNullable<KfCard> => x != null).slice(0, 3);
const SUB: Record<Tab, (d: AllInvestments) => string> = {
  all: () => "What everything adds up to, from the steps that follow.",
  equity: (d) => `What your ${d.counts.shares} ${d.counts.shares === 1 ? "share adds" : "shares add"} up to, from the steps around this one.`,
  mf: (d) => `What your ${d.counts.funds === 1 ? "fund adds" : `${d.counts.funds} funds add`} up to, from the steps around this one.`,
  etf: (d) => `What your ${d.counts.etfs} ${d.counts.etfs === 1 ? "ETF adds" : "ETFs add"} up to, from the steps around this one.`,
};

function Bar({ bar }: { bar: NonNullable<KfCard>["bar"] }) {
  if (!bar) return null;
  if (bar.kind === "stack") { const tot = bar.segs.reduce((a, s) => a + s.n, 0) || 1;
    return <div className="mi7-kfbar"><span className="mi7-kfstk" role="img" aria-label={bar.segs.map((s) => `${s.label} ${nf(s.n, s.n % 1 ? 1 : 0)}${s.unit ?? ""}`).join(", ")}>{bar.segs.map((s) => <i key={s.label} style={{ flex: Math.max(s.n / tot, 0.02), background: s.color }} />)}</span>
      <ul className="mi7-kfkey">{bar.segs.map((s) => <li key={s.label}><i style={{ background: s.color }} aria-hidden="true" />{s.label} <b>{nf(s.n, s.n % 1 ? 1 : 0)}{s.unit ?? ""}</b></li>)}</ul></div>; }
  return <ul className="mi7-kfbars" aria-label="Figures">{bar.rows.map((r) => <li key={r.label}><span>{r.label}</span><span className="mi7-kftrack"><i style={{ width: `${Math.max(2, (r.v / (bar.max || 1)) * 100)}%`, background: r.color ?? "var(--mi7-type2)" }} /></span><b>{r.txt}</b></li>)}</ul>;
}

export function KeyFiguresSection({ d, view, go }: { d: AllInvestments; view: Tab; go: Go }) {
  const cards = keyFiguresOf(view, d, go);
  if (!cards.length) return null;
  return (
    <section className="card mi7-kf" id="mi-kf" aria-labelledby="mi-kf-h">
      <div className="mi7-kfh"><h2 id="mi-kf-h">Key figures</h2><p>{SUB[view](d)}</p></div>
      <div className={"mi7-kfrow n" + cards.length}>{cards.map((c, i) => (
        <article key={c.k} className={"mi7-kfc t-" + c.tone}>
          {/* task #391 (developer file 35, Sections 3): on All together each card opens with one plain, numbered question; the bold answer stays */}
          {c.q ? <p className="mi391-kq"><span className="mi391-kn" aria-hidden="true">{i + 1}</span><span>{c.q}</span></p> : <p className="mi7-k">{c.k}</p>}
          <p className="mi7-kfsay">{c.say}</p>
          <Bar bar={c.bar} />
          <p className="mi7-kfrest">{c.rest}</p>
          <button type="button" className="mi7-lnk" onClick={c.link.go}>{c.link.label} →</button>
        </article>))}</div>
    </section>);
}
