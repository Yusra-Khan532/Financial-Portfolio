// All my investments, tab 1 "All together" (task #137, README "Tab 1"; task #391, developer file 35 of 24/25 Nov): seven numbered stops: 1 where your money
// sits with Key figures, 2 what it is made of, 3 sectors and company sizes, 4 every company counted once, 5 what changed, 6 how healthy it is, 7 how risky
// it is; one stop at a time (MiStep) unless All sections is on. Each section's things to know open from a pill at its heading. Every figure comes from the server; the words here only describe
// them. Without quantities every split says each kind counts the same and that it is not the member's money, and no ₹ value appears. Descriptive only.
import { useState } from "react";
import { Link } from "react-router";
import { HScroll } from "../components/HScroll";
import { nf } from "../lib/format";
import { KIND_LOWER, KIND_MARK, KIND_NAME, KIND_TAB, SCORE_NAME, betaTxt, betaWindowTxt, chg, joinWords, kindsHeld, lower, pctOf, rupees, splitLine, type AllInvestments, type Company, type Kind, type KindMoney, type Tab } from "../lib/myInvest";
import { MarketFall } from "../portfolio/pack/MarketFall";
import "../portfolio/pack/market-fall.css";
import "../styles/sectors-pack.css";   // task #235: the fall picture's section heading and its ⓘ
import { BandStrip, ScoreWord, SecHead, ShowAll, Stack, type KnowNote } from "./parts";
import { KeyFiguresSection } from "./KeyFigures277";
import { InvestChanges } from "./Changes277";
import { FilterRow, HELD, NO_FILTER, countFilters, filterCompanies, type EveryFilter } from "./EveryFilters";
import { MI_STEPS, coLabel, movesAsMuchNifty, riskSays, riskWord, sectorsCaption, swingWindows } from "../lib/mi391";
import { holdingName, holdingShort } from "../lib/holdingName";
import { MiStep } from "./Steps391";
import { I } from "./parts";
import "../portfolio/pack/eq385.css";   // task #391: the things-to-know pop-up's quiet card list (scoped .eq; the pop-up carries it)

/** The seven stops of All together, as the section bar and the All sections menu list them (task #391: Key figures inside stop 1, What changed stop 5). */
export const ALL_SECTIONS = MI_STEPS.map((s) => ({ id: s.id, label: s.label }));
const TOP = 10;
/** Task #137's four "Show" choices, kept for the summary counts and old links; task #277 (change 18) filters Step 4 with the row in EveryFilters. */
type Filter = "all" | "twice" | "through" | "direct";
export const filterRows = (rows: Company[], f: Filter) =>
  f === "twice" ? rows.filter((r) => r.held.length > 1) : f === "through" ? rows.filter((r) => r.direct === 0) : f === "direct" ? rows.filter((r) => r.direct > 0 && r.held.length === 1) : rows;
const MIX_CLS: Record<string, string> = { indian: "m-in", abroad: "m-ab", gold: "m-au", debt: "m-dc", other: "m-ot", notLoaded: "m-nl" };

type MoneyAll = Record<Kind | "all", KindMoney> | null;
/** `go`: opens the stop that holds a section and goes to it (MyInvestments openSec). */
export function AllTogether({ d, money, toTab, openQty, go }: { d: AllInvestments; money?: MoneyAll; toTab: (t: Tab) => void; openQty: () => void; go: (id: string) => void }) {
  const [filter, setFilter] = useState<EveryFilter>(NO_FILTER);
  const kinds = kindsHeld(d);
  return (
    <>
      {/* task #391 (Update 25 Nov, row 1): Key figures sit in stop 1, right after Where your money sits */}
      <MiStep id="mi-money" title="Where your money sits">
        <Money d={d} money={money ?? null} kinds={kinds} toTab={toTab} openQty={openQty} />
        <KeyFiguresSection d={d} view="all" go={(w) => { if (w === "held") { setFilter({ ...NO_FILTER, held: [HELD[0]] }); go("mi-every"); } else go(w); }} />
      </MiStep>
      <MiStep id="mi-made" title="What it is made of"><MadeOf d={d} /></MiStep>
      <MiStep id="mi-sectors" title="Sectors and company sizes"><Sectors d={d} /></MiStep>
      <MiStep id="mi-every" title="Every company you own"><Every d={d} filter={filter} setFilter={setFilter} /></MiStep>
      <MiStep id="what-changed" title="What changed at the companies you own"><InvestChanges d={d} /></MiStep>
      <MiStep id="mi-health" title="How healthy it is"><HealthStep d={d} /></MiStep>
      <MiStep id="mi-risk" title="How risky it is"><RiskStep d={d} money={money ?? null} /></MiStep>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ step 1
function Money({ d, money, kinds, toTab, openQty }: { d: AllInvestments; money: MoneyAll; kinds: Kind[]; toTab: (t: Tab) => void; openQty: () => void }) {
  const inv = (m: KindMoney | undefined) => (m && m.full ? <>{rupees(m.invested)}{m.full < m.n ? <small className="mi-sub">{m.full} of {m.n} with a buy price</small> : null}
    {/* task #391 (fault 2, with PR B): a fund priced for some of its lots counts those lots only */}
    {m.part ? <small className="mi-sub">{m.part} by {m.part === 1 ? "its" : "their"} lots with a buy price</small> : null}</> : "—");
  const gl = (m: KindMoney | undefined) => (m && m.full ? <><b className={tone(m.gain)}>{m.gain >= 0 ? "+" : "−"}{rupees(Math.abs(m.gain))}</b><small className={"mi-sub " + tone(m.gain)}>{chg((m.gain / m.invested) * 100)}</small></> : "—");
  const val = (k: Kind) => (d.byValue ? rupees(d.cards[k].value ?? 0) : null);
  return (
    <section className="card mi-step">
      <SecHead id="mi-money" n={1} title="Where your money sits" line={splitLine(d)} info={["How everything splits between shares, mutual funds and ETFs.", "With quantities, each kind's share is its value over the total; without them each kind counts the same."]} />
      <Stack big label="Share of everything" segs={kinds.map((k) => ({ key: k, label: KIND_NAME[k], v: d.cards[k].share, cls: "k-" + k }))} keyed={false} />
      <HScroll label="Where your money sits">
        <table className="mi-tb">
          <thead><tr><th scope="col">Kind</th><th scope="col" className="r">Holdings</th><th scope="col" className="r">Invested</th><th scope="col" className="r">Value now</th><th scope="col" className="r">Gain / loss</th><th scope="col" className="r">Share of everything</th><th scope="col" className="r">1 year</th><th scope="col" className="r">Beta vs Nifty 500</th><th scope="col">Largest holding</th><th scope="col" aria-label="Open its tab" /></tr></thead>
          <tbody>{kinds.map((k) => { const c = d.cards[k]; return (
            <tr key={k}><th scope="row"><i className={"mi-dot k-" + k} aria-hidden="true" />{KIND_NAME[k]}</th><td className="r">{c.count}</td><td className="r">{inv(money?.[k])}</td>
              <td className="r">{d.byValue ? val(k) : <button type="button" className="mi-link" onClick={openQty}>Add quantities</button>}</td><td className="r">{gl(money?.[k])}</td>
              <td className="r"><b>{pctOf(c.share)}</b></td><td className={"r " + tone(c.chg1y)}>{chg(c.chg1y)}</td><td className="r">{betaTxt(c.beta)}</td>
              <td>{c.firstIs === "largest" ? largestName(d, c.first[0]) : <span className="mi-muted">Needs quantities</span>}</td>
              <td><button type="button" className="mi-link" onClick={() => toTab(KIND_TAB[k])}>Open tab →</button></td></tr>); })}</tbody>
          <tfoot><tr><th scope="row">All together</th><td className="r">{kinds.reduce((a, k) => a + d.counts[k], 0)}</td><td className="r">{inv(money?.all)}</td><td className="r">{d.byValue && d.total != null ? <b>{rupees(d.total)}</b> : "—"}</td><td className="r">{gl(money?.all)}</td><td className="r">100%</td>
            <td className={"r " + tone(d.chg1y)}>{chg(d.chg1y)}</td><td className="r">{betaTxt(d.risk.beta)}</td><td colSpan={2} className="mi-muted">1 year: weighted, on what you hold now; holdings with under a year of prices are left out.</td></tr></tfoot>
        </table>
      </HScroll>
      {d.byValue && money && money.all.missing.length > 0 && <p className="x-miss" role="status"><b>{money.all.full} of {money.all.n}</b> holdings have a quantity and a buy price. Add the buy price for {money.all.missing.slice(0, 3).map((x) => { const s = d.shares.find((y) => y.symbol === x); return s ? coLabel(s) : x; }).join(", ")}{money.all.missing.length > 3 ? ` and ${money.all.missing.length - 3} more` : ""}{money.all.missing.length > 1 ? " on their portfolio pages to count them" : " on its portfolio page to count it"} in Invested and Gain.</p>}
      {!d.byValue && <div className="mi-dashed"><p><b>Add quantities to see your money.</b> Still missing for your {joinWords(d.missing.map((k) => KIND_LOWER[k]))}. Until then each kind counts the same and nothing here is in rupees.</p><button type="button" className="btn primary" onClick={openQty}>Add quantities</button></div>}
    </section>
  );
}
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "mi-up" : v < 0 ? "mi-down" : "");
/** Task #391 (fault 10, X14): the largest holding by its short name ("Sahyadri Peripherals Ltd" → "Sahyadri Peripherals", a made-up name); a fund by its own name. */
function largestName(d: AllInvestments, f: AllInvestments["cards"]["shares"]["first"][number] | undefined): string {
  if (!f) return "—";
  if (!f.symbol) return f.name;
  const sh = d.shares.find((s) => s.symbol === f.symbol), co = d.companies.find((c) => c.symbol === f.symbol);
  return coLabel({ symbol: f.symbol, name: sh?.name ?? co?.name ?? (f.name !== f.symbol ? f.name : null) });
}

// ------------------------------------------------------------------------------------------------ step 2
function MadeOf({ d }: { d: AllInvestments }) {
  const m = d.madeOf, rows = m.rows, nl = rows.find((x) => x.key === "notLoaded")?.all ?? 0;
  const out = rows.filter((x) => !["indian", "notLoaded"].includes(x.key) && x.all > 0);
  const notes: KnowNote[] = [
    { kind: "insight", title: `${pctOf(m.outsideIndianShares)} sits outside Indian shares`, text: out.length ? `${joinWords(out.map((x) => `${lower(x.label)} ${pctOf(x.all)}`))}. ${d.counts.shares ? "Your own shares are all Indian; the rest comes through funds and ETFs." : "It comes through your funds and ETFs."}` : "Everything looked through is in Indian shares." },
    m.notLoaded.length ? { kind: "watch", title: `${pctOf(nl)} is not looked through yet`, text: `No monthly portfolio file is loaded yet for ${joinWords(m.notLoaded.map((x) => x.name))}. That part counts in "File not loaded yet" until the file arrives.` }
      : { kind: "good", title: "Every fund and ETF is looked through", text: `Each one's latest monthly file is loaded${m.byType.length ? `; ${joinWords(m.byType.map((x) => x.name))} ${m.byType.length === 1 ? "is" : "are"} counted by ${m.byType.length === 1 ? "its" : "their"} type (gold, silver, debt or abroad), which fixes what ${m.byType.length === 1 ? "it holds" : "they hold"}` : ""}.` },
  ];
  return (
    <section className="card mi-step">
      <SecHead id="mi-made" n={2} title="What it is made of" line={<>Each fund's and ETF's latest file, added to your shares. {splitLine(d)}</>} info={["Where everything sits once your funds and ETFs are looked through: Indian shares, shares abroad, gold and silver, debt and cash.", "Read across: where each kind's part sits. The last column adds them up."]} know={{ scope: "made", items: notes }} />
      <Stack big label="What it is made of" segs={rows.map((x) => ({ key: x.key, label: x.label, v: x.all, cls: MIX_CLS[x.key] }))} keyed={false} />
      <HScroll label="What it is made of">
        <table className="mi-tb">
          <thead><tr><th scope="col">Asset</th><th scope="col" className="r">From shares</th><th scope="col" className="r">From mutual funds</th><th scope="col" className="r">From ETFs</th><th scope="col" className="r">All together</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.key}><th scope="row"><i className={"mi-dot " + MIX_CLS[x.key]} aria-hidden="true" />{x.label}</th>{(["shares", "funds", "etfs"] as const).map((k) => <td key={k} className="r">{x[k] ? pctOf(x[k]) : "—"}</td>)}<td className="r"><b>{pctOf(x.all)}</b></td></tr>)}</tbody>
        </table>
      </HScroll>
      {m.each.length > 0 && <details className="mi-dd"><summary>How each fund and ETF splits<span className="mi-chev" aria-hidden="true" /></summary>
        <ul className="mi-each">{m.each.map((x) => <li key={x.kind + x.name}><span className="mi-each-n"><b>{x.name}</b><small>{x.kind === "funds" ? "Mutual fund" : "ETF"} · {x.how === "file" ? `file of ${x.asOf ?? "—"}` : x.how === "type" ? "by its type" : "file not loaded yet"}</small></span>
          <Stack label={x.name} keyed={false} segs={rows.map((r) => ({ key: r.key, label: r.label, v: x.mix[r.key] ?? 0, cls: MIX_CLS[r.key] }))} /></li>)}</ul></details>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ step 3
const SRC: [keyof Pick<Company, "direct" | "funds" | "etfs">, string, string][] = [["direct", "Your shares", "k-shares"], ["funds", "Through mutual funds", "k-funds"], ["etfs", "Through ETFs", "k-etfs"]];
function Sectors({ d }: { d: AllInvestments }) {
  const [all, setAll] = useState(false);
  const named = d.sectors.filter((s) => s.named), rest = d.sectors.filter((s) => !s.named);
  const shown = all ? d.sectors : named.slice(0, 8), max = Math.max(1, ...d.sectors.map((s) => s.all));
  const first = named[0], brought = named.filter((s) => s.direct === 0 && s.funds + s.etfs > 0).slice(0, 3);
  const nl = d.madeOf.notLoaded;
  const notes: KnowNote[] = [
    ...(first ? [{ kind: "insight" as const, title: `${first.sector} is ${pctOf(first.all)} of everything`, text: `${pctOf(first.direct)} from your shares, ${pctOf(first.funds)} through funds and ${pctOf(first.etfs)} through ETFs. It is the largest of the ${named.length} macro sectors you hold.` }] : []),
    { kind: brought.length ? "insight" : "good", title: brought.length ? `Funds and ETFs bring ${joinWords(brought.map((s) => s.sector))}` : "Funds and ETFs add no new macro sector", text: brought.length ? `None of your own shares sits in ${brought.length === 1 ? "this macro sector" : "these macro sectors"}; ${joinWords(brought.map((s) => `${s.sector} ${pctOf(s.all)}`))} comes through your funds and ETFs.` : "Every macro sector inside your funds and ETFs is one your own shares are in too." },
  ];
  return (
    <section className="card mi-step">
      <SecHead id="mi-sectors" n={3} title="Sectors and company sizes, counted through everything" line={<>Only the shares part: {pctOf(d.madeOf.rows.filter((r) => r.key === "indian" || r.key === "abroad").reduce((a, r) => a + r.all, 0))} of everything. Each bar shows where that exposure comes from.</>}
        info={["NSE's 12 macro sectors and company sizes across every company you own, directly and inside your funds and ETFs.", "Each bar's colours show how much comes from your own shares, through funds and through ETFs, as % of everything."]} know={{ scope: "sectors", items: notes }} />
      <div className="mi-two">
        <div>
          {/* task #391 (fault 6): the caption counts what "Show all" counts ("12 macro sectors and shares listed abroad") */}
          <p className="mi-cap">{sectorsCaption(named.length, d.sectors.length)}</p>
          <ul className="mi-hbars">{shown.map((s) => <li key={s.sector}><span className="mi-hb-l">{s.sector}</span><span className="mi-hb-b">{SRC.map(([k, w, c]) => s[k] > 0 ? <i key={k} className={c} style={{ width: `${(s[k] / max) * 100}%` }} title={`${w}: ${pctOf(s[k], 2)}`} /> : null)}</span><b>{pctOf(s.all)}</b></li>)}</ul>
          {(named.length > 8 || rest.length > 0) && <button type="button" className="mi-more" onClick={() => setAll(!all)}>{all ? "Show the top 8" : `Show all ${d.sectors.length}`}</button>}
        </div>
        <div>
          <p className="mi-cap">Company sizes</p>
          <ul className="mi-hbars">{d.sizes.map((s) => <li key={s.size}><span className="mi-hb-l">{s.size}</span><span className="mi-hb-b">{SRC.map(([k, w, c]) => s[k] > 0 ? <i key={k} className={c} style={{ width: `${(s[k] / Math.max(1, ...d.sizes.map((z) => z.all))) * 100}%` }} title={`${w}: ${pctOf(s[k], 2)}`} /> : null)}</span><b>{pctOf(s.all)}</b></li>)}</ul>
          <p className="mi-small">FinLit's fixed sizes: large above ₹75,000 Cr, mid ₹25,000–75,000 Cr, small ₹10,000–25,000 Cr, micro below ₹10,000 Cr of market value.</p>
        </div>
      </div>
      <ul className="mi-key">{SRC.map(([, w, c]) => <li key={c}><i className={c} aria-hidden="true" />{w}</li>)}<li className="mi-muted">% of everything you hold</li></ul>
      {nl.length > 0 && <p className="mi-small">Not counted until their files load: {joinWords(nl.map((x) => x.name))}.</p>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ step 4
function Every({ d, filter, setFilter }: { d: AllInvestments; filter: EveryFilter; setFilter: (f: EveryFilter) => void }) {
  const [all, setAll] = useState(false);
  const rows = filterCompanies(d.companies, filter), filtered = countFilters(filter) > 0, shown = all || filtered ? rows : rows.slice(0, TOP);
  const set = (f: EveryFilter) => { setFilter(f); setAll(false); window.setTimeout(() => document.getElementById("mi-every-t")?.scrollIntoView?.({ block: "nearest" }), 30); };
  const max = Math.max(0.01, ...d.companies.map((c) => c.all));
  const model = SCORE_NAME, scored = d.plan === "gold";
  return (
    <section className="card mi-step">
      <SecHead id="mi-every" n={4} title="Every company you own, counted once" line={<>{d.filters.all} companies: your {d.counts.shares} shares and every equity line of each fund's and ETF's file. The share is of everything you have. {d.byValue ? "" : "Each kind counts the same until you add quantities."}</>}
        info={["Every company you own, once, with what you hold directly, through funds and through ETFs added up.", "All together is your real share of the company; Held shows the ways: D direct, F through a fund, E through an ETF."]} />
      {/* task #277 (change 18): one row of filters across every company, which stays up while the table is scrolled; task #391 (Update 25 Nov, row 3):
          it stops just under the section bar, which stays, so the row no longer repeats the bar's views and sections */}
      <FilterRow rows={d.companies} f={filter} set={set} plan={d.plan === "gold" ? "gold" : "silver"} />
      <div id="mi-every-t" className="mi7-anchor" />
      <HScroll label="Every company you own" className="mi-freeze">
        <table className="mi-tb mi-co">
          <thead><tr><th scope="col">Company</th><th scope="col">All together</th><th scope="col">Held</th><th scope="col" className="r">Direct</th><th scope="col" className="r">Through funds</th><th scope="col" className="r">Through ETFs</th><th scope="col">Size</th>{scored && <th scope="col">{model}</th>}<th scope="col">Against peers</th></tr></thead>
          <tbody>{!shown.length && <tr><td colSpan={scored ? 9 : 8} className="mi7-none">No company matches these filters. <button type="button" className="mi7-lnk" onClick={() => set(NO_FILTER)}>Clear filters</button></td></tr>}{shown.map((c) => (
            <tr key={(c.symbol ?? "") + c.name}>
              {/* task #391 (Sections 1, fault 10): the company's name first, its share code under it */}
              <th scope="row">{c.symbol ? <Link to={`/stocks/${encodeURIComponent(c.symbol)}`}><b title={holdingName(c.name) || c.symbol}>{coLabel(c)}</b></Link> : <b title={holdingName(c.name)}>{coLabel(c)}</b>}<small>{c.symbol && coLabel(c) !== c.symbol ? `${c.symbol} · ` : ""}{c.macro}</small>{c.via.length > 0 && <small className="mi-via">{c.via.join(" · ")}</small>}</th>
              <td className="mi-allc"><span className="mi-mini"><i style={{ width: `${(c.all / max) * 100}%` }} /></span><b>{pctOf(c.all, 2)}</b></td>
              <td><span className="mi-held">{(["D", "F", "E"] as const).map((m) => <i key={m} aria-hidden={c.held.includes(m) ? undefined : true} className={c.held.includes(m) ? "on m" + m : ""} title={{ D: "Direct", F: "Through a fund", E: "Through an ETF" }[m]}>{m}</i>)}</span></td>
              <td className="r">{c.direct ? pctOf(c.direct, 2) : "—"}</td><td className="r">{c.funds ? pctOf(c.funds, 2) : "—"}</td><td className="r">{c.etfs ? pctOf(c.etfs, 2) : "—"}</td>
              <td>{c.abroad ? <span className="mi-muted">Listed abroad</span> : c.size ?? <span className="mi-muted">Not sized</span>}</td>
              {scored && <td>{c.abroad ? <span className="mi-muted">Not rated: listed abroad</span> : <ScoreWord v={c.score} label={c.label} />}</td>}
              <td><span className={"mi-peer p-" + c.peer.replace(/\s/g, "").toLowerCase()}>{c.peer}</span></td>
            </tr>))}</tbody>
        </table>
      </HScroll>
      {!filtered && <ShowAll n={rows.length} shown={shown.length} noun="companies" onClick={() => setAll(true)} />}
      <p className="mi-small">Holdings inside a fund or ETF can have changed since its fund house published the file{d.sources.filesTo ? ` (${d.sources.filesFrom === d.sources.filesTo ? d.sources.filesTo : `${d.sources.filesFrom} to ${d.sources.filesTo}`})` : ""}.</p>
    </section>
  );
}

const NUM_WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
/** Task #277 (live number fix 9): each name with its own score, and the company's name for a BSE-only code: "Three shares read Weak: GLENMARK 44, APOLLO 45
 *  and ASM Technologies 47" (it read "GLENMARK, APOLLO and 526433, 44, 45 and 47"); up to three, then "and N more". */
export function watchTitle(n: number, word: string, rows: { symbol: string; name?: string | null; score: number | null }[]) {
  const head = `${NUM_WORD[n] ?? n} ${n === 1 ? "share reads" : "shares read"} ${word}`;
  if (!rows.length) return head;
  // task #391 (Sections 2): names, not codes ("Bank of Konkan 44", a made-up name); a code without a name stays a code
  const disp = (r: { symbol: string; name?: string | null }) => (r.name && r.name !== r.symbol ? holdingShort(r.name, r.symbol) : r.symbol);
  const shown = rows.slice(0, 3).map((r) => (r.score != null ? `${disp(r)} ${Math.round(r.score)}` : disp(r))), more = rows.length - shown.length;
  const list = more ? `${shown.join(", ")} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0];
  return `${head}: ${list}`;
}

// ------------------------------------------------------------------------------------------------ step 5
function HealthStep({ d }: { d: AllInvestments }) {
  const h = d.health, model = SCORE_NAME;
  const LOW = h.shares ? h.shares.bands.map((b) => b.label).filter((l) => !["Strong", "Healthy", "Average"].includes(l)) : [];
  const weakRows = h.shares ? d.shares.filter((r) => r.label && LOW.includes(r.label)).sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || a.symbol.localeCompare(b.symbol)) : [];
  const weak = h.shares ? h.shares.bands.filter((b) => LOW.includes(b.label)).reduce((a, b) => a + b.count, 0) : 0;
  const weakShare = h.shares ? h.shares.bands.filter((b) => LOW.includes(b.label)).reduce((a, b) => a + b.share, 0) : 0;
  const notes: KnowNote[] = [];
  const lowWord = [...new Set(weakRows.map((r) => r.label!))].join(" or ") || LOW.join(" or ");
  if (h.shares) notes.push({ kind: weak ? "watch" : "good", title: weak ? watchTitle(weak, lowWord, weakRows) : `No share reads ${LOW.join(" or ") || "Weak or Poor"}`,
    text: `${model} reads each company's own filings and prices. ${d.byValue ? "By value" : "By count"}, ${weak ? `${pctOf(weakShare)} of your shares ${weak === 1 ? "reads" : "read"} ${lowWord}; ` : ""}${pctOf(h.shares.topTwoShare)} ${weak ? "sit" : "of your shares sit"} in its top two bands.` });
  if (h.funds && !h.funds.locked) notes.push({ kind: "insight", title: h.funds.lowest ? `${h.funds.lowest.name} is the lowest Mutual Fund Score, ${nf(h.funds.lowest.score, 0)}` : "No fund has a Mutual Fund Score yet", text: "Mutual Fund Score reads each fund's performance, risk, cost and quality against its own category." });
  if (h.etfs && h.etfs.costPerLakh != null) notes.push({ kind: "good", title: `ETFs cost about ₹${nf(h.etfs.costPerLakh, 0)} a year on ₹1 lakh`, text: `The weighted yearly cost is ${pctOf(h.etfs.ter, 2)}.${h.etfs.widestGap ? ` The widest gap between price and value is ${h.etfs.widestGap.symbol}, ${chg(h.etfs.widestGap.premium, 2)}.` : ""}` });
  return (
    <section className="card mi-step">
      <SecHead id="mi-health" n={6} title="How healthy it is" line={`Each kind is read with its own measure: ${h.shares ? `shares with ${model}` : `shares with ${model} (see plans)`}, funds with Mutual Fund Score, ETFs by cost and price against value.`} info={["How each kind reads on its own measure; there is no single score for everything.", "Compare each card with its own bands only: a share's score and a fund's Mutual Fund Score are not the same scale."]} know={{ scope: "health", items: notes }} />
      <div className="mi-three">
        {h.shares && <article className="mi-hc"><p className="mi-cap">Shares · {model}</p><p className="mi-hv"><ScoreWord v={h.shares.score} label={h.shares.label} /></p>
          <BandStrip label={`Shares by ${model}`} bands={h.shares.bands} notRated={h.shares.notRated} />
          <p className="mi-small">{h.shares.bands.filter((b) => b.count).map((b) => `${b.count} ${b.label.toLowerCase()}`).join(" · ")}{h.shares.notRated.count ? ` · ${h.shares.notRated.count} not rated` : ""}. {d.byValue ? "Weighted by value" : "Each counts the same"}: {pctOf(h.shares.topTwoShare)} in the top two bands.</p></article>}
        {h.funds && <article className="mi-hc"><p className="mi-cap">Funds · Mutual Fund Score</p>{h.funds.locked ? <p className="mi-small">Mutual Fund Score is part of the Gold plan. <Link to="/plans">Compare plans</Link></p> : <>
          <p className="mi-hv"><ScoreWord v={h.funds.score} label={d.funds.length === 1 ? d.funds[0].label : h.funds.label} /></p>
          <BandStrip label="Funds by Mutual Fund Score" bands={h.funds.bands} notRated={h.funds.notRated} />
          <p className="mi-small">{h.funds.bands.filter((b) => b.count).map((b) => `${b.count} ${b.label.toLowerCase()}`).join(" · ") || "No fund rated yet"}.{h.funds.lowest ? ` Lowest: ${h.funds.lowest.name}, ${nf(h.funds.lowest.score, 0)}${h.funds.lowest.label ? " · " + h.funds.lowest.label : ""}.` : ""}</p></>}</article>}
        {h.etfs && <article className="mi-hc"><p className="mi-cap">ETFs · cost and price</p><p className="mi-hv"><b>{h.etfs.ter != null ? pctOf(h.etfs.ter, 2) : "—"}</b> <small>a year</small></p>
          <p className="mi-small">{h.etfs.costPerLakh != null ? `About ₹${nf(h.etfs.costPerLakh, 0)} a year on ₹1 lakh.` : "No yearly cost published yet."}{h.etfs.widestGap ? ` Widest price against value: ${h.etfs.widestGap.symbol} ${chg(h.etfs.widestGap.premium, 2)}.` : ""}</p></article>}
      </div>
      {h.underneath && <div className="mi-under"><p className="mi-cap">The companies underneath, by {model} band</p><BandStrip label="The companies underneath" bands={h.underneath.bands} notRated={h.underneath.notRated} />
        <p className="mi-small">Every Indian listed company you own directly or through your funds and ETFs, by its share of everything. {pctOf(h.underneath.topTwoShare)} sits in the top two bands; {pctOf(h.underneath.notRated.share)} is not rated.</p></div>}
    </section>
  );
}
// ------------------------------------------------------------------------------------------------ step 7
/** Task #391 (Sections 5–7, faults 7, 8, 9, 12): the risk range words through one helper (riskWord), "moves N× as much as the Nifty 500", one line under
 *  the table with the full note behind an i, each kind's window in the column header, and the fall picture without its own Hide, with the page's i. */
export const RISK_NOTE_LINE = "Swing and worst fall are each kind’s own figure, as on its portfolio page.";
function RiskStep({ d }: { d: AllInvestments; money?: MoneyAll }) {
  const r = d.risk, max = Math.max(1, ...r.parts.flatMap((p) => [p.money ?? 0, p.riskShare ?? 0]));
  const kinds = kindsHeld(d), band = riskWord(r.band, r.beta, r.bandKey), says = r.bandSays ?? riskSays(r.bandLine, r.band, r.beta, r.bandKey);
  const win = swingWindows(kinds, r.kinds, r.swingWindows?.line);
  const fullNote = `Swing and worst fall are each kind's own figure, as on its portfolio page (shares: weekly prices; funds and ETFs: daily prices)${r.bench ? `; the Nifty 500, daily, swung ${pctOf(r.bench.swing)} a year and fell at most ${pctOf(r.bench.worstFall)} from ${dateRange(r.bench.from, r.bench.to)} (the Equity tab sets your shares beside the Nifty 500 over their own weeks)` : ""}. A figure for everything together needs the three kinds' daily lines, so it is not shown.`;
  const notes: KnowNote[] = [
    { kind: "insight", title: band ? `Together: ${band.toLowerCase()} to the Nifty 500` : "Together: no beta yet", text: r.beta != null ? `It ${movesAsMuchNifty(r.beta)}: in past weeks, when the Nifty 500 moved 1%, everything together tended to move about ${nf(r.beta, 2)}%. ${lead(r)}`.trim() : r.why ?? "Not enough prices for a beta yet." },
    { kind: "watch", title: "Beta is not a floor", text: "Beta describes how things moved with the market in the past. A single company, a fund house or a sector can fall on its own news, whatever the beta says." },
  ];
  return (
    <section className="card mi-step">
      <SecHead id="mi-risk" n={7} title="How risky it is, all together" line="Against the Nifty 500, over the past year." info={["How sensitive everything is to the market: each kind's beta against the Nifty 500, and beta together.", "Beta together = the sum of each kind's share of money × its beta. A kind's share of the market risk = its share × its beta ÷ beta together."]}
        know={{ scope: "risk", items: notes }} />
      <div className="mi-riskhead">
        <article className="mi-rh-dark"><p className="mi-cap">All together · Beta against the Nifty 500</p><p className="mi-rh-v">{betaTxt(r.beta)}{band ? <small> · {band}</small> : null}</p>
          <p>{r.beta != null ? <>Together it {movesAsMuchNifty(r.beta)}.{says ? <> {says.split(". ")[0].replace(/\.$/, "")}.</> : null}</> : r.why}</p></article>
        {kinds.map((k) => { const x = r.kinds[k], p = r.parts.find((q) => q.kind === k), w = riskWord(p?.band, p?.beta ?? x?.beta, p?.bandKey ?? x?.bandKey); return (
          <article key={k} className="mi-rh-k"><p className="mi-cap"><i className={"mi-dot k-" + k} aria-hidden="true" />{KIND_NAME[k]}</p><p className="mi-rh-v">{betaTxt(x?.beta)}</p>
            {w ? <span className="mi-chip">{w}</span> : null}
            <p className="mi-small">{x?.beta != null ? `${betaWindowTxt(x.betaWindow)}. ` : ""}{x?.swing != null ? `Swings ${pctOf(x.swing)} a year` : x?.why ?? "No swing figure yet"}</p></article>); })}
      </div>
      <HScroll label="How risky it is">
        <table className="mi-tb">
          <thead><tr><th scope="col">Kind</th><th scope="col" className="r">Share of money</th><th scope="col" className="r">Beta vs Nifty 500</th><th scope="col">Share of the market risk</th>
            <th scope="col" className="r">Swing a year{win && <small className="mi391-win">{win}</small>}</th><th scope="col" className="r">Worst fall from a high{win && <small className="mi391-win">same windows</small>}</th></tr></thead>
          <tbody>{kinds.map((k) => { const p = r.parts.find((x) => x.kind === k), x = r.kinds[k]; return (
            <tr key={k} className={p?.red ? "hot" : ""}><th scope="row"><i className={"mi-dot k-" + k} aria-hidden="true" />{KIND_NAME[k]}</th><td className="r">{pctOf(p?.money)}</td><td className="r">{betaTxt(x?.beta)}</td>
              <td className="mi-rs">{p?.riskShare != null ? <><span className="mi-rsb"><i className={"r k-" + k} style={{ width: `${(p.riskShare / max) * 100}%` }} /><i className="m" style={{ width: `${((p.money ?? 0) / max) * 100}%` }} /></span><small><b className={p.red ? "mi-down" : ""}>{pctOf(p.riskShare)}</b> of the risk · {pctOf(p.money)} of the money</small></> : <span className="mi-muted">—</span>}</td>
              <td className="r">{x?.swing != null ? pctOf(x.swing) : "—"}</td><td className="r mi-down">{x?.worstFall != null ? pctOf(x.worstFall) : "—"}</td></tr>); })}</tbody>
        </table>
      </HScroll>
      {/* task #391 (fault 9): one line; the full note behind the page's i */}
      <p className="mi-small mi391-rnote">{RISK_NOTE_LINE}<I k="swing and worst fall here" what={fullNote} read="Each row is the kind's own figure from its portfolio page, over the window its column header names. The rows are not added up." /></p>
      {/* task #235 (pack C4, C5): the Equity page's fall picture, weighted by value now, with each kind's share of the money and the size of the fall;
          task #391 (fault 8): no Hide of its own and the page's i; "points", not "pts" */}
      {r.beta != null && <div className="pfx mi-fx"><MarketFall id="mi-fall" what="Nifty 500" idx="Nifty 500" value={d.byValue && d.total ? { now: d.total } : null} noRupees={!d.byValue} unit="points" noHide
        info={<I k="the fall picture" what="A rough size guide from past betas: each part falls about its beta times the Nifty 500's fall." read="Pick the size of the fall above the cards. Real falls are uneven; this is not a forecast." />}
        worst={r.bench?.worstFall != null && r.bench.worstFall < 0 ? { pct: -r.bench.worstFall, line: "the Nifty 500’s worst in 3 years" } : null}
        scenarios={[{ label: "Everything together", beta: r.beta, src: `Each kind's beta against the Nifty 500, weighted by ${d.byValue ? "value now" : "kind, each the same"}: together ${betaTxt(r.beta)}`, parts: true }]}
        market={{ label: "Nifty 500", sub: "the index" }} list={{ label: "Everything", sub: d.byValue ? "by value" : "each kind the same" }}
        parts={r.parts.filter((p) => p.beta != null).map((p) => ({ label: KIND_NAME[p.kind], beta: p.beta as number, sub: `${pctOf(p.money, 0)} of the money` }))} /></div>}
    </section>
  );
}
const lead = (r: AllInvestments["risk"]) => { const p = r.parts.find((x) => x.kind === r.largest); return p && p.riskShare != null ? `${KIND_NAME[p.kind]} carry ${pctOf(p.riskShare, 0)} of the market risk on ${pctOf(p.money, 0)} of the money.` : ""; };
const dateRange = (a: string, b: string) => `${a.slice(0, 7)} to ${b.slice(0, 7)}`;
export { KIND_MARK };
