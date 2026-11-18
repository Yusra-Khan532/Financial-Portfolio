// All my investments, tab 1 "All together" (task #137, README "Tab 1"): Key figures, then six numbered steps: where your money sits, what it is made of,
// sectors and company sizes, every company counted once, how healthy it is, how risky it is. Every figure comes from the server; the words here only describe
// them. Without quantities every split says each kind counts the same and that it is not the member's money, and no ₹ value appears. Descriptive only.
import { useState } from "react";
import { Link } from "react-router";
import { HScroll } from "../components/HScroll";
import { nf } from "../lib/format";
import { KIND_LOWER, KIND_MARK, KIND_NAME, KIND_TAB, MODEL_NAME, betaTxt, chg, joinWords, kindsHeld, lower, pctOf, rupees, splitLine, type AllInvestments, type Company, type Kind, type KindMoney, type Tab } from "../lib/myInvest";
import { MarketFall } from "../portfolio/pack/MarketFall";
import "../portfolio/pack/market-fall.css";
import "../styles/sectors-pack.css";   // task #235: the fall picture's section heading and its ⓘ
import { BandStrip, KeyFigures, Notes, ScoreWord, SecHead, ShowAll, Stack, type Note } from "./parts";

export const ALL_SECTIONS = [
  { id: "mi-money", label: "Your money" }, { id: "mi-made", label: "Made of" }, { id: "mi-sectors", label: "Sectors and sizes" },
  { id: "mi-every", label: "Every company" }, { id: "mi-health", label: "Health" }, { id: "mi-risk", label: "Risk" },
];
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
const TOP = 10;
type Filter = "all" | "twice" | "through" | "direct";
const FILTERS: [Filter, string][] = [["all", "All"], ["twice", "Held more than one way"], ["through", "Only through funds and ETFs"], ["direct", "Only direct"]];
export const filterRows = (rows: Company[], f: Filter) =>
  f === "twice" ? rows.filter((r) => r.held.length > 1) : f === "through" ? rows.filter((r) => r.direct === 0) : f === "direct" ? rows.filter((r) => r.direct > 0 && r.held.length === 1) : rows;
const MIX_CLS: Record<string, string> = { indian: "m-in", abroad: "m-ab", gold: "m-au", debt: "m-dc", other: "m-ot", notLoaded: "m-nl" };

type MoneyAll = Record<Kind | "all", KindMoney> | null;
export function AllTogether({ d, money, toTab, openQty }: { d: AllInvestments; money?: MoneyAll; toTab: (t: Tab) => void; openQty: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const kinds = kindsHeld(d);
  const twice = d.companies.filter((c) => c.held.length > 1), three = twice.filter((c) => c.held.length === 3);
  const top = d.companies[0];
  const r = d.risk, lead = r.parts.find((p) => p.kind === r.largest);
  return (
    <>
      <KeyFigures items={[
        { label: "Held more than one way", value: `${twice.length} ${twice.length === 1 ? "company" : "companies"}`, info: ["Companies you own directly and through a fund or an ETF, or through more than one of them.", "Each is counted once in step 4, with the ways added up."],
          line: twice.length ? <>{three.length ? <>{joinWords(three.slice(0, 3).map((c) => c.symbol ?? c.name))} three ways. </> : null}{joinWords(twice.filter((c) => c.held.length === 2).slice(0, 3).map((c) => c.symbol ?? c.name))}{twice.length - three.length > 0 ? " two ways." : ""}</> : "No company is held more than one way.",
          button: "See which", go: () => { setFilter("twice"); go("mi-every"); } },
        { label: "Biggest single company", value: top ? <>{top.symbol ?? top.name} {pctOf(top.all)}</> : "—", info: ["The company that is the largest part of everything, counting what sits inside your funds and ETFs.", "The line splits it into direct, through funds and through ETFs, and names the next two."],
          line: top ? <>{pctOf(top.direct)} direct, {pctOf(top.funds)} through funds, {pctOf(top.etfs)} through ETFs.{d.companies[1] ? <> Next: {joinWords(d.companies.slice(1, 3).map((c) => `${c.symbol ?? c.name} ${pctOf(c.all)}`))}.</> : null}</> : "Nothing looked through yet.",
          button: "See every company", go: () => { setFilter("all"); go("mi-every"); } },
        { label: "Where the market risk comes from", value: lead && lead.riskShare != null ? <>{KIND_NAME[lead.kind]} · {pctOf(lead.riskShare, 0)}</> : "—", tone: lead?.red ? "red" : "plain",
          info: ["The kind that carries the largest share of the market risk: its share of money × its beta, over beta together.", "Red when that share is more than 10 points above its share of the money."],
          line: lead && r.beta != null ? <>of the market risk, on {pctOf(lead.money, 0)} of the money. Everything together: Beta {betaTxt(r.beta)} against the Nifty 500.</> : r.why ?? "No figure yet.", button: "See risk", go: () => go("mi-risk") },
      ]} />

      <Money d={d} money={money ?? null} kinds={kinds} toTab={toTab} openQty={openQty} />
      <MadeOf d={d} />
      <Sectors d={d} />
      <Every d={d} filter={filter} setFilter={setFilter} />
      <HealthStep d={d} />
      <RiskStep d={d} money={money ?? null} />
    </>
  );
}

// ------------------------------------------------------------------------------------------------ step 1
function Money({ d, money, kinds, toTab, openQty }: { d: AllInvestments; money: MoneyAll; kinds: Kind[]; toTab: (t: Tab) => void; openQty: () => void }) {
  const inv = (m: KindMoney | undefined) => (m && m.full ? <>{rupees(m.invested)}{m.full < m.n ? <small className="mi-sub">{m.full} of {m.n} with a buy price</small> : null}</> : "—");
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
              <td>{c.firstIs === "largest" ? c.first[0]?.name ?? "—" : <span className="mi-muted">Needs quantities</span>}</td>
              <td><button type="button" className="mi-link" onClick={() => toTab(KIND_TAB[k])}>Open tab →</button></td></tr>); })}</tbody>
          <tfoot><tr><th scope="row">All together</th><td className="r">{kinds.reduce((a, k) => a + d.counts[k], 0)}</td><td className="r">{inv(money?.all)}</td><td className="r">{d.byValue && d.total != null ? <b>{rupees(d.total)}</b> : "—"}</td><td className="r">{gl(money?.all)}</td><td className="r">100%</td>
            <td className={"r " + tone(d.chg1y)}>{chg(d.chg1y)}</td><td className="r">{betaTxt(d.risk.beta)}</td><td colSpan={2} className="mi-muted">1 year: weighted, on what you hold now; holdings with under a year of prices are left out.</td></tr></tfoot>
        </table>
      </HScroll>
      {d.byValue && money && money.all.missing.length > 0 && <p className="x-miss" role="status"><b>{money.all.full} of {money.all.n}</b> holdings have a quantity and a buy price. Add the buy price for {money.all.missing.slice(0, 3).join(", ")}{money.all.missing.length > 3 ? ` and ${money.all.missing.length - 3} more` : ""}{money.all.missing.length > 1 ? " on their portfolio pages to count them" : " on its portfolio page to count it"} in Invested and Gain.</p>}
      {!d.byValue && <div className="mi-dashed"><p><b>Add quantities to see your money.</b> Still missing for your {joinWords(d.missing.map((k) => KIND_LOWER[k]))}. Until then each kind counts the same and nothing here is in rupees.</p><button type="button" className="btn primary" onClick={openQty}>Add quantities</button></div>}
    </section>
  );
}
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "mi-up" : v < 0 ? "mi-down" : "");

// ------------------------------------------------------------------------------------------------ step 2
function MadeOf({ d }: { d: AllInvestments }) {
  const m = d.madeOf, rows = m.rows, nl = rows.find((x) => x.key === "notLoaded")?.all ?? 0;
  const out = rows.filter((x) => !["indian", "notLoaded"].includes(x.key) && x.all > 0);
  const notes: Note[] = [
    { kind: "insight", title: `${pctOf(m.outsideIndianShares)} sits outside Indian shares`, text: out.length ? <>{joinWords(out.map((x) => `${lower(x.label)} ${pctOf(x.all)}`))}. {d.counts.shares ? "Your own shares are all Indian; the rest comes through funds and ETFs." : "It comes through your funds and ETFs."}</> : "Everything looked through is in Indian shares." },
    m.notLoaded.length ? { kind: "watch", title: `${pctOf(nl)} is not looked through yet`, text: <>No monthly portfolio file is loaded yet for {joinWords(m.notLoaded.map((x) => x.name))}. That part counts in "File not loaded yet" until the file arrives.</> }
      : { kind: "good", title: "Every fund and ETF is looked through", text: <>Each one's latest monthly file is loaded{m.byType.length ? <>; {joinWords(m.byType.map((x) => x.name))} {m.byType.length === 1 ? "is" : "are"} counted by {m.byType.length === 1 ? "its" : "their"} type (gold, silver, debt or abroad), which fixes what {m.byType.length === 1 ? "it holds" : "they hold"}</> : null}.</> },
  ];
  return (
    <section className="card mi-step">
      <SecHead id="mi-made" n={2} title="What it is made of" line={<>Each fund's and ETF's latest file, added to your shares. {splitLine(d)}</>} info={["Where everything sits once your funds and ETFs are looked through: Indian shares, shares abroad, gold and silver, debt and cash.", "Read across: where each kind's part sits. The last column adds them up."]} />
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
      <Notes scope="made" items={notes} />
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
  const notes: Note[] = [
    ...(first ? [{ kind: "insight" as const, title: `${first.sector} is ${pctOf(first.all)} of everything`, text: <>{pctOf(first.direct)} from your shares, {pctOf(first.funds)} through funds and {pctOf(first.etfs)} through ETFs. It is the largest of the {named.length} macro sectors you hold.</> }] : []),
    { kind: brought.length ? "insight" : "good", title: brought.length ? `Funds and ETFs bring ${joinWords(brought.map((s) => s.sector))}` : "Funds and ETFs add no new macro sector", text: brought.length ? <>None of your own shares sits in {brought.length === 1 ? "this macro sector" : "these macro sectors"}; {joinWords(brought.map((s) => `${s.sector} ${pctOf(s.all)}`))} comes through your funds and ETFs.</> : "Every macro sector inside your funds and ETFs is one your own shares are in too." },
  ];
  return (
    <section className="card mi-step">
      <SecHead id="mi-sectors" n={3} title="Sectors and company sizes, counted through everything" line={<>Only the shares part: {pctOf(d.madeOf.rows.filter((r) => r.key === "indian" || r.key === "abroad").reduce((a, r) => a + r.all, 0))} of everything. Each bar shows where that exposure comes from.</>}
        info={["NSE's 12 macro sectors and company sizes across every company you own, directly and inside your funds and ETFs.", "Each bar's colours show how much comes from your own shares, through funds and through ETFs, as % of everything."]} />
      <div className="mi-two">
        <div>
          <p className="mi-cap">Macro sectors · {named.length}</p>
          <ul className="mi-hbars">{shown.map((s) => <li key={s.sector}><span className="mi-hb-l">{s.sector}</span><span className="mi-hb-b">{SRC.map(([k, w, c]) => s[k] > 0 ? <i key={k} className={c} style={{ width: `${(s[k] / max) * 100}%` }} title={`${w}: ${pctOf(s[k], 2)}`} /> : null)}</span><b>{pctOf(s.all)}</b></li>)}</ul>
          {(named.length > 8 || rest.length > 0) && <button type="button" className="mi-more" onClick={() => setAll(!all)}>{all ? "Show the top 8" : `Show all ${d.sectors.length}`}</button>}
        </div>
        <div>
          <p className="mi-cap">Company sizes</p>
          <ul className="mi-hbars">{d.sizes.map((s) => <li key={s.size}><span className="mi-hb-l">{s.size}</span><span className="mi-hb-b">{SRC.map(([k, w, c]) => s[k] > 0 ? <i key={k} className={c} style={{ width: `${(s[k] / Math.max(1, ...d.sizes.map((z) => z.all))) * 100}%` }} title={`${w}: ${pctOf(s[k], 2)}`} /> : null)}</span><b>{pctOf(s.all)}</b></li>)}</ul>
          <p className="mi-small">FinLit's fixed sizes: large above ₹50,000 Cr, mid ₹10,000–50,000 Cr, small below ₹10,000 Cr of market value.</p>
        </div>
      </div>
      <ul className="mi-key">{SRC.map(([, w, c]) => <li key={c}><i className={c} aria-hidden="true" />{w}</li>)}<li className="mi-muted">% of everything you hold</li></ul>
      {nl.length > 0 && <p className="mi-small">Not counted until their files load: {joinWords(nl.map((x) => x.name))}.</p>}
      <Notes scope="sectors" items={notes} />
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ step 4
function Every({ d, filter, setFilter }: { d: AllInvestments; filter: Filter; setFilter: (f: Filter) => void }) {
  const [all, setAll] = useState(false);
  const rows = filterRows(d.companies, filter), shown = all ? rows : rows.slice(0, TOP);
  const max = Math.max(0.01, ...d.companies.map((c) => c.all));
  const model = MODEL_NAME[d.plan === "gold" ? "prism" : "iq"];
  return (
    <section className="card mi-step">
      <SecHead id="mi-every" n={4} title="Every company you own, counted once" line={<>{d.filters.all} companies: your {d.counts.shares} shares and every equity line of each fund's and ETF's file. The share is of everything you have. {d.byValue ? "" : "Each kind counts the same until you add quantities."}</>}
        info={["Every company you own, once, with what you hold directly, through funds and through ETFs added up.", "All together is your real share of the company; Held shows the ways: D direct, F through a fund, E through an ETF."]} />
      <div className="mi-filters" role="group" aria-label="Show">{FILTERS.map(([k, w]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setAll(false); }}>{w} <b>{d.filters[k]}</b></button>)}</div>
      <HScroll label="Every company you own" className="mi-freeze">
        <table className="mi-tb mi-co">
          <thead><tr><th scope="col">Company</th><th scope="col">All together</th><th scope="col">Held</th><th scope="col" className="r">Direct</th><th scope="col" className="r">Through funds</th><th scope="col" className="r">Through ETFs</th><th scope="col">Size</th><th scope="col">{model}</th><th scope="col">Against peers</th></tr></thead>
          <tbody>{shown.map((c) => (
            <tr key={(c.symbol ?? "") + c.name}>
              <th scope="row">{c.symbol ? <Link to={`/stocks/${encodeURIComponent(c.symbol)}`}><b>{c.symbol}</b></Link> : <b>{c.name}</b>}<small>{c.symbol ? c.name + " · " : ""}{c.macro}</small>{c.via.length > 0 && <small className="mi-via">{c.via.join(" · ")}</small>}</th>
              <td className="mi-allc"><span className="mi-mini"><i style={{ width: `${(c.all / max) * 100}%` }} /></span><b>{pctOf(c.all, 2)}</b></td>
              <td><span className="mi-held">{(["D", "F", "E"] as const).map((m) => <i key={m} aria-hidden={c.held.includes(m) ? undefined : true} className={c.held.includes(m) ? "on m" + m : ""} title={{ D: "Direct", F: "Through a fund", E: "Through an ETF" }[m]}>{m}</i>)}</span></td>
              <td className="r">{c.direct ? pctOf(c.direct, 2) : "—"}</td><td className="r">{c.funds ? pctOf(c.funds, 2) : "—"}</td><td className="r">{c.etfs ? pctOf(c.etfs, 2) : "—"}</td>
              <td>{c.abroad ? <span className="mi-muted">Listed abroad</span> : c.size ?? <span className="mi-muted">Not sized</span>}</td>
              <td>{c.abroad ? <span className="mi-muted">Not rated: listed abroad</span> : <ScoreWord v={c.score} label={c.label} />}</td>
              <td><span className={"mi-peer p-" + c.peer.replace(/\s/g, "").toLowerCase()}>{c.peer}</span></td>
            </tr>))}</tbody>
        </table>
      </HScroll>
      <ShowAll n={rows.length} shown={shown.length} noun="companies" onClick={() => setAll(true)} />
      <p className="mi-small">Holdings inside a fund or ETF can have changed since its fund house published the file{d.sources.filesTo ? ` (${d.sources.filesFrom === d.sources.filesTo ? d.sources.filesTo : `${d.sources.filesFrom} to ${d.sources.filesTo}`})` : ""}.</p>
    </section>
  );
}

const NUM_WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
/** Pack C3: "Two shares read Weak: APOLLO and GLENMARK, both 44"; up to three names, then "and N more". */
export function watchTitle(n: number, word: string, rows: { symbol: string; score: number | null }[]) {
  const head = `${NUM_WORD[n] ?? n} ${n === 1 ? "share reads" : "shares read"} ${word}`;
  if (!rows.length) return head;
  const shown = rows.slice(0, 3), more = rows.length - shown.length, names = shown.map((r) => r.symbol);
  const list = more ? `${names.join(", ")} and ${more} more` : names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  const sc = shown.map((r) => r.score).filter((v): v is number => v != null).map((v) => Math.round(v));
  const scores = more || sc.length !== shown.length ? "" : sc.length === 1 ? `, ${sc[0]}` : sc.every((v) => v === sc[0]) ? `, ${sc.length === 2 ? "both" : "all"} ${sc[0]}` : `, ${sc.slice(0, -1).join(", ")} and ${sc.at(-1)}`;
  return `${head}: ${list}${scores}`;
}

// ------------------------------------------------------------------------------------------------ step 5
function HealthStep({ d }: { d: AllInvestments }) {
  const h = d.health, model = MODEL_NAME[d.plan === "gold" ? "prism" : "iq"];
  const LOW = h.shares ? h.shares.bands.map((b) => b.label).filter((l) => !["Strong", "Healthy", "Average", "Mixed"].includes(l)) : [];
  const weakRows = h.shares ? d.shares.filter((r) => r.label && LOW.includes(r.label)).sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || a.symbol.localeCompare(b.symbol)) : [];
  const weak = h.shares ? h.shares.bands.filter((b) => LOW.includes(b.label)).reduce((a, b) => a + b.count, 0) : 0;
  const weakShare = h.shares ? h.shares.bands.filter((b) => LOW.includes(b.label)).reduce((a, b) => a + b.share, 0) : 0;
  const notes: Note[] = [];
  const lowWord = [...new Set(weakRows.map((r) => r.label!))].join(" or ") || LOW.join(" or ");
  if (h.shares) notes.push({ kind: weak ? "watch" : "good", title: weak ? watchTitle(weak, lowWord, weakRows) : `No share reads ${LOW.join(" or ") || (d.plan === "gold" ? "Weak or Poor" : "Watch")}`,
    text: <>{model} reads each company's own filings and prices. {d.byValue ? "By value" : "By count"}, {weak ? <>{pctOf(weakShare)} of your shares {weak === 1 ? "reads" : "read"} {lowWord}; </> : null}{pctOf(h.shares.topTwoShare)} {weak ? "sit" : "of your shares sit"} in its top two bands.</> });
  if (h.funds && !h.funds.locked) notes.push({ kind: "insight", title: h.funds.lowest ? `${h.funds.lowest.name} is the lowest Mutual Fund Score, ${nf(h.funds.lowest.score, 0)}` : "No fund has a Mutual Fund Score yet", text: "Mutual Fund Score reads each fund's performance, risk, cost and quality against its own category." });
  if (h.etfs && h.etfs.costPerLakh != null) notes.push({ kind: "good", title: `ETFs cost about ₹${nf(h.etfs.costPerLakh, 0)} a year on ₹1 lakh`, text: <>The weighted yearly cost is {pctOf(h.etfs.ter, 2)}.{h.etfs.widestGap ? <> The widest gap between price and value is {h.etfs.widestGap.symbol}, {chg(h.etfs.widestGap.premium, 2)}.</> : null}</> });
  return (
    <section className="card mi-step">
      <SecHead id="mi-health" n={5} title="How healthy it is" line={`Each kind is read with its own measure: shares with ${model}, funds with Mutual Fund Score, ETFs by cost and price against value.`} info={["How each kind reads on its own measure; there is no single score for everything.", "Compare each card with its own bands only: a share's score and a fund's Mutual Fund Score are not the same scale."]} />
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
      <Notes scope="health" items={notes} />
    </section>
  );
}
// ------------------------------------------------------------------------------------------------ step 6
function RiskStep({ d }: { d: AllInvestments; money?: MoneyAll }) {
  const r = d.risk, max = Math.max(1, ...r.parts.flatMap((p) => [p.money ?? 0, p.riskShare ?? 0]));
  const kinds = kindsHeld(d);
  const notes: Note[] = [
    { kind: "insight", title: r.band ? `Together: ${r.band.toLowerCase()} to the Nifty 500` : "Together: no beta yet", text: r.beta != null ? <>Beta {betaTxt(r.beta)}: in past weeks, when the Nifty 500 moved 1%, everything together tended to move about {nf(r.beta, 2)}%. {lead(r)}</> : r.why },
    { kind: "watch", title: "Beta is not a floor", text: "Beta describes how things moved with the market in the past. A single company, a fund house or a sector can fall on its own news, whatever the beta says." },
  ];
  return (
    <section className="card mi-step">
      <SecHead id="mi-risk" n={6} title="How risky it is, all together" line="Against the Nifty 500, from past weekly prices (shares) and daily NAVs and prices (funds, ETFs). It describes the past; it is not a forecast." info={["How sensitive everything is to the market: each kind's beta against the Nifty 500, and beta together.", "Beta together = the sum of each kind's share of money × its beta. A kind's share of the market risk = its share × its beta ÷ beta together."]} />
      <div className="mi-riskhead">
        <article className="mi-rh-dark"><p className="mi-cap">All together · Beta against the Nifty 500</p><p className="mi-rh-v">{betaTxt(r.beta)}{r.band ? <small> · {r.band}</small> : null}</p><p>{r.beta != null ? `Similar moves: when the Nifty 500 moved 1%, this moved about ${nf(r.beta, 2)}%.` : r.why}</p></article>
        {kinds.map((k) => { const x = r.kinds[k]; return (
          <article key={k} className="mi-rh-k"><p className="mi-cap"><i className={"mi-dot k-" + k} aria-hidden="true" />{KIND_NAME[k]}</p><p className="mi-rh-v">{betaTxt(x?.beta)}</p>
            {r.parts.find((p) => p.kind === k)?.band ? <span className="mi-chip">{r.parts.find((p) => p.kind === k)?.band}</span> : null}
            <p className="mi-small">{x?.swing != null ? `Swings ${pctOf(x.swing)} a year` : x?.why ?? "No swing figure yet"}</p></article>); })}
      </div>
      <HScroll label="How risky it is">
        <table className="mi-tb">
          <thead><tr><th scope="col">Kind</th><th scope="col" className="r">Share of money</th><th scope="col" className="r">Beta vs Nifty 500</th><th scope="col">Share of the market risk</th><th scope="col" className="r">Swing a year</th><th scope="col" className="r">Worst fall from a high</th></tr></thead>
          <tbody>{kinds.map((k) => { const p = r.parts.find((x) => x.kind === k), x = r.kinds[k]; return (
            <tr key={k} className={p?.red ? "hot" : ""}><th scope="row"><i className={"mi-dot k-" + k} aria-hidden="true" />{KIND_NAME[k]}</th><td className="r">{pctOf(p?.money)}</td><td className="r">{betaTxt(x?.beta)}</td>
              <td className="mi-rs">{p?.riskShare != null ? <><span className="mi-rsb"><i className={"r k-" + k} style={{ width: `${(p.riskShare / max) * 100}%` }} /><i className="m" style={{ width: `${((p.money ?? 0) / max) * 100}%` }} /></span><small><b className={p.red ? "mi-down" : ""}>{pctOf(p.riskShare)}</b> of the risk · {pctOf(p.money)} of the money</small></> : <span className="mi-muted">—</span>}</td>
              <td className="r">{x?.swing != null ? <>{pctOf(x.swing)}{x.years ? <small> ({nf(x.years, 1)} y)</small> : null}</> : "—"}</td><td className="r mi-down">{x?.worstFall != null ? pctOf(x.worstFall) : "—"}</td></tr>); })}</tbody>
        </table>
      </HScroll>
      <p className="mi-small">Swing and worst fall are each kind's own figure, as on its portfolio page (shares: weekly prices; funds and ETFs: daily, three years){r.bench ? `; the Nifty 500 swung ${pctOf(r.bench.swing)} a year and fell at most ${pctOf(r.bench.worstFall)} from ${dateRange(r.bench.from, r.bench.to)}` : ""}. A figure for everything together needs the three kinds' daily lines, so it is not shown.</p>
      {/* task #235 (pack C4, C5): the Equity page's fall picture, weighted by value now, with each kind's share of the money and the size of the fall */}
      {r.beta != null && <div className="pfx mi-fx"><MarketFall id="mi-fall" what="Nifty 500" idx="Nifty 500" value={d.byValue && d.total ? { now: d.total } : null} noRupees={!d.byValue}
        worst={r.bench?.worstFall != null && r.bench.worstFall < 0 ? { pct: -r.bench.worstFall, line: "the Nifty 500’s worst in 3 years" } : null}
        scenarios={[{ label: "Everything together", beta: r.beta, src: `Each kind's beta against the Nifty 500, weighted by ${d.byValue ? "value now" : "kind, each the same"}: together ${betaTxt(r.beta)}`, parts: true }]}
        market={{ label: "Nifty 500", sub: "the index" }} list={{ label: "Everything", sub: d.byValue ? "by value" : "each kind the same" }}
        parts={r.parts.filter((p) => p.beta != null).map((p) => ({ label: KIND_NAME[p.kind], beta: p.beta as number, sub: `${pctOf(p.money, 0)} of the money` }))} /></div>}
      <Notes scope="risk" items={notes} />
    </section>
  );
}
const lead = (r: AllInvestments["risk"]) => { const p = r.parts.find((x) => x.kind === r.largest); return p && p.riskShare != null ? `${KIND_NAME[p.kind]} carry ${pctOf(p.riskShare, 0)} of the market risk on ${pctOf(p.money, 0)} of the money.` : ""; };
const dateRange = (a: string, b: string) => `${a.slice(0, 7)} to ${b.slice(0, 7)}`;
export { KIND_MARK };
